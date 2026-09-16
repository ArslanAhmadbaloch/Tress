/**
 * The sweep has to be right about a turn nobody can see it judge.
 *
 * Every photograph the sweep takes is taken by the app, while the person
 * is moving, with no shutter pressed and nothing to review until it is
 * over. So the arithmetic that decides where the head is, whether the
 * frames were usable, and whether this instant is still enough to
 * photograph is checked here, exhaustively, on a machine with no camera.
 * A gate that is a little too generous does not fail — it quietly returns
 * a soft photograph that the record then carries for a year.
 *
 * Nothing in this file asserts anything about hair. It asserts angles,
 * milliseconds and distances, which is the whole of what the sweep knows.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GuideTarget } from '@/components/capture/head-guidance';
import { POSE, type Pose, type PoseFace } from '@/features/capture/guided-scan';
import {
  BAND,
  BASELINE_TOL_PITCH,
  BASELINE_TOL_YAW,
  DWELL_DT_CAP_MS,
  DWELL_PITCH_MAX,
  DWELL_ROLL_MAX,
  FILL_LAG_MS,
  MOTION_WINDOW,
  PHONE_STILL_MS,
  RING_CLOSED_MS,
  SEGMENT_DEG,
  SEGMENT_DWELL_MS,
  SEGMENT_HYSTERESIS,
  SETTLE_MAX_MS,
  SETTLE_MS,
  SWEEP_SEGMENTS,
  SWEEP_STILL_PACE,
  SWEEP_YAW_RANGE_MAX,
  SWEEP_YAW_SPAN,
  SWEEP_YAW_STEP_MAX,
  TEMPLE_TARGET_YAW,
  TEMPLE_TOL_YAW,
  accrueDwell,
  dispatchSegment,
  dwellAccepts,
  dwellStep,
  fillOf,
  fractional,
  isFull,
  lagFills,
  lagStep,
  motionSteady,
  openWellFor,
  poseCost,
  poseOf,
  pushYaw,
  readableFace,
  readablePose,
  ringClosed,
  segmentGap,
  segmentIndex,
  settleReady,
  theta,
  wellAccepts,
  wellsFor,
  type WellTarget,
} from '@/features/capture/sweep';

const target: GuideTarget = { cx: 200, cy: 300, diameter: 260 };

/** A face sitting where the ring asks for it: right size, centred, level. */
function face(overrides: Partial<PoseFace> = {}): PoseFace {
  return { cx: 200, cy: 300, width: 180, height: 220, yaw: 0, pitch: 0, roll: 0, at: 0, ...overrides };
}

function pose(yaw: number, pitch = 0, roll = 0): Pose {
  return { yaw, pitch, roll };
}

const empty = () => new Array<number>(SWEEP_SEGMENTS).fill(0);

/** A fixed pseudo-random sequence, so a failing run can be repeated. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The middle of each segment, in degrees of head turn. */
const SEGMENT_CENTRES = [5, 15, 26, 37, -37, -26, -15, -5];

/* ------------------------------- the dial ------------------------------ */

test('dial: theta is a signed reading of the turn, clamped, that never wraps', () => {
  assert.equal(theta(0), 0);
  assert.equal(theta(SWEEP_YAW_SPAN), 180);
  assert.equal(theta(-SWEEP_YAW_SPAN), -180);

  // Past the span the dial pins rather than running on round the ring.
  assert.equal(theta(60), 180);
  assert.equal(theta(-100), -180);

  let previous = theta(-60);
  for (let yaw = -60; yaw <= 60; yaw += 0.5) {
    const value = theta(yaw);
    assert.ok(value >= previous, `theta went backwards at ${yaw}`);
    assert.ok(value >= -180 && value <= 180, `theta left the dial at ${yaw}`);
    previous = value;
  }

  /*
    The no-wrap guarantee, stated as the thing that actually matters: the
    dial moves by the same fraction the head does. A head that turns by
    less than the whole span can therefore never move the cursor more than
    half the ring, so there is no long-way-round case for anything reading
    theta to handle.
  */
  for (let a = -60; a <= 60; a += 1.5) {
    for (let b = -60; b <= 60; b += 1.5) {
      const moved = Math.abs(theta(a) - theta(b));
      assert.ok(moved <= (Math.abs(a - b) / SWEEP_YAW_SPAN) * 180 + 1e-9);
      if (Math.abs(a - b) <= SWEEP_YAW_SPAN) assert.ok(moved <= 180);
    }
  }
});

