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
  CAP_FRONT,
  CAP_LENGTH,
  CAP_MERIDIANS,
  CAP_POINTS,
  CAP_POLE,
  CAP_RINGS,
  CAP_ROW_T,
  CAP_SECTOR_OF,
  CAP_SITES,
  CAP_STRIDE,
  buildHeadCap,
  capIndex,
  type CapSource,
} from '@/features/hair-scan/head-cap';
import {
  CHIN_SECTORS,
  LEFT_SECTORS,
  RIGHT_SECTORS,
  RING_SECTORS,
} from '@/features/hair-scan/engine';
import {
  MESH_MID_COL,
  buildLattice,
  capIndex as latticeCapIndex,
  syntheticContours,
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
    ...src,
    yaw: 0,
    pitch: 0,
    roll: 0,
    hasContours: true,
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
  const pts = buildHeadCap(source());
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
