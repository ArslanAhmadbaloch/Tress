/**
 * Two scans, months apart. The only place in this module where the word
 * "change" is allowed, and the place most of the work goes into refusing
 * to say it.
 *
 * ── The rule ──────────────────────────────────────────────────────────
 * A difference is reported only when it is larger than the two scans'
 * own disagreement with themselves. Nothing else. Not a percentage
 * somebody picked, not a threshold tuned until the screen looked
 * interesting — the noise floor is built out of `spread`, which each
 * scan measured on itself, in its own light, on this person's head.
 *
 *   noiseFloor = NOISE_MULTIPLE × √(nowSpread² + beforeSpread² + allowance²)
 *
 * The square root of the sum of squares is how independent errors
 * combine: subtract two readings and their uncertainties add in
 * quadrature, not linearly. That part is arithmetic, not taste.
 *
 * `NOISE_MULTIPLE` is the taste, and it is 2. Two reasons, both worth
 * stating rather than hiding in a constant:
 *
 *   • For readings scattered anything like normally, twice the combined
 *     spread is roughly the band a difference falls inside about
 *     nineteen times in twenty by chance alone. Below it, "unchanged" is
 *     the honest answer; above it, chance is an unlikely explanation.
 *   • The spreads themselves are estimated from three or four frames, so
 *     they are noisy estimates of noise. A multiple of 1 would report
 *     changes on the strength of an underestimated error bar. 2 is the
 *     smallest multiple that survives that.
 *
 * `allowance` is the one term in the floor that nobody measured: it is
 * there when the two scans were not anchored to the same landmarks, and
 * `ANCHOR_ALLOWANCE` says what it is and why it is a guess.
 *
 * Erring towards "unchanged" is the deliberate direction. A person
 * tracking their hair reads any reported change as real and acts on it.
 * A missed small change costs them a month; a reported change that never
 * happened costs them their trust in every number this app will ever
 * show them.
 *
 * ── The classes ───────────────────────────────────────────────────────
 * `small`, `moderate` and `large` are measured against the noise floor,
 * never against a fixed percentage. "Twice the noise floor" means the
 * same thing on a well-lit scan of a well-anchored region as it does on
 * a marginal one — the floor moves, so the classes move with it. A fixed
 * "5 points is moderate" would mean something different every time.
 *
 * ── Insufficient ──────────────────────────────────────────────────────
 * The verdict is `insufficient`, and the delta carried with it is 0 — a
 * placeholder, not a measurement — when any of these is true:
 *
 *   • either side is missing the region entirely;
 *   • either side read it in fewer than `MIN_FRAMES` frames, so one of
 *     the two error bars is this module's stand-in rather than anything
 *     that scan measured;
 *   • either side's confidence is below `MIN_CONFIDENCE`.
 *
 * Nothing may render the delta of an `insufficient` row. There is no
 * number to show, because the honest answer is a sentence: this scan did
 * not read that region well enough to compare it.
 *
 * Pure arithmetic. No React, nothing native. Loads under `node --test`.
 */

import { REPEATED_FRAMES, type RegionMeasurement, type ScanMeasurement } from './noise';
import { SCAN_REGIONS, clamp01, type FrameAnchorGrade, type ScanRegion } from './regions';

/** What a comparison is allowed to say. */
export type ChangeVerdict = 'unchanged' | 'small' | 'moderate' | 'large' | 'insufficient';

/** Whether the two scans were anchored to the same landmarks, and so measured in the same units. */
export type ChangeAnchoring = 'same' | 'mixed';

export type RegionChange = {
  region: ScanRegion;
  /** `now.coverage − before.coverage`. Zero and meaningless when the verdict is `insufficient`. */
  delta: number;
  /** The combined error bar of the two scans: what `delta` had to beat. */
  noiseFloor: number;
  verdict: ChangeVerdict;
  /** The weaker of the two readings' confidence: a comparison is only as good as its worse half. */
  confidence: number;
  /** `mixed` when the two scans were anchored differently, and the floor was widened for it. */
  anchoring: ChangeAnchoring;
};

/**
 * How many combined error bars a difference must clear before it is
 * reported at all. See the note above for why it is 2.
 */
export const NOISE_MULTIPLE = 2;

/**
 * Fewest frames either side may have read the region in.
 *
 * The same figure `noise.ts` calls `REPEATED_FRAMES`, and it is stated
 * here as a rule of its own rather than left to the confidence
 * arithmetic. A region caught once, in passing, is not compared: its
 * error bar is `SINGLE_FRAME_SPREAD`, a constant this module wrote down,
 * and a verdict built on it would be a verdict about a constant.
 *
 * This is the refusal that has to be impossible to lose by accident, so
 * it is enforced twice — here on the count, which no later tuning can
 * soften, and in `noise.ts` on the confidence.
 */
export const MIN_FRAMES = REPEATED_FRAMES;

/**
 * Below this confidence on either side, no comparison is made.
 *
 * It sits above `UNREPEATED_CONFIDENCE`, so a region with no measured
 * error bar of its own cannot reach it however good the photograph was.
 * (Before the ceiling existed, a single well-lit frame scored about 0.44
 * and sailed over this bar — the comment here said otherwise, and the
 * comment was wrong. Both halves are now tested end to end, from a real
 * one-frame reading through to the verdict.)
 */
