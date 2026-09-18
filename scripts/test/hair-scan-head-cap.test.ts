/**
 * The head cap must sit on the head, and only on the head.
 *
 * Everything the hair scan draws over a person is built from the numbers
 * this module produces, from a face detector that reports an oval, a
 * brow and a pose. So the properties are checked here, on a machine with
 * no camera: the cap's base is the eyebrow line, it encloses the upper
 * face oval and wraps down to ear level, the face below the eyebrows is
 * empty, a turned head moves the near side towards the camera, the fill
 * mapping agrees with the ring, and at no pose is anything NaN.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CAP,
  CAP_BAND,
  CAP_COL_THETA,
  CAP_FIT,
  CAP_FIT_DEFAULT,
  CAP_PROFILE,
  CAP_FIT_IDENTITY,
  CAP_FIT_START,
  CAP_FRONT,
  CAP_LENGTH,
  CAP_MERIDIANS,
  CAP_POINTS,
  CAP_POLE,
  CAP_REGIONS,
  CAP_REGION_OF,
  CAP_RINGS,
  CAP_ROW_T,
  CAP_SECTOR_OF,
  CAP_SITES,
  CAP_STRIDE,
  blendCapFit,
  buildHeadCap,
  capIndex,
  fitHairCap,
  nextCapFit,
  type CapFit,
  type CapSource,
} from '@/features/hair-scan/head-cap';
import {
  CHIN_SECTORS,
  LEFT_SECTORS,
  REGION_OF_STEP,
  RIGHT_SECTORS,
  RING_SECTORS,
  SCAN_STEPS,
  STEP_TARGETS,
} from '@/features/hair-scan/engine';
import {
  MESH_MID_COL,
  SAMPLE_LOOP_MS,
  buildLattice,
  capIndex as latticeCapIndex,
  syntheticContours,
  syntheticFace,
  type Point,
  type TrackedFace,
} from '@/features/hair-scan/tracking';

/* ------------------------------ fixtures ------------------------------ */

const CX = 195;
const CY = 340;
const WIDTH = 180;
const HEIGHT = 236;
const TOP = CY - HEIGHT / 2;

/** A front-on face sitting where the scan wants it. */
function source(overrides: Partial<CapSource> & { roll?: number } = {}): CapSource {
  const { roll = 0, ...rest } = overrides;
  return {
    cx: CX,
    cy: CY,
    width: WIDTH,
    height: HEIGHT,
    contours: syntheticContours(CX, CY, WIDTH, HEIGHT, roll),
    ...rest,
  };
}

/**
 * The cap with no allowance for hair on it: the geometry alone.
 *
 * `buildHeadCap` with no fit draws `CAP_FIT_DEFAULT`, which is what the
 * app puts on a head — a dome that clears the hair rather than hugging
 * the skull. The properties about where a FACE is (the base on the brow,
 * the dome the size of the head, the two roads agreeing) are properties
 * of the geometry underneath that allowance, so they are asserted here
 * on the bare dome, and the allowance itself is asserted on its own.
 */
function bare(src: CapSource): number[] {
  return buildHeadCap(src, CAP_FIT_IDENTITY);
}

type Vertex = { x: number; y: number; facing: number };

function vertex(pts: number[], index: number): Vertex {
  const k = index * CAP_STRIDE;
  return { x: pts[k], y: pts[k + 1], facing: pts[k + 2] };
}

function vertices(pts: number[]): Vertex[] {
  return Array.from({ length: CAP_POINTS }, (_, i) => vertex(pts, i));
}

/** The brow line the lattice draws, for the same face: what the cap's base must sit on. */
function latticeBrow(src: CapSource): Point {
  const shim: TrackedFace = {
    cx: src.cx,
    cy: src.cy,
    width: src.width,
    height: src.height,
    contours: src.contours,
    yaw: 0,
    pitch: 0,
    roll: 0,
    hasContours: true,
    source: 'mlkit',
    hasMesh: false,
    stability: 1,
    yawRate: 0,
    held: false,
    lastSeenAt: 0,
    at: 0,
  };
  const { pts } = buildLattice(shim);
  const k = latticeCapIndex(0, MESH_MID_COL) * 2;
  return { x: pts[k], y: pts[k + 1] };
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Convex hull, monotone chain, counter-clockwise on a y-down screen. */
function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
  if (sorted.length < 3) return sorted;
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** Signed distance inside a convex polygon: positive inside, in points. */
function insideBy(polygon: Point[], p: Point): number {
  let worst = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const d = cross(a, b, p) / len;
    if (d < worst) worst = d;
  }
  return worst;
}

