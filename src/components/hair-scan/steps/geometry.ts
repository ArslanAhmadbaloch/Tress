/**
 * The arithmetic behind the step chrome, with no React in it.
 *
 * Every number the header, the arrow and the checklist draw themselves
 * with is decided here: how full a segment of the bar is, how lit one
 * chevron is as the run passes through it, how fast that run goes, how
 * far the arrow drifts, and how long a row of the checklist waits before
 * it arrives.
 *
 * It is a plain module rather than part of the components for one
 * reason, and it is the reason that matters: a `.tsx` file cannot be
 * imported by the test run — Node strips types but not JSX — so anything
 * living beside a component can only ever be checked by reading its
 * source as text. Moved here, these functions are imported and called
 * with real numbers, which is the only way a claim about what the arrow
 * looks like at a given urgency can actually be held to.
 *
 * Everything here is pure, everything here carries its own `'worklet'`
 * because the UI thread calls all of it, and no default parameter
 * reaches a module constant.
 */

/** Which way the head has to go. */
export type TurnDirection = 'right' | 'left' | 'down';

/** Clamped 0–1. */
export function unit(value: number): number {
  'worklet';
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/* ------------------------------- the bar -------------------------------- */

/** The bar's thickness. Thin enough to be chrome, thick enough to see lit. */
export const STEP_BAR_HEIGHT = 4;

/** How much of one segment is filled, 0–1, given where the scan is. */
export function segmentFill(index: number, progress: number, segment: number): number {
  'worklet';
  if (segment < index) return 1;
  if (segment > index) return 0;
  if (progress < 0) return 0;
  if (progress > 1) return 1;
  return progress;
}

/* ------------------------------ the arrow ------------------------------- */

/** How many chevrons the arrow is made of. */
export const CHEVRON_COUNT = 3;
/** One chevron, in points. Large: this has to read from two feet away. */
export const CHEVRON_WIDTH = 38;
export const CHEVRON_HEIGHT = 64;
/** The gap between chevrons — tight, so the three read as one arrow. */
export const CHEVRON_GAP = 2;

/** How long one run of the light takes, calm and at full insistence. */
export const SWEEP_CALM_MS = 1100;
export const SWEEP_URGENT_MS = 620;

/** What a chevron sits at between runs, calm and at full insistence. */
export const FLOOR_CALM = 0.22;
export const FLOOR_URGENT = 0.42;

/**
 * How many speeds the run has: calm, keen, urgent.
 *
 * `urgency` arrives as the step's own progress, which is a continuous
 * number moving on every tracker frame — thirty times a second. A run
 * whose duration was read straight off it would be cancelled and
 * restarted on every one of those frames, and a sweep restarted thirty
 * times a second never travels far enough for a single chevron to light:
 * the arrow would sit dark and motionless, which is the one thing it
 * must never do.
 *
 * So the speed is geared. The floor, the scale and the drift still ease
 * continuously off the smoothed insistence — the arrow visibly responds
 * to a stall — but the run itself changes speed at most twice in a step,
 * and each change is a gear a person can actually see.
 */
export const SWEEP_GEARS = 3;

/** How much bigger the arrow gets at full insistence, and the settling nod. */
export const INSIST_SCALE = 0.06;
export const SETTLE_SCALE = 1.08;
/** How far the group drifts along its own direction, at full insistence. */
export const DRIFT = 7;

/** Which gear this insistence runs in: 0 for calm, up to `SWEEP_GEARS - 1`. */
export function sweepGear(urgency: number): number {
  'worklet';
  return Math.round(unit(urgency) * (SWEEP_GEARS - 1));
}

/** How long one run takes at this insistence. */
export function sweepDuration(urgency: number): number {
  'worklet';
  return SWEEP_CALM_MS - (SWEEP_CALM_MS - SWEEP_URGENT_MS) * unit(urgency);
}

/** How long one run takes in a given gear — the duration the arrow uses. */
export function gearDuration(gear: number): number {
  'worklet';
  return sweepDuration(gear / (SWEEP_GEARS - 1));
}

/** What the chevrons sit at between runs at this insistence. */
export function chevronFloor(urgency: number): number {
  'worklet';
  return FLOOR_CALM + (FLOOR_URGENT - FLOOR_CALM) * unit(urgency);
}

/**
 * How lit one chevron is as the run passes through it.
 *
 * The run is a single position travelling from the tail to the tip; each
 * chevron comes up as it arrives and falls away behind it, so the eye is
 * pulled along the arrow rather than told three times over.
 */
export function chevronOpacity(
  phase: number,
  index: number,
  count: number,
  floor: number,
): number {
  'worklet';
  const span = 1 / (count + 1);
  const distance = Math.abs(phase - (index + 1) * span) / span;
  const lit = distance >= 1 ? 0 : 1 - distance;
  return floor + (1 - floor) * lit;
}

/**
 * How lit one chevron is, run or no run.
 *
 * A still arrow is not a dim arrow. With the run stopped — Reduce Motion
 * — there is no position travelling along the chevrons, so reading the
 * opacity off a phase of zero would leave all three sitting at the
 * resting floor, which is a fifth of the contrast of the arrow everyone
 * else sees, on the one element that has to read from two feet away. A
 * still arrow is drawn at full strength instead.
 */
export function chevronLit(
  still: boolean,
  phase: number,
  index: number,
  count: number,
  floor: number,
): number {
  'worklet';
  if (still) return 1;
  return chevronOpacity(phase, index, count, floor);
}

/** The degrees the group is turned through for each direction. */
export function rotationFor(direction: TurnDirection): number {
  'worklet';
  return direction === 'left' ? 180 : direction === 'down' ? 90 : 0;
}

/** How far the group has drifted along its own direction, in points. */
export function driftFor(phase: number, urgency: number): number {
  'worklet';
  return Math.sin(phase * Math.PI) * DRIFT * unit(urgency);
}

/* ---------------------------- the checklist ----------------------------- */

/** How far apart the rows arrive. */
export const CHECKLIST_STAGGER_MS = 110;

/** When a row arrives, in milliseconds after the list appears. */
export function rowDelay(index: number): number {
  'worklet';
  return index * CHECKLIST_STAGGER_MS;
}
