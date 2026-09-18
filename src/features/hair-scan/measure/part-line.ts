/**
 * Looking for a parting in a segmentation mask.
 *
 * ── Why a parting, of everything on a head ────────────────────────────
 * A segmentation mask is a bad instrument for almost every question
 * people want to ask it. It cannot see between strands, so it cannot
 * measure how much hair there is; it moves with a haircut, with water,
 * with how far away the phone was held. `hair-mask.ts` says all of this
 * at length and it is still true.
 *
 * A parting is the exception, and it is worth being precise about why.
 * It is not a judgement about a head — it is a piece of GEOMETRY that
 * either is or is not in the picture: a narrow, straight, elongated run
 * of scalp with hair on both sides of it, repeated down many rows. That
 * shape is the one thing in a mask a person cannot mistake for anything
 * else, and it is the one thing an algorithm can be held to, because it
 * can be stated as a rule rather than as a feeling. Everything here is
 * that rule, written out.
 *
 * ── What this is not ──────────────────────────────────────────────────
 * It is not a measurement of hair. It says where a line of scalp is, how
 * wide the mask makes it, and how much of the line the mask actually
 * calls scalp. A wider reading is not a worse head: a parting is wider
 * when it is combed harder, when the hair is wet, when the light is flat.
 * Nothing here produces a score, a stage, a trend or a forecast, and
 * nothing here may be used to make one.
 *
 * It is also not a detector of "having a parting". Most people scanning
 * with this app will not have one in frame — short hair has no parting
 * at all, and hair pulled back has none where the camera can see it. The
 * funnel asks the person directly (`HairWearing` in domain.ts) and that
 * answer, not this function, is what decides whether the question is
 * worth asking. This function's job is narrower and more honest: given a
 * window of mask that might contain a parting, either find one that
 * satisfies every rule below, or return nothing.
 *
 * ── Returning nothing is the common case ──────────────────────────────
 * The failure that matters is not missing a parting. It is inventing
 * one: a shadow, a whorl, a few misclassified pixels becoming a line the
 * report then describes. Every threshold below is set on that side, and
 * `scripts/test/hair-scan-part-line.test.ts` attacks it from that side —
 * the false-positive case is the test that decides whether any of this
 * is usable.
 *
 * ── Two layers ────────────────────────────────────────────────────────
 * `searchPartLine` is the arithmetic: a rectangle of mask in, a line or
 * a reason out, in whatever units the caller's `PartFrame` names. It
 * knows nothing about heads and is tested on synthetic rectangles.
 *
 * `readPartLine` is the one a scan calls. It takes the `FaceFrame` the
 * measurement lane built and resamples the part window — the union of
 * that lane's `midScalp` and `crown` boxes — off the photograph and onto
 * the face's own coordinates BEFORE searching it. That is not a nicety:
 * an image-axis search on a head photographed with the phone turned
 * would report the parting leaning by however far the phone was turned.
 * What comes back from `readPartLine` is `u` — face half-widths from the
 * brow centre — which is the same place on the same head at any
 * distance, turn or tilt, and is therefore the only form of this reading
 * that two scans months apart could ever be compared in.
 *
 * ── The limit that decides how this may be used ───────────────────────
 * `position` and `angle` are stable. `width` is NOT. It is the answer to
 * "where did the 0.5 hair threshold cut this gradient", and that cut
 * moves with light, focus and the model's confidence: the same soft
 * parting, painted four times at four model confidences, reads five
 * pixels wide and one pixel wide with its position unmoved (there is a
 * test). So width may be reported as what this photograph's mask made of
 * it, and may never be subtracted from another scan's width and called a
 * change in anybody's hair.
 *
 * ── Not a worklet ─────────────────────────────────────────────────────
 * Like `coverageOf` in hair-mask.ts, this runs over a mask decoded from
 * a still, on the JS thread, after the camera has finished. It carries
 * no `'worklet'` directive because nothing calls it from one. If that
 * ever changes, every function in this file needs the directive — and
 * none of them may then take a default parameter, because a default that
 * reads a module constant is captured wrong inside a worklet.
 *
 * Pure: no React, nothing native, no clock. Loaded by `node --test`.
 */

import { HAIR, type MaskImage } from '@/features/assessment/hair-mask';

import { readRegion } from './coverage';
import {
  clamp01 as clampShare,
  regionBox,
  toImage,
  type FaceBox,
  type FaceFrame,
  type ScanRegion,
} from './regions';

