/**
 * The sweep, as arithmetic.
 *
 * One continuous turn of the head fills a ring and earns three
 * photographs — the front and the two temples. This file is the whole of
 * the maths behind that: where the head is on the ring, whether the
 * frames at that position were worth anything, whether a photograph may
 * be taken right now, and how close the pose is to the one the person
 * took last month.
 *
 * It has no React, no camera and no reducer in it, so every rule below
 * can be read and checked on a machine with no hands. That matters more
 * here than almost anywhere else in the app: a gate that fires half a
 * second early produces a blurred photograph that looks fine in a demo
 * and ruins a comparison a month later, and nobody would ever see it
 * happen.
 *
 * Two things it deliberately does not do. It never decides what a
 * photograph shows — it only ever measures where a head was pointing and
 * how still it was. And it never claims the turn reaches more than it
 * does: a front camera can see the front and the two temples, and the top
 * and the back are held shots taken afterwards.
 */

import {
  framingOf,
  type FaceObservation,
  type GuideTarget,
} from '@/components/capture/head-guidance';
import type { Angle } from '@/types/domain';

import type { Pose, PoseFace } from './guided-scan';

/* ----------------------------- the dial ------------------------------ */

/**
 * Degrees of head turn mapped onto half the ring.
 *
 * This is the turn the ring demands before it will close, so it is set by
 * the smallest turn a detector can be relied on to follow, not by the
 * largest a neck can manage. ML Kit's box gets unreliable somewhere past
 * 45° on some phones, and the real ceiling is device-dependent and
 * unmeasured; 42 sits inside the temple window, inside the range where
 * tracking is dependable, and inside every device we have reason to
 * expect. Lower it if a target device loses the face sooner — nothing
 * else moves.
 */
export const SWEEP_YAW_SPAN = 42;

export const SWEEP_SEGMENTS = 8;

/** 360 / SWEEP_SEGMENTS. One segment is 10.5° of head turn. */
export const SEGMENT_DEG = 45;

/**
 * Where the head sits on the ring, in degrees, with 0 at twelve o'clock.
 *
 * Signed, in [-180, +180], and clamped at the ends. Turning one way walks
 * θ down one side of the ring, turning the other walks it down the other,
 * and both extremes meet at six o'clock — so the circle closes exactly
 * when both sides of the turn have been reached, which is a true
 * statement about a two-sided head turn rather than a decoration.
 *
 * The signed range is the reason there is no wrap anywhere in this file:
 * θ moves by the same fraction the head does, so a cursor following it
 * never has to be told which way round to go.
 */
export function theta(yaw: number): number {
  return (clamp(yaw, -SWEEP_YAW_SPAN, SWEEP_YAW_SPAN) / SWEEP_YAW_SPAN) * 180;
}

/** Position on the ring in segments, 0 to 8, taken the short way round. */
export function fractional(ring: number): number {
  return (((ring % 360) + 360) % 360) / SEGMENT_DEG;
}

/**
 * Which of the eight segments θ falls in.
 *
 * Segments 0-3 are one side of the turn and 4-7 the other, so each side
 * owns exactly four and the ring is exactly half closed after one side.
 * The one boundary that needs saying out loud is θ = +180: it is the far
 * end of the positive turn, not the start of the negative one, and
 * clamping puts every over-turn there.
 */
export function segmentIndex(ring: number): number {
  if (ring >= 180) return SWEEP_SEGMENTS / 2 - 1;
  return Math.floor(fractional(ring)) % SWEEP_SEGMENTS;
}

/** The distance between two ring positions in segments, the short way round. */
export function segmentGap(a: number, b: number): number {
  const straight = Math.abs(a - b) % SWEEP_SEGMENTS;
  return Math.min(straight, SWEEP_SEGMENTS - straight);
}

/**
 * How far the head must move before the cursor is reported somewhere new,
 * in segments. Without it the arc strobes between two neighbours every
 * time a head pauses on a boundary. 0.2 of a segment is 2.1° of head
 * turn — under the noise of a deliberate movement, over the noise of the
 * detector.
 */
export const SEGMENT_HYSTERESIS = 0.2;

export type Cursor = { current: number; currentF: number; changed: boolean };

