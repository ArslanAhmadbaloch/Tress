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
  | { kind: 'saved' };

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
  | { type: 'saveFailed' };

export type Effect =
  | { type: 'capture'; angle: Angle }
  | { type: 'countdown'; seconds: number }
  | { type: 'cancelCountdown' }
  | { type: 'haptic'; kind: 'holdStart' | 'captured' | 'complete' }
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
  for (const photo of input.baseline ?? []) {
    if (photo.angle !== 'leftTemple' && photo.angle !== 'rightTemple') continue;
    const yaw = (photo as { pose?: Pose }).pose?.yaw;
    if (typeof yaw !== 'number' || !Number.isFinite(yaw) || yaw === 0) continue;
    baselineSign[photo.angle] = Math.sign(yaw) as 1 | -1;
  }

  return {
    order,
    index: 0,
    phase: phaseFor(input, order[0], now),
    shots: {},
    sign: null,
    baselineSign,
    tracking: input.tracking,
    handsFree: input.handsFree,
    motionAvailable: input.motionAvailable,
    returnToReview: false,
  };
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

/* --------------------------- the transitions --------------------------- */

/** On to the next angle, back to review after a retake, or done. */
function advance(state: ScanState, now: number): Result {
  if (state.returnToReview) {
    return { state: { ...state, returnToReview: false, phase: { kind: 'review' } }, effects: [] };
  }

  const index = state.index + 1;
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

      return {
        state: {
          ...state,
          shots,
          sign,
          phase: {
            kind: 'flying',
            angle,
            uri: event.uri,
            until: event.now + COOLDOWN_MS,
            landed: false,
          },
        },
        effects: [{ type: 'announce', text: SCAN_COPY.captured[angle] }],
      };
    }

    case 'shotFailed':
    case 'cancelled':
      // Nothing was taken: the hold and the steadiness start over.
      return {
        state: { ...state, phase: phaseFor(state, phase.angle, event.now) },
        effects: NO_EFFECTS,
      };

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
  const phase = state.phase;
  switch (phase.kind) {
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
