/**
 * The mesh must not swim, and it must not pop.
 *
 * Everything the hair scan draws over a face is built from the numbers
 * this module produces, at camera rate, from a detector that jitters and
 * occasionally blinks. So the properties are checked here, frame by
 * frame, on a machine with no camera: a still head yields a still
 * reading, a moving head is followed rather than trailed, a missed frame
 * is ridden out, and the lattice built from the result is always the
 * same shape, always finite, and always where the face is.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CAP_OFFSET,
  DEFAULT_TRACKER_OPTIONS,
  FEATURES,
  FEATURE_OFFSET,
  BEND,
  HAIRLINE_SITES,
  LATTICE_LENGTH,
  LATTICE_POINTS,
  MESH,
  MESH_MID_COL,
  adaptiveAlpha,
  bendAround,
  buildLattice,
  capIndex,
  createTracker,
  edgesAt,
  expireTracker,
  faceFrame,
  faceIndex,
  featureBit,
  featureOffset,
  follow,
  haloOf,
  SAMPLE_LOOP_MS,
  SYNTHETIC_MESH,
  ovalFromBounds,
  squash,
  stabilityOf,
  syntheticContours,
  syntheticFace,
  syntheticMesh,
  toEngineReading,
  trackFrame,
  type Contours,
  type Point,
  type RawFace,
  type TrackedFace,
} from '@/features/hair-scan/tracking';

/* ------------------------------ fixtures ------------------------------ */

const VIEW = { width: 390, height: 844 };

/** A front-on face sitting where the scan wants it. */
function face(overrides: Partial<RawFace> = {}, at = 0): RawFace {
  const cx = overrides.cx ?? 195;
  const cy = overrides.cy ?? 340;
  const width = overrides.width ?? 180;
  const height = overrides.height ?? 236;
  return {
    cx,
    cy,
    width,
    height,
    yaw: 0,
    pitch: 0,
    roll: 0,
    contours: syntheticContours(cx, cy, width, height, overrides.roll ?? 0),
    at,
    ...overrides,
  };
}

/** A deterministic wobble, so the jitter is the same on every run. */
function noise(seed: number, amplitude: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * amplitude;
}

/** The same face with every number nudged by up to `amplitude` points. */
function jittered(base: RawFace, seed: number, amplitude: number): RawFace {
  const contours: Contours = {};
  let k = seed * 1000;
  for (const [name, points] of Object.entries(base.contours ?? {})) {
    contours[name as keyof Contours] = points.map((p) => {
      k += 2;
      return { x: p.x + noise(k, amplitude), y: p.y + noise(k + 1, amplitude) };
    });
  }
  return {
    ...base,
    cx: base.cx + noise(seed, amplitude),
    cy: base.cy + noise(seed + 0.5, amplitude),
    width: base.width + noise(seed + 0.25, amplitude),
    height: base.height + noise(seed + 0.75, amplitude),
    yaw: base.yaw + noise(seed + 0.1, 1.2),
    contours,
  };
}

const FRAME_MS = 33;

function run(frames: (RawFace | null)[], options = {}) {
  let state = createTracker(options);
  const readings: (TrackedFace | null)[] = [];
  frames.forEach((raw, i) => {
    state = trackFrame(state, raw, i * FRAME_MS);
    readings.push(state.face);
  });
  return { state, readings };
}

function point(pts: number[], index: number): Point {
  return { x: pts[index * 2], y: pts[index * 2 + 1] };
}

/* ------------------------------ smoothing ----------------------------- */

test('follow: inside the dead band nothing moves; outside it the excess is followed', () => {
  assert.equal(follow(100, 101, 0.5, 2), 100);
  assert.equal(follow(100, 99, 0.5, 2), 100);
  // Ten over, band two: eight of excess, half taken.
  assert.equal(follow(100, 110, 0.5, 2), 104);
  assert.equal(follow(100, 90, 0.5, 2), 96);
});

test('follow: a reading that is not a number is ignored, and a first reading is taken whole', () => {
  assert.equal(follow(100, Number.NaN, 0.5, 2), 100);
  assert.equal(follow(Number.NaN, 42, 0.5, 2), 42);
});

test('adaptiveAlpha: heavy at rest, light in motion, never outside its bounds', () => {
  const o = DEFAULT_TRACKER_OPTIONS;
  assert.equal(adaptiveAlpha(0, o), o.alphaMin);
  assert.equal(adaptiveAlpha(o.adaptSpan, o), o.alphaMax);
  assert.equal(adaptiveAlpha(o.adaptSpan * 10, o), o.alphaMax);
  const mid = adaptiveAlpha(o.adaptSpan / 2, o);
  assert.ok(mid > o.alphaMin && mid < o.alphaMax);
});