/** The cursor's new position, or its old one if the head has barely moved. */
export function dispatchSegment(input: {
  theta: number;
  current: number;
  currentF: number;
}): Cursor {
  /*
    A position that cannot be read is not a new position. Without this
    the hysteresis below lets it through — the gap against NaN is NaN,
    which is not less than the threshold — and NaN is written into the
    cursor the ring draws from.
  */
  if (!Number.isFinite(input.theta)) {
    return { current: input.current, currentF: input.currentF, changed: false };
  }
  const position = fractional(input.theta);
  if (segmentGap(position, input.currentF) < SEGMENT_HYSTERESIS) {
    return { current: input.current, currentF: input.currentF, changed: false };
  }
  const next = segmentIndex(input.theta);
  return { current: next, currentF: position, changed: next !== input.current };
}

/* ------------------------------ dwell -------------------------------- */

/** One stalled frame must not be allowed to gift a whole segment. */
export const DWELL_DT_CAP_MS = 100;

/** Time in a segment before it counts as filled. About seven frames at 30 fps. */
export const SEGMENT_DWELL_MS = 220;

/** The whole ring, in milliseconds of usable time. */
export const RING_CLOSED_MS = SWEEP_SEGMENTS * SEGMENT_DWELL_MS;

/** Nod and tilt limits for a frame to count towards the ring at all. */
export const DWELL_PITCH_MAX = 15;
export const DWELL_ROLL_MAX = 12;

/**
 * Whether a detector reading can be read at all.
 *
 * ML Kit withholds the Euler angles in some configurations and the camera
 * passes through whatever it is handed, so a reading whose turn is not a
 * number does reach this file. It has to be refused explicitly, because
 * every gate here is written as a list of reasons to say no and every
 * comparison against a non-number is false: an unreadable turn would
 * satisfy all of them at once and be taken for a head sitting exactly on
 * target and perfectly still — the one combination that fires the
 * shutter. A frame whose position is unknown is not a frame of a head at
 * the front, and it is never treated as one.
 */
export function readablePose(pose: Pose): boolean {
  return (
    Number.isFinite(pose.yaw) && Number.isFinite(pose.pitch) && Number.isFinite(pose.roll)
  );
}

/** The same question of a detector frame, where nod and tilt may be absent. */
export function readableFace(face: PoseFace): boolean {
  return readablePose(poseOf(face));
}

/** Milliseconds since the last face, capped; zero when there was no last face. */
export function dwellStep(lastFaceAt: number | null, now: number): number {
  if (lastFaceAt === null) return 0;
  const step = now - lastFaceAt;
  /*
    A clock that is not a number gives a step that is not a number, and
    `dt <= 0` is false of it — so without this the frame would be
    accepted and the segment it landed in would be set to NaN for the
    rest of the turn, never full and never able to close the ring. An
    unreadable clock is no time at all.
  */
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(step, DWELL_DT_CAP_MS));
}

/**
 * Whether this frame was worth anything.
 *
 * Framing is judged as though the head were square on — `'front'` so that
 * `framingOf` applies no turn check — because during a turn the turn is
 * the point. What is left is the two things that make a frame useless at
 * any yaw: a head that is too far, too close or out of the ring, and a
 * head that is nodding or tilting past the window the photographs are
 * taken in.
 */
export function dwellAccepts(face: PoseFace, target: GuideTarget): boolean {
  if (!readableFace(face)) return false;
  const framing = framingOf(face, target, 'front');
  if (framing.size !== 'ok' || !framing.centred) return false;
  if (Math.abs(face.pitch ?? 0) > DWELL_PITCH_MAX) return false;
  if (Math.abs(face.roll ?? 0) > DWELL_ROLL_MAX) return false;
  return true;
}

export type Dwell = {
  segments: number[];
  /** The segment credited, or null when the frame was refused. */
  index: number | null;
  /** The milliseconds credited. */
  dt: number;
};

/**
 * Add this frame's time to the segment the head is in.
 *
 * Dwell is monotonic and never decays, and that one rule does five jobs.
 * It paces the turn. It punishes speed honestly — a head that whips
 * through leaves half-filled arcs, which is a true picture of what
 * happened rather than a scolding. It makes a second pass top up the gaps
 * instead of starting over. It makes the ring a statement about whether
 * the frames at that position were usable, not merely about where the
 * head went. And it makes a flickering boundary harmless: the dwell is
 * split between two neighbours that both fill on the same pass, and
 * nothing can ever un-fill.
 *
 * `running` is false while the ring is still inert — the front photograph
 * is taken before the turn begins, and nothing accrues until it lands.
 */
