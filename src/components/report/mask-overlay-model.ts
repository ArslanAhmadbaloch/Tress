/**
 * Everything about the mask overlay that is not a React element: where a
 * traced point lands in the frame, what a stored trace is allowed to look
 * like, and the words the control says.
 *
 * It lives apart from mask-overlay.tsx for one reason — this file has no
 * JSX and no native import, so `node --test` can run it against the three
 * photograph shapes and pin the transform. The transform is the part of
 * this feature that breaks silently: a mask projected through the wrong
 * fit sits an inch off the head and nothing throws.
 *
 * ── The three spaces ──────────────────────────────────────────────────
 * Model space is the segmenter's 512², aspect-distorted. Stored space is
 * the 1024-box: model coordinates doubled, so every corner-lattice vertex
 * is an even integer and the encoding rounds nothing. Frame space is
 * points on the screen, under the same `cover` fit the photograph itself
 * is drawn with.
 *
 * Model → stored → normalised is a pure axis-wise scale with no crop and
 * no offset, and that is true only because coverage is measured on the
 * *shrunk capture* which is then persisted unchanged. Any change that
 * measures the raw camera frame, or crops before persisting, slides every
 * mask off every face with no error and no failing test.
 *
 * Normalised → frame is `projector()`, which is the same function the
 * upper-third rule is drawn with. The mask and the rule therefore cannot
 * disagree about where the photograph is; the test asserts exactly that.
 */

/** The stored trace's coordinate box: 512 model pixels, doubled. */
export const MASK_BOX = 1024;

/** The frame's proportions are the photograph's, held inside this range. */
export const MIN_ASPECT = 0.74;
export const MAX_ASPECT = 1;

/** Fraction of a polyline's end that fades where it leaves the frame. */
const TAIL_PX = 24;

/** Below this a projected polyline is a dot, not a line. */
const MIN_SEGMENT_PX = 4;

type Sized = { width: number; height: number };

/** A trace after parsing: flat `[x0, y0, x1, y1, …]` in the 1024-box. */
export type ParsedMaskTrace = {
  /** Closed loops of the 0.5 boundary. Outer boundaries and holes alike. */
  contours: number[][];
  /** Open polylines: per column, the highest row the mask held for a short run, broken where the mask broke. */
  topEdge: number[][];
  /** Simplification tolerance the tracer used, in box units. Null when not recorded. */
  tolerance: number | null;
};

export type Projector = {
  x: (fx: number) => number;
  y: (fy: number) => number;
};

/** One stroked run of the top edge, already in frame points. */
export type MaskEdge = {
  d: string;
  /** Screen length, for the dash that draws it. */
  length: number;
  /** True for the short run beside a frame edge the line ran off. */
  faded: boolean;
};

export type MaskPaths = {
  /** Every contour, closed. Filled and stroked with `fillRule="evenodd"`. */
  region: string;
  /** The frame, then every contour. Evenodd makes it the region's outside. */
  outside: string;
  /** The top edge, split where it broke and where it left the frame. */
  edges: MaskEdge[];
};

/* ------------------------------ projection ------------------------------ */

/** The frame's aspect: the photograph's own, held inside the range. */
export function frameAspect(photo: Sized): number {
  const natural = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 0.8;
  return Math.max(MIN_ASPECT, Math.min(MAX_ASPECT, natural));
}

/** Where a fraction of the photograph lands inside the frame, under cover fit. */
export function projector(photo: Sized, frameW: number, frameH: number): Projector {
  const pw = photo.width > 0 ? photo.width : frameW;
  const ph = photo.height > 0 ? photo.height : frameH;
  const scale = Math.max(frameW / pw, frameH / ph);
  const drawnW = pw * scale;
  const drawnH = ph * scale;
  const offX = (frameW - drawnW) / 2;
  const offY = (frameH - drawnH) / 2;
  return {
    x: (fx: number) => offX + fx * drawnW,
    y: (fy: number) => offY + fy * drawnH,
  };
}

/* -------------------------------- reading ------------------------------- */

