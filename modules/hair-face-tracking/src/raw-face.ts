/**
 * The one conversion between this module and the scan's tracker.
 *
 * The native side speaks in view FRACTIONS, because that is the only unit
 * that survives a rotation and a resize. `RawFace` in
 * `src/features/hair-scan/tracking.ts` speaks in preview POINTS for the
 * box and leaves the mesh in whatever unit the tracker sent — which is a
 * mismatch small enough to get wrong silently and large enough to put the
 * cap in the corner of the screen. So it is written down once, here,
 * where a test can hold it, rather than inline in a screen.
 *
 * Deliberately structural: this file names no app type and imports no app
 * module, so the module stays standalone and importable in a Node test.
 * The test asserts the shape really does satisfy `RawFace` by assigning
 * one to the other — a compile error if the two ever drift.
 *
 * Wiring a screen up is then:
 *
 *   const held = !isTracking(e.nativeEvent);
 *   setFace(track(previous, toRawFace(e.nativeEvent, view), Date.now()));
 *
 * with `isFaceLost` handled by passing null instead.
 *
 * Pure: no React, no React Native, no native module.
 */

import { hasFullMesh } from './points';
import type { FaceFrame } from './types';

/** The size of the rendered tracking view, in the app's own points. */
export type ViewSize = { width: number; height: number };

/**
 * One ARKit frame in the shape the scan's tracker reads.
 *
 * Structurally a `RawFace` with `source: 'arkit'`. The box is scaled into
 * preview points; the mesh stays in view fractions, which `head-cap.ts`
 * reads correctly either way because it maps the cloud onto the box
 * before using it.
 */
export type ArkitRawFace = {
  cx: number;
  cy: number;
  width: number;
  height: number;
  yaw: number;
  pitch: number;
  roll: number;
  source: 'arkit';
  mesh?: { points: number[]; facing: number[] };
  at: number;
};

/**
 * Scales one frame into the preview's own points.
 *
 * A frame that arrived without geometry — or with a partial payload the
 * native side refused to complete — converts to a pose with no mesh
 * rather than a mesh with holes in it, and `hasMesh` downstream reads
 * false. A held frame (`tracking: false`) converts exactly like a tracked
 * one: it is a real pose that has stopped being refreshed, and dropping
 * it is what would leave the crown stage with nothing to run on. Ask
 * `isTracking` if the difference matters.
 *
 * A view with no size yet returns null: multiplying by zero would put a
 * face of no width at the top-left corner, and the tracker would believe
 * it.
 */
export function toRawFace(frame: FaceFrame, view: ViewSize): ArkitRawFace | null {
  if (!(view.width > 0) || !(view.height > 0)) return null;
  const mesh = hasFullMesh(frame)
    ? { points: [...frame.points], facing: [...frame.facing] }
    : undefined;
  return {
    cx: frame.cx * view.width,
    cy: frame.cy * view.height,
    width: frame.width * view.width,
    height: frame.height * view.height,
    yaw: frame.yaw,
    pitch: frame.pitch,
    roll: frame.roll,
    source: 'arkit',
    ...(mesh === undefined ? {} : { mesh }),
    at: frame.at,
  };
}
