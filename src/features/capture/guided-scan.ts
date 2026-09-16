/**
 * The guided scan, as a state machine with nothing in it that needs a phone.
 *
 * The screen owns the camera, the sensors and the store; this owns the
 * question they are all asking — what is happening right now, and what
 * should happen next. Keeping it here means the awkward parts (a hold
 * that has to survive a dropped frame, a countdown that must not arm
 * while the phone is still moving, a retake that returns to review
 * instead of walking on) can be read and checked without a device.
 *
 * Everything it says is about the head's position in the frame or the
 * device's own work. It cannot see hair, and it never claims to.
 *
 * `capture-session.tsx` feeds it events and executes the effects it
 * returns; the reducer itself takes no photographs and fires no haptics.
 */

import {
  framingOf,
  tracksFace,
  type FaceObservation,
  type GuideTarget,
} from '@/components/capture/head-guidance';
import { ANGLES, type Angle, type Photo } from '@/types/domain';

import { SCAN_COPY } from './scan-copy';
import {
  BAND,
  DWELL_PITCH_MAX,
  DWELL_ROLL_MAX,
  MOTION_WINDOW,
  SWEEP_COOLDOWN_MS,
  SWEEP_FORCED_MS,
  SWEEP_GRACE_MS,
  SWEEP_HINT_MS,
  SWEEP_MAX_MS,
  SWEEP_MAX_SHOTS,
  SWEEP_SEGMENTS,
  SWEEP_STILL_PACE,
  REOPEN_POSE_COST,
  SEGMENT_DWELL_MS,
  accrueDwell,
  dispatchSegment,
  fractional,
  isFull,
  motionSteady,
  openWellFor,
  poseCost,
  poseOf,
  pushYaw,
  ringClosed,
  segmentGap,
  settleReady,
  theta,
  wellsFor,
  type BaselinePoses,
  type WellKey,
  type WellTarget,
} from './sweep';

/** How long a pose must hold before the shutter fires itself. */
export const HOLD_MS = 600;

/** The captured photograph's flight to the stack, before the next angle. */
export const COOLDOWN_MS = 900;

/** Held still this long with nothing else to fix means the arm is tiring. */
export const STUCK_STILL_MS = 6000;

/** After this long on one angle, offer the shutter as the way out. */
export const MANUAL_HINT_MS = 12000;

/** Steadiness required on a blind angle before the countdown arms. */
export const BLIND_ARM_MS = 1200;

/** Minimum time on the angle, so the instruction can be read first. */
export const BLIND_MIN_DWELL_MS = 1500;

export const BLIND_COUNTDOWN = 3;

/**
 * How fast a face can move and still count as still, in face widths per
 * second. The same value as `head-guidance`, re-declared so this module
 * keeps its runtime dependency down to `framingOf` and `tracksFace`.
 */
export const FACE_MOVING_PACE = 0.9;

/**
 * The pose each tracked angle is asking for, in degrees.
 *
 * The temple window is wide on purpose: the ask is a photograph that can
 * be compared with last month's, not a protractor reading.
 */
export const POSE = {
  front: { yawMax: 10, pitchMax: 12, rollMax: 10 },
  leftTemple: { yawMin: 25, yawMax: 48, pitchMax: 15, rollMax: 12 },
  rightTemple: { yawMin: 25, yawMax: 48, pitchMax: 15, rollMax: 12 },
} as const;

/** A face with the two extra angles the detector forwards; absent reads as level. */
export type PoseFace = FaceObservation & { pitch?: number; roll?: number };

export type Pose = { yaw: number; pitch: number; roll: number };

export type Cue =
  /** Fallback build: nothing is tracking, so the shutter is the way. */
  | 'manual'
  | 'searching'
  | 'closer'
  | 'back'
  | 'centre'
  | 'lookStraight'
  | 'turnMore'
  | 'turnLess'
  | 'otherWay'
  | 'matchBaseline'
  | 'chinLevel'
  | 'headLevel'
  | 'still'
  | 'brace'
  | 'hold';

/**
 * The lines only the turn can say.
 *
 * They are kept apart from `Cue` because they describe a ring with open
 * parts and a head moving through them, rather than a single angle being
 * lined up. `pause` is deliberately not `still`: "hold still" while
 * asking somebody to turn their head is a contradiction, and the turn
 * needs a word for the micro-pause that earns a photograph.
 */
export type SweepOnlyCue =
  | 'sweepStart'
  | 'slower'
  | 'pause'
  | 'gaps'
  | 'wellFront'
  | 'wellSide'
  | 'soft';

/** Everything the turn can say: the walk's vocabulary, plus its own. */
export type SweepCue = Cue | SweepOnlyCue;

/** One of the three targets a front camera can reach, and how it is going. */
export type Well = WellTarget & {
  status: 'open' | 'taken' | 'abandoned';
  /** `poseCost` of the shot that filled it; the yardstick for a better pass. */
  cost: number | null;
  reopens: 0 | 1;
};

export type SweepState = {
  step: 'centre' | 'turning' | 'finishing';
  /**
   * When the turn began. Every one of its timers falls back to this
   * while the ring is still shut, so the centre gate is as escapable as
   * every other step rather than a room with no door.
   */
  startedAt: number;
  /** When the ring opened, which is when the front photograph landed. */
  openedAt: number | null;
  /** Dwell in milliseconds, one per segment. Monotonic; never decays. */
  segments: number[];
  filled: boolean[];
  wells: Record<WellKey, Well>;
  /**
   * Set once the record's own two temple photographs have been found to
   * disagree with each other and the head has been believed instead. It
   * stops the disputed well being argued with; it does not move any well,
   * because the temple whose record was never in dispute is still the
   * best guide there is to where that photograph should be taken.
   */
  signFlipped: boolean;
  /**
   * Frames spent inside a well the record disagrees with. Counted rather
   * than acted on at once: one is a person turning the wrong way.
   */
  contra: number;
  shutters: number;
  settleSince: number | null;
  settleWell: WellKey | null;
  settleCost: number | null;
  yawWindow: number[];
  phoneStillSince: number | null;
  lastFaceAt: number | null;
  /** The last pose seen, for a shutter tapped between face events. */
  lastPose: Pose | null;
  current: number;
  currentF: number;
  cue: SweepCue;
  stillSince: number | null;
  /** The centre gate only: the walk's hold, before any turning. */
  holdSince: number | null;
  manualHint: boolean;
  forcedOffer: boolean;
  finishingSince: number | null;
  finished: boolean;
};

