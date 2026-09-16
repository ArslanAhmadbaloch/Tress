/**
 * The guided scan has to be right about the room it cannot see.
 *
 * It fires the shutter on its own, so every rule about when it may do
 * that — how long a pose has been held, whether the phone has settled,
 * whether the countdown was armed behind a preference the person set —
 * is checked here, on a machine with no camera and no hands. A reducer
 * that took the photograph half a second early would be invisible in a
 * demo and obvious in the photographs a month later.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { tracksFace, type GuideTarget } from '@/components/capture/head-guidance';
import {
  BLIND_COUNTDOWN,
  COOLDOWN_MS,
  HOLD_MS,
  createScan,
  currentAngle,
  holdProgress,
  orderFor,
  poseCue,
  reduce,
  remaining,
  type Effect,
  type Event,
  type PoseFace,
  type ScanState,
} from '@/features/capture/guided-scan';
import { SCAN_COPY } from '@/features/capture/scan-copy';
import { ANGLES, type Angle } from '@/types/domain';

const target: GuideTarget = { cx: 200, cy: 300, diameter: 260 };

/** A face sitting where the ring asks for it: right size, centred, square on. */
function face(overrides: Partial<PoseFace> = {}): PoseFace {
  return { cx: 200, cy: 300, width: 180, height: 220, yaw: 0, pitch: 0, roll: 0, at: 0, ...overrides };
}

const ev = {
  face: (f: PoseFace | null, now: number, extra: Partial<Extract<Event, { type: 'face' }>> = {}) =>
    ({
      type: 'face',
      face: f,
      target,
      phoneMoving: false,
      phoneSteady: true,
      facePace: 0.2,
      now,
      ...extra,
    }) as Event,
};

function scan(overrides: Partial<Parameters<typeof createScan>[0]> = {}): ScanState {
  return createScan({
    angles: ANGLES,
    tracking: true,
    handsFree: false,
    motionAvailable: false,
    ...overrides,
  });
}

const has = (effects: Effect[], type: Effect['type']) => effects.some((e) => e.type === type);

/** Shutter, shot, landed, cooldown: one angle taken the manual way. */
function shoot(state: ScanState, at: number, uri = `file-${at}`): ScanState {
  let next = reduce(state, { type: 'shutter', now: at }).state;
  next = reduce(next, { type: 'shot', uri, now: at }).state;
  next = reduce(next, { type: 'landed', now: at }).state;
  return reduce(next, { type: 'tick', now: at + COOLDOWN_MS }).state;
}

const cue = (state: ScanState) => (state.phase.kind === 'tracked' ? state.phase.cue : null);

/* ------------------------------ the order ------------------------------ */

test('order: tracked angles first, then the rest, rotated to the chosen start', () => {
  assert.deepEqual(orderFor(ANGLES), ['front', 'leftTemple', 'rightTemple', 'top', 'crown']);
  assert.deepEqual(orderFor(['top', 'crown']), ['top', 'crown']);
  assert.deepEqual(orderFor(['front']), ['front']);
  assert.deepEqual(orderFor(['crown', 'front']), ['front', 'crown']);

  assert.deepEqual(orderFor(['top', 'crown', 'front'], 'crown'), ['crown', 'front', 'top']);
  assert.deepEqual(orderFor(ANGLES, 'leftTemple'), [
    'leftTemple',
    'rightTemple',
    'top',
    'crown',
    'front',
  ]);
  assert.deepEqual(orderFor(ANGLES, 'front'), orderFor(ANGLES));
  assert.deepEqual(orderFor(['front'], 'crown'), ['front']);
});

test('order: a rotated scan still ends with every angle taken', () => {
  let state = scan({ startAt: 'leftTemple' });
  assert.equal(currentAngle(state), 'leftTemple');
  assert.equal(state.index, 0);
  assert.deepEqual(remaining(state), state.order);

  for (let i = 0; i < ANGLES.length; i += 1) state = shoot(state, i * 10_000);

  assert.equal(state.phase.kind, 'review');
  assert.deepEqual(Object.keys(state.shots).sort(), [...ANGLES].sort());
  assert.deepEqual(remaining(state), []);
});

