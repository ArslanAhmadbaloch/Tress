/**
 * What can honestly be measured in a photograph of somebody's head.
 *
 * Not density, not a Norwood stage, not whether anything has grown. This
 * measures the *photograph*: is it bright enough, is it sharp, and is it
 * lit and framed closely enough to the last one that comparing the two
 * says something about hair rather than about the room.
 *
 * That sounds modest and it is the opposite. The comparison slider is the
 * reason this app exists, and it is worthless if September was shot under
 * a window at noon and October under a bathroom bulb at night. Telling
 * somebody *before* they take the shot is the single most useful thing an
 * on-device model can do here, and — unlike a density score — every
 * number below is a real measurement of real pixels.
 *
 * Everything here is pure arithmetic over a grey grid, so it runs in a
 * test without a simulator, a camera or a native module.
 */

/** A decoded image reduced to one luminance byte per pixel. */
export type GreyImage = {
  width: number;
  height: number;
  /** Row-major, 0–255. */
  data: Uint8Array;
};

export type QualityIssue =
  | 'tooDark'
  | 'tooBright'
  | 'lowContrast'
  | 'blurred'
  | 'clipped'
  | 'exposureShift'
  | 'framingShift';

export type Quality = {
  /** Mean luminance, 0–255. */
  brightness: number;
  /** Standard deviation of luminance — flat images have little. */
  contrast: number;
  /**
   * Mean absolute Laplacian response. Low means soft: either out of focus
   * or motion-blurred. It cannot tell those apart, and does not claim to.
   */
  sharpness: number;
  /** Fraction of pixels crushed to black or blown to white, 0–1. */
  clipped: number;
  issues: QualityIssue[];
};

/*
  Thresholds are deliberately generous. This is advice, not a gate: a
  photograph a bit darker than ideal is still worth keeping, and an app
  that refuses somebody's picture because a number fell under a constant
  is an app they stop using. Only genuinely unusable shots are flagged.
*/
const DARK = 60;
const BRIGHT = 205;
const FLAT_CONTRAST = 18;
const SOFT = 6;
const CLIP_LIMIT = 0.12;

export function toGrey(rgba: Uint8Array, width: number, height: number): GreyImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < data.length; i += 4, p += 1) {
    // Rec. 601 luma. Hair is usually the darkest thing in frame and skin
    // the brightest, so the green-weighted version separates them better
    // than a flat average would.
    data[p] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return { width, height, data };
}

function meanAndSd(data: Uint8Array): { mean: number; sd: number } {
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) sum += data[i];
  const mean = sum / data.length;

  let acc = 0;
  for (let i = 0; i < data.length; i += 1) {
    const d = data[i] - mean;
    acc += d * d;
  }
  return { mean, sd: Math.sqrt(acc / data.length) };
}

/** Mean absolute 4-neighbour Laplacian, skipping the border. */
function laplacian({ width, height, data }: GreyImage): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const response =
        4 * data[i] - data[i - 1] - data[i + 1] - data[i - width] - data[i + width];
      sum += Math.abs(response);
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}

function clippedFraction(data: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < data.length; i += 1) {
    if (data[i] <= 4 || data[i] >= 251) n += 1;
  }
  return n / data.length;
}

export function assessQuality(image: GreyImage): Quality {
  const { mean, sd } = meanAndSd(image.data);
  const sharpness = laplacian(image);
  const clipped = clippedFraction(image.data);

  const issues: QualityIssue[] = [];
  if (mean < DARK) issues.push('tooDark');
  if (mean > BRIGHT) issues.push('tooBright');
  if (sd < FLAT_CONTRAST) issues.push('lowContrast');
  if (sharpness < SOFT) issues.push('blurred');
  /*
    Clipping is its own problem, not a shade of the other two. A frame can
    sit at a perfectly reasonable average while the highlights on the
    scalp are burnt to pure white — and detail lost to clipping is gone,
    not merely dim, so no later comparison can recover it.
  */
  if (clipped > CLIP_LIMIT) issues.push('clipped');

  return { brightness: mean, contrast: sd, sharpness, clipped, issues };
}

/**
 * A 16-bucket luminance histogram, normalised.
 *
 * Comparing whole images pixel-for-pixel would report a head turned two
 * degrees as a completely different photograph. A histogram ignores where
 * things are and keeps how bright they are, which is exactly the part
 * that has to match for a comparison to be fair.
 */
export function histogram(image: GreyImage, buckets = 16): number[] {
  const out = new Array(buckets).fill(0);
  for (let i = 0; i < image.data.length; i += 1) {
    const b = Math.min(buckets - 1, Math.floor((image.data[i] / 256) * buckets));
    out[b] += 1;
  }
  return out.map((n) => n / image.data.length);
}

/** 0–1 overlap between two normalised histograms. 1 is identical. */
export function histogramSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let overlap = 0;
  for (let i = 0; i < a.length; i += 1) overlap += Math.min(a[i], b[i]);
  return overlap;
}

export type Comparability = {
  /** 0–1. How alike the two exposures are. */
  similarity: number;
  /** Difference in mean luminance, in levels. */
  exposureDelta: number;
  issues: QualityIssue[];
};

/**
 * Whether two shots of the same angle can be fairly compared.
 *
 * Reported, never enforced. Somebody who took October's photograph in a
 * darker room still has October's photograph, and the honest thing is to
 * say the light changed — not to hide the comparison or, worse, to let
 * them read the lighting as a result.
 */
export function compareShots(now: GreyImage, before: GreyImage): Comparability {
  const similarity = histogramSimilarity(histogram(now), histogram(before));
  const exposureDelta = meanAndSd(now.data).mean - meanAndSd(before.data).mean;

  const issues: QualityIssue[] = [];
  if (Math.abs(exposureDelta) > 38) issues.push('exposureShift');
  if (similarity < 0.62) issues.push('framingShift');

  return { similarity, exposureDelta, issues };
}