export type Phase =
  | {
      kind: 'tracked';
      angle: Angle;
      cue: Cue;
      holdSince: number | null;
      stillSince: number | null;
      enteredAt: number;
      manualHint: boolean;
    }
  | { kind: 'blind'; angle: Angle; enteredAt: number; steadySince: number | null; counting: boolean }
  | { kind: 'capturing'; angle: Angle }
  | { kind: 'flying'; angle: Angle; uri: string; until: number; landed: boolean }
  | { kind: 'review' }
  | { kind: 'analysing'; done: number; total: number; label: string; angle: Angle | null }
  | { kind: 'saved' }
  /*
    Thin on purpose: everything the turn knows lives in `state.sweep`, so
    a shutter and a flight can run over the top of a live sweep without
    the sweep being torn down and rebuilt underneath them.
  */
  | { kind: 'sweep' };

export type Shot = { angle: Angle; uri: string; pose?: Pose };

export type ScanState = {
  order: Angle[];
  index: number;
  phase: Phase;
  shots: Partial<Record<Angle, Shot>>;
  /** Locked at the first accepted temple; the second must be the opposite. */
  sign: 1 | -1 | null;
  /** From the baseline's own temple photographs, when they carry a pose. */
  baselineSign: Partial<Record<Angle, 1 | -1>>;
  /** The baseline's own poses, which move the sweep's wells onto last month's. */
  baselinePose: BaselinePoses;
  /**
   * How the tracked angles are taken: one continuous turn, or one angle
   * at a time. `'walk'` is the default and is the machine that was here
   * before the turn existed, kept intact rather than refactored.
   */
  mode: 'sweep' | 'walk';
  sweep: SweepState | null;
  /** Angles the turn gave up on, so the walk does not ask for them again. */
  skipped: Angle[];
  tracking: boolean;
  handsFree: boolean;
  motionAvailable: boolean;
  /** Set by `retake`: after the shot, go back to review instead of advancing. */
  returnToReview: boolean;
};

export type Event =
  | {
      type: 'face';
      face: PoseFace | null;
      target: GuideTarget;
      phoneMoving: boolean;
      phoneSteady: boolean;
      facePace: number;
      now: number;
    }
  | { type: 'motion'; moving: boolean; steady: boolean; now: number }
  | { type: 'tick'; now: number }
  | { type: 'shutter'; now: number }
  | { type: 'shot'; uri: string; pose?: Pose; now: number }
  | { type: 'shotFailed'; now: number }
  | { type: 'cancelled'; now: number }
  | { type: 'landed'; now: number }
  | { type: 'skip'; now: number }
  | { type: 'retake'; angle: Angle; now: number }
  | { type: 'analyse'; total: number }
  | { type: 'work'; done: number; label: string; angle: Angle | null }
  | { type: 'saved' }
  | { type: 'saveFailed' }
  /** The photograph came back soft enough to be worth another pass. */
  | { type: 'shotSoft'; angle: Angle; now: number }
  /** Finish the turn with whatever it has. */
  | { type: 'finish'; now: number }
  /** Switch between the turn and the walk, before any photograph exists. */
  | { type: 'mode'; mode: 'sweep' | 'walk'; now: number };

export type Effect =
  /*
    The pose travels with the effect rather than being read off a ref when
    the photograph resolves. The reducer knows the pose it decided on; a
    ref keeps moving for the whole of the capture, and `Photo.pose` would
    quietly record where the head ended up instead of where the
    photograph was taken — poisoning next month's well targets with
    nothing to catch it.
  */
  | { type: 'capture'; angle: Angle; pose?: Pose }
  | { type: 'countdown'; seconds: number }
  | { type: 'cancelCountdown' }
  | { type: 'haptic'; kind: 'holdStart' | 'captured' | 'complete' | 'segment' }
  | { type: 'announce'; text: string };

type Result = { state: ScanState; effects: Effect[] };

const NO_EFFECTS: Effect[] = [];

/** Tracked angles lead, because a face in the frame is the easiest start. */
const TRACKED_FIRST: readonly Angle[] = ['front', 'leftTemple', 'rightTemple'];

/**
 * The capture order: the tracked angles first, then the rest in `ANGLES`
 * order, rotated so `startAt` comes first and the others follow, wrapping
 * round. Somebody who tapped "Left Side" on the intro shoots left, right,
 * top, back, then front. `startAt` absent, or not in `angles`, is no
 * rotation.
 */
export function orderFor(angles: readonly Angle[], startAt?: Angle): Angle[] {
  const wanted = new Set(angles);
  const base: Angle[] = [];

  for (const angle of TRACKED_FIRST) if (wanted.has(angle)) base.push(angle);
  for (const angle of ANGLES) if (wanted.has(angle) && !base.includes(angle)) base.push(angle);

  const start = startAt === undefined ? -1 : base.indexOf(startAt);
  return start > 0 ? [...base.slice(start), ...base.slice(0, start)] : base;
}

/** The idle phase for an angle: guided if a face will be in the frame, blind if not. */
function phaseFor(state: Pick<ScanState, 'tracking'>, angle: Angle, now: number): Phase {
  if (tracksFace(angle)) {
    return {
      kind: 'tracked',
      angle,
      cue: state.tracking ? 'searching' : 'manual',
      holdSince: null,
      stillSince: null,
      enteredAt: now,
      manualHint: !state.tracking,
    };
  }
  return { kind: 'blind', angle, enteredAt: now, steadySince: null, counting: false };
}

export function createScan(input: {
  angles: readonly Angle[];
  startAt?: Angle;
  tracking: boolean;
  handsFree: boolean;
  motionAvailable: boolean;
  baseline?: Photo[];
  /** Defaults to the walk, so a caller that says nothing gets the old machine. */
  mode?: 'sweep' | 'walk';
  now?: number;
}): ScanState {
  const order = orderFor(input.angles, input.startAt);
  const now = input.now ?? 0;

  /*
    Which way the person turned last time, read off their own baseline
    photographs. It outranks the runtime lock below: the point of the
    scan is a photograph that lines up with the previous one, and the
    detector's sign convention is not stable enough to argue with.
  */
  const baselineSign: Partial<Record<Angle, 1 | -1>> = {};
  const baselinePose: BaselinePoses = {};
  for (const photo of input.baseline ?? []) {
    const pose = (photo as { pose?: Pose }).pose;
    if (pose && Number.isFinite(pose.yaw) && Number.isFinite(pose.pitch)) {
      baselinePose[photo.angle] ??= pose;
    }
    if (photo.angle !== 'leftTemple' && photo.angle !== 'rightTemple') continue;
    const yaw = pose?.yaw;
    if (typeof yaw !== 'number' || !Number.isFinite(yaw) || yaw === 0) continue;
    baselineSign[photo.angle] ??= Math.sign(yaw) as 1 | -1;
  }

  const base: ScanState = {
    order,
    index: 0,
    phase: phaseFor(input, order[0], now),
    shots: {},
    sign: null,
    baselineSign,
    baselinePose,
    mode: 'walk',
    sweep: null,
    skipped: [],
    tracking: input.tracking,
    handsFree: input.handsFree,
    motionAvailable: input.motionAvailable,
    returnToReview: false,
  };

  return input.mode === 'sweep' && sweepAvailable(base) ? asSweep(base, now) : base;
}