test('order: retake outside review changes nothing', () => {
  const state = scan();
  const result = reduce(state, { type: 'retake', angle: 'front', now: 0 });
  assert.equal(result.state, state);
  assert.deepEqual(result.effects, []);
});

/* ------------------------------ the pose ------------------------------- */

test('pose: the front gate names one thing to fix at a time', () => {
  const ask = (f: Partial<PoseFace>, extra: { phoneSteady?: boolean; facePace?: number } = {}) =>
    poseCue({
      face: face(f),
      target,
      angle: 'front',
      sign: null,
      phoneMoving: false,
      phoneSteady: extra.phoneSteady ?? true,
      facePace: extra.facePace ?? 0.2,
    });

  assert.equal(ask({ yaw: 9, pitch: 11, roll: 9 }), 'hold');
  assert.equal(ask({ yaw: 11 }), 'lookStraight');
  assert.equal(ask({ pitch: -14 }), 'chinLevel');
  assert.equal(ask({ roll: 12 }), 'headLevel');
  assert.equal(ask({ width: 100 }), 'closer');
  assert.equal(ask({ width: 300 }), 'back');
  assert.equal(ask({ cx: 260 }), 'centre');
  assert.equal(ask({}, { phoneSteady: false }), 'still');
  assert.equal(ask({}, { facePace: 1.2 }), 'still');
});

test('pose: the shutter fires only after the hold has run its full length', () => {
  const state = scan();

  const started = reduce(state, ev.face(face(), 0));
  assert.equal(cue(started.state), 'hold');
  assert.ok(
    started.effects.some((e) => e.type === 'haptic' && e.kind === 'holdStart'),
    'the hold announces itself once',
  );

  const again = reduce(started.state, ev.face(face(), 100));
  assert.deepEqual(again.effects, [], 'a second hold frame says nothing new');

  const nearly = reduce(again.state, ev.face(face(), HOLD_MS - 1));
  assert.equal(nearly.state.phase.kind, 'tracked');

  const fired = reduce(nearly.state, ev.face(face(), HOLD_MS));
  assert.equal(fired.state.phase.kind, 'capturing');
  assert.ok(has(fired.effects, 'capture'));
  assert.ok(fired.effects.some((e) => e.type === 'haptic' && e.kind === 'captured'));

  const broken = reduce(again.state, ev.face(face({ cx: 260 }), 300));
  assert.equal(cue(broken.state), 'centre');
  assert.equal(broken.state.phase.kind === 'tracked' && broken.state.phase.holdSince, null);
});

test('pose: six seconds of "hold still" becomes advice about the arm', () => {
  let state = scan();
  const stuck = (now: number) => ev.face(face(), now, { phoneSteady: false });

  state = reduce(state, stuck(0)).state;
  assert.equal(cue(state), 'still');

  state = reduce(state, stuck(6000)).state;
  assert.equal(cue(state), 'brace');

  state = reduce(state, ev.face(face(), 6100)).state;
  assert.equal(cue(state), 'hold');
  assert.equal(state.phase.kind === 'tracked' && state.phase.stillSince, null);
});

test('pose: the second temple must be turned the other way from the first', () => {
  let state = scan();
  state = shoot(state, 0); // front
  assert.equal(currentAngle(state), 'leftTemple');

  const ask = (yaw: number, angle: Angle, sign: 1 | -1 | null) =>
    poseCue({ face: face({ yaw }), target, angle, sign, phoneMoving: false, phoneSteady: true, facePace: 0.2 });

  assert.equal(ask(-34, 'leftTemple', null), 'hold', 'the first temple accepts either direction');
  assert.equal(ask(34, 'leftTemple', null), 'hold');

  state = reduce(state, { type: 'shutter', now: 1000 }).state;
  state = reduce(state, {
    type: 'shot',
    uri: 'left.jpg',
    pose: { yaw: -34, pitch: 0, roll: 0 },
    now: 1000,
  }).state;
  assert.equal(state.sign, -1);

  assert.equal(ask(-33, 'rightTemple', state.sign), 'otherWay');
  assert.equal(ask(33, 'rightTemple', state.sign), 'hold');
});