test('dial: the eight segments partition the turn, four to each side', () => {
  assert.equal(SEGMENT_DEG * SWEEP_SEGMENTS, 360);

  SEGMENT_CENTRES.forEach((yaw, index) => {
    assert.equal(segmentIndex(theta(yaw)), index, `yaw ${yaw} should sit in segment ${index}`);
  });

  // The boundaries sit at twelve and six o'clock, so one side owns 0-3 and
  // the other 4-7 and the ring is exactly half closed after one side.
  assert.equal(segmentIndex(0), 0);
  assert.equal(segmentIndex(180), 3);
  assert.equal(segmentIndex(-180), 4);
  assert.equal(segmentIndex(theta(SWEEP_YAW_SPAN)), 3);
  assert.equal(segmentIndex(theta(-SWEEP_YAW_SPAN)), 4);

  const seen = new Set<number>();
  const extent = new Map<number, { low: number; high: number }>();
  for (let yaw = -SWEEP_YAW_SPAN; yaw <= SWEEP_YAW_SPAN; yaw += 0.1) {
    const index = segmentIndex(theta(yaw));
    assert.ok(Number.isInteger(index) && index >= 0 && index < SWEEP_SEGMENTS);
    assert.ok(yaw >= 0 ? index <= 3 : index >= 4, `yaw ${yaw} landed on the wrong side`);
    seen.add(index);
    const span = extent.get(index) ?? { low: yaw, high: yaw };
    extent.set(index, { low: Math.min(span.low, yaw), high: Math.max(span.high, yaw) });
  }

  assert.deepEqual([...seen].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const span of extent.values()) {
    // One segment is 10.5 degrees of head turn.
    assert.ok(Math.abs(span.high - span.low - SWEEP_YAW_SPAN / 4) < 0.25);
  }
});

test('dial: a boundary wobble does not strobe the cursor, a real move does', () => {
  // 0.2 of a segment is 2.1 degrees of head turn, so a degree of wobble is
  // under it and four degrees is over it.
  const boundary = SWEEP_YAW_SPAN / 4; // the 0 | 1 boundary, in degrees of turn

  const walk = (swing: number) => {
    let cursor = dispatchSegment({ theta: theta(boundary - swing), current: 0, currentF: 0 });
    let changes = 0;
    for (let i = 0; i < 12; i += 1) {
      const yaw = boundary + (i % 2 === 0 ? swing : -swing);
      cursor = dispatchSegment({ theta: theta(yaw), current: cursor.current, currentF: cursor.currentF });
      if (cursor.changed) changes += 1;
    }
    return changes;
  };

  assert.ok(walk(1) <= 1, 'a one-degree wobble moved the cursor more than once');
  assert.equal(walk(4), 12);

  // The gap itself is measured the short way round, so the two ends of the
  // ring are neighbours rather than seven segments apart.
  assert.ok(Math.abs(segmentGap(0.1, 7.9) - 0.2) < 1e-12);
  const eitherSideOfTwelve = segmentGap(fractional(theta(1)), fractional(theta(-1)));
  assert.ok(Math.abs(eitherSideOfTwelve - fractional(theta(1)) * 2) < 1e-12);
  assert.ok(eitherSideOfTwelve < SEGMENT_HYSTERESIS);
  assert.ok(SEGMENT_HYSTERESIS === 0.2);
});

/* -------------------------------- dwell -------------------------------- */

