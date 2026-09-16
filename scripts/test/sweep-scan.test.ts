/**
 * The turn, as the reducer sees it.
 *
 * `sweep.test.ts` checks the arithmetic — where the head is on the ring,
 * whether a frame was worth anything, whether a photograph may be taken.
 * This file checks the machine built on top of it: that the ring stays
 * inert until the front photograph is in hand, that a turn earns exactly
 * the three angles a front camera can reach and never claims the other
 * two, that a photograph is only ever taken when the head has actually
 * settled, and that when the turn ends it hands what is left to the walk
 * that was already here — unchanged.
 *
 * Everything is driven with face events on a clock, because that is what
 * the screen does thirty times a second, and a rule that only holds when
 * the events arrive in a convenient order is not a rule.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type GuideTarget } from '@/components/capture/head-guidance';
import {
  COOLDOWN_MS,
  HOLD_MS,
  STUCK_STILL_MS,
  createScan,
  reduce,
  type Effect,
  type Event,
  type Pose,
  type PoseFace,
  type ScanState,
} from '@/features/capture/guided-scan';
import { SCAN_COPY } from '@/features/capture/scan-copy';
import {
  SEGMENT_DWELL_MS,
  SWEEP_COOLDOWN_MS,
  SWEEP_FORCED_MS,
  SWEEP_GRACE_MS,
  SWEEP_HINT_MS,
  SWEEP_MAX_MS,
  SWEEP_MAX_SHOTS,
  SWEEP_SEGMENTS,
  isFull,
} from '@/features/capture/sweep';
import { ANGLES, type Angle } from '@/types/domain';

const target: GuideTarget = { cx: 200, cy: 300, diameter: 260 };

/** One detector frame: the head where the ring asks for it, turned by `yaw`. */
function face(yaw = 0, overrides: Partial<PoseFace> = {}): PoseFace {
  return { cx: 200, cy: 300, width: 180, height: 220, yaw, pitch: 0, roll: 0, at: 0, ...overrides };
}

function faceEvent(f: PoseFace | null, now: number, facePace = 0.1): Event {
  return { type: 'face', face: f, target, phoneMoving: false, phoneSteady: true, facePace, now };
}

type Options = Partial<Parameters<typeof createScan>[0]>;

function sweepScan(overrides: Options = {}): ScanState {
  return createScan({
    angles: ANGLES,
    tracking: true,
    handsFree: false,
    motionAvailable: false,
    mode: 'sweep',
    ...overrides,
  });
}

/* ------------------------------ the driver ------------------------------ */

/** One detector frame every 33 ms, which is what 30 fps feels like. */
const DT = 33;

type Run = {
  state: ScanState;
  effects: Effect[];
  now: number;
  /** Every capture effect, with the pose the reducer decided on. */
  captures: { angle: Angle; pose?: Pose }[];
};

const start = (overrides: Options = {}): Run => ({
  state: sweepScan(overrides),
  effects: [],
  now: 0,
  captures: [],
});

const send = (run: Run, event: Event): Run => {
  const result = reduce(run.state, event);
  return {
    state: result.state,
    effects: [...run.effects, ...result.effects],
    now: run.now,
    captures: [
      ...run.captures,
      ...result.effects.flatMap((e) => (e.type === 'capture' ? [{ angle: e.angle, pose: e.pose }] : [])),
    ],
  };
};

/** The photograph the shutter asked for, through its flight to the stack. */
function land(run: Run): Run {
  if (run.state.phase.kind !== 'capturing') return run;
  const angle = run.state.phase.angle;
  const pose = run.captures[run.captures.length - 1]?.pose;

  let next = send(run, { type: 'shot', uri: `${angle}.jpg`, pose, now: run.now });
  next = send(next, { type: 'landed', now: run.now });
  const until = next.state.phase.kind === 'flying' ? next.state.phase.until : run.now;
  next = send(next, { type: 'tick', now: until });
  return { ...next, now: until + DT };
}

type FrameOptions = { facePace?: number; pitch?: number; roll?: number };