/**
 * `"x,y x,y …"`, integers or plain decimals, inside the box. Nothing else.
 *
 * Deliberately not an SVG path grammar: there is no command that could be
 * mistaken for a curve, and a string that does not match this exactly is
 * rejected rather than partly read. A half-parsed contour would draw a
 * shape that looks like a mask and is not one, which is the failure this
 * whole feature cannot afford.
 */
const POINT = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/;

function parsePolyline(text: unknown, minPoints: number): number[] | null {
  if (typeof text !== 'string') return null;
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length < minPoints) return null;

  const out: number[] = [];
  for (const part of parts) {
    if (!POINT.test(part)) return null;
    const comma = part.indexOf(',');
    const x = Number(part.slice(0, comma));
    const y = Number(part.slice(comma + 1));
    if (x < 0 || x > MASK_BOX || y < 0 || y > MASK_BOX) return null;
    out.push(x, y);
  }
  return out;
}

function parseAll(value: unknown, minPoints: number): number[][] | null {
  if (!Array.isArray(value)) return null;
  const out: number[][] = [];
  for (const line of value) {
    const points = parsePolyline(line, minPoints);
    if (!points) return null;
    out.push(points);
  }
  return out;
}

/**
 * The trace a photograph carries, or null.
 *
 * Null is the ordinary answer, not the exceptional one: a photograph taken
 * before outlines were kept has none, no build without the native model
 * can make one, and a mask too fragmented to trace stores none either. The
 * caller draws today's hero in that case and says nothing about it.
 *
 * Takes `unknown` because the field arrives on `Photo` from the capture
 * lane; this reads it structurally so a rename or a malformed blob is a
 * missing overlay rather than a wrong one.
 */
export function maskTraceOf(photo: unknown): ParsedMaskTrace | null {
  if (typeof photo !== 'object' || photo === null) return null;
  const raw = (photo as { maskTrace?: unknown }).maskTrace;
  if (typeof raw !== 'object' || raw === null) return null;

  const record = raw as { contours?: unknown; topEdge?: unknown; tolerance?: unknown };

  // A closed loop needs three points; an open run needs two.
  const contours = parseAll(record.contours, 3);
  const topEdge = record.topEdge === undefined ? [] : parseAll(record.topEdge, 2);
  if (!contours || !topEdge || contours.length === 0) return null;

  const tolerance =
    typeof record.tolerance === 'number' && Number.isFinite(record.tolerance)
      ? record.tolerance
      : null;

  return { contours, topEdge, tolerance };
}

/* ------------------------------- geometry ------------------------------- */

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function contourPath(points: number[], project: Projector): string {
  let d = '';
  for (let i = 0; i < points.length; i += 2) {
    const x = round(project.x(points[i] / MASK_BOX));
    const y = round(project.y(points[i + 1] / MASK_BOX));
    d += `${i === 0 ? 'M' : 'L'}${x} ${y}`;
    if (i + 2 < points.length) d += ' ';
  }
  return `${d}Z`;
}

/** Frame points for an open run, keeping the pairs flat. */
function projectRun(points: number[], project: Projector): number[] {
  const out: number[] = new Array<number>(points.length);
  for (let i = 0; i < points.length; i += 2) {
    out[i] = project.x(points[i] / MASK_BOX);
    out[i + 1] = project.y(points[i + 1] / MASK_BOX);
  }
  return out;
}

function runLength(points: number[]): number {
  let total = 0;
  for (let i = 2; i < points.length; i += 2) {
    total += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
  }
  return total;
}

function runPath(points: number[]): string {
  let d = '';
  for (let i = 0; i < points.length; i += 2) {
    d += `${i === 0 ? 'M' : ' L'}${round(points[i])} ${round(points[i + 1])}`;
  }
  return d;
}

/**
 * The first `px` of a run, and the rest, split at a point on the line.
 *
 * Used at an end the line ran off the frame at, so the last stretch can be
 * drawn faint instead of stopping dead. A line that stops dead at y = 0
 * reads as a horizontal edge the model found, and it did not.
 */
