/**
 * Comparing two scans is where this product either earns its trust or
 * loses it, so this file is written as an attack on the comparison.
 *
 * The failure it exists to prevent has a shape. Somebody scans in
 * January and again in March. Nothing about them has changed. The March
 * photograph was taken a foot closer, under a different bulb, with the
 * head a few degrees further round. The mask draws the hairline one
 * pixel differently and the coverage figure moves by a point. If the
 * app reports that point as a change, the person believes it — and acts
 * on it, and comes back next month for another number.
 *
 * So the cases below are mostly about refusing: a difference inside the
 * noise, a difference the confidence does not support, a region one of
 * the two scans never read, a region one of them caught only once. The
 * one case about reporting a change is there to prove the refusals are
 * not simply a comparison that never says anything.
 *
 * Where a refusal depends on a number this module computes, the number
 * is computed here too — through `measureRegion`, from readings — rather
 * than typed into a fixture. A fixture that hands the comparison the
 * confidence the test wants proves only that the test knows what it
 * wants; it was how the single-frame hole survived its own test once
 * already.
 *
 * Nothing here asserts anything about hair. It asserts a threshold.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ANCHOR_ALLOWANCE,
  CLASS_BOUNDARIES,
  MIN_CONFIDENCE,
  MIN_FRAMES,
  NOISE_MULTIPLE,
  anchorAllowanceOf,
  compareScans,
  noiseFloorOf,
} from '@/features/hair-scan/measure/compare';
import {
  SPREAD_FLOOR,
  UNREPEATED_CONFIDENCE,
  measureRegion,
  type FrameReading,
  type RegionMeasurement,
  type ScanMeasurement,
} from '@/features/hair-scan/measure/noise';
import { SCAN_REGIONS, type FrameAnchorGrade, type ScanRegion } from '@/features/hair-scan/measure/regions';

/* -------------------------------- fixtures -------------------------------- */

function measured(
  region: ScanRegion,
  coverage: number,
  over: Partial<RegionMeasurement> = {},
): RegionMeasurement {
  return {
    region,
    coverage,
    visibleScalp: 1 - coverage,
    frames: 4,
    spread: 0.015,
    confidence: 0.85,
    anchoring: 'landmarks',
    ...over,
  };
}

/** A frame's reading of a region, as `coverage.ts` would hand it over. */
function frameReading(
  coverage: number,
  over: Partial<FrameReading> = {},
): FrameReading {
  return {
    coverage,
    visibleScalp: 1 - coverage,
    quality: 0.8,
    visibility: 0.9,
    anchoring: 'landmarks',
    ...over,
  };
}

/** A region measured for real, from readings, with nothing hand-set. */
function gathered(region: ScanRegion, coverages: number[], over: Partial<FrameReading> = {}): RegionMeasurement {
  const measurement = measureRegion(region, coverages.map((c) => frameReading(c, over)));
  assert.ok(measurement, `${region} should measure from ${coverages.length} readings`);
  return measurement;
}

function scan(
  regions: Partial<Record<ScanRegion, RegionMeasurement>>,
  over: Partial<ScanMeasurement> = {},
): ScanMeasurement {
  return { regions, unread: [], capturedAt: '2026-01-01T00:00:00.000Z', ...over };
}

const rowFor = (rows: ReturnType<typeof compareScans>, region: ScanRegion) => {
  const row = rows.find((r) => r.region === region);
  assert.ok(row, `no row for ${region}`);
  return row;
};

/* ------------------------------ the noise floor --------------------------- */

test('floor: two error bars combine in quadrature, times the stated multiple', () => {
  // Subtract two readings and their uncertainties add as squares, not as
  // sums. Adding them linearly would inflate the floor and hide real
  // changes; taking only the larger would shrink it and let noise
  // through.
  assert.ok(Math.abs(noiseFloorOf(0.03, 0.04) - NOISE_MULTIPLE * 0.05) < 1e-12);
  assert.equal(noiseFloorOf(0, 0), 0);
});