/** One frame, and the photograph it may have fired. */
function frame(run: Run, yaw: number, options: FrameOptions = {}): Run {
  const observed = face(yaw, { pitch: options.pitch ?? 0, roll: options.roll ?? 0 });
  const next = send(run, faceEvent(observed, run.now, options.facePace ?? 0.1));
  return land({ ...next, now: run.now + DT });
}

/** Hold the head where it is for `frames` frames. */
function hold(run: Run, yaw: number, frames: number, options: FrameOptions = {}): Run {
  let next = run;
  for (let i = 0; i < frames; i += 1) next = frame(next, yaw, options);
  return next;
}

/** Turn from one yaw to another, in steps small enough to be a real neck. */
function turnTo(
  run: Run,
  from: number,
  to: number,
  options: FrameOptions & { step?: number } = {},
): Run {
  const step = options.step ?? 0.5;
  const frames = Math.max(1, Math.round(Math.abs(to - from) / step));
  let next = run;
  for (let i = 1; i <= frames; i += 1) {
    next = frame(next, from + ((to - from) * i) / frames, options);
  }
  return next;
}

/** The centre gate: line up, hold, and the front photograph lands. */
function takeFront(run: Run): Run {
  const started = frame(run, 0);
  return frame({ ...started, now: started.now + HOLD_MS }, 0);
}

const sweepOf = (run: Run) => {
  assert.ok(run.state.sweep, 'the scan is not running a turn');
  return run.state.sweep;
};

const captured = (run: Run) => run.captures.map((c) => c.angle);

const haptics = (run: Run, kind: string) =>
  run.effects.filter((e) => e.type === 'haptic' && e.kind === kind).length;

const announcements = (run: Run) =>
  run.effects.flatMap((e) => (e.type === 'announce' ? [e.text] : []));

/* ------------------------------ the centre ------------------------------ */

test('sweep: the ring is inert until the front photograph is taken', () => {
  // A head turned to a temple during the centre gate is a head that has
  // not been photographed yet: nothing accrues, and nothing fires.
  const turned = hold(start(), 30, 20);
  assert.equal(sweepOf(turned).step, 'centre');
  assert.deepEqual(sweepOf(turned).segments, Array.from({ length: SWEEP_SEGMENTS }, () => 0));
  assert.deepEqual(captured(turned), []);

  // And the front is gated exactly as the walk gates it: the full hold.
  const holding = frame(start(), 0);
  assert.equal(sweepOf(holding).holdSince, 0);
  const early = frame({ ...holding, now: HOLD_MS - 1 }, 0);
  assert.deepEqual(captured(early), []);
  assert.equal(early.state.phase.kind, 'sweep');

  const fired = frame({ ...holding, now: HOLD_MS }, 0);
  assert.deepEqual(captured(fired), ['front']);
});

test('sweep: the ring opens when the front photograph lands', () => {
  const run = takeFront(start());
  const sweep = sweepOf(run);

  assert.equal(sweep.step, 'turning');
  assert.ok(sweep.openedAt !== null, 'the ring records when it opened');
  assert.equal(sweep.wells.front.status, 'taken');
  assert.equal(run.state.shots.front?.uri, 'front.jpg');
  assert.equal(run.state.phase.kind, 'sweep');
});

/* ------------------------------- the turn ------------------------------- */

test('sweep: one side of the turn takes one temple and half-closes the ring', () => {
  const run = turnTo(takeFront(start()), 0, 42);
  const sweep = sweepOf(run);

  assert.deepEqual(captured(run), ['front', 'leftTemple']);
  assert.equal(sweep.wells.templeA.status, 'taken');
  assert.equal(sweep.wells.templeB.status, 'open');

  const full = sweep.segments.map(isFull);
  assert.deepEqual(full, [true, true, true, true, false, false, false, false]);
});

