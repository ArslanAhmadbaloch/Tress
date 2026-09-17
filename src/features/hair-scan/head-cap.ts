/**
 * The head cap: the geometry the hair scan draws over the head.
 *
 * Not a face mesh. The face detector gives an oval, the eyebrows and a
 * pose; from those this builds a *cap* — a wireframe skull that starts
 * at the eyebrow line, covers the forehead and the hairline, wraps down
 * both sides past the temples to ear level, and rises over the whole
 * top of the head. The face below the eyebrows is left empty: the scan
 * looks at hair, and the overlay says so by where it sits.
 *
 * ── The shape ─────────────────────────────────────────────────────────
 * A parametric ellipsoid in the face's own frame (right, down, towards
 * the camera), sized from the oval: a little wider than the face, its
 * equator at ear level, its pole `rise` face heights above the oval's
 * top. Meridians run from the pole down to a base curve; the base is the
 * brow line across the front and drops to ear level at the sides, so
 * the hairline, the temples and the sides of the head are all inside
 * it. Rows are latitude rings between that base and the pole, packed
 * towards the base where the hairline band is, and columns bunch
 * towards the sides where the temples are.
 *
 * ── The turn ──────────────────────────────────────────────────────────
 * Every point is a point in three dimensions, rotated by the tracked
 * pitch and yaw and projected flat: turn the head and the meridians on
 * the near side spread while the far side's compress and fold behind
 * the silhouette. Each point carries its *facing* — how much its
 * surface normal points at the camera — so the drawing can fade what
 * faces away. Roll needs no rotation: the frame is read off the eye
 * line, so a tilted head gets a tilted cap.
 *
 * The cap is pinned to the face at the middle of the brow line: that
 * vertex lands on the detected brow centre at every pose, so whatever
 * the pose does to the dome, the base stays on the eyebrows.
 *
 * ── The fill ──────────────────────────────────────────────────────────
 * Each vertex is mapped once to one of the scan ring's twenty-four
 * sectors, so the drawing can tint the cap from the engine's coverage
 * and the head fills in as the ring does. The mapping is the ring's own
 * dial, laid on the head: the sides of the cap belong to the sectors at
 * three and nine o'clock, the crown to the chin-down band at six, the
 * hairline to the top of the dial, and the front centre — the ring's
 * own centre — to the scan as a whole. It is a picture of where the
 * head has been pointed, the same one the ring gives.
 *
 * ── What it is not ────────────────────────────────────────────────────
 * Geometry, extrapolated from a face. It is where the scan looks, not
 * a reading of anything on the head. Everything here is pure and runs
 * under node; nothing knows what hair is.
 */

import { edgesAt, faceFrame, ovalFromBounds, type Contours, type Point } from './tracking';

/* -------------------------------- tuning -------------------------------- */

export const CAP = {
  /** Latitude rings from the base up, the pole excluded. */
  rows: 10,
  /** Meridians, side to side. Odd, so one runs down the middle. */
  cols: 19,
  /** How far the pole sits above the face oval's top, in face heights. */
  rise: 0.45,
  /** Where the sides reach down to, in face heights below the oval's top: the ears. */
  earLevel: 0.5,
  /** The head's half-width over the oval's: temples and ears stand proud of the face. */
  widen: 1.15,
  /** Depth of the head over its half-width; only the turn sees it. */
  depth: 0.9,
  /** How far round the head the meridians go, in half-turns. 0.5 stops at the sides. */
  sweep: 0.65,
  /** Rows bunch towards the base by this power: the hairline band is the densest. */
  rowPacking: 1.3,
  /** Columns bunch towards the sides by this power: the temples are denser than the crown. */
  colPacking: 1.25,
  /** Where the brow line is assumed when no eyebrow contour arrives, in face heights from the top. */
  browGuess: 0.3,
  /** The hairline band: this many rings from the base, drawn denser and brighter. */
  bandRows: 5,
  /** The temple zones: this many columns in from each side, this many rows up. */
  templeCols: 3,
  templeRows: 7,
  /**
   * How much of the tracked yaw and pitch the cap turns by. The detector
   * reads a turned face's oval narrower and shifted, which already moves
   * the anchor the cap hangs from; turning the full angle on top of that
   * overshoots. Device-tune.
   */
  yawGain: 0.6,
  pitchGain: 0.8,
  /** Degrees beyond which the pose is clamped: a wild reading is not a wild cap. */
  yawMax: 45,
  pitchMax: 30,
} as const;

/** Index, in vertices, of a cap cell. Row 0 is the base, the last row the ring under the pole. */
export function capIndex(row: number, col: number): number {
  // Called from the mesh's UI-thread path builders, so it must be a worklet.
  'worklet';
  return row * CAP.cols + col;
}

/** The pole: one vertex every meridian ends on. */
export const CAP_POLE = CAP.rows * CAP.cols;
export const CAP_POINTS = CAP_POLE + 1;
/** Each vertex is x, y, facing. */
export const CAP_STRIDE = 3;
export const CAP_LENGTH = CAP_POINTS * CAP_STRIDE;

