/**
 * From a mask to a silhouette the cap can be sat on.
 *
 * `head-cap.ts` knows how to stretch the dome onto a hair silhouette —
 * `fitHairCap` takes one and returns a size and a shape. What it has
 * never had is a silhouette: the segmenter produces a grid of
 * confidences and the cap wants an outline in the preview's own points.
 * This file is that step, and only that step.
 *
 * The outline is read twice over by the fit, and the SHAPE is the
 * reading that needs the points: the cap's dial has twenty-four rays,
 * and a ray with nothing in it keeps the dome. So the walk below is
 * thinned to a number of points that leaves every ray of the visible
 * half a handful of them, not to the fewest that carry a bounding box.
 *
 *   mask (side x side confidences)
 *     -> threshold at the same 0.5 boundary the figures are counted at
 *     -> the main connected region, plus any piece of comparable size,
 *        so a dark doorway or a sleeve cannot drag the outline off the
 *        head and hair falling either side of a face is still one head
 *        of hair
 *     -> a walk of each of those regions' boundaries
 *     -> each point mapped into the preview, through the picture the
 *        mask was squashed out of
 *
 * ── Why it refuses ────────────────────────────────────────────────────
 * A classifier looking at a moving head produces nonsense sometimes: a
 * frame where almost nothing is called hair, a frame where almost
 * everything is, a frame that shatters into confetti. Each of those, fed
 * to `fitHairCap`, is a fit — a shape, clamped but wrong — and the cap
 * would ease onto it. So the nonsense is turned away HERE, by returning
 * null, which the mesh's `setHair` reads as a refusal and answers by
 * holding the shape the cap already has. A bad frame costs nothing; only
 * a long run of them lets the cap go back to the standing allowance.
 *
 * ── The mapping, and the assumption inside it ─────────────────────────
 * The sampler squashes the camera's picture into a square with a scale
 * on each axis, so a point in the mask is a point in that picture by a
 * ratio and nothing else. Getting from the picture to the preview needs
 * one more thing: how the AR view lays the camera feed into its own
 * bounds. It fills them — the feed is scaled up until it covers the view
 * and the overflow goes off the edges, centred. That is `aspectFill`
 * below, it is the one thing in this file that cannot be checked without
 * a device, and it is written as a named function taking plain numbers
 * so it can at least be held to its own arithmetic.
 *
 * ── What this is not ──────────────────────────────────────────────────
 * Nothing here is a measurement of anybody. It reads a picture to decide
 * where to draw a wireframe. No number it produces is shown, stored or
 * compared, and it makes no statement about what is on a head.
 *
 * Pure: no React, no React Native, no native module, no clock.
 */

import type { HairSilhouette } from './head-cap';

/** A grid of confidences: what the segmenter hands back. */
export type FitMask = {
  width: number;
  height: number;
  /** Row-major, one value per pixel, 0-1. */
  data: Float32Array | readonly number[];
};

/** A width and a height in the same unit. */
export type FitSize = { width: number; height: number };

/**
 * Where the mask's picture is and how big the preview is.
 *
 * `source` is the camera picture the mask was squashed out of, in its
 * own pixels, turned and mirrored to match what the person is looking
 * at. `view` is the preview, in the app's points — the unit the cap and
 * the tracked face are already in.
 */
export type FitGeometry = {
  source: FitSize;
  view: FitSize;
};

/** How the picture is laid into the preview: one scale and two offsets. */
export type FitProjection = {
  scale: number;
  dx: number;
  dy: number;
};

