/**
 * The error bar. This is the file that makes the rest of it honest.
 *
 * ── The problem ───────────────────────────────────────────────────────
 * Any single photograph produces a confident-looking number. Photograph
 * the same head twice, ten seconds apart, without moving: the two
 * numbers differ. They differ because the head moved a degree, because
 * the light changed as a cloud went over, because the mask drew the
 * boundary of a soft hairline one pixel differently. None of that is a
 * change in the person. All of it looks exactly like one.
 *
 * The usual answer is to average several frames and present the average,
 * which hides the problem behind a smoother-looking number: an average
 * of four wildly disagreeing readings looks precisely as trustworthy as
 * an average of four identical ones.
 *
 * ── The answer ────────────────────────────────────────────────────────
 * A scan takes several frames of each region. Measure each one
 * separately, and keep BOTH figures: the middle of them, and how far
 * apart they were. The spread is not an inconvenience to be smoothed
 * away — it is the measurement's own error bar, taken in that light, on
 * that person, at that distance, by that phone. It is the only honest
 * answer to "how much of a difference would have to show up next month
 * before it meant anything", and it is measured rather than assumed.
 *
 * Wide spread does not mean "a bit less precise". It means WE COULD NOT
 * READ THIS RELIABLY, and the confidence below collapses accordingly, so
 * that `compare.ts` refuses to report a change rather than reporting a
 * shaky one.
 *
 * ── Why one frame is not enough ───────────────────────────────────────
 * A region seen in exactly one frame has no spread of its own. There is
 * nothing to disagree with. The tempting move is to call its spread zero
 * — which would say the reading is perfect, and would let a one-point
 * difference next month clear the noise floor and be reported as a
 * change. So a single frame is given `SINGLE_FRAME_SPREAD` instead: a
 * deliberately wide stand-in that says "this is what a region like this
 * usually varies by, and we have no measurement of our own".
 *
 * A stand-in spread is not enough on its own, and the earlier version of
 * this file learned that the hard way. Weighed against three other terms
 * that a good photograph scores well on, a single frame still came out
 * around 0.44 — over the bar `compare.ts` acts on, so the module would
 * publish a change verdict for a region it had seen once, most of whose
 * error bar was this file's guess rather than anything measured. So the
 * refusal is stated twice, in two different currencies, and both have to
 * be undone deliberately before a lone frame can be compared:
 *
 *   • `UNREPEATED_CONFIDENCE` caps what a region with fewer than
 *     `REPEATED_FRAMES` readings can ever be worth, below every bar in
 *     this module.
 *   • `compare.ts` refuses on the frame COUNT as well, so the refusal
 *     survives any later change to this arithmetic.
 *
 * Everything here is arithmetic on numbers already computed elsewhere.
 * No mask, no camera, no React. Loads under `node --test`.
 */

import { clamp01, weakerGrade, type FrameAnchorGrade, type ScanRegion } from './regions';

/* ------------------------------ the contract ----------------------------- */

/**
 * What a scan knows about one region. The number, and — just as
 * prominently — how much that number can be trusted.
 */
export type RegionMeasurement = {
  region: ScanRegion;
  /** Share of the region's pixels the mask calls hair, 0–1. Computed, never estimated. */
  coverage: number;
  /** Share of the region's pixels the mask calls skin rather than hair, 0–1. */
  visibleScalp: number;
  /** How many frames contributed a reading. */
  frames: number;
  /** The spread of coverage across those frames: THIS SCAN'S OWN ERROR BAR for this region. */
  spread: number;
  /** 0–1, from frame count, spread, frame quality and how much of the region was actually visible. */
  confidence: number;
  /**
   * The weakest anchoring among the frames that contributed: what this
   * scan's face coordinates were measured from. Two scans anchored
   * differently are not in quite the same units, and `compare.ts` has to
   * know before it subtracts one from the other.
   */
  anchoring: FrameAnchorGrade;
};

/** Everything one scan measured, and everything it could not. */
export type ScanMeasurement = {
  regions: Partial<Record<ScanRegion, RegionMeasurement>>;
  /** Regions the scan could not read well enough to report at all. */
  unread: ScanRegion[];
  capturedAt: string;
};

