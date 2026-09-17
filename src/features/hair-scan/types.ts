/**
 * The vocabulary of the hair scan.
 *
 * Everything the engine reads, holds and says is declared here, apart
 * from the reducer itself. There is no React and nothing native in this
 * file, so the screen, the camera adapter, the processing lane and the
 * tests all share one set of names without sharing any code.
 *
 * Two conventions run through the whole feature:
 *
 * - The scanner has exactly one state (`ScannerState`) and, inside the
 *   camera phases, exactly one status (`ScanStatus`). There are no
 *   booleans that could disagree with either.
 * - Nothing here describes hair. A reading is where a head is and how
 *   still it is; a frame is an image with a quality score; the ring is a
 *   record of which directions the head has been seen from.
 */

import type { Contours } from './tracking';

/** Which screen the scanner is on. One value, never a set of flags. */
export type ScannerState =
  | 'instructions'
  | 'permission'
  | 'ready'
  | 'scanning'
  | 'complete'
  | 'processing'
  | 'report'
  | 'error';

/** What the machine is doing while the camera is up. */
export type ScanStatus =
  /** The camera is coming up; no reading has arrived yet. */
  | 'initializing'
  /** Readings arrive, but the head is not framed and steady. */
  | 'detecting'
  /** Framed, lit and steady: the scan may start. */
  | 'ready'
  /** The ring is filling and frames are being taken. */
  | 'capturing'
  /** Coverage is sufficient (or time is up); waiting for in-flight frames. */
  | 'completing'
  | 'complete';

/** The one line of guidance shown at a time. */
export type GuidanceCue =
  | 'centreFace'
  | 'closer'
  | 'back'
  | 'holdStill'
  | 'perfect'
  | 'moveSlowly'
  | 'slowDown'
  | 'backInFrame'
  | 'brighter'
  | 'keepGoing';

/**
 * One smoothed face reading from the tracker.
 *
 * Everything spatial is a fraction of the guidance frame — the square
 * the ring sits in — so `bounds` of `{x: 0.25, y: 0.2, width: 0.5, height: 0.6}`
 * is a face sitting centred and a little high, on any screen. The camera
 * adapter owns the conversion from preview points; the engine never sees
 * a pixel.
 *
 * Angles are in degrees with ML Kit's signs: `yaw` positive is the head
 * turned towards its own right, `pitch` positive is the face tilted up,
 * `roll` positive is counter-clockwise. `stability` is 0 (moving) to 1
 * (held), already smoothed by the adapter. `size` is the face width as a
 * fraction of the frame width.
 */
export type FaceReading = {
  bounds: { x: number; y: number; width: number; height: number };
  yaw: number;
  pitch: number;
  roll: number;
  stability: number;
  size: number;
};

/**
 * Where on the head a frame was taken from, named by the direction the
 * head had moved in when the camera saw it. `front` is the head square
 * to the camera; the rest walk clockwise round the ring from the top.
 */
export type ScanRegion =
  | 'front'
  | 'up'
  | 'rightUp'
  | 'right'
  | 'rightDown'
  | 'chin'
  | 'leftDown'
  | 'left'
  | 'leftUp';

/** What the camera hands back when asked for a frame. */
export type CapturedImage = {
  uri: string;
  width: number;
  height: number;
  thumbnailUri?: string;
};

/** The engine asking the camera for one frame, right now. */
export type CaptureRequest = {
  id: string;
  /** 0 is the front; 1–12 walk clockwise round the ring from the top. */
  bin: number;
  region: ScanRegion;
  /** The ring sector the head was pointing at, or null for the front. */
  sector: number | null;
  yaw: number;
  pitch: number;
  /** 0–1, from stability, lighting and size at the moment of the request. */
  quality: number;
  at: number;
};

/** A width and a height, in whatever unit the caller is working in. */
export type Size = { width: number; height: number };

/**
 * The tracked mesh as it sat on the live preview at the moment of a
 * shutter: the smoothed face box and contours, as fractions of the
 * preview view (0–1 across and down), mirrored exactly as the preview
 * and the live mesh are — which is also how the still is written, so no
 * flip stands between the two.
 *
 * Transient. It rides on the kept frame so the processing screen can
 * hold the wireframe on the still, and it is never written to the
 * journal: a photo is a photo, not a face reading.
 */
export type FrameMesh = {
  bounds: { x: number; y: number; width: number; height: number };
  contours: Contours;
  /**
   * The preview's width over its height. The still is the whole camera
   * frame and the preview showed an aspect-fill crop of it; this is
   * what undoes the crop so the mesh lands on the face in the still.
   */
  viewAspect: number;
  /**
   * The head's angles when the shutter fired, so the cap drawn on the
   * still turns as the live one did. Absent when the tracker had no
   * finite reading; the cap is then square on.
   */
  pose?: MeshPose;
};

/**
 * The head's angles at a shutter, in degrees with the tracker's signs:
 * what lets the cap on a still turn with the head instead of sitting
 * square on a face seen from the side. A framing fact about the
 * picture, never a fact about the hair.
 */
export type MeshPose = { yaw: number; pitch: number; roll: number };

/** A kept frame's mesh with the still it belongs to: what the processing screen draws over a picture. */
export type StillMesh = { still: Size; face: FrameMesh };

/** A face laid out in the points of a box the still is drawn in: what the static mesh draws. */
export type MeshFace = {
  cx: number;
  cy: number;
  width: number;
  height: number;
  contours: Contours;
  /** The head's angles at the shutter, carried through from the frame's mesh. Absent: square on. */
  pose?: MeshPose;
};

