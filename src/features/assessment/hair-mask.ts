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

import type { PhotoMaskTrace } from '@/types/domain';

/** Per-pixel hair confidence, row-major, each 0–1. */
export type MaskImage = {
  width: number;
  height: number;
  data: Float32Array;
  /**
   * The part of the photograph this mask covers, in image fractions.
   *
   * Absent means the whole picture, which is what every mask was until
   * the model had to be shown a head rather than a room.
   *
   * ── Why a mask is no longer the whole frame ──────────────────────────
   * The segmenter is a 224-square. Fed a whole camera frame it gets a
   * head about eighty pixels tall, and at that size it does not fail
   * loudly — it returns almost nothing. Measured against the shipped
   * model on a real head:
   *
   *   head fills the frame          peak 1.15   hair 6.90%
   *   head 40% of the frame         peak 0.44   hair 0.00%
   *   head 28% of the frame         peak 0.29   hair 0.00%
   *   head 28%, cropped to it 1.8x  peak 1.11   hair 6.62%
   *
   * A phone held at arm's length puts the head at about a third of the
   * frame, which is the dead row. So the model is shown a square around
   * the face instead, and this rectangle is how a point in the mask is
   * mapped back onto the photograph.
   *
   * It is not optional bookkeeping. `sampleMask` reads a region by image
   * fraction, and a cropped mask read as though it were the whole frame
   * puts every region somewhere it is not — silently, with figures that
   * still look reasonable. That is the failure the note in `inputTensor`
   * has always warned about; this field is what keeps it honest.
   */
  source?: { x: number; y: number; w: number; h: number };
};

/**
 * Confidence at or above which a pixel counts as hair.
 *
 * Exported because the trace below draws the boundary at this value.
 * Two constants would be two places to be wrong, and they would disagree
 * silently: an outline traced at 0.45 around a figure counted at 0.5
 * marks a region the number does not describe, and nothing on screen
 * would say so.
 */
export const HAIR = 0.5;

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

/** Index of the hair class when the segmenter emits one score per class. */
const HAIR_CLASS = 1;

/**
 * How to read the bundled model's output.
 *
 * `assets/models/hair_segmenter.tflite` is thangtran480/hair-segmentation's
 * `model_hairnet.tflite`: in [1,224,224,3], out [1,224,224,1], MIT, and —
 * the reason it is there at all — built from stock TFLite ops. The
 * MediaPipe model it replaced needed `Convolution2DTransposeBias`,
 * `MaxPoolingWithArgmax2D` and `MaxUnpooling2D`, which the runtime in this
 * app does not have, so it failed to allocate its tensors on every phone
 * and every scan came back with no mask at all.
 *
 * Its one output plane is ALREADY a probability. This was first written
 * as 'logit', reasoned from the graph's last operator being a bias add
 * with no logistic after it — which sounds right and is wrong. Running
 * the model over a real photograph settles it: the plane comes out
 * between −0.08 and 1.15, which is an 0–1 mask with a little overshoot
 * at each end, not a logit. Thresholded at 0.5 it marks 13.8% of the top
 * half of a portrait and 0.0% of the bottom — hair, and nothing else.
 *
 * Squashing it through a logistic compresses that into 0.48–0.76, so no
 * pixel is ever under the threshold and the mask swells to 47% of the top
 * half and 6% of the bottom: the face, the wall and the shirt all read as
 * hair. That is what shipped in builds 24 to 26, and it is why the live
 * trace refused and the report's figures were measured off a mask that
 * was mostly not hair.
 *
 * A model whose output really is a logit sets this to 'logit'. The way to
 * tell is to run it: the give-away is the range, not the graph.
 */
const HAIR_OUTPUT: 'logit' | 'probability' = 'probability';