/** A vertex mapped to no sector: the front centre, which fills with the scan as a whole. */
export const CAP_FRONT = -1;
const RING_SECTORS = 24;

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Latitude of each row, 0 at the base to 1 at the pole; packed towards the base. */
export const CAP_ROW_T: readonly number[] = range(CAP.rows).map((i) =>
  Math.pow(i / CAP.rows, CAP.rowPacking),
);

/** Longitude of each column, in radians: 0 faces the camera, ±π/2 are the sides. */
export const CAP_COL_THETA: readonly number[] = range(CAP.cols).map((j) => {
  const u = CAP.cols > 1 ? -1 + (2 * j) / (CAP.cols - 1) : 0;
  const packed = 1 - Math.pow(1 - Math.abs(u), CAP.colPacking);
  return Math.sign(u) * packed * CAP.sweep * Math.PI;
});

/** The rings, base first, as vertex index lists. */
export const CAP_RINGS: readonly (readonly number[])[] = range(CAP.rows).map((r) =>
  range(CAP.cols).map((c) => capIndex(r, c)),
);

/** The meridians, base to pole, as vertex index lists. */
export const CAP_MERIDIANS: readonly (readonly number[])[] = range(CAP.cols).map((c) => [
  ...range(CAP.rows).map((r) => capIndex(r, c)),
  CAP_POLE,
]);

/** Whether a vertex is in the hairline band or a temple zone: the parts drawn brighter. */
export const CAP_BAND: readonly boolean[] = range(CAP_POINTS).map((v) => {
  if (v === CAP_POLE) return false;
  const row = Math.floor(v / CAP.cols);
  const col = v % CAP.cols;
  const temple = col < CAP.templeCols || col >= CAP.cols - CAP.templeCols;
  return row < CAP.bandRows || (temple && row < CAP.templeRows);
});

/**
 * The ring sector each vertex belongs to, or `CAP_FRONT`.
 *
 * A vertex's direction on the dial is the blend of where its meridian
 * points (the base row is the dial's rim: a temple at ninety degrees
 * is three o'clock) and the crown (six o'clock, the chin-down band).
 * Between the two the blend passes through nothing — the front centre
 * of the cap, which is the dial's own centre.
 */
export const CAP_SECTOR_OF: readonly number[] = range(CAP_POINTS).map((v) => {
  if (v === CAP_POLE) return 12;
  const row = Math.floor(v / CAP.cols);
  const col = v % CAP.cols;
  const theta = CAP_COL_THETA[col];
  const t = CAP_ROW_T[row];
  const ux = Math.sin(theta) * (1 - t);
  const uy = -Math.cos(theta) * (1 - t) + t;
  if (Math.hypot(ux, uy) < 0.4) return CAP_FRONT;
  const deg = (Math.atan2(ux, -uy) * 180) / Math.PI;
  const angle = ((deg % 360) + 360) % 360;
  return Math.min(RING_SECTORS - 1, Math.floor(angle / (360 / RING_SECTORS)));
});

/**
 * The vertices worth lighting while the scan runs: the hairline band
 * just above the base, and the temple zones — on the meridians that
 * face the camera when the head is square on.
 */
export const CAP_SITES: readonly number[] = (() => {
  const sites = new Set<number>();
  for (let col = 0; col < CAP.cols; col += 1) {
    if (Math.abs(CAP_COL_THETA[col]) > Math.PI / 2) continue;
    sites.add(capIndex(1, col));
    sites.add(capIndex(2, col));
    const temple = col < CAP.templeCols || col >= CAP.cols - CAP.templeCols;
    if (!temple) continue;
    for (let row = 0; row < CAP.templeRows; row += 1) sites.add(capIndex(row, col));
  }
  return [...sites];
})();

/* -------------------------------- building ------------------------------- */

/** What the cap is built from: the tracked face, or a still's face with no pose. */
export type CapSource = {
  cx: number;
  cy: number;
  width: number;
  height: number;
  contours: Contours;
  /** Degrees. Missing or NaN reads as square on. */
  yaw?: number;
  pitch?: number;
};

type Frame = ReturnType<typeof faceFrame>;

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

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

function smoothstep(t: number): number {
  const s = clamp(t, 0, 1);
  return s * s * (3 - 2 * s);
}

function angle(value: number | undefined, max: number, gain: number): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return (clamp(value, -max, max) * gain * Math.PI) / 180;
}

/**
 * Builds the cap for one face: `CAP_LENGTH` numbers — x, y, facing per
 * vertex — in the same points the face is in, every one of them finite.
 *
 * Deterministic and allocation-light; called once per detector frame
 * on the JS thread, and once per still.
 */