/**
 * One correction at a time, in the order that makes the next one
 * possible. Distance before position before turn: somebody reading three
 * corrections at once fixes none of them.
 */
export function poseCue(input: {
  face: PoseFace;
  target: GuideTarget;
  angle: Angle;
  sign: 1 | -1 | null;
  baselineSign?: 1 | -1;
  phoneMoving: boolean;
  phoneSteady: boolean;
  facePace: number;
}): Cue {
  const { face, angle, sign, baselineSign } = input;

  const framing = framingOf(face, input.target, angle);
  if (framing.size === 'far') return 'closer';
  if (framing.size === 'near') return 'back';
  if (!framing.centred) return 'centre';

  const yaw = face.yaw;
  const pitch = face.pitch ?? 0;
  const roll = face.roll ?? 0;

  // Only the tracked angles reach here; the temple window stands in for
  // anything else so the tolerances below always have a number.
  const limits = angle === 'front' ? POSE.front : POSE.leftTemple;

  if (angle === 'front') {
    if (Math.abs(yaw) > POSE.front.yawMax) return 'lookStraight';
  } else if (angle === 'leftTemple' || angle === 'rightTemple') {
    const magnitude = Math.abs(yaw);
    if (magnitude < POSE[angle].yawMin) return 'turnMore';
    if (magnitude > POSE[angle].yawMax) return 'turnLess';

    /*
      Which way is "left" is not knowable: the sign convention differs
      between platforms and the preview is mirrored (head-guidance.ts
      l.126-132). So the first temple accepts either direction, the
      second must be the opposite of it, and a baseline photograph — the
      one thing that is certainly this person's own — outranks both.
    */
    const turned = yaw < 0 ? -1 : 1;
    if (baselineSign !== undefined && turned !== baselineSign) return 'matchBaseline';
    if (angle === 'rightTemple' && sign !== null && turned === sign) return 'otherWay';
  }

  if (Math.abs(pitch) > limits.pitchMax) return 'chinLevel';
  if (Math.abs(roll) > limits.rollMax) return 'headLevel';
  if (input.phoneMoving || !input.phoneSteady || input.facePace >= FACE_MOVING_PACE) return 'still';
  return 'hold';
}

/** 0-1 while a hold is running, else 0. */
export function holdProgress(state: ScanState, now: number): number {
  const phase = state.phase;
  // The turn runs the same hold, once, at the centre gate before it opens.
  if (phase.kind === 'sweep') {
    const holdSince = state.sweep?.holdSince ?? null;
    return holdSince === null ? 0 : Math.min(1, (now - holdSince) / HOLD_MS);
  }
  if (phase.kind !== 'tracked' || phase.holdSince === null) return 0;
  return Math.min(1, (now - phase.holdSince) / HOLD_MS);
}

/** The angle the phase is about, or null once the photographs are in. */
export function currentAngle(state: ScanState): Angle | null {
  const phase = state.phase;
  switch (phase.kind) {
    case 'tracked':
    case 'blind':
    case 'capturing':
    case 'flying':
      return phase.angle;
    default:
      return null;
  }
}

/** Angles still to shoot, in capture order. */
export function remaining(state: ScanState): Angle[] {
  return state.order.filter((angle) => !state.shots[angle]);
}

/* ------------------------------ the sweep ------------------------------ */

/**
 * The turn is a phase that replaces the *tracked prefix* of the walk and
 * hands back to the walk at the first blind angle. Everything below is
 * additive: `advance`, `reduceBlind`, `reduceCapturing`, `reduceFlying`,
 * `reduceReview` and `reduceAnalysing` keep their shapes, and a scan that
 * never asks for `mode: 'sweep'` never meets any of it.
 */
const WELL_KEYS: readonly WellKey[] = ['front', 'templeA', 'templeB'];

/**
 * Frames inside a well the record disagrees with, before the record is
 * the thing assumed wrong. One is a person turning the wrong way; a
 * sustained pass is the detector's own convention, and nagging about it
 * for the rest of the turn would be nagging about something the person
 * cannot fix.
 */
const CONTRA_FRAMES = MOTION_WINDOW;

const SWEEP_ONLY: readonly SweepOnlyCue[] = [
  'sweepStart',
  'slower',
  'pause',
  'gaps',
  'wellFront',
  'wellSide',
  'soft',
];

function isSweepOnly(cue: SweepCue): cue is SweepOnlyCue {
  return (SWEEP_ONLY as readonly string[]).includes(cue);
}

function cueText(cue: SweepCue): string {
  return isSweepOnly(cue) ? SCAN_COPY.sweep.cue[cue] : SCAN_COPY.cue[cue];
}

/**
 * The turn is only offered where it can work: a detector that reports
 * faces, and at least two of the three angles it can reach. Everything
 * else — a screen reader, the manual preference, a build with no
 * detector at all — is the screen's to decide, and the answer to all of
 * them is the walk.
 */
export function sweepAvailable(state: Pick<ScanState, 'tracking' | 'order'>): boolean {
  return state.tracking && state.order.filter((angle) => tracksFace(angle)).length >= 2;
}

function createSweep(state: ScanState, now: number): SweepState {
  const targets = wellsFor({ baseline: state.baselinePose });
  const well = (target: WellTarget): Well => ({
    ...target,
    status: state.order.includes(target.angle) && !state.shots[target.angle] ? 'open' : 'abandoned',
    cost: null,
    reopens: 0,
  });

  const wells = {
    front: well(targets.front),
    templeA: well(targets.templeA),
    templeB: well(targets.templeB),
  };

  /*
    Centre first. The one photograph the report cannot do without is taken
    while the person is demonstrably still and before any turning, and the
    ring opening on it is what says the ring means something before
    anybody is asked to fill it. A set without a front angle has no centre
    gate to run, so the ring is open from the start.
  */
  const centre = wells.front.status === 'open';

  return {
    step: centre ? 'centre' : 'turning',
    startedAt: now,
    openedAt: centre ? null : now,
    segments: Array.from({ length: SWEEP_SEGMENTS }, () => 0),
    filled: Array.from({ length: SWEEP_SEGMENTS }, () => false),
    wells,
    signFlipped: false,
    contra: 0,
    shutters: 0,
    settleSince: null,
    settleWell: null,
    settleCost: null,
    yawWindow: [],
    phoneStillSince: null,
    lastFaceAt: null,
    lastPose: null,
    current: 0,
    currentF: 0,
    cue: 'searching',
    stillSince: null,
    holdSince: null,
    manualHint: false,
    forcedOffer: false,
    finishingSince: null,
    finished: false,
  };
}

