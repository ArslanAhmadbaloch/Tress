/**
 * The shapes the native side sends and the scan reads.
 *
 * Types only: nothing here is imported at runtime, so this file can be
 * pulled into a Node test without dragging React Native behind it.
 */

import type { StyleProp, ViewStyle } from 'react-native';

/**
 * One tracked face, as ARKit saw it.
 *
 * Every position is a VIEW FRACTION of the rendered tracking view — 0 at
 * the left/top edge, 1 at the right/bottom — measured against the view as
 * the user sees it, which is mirrored like a bathroom mirror. Angles are
 * degrees in ML Kit's sign convention, so the scan engine's yaw dial keeps
 * working unchanged across the two platforms.
 */
export type FaceFrame = {
  /** Centre of the face mask's rim — brow to jaw, ear to ear. */
  cx: number;
  cy: number;
  /**
   * The rim's bounding box. It is the FACE, not the head: ARKit's geometry
   * stops at the upper forehead, so nothing above the brow — the crown
   * included — is inside this box.
   */
  width: number;
  height: number;
  /** Positive when the nose turns toward the viewer's right on screen. */
  yaw: number;
  /** Positive when the chin lifts (looking up); negative when it drops. */
  pitch: number;
  /** Positive when the head tilts counter-clockwise on screen. */
  roll: number;
  /** x, y per point, in the fixed order documented in `points.ts`. */
  points: number[];
  /** One per point: 1 square to the camera, 0 edge-on, below 0 turned away. */
  facing: number[];
  /**
   * False when this is the last tracked pose being repeated rather than a
   * fresh reading.
   *
   * ARKit loses sight of a face once the head is lowered far enough for
   * the camera to see the crown — which is exactly what the scan's second
   * stage asks for. Rather than fall silent there, the native side keeps
   * sending the last good frame with this false for up to `COAST_MS`, so
   * the ring keeps its place and the stage can run; after that `{ lost:
   * true }` arrives. Read it with `isTracking`, which treats an absent
   * flag as tracked.
   */
  tracking?: boolean;
  /** Milliseconds, on the same clock as `Date.now()`. */
  at: number;
};

/** What arrives instead of a frame once the anchor goes. */
export type FaceLost = { lost: true };

/** Everything `onFace` can carry. */
export type FaceEvent = FaceFrame | FaceLost;

/** A still pulled out of the live AR frame. */
export type CaptureResult = { uri: string; width: number; height: number };

export type HairFaceTrackingViewProps = {
  style?: StyleProp<ViewStyle>;
  /** True tears the AR session down; false brings it back. */
  paused?: boolean;
  onFace?: (e: { nativeEvent: FaceEvent }) => void;
  onError?: (e: { nativeEvent: { message: string } }) => void;
};
