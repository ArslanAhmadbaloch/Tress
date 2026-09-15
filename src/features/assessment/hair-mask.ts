/**
 * Turning a segmentation mask into something honest to say.
 *
 * MediaPipe's hair segmenter returns, for every pixel, how confident it
 * is that the pixel is hair. What you can do with that is measure area —
 * what fraction of the frame the hair occupies, and how that area is
 * distributed between the top of the frame and the bottom.
 *
 * ── What this is not ──────────────────────────────────────────────────
 * It is not density. A mask cannot see between strands, so a thin covering
 * over a wide area and a thick covering over the same area produce the
 * same number. It is not a Norwood stage, which is a clinical
 * classification made by a person. And a single reading means almost
 * nothing on its own, because coverage moves with haircuts, wet hair,
 * styling and how far the phone was held from the head.
 *
 * What it *is* good for is the same thing the rest of this app is good
 * for: the shape of a series. Coverage measured the same way, from the
 * same angle, under lighting we have already checked for comparability,
 * across months — that is a real measurement of a real thing, and the
 * only claim attached to it is arithmetic.
 *
 * Everything here is pure, so the interesting cases are tested without a
 * model, a camera, or a device.
 */

/** Per-pixel hair confidence, row-major, each 0–1. */
export type MaskImage = {
  width: number;
  height: number;
  data: Float32Array;
};

/** Confidence at or above which a pixel counts as hair. */
const HAIR = 0.5;

export type Coverage = {
  /** Fraction of the frame the mask claims as hair, 0–1. */
  fraction: number;
  /**
   * Coverage of the upper third of the frame, where the crown and
   * hairline sit in Tress's guided angles.
   */
  upperFraction: number;
  /**
   * How much of the mask sits above the frame's midline, 0–1. Shifts here
   * across months usually mean the phone moved, not the hair.
   */
  verticalBalance: number;
  /**
   * How much of the mask sits left of the frame's centre line, 0–1. Half
   * means the head was square to the camera; markedly more on one side
   * means it was turned. Like the vertical figure it is a reading of the
   * framing, and its only use is telling two months apart from a moved
   * phone. Optional in the type because readings stored before it existed
   * have no split, and a guessed 0.5 would read as "square" for a
   * photograph nobody measured.
   */
  horizontalBalance?: number;
  /** Pixels counted as hair. Kept so callers can reject tiny masks. */
  pixels: number;
};

export function coverageOf(mask: MaskImage): Coverage {
  const { width, height, data } = mask;
  const total = width * height;
  if (total === 0) {
    return { fraction: 0, upperFraction: 0, verticalBalance: 0, horizontalBalance: 0, pixels: 0 };
  }

  let pixels = 0;
  let upper = 0;
  let aboveMid = 0;
  let leftOfMid = 0;

  const thirdRow = Math.floor(height / 3);
  const midRow = Math.floor(height / 2);
  const midCol = width / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[y * width + x] < HAIR) continue;
      pixels += 1;
      if (y < thirdRow) upper += 1;
      if (y < midRow) aboveMid += 1;
      // Pixel centres, so an odd-width frame's middle column splits evenly
      // rather than landing wholly on one side.
      if (x + 0.5 < midCol) leftOfMid += 1;
    }
  }

  return {
    fraction: pixels / total,
    upperFraction: upper / Math.max(1, thirdRow * width),
    verticalBalance: pixels === 0 ? 0 : aboveMid / pixels,
    horizontalBalance: pixels === 0 ? 0 : leftOfMid / pixels,
    pixels,
  };
}

/** Index of the hair class in the segmenter's output. 0 is background. */
const HAIR_CLASS = 1;

/**
 * Pulls the hair channel out of the model's output.
 *
 * The segmenter emits one confidence per class per pixel, interleaved.
 * It lives here, with the rest of the pure arithmetic, so it can be
 * tested without dragging the native runtime in — getting the stride
 * wrong produces a plausible-looking mask of the wrong thing.
 */
export function hairChannel(
  output: Float32Array,
  side: number,
  classes: number,
): MaskImage {
  const data = new Float32Array(side * side);
  for (let p = 0; p < data.length; p += 1) {
    data[p] = output[p * classes + HAIR_CLASS];
  }
  return { width: side, height: side, data };
}

export type CoverageTrend = {
  /** Change in coverage fraction between the two readings, in points. */
  deltaPoints: number;
  /**
   * Whether the change is large enough to be worth mentioning at all.
   *
   * Two photographs of the same head minutes apart differ by a point or
   * two from framing alone, so anything inside that band is noise and is
   * reported as "no measurable change" rather than as a small win. This
   * is the guard that stops the feature becoming a slot machine.
   */
  meaningful: boolean;
  /** True when the two readings are too far apart in framing to compare. */
  framingSuspect: boolean;
};

/** Below this, a difference is indistinguishable from how the phone was held. */
const NOISE_POINTS = 2.5;
/** Vertical balance shifting more than this means the framing moved. */
const BALANCE_TOLERANCE = 0.12;

export function compareCoverage(now: Coverage, before: Coverage): CoverageTrend {
  const deltaPoints = (now.fraction - before.fraction) * 100;
  const framingSuspect =
    Math.abs(now.verticalBalance - before.verticalBalance) > BALANCE_TOLERANCE;

  return {
    deltaPoints,
    // A difference only counts when it clears the noise band *and* the
    // framing held. Either one failing makes the number unreadable.
    meaningful: Math.abs(deltaPoints) >= NOISE_POINTS && !framingSuspect,
    framingSuspect,
  };
}

/**
 * How a coverage reading should be described, if at all.
 *
 * Returns null when there is nothing honest to say, and callers are
 * expected to render nothing rather than reaching for a filler sentence.
 */
export function describeTrend(trend: CoverageTrend): string | null {
  if (trend.framingSuspect) {
    return 'These two were framed differently enough that comparing the coverage would mostly measure the camera. Worth matching the framing next time.';
  }
  if (!trend.meaningful) {
    return 'No measurable change in coverage between these two. Over a single month that is the usual and expected result.';
  }
  const direction = trend.deltaPoints > 0 ? 'more' : 'less';
  return `The mask covers ${Math.abs(trend.deltaPoints).toFixed(1)} points ${direction} of the frame than last time. That is area, not thickness — it moves with haircuts and styling too.`;
}
