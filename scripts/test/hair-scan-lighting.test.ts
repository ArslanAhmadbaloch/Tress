/**
 * The light meter, checked with a clock the test controls.
 *
 * The pill has one job the person will notice if it fails: to hold a
 * word steady while the camera's exposure hunts and hands cross lamps.
 * So most of what follows is about what the tracker refuses to do —
 * change within the dwell, cross a boundary by a hair, follow one odd
 * frame — and the rest is the arithmetic the worklet runs on a buffer.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LIGHTING_BANDS,
  LIGHTING_COPY,
  LIGHTING_DWELL_MS,
  LIGHTING_HYSTERESIS,
  LIGHTING_PENDING_LABEL,
  classifyLighting,
  createLightingTracker,
  levelFromBrightness,
  lightingAllowsCapture,
  lightingCopySentences,
  lightingGateLevel,
  meanLuminance,
  meanLuminanceInterleaved,
  type LightingLevel,
} from '@/features/hair-scan/lighting';

import { LIGHT_MIN } from '@/features/hair-scan/engine';

import { assertNoHairClaims } from './claims';
import { assertHonest } from './honesty-words';

/* ----------------------------- classification ----------------------------- */

test('lighting: each band names its level, in order from dark to perfect', () => {
  assert.equal(classifyLighting(0), 'dark');
  assert.equal(classifyLighting(LIGHTING_BANDS.dim - 0.001), 'dark');
  assert.equal(classifyLighting(LIGHTING_BANDS.dim), 'dim');
  assert.equal(classifyLighting(LIGHTING_BANDS.good - 0.001), 'dim');
  assert.equal(classifyLighting(LIGHTING_BANDS.good), 'good');
  assert.equal(classifyLighting(LIGHTING_BANDS.perfect - 0.001), 'good');
  assert.equal(classifyLighting(LIGHTING_BANDS.perfect), 'perfect');
  assert.equal(classifyLighting(1), 'perfect');
});

test('lighting: a level outside 0–1 or not a number is clamped, never thrown', () => {
  assert.equal(classifyLighting(-4), 'dark');
  assert.equal(classifyLighting(7), 'perfect');
  assert.equal(classifyLighting(Number.NaN), 'dark');
  assert.equal(classifyLighting(Number.POSITIVE_INFINITY), 'dark');
});

test('lighting: hysteresis — a level a hair over a boundary keeps the band it came from', () => {
  const edge = LIGHTING_BANDS.perfect;
  const inside = LIGHTING_HYSTERESIS / 2;

  // Coming from below, just over the edge is still "good".
  assert.equal(classifyLighting(edge + inside, 'good'), 'good');
  // Coming from above, just under the edge is still "perfect".
  assert.equal(classifyLighting(edge - inside, 'perfect'), 'perfect');
  // Clear of the margin, the band changes in both directions.
  assert.equal(classifyLighting(edge + LIGHTING_HYSTERESIS, 'good'), 'perfect');
  assert.equal(classifyLighting(edge - LIGHTING_HYSTERESIS - 0.001, 'perfect'), 'good');
});

test('lighting: hysteresis — a big jump crosses several bands at once', () => {
  assert.equal(classifyLighting(0.9, 'dark'), 'perfect');
  assert.equal(classifyLighting(0.02, 'perfect'), 'dark');
  // And a jump that clears one boundary but only grazes the next stops short.
  assert.equal(classifyLighting(LIGHTING_BANDS.good + LIGHTING_HYSTERESIS / 2, 'dark'), 'dim');
});

test('lighting: only good and perfect allow a capture', () => {
  const allowed: Record<LightingLevel, boolean> = {
    perfect: true,
    good: true,
    dim: false,
    dark: false,
  };
  for (const [level, expected] of Object.entries(allowed)) {
    assert.equal(lightingAllowsCapture(level as LightingLevel), expected, level);
  }
});

test('lighting: the engine is handed the smoothed level while the word allows capture, and zero while it does not', () => {
  assert.equal(lightingGateLevel(null), null, 'unmeasured never gates');

  const tracker = createLightingTracker();
  const lit = tracker.push(PERFECT, 0, 'frame');
  assert.equal(lightingGateLevel(lit), lit.smoothed);

  // The room goes dark. Inside the dwell the word is still "perfect", so
  // the engine is still allowed to capture — the gate follows the pill,
  // not the raw number.
  const heldDark = tracker.push(DARK, 250, 'frame');
  assert.equal(heldDark.level, 'perfect');
  assert.equal(lightingGateLevel(heldDark), heldDark.smoothed);

  // Once the pill says dark, the engine is told the darkest level there is.
  let t = 250;
  while (tracker.current()!.level !== 'dark') {
    t += 250;
    tracker.push(DARK, t, 'frame');
    assert.ok(t < 5000, 'never reached dark');
  }
  assert.equal(lightingGateLevel(tracker.current()), 0);
});

