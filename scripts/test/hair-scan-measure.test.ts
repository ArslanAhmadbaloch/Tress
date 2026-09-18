/**
 * The measurement engine, attacked at the places where a wrong answer
 * would still look right.
 *
 * Four of those places matter more than the rest:
 *
 *   • The face frame. If it drifts with distance or pose, then a region
 *     named "hairline" is a different piece of forehead every month, and
 *     every comparison built on it is arithmetic on two different
 *     things. Two suites cover it. The first projects a synthetic head
 *     with the same separable model the frame inverts and demands the
 *     coordinates back exactly — which proves invertibility and NOTHING
 *     MORE, because a wrong constant shared by both sides would survive
 *     it. The second projects a three-dimensional head through a pinhole
 *     camera the frame knows nothing about, and holds the drift to a
 *     stated bound. That second one is the claim worth making.
 *
 *   • The head. A rectangle in a flat frame does not stop at the edge of
 *     a skull, and a hair mask calls the wall behind a person "not
 *     hair". So the masks here are painted with a real silhouette and a
 *     real background, and the counting is asked to leave the room out
 *     of the measurement.
 *
 *   • The counting. A synthetic mask with a known hair fraction must
 *     read as that fraction. Half a region of hair reads 0.5, or the
 *     number means nothing.
 *
 *   • The refusals. A region mostly out of frame, facing away, or seen
 *     once, has to yield NOTHING rather than a small number. A small
 *     number is the dangerous outcome: it looks like a reading.
 *
 * Nothing here asserts anything about a person. It asserts arithmetic.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { MaskImage } from '@/features/assessment/hair-mask';
import { CAP, HEAD_LINES } from '@/features/hair-scan/head-cap';
import { MIN_CONFIDENCE, MIN_FRAMES, compareScans } from '@/features/hair-scan/measure/compare';
import {
  EDGE_FACING,
  MIN_VISIBILITY,
  SCALP,
  measureScan,
  readFrame,
  readRegion,
  type ScanFrameInput,
} from '@/features/hair-scan/measure/coverage';
import {
  ENOUGH_FRAMES,
  SINGLE_FRAME_SPREAD,
  SPREAD_FLOOR,
  UNREPEATED_CONFIDENCE,
  WIDE_SPREAD,
  confidenceOf,
  measureRegion,
  meanOf,
  spreadOf,
} from '@/features/hair-scan/measure/noise';
import {
  BROW_ABOVE_EYES,
  CHIN_DEPTH,
  HEAD,
  HEAD_HEIGHT,
  HEAD_SHAPE,
  OUTER_CANTHAL_SHARE,
  REGION_ANCHORING,
  SCAN_REGIONS,
  anchorGradeOf,
  faceFrameOf,
  headHitAt,
  regionBox,
  regionFacing,
  regionSamples,
  sampleFacing,
  toFace,
  toImage,
  type FaceFrame,
  type FaceObservation,
  type FacePoint,
  type HeadPoint,
  type Point,
  type ScanRegion,
} from '@/features/hair-scan/measure/regions';

/* ------------------------------ synthetic head ---------------------------- */

const RAD = Math.PI / 180;

/**
 * The chin, derived here rather than read off `HEAD`, so that a head
 * typed into `HEAD` by hand instead of derived from the proportions
 * fails these tests instead of quietly agreeing with them.
 */
const CHIN = HEAD_LINES.brow * HEAD_HEIGHT;

type Pose = {
  yaw: number;
  pitch: number;
  roll: number;
  /** Plate units per face unit, before foreshortening: how big the head is in the picture. */
  scale: number;
  /** Where the brow centre sits, in fractions of the image. */
  cx: number;
  cy: number;
  /** The image's own shape. */
  image: { width: number; height: number };
};

const POSE: Pose = {
  yaw: 0,
  pitch: 0,
  roll: 0,
  scale: 0.25,
  cx: 0.5,
  cy: 0.55,
  image: { width: 1000, height: 1000 },
};

const pose = (over: Partial<Pose> = {}): Pose => ({ ...POSE, ...over });

/**
 * Where a point of the head lands in the picture.
 *
 * The same separable model the frame inverts: the horizontal span
 * shortens by the cosine of the yaw, the vertical by the cosine of the
 * pitch, and the whole thing turns by the roll. Orthographic, and flat —
 * every point is on the face plane. What it can prove is that the frame
 * inverts its own model; the pinhole suite below is what tests the model.
 */
function project(p: FacePoint, at: Pose): Point {
  const aspect = at.image.width / at.image.height;
  const r = at.roll * RAD;
  const ex = { x: Math.cos(r), y: -Math.sin(r) };
  const ey = { x: -ex.y, y: ex.x };
  const dx = p.u * at.scale * Math.cos(at.yaw * RAD);
  const dy = p.v * at.scale * Math.cos(at.pitch * RAD);
  const plateX = at.cx * aspect + ex.x * dx + ey.x * dy;
  const plateY = at.cy + ex.y * dx + ey.y * dy;
  return { x: plateX / aspect, y: plateY };
}

/** The observation a tracker would report for the head at this pose. */
function observation(at: Pose, over: Partial<FaceObservation> = {}): FaceObservation {
  const eyes = {
    left: project({ u: -OUTER_CANTHAL_SHARE, v: BROW_ABOVE_EYES }, at),
    right: project({ u: OUTER_CANTHAL_SHARE, v: BROW_ABOVE_EYES }, at),
  };
  // A box from the brow to the chin and a face wide, as a detector's is.
  const topLeft = project({ u: -1, v: 0 }, at);
  const bottomRight = project({ u: 1, v: CHIN }, at);
  return {
    bounds: {
      x: Math.min(topLeft.x, bottomRight.x),
      y: Math.min(topLeft.y, bottomRight.y),
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y),
    },
    image: at.image,
    yaw: at.yaw,
    pitch: at.pitch,
    roll: at.roll,
    eyes,
    brow: project({ u: -0.3, v: 0 }, at),
    /*
      The chin, where a photograph of a head puts it: its own depth
      swung into view by the tilt, exactly as `CHIN_DEPTH` describes. A
      chin painted flat here would hide the bias that term exists to
      remove, and the two anchoring paths would agree for the wrong
      reason.
    */
    chin: project(
      { u: 0, v: CHIN - CHIN_DEPTH * Math.cos(at.yaw * RAD) * Math.tan(at.pitch * RAD) },
      at,
    ),
    ...over,
  };
}

function frameAt(at: Pose): FaceFrame {
  const frame = faceFrameOf(observation(at));
  assert.ok(frame, 'the synthetic observation must produce a frame');
  return frame;
}

/** A mask painted by a rule expressed in the head's own coordinates. */
function paint(frame: FaceFrame, side: number, value: (p: FacePoint) => number): MaskImage {
  const data = new Float32Array(side * side);
  for (let row = 0; row < side; row += 1) {
    for (let col = 0; col < side; col += 1) {
      const p = toFace(frame, { x: (col + 0.5) / side, y: (row + 0.5) / side });
      data[row * side + col] = value(p);
    }
  }
  return { width: side, height: side, data };
}

/**
 * A mask of a head against a room: hair everywhere the head is, nothing
 * anywhere it is not.
 *
 * This is the shape of the photograph that matters. A mask painted over
 * the whole picture cannot tell a region bounded by the skull from one
 * that spills off it, which is exactly how a crown reading of a wall
 * would go unnoticed.
 */