test('a still head under detector jitter yields a reading that does not move', () => {
  const base = face();
  const frames = Array.from({ length: 40 }, (_, i) => jittered(base, i, 2));
  const { readings } = run(frames);
  const settled = readings.slice(10) as TrackedFace[];
  const first = settled[0];
  for (let k = 0; k < settled.length; k += 1) {
    const r = settled[k];
    // The raw input wobbled by ±2 every frame. The reading may creep by a
    // fraction of a pixel towards its equilibrium; it may never pop.
    assert.ok(Math.abs(r.cx - first.cx) < 1.2, `cx drifted ${r.cx - first.cx}`);
    assert.ok(Math.abs(r.cy - first.cy) < 1.2, `cy drifted ${r.cy - first.cy}`);
    const oval = r.contours.FACE!;
    const oval0 = first.contours.FACE!;
    const prev = k > 0 ? settled[k - 1].contours.FACE! : oval0;
    for (let i = 0; i < oval.length; i += 1) {
      assert.ok(Math.abs(oval[i].x - oval0[i].x) < 1.2, `point ${i} drifted in x`);
      assert.ok(Math.abs(oval[i].y - oval0[i].y) < 1.2, `point ${i} drifted in y`);
      assert.ok(Math.abs(oval[i].x - prev[i].x) < 0.5, `point ${i} popped in x`);
      assert.ok(Math.abs(oval[i].y - prev[i].y) < 0.5, `point ${i} popped in y`);
    }
  }
});

test('a head that moves is followed closely, not trailed', () => {
  const frames = Array.from({ length: 30 }, (_, i) => face({ cx: 100 + i * 6 }));
  const { readings } = run(frames);
  const last = readings[29]!;
  // Six points per frame is a real move: the filter should be within a
  // frame or two of it, never a slow catch-up.
  assert.ok(Math.abs(last.cx - frames[29].cx) < 14, `lag ${frames[29].cx - last.cx}`);
  // And it is monotonic — no overshoot, no hesitation.
  for (let i = 2; i < 30; i += 1) assert.ok(readings[i]!.cx >= readings[i - 1]!.cx);
});

test('a large jump converges within a few frames', () => {
  const frames = [face(), ...Array.from({ length: 8 }, () => face({ cx: 300 }))];
  const { readings } = run(frames);
  const last = readings[8]!;
  assert.ok(Math.abs(last.cx - 300) < 5, `still ${300 - last.cx} away`);
});

test('contours are smoothed point by point and follow a move', () => {
  const frames = [face(), ...Array.from({ length: 10 }, () => face({ cx: 260 }))];
  const { readings } = run(frames);
  const oval = readings[10]!.contours.FACE!;
  const target = frames[10].contours!.FACE!;
  for (let i = 0; i < oval.length; i += 1) {
    assert.ok(Math.abs(oval[i].x - target[i].x) < 5);
  }
});

test('a contour that changes its point count is taken fresh rather than mismatched', () => {
  const a = face();
  const b = face();
  b.contours = { ...b.contours, FACE: b.contours!.FACE!.slice(0, 20) };
  const { readings } = run([a, b]);
  assert.equal(readings[1]!.contours.FACE!.length, 20);
});

test('angles smooth on their own scale and survive NaN from the detector', () => {
  const frames = [face({ yaw: 0 }), face({ yaw: 30 }), face({ yaw: Number.NaN }), face({ yaw: 30 })];
  const { readings } = run(frames);
  assert.ok(readings[1]!.yaw > 0 && readings[1]!.yaw < 30);
  // NaN keeps the last value; it does not poison the stream.
  assert.ok(Number.isFinite(readings[2]!.yaw));
  assert.equal(readings[2]!.yaw, readings[1]!.yaw);
});

test('a face without contours is tracked from its box and says so', () => {
  const { readings } = run([{ ...face(), contours: undefined }]);
  assert.equal(readings[0]!.hasContours, false);
  assert.deepEqual(readings[0]!.contours, {});
});

/* ------------------------------ presence ------------------------------ */

test('a missed frame is ridden out on the last reading, marked held', () => {
  const { readings } = run([face(), face(), null, null]);
  assert.ok(readings[2] !== null);
  assert.equal(readings[2]!.held, true);
  assert.equal(readings[2]!.cx, readings[1]!.cx);
  assert.equal(readings[2]!.lastSeenAt, FRAME_MS);
});

test('the face is lost after the configured run of empty frames', () => {
  const n = DEFAULT_TRACKER_OPTIONS.lostAfterFrames;
  const frames: (RawFace | null)[] = [face(), face(), ...Array.from({ length: n }, () => null)];
  const { readings } = run(frames);
  assert.ok(readings[1 + n - 1] !== null, 'one short of the limit is still held');
  assert.equal(readings[1 + n], null, 'at the limit it is gone');
});

test('the face is lost by time as well, whatever the frame count', () => {
  let state = createTracker();
  state = trackFrame(state, face(), 0);
  state = trackFrame(state, null, DEFAULT_TRACKER_OPTIONS.lostAfterMs + 1);
  assert.equal(state.face, null);
});

test('expireTracker drops a face nobody has seen for too long, and leaves a fresh one alone', () => {
  let state = createTracker();
  state = trackFrame(state, face(), 0);
  assert.ok(expireTracker(state, 100).face !== null);
  assert.equal(expireTracker(state, DEFAULT_TRACKER_OPTIONS.lostAfterMs + 1).face, null);
  assert.equal(expireTracker(createTracker(), 5000).face, null);
});

test('a face returning from nothing is taken where it is, not flown across from the old spot', () => {
  const n = DEFAULT_TRACKER_OPTIONS.lostAfterFrames;
  const frames: (RawFace | null)[] = [
    face({ cx: 80 }),
    ...Array.from({ length: n }, () => null),
    face({ cx: 320 }),
  ];
  const { readings } = run(frames);
  const back = readings[readings.length - 1]!;
  assert.equal(back.cx, 320);
  assert.equal(back.held, false);
});