test('lighting: a level the pill calls good is one the engine accepts', () => {
  // The engine gates a tick on its own threshold over the number it is
  // handed. Every smoothed level the pill calls "good" or "perfect" sits
  // at or above the good band's edge, so the engine must accept from
  // there — otherwise the pill would say go and the ring would not fill.
  assert.ok(
    LIGHT_MIN <= LIGHTING_BANDS.good,
    `engine LIGHT_MIN ${LIGHT_MIN} is above the pill's good band ${LIGHTING_BANDS.good}`,
  );
  // And the darkest level the pill refuses with is one the engine refuses too.
  assert.ok(LIGHT_MIN > 0, 'the engine must refuse a gate level of zero');
});

test('lighting: a still photograph brightness maps onto the same scale', () => {
  assert.equal(levelFromBrightness(0), 0);
  assert.equal(levelFromBrightness(255), 1);
  assert.ok(Math.abs(levelFromBrightness(127.5) - 0.5) < 1e-9);
  assert.equal(levelFromBrightness(400), 1);
  assert.equal(levelFromBrightness(-10), 0);
  // image-quality's own "too dark" line lands in dim, not in good.
  assert.equal(classifyLighting(levelFromBrightness(60)), 'dim');
});

/* -------------------------------- the tracker ------------------------------- */

const PERFECT = 0.7;
const DARK = 0.03;

test('lighting: the dwell is at least nine hundred milliseconds', () => {
  assert.ok(LIGHTING_DWELL_MS >= 900, `${LIGHTING_DWELL_MS}`);
});

test('lighting: the first sample is shown at once, whatever it is', () => {
  const tracker = createLightingTracker();
  assert.equal(tracker.current(), null);
  const reading = tracker.push(DARK, 1000, 'frame');
  assert.equal(reading.level, 'dark');
  assert.equal(reading.smoothed, DARK);
  assert.equal(reading.raw, DARK);
  assert.equal(reading.at, 1000);
  assert.equal(reading.since, 1000);
  assert.equal(reading.source, 'frame');
  assert.deepEqual(tracker.current(), reading);
});

test('lighting: Perfect → dark → Perfect inside the dwell never reaches the pill', () => {
  const tracker = createLightingTracker();
  let t = 0;
  tracker.push(PERFECT, t, 'frame');
  // A hand across the lens, at the probe's own rate, for most of a second.
  for (const raw of [DARK, DARK, DARK, PERFECT, PERFECT]) {
    t += 200;
    const reading = tracker.push(raw, t, 'frame');
    assert.equal(reading.level, 'perfect', `at ${t} ms the pill flickered`);
  }
});

test('lighting: a change that lasts is shown once the dwell has passed', () => {
  const tracker = createLightingTracker();
  tracker.push(PERFECT, 0, 'frame');

  let t = 0;
  let level: LightingLevel = 'perfect';
  let changedAt = -1;
  while (t < 5000) {
    t += 250;
    level = tracker.push(DARK, t, 'frame').level;
    if (level !== 'perfect' && changedAt < 0) changedAt = t;
  }
  assert.equal(level, 'dark', 'the room really is dark now');
  assert.ok(changedAt >= LIGHTING_DWELL_MS, `changed at ${changedAt} ms, inside the dwell`);
  assert.ok(changedAt <= 2000, `changed at ${changedAt} ms, which is too slow to be useful`);
});