test('floor: a nonsense spread is treated as none rather than poisoning the arithmetic', () => {
  assert.equal(noiseFloorOf(Number.NaN, 0.04), NOISE_MULTIPLE * 0.04);
});

test('floor: the multiple is two, and the reason is in the file', () => {
  // Pinned because it is the single number that decides what the product
  // is willing to tell somebody. Changing it should be a deliberate act
  // with a test to change alongside it.
  assert.equal(NOISE_MULTIPLE, 2);
});

test('floor: an anchoring allowance joins the two error bars, in quadrature too', () => {
  assert.ok(Math.abs(noiseFloorOf(0.03, 0.04, 0.12) - NOISE_MULTIPLE * 0.13) < 1e-12);
  assert.equal(noiseFloorOf(0.03, 0.04, undefined), noiseFloorOf(0.03, 0.04));
});

/* -------------------------------- refusing -------------------------------- */

test('a one-point difference on a noisy pair is unchanged', () => {
  // THE case. Two scans that each disagreed with themselves by three
  // points, a month apart, differing by one. There is no finding here,
  // and the app must not manufacture one.
  const now = scan({ hairline: measured('hairline', 0.61, { spread: 0.03 }) });
  const before = scan({ hairline: measured('hairline', 0.6, { spread: 0.03 }) });
  const row = rowFor(compareScans(now, before), 'hairline');
  assert.equal(row.verdict, 'unchanged');
  assert.ok(Math.abs(row.delta - 0.01) < 1e-9, 'the delta is still reported honestly');
  assert.ok(row.noiseFloor > Math.abs(row.delta));
});

test('a difference just under the floor is unchanged, just over it is small', () => {
  const spread = 0.02;
  const floor = noiseFloorOf(spread, spread);
  const at = (delta: number) =>
    rowFor(
      compareScans(
        scan({ hairline: measured('hairline', 0.5 + delta, { spread }) }),
        scan({ hairline: measured('hairline', 0.5, { spread }) }),
      ),
      'hairline',
    ).verdict;
  assert.equal(at(floor * 0.99), 'unchanged');
  assert.equal(at(floor * 1.01), 'small');
});

test('a coverage that is not a number is refused, not quietly called unchanged', () => {
  /*
    `before` is the side that will one day be read back from disk, so it
    is the side that can arrive corrupt. A NaN difference used to take
    `classify`'s `!(ratio >= 1)` branch and leave as `unchanged` with a
    NaN delta attached — a definite verdict carrying a number nothing
    computed. Both sides are tried, because either can be the broken one.
  */
  for (const [nowCoverage, beforeCoverage] of [
    [Number.NaN, 0.5],
    [0.5, Number.NaN],
    [Number.POSITIVE_INFINITY, 0.5],
  ]) {
    const row = rowFor(
      compareScans(
        scan({ hairline: measured('hairline', nowCoverage) }),
        scan({ hairline: measured('hairline', beforeCoverage) }),
      ),
      'hairline',
    );
    assert.equal(row.verdict, 'insufficient', `${nowCoverage} vs ${beforeCoverage} must refuse`);
    assert.equal(row.delta, 0, 'a refused row carries no difference');
  }
});

test('a region missing from one side is insufficient, and carries no number', () => {
  const now = scan({ hairline: measured('hairline', 0.6), crown: measured('crown', 0.4) });
  const before = scan({ hairline: measured('hairline', 0.6) }, { unread: ['crown'] });
  const row = rowFor(compareScans(now, before), 'crown');
  assert.equal(row.verdict, 'insufficient');
  assert.equal(row.delta, 0, 'nothing may render a delta for a region one scan never read');
  assert.equal(row.confidence, 0);
});

test('a region missing from both sides is still insufficient when either scan named it', () => {
  const now = scan({}, { unread: ['partLine'] });
  const before = scan({}, { unread: ['partLine'] });
  const rows = compareScans(now, before);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].verdict, 'insufficient');
});