test('pose: the baseline photograph decides which way to turn', () => {
  const state = scan({
    baseline: [{ angle: 'leftTemple', pose: { yaw: 31, pitch: 0, roll: 0 } } as never],
  });
  assert.equal(state.baselineSign.leftTemple, 1);

  const ask = (yaw: number) =>
    poseCue({
      face: face({ yaw }),
      target,
      angle: 'leftTemple',
      sign: null,
      baselineSign: state.baselineSign.leftTemple,
      phoneMoving: false,
      phoneSteady: true,
      facePace: 0.2,
    });

  assert.equal(ask(-34), 'matchBaseline');
  assert.equal(ask(34), 'hold');
});

test('pose: the shutter is always available, and offered after twelve seconds', () => {
  let state = scan();
  assert.equal(state.phase.kind === 'tracked' && state.phase.manualHint, false);

  state = reduce(state, { type: 'tick', now: 12_000 }).state;
  assert.equal(state.phase.kind === 'tracked' && state.phase.manualHint, true);

  const fired = reduce(state, { type: 'shutter', now: 12_100 });
  assert.equal(fired.state.phase.kind, 'capturing');
  assert.ok(has(fired.effects, 'capture'));
});

test('pose: without tracking the cue is the shutter, and faces change nothing', () => {
  let state = scan({ tracking: false });
  assert.equal(cue(state), 'manual');
  assert.equal(state.phase.kind === 'tracked' && state.phase.manualHint, true);

  for (const now of [0, 100, HOLD_MS, 2000]) {
    const result = reduce(state, ev.face(face(), now));
    assert.equal(result.state, state);
    assert.deepEqual(result.effects, []);
    state = result.state;
  }

  assert.equal(reduce(state, { type: 'shutter', now: 3000 }).state.phase.kind, 'capturing');
});

/* ---------------------------- the blind angles --------------------------- */

test('blind: the countdown arms only once the phone has been held still', () => {
  const blind = (handsFree: boolean, motionAvailable = true) =>
    scan({ angles: ['top'], handsFree, motionAvailable });

  let state = blind(true);
  assert.equal(state.phase.kind, 'blind');

  state = reduce(state, { type: 'motion', moving: false, steady: true, now: 0 }).state;
  assert.equal(state.phase.kind === 'blind' && state.phase.steadySince, 0);

  const early = reduce(state, { type: 'tick', now: 1199 });
  assert.equal(early.state.phase.kind === 'blind' && early.state.phase.counting, false);

  const armed = reduce(state, { type: 'tick', now: 1500 });
  assert.equal(armed.state.phase.kind === 'blind' && armed.state.phase.counting, true);
  assert.deepEqual(
    armed.effects.find((e) => e.type === 'countdown'),
    { type: 'countdown', seconds: BLIND_COUNTDOWN },
  );

  const disturbed = reduce(armed.state, { type: 'motion', moving: true, steady: false, now: 1600 });
  assert.equal(disturbed.state.phase.kind === 'blind' && disturbed.state.phase.counting, false);
  assert.ok(has(disturbed.effects, 'cancelCountdown'));

  for (const off of [blind(false), blind(true, false)]) {
    const steady = reduce(off, { type: 'motion', moving: false, steady: true, now: 0 }).state;
    const ticked = reduce(steady, { type: 'tick', now: 5000 });
    assert.equal(ticked.state.phase.kind === 'blind' && ticked.state.phase.counting, false);
    assert.deepEqual(ticked.effects, []);
  }
});