function asSweep(state: ScanState, now: number): ScanState {
  return {
    ...state,
    mode: 'sweep',
    index: 0,
    sweep: createSweep(state, now),
    phase: { kind: 'sweep' },
  };
}

const wellsOf = (sweep: SweepState): Well[] => WELL_KEYS.map((key) => sweep.wells[key]);

const wellsResolved = (sweep: SweepState): boolean =>
  wellsOf(sweep).every((well) => well.status !== 'open');

const wellFor = (sweep: SweepState, angle: Angle): Well | null =>
  wellsOf(sweep).find((well) => well.angle === angle) ?? null;

function putWell(sweep: SweepState, well: Well): SweepState {
  return { ...sweep, wells: { ...sweep.wells, [well.key]: well } };
}

/**
 * Whether the record and the well disagree about which way this angle was
 * turned. The two temple wells always sit on opposite sides of the ring —
 * a head has two temples — so a baseline whose own two photographs point
 * the same way puts one well against the record it came from.
 */
function contradicts(state: ScanState, sweep: SweepState, well: Well): boolean {
  if (sweep.signFlipped || well.key === 'front') return false;
  const baseline = state.baselineSign[well.angle];
  if (baseline === undefined) return false;
  return Math.sign(well.target.yaw) !== baseline;
}

/** The turn's cue, in the order that makes the next correction possible. */
function sweepCue(input: {
  framing: ReturnType<typeof framingOf>;
  pose: Pose;
  signCue: SweepCue | null;
  live: Well | null;
  steady: boolean;
  facePace: number;
  segment: number;
  sweep: SweepState;
  closed: boolean;
}): SweepCue {
  const { framing, pose, live, sweep } = input;

  if (framing.size === 'far') return 'closer';
  if (framing.size === 'near') return 'back';
  if (!framing.centred) return 'centre';
  if (Math.abs(pose.pitch) > DWELL_PITCH_MAX) return 'chinLevel';
  if (Math.abs(pose.roll) > DWELL_ROLL_MAX) return 'headLevel';
  if (input.signCue) return input.signCue;
  // "Hold still" while asking somebody to turn is a contradiction, so a
  // well that is live but shaking asks for a pause instead.
  if (live) return input.steady ? 'hold' : 'pause';
  if (input.facePace >= SWEEP_STILL_PACE * 2 && input.segment < SEGMENT_DWELL_MS / 2) return 'slower';

  if (sweep.step === 'finishing') {
    if (!wellsResolved(sweep)) {
      return sweep.wells.front.status === 'open' ? 'wellFront' : 'wellSide';
    }
    if (!input.closed) return 'gaps';
  }
  return 'sweepStart';
}

/**
 * The turn is over: mark what it never reached, and hand the rest to the
 * walk exactly as it stands.
 *
 * A temple it could not get is left for next time — `missingAngles` and
 * the Home card already ask for it. The front is different: the report is
 * built from the front photograph, so rather than inventing an escape the
 * turn hands the front alone back to the one-at-a-time phase, with the
 * shutter offered.
 */
function finishSweep(state: ScanState, sweep: SweepState, effects: Effect[], now: number): Result {
  let wells = sweep.wells;
  const skipped = [...state.skipped];

  for (const key of WELL_KEYS) {
    const well = wells[key];
    if (well.status !== 'open') continue;
    if (well.angle === 'front') continue;
    wells = { ...wells, [key]: { ...well, status: 'abandoned' } };
    if (state.order.includes(well.angle) && !state.shots[well.angle] && !skipped.includes(well.angle)) {
      skipped.push(well.angle);
    }
  }

  const next: ScanState = {
    ...state,
    skipped,
    sweep: {
      ...sweep,
      wells,
      finished: true,
      settleSince: null,
      settleWell: null,
      settleCost: null,
    },
  };

  const index = next.order.findIndex(
    (angle) => !next.shots[angle] && !next.skipped.includes(angle),
  );

  /*
    Nothing is left, so the end of the whole set is the walk's to
    declare. The turn does not fire the completion itself: that haptic
    belongs to `advance`, and a turn with its own copy of it would sound
    twice in any session where the held shots were still to come.
  */
  if (index === -1) {
    const done = advance({ ...next, index: -1 }, now);
    return { state: done.state, effects: [...effects, ...done.effects] };
  }

  const phase = phaseFor(next, next.order[index], now);
  return {
    state: {
      ...next,
      index,
      phase: phase.kind === 'tracked' ? { ...phase, manualHint: true } : phase,
    },
    effects,
  };
}

/**
 * The clock the turn's own timers run on.
 *
 * The ring's clock starts when it opens, but the centre gate comes before
 * that and can be sat in indefinitely — a person who cannot get the front
 * photograph would otherwise be offered no shutter, no way to finish and
 * no end at all, which is the one thing every other step of this screen
 * is careful not to do. So the timers fall back to when the turn began.
 */
const sweepClock = (sweep: SweepState): number => sweep.openedAt ?? sweep.startedAt;

/** The two ways a turn ends on its own: everything done, or time up. */
function maybeFinish(
  state: ScanState,
  sweep: SweepState,
  effects: Effect[],
  now: number,
): Result | null {
  if (sweep.finished) return null;
  const resolved = wellsResolved(sweep);
  const closed = ringClosed(sweep.segments);

  if (now - sweepClock(sweep) >= SWEEP_MAX_MS) {
    return finishSweep(state, sweep, effects, now);
  }
  if (sweep.step !== 'finishing' || !resolved) return null;
  if (closed) return finishSweep(state, sweep, effects, now);
  if (sweep.finishingSince !== null && now - sweep.finishingSince >= SWEEP_GRACE_MS) {
    return finishSweep(state, sweep, effects, now);
  }
  return null;
}

/** The last step of every face event: name it, move the step on, or end. */
function settleSweep(
  state: ScanState,
  sweep: SweepState,
  cue: SweepCue,
  effects: Effect[],
  now: number,
): Result {
  let next = sweep;

  /*
    A pause that never ends is the same tiring arm the walk already knows
    about, and the same sentence answers it.
  */
  let spoken = cue;
  let stillSince = sweep.stillSince;
  if (cue === 'pause') {
    if (stillSince === null) stillSince = now;
    else if (now - stillSince >= STUCK_STILL_MS) spoken = 'brace';
  } else {
    stillSince = null;
  }
  next = { ...next, stillSince, cue: spoken };

  if (next.step === 'turning' && (wellsResolved(next) || ringClosed(next.segments))) {
    next = { ...next, step: 'finishing', finishingSince: now };
  }

  const out = [...effects];
  if (spoken !== sweep.cue) out.push({ type: 'announce', text: cueText(spoken) });

  return maybeFinish(state, next, out, now) ?? { state: { ...state, sweep: next }, effects: out };
}