test('a region neither scan has ever heard of is left out entirely', () => {
  // Silence, not an "insufficient" row for every place on a head that
  // nobody has photographed.
  const rows = compareScans(scan({ hairline: measured('hairline', 0.6) }), scan({ hairline: measured('hairline', 0.6) }));
  assert.deepEqual(rows.map((r) => r.region), ['hairline']);
});

/* --------------------------- the region seen once ------------------------- */

test('a region caught once is refused, and the refusal is derived, not arranged', () => {
  /*
    The case this module got wrong once, so it is now made end to end.
    A crown caught in a single good frame — quality 0.8, nine tenths of
    it visible, exactly the frame a passing glance produces — measured
    through `measureRegion`, compared against a tight four-frame crown
    that appears to have moved twenty points.

    The old arithmetic gave that single frame a confidence of 0.44,
    cleared the 0.4 bar, and published `small` — on an error bar that was
    eight tenths this module's own constant. Both halves of the refusal
    are asserted here: what the measurement is worth, and what the
    comparison does with it.
  */
  const once = gathered('crown', [0.6]);
  assert.equal(once.frames, 1);
  assert.ok(once.confidence > 0, 'it is still a reading');
  assert.ok(
    once.confidence <= UNREPEATED_CONFIDENCE,
    `a single frame measured ${once.confidence}, above the ceiling ${UNREPEATED_CONFIDENCE}`,
  );
  assert.ok(once.confidence < MIN_CONFIDENCE, `a single frame measured ${once.confidence}`);

  const repeated = gathered('crown', [0.4, 0.405, 0.395, 0.4]);
  assert.ok(repeated.confidence >= MIN_CONFIDENCE);

  for (const rows of [
    compareScans(scan({ crown: once }), scan({ crown: repeated })),
    compareScans(scan({ crown: repeated }), scan({ crown: once })),
  ]) {
    const row = rowFor(rows, 'crown');
    assert.equal(row.verdict, 'insufficient', 'twenty points on one frame is not a change');
    assert.equal(row.delta, 0, 'and it carries no number');
  }
});

test('the frame count alone refuses, even if the confidence arithmetic ever softened', () => {
  // The second half of the belt and braces. A measurement with one frame
  // and a confidence high enough to pass the bar — which the arithmetic
  // will not produce, and which is set here precisely because it will
  // not — is still refused, on the count.
  assert.equal(MIN_FRAMES, 2);
  const impossible = measured('crown', 0.6, { frames: 1, spread: 0.08, confidence: 0.95 });
  const strong = measured('crown', 0.4, { spread: SPREAD_FLOOR, confidence: 0.95 });
  assert.equal(rowFor(compareScans(scan({ crown: impossible }), scan({ crown: strong })), 'crown').verdict, 'insufficient');
  assert.equal(rowFor(compareScans(scan({ crown: strong }), scan({ crown: impossible })), 'crown').verdict, 'insufficient');
});

test('low confidence on either side refuses the comparison, however big the difference', () => {
  // Confidence and frame count are separate refusals: this one has
  // frames enough and confidence too low, measured rather than set — a
  // region read four times in poor light that every frame disagreed
  // about.
  const shaky = gathered('midScalp', [0.42, 0.55, 0.47, 0.66], { quality: 0.25, visibility: 0.62 });
  assert.ok(shaky.frames >= MIN_FRAMES);
  assert.ok(shaky.confidence < MIN_CONFIDENCE, `shaky measured ${shaky.confidence}`);
  const strong = gathered('midScalp', [0.4, 0.405, 0.395, 0.4]);
  assert.equal(rowFor(compareScans(scan({ midScalp: shaky }), scan({ midScalp: strong })), 'midScalp').verdict, 'insufficient');
});