function inPolygon(polygon: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/* ------------------------------- topology ------------------------------ */

test('topology: a bounded, fixed layout with one pole', () => {
  assert.equal(CAP_POINTS, CAP.rows * CAP.cols + 1);
  assert.ok(CAP_POINTS >= 150 && CAP_POINTS <= 220, `${CAP_POINTS} points`);
  assert.equal(CAP_LENGTH, CAP_POINTS * CAP_STRIDE);
  assert.equal(CAP_POLE, CAP_POINTS - 1);
  assert.equal(CAP.cols % 2, 1);
  assert.equal(CAP_RINGS.length, CAP.rows);
  assert.equal(CAP_MERIDIANS.length, CAP.cols);
  for (const ring of CAP_RINGS) assert.equal(ring.length, CAP.cols);
  for (const meridian of CAP_MERIDIANS) {
    assert.equal(meridian.length, CAP.rows + 1);
    assert.equal(meridian[meridian.length - 1], CAP_POLE);
    for (const v of meridian) assert.ok(v >= 0 && v < CAP_POINTS);
  }
  assert.equal(CAP_BAND.length, CAP_POINTS);
  assert.equal(CAP_SECTOR_OF.length, CAP_POINTS);
  assert.ok(CAP_SITES.length > 0);
  for (const s of CAP_SITES) assert.ok(s >= 0 && s < CAP_POLE);
});

test('topology: rows pack towards the base and the middle column faces the camera', () => {
  assert.equal(CAP_ROW_T[0], 0);
  for (let i = 1; i < CAP.rows; i += 1) {
    assert.ok(CAP_ROW_T[i] > CAP_ROW_T[i - 1]);
    assert.ok(CAP_ROW_T[i] < 1);
  }
  // Denser at the base than at the crown.
  assert.ok(CAP_ROW_T[1] - CAP_ROW_T[0] < CAP_ROW_T[CAP.rows - 1] - CAP_ROW_T[CAP.rows - 2]);
  const mid = (CAP.cols - 1) / 2;
  assert.equal(CAP_COL_THETA[mid], 0);
  for (let j = 0; j < CAP.cols; j += 1) {
    assert.ok(Math.abs(CAP_COL_THETA[j] + CAP_COL_THETA[CAP.cols - 1 - j]) < 1e-12, 'symmetric');
  }
  // The meridians reach past the sides, so a turned head still has lines at its silhouette.
  assert.ok(Math.abs(CAP_COL_THETA[0]) > Math.PI / 2);
  // Denser at the temples than at the front.
  assert.ok(CAP_COL_THETA[1] - CAP_COL_THETA[0] < CAP_COL_THETA[mid + 1] - CAP_COL_THETA[mid]);
});

test('band: the hairline rows and the temple columns, nothing else', () => {
  assert.equal(CAP_BAND[capIndex(0, (CAP.cols - 1) / 2)], true);
  assert.equal(CAP_BAND[capIndex(CAP.bandRows - 1, 5)], true);
  assert.equal(CAP_BAND[capIndex(CAP.bandRows, (CAP.cols - 1) / 2)], false);
  assert.equal(CAP_BAND[capIndex(CAP.templeRows - 1, 0)], true);
  assert.equal(CAP_BAND[capIndex(CAP.templeRows, 0)], false);
  assert.equal(CAP_BAND[CAP_POLE], false);
});

/* ------------------------------- geometry ------------------------------ */

test('build: the right length, all finite, deterministic', () => {
  const pts = buildHeadCap(source());
  assert.equal(pts.length, CAP_LENGTH);
  for (const v of pts) assert.ok(Number.isFinite(v));
  assert.deepEqual(buildHeadCap(source()), pts);
});

test('build: the base sits on the eyebrow line, where the lattice put its brow row', () => {
  for (const roll of [0, 12, -20]) {
    const src = source({ roll });
    const pts = buildHeadCap(src);
    const brow = latticeBrow(src);
    const base = vertex(pts, capIndex(0, (CAP.cols - 1) / 2));
    assert.ok(Math.abs(base.x - brow.x) < 0.5, `roll ${roll}: x ${base.x} vs ${brow.x}`);
    assert.ok(Math.abs(base.y - brow.y) < 0.5, `roll ${roll}: y ${base.y} vs ${brow.y}`);
  }
});

test('build: the dome rises about 0.45 face heights above the oval and the sides reach ear level', () => {
  const pts = bare(source());
  const pole = vertex(pts, CAP_POLE);
  assert.ok(Math.abs(pole.y - (TOP - CAP.rise * HEIGHT)) < 1, `pole at ${pole.y}`);
  assert.ok(Math.abs(pole.x - CX) < 0.5);

  const near = vertices(pts).filter((v) => v.facing > 0);
  const lowest = near.reduce((a, b) => (b.y > a.y ? b : a));
  const earLevel = TOP + CAP.earLevel * HEIGHT;
  assert.ok(lowest.y > earLevel - 0.06 * HEIGHT, `wraps to ${lowest.y}, ear level ${earLevel}`);
  // The sides stand proud of the face at its widest.
  const rightmost = near.reduce((a, b) => (b.x > a.x ? b : a));
  const leftmost = near.reduce((a, b) => (b.x < a.x ? b : a));
  assert.ok(rightmost.x > CX + WIDTH / 2, `right side at ${rightmost.x}`);
  assert.ok(leftmost.x < CX - WIDTH / 2, `left side at ${leftmost.x}`);
  assert.ok(Math.abs(rightmost.x - CX - (CX - leftmost.x)) < 0.5, 'symmetric');
});

test('build: the cap encloses the face oval above the brow line', () => {
  const src = source();
  const pts = buildHeadCap(src);
  const brow = latticeBrow(src).y;
  const outline = hull(vertices(pts).filter((v) => v.facing > 0).map((v) => ({ x: v.x, y: v.y })));
  const upperOval = src.contours.FACE!.filter((p) => p.y < brow - 1);
  assert.ok(upperOval.length >= 8, 'the fixture has an upper oval');
  for (const p of upperOval) {
    assert.ok(insideBy(outline, p) > -0.5, `oval point ${p.x},${p.y} outside the cap`);
  }
});

test('build: the face below the eyebrows is empty', () => {
  const src = source();
  const brow = latticeBrow(src).y;
  const oval = src.contours.FACE!;
  // Square on, no line at all lands on the face below the brow: the
  // sides that wrap behind the head fold back outside the oval's edge.
  for (const v of vertices(buildHeadCap(src))) {
    if (v.y <= brow + 0.5) continue;
    assert.ok(!inPolygon(oval, { x: v.x, y: v.y }), `vertex ${v.x},${v.y} on the face`);
  }
  // A turned head is not checked against this oval: the detector's oval
  // turns with the face, and the stand-in's does not.
});

test('build: no eyebrows and no oval — a box alone — still gives a finite cap on the guessed brow', () => {
  const pts = buildHeadCap({ cx: CX, cy: CY, width: WIDTH, height: HEIGHT, contours: {} });
  for (const v of pts) assert.ok(Number.isFinite(v));
  const base = vertex(pts, capIndex(0, (CAP.cols - 1) / 2));
  assert.ok(Math.abs(base.y - (TOP + CAP.browGuess * HEIGHT)) < 0.5);
  assert.ok(Math.abs(base.x - CX) < 0.5);
});

test('build: nothing is NaN at any pose, or on a broken reading', () => {
  const poses = [
    { yaw: 0, pitch: 0 },
    { yaw: 40, pitch: 0 },
    { yaw: -40, pitch: 0 },
    { yaw: 0, pitch: 30 },
    { yaw: 0, pitch: -30 },
    { yaw: 90, pitch: -90 },
    { yaw: Number.NaN, pitch: Number.NaN },
    { yaw: Number.POSITIVE_INFINITY, pitch: 5 },
  ];
  for (const pose of poses) {
    for (const roll of [0, 25]) {
      const pts = buildHeadCap(source({ ...pose, roll }));
      assert.equal(pts.length, CAP_LENGTH);
      for (const v of pts) assert.ok(Number.isFinite(v), `${JSON.stringify(pose)} roll ${roll}`);
    }
  }
  const broken = [
    { cx: Number.NaN, cy: CY, width: WIDTH, height: HEIGHT, contours: {} },
    { cx: CX, cy: CY, width: 0, height: 0, contours: {} },
    { cx: CX, cy: CY, width: -5, height: Number.NaN, contours: {} },
    {
      cx: CX,
      cy: CY,
      width: WIDTH,
      height: HEIGHT,
      contours: { FACE: Array.from({ length: 36 }, () => ({ x: Number.NaN, y: Number.NaN })) },
    },
  ];
  for (const src of broken) {
    const pts = buildHeadCap(src);
    assert.equal(pts.length, CAP_LENGTH);
    for (const v of pts) assert.ok(Number.isFinite(v));
  }
});

test('build: a turn brings the near side towards the camera and keeps the base on the brow', () => {
  const square = buildHeadCap(source());
  const right = buildHeadCap(source({ yaw: 25 }));
  const left = buildHeadCap(source({ yaw: -25 }));
  const nearMeanX = (pts: number[]) => {
    const near = vertices(pts).filter((v) => v.facing > 0.3);
    return near.reduce((s, v) => s + v.x, 0) / near.length;
  };
  // The nose points to the screen's right (the engine's three o'clock);
  // the side the camera now sees more of is the screen's left.
  assert.ok(nearMeanX(right) < nearMeanX(square) - 5);
  assert.ok(nearMeanX(left) > nearMeanX(square) + 5);
  // Mirror images of each other.
  assert.ok(Math.abs(nearMeanX(right) - CX - (CX - nearMeanX(left))) < 0.5);

  const brow = latticeBrow(source());
  for (const pts of [right, left]) {
    const base = vertex(pts, capIndex(0, (CAP.cols - 1) / 2));
    assert.ok(Math.abs(base.x - brow.x) < 0.5);
    assert.ok(Math.abs(base.y - brow.y) < 0.5);
  }
  // Facing is what fades the far side: fewer vertices face the camera on the far side.
  const facingOnRight = (pts: number[]) =>
    vertices(pts).filter((v) => v.x > CX && v.facing > 0.3).length;
  assert.ok(facingOnRight(right) < facingOnRight(square));
  assert.ok(facingOnRight(left) > facingOnRight(square));
});

test('build: chin down brings the crown forward; chin up hides it', () => {
  const square = vertex(buildHeadCap(source()), CAP_POLE);
  const down = vertex(buildHeadCap(source({ pitch: -25 })), CAP_POLE);
  const up = vertex(buildHeadCap(source({ pitch: 25 })), CAP_POLE);
  assert.ok(down.facing > 0.2, `crown faces the camera: ${down.facing}`);
  assert.ok(up.facing < -0.2, `crown faces away: ${up.facing}`);
  // Chin down: the dome stands taller over the pinned brow.
  assert.ok(down.y < square.y);
  assert.ok(up.y > square.y);
});

test('build: the wild pose is clamped, so a bad angle cannot fling the cap', () => {
  const tame = buildHeadCap(source({ yaw: CAP.yawMax, pitch: -CAP.pitchMax }));
  const wild = buildHeadCap(source({ yaw: 400, pitch: -400 }));
  assert.deepEqual(wild, tame);
});

/* -------------------------------- the fill ------------------------------ */

test('sectors: the sides are the ring\'s three and nine, the crown its six, the front centre the scan as a whole', () => {
  const mid = (CAP.cols - 1) / 2;
  for (const s of CAP_SECTOR_OF) assert.ok(s === CAP_FRONT || (s >= 0 && s < RING_SECTORS));
  // The base row's temples: screen-right is three o'clock, screen-left nine.
  const rightTemple = CAP_SECTOR_OF[capIndex(0, CAP.cols - CAP.templeCols)];
  const leftTemple = CAP_SECTOR_OF[capIndex(0, CAP.templeCols - 1)];
  assert.ok(RIGHT_SECTORS.includes(rightTemple), `right temple in sector ${rightTemple}`);
  assert.ok(LEFT_SECTORS.includes(leftTemple), `left temple in sector ${leftTemple}`);
  // The crown is the chin-down band.
  assert.ok(CHIN_SECTORS.includes(CAP_SECTOR_OF[CAP_POLE]));
  assert.ok(CHIN_SECTORS.includes(CAP_SECTOR_OF[capIndex(CAP.rows - 1, mid)]));
  // The front centre belongs to no one sector.
  assert.equal(CAP_SECTOR_OF[capIndex(5, mid)], CAP_FRONT);
  assert.equal(CAP_SECTOR_OF[capIndex(0, mid)], 0);
  // Mirror-symmetric about the middle column, sector for sector.
  for (let row = 0; row < CAP.rows; row += 1) {
    for (let col = 0; col < mid; col += 1) {
      const a = CAP_SECTOR_OF[capIndex(row, col)];
      const b = CAP_SECTOR_OF[capIndex(row, CAP.cols - 1 - col)];
      if (a === CAP_FRONT || b === CAP_FRONT) {
        assert.equal(a, b);
      } else {
        // Sector s at angle θ mirrors to 360 − θ: sector 23 − s, or 24 − s
        // on a boundary, and twelve o'clock is its own mirror.
        const mirrored = a + b === RING_SECTORS - 1 || a + b === RING_SECTORS || (a === 0 && b === 0);
        assert.ok(mirrored, `${a} and ${b} mirror`);
      }
    }
  }
});

test('sites: every lit point is on the hairline band or a temple, facing the camera when square on', () => {
  const pts = buildHeadCap(source());
  for (const site of CAP_SITES) {
    assert.ok(CAP_BAND[site], `site ${site} is in the band`);
    assert.ok(vertex(pts, site).facing > 0, `site ${site} faces the camera`);
  }
});

/* ---------------------------- the tracked mesh --------------------------- */

/**
 * A drawn 3D head to stand in for a tracker's cloud.
 *
 * An ellipsoid in the head's own axes — turned, projected straight down
 * the view axis and reported the way the native module reports a face: a
 * flat list of points, a facing per point, and the box they fill.
 *
 * It is built from the same head proportions the cap is (chin at 0,
 * crown at 1, the ear canal at 0.42 and the brow at 0.52), so a landmark
 * on it is a landmark on a head and not a number read back out of the
 * thing under test. Two kinds are drawn, because two reach the cap:
 *
 *   shell   the face only, from the chin to the low forehead and ear to
 *           ear — the reach a face anchor's geometry has.
 *   head    points all the way round, half of them turned away, which is
 *           what the drawn stand-in under the simulator gives.
 *
 * The projection is the cap's own: pitch about the side-to-side axis,
 * then yaw about the vertical, then roll in the plane of the screen.
 */
const HEAD = { a: 92, b: 118, d: 86 } as const;
const RAD = Math.PI / 180;

/** Heights on the head the fixture and the cap both name, chin 0 to crown 1. */
const ON_HEAD = { ear: 0.42, brow: 0.52, crown: 1 } as const;
/** What a face anchor's geometry reaches, in the same measure. */
const SHELL_REACH = { low: 0.02, high: 0.68 } as const;

/** The latitude, on the fixture ellipsoid, of a height up the head. */
function phiOf(height: number): number {
  return Math.asin(Math.max(-1, Math.min(1, 2 * height - 1)));
}

type CloudPose = { yaw?: number; pitch?: number; roll?: number; scale?: number };

type Cloud = {
  source: CapSource;
  /** The view position of the head's own point at a height up the head, on the front meridian. */
  landmarkAt(height: number): Point;
  /** Every generated point, in view points, with its facing and where it sits on the head. */
  points: { x: number; y: number; facing: number; theta: number; height: number }[];
};

function cloudOf(kind: 'head' | 'shell', pose: CloudPose = {}): Cloud {
  const { yaw = 0, pitch = 0, roll = 0, scale = 1 } = pose;
  const ca = Math.cos(pitch * RAD);
  const sa = Math.sin(pitch * RAD);
  const cy1 = Math.cos(yaw * RAD);
  const sy1 = Math.sin(yaw * RAD);
  const cr = Math.cos(roll * RAD);
  const sr = Math.sin(roll * RAD);

  const project = (x: number, y: number, z: number): [number, number, number] => {
    const y1 = y * ca - z * sa;
    const z1 = y * sa + z * ca;
    const x2 = x * cy1 + z1 * sy1;
    const z2 = -x * sy1 + z1 * cy1;
    return [x2 * cr - y1 * sr, x2 * sr + y1 * cr, z2];
  };
  const at = (theta: number, phi: number): [number, number, number] =>
    project(HEAD.a * Math.cos(phi) * Math.sin(theta), -HEAD.b * Math.sin(phi), HEAD.d * Math.cos(phi) * Math.cos(theta));
  const facingAt = (theta: number, phi: number): number => {
    const nx = (Math.cos(phi) * Math.sin(theta)) / HEAD.a;
    const ny = -Math.sin(phi) / HEAD.b;
    const nz = (Math.cos(phi) * Math.cos(theta)) / HEAD.d;
    const len = Math.hypot(nx, ny, nz) || 1;
    return project(nx / len, ny / len, nz / len)[2];
  };

  const rows = 13;
  const cols = 16;
  const closed = kind === 'head';
  const phiLo = closed ? -Math.PI / 2 : phiOf(SHELL_REACH.low);
  const phiHi = closed ? Math.PI / 2 : phiOf(SHELL_REACH.high);
  const thetaSpan = closed ? Math.PI : 78 * RAD;
  const flat: number[] = [];
  const facing: number[] = [];
  const points: { x: number; y: number; facing: number; theta: number; height: number }[] = [];
  for (let r = 0; r < rows; r += 1) {
    const phi = phiLo + ((phiHi - phiLo) * r) / (rows - 1);
    for (let c = 0; c < cols; c += 1) {
      const theta = closed
        ? -Math.PI + (2 * Math.PI * c) / cols
        : -thetaSpan + (2 * thetaSpan * c) / (cols - 1);
      const [x, y] = at(theta, phi);
      flat.push(x * scale, y * scale);
      facing.push(facingAt(theta, phi));
      points.push({ x, y, facing: facingAt(theta, phi), theta, height: (Math.sin(phi) + 1) / 2 });
    }
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    source: {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      width: maxX - minX,
      height: maxY - minY,
      contours: {},
      yaw,
      pitch,
      roll,
      mesh: { points: flat, facing },
      hasMesh: true,
      source: closed ? 'sample' : 'arkit',
    },
    landmarkAt(height) {
      const [x, y] = at(0, phiOf(height));
      return { x, y };
    },
    points,
  };
}

/** The base row of the cap, as the polyline the hairline band is drawn on. */
function baseRow(pts: number[]): Point[] {
  return Array.from({ length: CAP.cols }, (_, c) => {
    const v = vertex(pts, capIndex(0, c));
    return { x: v.x, y: v.y };
  });
}

function distanceToPolyline(line: Point[], p: Point): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1];
    const b = line[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const d = Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * The middle of the cap's base row, and its pole: the two vertices
 * everything else hangs from.
 *
 * Measured on the BARE dome. The cap the app draws carries
 * `CAP_FIT_DEFAULT` on top — an allowance for hair, which is a drawing
 * decision and is asserted on its own below — and every property here is
 * about the geometry underneath it: where the brow is, how big the head
 * is, whether a turn steps the cap. Folding a constant allowance into
 * all of those would only make each number 12% larger and say nothing
 * more.
 */
function pins(src: CapSource): { base: Vertex; pole: Vertex; width: number } {
  const pts = bare(src);
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (let c = 0; c < CAP.cols; c += 1) {
    const v = vertex(pts, capIndex(0, c));
    if (v.x < left) left = v.x;
    if (v.x > right) right = v.x;
  }
  return {
    base: vertex(pts, capIndex(0, (CAP.cols - 1) / 2)),
    pole: vertex(pts, CAP_POLE),
    width: right - left,
  };
}

/**
 * Every pose the guided scan passes through in its one continuous
 * motion: look straight, turn right, turn left, look down — plus the
 * tilt a real person carries through all four, and the overshoot at the
 * ends of a turn. These are the poses the numbers below are held to.
 */
const SCAN_POSES: CloudPose[] = [
  { yaw: 0, pitch: 0 },
  { yaw: 20, pitch: 0 },
  { yaw: 35, pitch: 0 },
  { yaw: -35, pitch: 0 },
  { yaw: 45, pitch: 0 },
  { yaw: -45, pitch: 0 },
  { yaw: 0, pitch: -30 },
  { yaw: 25, pitch: -30 },
  { yaw: -25, pitch: -30 },
  { yaw: 40, pitch: -40 },
  { yaw: -40, pitch: -40 },
  { yaw: 45, pitch: -20 },
  { yaw: 35, pitch: 0, roll: 14 },
  { yaw: -30, pitch: -25, roll: -18 },
];

/**
 * Past the choreography: a head thrown further than the scan ever asks
 * for. Nothing is claimed about how well the cap fits here — only that
 * it stays finite and does not leap.
 */
const WILD_POSES: CloudPose[] = [
  { yaw: 60, pitch: 0 },
  { yaw: 55, pitch: -45 },
  { yaw: -55, pitch: -45 },
  { yaw: 0, pitch: 25 },
  { yaw: 40, pitch: 25, roll: 30 },
];

test('mesh: a cloud is lofted rather than the detector oval, and every number is finite', () => {
  for (const kind of ['head', 'shell'] as const) {
    const cloud = cloudOf(kind);
    const pts = buildHeadCap(cloud.source);
    assert.equal(pts.length, CAP_LENGTH);
    for (const v of pts) assert.ok(Number.isFinite(v), `${kind}: finite`);
    assert.deepEqual(buildHeadCap(cloud.source), pts, 'deterministic');
    // The oval road is a different road: a reading with no contours at
    // all and no 3D tracker behind it puts the base at the guessed brow,
    // a long way from where the cloud's own brow is.
    const oval = buildHeadCap({ ...cloud.source, mesh: undefined, hasMesh: false, source: 'mlkit' });
    assert.notDeepEqual(pts, oval);
  }
});

test('mesh: the base sits on the brow — the head\'s own brow, through a turn and with the head lowered', () => {
  for (const kind of ['head', 'shell'] as const) {
    for (const pose of SCAN_POSES) {
      const cloud = cloudOf(kind, pose);
      const pts = buildHeadCap(cloud.source);
      for (const v of pts) assert.ok(Number.isFinite(v), `${kind} ${JSON.stringify(pose)}`);
      // The fixture's brow is where a brow is on a head: 0.52 of the way
      // up it. Nothing here is read back out of the cap.
      const drift = distanceToPolyline(baseRow(pts), cloud.landmarkAt(ON_HEAD.brow));
      // A sixteenth of a head's height. Worst measured across these
      // poses is about a twentieth, on the shell with the head both
      // turned and lowered; square on it is exact.
      assert.ok(
        drift < 0.0625 * HEAD.b,
        `${kind} ${JSON.stringify(pose)}: base ${drift.toFixed(1)} from the brow`,
      );
    }
  }
});

test('mesh: the cap encloses the whole head above the brow, turned or lowered', () => {
  for (const kind of ['head', 'shell'] as const) {
    for (const pose of SCAN_POSES) {
      const cloud = cloudOf(kind, pose);
      const pts = buildHeadCap(cloud.source);
      const outline = hull(vertices(pts).map((v) => ({ x: v.x, y: v.y })));
      // Every point the camera can see of the head the cap spans: from
      // the brow up, and from ear round to ear — the meridians the cap
      // itself reaches. Chosen by where each point sits ON THE HEAD, not
      // by where it sits on the screen, because a tilted head puts parts
      // of its cheek higher up the picture than its brow. What is
      // further round the back than the cap goes is not claimed, and at
      // a glance is behind the head anyway.
      const reach = Math.abs(CAP_COL_THETA[0]);
      const seen = cloud.points.filter(
        (p) => p.facing > 0.05 && p.height > ON_HEAD.brow + 0.02 && Math.abs(p.theta) <= reach,
      );
      assert.ok(seen.length >= 10, `${kind}: the fixture shows its upper head`);
      for (const p of seen) {
        assert.ok(
          // A twentieth of a head's height of slack: the cap is a head's
          // shape, not this fixture's, and at a compound turn the two
          // differ by about that much around the ears. Worst measured is
          // a thirtieth, on the closed stand-in turned and lowered.
          insideBy(outline, p) > -0.05 * HEAD.b,
          `${kind} ${JSON.stringify(pose)}: head point ${p.x.toFixed(0)},${p.y.toFixed(0)} outside the cap`,
        );
      }
    }
  }
});

test('mesh: the crown is covered — the pole sits at or above the top of the head', () => {
  for (const kind of ['head', 'shell'] as const) {
    for (const pose of SCAN_POSES) {
      const cloud = cloudOf(kind, pose);
      const pole = pins(cloud.source).pole;
      const crown = cloud.landmarkAt(ON_HEAD.crown);
      assert.ok(
        pole.y <= crown.y + 0.06 * HEAD.b,
        `${kind} ${JSON.stringify(pose)}: pole ${pole.y.toFixed(1)} vs crown ${crown.y.toFixed(1)}`,
      );
    }
  }
});

test('mesh: the cap is the size of the head it is on, at every pose', () => {
  // Brow to crown, on the cap and on the head, both as the camera sees
  // them. Lowering the head genuinely lengthens that on the picture —
  // the crown swings towards the phone — so it is compared against the
  // head's own projection rather than against a cosine.
  for (const kind of ['head', 'shell'] as const) {
    for (const pose of SCAN_POSES) {
      const cloud = cloudOf(kind, pose);
      const cap = pins(cloud.source);
      const capRise = cap.base.y - cap.pole.y;
      const headRise = cloud.landmarkAt(ON_HEAD.brow).y - cloud.landmarkAt(ON_HEAD.crown).y;
      assert.ok(
        Math.abs(capRise / headRise - 1) < 0.08,
        `${kind} ${JSON.stringify(pose)}: cap ${capRise.toFixed(1)} against head ${headRise.toFixed(1)}`,
      );
    }
  }
});

test('mesh: the cap walks a turn — no pose steps it off the head', () => {
  // The kind of cloud is the tracker's, not the pose's: nothing about
  // turning a head may change which table the cap is built from, or the
  // cap jumps a fraction of a head in one frame. Walked a degree at a
  // time through the whole of the scan's range, the cap's base, pole and
  // width move smoothly — this is the regression that matters, because
  // the symptom on a phone is the mesh coming off the head mid-turn.
  for (const kind of ['head', 'shell'] as const) {
    for (const path of [
      { from: { yaw: -60, pitch: -40 }, to: { yaw: 60, pitch: -40 }, steps: 120 },
      { from: { yaw: 45, pitch: 25 }, to: { yaw: 45, pitch: -45 }, steps: 70 },
      { from: { yaw: 0, pitch: 0 }, to: { yaw: 55, pitch: -45 }, steps: 55 },
    ]) {
      let prev: ReturnType<typeof pins> | null = null;
      for (let i = 0; i <= path.steps; i += 1) {
        const t = i / path.steps;
        const pose = {
          yaw: path.from.yaw + (path.to.yaw - path.from.yaw) * t,
          pitch: path.from.pitch + (path.to.pitch - path.from.pitch) * t,
        };
        const now = pins(cloudOf(kind, pose).source);
        if (prev !== null) {
          const moved = Math.max(
            Math.hypot(now.base.x - prev.base.x, now.base.y - prev.base.y),
            Math.hypot(now.pole.x - prev.pole.x, now.pole.y - prev.pole.y),
            Math.abs(now.width - prev.width),
          );
          // A fortieth of a head's height per degree of turn. What this
          // is really holding off is a leap of most of a head, which is
          // what re-deciding the kind of cloud from the pose used to do.
          assert.ok(
            moved < 0.05 * HEAD.b,
            `${kind} ${JSON.stringify(pose)}: cap moved ${moved.toFixed(1)} in one degree`,
          );
        }
        prev = now;
      }
    }
  }
});

test('mesh: a frame that arrives without its points holds its place', () => {
  // A face anchor drops frames: it reports the pose and clears the mesh
  // while it re-finds the face. Those frames must not be sent down the
  // detector's road, which would build a different head from a
  // fabricated oval and a guessed brow, and be seen as a jump.
  for (const pose of SCAN_POSES) {
    const cloud = cloudOf('shell', pose);
    const tracked = pins(cloud.source);
    const dropped = pins({ ...cloud.source, mesh: undefined, hasMesh: false });
    const moved = Math.max(
      Math.hypot(dropped.base.x - tracked.base.x, dropped.base.y - tracked.base.y),
      Math.hypot(dropped.pole.x - tracked.pole.x, dropped.pole.y - tracked.pole.y),
    );
    // A twelfth of a head's height with the head level; a fifth with it
    // tilted, because a box square to the screen cannot say where a
    // tilted head's own upright box sits inside it, and the points were
    // what said so. Measured against most of a WHOLE head before the two
    // roads were joined up: the oval road puts the base on a guessed
    // brow a fifth of a face box away, and loses the tilt with it.
    const allowed = (pose.roll ?? 0) === 0 ? 0.08 : 0.2;
    assert.ok(
      moved < allowed * HEAD.b,
      `${JSON.stringify(pose)}: the cap moved ${moved.toFixed(1)} when the points stopped`,
    );
  }
});

test('mesh: a tilted head that loses its points keeps its tilt', () => {
  const cloud = cloudOf('shell', { roll: 22 });
  const dropped = buildHeadCap({ ...cloud.source, mesh: undefined, hasMesh: false });
  const upright = buildHeadCap({ ...cloud.source, mesh: undefined, hasMesh: false, roll: 0 });
  assert.notDeepEqual(dropped, upright);
  // The base row runs along the tilt, not along the screen.
  const row = baseRow(dropped);
  const slope = Math.atan2(row[row.length - 1].y - row[0].y, row[row.length - 1].x - row[0].x) / RAD;
  assert.ok(Math.abs(slope - 22) < 6, `base row at ${slope.toFixed(1)} degrees`);
});

test('mesh: the kind of cloud is the tracker\'s, and no pose can change it', () => {
  // The two tables put the crown, the ear line and the brow in very
  // different places, so which one is used may never depend on the pose.
  // A face anchor is a shell at every angle it will ever report; a cloud
  // that goes all the way round says so on the mesh.
  for (const pose of [...SCAN_POSES, ...WILD_POSES]) {
    const shell = cloudOf('shell', pose);
    const named = buildHeadCap(shell.source);
    // The name is what says 'shell'; with no name at all the cap is the
    // same, because a shell is what a 3D cloud is taken for.
    assert.deepEqual(buildHeadCap({ ...shell.source, source: undefined }), named);
    const head = cloudOf('head', pose);
    const closed = buildHeadCap(head.source);
    assert.deepEqual(
      buildHeadCap({
        ...head.source,
        source: undefined,
        mesh: { ...head.source.mesh!, closed: true },
      }),
      closed,
    );
    // And the two are genuinely different caps, so the choice matters.
    assert.notDeepEqual(named, closed);
  }
});

test('mesh: the cloud\'s units do not matter — it is mapped onto the face box', () => {
  for (const kind of ['head', 'shell'] as const) {
    const points = buildHeadCap(cloudOf(kind, { yaw: 22, pitch: -12 }).source);
    const fractions = buildHeadCap(cloudOf(kind, { yaw: 22, pitch: -12, scale: 1 / 812 }).source);
    for (let i = 0; i < CAP_LENGTH; i += 1) {
      assert.ok(Math.abs(points[i] - fractions[i]) < 0.01, `${kind}: ${points[i]} vs ${fractions[i]}`);
    }
  }
});

test('mesh: a cloud in view FRACTIONS with a box in POINTS builds the same cap', () => {
  /*
    This is the shape the phone actually delivers, and the one the older
    test could not see. The native module reports its points as fractions
    of the rendered view — x divided by the view's width, y by its
    height, two very different numbers — while the box it reports is
    scaled back into the preview's own points before it reaches the
    tracker. A single averaged scale is then wrong on BOTH axes: on a
    430×932 preview it drew the cap half again too wide and a quarter too
    short. Scaling each axis by its own ratio is what makes the claim
    above ("the cloud's units do not matter") true for a cloud whose two
    axes were divided by different numbers.
  */
  const view = { width: 430, height: 932 };
  for (const kind of ['head', 'shell'] as const) {
    const cloud = cloudOf(kind, { yaw: 24, pitch: -18, roll: 9 }).source;
    const points = buildHeadCap(cloud);
    const mesh = cloud.mesh;
    assert.ok(mesh !== undefined);
    const squashed: number[] = [];
    for (let i = 0; i < mesh.points.length; i += 2) {
      squashed.push(mesh.points[i] / view.width, mesh.points[i + 1] / view.height);
    }
    const anisotropic = buildHeadCap({
      ...cloud,
      mesh: { points: squashed, facing: mesh.facing },
    });
    for (let i = 0; i < CAP_LENGTH; i += 1) {
      assert.ok(
        Math.abs(points[i] - anisotropic[i]) < 0.01,
        `${kind}[${i}]: ${points[i]} vs ${anisotropic[i]}`,
      );
    }
  }
});

test('mesh: the FACE BOX\'s units are the cap\'s — a box in fractions builds a cap in fractions', () => {
  // The cap comes out in whatever units the box is in and nothing else,
  // so a tracker reporting view fractions must be multiplied by the
  // preview's size before it gets here. Held as a test because the
  // symptom of getting it wrong is a whole head drawn inside a
  // one-by-one-point square, which looks like nothing at all.
  const view = { width: 393, height: 812 };
  const cloud = cloudOf('shell', { yaw: 18 });
  const inPoints = buildHeadCap(cloud.source);
  const inFractions = buildHeadCap({
    ...cloud.source,
    cx: cloud.source.cx / view.width,
    cy: cloud.source.cy / view.height,
    width: cloud.source.width / view.width,
    height: cloud.source.height / view.height,
  });
  for (let i = 0; i < CAP_POINTS; i += 1) {
    const k = i * CAP_STRIDE;
    assert.ok(Math.abs(inFractions[k]) < 2, 'x stays in the box\'s own units');
    assert.ok(Math.abs(inFractions[k + 1]) < 2, 'y stays in the box\'s own units');
    assert.ok(Math.abs(inPoints[k]) > 1 || Math.abs(inPoints[k + 1]) > 1);
  }
});

test('mesh: a thin, broken or absent cloud falls back to the detector oval', () => {
  const oval = buildHeadCap(source());
  // Not claimed.
  assert.deepEqual(buildHeadCap({ ...source(), mesh: { points: [1, 2, 3, 4], facing: [0, 0] } }), oval);
  // Claimed but too thin to loft from.
  assert.deepEqual(
    buildHeadCap({ ...source(), hasMesh: true, mesh: { points: [1, 2, 3, 4], facing: [0, 0] } }),
    oval,
  );
  // Claimed, long enough, and entirely NaN.
  const broken = {
    points: Array.from({ length: 400 }, () => Number.NaN),
    facing: Array.from({ length: 200 }, () => Number.NaN),
  };
  assert.deepEqual(buildHeadCap({ ...source(), hasMesh: true, mesh: broken }), oval);
  // Claimed, finite, and flat: no extent to scale by.
  const flat = {
    points: Array.from({ length: 400 }, () => 0),
    facing: Array.from({ length: 200 }, () => 1),
  };
  assert.deepEqual(buildHeadCap({ ...source(), hasMesh: true, mesh: flat }), oval);
  // A detector's reading with an outline of its own always gets the oval,
  // whatever else it carries.
  assert.deepEqual(buildHeadCap({ ...source(), source: 'mlkit' }), oval);
});

test('mesh: nothing is NaN when a cloud is wild, broken or barely there', () => {
  for (const kind of ['head', 'shell'] as const) {
    for (const pose of WILD_POSES) {
      const pts = buildHeadCap(cloudOf(kind, pose).source);
      for (const v of pts) assert.ok(Number.isFinite(v), `${kind} ${JSON.stringify(pose)}`);
    }
  }
  const cloud = cloudOf('shell', { yaw: 30, pitch: -20 });
  const broken: CapSource[] = [
    { ...cloud.source, yaw: Number.NaN, pitch: Number.NaN, roll: Number.NaN },
    { ...cloud.source, yaw: 900, pitch: -900, roll: 900 },
    { ...cloud.source, width: 0, height: 0 },
    { ...cloud.source, cx: Number.NaN },
    { ...cloud.source, mesh: { points: cloud.source.mesh!.points, facing: [] } },
    { ...cloud.source, mesh: undefined, hasMesh: false, width: Number.NaN },
    { ...cloud.source, source: 'arkit', mesh: undefined, hasMesh: false },
  ];
  for (const src of broken) {
    const pts = buildHeadCap(src);
    assert.equal(pts.length, CAP_LENGTH);
    for (const v of pts) assert.ok(Number.isFinite(v), JSON.stringify(Object.keys(src)));
  }
});

test('mesh: the drawn stand-in the simulator runs builds a head-sized cap at every phase', () => {
  const view = { width: 393, height: 812 };
  for (let t = 0; t < SAMPLE_LOOP_MS; t += SAMPLE_LOOP_MS / 24) {
    const raw = syntheticFace(view, t, t);
    assert.ok(raw.mesh !== undefined, 'the stand-in carries a mesh');
    const pts = buildHeadCap({
      cx: raw.cx,
      cy: raw.cy,
      width: raw.width,
      height: raw.height,
      contours: raw.contours ?? {},
      yaw: raw.yaw,
      pitch: raw.pitch,
      roll: raw.roll,
      mesh: raw.mesh,
      hasMesh: true,
      source: 'sample',
    });
    for (const v of pts) assert.ok(Number.isFinite(v), `phase ${t}`);
    const drawn = vertices(pts);
    const left = drawn.reduce((a, b) => (b.x < a ? b.x : a), Number.POSITIVE_INFINITY);
    const right = drawn.reduce((a, b) => (b.x > a ? b.x : a), Number.NEGATIVE_INFINITY);
    // As wide as a head and no wider: the cap is the head's, not the view's.
    assert.ok(right - left > raw.width, `phase ${t}: ${right - left} wide`);
    assert.ok(right - left < 2.6 * raw.width, `phase ${t}: ${right - left} wide`);
  }
});

/* ------------------------------- the regions ----------------------------- */

test('regions: every vertex belongs to one of the four the choreography captures', () => {
  assert.equal(CAP_REGIONS.length, 4);
  assert.equal(CAP_REGION_OF.length, CAP_POINTS);
  const seen = new Set<number>();
  for (const r of CAP_REGION_OF) {
    assert.ok(Number.isInteger(r) && r >= 0 && r < CAP_REGIONS.length, `region ${r}`);
    seen.add(r);
  }
  // All four are actually reachable — a region no vertex belongs to
  // would be a step that lights nothing.
  assert.equal(seen.size, CAP_REGIONS.length);
});

test('regions: the front is the hairline, the sides are the temples, the top is the crown', () => {
  const mid = (CAP.cols - 1) / 2;
  const at = (row: number, col: number) => CAP_REGIONS[CAP_REGION_OF[capIndex(row, col)]];
  assert.equal(at(0, mid), 'hairline');
  assert.equal(at(1, mid), 'hairline');
  assert.equal(CAP_REGIONS[CAP_REGION_OF[CAP_POLE]], 'crown');
  assert.equal(at(CAP.rows - 1, mid), 'crown');
  // The outermost meridians, at the base: the sides of the head. Named
  // by the side of the PICTURE — the first column is the screen's left.
  assert.equal(at(0, 0), 'leftTemple');
  assert.ok(CAP_COL_THETA[0] < 0, 'and the screen-left column is the negative meridian');
  assert.equal(at(0, CAP.cols - 1), 'rightTemple');
  assert.ok(CAP_COL_THETA[CAP.cols - 1] > 0);
});

test('regions: the temple a step lights is the one the camera can see', () => {
  /*
    The comment this holds down: turning right does NOT light the right
    of the screen. Positive yaw swings the nose to the screen's right,
    which turns the NEGATIVE-theta meridians — `leftTemple`, the
    screen's left — towards the lens. `REGION_OF_STEP` in engine.ts is
    where that pairing is written; this asserts the geometry agrees with
    it, so a wiring lane that reads either one lights the quarter of the
    head the phone can actually see.
  */
  const meanFacing = (pts: number[]): number[] => {
    const sum = CAP_REGIONS.map(() => 0);
    const count = CAP_REGIONS.map(() => 0);
    for (let v = 0; v < CAP_POINTS; v += 1) {
      const r = CAP_REGION_OF[v];
      sum[r] += Math.max(0, vertex(pts, v).facing);
      count[r] += 1;
    }
    return sum.map((s, i) => (count[i] === 0 ? 0 : s / count[i]));
  };
  const left = CAP_REGIONS.indexOf('leftTemple');
  const right = CAP_REGIONS.indexOf('rightTemple');

  for (const step of SCAN_STEPS) {
    if (step !== 'right' && step !== 'left') continue;
    const target = STEP_TARGETS[step];
    const facing = meanFacing(buildHeadCap(source({ yaw: target.yawDeg ?? 0 })));
    const shown = facing[left] > facing[right] ? 'leftTemple' : 'rightTemple';
    assert.equal(
      shown,
      REGION_OF_STEP[step],
      `the "${step}" step turns ${shown} to the camera, and the engine pairs it with ${REGION_OF_STEP[step]}`,
    );
  }

  // Square on it is the hairline the camera sees best, and lowering the
  // head is what brings the crown round.
  const square = meanFacing(buildHeadCap(source()));
  const hairline = CAP_REGIONS.indexOf('hairline');
  const crown = CAP_REGIONS.indexOf('crown');
  assert.equal(REGION_OF_STEP.front, 'hairline');
  assert.ok(square[hairline] === Math.max(...square), 'the hairline is squarest to the camera');
  const down = meanFacing(buildHeadCap(source({ pitch: STEP_TARGETS.down.pitchDeg ?? 0 })));
  assert.equal(REGION_OF_STEP.down, 'crown');
  assert.ok(down[crown] > square[crown], `the crown turns towards the camera: ${down[crown]}`);
  // The two temples stay even through the nod — it is a step about the
  // top of the head, and it must not favour a side.
  assert.ok(Math.abs(down[left] - down[right]) < 1e-9, 'the nod is even across the two temples');
});

test('regions: the two sides mirror, and nothing on the crown claims a side', () => {
  for (let row = 0; row < CAP.rows; row += 1) {
    for (let col = 0; col < CAP.cols; col += 1) {
      const a = CAP_REGIONS[CAP_REGION_OF[capIndex(row, col)]];
      const b = CAP_REGIONS[CAP_REGION_OF[capIndex(row, CAP.cols - 1 - col)]];
      const mirrored =
        a === b
          ? a === 'hairline' || a === 'crown'
          : (a === 'leftTemple' && b === 'rightTemple') ||
            (a === 'rightTemple' && b === 'leftTemple');
      assert.ok(mirrored, `row ${row} col ${col}: ${a} vs ${b}`);
    }
  }
});

/* -------------------------------- the fit -------------------------------- */

/**
 * A hair silhouette to fit to: a shell over the head fixture's own
 * ellipsoid, grown taller and wider, clipped to above the ear line and
 * projected exactly as the cloud is.
 *
 * It stands for what the segmenter returns — an outline of what was
 * called hair, in the same points as the face box — and it is built from
 * the fixture's proportions rather than from anything the cap produces,
 * so nothing here is read back out of the thing under test.
 */
function hairOutline(
  pose: CloudPose,
  grow: { up: number; wide: number; lean?: number },
): { flat: number[]; points: { x: number; y: number; facing: number; theta: number; height: number }[] } {
  const { yaw = 0, pitch = 0, roll = 0 } = pose;
  const { up, wide, lean = 0 } = grow;
  const ca = Math.cos(pitch * RAD);
  const sa = Math.sin(pitch * RAD);
  const cy1 = Math.cos(yaw * RAD);
  const sy1 = Math.sin(yaw * RAD);
  const cr = Math.cos(roll * RAD);
  const sr = Math.sin(roll * RAD);
  const project = (x: number, y: number, z: number): [number, number, number] => {
    const y1 = y * ca - z * sa;
    const z1 = y * sa + z * ca;
    const x2 = x * cy1 + z1 * sy1;
    const z2 = -x * sy1 + z1 * cy1;
    return [x2 * cr - y1 * sr, x2 * sr + y1 * cr, z2];
  };

  const a = HEAD.a * wide;
  const b = HEAD.b * up;
  const d = HEAD.d * wide;
  const rows = 13;
  const cols = 28;
  const phiLo = phiOf(0.4);
  const phiHi = Math.PI / 2;
  const flat: number[] = [];
  const points: { x: number; y: number; facing: number; theta: number; height: number }[] = [];
  for (let r = 0; r < rows; r += 1) {
    const phi = phiLo + ((phiHi - phiLo) * r) / (rows - 1);
    for (let c = 0; c < cols; c += 1) {
      const theta = -Math.PI + (2 * Math.PI * c) / cols;
      const [x, y] = project(
        a * Math.cos(phi) * Math.sin(theta) + lean * HEAD.a,
        -b * Math.sin(phi),
        d * Math.cos(phi) * Math.cos(theta),
      );
      const nx = (Math.cos(phi) * Math.sin(theta)) / a;
      const ny = -Math.sin(phi) / b;
      const nz = (Math.cos(phi) * Math.cos(theta)) / d;
      const len = Math.hypot(nx, ny, nz) || 1;
      const facing = project(nx / len, ny / len, nz / len)[2];
      flat.push(x, y);
      points.push({ x, y, facing, theta, height: (Math.sin(phi) + 1) / 2 });
    }
  }
  return { flat, points };
}

/** The poses the fit has to hold at: square on, turned either way, and looking down. */
const FIT_POSES: CloudPose[] = [
  { yaw: 0, pitch: 0 },
  { yaw: 30, pitch: 0 },
  { yaw: -30, pitch: 0 },
  { yaw: 0, pitch: -30 },
  { yaw: 30, pitch: -30 },
  { yaw: -30, pitch: -30 },
  { yaw: 25, pitch: -15, roll: 12 },
];

test('fit: no fit is the standing allowance — one constant decides what a phone with no mask draws', () => {
  for (const pose of FIT_POSES) {
    const src = cloudOf('head', pose).source;
    assert.deepEqual(buildHeadCap(src, CAP_FIT_DEFAULT), buildHeadCap(src), JSON.stringify(pose));
  }
  assert.deepEqual(buildHeadCap(source(), CAP_FIT_DEFAULT), buildHeadCap(source()));
  // And the allowance is genuinely an allowance: setting it to the
  // identity would give back the bare dome, byte for byte.
  assert.notDeepEqual(buildHeadCap(source()), bare(source()));
});

test('fit: the standing allowance clears the skull, on every road and at every pose', () => {
  // The whole point of it. A face tracker has nothing to say about the
  // hair standing off the head, so the dome the app draws stands clear
  // of the one the geometry alone asks for — at every pose, on the
  // tracked road and on the detector's, without any mask at all.
  assert.ok(CAP_FIT_DEFAULT.lift > 1 && CAP_FIT_DEFAULT.widen > 1, 'the allowance is an allowance');
  assert.ok(
    CAP_FIT_DEFAULT.lift <= CAP_FIT.lift.max && CAP_FIT_DEFAULT.widen <= CAP_FIT.widen.max,
    'and it is inside the clamps a measured fit lives in',
  );
  for (const pose of FIT_POSES) {
    const cloud = cloudOf('head', pose);
    const drawn = buildHeadCap(cloud.source);
    const skull = bare(cloud.source);
    for (const v of drawn) assert.ok(Number.isFinite(v), JSON.stringify(pose));
    // The crown stands clear of the skull.
    const rose = vertex(skull, CAP_POLE).y - vertex(drawn, CAP_POLE).y;
    assert.ok(rose > 1, `${JSON.stringify(pose)}: the pole rose ${rose.toFixed(1)} points`);
    // Every vertex of the bare dome is inside the drawn one, so the
    // allowance never trades one side of the head for another.
    const outline = hull(vertices(drawn).map((v) => ({ x: v.x, y: v.y })));
    for (const v of vertices(skull)) {
      assert.ok(
        insideBy(outline, { x: v.x, y: v.y }) > -0.5,
        `${JSON.stringify(pose)}: skull point ${v.x},${v.y} left outside`,
      );
    }
    // And the base is still on the brow: the allowance grows the dome,
    // it does not walk the cap up off the eyebrows.
    const drift = distanceToPolyline(baseRow(drawn), cloud.landmarkAt(ON_HEAD.brow));
    assert.ok(drift < 0.0625 * HEAD.b, `${JSON.stringify(pose)}: base ${drift.toFixed(1)} off the brow`);
  }

  // The detector's road too, where the brow is the detected one and the
  // base row's middle vertex is the pin itself.
  const src = source();
  const held = vertex(buildHeadCap(src), capIndex(0, (CAP.cols - 1) / 2));
  const brow = latticeBrow(src);
  assert.ok(Math.abs(held.x - brow.x) < 0.5 && Math.abs(held.y - brow.y) < 0.5, 'base held');
  assert.ok(
    vertex(bare(src), CAP_POLE).y - vertex(buildHeadCap(src), CAP_POLE).y > 1,
    'and the oval road rises too',
  );
});

test('fit: a silhouette standing off the skull lifts and widens the cap, at every pose', () => {
  for (const pose of FIT_POSES) {
    const cloud = cloudOf('head', pose);
    const hair = hairOutline(pose, { up: 1.25, wide: 1.18 });
    const fit = fitHairCap(cloud.source, { points: hair.flat });
    assert.ok(fit !== null, `${JSON.stringify(pose)}: a fit`);
    assert.ok(fit.lift > 1.02, `${JSON.stringify(pose)}: lift ${fit.lift}`);
    assert.ok(fit.widen > 1.0, `${JSON.stringify(pose)}: widen ${fit.widen}`);
    assert.ok(Number.isFinite(fit.lift + fit.widen + fit.shift));
    // Deterministic: the same reading twice is the same fit.
    assert.deepEqual(fitHairCap(cloud.source, { points: hair.flat }), fit);
  }
});

test('fit: the fitted cap holds the hair the bare dome cuts through, turned or looking down', () => {
  const reach = Math.abs(CAP_COL_THETA[0]);
  // A twentieth of a head's height of slack: the cap is a head's shape,
  // not this fixture's, and the two differ by about that around the ears.
  const slack = 0.05 * HEAD.b;
  let missedByBare = 0;
  for (const pose of FIT_POSES) {
    const cloud = cloudOf('head', pose);
    const hair = hairOutline(pose, { up: 1.25, wide: 1.18 });
    const fit = fitHairCap(cloud.source, { points: hair.flat });
    assert.ok(fit !== null);
    const fitted = hull(vertices(buildHeadCap(cloud.source, fit)).map((v) => ({ x: v.x, y: v.y })));
    const bare = hull(vertices(buildHeadCap(cloud.source)).map((v) => ({ x: v.x, y: v.y })));
    const seen = hair.points.filter(
      (p) => p.facing > 0.05 && p.height > ON_HEAD.brow + 0.05 && Math.abs(p.theta) <= reach,
    );
    assert.ok(seen.length >= 10, `${JSON.stringify(pose)}: the outline shows its top`);
    for (const p of seen) {
      assert.ok(
        insideBy(fitted, p) > -slack,
        `${JSON.stringify(pose)}: hair at ${p.x.toFixed(1)},${p.y.toFixed(1)} outside the fitted cap`,
      );
      if (insideBy(bare, p) < -slack) missedByBare += 1;
    }
  }
  // The point of the whole exercise: the bare dome really does leave
  // hair outside, so the fit is doing work rather than agreeing.
  assert.ok(missedByBare > 0, 'the bare dome misses hair the fit catches');
});

test('fit: a hairline sweep pulls the cap across, within its limit', () => {
  const cloud = cloudOf('head', { yaw: 0, pitch: 0 });
  const swept = hairOutline({ yaw: 0, pitch: 0 }, { up: 1.2, wide: 1.1, lean: 0.25 });
  const fit = fitHairCap(cloud.source, { points: swept.flat });
  assert.ok(fit !== null);
  assert.ok(fit.shift > 0.01, `shift ${fit.shift}`);
  assert.ok(Math.abs(fit.shift) <= CAP_FIT.shift + 1e-9, `shift ${fit.shift} inside its clamp`);
  const level = hairOutline({ yaw: 0, pitch: 0 }, { up: 1.2, wide: 1.1 });
  const straight = fitHairCap(cloud.source, { points: level.flat });
  assert.ok(straight !== null);
  assert.ok(Math.abs(straight.shift) < 0.02, `a level head barely shifts: ${straight.shift}`);
});

test('fit: a wild silhouette is clamped or refused, never obeyed', () => {
  const cloud = cloudOf('head', { yaw: 0, pitch: 0 });
  let fitted = 0;
  for (const grow of [
    { up: 4, wide: 4 },
    { up: 1.9, wide: 0.5 },
    // Nothing above the brow at all, and a shell thrown clean off the
    // head sideways: neither has an honest answer, and null is it.
    { up: 0.2, wide: 0.2 },
    { up: 3, wide: 0.3, lean: 3 },
  ]) {
    const fit = fitHairCap(cloud.source, { points: hairOutline({}, grow).flat });
    if (fit === null) continue;
    fitted += 1;
    assert.ok(fit.lift >= CAP_FIT.lift.min && fit.lift <= CAP_FIT.lift.max, `lift ${fit.lift}`);
    assert.ok(fit.widen >= CAP_FIT.widen.min && fit.widen <= CAP_FIT.widen.max, `widen ${fit.widen}`);
    assert.ok(Math.abs(fit.shift) <= CAP_FIT.shift + 1e-9, `shift ${fit.shift}`);
    for (const v of buildHeadCap(cloud.source, fit)) assert.ok(Number.isFinite(v));
  }
  assert.ok(fitted >= 2, 'the clamps are actually exercised');
});

test('fit: a reading with nothing in it is no fit at all, and the bare dome is drawn', () => {
  const cloud = cloudOf('head', { yaw: 0, pitch: 0 });
  const nothing: number[][] = [
    [],
    [1, 2, 3, 4],
    Array.from({ length: 80 }, () => Number.NaN),
    // Every point below the brow: nothing rises above it to measure.
    Array.from({ length: 80 }, (_, i) => (i % 2 === 0 ? cloud.source.cx : cloud.source.cy + 400)),
  ];
  for (const points of nothing) {
    assert.equal(fitHairCap(cloud.source, { points }), null, JSON.stringify(points.slice(0, 4)));
  }
  // A broken face is no fit either, and a broken fit still draws finite.
  const hair = hairOutline({}, { up: 1.2, wide: 1.1 });
  assert.equal(fitHairCap({ ...cloud.source, width: 0, height: 0 }, { points: hair.flat }), null);
  const wild: CapFit[] = [
    { lift: Number.NaN, widen: Number.NaN, shift: Number.NaN },
    { lift: Number.POSITIVE_INFINITY, widen: -50, shift: 900 },
  ];
  for (const fit of wild) {
    const pts = buildHeadCap(cloud.source, fit);
    assert.equal(pts.length, CAP_LENGTH);
    for (const v of pts) assert.ok(Number.isFinite(v), JSON.stringify(fit));
  }
});

test('fit: the base stays on the brow however the cap is stretched', () => {
  for (const pose of FIT_POSES) {
    const cloud = cloudOf('head', pose);
    const hair = hairOutline(pose, { up: 1.3, wide: 1.2 });
    const fit = fitHairCap(cloud.source, { points: hair.flat });
    assert.ok(fit !== null);
    const drift = distanceToPolyline(
      baseRow(buildHeadCap(cloud.source, fit)),
      cloud.landmarkAt(ON_HEAD.brow),
    );
    assert.ok(drift < 0.0625 * HEAD.b, `${JSON.stringify(pose)}: base ${drift.toFixed(1)} off the brow`);
  }
});

test('fit: the cap grows into the hair without popping', () => {
  const cloud = cloudOf('head', { yaw: 20, pitch: -20 });
  const hair = hairOutline({ yaw: 20, pitch: -20 }, { up: 1.3, wide: 1.2 });
  const to = fitHairCap(cloud.source, { points: hair.flat });
  assert.ok(to !== null);

  assert.deepEqual(blendCapFit(CAP_FIT_IDENTITY, to, 0), CAP_FIT_IDENTITY);
  assert.deepEqual(blendCapFit(CAP_FIT_IDENTITY, to, 1), to);
  // Out of range is not a leap past the target.
  assert.deepEqual(blendCapFit(CAP_FIT_IDENTITY, to, 4), to);
  assert.deepEqual(blendCapFit(CAP_FIT_IDENTITY, to, Number.NaN), CAP_FIT_IDENTITY);

  // Walked at the mesh's own rate — a reading every 33 ms against a
  // 520 ms constant — the pole never moves more than a couple of points
  // in a step, which is under the glide's own reach and reads as growth.
  let fit = CAP_FIT_IDENTITY;
  let previous = vertex(buildHeadCap(cloud.source, fit), CAP_POLE);
  let worst = 0;
  let travelled = 0;
  for (let i = 0; i < 90; i += 1) {
    fit = blendCapFit(fit, to, 1 - Math.exp(-33 / 520));
    const pole = vertex(buildHeadCap(cloud.source, fit), CAP_POLE);
    const step = Math.hypot(pole.x - previous.x, pole.y - previous.y);
    if (step > worst) worst = step;
    travelled += step;
    previous = pole;
  }
  assert.ok(worst < 2.5, `worst step ${worst.toFixed(2)} points`);
  // And it actually arrives: three seconds of readings later the pole
  // is where the finished fit puts it.
  assert.ok(travelled > 8, `travelled ${travelled.toFixed(1)} points`);
  const settled = vertex(buildHeadCap(cloud.source, to), CAP_POLE);
  assert.ok(Math.hypot(previous.x - settled.x, previous.y - settled.y) < 0.5, 'arrives');
});

test('fit: a fit refined from where the cap already is lands in the same place', () => {
  const cloud = cloudOf('head', { yaw: -30, pitch: -15 });
  const hair = hairOutline({ yaw: -30, pitch: -15 }, { up: 1.22, wide: 1.15 });
  const cold = fitHairCap(cloud.source, { points: hair.flat });
  assert.ok(cold !== null);
  for (const from of [CAP_FIT_IDENTITY, cold, { lift: 1.4, widen: 1.3, shift: 0.1 }]) {
    const warm = fitHairCap(cloud.source, { points: hair.flat }, from);
    assert.ok(warm !== null);
    assert.ok(Math.abs(warm.lift - cold.lift) < 0.04, `lift ${warm.lift} vs ${cold.lift}`);
    assert.ok(Math.abs(warm.widen - cold.widen) < 0.04, `widen ${warm.widen} vs ${cold.widen}`);
    assert.ok(Math.abs(warm.shift - cold.shift) < 0.04, `shift ${warm.shift} vs ${cold.shift}`);
  }
});

test('fit: the detector road takes a fit too — a phone with no cloud still sits on the hair', () => {
  const src = source();
  const bare = buildHeadCap(src);
  const fit: CapFit = { lift: 1.3, widen: 1.15, shift: 0 };
  const grown = buildHeadCap(src, fit);
  for (const v of grown) assert.ok(Number.isFinite(v));
  const basePole = vertex(bare, CAP_POLE);
  const grownPole = vertex(grown, CAP_POLE);
  assert.ok(grownPole.y < basePole.y - 10, 'the crown rises');
  const base = vertex(grown, capIndex(0, (CAP.cols - 1) / 2));
  const wasBase = vertex(bare, capIndex(0, (CAP.cols - 1) / 2));
  assert.ok(Math.abs(base.x - wasBase.x) < 0.5 && Math.abs(base.y - wasBase.y) < 0.5, 'base held');
});

/* --------------------------- holding the fit ----------------------------- */

test('fit: a refused reading holds the cap where it is, and only a run of them lets go', () => {
  /*
    The failure this exists to stop: a segmenter is a classifier looking
    at a moving head, and it refuses often — a shattered trace, a head
    tipped past the top gate, a face lost for an instant. Read as "there
    is no hair", one refusal deflates the cap onto the skull and the
    next good frame re-inflates it, which is a visible pop several times
    a scan.
  */
  const cloud = cloudOf('head', { yaw: 20, pitch: -20 });
  const hair = hairOutline({ yaw: 20, pitch: -20 }, { up: 1.3, wide: 1.2 });
  const measured = fitHairCap(cloud.source, { points: hair.flat });
  assert.ok(measured !== null);
  assert.ok(measured.lift > CAP_FIT_DEFAULT.lift + CAP_FIT.deadband, 'the fixture is worth fitting');

  let state = nextCapFit(CAP_FIT_START, measured);
  assert.deepEqual(state.wanted, measured);
  assert.equal(state.misses, 0);

  // Every refusal short of the hold keeps the very same shape — not a
  // shape near it, the same one.
  for (let i = 1; i < CAP_FIT.hold; i += 1) {
    state = nextCapFit(state, null);
    assert.deepEqual(state.wanted, measured, `refusal ${i} moved the cap`);
    assert.equal(state.misses, i);
  }
  // And one good reading anywhere in that run clears the count.
  const recovered = nextCapFit(state, measured);
  assert.deepEqual(recovered.wanted, measured);
  assert.equal(recovered.misses, 0);

  // Past the hold it lets go — back to the standing allowance, never to
  // the bare skull.
  state = nextCapFit(state, null);
  assert.deepEqual(state.wanted, CAP_FIT_DEFAULT);
  assert.notDeepEqual(state.wanted, CAP_FIT_IDENTITY);
  for (let i = 0; i < 5; i += 1) state = nextCapFit(state, null);
  assert.deepEqual(state.wanted, CAP_FIT_DEFAULT, 'and stays there');
});

test('fit: a reading inside the deadband is the reading the cap already has', () => {
  // A classifier jitters a percent or two on a head that has not moved.
  // Easing towards every jitter is a cap that breathes, which is what a
  // reduced-motion reader would be left with once the glide is off.
  const settled: CapFit = { lift: 1.2, widen: 1.1, shift: 0.02 };
  const state = nextCapFit(CAP_FIT_START, settled);
  const nudge = CAP_FIT.deadband * 0.4;
  const jittered = nextCapFit(state, {
    lift: settled.lift + nudge,
    widen: settled.widen - nudge,
    shift: settled.shift + nudge,
  });
  assert.deepEqual(jittered.wanted, state.wanted, 'the jitter did not move the cap');

  // A real change does move it.
  const moved = nextCapFit(state, { lift: settled.lift + 0.1, widen: settled.widen, shift: settled.shift });
  assert.notDeepEqual(moved.wanted, state.wanted);
  assert.ok(Math.abs(moved.wanted.lift - (settled.lift + 0.1)) < 1e-9);
});

test('fit: the held shape is clamped and finite, whatever it is handed', () => {
  const wild: (CapFit | null)[] = [
    { lift: Number.NaN, widen: Number.NaN, shift: Number.NaN },
    { lift: Number.POSITIVE_INFINITY, widen: -50, shift: 900 },
    null,
    { lift: 1.25, widen: 1.1, shift: -0.9 },
  ];
  let state: typeof CAP_FIT_START = { wanted: CAP_FIT_START.wanted, misses: Number.NaN };
  for (const fit of wild) {
    state = nextCapFit(state, fit);
    const { lift, widen, shift } = state.wanted;
    assert.ok(Number.isFinite(lift + widen + shift), JSON.stringify(fit));
    assert.ok(lift >= CAP_FIT.lift.min && lift <= CAP_FIT.lift.max, `lift ${lift}`);
    assert.ok(widen >= CAP_FIT.widen.min && widen <= CAP_FIT.widen.max, `widen ${widen}`);
    assert.ok(Math.abs(shift) <= CAP_FIT.shift + 1e-9, `shift ${shift}`);
    assert.ok(Number.isInteger(state.misses) && state.misses >= 0, `misses ${state.misses}`);
    for (const v of buildHeadCap(cloudOf('head').source, state.wanted)) assert.ok(Number.isFinite(v));
  }
});

test('fit: a segmenter that stutters never pops the cap — a whole scan, readings and refusals', () => {
  /*
    The scan as it actually runs: a tracked face every 33 ms, a
    segmenter reading a few times a second, and that reading refusing
    now and then the way a real classifier does. The two rules under
    test together — `nextCapFit` holding through a refusal, `blendCapFit`
    easing towards what it holds — have to leave the cap moving smoothly
    the whole way through. A reset on a single bad frame shows up here
    as a pole that leaps and comes back.
  */
  const pose = { yaw: 30, pitch: -30 };
  const cloud = cloudOf('head', pose);
  const hair = hairOutline(pose, { up: 1.3, wide: 1.2 });
  const measured = fitHairCap(cloud.source, { points: hair.flat });
  assert.ok(measured !== null);

  // A refusal every fourth reading, and two in a row in the middle:
  // shorter than the hold, so the cap may never let go.
  const refuses = (reading: number) => reading % 4 === 3 || reading === 9 || reading === 10;

  let state = CAP_FIT_START;
  let drawn = CAP_FIT_DEFAULT;
  let previous = vertex(buildHeadCap(cloud.source, drawn), CAP_POLE);
  let worst = 0;
  let lowest = Number.POSITIVE_INFINITY;
  let readings = 0;
  for (let frame = 0; frame < 300; frame += 1) {
    // Three readings a second against a 30 Hz tracker.
    if (frame % 10 === 0) {
      state = nextCapFit(state, refuses(readings) ? null : measured);
      readings += 1;
    }
    drawn = blendCapFit(drawn, state.wanted, 1 - Math.exp(-33 / 520));
    const pole = vertex(buildHeadCap(cloud.source, drawn), CAP_POLE);
    const step = Math.hypot(pole.x - previous.x, pole.y - previous.y);
    if (step > worst) worst = step;
    if (drawn.lift < lowest) lowest = drawn.lift;
    previous = pole;
  }
  assert.ok(readings > CAP_FIT.hold, 'the run is longer than the hold');
  assert.ok(worst < 2.5, `worst step ${worst.toFixed(2)} points`);
  // It never sagged back below where it started: a refusal held, it did
  // not deflate the cap towards the skull.
  assert.ok(lowest >= CAP_FIT_DEFAULT.lift - 1e-9, `sagged to ${lowest}`);
  // And it arrived at the measured shape.
  const settled = vertex(buildHeadCap(cloud.source, measured), CAP_POLE);
  assert.ok(Math.hypot(previous.x - settled.x, previous.y - settled.y) < 0.5, 'arrives');
});

/* ------------------------------ the shape -------------------------------- */

/*
  The complaint these exist for, in the owner's words: "the mesh is
  still the dome shape... it does track, but it should be programmed to
  adapt to the head or hair shape."

  He was right, and the old code said so itself: a fit was three
  numbers, so whatever the mask reported, what went on the head was the
  same ellipsoid at a different size. The tests below are written so
  that they CANNOT pass on a rescaled ellipsoid: the two masks are built
  to have the same height, the same width and the same middle, and to
  differ only in the shape of their skyline.
*/

/** The size half of a fit, with the shape thrown away: what a rescale can do. */
function sizeOnly(fit: CapFit): CapFit {
  return { lift: fit.lift, widen: fit.widen, shift: fit.shift };
}

/** The furthest any vertex of one cap stands from the same vertex of another. */
function worstGap(a: number[], b: number[]): number {
  let worst = 0;
  for (let v = 0; v < CAP_POINTS; v += 1) {
    const k = v * CAP_STRIDE;
    const gap = Math.hypot(a[k] - b[k], a[k + 1] - b[k + 1]);
    if (gap > worst) worst = gap;
  }
  return worst;
}

/**
 * How far a drawn cap reaches from the head's middle in one direction
 * of the picture, in points: the outline, read the way an eye reads it.
 * Degrees from straight up, positive towards the screen's right.
 */
function reachAt(pts: number[], centre: Point, degrees: number): number {
  let far = 0;
  for (let v = 0; v < CAP_POINTS; v += 1) {
    const k = v * CAP_STRIDE;
    const x = pts[k] - centre.x;
    const y = pts[k + 1] - centre.y;
    const angle = (Math.atan2(x, -y) * 180) / Math.PI;
    if (Math.abs(angle - degrees) > 8) continue;
    const r = Math.hypot(x, y);
    if (r > far) far = r;
  }
  return far;
}

/**
 * A silhouette with a chosen SKYLINE: a head-sized outline whose top
 * edge is whatever shape is handed in, and whose sides and bottom are
 * fixed.
 *
 * `top(u)` is the height above the middle at across-position u, from
 * −1 at the left edge to +1 at the right, as a share of the outline's
 * own half-height. Both skylines below are normalised to peak at
 * exactly 1, so the two masks are the same height, the same width and
 * the same middle — everything `lift`, `widen` and `shift` can see —
 * and differ only in where that height sits.
 */
function shapedOutline(
  centre: Point,
  top: (u: number) => number,
  size: { wide: number; up: number } = { wide: 1.14, up: 1.2 },
): { points: number[] } {
  const halfWidth = HEAD.a * size.wide;
  const halfHeight = HEAD.b * size.up;
  const steps = 90;
  const points: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const u = -1 + (2 * i) / steps;
    points.push(centre.x + u * halfWidth, centre.y - halfHeight * top(u));
  }
  // Back along the ear line, so the outline is closed and the cap has a
  // bottom to sit on, as a traced mask does.
  for (let i = steps; i >= 0; i -= 1) {
    const u = -1 + (2 * i) / steps;
    const waist = Math.sqrt(Math.max(0, 1 - 0.5 * u * u));
    points.push(centre.x + u * halfWidth * waist, centre.y + 0.35 * halfHeight);
  }
  return { points };
}