function paintHead(frame: FaceFrame, at: Pose, side = 512): MaskImage {
  return paint(frame, side, (p) => (sampleFacing({ yaw: at.yaw, pitch: at.pitch }, p) > 0 ? 1 : 0));
}

const MASK_SIDE = 512;

/**
 * The poses the capture actually asks for: `IDEAL_POSE` in
 * `src/features/hair-scan/result.ts`, where the front is level, the
 * temples are a 35° turn either way and the top is a 28° chin-down.
 * Repeated rather than imported so that this lane's arithmetic does not
 * import another lane's screen.
 */
const BEATS = {
  front: { yaw: 0, pitch: 0 },
  turnLeft: { yaw: 35, pitch: 0 },
  turnRight: { yaw: -35, pitch: 0 },
  top: { yaw: 0, pitch: -28 },
};

/** How far the head may wander from a beat and still be that beat, in degrees. */
const POSE_NOISE = 5;

/* -------------------------------- the frame ------------------------------- */

test('frame: a point of the head comes back as the same face coordinate it went in as', () => {
  // Invertibility only. The projector here shares the frame's own model,
  // so this cannot catch a wrong constant — the pinhole suite below is
  // the one that tests the model against something else.
  const probes: FacePoint[] = [
    { u: 0, v: 0 },
    { u: 0.75, v: -0.8 },
    { u: -1.15, v: -0.35 },
    { u: 0, v: HEAD.crown },
  ];
  for (const at of [pose(), pose({ yaw: 35 }), pose({ yaw: -35 }), pose({ pitch: -30 })]) {
    const frame = frameAt(at);
    for (const p of probes) {
      const back = toFace(frame, project(p, at));
      assert.ok(Math.abs(back.u - p.u) < 1e-9, `u drifted at yaw ${at.yaw} pitch ${at.pitch}`);
      assert.ok(Math.abs(back.v - p.v) < 1e-9, `v drifted at yaw ${at.yaw} pitch ${at.pitch}`);
    }
  }
});

test('frame: the same head at two distances gives the same face coordinates', () => {
  // A head filling the picture and the same head half the size must put
  // the hairline in the same place, or a scan taken at arm's length
  // cannot be compared with one taken closer.
  const near = pose({ scale: 0.32 });
  const far = pose({ scale: 0.14, cx: 0.42, cy: 0.4 });
  const probe: FacePoint = { u: 0.6, v: -0.9 };
  const a = toFace(frameAt(near), project(probe, near));
  const b = toFace(frameAt(far), project(probe, far));
  assert.ok(Math.abs(a.u - b.u) < 1e-9 && Math.abs(a.v - b.v) < 1e-9);
  assert.ok(Math.abs(a.u - probe.u) < 1e-9 && Math.abs(a.v - probe.v) < 1e-9);
});

test('frame: a turned or lowered head still puts a region where the region is', () => {
  const box = regionBox('hairline');
  const corners: FacePoint[] = [
    { u: box.u0, v: box.v0 },
    { u: box.u1, v: box.v0 },
    { u: box.u0, v: box.v1 },
    { u: box.u1, v: box.v1 },
  ];
  for (const at of [pose({ yaw: 35 }), pose({ yaw: -35 }), pose({ pitch: -30 }), pose({ roll: 12 })]) {
    const frame = frameAt(at);
    for (const corner of corners) {
      const back = toFace(frame, project(corner, at));
      assert.ok(Math.abs(back.u - corner.u) < 1e-9, `u at yaw ${at.yaw} roll ${at.roll}`);
      assert.ok(Math.abs(back.v - corner.v) < 1e-9, `v at yaw ${at.yaw} roll ${at.roll}`);
    }
  }
});

test('frame: a rolled head on a non-square picture is not sheared', () => {
  // Fractions of a 3:4 photograph are not square, so a rotation done in
  // fraction space is not a rotation on the head. Twelve degrees of roll
  // would drag every region a few degrees off if the aspect were ignored.
  const at = pose({ roll: 12, image: { width: 1080, height: 1440 } });
  const frame = frameAt(at);
  const back = toFace(frame, project({ u: 1, v: -0.6 }, at));
  assert.ok(Math.abs(back.u - 1) < 1e-9);
  assert.ok(Math.abs(back.v + 0.6) < 1e-9);
});

test('frame: toImage and toFace are inverses', () => {
  const frame = frameAt(pose({ yaw: 20, pitch: -12, roll: -8 }));
  for (const p of [{ u: 0.4, v: -0.7 }, { u: -1.1, v: 0.3 }, { u: 0, v: -1.8 }]) {
    const back = toFace(frame, toImage(frame, p));
    assert.ok(Math.abs(back.u - p.u) < 1e-9 && Math.abs(back.v - p.v) < 1e-9);
  }
});

test('frame: it says which landmarks it was built from, and grades them', () => {
  const full = faceFrameOf(observation(pose()));
  assert.deepEqual(full?.anchoredBy, { scale: 'eyes', origin: 'brow', vertical: 'chin' });
  assert.equal(full && anchorGradeOf(full.anchoredBy), 'landmarks');

  const boxOnly = faceFrameOf(observation(pose(), { eyes: null, brow: null, chin: null }));
  assert.deepEqual(boxOnly?.anchoredBy, { scale: 'box', origin: 'box', vertical: 'proportion' });
  assert.equal(boxOnly && anchorGradeOf(boxOnly.anchoredBy), 'box');

  const eyesOnly = faceFrameOf(observation(pose(), { brow: null, chin: null }));
  assert.deepEqual(eyesOnly?.anchoredBy, { scale: 'eyes', origin: 'eyes', vertical: 'proportion' });
  assert.equal(eyesOnly && anchorGradeOf(eyesOnly.anchoredBy), 'partial');
});

test('frame: eye corners alone put the brow within a tenth of a face unit of the real one', () => {
  // The fallback is a proportion, not a measurement, so it is allowed to
  // be off — but not by enough to slide the hairline band onto the brow.
  const at = pose();
  const measured = frameAt(at);
  const derived = faceFrameOf(observation(at, { brow: null, chin: null }));
  assert.ok(derived);
  const drift = toFace(measured, toImage(derived, { u: 0, v: 0 }));
  assert.ok(Math.abs(drift.v) < 0.1, `brow drifted ${drift.v} face units`);
});

test('frame: nothing to anchor to yields no frame at all', () => {
  const at = pose();
  assert.equal(faceFrameOf({ ...observation(at), bounds: { x: 0, y: 0, width: 0, height: 0 } }), null);
  assert.equal(faceFrameOf({ ...observation(at), image: { width: 0, height: 0 } }), null);
});

/* --------------------------- the head's proportions ----------------------- */

test('head: every line is the head-cap proportions times the head height, not a typed-in number', () => {
  // The defect this catches is specific and it was real: a chin of 1.4
  // where the proportions say 1.56. Three of the four figures came from
  // one span and the fourth from another, so a frame that caught a chin
  // and a frame that did not placed the same region a tenth of a face
  // apart — and both happen inside one scan.
  assert.ok(Math.abs(HEAD.chin - HEAD_LINES.brow * HEAD_HEIGHT) < 1e-12);
  assert.ok(Math.abs(HEAD.ear - (HEAD_LINES.brow - HEAD_LINES.ear) * HEAD_HEIGHT) < 1e-12);
  assert.ok(Math.abs(HEAD.crown + (HEAD_LINES.crown - HEAD_LINES.brow) * HEAD_HEIGHT) < 1e-12);
  assert.equal(HEAD.brow, 0);
});