/* ------------------------------- the frame ------------------------------- */

/**
 * The rectangle to search, in the cells of whatever mask is handed in.
 *
 * `readPartLine` fills this in from the face frame. A caller passing its
 * own gets exactly what it asks for: nothing here knows where a head is,
 * so a wrong rectangle is faithfully searched and its geometry honestly
 * reported.
 */
export type MaskWindow = { x: number; y: number; width: number; height: number };

/**
 * How a mask pixel maps to the units the caller wants back.
 *
 * A mask pixel is not a unit anybody outside this file should reason in:
 * the same head fills a different number of pixels in every photograph.
 * So the caller hands in the mapping to its own face-anchored frame —
 * `originX + x * perPixelX` for a pixel's x, and the same down — and
 * `position`, `width` and `angle` come back in that frame. Build it from
 * whatever the measurement lane anchors on (the head cap's extent, say)
 * and two readings taken months apart are comparable; use `MASK_PIXELS`
 * and they are not.
 */
export type PartFrame = {
  originX: number;
  originY: number;
  perPixelX: number;
  perPixelY: number;
};

/** The identity frame: results come back in mask pixels. For tests and for callers that have no anchor yet. */
export const MASK_PIXELS: PartFrame = Object.freeze({
  originX: 0,
  originY: 0,
  perPixelX: 1,
  perPixelY: 1,
});

/* ------------------------------ the thresholds --------------------------- */

/**
 * Every number the search turns on, in one place, so a claim about what
 * it will and will not accept can be checked against the code.
 *
 * ── Which of these are shares, and which are not ──────────────────────
 * The header this replaced said they were all stated as shares of the
 * search window, so two resolutions are searched alike. Half of them are
 * not, and the half that is not is worth knowing about.
 *
 * Shares of the search window: `maxWidth`, `tolerance`, `minExtent`,
 * `minSpan`. The same parting rasterised into a coarser or a finer grid
 * is judged by the same geometry by these four.
 *
 * Shares of something else, and resolution-free for that reason:
 * `minFlank` and `minContrast` are shares of the pixels actually
 * sampled, `minConfidence` is a floor on a 0–1 score.
 *
 * Not shares at all:
 *  - `minRows` and `minColumns` are absolute cell counts. They are a
 *    floor on arithmetic rather than on geometry: fewer than eight rows
 *    is too few points to fit a line through, whatever those rows
 *    represent on a head.
 *  - `maxTilt` and `tiltStep` are degrees. An angle needs no resolution
 *    to mean something; the step is how finely the angle is searched,
 *    and it costs time rather than meaning.
 *  - `runsPerRow` is an absolute count per row, and it IS
 *    resolution-dependent — exactly the way the old header denied. A
 *    textured head rasterised into 48 cells presents fewer, fatter runs
 *    per row than the same head at 96, so the cap bites harder on the
 *    coarse grid. `readPartLine` fixes the resolution at `RECTIFY_STEPS`,
 *    which is why this is tolerable here; a caller searching a raw mask
 *    of its own at some other resolution is choosing a slightly
 *    different filter, and should know that it is choosing one.
 */
