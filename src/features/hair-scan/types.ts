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
 *   still it is; a frame is an image with a quality score; a step is one
 *   of the four things a person is asked to do with their head.
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
  /** No reading with a head in it has arrived yet. */
  | 'detecting'
  /** A head is being followed: the scan may start, wherever that head is. */
  | 'ready'
  /** The steps are walking themselves and frames are being taken. */
  | 'capturing'
  /** Every step has closed; waiting for in-flight frames. */
  | 'completing'
  | 'complete';

/**
 * The four steps of the scan, in the order a person does them.
 *
 * One continuous motion, with no shutter anywhere in it: look straight,
 * turn to your right, turn to your left, look down. Each step names the
 * direction the HEAD moves, which is what the person is told and what
 * the arrow points at — never the side of the head the camera ends up
 * seeing. Those two are opposites, and `REGION_OF_STEP` in the engine is
 * the one place that turns one into the other.
 */
export type ScanStep = 'front' | 'right' | 'left' | 'down';

/**
 * What one step asks the head to do.
 *
 * `yawDeg` and `pitchDeg` are the pose the step is aiming at, in degrees
 * with the tracker's signs (positive yaw is the head turned towards its
 * own right; negative pitch is the chin lowered). Null means the step
 * does not ask about that axis at all. For `front`, `yawDeg` is not a
 * turn to make but the WIDTH OF THE WINDOW either side of square on:
 * `stepReach` there measures how much of that window has been closed.
 *
 * `reach` is the share of that scale — 0–1, as `stepReach` reports it —
 * that counts as having arrived. It is under 1 on the turns because the
 * tracker smooths and its reading lags a moving head, so demanding the
 * literal angle would ask people to overshoot it; it is a half on the
 * front because somebody looking at their own phone is never exactly
 * square on, and being asked to be would be the build-17 gate again.
 */
export type StepTarget = {
  step: ScanStep;
  yawDeg: number | null;
  pitchDeg: number | null;
  reach: number;
};

/**
 * What the scan has done of one step.
 *
 * `reach` only ever rises inside a step, so the progress bar and the
 * arrow cannot flinch backwards while somebody steadies themselves.
 */
export type StepProgress = {
  /** 0–1, monotonic: the nearest the head has come to this step's pose. */
  reach: number;
  /** How many frames have landed for this step. */
  frames: number;
  /** When this step's first frame landed, or null. */
  firstFrameAt: number | null;
  /**
   * When the head first came as far as this step asks, or null. The
   * settle beat is measured from the later of this and the first frame,
   * so a step that hands over short of the angle it aims at still keeps
   * the picture taken as the turn finished rather than the one taken on
   * the way there.
   */
  reachedAt: number | null;
  /** True once the step has handed over to the next one. */
  done: boolean;
};

/**
 * The corrective line, when there is something to correct.
 *
 * What to DO with your head is the step's own instruction now — a title
 * and one line, held at the top of the screen for as long as the step
 * runs — so this union carries only the five things that can go wrong
 * with a reading, and it is null the rest of the time. Nothing here
 * teaches the choreography, and nothing here is a verdict.
 *
 * There is deliberately no cue for distance. Build 17 asked people to
 * move back until their arm was at full stretch, and the scan never
 * armed; the mesh and the brackets scale to the head instead, so how far
 * away somebody holds the phone is their business.
 */
export type ScanCue =
  /** No head can be read, or the one being read is leaving the picture. */
  | 'faceCamera'
  /** A frame is wanted here and the head is not still enough to take it. */
  | 'holdStill'
  /** The head is being whipped about; the frames would blur. */
  | 'tooFast'
  /** The head has gone out of the picture altogether. */
  | 'lost'
  /** The room is dark enough to be worth mentioning. */
  | 'brighter';

/**
 * The two halves of the scan as the older screens still read them.
 *
 * The choreography is four steps now; this is what the pill and the ring
 * were written against, derived from the step rather than stored beside
 * it, so the two can never disagree. `sweep` covers the three upright
 * steps and `crown` is the last one, with the head lowered.
 */
export type ScanStage = 'sweep' | 'crown';