export function accrueDwell(
  segments: number[],
  input: {
    face: PoseFace;
    target: GuideTarget;
    now: number;
    lastFaceAt: number | null;
    running: boolean;
  },
): Dwell {
  const dt = dwellStep(input.lastFaceAt, input.now);
  if (!input.running || dt <= 0 || !dwellAccepts(input.face, input.target)) {
    return { segments, index: null, dt: 0 };
  }

  /*
    A segment that is not one of the eight is refused rather than
    written. Anything else would let one malformed frame change the
    shape of the ring — a ninth entry, or a hole where a number should
    be — and the ring is carried forward from frame to frame for the
    whole turn, so the damage would outlive the frame that caused it by
    ten seconds and show up as a segment that can never fill.
  */
  const index = segmentIndex(theta(input.face.yaw));
  if (!Number.isInteger(index) || index < 0 || index >= SWEEP_SEGMENTS) {
    return { segments, index: null, dt: 0 };
  }
  if (segments.length !== SWEEP_SEGMENTS) {
    return { segments, index: null, dt: 0 };
  }

  const next = segments.slice();
  next[index] = (next[index] ?? 0) + dt;
  return { segments: next, index, dt };
}

/** Whether one segment's accumulated time has reached the full mark. */
export function isFull(ms: number): boolean {
  return ms >= SEGMENT_DWELL_MS;
}

/** Each segment as a fraction of full, 0 to 1. */
export function fillOf(segments: readonly number[]): number[] {
  return segments.map((ms) => Math.min(1, Math.max(0, ms) / SEGMENT_DWELL_MS));
}

/** True once every segment has had its share of usable frames. */
export function ringClosed(segments: readonly number[]): boolean {
  return segments.length === SWEEP_SEGMENTS && segments.every(isFull);
}

/* ---------------------------- the fill lag ---------------------------- */

/**
 * How far the drawn fill lags the measured one, in milliseconds.
 *
 * The lag belongs here, in the writer, and not in an animation: the value
 * reaches the screen already eased, and easing it a second time puts the
 * arc a quarter of a second behind the thing it is reporting.
 */
export const FILL_LAG_MS = 65;

/** One step of the lag. Monotone towards the target, never past it. */
export function lagStep(shown: number, target: number, dt: number): number {
  if (dt <= 0) return shown;
  return shown + (target - shown) * (1 - Math.exp(-dt / FILL_LAG_MS));
}

/** The lag applied across the whole ring. */
export function lagFills(
  shown: readonly number[],
  targets: readonly number[],
  dt: number,
): number[] {
  return targets.map((target, i) => lagStep(shown[i] ?? 0, target, dt));
}

/* ------------------------------ the wells ----------------------------- */

/**
 * The window each photograph is accepted in.
 *
 * These are the same numbers the one-at-a-time walk already uses (`POSE`
 * in `guided-scan.ts`), restated here so this file needs nothing from the
 * reducer at runtime. `sweep.test.ts` asserts the two agree, so they
 * cannot drift apart quietly.
 *
 * The 15° of daylight between the front window and the temple window is
 * what makes arbitration unnecessary: no head position can satisfy two
 * wells, so there is no rule for choosing between them to get wrong.
 * Keep that gap if these are ever retuned.
 */
export const BAND = {
  front: { yawMax: 10, pitchMax: 12, rollMax: 10 },
  temple: { yawMin: 25, yawMax: 48, pitchMax: 15, rollMax: 12 },
} as const;

/**
 * The generic temple target when there is no previous photograph to copy.
 *
 * Deliberately not the midpoint of the window. The window is the range of
 * turns at which a photograph is honestly a temple photograph; the target
 * is the one turn the person is actually asked for, and it is where the
 * ring draws the mark they are turning towards. A three-quarter turn of
 * about 35° is what a neck does comfortably and what the mark should ask
 * for; the window is then free to be lopsided around it, and it is,
 * because it reaches further out than it reaches in.
 *
 * Nothing may derive this from the window's ends. The two numbers answer
 * different questions and tying them together would silently move the
 * mark every time the window was retuned.
 */
export const TEMPLE_TARGET_YAW = 35;

/**
 * Half the temple window: the tolerance a first scan is given.
 *
 * Applied around `TEMPLE_TARGET_YAW` and then clipped by the window
 * itself in `wellAccepts`, so the accepted turn runs from 25 to 46.5
 * rather than symmetrically from 23.5. A photograph at 23.5° of turn is
 * not a temple photograph however near the target it looks.
 */
export const TEMPLE_TOL_YAW = (BAND.temple.yawMax - BAND.temple.yawMin) / 2;