export const HAIR_FIT = {
  /**
   * Confidence at or above which a pixel counts as hair.
   *
   * The same boundary `hair-mask.ts` counts its figures at. Two numbers
   * would be two places to be wrong and they would disagree silently.
   */
  level: 0.5,
  /**
   * The least of the frame that has to be called hair before the reading
   * is worth anything. Below this the mask is noise — a classifier that
   * found a few hundred scattered pixels has not found a head of hair,
   * and an outline round them would be a shape with no subject.
   */
  minShare: 0.02,
  /**
   * And the most. Past this the mask is not a silhouette of anything: a
   * dark room, a hood, a phone pointed at a shadow. A head fills a large
   * part of a selfie but it does not fill three-quarters of one.
   */
  maxShare: 0.75,
  /**
   * How much of what was called hair has to be in the pieces that get
   * traced.
   *
   * The point of picking regions rather than tracing everything is that
   * a doorway behind somebody, a sleeve, a shadow on a wall does not
   * pull the outline off their head. That only works while the pieces
   * kept are most of what was found: a mask scattered into fifty specks
   * has no subject in it at all, and an outline round the largest speck
   * is a shape with nothing inside it.
   */
  minRegionShare: 0.55,
  /**
   * How big a second piece has to be, against the largest, to be traced
   * with it.
   *
   * Hair is not always one region. Seen from the front, a head of hair
   * long enough to fall either side of the face is two pieces in the
   * mask with a face between them — and tracing only the larger of those
   * would read the hair as being on one side of the head, which is a
   * `shift` the cap would lean over for. So a piece of comparable size
   * is part of the same silhouette. A piece far smaller than the main
   * one is the doorway, and stays out.
   */
  peerShare: 0.35,
  /**
   * The most pieces traced. Hair either side of a face is two; a fringe
   * cut off from the rest by a bright forehead is a third. Past that the
   * mask is fragmenting, and `minRegionShare` above is the rule that
   * catches it.
   */
  maxRegions: 3,
  /** Fewest boundary points before the outline is not an outline. */
  minPoints: 16,
  /**
   * Most points kept. A 256-square region's boundary can run to a
   * thousand pixels, and `fitHairCap` walks the silhouette eight times
   * per call — so every nth point of the walk is kept and the rest
   * dropped. A hundred and sixty is also what keeps the shape honest:
   * spread over the dial's rays it is several boundary points per ray
   * on the half of it the cap occupies, so no single pixel is a ray's
   * whole answer.
   *
   * The extent is what the fit reads, and a stride can step over the
   * single farthest point, so the extent survives NEARLY rather than
   * exactly: measured on a 512-square mask of a head-sized ellipse, the
   * kept outline is within about a point of the traced one on every
   * edge, against a dome the best part of three hundred points tall.
   */
  maxPoints: 160,
  /**
   * The most steps the boundary walk may take before it is abandoned.
   *
   * A stopping rule, not a budget. Moore tracing terminates on any
   * ordinary region, and a region whose boundary is longer than every
   * pixel in the grid is not ordinary — it is the confetti case, and it
   * is better abandoned than walked.
   */
  maxSteps: 8192,
  /**
   * How many times the walk may stand on its start pixel again before it
   * is called finished.
   *
   * Jacob's stopping rule — end when the start is left the way it was
   * first left — closes an ordinary loop on the first return. A ragged
   * region can put the walk back on the start pixel leaving it some
   * OTHER way, and the rule has nothing to say about that: the walk
   * carries on, round the same loop, and the only thing that ever stops
   * it is `maxSteps` above. That costs eight thousand steps of work on
   * exactly the frame that is already the worst one. Three returns is
   * more than any honest outline needs and a great deal less than eight
   * thousand steps.
   *
   * Nothing is lost when it fires: the loop has by then been walked at
   * least once, the extent — which is all `fitHairCap` reads — is
   * complete, and the duplicated points are dropped by `thin`.
   */
  maxStartVisits: 3,
} as const;

/* ------------------------------ projection ----------------------------- */

/**
 * The picture laid into the preview, filling it.
 *
 * The scale is the larger of the two ratios, so whichever axis is short
 * is the one that covers and the other overflows equally at both ends.
 * That is what an AR preview does with the camera feed, and it is what
 * the face's own points were projected through — so a silhouette mapped
 * this way lands in the same space as the head the cap is fitted to.
 *
 * Null when either side has no size: a ratio of zero would put every
 * point of the outline on one spot, and `fitHairCap` would answer for it.
 */
export function aspectFill(source: FitSize, view: FitSize): FitProjection | null {
  const { width: sw, height: sh } = source;
  const { width: vw, height: vh } = view;
  if (!(sw > 0) || !(sh > 0) || !(vw > 0) || !(vh > 0)) return null;
  if (!Number.isFinite(sw) || !Number.isFinite(sh)) return null;
  if (!Number.isFinite(vw) || !Number.isFinite(vh)) return null;
  const scale = Math.max(vw / sw, vh / sh);
  return {
    scale,
    dx: (vw - sw * scale) / 2,
    dy: (vh - sh * scale) / 2,
  };
}