test('dwell: only a usable frame fills the ring, and no frame gives more than 100ms', () => {
  const at = (overrides: Partial<PoseFace>, now = 33, lastFaceAt: number | null = 0) =>
    accrueDwell(empty(), { face: face(overrides), target, now, lastFaceAt, running: true });

  const good = at({ yaw: 15 });
  assert.equal(good.index, 1);
  assert.equal(good.dt, 33);
  assert.equal(good.segments[1], 33);

  // Too far, too close, off centre: nothing is learned from the frame.
  assert.equal(at({ yaw: 15, width: 100 }).index, null);
  assert.equal(at({ yaw: 15, width: 300 }).index, null);
  assert.equal(at({ yaw: 15, cx: 260 }).index, null);

  // Nodding or tilting past the window the photographs are taken in.
  assert.equal(at({ yaw: 15, pitch: DWELL_PITCH_MAX + 0.5 }).index, null);
  assert.equal(at({ yaw: 15, pitch: -DWELL_PITCH_MAX - 0.5 }).index, null);
  assert.equal(at({ yaw: 15, roll: DWELL_ROLL_MAX + 0.5 }).index, null);
  assert.equal(at({ yaw: 15, pitch: DWELL_PITCH_MAX, roll: DWELL_ROLL_MAX }).index, 1);

  // The ring is inert until the front photograph has been taken.
  const inert = accrueDwell(empty(), {
    face: face({ yaw: 15 }),
    target,
    now: 33,
    lastFaceAt: 0,
    running: false,
  });
  assert.equal(inert.index, null);
  assert.deepEqual(inert.segments, empty());

  // A stalled stream must not gift a segment when the frames resume.
  assert.equal(dwellStep(0, 5000), DWELL_DT_CAP_MS);
  assert.equal(at({ yaw: 15 }, 5000, 0).segments[1], DWELL_DT_CAP_MS);
  assert.equal(dwellStep(null, 5000), 0);
  assert.equal(at({ yaw: 15 }, 5000, null).index, null);
});

test('dwell: nothing ever un-fills, through a lost face and through a capture', () => {
  const next = random(20260916);
  let segments = empty();
  let lastFaceAt: number | null = 0;

  for (let frame = 1; frame <= 500; frame += 1) {
    const now = frame * 33;
    const before = segments.slice();
    const result = accrueDwell(segments, {
      face: face({
        yaw: (next() - 0.5) * 100,
        pitch: (next() - 0.5) * 40,
        roll: (next() - 0.5) * 30,
        cx: 200 + (next() - 0.5) * 80,
        width: 140 + next() * 100,
      }),
      target,
      now,
      lastFaceAt,
      running: true,
    });
    segments = result.segments;
    lastFaceAt = now;

    for (let i = 0; i < SWEEP_SEGMENTS; i += 1) {
      assert.ok(segments[i] >= before[i], `segment ${i} went backwards on frame ${frame}`);
    }
  }

  // A segment that reached full survives everything that happens next: a
  // face lost for two seconds, and a shutter that stops the stream dead.
  let held = empty();
  for (let frame = 1; frame <= 20; frame += 1) {
    held = accrueDwell(held, {
      face: face({ yaw: SEGMENT_CENTRES[2] }),
      target,
      now: frame * 33,
      lastFaceAt: (frame - 1) * 33,
      running: true,
    }).segments;
  }
  assert.ok(isFull(held[2]));

  const afterLoss = accrueDwell(held, {
    face: face({ yaw: SEGMENT_CENTRES[5] }),
    target,
    now: 20 * 33 + 2000,
    lastFaceAt: null,
    running: true,
  }).segments;
  assert.ok(isFull(afterLoss[2]));

  const afterCapture = accrueDwell(afterLoss, {
    face: face({ yaw: SEGMENT_CENTRES[5] }),
    target,
    now: 20 * 33 + 2900,
    lastFaceAt: 20 * 33 + 2000,
    running: true,
  }).segments;
  assert.ok(isFull(afterCapture[2]));
  assert.equal(afterCapture[5], DWELL_DT_CAP_MS);
});

test('dwell: the ring closes on 1760ms of usable time and not a millisecond before', () => {
  assert.equal(RING_CLOSED_MS, SWEEP_SEGMENTS * SEGMENT_DWELL_MS);
  assert.equal(RING_CLOSED_MS, 1760);

  let segments = empty();
  let accrued = 0;
  let now = 0;
  let lastFaceAt: number | null = null;

  for (const yaw of SEGMENT_CENTRES) {
    let inSegment = 0;
    while (inSegment < SEGMENT_DWELL_MS) {
      now += 20;
      const result = accrueDwell(segments, {
        face: face({ yaw }),
        target,
        now,
        lastFaceAt,
        running: true,
      });
      segments = result.segments;
      accrued += result.dt;
      inSegment += result.dt;
      lastFaceAt = now;
      if (accrued < RING_CLOSED_MS) assert.equal(ringClosed(segments), false);
    }
  }

  assert.equal(accrued, RING_CLOSED_MS);
  assert.equal(ringClosed(segments), true);
  assert.deepEqual(fillOf(segments), new Array(SWEEP_SEGMENTS).fill(1));

  // Half a turn is half a ring, exactly.
  const halfway = empty().map((_, i) => (i <= 3 ? SEGMENT_DWELL_MS : 0));
  assert.equal(ringClosed(halfway), false);
  assert.equal(fillOf(halfway).reduce((a, b) => a + b, 0), 4);
  assert.deepEqual(fillOf([110, 0, 0, 0, 0, 0, 0, 440]), [0.5, 0, 0, 0, 0, 0, 0, 1]);
});