test('blind: a tap cancels the count, takes the photo, or skips the angle', () => {
  const start = scan({ angles: ['top'], handsFree: true, motionAvailable: true });

  let counting = reduce(start, { type: 'motion', moving: false, steady: true, now: 0 }).state;
  counting = reduce(counting, { type: 'tick', now: 1500 }).state;

  const cancelled = reduce(counting, { type: 'shutter', now: 1600 });
  assert.equal(cancelled.state.phase.kind === 'blind' && cancelled.state.phase.counting, false);
  assert.equal(cancelled.state.phase.kind === 'blind' && cancelled.state.phase.steadySince, null);
  assert.ok(has(cancelled.effects, 'cancelCountdown'));

  const taking = reduce(cancelled.state, { type: 'shutter', now: 2000 });
  assert.equal(taking.state.phase.kind, 'capturing');
  assert.ok(has(taking.effects, 'capture'));

  const skipped = reduce(start, { type: 'skip', now: 100 });
  assert.equal(skipped.state.phase.kind, 'review');
  assert.ok(skipped.effects.some((e) => e.type === 'haptic' && e.kind === 'complete'));
});

/* ------------------------- the shot and its flight ------------------------ */

test('flight: the next angle waits for the photograph to land and the cooldown to pass', () => {
  let state = scan({ angles: ['front', 'top'] });
  state = reduce(state, { type: 'shutter', now: 0 }).state;

  const taken = reduce(state, { type: 'shot', uri: 'front.jpg', now: 0 });
  assert.equal(taken.state.phase.kind, 'flying');
  assert.equal(taken.state.phase.kind === 'flying' && taken.state.phase.until, COOLDOWN_MS);
  assert.deepEqual(taken.effects, [{ type: 'announce', text: SCAN_COPY.captured.front }]);

  const landed = reduce(taken.state, { type: 'landed', now: 500 });
  assert.equal(landed.state.phase.kind, 'flying');

  const moved = reduce(landed.state, { type: 'tick', now: COOLDOWN_MS });
  assert.equal(currentAngle(moved.state), 'top');
});

test('flight: a failed shot puts the angle back where it started', () => {
  let state = scan();
  state = reduce(state, { type: 'shutter', now: 0 }).state;
  state = reduce(state, { type: 'shotFailed', now: 50 }).state;

  assert.equal(currentAngle(state), 'front');
  assert.equal(cue(state), 'searching');
  assert.equal(state.phase.kind === 'tracked' && state.phase.holdSince, null);
});

test('review: a retake returns to review rather than walking on', () => {
  let state = scan({ angles: ['front', 'top'] });
  state = shoot(state, 0, 'first.jpg');
  state = shoot(state, 10_000, 'top.jpg');
  assert.equal(state.phase.kind, 'review');

  state = reduce(state, { type: 'retake', angle: 'front', now: 20_000 }).state;
  assert.equal(state.phase.kind, 'tracked');
  assert.equal(currentAngle(state), 'front');
  assert.equal(state.shots.front?.uri, 'first.jpg', 'the old shot survives until the new one lands');

  state = shoot(state, 21_000, 'second.jpg');
  assert.equal(state.phase.kind, 'review');
  assert.equal(state.shots.front?.uri, 'second.jpg');
  assert.equal(state.returnToReview, false);
});

test('analysing: the count only ever goes forwards', () => {
  let state = scan({ angles: ['front'] });
  state = shoot(state, 0);
  state = reduce(state, { type: 'analyse', total: 6 }).state;
  assert.deepEqual(state.phase, {
    kind: 'analysing',
    done: 0,
    total: 6,
    label: '',
    angle: null,
  });

  state = reduce(state, { type: 'work', done: 2, label: 'Hairline', angle: 'front' }).state;
  state = reduce(state, { type: 'work', done: 1, label: 'Hairline', angle: 'front' }).state;
  assert.equal(state.phase.kind === 'analysing' && state.phase.done, 2);

  assert.equal(reduce(state, { type: 'saveFailed' }).state.phase.kind, 'review');
  assert.equal(reduce(state, { type: 'saved' }).state.phase.kind, 'saved');
});