/* --------------------------------- regions ------------------------------ */

/** The mask above the boundary, as ones and zeros. */
function threshold(mask: FitMask): Uint8Array | null {
  const { width: w, height: h, data } = mask;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null;
  if (data.length < w * h) return null;
  const out = new Uint8Array(w * h);
  for (let p = 0; p < out.length; p += 1) out[p] = data[p] >= HAIR_FIT.level ? 1 : 0;
  return out;
}

/**
 * Every connected region, labelled, with how big each one is.
 *
 * Four-connected, so a region joined only at a corner is a separate
 * region — the stricter of the two conventions, and the right one here:
 * a wisp touching a shadow diagonally should not merge the two.
 *
 * Iterative, with the stack held in a typed array sized to the grid. A
 * flood fill written recursively over a 256-square mask is a crash on the
 * oldest phone in the matrix rather than a slow frame.
 */
function regions(hair: Uint8Array, w: number, h: number): {
  labels: Int32Array;
  /** Area per label, indexed by label minus one. */
  areas: number[];
  total: number;
} {
  const labels = new Int32Array(w * h).fill(0);
  const stack = new Int32Array(w * h);
  const areas: number[] = [];
  let label = 0;
  let total = 0;

  for (let seed = 0; seed < hair.length; seed += 1) {
    if (hair[seed] === 0) {
      continue;
    }
    total += 1;
    if (labels[seed] !== 0) continue;

    label += 1;
    let top = 0;
    stack[top] = seed;
    top += 1;
    labels[seed] = label;
    let area = 0;

    while (top > 0) {
      top -= 1;
      const p = stack[top];
      area += 1;
      const x = p % w;
      const y = (p - x) / w;

      if (x > 0 && hair[p - 1] === 1 && labels[p - 1] === 0) {
        labels[p - 1] = label;
        stack[top] = p - 1;
        top += 1;
      }
      if (x + 1 < w && hair[p + 1] === 1 && labels[p + 1] === 0) {
        labels[p + 1] = label;
        stack[top] = p + 1;
        top += 1;
      }
      if (y > 0 && hair[p - w] === 1 && labels[p - w] === 0) {
        labels[p - w] = label;
        stack[top] = p - w;
        top += 1;
      }
      if (y + 1 < h && hair[p + w] === 1 && labels[p + w] === 0) {
        labels[p + w] = label;
        stack[top] = p + w;
        top += 1;
      }
    }

    areas.push(area);
  }

  return { labels, areas, total };
}

/* -------------------------------- the walk ------------------------------ */

/** The eight neighbours, clockwise from due east. */
const RING = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const;

/**
 * The boundary of one labelled region, walked once round.
 *
 * Moore-neighbourhood tracing with Jacob's stopping rule: from the
 * first pixel of the region in reading order, the neighbours are
 * examined clockwise from where the walk came in, and the walk ends when
 * it re-enters the start pixel travelling the direction it first left
 * it. Two caps stand behind that, because a stopping rule that depends
 * on the shape being ordinary should not be the only one: a few returns
 * to the start by any other direction (`maxStartVisits`), and a hard
 * step cap (`maxSteps`) behind that.
 *
 * Returns pixel centres, in the mask's own grid.
 */
