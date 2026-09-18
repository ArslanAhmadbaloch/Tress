/**
 * Head tracking for the hair scan: the arithmetic between the detector
 * and everything that draws or decides.
 *
 * The face detector reports a box, three angles and — with contours on —
 * about a hundred and thirty points around the face and its features,
 * fifteen to thirty times a second. Every one of those numbers jitters
 * by a pixel or two while a head sits perfectly still, and once in a
 * while the detector misses a frame entirely. Drawn raw, a mesh built
 * on them swims, and pops out of existence for a frame at a time.
 *
 * So nothing draws the raw reading. This module turns the stream into a
 * *tracked* face: smoothed with a filter that leans hard on stillness and
 * lets go when the head actually moves, held steady through a missed
 * frame or two, and declared lost only after the detector has been quiet
 * for long enough to mean it. It also builds the mesh's geometry — the
 * lattice the hair-mesh component draws — from that tracked face, so the
 * layout of every point is fixed and testable here, away from the SVG.
 *
 * Two detectors feed it. Android's ML Kit is the one just described, and
 * everything above was written for it. iPhone's ARKit face anchor is a
 * different animal: a 3D mesh and a head pose solved from depth at 60
 * fps, already steady, which arrives with a `source` of `arkit` and is
 * passed through almost untouched — smoothing something that does not
 * jitter buys nothing and costs lag, and lag is what makes a mesh slide
 * over a face instead of sitting on it.
 *
 * Everything here is pure. No camera, no React, no native module: a
 * reading in, a reading out, and the tests can run it on a laptop.
 *
 * ── What this is not ──────────────────────────────────────────────────
 * A face detector sees a face. It does not see hair, and the "hair cap"
 * built below is geometry — a dome extrapolated above the face oval so
 * the mesh has somewhere to concentrate its attention — not a measurement
 * of anything. Nothing in this file knows what is on the head.
 */

/** A point in preview-view coordinates, as the detector delivers them. */
export type Point = { x: number; y: number };

/** The contours ML Kit can report, by its own names. */
export const CONTOUR_NAMES = [
  'FACE',
  'LEFT_EYEBROW_TOP',
  'LEFT_EYEBROW_BOTTOM',
  'RIGHT_EYEBROW_TOP',
  'RIGHT_EYEBROW_BOTTOM',
  'LEFT_EYE',
  'RIGHT_EYE',
  'UPPER_LIP_TOP',
  'UPPER_LIP_BOTTOM',
  'LOWER_LIP_TOP',
  'LOWER_LIP_BOTTOM',
  'NOSE_BRIDGE',
  'NOSE_BOTTOM',
  'LEFT_CHEEK',
  'RIGHT_CHEEK',
] as const;

export type ContourName = (typeof CONTOUR_NAMES)[number];
export type Contours = Partial<Record<ContourName, Point[]>>;

/** The size of the preview the readings are expressed in. */
export type ViewSize = { width: number; height: number };

/**
 * Where a reading came from.
 *
 * - `arkit`: iPhone's TrueDepth face anchor, a real 3D mesh and head pose
 *   at 60 fps. Already stable, so the filter below barely touches it.
 * - `mlkit`: Android's 2D detector — a box, three angles and contours.
 *   Jittery, and everything in this file was written for it.
 * - `sample`: the drawn stand-in for a machine with no camera.
 */
export type FaceSource = 'arkit' | 'mlkit' | 'sample';

/**
 * A 3D face mesh as the native module delivers it.
 *
 * `points` is x, y, x, y … as fractions of the rendered view, in the
 * module's own fixed vertex order, so the count and the order are the
 * same on every frame and the drawing side can glide between two of
 * them. `facing` carries one number per point: 1 when that part of the
 * head is square to the camera, 0 when it is edge-on, below 0 when it
 * has turned away — which is how a cap drawn from these points knows
 * which of its lines are round the back and should fade.
 */
export type FaceMesh = {
  readonly points: readonly number[];
  readonly facing: readonly number[];
};

/**
 * One detector frame, straight from the camera, in preview points.
 *
 * Structurally a superset of the capture screen's `FaceObservation`, so
 * anything written against that (head guidance, pose cues) accepts one.
 */
export type RawFace = {
  /** Centre of the face box. */
  cx: number;
  cy: number;
  /** The face box, ear to ear and brow to chin. */
  width: number;
  height: number;
  /** Degrees; NaN when the detector withheld an angle. */
  yaw: number;
  pitch: number;
  roll: number;
  /** Absent on a build whose detector runs without contours. */
  contours?: Contours;
  /**
   * Which detector this came from. Absent is read as `mlkit`: the
   * cautious answer, since it is the one the filter smooths hardest.
   */
  source?: FaceSource;
  /** The 3D mesh, when the source has one. ML Kit never does. */
  mesh?: FaceMesh;
  /** When it was seen, in milliseconds. */
  at: number;
};

/** The face as the scan sees it: smoothed, held, and judged for stillness. */
export type TrackedFace = {
  cx: number;
  cy: number;
  width: number;
  height: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** Smoothed contours. Empty when the detector delivers none. */
  contours: Contours;
  /** Whether the FACE contour is real rather than a box turned into an oval. */
  hasContours: boolean;
  /** Which detector produced this reading. */
  source: FaceSource;
  /** The smoothed 3D mesh, in the same shape and order the source delivered. */
  mesh?: FaceMesh;
  /** Whether there is a real 3D mesh to build a head from. */
  hasMesh: boolean;
  /** 0 moving, 1 still: position and size only — a deliberate turn is not instability. */
  stability: number;
  /** How fast the head is turning, in degrees per second, signed. */
  yawRate: number;
  /** True while riding through a missed frame on the last good reading. */
  held: boolean;
  /** The last frame that actually contained a face. */
  lastSeenAt: number;
  /** When this reading was produced. */
  at: number;
};