export const PART_LIMITS = Object.freeze({
  /** Rows the window needs before the search is worth running at all. */
  minRows: 8,
  /** Columns the window needs. */
  minColumns: 8,
  /**
   * A scalp run wider than this share of the window is not a parting.
   * It is a bare patch, a badly cut mask, or the edge of the hair — all
   * of which are things this function refuses to name.
   */
  maxWidth: 0.22,
  /** How far off the fitted line a row's run may sit, as a share of the window's width. */
  tolerance: 0.05,
  /** Rows the fitted line must be found on, as a share of the window's height. */
  minExtent: 0.45,
  /** The longest UNBROKEN stretch of those rows. A parting is continuous; noise is not. */
  minSpan: 0.35,
  /** Hair the bands either side of the stripe must carry, as a share of the pixels sampled. */
  minFlank: 0.55,
  /**
   * How much MORE hair the flanks must carry than the stripe does.
   *
   * The rule that stops a broken mask drawing a line, and the one that
   * had to be added after the sweep below was widened. A parting is a
   * CONTRAST, not an absolute: what makes it a parting is that the bands
   * either side of it are hair and it is not. Measuring only the flanks
   * cannot tell the two apart in a mask that is noisy everywhere —
   * sprinkle 35 per cent of a mask with false scalp and the flanks still
   * read 0.65 hair, which clears `minFlank` comfortably while the
   * "stripe" is 0.44 hair as well, because it is the same noise.
   *
   * Measured, and pinned by `part line: the confidence floor, measured`:
   * over 480 noise masks the largest contrast any phantom reached is far
   * below this, while the weakest parting the structural rules admit at
   * all — one running down just over `minExtent` of the window — clears
   * it with room to spare. The test asserts both sides.
   */
  minContrast: 0.35,
  /** Degrees either side of the frame's vertical that are searched. */
  maxTilt: 60,
  /** The step the tilt is searched at, in degrees. */
  tiltStep: 1,
  /**
   * The most scalp runs one row may contribute, widest first.
   * A row with more enclosed runs than this is textured hair rather than
   * a parting, and letting every one of them vote would turn a noisy
   * mask into a haystack of candidate lines.
   */
  runsPerRow: 8,
  /**
   * Below this the reading is not returned at all.
   *
   * ── What this number is, after the sweep was widened ──────────────────
   * It used to be the whole defence against a phantom, and it was not
   * good enough. Widening the noise sweep to 480 masks across eight
   * densities found one — 35 per cent misclassification, no parting in
   * it anywhere — that scored 0.5024 and came back as a LINE. `minFlank`
   * had passed it, because in a mask that is noise everywhere the bands
   * beside a "stripe" are as much hair as anything else is. That is what
   * `minContrast` above was added for, and with it in place the same 480
   * masks produce nothing at all: 228 of them reach the contrast rule
   * and the strongest contrast any of them musters is about 0.22,
   * against a bar of 0.35.
   *
   * So this floor is no longer fitted to a phantom population — there is
   * no longer one for it to be fitted to — and it would be dishonest to
   * keep claiming it is. It is a second line behind the structural
   * rules, and what sets it now is the bottom of the LEGITIMATE side: a
   * parting drawn down 22 of 48 rows clears `minExtent` (0.458 against
   * 0.45) and scores 0.4998, so it is refused; 23 rows scores 0.5316 and
   * is kept. In other words 0.5 is, in practice, a slightly stricter
   * restatement of `minExtent` — and the fact that a round 0.5 lands two
   * ten-thousandths above that reading is a coincidence, not a measured
   * separation, and must not be described as one.
   *
   * `part line: the confidence floor, measured` in
   * `scripts/test/hair-scan-part-line.test.ts` runs the whole sweep on
   * every `npm test` and asserts both sides of it. It asserts the counts
   * exactly (480 noise masks, zero partings) but the contrast margin as
   * a bound rather than a float: the band search tie-breaks on `Math.cos`,
   * which the language does not pin to the last bit across platforms.
   */
  minConfidence: 0.5,
});

/* ------------------------------- the reading ----------------------------- */

/**
 * One parting, as geometry.
 *
 * Every field is measured. None of them is a judgement, and none of them
 * may be compared against anybody else's.
 */
export type PartLine = {
  /**
   * Where the line crosses the window's horizontal midline, in the
   * caller's frame. The reference row is the middle rather than the top
   * so a small error in the angle does not move the position much.
   */
  position: number;
  /**
   * Degrees from the frame's vertical, positive leaning towards +x as y
   * increases. Zero is a parting straight down the frame.
   */
  angle: number;
  /** The stripe's mean width, in the caller's frame. */
  width: number;
  /**
   * Of the stripe swept down the WHOLE window, the share the mask calls
   * scalp rather than hair, 0–1. A parting that closes half way down
   * reads near a half here, which is the honest way to say it.
   */
  scalpShare: number;
  /**
   * Of the two bands beside the stripe, swept down the whole window, the
   * share the mask calls hair, 0–1. What makes the stripe a parting
   * rather than a hole: `flankShare + scalpShare - 1` is the contrast
   * `minContrast` insists on, recoverable from the reading itself.
   */
  flankShare: number;
  /** The share of the window's rows the line was found on at all, 0–1. */
  extent: number;
  /** The longest unbroken stretch of those rows, as a share of the window's height, 0–1. */
  span: number;
  /** How many rows the fit was made from. */
  rows: number;
  /**
   * 0–1, from how much of the window the line spans unbroken, how
   * tightly the rows sit on it, how much hair the flanks carry and how
   * open the stripe is. It is a statement about the evidence in THIS
   * mask, never about the person.
   */
  confidence: number;
};