test('a held reading comes back to life without a snap when the face reappears nearby', () => {
  const { readings } = run([face(), face(), null, face({ cx: 197 })]);
  const back = readings[3]!;
  assert.equal(back.held, false);
  assert.ok(Math.abs(back.cx - 195) < 3);
});

test('empty frames while nothing is tracked leave the tracker untouched', () => {
  const state = createTracker();
  assert.equal(trackFrame(state, null, 0), state);
});

/* ----------------------------- stillness ------------------------------ */

test('stability is earned: zero on arrival, high once the head has sat still', () => {
  const base = face();
  const frames = Array.from({ length: 20 }, (_, i) => jittered(base, i, 1.5));
  const { readings } = run(frames);
  assert.equal(readings[0]!.stability, 0);
  assert.ok(readings[19]!.stability > 0.85, `stability ${readings[19]!.stability}`);
});

test('stability falls when the head moves, and a slow turn is not instability', () => {
  const moving = Array.from({ length: 20 }, (_, i) => face({ cx: 100 + i * 8 }));
  assert.ok(run(moving).readings[19]!.stability < 0.4);

  const turning = Array.from({ length: 20 }, (_, i) => face({ yaw: i * 2 }));
  const last = run(turning).readings[19]!;
  assert.ok(last.stability > 0.85, `a turn in place read as ${last.stability}`);
  assert.ok(last.yawRate > 30, `yawRate ${last.yawRate}`);
});

test('yawRate is signed and zero for a still head', () => {
  const left = Array.from({ length: 12 }, (_, i) => face({ yaw: -i * 3 }));
  assert.ok(run(left).readings[11]!.yawRate < 0);
  const still = Array.from({ length: 12 }, () => face());
  assert.equal(run(still).readings[11]!.yawRate, 0);
});

test('stabilityOf refuses to judge from too little', () => {
  const o = DEFAULT_TRACKER_OPTIONS;
  assert.equal(stabilityOf([], o), 0);
  assert.equal(
    stabilityOf(
      [
        { cx: 0, cy: 0, width: 100, yaw: 0, at: 0 },
        { cx: 0, cy: 0, width: 100, yaw: 0, at: 10 },
        { cx: 0, cy: 0, width: 100, yaw: 0, at: 20 },
      ],
      o,
    ),
    0,
    'a window shorter than half the judging window is not enough',
  );
});

/* --------------------------- the engine's view -------------------------- */

/** The guidance square the ring sits in, as the screen would lay it out. */
const FRAME = { x: 25, y: 170, width: 340, height: 340 };

test('toEngineReading: everything spatial is a fraction of the guidance frame, never a pixel', () => {
  const tracked = run([face(), face()]).readings[1]!;
  const reading = toEngineReading(tracked, FRAME);
  const expectedX = (tracked.cx - tracked.width / 2 - FRAME.x) / FRAME.width;
  const expectedY = (tracked.cy - tracked.height / 2 - FRAME.y) / FRAME.height;
  assert.ok(Math.abs(reading.bounds.x - expectedX) < 1e-9);
  assert.ok(Math.abs(reading.bounds.y - expectedY) < 1e-9);
  assert.ok(Math.abs(reading.bounds.width - tracked.width / FRAME.width) < 1e-9);
  assert.ok(Math.abs(reading.bounds.height - tracked.height / FRAME.height) < 1e-9);
  assert.equal(reading.yaw, tracked.yaw);
  assert.equal(reading.pitch, tracked.pitch);
  assert.equal(reading.roll, tracked.roll);
  assert.equal(reading.stability, tracked.stability);
  assert.ok(Math.abs(reading.size - tracked.width / FRAME.width) < 1e-9);
  // The fixture face sits on the frame's centre: the engine's centre test
  // (|cx - 0.5| within its tolerance) must see it there.
  const cx = reading.bounds.x + reading.bounds.width / 2;
  const cy = reading.bounds.y + reading.bounds.height / 2;
  assert.ok(Math.abs(cx - 0.5) < 0.05, `centre x ${cx} is not near 0.5`);
  assert.ok(Math.abs(cy - 0.5) < 0.05, `centre y ${cy} is not near 0.5`);
  // And its size lands inside the engine's window (0.3–0.68 of the frame).
  assert.ok(reading.size > 0.3 && reading.size < 0.68, `size ${reading.size}`);
});

test('toEngineReading: a face off to one side, or too close, reads as such', () => {
  const left = run([face({ cx: 60 }), face({ cx: 60 })]).readings[1]!;
  const l = toEngineReading(left, FRAME);
  assert.ok(l.bounds.x + l.bounds.width / 2 < 0.2);
  const near = run([face({ width: 300, height: 390 }), face({ width: 300, height: 390 })]).readings[1]!;
  assert.ok(toEngineReading(near, FRAME).size > 0.68);
});

test('toEngineReading: a frame with no size yet yields NaN everywhere spatial', () => {
  const tracked = run([face(), face()]).readings[1]!;
  const reading = toEngineReading(tracked, { x: 0, y: 0, width: 0, height: 0 });
  assert.ok(Number.isNaN(reading.size));
  assert.ok(Number.isNaN(reading.bounds.x));
  assert.ok(Number.isNaN(reading.bounds.width));
  // The angles are not spatial and survive.
  assert.equal(reading.yaw, tracked.yaw);
});

/* ------------------------------ lattice ------------------------------- */