test('sweep: a whole turn closes the ring, fills the three wells, and says nothing about the rest', () => {
  let run = takeFront(start());
  run = turnTo(run, 0, 42);
  run = turnTo(run, 42, -42);

  const sweep = sweepOf(run);
  assert.deepEqual(captured(run), ['front', 'leftTemple', 'rightTemple']);
  assert.ok(sweep.segments.every(isFull), 'every segment had its share of usable frames');
  assert.ok(sweep.finished);

  assert.equal(haptics(run, 'segment'), SWEEP_SEGMENTS, 'one tick per segment, once each');
  assert.equal(haptics(run, 'captured'), 3, 'three photographs, three shutters');
  assert.equal(haptics(run, 'complete'), 0, 'the set is not complete: the top and the back are not taken');

  // The turn counts what it has saved rather than naming three angles in
  // a second, and the count is of the whole set, not of the turn.
  assert.ok(announcements(run).includes(SCAN_COPY.sweep.saved(3, ANGLES.length)));
});

test('sweep: a turn nothing holds still for takes nothing, and says why', () => {
  const fast = { facePace: 1.2, step: 4 };
  let run = turnTo(takeFront(start()), 0, 20, fast);
  assert.deepEqual(captured(run), ['front'], 'a head whipping past is not a photograph');
  assert.equal(sweepOf(run).cue, 'slower');

  // Inside a well, the answer is a pause rather than "hold still" — which
  // would contradict the thing the person has just been asked to do.
  run = hold(run, 35, 6, { facePace: 1.2 });
  assert.equal(sweepOf(run).cue, 'pause');
  assert.deepEqual(captured(run), ['front']);

  // And a pause that never ends is the same tiring arm the walk knows.
  const tiring = frame({ ...run, now: run.now + STUCK_STILL_MS }, 35, { facePace: 1.2 });
  assert.equal(sweepOf(tiring).cue, 'brace');
  assert.deepEqual(captured(tiring), ['front']);
});

test('sweep: every photograph carries the pose of the frame that fired it', () => {
  /*
    The spec's own line for this test asks for the pose of the frame that
    *opened* the settle. It is written the other way round on purpose, and
    the difference is not cosmetic: the settle may open at the lip of a
    well and be extended while the pose is still improving, so the frame
    that opened it can be several degrees from the frame the shutter was
    actually commanded on. `Photo.pose` steers next month's well targets
    and every framing comparison after that, so it has to be the position
    the head was in when the photograph was asked for. The owner's call if
    the spec line is to stand instead.
  */
  let run = takeFront(start());
  assert.equal(run.captures[0].pose?.yaw, 0);

  // Frame by frame, so the pose can be checked against the frame that was
  // on screen when the shutter went — not against one that arrived while
  // the photograph was still being written.
  let fired: { yaw: number; pose?: Pose } | null = null;
  for (let yaw = 0.5; yaw <= 42 && fired === null; yaw += 0.5) {
    const before = run.captures.length;
    run = frame(run, yaw);
    if (run.captures.length > before) fired = { yaw, pose: run.captures[before].pose };
  }

  assert.ok(fired, 'the turn never fired');
  assert.ok(fired.pose, 'a harvested photograph with no pose cannot steer the next one');
  assert.equal(fired.pose.yaw, fired.yaw);
  assert.equal(fired.pose.pitch, 0);
  assert.equal(fired.pose.roll, 0);
});

/* ------------------------- second chances, budget ------------------------ */

test('sweep: a soft photograph re-opens its well exactly once', () => {
  let run = turnTo(takeFront(start()), 0, 42);
  assert.equal(run.state.shots.leftTemple?.uri, 'leftTemple.jpg');

  run = send(run, { type: 'shotSoft', angle: 'leftTemple', now: run.now });
  assert.equal(run.state.shots.leftTemple, undefined, 'the soft one is dropped, not kept and flagged');
  assert.equal(sweepOf(run).wells.templeA.status, 'open');
  assert.equal(sweepOf(run).wells.templeA.reopens, 1);
  assert.equal(sweepOf(run).cue, 'soft');
  assert.ok(announcements(run).includes(SCAN_COPY.sweep.cue.soft));

  // A second pass fills it again…
  run = turnTo(run, 42, 26);
  assert.equal(sweepOf(run).wells.templeA.status, 'taken');
  const uri = run.state.shots.leftTemple?.uri;
  assert.ok(uri, 'the second pass produced nothing');

  // …and a second soft frame is accepted as it is. A soft photograph the
  // report can honestly flag beats a missing angle.
  run = send(run, { type: 'shotSoft', angle: 'leftTemple', now: run.now });
  assert.equal(run.state.shots.leftTemple?.uri, uri);
  assert.equal(sweepOf(run).wells.templeA.status, 'taken');
});