/** The logistic function: a logit to the 0–1 probability the threshold wants. */
function probabilityOf(logit: number): number {
  return 1 / (1 + Math.exp(-logit));
}

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
  if (classes === 1) {
    /* One plane: the model scores hair directly rather than scoring every
       class and letting the caller pick. */
    for (let p = 0; p < data.length; p += 1) {
      const v = HAIR_OUTPUT === 'logit' ? probabilityOf(output[p]) : output[p];
      /* Clamped because `MaskImage` and `FitMask` both say 0-1 and mean
         it. This model overshoots slightly at both ends — it came out
         -0.079 to 1.148 over a portrait — which no threshold notices but
         which would make a liar of the type. */
      data[p] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    return { width: side, height: side, data };
  }
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

/* ------------------------------------------------------------------ */
/*  The same mask, as geometry                                        */
/* ------------------------------------------------------------------ */

/**
 * Everything below turns the mask into something small enough to keep.
 *
 * The `Float32Array` the model returns is a megabyte per photograph, and
 * the whole app lives in one row of one key in AsyncStorage. So the mask
 * is reduced, here, while it is still in hand, to its own 0.5 boundary —
 * a few hundred points, a couple of kilobytes — and the array is allowed
 * to die at the end of the call exactly as it always has.
 *
 * What survives is a boundary, not a picture. That is deliberate: the
 * boundary is the thing `coverageOf` counted at, so a drawing of it is a
 * drawing of the measurement. The confidence *inside* the boundary is
 * discarded because nothing reports on it — it is the model's certainty,
 * which tracks contrast and focus, and is not an amount of hair.
 */

/** The stored coordinate box, spanning the whole photograph on each axis. */
const BOX = 1024;

/**
 * Simplification tolerance, in box units. Two box units is one model
 * pixel at the segmenter's 512, which is about three quarters of a point
 * on a phone-width frame — under what an eye resolves, and well under
 * what the model resolves.
 */
const SIMPLIFY = 2;

/** The retry tolerance for a mask that came back in too many pieces. */
const SIMPLIFY_COARSE = 4;

/**
 * What one photograph's outline may cost in the store, serialised.
 *
 * The budget is bytes, and it is measured on the string that is actually
 * written, because bytes are what the single AsyncStorage row has. An
 * earlier version of this capped the point count at 1,200 instead, which
 * sounds like the same guard and is not: a head-shaped mask with
 * per-pixel boundary noise traces to around 1,150 points — under that
 * cap — and serialises to a little over 10 KB, so the only check that
 * ran on a device permitted nearly twice what the test in CI asserted.
 * Two budgets that disagree are one budget nobody is keeping.
 *
 * A backlit or low-contrast frame can shatter the 0.5 field into
 * hundreds of specks, and there is no point spending the bytes to store
 * confetti. Past this the outline is refused: the figures still stand,
 * and the squares survive separately, so what is lost is the boundary
 * alone.
 *
 * Exported so the test asserting the budget asserts this number and not
 * a copy of it.
 */
export const MAX_TRACE_BYTES = 6144;

/**
 * The fewest bytes one surviving loop can cost in the stored string.
 *
 * `simplifyLoop` never returns fewer than three points and `at()` maps
 * over the loops rather than filtering them, so a trace of N loops
 * serialises to N contour strings whatever tolerance is used — and the
 * very smallest a three-point loop can be written as, all coordinates
 * single digits, is `"0,0 0,0 0,0",`: fourteen characters. Real loops
 * are several times that; this is a floor, not an estimate.
 *
 * It exists so the budget can be decided before the work. `at(SIMPLIFY)`
 * simplifies and serialises every loop, and on a refusal the whole thing
 * runs a second time at the coarse tolerance — so the pathological mask
 * this guard exists to turn away was the single most expensive thing the
 * file did, and it produced nothing. Measured on this Mac in Node, a
 * 512-square checkerboard cost 278 ms and a head-shaped region whose
 * confidence hovers at 0.5 — the backlit frame named above — cost 47 ms,
 * against 11 ms for a clean head. At the 5-15x Hermes multiplier this
 * file uses elsewhere that is seconds of blocked JS thread at the
 * shutter, spent to return null.
 *
 * This is the same budget, not a second one: N * MIN_LOOP_BYTES is a
 * lower bound on what the trace must cost, so anything it turns away
 * would have been turned away by `MAX_TRACE_BYTES` after the work. It is
 * deliberately not a cap on points — a point count and a byte count are
 * not interchangeable, which is the mistake the note above records.
 */
const MIN_LOOP_BYTES = 14;

/** The area grid is 16 x 16, which is 256 bytes. */
const CELL_GRID = 16;

/** Columns the top edge is sampled at, at most one per pixel column. */
const TOP_EDGE_COLUMNS = 128;

/**
 * The mask reduced to what can be drawn and stored.
 *
 * Coordinates are integers in the 1024 box (see `PhotoMaskTrace`), which
 * is a pure axis-wise scale of the photograph with no crop and no offset.
 */
export type MaskTrace = {
  /**
   * Closed loops of the 0.5 boundary: `[x0, y0, x1, y1, …]` per loop.
   * Empty when the mask held nothing, and also when it shattered into
   * more pieces than could be stored — see `cellsOnlyTrace`.
   */
  contours: number[][];
  /**
   * Open polylines: per sampled column, the highest row the mask held
   * for a short run of rows. Not simply the highest row it touched —
   * a single pixel above the hair is ignored by design, so the line
   * sits below any wisp too thin to hold.
   */
  topEdge: number[][];
  /** 16 x 16 shares of each cell's own area, each 0–255. */
  cells: Uint8Array;
  /** The tolerance actually used, in box units. */
  tolerance: number;
};

/* ------------------------------ contours ----------------------------- */

/**
 * The boundary of the counted region, as closed loops of unit edges.
 *
 * Traced on the corner lattice — the lines *between* pixels, not through
 * their centres — so the area enclosed by the loops is exactly the pixel
 * count `coverageOf` reports, before any simplification. That exactness
 * is the whole claim this makes: the outline is the count, drawn.
 *
 * Holes come out as loops too, wound the other way, which is why the
 * result is drawn with an even-odd fill. A gap inside the hair is a gap
 * the count already excluded, and filling it in would be the drawing
 * inventing hair.
 */
function boundaryLoops(hair: Uint8Array, w: number, h: number): number[][] {
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : hair[y * w + x];

  // One directed edge per pixel side that faces open ground, wound so
  // the counted region is always on the same hand.
  const sx: number[] = [];
  const sy: number[] = [];
  const ex: number[] = [];
  const ey: number[] = [];
  const used: boolean[] = [];
  const leaving = new Map<number, number[]>();
  const vertex = (x: number, y: number): number => y * (w + 1) + x;

  const edge = (x0: number, y0: number, x1: number, y1: number): void => {
    const i = sx.length;
    sx.push(x0);
    sy.push(y0);
    ex.push(x1);
    ey.push(y1);
    used.push(false);
    const k = vertex(x0, y0);
    const list = leaving.get(k);
    if (list) list.push(i);
    else leaving.set(k, [i]);
  };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) edge(x, y, x + 1, y);
      if (!at(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) edge(x, y + 1, x, y);
    }
  }

  const loops: number[][] = [];
  for (let start = 0; start < sx.length; start += 1) {
    if (used[start]) continue;
    const points: number[] = [];
    let e = start;
    for (;;) {
      used[e] = true;
      points.push(sx[e], sy[e]);
      const vx = ex[e];
      const vy = ey[e];
      const dx = vx - sx[e];
      const dy = vy - sy[e];
      const list = leaving.get(vertex(vx, vy));
      let next = -1;
      let turn = 0;
      if (list) {
        for (const c of list) {
          if (used[c]) continue;
          /*
            Two edges leave the same vertex only where two counted
            pixels touch at a corner. Taking the turn that carries on
            into the other pixel treats the pair as one piece of hair
            rather than two — which is what it looks like, and what the
            count already treated it as. The opposite choice encloses
            the same area either way, so this changes the drawing and
            never the figure.
          */
          const cross = dx * (ey[c] - sy[c]) - dy * (ex[c] - sx[c]);
          if (next === -1 || cross < turn) {
            next = c;
            turn = cross;
          }
        }
      }
      // The only way back to the start is the edge we began on, and it
      // was marked used before the first step.
      if (next === -1) break;
      e = next;
    }
    if (points.length >= 6) loops.push(points);
  }

  return loops;
}

