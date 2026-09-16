/**
 * The contract between the capture screen and whichever camera it gets.
 *
 * Two implementations satisfy it: VisionCamera with the on-device face
 * detector, and expo-camera without one. The screen is written against
 * this and never against either, so a build that lacks the native module
 * loses the head tracking and nothing else.
 *
 * Everything added for the sweep is optional, on both sides. A camera
 * that cannot warm its pipeline, cannot hand back an early frame, or
 * cannot say what it supports is a camera that still takes photographs,
 * and the screen has to keep working on it.
 */

import type { Ref } from 'react';

import type { FaceObservation } from './head-guidance';

/** A frame the camera has written to disk, before it is shrunk or kept. */
export type CapturedFrame = {
  uri: string;
};

/**
 * A small, display-ready frame the camera can deliver *before* the
 * photograph itself has finished going through the capture pipeline.
 *
 * It exists for one purpose: to let the flying frame leave for the pile
 * at the moment the shutter is felt, rather than half a second later when
 * the real file lands. It is lower-resolution than the photograph and has
 * been through a different, lighter pipeline.
 *
 * **It is never the photograph.** Nothing stores it, analyses it, or
 * compares it to last month. The field is called `previewUri` rather than
 * `uri` precisely so that handing it to anything expecting a
 * `CapturedFrame` has to be written out on purpose.
 */
export type PreviewFrame = {
  /** A `file://` URI for a temporary, display-only JPEG. */
  previewUri: string;
  width: number;
  height: number;
  /**
   * Says the frame is no longer on screen and its file can go.
   *
   * It is a real file in a temporary directory that nothing purges
   * promptly, so somebody has to own it, and the only code that knows
   * when it stopped being shown is the code showing it. Call this then.
   *
   * Idempotent, never throws, and safe to never call: the camera keeps a
   * list of what it has handed out and deletes whatever is left when it
   * unmounts. Forgetting costs a few kilobytes until the screen closes,
   * not a pile that grows a sweep at a time.
   */
  release(): void;
};

/** Per-shot options. Every camera may ignore all of them. */
export type CaptureOptions = {
  /**
   * Called if and when an early display frame arrives, at some point
   * between the shutter and the photograph. It may never be called: most
   * of what decides that is the device, not the app.
   */
  onPreview?: (frame: PreviewFrame) => void;
};

/**
 * What a camera can actually do on this device, resolved once when it
 * mounts rather than guessed per shot.
 *
 * Read it to decide how much to ask of the shutter — a sweep that takes
 * several photographs inside one continuous turn depends on the chain
 * from shutter to file being short, and on a device offering neither
 * lever it is not short. Nothing here is a promise about how long a
 * capture will take; it only reports which levers exist.
 */
export type CameraCapabilities = {
  /**
   * The device can deliver a `PreviewFrame` ahead of the photograph.
   * When false, `onPreview` will never be called.
   */
  previewFrame: boolean;
  /**
   * The capture pipeline can be asked to favour speed over quality.
   * Feature-detected, never attempted: asking an unsupported device for
   * it throws.
   */
  fastShutter: boolean;
};

export type TrackedCameraHandle = {
  /**
   * Takes one photograph and resolves with its file. Rejects if the
   * camera could not — the screen owns what to tell the person.
   */
  takePhoto(options?: CaptureOptions): Promise<CapturedFrame>;
  /**
   * Asks the camera to pre-allocate whatever the first shutter would
   * otherwise allocate while somebody is waiting for it.
   *
   * Optional, and a no-op on platforms and cameras with nothing to warm.
   * Safe to call more than once, and safe to ignore: it returns nothing
   * and reports nothing, because a failure to warm is not a failure to
   * photograph.
   */
  prewarm?(): void;
  /**
   * What this camera supports on this device, or absent when the camera
   * does not know. Absent means assume nothing.
   */
  readonly capabilities?: CameraCapabilities;
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
  /**
   * The bundled example frame for the current angle. Read only by the
   * dev-only SampleCamera on a simulator; the real cameras never see it
   * — TrackedCamera destructures it out before spreading, because a prop
   * that changes with every angle would reconfigure the capture session
   * each time.
   */
  sampleSource?: number;
};