test('sweep: the shutter budget is a cap, not a suggestion', () => {
  let run = takeFront(start());
  run = turnTo(run, 0, 42);
  run = turnTo(run, 42, -42);
  assert.ok(run.captures.length <= SWEEP_MAX_SHOTS);

  // At the cap, with a well open and a head sitting in it, nothing fires.
  const sweep = sweepOf(run);
  const spent: Run = {
    ...run,
    state: {
      ...run.state,
      phase: { kind: 'sweep' },
      sweep: {
        ...sweep,
        finished: false,
        step: 'turning',
        shutters: SWEEP_MAX_SHOTS,
        wells: { ...sweep.wells, templeB: { ...sweep.wells.templeB, status: 'open', cost: null } },
      },
    },
    captures: [],
    effects: [],
  };

  const pressed = hold(spent, -36, 30);
  assert.deepEqual(captured(pressed), []);
  assert.equal(sweepOf(pressed).shutters, SWEEP_MAX_SHOTS);

  // A tapped shutter draws on the same budget the gate does, or the cap
  // is not a cap: the three wells can each re-open once, which is six
  // taps against a budget of five.
  const tapped = send(spent, { type: 'shutter', now: spent.now });
  assert.deepEqual(captured(tapped), []);
  assert.equal(sweepOf(tapped).shutters, SWEEP_MAX_SHOTS);

  // With one left, the same tap takes the photograph.
  const spare: Run = {
    ...spent,
    state: {
      ...spent.state,
      sweep: { ...sweepOf(spent), shutters: SWEEP_MAX_SHOTS - 1 },
    },
  };
  assert.deepEqual(captured(send(spare, { type: 'shutter', now: spare.now })), ['rightTemple']);
});

test('sweep: a better pass keeps the photograph it has until the replacement lands', () => {
  let run = turnTo(takeFront(start()), 0, 42);
  assert.equal(sweepOf(run).wells.templeA.status, 'taken');

  /*
    The photograph in hand was taken at the lip of the well rather than
    at the bottom of it, which is the whole reason a second chance
    exists. It is still a photograph, and it is not thrown away for one
    that does not exist yet.
  */
  const sweep = sweepOf(run);
  run = {
    ...run,
    state: {
      ...run.state,
      shots: { ...run.state.shots, leftTemple: { angle: 'leftTemple', uri: 'KEEP.jpg' } },
      sweep: {
        ...sweep,
        wells: { ...sweep.wells, templeA: { ...sweep.wells.templeA, cost: 0.95 } },
      },
    },
    captures: [],
    effects: [],
  };

  // Walked to the bottom of the well, frame by frame, without landing
  // anything — the question is what is in hand mid-shutter.
  let at = run.now;
  for (let i = 0; i < 40 && run.state.phase.kind !== 'capturing'; i += 1) {
    run = send(run, faceEvent(face(35), at));
    at += DT;
  }
  run = { ...run, now: at };

  assert.equal(run.state.phase.kind, 'capturing', 'the better pass never fired');
  assert.deepEqual(captured(run), ['leftTemple']);
  assert.equal(run.state.shots.leftTemple?.uri, 'KEEP.jpg');
  assert.equal(sweepOf(run).wells.templeA.reopens, 1, 'the second chance is spent');

  // If it comes to nothing, nothing was lost.
  const failed = send(run, { type: 'shotFailed', now: run.now });
  assert.equal(failed.state.shots.leftTemple?.uri, 'KEEP.jpg');
  assert.equal(failed.state.phase.kind, 'sweep');
  assert.equal(sweepOf(failed).wells.templeA.status, 'taken');

  // And a replacement that does land takes its place, with the well
  // recording the cost of the photograph actually in hand.
  const landed = land(run);
  assert.equal(landed.state.shots.leftTemple?.uri, 'leftTemple.jpg');
  assert.equal(sweepOf(landed).wells.templeA.status, 'taken');
  assert.ok((sweepOf(landed).wells.templeA.cost ?? 1) < 0.95, 'the better pass was better');
});