/** Twice the signed area of a closed loop; positive outside, negative in a hole. */
function loopArea2(points: number[]): number {
  let sum = 0;
  const n = points.length / 2;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    sum += points[2 * i] * points[2 * j + 1] - points[2 * j] * points[2 * i + 1];
  }
  return sum;
}

/**
 * The area enclosed by a set of loops, in whatever units they carry.
 *
 * Holes subtract, because they are wound the other way. Exposed so the
 * tests can hold the traced outline against the counted pixels rather
 * than taking it on trust.
 */
export function tracedArea(loops: number[][]): number {
  let sum = 0;
  for (const loop of loops) sum += loopArea2(loop);
  return Math.abs(sum) / 2;
}

/* ---------------------------- simplification -------------------------- */

/** Perpendicular distance from a point to the line through a and b. */
function lineDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs(dy * (px - ax) - dx * (py - ay)) / len;
}

/**
 * Douglas–Peucker over a run of points, marking the ones worth keeping.
 *
 * Iterative rather than recursive: a raw 512-square contour can run to
 * thousands of points, and a recursion that deep on the oldest phone in
 * the matrix is a crash rather than a slow frame.
 *
 * No curve fitting and no smoothing pass anywhere near this. A smoothed
 * boundary is a boundary the model did not produce, and that is the
 * exact point at which a measurement quietly becomes an illustration.
 */