/** The shoulders both skylines share, so only their tops differ. */
function shoulder(u: number): number {
  const out = Math.min(1, Math.max(0, (Math.abs(u) - 0.3) / 0.7));
  return 1 - 0.55 * Math.pow(out, 1.4);
}

function skyline(level: number, quiff: number): (u: number) => number {
  const raw = (u: number) => level * shoulder(u) + quiff * Math.exp(-Math.pow((u - 0.5) / 0.16, 2));
  let peak = 0;
  for (let i = 0; i <= 200; i += 1) peak = Math.max(peak, raw(-1 + i / 100));
  return (u: number) => raw(u) / peak;
}

/** Hair with a flat top: highest across the middle, falling away at the sides. */
const SKYLINE_FLAT = skyline(1, 0);
/** Hair swept up on one side: a low crown and a quiff at half-width. */
const SKYLINE_QUIFF = skyline(0.74, 0.34);

test('shape: a flat top and a quiff are not the same cap — the shape comes off the mask', () => {
  const cloud = cloudOf('head', { yaw: 0, pitch: 0 });
  const centre = { x: cloud.source.cx, y: cloud.source.cy };
  const flat = fitHairCap(cloud.source, shapedOutline(centre, SKYLINE_FLAT));
  const quiff = fitHairCap(cloud.source, shapedOutline(centre, SKYLINE_QUIFF));
  assert.ok(flat !== null && quiff !== null, 'both masks fit');
  assert.ok(flat.profile !== undefined && quiff.profile !== undefined, 'both carry a shape');

  // THE POINT. The two masks are the same size in every way a rescale
  // can measure, so the caps a rescale draws for them are the same cap:
  // lift, widen and shift cannot tell a quiff from a flat top.
  const rescaledFlat = buildHeadCap(cloud.source, sizeOnly(flat));
  const rescaledQuiff = buildHeadCap(cloud.source, sizeOnly(quiff));
  const blind = worstGap(rescaledFlat, rescaledQuiff);
  assert.ok(blind < 1, `a rescale reads both masks as one cap, within ${blind.toFixed(2)} points`);

  // With the shape, they are visibly different caps.
  const drawnFlat = buildHeadCap(cloud.source, flat);
  const drawnQuiff = buildHeadCap(cloud.source, quiff);
  const apart = worstGap(drawnFlat, drawnQuiff);
  assert.ok(apart > 15, `the shaped caps stand ${apart.toFixed(1)} points apart`);

  // And different WHERE THE MASKS ARE, which is the whole claim. Over
  // the middle the flat top stands higher, because the quiff's crown is
  // low; and the quiff's cap LEANS — it reaches further on the side the
  // quiff is on than on the side it is not — while the flat one is
  // even. No lift or widen can lean a cap, and neither fit shifted.
  const crown = reachAt(drawnFlat, centre, 0) - reachAt(drawnQuiff, centre, 0);
  assert.ok(crown > 12, `the flat top stands ${crown.toFixed(1)} points higher over the crown`);
  assert.ok(Math.abs(flat.shift) < 0.01 && Math.abs(quiff.shift) < 0.01, 'neither leans by shift');
  const evenly = reachAt(drawnFlat, centre, 30) - reachAt(drawnFlat, centre, -30);
  const leaning = reachAt(drawnQuiff, centre, 30) - reachAt(drawnQuiff, centre, -30);
  assert.ok(Math.abs(evenly) < 2, `the flat cap is even, ${evenly.toFixed(1)} points`);
  assert.ok(leaning > 15, `the quiff cap leans ${leaning.toFixed(1)} points towards the quiff`);

  // Deterministic, like the size: the same mask twice is the same shape.
  assert.deepEqual(fitHairCap(cloud.source, shapedOutline(centre, SKYLINE_QUIFF)), quiff);
});