/* ------------------------------ the fill lag --------------------------- */

test('fill: the 65ms lag reaches 63 per cent in one time constant and never overshoots', () => {
  assert.ok(Math.abs(lagStep(0, 1, FILL_LAG_MS) - (1 - Math.exp(-1))) < 1e-12);
  assert.equal(lagStep(0.4, 1, 0), 0.4);
  assert.equal(lagStep(0.4, 1, -10), 0.4);

  let shown = 0;
  for (let frame = 0; frame < 200; frame += 1) {
    const next = lagStep(shown, 1, 16);
    assert.ok(next > shown - 1e-12, 'the lag went backwards towards a rising target');
    assert.ok(next <= 1, 'the lag overshot its target');
    shown = next;
  }
  assert.ok(shown > 0.999);

  let falling = 1;
  for (let frame = 0; frame < 200; frame += 1) {
    const next = lagStep(falling, 0, 16);
    assert.ok(next < falling + 1e-12);
    assert.ok(next >= 0);
    falling = next;
  }

  const across = lagFills([0, 1, 0.5], [1, 1, 0], FILL_LAG_MS);
  assert.ok(Math.abs(across[0] - (1 - Math.exp(-1))) < 1e-12);
  assert.equal(across[1], 1);
  assert.ok(across[2] < 0.5 && across[2] > 0);
});

/* -------------------------------- the wells ---------------------------- */

test('wells: the three windows are disjoint, with fifteen degrees of daylight', () => {
  // The sweep restates the walk's own windows so it needs nothing from the
  // reducer at runtime. They must not drift apart.
  assert.equal(BAND.front.yawMax, POSE.front.yawMax);
  assert.equal(BAND.front.pitchMax, POSE.front.pitchMax);
  assert.equal(BAND.front.rollMax, POSE.front.rollMax);
  assert.equal(BAND.temple.yawMin, POSE.leftTemple.yawMin);
  assert.equal(BAND.temple.yawMax, POSE.leftTemple.yawMax);
  assert.equal(BAND.temple.pitchMax, POSE.leftTemple.pitchMax);
  assert.equal(BAND.temple.rollMax, POSE.leftTemple.rollMax);

  // The gap is why there is no arbitration rule to get wrong.
  assert.ok(POSE.leftTemple.yawMin - POSE.front.yawMax >= 15);

  const sets: WellTarget[][] = [
    Object.values(wellsFor()),
    Object.values(
      wellsFor({
        baseline: {
          front: pose(6, 8),
          leftTemple: pose(27, -9),
          rightTemple: pose(-46, 6),
        },
      }),
    ),
  ];

  for (const wells of sets) {
    for (let yaw = -60; yaw <= 60; yaw += 1) {
      for (let pitch = -20; pitch <= 20; pitch += 1) {
        for (let roll = -14; roll <= 14; roll += 2) {
          const claimed = wells.filter((well) => wellAccepts(well, pose(yaw, pitch, roll)));
          assert.ok(claimed.length <= 1, `${yaw}/${pitch}/${roll} satisfied ${claimed.length} wells`);
        }
      }
    }
  }
});