const LATTICE_FACE: TrackedFace = run([face(), face()]).readings[1]!;

test('the lattice layout is fixed, and its regions do not overlap', () => {
  assert.equal(CAP_OFFSET, MESH.faceRows * MESH.cols);
  assert.equal(FEATURE_OFFSET, CAP_OFFSET + MESH.capRows * MESH.cols);
  const featureTotal = FEATURES.reduce((sum, [, count]) => sum + count, 0);
  assert.equal(LATTICE_POINTS, FEATURE_OFFSET + featureTotal);
  assert.equal(LATTICE_LENGTH, LATTICE_POINTS * 2);
  assert.equal(faceIndex(0, 0), 0);
  assert.equal(capIndex(0, 0), CAP_OFFSET);
  let expected = FEATURE_OFFSET;
  for (const [name, count] of FEATURES) {
    assert.equal(featureOffset(name), expected);
    expected += count;
  }
  const bits = FEATURES.map(([name]) => featureBit(name));
  assert.equal(new Set(bits).size, bits.length);
  assert.ok(MESH.cols % 2 === 1, 'an odd column count puts one column down the middle');
  assert.equal(MESH_MID_COL * 2 + 1, MESH.cols);
  // Dense enough to read as a mesh rather than a grid: the reference has
  // roughly twenty lines across a face.
  assert.ok(MESH.cols >= 15 && MESH.faceRows >= 12 && MESH.capRows >= 7);
});

test('buildLattice returns exactly LATTICE_LENGTH finite numbers, whatever it is given', () => {
  const cases: TrackedFace[] = [
    LATTICE_FACE,
    { ...LATTICE_FACE, contours: {}, hasContours: false },
    { ...LATTICE_FACE, contours: { FACE: LATTICE_FACE.contours.FACE } },
    { ...LATTICE_FACE, contours: { ...LATTICE_FACE.contours, FACE: [] } },
    { ...LATTICE_FACE, width: 0, height: 0, contours: {}, hasContours: false },
  ];
  for (const c of cases) {
    const { pts } = buildLattice(c);
    assert.equal(pts.length, LATTICE_LENGTH);
    for (const v of pts) assert.ok(Number.isFinite(v));
  }
});

test('the mask says which contours were real; a box-only face lights none', () => {
  const full = buildLattice(LATTICE_FACE).mask;
  for (const [name] of FEATURES) assert.ok(full & featureBit(name), `${name} should be lit`);
  const boxOnly = buildLattice({ ...LATTICE_FACE, contours: {}, hasContours: false }).mask;
  assert.equal(boxOnly, 0);
  const noEyes = buildLattice({
    ...LATTICE_FACE,
    contours: { ...LATTICE_FACE.contours, LEFT_EYE: undefined, RIGHT_EYE: undefined },
  }).mask;
  assert.equal(noEyes & featureBit('LEFT_EYE'), 0);
  assert.ok(noEyes & featureBit('FACE'));
});

test('face rows sit inside the oval, from the brow line down to the chin', () => {
  const { pts } = buildLattice(LATTICE_FACE);
  const oval = LATTICE_FACE.contours.FACE!;
  const top = Math.min(...oval.map((p) => p.y));
  const bottom = Math.max(...oval.map((p) => p.y));
  const left = Math.min(...oval.map((p) => p.x));
  const right = Math.max(...oval.map((p) => p.x));
  for (let row = 0; row < MESH.faceRows; row += 1) {
    for (let col = 0; col < MESH.cols; col += 1) {
      const p = point(pts, faceIndex(row, col));
      assert.ok(p.x >= left - 0.5 && p.x <= right + 0.5, `row ${row} col ${col} x ${p.x}`);
      assert.ok(p.y >= top - 0.5 && p.y <= bottom + 0.5, `row ${row} col ${col} y ${p.y}`);
    }
  }
  const brow = point(pts, faceIndex(0, MESH_MID_COL)).y;
  const chin = point(pts, faceIndex(MESH.faceRows - 1, MESH_MID_COL)).y;
  assert.ok(brow > top && brow < LATTICE_FACE.cy, 'the brow row is above the centre');
  assert.ok(chin > LATTICE_FACE.cy && chin <= bottom, 'the chin row is near the bottom');
  // Rows are ordered top to bottom and columns left to right.
  for (let row = 1; row < MESH.faceRows; row += 1) {
    assert.ok(point(pts, faceIndex(row, MESH_MID_COL)).y > point(pts, faceIndex(row - 1, MESH_MID_COL)).y);
  }
  for (let col = 1; col < MESH.cols; col += 1) {
    assert.ok(point(pts, faceIndex(3, col)).x > point(pts, faceIndex(3, col - 1)).x);
  }
});