/**
 * The centre gate. The ring is inert, nothing accrues, and the only live
 * target is the front — gated exactly as the walk gates a tracked angle,
 * because a deliberate pause is exactly what is being asked for here.
 */
function sweepCentre(
  state: ScanState,
  sweep: SweepState,
  event: Extract<Event, { type: 'face' }>,
): Result {
  if (!state.tracking) return { state, effects: NO_EFFECTS };

  const now = event.now;
  const front = sweep.wells.front;
  const face = event.face;

  let cue: SweepCue = face
    ? poseCue({
        face,
        target: event.target,
        angle: front.angle,
        sign: state.sign,
        baselineSign: state.baselineSign[front.angle],
        phoneMoving: event.phoneMoving,
        phoneSteady: event.phoneSteady,
        facePace: event.facePace,
      })
    : 'searching';

  let stillSince = sweep.stillSince;
  if (cue === 'still') {
    if (stillSince === null) stillSince = now;
    else if (now - stillSince >= STUCK_STILL_MS) cue = 'brace';
  } else {
    stillSince = null;
  }

  const effects: Effect[] = [];
  let holdSince = sweep.holdSince;
  if (cue === 'hold') {
    if (holdSince === null) {
      holdSince = now;
      effects.push({ type: 'haptic', kind: 'holdStart' });
    }
  } else {
    holdSince = null;
  }

  if (cue !== sweep.cue) effects.push({ type: 'announce', text: cueText(cue) });

  const next: SweepState = {
    ...sweep,
    cue,
    stillSince,
    holdSince,
    lastFaceAt: now,
    lastPose: face ? poseOf(face) : sweep.lastPose,
    phoneStillSince: event.phoneMoving ? null : (sweep.phoneStillSince ?? now),
  };

  if (face && holdSince !== null && now - holdSince >= HOLD_MS) {
    const pose = poseOf(face);
    effects.push(
      { type: 'capture', angle: front.angle, pose },
      { type: 'haptic', kind: 'captured' },
    );
    return {
      state: {
        ...state,
        sweep: { ...next, holdSince: null, shutters: next.shutters + 1 },
        phase: { kind: 'capturing', angle: front.angle },
      },
      effects,
    };
  }

  return { state: { ...state, sweep: next }, effects };
}

/** The turn itself: dwell, the wells, the motion gate, the shutter. */
function sweepTurn(
  state: ScanState,
  sweep: SweepState,
  event: Extract<Event, { type: 'face' }>,
): Result {
  if (!state.tracking) return { state, effects: NO_EFFECTS };

  const now = event.now;
  const face = event.face;
  const effects: Effect[] = [];

  if (!face) {
    const lost: SweepState = {
      ...sweep,
      lastFaceAt: now,
      yawWindow: [],
      settleSince: null,
      settleWell: null,
      settleCost: null,
    };
    return settleSweep(state, lost, 'searching', effects, now);
  }

  const pose = poseOf(face);
  const framing = framingOf(face, event.target, 'front');

  /* 1. Dwell, which is monotonic and never decays. */
  const dwell = accrueDwell(sweep.segments, {
    face,
    target: event.target,
    now,
    lastFaceAt: sweep.lastFaceAt,
    running: true,
  });

  const filled = [...sweep.filled];
  if (dwell.index !== null && !filled[dwell.index] && isFull(dwell.segments[dwell.index])) {
    filled[dwell.index] = true;
    effects.push({ type: 'haptic', kind: 'segment' });
  }

  /* 2. The cursor, with the hysteresis that keeps it off the boundary. */
  const cursor = dispatchSegment({
    theta: theta(face.yaw),
    current: sweep.current,
    currentF: sweep.currentF,
  });

  let next: SweepState = {
    ...sweep,
    segments: dwell.segments,
    filled,
    current: cursor.current,
    currentF: cursor.currentF,
    yawWindow: pushYaw(sweep.yawWindow, face.yaw),
    phoneStillSince: event.phoneMoving ? null : (sweep.phoneStillSince ?? now),
    lastFaceAt: now,
    lastPose: pose,
  };

  /* 3. Which well this frame could fill, if any. At most one ever can. */
  const candidates = wellsOf(next).filter(
    (well) =>
      well.status === 'open' ||
      (well.status === 'taken' && well.reopens === 0 && well.cost !== null && well.cost > REOPEN_POSE_COST),
  );
  const found = openWellFor({ wells: candidates, face, target: event.target });
  let live = found ? next.wells[found.key] : null;
  let signCue: SweepCue | null = null;

  if (live && contradicts(state, next, live)) {
    /*
      The record says this angle was turned the other way. Refuse the
      photograph rather than file it under a label the record disputes —
      and if the head keeps coming back here, believe the head.
    */
    const contra = next.contra + 1;
    live = null;
    if (contra >= CONTRA_FRAMES) {
      /*
        The head keeps coming back to the well the record disputes, so
        the record is what gives way — about that well, and only about
        that well. Nothing moves: the other temple's photograph agreed
        with the record it came from, and shifting it to the opposite
        side of the head to keep the disputed one company would break
        the one comparison that was still sound.
      */
      next = { ...next, signFlipped: true, contra: 0 };
    } else {
      next = { ...next, contra };
      signCue = 'matchBaseline';
    }
  } else if (!live) {
    const magnitude = Math.abs(pose.yaw);
    const temples = wellsOf(next).filter((well) => well.key !== 'front');
    if (magnitude >= BAND.temple.yawMin && magnitude <= BAND.temple.yawMax) {
      const side = pose.yaw < 0 ? -1 : 1;
      const owner = temples.find((well) => Math.sign(well.target.yaw) === side);
      if (owner && owner.status !== 'open' && temples.some((well) => well.status === 'open')) {
        signCue = 'otherWay';
      }
    }
  }

  /* 4. The motion gate, then the settle it opens. */
  const steady = motionSteady({
    yawWindow: next.yawWindow,
    facePace: event.facePace,
    phoneStillSince: next.phoneStillSince,
    motionAvailable: state.motionAvailable,
    now,
  });

  const cost = live ? poseCost(pose, live) : null;
  let fire: Well | null = null;

  if (live && cost !== null && steady) {
    if (next.settleWell !== live.key || next.settleSince === null) {
      next = { ...next, settleSince: now, settleWell: live.key, settleCost: null };
      effects.push({ type: 'haptic', kind: 'holdStart' });
    }
    const ready = settleReady({
      settleSince: next.settleSince,
      now,
      cost,
      lastCost: next.settleCost,
    });
    // A well that is already taken only re-opens for a better pass.
    const better = live.status === 'open' || (live.cost !== null && cost < live.cost);
    if (ready && better && next.shutters < SWEEP_MAX_SHOTS) fire = live;
    next = { ...next, settleCost: cost };
  } else {
    next = { ...next, settleSince: null, settleWell: null, settleCost: null };
  }

  const cue = sweepCue({
    framing,
    pose,
    signCue,
    live,
    steady,
    facePace: event.facePace,
    segment: next.segments[cursor.current] ?? 0,
    sweep: next,
    closed: ringClosed(next.segments),
  });

  if (fire && cost !== null) {
    /*
      A well re-opened for a better pass keeps the photograph it already
      has until the replacement is in hand. It is the rule the review's
      retake follows — a shot that is cancelled or fails must lose
      nothing — and the better frame is not a reason to break it. The
      soft re-open is the one place a photograph is dropped with no
      replacement, and only because that frame is known to be soft.
    */
    const retaken = fire.status === 'taken';

    if (cue !== next.cue) effects.push({ type: 'announce', text: cueText(cue) });
    effects.push(
      { type: 'capture', angle: fire.angle, pose },
      { type: 'haptic', kind: 'captured' },
    );

    return {
      state: {
        ...state,
        sweep: putWell(
          {
            ...next,
            cue,
            stillSince: null,
            shutters: next.shutters + 1,
            settleSince: null,
            settleWell: null,
            settleCost: null,
          },
          // The second chance is spent here; the status and the cost are
          // the landed photograph's to say, and it has not landed yet.
          { ...fire, reopens: retaken ? 1 : fire.reopens },
        ),
        phase: { kind: 'capturing', angle: fire.angle },
      },
      effects,
    };
  }

  return settleSweep(state, next, cue, effects, now);
}

