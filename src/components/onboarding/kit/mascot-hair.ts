/**
 * Tress's hair, as numbers.
 *
 * The strands, the pure worklet that turns them into one SVG path for a
 * given breath, the ears the swept ends tuck behind, and the timing of
 * the pout-and-blow cycle, kept apart from the drawing so a test can
 * run them in Node and check what they produce: that every strand lies
 * on the head at rest, that the strands of a side stay closer together
 * than the line they are drawn with, that the fringe pieces fall over
 * the brow and turn outward without closing on themselves, that the
 * side sweeps pass outside the eyes on their way down, that the ends
 * lowest on the head finish inside the ear, that a blow moves every
 * tip far enough to be seen at the sizes the orb is drawn, and that
 * the lips and the hair keep the same cycle.
 *
 * The head is a sphere of radius 45 on a 100-unit square, centred at
 * (50, 50). The cut is centre-parted and swept back. The parting is a
 * short seam at the crown, from (48, 6.8) at the back of it to
 * (48, 17.8) at the front, and every strand roots along that seam, as
 * hair either side of a parting does. Six strands a side sweep from
 * the seam out over the temple and down the side of the head. They are
 * one family: the back one bows out to the crown's edge, the front one
 * cuts across the temple as the hairline, and the four between them
 * are read off the line from one to the other, so the six run parallel
 * between 1.7 and 2.4 units apart — inside the stroke of 2.8 they are
 * drawn with, which is why they close into one mass of hair instead of
 * standing apart as separate wires. Their ends spread about eleven
 * units, from (12.6, 43.6) at the back to (21.1, 36.6) at the temple,
 * so the mass ends in an edge rather than a point; the two lowest of
 * them finish inside the ear, and the rest end in front of it, where
 * hair in front of an ear does.
 *
 * Two fringe pieces root just in front of the seam, one each side of
 * it. Each is drawn with two strands about two units apart — its back
 * edge and its front edge — so a piece has width and reads as a lock
 * rather than as a wire. They fall across the brow, turning outward as
 * they go, and end above the outer corner of each eye with a small
 * flick up: 0.63 of a unit on the back edge and 0.98 on the front,
 * against a stroke of 2.8, so the end lifts without turning back on
 * itself. Their x runs outward the whole way, so nothing encircles a
 * patch of bare brow.
 *
 * The ears are their own shape, not part of the hair: a filled lobe a
 * side with a fold inside it, drawn after the hair and outlined more
 * lightly than it, so the swept ends finish under an ear rather than
 * beside it. They never move — an ear does not lift in a breath.
 *
 * Nothing here imports the renderer, so this file has no theme: colour
 * is chosen where the paths are drawn.
 */

/* ------------------------------- geometry ------------------------------ */

/** The square the orb is drawn on, and the sphere inside it. */
export const HAIR_VB = 100;
export const HAIR_CENTRE = HAIR_VB / 2;
export const HAIR_SPHERE_R = 45;

/** A cap strand: a quadratic from its root through one control point. */
const CAP = 0;
/** One strand of a fringe piece: a cubic down the brow, then a quadratic turn outward. */
const LOCK = 1;

/**
 * Each strand is a flat row so the worklet can walk it without
 * allocating: kind, root x, root y, the points that move about the
 * root, and last the bend — how far, in radians, the tip turns about
 * the root at full sway. Left strands carry a positive bend and right
 * strands a negative one, so a breath from below lifts both sides up
 * and outward. The fringe pieces carry the largest bend and the back of
 * the sweep the smallest, so a breath moves the front of the cut most,
 * as loose hair does; across the sweep the bend grows as the strand
 * comes forward. What the eye sees is the tip's travel, which is length
 * times angle, so the numbers are read against the travel rather than
 * the angle.
 */