/** Elliptical distance of a lattice point from a contour's extent, 1 on its edge. */
function haloDistance(p: Point, points: Point[]): number {
  const xs = points.map((q) => q.x);
  const ys = points.map((q) => q.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rx = (Math.max(...xs) - Math.min(...xs)) / 2;
  const ry = Math.max((Math.max(...ys) - Math.min(...ys)) / 2, rx * BEND.minAspect);
  return Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
}

test('the face grid flows round the eyes and the mouth rather than across them', () => {
  const { pts } = buildLattice(LATTICE_FACE);
  const eyes = [LATTICE_FACE.contours.LEFT_EYE!, LATTICE_FACE.contours.RIGHT_EYE!];
  const mouth = [...LATTICE_FACE.contours.UPPER_LIP_TOP!, ...LATTICE_FACE.contours.LOWER_LIP_BOTTOM!];
  let crossings = 0;
  for (let row = 0; row < MESH.faceRows; row += 1) {
    for (let col = 0; col < MESH.cols; col += 1) {
      const p = point(pts, faceIndex(row, col));
      for (const feature of [...eyes, mouth]) {
        if (haloDistance(p, feature) < 0.98) crossings += 1;
      }
    }
  }
  assert.equal(crossings, 0, `${crossings} grid points sit inside an eye or the mouth`);
  // The same lattice built without those contours does run straight across them.
  const plain = buildLattice({
    ...LATTICE_FACE,
    contours: { FACE: LATTICE_FACE.contours.FACE, LEFT_EYEBROW_TOP: LATTICE_FACE.contours.LEFT_EYEBROW_TOP },
  }).pts;
  let inside = 0;
  for (let row = 0; row < MESH.faceRows; row += 1) {
    for (let col = 0; col < MESH.cols; col += 1) {
      const p = point(plain, faceIndex(row, col));
      for (const feature of eyes) if (haloDistance(p, feature) < 0.98) inside += 1;
    }
  }
  assert.ok(inside > 0, 'without eye contours there is nothing to flow round');
  // Rows stay ordered left to right through the bend, on every row.
  for (let row = 0; row < MESH.faceRows; row += 1) {
    for (let col = 1; col < MESH.cols; col += 1) {
      assert.ok(
        point(pts, faceIndex(row, col)).x >= point(pts, faceIndex(row, col - 1)).x - 1e-6,
        `row ${row} col ${col} overtook its neighbour`,
      );
    }
  }
});

test('bendAround: inside lands on or past the edge, the reach is untouched, the mapping is continuous', () => {
  const halo = { cx: 0, cy: 0, rx: 10, ry: 5 };
  const dist = (p: Point) => Math.hypot(p.x / halo.rx, p.y / halo.ry);
  assert.ok(dist(bendAround({ x: 3, y: 1 }, halo)) >= 1 - 1e-9);
  assert.ok(dist(bendAround({ x: 9, y: 0 }, halo)) >= 1 - 1e-9);
  const untouched = bendAround({ x: 10 * BEND.reach, y: 0 }, halo);
  assert.ok(Math.abs(untouched.x - 10 * BEND.reach) < 1e-9 && Math.abs(untouched.y) < 1e-9);
  const far = bendAround({ x: 40, y: 20 }, halo);
  assert.deepEqual(far, { x: 40, y: 20 });
  // Just inside the reach moves by almost nothing: no kink at the boundary.
  const near = bendAround({ x: 10 * BEND.reach - 0.01, y: 0 }, halo);
  assert.ok(Math.abs(near.x - (10 * BEND.reach - 0.01)) < 0.05);
  // Direction is kept, so a point above the centre stays above it.
  assert.ok(bendAround({ x: 0, y: -1 }, halo).y < 0);
  // The centre itself has somewhere to go, and it is finite.
  const centre = bendAround({ x: 0, y: 0 }, halo);
  assert.ok(Number.isFinite(centre.x) && Number.isFinite(centre.y));
  assert.ok(centre.y > 0, 'a point on the centre is sent below the feature');
});

test('squash: identity inside the soft band, compressed past it, never over the edge, always ordered', () => {
  assert.equal(squash(10, 100), 10);
  assert.equal(squash(-80, 100), -80);
  assert.ok(squash(95, 100) > 86 && squash(95, 100) < 95);
  assert.ok(squash(400, 100) < 100 && squash(400, 100) > 99);
  assert.ok(squash(-400, 100) > -100);
  let prev = -Number.MAX_VALUE;
  for (let x = -150; x <= 150; x += 0.5) {
    const y = squash(x, 100);
    assert.ok(y > prev, `not strictly increasing at ${x}`);
    prev = y;
  }
  // Continuous where the squash begins.
  assert.ok(Math.abs(squash(86.001, 100) - 86.001) < 0.01);
});

test('haloOf: the padded extent of a contour, never thinner than the floor, null for nothing', () => {
  const ring = ovalFromBounds(50, 20, 40, 4);
  const halo = haloOf(ring, { x: 1, y: 1 })!;
  assert.ok(Math.abs(halo.cx - 50) < 1e-6 && Math.abs(halo.cy - 20) < 1e-6);
  assert.ok(Math.abs(halo.rx - 20) < 1e-6);
  assert.ok(Math.abs(halo.ry - 20 * BEND.minAspect) < 1e-6, 'a thin ring gets the floor');
  const padded = haloOf(ring, { x: 1.5, y: 1 })!;
  assert.ok(Math.abs(padded.rx - 30) < 1e-6);
  assert.equal(haloOf([], { x: 1, y: 1 }), null);
  assert.equal(haloOf([{ x: 1, y: 1 }], { x: 1, y: 1 }), null);
  assert.equal(haloOf([{ x: 1, y: 1 }, { x: 1, y: 5 }], { x: 1, y: 1 }), null, 'no width, no halo');
});

test('the brow row follows the eyebrows when they are seen', () => {
  const withBrows = buildLattice(LATTICE_FACE);
  const browY = Math.min(
    ...LATTICE_FACE.contours.LEFT_EYEBROW_TOP!.map((p) => p.y),
    ...LATTICE_FACE.contours.RIGHT_EYEBROW_TOP!.map((p) => p.y),
  );
  const row0 = point(withBrows.pts, faceIndex(0, MESH_MID_COL)).y;
  assert.ok(row0 < browY + 2, `brow row ${row0} sits below the eyebrows at ${browY}`);
  assert.ok(browY - row0 < 0.15 * LATTICE_FACE.height, 'and not far above them');
});

test('the hair cap rises above the oval from the brow line, sharing its first row with the face', () => {
  const { pts } = buildLattice(LATTICE_FACE);
  const oval = LATTICE_FACE.contours.FACE!;
  const top = Math.min(...oval.map((p) => p.y));
  for (let col = 0; col < MESH.cols; col += 1) {
    const a = point(pts, faceIndex(0, col));
    const b = point(pts, capIndex(0, col));
    assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, 'row 0 is shared');
  }
  const apex = point(pts, capIndex(MESH.capRows - 1, MESH_MID_COL));
  assert.ok(apex.y < top - 0.1 * LATTICE_FACE.height, `apex ${apex.y} should clear the oval top ${top}`);
  // Rows climb monotonically and narrow towards the apex.
  for (let row = 1; row < MESH.capRows; row += 1) {
    const here = point(pts, capIndex(row, MESH_MID_COL)).y;
    const below = point(pts, capIndex(row - 1, MESH_MID_COL)).y;
    assert.ok(here < below, `cap row ${row} is not above row ${row - 1}`);
    const width = point(pts, capIndex(row, MESH.cols - 1)).x - point(pts, capIndex(row, 0)).x;
    const widthBelow =
      point(pts, capIndex(row - 1, MESH.cols - 1)).x - point(pts, capIndex(row - 1, 0)).x;
    assert.ok(width < widthBelow);
  }
  // The dome is wider than the oval where they cross: it is a head, not a forehead.
  const crossing = point(pts, capIndex(2, 0));
  assert.ok(crossing.y < top + 0.1 * LATTICE_FACE.height);
  assert.ok(crossing.x < LATTICE_FACE.cx - 0.25 * LATTICE_FACE.width);
});