test('head: the hairline is half the brow-to-chin span, as the canon of thirds says', () => {
  // Hairline to brow, brow to nose, nose to chin: three equal parts. So
  // brow-to-hairline is half of brow-to-chin. It is a second, independent
  // route to the same span, and it only agrees with `HEAD.chin` at 1.56.
  assert.ok(Math.abs(HEAD.hairline + HEAD.chin / 2) < 1e-12);
  assert.ok(HEAD.crown < HEAD.hairline && HEAD.hairline < HEAD.brow);
});

test('head: a frame that caught a chin and one that did not place a region alike', () => {
  // The two anchoring paths in `faceFrameOf`. They can only agree if the
  // chin span the measured path divides by is the same span the
  // proportion path assumes; with the old 1.4 they were eleven per cent
  // apart, and the chin leaves the shot exactly when the head goes down
  // for the crown.
  for (const at of [pose(), pose({ yaw: 25 }), pose({ pitch: -30 })]) {
    const measured = frameAt(at);
    const withoutChin = faceFrameOf(observation(at, { chin: null }));
    assert.ok(withoutChin);
    assert.ok(
      Math.abs(measured.unitY - withoutChin.unitY) < 1e-9,
      `unitY differs by ${measured.unitY - withoutChin.unitY} at pitch ${at.pitch}`,
    );
    const probe: FacePoint = { u: 0.3, v: -1.2 };
    const a = toImage(measured, probe);
    const b = toImage(withoutChin, probe);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-9, 'the same region must land in the same place');
  }
});

test('head: the ellipsoid is hung on the same lines, and passes through the brow', () => {
  assert.equal(HEAD_SHAPE.halfWidth, CAP.widen);
  assert.ok(Math.abs(HEAD_SHAPE.halfHeight - (HEAD.ear - HEAD.crown)) < 1e-12);
  assert.ok(Math.abs(HEAD_SHAPE.halfDepth - CAP.depth * CAP.widen) < 1e-12);
  // The brow is the frame's origin and the front of the head at once.
  const onSurface =
    (0 / HEAD_SHAPE.halfWidth) ** 2 +
    ((0 - HEAD_SHAPE.centreV) / HEAD_SHAPE.halfHeight) ** 2 +
    ((0 - HEAD_SHAPE.centreW) / HEAD_SHAPE.halfDepth) ** 2;
  assert.ok(Math.abs(onSurface - 1) < 1e-12, `the brow is ${onSurface} of the way to the surface`);
});

/* ------------------- the frame under a projection it does not share ------- */

/**
 * A pinhole camera and a head with depth: nothing the frame assumes.
 *
 * `project` above is orthographic, flat and separable — the same model
 * `faceFrameOf` inverts, which is why it can be held to a billionth.
 * This one puts the landmarks at their real depths, rotates them with a
 * proper rotation matrix and divides by the distance to the lens, which
 * is what a camera does. The frame has no term for any of that, so what
 * comes out is the frame's actual error, and the assertions below are
 * the size of it.
 */
function rotate(p: HeadPoint, yaw: number, pitch: number): HeadPoint {
  const psi = yaw * RAD;
  const th = pitch * RAD;
  const u1 = p.u * Math.cos(psi) + p.w * Math.sin(psi);
  const w1 = -p.u * Math.sin(psi) + p.w * Math.cos(psi);
  const v2 = p.v * Math.cos(th) - w1 * Math.sin(th);
  const w2 = p.v * Math.sin(th) + w1 * Math.cos(th);
  return { u: u1, v: v2, w: w2 };
}

type Lens = { yaw: number; pitch: number; distance: number; focal: number; cx: number; cy: number };

const LENS: Lens = { yaw: 0, pitch: 0, distance: 9, focal: 2.2, cx: 0.5, cy: 0.5 };
const lens = (over: Partial<Lens> = {}): Lens => ({ ...LENS, ...over });

/** A head point, photographed. Image fractions on a square picture. */
function shoot(p: HeadPoint, at: Lens): Point {
  const r = rotate(p, at.yaw, at.pitch);
  const depth = at.distance - r.w;
  return { x: at.cx + (at.focal * r.u) / depth, y: at.cy + (at.focal * r.v) / depth };
}

/** The front of the head at a face coordinate: where a real scalp sample sits in three dimensions. */
function onHead(u: number, v: number): HeadPoint {
  const s = HEAD_SHAPE;
  const rest = 1 - (u / s.halfWidth) ** 2 - ((v - s.centreV) / s.halfHeight) ** 2;
  assert.ok(rest > 0, `(${u}, ${v}) is not on the head`);
  return { u, v, w: s.centreW + s.halfDepth * Math.sqrt(rest) };
}

/**
 * Where the frame ought to put a head point at a pose: the projection
 * `regions.ts` states in its own words, written out again here so the
 * assertion is against the claim rather than against the code.
 */
function predicted(p: HeadPoint, at: Lens): FacePoint {
  const psi = at.yaw * RAD;
  const th = at.pitch * RAD;
  return {
    u: p.u + p.w * Math.tan(psi),
    v: p.v + p.u * Math.sin(psi) * Math.tan(th) - p.w * Math.cos(psi) * Math.tan(th),
  };
}

/** What a tracker would report, having photographed a head with depth through a lens. */
function shotObservation(at: Lens): FaceObservation {
  const corners = [
    shoot(onHead(-0.95, 0), at),
    shoot(onHead(0.95, 0), at),
    shoot(onHead(-0.4, HEAD.chin), at),
    shoot(onHead(0.4, HEAD.chin), at),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    bounds: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    },
    image: { width: 1000, height: 1000 },
    yaw: at.yaw,
    pitch: at.pitch,
    roll: 0,
    eyes: {
      left: shoot(onHead(-OUTER_CANTHAL_SHARE, BROW_ABOVE_EYES), at),
      right: shoot(onHead(OUTER_CANTHAL_SHARE, BROW_ABOVE_EYES), at),
    },
    brow: shoot(onHead(-0.3, 0), at),
    chin: shoot(onHead(0, HEAD.chin), at),
  };
}

const SHOTS: Lens[] = [
  lens(),
  lens({ distance: 5.5 }),
  lens({ distance: 14, cx: 0.4, cy: 0.58 }),
  lens({ yaw: 35 }),
  lens({ yaw: -35, distance: 6.5 }),
  lens({ pitch: -30 }),
  lens({ yaw: 20, pitch: -28, distance: 7 }),
];

/**
 * How far a piece of head may sit from where the frame puts it, in face
 * half-widths, once a real camera is in the way — by how far the head
 * has moved from square on.
 *
 * Measured, not chosen. These are what the frame actually costs on the
 * pinhole head above, rounded up from the worst shot in `SHOTS`, so a
 * change for the worse fails here rather than passing quietly. One face
 * half-width is about seven centimetres on an adult head.
 *
 *   square on   a hundredth of a face: the frame is doing its job.
 *   one axis    a fifth. Most of it is not the projection at all — it is
 *               that the outer eye corners are set back from the brow,
 *               so a lens nearer one of them than the other puts their
 *               midpoint off the mid-line of the face, and the origin
 *               moves with it.
 *   both axes   nearly half. Turned and tilted at once is the worst the
 *               frame does, and the crown is read at a tilt.
 *
 * This is the honest size of a flat frame, and it is the case for what
 * the rest of the module does with it: regions are tenths of a face
 * across rather than hundredths, two scans are taken at the same
 * choreographed poses so that most of this cancels in the subtraction,
 * and what does not cancel arrives as spread and widens the noise floor.
 * A frame that modelled the lens would do better; see openIssues.
 */