test('wells: a previous photograph moves the targets and narrows the windows', () => {
  const generic = wellsFor();

  assert.deepEqual(generic.front.target, { yaw: 0, pitch: 0 });
  assert.deepEqual(generic.front.tol, {
    yaw: BAND.front.yawMax,
    pitch: BAND.front.pitchMax,
    roll: BAND.front.rollMax,
  });
  assert.equal(generic.templeA.angle, 'leftTemple');
  assert.equal(generic.templeB.angle, 'rightTemple');
  assert.equal(generic.templeA.target.yaw, TEMPLE_TARGET_YAW);
  assert.equal(generic.templeB.target.yaw, -TEMPLE_TARGET_YAW);
  assert.equal(generic.templeA.tol.yaw, TEMPLE_TOL_YAW);
  assert.equal(generic.templeA.tol.pitch, BAND.temple.pitchMax);

  /*
    The turn the person is asked for, stated as a number rather than as
    itself. The mark on the ring is drawn at this target and it is the
    thing somebody turns towards, so it cannot be allowed to drift with
    the window it sits inside: the window is a range of turns a temple
    photograph may honestly be taken at, and it is not symmetric about
    the turn a neck does comfortably.
  */
  assert.equal(TEMPLE_TARGET_YAW, 35);
  assert.equal(TEMPLE_TOL_YAW, 11.5);
  assert.equal(theta(TEMPLE_TARGET_YAW), 150);
  assert.equal(theta(-TEMPLE_TARGET_YAW), -150);
  assert.equal(poseCost(pose(TEMPLE_TARGET_YAW), generic.templeA), 0);
  assert.equal(poseCost(pose(-TEMPLE_TARGET_YAW), generic.templeB), 0);

  // The tolerance reaches below the window, and the window wins: a
  // photograph at 24 degrees of turn is not a temple photograph however
  // near the target it measures.
  assert.ok(TEMPLE_TARGET_YAW - TEMPLE_TOL_YAW < BAND.temple.yawMin);
  assert.equal(wellAccepts(generic.templeA, pose(24)), false);
  assert.equal(wellAccepts(generic.templeA, pose(25)), true);
  assert.equal(wellAccepts(generic.templeA, pose(46)), true);
  assert.equal(wellAccepts(generic.templeA, pose(47)), false);

  // Month one defines the pose; every month after reproduces it.
  const matched = wellsFor({
    baseline: {
      front: pose(20, -30),
      leftTemple: pose(-60, 25),
    },
  });

  assert.deepEqual(matched.front.target, { yaw: 6, pitch: -8 });
  assert.deepEqual(matched.front.tol, {
    yaw: BASELINE_TOL_YAW,
    pitch: BASELINE_TOL_PITCH,
    roll: BAND.front.rollMax,
  });
  assert.equal(matched.templeA.target.yaw, -BAND.temple.yawMax);
  assert.equal(matched.templeA.target.pitch, 10);
  assert.equal(matched.templeA.tol.yaw, BASELINE_TOL_YAW);
  assert.equal(matched.templeA.tol.pitch, BASELINE_TOL_PITCH);

  // A head has two temples: the second well is always the other way round,
  // and it keeps the wide window because there is nothing to match yet.
  assert.equal(matched.templeB.target.yaw, TEMPLE_TARGET_YAW);
  assert.equal(matched.templeB.tol.yaw, TEMPLE_TOL_YAW);

  // Whichever way the detector signs a turn, the target stays a photograph
  // this angle could honestly be.
  for (let yaw = -90; yaw <= 90; yaw += 3) {
    if (yaw === 0) continue;
    const wells = wellsFor({ baseline: { leftTemple: pose(yaw, 0), rightTemple: pose(-yaw, 0) } });
    for (const key of ['templeA', 'templeB'] as const) {
      const magnitude = Math.abs(wells[key].target.yaw);
      assert.ok(magnitude >= BAND.temple.yawMin && magnitude <= BAND.temple.yawMax);
    }
    assert.equal(Math.sign(wells.templeA.target.yaw), -Math.sign(wells.templeB.target.yaw));
    const flipped = wellsFor({
      baseline: { leftTemple: pose(yaw, 0), rightTemple: pose(-yaw, 0) },
      signFlipped: true,
    });
    assert.equal(flipped.templeA.target.yaw, -wells.templeA.target.yaw);
    assert.equal(flipped.templeB.target.yaw, -wells.templeB.target.yaw);
  }

  // A window is never widened past the one the photograph has to sit in.
  const wide = wellsFor({ baseline: { front: pose(6, 8), leftTemple: pose(25, 10) } });
  assert.equal(wellAccepts(wide.front, pose(13, 0, 0)), false);
  assert.equal(wellAccepts(wide.templeA, pose(24, 0, 0)), false);
  assert.equal(wellAccepts(wide.templeA, pose(28, 0, 0)), true);
  assert.equal(wellAccepts(wide.templeA, pose(-28, 0, 0)), false);
});