function douglasPeucker(
  points: number[],
  from: number,
  to: number,
  tolerance: number,
  keep: boolean[],
  wrap: number,
): void {
  const px = (i: number): number => points[2 * (i % wrap)];
  const py = (i: number): number => points[2 * (i % wrap) + 1];
  const stack: number[][] = [[from, to]];
  while (stack.length > 0) {
    const span = stack.pop();
    if (!span) break;
    const [a, b] = span;
    if (b - a < 2) continue;
    let far = -1;
    let best = tolerance;
    for (let i = a + 1; i < b; i += 1) {
      const d = lineDistance(px(i), py(i), px(a), py(a), px(b), py(b));
      if (d > best) {
        best = d;
        far = i;
      }
    }
    if (far < 0) continue;
    keep[far % wrap] = true;
    stack.push([a, far], [far, b]);
  }
}

/**
 * One closed loop, simplified.
 *
 * Anchored on the point farthest from the first, so the result does not
 * depend on where the trace happened to start — otherwise two identical
 * masks traced from different corners would simplify differently.
 */
function simplifyLoop(points: number[], tolerance: number): number[] {
  const n = points.length / 2;
  if (n < 4) return points;

  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i += 1) {
    const d = (points[2 * i] - points[0]) ** 2 + (points[2 * i + 1] - points[1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }

  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[far] = true;
  douglasPeucker(points, 0, far, tolerance, keep, n);
  douglasPeucker(points, far, n, tolerance, keep, n);

  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (keep[i]) out.push(points[2 * i], points[2 * i + 1]);
  }
  /*
    A speck smaller than the tolerance straightens into a line, which is
    not a shape and would vanish from the drawing. Those specks are
    inside the counted figure, so the unsimplified loop is kept instead:
    a mask that has gone wrong then shows as scatter rather than posing
    as a clean hairline, which is the more useful failure.
  */
  return out.length >= 6 ? out : points;
}

/** One open polyline, simplified, with both ends held. */
function simplifyLine(points: number[], tolerance: number): number[] {
  const n = points.length / 2;
  if (n < 3) return points;
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;
  douglasPeucker(points, 0, n - 1, tolerance, keep, n);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (keep[i]) out.push(points[2 * i], points[2 * i + 1]);
  }
  return out;
}

/* ------------------------------ top edge ----------------------------- */

/**
 * The highest row the mask *held* for a short run, column by column.
 *
 * Note which of two claims that is. It is not the highest row the mask
 * reached: a column only counts from the first row that begins a run of
 * about eight counted rows, so a single stray pixel cannot yank the line
 * to the top of the frame — and neither can a genuine wisp thinner than
 * the run. A four-row strand sixty rows above the head is inside the
 * outline and inside the figure, and the line still sits below it. The
 * filter errs towards claiming less, which is the safe direction, but
 * anything describing this line to a person has to say the weaker thing
 * it actually measures.
 *
 * On a photograph taken from the front this follows the hairline; on one
 * taken from above it follows the outline of the head against whatever
 * is behind it. It is the top of the measured area and is named that
 * way, because which of the two it is depends on the angle, and calling
 * it a hairline on the wrong angle would be a claim about a head made
 * from a picture of a background.
 *
 * Where the mask has nothing the line breaks, and the break is kept:
 * joining across it would draw an edge in a place the model found none.
 */