export const STRANDS: readonly (readonly number[])[] = [
  // the left sweep: six arcs rooted down the parting seam, out over the
  // temple and down the side, back of the cut first
  [CAP, 48.0, 6.8, 20, 11, 12.6, 43.6, 0.1],
  [CAP, 48.0, 9, 22, 13.8, 14.3, 42.2, 0.11],
  [CAP, 48.0, 11.2, 24, 16.6, 16, 40.8, 0.12],
  [CAP, 48.0, 13.4, 26, 19.4, 17.7, 39.4, 0.13],
  [CAP, 48.0, 15.6, 28, 22.2, 19.4, 38, 0.14],
  [CAP, 48.0, 17.8, 30, 25, 21.1, 36.6, 0.15],
  // the right sweep, the mirror
  [CAP, 52.0, 6.8, 80, 11, 87.4, 43.6, -0.1],
  [CAP, 52.0, 9, 78, 13.8, 85.7, 42.2, -0.11],
  [CAP, 52.0, 11.2, 76, 16.6, 84, 40.8, -0.12],
  [CAP, 52.0, 13.4, 74, 19.4, 82.3, 39.4, -0.13],
  [CAP, 52.0, 15.6, 72, 22.2, 80.6, 38, -0.14],
  [CAP, 52.0, 17.8, 70, 25, 78.9, 36.6, -0.15],
  // the two fringe pieces. Each is drawn with two strands, its back edge
  // and its front edge, about two units apart, so a piece reads as a lock
  // with width rather than as a wire: from the seam they fall across the
  // brow, outward the whole way, and end above the outer corner of an eye
  [LOCK, 48.2, 18.6, 48.2, 24.4, 47.4, 30.4, 43.8, 32.6, 40.2, 33.2, 36.2, 32.2, 0.28],
  [LOCK, 48.2, 20.8, 48.2, 26.6, 46.6, 32, 42.2, 34.9, 38.4, 35.5, 34.6, 34.1, 0.32],
  [LOCK, 51.8, 18.6, 51.8, 24.4, 52.6, 30.4, 56.2, 32.6, 59.8, 33.2, 63.8, 32.2, -0.28],
  [LOCK, 51.8, 20.8, 51.8, 26.6, 53.4, 32, 57.8, 34.9, 61.6, 35.5, 65.4, 34.1, -0.32],
];

/**
 * The first of the two strands that draw the left fringe piece; the
 * second is the row after it. Both lift in thought — a piece of hair
 * does not split down the middle when it moves.
 */
export const LEFT_LOCK = 12;

/** How far the thinking lock lifts, in radians about its root. */
export const LIFT_RAD = 0.3;

/**
 * The ears: one a side, each a closed lobe with a fold inside it. They
 * are not strands and are not part of the hair path — they are drawn
 * after it, filled with the orb's own tone, so the swept ends finish
 * under the ear's outline rather than beside it. Being a shape rather
 * than a line, and carrying a lighter stroke than the hair, an ear
 * reads as an ear and not as one more lock. They never move.
 */
export const EARS =
  'M18.6 41C12.8 40.6 10 45.2 11.6 49.2C12.8 52.2 17 53 19 50.6C20.2 49 19.6 43 18.6 41Z' +
  'M16.4 44.4C14.6 45.4 14.4 48 15.8 49.2' +
  'M81.4 41C87.2 40.6 90 45.2 88.4 49.2C87.2 52.2 83 53 81 50.6C79.8 49 80.4 43 81.4 41Z' +
  'M83.6 44.4C85.4 45.4 85.6 48 84.2 49.2';

/** The line an ear is drawn with: lighter than the hair, so it is not hair. */
export const EAR_STROKE = 1.4;

/**
 * A strand bends rather than swings: each point along it turns by a
 * share of the tip's angle, the root's neighbour least and the tip
 * most, so the hair curves in the breath instead of pivoting like a
 * hand on a clock. One share per moving point, by kind.
 */
const CAP_SHARES = [0.5, 1];
const LOCK_SHARES = [0.25, 0.55, 0.85, 1, 1];

/** The stroke the strands are drawn with, in viewBox units. */
export const HAIR_STROKE = 2.8;
export const HAIR_SHEEN = 1.0;

/* ------------------------------ hair paths ------------------------------ */

/** A number to one decimal, as SVG reads it. */
export function num(v: number): string {
  'worklet';
  return (Math.round(v * 10) / 10).toString();
}

/** One point of a strand, turned about the strand's root, as "x y". */
export function turned(x: number, y: number, ox: number, oy: number, angle: number): string {
  'worklet';
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = x - ox;
  const dy = y - oy;
  return num(ox + dx * c - dy * s) + ' ' + num(oy + dx * s + dy * c);
}

/** The same point as numbers, for the tests to measure. */
export function turnedPoint(x: number, y: number, ox: number, oy: number, angle: number): { x: number; y: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = x - ox;
  const dy = y - oy;
  return { x: ox + dx * c - dy * s, y: oy + dx * s + dy * c };
}