test('the hairline sites are cap points, mostly on the band just above the brow', () => {
  assert.ok(HAIRLINE_SITES.length >= 12);
  for (const site of HAIRLINE_SITES) {
    assert.ok(site >= CAP_OFFSET && site < FEATURE_OFFSET, `site ${site} is not in the cap`);
  }
  assert.equal(new Set(HAIRLINE_SITES).size, HAIRLINE_SITES.length);
  assert.ok(HAIRLINE_SITES.includes(capIndex(1, MESH_MID_COL)));
  assert.ok(!HAIRLINE_SITES.includes(capIndex(MESH.capRows - 1, MESH_MID_COL)), 'the apex is not a site');
});

test('a tilted face tilts its lattice with it', () => {
  const tilted = run([face({ roll: 20 }), face({ roll: 20 })]).readings[1]!;
  const { pts } = buildLattice(tilted);
  const a = point(pts, faceIndex(3, 0));
  const b = point(pts, faceIndex(3, MESH.cols - 1));
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  assert.ok(Math.abs(angle - 20) < 3, `row runs at ${angle}°, expected about 20°`);
  // The cap apex is above the brow along the face's own axis, not the screen's.
  const apex = point(pts, capIndex(MESH.capRows - 1, MESH_MID_COL));
  const brow = point(pts, capIndex(0, MESH_MID_COL));
  const up = (Math.atan2(apex.y - brow.y, apex.x - brow.x) * 180) / Math.PI;
  assert.ok(Math.abs(up - (-90 + 20)) < 3, `apex sits at ${up}°`);
});

test('faceFrame: eyes set the axes; without eyes the oval does; a round blob stays upright', () => {
  const upright = faceFrame(ovalFromBounds(0, 0, 100, 130), {});
  assert.ok(Math.abs(upright.rx - 1) < 1e-6 && Math.abs(upright.ry) < 1e-6);

  const c = syntheticContours(0, 0, 100, 130, 30);
  const byEyes = faceFrame(c.FACE!, c);
  assert.ok(Math.abs(Math.atan2(byEyes.ry, byEyes.rx) - Math.PI / 6) < 0.02);
  const byOval = faceFrame(c.FACE!, {});
  assert.ok(Math.abs(Math.atan2(byOval.ry, byOval.rx) - Math.PI / 6) < 0.05);

  const round = faceFrame(ovalFromBounds(0, 0, 100, 100), {});
  assert.ok(Math.abs(round.rx - 1) < 1e-6);
});

test('edgesAt: the polygon where it can, the ellipse where it cannot', () => {
  const oval = ovalFromBounds(0, 0, 100, 130);
  const fallback = { cx: 0, cy: 0, a: 50, b: 65 };
  const mid = edgesAt(oval, 0, fallback);
  assert.ok(Math.abs(mid.left + 50) < 1 && Math.abs(mid.right - 50) < 1);
  const above = edgesAt(oval, -200, fallback);
  assert.ok(Number.isFinite(above.left) && Number.isFinite(above.right));
  assert.ok(above.right >= above.left);
});