/* -------------------------------- constants ------------------------------ */

/**
 * The spread given to a region seen in exactly one frame.
 *
 * Not measured — it cannot be, from one reading. It stands for the
 * typical frame-to-frame disagreement of a region that WAS measured
 * several times, rounded up, so that a lone frame is never treated as
 * more precise than a properly repeated one. Eight points of coverage.
 *
 * Deliberately wide. The failure this guards against is the one that
 * matters: a scan that caught the crown once, in passing, reporting a
 * crown change next month with total confidence.
 */
export const SINGLE_FRAME_SPREAD = 0.08;

/** Fewest readings that can disagree with one another, and so the fewest that can measure a spread. */
export const REPEATED_FRAMES = 2;

/**
 * The most a region nobody repeated is allowed to be worth.
 *
 * Not a tuning knob and not a curve: a hard ceiling, below every bar in
 * this module, applied after the arithmetic. A region read once may have
 * been read in perfect light, dead centre, tack sharp — and it still has
 * no error bar of its own, so there is still nothing to be confident
 * about. What it is good for is being looked at and being described. It
 * is not good for subtraction.
 */
export const UNREPEATED_CONFIDENCE = 0.25;

/**
 * The floor under any measured spread.
 *
 * Four frames can agree exactly — especially on a region that is almost
 * entirely hair or almost entirely not, where every sample falls on the
 * same side of the threshold. A spread of zero would claim infinite
 * precision and let any difference at all clear the noise floor. One
 * point is about what the mask's own boundary wobbles by between two
 * frames of a head that did not move.
 */
export const SPREAD_FLOOR = 0.01;

/**
 * A spread at or above this means the frames did not agree at all, and
 * confidence from the spread term is zero. Twelve points: at that width
 * the readings are not measuring the same thing.
 */
export const WIDE_SPREAD = 0.12;

/** Frames at which the count stops adding confidence. Below it, confidence is docked pro rata. */
export const ENOUGH_FRAMES = 4;

/**
 * How the four terms are weighed against one another.
 *
 * They are combined as a weighted GEOMETRIC mean, not an arithmetic one,
 * for one reason: a zero in any term has to zero the whole thing. A
 * region read from six frames, in beautiful light, that every frame
 * disagreed about, is not "mostly confident". Averaging would say it
 * was.
 *
 * Count and spread carry more weight than quality and visibility because
 * they are the two this scan measured about ITSELF; the other two are
 * readings of the conditions.
 */
export const CONFIDENCE_WEIGHTS = Object.freeze({
  frames: 0.3,
  spread: 0.3,
  quality: 0.2,
  visibility: 0.2,
});

/* ------------------------------- the spread ------------------------------ */

/**
 * The spread of a set of readings: this scan's own error bar.
 *
 * The sample standard deviation — the n−1 denominator, because the mean
 * was estimated from the same handful of readings and the naive n
 * version is biased low on three or four of them, which is exactly the
 * count this runs on. Never below `SPREAD_FLOOR`. A single reading has
 * no spread of its own and gets `SINGLE_FRAME_SPREAD`; no reading at all
 * gets the same, since "nothing" is not precision either.
 */
export function spreadOf(readings: readonly number[]): number {
  const values = readings.filter((v) => Number.isFinite(v));
  if (values.length < REPEATED_FRAMES) return SINGLE_FRAME_SPREAD;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / (values.length - 1);
  return Math.max(SPREAD_FLOOR, Math.sqrt(variance));
}