const openWells = (sweep: SweepState): Well[] =>
  wellsOf(sweep).filter((well) => well.status === 'open');

/** The nearest of these wells to the cursor, which is the one being asked for. */
function nearestWell(sweep: SweepState, wells: readonly Well[]): Well | null {
  if (wells.length === 0) return null;
  return wells.reduce((best, well) =>
    segmentGap(fractional(theta(well.target.yaw)), sweep.currentF) <
    segmentGap(fractional(theta(best.target.yaw)), sweep.currentF)
      ? well
      : best,
  );
}

function reduceSweep(state: ScanState, sweep: SweepState, event: Event): Result {
  switch (event.type) {
    case 'face':
      return sweep.step === 'centre'
        ? sweepCentre(state, sweep, event)
        : sweepTurn(state, sweep, event);

    case 'motion': {
      const phoneStillSince = event.moving ? null : (sweep.phoneStillSince ?? event.now);
      return { state: { ...state, sweep: { ...sweep, phoneStillSince } }, effects: NO_EFFECTS };
    }

    case 'tick': {
      const ended = maybeFinish(state, sweep, [], event.now);
      if (ended) return ended;

      const since = event.now - sweepClock(sweep);
      const manualHint = sweep.manualHint || since >= SWEEP_HINT_MS;
      const forcedOffer = sweep.forcedOffer || since >= SWEEP_FORCED_MS;
      if (manualHint === sweep.manualHint && forcedOffer === sweep.forcedOffer) {
        return { state, effects: NO_EFFECTS };
      }
      return {
        state: { ...state, sweep: { ...sweep, manualHint, forcedOffer } },
        effects: NO_EFFECTS,
      };
    }

    case 'shutter': {
      /*
        The budget is a budget whoever spends it. The automatic gate and
        a tapped shutter draw on the same five, so a turn cannot take a
        sixth photograph by being asked for it by hand.
      */
      if (sweep.shutters >= SWEEP_MAX_SHOTS) return { state, effects: NO_EFFECTS };

      const well =
        sweep.step === 'centre' ? sweep.wells.front : nearestWell(sweep, openWells(sweep));
      if (!well || well.status !== 'open') return { state, effects: NO_EFFECTS };
      return {
        state: {
          ...state,
          sweep: {
            ...sweep,
            shutters: sweep.shutters + 1,
            settleSince: null,
            settleWell: null,
            settleCost: null,
            holdSince: null,
          },
          phase: { kind: 'capturing', angle: well.angle },
        },
        effects: [{ type: 'capture', angle: well.angle, pose: sweep.lastPose ?? undefined }],
      };
    }

    case 'skip': {
      /*
        The front is the one angle the turn may not give up on. The
        report is built from the front photograph, so a turn asked to do
        without it ends instead, and `finishSweep` hands the front alone
        back to the one-at-a-time phase with the shutter offered — the
        same exception a forced finish makes, rather than a second escape
        that could quietly lose it. While the ring is still shut the
        front is the only thing being asked for, so a skip there is that
        request; once it is turning, a skip is about the side wells and
        reaches the front only when nothing else is left open.
      */
      const open = openWells(sweep);
      if (open.length === 0) return { state, effects: NO_EFFECTS };

      const sides = open.filter((candidate) => candidate.angle !== 'front');
      if (sweep.step === 'centre' || sides.length === 0) {
        return finishSweep(state, sweep, [], event.now);
      }

      const well = nearestWell(sweep, sides);
      if (!well) return { state, effects: NO_EFFECTS };

      const skipped = state.order.includes(well.angle) && !state.skipped.includes(well.angle)
        ? [...state.skipped, well.angle]
        : state.skipped;
      const next = putWell(sweep, { ...well, status: 'abandoned' });
      /*
        Giving up on the last open well is the end of the turn, whichever
        step it happened in — but it still ends through `'finishing'`, so
        the ring is given its grace to close rather than vanishing under
        somebody's hand.
      */
      const stepped: SweepState = wellsResolved(next)
        ? { ...next, step: 'finishing', finishingSince: event.now, openedAt: next.openedAt ?? event.now }
        : next;

      const skippedState = { ...state, skipped };
      return (
        maybeFinish(skippedState, stepped, [], event.now) ?? {
          state: { ...skippedState, sweep: stepped },
          effects: NO_EFFECTS,
        }
      );
    }

    default:
      return { state, effects: NO_EFFECTS };
  }
}

/**
 * A photograph came back soft. One well may re-open once for it; a second
 * soft frame is accepted as it is, because a soft photograph the report
 * can honestly flag beats a missing angle.
 */