/** How far a baseline front pose may pull the front target. */
export const FRONT_BASELINE_YAW = 6;
export const FRONT_BASELINE_PITCH = 8;

/** How far a baseline temple pose may pull the temple target's nod. */
export const TEMPLE_BASELINE_PITCH = 10;

/** With a previous photograph to match, the window narrows to this. */
export const BASELINE_TOL_YAW = 8;
export const BASELINE_TOL_PITCH = 10;

export type WellKey = 'front' | 'templeA' | 'templeB';

export type WellTarget = {
  key: WellKey;
  angle: Angle;
  target: { yaw: number; pitch: number };
  tol: { yaw: number; pitch: number; roll: number };
};

export type BaselinePoses = Partial<Record<Angle, Pose>>;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function usablePose(pose: Pose | undefined): Pose | null {
  if (!pose) return null;
  if (!Number.isFinite(pose.yaw) || !Number.isFinite(pose.pitch)) return null;
  return pose;
}

function baselineSideOf(pose: Pose | null): 1 | -1 | null {
  if (!pose || pose.yaw === 0) return null;
  return pose.yaw < 0 ? -1 : 1;
}

/**
 * The three targets this sweep is looking for.
 *
 * Month one defines the pose; every month after reproduces it. Where the
 * baseline holds a photograph for an angle, that angle's target becomes
 * the baseline's own yaw and nod — clamped into the window, because a
 * previous photograph taken at the edge should not drag the next one
 * outside it — and the tolerance narrows around it. Where there is no
 * baseline, the full window is used: the first scan has nothing to match,
 * and an over-tight first scan is just a failed scan.
 *
 * Which way a head was turned is not knowable from the detector — the
 * preview is mirrored and the convention differs between platforms — so
 * the only trustworthy source is the person's own previous photographs.
 * The two temple wells are always on opposite sides of the ring, whatever
 * the baseline says, because a head has two of them.
 */
export function wellsFor(
  input: { baseline?: BaselinePoses; signFlipped?: boolean } = {},
): Record<WellKey, WellTarget> {
  const baseline = input.baseline ?? {};
  const flip = input.signFlipped ? -1 : 1;

  const front = usablePose(baseline.front);
  const left = usablePose(baseline.leftTemple);
  const right = usablePose(baseline.rightTemple);

  const leftSide = baselineSideOf(left);
  const rightSide = baselineSideOf(right);
  const sideA: 1 | -1 = leftSide ?? (rightSide === null ? 1 : ((-rightSide) as 1 | -1));
  const sideB: 1 | -1 = (-sideA) as 1 | -1;

  const temple = (key: 'templeA' | 'templeB', angle: Angle, side: 1 | -1, pose: Pose | null): WellTarget => {
    const turned = (side * flip) as 1 | -1;
    if (!pose) {
      return {
        key,
        angle,
        target: { yaw: turned * TEMPLE_TARGET_YAW, pitch: 0 },
        tol: { yaw: TEMPLE_TOL_YAW, pitch: BAND.temple.pitchMax, roll: BAND.temple.rollMax },
      };
    }
    return {
      key,
      angle,
      target: {
        yaw: turned * clamp(Math.abs(pose.yaw), BAND.temple.yawMin, BAND.temple.yawMax),
        pitch: clamp(pose.pitch, -TEMPLE_BASELINE_PITCH, TEMPLE_BASELINE_PITCH),
      },
      tol: { yaw: BASELINE_TOL_YAW, pitch: BASELINE_TOL_PITCH, roll: BAND.temple.rollMax },
    };
  };

  return {
    front: {
      key: 'front',
      angle: 'front',
      target: front
        ? {
            yaw: clamp(front.yaw, -FRONT_BASELINE_YAW, FRONT_BASELINE_YAW),
            pitch: clamp(front.pitch, -FRONT_BASELINE_PITCH, FRONT_BASELINE_PITCH),
          }
        : { yaw: 0, pitch: 0 },
      tol: front
        ? { yaw: BASELINE_TOL_YAW, pitch: BASELINE_TOL_PITCH, roll: BAND.front.rollMax }
        : { yaw: BAND.front.yawMax, pitch: BAND.front.pitchMax, roll: BAND.front.rollMax },
    },
    templeA: temple('templeA', 'leftTemple', sideA, left),
    templeB: temple('templeB', 'rightTemple', sideB, right),
  };
}