test('lighting: once changed, the new word is held for its own dwell', () => {
  const tracker = createLightingTracker();
  tracker.push(DARK, 0, 'frame');
  let t = 0;
  // Bring it up until the pill says perfect.
  while (tracker.current()!.level !== 'perfect') {
    t += 250;
    tracker.push(PERFECT, t, 'frame');
    assert.ok(t < 5000, 'never reached perfect');
  }
  const since = tracker.current()!.since;
  assert.equal(since, t, 'the change is stamped with the sample that made it');

  // The room goes dark the moment the word changed. Inside the new
  // word's own dwell it stays, however the average moves underneath it.
  while (t + 250 < since + LIGHTING_DWELL_MS) {
    t += 250;
    assert.equal(tracker.push(DARK, t, 'frame').level, 'perfect', `at ${t} ms`);
  }
  // And `since` still says when the word was first shown.
  assert.equal(tracker.current()!.since, since);

  // Once the dwell has passed, a room that stayed dark is called dark.
  while (t < since + LIGHTING_DWELL_MS + 2000) {
    t += 250;
    tracker.push(DARK, t, 'frame');
  }
  assert.equal(tracker.current()!.level, 'dark');
});

test('lighting: smoothing — one odd frame moves the number a little, not all the way', () => {
  const tracker = createLightingTracker();
  tracker.push(PERFECT, 0, 'frame');
  const after = tracker.push(DARK, 250, 'frame');
  assert.ok(after.smoothed < PERFECT, 'it moved');
  assert.ok(after.smoothed > (PERFECT + DARK) / 2, 'it did not move most of the way on one frame');
  assert.equal(after.raw, DARK, 'the raw sample is still reported as it was');
});

test('lighting: smoothing is time-aware — a long gap counts for more than a short one', () => {
  const short = createLightingTracker();
  short.push(PERFECT, 0, 'frame');
  const afterShort = short.push(DARK, 100, 'frame').smoothed;

  const long = createLightingTracker();
  long.push(PERFECT, 0, 'frame');
  const afterLong = long.push(DARK, 1000, 'frame').smoothed;

  assert.ok(afterLong < afterShort, `${afterLong} should be darker than ${afterShort}`);
});

test('lighting: after the stream stops, the next sample starts afresh', () => {
  const tracker = createLightingTracker();
  tracker.push(PERFECT, 0, 'frame');
  // The camera was paused for a while; the room is dark when it resumes.
  const resumed = tracker.push(DARK, 10_000, 'frame');
  assert.equal(resumed.smoothed, DARK, 'not pulled towards a stale average');
  assert.equal(resumed.level, 'dark', 'and not held by a dwell that expired long ago');
  assert.equal(resumed.since, 10_000);
});

test('lighting: a sample from the past is treated as arriving now, never as time going backwards', () => {
  const tracker = createLightingTracker();
  tracker.push(PERFECT, 1000, 'frame');
  const reading = tracker.push(PERFECT, 500, 'frame');
  assert.equal(reading.at, 1000);
});

test('lighting: the source of the last sample is carried on the reading', () => {
  const tracker = createLightingTracker();
  tracker.push(PERFECT, 0, 'frame');
  assert.equal(tracker.push(PERFECT, 250, 'still').source, 'still');
  assert.equal(tracker.push(PERFECT, 500, 'frame').source, 'frame');
});

test('lighting: reset forgets the reading and the dwell', () => {
  const tracker = createLightingTracker();
  tracker.push(PERFECT, 0, 'frame');
  tracker.reset();
  assert.equal(tracker.current(), null);
  assert.equal(tracker.push(DARK, 100, 'frame').level, 'dark');
});

test('lighting: the dwell and smoothing can be shortened for a test but default to the product values', () => {
  const quick = createLightingTracker({ dwellMs: 0, smoothingMs: 0 });
  quick.push(PERFECT, 0, 'frame');
  assert.equal(quick.push(DARK, 1, 'frame').level, 'dark');

  const product = createLightingTracker();
  product.push(PERFECT, 0, 'frame');
  assert.equal(product.push(DARK, 1, 'frame').level, 'perfect');
});

/* --------------------------- the worklet arithmetic ------------------------- */

/** A luma plane of `width`×`height` with a padded stride, filled by `value(x, y)`. */
function plane(
  width: number,
  height: number,
  bytesPerRow: number,
  value: (x: number, y: number) => number,
): Uint8Array {
  const data = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < bytesPerRow; x += 1) {
      // Padding bytes are poison: if the read ever touches them the mean is wrong.
      data[y * bytesPerRow + x] = x < width ? value(x, y) : 255;
    }
  }
  return data;
}

test('luminance: a flat plane reads as its own level', () => {
  assert.equal(meanLuminance(plane(64, 48, 64, () => 0), 64, 48, 64, 8), 0);
  assert.equal(meanLuminance(plane(64, 48, 64, () => 255), 64, 48, 64, 8), 1);
  const mid = meanLuminance(plane(64, 48, 64, () => 128), 64, 48, 64, 8)!;
  assert.ok(Math.abs(mid - 128 / 255) < 1e-9);
});

