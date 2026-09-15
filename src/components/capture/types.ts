/**
 * The contract between the capture screen and whichever camera it gets.
 *
 * Two implementations satisfy it: VisionCamera with the on-device face
 * detector, and expo-camera without one. The screen is written against
 * this and never against either, so a build that lacks the native module
 * loses the head tracking and nothing else.
 */

import type { Ref } from 'react';

import type { FaceObservation } from './head-guidance';

/** A frame the camera has written to disk, before it is shrunk or kept. */
export type CapturedFrame = {
  uri: string;
};

export type TrackedCameraHandle = {
  /**
   * Takes one photograph and resolves with its file. Rejects if the
   * camera could not — the screen owns what to tell the person.
   */
  takePhoto(): Promise<CapturedFrame>;
};

export type TrackedCameraProps = {
  ref?: Ref<TrackedCameraHandle>;
  /** Runs the camera. Off while an alert is up or a shot is being reviewed. */
  active: boolean;
  /**
   * The most prominent face in the latest frame, in preview points, or
   * null when there is none. Called for every processed frame, so keep
   * the handler cheap: it runs on the JS thread at up to camera rate.
   */
  onFace: (face: FaceObservation | null) => void;
  /** The camera stopped working. Fired at most once per implementation. */
  onError?: (error: Error) => void;
};