function reduceShotSoft(state: ScanState, event: Extract<Event, { type: 'shotSoft' }>): Result {
  const sweep = state.sweep;
  if (!sweep || sweep.finished) return { state, effects: NO_EFFECTS };

  const well = wellFor(sweep, event.angle);
  if (!well || well.status !== 'taken' || well.reopens !== 0) return { state, effects: NO_EFFECTS };

  const shots = { ...state.shots };
  delete shots[event.angle];

  return {
    state: {
      ...state,
      shots,
      sweep: putWell({ ...sweep, cue: 'soft' }, { ...well, status: 'open', cost: null, reopens: 1 }),
    },
    effects: [{ type: 'announce', text: SCAN_COPY.sweep.cue.soft }],
  };
}

/** The turn and the walk are chosen once, before any photograph exists. */
function reduceMode(state: ScanState, event: Extract<Event, { type: 'mode' }>): Result {
  if (Object.keys(state.shots).length > 0) return { state, effects: NO_EFFECTS };
  if (event.mode === state.mode) return { state, effects: NO_EFFECTS };

  if (event.mode === 'sweep') {
    if (!sweepAvailable(state)) return { state, effects: NO_EFFECTS };
    return { state: asSweep(state, event.now), effects: NO_EFFECTS };
  }

  return {
    state: {
      ...state,
      mode: 'walk',
      sweep: null,
      index: 0,
      phase: phaseFor(state, state.order[0], event.now),
    },
    effects: NO_EFFECTS,
  };
}

/* --------------------------- the transitions --------------------------- */

/** On to the next angle, back to review after a retake, or done. */
function advance(state: ScanState, now: number): Result {
  if (state.returnToReview) {
    return { state: { ...state, returnToReview: false, phase: { kind: 'review' } }, effects: [] };
  }

  /*
    A turn that is still running gets its phase back after a photograph,
    rather than the walk stepping to the next angle underneath it. The
    front landing is also where the ring opens: it is the first moment the
    person has done something the ring can report.
  */
  if (state.sweep && !state.sweep.finished) {
    const sweep = state.sweep;
    const opened =
      sweep.step === 'centre' && sweep.wells.front.status === 'taken'
        ? {
            ...sweep,
            step: 'turning' as const,
            openedAt: now,
            lastFaceAt: null,
            holdSince: null,
            stillSince: null,
            cue: 'sweepStart' as SweepCue,
          }
        : sweep;
    return { state: { ...state, sweep: opened, phase: { kind: 'sweep' } }, effects: [] };
  }

  let index = state.index + 1;
  // An angle the turn already took, or gave up on, is not walked again.
  while (
    index < state.order.length &&
    (state.shots[state.order[index]] || state.skipped.includes(state.order[index]))
  ) {
    index += 1;
  }

  if (index < state.order.length) {
    return { state: { ...state, index, phase: phaseFor(state, state.order[index], now) }, effects: [] };
  }

  return {
    state: { ...state, index, phase: { kind: 'review' } },
    effects: [
      { type: 'haptic', kind: 'complete' },
      { type: 'announce', text: SCAN_COPY.complete },
    ],
  };
}

function reduceTracked(
  state: ScanState,
  phase: Extract<Phase, { kind: 'tracked' }>,
  event: Event,
): Result {
  switch (event.type) {
    case 'face': {
      // A fallback build has no tracking to report; the cue stays the
      // shutter instruction and faces change nothing.
      if (!state.tracking) return { state, effects: NO_EFFECTS };

      const now = event.now;
      let cue: Cue = event.face
        ? poseCue({
            face: event.face,
            target: event.target,
            angle: phase.angle,
            sign: state.sign,
            baselineSign: state.baselineSign[phase.angle],
            phoneMoving: event.phoneMoving,
            phoneSteady: event.phoneSteady,
            facePace: event.facePace,
          })
        : 'searching';

      /*
        "Hold still" for six seconds means the framing is right and the
        arm is not. Derived here rather than in the view so the screen
        has nothing to time.
      */
      let stillSince = phase.stillSince;
      if (cue === 'still') {
        if (stillSince === null) stillSince = now;
        else if (now - stillSince >= STUCK_STILL_MS) cue = 'brace';
      } else {
        stillSince = null;
      }

      const effects: Effect[] = [];

      let holdSince = phase.holdSince;
      if (cue === 'hold') {
        if (holdSince === null) {
          holdSince = now;
          effects.push({ type: 'haptic', kind: 'holdStart' });
        }
      } else {
        holdSince = null;
      }

      // Only changes are announced; the screen rations them from there.
      if (cue !== phase.cue) effects.push({ type: 'announce', text: SCAN_COPY.cue[cue] });

      if (holdSince !== null && now - holdSince >= HOLD_MS) {
        effects.push({ type: 'capture', angle: phase.angle }, { type: 'haptic', kind: 'captured' });
        return { state: { ...state, phase: { kind: 'capturing', angle: phase.angle } }, effects };
      }

      return { state: { ...state, phase: { ...phase, cue, holdSince, stillSince } }, effects };
    }

    case 'tick': {
      if (phase.manualHint || event.now - phase.enteredAt < MANUAL_HINT_MS) {
        return { state, effects: NO_EFFECTS };
      }
      return { state: { ...state, phase: { ...phase, manualHint: true } }, effects: NO_EFFECTS };
    }

    case 'shutter':
      return {
        state: { ...state, phase: { kind: 'capturing', angle: phase.angle } },
        effects: [{ type: 'capture', angle: phase.angle }],
      };

    default:
      return { state, effects: NO_EFFECTS };
  }
}

function reduceBlind(
  state: ScanState,
  phase: Extract<Phase, { kind: 'blind' }>,
  event: Event,
): Result {
  switch (event.type) {
    case 'motion': {
      let steadySince = phase.steadySince;
      let counting = phase.counting;
      const effects: Effect[] = [];

      if (event.moving) {
        steadySince = null;
        if (counting) {
          counting = false;
          effects.push({ type: 'cancelCountdown' });
        }
      }
      if (event.steady && steadySince === null) steadySince = event.now;

      return { state: { ...state, phase: { ...phase, steadySince, counting } }, effects };
    }

    case 'tick': {
      const armable =
        state.handsFree &&
        state.motionAvailable &&
        !phase.counting &&
        phase.steadySince !== null &&
        event.now - phase.steadySince >= BLIND_ARM_MS &&
        event.now - phase.enteredAt >= BLIND_MIN_DWELL_MS;
      if (!armable) return { state, effects: NO_EFFECTS };

      return {
        state: { ...state, phase: { ...phase, counting: true } },
        effects: [
          { type: 'countdown', seconds: BLIND_COUNTDOWN },
          { type: 'announce', text: SCAN_COPY.blind.armed },
        ],
      };
    }

    case 'shutter': {
      // A tap while it is counting means "not yet", not "now".
      if (phase.counting) {
        return {
          state: { ...state, phase: { ...phase, counting: false, steadySince: null } },
          effects: [{ type: 'cancelCountdown' }],
        };
      }
      return {
        state: { ...state, phase: { kind: 'capturing', angle: phase.angle } },
        effects: [{ type: 'capture', angle: phase.angle }],
      };
    }

    case 'skip':
      return advance(state, event.now);

    default:
      return { state, effects: NO_EFFECTS };
  }
}