test('wells: the cost is nothing at the target and one at each edge of the window', () => {
  for (const well of Object.values(wellsFor())) {
    const centre = pose(well.target.yaw, well.target.pitch, 0);
    assert.equal(poseCost(centre, well), 0);

    const edges: [Pose, string][] = [
      [pose(well.target.yaw + well.tol.yaw, well.target.pitch, 0), 'yaw'],
      [pose(well.target.yaw - well.tol.yaw, well.target.pitch, 0), 'yaw'],
      [pose(well.target.yaw, well.target.pitch + well.tol.pitch, 0), 'pitch'],
      [pose(well.target.yaw, well.target.pitch - well.tol.pitch, 0), 'pitch'],
      [pose(well.target.yaw, well.target.pitch, well.tol.roll), 'roll'],
      [pose(well.target.yaw, well.target.pitch, -well.tol.roll), 'roll'],
    ];
    for (const [edge, axis] of edges) {
      assert.ok(Math.abs(poseCost(edge, well) - 1) < 1e-12, `${well.key} at its ${axis} edge`);
    }

    // Symmetric: being off one way is exactly as far from the target as
    // being off the other.
    for (let off = 0.5; off <= 5; off += 0.5) {
      const over = poseCost(pose(well.target.yaw + off, well.target.pitch, 0), well);
      const under = poseCost(pose(well.target.yaw - off, well.target.pitch, 0), well);
      assert.ok(Math.abs(over - under) < 1e-12);
      assert.ok(over > 0);
    }
  }
});

/* ---------------------------- the motion gate -------------------------- */

test('motion: the gate needs all five frames, and drops only the phone term without a sensor', () => {
  const steady = [20, 20.3, 20.1, 20.4, 20.2];
  const base = {
    yawWindow: steady,
    facePace: 0.2,
    phoneStillSince: null,
    motionAvailable: false,
    now: 1000,
  };

  assert.equal(motionSteady(base), true);
  assert.equal(steady.length, MOTION_WINDOW);

  // Four good frames is not five.
  assert.equal(motionSteady({ ...base, yawWindow: steady.slice(1) }), false);
  assert.equal(motionSteady({ ...base, yawWindow: [] }), false);

  // One bad frame anywhere in the window is enough to refuse it.
  for (let i = 0; i < MOTION_WINDOW; i += 1) {
    const spoiled = steady.slice();
    spoiled[i] = spoiled[i] + SWEEP_YAW_STEP_MAX + 0.5;
    assert.equal(motionSteady({ ...base, yawWindow: spoiled }), false, `frame ${i} should have refused`);
  }

  // A steady drift: every step is small, but the head has still travelled.
  const drift = [20, 20.8, 21.6, 22.4, 23.2];
  assert.ok(drift[4] - drift[0] > SWEEP_YAW_RANGE_MAX);
  assert.equal(motionSteady({ ...base, yawWindow: drift }), false);

  // The face is moving across the frame even though the turn has stopped.
  assert.equal(motionSteady({ ...base, facePace: SWEEP_STILL_PACE }), false);
  assert.equal(motionSteady({ ...base, facePace: SWEEP_STILL_PACE - 0.01 }), true);

  // With an accelerometer the phone has to have settled too.
  const sensed = { ...base, motionAvailable: true };
  assert.equal(motionSteady(sensed), false);
  assert.equal(motionSteady({ ...sensed, phoneStillSince: 1000 - PHONE_STILL_MS + 1 }), false);
  assert.equal(motionSteady({ ...sensed, phoneStillSince: 1000 - PHONE_STILL_MS }), true);

  // The window keeps the last readings and nothing older.
  let window: number[] = [];
  for (let i = 0; i < 9; i += 1) window = pushYaw(window, i);
  assert.deepEqual(window, [4, 5, 6, 7, 8]);
});

/* ------------------------------ the settle ----------------------------- */