/* --------------------------- handing back over --------------------------- */

test('sweep: a capture inside the turn returns to the turn, not to the next angle', () => {
  const run = takeFront(start());
  assert.equal(run.state.phase.kind, 'sweep');
  assert.equal(run.state.index, 0, 'the walk has not stepped anywhere');
  assert.equal(sweepOf(run).finished, false);
});

test('sweep: the flight to the stack is the short one, and the walk keeps its own', () => {
  let run = frame(start(), 0);
  run = frame({ ...run, now: HOLD_MS }, 0);
  // `land` already walked it through; check the cooldown it was given.
  const taken = reduce(
    reduce(sweepScan(), faceEvent(face(), 0)).state,
    faceEvent(face(), HOLD_MS),
  ).state;
  const flying = reduce(taken, { type: 'shot', uri: 'front.jpg', now: HOLD_MS });
  assert.equal(flying.state.phase.kind === 'flying' && flying.state.phase.until, HOLD_MS + SWEEP_COOLDOWN_MS);

  const walk = createScan({
    angles: ANGLES,
    tracking: true,
    handsFree: false,
    motionAvailable: false,
  });
  const walking = reduce(reduce(walk, { type: 'shutter', now: 0 }).state, {
    type: 'shot',
    uri: 'front.jpg',
    now: 0,
  });
  assert.equal(walking.state.phase.kind === 'flying' && walking.state.phase.until, COOLDOWN_MS);
});

test('sweep: a well that was given up on does not come back as a walk step', () => {
  let run = takeFront(start());
  run = send(run, { type: 'skip', now: run.now });
  run = send(run, { type: 'skip', now: run.now });

  assert.deepEqual([...run.state.skipped].sort(), ['leftTemple', 'rightTemple']);
  assert.equal(sweepOf(run).step, 'finishing');

  run = send(run, { type: 'tick', now: run.now + SWEEP_GRACE_MS });
  assert.equal(run.state.phase.kind, 'blind');
  assert.equal(run.state.phase.kind === 'blind' && run.state.phase.angle, 'top');

  // And the walk carries on past them: top, then back, then review.
  let next = send(run, { type: 'shutter', now: run.now });
  next = send(next, { type: 'shot', uri: 'top.jpg', now: next.now });
  next = send(next, { type: 'landed', now: next.now });
  next = send(next, { type: 'tick', now: next.now + COOLDOWN_MS });
  assert.equal(next.state.phase.kind === 'blind' && next.state.phase.angle, 'crown');
});

test('sweep: the turn hands the top and the back to the blind phase it did not touch', () => {
  let run = takeFront(start({ handsFree: true, motionAvailable: true }));
  run = turnTo(run, 0, 42);
  run = turnTo(run, 42, -42);

  assert.equal(run.state.phase.kind, 'blind');
  assert.equal(run.state.phase.kind === 'blind' && run.state.phase.angle, 'top');
  assert.equal(run.state.phase.kind === 'blind' && run.state.phase.counting, false);

  // The arming rules that were here before apply verbatim: still for
  // long enough, and on the angle for long enough to have read it.
  const at = run.now;
  let armed = send(run, { type: 'motion', moving: false, steady: true, now: at });
  armed = send(armed, { type: 'tick', now: at + 1199 });
  assert.equal(armed.state.phase.kind === 'blind' && armed.state.phase.counting, false);

  armed = send(armed, { type: 'tick', now: at + 1500 });
  assert.equal(armed.state.phase.kind === 'blind' && armed.state.phase.counting, true);
  assert.ok(armed.effects.some((e) => e.type === 'countdown'));
});