test('a box-only face still gets a full lattice built on a synthesised oval', () => {
  const boxOnly = run([{ ...face(), contours: undefined }]).readings[0]!;
  const { pts, mask } = buildLattice(boxOnly);
  assert.equal(mask, 0);
  const base = featureOffset('FACE');
  const oval = Array.from({ length: 36 }, (_, i) => point(pts, base + i));
  const top = Math.min(...oval.map((p) => p.y));
  const bottom = Math.max(...oval.map((p) => p.y));
  assert.ok(Math.abs(top - (boxOnly.cy - boxOnly.height / 2)) < 1);
  assert.ok(Math.abs(bottom - (boxOnly.cy + boxOnly.height / 2)) < 1);
  // Face rows lie within the box.
  for (let row = 0; row < MESH.faceRows; row += 1) {
    const p = point(pts, faceIndex(row, 0));
    assert.ok(p.x >= boxOnly.cx - boxOnly.width / 2 - 0.5);
  }
});

test('the lattice of a jittering still head does not move either', () => {
  const base = face();
  const frames = Array.from({ length: 30 }, (_, i) => jittered(base, i, 2));
  const { readings } = run(frames);
  const a = buildLattice(readings[15]!).pts;
  const b = buildLattice(readings[29]!).pts;
  let worst = 0;
  for (let i = 0; i < a.length; i += 1) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  assert.ok(worst < 1.5, `a lattice point moved ${worst} under jitter`);
});

/* -------------------------- the drawn stand-in ------------------------ */

test('syntheticContours carries every contour the lattice draws, at the counts ML Kit uses', () => {
  const c = syntheticContours(195, 340, 180, 236);
  for (const [name, count] of FEATURES) {
    assert.equal(c[name]?.length, count, name);
  }
});

test('syntheticFace stamps the clock it is given, not its phase', () => {
  const stamped = syntheticFace(VIEW, 250, 1_700_000_000_000);
  assert.equal(stamped.at, 1_700_000_000_000);
  // The phase still drives the pose: the same phase on a different clock is the same face.
  const later = syntheticFace(VIEW, 250, 1_700_000_005_000);
  assert.equal(later.cx, stamped.cx);
  assert.equal(later.yaw, stamped.yaw);
  // Without a clock the phase stands in, which is what the tests use.
  assert.equal(syntheticFace(VIEW, 250).at, 250);
});

test('a synthetic face on the wall clock survives the expiry tick the screen runs', () => {
  // The simulator emits a face every 40 ms and the screen expires the
  // tracker on a ~250 ms tick against Date.now(). Two clocks for one
  // field would drop the face every tick; one clock keeps it.
  const start = 1_700_000_000_000;
  let state = createTracker();
  for (let elapsed = 0; elapsed <= 2000; elapsed += 40) {
    const now = start + elapsed;
    state = trackFrame(state, syntheticFace(VIEW, elapsed, now), now);
    if (elapsed % 240 === 0) state = expireTracker(state, now + 10);
    assert.ok(state.face !== null, `lost at ${elapsed} ms`);
  }
  assert.ok(state.face!.stability > 0.5, 'never re-acquired from nothing: stability accrues');
});

test('syntheticFace is deterministic, inside the view, and sways rather than jumps', () => {
  const a = syntheticFace(VIEW, 1000);
  const b = syntheticFace(VIEW, 1000);
  assert.deepEqual(a, b);
  assert.ok(a.cx > 0 && a.cx < VIEW.width && a.cy > 0 && a.cy < VIEW.height);
  const c = syntheticFace(VIEW, 1033);
  assert.ok(Math.abs(c.cx - a.cx) < 2);
  assert.ok(Math.abs(c.yaw - a.yaw) < 1);
  // And it tracks cleanly: no lost frames, a lattice every time.
  let state = createTracker();
  for (let t = 0; t < 3000; t += 33) {
    state = trackFrame(state, syntheticFace(VIEW, t), t);
    assert.ok(state.face !== null);
    const { pts } = buildLattice(state.face);
    for (const v of pts) assert.ok(Number.isFinite(v));
  }
});

/* ------------------------------ two sources --------------------------- */

/** A mesh of `n` points on a line, at the fractions given. */
function mesh(n: number, shift = 0): { points: number[]; facing: number[] } {
  const points: number[] = [];
  const facing: number[] = [];
  for (let i = 0; i < n; i += 1) {
    points.push(0.3 + i / (n * 10) + shift, 0.4 + i / (n * 20) + shift);
    facing.push(1 - i / n);
  }
  return { points, facing };
}

test('source: absent is read as ML Kit, and the reading says which detector it came from', () => {
  const plain = run([face(), face()]).readings[1];
  assert.equal(plain?.source, 'mlkit', 'the cautious default: the jittery one');
  assert.equal(plain?.hasMesh, false);
  assert.equal(plain?.mesh, undefined);
  const sample = trackFrame(createTracker(), syntheticFace(VIEW, 0), 0).face;
  assert.equal(sample?.source, 'sample');
  const arkit = trackFrame(createTracker(), { ...face(), source: 'arkit', mesh: mesh(40) }, 0).face;
  assert.equal(arkit?.source, 'arkit');
  assert.equal(arkit?.hasMesh, true);
});