test('shape: a mask that says nothing about a direction keeps the dome there, turned or down', () => {
  /*
    A wrong shape is worse than a dome, and the commonest way to be
    wrong is to read a shape out of a mask that never covered that part
    of the head — a turned head, a crown out of frame, a segmenter that
    stopped at the jaw. So a silhouette covering one side of the head
    must shape that side and leave every other direction at the dome's
    own value, which is 1, exactly.

    The dial runs clockwise from straight up: ray 0 is the crown, 6 the
    screen's right, 12 straight down, 18 the screen's left. Everything
    from 13 round to 23 is the half of the head this mask never reached.
  */
  for (const pose of [{ yaw: 30, pitch: 0 }, { yaw: -30, pitch: 0 }, { yaw: 0, pitch: -30 }]) {
    const label = JSON.stringify(pose);
    const cloud = cloudOf('head', pose);
    const whole = hairOutline(pose, { up: 1.25, wide: 1.18 });
    const edge = cloud.source.cx + 0.25 * cloud.source.width;
    const half: number[] = [];
    for (let i = 0; i + 1 < whole.flat.length; i += 2) {
      if (whole.flat[i] < edge) continue;
      half.push(whole.flat[i], whole.flat[i + 1]);
    }
    assert.ok(half.length >= CAP_FIT.minPoints * 2, `${label}: a piece of an outline is still an outline`);

    const fit = fitHairCap(cloud.source, { points: half });
    assert.ok(fit !== null, `${label}: a fit`);
    const profile = fit.profile;
    assert.ok(profile !== undefined, `${label}: a shape`);
    assert.equal(profile.length, CAP_PROFILE.rays);

    // The half the mask never reached is the dome, to the bit.
    for (let ray = 13; ray <= 23; ray += 1) {
      assert.equal(profile[ray], 1, `${label}: ray ${ray} took a shape from nothing`);
    }
    // And the half it did reach carries one.
    const shapedRays = profile.filter((k) => Math.abs(k - 1) > 0.03).length;
    assert.ok(shapedRays >= 4, `${label}: ${shapedRays} rays took a shape from the mask`);

    // Whatever the shape does, the cap is still a cap: finite, and its
    // base still on the eyebrows.
    const drawn = buildHeadCap(cloud.source, fit);
    for (const value of drawn) assert.ok(Number.isFinite(value), `${label}: finite`);
    const drift = distanceToPolyline(baseRow(drawn), cloud.landmarkAt(ON_HEAD.brow));
    assert.ok(drift < 0.0625 * HEAD.b, `${label}: base ${drift.toFixed(1)} off the brow`);
  }
});