function cutFromStart(points: number[], px: number): { head: number[]; rest: number[] } {
  let walked = 0;
  for (let i = 2; i < points.length; i += 2) {
    const dx = points[i] - points[i - 2];
    const dy = points[i + 1] - points[i - 1];
    const step = Math.hypot(dx, dy);
    if (walked + step >= px) {
      const t = step === 0 ? 0 : (px - walked) / step;
      const cx = points[i - 2] + dx * t;
      const cy = points[i - 1] + dy * t;
      return {
        head: [...points.slice(0, i), cx, cy],
        rest: [cx, cy, ...points.slice(i)],
      };
    }
    walked += step;
  }
  return { head: points, rest: [] };
}

function reversePairs(points: number[]): number[] {
  const out: number[] = [];
  for (let i = points.length - 2; i >= 0; i -= 2) out.push(points[i], points[i + 1]);
  return out;
}

/**
 * The stretch of one segment that is inside the frame, as two parameters
 * along it, or null when none of it is. Liang–Barsky, half a point of
 * slack so a line exactly on the edge counts as visible.
 */
function clipSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  height: number,
): [number, number] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const tests: [number, number][] = [
    [-dx, x0 + 0.5],
    [dx, width + 0.5 - x0],
    [-dy, y0 + 0.5],
    [dy, height + 0.5 - y0],
  ];

  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [t0, t1];
}

/**
 * A run cut into the pieces of it that are inside the frame.
 *
 * The line is cut at the frame's edge, never clamped to it: clamping would
 * draw the line along the edge it left through, which is a line the mask
 * never produced and which reads as a finding. Each piece records whether
 * it ends at the frame's edge or at a real break in the mask, because
 * those are different facts and only one of them is about the hair.
 */
function insideFrame(
  points: number[],
  width: number,
  height: number,
): { run: number[]; clipStart: boolean; clipEnd: boolean }[] {
  const pieces: { run: number[]; clipStart: boolean; clipEnd: boolean }[] = [];
  let current: number[] = [];
  let clipStart = false;

  const flush = (endedAtEdge: boolean) => {
    if (current.length >= 4) pieces.push({ run: current, clipStart, clipEnd: endedAtEdge });
    current = [];
  };

  for (let i = 0; i + 3 < points.length; i += 2) {
    const x0 = points[i];
    const y0 = points[i + 1];
    const dx = points[i + 2] - x0;
    const dy = points[i + 3] - y0;

    const span = clipSegment(x0, y0, points[i + 2], points[i + 3], width, height);
    if (!span) {
      flush(true);
      clipStart = true;
      continue;
    }

    const [t0, t1] = span;
    if (t0 > 0) {
      flush(true);
      clipStart = true;
    }
    if (current.length === 0) current.push(x0 + dx * t0, y0 + dy * t0);
    current.push(x0 + dx * t1, y0 + dy * t1);
    if (t1 < 1) {
      flush(true);
      clipStart = true;
    }
  }

  flush(false);
  return pieces;
}

function edgesFor(points: number[], project: Projector, width: number, height: number): MaskEdge[] {
  const edges: MaskEdge[] = [];

  for (const piece of insideFrame(projectRun(points, project), width, height)) {
    let main = piece.run;
    const tails: number[][] = [];
    // A piece shorter than the tail itself is all tail.
    let allTail = false;

    if (piece.clipStart) {
      const { head, rest } = cutFromStart(main, TAIL_PX);
      if (rest.length >= 4) {
        tails.push(head);
        main = rest;
      } else allTail = true;
    }
    if (piece.clipEnd && !allTail) {
      const { head, rest } = cutFromStart(reversePairs(main), TAIL_PX);
      if (rest.length >= 4) {
        tails.push(head);
        main = reversePairs(rest);
      } else allTail = true;
    }

    for (const tail of tails) {
      const length = runLength(tail);
      if (length > 0) edges.push({ d: runPath(tail), length, faded: true });
    }
    const length = runLength(main);
    if (allTail ? length > 0 : length >= MIN_SEGMENT_PX) {
      edges.push({ d: runPath(main), length, faded: allTail });
    }
  }

  return edges;
}

/**
 * Whether any of the top edge actually lands inside the frame.
 *
 * The caller labels the pale line in words under the picture, and a run
 * being *stored* is not the same as a run being *drawn*: the frame is a
 * cover fit with the aspect clamped, so a tall photograph is cropped top
 * and bottom, and the top edge is exactly the part that lives up there.
 * Asking `trace.topEdge.length` — which the hero used to — prints a
 * heading and a paragraph about a line that is nowhere on the frame.
 *
 * It runs the same `edgesFor` the drawing runs rather than approximating
 * it, so the label and the line can only ever agree. The cost is one
 * extra projection of at most sixteen runs of at most 128 points.
 */