const FRAME_DRIFT = Object.freeze({ square: 0.05, oneAxis: 0.25, bothAxes: 0.45 });

test('frame: a head with depth, through a lens the frame knows nothing about', () => {
  // The claim the whole engine rests on — the same piece of head lands
  // where the frame says, whatever the pose and the distance — put to a
  // projection that shares none of the frame's assumptions: real depth,
  // a real rotation matrix, and a division by the distance to the lens.
  // The first suite in this file proves the frame inverts its own model.
  // This one says what that model is worth.
  const probes: FacePoint[] = [
    { u: 0, v: HEAD.hairline },
    { u: 0.5, v: -0.6 },
    { u: -0.5, v: -0.6 },
    { u: 0.7, v: -0.4 },
    { u: 0, v: -1.2 },
  ];
  for (const at of SHOTS) {
    const frame = faceFrameOf(shotObservation(at));
    assert.ok(frame, 'the pinhole observation must produce a frame');
    const turned = Math.abs(at.yaw) > 1;
    const tilted = Math.abs(at.pitch) > 1;
    const bound = turned && tilted
      ? FRAME_DRIFT.bothAxes
      : turned || tilted
        ? FRAME_DRIFT.oneAxis
        : FRAME_DRIFT.square;
    for (const probe of probes) {
      const point = onHead(probe.u, probe.v);
      const back = toFace(frame, shoot(point, at));
      const should = predicted(point, at);
      const drift = Math.hypot(back.u - should.u, back.v - should.v);
      assert.ok(
        drift < bound,
        `${probe.u},${probe.v} drifted ${drift.toFixed(4)} at yaw ${at.yaw} pitch ${at.pitch} distance ${at.distance}`,
      );
    }
  }
});

test('frame: a region covers nearly the same piece of head when the head misses its beat', () => {
  // The figure that decides whether two scans can be compared at all.
  // A region is a rectangle in the frame, and the frame is a projection,
  // so the patch of skull a rectangle covers moves when the head does.
  // Five degrees either way — about as well as anybody holds a pose —
  // moves it by a centimetre or so on a seven-centimetre half-face.
  // Bigger than nothing, much smaller than a region, and what is left of
  // it lands in the spread.
  const wander = (region: ScanRegion, beat: { yaw: number; pitch: number }): number => {
    let worst = 0;
    for (const sample of regionSamples(region, 8)) {
      const base = headHitAt(beat, sample);
      if (!base) continue;
      for (const dy of [-POSE_NOISE, POSE_NOISE]) {
        for (const dp of [-POSE_NOISE, POSE_NOISE]) {
          const off = headHitAt({ yaw: beat.yaw + dy, pitch: beat.pitch + dp }, sample);
          // A sample that leaves the head is not counted at all, which is
          // the refusal doing its job rather than a wandering patch.
          if (!off) continue;
          worst = Math.max(
            worst,
            Math.hypot(
              off.point.u - base.point.u,
              off.point.v - base.point.v,
              off.point.w - base.point.w,
            ),
          );
        }
      }
    }
    return worst;
  };
  // Each region at the beat it is meant to be read at. The three that
  // sit on the face hold to within a centimetre; the crown, read over
  // the top of the head where the surface is turning away fastest,
  // wanders twice that — one more reason it is graded `extrapolated`
  // and the first place a real device will disagree with this model.
  assert.ok(wander('hairline', BEATS.front) < 0.12, 'hairline at the front beat');
  assert.ok(wander('rightTemple', BEATS.turnRight) < 0.08, 'a temple at its own turn');
  assert.ok(wander('midScalp', BEATS.top) < 0.1, 'the mid scalp with the chin down');
  assert.ok(wander('crown', BEATS.top) < 0.25, 'the crown with the chin down');
});

test('frame: a tracker reporting the yaw the other way round is caught, not absorbed', () => {
  // The frame trusts the tracker's signs. If a platform reported them
  // mirrored, every region would sit on the wrong side of the head — so
  // there has to be a test that fails when they do, rather than a suite
  // that would pass either way.
  const at = lens({ yaw: 35 });
  const frame = faceFrameOf(shotObservation(at));
  assert.ok(frame);
  // A point well off the mid-line, on the side the turn brings towards
  // the camera: on the mid-line a flipped sign is nearly symmetrical and
  // proves nothing.
  const point = onHead(-0.7, -0.4);
  const back = toFace(frame, shoot(point, at));
  const rightWay = headHitAt({ yaw: at.yaw, pitch: at.pitch }, back);
  const wrongWay = headHitAt({ yaw: -at.yaw, pitch: at.pitch }, back);
  assert.ok(rightWay, 'the sign the tracker reported finds the head');
  const right = Math.hypot(rightWay.point.u - point.u, rightWay.point.w - point.w);
  assert.ok(right < 0.25, `the right sign puts the sample ${right.toFixed(3)} from where it is`);
  // A flipped sign either misses the head altogether or lands somewhere else on it.
  const wrong = wrongWay
    ? Math.hypot(wrongWay.point.u - point.u, wrongWay.point.w - point.w)
    : Infinity;
  assert.ok(wrong > right * 3, `a flipped yaw drifted only ${wrong.toFixed(3)}`);
});

/* -------------------------------- the head -------------------------------- */

test('head model: a sample past the silhouette is on nothing at all', () => {
  const front = { yaw: 0, pitch: 0 };
  assert.equal(sampleFacing(front, { u: 0, v: -0.7 }) > 0, true, 'the forehead is on the head');
  assert.equal(sampleFacing(front, { u: 1.6, v: -0.7 }), 0, 'past the side of the head');
  assert.equal(sampleFacing(front, { u: 0, v: -1.6 }), 0, 'above the top of the head');
  assert.equal(sampleFacing(front, { u: 0, v: 2.4 }), 0, 'below the chin');
});

test('head model: the crown is above the head-on skull and on it once the chin comes down', () => {
  // The crown box sits above the silhouette on purpose: the crown is the
  // back of the dome. What must never happen is a crown READING taken
  // while it is up there, and the facing is what stops it.
  const box = regionBox('crown');
  assert.ok((box.v0 + box.v1) / 2 < HEAD.crown, 'most of the crown box is above the head-on skull');
  assert.ok(regionFacing('crown', { yaw: 0, pitch: 0 }) < MIN_VISIBILITY / 4);
  assert.ok(regionFacing('crown', { yaw: 0, pitch: -28 }) > MIN_VISIBILITY);
});

test('head model: it hands back the piece of head a sample came from', () => {
  const hit = headHitAt({ yaw: 0, pitch: 0 }, { u: 0, v: 0 });
  assert.ok(hit);
  // The brow, which is where the ellipsoid touches the frame's origin.
  assert.ok(Math.abs(hit.point.u) < 1e-9 && Math.abs(hit.point.v) < 1e-9);
  assert.ok(Math.abs(hit.point.w) < 1e-9);
  assert.ok(hit.facing > 0.9, 'the brow faces a camera in front of it');
});