/** Why no parting was returned. Kept because "null" alone is not a finding anybody can act on. */
export type PartRejection =
  /** The head was not turned far enough for the top of it to be in the picture. */
  | 'notVisible'
  /** The window was too small to search. */
  | 'windowTooSmall'
  /** Nothing in the window looked like a narrow run of scalp with hair either side. */
  | 'noScalpRuns'
  /** The best line was found on too few of the window's rows. */
  | 'tooShort'
  /** Those rows did not run on: scattered agreement, not a line. */
  | 'tooBroken'
  /** The stripe was not bounded by hair — a bare area, not a parting. */
  | 'flanksNotHair'
  /**
   * The stripe was no more scalp than the hair beside it. That is a
   * noisy mask, not a parting: the shape only exists as a difference.
   */
  | 'noContrast'
  /** Everything held, but not well enough to be worth saying. */
  | 'tooFaint';

/**
 * The search's whole result: a line, or the reason there is none.
 *
 * Two refusals carry the number that caused them: `tooFaint` carries the
 * confidence that fell short, `noContrast` the contrast that did. They
 * are there so the thresholds those two numbers ride on can be MEASURED
 * rather than asserted — the sweep in the test file reads them to show
 * how far a mask of pure noise gets — and they are NOT readings. A
 * refused number may never be shown to anybody, compared with another
 * scan's, or softened into a faint parting: the search said there is no
 * parting here, and that is the whole of what it said.
 */
export type PartSearch =
  | { line: PartLine; reason: null }
  | { line: null; reason: PartRejection; confidence?: number; contrast?: number };

/* -------------------------------- internals ------------------------------ */

/** One row's candidate: a maximal run of scalp with hair on both sides of it, inside the window. */
type ScalpRun = { row: number; centre: number; width: number };

/** A run projected onto the axis across a candidate tilt. */
type Projected = { run: ScalpRun; d: number };

const clamp01 = clampShare;

