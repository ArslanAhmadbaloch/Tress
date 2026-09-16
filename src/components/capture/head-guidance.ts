/**
 * What to tell somebody who is framing their own head.
 *
 * The camera can now see a face. That is the whole of what it can see: a
 * box, ear to ear and brow to chin, and roughly which way the head is
 * turned. It cannot see hair, and nothing here pretends otherwise — every
 * sentence this module produces is about where the head is in the frame,
 * because that is the one thing the person cannot judge for themselves
 * while holding a phone at arm's length with the screen facing away.
 *
 * The maths lives here, apart from the camera and the screen, so it can be
 * read and checked without either. Everything is expressed relative to
 * the guide ring rather than in pixels: the ring is the promise the
 * interface makes ("put your head here"), and the guidance is the honest
 * answer to how close they are to keeping it.
 */

import type { Angle } from '@/types/domain';

/** One detected face, in the coordinate space of the camera preview. */
export type FaceObservation = {
  /** Centre of the face box, in points. */
  cx: number;
  cy: number;
  /** The face box itself — ear to ear, brow to chin — in points. */
  width: number;
  height: number;
  /** Head turn in degrees; zero is square to the camera. */
  yaw: number;
  /** Head nod in degrees, ML Kit X-axis; positive = facing up. Absent on builds that do not report it. */
  pitch?: number;
  /** Head tilt in degrees, ML Kit Z-axis; positive = counter-clockwise. */
  roll?: number;
  /** When it was seen, in milliseconds. */
  at: number;
};

/** Where the head should be: the guide ring, in the same coordinate space. */
export type GuideTarget = {
  cx: number;
  cy: number;
  diameter: number;
};

export type GuidanceStatus =
  /** Tracking is not running for this angle, or not available at all. */
  | 'off'
  /** No face in the frame. */
  | 'searching'
  | 'closer'
  | 'back'
  | 'centre'
  | 'turnMore'
  | 'turnLess'
  /** Framed, but the phone or the head is still moving. */
  | 'still'
  /** Framed and steady: the moment to take the photograph. */
  | 'aligned';

export type Guidance = {
  status: GuidanceStatus;
  /** What to show, or nothing when tracking is off. */
  message: string | null;
  /** True only when the head is framed and everything has settled. */
  aligned: boolean;
};

/*
 * Thresholds, all as fractions of the ring's diameter so they hold on any
 * screen size.
 *
 * A face box is narrower than the head that carries it: the ring is meant
 * to hold the whole head, hair included, so a well-framed face fills a
 * little over half of it. "Too far" and "too close" are set wide apart on
 * purpose — the ask is a photograph that can be compared with last
 * month's, not a passport, and a guide that nags about a few percent is a
 * guide people stop trusting.
 */
const FAR_RATIO = 0.5;
const NEAR_RATIO = 1.05;

/** How far off the ring's centre the face may sit before being told. */
const CENTRE_TOLERANCE = 0.14;

/**
 * The face box sits low in the head: the ring's centre is roughly the
 * bridge of the nose plus the hair above it, so the face centre is
 * expected a little below it, not on it.
 */
const FACE_DROP = 0.08;

/** For the temple angles: how far the head should be turned, in degrees. */
const TURN_MIN = 18;
const TURN_MAX = 70;

/**
 * How fast a face can move and still count as still, in face widths per
 * second. Breathing and the small drift of an outstretched arm sit well
 * under this; lining the shot up sits well over it.
 */
export const FACE_MOVING_PACE = 0.9;

/**
 * Whether the camera can be expected to see a face at this angle.
 *
 * The top and the crown are shot from above and behind. There is no face
 * in either frame, and a detector left running on them would report
 * "searching" for the entire shot — the one message that would be both
 * true and useless.
 */
export function tracksFace(angle: Angle): boolean {
  return angle === 'front' || angle === 'leftTemple' || angle === 'rightTemple';
}

export type Framing = {
  size: 'ok' | 'far' | 'near';
  centred: boolean;
  turn: 'ok' | 'more' | 'less';
};

/** How a face sits against the ring, as three independent readings. */
export function framingOf(face: FaceObservation, target: GuideTarget, angle: Angle): Framing {
  const ratio = face.width / target.diameter;
  const size = ratio < FAR_RATIO ? 'far' : ratio > NEAR_RATIO ? 'near' : 'ok';

  const dx = face.cx - target.cx;
  const dy = face.cy - (target.cy + target.diameter * FACE_DROP);
  const centred = Math.hypot(dx, dy) <= target.diameter * CENTRE_TOLERANCE;

  /*
    Only the temples ask for a turn, and only how far — not which way.
    The preview is mirrored and the detector's sign convention differs
    between platforms, so a confident "turn left" would be wrong for
    roughly half the people who read it. "A little further" is right for
    all of them.
  */
  let turn: Framing['turn'] = 'ok';
  if (angle === 'leftTemple' || angle === 'rightTemple') {
    const magnitude = Math.abs(face.yaw);
    if (magnitude < TURN_MIN) turn = 'more';
    else if (magnitude > TURN_MAX) turn = 'less';
  }

  return { size, centred, turn };
}

/**
 * How quickly a face moved between two sightings, in face widths per
 * second. Zero when the readings are too close in time to say.
 */
export function facePace(previous: FaceObservation, next: FaceObservation): number {
  const seconds = (next.at - previous.at) / 1000;
  if (seconds <= 0.01) return 0;
  const distance = Math.hypot(next.cx - previous.cx, next.cy - previous.cy);
  const width = Math.max(1, (previous.width + next.width) / 2);
  return distance / width / seconds;
}

const MESSAGES: Record<Exclude<GuidanceStatus, 'off'>, string> = {
  searching: 'Bring your head into the ring',
  closer: 'Move a little closer',
  back: 'Move back a little',
  centre: 'Centre your head',
  turnMore: 'Turn a little further',
  turnLess: 'Turn back towards the camera',
  still: 'Hold still',
  aligned: 'Lined up — hold still',
};

export function guidanceFor(input: {
  angle: Angle;
  face: FaceObservation | null;
  target: GuideTarget;
  /** The phone itself is moving, from the accelerometer. */
  phoneMoving: boolean;
  /** The phone has been still long enough to trust. */
  phoneSteady: boolean;
  /** The face has moved recently, from its own pace. */
  faceMoving: boolean;
}): Guidance {
  const { angle, face, target } = input;

  if (!tracksFace(angle)) return { status: 'off', message: null, aligned: false };
  if (!face) return { status: 'searching', message: MESSAGES.searching, aligned: false };

  const framing = framingOf(face, target, angle);

  /*
    One thing at a time, in the order that makes the next one possible.
    Distance first, because centring a face that fills the frame is
    pointless; then position; then the turn. Somebody reading three
    corrections at once will fix none of them.
  */
  let status: GuidanceStatus;
  if (framing.size === 'far') status = 'closer';
  else if (framing.size === 'near') status = 'back';
  else if (!framing.centred) status = 'centre';
  else if (framing.turn === 'more') status = 'turnMore';
  else if (framing.turn === 'less') status = 'turnLess';
  else if (input.phoneMoving || input.faceMoving || !input.phoneSteady) status = 'still';
  else status = 'aligned';

  return { status, message: MESSAGES[status], aligned: status === 'aligned' };
}