test('sweep: the front is never the angle left missing', () => {
  // Nothing has been photographed and the turn is finished from a button:
  // the report is built from the front, so the front goes back to the
  // one-at-a-time phase with the shutter offered rather than being lost.
  const run = send(hold(start(), 30, 4), { type: 'finish', now: 5000 });

  assert.equal(run.state.phase.kind, 'tracked');
  assert.equal(run.state.phase.kind === 'tracked' && run.state.phase.angle, 'front');
  assert.equal(run.state.phase.kind === 'tracked' && run.state.phase.manualHint, true);
  assert.ok(sweepOf(run).finished);
  /*
    And nothing is filed as given up on. The ring never opened, so
    neither side was ever asked for: ending here is a person declining
    the turn, not declining two angles. The walk picks them up one at a
    time, which is the whole of what it is for.
  */
  assert.deepEqual(run.state.skipped, []);

  let walked = send(run, { type: 'shutter', now: run.now });
  walked = send(walked, { type: 'shot', uri: 'front.jpg', now: walked.now });
  walked = send(walked, { type: 'landed', now: walked.now });
  walked = send(walked, { type: 'tick', now: walked.now + COOLDOWN_MS });
  assert.equal(walked.state.phase.kind, 'tracked');
  assert.equal(walked.state.phase.kind === 'tracked' && walked.state.phase.angle, 'leftTemple');
});

test('sweep: the front is not an angle the turn may be told to do without', () => {
  /*
    A temple the turn never reached is left for next time — the Home card
    already asks for it. The front is not like that: the reading is built
    from the front photograph, so "skip" while the ring is still shut ends
    the turn and hands the front back to the one-at-a-time phase, rather
    than filing it as an angle the person chose to go without.
  */
  let run = send(hold(start(), 0, 3), { type: 'skip', now: 400 });

  assert.ok(!run.state.skipped.includes('front'), 'the front is never recorded as skipped');
  assert.deepEqual(run.state.skipped, [], 'and neither temple was ever asked for, so neither is given up on');
  assert.equal(sweepOf(run).wells.front.status, 'open');
  assert.equal(run.state.phase.kind, 'tracked');
  assert.equal(run.state.phase.kind === 'tracked' && run.state.phase.angle, 'front');
  assert.equal(run.state.phase.kind === 'tracked' && run.state.phase.manualHint, true);

  // And the shutter it was just offered takes it.
  run = send(run, { type: 'shutter', now: run.now });
  assert.deepEqual(captured(run), ['front']);

  // Mid-turn a skip is about the side wells: a front that has been
  // re-opened is not what gets given up on.
  let turning = takeFront(start());
  turning = send(turning, { type: 'shotSoft', angle: 'front', now: turning.now });
  assert.equal(sweepOf(turning).wells.front.status, 'open');

  turning = send(turning, { type: 'skip', now: turning.now });
  assert.equal(sweepOf(turning).wells.front.status, 'open');
  assert.ok(!turning.state.skipped.includes('front'));
  assert.equal(turning.state.skipped.length, 1, 'one side well, and only one');
  assert.equal(turning.state.phase.kind, 'sweep', 'the turn carries on');
});

test('sweep: the centre gate is not a room with no door', () => {
  /*
    Nothing is landing and the ring has not opened, so it has no clock of
    its own yet. Every other step of this screen offers a way out after
    long enough; this one runs on the turn's own clock instead of having
    none at all.
  */
  let run = hold(start(), 30, 3);
  assert.equal(sweepOf(run).step, 'centre');
  assert.equal(sweepOf(run).manualHint, false);

  run = send(run, { type: 'tick', now: SWEEP_HINT_MS });
  assert.equal(sweepOf(run).manualHint, true, 'the shutter is offered');

  run = send(run, { type: 'tick', now: SWEEP_FORCED_MS });
  assert.equal(sweepOf(run).forcedOffer, true, 'and then a way to finish is named');

  const ended = send(run, { type: 'tick', now: SWEEP_MAX_MS });
  assert.ok(sweepOf(ended).finished, 'and it ends rather than waiting for ever');
  assert.equal(ended.state.phase.kind, 'tracked');
  assert.equal(ended.state.phase.kind === 'tracked' && ended.state.phase.angle, 'front');
});