function reduceCapturing(
  state: ScanState,
  phase: Extract<Phase, { kind: 'capturing' }>,
  event: Event,
): Result {
  switch (event.type) {
    case 'shot': {
      const angle = phase.angle;
      const shots = { ...state.shots, [angle]: { angle, uri: event.uri, pose: event.pose } };

      let sign = state.sign;
      if (
        (angle === 'leftTemple' || angle === 'rightTemple') &&
        event.pose &&
        sign === null &&
        event.pose.yaw !== 0
      ) {
        sign = Math.sign(event.pose.yaw) as 1 | -1;
      }

      const turning = state.sweep !== null && !state.sweep.finished;
      const well = state.sweep ? wellFor(state.sweep, angle) : null;
      /*
        The well's cost is the cost of the photograph actually in hand,
        so it is written here rather than when the shutter was asked
        for: a shot that never arrived has no pose and no cost, and a
        well that recorded one would be describing a photograph that
        does not exist.
      */
      const sweep =
        turning && state.sweep && well
          ? putWell(state.sweep, {
              ...well,
              status: 'taken',
              cost: event.pose ? poseCost(event.pose, well) : well.cost,
            })
          : state.sweep;

      /*
        Three per-angle confirmations can land inside a second during a
        turn, so the turn counts instead. The per-angle lines stay for the
        held shots and for the walk, where there is one angle at a time to
        be about.
      */
      const text = turning
        ? SCAN_COPY.sweep.saved(Object.keys(shots).length, state.order.length)
        : SCAN_COPY.captured[angle];

      return {
        state: {
          ...state,
          shots,
          sign,
          sweep,
          phase: {
            kind: 'flying',
            angle,
            uri: event.uri,
            until: event.now + (turning ? SWEEP_COOLDOWN_MS : COOLDOWN_MS),
            landed: false,
          },
        },
        effects: [{ type: 'announce', text }],
      };
    }

    case 'shotFailed':
    case 'cancelled': {
      /*
        Nothing was taken: the hold and the steadiness start over. The
        turn's wells are left exactly as they were, which is the point of
        writing them only when a photograph lands — a well that was full
        before the shutter is still full, holding the photograph it
        already had, and one that was empty is still empty.
      */
      if (state.sweep && !state.sweep.finished) {
        return { state: { ...state, phase: { kind: 'sweep' } }, effects: NO_EFFECTS };
      }
      return {
        state: { ...state, phase: phaseFor(state, phase.angle, event.now) },
        effects: NO_EFFECTS,
      };
    }

    default:
      return { state, effects: NO_EFFECTS };
  }
}

function reduceFlying(
  state: ScanState,
  phase: Extract<Phase, { kind: 'flying' }>,
  event: Event,
): Result {
  switch (event.type) {
    case 'landed': {
      const landed = { ...state, phase: { ...phase, landed: true } };
      return event.now >= phase.until ? advance(landed, event.now) : { state: landed, effects: [] };
    }

    case 'tick':
      return phase.landed && event.now >= phase.until
        ? advance(state, event.now)
        : { state, effects: NO_EFFECTS };

    default:
      // A tap mid-flight is an accident, not a request for another one.
      return { state, effects: NO_EFFECTS };
  }
}

function reduceReview(state: ScanState, event: Event): Result {
  switch (event.type) {
    case 'retake':
      /*
        The existing shot is kept until the new one lands, so a retake
        that is cancelled or fails loses nothing.
      */
      return {
        state: {
          ...state,
          index: state.order.indexOf(event.angle),
          returnToReview: true,
          phase: phaseFor(state, event.angle, event.now),
        },
        effects: NO_EFFECTS,
      };

    case 'analyse':
      return {
        state: {
          ...state,
          phase: { kind: 'analysing', done: 0, total: event.total, label: '', angle: null },
        },
        effects: NO_EFFECTS,
      };

    default:
      return { state, effects: NO_EFFECTS };
  }
}

function reduceAnalysing(
  state: ScanState,
  phase: Extract<Phase, { kind: 'analysing' }>,
  event: Event,
): Result {
  switch (event.type) {
    case 'work':
      // Monotonic: work arriving out of order must not wind the bar back.
      return {
        state: {
          ...state,
          phase: {
            ...phase,
            done: Math.max(phase.done, event.done),
            label: event.label,
            angle: event.angle,
          },
        },
        effects: NO_EFFECTS,
      };

    case 'saved':
      return { state: { ...state, phase: { kind: 'saved' } }, effects: NO_EFFECTS };

    case 'saveFailed':
      // The photographs are still in hand; review is where they can be used again.
      return { state: { ...state, phase: { kind: 'review' } }, effects: NO_EFFECTS };

    default:
      return { state, effects: NO_EFFECTS };
  }
}

export function reduce(state: ScanState, event: Event): Result {
  /*
    Three events are about the turn rather than about the phase it is
    currently in: a photograph comes back soft while it is already flying
    to the stack, the turn is finished from a button, and the mode is
    chosen before anything has happened at all.
  */
  switch (event.type) {
    case 'shotSoft':
      return reduceShotSoft(state, event);
    case 'finish':
      return state.sweep && !state.sweep.finished
        ? finishSweep(state, state.sweep, [], event.now)
        : { state, effects: NO_EFFECTS };
    case 'mode':
      return reduceMode(state, event);
    default:
      break;
  }

  const phase = state.phase;
  switch (phase.kind) {
    case 'sweep':
      return state.sweep
        ? reduceSweep(state, state.sweep, event)
        : { state, effects: NO_EFFECTS };
    case 'tracked':
      return reduceTracked(state, phase, event);
    case 'blind':
      return reduceBlind(state, phase, event);
    case 'capturing':
      return reduceCapturing(state, phase, event);
    case 'flying':
      return reduceFlying(state, phase, event);
    case 'review':
      return reduceReview(state, event);
    case 'analysing':
      return reduceAnalysing(state, phase, event);
    default:
      return { state, effects: NO_EFFECTS };
  }
}