test('confidence exactly at the bar is enough; a hair under it is not', () => {
  const at = (confidence: number) =>
    rowFor(
      compareScans(
        scan({ hairline: measured('hairline', 0.8, { confidence, spread: SPREAD_FLOOR }) }),
        scan({ hairline: measured('hairline', 0.5, { confidence, spread: SPREAD_FLOOR }) }),
      ),
      'hairline',
    ).verdict;
  assert.notEqual(at(MIN_CONFIDENCE), 'insufficient');
  assert.equal(at(MIN_CONFIDENCE - 1e-9), 'insufficient');
});

/* ------------------------------ the anchoring ----------------------------- */

test('anchoring: two scans measured in the same units get no allowance', () => {
  assert.deepEqual(anchorAllowanceOf('landmarks', 'landmarks'), { allowance: 0, anchoring: 'same' });
});

test('anchoring: a weak anchoring shared by both sides costs half, a mismatch costs all of it', () => {
  // A shared error largely cancels in a subtraction; a different one on
  // each side does not cancel at all.
  assert.deepEqual(anchorAllowanceOf('box', 'box'), { allowance: ANCHOR_ALLOWANCE / 2, anchoring: 'same' });
  assert.deepEqual(anchorAllowanceOf('landmarks', 'box'), { allowance: ANCHOR_ALLOWANCE, anchoring: 'mixed' });
  assert.deepEqual(anchorAllowanceOf('partial', 'landmarks'), { allowance: ANCHOR_ALLOWANCE, anchoring: 'mixed' });
});

test('anchoring: a scan on eye corners and one on a face box are not silently subtracted', () => {
  // The two detectors do not agree where a face box starts, so the two
  // scans are not quite in the same units. The comparison says so, and
  // makes the difference clear a higher bar before it is reported.
  const grades: FrameAnchorGrade[] = ['landmarks', 'box'];
  const rows = compareScans(
    scan({ hairline: measured('hairline', 0.56, { anchoring: grades[0] }) }),
    scan({ hairline: measured('hairline', 0.5, { anchoring: grades[1] }) }),
  );
  const mixed = rowFor(rows, 'hairline');
  const like = rowFor(
    compareScans(
      scan({ hairline: measured('hairline', 0.56) }),
      scan({ hairline: measured('hairline', 0.5) }),
    ),
    'hairline',
  );
  assert.equal(mixed.anchoring, 'mixed');
  assert.equal(like.anchoring, 'same');
  assert.ok(mixed.noiseFloor > like.noiseFloor, 'a mixed pair must clear a higher bar');
  assert.equal(like.verdict, 'small');
  assert.equal(mixed.verdict, 'unchanged', 'the same six points is not a finding across two anchorings');
});

/* -------------------------------- reporting ------------------------------- */

test('a difference well outside the noise is reported', () => {
  // The other half of the bargain: a comparison that never says anything
  // is not honest, it is useless.
  const now = scan({ hairline: measured('hairline', 0.72, { spread: 0.01 }) });
  const before = scan({ hairline: measured('hairline', 0.5, { spread: 0.01 }) });
  const row = rowFor(compareScans(now, before), 'hairline');
  assert.equal(row.verdict, 'large');
  assert.ok(Math.abs(row.delta - 0.22) < 1e-9);
});

test('a real difference between two properly repeated scans is reported', () => {
  // Measured end to end, like the refusal above: four frames each side,
  // agreeing with themselves, twenty points apart.
  const now = gathered('hairline', [0.6, 0.605, 0.595, 0.6]);
  const before = gathered('hairline', [0.4, 0.405, 0.395, 0.4]);
  const row = rowFor(compareScans(scan({ hairline: now }), scan({ hairline: before })), 'hairline');
  assert.ok(row.verdict !== 'insufficient' && row.verdict !== 'unchanged', `verdict ${row.verdict}`);
  assert.ok(Math.abs(row.delta - 0.2) < 1e-9);
});