test('luminance: rows are addressed by stride, so padding is never read', () => {
  // 40 real pixels per row, 64 bytes of stride, padding set to white.
  const dark = plane(40, 30, 64, () => 10);
  const level = meanLuminance(dark, 40, 30, 64, 4)!;
  assert.ok(Math.abs(level - 10 / 255) < 1e-9, `${level} — the padding leaked in`);
});

test('luminance: a coarse grid lands within a level or two of the full mean', () => {
  // A smooth gradient, left dark to right bright.
  const gradient = plane(320, 240, 320, (x) => Math.round((x / 319) * 255));
  const full = meanLuminance(gradient, 320, 240, 320, 1)!;
  const coarse = meanLuminance(gradient, 320, 240, 320, 8)!;
  assert.ok(Math.abs(full - coarse) * 255 < 2, `full ${full * 255} vs grid ${coarse * 255}`);
});

test('luminance: a step below one, or a fractional one, is treated as at least one', () => {
  const data = plane(16, 16, 16, () => 100);
  assert.equal(meanLuminance(data, 16, 16, 16, 0), meanLuminance(data, 16, 16, 16, 1));
  assert.equal(meanLuminance(data, 16, 16, 16, 2.9), meanLuminance(data, 16, 16, 16, 2));
});

test('luminance: a buffer shorter than its geometry, or an empty one, measures nothing', () => {
  assert.equal(meanLuminance(new Uint8Array(0), 0, 0, 0, 8), null);
  assert.equal(meanLuminance(new Uint8Array(10), 64, 48, 64, 8), null);
  // A stride narrower than the width cannot be a real plane.
  assert.equal(meanLuminance(new Uint8Array(64 * 48), 64, 48, 32, 8), null);
});

test('luminance: an interleaved buffer averages its three colour channels and skips the fourth', () => {
  const width = 8;
  const height = 4;
  const bpp = 4;
  const bytesPerRow = width * bpp + 16; // padded
  const data = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * bytesPerRow + x * bpp;
      data[i] = 30;
      data[i + 1] = 60;
      data[i + 2] = 90;
      data[i + 3] = 255; // alpha, must not count
    }
    // Poison the padding.
    for (let p = width * bpp; p < bytesPerRow; p += 1) data[y * bytesPerRow + p] = 255;
  }
  const level = meanLuminanceInterleaved(data, width, height, bytesPerRow, bpp, 1)!;
  assert.ok(Math.abs(level - 60 / 255) < 1e-9, `${level}`);

  assert.equal(meanLuminanceInterleaved(data, width, height, bytesPerRow, 2, 1), null, 'fewer than three channels');
  assert.equal(meanLuminanceInterleaved(new Uint8Array(4), width, height, bytesPerRow, bpp, 1), null);
});

/* ---------------------------------- copy ----------------------------------- */

test('lighting copy: every level has a label, and only the two that need it carry a hint', () => {
  for (const level of ['perfect', 'good', 'dim', 'dark'] as const) {
    assert.ok(LIGHTING_COPY[level].label.length > 0, level);
  }
  assert.equal(LIGHTING_COPY.perfect.hint, null);
  assert.equal(LIGHTING_COPY.good.hint, null);
  assert.ok(LIGHTING_COPY.dim.hint);
  assert.ok(LIGHTING_COPY.dark.hint);
});

test('lighting copy: the whole vocabulary is swept, and it describes the room, not the head', () => {
  const sentences = lightingCopySentences();
  assert.ok(sentences.includes(LIGHTING_PENDING_LABEL));
  assert.ok(sentences.includes(LIGHTING_COPY.dark.hint!));
  assert.equal(sentences.length, 1 + 4 + 2);

  assertNoHairClaims(assert, sentences, 'the lighting pill');
  assertHonest(assert, sentences, 'the lighting pill');
  for (const sentence of sentences) {
    assert.ok(!/\b(before|after)\b/i.test(sentence), `"${sentence}" promises a comparison`);
    // Nothing here forecasts or judges: no "will", no "your hair".
    assert.ok(!/\bwill\b/i.test(sentence), `"${sentence}" forecasts`);
    assert.ok(!/\bhair\b/i.test(sentence), `"${sentence}" mentions hair`);
  }
});