test('head model: the four regions on the face are drawn inside the skull', () => {
  // Not relied on — every sample is bounded by the head anyway — but a
  // box drawn outside the head would spend its samples on refusals and
  // report a visibility that is really a drafting error. The corner of a
  // rectangle laid on a round head hangs off it by a hair, which is why
  // this is a share of the box and not its corners.
  for (const region of ['hairline', 'leftTemple', 'rightTemple', 'midScalp'] as ScanRegion[]) {
    const samples = regionSamples(region, 24);
    const on = samples.filter((p) => headHitAt({ yaw: 0, pitch: 0 }, p) !== null).length;
    assert.ok(on / samples.length > 0.95, `${region} is only ${on / samples.length} on the head`);
  }
});

test('head model: the room behind the head is never counted as scalp', () => {
  // THE test. A mask that is hair on the head and nothing off it: every
  // region that yields a reading must read as all hair. A reading below
  // one is a reading that counted the room — and a region counted the
  // room would be reported as visible scalp, which is the most damaging
  // wrong number this product could print.
  for (const at of [pose(), pose({ pitch: -30 }), pose({ yaw: 35 })]) {
    const frame = frameAt(at);
    const mask = paintHead(frame, at);
    const readings = readFrame({ mask, face: observation(at), quality: 0.9 });
    const names = Object.keys(readings) as ScanRegion[];
    assert.ok(names.length > 0, `nothing readable at yaw ${at.yaw} pitch ${at.pitch}`);
    for (const region of names) {
      const reading = readings[region];
      assert.ok(reading);
      assert.equal(
        reading.visibleScalp,
        0,
        `${region} read ${reading.visibleScalp} of the room as scalp at yaw ${at.yaw} pitch ${at.pitch}`,
      );
      assert.equal(reading.coverage, 1, `${region} read ${reading.coverage} at yaw ${at.yaw}`);
    }
  }
});

test('head model: a region reaching off the head loses those samples rather than counting them', () => {
  const at = pose({ pitch: -30 });
  const frame = frameAt(at);
  const crown = readRegion(paintHead(frame, at), frame, 'crown', 0.9);
  assert.ok(crown);
  assert.ok(crown.counted > 0);
  assert.ok(crown.onHead > 0.9, `the crown is on the head with the chin down: ${crown.onHead}`);
  // Off the head at the same pose: nothing counted, so nothing reported.
  const level = frameAt(pose());
  assert.equal(readRegion(paintHead(level, pose()), level, 'crown', 0.9), null);
});

/* ------------------------------- the regions ------------------------------ */

test('regions: all six are defined, ordered once each, and each states its anchoring', () => {
  assert.equal(SCAN_REGIONS.length, 6);
  assert.equal(new Set(SCAN_REGIONS).size, 6);
  for (const region of SCAN_REGIONS) {
    assert.ok(REGION_ANCHORING[region], `${region} has no anchoring`);
    const box = regionBox(region);
    assert.ok(box.u0 < box.u1 && box.v0 < box.v1, `${region} has an empty box`);
  }
});

test('regions: the hairline and the temples are anchored; the crown, mid scalp and part are not', () => {
  // Stated in code rather than in a comment, so nothing downstream can
  // present a crown reading with the weight of a hairline one by
  // accident.
  assert.equal(REGION_ANCHORING.hairline, 'anchored');
  assert.equal(REGION_ANCHORING.leftTemple, 'anchored');
  assert.equal(REGION_ANCHORING.rightTemple, 'anchored');
  assert.equal(REGION_ANCHORING.midScalp, 'extrapolated');
  assert.equal(REGION_ANCHORING.crown, 'extrapolated');
  assert.equal(REGION_ANCHORING.partLine, 'assumed');
});

test('regions: the anchored three sit within a face of the brow; the weak ones sit above the face', () => {
  for (const region of ['hairline', 'leftTemple', 'rightTemple'] as ScanRegion[]) {
    assert.ok(regionBox(region).v0 >= -1.05, `${region} reaches above the face mesh`);
  }
  for (const region of ['midScalp', 'crown'] as ScanRegion[]) {
    assert.ok(regionBox(region).v0 < HEAD.hairline, `${region} should sit above the hairline`);
  }
});

test('regions: the hairline band and the temples meet without a gap or an overlap', () => {
  assert.equal(regionBox('hairline').u1, regionBox('rightTemple').u0);
  assert.equal(regionBox('hairline').u0, regionBox('leftTemple').u1);
  assert.equal(regionBox('leftTemple').u0, -regionBox('rightTemple').u1);
});

test('regions: a temple turns away when the head turns the other way', () => {
  // Preview and still are both mirrored, so image-left is the person's
  // own left, and the head turning towards its own right is what brings
  // that side round to the camera.
  assert.ok(regionFacing('leftTemple', { yaw: 35, pitch: 0 }) > regionFacing('leftTemple', { yaw: -35, pitch: 0 }));
  assert.ok(regionFacing('rightTemple', { yaw: -35, pitch: 0 }) > regionFacing('rightTemple', { yaw: 35, pitch: 0 }));
  assert.equal(regionFacing('leftTemple', { yaw: -60, pitch: 0 }), 0);
});

test('regions: a pose the tracker could not read faces nothing', () => {
  assert.equal(regionFacing('hairline', { yaw: NaN, pitch: 0 }), 0);
});

test('a frame whose pose the tracker could not read is refused by the whole pipeline', () => {
  /*
    The assertion above tests `regionFacing` on its own, and for a while
    that was all it tested: `faceFrameOf` replaced a non-finite yaw with
    0, so through `measureScan` an unknown head was measured as square-on
    and every region came back at full confidence. This walks the path the
    scanner will actually walk — observation, frame, readings — and holds
    it to the same refusal, so the guarantee the title above claims is one
    the engine really provides.
  */
  for (const broken of [{ yaw: NaN }, { pitch: NaN }, { yaw: Number.POSITIVE_INFINITY }]) {
    const at = pose();
    const face = { ...observation(at), ...broken };
    assert.equal(faceFrameOf(face), null, `${JSON.stringify(broken)} must not produce a frame`);

    const frame = frameAt(at);
    const mask = paint(frame, 64, () => 1);
    const measurement = measureScan([{ mask, face, quality: 0.9 }], '2026-09-18T09:00:00.000Z');
    assert.deepEqual(measurement.regions, {}, 'a frame with no pose yields no reading');
    assert.deepEqual(
      [...measurement.unread].sort(),
      [...SCAN_REGIONS].sort(),
      'every region is named as unread rather than quietly missing',
    );
  }
});


/**
 * Which regions a beat is expected to read, and which it is expected to
 * refuse — with `borderline` for the one pair where five degrees of pose
 * genuinely decides it.
 *
 * That pair is the part strip at a 35° turn, and it is listed rather
 * than tuned away because it is honest: the strip is the head's centre
 * line, and at a 35° turn the centre line is exactly where the head
 * stops being square to the camera. What a flip costs is a frame — the
 * spread widens, the confidence falls, and `compare.ts` grows more
 * reluctant — which is the behaviour the error bar exists to produce.
 */