export type TrackerOptions = {
  /** Empty frames in a row before the face is declared gone. */
  lostAfterFrames: number;
  /** Silence, in milliseconds, before the face is declared gone regardless. */
  lostAfterMs: number;
  /** Share of a small move taken per frame. Low: a still head stays still. */
  alphaMin: number;
  /** Share of a large move taken per frame. High: a turn is followed, not trailed. */
  alphaMax: number;
  /** Motion per frame, in face widths, at which the filter reaches alphaMax. */
  adaptSpan: number;
  /** Per-frame share for the Euler angles, which jitter on their own scale. */
  angleAlpha: number;
  /** Change under this fraction of the face width is jitter and is not followed. */
  deadBand: number;
  /** Angle change under this many degrees is jitter. */
  angleDeadBand: number;
  /** How far back stillness is judged over. */
  windowMs: number;
  /** Centre movement, in face widths per second, at which stability reaches zero. */
  paceRef: number;
  /**
   * The share taken per frame from an ARKit reading, position, angles and
   * mesh alike, with no dead band at all.
   *
   * ARKit's anchor is solved from depth at 60 fps and does not jitter the
   * way a 2D detector's box does, so smoothing it is all cost and no
   * benefit: every bit of filtering is lag, and lag is exactly what makes
   * a mesh look like a sticker sliding over a face. Near enough to 1 to
   * be a pass-through, short of 1 so a single bad solve cannot snap the
   * whole head across the screen.
   */
  arkitAlpha: number;
};

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  lostAfterFrames: 6,
  lostAfterMs: 450,
  alphaMin: 0.22,
  alphaMax: 0.85,
  adaptSpan: 0.1,
  angleAlpha: 0.3,
  deadBand: 0.012,
  angleDeadBand: 0.35,
  windowMs: 360,
  paceRef: 0.9,
  arkitAlpha: 0.9,
};

/** One remembered position, for judging stillness. */
type MotionSample = { cx: number; cy: number; width: number; yaw: number; at: number };

export type TrackerState = {
  face: TrackedFace | null;
  emptyFrames: number;
  samples: MotionSample[];
  options: TrackerOptions;
};

