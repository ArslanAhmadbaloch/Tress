/**
 * The coverage number is the one most likely to be believed, so it is the
 * one most worth attacking.
 *
 * A segmentation mask produces a confident-looking percentage from any
 * photograph at all, and a person tracking hair loss will read a rise as
 * regrowth whatever the caption says. These cases sit on the places where
 * that reading would be wrong: framing that moved, differences inside the
 * noise band, and an empty mask.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  compareCoverage,
  coverageOf,
  describeTrend,
  hairChannel,
  type MaskImage,
} from '@/features/assessment/hair-mask';

/** A mask where the top `rows` rows are hair and the rest is not. */
function topRows(rows: number, size = 12): MaskImage {
  const data = new Float32Array(size * size);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < size; x += 1) data[y * size + x] = 0.9;
  }
  return { width: size, height: size, data };
}

test('channel: the hair class is lifted out at the right stride', () => {
  // Two classes interleaved per pixel: background first, hair second.
  // Reading the wrong one produces a full mask instead of an empty one,
  // which still renders a confident percentage — so it is worth pinning.
  const side = 2;
  const classes = 2;
  const out = new Float32Array(side * side * classes);
  for (let p = 0; p < side * side; p += 1) {
    out[p * classes] = 0.9;       // background: confident
    out[p * classes + 1] = 0.1;   // hair: not
  }
  const mask = hairChannel(out, side, classes);
  assert.equal(mask.width, side);
  for (let i = 0; i < mask.data.length; i += 1) {
    assert.ok(Math.abs(mask.data[i] - 0.1) < 1e-6, 'must read the hair channel, not background');
  }
  assert.equal(coverageOf(mask).pixels, 0);
});

test('coverage: an empty mask is zero everywhere, not NaN', () => {
  const c = coverageOf({ width: 8, height: 8, data: new Float32Array(64) });
  assert.equal(c.fraction, 0);
  assert.equal(c.verticalBalance, 0);
  assert.equal(c.pixels, 0);
});

test('coverage: a zero-sized mask does not divide by zero', () => {
  const c = coverageOf({ width: 0, height: 0, data: new Float32Array(0) });
  assert.equal(c.fraction, 0);
});

test('coverage: half a frame of hair reads as half', () => {
  const c = coverageOf(topRows(6));
  assert.ok(Math.abs(c.fraction - 0.5) < 1e-6);
  assert.equal(c.verticalBalance, 1, 'all of it is above the midline');
});

test('coverage: low-confidence pixels are not counted as hair', () => {
  const size = 8;
  const data = new Float32Array(size * size).fill(0.49);
  assert.equal(coverageOf({ width: size, height: size, data }).pixels, 0);
});

test('trend: a small difference is noise, not a result', () => {
  // One row in twelve is about 8 points, so compare two masks that differ
  // by well under the noise band.
  const now = { fraction: 0.510, upperFraction: 0.5, verticalBalance: 0.5, pixels: 100 };
  const before = { fraction: 0.500, upperFraction: 0.5, verticalBalance: 0.5, pixels: 100 };
  const t = compareCoverage(now, before);
  assert.equal(t.meaningful, false, 'a one-point rise must not be reported as change');
  assert.match(describeTrend(t)!, /No measurable change/);
});

test('trend: framing that moved is refused, however big the difference', () => {
  const now = { fraction: 0.70, upperFraction: 0.8, verticalBalance: 0.80, pixels: 100 };
  const before = { fraction: 0.40, upperFraction: 0.4, verticalBalance: 0.50, pixels: 100 };
  const t = compareCoverage(now, before);
  assert.equal(t.framingSuspect, true);
  assert.equal(t.meaningful, false, 'a 30-point jump from a moved camera is not a result');
  assert.match(describeTrend(t)!, /measure the camera/);
});

test('trend: a real change is stated as area, never as thickness', () => {
  const now = { fraction: 0.56, upperFraction: 0.6, verticalBalance: 0.52, pixels: 100 };
  const before = { fraction: 0.50, upperFraction: 0.5, verticalBalance: 0.50, pixels: 100 };
  const t = compareCoverage(now, before);
  assert.equal(t.meaningful, true);

  const text = describeTrend(t)!.toLowerCase();
  assert.match(text, /area, not thickness/);
  for (const claim of ['thicker', 'fuller', 'regrow', 'density']) {
    assert.ok(!text.includes(claim), `coverage copy must not say "${claim}"`);
  }
});

/* ----------------------------- left and right ----------------------------- */

/** A mask where the left `cols` columns are hair and the rest is not. */
function leftCols(cols: number, size = 12): MaskImage {
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < cols; x += 1) data[y * size + x] = 0.9;
  }
  return { width: size, height: size, data };
}

test('balance: hair spread evenly across the frame reads as half left', () => {
  const c = coverageOf(topRows(6));
  assert.ok(Math.abs((c.horizontalBalance ?? -1) - 0.5) < 1e-6);
});

test('balance: hair only on the left of the frame reads as all left', () => {
  const c = coverageOf(leftCols(4));
  assert.equal(c.horizontalBalance, 1);
  assert.ok(Math.abs(c.fraction - 1 / 3) < 1e-6, 'and the area is still a third');
});

test('balance: an odd-width frame splits its middle column, not the reading', () => {
  // Nine columns of hair across an odd width: the centre column straddles
  // the midline and must fall wholly on one side or the other without
  // pushing the figure past the obvious half.
  const size = 9;
  const data = new Float32Array(size * size).fill(0.9);
  const c = coverageOf({ width: size, height: size, data });
  assert.ok(Math.abs((c.horizontalBalance ?? -1) - 4 / 9) < 1e-6, 'four of nine columns lie left of centre');
});

test('balance: an empty mask has no side, and is zero rather than NaN', () => {
  const c = coverageOf({ width: 8, height: 8, data: new Float32Array(64) });
  assert.equal(c.horizontalBalance, 0);
});
