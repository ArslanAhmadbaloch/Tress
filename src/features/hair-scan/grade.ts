/**
 * One measurement, one score. The narrowest file in the feature, and the
 * only place a share between 0 and 1 is allowed to become a figure out
 * of a hundred.
 *
 * ── What the score IS ─────────────────────────────────────────────────
 * `Visual Coverage` is the share of a region's counted samples that an
 * on-device segmentation mask called hair, multiplied by a hundred and
 * rounded. That is the whole definition. A region that read 0.62 scores
 * 62, and the 62 means "62% of what we could see of this place looked
 * like hair to the mask", in that light, at that distance, on that
 * phone.
 *
 * ── What the score IS NOT ─────────────────────────────────────────────
 * It is not hair density. It is not a follicle count, a hair count, a
 * shaft diameter, a grade, a rank or a forecast. A mask that cannot see
 * between two strands cannot count them, and a camera at arm's length
 * cannot measure a shaft. Area in an image and hair per square
 * centimetre are different quantities that move together only loosely:
 * a person can change parting, styling or product and move this figure
 * without a single hair having changed.
 *
 * So no caller may present or word the score as any of those things.
 * The name is `Visual Coverage` everywhere it is shown, the honesty
 * sweeps in scripts/test enforce the vocabulary, and this comment is the
 * reason the rule exists rather than a decoration on it.
 *
 * ── Confidence is carried, never invented ─────────────────────────────
 * The confidence beside a score is the engine's own, passed straight
 * through. This file does not compute, smooth, or floor it — it is what
 * `measure/noise.ts` measured from the frame count, the spread between
 * frames, the frame quality and how much of the region was visible, and
 * changing it here would be this file second-guessing the only part of
 * the stack that actually looked at the pixels.
 *
 * ── Refusal ───────────────────────────────────────────────────────────
 * A region the engine refused has no grade: `null`, never zero. Zero is
 * a reading — "we looked and saw no hair" — and it is the single most
 * damaging thing this app could print about somebody it did not manage
 * to photograph.
 *
 * Pure arithmetic: no React, nothing native, no I/O. Loads under
 * `node --test` with the project loader.
 */

import type { RegionMeasurement } from './measure';

/**
 * A score out of a hundred and how much it deserves to be believed.
 *
 * `score` is `Visual Coverage`, 0–100, whole. `confidence` is 0–1,
 * carried unaltered from the measurement. The two always travel
 * together: a score shown without its confidence is a claim this app
 * does not make.
 */
export type Grade = { score: number; confidence: number };

/** The top of the scale. Stated once so nothing else writes `100` and means this. */
export const COVERAGE_SCORE_MAX = 100;

/**
 * How much confidence a reading needs before the report will set it
 * beside another reading in a sentence.
 *
 * Not a bar on showing a figure — every measured region is shown, with
 * its confidence next to it. It is a bar on COMPARING two of them in
 * prose, because a sentence that says one place reads higher than
 * another is a claim about both, and the weaker of the two decides what
 * it is worth. It sits at the same place as the comparison engine's own
 * `MIN_CONFIDENCE`, deliberately: prose and arithmetic refuse together.
 */
export const COMPARABLE_CONFIDENCE = 0.4;

/** How the confidence beside a score is described in words. */
export type ConfidenceBand = 'high' | 'moderate' | 'low';

/** Where one band becomes the next. Stated, not measured: they are words for a number, and the number is always shown too. */
export const CONFIDENCE_BANDS = Object.freeze({ high: 0.7, moderate: 0.45 });

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * The score for one region, or null when there is nothing to score.
 *
 * Null for an absent measurement and for one whose coverage is not a
 * finite number — both mean the engine did not read this place, and
 * both must reach the screen as an absence rather than a figure.
 */
export function gradeOf(measurement: RegionMeasurement | null | undefined): Grade | null {
  if (!measurement) return null;
  if (!Number.isFinite(measurement.coverage)) return null;
  const confidence = Number.isFinite(measurement.confidence) ? clamp01(measurement.confidence) : 0;
  return {
    score: Math.round(clamp01(measurement.coverage) * COVERAGE_SCORE_MAX),
    confidence,
  };
}

/**
 * The share of a region that read as scalp rather than hair, out of a
 * hundred, or null when the region was not read.
 *
 * The engine's `visibleScalp` is its own count — the samples the mask
 * called skin — and not `100 − coverage`. The remainder of a coverage
 * figure includes background, clothing and everything the mask was less
 * than half sure about, and printing it as scalp would be inventing a
 * finding out of an arithmetic identity.
 */
export function visibleScalpPointsOf(measurement: RegionMeasurement | null | undefined): number | null {
  if (!measurement) return null;
  if (!Number.isFinite(measurement.visibleScalp)) return null;
  return Math.round(clamp01(measurement.visibleScalp) * COVERAGE_SCORE_MAX);
}

/**
 * One figure for the whole scan: the regional scores averaged, each
 * weighted by its own confidence.
 *
 * Weighting by confidence is the point. A scan that read the hairline
 * across four steady frames and caught the part line once, badly,
 * should read mostly as its hairline — a plain mean would let the worst
 * reading in the scan move the headline figure as much as the best one.
 *
 * The overall confidence is the plain mean of the contributing
 * confidences, NOT the weighted one. A weighted confidence would be
 * pulled upwards by the very regions it weighted up, and would end up
 * saying the scan was surer of itself than any single reading in it.
 *
 * Null when nothing was read, and null when everything read has zero
 * confidence: an average of readings worth nothing is worth nothing.
 */
export function overallGrade(
  measurements: readonly (RegionMeasurement | null | undefined)[],
): Grade | null {
  const graded = measurements
    .map((m) => ({ grade: gradeOf(m), confidence: gradeOf(m)?.confidence ?? 0 }))
    .filter((g): g is { grade: Grade; confidence: number } => g.grade !== null);
  if (graded.length === 0) return null;
  const weight = graded.reduce((sum, g) => sum + g.confidence, 0);
  if (!(weight > 0)) return null;
  const score = graded.reduce((sum, g) => sum + g.grade.score * g.confidence, 0) / weight;
  const confidence = graded.reduce((sum, g) => sum + g.confidence, 0) / graded.length;
  return { score: Math.round(score), confidence: clamp01(confidence) };
}

/** The word for a confidence figure. The figure itself is always shown beside the word. */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (!Number.isFinite(confidence)) return 'low';
  if (confidence >= CONFIDENCE_BANDS.high) return 'high';
  if (confidence >= CONFIDENCE_BANDS.moderate) return 'moderate';
  return 'low';
}

/** Confidence as whole percent, for showing beside a score. */
export function confidencePercent(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.round(clamp01(confidence) * 100);
}

/** Whether two readings are sure enough of themselves to be set side by side in a sentence. */
export function comparable(a: Grade | null, b: Grade | null): boolean {
  if (!a || !b) return false;
  return a.confidence >= COMPARABLE_CONFIDENCE && b.confidence >= COMPARABLE_CONFIDENCE;
}