/**
 * Whether a head position is inside a well.
 *
 * Two things have to hold at once, and they are not the same thing. The
 * tolerance says how near this month's pose is to the pose being matched.
 * The window says whether the photograph is one of the kind this angle
 * means at all — a temple photograph taken at 12° of turn is not a temple
 * photograph, however faithfully it reproduces a baseline that should
 * never have been accepted.
 */
export function wellAccepts(well: WellTarget, pose: Pose): boolean {
  if (!readablePose(pose)) return false;

  const yaw = pose.yaw;
  const pitch = pose.pitch;
  const roll = pose.roll;

  if (Math.abs(yaw - well.target.yaw) > well.tol.yaw) return false;
  if (Math.abs(pitch - well.target.pitch) > well.tol.pitch) return false;
  if (Math.abs(roll) > well.tol.roll) return false;

  if (well.key === 'front') {
    if (Math.abs(yaw) > BAND.front.yawMax) return false;
    if (Math.abs(pitch) > BAND.front.pitchMax) return false;
    return true;
  }

  const magnitude = Math.abs(yaw);
  if (magnitude < BAND.temple.yawMin || magnitude > BAND.temple.yawMax) return false;
  if (Math.abs(pitch) > BAND.temple.pitchMax) return false;
  // The head has to be turned the way this well is, not merely turned.
  return Math.sign(yaw) === Math.sign(well.target.yaw);
}

/**
 * One number for how near the bottom of the well this frame is.
 *
 * The per-axis check above stays a gate, because the cues are per-axis
 * and one correction at a time is the rule the whole screen is built on.
 * This is only ever used to choose the moment inside a gate that is
 * already satisfied: it decides when to fire and whether a later pass was
 * better, nothing else.
 *
 * Sharpness is not in it — it cannot be known before the shutter. Face
 * size is not in it — it is a gate, not a gradient. Stillness is not in
 * it — a frame steady in one axis and whipping in the other is not nearly
 * right, it is wrong in one way instead of two.
 */
export function poseCost(pose: Pose, well: WellTarget): number {
  return Math.hypot(
    (pose.yaw - well.target.yaw) / well.tol.yaw,
    (pose.pitch - well.target.pitch) / well.tol.pitch,
    pose.roll / well.tol.roll,
  );
}

/** The pose a face is reporting, with absent angles read as level. */
export function poseOf(face: FaceObservation): Pose {
  return { yaw: face.yaw, pitch: face.pitch ?? 0, roll: face.roll ?? 0 };
}

/**
 * The one well this frame could fill, if any.
 *
 * At most one can ever be live: the windows are disjoint by construction
 * and `sweep.test.ts` samples the whole legal cube to keep them that way.
 */
export function openWellFor(input: {
  wells: readonly WellTarget[];
  face: PoseFace;
  target: GuideTarget;
}): WellTarget | null {
  const pose = poseOf(input.face);
  for (const well of input.wells) {
    const framing = framingOf(input.face, input.target, well.angle);
    if (framing.size !== 'ok' || !framing.centred) continue;
    if (wellAccepts(well, pose)) return well;
  }
  return null;
}

/* --------------------------- the motion gate -------------------------- */

/**
 * The blur defence, and the only one that runs before the shutter.
 *
 * The quality pipeline downstream measures sharpness on a 64-pixel-wide
 * image, which averages moderate motion blur away, and it is advice
 * rather than a gate — nothing discards a photograph on what it says. So
 * a sweep that fires while the head is still moving produces soft
 * photographs that nothing catches. These four terms are what stands
 * between a turn and a smeared record.
 *
 * All four numbers are estimates until they are measured on a device
 * against real frames. They are deliberately much tighter than the walk's
 * `FACE_MOVING_PACE` of 0.9, which was tuned for "not obviously moving"
 * rather than for a sharp five-megapixel still.
 */
export const MOTION_WINDOW = 5;
export const SWEEP_STILL_PACE = 0.35;
export const SWEEP_YAW_STEP_MAX = 1.2;
export const SWEEP_YAW_RANGE_MAX = 2.5;
export const PHONE_STILL_MS = 200;

/** The last few yaw readings, oldest first. */
export function pushYaw(window: readonly number[], yaw: number): number[] {
  const next = [...window, yaw];
  return next.length > MOTION_WINDOW ? next.slice(next.length - MOTION_WINDOW) : next;
}

/**
 * Whether the head and the phone have both been still enough, for long
 * enough, to take a photograph.
 *
 * Without an accelerometer the phone term is dropped rather than failed —
 * a device that cannot report movement is not a device that is moving,
 * and the pace and turn terms carry the gate on their own, which is what
 * the rest of the capture screen already does with a missing sensor.
 */