test('shape: a spike in the mask cannot grow a horn', () => {
  /*
    The failure mode a shape brings that a size never had: one bright
    speck of mask in one direction, and the cap sprouts a spike. Three
    rules stand against it — a floor and a ceiling on any one ray, no
    ray further than `slope` from the ray beside it, and a ray believed
    only as far as the boundary that spoke for it — and all three are
    enforced in `clampFit`, so nothing that reaches the drawing can have
    skipped them.
  */
  const cloud = cloudOf('head', { yaw: 0, pitch: 0 });
  const centre = { x: cloud.source.cx, y: cloud.source.cy };
  const base = shapedOutline(centre, SKYLINE_FLAT).points;

  const spiked: number[][] = [base];
  // A spike thrown out of the mask in one direction, at three sizes.
  for (const reach of [2, 4, 12]) {
    const points = [...base];
    for (let i = 0; i < 6; i += 1) {
      const angle = (-20 + i * 2) * (Math.PI / 180);
      points.push(centre.x + reach * 150 * Math.sin(angle), centre.y - reach * 150 * Math.cos(angle));
    }
    spiked.push(points);
  }
  // And a mask that is nothing but noise, in case the trace ever lets one through.
  const noise: number[] = [];
  for (let i = 0; i < 200; i += 1) {
    const t = (i * 2654435761) % 1000;
    noise.push(centre.x + (t - 500), centre.y - ((t * 7) % 900) + 300);
  }
  spiked.push(noise);

  let shapes = 0;
  for (const points of spiked) {
    const fit = fitHairCap(cloud.source, { points });
    if (fit === null) continue;
    const profile = fit.profile;
    if (profile === undefined) continue;
    shapes += 1;
    for (let i = 0; i < profile.length; i += 1) {
      assert.ok(
        profile[i] >= CAP_PROFILE.in - 1e-9 && profile[i] <= CAP_PROFILE.out + 1e-9,
        `ray ${i} at ${profile[i]}`,
      );
      const next = profile[(i + 1) % profile.length];
      assert.ok(
        Math.abs(profile[i] - next) <= CAP_PROFILE.slope + 1e-9,
        `rays ${i} and ${(i + 1) % profile.length} stand ${Math.abs(profile[i] - next).toFixed(3)} apart`,
      );
    }
    // A shape is clamped once and stays clamped: passing it round the
    // blend and the hold cannot let it creep.
    assert.deepEqual(blendCapFit(fit, fit, 1), fit, 'the clamp is idempotent');
    assert.deepEqual(nextCapFit(CAP_FIT_START, fit).wanted, fit);
    const drawn = buildHeadCap(cloud.source, fit);
    for (const value of drawn) assert.ok(Number.isFinite(value));
    // And what a horn would actually look like on the screen: one line
    // of the mesh stretched away from its neighbours. Against the cap
    // the same fit draws with no shape at all, not one ring or meridian
    // segment even doubles.
    const sized = buildHeadCap(cloud.source, sizeOnly(fit));
    let worst = 0;
    for (const line of [...CAP_RINGS, ...CAP_MERIDIANS]) {
      for (let i = 1; i < line.length; i += 1) {
        const a = line[i - 1] * CAP_STRIDE;
        const b = line[i] * CAP_STRIDE;
        const was = Math.hypot(sized[a] - sized[b], sized[a + 1] - sized[b + 1]);
        if (was < 0.5) continue;
        const now = Math.hypot(drawn[a] - drawn[b], drawn[a + 1] - drawn[b + 1]);
        if (now / was > worst) worst = now / was;
      }
    }
    assert.ok(worst < 2, `a segment grew ${worst.toFixed(2)} times`);
  }
  assert.ok(shapes >= 2, 'the rules are actually exercised');
});