export const MIN_CONFIDENCE = 0.4;

/**
 * The extra error allowed when the two scans were not anchored the same
 * way, in coverage points.
 *
 * This is a stated allowance, not a measurement, and it is the only such
 * term in the floor. Its job: a scan whose frame was built on the eye
 * corners and the chin is in slightly different units from one built on
 * a detector's face box — the two detectors do not even agree where a
 * face box starts — so a difference between them carries an error that
 * neither scan could measure about itself. Three points is chosen to be
 * of the same order as the frame-to-frame spread of a decent scan, so
 * that a mixed pair must clear a visibly higher bar than a like-for-like
 * one; it is on this build's deviceOnly list precisely because nobody
 * has yet measured what it should be.
 *
 * Two scans anchored the SAME weak way get half of it: whatever the
 * anchoring costs, it costs both sides alike, and a shared error largely
 * cancels in a subtraction.
 */
export const ANCHOR_ALLOWANCE = 0.03;

/** Multiples of the noise floor at which one class becomes the next. */
export const CLASS_BOUNDARIES = Object.freeze({ moderate: 2, large: 4 });

/** How much the two anchorings add to the floor, and whether they matched. */
export function anchorAllowanceOf(
  now: FrameAnchorGrade,
  before: FrameAnchorGrade,
): { allowance: number; anchoring: ChangeAnchoring } {
  if (now !== before) return { allowance: ANCHOR_ALLOWANCE, anchoring: 'mixed' };
  if (now === 'landmarks') return { allowance: 0, anchoring: 'same' };
  return { allowance: ANCHOR_ALLOWANCE / 2, anchoring: 'same' };
}

/** The combined error bar of two readings, in quadrature, times the multiple. */
export function noiseFloorOf(nowSpread: number, beforeSpread: number, allowance?: number): number {
  const a = Number.isFinite(nowSpread) ? Math.abs(nowSpread) : 0;
  const b = Number.isFinite(beforeSpread) ? Math.abs(beforeSpread) : 0;
  const c = allowance !== undefined && Number.isFinite(allowance) ? Math.abs(allowance) : 0;
  return NOISE_MULTIPLE * Math.hypot(a, b, c);
}

/** Which class a difference falls in, given how many noise floors it cleared. */
function classify(ratio: number): ChangeVerdict {
  if (!(ratio >= 1)) return 'unchanged';
  if (ratio < CLASS_BOUNDARIES.moderate) return 'small';
  if (ratio < CLASS_BOUNDARIES.large) return 'moderate';
  return 'large';
}

/** One region compared, or an `insufficient` row when it cannot be. */
function compareRegion(
  region: ScanRegion,
  now: RegionMeasurement | undefined,
  before: RegionMeasurement | undefined,
): RegionChange {
  if (!now || !before) {
    return { region, delta: 0, noiseFloor: 0, verdict: 'insufficient', confidence: 0, anchoring: 'same' };
  }

  const { allowance, anchoring } = anchorAllowanceOf(now.anchoring, before.anchoring);
  const noiseFloor = noiseFloorOf(now.spread, before.spread, allowance);
  const confidence = clamp01(Math.min(now.confidence, before.confidence));
  const repeated = now.frames >= MIN_FRAMES && before.frames >= MIN_FRAMES;
  /*
    A coverage that is not a number cannot be subtracted honestly.

    `measureRegion` guards its own output, so this never fires on a
    measurement this engine has just computed — but `before` is whatever
    the caller hands over, and in a later phase that is a blob read back
    from disk. Without this the difference is NaN, the ratio is NaN, and
    `classify`'s `!(ratio >= 1)` takes the `unchanged` branch: a
    definite-sounding verdict carrying a number nothing computed. Refusal
    is what every other unusable input in this module gets.
  */
  const readable = Number.isFinite(now.coverage) && Number.isFinite(before.coverage);

  if (!readable || !repeated || !(confidence >= MIN_CONFIDENCE)) {
    return { region, delta: 0, noiseFloor, verdict: 'insufficient', confidence, anchoring };
  }

  const delta = now.coverage - before.coverage;
  /*
    A zero floor cannot happen — `SPREAD_FLOOR` keeps every spread above
    zero — but a guard costs nothing and the alternative is a division
    that returns Infinity and classifies every difference as `large`.
  */
  const ratio = noiseFloor > 0 ? Math.abs(delta) / noiseFloor : 0;

  return { region, delta, noiseFloor, verdict: classify(ratio), confidence, anchoring };
}

/**
 * Two scans, region by region, in the canonical region order.
 *
 * Every region either scan knows anything about gets a row — including
 * the ones it knows only that it could not read, which come back as
 * `insufficient`. A region neither scan mentions at all is left out
 * entirely: there is nothing to say about a place nobody has ever
 * photographed.
 */
export function compareScans(now: ScanMeasurement, before: ScanMeasurement): RegionChange[] {
  const mentioned = new Set<ScanRegion>([
    ...(Object.keys(now.regions) as ScanRegion[]),
    ...(Object.keys(before.regions) as ScanRegion[]),
    ...now.unread,
    ...before.unread,
  ]);
  return SCAN_REGIONS.filter((region) => mentioned.has(region)).map((region) =>
    compareRegion(region, now.regions[region], before.regions[region]),
  );
}