function boundary(labels: Int32Array, w: number, h: number, label: number): number[] {
  const inside = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === label;

  let startX = -1;
  let startY = -1;
  for (let p = 0; p < labels.length && startX < 0; p += 1) {
    if (labels[p] !== label) continue;
    startX = p % w;
    startY = (p - (p % w)) / w;
  }
  if (startX < 0) return [];

  const points: number[] = [startX + 0.5, startY + 0.5];
  let x = startX;
  let y = startY;
  // The walk arrives at the start from the west, because the start is the
  // first pixel in reading order and nothing to its left is in the region.
  let back = 4;
  /** Which way the walk first left the start pixel: Jacob's stopping rule. */
  let firstLeave = -1;
  /** How many times it has left the start pixel some OTHER way since. */
  let visits = 0;

  for (let step = 0; step < HAIR_FIT.maxSteps; step += 1) {
    const atStart = x === startX && y === startY;
    let moved = false;

    // Clockwise from the neighbour just past the one the walk came in
    // from, which is what keeps the walk on the outside of the region.
    for (let k = 1; k <= 8; k += 1) {
      const dir = (back + k) % 8;
      const nx = x + RING[dir][0];
      const ny = y + RING[dir][1];
      if (!inside(nx, ny)) continue;

      if (atStart) {
        if (firstLeave < 0) {
          firstLeave = dir;
        } else if (dir === firstLeave) {
          // Back at the start, leaving it the way it was first left:
          // the loop is closed.
          return points;
        } else {
          // Back at the start, leaving it some other way. Jacob's rule
          // does not close here and a ragged region can do this over and
          // over; the loop has been walked, so a few of these is as much
          // as the outline can be waited on for.
          visits += 1;
          if (visits >= HAIR_FIT.maxStartVisits) return points;
        }
      }

      // From the new pixel, the one just left is the way back.
      back = (dir + 4) % 8;
      x = nx;
      y = ny;
      moved = true;
      points.push(x + 0.5, y + 0.5);
      break;
    }

    // A region one pixel across has no neighbour to step to. Its own
    // centre is the whole of its boundary, which is honest and is far
    // too few points to survive `minPoints` below.
    if (!moved) return points;
  }

  return points;
}

/** Every nth point, so the extent survives and the walk does not. */
function thin(points: number[], most: number): number[] {
  const n = points.length / 2;
  if (n <= most) return points;
  const stride = Math.ceil(n / most);
  const out: number[] = [];
  for (let i = 0; i < n; i += stride) out.push(points[2 * i], points[2 * i + 1]);
  return out;
}

/* ------------------------------ the silhouette -------------------------- */

/**
 * One mask, as an outline in the preview's own points — or null when the
 * reading had nothing honest in it.
 *
 * Null is a refusal, not a statement about hair. `setHair` answers a
 * refusal by holding the shape the cap is already wearing; only a run of
 * them lets go back to the standing allowance. Passing this straight
 * into `HairMesh.setHair` alongside the face the frame was sampled at is
 * the whole contract.
 */
export function hairSilhouette(mask: FitMask, geometry: FitGeometry): HairSilhouette | null {
  const projection = aspectFill(geometry.source, geometry.view);
  if (projection === null) return null;

  const hair = threshold(mask);
  if (hair === null) return null;

  const w = mask.width;
  const h = mask.height;
  const pixels = w * h;

  const { labels, areas, total } = regions(hair, w, h);
  if (areas.length === 0) return null;

  // Mostly nothing, or mostly everything: neither is a head of hair.
  const share = total / pixels;
  if (share < HAIR_FIT.minShare || share > HAIR_FIT.maxShare) return null;

  // The main piece, plus any of comparable size — hair either side of a
  // face is two pieces and both belong to the same head.
  const ranked = areas
    .map((area, index) => ({ label: index + 1, area }))
    .sort((a, b) => b.area - a.area);
  const biggest = ranked[0].area;
  const kept = ranked
    .slice(0, HAIR_FIT.maxRegions)
    .filter((region) => region.area >= HAIR_FIT.peerShare * biggest);
  const keptArea = kept.reduce((sum, region) => sum + region.area, 0);
  // What is being traced has to be most of what was found, or the mask
  // has scattered and there is no subject in it.
  if (keptArea / total < HAIR_FIT.minRegionShare) return null;

  // Appended one at a time rather than spread: a boundary can run to
  // thousands of numbers, and spreading that many arguments into `push`
  // is an engine limit rather than a slow line.
  const walk: number[] = [];
  for (const region of kept) {
    const loop = boundary(labels, w, h, region.label);
    for (let i = 0; i < loop.length; i += 1) walk.push(loop[i]);
  }
  const walked = thin(walk, HAIR_FIT.maxPoints);
  if (walked.length < HAIR_FIT.minPoints * 2) return null;

  // Grid -> the camera's picture -> the preview. Both steps are scales:
  // the first because the sampler squashed each axis independently, the
  // second because the preview fills its bounds with the picture.
  const { scale, dx, dy } = projection;
  const kx = (geometry.source.width / w) * scale;
  const ky = (geometry.source.height / h) * scale;

  const points: number[] = [];
  for (let i = 0; i + 1 < walked.length; i += 2) {
    points.push(walked[i] * kx + dx, walked[i + 1] * ky + dy);
  }
  return { points };
}