function topEdgeOf(hair: Uint8Array, w: number, h: number): number[][] {
  const columns = Math.min(TOP_EDGE_COLUMNS, w);
  if (columns === 0 || h === 0) return [];
  // Eight rows at the model's 512, and the same proportion elsewhere.
  const run = Math.max(1, Math.round(h / 64));
  // A line across a sixteenth of the frame is a mark, not an edge.
  const minSpan = Math.max(2, Math.round(columns / 16));

  const lines: number[][] = [];
  let current: number[] = [];
  let span = 0;

  const close = (): void => {
    if (span >= minSpan && current.length >= 4) lines.push(current);
    current = [];
    span = 0;
  };

  for (let i = 0; i < columns; i += 1) {
    const x = Math.min(w - 1, Math.floor(((i + 0.5) * w) / columns));
    let top = -1;
    for (let y = 0; y + run <= h; y += 1) {
      if (!hair[y * w + x]) continue;
      let solid = true;
      for (let k = 1; k < run; k += 1) {
        if (!hair[(y + k) * w + x]) {
          solid = false;
          break;
        }
      }
      if (solid) {
        top = y;
        break;
      }
    }
    if (top < 0) {
      close();
      continue;
    }
    current.push(Math.round(((x + 0.5) * BOX) / w), Math.round((top * BOX) / h));
    span += 1;
  }
  close();

  return lines;
}

/* -------------------------------- cells ------------------------------ */

/**
 * The frame in 256 squares, each the share of its own area counted as hair.
 *
 * The mean of these, over 255, is `coverageOf().fraction` back again — so
 * this is the printed figure taken apart, not a second measurement of
 * anything. It is emphatically not a map of how much hair is in a place:
 * every square is the same quantity as the whole-frame figure, which is
 * area, measured over a smaller piece of the picture.
 */
export function cellShares(mask: MaskImage): Uint8Array {
  const { width: w, height: h, data } = mask;
  const cells = new Uint8Array(CELL_GRID * CELL_GRID);
  if (w === 0 || h === 0) return cells;

  for (let cy = 0; cy < CELL_GRID; cy += 1) {
    const y0 = Math.floor((cy * h) / CELL_GRID);
    const y1 = Math.floor(((cy + 1) * h) / CELL_GRID);
    for (let cx = 0; cx < CELL_GRID; cx += 1) {
      const x0 = Math.floor((cx * w) / CELL_GRID);
      const x1 = Math.floor(((cx + 1) * w) / CELL_GRID);
      const area = (x1 - x0) * (y1 - y0);
      if (area <= 0) continue;
      let counted = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          if (data[y * w + x] >= HAIR) counted += 1;
        }
      }
      cells[cy * CELL_GRID + cx] = Math.round((255 * counted) / area);
    }
  }
  return cells;
}

/* -------------------------------- trace ------------------------------ */

/**
 * The mask, reduced to a boundary — or null when there was no honest one.
 *
 * Null rather than a partial trace, on purpose: a caller that gets null
 * knows it has nothing to draw, whereas a caller handed half an outline
 * would draw half an outline and nobody could tell which half. The
 * figures are unaffected either way; they come from the mask, not from
 * this.
 *
 * Null is not the end of it, though. A caller holding the mask should
 * fall back to `cellsOnlyTrace`, so that a shattered mask still stores
 * its squares and still reads as something that happened rather than as
 * a photograph nobody ever measured.
 */