/**
 * The angle the tip of strand `i` turns through for a given sway (0 at
 * rest, 1 at the top of a blow, briefly below 0 on the spring back)
 * and lift (0 to 1, the thinking lock only).
 */
export function tipAngle(i: number, sway: number, lift: number): number {
  'worklet';
  const s = STRANDS[i];
  const lifts = i === LEFT_LOCK || i === LEFT_LOCK + 1;
  return sway * s[s.length - 1] + (lifts ? lift * LIFT_RAD : 0);
}

/**
 * Every strand of the hair as one path string — the hair only; the
 * ears are a fixed shape of their own, drawn over it. Pure, so it runs
 * on the UI thread inside a derived value, on the JS thread once under
 * Reduce Motion, and in Node under test.
 */
export function hairPaths(sway: number, lift: number): string {
  'worklet';
  let d = '';
  for (let i = 0; i < STRANDS.length; i += 1) {
    const s = STRANDS[i];
    const ox = s[1];
    const oy = s[2];
    const angle = tipAngle(i, sway, lift);
    d += 'M' + num(ox) + ' ' + num(oy);
    if (s[0] === CAP) {
      d +=
        'Q' +
        turned(s[3], s[4], ox, oy, angle * CAP_SHARES[0]) +
        ' ' +
        turned(s[5], s[6], ox, oy, angle * CAP_SHARES[1]);
    } else {
      d +=
        'C' +
        turned(s[3], s[4], ox, oy, angle * LOCK_SHARES[0]) +
        ' ' +
        turned(s[5], s[6], ox, oy, angle * LOCK_SHARES[1]) +
        ' ' +
        turned(s[7], s[8], ox, oy, angle * LOCK_SHARES[2]) +
        'Q' +
        turned(s[9], s[10], ox, oy, angle * LOCK_SHARES[3]) +
        ' ' +
        turned(s[11], s[12], ox, oy, angle * LOCK_SHARES[4]);
    }
  }
  return d;
}

/** Where the tip of strand `i` is, as numbers, for a given sway and lift. */
export function strandTip(i: number, sway: number, lift: number): { x: number; y: number } {
  const s = STRANDS[i];
  const n = s.length;
  return turnedPoint(s[n - 3], s[n - 2], s[1], s[2], tipAngle(i, sway, lift));
}

/* ------------------------------ the blow -------------------------------- */

/** The pout gathers, the blow bends the hair, the lips relax. */
export const POUT_MS = 350;
export const BLOW_MS = 700;
export const RELAX_MS = 220;
/** The rest between blows is drawn once per mount from this range. */
export const REST_MIN_MS = 2400;
export const REST_RANGE_MS = 1600;

export type Ease = 'linear' | 'outQuad' | 'inOutQuad' | 'springBack';

/** One step of a cycle: reach `to` over `ms`. A step to the current value is a hold. */
export type Keyframe = { to: number; ms: number; ease: Ease };

/**
 * One pout-and-blow cycle for the two values that make it: `pout`
 * crosses the resting mouth over to the pursed one, `sway` bends the
 * hair. Built from one function so the two can never drift apart: the
 * hair starts to move at the instant the lips finish pursing, and both
 * come back to rest at the same moment.
 */
export function blowCycle(restMs: number): { pout: Keyframe[]; sway: Keyframe[] } {
  return {
    pout: [
      { to: 0, ms: restMs, ease: 'linear' },
      { to: 1, ms: POUT_MS, ease: 'outQuad' },
      { to: 1, ms: BLOW_MS, ease: 'linear' },
      { to: 0, ms: RELAX_MS, ease: 'inOutQuad' },
    ],
    sway: [
      { to: 0, ms: restMs + POUT_MS, ease: 'linear' },
      { to: 1, ms: BLOW_MS / 2, ease: 'outQuad' },
      // The spring back: an overshoot below rest, then settle.
      { to: 0, ms: BLOW_MS / 2, ease: 'springBack' },
      { to: 0, ms: RELAX_MS, ease: 'linear' },
    ],
  };
}

/** The whole cycle's length. */
export function cycleMs(frames: readonly Keyframe[]): number {
  let total = 0;
  for (const f of frames) total += f.ms;
  return total;
}