test('source: ARKit is passed through, ML Kit is smoothed hard', () => {
  // The same movement, told by each detector. ARKit's anchor does not
  // jitter, so filtering it is pure lag; ML Kit's does, so it is held.
  const step = (source: 'arkit' | 'mlkit') => {
    const first = trackFrame(createTracker(), { ...face(), source }, 0);
    const moved = { ...face({ cx: 199, yaw: 6 }), source };
    return trackFrame(first, moved, FRAME_MS).face!;
  };
  const arkit = step('arkit');
  const mlkit = step('mlkit');
  assert.ok(arkit.cx > mlkit.cx + 2, `arkit ${arkit.cx} vs mlkit ${mlkit.cx}`);
  assert.ok(arkit.yaw > mlkit.yaw + 3, `arkit ${arkit.yaw}° vs mlkit ${mlkit.yaw}°`);
  assert.ok(arkit.cx > 198 && arkit.yaw > 5, 'near enough to a pass-through');
  // And a movement smaller than the dead band, which ML Kit refuses to
  // follow at all, still reaches the drawing on ARKit.
  const held = trackFrame(trackFrame(createTracker(), { ...face(), source: 'mlkit' }, 0), { ...face({ cx: 196 }), source: 'mlkit' }, FRAME_MS).face!;
  assert.equal(held.cx, 195, 'ML Kit holds a pixel of jitter');
  const followed = trackFrame(trackFrame(createTracker(), { ...face(), source: 'arkit' }, 0), { ...face({ cx: 196 }), source: 'arkit' }, FRAME_MS).face!;
  assert.ok(followed.cx > 195.5, 'ARKit follows it');
});

test('mesh: the same vertex order is smoothed point by point, and a new one is taken whole', () => {
  let state = trackFrame(createTracker(), { ...face(), source: 'mlkit', mesh: mesh(40) }, 0);
  const first = state.face!;
  assert.equal(first.mesh?.points.length, 80);
  assert.equal(first.mesh?.facing.length, 40);
  assert.deepEqual([...first.mesh!.points], mesh(40).points, 'the first is taken where it is');

  state = trackFrame(state, { ...face(), source: 'mlkit', mesh: mesh(40, 0.1) }, FRAME_MS);
  const moved = state.face!;
  for (let i = 0; i < moved.mesh!.points.length; i += 1) {
    const from = mesh(40).points[i];
    const to = mesh(40, 0.1).points[i];
    const at = moved.mesh!.points[i];
    assert.ok(at > from && at < to, `point ${i} was not eased from ${from} to ${to}`);
  }

  // A different vertex count is a different mesh: there is nothing to smooth against.
  state = trackFrame(state, { ...face(), source: 'mlkit', mesh: mesh(12) }, FRAME_MS * 2);
  assert.deepEqual([...state.face!.mesh!.points], mesh(12).points);

  // A source that stops sending one loses it, rather than keeping a stale head.
  state = trackFrame(state, { ...face(), source: 'mlkit' }, FRAME_MS * 3);
  assert.equal(state.face!.hasMesh, false);
  assert.equal(state.face!.mesh, undefined);
});

test('mesh: ARKit’s mesh is followed almost exactly, so it does not slide over the head', () => {
  let state = trackFrame(createTracker(), { ...face(), source: 'arkit', mesh: mesh(40) }, 0);
  state = trackFrame(state, { ...face(), source: 'arkit', mesh: mesh(40, 0.1) }, FRAME_MS);
  const at = state.face!.mesh!.points[0];
  const to = mesh(40, 0.1).points[0];
  assert.ok(Math.abs(at - to) < 0.011, `${at} lags ${to}`);
});

test('syntheticMesh draws a whole head that turns, with the far side facing away', () => {
  const { rows, cols } = SYNTHETIC_MESH;
  const front = syntheticMesh(VIEW, 195, 340, 180, 236, 0, 0, 0);
  assert.equal(front.points.length, rows * cols * 2);
  assert.equal(front.facing.length, rows * cols);
  for (const v of [...front.points, ...front.facing]) assert.ok(Number.isFinite(v));
  assert.ok(front.facing.some((f) => f > 0.8), 'some of it faces the camera');
  assert.ok(front.facing.some((f) => f < -0.8), 'and some of it is round the back');

  // It is a head, not a face: it reaches above the face box's own top.
  const ys = front.points.filter((_, i) => i % 2 === 1);
  assert.ok(Math.min(...ys) * VIEW.height < 340 - 236 / 2, 'the cranium stands above the face');

  // Turned, the same vertex is somewhere else, and the count never changes.
  const turned = syntheticMesh(VIEW, 195, 340, 180, 236, 30, 0, 0);
  assert.equal(turned.points.length, front.points.length);
  // A vertex off the pole, where a turn actually moves something.
  const k = (Math.floor(rows / 2) * cols + 3) * 2;
  assert.ok(Math.abs(turned.points[k] - front.points[k]) > 1e-3, 'the mesh turned with the head');
});

test('the drawn stand-in rehearses the whole choreography, so a simulator run reaches every region', () => {
  let seenLeft = false;
  let seenRight = false;
  let seenCrown = false;
  for (let t = 0; t <= SAMPLE_LOOP_MS; t += 100) {
    const raw = syntheticFace(VIEW, t);
    assert.ok(raw.mesh && raw.mesh.points.length > 0, 'the stand-in carries a mesh');
    if (raw.yaw <= -18) seenLeft = true;
    if (raw.yaw >= 18) seenRight = true;
    if (raw.pitch <= -15) seenCrown = true;
  }
  assert.ok(seenLeft && seenRight, 'it turns both ways');
  assert.ok(seenCrown, 'and lowers its head');
});