export function traceMask(mask: MaskImage): MaskTrace | null {
  const { width: w, height: h, data } = mask;
  if (w <= 0 || h <= 0 || data.length < w * h) return null;

  const hair = new Uint8Array(w * h);
  for (let p = 0; p < hair.length; p += 1) hair[p] = data[p] >= HAIR ? 1 : 0;

  const raw = boundaryLoops(hair, w, h);
  // Into the box before simplifying, so the tolerance means the same
  // thing whatever size mask the model turns out to emit. At the 512 the
  // segmenter uses this is an exact doubling: no rounding at all.
  const boxed = raw.map((loop) => {
    const out: number[] = [];
    for (let i = 0; i < loop.length; i += 2) {
      const x = Math.round((loop[i] * BOX) / w);
      const y = Math.round((loop[i + 1] * BOX) / h);
      const last = out.length;
      if (last >= 2 && out[last - 2] === x && out[last - 1] === y) continue;
      out.push(x, y);
    }
    return out;
  });

  /*
    Refused before the work, not after it. Every loop survives `at()`
    with at least three points, so `boxed.length * MIN_LOOP_BYTES` is a
    floor on what this trace can serialise to; once that floor is over
    budget no tolerance can bring it back, and simplifying and
    stringifying the confetti twice to discover that is time taken off
    the JS thread at the shutter for nothing. The caller's fallback to
    `cellsOnlyTrace` is unaffected — the squares are counted there, and
    never traced.
  */
  if (boxed.length * MIN_LOOP_BYTES >= MAX_TRACE_BYTES) return null;

  const lines = topEdgeOf(hair, w, h);
  const cells = cellShares(mask);
  const at = (tolerance: number): MaskTrace => ({
    contours: boxed.map((loop) => simplifyLoop(loop, tolerance)),
    topEdge: lines.map((line) => simplifyLine(line, tolerance)),
    cells,
    tolerance,
  });

  /*
    The budget is checked on the serialised string rather than on a
    point count, because the string is what the store holds. See
    `MAX_TRACE_BYTES`: the two are not interchangeable, and when they
    were, the device permitted roughly twice what CI asserted.
  */
  let trace = at(SIMPLIFY);
  if (storedBytes(trace) >= MAX_TRACE_BYTES) trace = at(SIMPLIFY_COARSE);
  if (storedBytes(trace) >= MAX_TRACE_BYTES) return null;
  return trace;
}

/**
 * The squares alone, for a mask whose boundary could not be traced.
 *
 * A mask that shattered and a photograph that never had an outline kept
 * are different things, and storing nothing for both would make them one
 * thing: the reader could then say neither which had happened nor show
 * the squares — which survive fragmentation untouched, because they are
 * counted per cell and never traced. `contours` is empty and says so.
 *
 * The tolerance is zero because nothing was simplified. There was no
 * boundary to simplify, and quoting the tolerance that would have been
 * used would describe work that was not done.
 */
export function cellsOnlyTrace(mask: MaskImage): MaskTrace {
  return { contours: [], topEdge: [], cells: cellShares(mask), tolerance: 0 };
}

/** What this trace costs in the store, measured as the store will hold it. */
function storedBytes(trace: MaskTrace): number {
  return JSON.stringify(serialiseTrace(trace)).length;
}

/* ----------------------------- serialising ---------------------------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * 256 bytes as base64, written out by hand.
 *
 * Neither `Buffer` nor `btoa` is something to lean on here: Hermes has no
 * `Buffer` at all, which this codebase has already been bitten by, and a
 * table of 64 characters is shorter than the argument about which global
 * exists on which runtime.
 */
function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

function points(list: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < list.length; i += 2) parts.push(`${list[i]},${list[i + 1]}`);
  return parts.join(' ');
}

/** The trace in the form that goes on the photograph and into storage. */
export function serialiseTrace(trace: MaskTrace): PhotoMaskTrace {
  return {
    contours: trace.contours.map(points),
    topEdge: trace.topEdge.map(points),
    cells: toBase64(trace.cells),
    tolerance: trace.tolerance,
  };
}

/**
 * `"x,y x,y …"` back to numbers, for whatever draws it.
 *
 * Everything here came off disk and none of it can be trusted to be what
 * the type says, so anything that is not a finite pair is dropped rather
 * than rendered as a NaN that silently collapses a path to nothing.
 */
export function parsePoints(encoded: string): number[] {
  const out: number[] = [];
  if (typeof encoded !== 'string') return out;
  for (const pair of encoded.split(' ')) {
    if (pair.length === 0) continue;
    const comma = pair.indexOf(',');
    if (comma < 0) continue;
    const x = Number(pair.slice(0, comma));
    const y = Number(pair.slice(comma + 1));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push(x, y);
  }
  return out;
}

/** The 256 cell shares back, or null if the stored string is not 256 bytes. */
export function parseCells(encoded: string): Uint8Array | null {
  if (typeof encoded !== 'string') return null;
  const clean = encoded.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let hold = 0;
  let bits = 0;
  let at = 0;
  for (const ch of clean) {
    const value = B64.indexOf(ch);
    if (value < 0) return null;
    hold = (hold << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[at] = (hold >> bits) & 255;
      at += 1;
    }
  }
  return at === CELL_GRID * CELL_GRID ? bytes.subarray(0, at) : null;
}