/* -------------------------------- the beat ------------------------------ */

/**
 * How often a live fit is taken, in milliseconds.
 *
 * About three a second, and the reasoning is in `head-cap.ts`'s own note:
 * one `fitHairCap` is three walks of the face's point cloud, three dome
 * writes, eleven walks of 191 vertices and eight of the silhouette —
 * about 80 µs measured on a laptop — and in front of it sit a model run
 * and two walks of the model's square. That is fine a few times a
 * second on the JS thread and would be ruinous per frame. The shape of somebody's hair does not change between frames,
 * and the cap eases towards a new fit over about half a second anyway,
 * so a faster beat would buy nothing visible.
 *
 * This is the period between the STARTS of two fits, not the gap between
 * one finishing and the next beginning — see `FitClock` for why that
 * distinction is the difference between three a second and one and a
 * half.
 */
export const FIT_INTERVAL_MS = 320;

/**
 * How often the caller's timer asks whether a fit is due.
 *
 * Half the beat, and it is not a second beat: `dueForFit` below is the
 * only thing that decides, and it refuses anything inside the interval.
 * The timer ticks twice as often so that a tick landing a millisecond
 * early — the timer's own jitter, which on a busy phone is real — costs
 * at most this much of the beat rather than a whole one. A tick that is
 * refused is one comparison and nothing else.
 */
export const FIT_TICK_MS = FIT_INTERVAL_MS / 2;

/**
 * Where the beat is: whether a fit is running, and when the last one
 * STARTED.
 *
 * `at` is the start, deliberately, and this was wrong once in a way
 * worth writing down. Stamped on completion instead, the rule below
 * measures the interval from the END of the last fit, so a fit taking
 * any time at all pushes the next one past the following tick and every
 * second tick is refused: a timer ticking every 320 ms then produces a
 * fit every 640 ms. Measured against the real rule with a simulated tick
 * train, work of 5, 50, 120 and 300 ms all came out at 1.6 fits a second
 * with a uniform 640 ms gap, where only work of exactly 0 ms gave 3.
 * With the start stamped, the period is the interval whenever a fit fits
 * inside it and the fit's own duration when it does not — which is the
 * documented behaviour and what `scripts/test/hair-fit.test.ts` holds it
 * to.
 */
export type FitClock = {
  busy: boolean;
  /** Milliseconds, on `Date.now()`'s clock, at the moment the fit began. */
  at: number;
};

/** Nothing has been sampled yet. */
export const FIT_CLOCK_START: FitClock = { busy: false, at: 0 };

/**
 * Whether to take a fit now.
 *
 * Two rules, and the first one is the one that matters. A fit already
 * running means the last beat has not finished — the model was slow, the
 * phone is busy, something else has the thread — and the answer to that
 * is to DROP this beat, never to queue behind it. A queue of fits is a
 * queue of stale frames: each one lands late, against a head that has
 * since turned, and the cap is dragged towards where the hair was rather
 * than where it is. Dropping costs a third of a second of accuracy in a
 * shape that eases in over half a second.
 *
 * The second is the interval itself, measured from the last fit's start,
 * so a caller ticking faster than the beat does not get a faster beat
 * and a caller whose fits are slow gets the beat spread by exactly as
 * long as they take.
 *
 * Pure, so the rule can be tested without a camera.
 */
export function dueForFit(clock: FitClock, now: number): boolean {
  if (clock.busy) return false;
  if (!Number.isFinite(now)) return false;
  // A clock from the future — the wall clock moved backwards — is not a
  // reason to stop fitting for ever.
  if (now < clock.at) return true;
  return now - clock.at >= FIT_INTERVAL_MS;
}