export function hasVisibleEdge(
  trace: ParsedMaskTrace,
  project: Projector,
  width: number,
  height: number,
): boolean {
  return trace.topEdge.some((run) => edgesFor(run, project, width, height).length > 0);
}

/**
 * The trace, in frame points.
 *
 * Every mark here is the 0.5 iso-boundary of the same array the printed
 * figures were counted on, mapped through the fit the photograph is drawn
 * with. Nothing is smoothed, nothing is closed across a gap, and no number
 * is derived from any of it — the percentages on this screen come from the
 * coverage reading, never from the polygon, which differs from it by a
 * fraction of a point after simplification.
 */
export function maskPaths(
  trace: ParsedMaskTrace,
  project: Projector,
  width: number,
  height: number,
): MaskPaths {
  const region = trace.contours.map((c) => contourPath(c, project)).join(' ');
  const frame = `M0 0L${round(width)} 0L${round(width)} ${round(height)}L0 ${round(height)}Z`;
  const edges = trace.topEdge.flatMap((run) => edgesFor(run, project, width, height));
  return { region, outside: `${frame} ${region}`, edges };
}

/* --------------------------------- words -------------------------------- */

/**
 * Every string the overlay adds, in one frozen object so the honesty sweep
 * has a single import and nothing can be invented inside a component.
 *
 * The caption is load-bearing. Nothing in this hero has ever been tappable,
 * so nobody will try it; the pill alone reads as a badge. The gesture has
 * to be introduced in words, once, or the toggle — which is the whole
 * argument that this is an instrument rather than a filter — is a secret.
 *
 * So is the edge label. The pale line along the top of the mask is the
 * boldest mark the app puts on anybody's face, and an unexplained line
 * traced across the top of someone's hair invites exactly the reading this
 * product exists to refuse — that a hairline was found and mapped. It is
 * the highest row the mask held for a short run in each column and nothing
 * anatomical,
 * so it is named as that, on the screen, beside the picture. Silence is
 * not neutral here; the drawing makes a claim whether or not the words do.
 *
 * `softEdges` is about the first thing anyone will notice. The 0.5
 * threshold means the sage visibly stops short of the wisps in the
 * photograph, and an unaccounted gap reads as the app believing there is
 * less hair there than there is. The gap is the threshold, said plainly.
 */
export const MASK_OVERLAY_COPY = Object.freeze({
  pillOn: 'Measured area',
  pillOff: 'Photo only',
  toggleLabel: 'Measured area overlay',
  toggleHint: 'Tap the photograph to show or hide the area the mask counted as hair.',
  heroCaption: 'Sage marks the area counted as hair. Tap the photograph to see it untouched.',
  edgeTitle: 'Top edge of the measured area',
  /*
    "held for a short run", not "reached". topEdgeOf in hair-mask.ts only
    counts a column from the first row that begins a run of about eight
    counted rows, so a strand thinner than the run sits above the line
    while still being inside the marked area and inside the figure. The
    earlier wording claimed the stronger thing, which the reader can see
    is untrue the moment sage appears above the line.
  */
  edgeDetail:
    'The pale line is the highest row the mask held for a short run in each column: along the front of the hair on a face-on photograph, along the outline of the head on a top-down one. A strand finer than that run sits above the line and still inside the marked area. It breaks where the mask broke and is never joined across a gap.',
  /*
    Names the threshold rather than the strands. What falls outside the
    outline is everything the model was under half sure about, which on a
    backlit or low-contrast frame can be a section rather than a wisp;
    saying "fine strands" picked the flattering explanation, and "a
    little" put a size on a gap nothing measured.
  */
  softEdges:
    'A pixel is marked only where the model was at least half sure, so anything it was less sure of falls outside the outline — fine strands, and also whatever was dim, backlit or out of focus. The edge can sit inside the hair you can see, by more on a difficult photograph than on a clear one.',
});