/** The window, clipped to the mask and rounded to whole pixels. Null when nothing usable is left. */
function clipWindow(mask: MaskImage, window: MaskWindow): MaskWindow | null {
  if (!Number.isFinite(window.x) || !Number.isFinite(window.y)) return null;
  if (!Number.isFinite(window.width) || !Number.isFinite(window.height)) return null;
  const x0 = Math.max(0, Math.floor(window.x));
  const y0 = Math.max(0, Math.floor(window.y));
  const x1 = Math.min(mask.width, Math.ceil(window.x + window.width));
  const y1 = Math.min(mask.height, Math.ceil(window.y + window.height));
  if (x1 - x0 < PART_LIMITS.minColumns || y1 - y0 < PART_LIMITS.minRows) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Whether the mask calls this pixel hair. The one place the threshold is read. */
function isHair(mask: MaskImage, x: number, y: number): boolean {
  return mask.data[y * mask.width + x] >= HAIR;
}

/**
 * Every scalp run in the window that could be part of a parting.
 *
 * A run counts when it is a maximal stretch of not-hair that does not
 * touch either edge of the window — so it has hair on both sides of it by
 * construction — and is no wider than `maxWidth`. Touching an edge is
 * what rules out a receded hairline or the background beside a head:
 * those are open on one side, and a parting never is.
 */
function scalpRuns(mask: MaskImage, window: MaskWindow): ScalpRun[] {
  const maxWidth = Math.max(1, window.width * PART_LIMITS.maxWidth);
  const left = window.x;
  const right = window.x + window.width - 1;
  const runs: ScalpRun[] = [];

  for (let y = window.y; y < window.y + window.height; y += 1) {
    const inRow: ScalpRun[] = [];
    let start = -1;
    for (let x = left; x <= right; x += 1) {
      const hair = isHair(mask, x, y);
      if (!hair && start === -1) start = x;
      if (hair && start !== -1) {
        // Closed by hair on the right; `start > left` is hair on the left.
        const width = x - start;
        if (start > left && width <= maxWidth) {
          inRow.push({ row: y, centre: (start + x - 1) / 2 + 0.5, width });
        }
        start = -1;
      }
    }
    // A run still open at the right edge is open, not enclosed: dropped.

    if (inRow.length <= PART_LIMITS.runsPerRow) {
      for (const run of inRow) runs.push(run);
      continue;
    }
    /*
      A row with more candidates than a parting could account for is
      textured hair. The widest few are kept — a parting is the widest
      enclosed run in its row far more often than it is the narrowest —
      and the sort is stable, so the result does not depend on the
      order the runs were found in.
    */
    const widest = inRow
      .map((run, index) => ({ run, index }))
      .sort((a, b) => b.run.width - a.run.width || a.index - b.index)
      .slice(0, PART_LIMITS.runsPerRow)
      .sort((a, b) => a.index - b.index);
    for (const { run } of widest) runs.push(run);
  }

  return runs;
}

/**
 * The tilt and the band of runs that agree best about a line.
 *
 * A deterministic stand-in for RANSAC: every tilt in the range is tried,
 * the runs are projected onto the axis across it, and the widest
 * agreement is the densest band of projections `2 × tolerance` wide —
 * counted in DISTINCT ROWS, so one row full of runs cannot vote itself a
 * line. Nothing is random, so the same mask gives the same answer every
 * time, which a report has to be able to promise.
 */
function bestBand(
  runs: ScalpRun[],
  window: MaskWindow,
  tolerance: number,
): { tilt: number; inliers: ScalpRun[] } | null {
  const cx = window.x + window.width / 2;
  const cy = window.y + window.height / 2;
  const rowCount = new Int32Array(window.height);

  let bestRows = 0;
  let bestSpread = Number.POSITIVE_INFINITY;
  let bestTilt = 0;
  let bestInliers: ScalpRun[] | null = null;

  const steps = Math.round((2 * PART_LIMITS.maxTilt) / PART_LIMITS.tiltStep);
  for (let step = 0; step <= steps; step += 1) {
    const tilt = -PART_LIMITS.maxTilt + step * PART_LIMITS.tiltStep;
    const radians = (tilt * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    const projected: Projected[] = runs.map((run) => ({
      run,
      d: (run.centre - cx) * cos - (run.row + 0.5 - cy) * sin,
    }));
    projected.sort((a, b) => a.d - b.d);

    rowCount.fill(0);
    let distinct = 0;
    let low = 0;
    for (let high = 0; high < projected.length; high += 1) {
      const enteringRow = projected[high].run.row - window.y;
      if (rowCount[enteringRow] === 0) distinct += 1;
      rowCount[enteringRow] += 1;

      while (projected[high].d - projected[low].d > 2 * tolerance) {
        const leavingRow = projected[low].run.row - window.y;
        rowCount[leavingRow] -= 1;
        if (rowCount[leavingRow] === 0) distinct -= 1;
        low += 1;
      }

      const spread = projected[high].d - projected[low].d;
      // More rows wins; then the tighter band; then the straighter line.
      const better =
        distinct > bestRows ||
        (distinct === bestRows &&
          (spread < bestSpread - 1e-9 ||
            (Math.abs(spread - bestSpread) <= 1e-9 && Math.abs(tilt) < Math.abs(bestTilt))));
      if (!better) continue;
      bestRows = distinct;
      bestSpread = spread;
      bestTilt = tilt;
      bestInliers = projected.slice(low, high + 1).map((p) => p.run);
    }
  }

  if (!bestInliers || bestRows === 0) return null;
  return { tilt: bestTilt, inliers: bestInliers };
}

/** One run per row — the widest, so a row that also carries noise still votes for the parting. */
function onePerRow(inliers: ScalpRun[]): ScalpRun[] {
  const byRow = new Map<number, ScalpRun>();
  for (const run of inliers) {
    const held = byRow.get(run.row);
    if (!held || run.width > held.width) byRow.set(run.row, run);
  }
  return [...byRow.values()].sort((a, b) => a.row - b.row);
}

/** The longest unbroken stretch of rows in an ascending, unique list. */
function longestRun(rows: number[]): number {
  let longest = 0;
  let current = 0;
  for (let i = 0; i < rows.length; i += 1) {
    current = i > 0 && rows[i] === rows[i - 1] + 1 ? current + 1 : 1;
    if (current > longest) longest = current;
  }
  return longest;
}

/** Least squares of x against y, pivoted on the window's middle row. */
function fitLine(rows: ScalpRun[], cy: number): { at: number; slope: number; rms: number } {
  let sumY = 0;
  let sumX = 0;
  let sumYY = 0;
  let sumXY = 0;
  for (const run of rows) {
    const y = run.row + 0.5 - cy;
    sumY += y;
    sumX += run.centre;
    sumYY += y * y;
    sumXY += y * run.centre;
  }
  const n = rows.length;
  const denominator = n * sumYY - sumY * sumY;
  const slope = Math.abs(denominator) < 1e-9 ? 0 : (n * sumXY - sumY * sumX) / denominator;
  const at = (sumX - slope * sumY) / n;

  let squared = 0;
  for (const run of rows) {
    const residual = run.centre - (at + slope * (run.row + 0.5 - cy));
    squared += residual * residual;
  }
  return { at, slope, rms: Math.sqrt(squared / n) };
}

/** The share of a horizontal span of one row the mask calls hair, and how many pixels that was. */
function hairShareIn(
  mask: MaskImage,
  window: MaskWindow,
  y: number,
  from: number,
  to: number,
): { hair: number; total: number } {
  const left = Math.max(window.x, Math.floor(from));
  const right = Math.min(window.x + window.width - 1, Math.ceil(to));
  let hair = 0;
  let total = 0;
  for (let x = left; x <= right; x += 1) {
    const centre = x + 0.5;
    if (centre < from || centre > to) continue;
    total += 1;
    if (isHair(mask, x, y)) hair += 1;
  }
  return { hair, total };
}

/* --------------------------------- the search ---------------------------- */

/**
 * Looks for a parting in one window of one mask.
 *
 * The rules, in the order they are applied — a candidate has to survive
 * all of them:
 *
 *  1. The window is big enough to hold a line.
 *  2. There are runs of scalp, narrow, with hair on both sides.
 *  3. Some straight line is shared by nearly half the window's rows.
 *  4. Those rows RUN ON. Scattered agreement is not a parting, and this
 *     is the rule that stops a noisy mask producing one.
 *  5. The bands either side of the stripe are mostly hair.
 *  6. And they are markedly MORE hair than the stripe is. Rule 5 asks
 *     whether the flanks look like hair; this asks whether the stripe
 *     looks different from them, which is the only question a mask that
 *     is noisy everywhere cannot answer yes to.
 *  7. What is left is strong enough to be worth saying.
 *
 * `frame` maps mask pixels to the caller's own units; every number that
 * comes out is in that frame, and the shares (`scalpShare`, `extent`,
 * `span`, `confidence`) are in no units at all.
 */
export function searchPartLine(
  mask: MaskImage,
  window: MaskWindow,
  frame: PartFrame,
): PartSearch {
  const clipped = clipWindow(mask, window);
  if (!clipped) return { line: null, reason: 'windowTooSmall' };

  const runs = scalpRuns(mask, clipped);
  if (runs.length === 0) return { line: null, reason: 'noScalpRuns' };

  const tolerance = Math.max(0.5, clipped.width * PART_LIMITS.tolerance);
  const band = bestBand(runs, clipped, tolerance);
  if (!band) return { line: null, reason: 'noScalpRuns' };

  const chosen = onePerRow(band.inliers);
  const extent = chosen.length / clipped.height;
  if (extent < PART_LIMITS.minExtent) return { line: null, reason: 'tooShort' };

  const span = longestRun(chosen.map((run) => run.row)) / clipped.height;
  if (span < PART_LIMITS.minSpan) return { line: null, reason: 'tooBroken' };

  const cy = clipped.y + clipped.height / 2;
  const fit = fitLine(chosen, cy);
  const widthPx =
    chosen.reduce((total, run) => total + run.width, 0) / chosen.length;

  /*
    The stripe swept down the whole window, and the two bands beside it.
    Sweeping the WHOLE window rather than only the rows that voted is
    what makes `scalpShare` an honest number: a parting that closes half
    way down reads as half open, not as fully open over half a head.
  */
  let stripeScalp = 0;
  let stripePixels = 0;
  let flankHair = 0;
  let flankPixels = 0;
  const half = widthPx / 2;
  const flankWidth = Math.max(1, widthPx);
  for (let y = clipped.y; y < clipped.y + clipped.height; y += 1) {
    const centre = fit.at + fit.slope * (y + 0.5 - cy);
    const stripe = hairShareIn(mask, clipped, y, centre - half, centre + half);
    stripeScalp += stripe.total - stripe.hair;
    stripePixels += stripe.total;

    const left = hairShareIn(mask, clipped, y, centre - half - flankWidth, centre - half);
    const right = hairShareIn(mask, clipped, y, centre + half, centre + half + flankWidth);
    flankHair += left.hair + right.hair;
    flankPixels += left.total + right.total;
  }

  if (flankPixels === 0) return { line: null, reason: 'flanksNotHair' };
  const flankShare = flankHair / flankPixels;
  if (flankShare < PART_LIMITS.minFlank) return { line: null, reason: 'flanksNotHair' };
  const scalpShare = stripePixels === 0 ? 0 : stripeScalp / stripePixels;

  /*
    The contrast rule. `flankShare` is how much hair the bands beside the
    stripe carry; `1 - scalpShare` is how much the stripe itself carries.
    A parting is the difference between them. A mask that is noise from
    edge to edge has no difference to show, however generous its flanks
    look in isolation.
  */
  const contrast = flankShare - (1 - scalpShare);
  if (contrast < PART_LIMITS.minContrast) return { line: null, reason: 'noContrast', contrast };

  /*
    Four legs, multiplied rather than averaged: a candidate that is weak
    on any one of them is weak, and an average would let three strong
    legs carry a broken line. `minSpan` and `minFlank` are the floors the
    thresholds above already enforce, so each leg is scored from its
    floor upwards — a line that only just passed scores near zero.
  */
  const spanLeg = clamp01((span - PART_LIMITS.minSpan) / (1 - PART_LIMITS.minSpan));
  const tightLeg = clamp01(1 - fit.rms / tolerance);
  const flankLeg = clamp01((flankShare - PART_LIMITS.minFlank) / (1 - PART_LIMITS.minFlank));
  const openLeg = clamp01(scalpShare);
  const confidence = clamp01(
    Math.pow(spanLeg, 0.3) *
      Math.pow(tightLeg, 0.25) *
      Math.pow(flankLeg, 0.25) *
      Math.pow(openLeg, 0.2),
  );
  if (confidence < PART_LIMITS.minConfidence) {
    return { line: null, reason: 'tooFaint', confidence };
  }

  return {
    line: {
      position: frame.originX + fit.at * frame.perPixelX,
      angle: (Math.atan2(fit.slope * frame.perPixelX, frame.perPixelY) * 180) / Math.PI,
      width: widthPx * frame.perPixelX,
      scalpShare,
      flankShare,
      extent,
      span,
      rows: chosen.length,
      confidence,
    },
    reason: null,
  };
}

/**
 * The parting in this window, or nothing.
 *
 * Nothing is the ordinary answer, and callers must treat it as one: it
 * means this mask does not show a parting, never that the person has
 * none and never that anything is wrong with their hair. Use
 * `searchPartLine` when the reason matters.
 */
export function findPartLine(
  mask: MaskImage,
  window: MaskWindow,
  frame: PartFrame,
): PartLine | null {
  return searchPartLine(mask, window, frame).line;
}

/* ------------------------- reading a real face frame ---------------------- */

/**
 * The two regions whose boxes the part window is the union of.
 *
 * A parting is not confined to either of them. It runs from the front
 * hairline back over the top of the skull, which is `midScalp` and
 * `crown` end to end — and neither on its own is tall enough for the
 * span rule below to mean much. So the window is their union, taken from
 * `regionBox` rather than written out again here, so it follows the
 * measurement lane's geometry the day that geometry is re-tuned.
 *
 * `partLine` is deliberately NOT in this list. That region is the
 * mid-sagittal strip — a third of a face wide — and a parting filling it
 * leaves no hair either side of itself to be enclosed by, which is the
 * one thing this search insists on.
 */
export const PART_WINDOW_REGIONS: readonly ScanRegion[] = ['midScalp', 'crown'];

/**
 * Cells across the shorter side of the rectified window.
 *
 * The window is resampled into a grid of SQUARE cells — square in face
 * units, not in image pixels — so that `maxWidth`, `tolerance` and
 * `minSpan` all mean the same thing across the window as they do down
 * it, and an angle in the grid is already an angle on the face.
 */
export const RECTIFY_STEPS = 48;

/** The union of the part window's regions, in face coordinates. */
export function partWindowBox(): FaceBox {
  const boxes = PART_WINDOW_REGIONS.map(regionBox);
  return {
    u0: Math.min(...boxes.map((b) => b.u0)),
    u1: Math.max(...boxes.map((b) => b.u1)),
    v0: Math.min(...boxes.map((b) => b.v0)),
    v1: Math.max(...boxes.map((b) => b.v1)),
  };
}

/**
 * The part window resampled off the image and onto the face.
 *
 * `toImage` turns a face coordinate into an image fraction, and the face
 * frame has already absorbed the roll, the turn and the distance — so
 * walking a square grid in FACE coordinates and reading the mask at each
 * point straightens the window out. What comes back is a small mask in
 * which "down" is down the person's head rather than down the
 * photograph, which is the only frame in which a parting's position is
 * worth writing down twice.
 *
 * A sample that lands outside the image is written as hair. That is the
 * safe direction and it is deliberate: scalp is what makes a parting, so
 * filling the unknown with scalp would let the edge of a photograph
 * draw one.
 *
 * `inFrame` reports how much of the window was really there. Nothing
 * gates on it: `readPartLine` asks `readRegion` about each of the two
 * regions instead, which is the same question asked per region rather
 * than averaged over the pair. It is returned because a caller
 * rectifying a window itself has no other way to know.
 */
export function rectifyPartWindow(
  mask: MaskImage,
  frame: FaceFrame,
): { grid: MaskImage; gridFrame: PartFrame; inFrame: number } | null {
  if (!(mask.width > 0) || !(mask.height > 0)) return null;
  if (mask.data.length < mask.width * mask.height) return null;

  const box = partWindowBox();
  const uSpan = box.u1 - box.u0;
  const vSpan = box.v1 - box.v0;
  if (!(uSpan > 0) || !(vSpan > 0)) return null;

  const cell = Math.min(uSpan, vSpan) / RECTIFY_STEPS;
  const columns = Math.max(2, Math.round(uSpan / cell));
  const rows = Math.max(2, Math.round(vSpan / cell));
  const data = new Float32Array(columns * rows);

  let inside = 0;
  for (let j = 0; j < rows; j += 1) {
    const v = box.v0 + ((j + 0.5) / rows) * vSpan;
    for (let i = 0; i < columns; i += 1) {
      const u = box.u0 + ((i + 0.5) / columns) * uSpan;
      const p = toImage(frame, { u, v });
      if (!(p.x >= 0) || !(p.y >= 0) || p.x >= 1 || p.y >= 1) {
        data[j * columns + i] = 1;
        continue;
      }
      const col = Math.min(mask.width - 1, Math.floor(p.x * mask.width));
      const row = Math.min(mask.height - 1, Math.floor(p.y * mask.height));
      const value = mask.data[row * mask.width + col];
      if (!Number.isFinite(value)) {
        data[j * columns + i] = 1;
        continue;
      }
      inside += 1;
      data[j * columns + i] = value;
    }
  }

  return {
    grid: { width: columns, height: rows, data },
    gridFrame: {
      originX: box.u0 + (0.5 * uSpan) / columns,
      originY: box.v0 + (0.5 * vSpan) / rows,
      perPixelX: uSpan / columns,
      perPixelY: vSpan / rows,
    },
    inFrame: inside / (columns * rows),
  };
}

/**
 * The parting on one face, in that face's own coordinates.
 *
 * `position` comes back as `u` — face half-widths from the brow centre,
 * positive towards image-right — at the middle of the window, `width` in
 * the same unit, and `angle` in degrees from the face's own vertical.
 * Those three are the readings worth keeping, because they are the ones
 * the face frame makes comparable between two photographs taken months
 * apart at different distances and different angles.
 *
 * ── The visibility bar ────────────────────────────────────────────────
 * A head that is not tipped forward has no top of skull in the picture,
 * and a part search run on the forehead instead would find the shadow
 * beside a nose. So the window is only searched when the camera could
 * actually see it — and the bar is not a second rule written here. It is
 * `readRegion` itself, asked of EACH of the two regions the window is
 * made of, and both have to answer.
 *
 * Asking both, rather than the better of the two, is the difference
 * between a claim and a fact. The two regions face very different ways —
 * `crown`'s normal is twenty-five degrees further back than `midScalp`'s
 * — so at a shallow chin-down the forehead region is readable while the
 * crown is edge-on and `readRegion` would refuse it outright. Gating on
 * the better of them would open the window on exactly that pose and then
 * search a crown box the measurement lane had already declared unread.
 * The crown is over half the window's height; searching it there would
 * be searching the room.
 *
 * `quality` is passed as 1 because only the refusal matters here: it is
 * the frame's own shutter score, it is carried through `readRegion`
 * untouched, and it takes no part in the visibility decision.
 */
export function readPartLine(mask: MaskImage, frame: FaceFrame): PartSearch {
  const visible = PART_WINDOW_REGIONS.every(
    (region) => readRegion(mask, frame, region, 1) !== null,
  );
  if (!visible) return { line: null, reason: 'notVisible' };
  const rectified = rectifyPartWindow(mask, frame);
  if (!rectified) return { line: null, reason: 'windowTooSmall' };
  const { grid, gridFrame } = rectified;
  return searchPartLine(grid, { x: 0, y: 0, width: grid.width, height: grid.height }, gridFrame);
}