const EXPECTED: Record<keyof typeof BEATS, Record<ScanRegion, 'read' | 'refused' | 'borderline'>> = {
  front: {
    hairline: 'read',
    leftTemple: 'read',
    rightTemple: 'read',
    midScalp: 'read',
    crown: 'refused',
    partLine: 'read',
  },
  turnLeft: {
    hairline: 'read',
    leftTemple: 'read',
    rightTemple: 'refused',
    midScalp: 'refused',
    crown: 'refused',
    partLine: 'borderline',
  },
  turnRight: {
    hairline: 'read',
    leftTemple: 'refused',
    rightTemple: 'read',
    midScalp: 'refused',
    crown: 'refused',
    partLine: 'borderline',
  },
  top: {
    hairline: 'read',
    leftTemple: 'read',
    rightTemple: 'read',
    midScalp: 'read',
    crown: 'read',
    partLine: 'read',
  },
};

test('regions: a few degrees of pose cannot flip a region between read and unread', () => {
  // The defect this catches: a region whose facing lands within a
  // thousandth of the bar at the very pose the capture aims for. Its
  // frame count then depends on how still somebody held their head,
  // which means its confidence and its spread do too, and two scans of
  // the same person are no longer measured the same way.
  for (const [name, beat] of Object.entries(BEATS)) {
    for (const region of SCAN_REGIONS) {
      let low = 1;
      let high = 0;
      for (const dy of [-POSE_NOISE, 0, POSE_NOISE]) {
        for (const dp of [-POSE_NOISE, 0, POSE_NOISE]) {
          const facing = regionFacing(region, { yaw: beat.yaw + dy, pitch: beat.pitch + dp });
          low = Math.min(low, facing);
          high = Math.max(high, facing);
        }
      }
      const expected = EXPECTED[name as keyof typeof BEATS][region];
      const actual = low >= MIN_VISIBILITY ? 'read' : high < MIN_VISIBILITY ? 'refused' : 'borderline';
      assert.equal(actual, expected, `${region} at ${name} is ${actual} (${low.toFixed(3)}..${high.toFixed(3)})`);
    }
  }
});

test('regions: the crown needs the chin down, and the mid scalp does not', () => {
  // Stated separately because it is the thing the choreography is built
  // around, and because the two used to be hand-written angles rather
  // than facts about a head.
  assert.ok(regionFacing('crown', BEATS.front) < regionFacing('crown', BEATS.top));
  assert.ok(regionFacing('crown', BEATS.front) < MIN_VISIBILITY);
  assert.ok(regionFacing('midScalp', BEATS.front) > MIN_VISIBILITY);
});

/* ------------------------------- the counting ----------------------------- */

test('coverage: half a region of hair reads as half', () => {
  // The single number this whole module exists to produce. If it is not
  // exactly a half on a mask that is exactly half hair, nothing built on
  // it means anything. Split side to side, because a head is symmetrical
  // that way and the counting is too.
  const at = pose();
  const frame = frameAt(at);
  const mask = paint(frame, MASK_SIDE, (p) => (p.u < 0 ? 1 : 0));

  const reading = readRegion(mask, frame, 'hairline', 0.8);
  assert.ok(reading);
  assert.ok(Math.abs(reading.coverage - 0.5) < 1e-9, `read ${reading.coverage}`);
  assert.ok(Math.abs(reading.visibleScalp - 0.5) < 1e-9);
  assert.equal(reading.inFrame, 1);
});

test('coverage: a quarter reads as a quarter, and a full region reads as full', () => {
  const at = pose();
  const frame = frameAt(at);
  const box = regionBox('hairline');
  const quarter = box.u0 + (box.u1 - box.u0) / 4;

  const quarterMask = paint(frame, MASK_SIDE, (p) => (p.u < quarter ? 1 : 0));
  assert.ok(Math.abs((readRegion(quarterMask, frame, 'hairline', 1)?.coverage ?? 0) - 0.25) < 1e-9);

  const allHair = paint(frame, MASK_SIDE, () => 1);
  const full = readRegion(allHair, frame, 'hairline', 1);
  assert.equal(full?.coverage, 1);
  assert.equal(full?.visibleScalp, 0);
});

test('coverage: the mask hedging is counted as neither hair nor scalp', () => {
  // A soft hairline edge is the model saying it does not know. Counting
  // it as visible scalp would invent scalp nobody can see.
  const frame = frameAt(pose());
  const hedged = paint(frame, MASK_SIDE, () => (SCALP + 0.5) / 2);
  const reading = readRegion(hedged, frame, 'hairline', 1);
  assert.ok(reading);
  assert.equal(reading.coverage, 0);
  assert.equal(reading.visibleScalp, 0);
});

test('coverage: hair and scalp never add to more than the region', () => {
  const frame = frameAt(pose());
  const mixed = paint(frame, MASK_SIDE, (p) => (p.u < -0.2 ? 1 : p.u < 0.2 ? 0.35 : 0));
  const reading = readRegion(mixed, frame, 'hairline', 1);
  assert.ok(reading);
  assert.ok(reading.coverage + reading.visibleScalp <= 1 + 1e-9);
  assert.ok(reading.coverage + reading.visibleScalp < 1, 'the hedged band belongs to neither');
});

test('coverage: a region mostly outside the picture yields nothing, not a small number', () => {
  // The dangerous failure. A temple half out of shot would read a real
  // number off the half that was in it, and that number would be
  // compared next month against a whole temple.
  const at = pose({ cx: 0.98 });
  const frame = frameAt(at);
  const mask = paint(frame, MASK_SIDE, () => 1);
  assert.equal(readRegion(mask, frame, 'rightTemple', 1), null);
});

test('coverage: a region facing away from the camera yields nothing', () => {
  const at = pose();
  const frame = frameAt(at);
  const mask = paint(frame, MASK_SIDE, () => 1);
  assert.equal(readRegion(mask, frame, 'crown', 1), null, 'no crown with the chin level');
  assert.ok(readRegion(mask, frame, 'hairline', 1), 'the hairline is there head-on');
});

test('coverage: with the chin down the crown becomes readable', () => {
  const at = pose({ pitch: -30 });
  const frame = frameAt(at);
  const mask = paint(frame, MASK_SIDE, () => 1);
  const reading = readRegion(mask, frame, 'crown', 0.7);
  assert.ok(reading, 'the crown must read once the head is lowered');
  assert.ok(reading.visibility >= MIN_VISIBILITY);
  assert.equal(reading.quality, 0.7, 'the frame quality is carried, not recomputed');
});

test('coverage: a sample at the very edge of the silhouette is not counted', () => {
  // The head model is an ellipsoid and a person has a skull; the two
  // silhouettes differ by a few degrees of arc, and right at the edge
  // what the mask is drawing is the outline of the head against the
  // room. So the count keeps a margin inside the outline.
  assert.ok(EDGE_FACING > 0 && EDGE_FACING < MIN_VISIBILITY);
  const grazing = sampleFacing({ yaw: 0, pitch: 0 }, { u: HEAD_SHAPE.halfWidth - 0.002, v: HEAD_SHAPE.centreV });
  assert.ok(grazing > 0 && grazing < EDGE_FACING, `a sample at the silhouette faced ${grazing}`);
});

test('coverage: an empty mask reads nothing rather than throwing', () => {
  const frame = frameAt(pose());
  assert.equal(readRegion({ width: 0, height: 0, data: new Float32Array(0) }, frame, 'hairline', 1), null);
});