/**
 * The four regions the report is built from. Named for the part of the
 * head a frame shows, not for anything about the hair on it.
 */
export type ScanTarget = 'hairline' | 'leftTemple' | 'rightTemple' | 'crown';

/**
 * What the scan has of one region.
 *
 * `reach` is how far towards the pose that region wants the head has ever
 * come, 0–1, and only ever rises: it is what the progress figure is made
 * of, so progress cannot fall when somebody turns back through the middle.
 */
export type TargetProgress = {
  captured: boolean;
  /** The quality of the kept frame, or 0. */
  quality: number;
  /** The id of the kept frame, or null. */
  frameId: string | null;
  /** 0–1, monotonic: how near the head has come to this region's pose. */
  reach: number;
};

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
  /**
   * Where the head was pointing on the ring: 0 the front, 1–12 clockwise
   * from the top. A fact about the pose, used to draw the ring — never
   * to decide what the picture is of. Two different regions routinely
   * share a bin.
   */
  bin: number;
  /**
   * How the frame is labelled: the ring region its `target` stands for,
   * which is what the screen turns into the journal's angle.
   */
  region: ScanRegion;
  /**
   * Which of the four wanted regions this frame is for. Every request the
   * engine raises is for one of them — the scan asks for nothing else —
   * and it is what the journal files the photograph under.
   */
  target: ScanTarget;
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
  /** The wanted region this frame was asked for: what the report files it under. */
  target: ScanTarget;
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
  | 'hairlineDone'
  | 'leftTempleDone'
  | 'rightTempleDone'
  | 'crownDone';

/**
 * Why the engine let go of an image.
 *
 * - `outscored`: it landed for a region whose kept frame was already better.
 * - `replaced`: a better frame landed for its region.
 * - `late`: it answered a request the engine had stopped waiting for.
 * - `abandoned`: the scan was cancelled or restarted before the report.
 *
 * There is no `evicted` any more: the store holds one frame per wanted
 * region and there are four regions, so nothing is ever crowded out.
 */
export type DiscardReason = 'outscored' | 'replaced' | 'late' | 'abandoned';

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
  /** The choreography moved on: one step handed over to the next. */
  | { type: 'step'; from: ScanStep; to: ScanStep; index: number }
  | { type: 'cue'; cue: ScanCue | null }
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
  /** Which of the four steps is being asked for. */
  step: ScanStep;
  /** Where that step sits in `SCAN_STEPS`: 0–3, for "Step N of 4". */
  stepIndex: number;
  /** When the current step began, so a step nobody can finish still hands over. */
  stepStartedAt: number | null;
  /** What the scan has done of each step. */
  steps: Record<ScanStep, StepProgress>;
  /** Derived from `step`, for the screens still written against two beats. */
  stage: ScanStage;
  /** What the scan has of each of the four wanted regions. */
  targets: Record<ScanTarget, TargetProgress>;
  cue: ScanCue | null;
  permission: 'unknown' | 'granted' | 'denied';
  error: ScanErrorReason | null;

  /** 24 sector fills, 0–1, clockwise from the top of the ring. Monotonic. */
  sectors: number[];
  /**
   * 0–1 across the whole scan, and 1 exactly when all four regions have
   * been captured. Approaching a region moves the figure; only the
   * photograph finishes it, so a scan that ran out of time with a region
   * missing can never read as complete — in the ring, in the record, or
   * in the report. Monotonic.
   */
  completion: number;
  /** The ring's own reading, by quadrant. What the ring draws, not what ends the scan. */
  regions: RegionScores;
  /** The head has been seen square to the camera, framed and steady. */
  frontLocked: boolean;
  /** Curated frames: one per wanted region, so at most `MAX_FRAMES` — four. */
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
  hold: { bin: number; since: number } | null;
  milestones: ScanMilestone[];
  requestCount: number;
};

/**
 * What one turn of the reducer produces. Named for the reduction and not
 * for the choreography: `ScanStep` is one of the four things a person is
 * asked to do, which is a different idea entirely.
 */
export type ScanReduction = { state: ScanState; events: ScanEvent[] };