test('shape: the cap grows into a shape ray by ray, and lets go of one the same way', () => {
  const cloud = cloudOf('head', { yaw: 0, pitch: 0 });
  const centre = { x: cloud.source.cx, y: cloud.source.cy };
  const to = fitHairCap(cloud.source, shapedOutline(centre, SKYLINE_QUIFF));
  assert.ok(to !== null && to.profile !== undefined);

  // Halfway is halfway on every ray, not on some of them.
  const half = blendCapFit(CAP_FIT_DEFAULT, to, 0.5);
  assert.ok(half.profile !== undefined);
  for (let i = 0; i < CAP_PROFILE.rays; i += 1) {
    assert.ok(Math.abs(half.profile[i] - (1 + to.profile[i]) / 2) < 1e-9, `ray ${i} halfway`);
  }

  // Walked at the mesh's own rate the shape grows rather than pops: no
  // vertex of the cap moves more than a couple of points in a step, and
  // it arrives.
  let drawn: CapFit = CAP_FIT_DEFAULT;
  let previous = buildHeadCap(cloud.source, drawn);
  let worst = 0;
  for (let i = 0; i < 90; i += 1) {
    drawn = blendCapFit(drawn, to, 1 - Math.exp(-33 / 520));
    const now = buildHeadCap(cloud.source, drawn);
    worst = Math.max(worst, worstGap(previous, now));
    previous = now;
  }
  assert.ok(worst < 2.5, `worst step ${worst.toFixed(2)} points`);
  assert.ok(worstGap(previous, buildHeadCap(cloud.source, to)) < 0.5, 'arrives');

  // And letting go is the same easing backwards: a run of refusals ends
  // on the standing allowance, which carries no shape at all — the
  // dome — and the cap walks back to it rather than dropping.
  let state = nextCapFit(CAP_FIT_START, to);
  for (let i = 0; i < CAP_FIT.hold; i += 1) state = nextCapFit(state, null);
  assert.deepEqual(state.wanted, CAP_FIT_DEFAULT);
  assert.equal(state.wanted.profile, undefined, 'the standing allowance is the dome');
  worst = 0;
  for (let i = 0; i < 90; i += 1) {
    drawn = blendCapFit(drawn, state.wanted, 1 - Math.exp(-33 / 520));
    const now = buildHeadCap(cloud.source, drawn);
    worst = Math.max(worst, worstGap(previous, now));
    previous = now;
  }
  assert.ok(worst < 2.5, `worst step letting go ${worst.toFixed(2)} points`);
  assert.equal(blendCapFit(CAP_FIT_DEFAULT, CAP_FIT_DEFAULT, 0.5).profile, undefined);
});
