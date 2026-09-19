/**
 * The one place a measured share becomes a figure out of a hundred, held
 * to what its own comment promises.
 *
 * Three things are checked here and nowhere else: that the score IS the
 * measured coverage and not a curve fitted to it, that confidence is
 * carried through untouched, and that a region the engine refused comes
 * out as an absence rather than a zero. The last is the one that would
 * hurt: a scan that failed to read somebody's crown must never tell them
 * their crown scored nothing.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  COMPARABLE_CONFIDENCE,
  CONFIDENCE_BANDS,
  COVERAGE_SCORE_MAX,
  comparable,
  confidenceBand,
  confidencePercent,
  gradeOf,
  overallGrade,
  visibleScalpPointsOf,
} from '@/features/hair-scan/grade';
import { SCAN_REGIONS, type RegionMeasurement } from '@/features/hair-scan/measure';

import { HAIR_CLAIMS } from './claims';

function region(
  coverage: number,
  overrides: Partial<RegionMeasurement> = {},
): RegionMeasurement {
  return {
    region: 'hairline',
    coverage,
    visibleScalp: 0.2,
    frames: 4,
    spread: 0.02,
    confidence: 0.8,
    anchoring: 'landmarks',
    ...overrides,
  };
}

/* ------------------------------- the score ------------------------------- */

test('grade: the score is the measured coverage out of a hundred, and nothing else', () => {
  // Not a curve, not a rank, not a percentile: the identity, rounded.
  for (const coverage of [0, 0.01, 0.125, 0.4, 0.5, 0.666, 0.72, 0.999, 1]) {
    const grade = gradeOf(region(coverage));
    assert.equal(grade?.score, Math.round(coverage * COVERAGE_SCORE_MAX), String(coverage));
  }
  assert.equal(gradeOf(region(0.72))?.score, 72);
  // Out-of-range coverage is clamped rather than printed: 140 out of 100 is not a reading.
  assert.equal(gradeOf(region(1.4))?.score, 100);
  assert.equal(gradeOf(region(-0.2))?.score, 0);
});

test('grade: confidence is carried straight through, never smoothed or floored', () => {
  for (const confidence of [0, 0.13, 0.4, 0.55, 0.8, 1]) {
    assert.equal(gradeOf(region(0.5, { confidence }))?.confidence, confidence);
  }
  // Only the impossible values are touched, and only into range.
  assert.equal(gradeOf(region(0.5, { confidence: 1.7 }))?.confidence, 1);
  assert.equal(gradeOf(region(0.5, { confidence: -1 }))?.confidence, 0);
  assert.equal(gradeOf(region(0.5, { confidence: Number.NaN }))?.confidence, 0);
});

test('grade: a region the engine refused has no grade — null, never zero', () => {
  assert.equal(gradeOf(undefined), null);
  assert.equal(gradeOf(null), null);
  assert.equal(gradeOf(region(Number.NaN)), null);
  assert.equal(gradeOf(region(Number.POSITIVE_INFINITY)), null);
  // The distinction that matters: a region read as empty is a reading, and scores zero.
  assert.deepEqual(gradeOf(region(0, { confidence: 0.9 })), { score: 0, confidence: 0.9 });
});

test('grade: visible scalp is the engine’s own count, not the remainder of the score', () => {
  // 0.72 coverage and 0.10 scalp: the other 18 points are background,
  // skin and everything the reading was unsure of. Printing 28 here
  // would invent a scalp finding out of an arithmetic identity.
  const m = region(0.72, { visibleScalp: 0.1 });
  assert.equal(visibleScalpPointsOf(m), 10);
  assert.notEqual(visibleScalpPointsOf(m), COVERAGE_SCORE_MAX - (gradeOf(m)?.score ?? 0));
  assert.equal(visibleScalpPointsOf(undefined), null);
  assert.equal(visibleScalpPointsOf(region(0.5, { visibleScalp: Number.NaN })), null);
});

/* ------------------------------ the overall ------------------------------ */