/** The middle of a set of readings. Empty is 0, which callers never present on its own. */
export function meanOf(readings: readonly number[]): number {
  const values = readings.filter((v) => Number.isFinite(v));
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/* ----------------------------- the confidence ---------------------------- */

/** What confidence is built from. Every term is 0–1 and every one was computed somewhere. */
export type ConfidenceInput = {
  /** How many frames contributed a reading. */
  frames: number;
  /** The spread across them, as `spreadOf` returned it. */
  spread: number;
  /** Mean frame quality across those frames, as the scanner scored it. */
  quality: number;
  /** Mean share of the region that was in frame, on the head and facing the camera. */
  visibility: number;
};

/**
 * How much this region's number deserves to be believed, 0–1.
 *
 * Four terms, weighted-geometrically combined so that any one of them
 * collapsing collapses the answer:
 *
 *   frames      one frame is a quarter of the way there, four is full.
 *   spread      full at the floor, nothing at `WIDE_SPREAD` and beyond.
 *   quality     the scanner's own score for those frames.
 *   visibility  how much of the region was in shot, on the head and
 *               facing the lens.
 *
 * Then the ceiling: a region nobody repeated cannot come out above
 * `UNREPEATED_CONFIDENCE`, whatever the four terms said.
 *
 * Worth knowing before trusting this to catch a bad photograph: the
 * weights sum to one, so the combination is forgiving of any single
 * mediocre term. A region read four times, in poor light, over half of
 * it visible, still comes out around a half. What actually pushes a
 * repeated region under `compare.ts`'s bar is a wide spread — which is
 * the right answer, since the spread is the only term that measures this
 * scan against itself rather than describing the room. Do not read a
 * confidence over the bar as "the light was fine".
 *
 * It is not a grade and it is not a percentage of anything. It is the
 * weight `compare.ts` gives the reading when deciding whether it is
 * entitled to say anything at all.
 */
export function confidenceOf(input: ConfidenceInput): number {
  const frames = Number.isFinite(input.frames) ? Math.max(0, Math.floor(input.frames)) : 0;
  if (frames === 0) return 0;

  const terms: [number, number][] = [
    [clamp01(frames / ENOUGH_FRAMES), CONFIDENCE_WEIGHTS.frames],
    [clamp01(1 - Math.max(0, input.spread) / WIDE_SPREAD), CONFIDENCE_WEIGHTS.spread],
    [clamp01(input.quality), CONFIDENCE_WEIGHTS.quality],
    [clamp01(input.visibility), CONFIDENCE_WEIGHTS.visibility],
  ];

  let log = 0;
  let weight = 0;
  for (const [value, w] of terms) {
    if (value <= 0) return 0;
    log += w * Math.log(value);
    weight += w;
  }
  const combined = clamp01(Math.exp(log / weight));
  return frames < REPEATED_FRAMES ? Math.min(combined, UNREPEATED_CONFIDENCE) : combined;
}

/* ------------------------------ the gathering ---------------------------- */

/**
 * One frame's reading of one region, reduced to what this file needs.
 * `coverage.ts`'s richer `RegionReading`, plus the grade of the frame it
 * was read from, is one of these.
 */
export type FrameReading = {
  coverage: number;
  visibleScalp: number;
  quality: number;
  visibility: number;
  anchoring: FrameAnchorGrade;
};

/**
 * One region's measurement, gathered from every frame that could read
 * it, or null when none could.
 *
 * Null rather than a zero row: a region nothing read is a region nothing
 * read, and `ScanMeasurement.unread` is where it belongs. A measurement
 * row with `coverage: 0` would be a claim that there is no hair there.
 *
 * The anchoring carried out is the WEAKEST of the frames that
 * contributed, not the best and not the commonest. A measurement is in
 * the units of its shakiest ingredient.
 */
export function measureRegion(
  region: ScanRegion,
  readings: readonly FrameReading[],
): RegionMeasurement | null {
  const usable = readings.filter(
    (r) => Number.isFinite(r.coverage) && Number.isFinite(r.visibleScalp),
  );
  if (usable.length === 0) return null;

  const coverages = usable.map((r) => r.coverage);
  const spread = spreadOf(coverages);
  const quality = meanOf(usable.map((r) => r.quality));
  const visibility = meanOf(usable.map((r) => r.visibility));
  const anchoring = usable.reduce<FrameAnchorGrade>(
    (worst, r) => weakerGrade(worst, r.anchoring),
    'landmarks',
  );

  return {
    region,
    coverage: clamp01(meanOf(coverages)),
    visibleScalp: clamp01(meanOf(usable.map((r) => r.visibleScalp))),
    frames: usable.length,
    spread,
    confidence: confidenceOf({ frames: usable.length, spread, quality, visibility }),
    anchoring,
  };
}
