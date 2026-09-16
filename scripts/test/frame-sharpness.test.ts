/**
 * The sweep's blur defence.
 *
 * A sweep photographs a moving head and gets one pass at each angle, so
 * the one thing it must not do is keep a smeared frame and call the angle
 * done. The check it relies on is a Laplacian taken at 512 pixels, and
 * the reason it exists is that the report's own check — the same kernel
 * at 64 pixels, against a threshold of 6 — does not object to a smear.
 *
 * That claim is the point of this file, and so is its mechanism, which is
 * easy to get backwards. It is **not** that the downsample averages the
 * smear away. Measured on the fixture below, the smear is plainly visible
 * at 64 pixels: the number more than halves, from 50.4 to 24.3, exactly
 * as it halves at 512, from 20.4 to 9.9. What lets it through is that
 * both of those 64-pixel numbers sit four times above the threshold set
 * for that size. A mean Laplacian is a measurement of a grid, not of a
 * scene, and carrying a threshold between grid sizes is the error — in
 * this fixture the *smeared* frame at 64 measures higher than the *sharp*
 * frame at 512, so a single number could not possibly serve both.
 *
 * Everything here is arithmetic over grids built in memory. No camera, no
 * native module, no file — and no photograph either: these are synthetic
 * patterns, and they license claims about how the kernel behaves when the
 * grid changes size, not claims about how any particular face looks.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SHARPNESS_WIDTH,
  SWEEP_SOFT,
  greyAt,
  isSoft,
  sharpnessAt,
  sharpnessOf,
} from '@/features/assessment/frame-sharpness';
import { assessQuality, type GreyImage } from '@/features/assessment/image-quality';

/* ------------------------------ fixtures ------------------------------ */

function grid(
  width: number,
  height: number,
  at: (x: number, y: number) => number,
): GreyImage {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = Math.max(0, Math.min(255, Math.round(at(x, y))));
    }
  }
  return { width, height, data };
}

const flat = (width: number, height: number, value: number) =>
  grid(width, height, () => value);

/**
 * A fine, regular texture at roughly the scale hair sits at in a frame
 * this size. Deterministic, so every number below is reproducible.
 */
const texture = (width: number, height: number) =>
  grid(width, height, (x, y) => 128 + 100 * Math.sin(x / 1.8) * Math.cos(y / 2.2));

/** A box blur — an out-of-focus lens. */
function blurred(image: GreyImage, radius: number): GreyImage {
  return grid(image.width, image.height, (x, y) => {
    let sum = 0;
    let n = 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const px = Math.min(image.width - 1, Math.max(0, x + dx));
        const py = Math.min(image.height - 1, Math.max(0, y + dy));
        sum += image.data[py * image.width + px];
        n += 1;
      }
    }
    return sum / n;
  });
}

/** A one-axis box blur — a head turning during the exposure. */
function smeared(image: GreyImage, length: number): GreyImage {
  return grid(image.width, image.height, (x, y) => {
    let sum = 0;
    for (let d = 0; d < length; d += 1) {
      sum += image.data[y * image.width + Math.min(image.width - 1, x + d)];
    }
    return sum / length;
  });
}

/** Box-downsamples by an integer factor, as a resize to a smaller width does. */
function shrunk(image: GreyImage, factor: number): GreyImage {
  const width = Math.floor(image.width / factor);
  const height = Math.floor(image.height / factor);
  return grid(width, height, (x, y) => {
    let sum = 0;
    for (let dy = 0; dy < factor; dy += 1) {
      for (let dx = 0; dx < factor; dx += 1) {
        sum += image.data[(y * factor + dy) * image.width + (x * factor + dx)];
      }
    }
    return sum / (factor * factor);
  });
}

/* ------------------------------- the maths ------------------------------ */

test('sharpness: a frame with no edges measures nothing', () => {
  assert.equal(sharpnessOf(flat(64, 64, 128)), 0);
  assert.equal(sharpnessOf(flat(64, 64, 0)), 0);

  // And nothing is the softest a frame can be, so the sweep would offer
  // another shot rather than keep it.
  assert.equal(isSoft(sharpnessOf(flat(64, 64, 128))), true);
});

test('sharpness: a grid too small for the kernel measures nothing rather than throwing', () => {
  for (const size of [1, 2]) {
    assert.equal(sharpnessOf(flat(size, size, 128)), 0);
  }
  assert.equal(sharpnessOf(flat(2, 40, 128)), 0);
  assert.equal(sharpnessOf(flat(40, 2, 128)), 0);
});

test('sharpness: blurring a frame lowers the number, every time', () => {
  const source = texture(256, 256);
  const series = [0, 1, 2, 4].map((radius) =>
    sharpnessOf(radius === 0 ? source : blurred(source, radius)),
  );

  for (let i = 1; i < series.length; i += 1) {
    assert.ok(
      series[i] < series[i - 1],
      `radius ${i} should measure softer than the one before: ${series.join(' → ')}`,
    );
  }
});