export function createTracker(options: Partial<TrackerOptions> = {}): TrackerState {
  return {
    face: null,
    emptyFrames: 0,
    samples: [],
    options: { ...DEFAULT_TRACKER_OPTIONS, ...options },
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Moves `prev` towards `next`, ignoring what sits inside the dead band.
 *
 * The band is subtracted rather than gated: a change one pixel over the
 * band moves one pixel's worth, not the whole distance, so there is no
 * edge at which a resting mesh suddenly leaps. The cost is that a slow
 * drift is followed with a lag of one band — a couple of pixels — which
 * nobody sees. What they would see is the staircase a hard gate makes.
 */
export function follow(prev: number, next: number, alpha: number, band: number): number {
  if (!Number.isFinite(next)) return prev;
  if (!Number.isFinite(prev)) return next;
  const delta = next - prev;
  const size = Math.abs(delta);
  if (size <= band) return prev;
  return prev + alpha * (delta - Math.sign(delta) * band);
}

/**
 * How much of this frame's movement to take.
 *
 * A single fixed share is the wrong answer twice over: small enough to
 * hide jitter, it trails a turning head by a visible margin; large enough
 * to keep up, it passes the jitter straight through. So the share grows
 * with the size of the move — the filter is heavy at rest and light in
 * motion, which is what a hand-held instrument feels like.
 */
export function adaptiveAlpha(motion: number, options: TrackerOptions): number {
  const span = options.adaptSpan > 0 ? options.adaptSpan : 1;
  const t = clamp01(motion / span);
  return options.alphaMin + t * (options.alphaMax - options.alphaMin);
}

function smoothContours(
  prev: Contours,
  next: Contours | undefined,
  alpha: number,
  band: number,
): Contours {
  if (!next) return prev;
  const out: Contours = {};
  for (const name of CONTOUR_NAMES) {
    const points = next[name];
    if (!points || points.length === 0) continue;
    const before = prev[name];
    // A contour that appears, or changes its point count, is taken as it
    // comes: there is nothing meaningful to smooth it against.
    if (!before || before.length !== points.length) {
      out[name] = points.map((p) => ({ x: p.x, y: p.y }));
      continue;
    }
    const smoothed: Point[] = new Array(points.length);
    for (let i = 0; i < points.length; i += 1) {
      smoothed[i] = {
        x: follow(before[i].x, points[i].x, alpha, band),
        y: follow(before[i].y, points[i].y, alpha, band),
      };
    }
    out[name] = smoothed;
  }
  return out;
}

/**
 * Smooths one mesh against the last.
 *
 * The points are view fractions, not pixels, so the dead band that keeps
 * a contour still would be meaningless here — and is not wanted anyway:
 * the mesh's whole job is to sit on the head through a turn, and a band
 * is a lag. A mesh that changes its vertex count has changed topology
 * and is taken exactly as it comes.
 */
export function smoothMesh(prev: FaceMesh | undefined, next: FaceMesh, alpha: number): FaceMesh {
  if (!prev || prev.points.length !== next.points.length) {
    return { points: next.points.slice(), facing: next.facing.slice() };
  }
  const points = new Array<number>(next.points.length);
  for (let i = 0; i < next.points.length; i += 1) {
    points[i] = follow(prev.points[i], next.points[i], alpha, 0);
  }
  const facing = new Array<number>(next.facing.length);
  const before = prev.facing.length === next.facing.length ? prev.facing : null;
  for (let i = 0; i < next.facing.length; i += 1) {
    facing[i] = before === null ? next.facing[i] : follow(before[i], next.facing[i], alpha, 0);
  }
  return { points, facing };
}

/** A mesh with points in it, or undefined: an empty one is not a head. */
function meshOrNone(mesh: FaceMesh | undefined): FaceMesh | undefined {
  return mesh && mesh.points.length >= 6 ? mesh : undefined;
}

/**
 * Stillness, from the recent path of the face centre and its size.
 *
 * Measured as a pace — face widths per second — so the number means the
 * same thing for a face filling the frame and one at arm's length.
 * Fewer than three samples, or a window too short to judge, is "not yet
 * still": a face that has just appeared has to earn it.
 */
export function stabilityOf(samples: MotionSample[], options: TrackerOptions): number {
  if (samples.length < 3) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const seconds = (last.at - first.at) / 1000;
  if (seconds < options.windowMs / 2000) return 0;

  let travelled = 0;
  let sizeChange = 0;
  let widthSum = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    travelled += Math.hypot(b.cx - a.cx, b.cy - a.cy);
    sizeChange += Math.abs(b.width - a.width);
    widthSum += b.width;
  }
  const meanWidth = widthSum / (samples.length - 1);
  if (!(meanWidth > 0)) return 0;
  const pace = (travelled + sizeChange * 0.5) / meanWidth / seconds;
  return clamp01(1 - pace / options.paceRef);
}

function yawRateOf(samples: MotionSample[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const seconds = (last.at - first.at) / 1000;
  if (seconds <= 0 || !Number.isFinite(first.yaw) || !Number.isFinite(last.yaw)) return 0;
  return (last.yaw - first.yaw) / seconds;
}

function trimSamples(samples: MotionSample[], now: number, windowMs: number): MotionSample[] {
  const cutoff = now - windowMs;
  let start = 0;
  while (start < samples.length && samples[start].at < cutoff) start += 1;
  return start === 0 ? samples : samples.slice(start);
}

/**
 * Folds one detector frame into the tracker. Pure: returns the next state.
 *
 * `raw` is null for a frame with no face in it. The first few of those
 * are ridden out on the last good reading, marked `held`, because a
 * detector that blinks is far more common than a head that vanishes.
 */
export function trackFrame(
  state: TrackerState,
  raw: RawFace | null,
  now: number = raw?.at ?? Date.now(),
): TrackerState {
  const { options } = state;

  if (raw === null) {
    const prev = state.face;
    if (prev === null) return state.emptyFrames === 0 ? state : { ...state, emptyFrames: 0 };
    const emptyFrames = state.emptyFrames + 1;
    const lost =
      emptyFrames >= options.lostAfterFrames || now - prev.lastSeenAt > options.lostAfterMs;
    if (lost) return { ...state, face: null, emptyFrames, samples: [] };
    return {
      ...state,
      emptyFrames,
      face: { ...prev, held: true, at: now },
    };
  }

  const prev = state.face;

  const source: FaceSource = raw.source ?? 'mlkit';
  const rawMesh = meshOrNone(raw.mesh);

  // A face arriving from nothing is taken where it is. Smoothing it out
  // of a stale position would fly the mesh across the screen.
  if (prev === null) {
    const contours = smoothContours({}, raw.contours, 1, 0);
    const samples: MotionSample[] = [
      { cx: raw.cx, cy: raw.cy, width: raw.width, yaw: raw.yaw, at: now },
    ];
    const mesh = rawMesh === undefined ? undefined : smoothMesh(undefined, rawMesh, 1);
    return {
      ...state,
      emptyFrames: 0,
      samples,
      face: {
        cx: raw.cx,
        cy: raw.cy,
        width: raw.width,
        height: raw.height,
        yaw: raw.yaw,
        pitch: raw.pitch,
        roll: raw.roll,
        contours,
        hasContours: (contours.FACE?.length ?? 0) > 0,
        source,
        ...(mesh === undefined ? {} : { mesh }),
        hasMesh: mesh !== undefined,
        stability: 0,
        yawRate: 0,
        held: false,
        lastSeenAt: now,
        at: now,
      },
    };
  }

  const scale = prev.width > 0 ? prev.width : Math.max(1, raw.width);
  const motion =
    Math.hypot(raw.cx - prev.cx, raw.cy - prev.cy) / scale + Math.abs(raw.width - prev.width) / scale;
  // ARKit is trusted: one share for everything, no dead band. Anything
  // else is followed by how much it moved, and held inside its band.
  const arkit = source === 'arkit';
  const alpha = arkit ? options.arkitAlpha : adaptiveAlpha(motion, options);
  const band = arkit ? 0 : options.deadBand * scale;
  const angleAlpha = arkit ? options.arkitAlpha : options.angleAlpha;
  const angleBand = arkit ? 0 : options.angleDeadBand;

  const cx = follow(prev.cx, raw.cx, alpha, band);
  const cy = follow(prev.cy, raw.cy, alpha, band);
  const width = follow(prev.width, raw.width, alpha, band);
  const height = follow(prev.height, raw.height, alpha, band);
  const yaw = follow(prev.yaw, raw.yaw, angleAlpha, angleBand);
  const pitch = follow(prev.pitch, raw.pitch, angleAlpha, angleBand);
  const roll = follow(prev.roll, raw.roll, angleAlpha, angleBand);
  const contours = smoothContours(prev.contours, raw.contours, alpha, band);
  // A source that stops sending a mesh (a lost anchor) loses it here
  // rather than keeping a stale head glued to a moving face.
  const mesh = rawMesh === undefined ? undefined : smoothMesh(prev.mesh, rawMesh, alpha);

  // Stillness is judged on the smoothed reading — what is drawn — so the
  // detector's own jitter, already taken out above, is not counted as a
  // head that will not keep still.
  const samples = trimSamples(
    [...state.samples, { cx, cy, width, yaw, at: now }],
    now,
    options.windowMs,
  );

  return {
    ...state,
    emptyFrames: 0,
    samples,
    face: {
      cx,
      cy,
      width,
      height,
      yaw,
      pitch,
      roll,
      contours,
      hasContours: (contours.FACE?.length ?? 0) > 0,
      source,
      ...(mesh === undefined ? {} : { mesh }),
      hasMesh: mesh !== undefined,
      stability: stabilityOf(samples, options),
      yawRate: yawRateOf(samples),
      held: false,
      lastSeenAt: now,
      at: now,
    },
  };
}

/** A rectangle in preview points: the guidance frame the ring sits in. */
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * The tracked face in the form the scan engine reads.
 *
 * The engine never sees a pixel: everything spatial is a fraction of the
 * guidance frame — the square the ring is drawn in — so a `bounds` of
 * `{x: 0.25, y: 0.2, width: 0.5, height: 0.6}` is a face centred and a
 * little high on any screen, and `size` is the face's width as a share
 * of that frame's width. Nothing judges that figure: there is no near
 * and no far in this scan and nobody is ever asked to move, so `size`
 * is carried for the record and for drawing, and for nothing else.
 * Structurally the engine's `FaceReading`; kept as its own shape so this
 * module depends on nothing but numbers.
 */
export type EngineReading = {
  bounds: Rect;
  yaw: number;
  pitch: number;
  roll: number;
  stability: number;
  size: number;
};

/**
 * Normalises a tracked face against the guidance frame the screen lays
 * the ring out in. A frame with no size yet — the first render, before
 * layout — yields NaN for everything spatial, which the engine reads as
 * "not readable" rather than as a face somewhere in particular.
 */
export function toEngineReading(face: TrackedFace, frame: Rect): EngineReading {
  const usable = frame.width > 0 && frame.height > 0;
  const nan = Number.NaN;
  return {
    bounds: usable
      ? {
          x: (face.cx - face.width / 2 - frame.x) / frame.width,
          y: (face.cy - face.height / 2 - frame.y) / frame.height,
          width: face.width / frame.width,
          height: face.height / frame.height,
        }
      : { x: nan, y: nan, width: nan, height: nan },
    yaw: face.yaw,
    pitch: face.pitch,
    roll: face.roll,
    stability: face.stability,
    size: usable ? face.width / frame.width : nan,
  };
}

/**
 * Lets time pass with no frame at all — a paused camera, a stalled
 * detector. A face nobody has seen for longer than `lostAfterMs` is gone
 * whether or not an empty frame ever said so.
 */
export function expireTracker(state: TrackerState, now: number): TrackerState {
  const face = state.face;
  if (face === null) return state;
  if (now - face.lastSeenAt <= state.options.lostAfterMs) return state;
  return { ...state, face: null, samples: [] };
}

/* ------------------------------------------------------------------ *
 * The mesh lattice
 *
 * A fixed topology, so the drawing side can hold it as one flat array
 * of numbers and glide between successive readings on the UI thread
 * without allocating. Three regions:
 *
 *   face — rows from the brow line down to the chin, columns spread
 *          across the face oval's width at each row, so the grid is
 *          warped to the outline;
 *   cap  — rows from the brow line *up* through the hairline to a dome
 *          apex above the face oval: the same columns, continued, on an
 *          ellipse that stands in for the cranium. This is the hair
 *          region and the drawing gives it the emphasis;
 *   features — the contours themselves, as interior curves.
 *
 * Every row and column is anchored to the face's own axes, read off the
 * eye line (or, failing that, the oval's long axis), so a tilted head
 * gets a tilted lattice rather than a grid sliding over it.
 * ------------------------------------------------------------------ */

export const MESH = {
  /** Rows from the brow line to the chin, brow row included. */
  faceRows: 13,
  /** Rows from the brow line to the apex, brow row included. */
  capRows: 8,
  /** Columns across every row. Odd, so one column runs down the middle. */
  cols: 17,
  /** How far the apex sits above the face oval's top, in face heights. */
  capRise: 0.22,
  /** Where the brow line is assumed when no eyebrow contour arrives. */
  browGuess: 0.3,
} as const;

/** The middle column, which runs down the nose. */
export const MESH_MID_COL = (MESH.cols - 1) / 2;

/**
 * How the face grid flows round the eyes and the mouth.
 *
 * A grid warped only to the oval runs its lines straight across the
 * eyes, which is the one thing that makes a wireframe read as a sticker
 * rather than a measurement. So inside a halo round each of those
 * features the grid points are pushed outwards, radially, to at least
 * the feature's own edge: the lines bunch on the eyelids and the lips,
 * open round them, and are untouched beyond `reach` times the feature's
 * radius. The push is continuous at the reach, so nothing kinks.
 */
export const BEND = {
  /** In units of the feature's own radius. Outside this the grid is untouched. */
  reach: 1.6,
  /** How much wider than the eye contour the cleared halo is, across and down. */
  eyePad: { x: 1.15, y: 1.35 },
  mouthPad: { x: 1.1, y: 1.25 },
  /** An eye ring is thin; a halo thinner than this share of its width would be a slit. */
  minAspect: 0.4,
} as const;

/** The contours the lattice carries, with the point counts ML Kit fixes for them. */
export const FEATURES = [
  ['FACE', 36],
  ['LEFT_EYEBROW_TOP', 5],
  ['RIGHT_EYEBROW_TOP', 5],
  ['LEFT_EYE', 16],
  ['RIGHT_EYE', 16],
  ['NOSE_BRIDGE', 2],
  ['NOSE_BOTTOM', 3],
  ['UPPER_LIP_TOP', 11],
  ['LOWER_LIP_BOTTOM', 11],
] as const satisfies readonly (readonly [ContourName, number])[];

export type FeatureName = (typeof FEATURES)[number][0];

export const FACE_OFFSET = 0;
export const CAP_OFFSET = MESH.faceRows * MESH.cols;
export const FEATURE_OFFSET = CAP_OFFSET + MESH.capRows * MESH.cols;

const FEATURE_OFFSETS: Record<string, number> = {};
const FEATURE_BITS: Record<string, number> = {};
let cursor = FEATURE_OFFSET;
FEATURES.forEach(([name, count], index) => {
  FEATURE_OFFSETS[name] = cursor;
  FEATURE_BITS[name] = 1 << index;
  cursor += count;
});

/** Total points in a lattice; the flat array is twice this long. */
export const LATTICE_POINTS = cursor;
export const LATTICE_LENGTH = LATTICE_POINTS * 2;

/** Index, in points, of a face-grid cell. */
export function faceIndex(row: number, col: number): number {
  return FACE_OFFSET + row * MESH.cols + col;
}

/** Index, in points, of a cap-grid cell. Row 0 is the brow line, the last row the apex. */
export function capIndex(row: number, col: number): number {
  return CAP_OFFSET + row * MESH.cols + col;
}

/** Index, in points, of the first point of a feature contour. */
export function featureOffset(name: FeatureName): number {
  return FEATURE_OFFSETS[name];
}

/** The bit in `Lattice.mask` that says a feature contour was actually seen. */
export function featureBit(name: FeatureName): number {
  return FEATURE_BITS[name];
}

/**
 * The cap points worth lighting during a scan: the hairline band just
 * above the brow row, and the temple edges either side of it.
 */
export const HAIRLINE_SITES: readonly number[] = (() => {
  const sites = new Set<number>();
  for (let col = 0; col < MESH.cols; col += 1) {
    sites.add(capIndex(1, col));
    sites.add(capIndex(2, col));
  }
  const edge = Math.max(1, Math.round(MESH.cols / 6));
  for (let row = 0; row < MESH.capRows - 1; row += 1) {
    for (let k = 0; k < edge; k += 1) {
      sites.add(capIndex(row, k));
      sites.add(capIndex(row, MESH.cols - 1 - k));
    }
  }
  return [...sites];
})();

export type Lattice = {
  /** `LATTICE_LENGTH` numbers: x, y, x, y … in preview points. */
  pts: number[];
  /** One `featureBit` per contour that was real rather than filled in. */
  mask: number;
};

type Frame = {
  /** Origin: the oval's centroid. */
  ox: number;
  oy: number;
  /** Unit vector along the face's right, on screen. */
  rx: number;
  ry: number;
  /** Unit vector down the face. */
  dx: number;
  dy: number;
};

function toLocal(frame: Frame, p: Point): Point {
  const x = p.x - frame.ox;
  const y = p.y - frame.oy;
  return { x: x * frame.rx + y * frame.ry, y: x * frame.dx + y * frame.dy };
}

function fromLocal(frame: Frame, x: number, y: number): Point {
  return {
    x: frame.ox + x * frame.rx + y * frame.dx,
    y: frame.oy + x * frame.ry + y * frame.dy,
  };
}

function centroid(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/**
 * The face's own axes.
 *
 * The line between the eyes is the most reliable reading of tilt the
 * detector offers: two well-tracked clusters, far apart. Without eyes
 * the oval's long axis stands in, which on a face is always the
 * vertical one. Whichever is used, "up" is the end nearer the top of
 * the screen — nobody scans their hair upside down.
 */
export function faceFrame(oval: Point[], contours: Contours): Frame {
  const origin = centroid(oval);
  const left = contours.LEFT_EYE;
  const right = contours.RIGHT_EYE;
  let rx = 1;
  let ry = 0;

  if (left && right && left.length > 0 && right.length > 0) {
    const a = centroid(left);
    const b = centroid(right);
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len = Math.hypot(vx, vy);
    if (len > 1e-6) {
      rx = vx / len;
      ry = vy / len;
    }
  } else {
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const p of oval) {
      const x = p.x - origin.x;
      const y = p.y - origin.y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
    }
    // The major axis is the vertical of the face; the right vector is a
    // quarter turn from it. Nearly-round ovals give a noisy angle, so a
    // weak elongation is read as upright.
    const elongation = Math.abs(sxx - syy) + 2 * Math.abs(sxy);
    if (elongation > 0.1 * (sxx + syy)) {
      const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      // theta is the major axis; down the face is that axis pointing to +y.
      let dx = Math.cos(theta);
      let dy = Math.sin(theta);
      if (dy < 0) {
        dx = -dx;
        dy = -dy;
      }
      rx = dy;
      ry = -dx;
    }
  }

  if (rx < 0) {
    rx = -rx;
    ry = -ry;
  }
  // Down is right turned a quarter clockwise on a y-down screen.
  return { ox: origin.x, oy: origin.y, rx, ry, dx: -ry, dy: rx };
}

/**
 * The oval's width at a given height, in the face's own frame.
 *
 * Walks the polygon's edges for the two crossings of the horizontal. A
 * height that misses the polygon (above the top, below the chin) falls
 * back to the ellipse the polygon approximates, so a row never collapses
 * to nothing because of a rounding error at the very top.
 */
export function edgesAt(
  local: Point[],
  y: number,
  fallback: { cx: number; cy: number; a: number; b: number },
): { left: number; right: number } {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  const n = local.length;
  for (let i = 0; i < n; i += 1) {
    const p = local[i];
    const q = local[(i + 1) % n];
    const crosses = (p.y <= y && y < q.y) || (q.y <= y && y < p.y);
    if (!crosses) continue;
    const x = p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y);
    if (x < left) left = x;
    if (x > right) right = x;
  }
  if (left <= right && Number.isFinite(left) && Number.isFinite(right) && right - left > 1e-3) {
    return { left, right };
  }
  const t = fallback.b > 0 ? (y - fallback.cy) / fallback.b : 0;
  const hw = fallback.a * Math.sqrt(Math.max(0, 1 - t * t));
  return { left: fallback.cx - hw, right: fallback.cx + hw };
}

/** An axis-aligned ellipse in the face's own frame: a halo round a feature. */
export type Halo = { cx: number; cy: number; rx: number; ry: number };

/**
 * The halo round a feature, from its contour points in the face frame:
 * the points' extent, padded, with a floor on how thin it may be.
 */
export function haloOf(local: Point[], pad: { x: number; y: number }): Halo | null {
  if (local.length < 2) return null;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const p of local) {
    if (p.x < left) left = p.x;
    if (p.x > right) right = p.x;
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  const rx = ((right - left) / 2) * pad.x;
  if (!(rx > 1e-3)) return null;
  const ry = Math.max(((bottom - top) / 2) * pad.y, rx * BEND.minAspect);
  return { cx: (left + right) / 2, cy: (top + bottom) / 2, rx, ry };
}

/**
 * Pushes a point out of a halo. Distance is measured in the halo's own
 * radii, so `d = 1` is its edge: a point inside lands on or beyond the
 * edge, a point at `reach` stays exactly where it was, and the mapping
 * between is linear, which keeps the order of points along a row.
 *
 * A point sitting dead on the centre has no direction to go; it is sent
 * straight down, which on a face is the cheek below the eye.
 */
export function bendAround(p: Point, halo: Halo, reach: number = BEND.reach): Point {
  let ux = (p.x - halo.cx) / halo.rx;
  let uy = (p.y - halo.cy) / halo.ry;
  let d = Math.hypot(ux, uy);
  if (d >= reach) return p;
  if (d < 1e-6) {
    ux = 0;
    uy = 1e-6;
    d = 1e-6;
  }
  const pushed = 1 + (reach - 1) * (d / reach);
  const s = pushed / d;
  return { x: halo.cx + ux * s * halo.rx, y: halo.cy + uy * s * halo.ry };
}

/** The halos the face grid must flow round, from whichever features were seen. */
function halosOf(frame: Frame, contours: Contours): Halo[] {
  const halos: Halo[] = [];
  const toFrame = (points: Point[] | undefined): Point[] =>
    points ? points.map((p) => toLocal(frame, p)) : [];
  for (const eye of [contours.LEFT_EYE, contours.RIGHT_EYE]) {
    const halo = haloOf(toFrame(eye), BEND.eyePad);
    if (halo) halos.push(halo);
  }
  const mouth = [...toFrame(contours.UPPER_LIP_TOP), ...toFrame(contours.LOWER_LIP_BOTTOM)];
  const lips = haloOf(mouth, BEND.mouthPad);
  if (lips) halos.push(lips);
  return halos;
}

/** Beyond this share of a row's half-width the bend is squashed rather than let run. */
const SQUASH_FROM = 0.86;

/**
 * Keeps a bent point inside its row without a hard clamp. Up to
 * `SQUASH_FROM` of the half-width an offset is its own; past that the
 * excess is compressed into the band that remains, asymptotically, so
 * two points pushed past the edge still land in the order they left in.
 * A clamp would stack them on the edge, and a stacked column is a line
 * that has visibly vanished.
 */
export function squash(offset: number, halfWidth: number): number {
  const soft = SQUASH_FROM * halfWidth;
  const size = Math.abs(offset);
  if (size <= soft) return offset;
  const band = halfWidth - soft;
  if (!(band > 0)) return Math.sign(offset) * halfWidth;
  const excess = size - soft;
  return Math.sign(offset) * (soft + band * (1 - Math.exp(-excess / band)));
}

/** Columns bunch towards the edges, the way a lattice on a sphere foreshortens. */
function columnFraction(col: number): number {
  const t = MESH.cols > 1 ? col / (MESH.cols - 1) : 0.5;
  return Math.sin(-Math.PI / 2 + Math.PI * t);
}

/** The ellipse a bounds box stands for when no FACE contour arrives. */
export function ovalFromBounds(cx: number, cy: number, width: number, height: number): Point[] {
  const points: Point[] = new Array(36);
  for (let i = 0; i < 36; i += 1) {
    const theta = -Math.PI / 2 + (2 * Math.PI * i) / 36;
    points[i] = { x: cx + (width / 2) * Math.cos(theta), y: cy + (height / 2) * Math.sin(theta) };
  }
  return points;
}

function resample(points: Point[], count: number): Point[] {
  if (points.length === count) return points;
  const out: Point[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const t = count > 1 ? (i / (count - 1)) * (points.length - 1) : 0;
    const lo = Math.floor(t);
    const hi = Math.min(points.length - 1, lo + 1);
    const f = t - lo;
    out[i] = {
      x: points[lo].x + (points[hi].x - points[lo].x) * f,
      y: points[lo].y + (points[hi].y - points[lo].y) * f,
    };
  }
  return out;
}

/**
 * Builds the lattice for one tracked face.
 *
 * Deterministic and allocation-light: one array of `LATTICE_LENGTH`
 * numbers, every one of them finite, whatever the detector delivered.
 */
export function buildLattice(face: TrackedFace): Lattice {
  const pts = new Array<number>(LATTICE_LENGTH).fill(0);
  let mask = 0;

  const rawOval = face.contours.FACE;
  const oval =
    rawOval && rawOval.length >= 8
      ? resample(rawOval, 36)
      : ovalFromBounds(face.cx, face.cy, face.width, face.height);
  if (rawOval && rawOval.length >= 8) mask |= featureBit('FACE');

  const frame = faceFrame(oval, face.contours);
  const local = oval.map((p) => toLocal(frame, p));

  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let leftmost = Number.POSITIVE_INFINITY;
  let rightmost = Number.NEGATIVE_INFINITY;
  for (const p of local) {
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
    if (p.x < leftmost) leftmost = p.x;
    if (p.x > rightmost) rightmost = p.x;
  }
  const height = Math.max(1, bottom - top);
  const fallback = {
    cx: (leftmost + rightmost) / 2,
    cy: (top + bottom) / 2,
    a: Math.max(1, (rightmost - leftmost) / 2),
    b: height / 2,
  };

  // The brow line: just above the eyebrows when they were seen.
  let brow = top + MESH.browGuess * height;
  const brows = [...(face.contours.LEFT_EYEBROW_TOP ?? []), ...(face.contours.RIGHT_EYEBROW_TOP ?? [])];
  if (brows.length > 0) {
    let sum = 0;
    for (const p of brows) sum += toLocal(frame, p).y;
    brow = sum / brows.length - 0.05 * height;
  }
  brow = Math.min(top + 0.5 * height, Math.max(top + 0.08 * height, brow));

  const write = (index: number, p: Point) => {
    pts[index * 2] = p.x;
    pts[index * 2 + 1] = p.y;
  };

  // Face rows: brow to a hair above the chin, columns across the oval,
  // then bent round the eyes and the mouth and kept inside the row's own
  // edges, so a bend can never push a point out of the oval.
  const chin = bottom - 0.03 * height;
  const halos = halosOf(frame, face.contours);
  for (let row = 0; row < MESH.faceRows; row += 1) {
    const t = MESH.faceRows > 1 ? row / (MESH.faceRows - 1) : 0;
    const y = brow + (chin - brow) * t;
    const { left, right } = edgesAt(local, y, fallback);
    const mid = (left + right) / 2;
    const hw = ((right - left) / 2) * 0.97;
    for (let col = 0; col < MESH.cols; col += 1) {
      let p: Point = { x: mid + hw * columnFraction(col), y };
      for (const halo of halos) p = bendAround(p, halo);
      write(faceIndex(row, col), fromLocal(frame, mid + squash(p.x - mid, hw), p.y));
    }
  }

  // Cap rows: the same columns carried up an ellipse from the brow line
  // to an apex above the oval. Rows bunch towards the apex so the dome
  // foreshortens like a sphere seen from the front.
  const apex = top - MESH.capRise * height;
  const browEdges = edgesAt(local, brow, fallback);
  const browMid = (browEdges.left + browEdges.right) / 2;
  const browHw = ((browEdges.right - browEdges.left) / 2) * 0.97;
  for (let row = 0; row < MESH.capRows; row += 1) {
    if (row === 0) {
      // The brow row is shared with the face grid — the same points, bent
      // and squashed as the face's are — so the two lattices meet without
      // a seam whatever the eyebrows and eyes did to it.
      for (let col = 0; col < MESH.cols; col += 1) {
        const k = faceIndex(0, col) * 2;
        write(capIndex(0, col), { x: pts[k], y: pts[k + 1] });
      }
      continue;
    }
    const s = MESH.capRows > 1 ? row / (MESH.capRows - 1) : 0;
    const angle = (s * Math.PI) / 2;
    const y = brow - (brow - apex) * Math.sin(angle);
    const hw = browHw * Math.cos(angle);
    for (let col = 0; col < MESH.cols; col += 1) {
      const offset = squash(hw * columnFraction(col), hw);
      write(capIndex(row, col), fromLocal(frame, browMid + offset, y));
    }
  }

  // Features: the contours as delivered, resampled to their fixed counts.
  // A missing one is parked on the face centre, unlit, so nothing in the
  // array is ever NaN.
  const centre = fromLocal(frame, 0, 0);
  for (const [name, count] of FEATURES) {
    const base = featureOffset(name);
    const points = name === 'FACE' ? oval : face.contours[name];
    if (points && points.length > 0) {
      const fitted = resample(points, count);
      for (let i = 0; i < count; i += 1) write(base + i, fitted[i]);
      if (name !== 'FACE') mask |= featureBit(name);
    } else {
      for (let i = 0; i < count; i += 1) write(base + i, centre);
    }
  }

  return { pts, mask };
}

/* ------------------------------------------------------------------ *
 * A face that is not there
 *
 * The simulator has no camera, so it has no face for the mesh to follow.
 * This draws one — the proportions of an averaged front-on head, in the
 * contour counts ML Kit uses — so the mesh can be seen moving on a
 * machine with no sensor. It exists for the sample camera and the tests
 * and nowhere else; anything it feeds is marked as a sample by the
 * camera that shows it.
 * ------------------------------------------------------------------ */

function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, count: number): Point[] {
  const out: Point[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const t = count > 1 ? from + ((to - from) * i) / (count - 1) : from;
    out[i] = { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
  }
  return out;
}

function ring(cx: number, cy: number, rx: number, ry: number, count: number): Point[] {
  const out: Point[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const t = (2 * Math.PI * i) / count;
    out[i] = { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
  }
  return out;
}

/** The contours of a drawn front-on face inside a box, tilted by `roll` degrees. */
export function syntheticContours(
  cx: number,
  cy: number,
  width: number,
  height: number,
  roll = 0,
): Contours {
  const eyeY = cy - 0.12 * height;
  const eyeDx = 0.3 * width;
  const rad = (roll * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const tilt = (points: Point[]): Point[] =>
    points.map((p) => {
      const x = p.x - cx;
      const y = p.y - cy;
      return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
    });

  return {
    FACE: tilt(ovalFromBounds(cx, cy, width, height)),
    LEFT_EYEBROW_TOP: tilt(arc(cx - eyeDx, eyeY - 0.09 * height, 0.14 * width, 0.03 * height, Math.PI, 2 * Math.PI, 5)),
    RIGHT_EYEBROW_TOP: tilt(arc(cx + eyeDx, eyeY - 0.09 * height, 0.14 * width, 0.03 * height, Math.PI, 2 * Math.PI, 5)),
    LEFT_EYE: tilt(ring(cx - eyeDx, eyeY, 0.11 * width, 0.04 * height, 16)),
    RIGHT_EYE: tilt(ring(cx + eyeDx, eyeY, 0.11 * width, 0.04 * height, 16)),
    NOSE_BRIDGE: tilt([
      { x: cx, y: eyeY },
      { x: cx, y: cy + 0.1 * height },
    ]),
    NOSE_BOTTOM: tilt([
      { x: cx - 0.09 * width, y: cy + 0.13 * height },
      { x: cx, y: cy + 0.15 * height },
      { x: cx + 0.09 * width, y: cy + 0.13 * height },
    ]),
    UPPER_LIP_TOP: tilt(arc(cx, cy + 0.28 * height, 0.22 * width, 0.03 * height, Math.PI, 2 * Math.PI, 11)),
    LOWER_LIP_BOTTOM: tilt(arc(cx, cy + 0.3 * height, 0.22 * width, 0.06 * height, 0, Math.PI, 11)),
    LEFT_CHEEK: tilt([{ x: cx - 0.3 * width, y: cy + 0.1 * height }]),
    RIGHT_CHEEK: tilt([{ x: cx + 0.3 * width, y: cy + 0.1 * height }]),
  };
}

/**
 * The shape of the drawn stand-in mesh: rows from the crown down to the
 * chin, columns all the way round. Nothing reads these counts as a fact
 * about a head — the native module has its own, larger, fixed order —
 * but they are fixed here so successive sample frames can be smoothed
 * and glided between exactly as a real one is.
 */
export const SYNTHETIC_MESH = { rows: 13, cols: 16 } as const;

/** How much bigger than the face box the whole head is, across and down. */
const SYNTHETIC_HEAD = { wide: 1.12, tall: 1.5, rise: 0.2 } as const;

/**
 * A DRAWN 3D head for a machine with no camera.
 *
 * An ellipsoid in the head's own axes, turned by the three angles and
 * projected straight down the view axis, so the sample mesh turns with
 * the sample face and its back half reports a negative `facing` the way
 * ARKit's does. It is geometry with a face box for a scale, and it is
 * not a measurement of anything: only the sample camera ever shows it.
 */
export function syntheticMesh(
  view: ViewSize,
  cx: number,
  cy: number,
  width: number,
  height: number,
  yaw: number,
  pitch: number,
  roll: number,
): FaceMesh {
  const a = (width * SYNTHETIC_HEAD.wide) / 2;
  const b = (height * SYNTHETIC_HEAD.tall) / 2;
  const depth = a * 1.1;
  const originY = cy - SYNTHETIC_HEAD.rise * height;
  const rad = Math.PI / 180;
  const cy1 = Math.cos(yaw * rad);
  const sy1 = Math.sin(yaw * rad);
  const cp = Math.cos(pitch * rad);
  const sp = Math.sin(pitch * rad);
  const cr = Math.cos(roll * rad);
  const sr = Math.sin(roll * rad);

  // Yaw about the vertical, then pitch about the head's own right, then
  // roll in the plane of the screen — the order the angles are read in.
  const turn = (x: number, y: number, z: number): [number, number, number] => {
    const x1 = x * cy1 + z * sy1;
    const z1 = -x * sy1 + z * cy1;
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    return [x1 * cr - y2 * sr, x1 * sr + y2 * cr, z2];
  };

  const { rows, cols } = SYNTHETIC_MESH;
  const points = new Array<number>(rows * cols * 2);
  const facing = new Array<number>(rows * cols);
  let i = 0;
  for (let row = 0; row < rows; row += 1) {
    const phi = (Math.PI * row) / (rows - 1);
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    for (let col = 0; col < cols; col += 1) {
      const theta = (2 * Math.PI * col) / cols;
      // Projected straight down the view axis, so the depth is dropped.
      const [x, y] = turn(a * sinPhi * Math.sin(theta), -b * cosPhi, depth * sinPhi * Math.cos(theta));
      const [nx, ny, nz] = turn(
        (sinPhi * Math.sin(theta)) / a,
        -cosPhi / b,
        (sinPhi * Math.cos(theta)) / depth,
      );
      const len = Math.hypot(nx, ny, nz) || 1;
      points[i * 2] = (cx + x) / (view.width || 1);
      points[i * 2 + 1] = (originY + y) / (view.height || 1);
      facing[i] = nz / len;
      i += 1;
    }
  }
  return { points, facing };
}

/** One full rehearsal of the scan's choreography by the drawn stand-in. */
export const SAMPLE_LOOP_MS = 24_000;

/**
 * A stand-in reading for a preview with no camera behind it: a drawn face
 * in the upper middle of the view, swaying and turning gently so the
 * tracking and the mesh have something to do.
 *
 * `t` is the phase of the sway, in milliseconds since the demo began.
 * `at` is when the reading is stamped as seen — the same clock the real
 * detector and `expireTracker` use, so pass `Date.now()`. The two are
 * separate because a phase of "a few hundred milliseconds" read as a
 * timestamp is a face last seen in 1970, which every expiry tick would
 * drop and the next frame re-acquire from nothing.
 */
export function syntheticFace(view: ViewSize, t: number, at: number = t): RawFace {
  const width = view.width * 0.46;
  const height = width * 1.32;
  const cx = view.width / 2 + Math.sin(t / 1300) * view.width * 0.015;
  const cy = view.height * 0.42 + Math.sin(t / 1900) * view.height * 0.008;
  const roll = Math.sin(t / 2300) * 4;
  // The stand-in rehearses the scan's own choreography on a loop: twelve
  // seconds turning left and right with the chin level, then twelve with
  // the head lowered, turning again. So a simulator run reaches all four
  // regions the way a person does, instead of sitting square on forever.
  const phase = t % SAMPLE_LOOP_MS;
  const down = phase >= SAMPLE_LOOP_MS / 2;
  const yaw = Math.sin((2 * Math.PI * phase) / (SAMPLE_LOOP_MS / 2)) * 28;
  const pitch = down ? -22 + Math.sin(t / 900) * 2 : Math.sin(t / 3100) * 3;
  return {
    cx,
    cy,
    width,
    height,
    yaw,
    pitch,
    roll,
    contours: syntheticContours(cx, cy, width, height, roll),
    source: 'sample',
    mesh: syntheticMesh(view, cx, cy, width, height, yaw, pitch, roll),
    at,
  };
}