export function buildHeadCap(face: CapSource): number[] {
  const out = new Array<number>(CAP_LENGTH).fill(0);

  const rawOval = face.contours.FACE;
  const oval =
    rawOval && rawOval.length >= 8
      ? rawOval
      : ovalFromBounds(face.cx, face.cy, face.width, face.height);
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
  if (!Number.isFinite(top + bottom + leftmost + rightmost)) return out;
  const height = Math.max(1, bottom - top);
  const halfWidth = Math.max(1, (rightmost - leftmost) / 2);
  const fallback = {
    cx: (leftmost + rightmost) / 2,
    cy: (top + bottom) / 2,
    a: halfWidth,
    b: height / 2,
  };

  // The brow line: just above the eyebrows when they were seen. The same
  // rule the lattice used, so the cap's base is where the brow row was.
  let brow = top + CAP.browGuess * height;
  const brows = [
    ...(face.contours.LEFT_EYEBROW_TOP ?? []),
    ...(face.contours.RIGHT_EYEBROW_TOP ?? []),
  ];
  if (brows.length > 0) {
    let sum = 0;
    for (const p of brows) sum += toLocal(frame, p).y;
    brow = sum / brows.length - 0.05 * height;
  }
  brow = clamp(brow, top + 0.08 * height, top + 0.5 * height);
  const browEdges = edgesAt(local, brow, fallback);
  const browMid = (browEdges.left + browEdges.right) / 2;
  const browHw = Math.max(1, ((browEdges.right - browEdges.left) / 2) * 0.97);

  // The pose. A turned face is read narrower than it is; widen the head
  // back, within reason, so the cap does not shrink as the head turns.
  const yawRaw = face.yaw !== undefined && Number.isFinite(face.yaw) ? clamp(face.yaw, -CAP.yawMax, CAP.yawMax) : 0;
  const psi = angle(face.yaw, CAP.yawMax, CAP.yawGain);
  const alpha = angle(face.pitch, CAP.pitchMax, CAP.pitchGain);
  const seen = Math.max(0.8, Math.cos((yawRaw * Math.PI) / 180));
  const cosPsi = Math.cos(psi);
  const sinPsi = Math.sin(psi);
  const cosAlpha = Math.cos(alpha);
  const sinAlpha = Math.sin(alpha);

  // The ellipsoid, in the face's frame, centred on the ear line.
  const ax = (halfWidth * CAP.widen) / seen;
  const earY = top + CAP.earLevel * height;
  const apexY = top - CAP.rise * height;
  const ay = Math.max(1, earY - apexY);
  const az = ax * CAP.depth;

  // The base: the brow line across the front, to where it meets the
  // oval's edge, then down to ear level at the sides.
  const phiBrow = Math.asin(clamp((earY - brow) / ay, 0, 0.95));
  const thetaBrow = Math.asin(clamp(browHw / (ax * Math.cos(phiBrow)), 0.3, 0.95));

  const rotate = (x: number, y: number, z: number): [number, number, number] => {
    // Pitch about the side-to-side axis: chin down (negative) brings the crown forward.
    const y1 = y * cosAlpha - z * sinAlpha;
    const z1 = y * sinAlpha + z * cosAlpha;
    // Yaw about the vertical: positive points the nose to the screen's right.
    const x2 = x * cosPsi + z1 * sinPsi;
    const z2 = -x * sinPsi + z1 * cosPsi;
    return [x2, y1, z2];
  };

  const surface = (theta: number, phi: number): [number, number, number] => {
    const cosPhi = Math.cos(phi);
    return rotate(ax * cosPhi * Math.sin(theta), -ay * Math.sin(phi), az * cosPhi * Math.cos(theta));
  };

  const facing = (theta: number, phi: number): number => {
    const cosPhi = Math.cos(phi);
    const nx = (Math.sin(theta) * cosPhi) / ax;
    const ny = -Math.sin(phi) / ay;
    const nz = (Math.cos(theta) * cosPhi) / az;
    const len = Math.hypot(nx, ny, nz);
    if (!(len > 0)) return 0;
    const n = rotate(nx / len, ny / len, nz / len);
    return n[2];
  };

  // The anchor: the middle of the base row, pinned to the brow centre.
  const anchor = surface(0, phiBrow);

  const write = (index: number, sx: number, sy: number, f: number) => {
    const p = fromLocal(frame, browMid + (sx - anchor[0]), brow + (sy - anchor[1]));
    const k = index * CAP_STRIDE;
    out[k] = Number.isFinite(p.x) ? p.x : frame.ox;
    out[k + 1] = Number.isFinite(p.y) ? p.y : frame.oy;
    out[k + 2] = Number.isFinite(f) ? f : 0;
  };

  const halfPi = Math.PI / 2;
  for (let col = 0; col < CAP.cols; col += 1) {
    const theta = CAP_COL_THETA[col];
    const turn = Math.abs(theta);
    const onBrow =
      turn <= thetaBrow ? 1 : turn >= halfPi ? 0 : smoothstep((halfPi - turn) / (halfPi - thetaBrow));
    const phi0 = phiBrow * onBrow;
    for (let row = 0; row < CAP.rows; row += 1) {
      const phi = phi0 + (halfPi - phi0) * CAP_ROW_T[row];
      const p = surface(theta, phi);
      write(capIndex(row, col), p[0], p[1], facing(theta, phi));
    }
  }
  const pole = surface(0, halfPi);
  write(CAP_POLE, pole[0], pole[1], facing(0, halfPi));

  return out;
}