test('settle: the shutter waits 260ms, and up to 460ms while the pose is still improving', () => {
  assert.equal(settleReady({ settleSince: null, now: 9999, cost: 0.1, lastCost: 0.2 }), false);
  assert.equal(settleReady({ settleSince: 0, now: SETTLE_MS - 1, cost: 0.4, lastCost: null }), false);

  // Settled and going nowhere: take it.
  assert.equal(settleReady({ settleSince: 0, now: SETTLE_MS, cost: 0.4, lastCost: 0.4 }), true);

  // Still improving: wait for the bottom of the well, but not for ever.
  assert.equal(settleReady({ settleSince: 0, now: SETTLE_MS, cost: 0.3, lastCost: 0.4 }), false);
  assert.equal(settleReady({ settleSince: 0, now: SETTLE_MAX_MS, cost: 0.3, lastCost: 0.4 }), true);
  assert.equal(settleReady({ settleSince: 0, now: SETTLE_MAX_MS + 200, cost: 0.1, lastCost: 0.4 }), true);

  // Drifting away from the target is not a reason to keep waiting.
  assert.equal(settleReady({ settleSince: 0, now: SETTLE_MS, cost: 0.5, lastCost: 0.4 }), true);
});

/* --------------------- readings that cannot be read -------------------- */

test('unreadable: a turn that is not a number never opens a gate', () => {
  /*
    ML Kit withholds the Euler angles in some configurations and the
    camera hands on what it is given, so this frame does arrive. Every
    gate in the sweep is a list of reasons to refuse, and a comparison
    against a non-number is false, so without an explicit refusal an
    unreadable frame passes all of them at once — it reads as a head
    sitting exactly on target and perfectly still, which is the one
    combination that fires the shutter. The whole point of the sweep is
    that nobody is watching when it does.
  */
  const unreadable: number[] = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

  assert.equal(readablePose(pose(0, 0, 0)), true);
  for (const value of unreadable) {
    assert.equal(readablePose(pose(value, 0, 0)), false, `yaw ${value}`);
    assert.equal(readablePose(pose(0, value, 0)), false, `pitch ${value}`);
    assert.equal(readablePose(pose(0, 0, value)), false, `roll ${value}`);
  }

  // A missing nod or tilt is a head held level, which is a reading. A nod
  // that is not a number is not a reading at all.
  assert.equal(readableFace(face({ pitch: undefined, roll: undefined })), true);
  assert.deepEqual(poseOf(face({ pitch: undefined, roll: undefined })), pose(0, 0, 0));
  assert.equal(readableFace(face({ yaw: Number.NaN })), false);
  assert.equal(readableFace(face({ pitch: Number.NaN })), false);
  assert.equal(readableFace(face({ roll: Number.NaN })), false);

  const wells = wellsFor();

  for (const value of unreadable) {
    // The wells refuse it, so no well is ever the one the frame is in.
    for (const well of Object.values(wells)) {
      assert.equal(wellAccepts(well, pose(value, 0, 0)), false, `${well.key} yaw ${value}`);
      assert.equal(wellAccepts(well, pose(well.target.yaw, value, 0)), false);
      assert.equal(wellAccepts(well, pose(well.target.yaw, well.target.pitch, value)), false);
    }

    assert.equal(
      openWellFor({ wells: Object.values(wells), face: face({ yaw: value }), target }),
      null,
      `an unreadable turn was taken for the front at ${value}`,
    );

    // The ring learns nothing from it either, and its shape survives.
    assert.equal(dwellAccepts(face({ yaw: value }), target), false);
    const accrued = accrueDwell(empty(), {
      face: face({ yaw: value }),
      target,
      now: 33,
      lastFaceAt: 0,
      running: true,
    });
    assert.equal(accrued.index, null);
    assert.equal(accrued.dt, 0);
    assert.deepEqual(accrued.segments, empty());
    assert.equal(Object.keys(accrued.segments).length, SWEEP_SEGMENTS);
  }

  // And the shutter timer refuses a cost it cannot read, which is the
  // last place this can still be stopped.
  assert.equal(settleReady({ settleSince: 0, now: SETTLE_MAX_MS, cost: Number.NaN, lastCost: 1 }), false);
  assert.equal(settleReady({ settleSince: 0, now: SETTLE_MS, cost: Number.NaN, lastCost: null }), false);
});

