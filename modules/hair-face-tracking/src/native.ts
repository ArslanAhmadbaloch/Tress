/**
 * Reaching for the native side, once, and never fatally.
 *
 * `src/lib/native.ts` in the app records the lesson this file obeys:
 * Metro reports a module's load failure as *fatal* rather than throwing it
 * when the module is first required late — from a render, or from a save
 * — so a `try` around the require never sees it and the screen goes red.
 * The question has to be asked of the native side first, by something that
 * cannot throw.
 *
 * `requireOptionalNativeModule` is that something: it returns `null` for a
 * module that is absent where `requireNativeModule` would throw. Only once
 * it has answered does anything else here touch native. On Android, on the
 * web, and in Expo Go, the answer is `null` and the scan falls back to the
 * ML Kit path with no error and no warning.
 */

import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import type { ComponentType } from 'react';
import { Platform } from 'react-native';

import { resolveAvailability } from './points';
import { SAMPLE_SIZE, clampSampleSize, normaliseSample, type FrameSample } from './sample';
import type { CaptureResult, HairFaceTrackingViewProps } from './types';

/**
 * The Swift module's surface, as JavaScript sees it.
 *
 * `sampleFrame` is optional on purpose. A development client built before
 * this function existed is a real thing to be running against — the
 * JavaScript reloads and the binary does not — and asking a native module
 * for a function it does not have is a crash rather than a rejection. So
 * it is asked for, and its absence is an answer.
 */
type NativeHairFaceTracking = {
  isAvailable: () => boolean;
  capture: () => Promise<CaptureResult>;
  sampleFrame?: (size: number) => Promise<unknown>;
};

const MODULE_NAME = 'HairFaceTracking';

let module: NativeHairFaceTracking | null | undefined;

/** The native module, or null on any platform or build that lacks it. */
export function nativeModule(): NativeHairFaceTracking | null {
  if (module !== undefined) return module;
  if (Platform.OS !== 'ios') {
    module = null;
    return module;
  }
  try {
    module = requireOptionalNativeModule<NativeHairFaceTracking>(MODULE_NAME) ?? null;
  } catch {
    module = null;
  }
  return module;
}

let availability: boolean | undefined;

/**
 * Whether this device can track a face in 3D.
 *
 * True only on an iPhone with a TrueDepth camera running a build that
 * contains the module. False everywhere else, including the simulator.
 */
export function isFaceTrackingAvailable(): boolean {
  if (availability !== undefined) return availability;
  availability = resolveAvailability({ os: Platform.OS, nativeModule: nativeModule() });
  return availability;
}

/**
 * A still from the AR frame on screen right now.
 *
 * Rejects rather than resolving something empty: no view mounted, no frame
 * yet, or a device that cannot track — the caller decides what to do.
 */
export async function capture(): Promise<CaptureResult> {
  const native = nativeModule();
  if (!native) {
    throw new Error('Face tracking is not available in this build.');
  }
  return await native.capture();
}

/**
 * Whether this build can hand back a square of the live frame.
 *
 * Asked separately from `isFaceTrackingAvailable()` because the two can
 * disagree: an iPhone that tracks a face perfectly well, running a
 * development client built before `sampleFrame` existed, answers true to
 * the first and false to this. A caller that skipped this check would
 * reach for a function that is not there.
 */
export function canSampleFrame(): boolean {
  const native = nativeModule();
  return native !== null && typeof native.sampleFrame === 'function';
}

/**
 * A small square of the AR frame on screen right now, as raw bytes.
 *
 * No file is written and nothing is kept: the bytes come back, are read,
 * and are dropped. Nothing leaves the device, here or anywhere below it.
 *
 * Rejects rather than resolving something empty — no view on screen, no
 * frame yet, a sample already in flight, or a payload this build cannot
 * read. Every one of those is a refusal the caller should treat as "this
 * reading had nothing in it", not as "there is no hair".
 */
export async function sampleFrame(size: number = SAMPLE_SIZE): Promise<FrameSample> {
  const native = nativeModule();
  if (!native || typeof native.sampleFrame !== 'function') {
    throw new Error('This build cannot sample the camera frame.');
  }
  const raw = await native.sampleFrame(clampSampleSize(size));
  const sample = normaliseSample(raw);
  if (sample === null) {
    throw new Error('The camera returned a frame this build cannot read.');
  }
  return sample;
}

/**
 * Rendered in place of the AR view where there is no AR view.
 *
 * Named so it shows up honestly in a component tree rather than as an
 * anonymous arrow.
 */
function HairFaceTrackingUnavailable(): null {
  return null;
}

function resolveNativeView(): ComponentType<HairFaceTrackingViewProps> | null {
  if (!isFaceTrackingAvailable()) return null;
  try {
    return requireNativeViewManager<HairFaceTrackingViewProps>(MODULE_NAME);
  } catch {
    return null;
  }
}

/**
 * The AR preview. It *is* the camera: ARKit owns the front camera while it
 * runs, so nothing else may be mounted over the same lens.
 *
 * Off iOS, and on an iPhone without face tracking, this renders nothing at
 * all — check `isFaceTrackingAvailable()` before choosing this path.
 */
export const HairFaceTrackingView: ComponentType<HairFaceTrackingViewProps> =
  resolveNativeView() ?? HairFaceTrackingUnavailable;