/* ------------------- why 512 rather than the report's 64 ------------------ */

test('sharpness: the sweep catches a smear that the 64-pixel check waves through', () => {
  const sharp = texture(512, 512);
  const smear = smeared(sharp, 7);

  // At the width the sweep measures at, the smear is caught.
  const sharpAt512 = sharpnessOf(sharp);
  const smearAt512 = sharpnessOf(smear);
  assert.ok(sharpAt512 > SWEEP_SOFT, `a sharp frame is not soft: ${sharpAt512}`);
  assert.ok(smearAt512 < SWEEP_SOFT, `a smeared frame is soft: ${smearAt512}`);
  assert.equal(isSoft(smearAt512), true);
  assert.equal(isSoft(sharpAt512), false);

  // At the width the report analyses at, the same smear goes through.
  // `assessQuality` owns the 'blurred' issue and raises nothing.
  const smearAt64 = shrunk(smear, 8);
  assert.equal(smearAt64.width, 64);
  assert.equal(assessQuality(smearAt64).issues.includes('blurred'), false);

  // And not because the smear stopped being visible at that size. It is
  // as visible there as it is at 512 — the measurement halves either way.
  // What is missing at 64 is anything calibrated to object to it.
  const sharpAt64 = sharpnessOf(shrunk(sharp, 8));
  const measuredAt64 = sharpnessOf(smearAt64);
  assert.ok(
    measuredAt64 < sharpAt64 * 0.6,
    `the smear is visible at 64 too: ${sharpAt64} → ${measuredAt64}`,
  );
});

test('sharpness: the same frame at two widths gives opposite verdicts', () => {
  const smear = smeared(texture(512, 512), 7);

  // One photograph. Two grid sizes. The sweep's threshold calls it soft
  // at the width it was calibrated for and sharp at the width it was
  // not — and the second number is even higher than a *sharp* frame
  // measures at 512. That is the whole reason `SOFT = 6` in
  // `image-quality.ts` and `SWEEP_SOFT` here cannot be reconciled, and
  // the reason `isSoft` may only ever be handed a measurement taken at
  // `SHARPNESS_WIDTH`.
  const at512 = sharpnessOf(smear);
  const at64 = sharpnessOf(shrunk(smear, 8));

  assert.equal(isSoft(at512), true);
  assert.equal(isSoft(at64), false);
  assert.ok(
    at64 > sharpnessOf(texture(512, 512)),
    `the smear at 64 (${at64}) should out-measure a sharp frame at 512`,
  );
});

/* -------------------------------- the gate ------------------------------- */

test('sharpness: the threshold is exclusive, and a frame exactly at it is kept', () => {
  assert.equal(isSoft(SWEEP_SOFT), false);
  assert.equal(isSoft(SWEEP_SOFT + 0.001), false);
  assert.equal(isSoft(SWEEP_SOFT - 0.001), true);
  assert.equal(isSoft(0), true);
});

test('sharpness: a frame that was never measured is never called soft', () => {
  // Failing to measure a photograph is not evidence against it. Every one
  // of these is an absent measurement, and an absent measurement must
  // never cost somebody an angle.
  assert.equal(isSoft(null), false);
  assert.equal(isSoft(Number.NaN), false);
  assert.equal(isSoft(Number.POSITIVE_INFINITY), false);
  assert.equal(isSoft(Number.NEGATIVE_INFINITY), false);
});

/* ------------------------------ degradation ------------------------------ */

test('sharpness: a file that cannot be read measures null instead of throwing', async () => {
  // This is the degradation contract, and under `node --test` it is
  // exercised by the very failure it guards against: there is no image
  // manipulator here, so the lazy import rejects. A simulator with no
  // camera, and a build missing the native module, arrive at the same
  // answer by the same route — null, and nothing else breaks.
  assert.equal(await sharpnessAt('file:///nowhere/absent.jpg'), null);
  assert.equal(await greyAt('file:///nowhere/absent.jpg', SHARPNESS_WIDTH), null);
});

test('sharpness: a width the kernel cannot work at is refused before any work is done', async () => {
  for (const width of [0, 2, -512, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(await greyAt('file:///photo.jpg', width), null);
    assert.equal(await sharpnessAt('file:///photo.jpg', width), null);
  }
  assert.equal(await greyAt('', SHARPNESS_WIDTH), null);
});

test('sharpness: the sweep measures at 512, and says so', () => {
  assert.equal(SHARPNESS_WIDTH, 512);
  assert.ok(SWEEP_SOFT > 0 && Number.isFinite(SWEEP_SOFT));
});