test('the classes are multiples of the noise floor, not of a percentage', () => {
  // The same "twice the floor" means the same thing on a clean scan and
  // a marginal one, because the floor moves with the scan. A fixed "five
  // points is moderate" would mean something different every time.
  const spread = 0.02;
  const floor = noiseFloorOf(spread, spread);
  const verdictAt = (multiple: number) =>
    rowFor(
      compareScans(
        scan({ hairline: measured('hairline', 0.5 + floor * multiple, { spread }) }),
        scan({ hairline: measured('hairline', 0.5, { spread }) }),
      ),
      'hairline',
    ).verdict;
  assert.equal(verdictAt(0.5), 'unchanged');
  assert.equal(verdictAt(1.5), 'small');
  assert.equal(verdictAt(CLASS_BOUNDARIES.moderate + 0.5), 'moderate');
  assert.equal(verdictAt(CLASS_BOUNDARIES.large + 0.5), 'large');
});

test('the same absolute difference is a change on a tight pair and nothing on a noisy one', () => {
  // The heart of it: the verdict depends on what the scans knew about
  // themselves, not on the size of the number.
  const pairAt = (spread: number) =>
    rowFor(
      compareScans(
        scan({ hairline: measured('hairline', 0.56, { spread }) }),
        scan({ hairline: measured('hairline', 0.5, { spread }) }),
      ),
      'hairline',
    ).verdict;
  assert.equal(pairAt(0.005), 'large');
  assert.equal(pairAt(0.05), 'unchanged');
});

test('a fall and a rise of the same size are classed the same way', () => {
  // The engine reports a difference and its size. Which direction it
  // went is not the engine's business, and a classifier that treated
  // the two differently would be making a judgement about the person.
  const spread = 0.01;
  const up = rowFor(
    compareScans(scan({ hairline: measured('hairline', 0.6, { spread }) }), scan({ hairline: measured('hairline', 0.5, { spread }) })),
    'hairline',
  );
  const down = rowFor(
    compareScans(scan({ hairline: measured('hairline', 0.5, { spread }) }), scan({ hairline: measured('hairline', 0.6, { spread }) })),
    'hairline',
  );
  assert.equal(up.verdict, down.verdict);
  assert.ok(Math.abs(up.delta + down.delta) < 1e-12);
  assert.equal(up.noiseFloor, down.noiseFloor);
});

test('the confidence of a comparison is its weaker half', () => {
  const row = rowFor(
    compareScans(
      scan({ hairline: measured('hairline', 0.6, { confidence: 0.9 }) }),
      scan({ hairline: measured('hairline', 0.6, { confidence: 0.55 }) }),
    ),
    'hairline',
  );
  assert.equal(row.confidence, 0.55);
});

/* --------------------------------- shape ---------------------------------- */

test('rows come back in the canonical order, once each', () => {
  const all = Object.fromEntries(SCAN_REGIONS.map((r) => [r, measured(r, 0.5)])) as Record<
    ScanRegion,
    RegionMeasurement
  >;
  const rows = compareScans(scan(all), scan(all));
  assert.deepEqual(rows.map((r) => r.region), [...SCAN_REGIONS]);
  assert.equal(new Set(rows.map((r) => r.region)).size, rows.length);
});

test('every figure a comparison reports is a share, and nothing is out of a hundred', () => {
  const rows = compareScans(
    scan({ hairline: measured('hairline', 0.9), crown: measured('crown', 0.2) }),
    scan({ hairline: measured('hairline', 0.3), crown: measured('crown', 0.25) }),
  );
  for (const row of rows) {
    assert.ok(row.delta >= -1 && row.delta <= 1, `delta ${row.delta} is not a share`);
    assert.ok(row.noiseFloor >= 0 && row.noiseFloor <= 1);
    assert.ok(row.confidence >= 0 && row.confidence <= 1);
  }
});

test('two scans with nothing in them compare to nothing', () => {
  assert.deepEqual(compareScans(scan({}), scan({})), []);
});