test('coverage: a frame with no face produces no readings at all', () => {
  const at = pose();
  const frame = frameAt(at);
  const mask = paint(frame, MASK_SIDE, () => 1);
  const readings = readFrame({
    mask,
    face: { ...observation(at), bounds: { x: 0, y: 0, width: 0, height: 0 } },
    quality: 1,
  });
  assert.deepEqual(readings, {});
});

/* -------------------------------- the spread ------------------------------ */

test('spread: identical readings still carry a floor, never zero', () => {
  // Zero spread would claim perfect precision, and any difference at all
  // next month would clear the noise floor.
  assert.equal(spreadOf([0.4, 0.4, 0.4, 0.4]), SPREAD_FLOOR);
});

test('spread: one reading has no spread of its own and is given a wide one', () => {
  assert.equal(spreadOf([0.4]), SINGLE_FRAME_SPREAD);
  assert.equal(spreadOf([]), SINGLE_FRAME_SPREAD);
  assert.ok(SINGLE_FRAME_SPREAD > SPREAD_FLOOR * 4);
});

test('spread: frames that disagree produce a wide error bar', () => {
  const tight = spreadOf([0.5, 0.51, 0.49, 0.5]);
  const loose = spreadOf([0.3, 0.6, 0.45, 0.7]);
  assert.ok(loose > tight * 5, `tight ${tight} loose ${loose}`);
  assert.ok(loose > WIDE_SPREAD);
});

test('spread: it is the sample deviation, not the population one', () => {
  // n−1, because the mean was estimated from the same four readings. The
  // population version is biased low on counts this small, which would
  // shrink the error bar and let noise through as a change.
  const values = [0.4, 0.5, 0.6];
  const mean = meanOf(values);
  const expected = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1));
  assert.ok(Math.abs(spreadOf(values) - expected) < 1e-12);
});

/* ------------------------------ the confidence ---------------------------- */

const good = { frames: ENOUGH_FRAMES, spread: SPREAD_FLOOR, quality: 0.85, visibility: 0.95 };

test('confidence: a well-repeated, tight, well-lit region is trusted', () => {
  assert.ok(confidenceOf(good) > 0.85, `${confidenceOf(good)}`);
});

test('confidence: a single frame cannot reach the bar a comparison needs, however good it looked', () => {
  // The defect this catches was real and it was the worst kind: the
  // comment said a single frame landed below the bar, and the arithmetic
  // put it at 0.44, over it. A region caught once has no error bar of
  // its own — most of the one it is given is this module's own constant
  // — so it is capped outright, and the cap is below the bar.
  const best = confidenceOf({ frames: 1, spread: SINGLE_FRAME_SPREAD, quality: 1, visibility: 1 });
  assert.ok(best <= UNREPEATED_CONFIDENCE, `a single frame reached ${best}`);
  assert.ok(best < MIN_CONFIDENCE, `a single frame reached ${best}, the bar is ${MIN_CONFIDENCE}`);
  assert.ok(best > 0, 'it is still a reading, just one nothing may be subtracted from');
  assert.ok(UNREPEATED_CONFIDENCE < MIN_CONFIDENCE, 'the cap must sit below the bar');
});

test('confidence: the cap lifts as soon as a second frame gives it something to disagree with', () => {
  const two = confidenceOf({ frames: 2, spread: SPREAD_FLOOR, quality: 1, visibility: 1 });
  assert.ok(two > UNREPEATED_CONFIDENCE);
  assert.ok(two > MIN_CONFIDENCE);
});

test('confidence: frames that disagree collapse it to nothing', () => {
  assert.equal(confidenceOf({ ...good, spread: WIDE_SPREAD }), 0);
  assert.equal(confidenceOf({ ...good, spread: WIDE_SPREAD * 2 }), 0);
});

test('confidence: any one term at zero zeroes the whole thing', () => {
  // Geometric, not arithmetic. A region read six times in perfect light
  // that nothing could see is not "mostly confident".
  assert.equal(confidenceOf({ ...good, visibility: 0 }), 0);
  assert.equal(confidenceOf({ ...good, quality: 0 }), 0);
  assert.equal(confidenceOf({ ...good, frames: 0 }), 0);
});

test('confidence: more frames and better conditions only ever help', () => {
  assert.ok(confidenceOf({ ...good, frames: 2 }) < confidenceOf({ ...good, frames: 4 }));
  assert.ok(confidenceOf({ ...good, quality: 0.4 }) < confidenceOf({ ...good, quality: 0.9 }));
  assert.ok(confidenceOf({ ...good, visibility: 0.65 }) < confidenceOf({ ...good, visibility: 1 }));
  assert.ok(confidenceOf({ ...good, spread: 0.06 }) < confidenceOf({ ...good, spread: 0.01 }));
});

/* ----------------------------- gathering a region ------------------------- */

const reading = (
  coverage: number,
  over: Partial<{ visibleScalp: number; quality: number; visibility: number; anchoring: 'landmarks' | 'partial' | 'box' }> = {},
) => ({
  coverage,
  visibleScalp: 1 - coverage,
  quality: 0.85,
  visibility: 0.95,
  anchoring: 'landmarks' as const,
  ...over,
});

test('region: the measurement carries the middle AND the spread', () => {
  const measured = measureRegion('hairline', [reading(0.5), reading(0.52), reading(0.48), reading(0.5)]);
  assert.ok(measured);
  assert.equal(measured.region, 'hairline');
  assert.ok(Math.abs(measured.coverage - 0.5) < 1e-12);
  assert.equal(measured.frames, 4);
  assert.ok(measured.spread > 0);
  assert.ok(measured.confidence > 0.8);
});

test('region: nothing read is null, never a row reading zero', () => {
  // A zero row would be a claim that there is no hair there.
  assert.equal(measureRegion('crown', []), null);
});

test('region: the anchoring it carries is the weakest of the frames that made it', () => {
  // A measurement is in the units of its shakiest ingredient, and the
  // next scan has to be able to see that before it subtracts.
  const mixed = measureRegion('hairline', [
    reading(0.5),
    reading(0.52, { anchoring: 'box' }),
    reading(0.51, { anchoring: 'partial' }),
  ]);
  assert.equal(mixed?.anchoring, 'box');
  assert.equal(measureRegion('hairline', [reading(0.5), reading(0.5)])?.anchoring, 'landmarks');
});

test('region: every figure it reports is a share between nought and one', () => {
  const measured = measureRegion('hairline', [reading(0.9), reading(0.1)]);
  assert.ok(measured);
  for (const value of [measured.coverage, measured.visibleScalp, measured.spread, measured.confidence]) {
    assert.ok(value >= 0 && value <= 1, `${value} is not a share`);
  }
});

/* ------------------------------- a whole scan ----------------------------- */

/** Four frames of the same head: two square on, two with the chin down. */
function scanFrames(hairShare: number): ScanFrameInput[] {
  const poses = [pose(), pose({ yaw: 30 }), pose({ pitch: -30 }), pose({ pitch: -32, yaw: -8 })];
  return poses.map((at) => {
    const frame = frameAt(at);
    return {
      mask: paint(frame, MASK_SIDE, (p) => (p.u < -1 + 2 * hairShare ? 1 : 0)),
      face: observation(at),
      quality: 0.8,
    };
  });
}