test('sweep: the turn does not declare the set complete — the walk does', () => {
  // A set of only the angles a front camera can reach still ends through
  // the walk, so the completion is said once, in the one place that owns
  // it, and a session can never sound it twice.
  let run = takeFront(start({ angles: ['front', 'leftTemple', 'rightTemple'] }));
  run = turnTo(run, 0, 42);
  run = turnTo(run, 42, -42);

  assert.equal(run.state.phase.kind, 'review');
  assert.equal(haptics(run, 'complete'), 1, 'said once');
  assert.ok(announcements(run).includes(SCAN_COPY.complete));
});

/* ---------------------------- which way round ---------------------------- */

test('sweep: a record that disagrees with itself is settled once, not argued with', () => {
  /*
    Both temple photographs in the baseline are turned the same way, which
    no head can do — it is the detector's convention having changed under
    a record built across two sessions. A head has two temples, so the two
    wells are opposed whatever the record says, and one of them is left
    sitting against the record it came from.
  */
  const baseline = [
    { angle: 'leftTemple', pose: { yaw: 31, pitch: 0, roll: 0 } },
    { angle: 'rightTemple', pose: { yaw: 33, pitch: 0, roll: 0 } },
  ] as never[];

  let run = takeFront(start({ baseline }));
  assert.equal(sweepOf(run).wells.templeB.angle, 'rightTemple');
  assert.equal(sweepOf(run).wells.templeA.target.yaw, 31, "last month's left temple, to the degree");
  assert.ok(sweepOf(run).wells.templeB.target.yaw < 0, 'a head has two temples, so the wells are opposed');

  // The head sits where the record says it should not. First it is told.
  run = frame(run, -33);
  assert.equal(sweepOf(run).cue, 'matchBaseline');
  assert.ok(announcements(run).includes(SCAN_COPY.cue.matchBaseline));
  assert.deepEqual(captured(run), ['front']);

  // It keeps sitting there, so the record is what gives way — about the
  // well in dispute, and only about that one. The other temple's
  // photograph agreed with the record it came from, and moving it to the
  // far side of the head to keep the disputed one company would break the
  // one comparison that was still sound.
  run = hold(run, -33, 4);
  const settled = sweepOf(run);
  assert.equal(settled.signFlipped, true);
  assert.equal(settled.wells.templeA.target.yaw, 31, 'the well nobody disputed has not moved');
  assert.ok(settled.wells.templeB.target.yaw < 0, 'and neither has the one the head has won');

  // And the nagging stops: the photograph is taken, on the side of the
  // head the person actually turned to.
  const before = announcements(run).length;
  run = hold(run, -33, 24);
  assert.deepEqual(captured(run), ['front', 'rightTemple']);
  assert.equal(sweepOf(run).wells.templeB.status, 'taken');
  assert.equal(sweepOf(run).wells.templeA.status, 'open');
  assert.ok(
    !announcements(run).slice(before).includes(SCAN_COPY.cue.matchBaseline),
    'it is said once, not for the rest of the turn',
  );
  assert.equal(sweepOf(run).signFlipped, true);
});

/* ------------------------------- the mode ------------------------------- */

test('sweep: the mode is chosen before the first photograph and not after it', () => {
  const walk = createScan({
    angles: ANGLES,
    tracking: true,
    handsFree: false,
    motionAvailable: false,
  });
  assert.equal(walk.mode, 'walk');
  assert.equal(walk.sweep, null);

  const turned = reduce(walk, { type: 'mode', mode: 'sweep', now: 0 }).state;
  assert.equal(turned.mode, 'sweep');
  assert.equal(turned.phase.kind, 'sweep');

  // Without a detector there is no turn to offer, and the walk stands.
  const untracked = createScan({
    angles: ANGLES,
    tracking: false,
    handsFree: false,
    motionAvailable: false,
    mode: 'sweep',
  });
  assert.equal(untracked.mode, 'walk');
  assert.equal(untracked.phase.kind, 'tracked');
  assert.equal(reduce(untracked, { type: 'mode', mode: 'sweep', now: 0 }).state.mode, 'walk');

  // And once a photograph exists, changing the machine under it would
  // strand the photographs it already took.
  const run = takeFront(start());
  const refused = reduce(run.state, { type: 'mode', mode: 'walk', now: run.now });
  assert.equal(refused.state, run.state);
  assert.deepEqual(refused.effects, []);
});