export function motionSteady(input: {
  yawWindow: readonly number[];
  facePace: number;
  phoneStillSince: number | null;
  motionAvailable: boolean;
  now: number;
}): boolean {
  if (input.yawWindow.length < MOTION_WINDOW) return false;
  const window = input.yawWindow.slice(input.yawWindow.length - MOTION_WINDOW);

  /*
    A window with an unreadable turn in it is refused outright, and not
    merely skipped over. Both of the turn tests below are comparisons,
    and a comparison against a non-number is false, so an unreadable
    reading does not fail them — it hides whatever happened around it.
    Two of them, one on each side of a forty-degree swing, would report a
    head that had not moved at all.
  */
  if (!window.every((value) => Number.isFinite(value))) return false;
  if (!Number.isFinite(input.facePace)) return false;

  if (!(input.facePace < SWEEP_STILL_PACE)) return false;

  let low = window[0];
  let high = window[0];
  for (let i = 1; i < window.length; i += 1) {
    if (Math.abs(window[i] - window[i - 1]) > SWEEP_YAW_STEP_MAX) return false;
    low = Math.min(low, window[i]);
    high = Math.max(high, window[i]);
  }
  if (high - low > SWEEP_YAW_RANGE_MAX) return false;

  if (input.motionAvailable) {
    if (input.phoneStillSince === null) return false;
    if (input.now - input.phoneStillSince < PHONE_STILL_MS) return false;
  }

  return true;
}

/* ------------------------------ the settle ---------------------------- */

/**
 * How long the well and the motion gate must both hold before the
 * shutter, and how long that may be extended.
 *
 * The walk's 600 ms hold is deliberately not reused inside the turn: a
 * six-hundred-millisecond freeze twice over breaks the gesture, and 260 ms
 * behind a five-frame motion window is a stricter test of stillness than
 * 600 ms behind the loose pace gate ever was. The hold stays where a
 * deliberate pause is what is being asked for: the front photograph, at
 * the start, before any turning.
 */
export const SETTLE_MS = 260;
export const SETTLE_MAX_MS = 460;

/**
 * Whether to fire now.
 *
 * A frame cannot be chosen retrospectively, so the only way to fire near
 * the bottom of the well rather than at its lip is to wait while the pose
 * is still improving — but not indefinitely, because a person holding
 * a turn is a person whose arm is tiring.
 */
export function settleReady(input: {
  settleSince: number | null;
  now: number;
  cost: number;
  lastCost: number | null;
}): boolean {
  if (input.settleSince === null) return false;
  /*
    A cost that is not a number means the pose behind it could not be
    read, and the well should already have refused it. This is the last
    place the shutter can still be stopped, so it stops here too rather
    than relying on a gate two calls away staying correct.
  */
  if (!Number.isFinite(input.cost)) return false;
  const held = input.now - input.settleSince;
  /*
    The same is true of the clock. Every comparison below is a reason to
    wait, and every one of them is false of a number that is not a
    number — so an unreadable clock would fall through all of them and
    fire the shutter, which is the opposite of what this gate is for.
  */
  if (!Number.isFinite(held)) return false;
  if (held < SETTLE_MS) return false;
  if (held >= SETTLE_MAX_MS) return true;
  const falling = input.lastCost !== null && input.cost < input.lastCost;
  return !falling;
}

/* ------------------------------ the budget ---------------------------- */

/** The flight to the stack during a sweep; the walk keeps its longer one. */
export const SWEEP_COOLDOWN_MS = 600;

/** Three wells and at most two second chances. */
export const SWEEP_MAX_SHOTS = 5;

/** One re-opened well may be spent on a shot this much worse than the target. */
export const REOPEN_POSE_COST = 0.75;

/**
 * Mean Laplacian at 512 pixels wide, below which a photograph is soft
 * enough to be worth another pass. Not comparable with the 64-pixel
 * number used in the report's own quality note: the two share only the
 * word Laplacian. An estimate until it is measured.
 */
export const SWEEP_SOFT = 12;

/** From the ring opening: how long before the shutter is offered, and so on. */
export const SWEEP_GRACE_MS = 2000;
export const SWEEP_HINT_MS = 14000;
export const SWEEP_FORCED_MS = 30000;
export const SWEEP_MAX_MS = 45000;

/** At most one segment tick this often; dropped rather than queued. */
export const SEGMENT_HAPTIC_MS = 180;