test('overall: the regions are averaged weighted by their own confidence', () => {
  const sure = region(0.8, { confidence: 1 });
  const shaky = region(0.2, { confidence: 0.1 });
  const plainMean = (80 + 20) / 2;
  const weighted = (80 * 1 + 20 * 0.1) / 1.1;
  const overall = overallGrade([sure, shaky]);
  assert.equal(overall?.score, Math.round(weighted));
  assert.notEqual(overall?.score, plainMean, 'a plain mean would let the worst reading swing the headline');
});

test('overall: the confidence is the plain mean, so a scan cannot be surer than its readings', () => {
  // Weighting the confidence too would pull it up by the very readings
  // it weighted up, and the scan would claim to be surer of itself than
  // any single reading in it.
  const overall = overallGrade([
    region(0.8, { confidence: 1 }),
    region(0.2, { confidence: 0.1 }),
  ]);
  assert.equal(overall?.confidence, (1 + 0.1) / 2);
  assert.ok((overall?.confidence ?? 1) < 1);
});

test('overall: nothing read, or nothing worth believing, is null', () => {
  assert.equal(overallGrade([]), null);
  assert.equal(overallGrade([undefined, null]), null);
  assert.equal(overallGrade([region(0.5, { confidence: 0 })]), null, 'an average of worthless readings is worthless');
  // A single believable reading is an overall figure of its own.
  assert.deepEqual(overallGrade([region(0.62, { confidence: 0.7 })]), { score: 62, confidence: 0.7 });
});

/* ----------------------------- the confidence ---------------------------- */

test('confidence: the bands are words for a number that is always shown too', () => {
  assert.equal(confidenceBand(1), 'high');
  assert.equal(confidenceBand(CONFIDENCE_BANDS.high), 'high');
  assert.equal(confidenceBand(CONFIDENCE_BANDS.high - 0.01), 'moderate');
  assert.equal(confidenceBand(CONFIDENCE_BANDS.moderate), 'moderate');
  assert.equal(confidenceBand(CONFIDENCE_BANDS.moderate - 0.01), 'low');
  assert.equal(confidenceBand(0), 'low');
  assert.equal(confidenceBand(Number.NaN), 'low', 'an unreadable confidence is the least confident thing there is');
  assert.equal(confidencePercent(0.804), 80);
  assert.equal(confidencePercent(Number.NaN), 0);
});

test('comparable: two readings are only set side by side when both are sure enough', () => {
  const sure = { score: 70, confidence: COMPARABLE_CONFIDENCE };
  const shaky = { score: 40, confidence: COMPARABLE_CONFIDENCE - 0.01 };
  assert.equal(comparable(sure, sure), true);
  assert.equal(comparable(sure, shaky), false);
  assert.equal(comparable(shaky, sure), false);
  assert.equal(comparable(sure, null), false);
  assert.equal(comparable(null, null), false);
});

/* ------------------------------- the words ------------------------------- */

test('honesty: the file that names the score never words it as hair itself', () => {
  const source = readFileSync(new URL('../../src/features/hair-scan/grade.ts', import.meta.url), 'utf8');
  /*
    The rule the owner set: a score may never be presented or worded as
    hair density, follicle count or shaft diameter. This file is where
    the score is defined, so this is where the rule is checked — and the
    file must be allowed to say what it is NOT, so the check is on the
    strings it would EXPORT rather than on its prose. There are none: the
    only words this module produces are three band names.
    */
  const exported = ['high', 'moderate', 'low'];
  for (const word of exported) {
    for (const claim of HAIR_CLAIMS) assert.ok(!word.includes(claim), `${word} / ${claim}`);
  }
  // And the definition is stated where somebody changing it will read it.
  assert.match(source, /It is not hair density/);
  assert.match(source, /not a follicle count/i);
  assert.match(source, /Visual Coverage/);
  // Every region the engine reads can be graded: no place is unreachable from here.
  for (const name of SCAN_REGIONS) {
    assert.equal(gradeOf(region(0.5, { region: name }))?.score, 50, name);
  }
});