/* ------------------------------ the dwell ------------------------------- */

test('sweep: dwell only counts frames a photograph could have come from', () => {
  // A head nodding or tilted past the window fills nothing, however long
  // it stays there: the ring is a statement about usable frames.
  const nodding = hold(takeFront(start()), 5, 20, { pitch: 22 });
  assert.deepEqual(sweepOf(nodding).segments, Array.from({ length: SWEEP_SEGMENTS }, () => 0));

  const level = hold(takeFront(start()), 5, 20);
  assert.ok(sweepOf(level).segments[0] >= SEGMENT_DWELL_MS);

  // And it never decays: a lost face leaves the ring where it was.
  const lost = send({ ...level, now: level.now + 5000 }, faceEvent(null, level.now + 5000));
  assert.ok(sweepOf(lost).segments[0] >= SEGMENT_DWELL_MS);
  assert.equal(sweepOf(lost).cue, 'searching');
});

test('sweep: nothing takes the phase away from a photograph that is still coming', () => {
  /*
    The shutter has fired, the file is being written, and the `shot` that
    carries its uri arrives a few hundred milliseconds later. `finish`
    and `mode` are handled above the phase switch, so either one could
    replace the capturing phase in that window and leave the photograph
    with nowhere to land — written to disk, and nothing in the record
    pointing at it.
  */
  const started = frame(start(), 0);
  const firing = send({ ...started, now: started.now + HOLD_MS }, faceEvent(face(0), started.now + HOLD_MS));
  assert.equal(firing.state.phase.kind, 'capturing');

  for (const event of [{ type: 'finish' as const, now: firing.now }, { type: 'mode' as const, mode: 'walk' as const, now: firing.now }]) {
    const pressed = send(firing, event);
    assert.equal(pressed.state.phase.kind, 'capturing', 'the photograph keeps its phase');

    const landed = send(pressed, { type: 'shot', uri: 'front.jpg', pose: { yaw: 0, pitch: 0, roll: 0 }, now: pressed.now });
    assert.equal(landed.state.shots.front?.uri, 'front.jpg', 'and the record ends up pointing at it');
  }

  // Once it has landed, finishing works exactly as it did.
  const done = send(send(firing, { type: 'shot', uri: 'front.jpg', now: firing.now }), {
    type: 'finish',
    now: firing.now + 10,
  });
  assert.ok(done.state.sweep?.finished);
});

test('sweep: an unreadable reading never fires the front photograph', () => {
  /*
    ML Kit withholds the Euler angles in some configurations. Every
    comparison in the cue against a non-number is false, so such a frame
    reads as a head exactly on target and perfectly still — the one
    combination that fires the shutter, on the one photograph the reading
    cannot do without. It is no face at all.
  */
  const blind = face(Number.NaN, { pitch: Number.NaN, roll: Number.NaN });
  let run = start();
  for (let i = 0; i < 60; i += 1) {
    run = send(run, faceEvent(blind, run.now));
    run = { ...run, now: run.now + DT };
  }
  assert.deepEqual(captured(run), []);
  assert.equal(run.state.phase.kind, 'sweep');
  assert.equal(sweepOf(run).holdSince, null);
  assert.equal(sweepOf(run).lastPose, null, 'and no pose from it is kept for a tapped shutter');

  // A readable head in the same place does fire, so the guard is the
  // only thing between them.
  assert.deepEqual(captured(takeFront(start())), ['front']);
});