test('scan: a four-frame scan reads the regions it saw and lists the ones it did not', () => {
  const measurement = measureScan(scanFrames(0.7), '2026-09-18T09:00:00.000Z');
  assert.equal(measurement.capturedAt, '2026-09-18T09:00:00.000Z');

  const named = new Set([...Object.keys(measurement.regions), ...measurement.unread]);
  assert.equal(named.size, SCAN_REGIONS.length, 'every region is either read or listed unread');
  assert.ok(measurement.regions.hairline, 'the hairline is in every frame');
  for (const region of measurement.unread) {
    assert.ok(!measurement.regions[region], `${region} cannot be both read and unread`);
  }
});

test('scan: a region nothing could see is unread rather than zero', () => {
  // Every frame square on: the crown is never facing the camera, so the
  // scan says so instead of reporting an empty crown.
  const at = pose();
  const frame = frameAt(at);
  const flat: ScanFrameInput[] = [0, 1, 2, 3].map(() => ({
    mask: paint(frame, MASK_SIDE, () => 1),
    face: observation(at),
    quality: 0.8,
  }));
  const measurement = measureScan(flat, '2026-09-18T09:00:00.000Z');
  assert.ok(measurement.unread.includes('crown'));
  assert.equal(measurement.regions.crown, undefined);
});

test('scan: no frames at all is an empty record, not a record of zeroes', () => {
  const measurement = measureScan([], '2026-09-18T09:00:00.000Z');
  assert.deepEqual(measurement.regions, {});
  assert.deepEqual([...measurement.unread].sort(), [...SCAN_REGIONS].sort());
});

test('scan: a region the scan repeated reads a sane share with an error bar', () => {
  const measurement = measureScan(scanFrames(0.5), '2026-09-18T09:00:00.000Z');
  const hairline = measurement.regions.hairline;
  assert.ok(hairline);
  assert.ok(hairline.coverage > 0 && hairline.coverage < 1);
  assert.ok(hairline.frames >= 2);
  assert.ok(hairline.spread >= SPREAD_FLOOR);
  assert.ok(hairline.confidence > 0 && hairline.confidence <= 1);
});

test('scan: a measurement says what its coordinates were anchored to', () => {
  const measurement = measureScan(scanFrames(0.6), '2026-09-18T09:00:00.000Z');
  assert.equal(measurement.regions.hairline?.anchoring, 'landmarks');

  const boxOnly = scanFrames(0.6).map((input) => ({
    ...input,
    face: { ...input.face, eyes: null, brow: null, chin: null },
  }));
  assert.equal(measureScan(boxOnly, '2026-09-18T09:00:00.000Z').regions.hairline?.anchoring, 'box');
});

test('scan: a crown caught in one frame of four is never compared against anything', () => {
  /*
    The whole chain, from photographs to a verdict, on the failure this
    module exists to prevent. One scan lowers the head once, so the crown
    is read in a single frame; the next lowers it four times, so the
    crown has an error bar of its own. The two crowns differ by a fifth
    of the region.

    Nothing about that difference is knowable. The first scan's error bar
    is a constant this module wrote down, not anything it measured, and
    the comparison has to say so rather than publish `small`.
  */
  const glance: ScanFrameInput[] = [pose(), pose(), pose(), pose({ pitch: -30 })].map((at) => {
    const frame = frameAt(at);
    return { mask: paint(frame, MASK_SIDE, (p) => (p.u < 0.2 ? 1 : 0)), face: observation(at), quality: 0.8 };
  });
  const proper: ScanFrameInput[] = [
    pose({ pitch: -28 }),
    pose({ pitch: -30 }),
    pose({ pitch: -32 }),
    pose({ pitch: -34 }),
  ].map((at) => {
    const frame = frameAt(at);
    return { mask: paint(frame, MASK_SIDE, (p) => (p.u < -0.2 ? 1 : 0)), face: observation(at), quality: 0.8 };
  });

  const once = measureScan(glance, '2026-03-01T09:00:00.000Z');
  const repeated = measureScan(proper, '2026-01-01T09:00:00.000Z');
  const crownOnce = once.regions.crown;
  const crownRepeated = repeated.regions.crown;
  assert.ok(crownOnce && crownRepeated);
  assert.equal(crownOnce.frames, 1, 'the glancing scan caught the crown once');
  assert.ok(crownRepeated.frames >= MIN_FRAMES);
  assert.ok(Math.abs(crownOnce.coverage - crownRepeated.coverage) > 0.1, 'and they differ a great deal');
  assert.ok(crownOnce.confidence < MIN_CONFIDENCE, `one frame measured ${crownOnce.confidence}`);

  const row = compareScans(once, repeated).find((r) => r.region === 'crown');
  assert.ok(row);
  assert.equal(row.verdict, 'insufficient');
  assert.equal(row.delta, 0, 'and no number is carried with it');
});

/* -------------------------------- the honesty ----------------------------- */

const SOURCES = ['regions', 'coverage', 'noise', 'compare', 'index'].map((name) => ({
  name,
  text: readFileSync(new URL(`../../src/features/hair-scan/measure/${name}.ts`, import.meta.url), 'utf8'),
}));

/**
 * Comments stripped, the way the quality gate strips them before its own
 * language checks: these files state in prose exactly what they refuse
 * to do ("it does not diagnose"), and a check that flags its own
 * rulebook is noise rather than signal. What is being asserted is that
 * no identifier, string or branch in the CODE names a finding.
 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

test('honesty: nothing in the engine is scored out of a hundred', () => {
  // A score out of 100 reads as a grade on a person, whatever the label
  // next to it says.
  for (const source of SOURCES) {
    const code = stripComments(source.text);
    assert.ok(!/\*\s*100\b|\/\s*100\b|\b100\s*\*/.test(code), `${source.name}.ts scales by 100`);
    assert.ok(!/\bscore\b/i.test(code), `${source.name}.ts talks about a score`);
  }
});

test('honesty: the engine never names a finding about a person', () => {
  // The words that would mean this had stopped measuring a photograph
  // and started describing a head.
  const forbidden = ['density', 'thinning', 'balding', 'norwood', 'diagnos', 'regrow', 'forecast', 'predict'];
  for (const source of SOURCES) {
    const lower = stripComments(source.text).toLowerCase();
    for (const word of forbidden) {
      assert.ok(!lower.includes(word), `${source.name}.ts says "${word}"`);
    }
  }
});

test('honesty: the engine imports nothing native and no React', () => {
  for (const source of SOURCES) {
    assert.ok(!/from ['"]react/.test(source.text), `${source.name}.ts imports React`);
    assert.ok(!/from ['"]expo/.test(source.text), `${source.name}.ts imports an Expo module`);
    assert.ok(!/from ['"]react-native/.test(source.text), `${source.name}.ts imports React Native`);
  }
});

test('honesty: one hair threshold, shared with the rest of the app', () => {
  // Two thresholds would disagree silently, and an outline drawn at one
  // around a figure counted at the other marks a region the number does
  // not describe.
  const coverage = SOURCES.find((s) => s.name === 'coverage');
  assert.ok(coverage?.text.includes("from '@/features/assessment/hair-mask'"));
  assert.ok(!/const HAIR\s*=/.test(coverage?.text ?? ''), 'the threshold must not be copied');
});

test('honesty: one set of head proportions, shared with the head cap', () => {
  const regions = SOURCES.find((s) => s.name === 'regions');
  assert.ok(regions?.text.includes("from '@/features/hair-scan/head-cap'"));
  assert.ok(!/HEAD_LINES\s*=/.test(regions?.text ?? ''), 'the proportions must not be copied');
});