test('hold progress is the fraction of the hold that has run', () => {
  const state = scan();
  assert.equal(holdProgress(state, 0), 0);

  const holding = reduce(state, ev.face(face(), 0)).state;
  assert.equal(holdProgress(holding, 300), 0.5);
  assert.equal(holdProgress(holding, HOLD_MS), 1);
});

/* --------------------- the copy against the mechanism -------------------- */

test('copy: a blind instruction exists for exactly the angles with no face in frame', () => {
  assert.deepEqual(
    Object.keys(SCAN_COPY.blind.instruction).sort(),
    ANGLES.filter((angle) => !tracksFace(angle)).sort(),
  );
});

test('copy: only the strings shown behind hands-free promise a countdown', () => {
  const armed = (handsFree: boolean) => {
    const start = createScan({
      angles: ['top'],
      tracking: true,
      handsFree,
      motionAvailable: true,
    });
    const steady = reduce(start, { type: 'motion', moving: false, steady: true, now: 0 }).state;
    return has(reduce(steady, { type: 'tick', now: 2000 }).effects, 'countdown');
  };

  assert.equal(armed(true), true);
  assert.equal(armed(false), false, 'nothing counts down without the preference');

  // So the only body that may mention one is the hands-free body.
  assert.ok(SCAN_COPY.intro.body.handsFree.includes('counts down'));
  assert.ok(!SCAN_COPY.intro.body.manual.toLowerCase().includes('count'));
  assert.ok(SCAN_COPY.handsFree.hint.includes('Counts down'));
  assert.ok(SCAN_COPY.blind.instruction.top.includes('counts down'));
  assert.ok(SCAN_COPY.blind.instruction.crown.includes('counts down'));
});

test('copy: the blind angles are named in the words the person uses', () => {
  assert.ok(SCAN_COPY.intro.body.handsFree.includes('top'));
  assert.ok(SCAN_COPY.intro.body.handsFree.includes('back'));
  assert.equal(SCAN_COPY.captured.crown, 'Back captured');
  assert.ok(!SCAN_COPY.captured.crown.toLowerCase().includes('crown'));
});

test('the walk does not photograph a head whose angle could not be read', () => {
  /*
    ML Kit withholds the Euler angles in some configurations, and the
    camera passes through whatever it is handed. Every test in `poseCue`
    is a reason to say no, and every one of them is false of a number
    that is not a number — so such a frame fell through all of them, read
    as a head exactly on target and perfectly still, and fired the
    shutter. An absent nod or tilt is a different thing and still reads as
    level: absent is a reading, unreadable is not.
  */
  const ask = (f: Partial<PoseFace>) =>
    poseCue({
      face: face(f),
      target,
      angle: 'front',
      sign: null,
      phoneMoving: false,
      phoneSteady: true,
      facePace: 0.2,
    });

  assert.equal(ask({ yaw: Number.NaN }), 'searching');
  assert.equal(ask({ pitch: Number.NaN }), 'searching');
  assert.equal(ask({ roll: Number.NaN }), 'searching');
  assert.equal(ask({ yaw: Number.POSITIVE_INFINITY }), 'searching');

  // A reading that simply omits the two extra angles is still a reading.
  assert.equal(ask({ pitch: undefined, roll: undefined }), 'hold');
  assert.equal(ask({}), 'hold');

  // And the shutter never fires from one, however long it is held.
  let state = createScan({ angles: ANGLES, tracking: true, handsFree: true, motionAvailable: true });
  const blind = face({ yaw: Number.NaN, pitch: Number.NaN, roll: Number.NaN });
  const effects: Effect[] = [];
  for (let now = 0; now <= HOLD_MS * 3; now += 33) {
    const result = reduce(state, {
      type: 'face',
      face: blind,
      target,
      phoneMoving: false,
      phoneSteady: true,
      facePace: 0.1,
      now,
    });
    state = result.state;
    effects.push(...result.effects);
  }
  assert.ok(!effects.some((e) => e.type === 'capture'), 'nothing is photographed');
  assert.equal(state.phase.kind, 'tracked');
  assert.equal(state.phase.kind === 'tracked' && state.phase.cue, 'searching');
});