test('unreadable: a hole in the motion window cannot hide a swing', () => {
  const base = {
    facePace: 0.1,
    phoneStillSince: null,
    motionAvailable: false,
    now: 1000,
  };

  // Nothing readable at all is not a still head.
  assert.equal(motionSteady({ ...base, yawWindow: [Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN] }), false);

  /*
    The case that matters. Both turn tests are comparisons — the step
    between neighbours, and the spread across the window — and a
    comparison against a non-number is false, so two unreadable frames
    placed either side of a forty-degree swing would report a head that
    had not moved. They do not.
  */
  assert.equal(motionSteady({ ...base, yawWindow: [0, Number.NaN, 40, Number.NaN, 0] }), false);
  assert.equal(motionSteady({ ...base, yawWindow: [20, 20.2, Number.NaN, 20.3, 20.1] }), false);
  assert.equal(motionSteady({ ...base, yawWindow: [20, 20.2, 20.4, 20.3, Number.POSITIVE_INFINITY] }), false);

  // A pace that cannot be read is not a face that is holding still.
  assert.equal(motionSteady({ ...base, yawWindow: [20, 20.2, 20.4, 20.3, 20.1], facePace: Number.NaN }), false);

  // The same window, readable, is the one the gate is meant to pass.
  assert.equal(motionSteady({ ...base, yawWindow: [20, 20.2, 20.4, 20.3, 20.1] }), true);
});

test('dwell: a malformed ring is refused rather than reshaped', () => {
  /*
    The ring is carried from frame to frame for the whole turn, so a
    single frame that writes outside the eight segments would leave a
    hole, or a ninth entry, that outlives it by ten seconds and reads as
    a segment which can never fill. Refusing costs one frame; reshaping
    costs the turn.
  */
  const short = accrueDwell([], {
    face: face({ yaw: 15 }),
    target,
    now: 33,
    lastFaceAt: 0,
    running: true,
  });
  assert.deepEqual(short.segments, []);
  assert.equal(short.index, null);
  assert.equal(short.dt, 0);

  const long = new Array<number>(SWEEP_SEGMENTS + 1).fill(0);
  assert.equal(accrueDwell(long, { face: face({ yaw: 15 }), target, now: 33, lastFaceAt: 0, running: true }).index, null);

  // A ring of the right shape keeps it, frame after frame, including
  // through the frames it refuses.
  let segments = empty();
  const next = random(20260917);
  for (let frame = 1; frame <= 200; frame += 1) {
    segments = accrueDwell(segments, {
      face: face({
        yaw: next() < 0.15 ? Number.NaN : (next() - 0.5) * 120,
        pitch: (next() - 0.5) * 40,
        roll: (next() - 0.5) * 30,
      }),
      target,
      now: frame * 33,
      lastFaceAt: (frame - 1) * 33,
      running: true,
    }).segments;
    assert.equal(segments.length, SWEEP_SEGMENTS);
    assert.equal(Object.keys(segments).length, SWEEP_SEGMENTS);
    for (const ms of segments) assert.ok(Number.isFinite(ms) && ms >= 0);
  }
  for (const value of fillOf(segments)) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
});

test('unreadable: a clock that is not a number stops the shutter and the ring', () => {
  /*
    The pose guards close the case where the head's position is unknown.
    The clock is the other input to the same subtractions, and it fails
    the same way: `held < SETTLE_MS` and `held >= SETTLE_MAX_MS` are both
    false of a number that is not a number, so the settle gate would fall
    through to firing, and `dt <= 0` is false too, so the dwell would be
    written as NaN into a segment the ring carries for the rest of the
    turn. Both must refuse instead.
  */
  assert.equal(settleReady({ settleSince: 0, now: Number.NaN, cost: 0.4, lastCost: null }), false);
  assert.equal(settleReady({ settleSince: Number.NaN, now: 500, cost: 0.4, lastCost: null }), false);
  // A readable clock at the same cost still fires, so the guard is the
  // only thing that changed.
  assert.equal(settleReady({ settleSince: 0, now: SETTLE_MAX_MS, cost: 0.4, lastCost: null }), true);

  const poisoned = accrueDwell(empty(), {
    face: face({ yaw: 15 }),
    target,
    now: Number.NaN,
    lastFaceAt: 0,
    running: true,
  });
  assert.equal(poisoned.dt, 0);
  assert.equal(poisoned.index, null);
  for (const ms of poisoned.segments) assert.equal(ms, 0);

  // And a cursor reading an unreadable turn holds its last position
  // rather than dispatching one that is not a number.
  const held = dispatchSegment({ theta: Number.NaN, current: 2, currentF: 2.4 });
  assert.deepEqual(held, { current: 2, currentF: 2.4, changed: false });
});