/** A captured frame the engine has chosen to keep. */
export type ScanFrame = CapturedImage & {
  id: string;
  bin: number;
  region: ScanRegion;
  sector: number | null;
  yaw: number;
  pitch: number;
  quality: number;
  capturedAt: number;
  /** The mesh the live camera had at the shutter, when the tracker had a face. */
  mesh?: FrameMesh;
};

/**
 * Why a scan stopped. `trackingUnavailable` is a build whose camera works
 * but carries no face detector: nothing was captured, and trying again
 * would only find it missing again, so the screen offers no retry.
 */
export type ScanErrorReason =
  | 'cameraDenied'
  | 'cameraFailed'
  | 'trackingUnavailable'
  | 'noFrames'
  | 'processingFailed';

export type ScanCompleteReason = 'coverage' | 'timeout';

/**
 * Moments worth a haptic. Each fires at most once per scan — `faceLocked`
 * included, which may fire on the ready screen and is then remembered
 * across Start rather than fired again on the first scanning tick.
 */
export type ScanMilestone =
  | 'faceLocked'
  | 'firstFrame'
  | 'quarter'
  | 'half'
  | 'threeQuarters'
  | 'rightDone'
  | 'leftDone'
  | 'chinDone';

/**
 * Why the engine let go of an image.
 *
 * - `outscored`: it landed for a bin whose kept frame was already better.
 * - `replaced`: a better frame landed for its bin.
 * - `evicted`: the ring held more than `MAX_FRAMES` and this was the weakest.
 * - `late`: it answered a request the engine had stopped waiting for.
 * - `abandoned`: the scan was cancelled or restarted before the report.
 */
export type DiscardReason = 'outscored' | 'replaced' | 'evicted' | 'late' | 'abandoned';

/**
 * What one reduction wants the outside world to do.
 *
 * The reducer takes no photographs and fires no haptics; the screen
 * reads these and does. `capture` is a request the camera must answer
 * with `captured` or `captureFailed`; `discard` names images the engine
 * will never show again, whose files the screen must now delete —
 * nothing else deletes them, and an image the person never sees must
 * not sit on the disk. Everything else is informational.
 *
 * The engine stops owning the frames when `processed` moves it to
 * `report`: from then on they belong to the journal, and a cancel from
 * the report discards nothing.
 */
export type ScanEvent =
  | { type: 'state'; from: ScannerState; to: ScannerState }
  | { type: 'cue'; cue: GuidanceCue | null }
  | { type: 'capture'; request: CaptureRequest }
  | { type: 'frame'; frame: ScanFrame; replaced: boolean }
  | { type: 'discard'; images: CapturedImage[]; reason: DiscardReason }
  | { type: 'milestone'; milestone: ScanMilestone }
  | { type: 'stall' }
  | { type: 'tooFast' }
  | { type: 'lost' }
  | { type: 'found' }
  | { type: 'scanComplete'; reason: ScanCompleteReason };

export type ScanAction =
  /** Leave the instructions sheet. */
  | { type: 'continue'; at: number }
  /** The camera permission prompt has been answered. */
  | { type: 'permission'; granted: boolean; at: number }
  /** The Start button. Ignored unless the scanner is `ready`. */
  | { type: 'start'; at: number }
  /** One tracker frame. `face` is null when no face is seen; `lighting` is 0–1 or null when unmeasured. */
  | { type: 'tick'; at: number; face: FaceReading | null; lighting: number | null }
  /** The camera answered a request. `mesh` is the tracked face at the shutter, when there was one. */
  | { type: 'captured'; requestId: string; image: CapturedImage; mesh?: FrameMesh; at: number }
  | { type: 'captureFailed'; requestId: string; at: number }
  /** Leave the completion beat for the processing screen. */
  | { type: 'process'; at: number }
  /** Processing has finished. */
  | { type: 'processed'; at: number }
  | { type: 'fail'; reason: ScanErrorReason; at: number }
  /** From `error`, back to the camera (or the permission prompt). */
  | { type: 'retry'; at: number }
  /** Back to the instructions sheet, keeping only what is known about permission. */
  | { type: 'cancel'; at: number };

/** How full each required region is, 0–1. */
export type RegionScores = {
  front: number;
  right: number;
  left: number;
  chin: number;
};

export type ScanState = {
  scanner: ScannerState;
  status: ScanStatus;
  cue: GuidanceCue | null;
  permission: 'unknown' | 'granted' | 'denied';
  error: ScanErrorReason | null;

  /** 24 sector fills, 0–1, clockwise from the top of the ring. Monotonic. */
  sectors: number[];
  /** 0–1, weighted over the required regions. Monotonic; 1 exactly at sufficiency. */
  completion: number;
  regions: RegionScores;
  /** The head has been seen square to the camera, framed and steady. */
  frontLocked: boolean;
  /** Curated frames, at most `MAX_FRAMES`, one per bin. */
  frames: ScanFrame[];
  /** Requests the camera has not answered yet. */
  pending: CaptureRequest[];
  /**
   * Requests the engine stopped waiting for (completion settled, the scan
   * failed or was cancelled) that the camera may still answer. A late
   * answer to one of these is discarded, never dropped on the floor.
   */
  abandoned: string[];

  startedAt: number | null;
  completedAt: number | null;
  completeReason: ScanCompleteReason | null;

  /* Tracking, carried tick to tick. */
  lastTickAt: number | null;
  lastFaceAt: number | null;
  lastReading: { yaw: number; pitch: number; at: number } | null;
  lost: boolean;
  lastRequestAt: number | null;
  lastGainAt: number | null;
  stalled: boolean;
  lastTooFastAt: number | null;
  slowDownUntil: number;
  keepGoingUntil: number;
  hold: { bin: number; since: number } | null;
  milestones: ScanMilestone[];
  requestCount: number;
};

export type ScanStep = { state: ScanState; events: ScanEvent[] };
