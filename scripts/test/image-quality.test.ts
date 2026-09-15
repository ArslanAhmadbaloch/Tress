/**
 * The measurements have to be measurements.
 *
 * Every number the report shows about a photograph comes from here, and a
 * brightness figure looks equally plausible whatever it says. These build
 * grids where the right answer is known by construction — a black frame,
 * a blown frame, a checkerboard, the same scene two stops darker — and
 * check the arithmetic lands on it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assessQuality,
  compareShots,
  histogram,
  histogramSimilarity,
  toGrey,
  type GreyImage,
} from '@/features/assessment/image-quality';
import { buildScanReading } from '@/features/assessment/scan-reading';
import type { PhotoSession } from '@/types/domain';

function flat(value: number, size = 16): GreyImage {
  return { width: size, height: size, data: new Uint8Array(size * size).fill(value) };
}

function checkerboard(size = 16, lo = 20, hi = 230): GreyImage {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) data[y * size + x] = (x + y) % 2 === 0 ? lo : hi;
  }
  return { width: size, height: size, data };
}

test('grey: luma is green-weighted, not a flat average', () => {
  // Pure green is much brighter to the eye than pure blue; a flat average
  // would call them identical and lose the separation hair relies on.
  const rgba = new Uint8Array([0, 255, 0, 255, 0, 0, 255, 255]);
  const grey = toGrey(rgba, 2, 1);
  assert.ok(grey.data[0] > grey.data[1], 'green must read brighter than blue');
  assert.equal(grey.data[0], 149);
  assert.equal(grey.data[1], 29);
});

test('quality: a black frame is flagged dark, flat and clipped', () => {
  const q = assessQuality(flat(2));
  assert.ok(q.issues.includes('tooDark'));
  assert.ok(q.issues.includes('lowContrast'));
  assert.equal(q.clipped, 1);
});

test('quality: a blown frame is flagged bright, not dark', () => {
  const q = assessQuality(flat(253));
  assert.ok(q.issues.includes('tooBright'));
  assert.ok(!q.issues.includes('tooDark'));
});

test('quality: burnt highlights are flagged even at a sane average', () => {
  // Half the frame pure white, half mid-grey: the mean is unremarkable,
  // but the white half has lost its detail permanently.
  const size = 16;
  const data = new Uint8Array(size * size);
  for (let i = 0; i < data.length; i += 1) data[i] = i % 2 === 0 ? 255 : 110;
  const q = assessQuality({ width: size, height: size, data });
  assert.ok(q.issues.includes('clipped'), 'clipping must be raised on its own');
  assert.ok(!q.issues.includes('tooBright'), 'the average is fine; the highlights are not');
});

test('quality: a flat frame reads as blurred, a checkerboard does not', () => {
  assert.ok(assessQuality(flat(128)).issues.includes('blurred'));
  assert.ok(!assessQuality(checkerboard()).issues.includes('blurred'));
});

test('quality: a well-exposed textured frame raises nothing', () => {
  assert.deepEqual(assessQuality(checkerboard(16, 70, 190)).issues, []);
});

test('histogram: normalised buckets sum to one', () => {
  const sum = histogram(checkerboard()).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('similarity: identical scenes match, opposite ones do not', () => {
  const a = checkerboard();
  assert.equal(histogramSimilarity(histogram(a), histogram(a)), 1);
  assert.equal(histogramSimilarity(histogram(flat(10)), histogram(flat(250))), 0);
});

test('compare: the same scene two stops darker is an exposure shift', () => {
  const now = checkerboard(16, 10, 90);
  const before = checkerboard(16, 70, 190);
  const c = compareShots(now, before);
  assert.ok(c.exposureDelta < 0, 'the newer shot is darker');
  assert.ok(c.issues.includes('exposureShift'));
});

test('compare: a repeat of the same conditions raises nothing', () => {
  const a = checkerboard(16, 70, 190);
  assert.deepEqual(compareShots(a, a).issues, []);
});

/* ------------------ the report's words agree with the flags ------------------ */

test('quality: what the analyser flags, the scan report names in the same terms', () => {
  // The report describes a photograph in bands wider than the analyser's
  // flags, so a little dark is "Low" without being flagged. But where the
  // analyser does raise a problem, the report must not call it fine —
  // two modules disagreeing about the same pixels is the one thing worse
  // than either being wrong.
  const grids: [GreyImage, string][] = [
    [flat(2), 'Dark'],
    [flat(253), 'Bright'],
    [checkerboard(16, 70, 190), 'Even'],
  ];
  for (const [grid, expected] of grids) {
    const q = assessQuality(grid);
    const s: PhotoSession = {
      id: 's', journeyId: 'j', capturedAt: new Date().toISOString(), isBaseline: true,
      photos: [{
        id: 'p', sessionId: 's', angle: 'front', uri: 'file://p.jpg', width: 16, height: 16,
        capturedAt: new Date().toISOString(), quality: q,
      }],
    };
    const r = buildScanReading(s)!;
    const light = r.tiles.find((t) => t.id === 'light')!;
    assert.equal(light.value, expected);
    assert.equal(light.tone === 'attention', q.issues.includes('tooDark') || q.issues.includes('tooBright'));

    const focus = r.tiles.find((t) => t.id === 'sharpness')!;
    assert.equal(focus.tone === 'attention', q.issues.includes('blurred'));
  }
});
