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
import type { CaptureResult, HairFaceTrackingViewProps } from './types';

/** The Swift module's surface, as JavaScript sees it. */
type NativeHairFaceTracking = {
  isAvailable: () => boolean;
  capture: () => Promise<CaptureResult>;
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
