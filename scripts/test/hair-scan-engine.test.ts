/**
 * The hair scan engine, driven by hand.
 *
 * Every rule that matters on a phone is checked here without one: that
 * Start arms the moment a head is seen and nothing else, that the four
 * steps walk themselves and reach the four regions the report is built
 * from, that a step hands over on its target and on its timeout and on
 * nothing else, that there is no shutter anywhere in the action union,
 * that the frames are requested and curated rather than hoarded, and
 * that nobody is ever trapped in a scan that will not end — or told to
 * move closer.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  CAPTURE_INTERVAL_MS,
  CAPTURE_REACH,
  CHIN_SECTORS,
  CROWN_FULL_DEG,
  CROWN_PITCH_DEG,
  DOWN_PITCH_DEG,
  FORCED_FINISH_MS,
  FRONT_DEVIATION,
  FRONT_YAW_DEG,
  GOOD_QUALITY,
  HAIRLINE_YAW_DEG,
  LEFT_SECTORS,
  LEVEL_PITCH_DEG,
  LOST_MS,
  MAX_FRAMES,
  NUDGE_AFTER_SHARE,
  NUDGE_GAIN_REACH,
  NUDGE_PLATEAU_MS,
  NUDGE_SAY_MS,
  NUDGE_STARTED_SHARE,
  PITCH_DOWN_FULL_DEG,
  REACH_CEILING,
  REGION_NEEDED,
  REGION_OF_STEP,
  REPLACE_MARGIN,
  REQUIRED_REGIONS,
  RIGHT_SECTORS,
  RING_SECTORS,
  SCAN_STEPS,
  SETTLE_MS,
  STALL_MS,
  STEP_OF_REGION,
  STEP_RELAX_SHARE,
  STEP_SETTLE_MS,
  STEP_TARGETS,
  STABLE_MIN,
  STABLE_RELAXED,
  STEP_ARRIVED_GRACE_MS,
  STEP_TIMEOUT_MS,
  SWEEP_PITCH_DOWN_LIMIT_DEG,
  SWEEP_PITCH_UP_LIMIT_DEG,
  TEMPLE_FULL_DEG,
  TEMPLE_YAW_DEG,
  TURN_FURTHER_CUE,
  TURN_HANDOVER_DEG,
  TURN_REACH,
  TURN_YAW_DEG,
  YAW_FULL_DEG,
  binOf,
  canStart,
  completionOf,
  coverFit,
  createScanState,
  fillFor,
  ringDirection,
  frameQuality,
  headDirection,
  isSufficient,
  isTurnFurtherCue,
  journeyProgress,
  meshInBox,
  orderedFrames,
  poseFit,
  primaryFrame,
  reduce,
  regionOfBin,
  requiredFrames,
  sectorOf,
  snapshotMesh,
  stageOfStep,
  stepProgress,
  stepReach,
  stepReached,
  stepRelaxed,
  stepWantsFrame,
  stepsDone,
  targetFit,
  targetReach,
  targetWants,
  turnFurtherWanted,
} from '@/features/hair-scan/engine';
import { faceRegionRects } from '@/features/hair-scan/region-crops';
import { ANGLE_OF_TARGET } from '@/features/hair-scan/result';
import { createTracker, syntheticFace, trackFrame } from '@/features/hair-scan/tracking';
import { ANGLE_GUIDANCE } from '@/types/domain';
import type {
  CaptureRequest,
  FaceReading,
  FrameMesh,
  ScanAction,
  ScanEvent,
  ScanFrame,
  ScanState,
  ScanStep,
  ScanTarget,
} from '@/features/hair-scan/types';

/* ------------------------------ helpers ------------------------------ */

function face(over: Partial<FaceReading> = {}): FaceReading {
  return {
    bounds: { x: 0.27, y: 0.2, width: 0.46, height: 0.6 },
    yaw: 0,
    pitch: 0,
    roll: 0,
    stability: 1,
    size: 0.46,
    ...over,
  };
}

const image = { uri: 'file:///scan/frame.jpg', width: 1200, height: 1600 };

type Driver = { state: ScanState; events: ScanEvent[]; now: number };

function dispatch(d: Driver, action: ScanAction): Driver {
  const step = reduce(d.state, action);
  return { state: step.state, events: [...d.events, ...step.events], now: 'at' in action ? action.at : d.now };
}

/** Tick every 33 ms for `ms`, with the face given by `pose(t)`. */
function run(
  d: Driver,
  ms: number,
  pose: (t: number) => FaceReading | null,
  lighting: number | null = 0.8,
): Driver {
  const start = d.now;
  let cur = d;
  let t = 33;
  for (; t <= ms; t += 33) {
    cur = dispatch(cur, { type: 'tick', at: start + t, face: pose(t), lighting });
  }
  // Land exactly on the end, so a turn "to 32°" actually reaches 32°.
  if (t - 33 < ms) cur = dispatch(cur, { type: 'tick', at: start + ms, face: pose(ms), lighting });
  return cur;
}

/** The scanner at `ready` with a face seen, the clock at 1000. */
function atReady(): Driver {
  let d: Driver = { state: createScanState(), events: [], now: 1000 };
  d = dispatch(d, { type: 'continue', at: 1000 });
  d = dispatch(d, { type: 'permission', granted: true, at: 1000 });
  d = run(d, 200, () => face());
  return { ...d, events: [] };
}

function scanning(): Driver {
  const d = atReady();
  const started = dispatch(d, { type: 'start', at: d.now });
  return { ...started, events: [] };
}

/** Answer every outstanding capture request with an image. */
function landAll(d: Driver): Driver {
  let cur = d;
  for (const request of cur.state.pending) {
    cur = dispatch(cur, { type: 'captured', requestId: request.id, image, at: cur.now });
  }
  return cur;
}

const of = <T extends ScanEvent['type']>(events: ScanEvent[], type: T) =>
  events.filter((e): e is Extract<ScanEvent, { type: T }> => e.type === type);

/** A slow, steady turn: from `from` to `to` degrees of yaw over `ms`, with the given chin-down. */
const turn = (from: number, to: number, ms: number, pitch = 0) => (t: number) =>
  face({ yaw: from + ((to - from) * Math.min(t, ms)) / ms, pitch, stability: 0.9 });

/**
 * Ticks until the scan stops capturing — the steps running out their own
 * time — or until the backstop, whichever comes first.
 */
function toEnd(d: Driver, pose: (t: number) => FaceReading): Driver {
  let cur = d;
  const start = cur.now;
  for (let t = 66; t <= FORCED_FINISH_MS + 2_000 && cur.state.status === 'capturing'; t += 66) {
    cur = dispatch(cur, { type: 'tick', at: start + t, face: pose(t), lighting: 0.8 });
  }
  return cur;
}

/** A request already out for a region, for the rules that read `pending`. */
function pendingFor(target: ScanTarget): CaptureRequest {
  return { id: 'p1', bin: 0, region: 'front', target, sector: null, yaw: 0, pitch: 0, quality: 0.5, at: 0 };
}

/** A slow nod: from `from` to `to` degrees of pitch over `ms`, at the given yaw. */
const nod = (from: number, to: number, ms: number, yaw = 0) => (t: number) =>
  face({ yaw, pitch: from + ((to - from) * Math.min(t, ms)) / ms, stability: 0.9 });

const held = (state: ScanState, region: ScanTarget) => state.targets[region];

/* ----------------------------- transitions --------------------------- */

test('scanner: instructions go to the permission prompt until it is granted', () => {
  let d: Driver = { state: createScanState(), events: [], now: 0 };
  assert.equal(d.state.scanner, 'instructions');
  d = dispatch(d, { type: 'continue', at: 0 });
  assert.equal(d.state.scanner, 'permission');
  assert.deepEqual(of(d.events, 'state'), [{ type: 'state', from: 'instructions', to: 'permission' }]);

  d = dispatch(d, { type: 'permission', granted: true, at: 0 });
  assert.equal(d.state.scanner, 'ready');
  assert.equal(d.state.permission, 'granted');

  // Known to be granted: the sheet goes straight to the camera next time.
  d = dispatch(d, { type: 'cancel', at: 0 });
  assert.equal(d.state.scanner, 'instructions');
  assert.equal(d.state.permission, 'granted');
  d = dispatch(d, { type: 'continue', at: 0 });
  assert.equal(d.state.scanner, 'ready');
});

test('scanner: a denied permission is an error that retries into the prompt', () => {
  let d: Driver = { state: createScanState(), events: [], now: 0 };
  d = dispatch(d, { type: 'continue', at: 0 });
  d = dispatch(d, { type: 'permission', granted: false, at: 0 });
  assert.equal(d.state.scanner, 'error');
  assert.equal(d.state.error, 'cameraDenied');
  d = dispatch(d, { type: 'retry', at: 0 });
  assert.equal(d.state.scanner, 'permission');
  assert.equal(d.state.error, null);
});

test('scanner: start only from ready; process only from complete; processed only from processing', () => {
  let d: Driver = { state: createScanState(), events: [], now: 0 };
  d = dispatch(d, { type: 'start', at: 0 });
  assert.equal(d.state.scanner, 'instructions', 'start is ignored on the sheet');
  d = dispatch(d, { type: 'process', at: 0 });
  assert.equal(d.state.scanner, 'instructions');

  d = atReady();
  d = dispatch(d, { type: 'start', at: d.now });
  assert.equal(d.state.scanner, 'scanning');
  assert.equal(d.state.status, 'capturing');
  assert.equal(d.state.step, 'front', 'the scan opens looking straight ahead');
  assert.equal(d.state.stepIndex, 0);
  assert.equal(d.state.startedAt, d.now);
  assert.equal(d.state.stepStartedAt, d.now, 'tracking begins on the press');
  d = dispatch(d, { type: 'process', at: d.now });
  assert.equal(d.state.scanner, 'scanning', 'process is ignored mid-scan');
  d = dispatch(d, { type: 'processed', at: d.now });
  assert.equal(d.state.scanner, 'scanning');

  d = dispatch(d, { type: 'fail', reason: 'cameraFailed', at: d.now });
  assert.equal(d.state.scanner, 'error');
  assert.equal(d.state.error, 'cameraFailed');
  d = dispatch(d, { type: 'retry', at: d.now });
  assert.equal(d.state.scanner, 'ready', 'granted permission retries straight to the camera');
  assert.equal(d.state.completion, 0, 'a retry starts the journey over');
  assert.ok(REQUIRED_REGIONS.every((r) => !held(d.state, r).captured));
});

test('scanner: complete, processing, report, and a cancel from anywhere', () => {
  let d = fullScan();
  assert.equal(d.state.scanner, 'complete');
  d = dispatch(d, { type: 'process', at: d.now });
  assert.equal(d.state.scanner, 'processing');
  d = dispatch(d, { type: 'processed', at: d.now });
  assert.equal(d.state.scanner, 'report');
  d = dispatch(d, { type: 'fail', reason: 'processingFailed', at: d.now });
  assert.equal(d.state.scanner, 'error');
  d = dispatch(d, { type: 'cancel', at: d.now });
  assert.equal(d.state.scanner, 'instructions');
  assert.equal(d.state.frames.length, 0);
});

/* ------------------------------- ready ------------------------------- */

test('ready: Start is live the moment a head is seen, at any distance, angle or light', () => {
  let d = atReady();
  assert.equal(d.state.status, 'ready');
  assert.ok(canStart(d.state));

  // The four things build 17 demanded, one at a time. Not one of them
  // may hold the button down ever again.
  const anywhere: Partial<FaceReading>[] = [
    { size: 0.18, bounds: { x: 0.41, y: 0.36, width: 0.18, height: 0.24 } },
    { size: 0.82, bounds: { x: 0.09, y: 0, width: 0.82, height: 1 } },
    { yaw: 34 },
    { yaw: -34 },
    { pitch: 26 },
    { pitch: -26 },
    { stability: 0 },
    { roll: 20 },
  ];
  for (const pose of anywhere) {
    d = run(d, 33, () => face(pose));
    assert.equal(d.state.status, 'ready', JSON.stringify(pose));
    assert.ok(canStart(d.state), `Start went dead at ${JSON.stringify(pose)}`);
  }
  d = run(d, 33, () => face(), 0.05);
  assert.ok(canStart(d.state), 'a dark room does not hold Start down');
  assert.equal(d.state.cue, 'brighter', 'it is mentioned, not enforced');
  d = run(d, 33, () => face(), null);
  assert.equal(d.state.cue, null, 'nothing to correct, so nothing is said');
  assert.ok(canStart(d.state));

  // No reading at all is the one thing that is not a head.
  d = run(d, 33, () => null);
  assert.equal(d.state.status, 'detecting');
  assert.equal(d.state.cue, 'faceCamera');
  assert.ok(!canStart(d.state));
});

test('ready: no cue ever asks anybody to move closer or further away', () => {
  let d = atReady();
  const cues = new Set<string>();
  for (const size of [0.15, 0.25, 0.35, 0.46, 0.6, 0.75, 0.9]) {
    d = run(d, 66, () => face({ size, bounds: { x: 0.5 - size / 2, y: 0.25, width: size, height: size * 1.3 } }));
    if (d.state.cue !== null) cues.add(d.state.cue);
  }
  assert.ok(!cues.has('closer') && !cues.has('back'), [...cues].join(', '));
  // Every size reads as a head that needs nothing said about it.
  assert.equal(cues.size, 0, [...cues].join(', '));
});

test('ready: a head leaving the picture is asked back, and Start stays live', () => {
  let d = atReady();
  d = run(d, 33, () => face({ bounds: { x: 0.85, y: 0.2, width: 0.46, height: 0.6 } }));
  assert.equal(d.state.cue, 'faceCamera');
  assert.ok(canStart(d.state), 'it is a nudge, not a gate');
});

test('ready: an unreadable reading is not a head', () => {
  let d = atReady();
  d = run(d, 33, () => face({ yaw: Number.NaN }));
  assert.equal(d.state.cue, 'faceCamera');
  assert.equal(d.state.status, 'detecting');
  assert.ok(!canStart(d.state));
});

test('ready: the face-locked buzz fires once, and not again after Start', () => {
  let d: Driver = { state: createScanState(), events: [], now: 0 };
  d = dispatch(d, { type: 'continue', at: 0 });
  d = dispatch(d, { type: 'permission', granted: true, at: 0 });
  d = run(d, 300, () => face());
  const locks = () => of(d.events, 'milestone').filter((m) => m.milestone === 'faceLocked').length;
  assert.equal(locks(), 1);
  assert.equal(of(d.events, 'cue').length, 0, 'a head that needs nothing said gets nothing said');
  assert.equal(d.state.cue, null);
  assert.deepEqual(d.state.milestones, ['faceLocked']);

  d = dispatch(d, { type: 'start', at: d.now });
  assert.ok(d.state.frontLocked);
  d = run(d, 300, () => face());
  assert.equal(locks(), 1, 'faceLocked fired twice across Start');
});

test('permission: an answer while not on the permission screen is recorded and nothing moves', () => {
  let d: Driver = { state: createScanState(), events: [], now: 0 };
  d = dispatch(d, { type: 'permission', granted: true, at: 0 });
  assert.equal(d.state.scanner, 'instructions');
  assert.equal(d.state.permission, 'granted');
  assert.deepEqual(d.events, []);
  d = dispatch(d, { type: 'continue', at: 0 });
  assert.equal(d.state.scanner, 'ready', 'the recorded grant skips the prompt');

  // Revoked mid-scan (Settings, say): remembered, but the scan is not torn down by it.
  d = scanning();
  d = dispatch(d, { type: 'permission', granted: false, at: d.now });
  assert.equal(d.state.scanner, 'scanning');
  assert.equal(d.state.permission, 'denied');
  d = dispatch(d, { type: 'cancel', at: d.now });
  d = dispatch(d, { type: 'continue', at: d.now });
  assert.equal(d.state.scanner, 'permission', 'and the next run asks again');
});

/* --------------------------- the four regions ------------------------ */

test('regions: the scan wants a hairline, two temples and a crown, and nothing else', () => {
  assert.deepEqual([...REQUIRED_REGIONS], ['hairline', 'leftTemple', 'rightTemple', 'crown']);
});

test('handedness: the step names the way the head moves; the region names what the camera sees', () => {
  /*
    The pin for the one thing nobody could settle by reading. Five
    statements have to line up, and a head turning is the only thing that
    lines them up. They are not unanimous across the app — the last
    paragraph names the file that disagrees — but they are unanimous on
    the path a scan actually takes:

      1. the sign convention — positive yaw is the head turned towards
         its OWN right (engine.ts, and the native module's contract);
      2. the step called `right` asks for exactly that turn, which is
         what the person is told and what the arrow points at;
      3. the side of the head that turn puts in front of the lens, which
         is the OPPOSITE one: turn your head to your right and your right
         cheek rotates away from the camera while your left comes round
         to face it;
      4. the journal's own instruction, which has said the same thing
         since long before this scan existed: to show your LEFT side you
         turn towards your right;
      5. the corner of the mirrored still that `region-crops.ts` cuts for
         that label — the left temple from the image's left, because a
         mirrored front camera puts your own left on the viewer's left.

    Read any one of them the other way round and the report crops the
    patch of air in front of somebody's face and captions it as a temple.

    THE DISSENTER. `closestAngle` in `result.ts` defaults `leftSign` to
    −1 — negative yaw reads as the left temple there, the opposite of
    (1)–(5) — and `hair-scan-result.test.ts` pins that default. It is
    dormant on this path, and the last block below is what keeps it
    dormant: the screen files every scan frame by an explicit `angle`, so
    the pose fallback is never consulted for a scan. That is pinned here
    rather than glossed over, because the two want one owner and the next
    person to flip a sign has to know both places exist.
  */
  assert.equal(STEP_TARGETS.right.yawDeg, TURN_YAW_DEG, 'the right step wants positive yaw');
  assert.equal(STEP_TARGETS.left.yawDeg, -TURN_YAW_DEG);
  assert.equal(stepReach('right', face({ yaw: TURN_YAW_DEG })), 1);
  assert.equal(stepReach('right', face({ yaw: -TURN_YAW_DEG })), 0);
  assert.equal(stepReach('left', face({ yaw: -TURN_YAW_DEG })), 1);

  assert.equal(REGION_OF_STEP.right, 'leftTemple', 'turning right shows the camera the left temple');
  assert.equal(REGION_OF_STEP.left, 'rightTemple');
  assert.match(ANGLE_GUIDANCE.leftTemple.instruction, /turn your head to the right/i);
  assert.match(ANGLE_GUIDANCE.rightTemple.instruction, /turn your head to the left/i);

  // The two maps are each other's inverse, so nothing can drift.
  for (const step of SCAN_STEPS) assert.equal(STEP_OF_REGION[REGION_OF_STEP[step]], step);

  const box = { width: 1000, height: 1000 };
  const rects = faceRegionRects(
    { cx: 500, cy: 500, width: 300, height: 400, contours: {} },
    box,
  );
  assert.ok(rects.leftTemple !== undefined && rects.rightTemple !== undefined);
  assert.ok(rects.leftTemple.x + rects.leftTemple.w <= 0.5, 'the left temple is cut from the image\'s left');
  assert.ok(rects.rightTemple.x >= 0.5, 'the right temple from the image\'s right');

  /*
    And the dormancy the note above leans on: every frame the scan hands
    to `scanPhotos` carries its own `angle`, taken from the region the
    step asked for, so `closestAngle`'s opposite default is never reached
    from a scan. If this line ever goes, the two conventions meet.
  */
  const screen = readFileSync('src/app/hair-scan.tsx', 'utf8');
  assert.match(screen, /angle: ANGLE_OF_TARGET\[f\.target\]/, 'the scan files its own frames by region');
  assert.equal(ANGLE_OF_TARGET.leftTemple, 'leftTemple', 'by the region it named, unflipped');
  assert.equal(ANGLE_OF_TARGET.rightTemple, 'rightTemple');
});

test('steps: the four steps, in the owner’s order, each with its own region', () => {
  assert.deepEqual([...SCAN_STEPS], ['front', 'right', 'left', 'down']);
  assert.deepEqual(
    SCAN_STEPS.map((s) => REGION_OF_STEP[s]),
    ['hairline', 'leftTemple', 'rightTemple', 'crown'],
  );
  // No chin up anywhere: every step that asks about pitch asks for down.
  for (const step of SCAN_STEPS) {
    const pitch = STEP_TARGETS[step].pitchDeg;
    assert.ok(pitch === null || pitch < 0, `${step} must never ask for a lifted chin`);
  }
  // A comfortable head turn, not a shoulder turn: 28° is about as far as
  // somebody looking at their own phone swivels before the screen leaves
  // their eyes, and 35°+ is where people turn their torso instead.
  assert.ok(TURN_YAW_DEG >= 25 && TURN_YAW_DEG <= 30, `${TURN_YAW_DEG}° is not a head turn`);
  /*
    And the step hands over WELL short of it. This is the number that
    decides whether the timeout is the escape hatch or the design: at
    nine tenths of the aim, somebody who turns a natural 20° and holds it
    never reached either turn target, so both steps burned their whole
    seven seconds and a six-second scan took twenty-two. Nineteen degrees
    is inside an ordinary neck's range with room to spare; the quality
    curve still pays for the fuller turn, so nothing is given up by it.
  */
  assert.equal(TURN_HANDOVER_DEG, 19);
  assert.ok(Math.abs(TURN_YAW_DEG * TURN_REACH - TURN_HANDOVER_DEG) < 1e-9);
  assert.ok(TURN_HANDOVER_DEG <= 20, 'a 20° turner must reach it, not time out');
  assert.equal(stageOfStep('front'), 'sweep');
  assert.equal(stageOfStep('down'), 'crown');
});

test('steps: how near a pose is to each step’s target, and when a frame is worth taking', () => {
  // Front measures how much of its window has been closed, so a person
  // looking at their own phone is square on without being exactly 0°.
  assert.equal(stepReach('front', face()), 1);
  assert.equal(stepReach('front', face({ yaw: FRONT_YAW_DEG })), 0);
  assert.ok(stepReach('front', face({ yaw: HAIRLINE_YAW_DEG })) >= STEP_TARGETS.front.reach);
  assert.equal(stepReach('down', face({ pitch: -DOWN_PITCH_DEG })), 1);
  assert.equal(stepReach('down', face({ pitch: DOWN_PITCH_DEG })), 0, 'a lifted chin is not a nod');
  assert.equal(stepReach('front', face({ yaw: Number.NaN })), 0);

  /*
    Frames start arriving while the turn is still finishing — but never
    before the temple is in the picture. A frame is filed under the region
    its step asked for, so a near-frontal frame raised by the `right` step
    would be captioned in somebody's report as a temple.
  */
  assert.ok(stepWantsFrame('right', face({ yaw: TEMPLE_YAW_DEG + 1 })), 'as the temple comes round');
  assert.ok(TEMPLE_YAW_DEG + 1 < TURN_YAW_DEG * TURN_REACH, 'which is before the step hands over');
  assert.ok(!stepWantsFrame('right', face({ yaw: TEMPLE_YAW_DEG - 1 })), 'not while it is barely turned');
  assert.ok(!stepWantsFrame('right', face({ yaw: -TURN_YAW_DEG })), 'and never for the other way');
  assert.ok(!stepWantsFrame('down', face({ pitch: -CROWN_PITCH_DEG })), 'nor a crown not yet in view');

  /*
    The upright steps still want the front of the head in the picture —
    and the two ways it can leave are not the same distance away.

    Chin UP is the short side: a phone held overhead is nostrils, and
    there is no hairline and no temple in that frame. Chin DOWN is the
    long one, and it has to be: a phone at chest height reads thirty
    degrees of chin-down on somebody doing exactly what the title asked,
    and chin-down is the side where MORE of the hairline faces the lens.
    A symmetric ±30° gate made that person's first three steps unable to
    raise a single capture request.
  */
  assert.ok(stepWantsFrame('front', face({ pitch: -CROWN_PITCH_DEG })), 'a phone held low is fine');
  assert.ok(stepWantsFrame('front', face({ pitch: -32 })), 'and a phone at chest height is too');
  assert.ok(stepWantsFrame('right', face({ yaw: TURN_YAW_DEG, pitch: -32 })), 'the turns as well');
  assert.ok(!stepWantsFrame('front', face({ pitch: -SWEEP_PITCH_DOWN_LIMIT_DEG })), 'bowed: a scalp');
  assert.ok(!stepWantsFrame('front', face({ pitch: SWEEP_PITCH_UP_LIMIT_DEG })), 'tipped back: nostrils');
  assert.ok(SWEEP_PITCH_DOWN_LIMIT_DEG > SWEEP_PITCH_UP_LIMIT_DEG, 'the sides are not the same');
  assert.ok(stepWantsFrame('down', face({ pitch: -DOWN_PITCH_DEG })), 'which the last step is exempt from');
  assert.ok(!stepWantsFrame('front', face({ yaw: Number.NaN })));
});

test('regions: a pose scores for the region it serves, and the fuller turn scores higher', () => {
  assert.equal(targetFit(face(), 'hairline'), 1);
  assert.ok(targetFit(face({ yaw: 10 }), 'hairline') < 1);
  assert.equal(targetFit(face({ yaw: TEMPLE_YAW_DEG }), 'rightTemple'), 0);
  assert.equal(targetFit(face({ yaw: TEMPLE_FULL_DEG }), 'rightTemple'), 1);
  assert.equal(targetFit(face({ yaw: -TEMPLE_FULL_DEG }), 'leftTemple'), 1);
  assert.equal(targetFit(face({ pitch: -CROWN_PITCH_DEG }), 'crown'), 0);
  assert.equal(targetFit(face({ pitch: -CROWN_FULL_DEG }), 'crown'), 1, 'best at the deepest nod');
  assert.ok(targetFit(face({ pitch: -CROWN_FULL_DEG }), 'crown') > targetFit(face({ pitch: -20 }), 'crown'));

  // The chin has a vote in stage one, because the hairline and the
  // temples are pictures of the front of the head. A phone held overhead
  // used to score a perfect hairline for a photograph of two nostrils —
  // and then, scoring perfectly, could not be replaced by the real thing.
  assert.equal(targetFit(face({ pitch: LEVEL_PITCH_DEG }), 'hairline'), 1, 'a phone held low is not a mistake');
  assert.ok(targetFit(face({ pitch: 25 }), 'hairline') < 0.5, 'chin well up: hardly a hairline');
  assert.equal(targetFit(face({ pitch: SWEEP_PITCH_UP_LIMIT_DEG }), 'hairline'), 0);
  // The curve and the gate agree about the other side too, so a frame is
  // never refused at an angle the score calls perfectly good.
  assert.equal(targetFit(face({ pitch: -SWEEP_PITCH_DOWN_LIMIT_DEG }), 'hairline'), 0);
  assert.ok(targetFit(face({ pitch: -32 }), 'hairline') > 0, 'a phone at chest height still scores');
  assert.ok(
    targetFit(face(), 'hairline') > targetFit(face({ pitch: 25 }), 'hairline') + REPLACE_MARGIN,
    'so the square-on frame replaces it by more than the margin',
  );
  assert.ok(
    targetFit(face({ yaw: TEMPLE_FULL_DEG }), 'rightTemple') >
      targetFit(face({ yaw: TEMPLE_FULL_DEG, pitch: 25 }), 'rightTemple'),
    'the same for a temple',
  );

  // Reach counts the approach, so the figure moves while somebody turns.
  assert.equal(targetReach(face(), 'rightTemple'), 0);
  assert.ok(targetReach(face({ yaw: -9 }), 'rightTemple') > 0.4);
  assert.equal(targetReach(face({ yaw: -TEMPLE_YAW_DEG }), 'rightTemple'), 1);
  assert.ok(targetReach(face({ yaw: 9 }), 'leftTemple') > 0.4, 'and the other way for the other side');
  assert.equal(targetReach(face({ yaw: TEMPLE_YAW_DEG }), 'leftTemple'), 1);
  assert.equal(targetReach(face({ pitch: -CROWN_PITCH_DEG }), 'crown'), 1);
});

test('regions: progress is the mean of the four, and sufficiency is all four captured', () => {
  const state = createScanState();
  assert.equal(journeyProgress(state.targets), 0);
  assert.ok(!isSufficient(state.targets));
  const all = { ...state.targets };
  for (const region of REQUIRED_REGIONS) {
    all[region] = { captured: true, quality: 0.8, frameId: region, reach: 1 };
  }
  assert.equal(journeyProgress(all), 1);
  assert.ok(isSufficient(all));
  assert.ok(!isSufficient({ ...all, crown: { captured: false, quality: 0, frameId: null, reach: 0 } }));
});

/*
  The figure that goes into the record and is read out in the report.
  Pose alone used to carry it to 1: turn your head about for four and a
  half seconds and the journal called the scan complete, whatever had
  actually been photographed. The approach still moves it — a figure
  that jumped in quarters would tell somebody nothing while they turn —
  but it cannot finish it.
*/
test('regions: the journey figure cannot reach 1 without the four photographs', () => {
  const state = createScanState();
  const moved = { ...state.targets };
  for (const region of REQUIRED_REGIONS) {
    moved[region] = { captured: false, quality: 0, frameId: null, reach: 1 };
  }
  assert.equal(journeyProgress(moved), REACH_CEILING);
  assert.ok(REACH_CEILING < 1);
  assert.ok(journeyProgress(moved) > 0.5, 'but a head that went everywhere reads as most of the way');

  const threeOfFour = {
    ...moved,
    hairline: { captured: true, quality: 0.8, frameId: 'a', reach: 1 },
    leftTemple: { captured: true, quality: 0.8, frameId: 'b', reach: 1 },
    rightTemple: { captured: true, quality: 0.8, frameId: 'c', reach: 1 },
  };
  assert.ok(journeyProgress(threeOfFour) < 1, 'a missing crown is never 100%');
});

/* --------------------------- the choreography ------------------------ */

test('choreography: one continuous motion walks all four steps and reaches all four regions', () => {
  let d = scanning();
  assert.equal(d.state.step, 'front');
  assert.equal(d.state.stepIndex, 0);
  assert.equal(d.state.cue, null, 'the step’s own instruction carries the choreography');

  // Straight ahead. The hairline lands and the step hands over by itself.
  d = walk(d, 900, () => face({ stability: 0.95 }));
  assert.ok(held(d.state, 'hairline').captured, 'the hairline');
  assert.equal(d.state.step, 'right');

  // Round to their own right, which shows the camera their LEFT side.
  d = walk(d, 2000, path(SQUARE, RIGHT, 1200));
  assert.ok(held(d.state, 'leftTemple').captured, 'the left temple');
  assert.equal(d.state.step, 'left');

  // Straight on round to the other side, without stopping in between.
  d = walk(d, 2600, path(RIGHT, LEFT, 1800));
  assert.ok(held(d.state, 'rightTemple').captured, 'the right temple');
  assert.equal(d.state.step, 'down');
  assert.equal(d.state.stage, 'crown', 'the older screens read the last step as the crown beat');
  assert.ok(!held(d.state, 'crown').captured, 'the crown is not taken with the chin up');

  // And down.
  d = walk(d, 2600, path(LEFT, DOWN, 1800));
  assert.ok(held(d.state, 'crown').captured);
  assert.ok(stepsDone(d.state));
  assert.equal(d.state.completion, 1);
  assert.deepEqual(of(d.events, 'scanComplete'), [{ type: 'scanComplete', reason: 'coverage' }]);

  // The steps handed over in order, once each, and nothing went back.
  assert.deepEqual(
    of(d.events, 'step').map((e) => [e.from, e.to, e.index]),
    [
      ['front', 'right', 1],
      ['right', 'left', 2],
      ['left', 'down', 3],
    ],
  );

  const marks = of(d.events, 'milestone').map((m) => m.milestone);
  for (const m of ['hairlineDone', 'leftTempleDone', 'rightTempleDone', 'crownDone'] as const) {
    assert.equal(marks.filter((x) => x === m).length, 1, `${m} fires exactly once`);
  }
  for (const m of ['quarter', 'half', 'threeQuarters'] as const) {
    assert.equal(marks.filter((x) => x === m).length, 1, `${m} fires exactly once`);
  }

  // The whole thing, at a KYC pace: seconds, not a photo session.
  const elapsed = (d.state.completedAt ?? d.now) - (d.state.startedAt ?? d.now);
  assert.ok(elapsed <= 12_000, `${elapsed} ms is not quick`);
});

test('choreography: a step hands over the moment its own target is reached', () => {
  // Held just short of the turn the step asks for, the step stays put
  // however many frames land; one more degree and it moves on.
  const shy = TURN_YAW_DEG * TURN_REACH - 2;
  let d = walk(scanning(), 900, () => face({ stability: 0.95 }));
  assert.equal(d.state.step, 'right');
  d = walk(d, 2500, () => face({ yaw: shy, stability: 0.95 }));
  assert.equal(d.state.step, 'right', 'short of the target, the step waits');
  assert.ok(held(d.state, 'leftTemple').captured, 'while still taking the frames it can');
  assert.ok(stepProgress(d.state) < 1);
  d = walk(d, 600, () => face({ yaw: TURN_YAW_DEG, stability: 0.95 }));
  assert.equal(d.state.step, 'left', 'reached, it hands over');
});

test('choreography: a step also hands over on its own timeout, with whatever it holds', () => {
  // Somebody who cannot turn that far, or whose detector never reads the
  // turn: the step waits its own time and then moves on regardless.
  let d = walk(scanning(), 900, () => face({ stability: 0.95 }));
  assert.equal(d.state.step, 'right');
  const startedAt = d.state.stepStartedAt ?? d.now;
  d = walk(d, STEP_TIMEOUT_MS.right + 200, () => face({ yaw: 6, stability: 0.95 }));
  assert.equal(d.state.step, 'left', 'nobody is trapped in a step');
  assert.ok(!held(d.state, 'leftTemple').captured, 'and it took nothing it could not take');
  assert.ok((d.state.stepStartedAt ?? 0) - startedAt >= STEP_TIMEOUT_MS.right);

  // The rest of the scan runs out the same way, and the reason is honest.
  d = walk(d, STEP_TIMEOUT_MS.left + STEP_TIMEOUT_MS.down + 500, () => face({ stability: 0.95 }));
  assert.equal(d.state.completeReason, 'timeout', 'three of four is not coverage');
  assert.ok(d.state.completion < 1, 'and the figure says so');
});

/*
  The three scans that used to end with a step's worth of nothing.

  Each is a person doing exactly what the title asked, in a way the gates
  had not allowed for: a phone held at chest height, a neck that turns
  twenty degrees rather than twenty-eight, an unsteady hand. In every one
  of them the steps ran their whole timeout, the corrective line stayed
  empty — none of the five corrections is about a chin, a neck or where a
  phone is held — and the report came out short. They are pinned here
  together because they are one bug wearing three coats: a gate with no
  way past it and nothing to say for itself.
*/
test('choreography: a phone held at chest height still walks all four steps', () => {
  // Thirty-two degrees of chin-down is a phone at chest height, which is
  // where a great many people hold one. The old ±30° gate refused every
  // frame of the three upright steps for it.
  const rest = -32;
  const at = (yaw: number, pitch = rest) => ({ yaw, pitch });
  let d = walk(scanning(), 900, () => face({ pitch: rest, stability: 0.95 }));
  assert.ok(held(d.state, 'hairline').captured, 'the hairline');
  d = walk(d, 2000, path(at(0), at(TURN_YAW_DEG), 1200));
  assert.ok(held(d.state, 'leftTemple').captured, 'and a temple, with the chin where it was');
  d = walk(d, 2600, path(at(TURN_YAW_DEG), at(-TURN_YAW_DEG), 1800));
  assert.ok(held(d.state, 'rightTemple').captured, 'and the other');
  d = walk(d, 2600, path(at(-TURN_YAW_DEG), { yaw: 0, pitch: -45 }, 1800));
  assert.equal(d.state.completeReason, 'coverage', 'not a timeout with two temples missing');
  assert.equal(requiredFrames(d.state).length, 4);
  const elapsed = (d.state.completedAt ?? d.now) - (d.state.startedAt ?? d.now);
  assert.ok(elapsed <= 12_000, `${elapsed} ms is not quick`);
});

test('choreography: a modest turn reaches the target rather than the timeout', () => {
  // Somebody who turns a natural 20° and holds it. Every frame the scan
  // wants is there long before the step's time is up, so the step must
  // hand over on its target: the timeout is the escape hatch, not the
  // design, and a step that always times out is a design.
  const TURN = 20;
  let d = walk(scanning(), 900, () => face({ stability: 0.95 }));
  d = walk(d, 2000, path(SQUARE, { yaw: TURN, pitch: 0 }, 1200));
  assert.equal(d.state.step, 'left', 'the right step reached its target');
  d = walk(d, 2600, path({ yaw: TURN, pitch: 0 }, { yaw: -TURN, pitch: 0 }, 1800));
  assert.equal(d.state.step, 'down', 'and so did the left');
  d = walk(d, 2600, path({ yaw: -TURN, pitch: 0 }, { yaw: 0, pitch: -20 }, 1800));
  assert.equal(d.state.completeReason, 'coverage');
  assert.equal(requiredFrames(d.state).length, 4);
  const elapsed = (d.state.completedAt ?? d.now) - (d.state.startedAt ?? d.now);
  const timeouts = SCAN_STEPS.reduce((sum, step) => sum + STEP_TIMEOUT_MS[step], 0);
  assert.ok(elapsed <= 12_000, `${elapsed} ms for a 20° turner`);
  assert.ok(elapsed < timeouts / 2, 'nowhere near the timeouts');
});

/*
  ── The shallow turn ───────────────────────────────────────────────────

  The fourth coat of the same bug, and the one the timeouts could not
  cover. A turn step hands over at `TURN_HANDOVER_DEG`; somebody who
  turns twelve degrees and stops reaches neither turn target, both steps
  run their whole timers, the down step follows, and twenty-odd seconds
  later the scan has the hairline alone and has said nothing about it.

  The owner's instruction was not to lower the bar again: it was to ASK
  FOR MORE TURN. So the step now notices that the turn has stopped — a
  plateau, well short, with a third of the step gone — and says so, in the
  direction it already asked for. It is guidance and only guidance: the
  step still ends when it ends, and the report still says which regions
  it actually held.
*/
test('nudge: a turn that stops short is asked for more, in the direction the step asked for', () => {
  let d = walk(scanning(), 900, () => face({ stability: 0.95 }));
  assert.equal(d.state.step, 'right');
  assert.equal(d.state.cue, null);

  // Twelve degrees, arrived at in half a second and then held.
  d = walk(d, 1200, path(SQUARE, { yaw: 12, pitch: 0 }, 600));
  assert.equal(d.state.cue, null, 'a turn that might still be coming is left alone');
  assert.equal(turnFurtherWanted(d.state, d.now), false);

  /*
    Held. The step has given them its opening — `NUDGE_AFTER_SHARE` of
    its own time, which is the same share it waits before it will settle
    for a worse picture — and a second has gone by without the head
    coming any further. Measured from `stepStartedAt` rather than from a
    walk of round numbers, because the opening is the rule and the clock
    arithmetic is not.
  */
  const into = () => d.now - (d.state.stepStartedAt ?? d.now);
  d = walk(d, NUDGE_AFTER_SHARE * STEP_TIMEOUT_MS.right - into() + 200, () =>
    face({ yaw: 12, stability: 0.95 }),
  );
  assert.equal(turnFurtherWanted(d.state, d.now), true);
  assert.equal(d.state.cue, 'turnFurtherRight', 'and it names the way the head is already going');
  assert.equal(d.state.cue, TURN_FURTHER_CUE.right);
  assert.ok(isTurnFurtherCue(d.state.cue));
  const inStep = into();
  assert.ok(inStep >= NUDGE_AFTER_SHARE * STEP_TIMEOUT_MS.right, `${inStep} ms into the step`);
  assert.ok(inStep < STEP_TIMEOUT_MS.right, 'while there is still time to act on it');
  assert.ok(stepRelaxed(d.state, d.now), 'and never before the step has eased off on stillness');

  // And it blocks nothing: the step ends when it would have ended.
  d = walk(d, STEP_TIMEOUT_MS.right - into() + 100, () => face({ yaw: 12, stability: 0.95 }));
  assert.equal(d.state.step, 'left', 'the nudge is not a gate');

  // The same again the other way, and the next step asks in its own words.
  d = walk(d, 1200, path({ yaw: 12, pitch: 0 }, { yaw: -12, pitch: 0 }, 600));
  d = walk(d, NUDGE_AFTER_SHARE * STEP_TIMEOUT_MS.left - into() + 200, () =>
    face({ yaw: -12, stability: 0.95 }),
  );
  assert.equal(d.state.cue, 'turnFurtherLeft', 'and the next step asks for its own direction');

  // The rest of that scan: a nod as shallow as the turns, worded for a chin.
  d = walk(d, STEP_TIMEOUT_MS.left - into() + 100, () => face({ yaw: -12, stability: 0.95 }));
  assert.equal(d.state.step, 'down');
  d = walk(d, 1200, path({ yaw: -12, pitch: 0 }, { yaw: 0, pitch: -12 }, 600));
  d = walk(d, NUDGE_AFTER_SHARE * STEP_TIMEOUT_MS.down - into() + 200, () =>
    face({ pitch: -12, stability: 0.95 }),
  );
  assert.equal(d.state.cue, 'turnFurtherDown');
  d = walk(d, STEP_TIMEOUT_MS.down, () => face({ pitch: -12, stability: 0.95 }));

  // It finishes, honestly, with what it actually has — and in the budget.
  assert.equal(d.state.scanner, 'complete');
  assert.equal(d.state.completeReason, 'timeout', 'one region is not coverage');
  assert.ok(d.state.completion < 1, 'and the figure cannot say otherwise');
  assert.deepEqual(
    requiredFrames(d.state).map((f) => f.target),
    ['hairline'],
    'the shallow turn keeps the hairline, and the report says so',
  );
  const elapsed = (d.state.completedAt ?? d.now) - (d.state.startedAt ?? d.now);
  assert.ok(elapsed <= FORCED_FINISH_MS, `${elapsed} ms is past the backstop`);

  /*
    Three corrections across the whole scan, one per step that asks for a
    movement, each in that step's own direction and none of them invented.
    A step may ask twice — this person turned a little further and stopped
    again, which is a new plateau and worth asking about — but never more
    than that, because asking a third time is nagging.
  */
  const said = of(d.events, 'cue')
    .map((e) => e.cue)
    .filter(isTurnFurtherCue);
  assert.deepEqual(
    said.filter((cue, i) => said.indexOf(cue) === i),
    ['turnFurtherRight', 'turnFurtherLeft', 'turnFurtherDown'],
  );
  for (const cue of said) {
    assert.ok(said.filter((c) => c === cue).length <= 2, `${cue} was said too often`);
  }
});

test('nudge: a turn that arrives never sees it, and neither does a turn still coming', () => {
  // The scan as it is meant to go: 28° each way and a 25° nod.
  const clean = drive(scanning());
  assert.equal(clean.state.completeReason, 'coverage');
  assert.deepEqual(of(clean.events, 'cue').map((e) => e.cue).filter(isTurnFurtherCue), []);

  // And a 25° turner, who is short of the aim but past the hand-over.
  let d = walk(scanning(), 900, () => face({ stability: 0.95 }));
  d = walk(d, 3000, path(SQUARE, { yaw: 25, pitch: 0 }, 1500));
  assert.equal(d.state.step, 'left', 'a 25° turn is a turn');
  assert.deepEqual(of(d.events, 'cue').map((e) => e.cue).filter(isTurnFurtherCue), []);

  // A turn that takes six seconds to make is still a turn being made: it
  // gains ground the whole way, so there is no plateau to notice.
  let slow = walk(scanning(), 900, () => face({ stability: 0.95 }));
  slow = walk(slow, 6200, path(SQUARE, { yaw: TURN_HANDOVER_DEG, pitch: 0 }, 6000));
  assert.deepEqual(of(slow.events, 'cue').map((e) => e.cue).filter(isTurnFurtherCue), []);
  assert.equal(slow.state.step, 'left', 'and it got there inside its own time');
});

test('nudge: the front step never asks anybody to look straighter', () => {
  // Square on has nowhere further to go, and a person looking at their
  // own phone being told to look straighter is build 17's gate in a hat.
  const held18 = () => face({ yaw: 18, stability: 0.95 });
  let d = walk(scanning(), 2600, held18);
  assert.equal(d.state.step, 'front', 'held short of the front window on purpose');
  assert.ok(!stepReached(d.state, 'front'), 'and genuinely short of it');
  assert.equal(TURN_FURTHER_CUE.front, null);
  assert.equal(turnFurtherWanted(d.state, d.now, 'front'), false);
  assert.equal(d.state.cue, null);

  // Through the whole of the front step's own time, still nothing said.
  d = walk(d, STEP_TIMEOUT_MS.front - 2_600 + 200, held18);
  assert.equal(d.state.step, 'right', 'the front step hands over as it always did');
  assert.deepEqual(of(d.events, 'cue').map((e) => e.cue).filter(isTurnFurtherCue), []);

  /*
    And the same head at the same 18°, once the step it is in IS a turn:
    now there is somewhere to go and the scan says so. That contrast is
    the rule — the nudge asks for more of a movement the step asked for,
    and `front` asks for no movement at all.
  */
  const into = () => d.now - (d.state.stepStartedAt ?? d.now);
  d = walk(d, NUDGE_AFTER_SHARE * STEP_TIMEOUT_MS.right - into() + 200, held18);
  assert.equal(d.state.cue, 'turnFurtherRight');
});

test('nudge: a reading that creeps upward by hundredths has stopped, and is asked', () => {
  /*
    The plateau has a floor under it (`NUDGE_GAIN_REACH`) because a
    smoothed reading climbs by hundredths of a degree while a head sits
    perfectly still. Without it, the creep would read as movement and
    somebody who had plainly stopped would never be asked.
  */
  let d = walk(scanning(), 900, () => face({ stability: 0.95 }));
  const creep = path(SQUARE, { yaw: 12, pitch: 0 }, 400);
  d = walk(d, 1000, creep);
  const gain = NUDGE_GAIN_REACH * TURN_YAW_DEG * 0.5;
  d = walk(d, 2600, (t) => face({ yaw: 12 + (gain * Math.min(t, 2600)) / 2600, stability: 0.95 }));
  assert.ok(d.state.steps.right.reach > 12 / TURN_YAW_DEG, 'the reading did climb');
  assert.equal(d.state.cue, 'turnFurtherRight', 'and climbing that slowly is not turning');
  const held = d.state.steps.right;
  assert.ok(
    held.gainedAt === null || d.now - held.gainedAt >= NUDGE_PLATEAU_MS,
    'the plateau is measured from the last real movement',
  );
});

test('nudge: a head that never set off is never told to keep turning', () => {
  /*
    The nudge asks for MORE of something. Somebody sitting square on
    through a whole turn step has not stopped short of anything, and a
    phone that can see they never started telling them to "keep turning"
    is a phone describing a movement that did not happen. Their step's own
    title and the arrow ask them, as they always did.
  */
  let d = walk(scanning(), 900, () => face({ stability: 0.95 }));
  assert.equal(d.state.step, 'right');
  const into = () => d.now - (d.state.stepStartedAt ?? d.now);
  d = walk(d, STEP_TIMEOUT_MS.right - into() - 200, () => face({ stability: 0.95 }));
  assert.equal(d.state.step, 'right', 'still inside the step it never started');
  assert.equal(d.state.steps.right.gainedAt, null, 'no movement, so no plateau to time from');
  assert.equal(turnFurtherWanted(d.state, d.now), false);
  assert.deepEqual(of(d.events, 'cue').map((e) => e.cue).filter(isTurnFurtherCue), []);

  /*
    And the same for a head that drifts. `NUDGE_STARTED_SHARE` of the way
    to the hand-over is about 4.8° of turn — above the couple of degrees a
    head wanders by while it is being held still, and far below the twelve
    the owner's case turns — so a drift is not a short turn either.
  */
  d = walk(d, STEP_TIMEOUT_MS.right - into() + 100, () => face({ stability: 0.95 }));
  assert.equal(d.state.step, 'left', 'and the step ended as it always did');
  const drift = NUDGE_STARTED_SHARE * TURN_HANDOVER_DEG;
  assert.ok(drift > 3 && drift < 12, `${drift}° is the floor under "started"`);
  d = walk(d, STEP_TIMEOUT_MS.left - into() - 200, () => face({ yaw: -3, stability: 0.95 }));
  assert.ok(d.state.steps.left.gainedAt !== null, 'the reading did move');
  assert.ok(d.state.steps.left.reach < NUDGE_STARTED_SHARE * STEP_TARGETS.left.reach);
  assert.equal(turnFurtherWanted(d.state, d.now), false, 'three degrees is not a turn that stopped');
  assert.deepEqual(of(d.events, 'cue').map((e) => e.cue).filter(isTurnFurtherCue), []);

  // Nothing of this is a gate: the scan runs on and ends on its own time.
  d = toEnd(d, () => face({ stability: 0.95 }));
  assert.notEqual(d.state.status, 'capturing', 'the steps ran themselves out');
  assert.notEqual(d.state.scanner, 'error', 'and a person who did not move is not a failure');
  const elapsed = d.now - (d.state.startedAt ?? d.now);
  assert.ok(elapsed <= FORCED_FINISH_MS, `${elapsed} ms is past the backstop`);
});

test('nudge: the ask is a beat, and the plate goes back to the light after it', () => {
  /*
    The nudge outranks "find a brighter spot" — which is right while it is
    asking and wrong for the rest of a step. A sticky ask would bury the
    lighting line for fifteen seconds of a twenty-two second scan, and
    poor light is exactly what makes the shallow frames such a scan keeps
    worse. So it asks for `NUDGE_SAY_MS` and then stands down.
  */
  const dark = 0.15;
  const hold = () => face({ yaw: 12, stability: 0.95 });
  let d = walkIn(scanning(), 900, () => face({ stability: 0.95 }), dark);
  assert.equal(d.state.step, 'right');
  assert.equal(d.state.cue, 'brighter', 'the room was dark before the turn stopped');

  d = walkIn(d, 1200, path(SQUARE, { yaw: 12, pitch: 0 }, 600), dark);
  const into = () => d.now - (d.state.stepStartedAt ?? d.now);
  d = walkIn(d, NUDGE_AFTER_SHARE * STEP_TIMEOUT_MS.right - into() + 200, hold, dark);
  assert.equal(d.state.cue, 'turnFurtherRight', 'the turn comes first while it is being asked for');

  // A beat later the ask is done, and the light is worth saying again.
  d = walkIn(d, NUDGE_SAY_MS, hold, dark);
  assert.equal(turnFurtherWanted(d.state, d.now), false, 'the ask is a beat, not a banner');
  assert.equal(d.state.cue, 'brighter', 'and the lighting is not buried for the rest of the step');

  // Standing still is asked about once: it does not come back by itself.
  d = walkIn(d, STEP_TIMEOUT_MS.right - into() - 200, hold, dark);
  assert.equal(d.state.cue, 'brighter');
  const said = of(d.events, 'cue').map((e) => e.cue).filter(isTurnFurtherCue);
  assert.deepEqual(said, ['turnFurtherRight'], 'one plateau, one ask');
});

test('nudge: it waits out the step\'s opening, and speaks in the captured band', () => {
  /*
    This test used to assert that `stepRelaxed` holds on every tick the
    nudge speaks, and it passed for a reason its own fixture supplied: at
    yaw 12° the temple can never be captured, so `stepRelaxed`'s FIRST
    line — `if (state.targets[…].captured) return false` — was never
    reached. Driven at 18° it fails, because capture opens at
    `CAPTURE_REACH` of the target (about 13.3°) while the hand-over is at
    19°: the region gets a frame, the turn is still short, and the nudge
    speaks with `stepRelaxed` false. That band IS the shallow turn the
    nudge exists for, so it is what this test drives.

    What is actually true, and pinned here: the nudge waits out the step's
    opening, it is bounded to a beat, and it does speak in the band where
    a poor frame has already been taken.
  */
  assert.ok(
    NUDGE_AFTER_SHARE >= STEP_RELAX_SHARE,
    'the nudge may not fire before a step still chasing its first frame has relaxed',
  );

  const shallow = (yaw: number) => {
    let d = walk(scanning(), 900, () => face({ stability: 0.95 }));
    d = walk(d, 1200, path(SQUARE, { yaw, pitch: 0 }, 600));
    const pose = face({ yaw, stability: 0.95 });
    const start = d.now;
    // Read while the step is still `right`: after the loop the state has
    // moved on to `left` and its `stepStartedAt` with it.
    const stepStartedAt = d.state.stepStartedAt;
    let first: number | null = null;
    let last: number | null = null;
    let captured = false;
    for (let t = 33; t <= STEP_TIMEOUT_MS.right && d.state.step === 'right'; t += 33) {
      d = dispatch(d, { type: 'tick', at: start + t, face: pose, lighting: 0.8 });
      for (const request of [...d.state.pending]) {
        d = dispatch(d, {
          type: 'captured',
          requestId: request.id,
          image: { ...image, uri: `file:///${request.id}.jpg` },
          at: d.now,
        });
      }
      if (held(d.state, 'leftTemple').captured) captured = true;
      if (!isTurnFurtherCue(d.state.cue)) continue;
      if (first === null) first = d.now;
      last = d.now;
    }
    return { first, last, captured, stepStartedAt };
  };

  // 18°: past the capture threshold, short of the hand-over. The region
  // HAS a frame and the nudge still asks for the turn that would replace
  // it — the case the old fixture could not reach.
  const deep = shallow(18);
  assert.ok(deep.captured, 'the fixture really does reach the captured band');
  assert.ok(deep.first !== null, 'and the shallow turn is still asked about once a frame is held');

  // 12°: nothing captured, the plain short turn. Asked about too.
  const shy = shallow(12);
  assert.equal(shy.captured, false, 'at 12° the temple is never captured');
  assert.ok(shy.first !== null, 'the plain short turn is asked about');

  // Both wait out the opening, and both are a beat rather than a banner.
  for (const [name, run] of [['18°', deep], ['12°', shy]] as const) {
    const { first, last, stepStartedAt } = run;
    assert.ok(first !== null && last !== null && stepStartedAt !== null);
    assert.ok(
      first - stepStartedAt >= NUDGE_AFTER_SHARE * STEP_TIMEOUT_MS.right,
      `${name}: the nudge spoke before the step's opening was over`,
    );
    assert.ok(
      last - first <= NUDGE_SAY_MS,
      `${name}: the ask ran ${last - first} ms, longer than the ${NUDGE_SAY_MS} ms beat`,
    );
  }
});

test('choreography: an unsteady hand costs picture quality, never the whole scan', () => {
  /*
    Steadiness is a shaky HAND, not a turning head — `stabilityOf` reads
    the centre moving and the size changing, and treats a deliberate turn
    with a still phone as steady. But one shaky scan used to cost
    everything: no request was ever raised, all four steps ran out, and
    `settle` found no frames at all and showed the error screen. A step
    that has held its pose with nothing to show for it settles for a worse
    picture instead, and the frame carries its low quality with it.
  */
  const shaky = (pose: (t: number) => FaceReading) => (t: number) => ({ ...pose(t), stability: 0.5 });
  let d = walk(scanning(), 900, shaky(() => face()));
  assert.ok(held(d.state, 'hairline').captured, 'the hairline, blurry and honest about it');
  d = walk(d, 2000, shaky(path(SQUARE, RIGHT, 1200)));
  d = walk(d, 2600, shaky(path(RIGHT, LEFT, 1800)));
  d = walk(d, 2600, shaky(path(LEFT, DOWN, 1800)));
  assert.notEqual(d.state.scanner, 'error', 'a shaky hand is not a failed scan');
  assert.equal(requiredFrames(d.state).length, 4);
  // What it cost is the picture, and the record says so. The hairline is
  // the honest comparison — the same pose in both runs, so steadiness is
  // the only thing between them — and the scan as a whole is worse off.
  const steady = fullScan();
  assert.ok(held(d.state, 'hairline').quality < held(steady.state, 'hairline').quality);
  const mean = (x: Driver) =>
    REQUIRED_REGIONS.reduce((sum, r) => sum + held(x.state, r).quality, 0) / REQUIRED_REGIONS.length;
  assert.ok(mean(d) < mean(steady), `${mean(d)} vs ${mean(steady)}`);
});

test('choreography: a step gives nothing away until it has held its pose with nothing to show', () => {
  // The relaxation is not a lower gate; it is a gate that gives way, and
  // only for a step that has been standing in the right pose empty-handed.
  let d = scanning();
  assert.ok(!stepRelaxed(d.state, d.now), 'not at the moment of the press');
  d = run(d, 99, () => face({ stability: 0.3 }));
  assert.ok(!stepRelaxed(d.state, d.now), 'nor a tenth of a second in');
  assert.equal(of(d.events, 'capture').length, 0, 'so an unsteady frame is refused');
  d = run(d, STEP_ARRIVED_GRACE_MS, () => face({ stability: 0.3 }));
  assert.ok(stepRelaxed(d.state, d.now), 'held the pose, still nothing: it gives way');
  assert.equal(of(d.events, 'capture').length, 1, 'and takes the picture it can get');
  assert.ok(STABLE_RELAXED < STABLE_MIN);

  // Below even the floor, nothing is taken: a picture of a smear is not
  // worth a file on somebody's phone.
  let e = scanning();
  e = run(e, STEP_ARRIVED_GRACE_MS + 200, () => face({ stability: STABLE_RELAXED - 0.05 }));
  assert.equal(of(e.events, 'capture').length, 0);
  // And what it gives way on is the picture, never the pose: no relaxation
  // ever labels a square-on frame as a temple.
  let f = walk(scanning(), 900, () => face({ stability: 0.95 }));
  assert.equal(f.state.step, 'right');
  f = walk(f, STEP_TIMEOUT_MS.right + 200, () => face({ stability: 0.95 }));
  assert.ok(!held(f.state, 'leftTemple').captured, 'a head that never turned has no temple frame');
});

test('choreography: the bar inside a step rises with the pose and finishes with the frame', () => {
  let d = walk(scanning(), 900, () => face({ stability: 0.95 }));
  assert.equal(d.state.step, 'right');
  assert.equal(stepProgress(d.state), 0, 'a fresh step starts at nothing');

  // Half the turn is most of the bar, and it cannot fall back.
  d = run(d, 900, (t) => face({ yaw: (TURN_YAW_DEG * Math.min(t, 900)) / 1800, stability: 0.95 }));
  const half = stepProgress(d.state);
  assert.ok(half > 0.3 && half < 0.8, `${half}`);
  d = run(d, 300, () => face({ yaw: 0, stability: 0.95 }));
  assert.ok(stepProgress(d.state) >= half, 'turning back through the middle costs nothing');

  // The frame is what finishes it.
  d = walk(d, 2000, path(SQUARE, RIGHT, 1200));
  assert.equal(stepProgress(d.state), 0, 'and the next step starts at nothing again');
});

test('honesty: the engine names poses and pictures, and never anything about hair', () => {
  /*
    The engine may say where a head is, how steady it was and which part
    of it a photograph shows. It may not say anything about the hair on
    it, and it may not put a number on anything it did not compute.
  */
  const source = readFileSync('src/features/hair-scan/engine.ts', 'utf8');
  for (const claim of ['density', 'thinning', 'balding', 'regrowth', 'diagnos', 'out of 100']) {
    assert.ok(!source.toLowerCase().includes(claim), `the engine must not mention "${claim}"`);
  }
  // Nothing leaves the device: no network of any kind from the engine.
  for (const reach of ['fetch(', 'http://', 'https://', 'XMLHttpRequest', 'WebSocket']) {
    assert.ok(!source.includes(reach), `the engine must not reach for ${reach}`);
  }
  // Every figure the state carries is 0–1 and derived from what happened.
  const d = fullScan();
  assert.ok(d.state.completion >= 0 && d.state.completion <= 1);
  for (const step of SCAN_STEPS) {
    const held = d.state.steps[step];
    assert.ok(held.reach >= 0 && held.reach <= 1, `${step} reach ${held.reach}`);
    assert.ok(held.frames >= d.state.frames.filter((f) => STEP_OF_REGION[f.target] === step).length);
  }
  for (const region of REQUIRED_REGIONS) {
    const target = d.state.targets[region];
    assert.ok(target.quality >= 0 && target.quality <= 1);
    // A region reads as captured only while a frame it names is held.
    assert.equal(target.captured, d.state.frames.some((f) => f.id === target.frameId));
  }
});

test('choreography: a crown taken deeper replaces one taken at the edge of the nod', () => {
  let d = sweptScan();
  assert.equal(d.state.step, 'down');
  d = landAll(run(d, 200, () => face({ pitch: -(CROWN_PITCH_DEG + 3), stability: 0.9 })));
  const first = held(d.state, 'crown');
  assert.ok(first.captured);
  assert.ok(first.quality < GOOD_QUALITY, `${first.quality}`);
  d = landAll(run(d, CAPTURE_INTERVAL_MS + 66, () => face({ pitch: -CROWN_FULL_DEG, stability: 0.95 })));
  const better = held(d.state, 'crown');
  assert.ok(better.quality > first.quality + REPLACE_MARGIN, `${first.quality} → ${better.quality}`);
  assert.notEqual(better.frameId, first.frameId);
});

test('choreography: the whole scan is budgeted in seconds, and the timeouts are the ceiling', () => {
  const worst = SCAN_STEPS.reduce((sum, step) => sum + STEP_TIMEOUT_MS[step], 0);
  assert.ok(worst >= 20_000 && worst <= 30_000, `${worst} ms is not a KYC pace`);
  assert.ok(FORCED_FINISH_MS >= worst, 'the backstop sits under all four');
  assert.ok(FORCED_FINISH_MS <= worst + 6_000, 'and not far under');
  assert.ok(STEP_SETTLE_MS <= 1_000, 'the beat between "we have it" and "next" is paid four times');
});

test('choreography: there is no shutter — the engine asks for the frames itself', () => {
  // The action union is the whole of what the screen may tell the engine.
  // Nothing in it is a capture, a shutter, a hold or a release: frames are
  // requested by the engine as the person moves, and that is the phase.
  const actions: ScanAction['type'][] = [
    'continue',
    'permission',
    'start',
    'tick',
    'captured',
    'captureFailed',
    'process',
    'processed',
    'fail',
    'retry',
    'cancel',
  ];
  for (const forbidden of ['capture', 'shutter', 'hold', 'release', 'snap']) {
    assert.ok(!actions.includes(forbidden as ScanAction['type']), `${forbidden} is not an action`);
  }
  // `captured` is the camera ANSWERING the engine, never a person firing.
  let d = walk(scanning(), 900, () => face({ stability: 0.95 }));
  const requests = of(d.events, 'capture');
  assert.ok(requests.length >= 1, 'the engine raised the request itself');
  assert.ok(requests.every((r) => r.request.target === 'hairline'), 'and only for the step it is on');
  d = walk(d, 2000, path(SQUARE, RIGHT, 1200));
  assert.ok(
    of(d.events, 'capture').every((r) => ['hairline', 'leftTemple'].includes(r.request.target)),
    'a step never asks for another step’s region',
  );
});

test('choreography: several frames per step, the best kept and every other one named for deletion', () => {
  const d = walk(scanning(), 2400, path(SQUARE, RIGHT, 1200));
  const asked = of(d.events, 'capture').filter((r) => r.request.target === 'leftTemple').length;
  assert.ok(asked >= 2, `only ${asked} frames asked for across a step`);
  assert.equal(d.state.frames.filter((f) => f.target === 'leftTemple').length, 1, 'one is kept');
  const let_go = of(d.events, 'discard').flatMap((e) => e.images).length;
  const landed = of(d.events, 'frame').length;
  assert.equal(landed - d.state.frames.length, let_go, 'every other image was named for deletion');
  assert.ok(d.state.steps.right.frames >= 2, 'and the step counted what it cost');
});

/* ----------------------------- geometry ------------------------------ */

test('ring: a right turn points at three o’clock, chin down at six, a left turn at nine', () => {
  assert.equal(Math.round(headDirection({ yaw: YAW_FULL_DEG, pitch: 0 }).angle), 90);
  assert.equal(Math.round(headDirection({ yaw: 0, pitch: -PITCH_DOWN_FULL_DEG }).angle), 180);
  assert.equal(Math.round(headDirection({ yaw: -YAW_FULL_DEG, pitch: 0 }).angle), 270);
  assert.equal(Math.round(headDirection({ yaw: 0, pitch: PITCH_DOWN_FULL_DEG }).angle), 0);
  assert.ok(Math.abs(headDirection({ yaw: YAW_FULL_DEG, pitch: 0 }).magnitude - 1) < 1e-9);
  assert.equal(binOf(headDirection({ yaw: 0, pitch: 0 })), 0, 'square on is the front bin');
  assert.equal(regionOfBin(binOf(headDirection({ yaw: YAW_FULL_DEG, pitch: 0 }))), 'right');
  assert.equal(regionOfBin(binOf(headDirection({ yaw: -YAW_FULL_DEG, pitch: 0 }))), 'left');
  assert.equal(regionOfBin(binOf(headDirection({ yaw: 0, pitch: -PITCH_DOWN_FULL_DEG }))), 'chin');
  assert.equal(sectorOf(0), 0);
  assert.equal(sectorOf(359.9), RING_SECTORS - 1);
  assert.equal(sectorOf(360), 0);
});

test('ring: a full right turn fills the right sectors and none of the left', () => {
  const fill = fillFor(headDirection({ yaw: YAW_FULL_DEG, pitch: 0 }));
  assert.equal(fill.length, RING_SECTORS);
  for (const i of RIGHT_SECTORS) assert.equal(fill[i], 1, `sector ${i}`);
  for (const i of LEFT_SECTORS) assert.equal(fill[i], 0, `sector ${i}`);
  for (const i of CHIN_SECTORS) assert.equal(fill[i], 0, `sector ${i}`);
  const half = fillFor(headDirection({ yaw: YAW_FULL_DEG * 0.65, pitch: 0 }));
  assert.ok((half[6] ?? 0) > 0.3 && (half[6] ?? 0) < 0.7, `half turn fills ${half[6]}`);
  assert.ok(fillFor(headDirection({ yaw: 0, pitch: 0 })).every((v) => v === 0));
});

test('ring: the whole dial is walkable — no sector the choreography cannot reach', () => {
  /*
    The ring is a picture of the journey and the report prints a figure
    beside it, so a sector that no pose can ever light is the app telling
    somebody their scan is incomplete while saying it closed. The dial
    used to be a compass — its top was the chin LIFTED, which this
    choreography never asks for — and a third of it was dark at the end
    of a perfect scan. Walk both stages here and every sector must light.
  */
  const best = new Array<number>(RING_SECTORS).fill(0);
  const walk = (stage: 'sweep' | 'crown', pitch: number) => {
    for (let yaw = -YAW_FULL_DEG; yaw <= YAW_FULL_DEG; yaw += 1) {
      const dir = ringDirection({ yaw, pitch }, stage);
      if (dir === null) continue;
      const fill = fillFor(dir);
      for (let i = 0; i < RING_SECTORS; i += 1) best[i] = Math.max(best[i], fill[i] ?? 0);
    }
  };
  walk('sweep', -10);
  walk('crown', -CROWN_FULL_DEG);
  for (let i = 0; i < RING_SECTORS; i += 1) {
    assert.equal(best[i], 1, `sector ${i} never lights`);
  }

  // And the two stages really are two halves: neither walks the other's.
  const sweepOnly = new Array<number>(RING_SECTORS).fill(0);
  for (let yaw = -YAW_FULL_DEG; yaw <= YAW_FULL_DEG; yaw += 1) {
    const dir = ringDirection({ yaw, pitch: -10 }, 'sweep');
    assert.ok(dir !== null);
    const fill = fillFor(dir);
    for (let i = 0; i < RING_SECTORS; i += 1) sweepOnly[i] = Math.max(sweepOnly[i], fill[i] ?? 0);
  }
  for (const i of CHIN_SECTORS) assert.equal(sweepOnly[i], 0, `sector ${i} is stage two's`);

  // Stage two does not begin until the chin is down.
  assert.equal(ringDirection({ yaw: 0, pitch: 0 }, 'crown'), null);
  assert.ok(ringDirection({ yaw: 0, pitch: -CROWN_PITCH_DEG }, 'crown') !== null);
});

test('ring: stage two continues the journey rather than starting it again', () => {
  let d = sweptScan();
  const afterSweep = d.state.sectors.slice();
  assert.ok(RIGHT_SECTORS.every((i) => (afterSweep[i] ?? 0) > 0.5), 'stage one filled the right arm');
  assert.ok(LEFT_SECTORS.every((i) => (afterSweep[i] ?? 0) > 0.5), 'and the left');
  assert.ok(CHIN_SECTORS.every((i) => (afterSweep[i] ?? 0) === 0), 'and left the bottom empty');

  // The chin goes down and the same turn now walks the bottom arc.
  d = run(d, 1200, nod(0, -PITCH_DOWN_FULL_DEG, 1200));
  d = run(d, 1500, turn(0, 24, 1500, -PITCH_DOWN_FULL_DEG));
  for (let i = 0; i < RING_SECTORS; i += 1) {
    assert.ok((d.state.sectors[i] ?? 0) >= (afterSweep[i] ?? 0) - 1e-9, `sector ${i} was cleared`);
  }
  assert.ok(CHIN_SECTORS.some((i) => (d.state.sectors[i] ?? 0) > 0), 'the bottom arc filled in stage two');
  assert.ok(d.state.regions.chin > 0);
  assert.equal(completionOf(REGION_NEEDED), 1, 'the ring’s own reading still reads');
});

/* ------------------------------ filling ------------------------------ */

test('scanning: the journey figure only ever rises, across a messy scan', () => {
  let d = scanning();
  let last = 0;
  const wobble = (t: number) =>
    face({
      yaw: 30 * Math.sin(t / 900),
      pitch: -8 * Math.sin(t / 1300),
      stability: 0.5 + 0.5 * Math.sin(t / 200),
    });
  for (let t = 33; t <= 8000; t += 33) {
    d = dispatch(d, { type: 'tick', at: d.now + 33, face: t % 700 < 60 ? null : wobble(t), lighting: 0.7 });
    assert.ok(d.state.completion >= last - 1e-12, `progress fell at ${t}`);
    last = d.state.completion;
    for (const v of d.state.sectors) assert.ok(v >= 0 && v <= 1);
  }
});

test('scanning: a dark frame still counts, and a whipped one does not', () => {
  // Build 17 refused to fill in poor light. A dark frame is a frame; it
  // simply scores low, and a better-lit pass replaces it.
  let d = scanning();
  d = run(d, 2000, turn(0, YAW_FULL_DEG, 2000), 0.1);
  assert.ok(d.state.sectors.some((v) => v > 0), 'a dark room does not stop the ring');
  assert.ok(held(d.state, 'leftTemple').reach > 0);

  d = scanning();
  // 30° in one frame is a whip, not a turn.
  d = dispatch(d, { type: 'tick', at: d.now + 33, face: face({ yaw: 0 }), lighting: 0.8 });
  // Square on is the start of the journey, so the top of the dial is
  // already lit. What the whip must not do is move it.
  const before = d.state.sectors.slice();
  assert.ok(before.some((v) => v > 0), 'square on lights the top of the dial');
  d = dispatch(d, { type: 'tick', at: d.now + 33, face: face({ yaw: 30 }), lighting: 0.8 });
  assert.equal(of(d.events, 'tooFast').length, 1);
  assert.equal(d.state.cue, 'tooFast');
  assert.deepEqual(d.state.sectors, before, 'a whipped frame does not fill');
  d = dispatch(d, { type: 'tick', at: d.now + 33, face: face({ yaw: 0 }), lighting: 0.8 });
  assert.equal(of(d.events, 'tooFast').length, 1, 'the event is throttled');
  assert.equal(d.state.cue, 'tooFast');
});

/* ------------------------------ capture ------------------------------ */

test('capture: a request needs a steady head near the step’s own target, and nothing else', () => {
  // Three ticks a pose: the first of a jump reads as a whip, and a
  // whipped frame is refused whatever else is true of it.
  let d = scanning();
  d = run(d, 99, () => face({ stability: 0.3 }));
  assert.equal(of(d.events, 'capture').length, 0, 'not steady');
  d = run(d, 99, () => face({ yaw: FRONT_YAW_DEG - 2, stability: 0.9 }));
  assert.equal(of(d.events, 'capture').length, 0, 'turned away from the step’s pose');
  d = run(d, 99, () => face({ pitch: -SWEEP_PITCH_DOWN_LIMIT_DEG, stability: 0.9 }));
  assert.equal(of(d.events, 'capture').length, 0, 'bowed: no hairline to photograph');
  d = run(d, 99, () => face(), null);
  const requests = of(d.events, 'capture');
  assert.equal(requests.length, 1, 'steady, square on, light unmeasured');
  assert.equal(requests[0]?.request.target, 'hairline');
  assert.equal(requests[0]?.request.bin, 0);
  assert.equal(requests[0]?.request.region, 'front');
  assert.equal(d.state.pending.length, 1);

  // Far away and dark: still a frame, because neither is anybody's fault.
  let e = scanning();
  e = run(e, 33, () => face({ size: 0.2, bounds: { x: 0.4, y: 0.35, width: 0.2, height: 0.3 } }), 0.1);
  assert.equal(of(e.events, 'capture').length, 1, 'distance and light do not gate the shutter');
});

/*
  What the throttle is, and what it is not.

  `CAPTURE_INTERVAL_MS` is a floor between two requests, not the rate.
  A step asks only for its own region and `targetWants` refuses a second
  request while one is out for it, so the shutter is really paced by the
  camera's round trip — which is why a whole four-step scan raises a
  handful of requests rather than a handful per step.
*/
test('capture: one request at a time per region, no sooner than the throttle allows', () => {
  let d = scanning();
  d = run(d, 33, () => face());
  assert.equal(of(d.events, 'capture').length, 1);
  const first = of(d.events, 'capture')[0]?.request as CaptureRequest;

  d = run(d, 990, () => face());
  assert.equal(of(d.events, 'capture').length, 1, 'no duplicate while pending');

  d = dispatch(d, { type: 'captureFailed', requestId: first.id, at: d.now });
  d = run(d, 33, () => face());
  assert.equal(of(d.events, 'capture').length, 2, 'a failed request is asked again once the throttle allows');
  const second = of(d.events, 'capture')[1]?.request as CaptureRequest;
  assert.ok(second.at - first.at >= CAPTURE_INTERVAL_MS);

  d = dispatch(d, { type: 'captureFailed', requestId: second.id, at: d.now });
  d = run(d, 330, () => face());
  assert.equal(of(d.events, 'capture').length, 2, 'throttled');
  d = run(d, CAPTURE_INTERVAL_MS, () => face());
  assert.equal(of(d.events, 'capture').length, 3);
});

test('capture: a good frame is not asked for again; a poor one is replaced by a better one', () => {
  // The rule, on its own. A region with nothing wants anything; a region
  // holding a good picture wants nothing; a region holding a poor one
  // wants a frame that beats it by more than the margin.
  const base = createScanState();
  const withHairline = (quality: number): ScanState => ({
    ...base,
    targets: { ...base.targets, hairline: { captured: true, quality, frameId: 'h', reach: 1 } },
  });
  assert.ok(targetWants(base, 'hairline', 0.1), 'nothing yet: anything is worth having');
  assert.ok(!targetWants(withHairline(GOOD_QUALITY), 'hairline', 1), 'good: never asked again');
  assert.ok(!targetWants(withHairline(0.5), 'hairline', 0.5 + REPLACE_MARGIN / 2), 'not enough better');
  assert.ok(targetWants(withHairline(0.5), 'hairline', 0.5 + REPLACE_MARGIN + 0.01));
  assert.ok(
    !targetWants({ ...withHairline(0.2), pending: [pendingFor('hairline')] }, 'hairline', 0.9),
    'and never while one is already in flight for it',
  );

  // And on the step itself: held short of the turn it asks for, the step
  // keeps working, and each frame it lands beats the one before it.
  let d = walk(scanning(), 900, () => face({ stability: 0.95 }));
  assert.equal(d.state.step, 'right');
  const part = TURN_HANDOVER_DEG - 1;
  // Turned into the pose rather than snapped to it: a jump is a whip.
  d = landAll(run(d, 600, (t) => face({ yaw: (part * Math.min(t, 600)) / 600, stability: 0.6 }), 0.4));
  d = landAll(run(d, 500, () => face({ yaw: part, stability: 0.6 }), 0.4));
  const poor = held(d.state, 'leftTemple');
  assert.ok(poor.captured && poor.quality < 0.7, `${poor.quality}`);
  assert.equal(d.state.step, 'right', 'the step is still waiting for the turn itself');

  const n = of(d.events, 'capture').length;
  d = run(d, CAPTURE_INTERVAL_MS + 66, () => face({ yaw: part, stability: 0.6 }), 0.4);
  assert.equal(of(d.events, 'capture').length, n, 'the same pose in the same light is not worth a shutter');

  d = run(d, CAPTURE_INTERVAL_MS + 66, () => face({ yaw: part, stability: 1 }), 0.95);
  assert.equal(of(d.events, 'capture').length, n + 1, 'better light and a steadier hand are');
  d = landAll(d);
  assert.equal(d.state.frames.filter((f) => f.target === 'leftTemple').length, 1, 'replaced, not added');
  assert.ok(held(d.state, 'leftTemple').quality > poor.quality);
  assert.ok(of(d.events, 'frame').some((f) => f.replaced), 'and the old one was named as replaced');
});

test('capture: a worse frame landing for a bin is dropped, the better one kept', () => {
  let d = scanning();
  d = run(d, 33, () => face(), 0.9);
  d = landAll(d);
  const kept = d.state.frames[0] as ScanFrame;
  // Forge a pending request for the same bin at a lower quality, as if the
  // conditions had dropped between the request and the shutter.
  const worse: CaptureRequest = { ...kept, id: 'forged', quality: kept.quality - 0.3, at: d.now };
  d = { ...d, state: { ...d.state, pending: [worse] } };
  d = dispatch(d, { type: 'captured', requestId: 'forged', image: { ...image, uri: 'file:///worse.jpg' }, at: d.now });
  assert.equal(d.state.frames.length, 1);
  assert.equal(d.state.frames[0]?.id, kept.id);
  assert.equal(d.state.pending.length, 0);
  assert.equal(of(d.events, 'frame').length, 1, 'a dropped frame is not announced');
  assert.deepEqual(
    of(d.events, 'discard').map((e) => [e.reason, e.images.map((i) => i.uri)]),
    [['outscored', ['file:///worse.jpg']]],
    'but its file is named for deletion',
  );
});

test('curation: a replaced frame is named for deletion, and only its own region’s', () => {
  let d = scanning();
  d = run(d, 33, () => face({ stability: 0.6 }), 0.4);
  d = dispatch(d, { type: 'captured', requestId: 'c1', image: { ...image, uri: 'file:///poor.jpg' }, at: d.now });
  d = run(d, CAPTURE_INTERVAL_MS, () => face(), 0.9);
  assert.equal(d.state.pending.length, 1);
  d = { ...d, events: [] };
  d = landAll(d);
  assert.deepEqual(of(d.events, 'frame').map((f) => f.replaced), [true]);
  assert.deepEqual(
    of(d.events, 'discard').map((e) => [e.reason, e.images.map((i) => i.uri)]),
    [['replaced', ['file:///poor.jpg']]],
  );

  // Four frames, all four in the same ring bin, one per region. A better
  // crown lands: it replaces the crown and nothing else is touched.
  const frames = REQUIRED_REGIONS.map((region) => spare(region, region === 'crown' ? 0.4 : 0.7));
  const better: CaptureRequest = {
    id: 'last', bin: SHARED_BIN, region: regionOfBin(SHARED_BIN), target: 'crown',
    sector: SHARED_BIN, yaw: 0, pitch: -26, quality: 0.75, at: d.now,
  };
  let e: Driver = { state: { ...scanning().state, frames, pending: [better] }, events: [], now: d.now };
  e = dispatch(e, { type: 'captured', requestId: 'last', image: { ...image, uri: 'file:///better-crown.jpg' }, at: e.now });
  assert.equal(e.state.frames.length, REQUIRED_REGIONS.length);
  assert.ok(e.state.frames.some((f) => f.id === 'last'), 'the better crown is kept');
  assert.deepEqual(
    of(e.events, 'discard').map((x) => [x.reason, x.images.map((i) => i.uri)]),
    [['replaced', ['file:///crown.jpg']]],
    'the old crown, and nothing that shared its bin',
  );
  for (const region of ['hairline', 'leftTemple', 'rightTemple'] as const) {
    assert.ok(e.state.frames.some((f) => f.target === region), `${region} survived the crown landing`);
  }
});

test('cancel: mid-scan, the kept frames are named for deletion and in-flight requests are not forgotten', () => {
  let d = scanning();
  d = run(d, 33, () => face(), 0.9);
  d = landAll(d);
  d = run(d, 1500, turn(0, TEMPLE_FULL_DEG, 1500));
  assert.ok(d.state.frames.length >= 1);
  assert.ok(d.state.pending.length >= 1, 'a request is in flight');
  const inFlight = d.state.pending.map((p) => p.id);
  const kept = d.state.frames.map((f) => f.uri);
  d = { ...d, events: [] };

  d = dispatch(d, { type: 'cancel', at: d.now });
  assert.equal(d.state.scanner, 'instructions');
  assert.equal(d.state.frames.length, 0);
  assert.equal(d.state.pending.length, 0);
  assert.deepEqual(d.state.abandoned, inFlight);
  assert.deepEqual(
    of(d.events, 'discard').map((e) => [e.reason, e.images.map((i) => i.uri)]),
    [['abandoned', kept]],
  );

  // The camera answers anyway: the file is discarded, the id is forgotten, nothing else moves.
  d = { ...d, events: [] };
  const [first, ...rest] = inFlight;
  d = dispatch(d, { type: 'captured', requestId: first ?? '', image: { ...image, uri: 'file:///late.jpg' }, at: d.now });
  assert.deepEqual(d.events, [{ type: 'discard', images: [{ ...image, uri: 'file:///late.jpg' }], reason: 'late' }]);
  assert.equal(d.state.scanner, 'instructions');
  assert.deepEqual(d.state.abandoned, rest);
  for (const id of rest) {
    d = dispatch(d, { type: 'captureFailed', requestId: id, at: d.now });
  }
  assert.deepEqual(d.state.abandoned, []);
  assert.equal(of(d.events, 'discard').length, 1, 'a failure has no file to discard');

  // A cancel with nothing in it says nothing.
  const quiet = dispatch(atReady(), { type: 'cancel', at: 0 });
  assert.equal(of(quiet.events, 'discard').length, 0);
});

test('cancel: from the report the frames are the journal’s, and nothing is discarded', () => {
  let d = fullScan();
  d = dispatch(d, { type: 'process', at: d.now });
  d = dispatch(d, { type: 'processed', at: d.now });
  d = { ...d, events: [] };
  d = dispatch(d, { type: 'cancel', at: d.now });
  assert.equal(d.state.scanner, 'instructions');
  assert.equal(of(d.events, 'discard').length, 0);

  // But before the report they are still the engine’s: a cancel from processing lets go of them.
  let e = fullScan();
  const uris = e.state.frames.map((f) => f.uri);
  e = dispatch(e, { type: 'process', at: e.now });
  e = { ...e, events: [] };
  e = dispatch(e, { type: 'cancel', at: e.now });
  assert.deepEqual(of(e.events, 'discard').map((x) => x.images.map((i) => i.uri)), [uris]);
});

test('retry: from a mid-scan failure the frames are named for deletion and the journey starts over', () => {
  let d = scanning();
  d = run(d, 33, () => face(), 0.9);
  d = landAll(d);
  d = run(d, 1500, turn(0, TEMPLE_FULL_DEG, 1500));
  const inFlight = d.state.pending.map((p) => p.id);
  const uris = d.state.frames.map((f) => f.uri);
  d = { ...d, events: [] };
  d = dispatch(d, { type: 'fail', reason: 'cameraFailed', at: d.now });
  assert.equal(d.state.scanner, 'error');
  assert.equal(d.state.frames.length, uris.length, 'the error screen still holds them');
  assert.deepEqual(d.state.pending, []);
  assert.deepEqual(d.state.abandoned, inFlight);
  assert.equal(of(d.events, 'discard').length, 0, 'not yet');
  d = dispatch(d, { type: 'retry', at: d.now });
  assert.equal(d.state.scanner, 'ready');
  assert.equal(d.state.frames.length, 0);
  assert.equal(d.state.completion, 0);
  assert.equal(d.state.step, 'front');
  assert.ok(SCAN_STEPS.every((s) => !d.state.steps[s].done));
  assert.deepEqual(d.state.abandoned, inFlight, 'still owed by the camera');
  assert.deepEqual(of(d.events, 'discard').map((e) => [e.reason, e.images.map((i) => i.uri)]), [['abandoned', uris]]);
});

test('capture: an answer to an unknown request is ignored', () => {
  const d = scanning();
  const step = reduce(d.state, { type: 'captured', requestId: 'nope', image, at: d.now });
  assert.equal(step.state, d.state);
  assert.deepEqual(step.events, []);
});

/*
  The bug that cost build 17 its crown.

  The store used to be keyed by RING BIN and the requirements by REGION,
  and the two are not the same thing. A phone held below eye level puts
  the hairline at a chin-down angle — bin 7 — and every crown frame taken
  without much turn lands in bin 7 as well. The hairline scored higher
  (it is square on; the crown's pose term is capped below one), so crown
  after crown was thrown away as 'outscored', the scan ran the full
  seventy-five seconds, and it ended on 'timeout' with the one picture
  the owner asked for missing.
*/
test('curation: the crown is not thrown away for sharing a ring bin with the hairline', () => {
  // The hairline already in, taken with the chin 10° down, in bin 7.
  const hairline = spare('hairline', 0.9);
  assert.equal(binOf(headDirection({ yaw: 0, pitch: -10 })), SHARED_BIN, 'the premise of the bug');
  const crown: CaptureRequest = {
    id: 'crown1', bin: SHARED_BIN, region: regionOfBin(SHARED_BIN), target: 'crown',
    sector: SHARED_BIN, yaw: 2, pitch: -24, quality: 0.5, at: 6000,
  };
  let e: Driver = {
    state: {
      ...scanning().state,
      step: 'down',
      stepIndex: 3,
      stage: 'crown',
      frames: [hairline],
      targets: { ...createScanState().targets, hairline: { captured: true, quality: 0.9, frameId: hairline.id, reach: 1 } },
      pending: [crown],
    },
    events: [],
    now: 6000,
  };
  e = dispatch(e, { type: 'captured', requestId: 'crown1', image: { ...image, uri: 'file:///crown1.jpg' }, at: e.now });
  assert.ok(held(e.state, 'crown').captured, 'the crown is kept although the hairline scored higher in its bin');
  assert.ok(held(e.state, 'hairline').captured, 'and the hairline is still there');
  assert.equal(of(e.events, 'discard').length, 0, 'nothing was thrown away');
  assert.equal(e.state.frames.length, 2);
});

/*
  The same bug the other way round: a crown that outscored a weak temple
  used to take its place, un-capturing a region the scan can no longer
  ask for, because stage two offers only the crown.
*/
test('curation: a strong crown cannot take a weak temple’s place', () => {
  const temple = spare('leftTemple', 0.3);
  const crown: CaptureRequest = {
    id: 'crown1', bin: SHARED_BIN, region: regionOfBin(SHARED_BIN), target: 'crown',
    sector: SHARED_BIN, yaw: 0, pitch: -28, quality: 0.85, at: 6000,
  };
  let e: Driver = {
    state: {
      ...scanning().state,
      step: 'down',
      stepIndex: 3,
      stage: 'crown',
      frames: [temple],
      targets: { ...createScanState().targets, leftTemple: { captured: true, quality: 0.3, frameId: temple.id, reach: 1 } },
      pending: [crown],
    },
    events: [],
    now: 6000,
  };
  e = dispatch(e, { type: 'captured', requestId: 'crown1', image: { ...image, uri: 'file:///crown1.jpg' }, at: e.now });
  assert.ok(held(e.state, 'leftTemple').captured, 'the temple is still the report’s');
  assert.equal(held(e.state, 'leftTemple').frameId, temple.id);
  assert.ok(held(e.state, 'crown').captured);
});

test('curation: a whole scan keeps one frame per region and never more than four', () => {
  const d = fullScan();
  assert.equal(MAX_FRAMES, REQUIRED_REGIONS.length);
  assert.ok(d.state.frames.length <= MAX_FRAMES);
  const targets = d.state.frames.map((f) => f.target);
  assert.equal(new Set(targets).size, targets.length, 'one frame per region');
  assert.equal(primaryFrame(d.state)?.target, 'hairline');
  assert.deepEqual(orderedFrames(d.state).map((f) => f.target), [...REQUIRED_REGIONS]);
  const four = requiredFrames(d.state);
  assert.equal(four.length, 4, 'a frame for each of the four regions');
  assert.deepEqual(four.map((f) => f.target), [...REQUIRED_REGIONS]);
  const right = four.find((f) => f.target === 'rightTemple');
  const left = four.find((f) => f.target === 'leftTemple');
  const crown = four.find((f) => f.target === 'crown');
  const hairline = four.find((f) => f.target === 'hairline');
  assert.ok(right && left && crown && hairline);
  assert.ok(left.yaw >= TEMPLE_YAW_DEG, `left temple kept at ${left.yaw}°`);
  assert.ok(right.yaw <= -TEMPLE_YAW_DEG, `right temple kept at ${right.yaw}°`);
  assert.ok(crown.pitch <= -CROWN_PITCH_DEG, `crown kept at ${crown.pitch}° of pitch`);
  assert.ok(Math.abs(hairline.yaw) <= HAIRLINE_YAW_DEG, `hairline kept at ${hairline.yaw}°`);
});

/*
  The owner's phone, held the way a phone is held: a little below eye
  level, so the chin is down about ten degrees for the whole of stage
  one — and then down properly for stage two, with hardly any turn,
  because somebody looking at the top of their own head does not swing it
  about. Every frame of that scan lands in one ring bin. It has to finish.
*/
test('choreography: a phone held below eye level still gets all four regions', () => {
  const low = -10;
  assert.equal(binOf(headDirection({ yaw: 0, pitch: low })), SHARED_BIN, 'the poses really do collide');
  let d = walk(scanning(), 900, () => face({ pitch: low, stability: 0.95 }));
  d = walk(d, 2000, path({ yaw: 0, pitch: low }, { yaw: TURN_YAW_DEG, pitch: low }, 1200));
  d = walk(d, 2600, path({ yaw: TURN_YAW_DEG, pitch: low }, { yaw: -TURN_YAW_DEG, pitch: low }, 1800));
  assert.equal(d.state.step, 'down', 'the upright steps closed');
  d = walk(d, 2600, path({ yaw: -TURN_YAW_DEG, pitch: low }, { yaw: -4, pitch: -DOWN_PITCH_DEG }, 1800));
  assert.ok(held(d.state, 'crown').captured, 'the crown, which build 17 discarded over and over');
  assert.equal(d.state.completeReason, 'coverage', 'not a timeout');
  assert.ok(d.now - (d.state.startedAt ?? 0) < FORCED_FINISH_MS, 'and long before the escape hatch');
  assert.equal(requiredFrames(d.state).length, 4);
});

/*
  The label is not decoration: the screen turns a frame's `region` into
  the journal's angle. A hairline taken with the phone low sits in a
  chin-down bin over on the left of the ring, and used to be filed in the
  record as a left temple — so the report drew its temple crop from a
  picture of somebody's forehead.
*/
test('curation: a frame is labelled by what it is of, not by the bin it fell in', () => {
  const low = -10;
  let d = scanning();
  d = landAll(run(d, 300, () => face({ pitch: low, stability: 0.95 })));
  const hairline = d.state.frames.find((f) => f.target === 'hairline');
  assert.ok(hairline, 'no hairline frame');
  assert.equal(hairline.bin, SHARED_BIN, 'the pose really was off to one side of the ring');
  assert.equal(hairline.region, 'front', 'and the picture is still of the front of the head');

  d = landAll(run(d, 2000, turn(0, TEMPLE_FULL_DEG, 2000, low)));
  assert.equal(d.state.frames.find((f) => f.target === 'leftTemple')?.region, 'left');
  d = landAll(run(d, 2000, turn(TEMPLE_FULL_DEG, 0, 2000, low)));
  d = landAll(run(d, 2000, turn(0, -TEMPLE_FULL_DEG, 2000, low)));
  assert.equal(d.state.frames.find((f) => f.target === 'rightTemple')?.region, 'right');
  d = landAll(run(d, 1500, nod(low, -CROWN_FULL_DEG, 1500)));
  assert.equal(d.state.frames.find((f) => f.target === 'crown')?.region, 'chin');
});

test('completion: the figure cannot read 100% while the crown is missing', () => {
  let d = sweptScan();
  assert.ok(d.state.completion < 1, 'three of four is not a finished scan');
  // The head goes down, deeply, and turns, for a long time. The camera
  // never answers, so no crown is ever kept.
  d = run(d, 3000, nod(0, -CROWN_FULL_DEG, 1500));
  d = run(d, 4000, turn(-30, 30, 4000, -CROWN_FULL_DEG));
  assert.ok(!held(d.state, 'crown').captured);
  assert.equal(d.state.completion, (3 + REACH_CEILING) / 4, 'pose alone never closes the last quarter');
  assert.equal(d.state.status, 'capturing', 'and the scan knows it is not done');
});

/*
  Lighting gates nothing and never took the button down. It used to be
  able to take the guidance line, which was the only place the
  choreography was taught — somebody scanning in a dim room was told to
  find a brighter spot for the whole scan and never once told what to do
  with their head. The step's title and instruction are not this line's
  to take any more, so a dark room can say its piece and the choreography
  carries on underneath it.
*/
test('scanning: a dark room is mentioned, and costs nothing else', () => {
  const dark = 0.05;
  let d = walkIn(scanning(), 900, () => face({ stability: 0.95 }), dark);
  d = walkIn(d, 2000, path(SQUARE, RIGHT, 1200), dark);
  d = walkIn(d, 2600, path(RIGHT, LEFT, 1800), dark);
  assert.equal(d.state.step, 'down', 'the upright steps closed in the dark');
  assert.ok(REQUIRED_REGIONS.slice(0, 3).every((r) => held(d.state, r).captured));
  assert.equal(d.state.cue, 'brighter', 'and the room is mentioned');
});

test('scanning: a correction always outranks the mention of the light', () => {
  const dark = 0.05;
  let d = scanning();
  d = run(d, 200, () => face({ bounds: { x: 0.8, y: 0.2, width: 0.46, height: 0.6 } }), dark);
  assert.equal(d.state.cue, 'faceCamera', 'a head leaving the picture comes first');
  d = run(d, LOST_MS + 200, () => null, dark);
  assert.equal(d.state.cue, 'lost');
});

/* --------------------------- lost and stalled ------------------------ */

test('scanning: losing the face asks for it back, and finding it says so once', () => {
  let d = scanning();
  d = run(d, 300, () => face());
  d = run(d, LOST_MS - 100, () => null);
  assert.equal(of(d.events, 'lost').length, 0, 'a dropped frame or two is not a loss');
  d = run(d, 200, () => null);
  assert.equal(of(d.events, 'lost').length, 1);
  assert.equal(d.state.cue, 'lost');
  d = run(d, 200, () => null);
  assert.equal(of(d.events, 'lost').length, 1, 'said once');
  d = run(d, 66, () => face());
  assert.equal(of(d.events, 'found').length, 1);
  assert.notEqual(d.state.cue, 'lost');
});

test('scanning: a head that earns nothing for a while is a stall, said once', () => {
  let d = scanning();
  d = run(d, STALL_MS + 200, () => face());
  assert.equal(of(d.events, 'stall').length, 1);
  d = run(d, 2000, () => face());
  assert.equal(of(d.events, 'stall').length, 1, 'not repeated');
  // Movement clears it and re-arms it.
  d = run(d, 1500, turn(0, TEMPLE_YAW_DEG, 1500));
  assert.ok(!d.state.stalled);
  d = run(d, STALL_MS + 200, () => face({ yaw: TEMPLE_YAW_DEG, stability: 0.9 }));
  assert.equal(of(d.events, 'stall').length, 2);
});

test('scanning: the hold-still cue appears only after lingering unsteadily where a frame is wanted', () => {
  let d = scanning();
  d = run(d, 200, () => face({ stability: 0.3 }));
  assert.equal(d.state.cue, null, 'a moment of wobble is not worth a line');
  d = run(d, 500, () => face({ stability: 0.3 }));
  assert.equal(d.state.cue, 'holdStill');
  d = run(d, 33, () => face());
  assert.equal(d.state.cue, null, 'steady again: the step’s own instruction is all there is');
});

/* ------------------------------ finishing ---------------------------- */

test('finish: a scan nobody follows still ends, on the steps’ own timeouts', () => {
  // Somebody who presses Start and then does nothing at all: each step
  // waits its own time, hands over, and the scan ends honestly.
  let d = scanning();
  d = landAll(run(d, 33, () => face()));
  assert.equal(d.state.frames.length, 1, 'the hairline, which needs nothing doing');
  d = toEnd(d, () => face({ yaw: 5, stability: 0.9 }));
  assert.deepEqual(of(d.events, 'scanComplete'), [{ type: 'scanComplete', reason: 'timeout' }]);
  assert.equal(d.state.scanner, 'complete');
  assert.equal(d.state.status, 'complete');
  assert.ok(d.state.completion < 1, 'three regions missing is not a full scan');
  assert.equal(d.state.frames.length, 1);
  const elapsed = (d.state.completedAt ?? d.now) - (d.state.startedAt ?? 0);
  assert.ok(elapsed <= FORCED_FINISH_MS, `${elapsed} ms is past the backstop`);
  assert.ok(stepsDone(d.state), 'every step handed over');
});

test('finish: a forced finish with no frames at all is an error, not a report', () => {
  let d = scanning();
  d = toEnd(d, () => face({ stability: 0.2 }));
  assert.equal(d.state.scanner, 'error');
  assert.equal(d.state.error, 'noFrames');
});

test('finish: completing waits for in-flight frames, but not forever', () => {
  // A camera that answers the hairline and then goes quiet: the temple's
  // request is still out when the forced finish arrives.
  let d = scanning();
  d = landAll(run(d, 33, () => face()));
  assert.equal(d.state.frames.length, 1);
  d = run(d, 800, () => face({ yaw: TURN_YAW_DEG, stability: 0.95 }));
  assert.ok(d.state.pending.length > 0, 'a request is out');
  d = toEnd(d, () => face({ yaw: TURN_YAW_DEG, stability: 0.95 }));
  assert.equal(d.state.status, 'completing');
  assert.equal(d.state.scanner, 'scanning');
  const n = of(d.events, 'capture').length;
  d = run(d, 300, () => face({ yaw: TURN_YAW_DEG, stability: 0.95 }));
  assert.equal(d.state.scanner, 'scanning', 'still waiting');
  assert.equal(of(d.events, 'capture').length, n, 'no new requests while completing');
  d = run(d, SETTLE_MS, () => face({ yaw: TURN_YAW_DEG, stability: 0.95 }));
  assert.equal(d.state.scanner, 'complete', 'gave up waiting');
  assert.equal(d.state.pending.length, 0);
  assert.equal(of(d.events, 'capture').length, n);
  assert.equal(d.state.frames.length, 1, 'the one frame that landed');

  // The camera answers after all: the file is discarded, the frame set is not touched.
  const lateId = d.state.abandoned[0];
  assert.ok(lateId, 'the request given up on is remembered');
  d = { ...d, events: [] };
  d = dispatch(d, { type: 'captured', requestId: lateId, image: { ...image, uri: 'file:///late.jpg' }, at: d.now });
  assert.equal(d.state.scanner, 'complete');
  assert.equal(d.state.frames.length, 1);
  assert.deepEqual(d.events, [{ type: 'discard', images: [{ ...image, uri: 'file:///late.jpg' }], reason: 'late' }]);
  assert.ok(!d.state.abandoned.includes(lateId));

  // Or the frame lands in time, and the scan completes at once.
  let e = scanning();
  e = landAll(run(e, 33, () => face()));
  e = run(e, 800, () => face({ yaw: TURN_YAW_DEG, stability: 0.95 }));
  e = toEnd(e, () => face({ yaw: TURN_YAW_DEG, stability: 0.95 }));
  assert.equal(e.state.status, 'completing');
  const [outstanding] = e.state.pending;
  assert.ok(outstanding);
  e = dispatch(e, { type: 'captured', requestId: outstanding.id, image: { ...image, uri: 'file:///in-time.jpg' }, at: e.now });
  assert.equal(e.state.scanner, 'complete');
  assert.ok(e.state.frames.some((f) => f.id === outstanding.id), 'it was kept');
});

test('quality: a frame at a region’s edge is never good; the same conditions at the turn are', () => {
  const edge = frameQuality(face({ yaw: TEMPLE_YAW_DEG, stability: 0.9 }), 0.85, 'rightTemple');
  const turned = frameQuality(face({ yaw: TEMPLE_FULL_DEG, stability: 0.9 }), 0.85, 'rightTemple');
  assert.ok(edge < GOOD_QUALITY, `${edge}`);
  assert.ok(turned >= GOOD_QUALITY, `${turned}`);
  assert.ok(turned > edge + REPLACE_MARGIN, 'worth the shutter');
  const shallow = frameQuality(face({ pitch: -CROWN_PITCH_DEG, stability: 0.9 }), 0.85, 'crown');
  const deep = frameQuality(face({ pitch: -CROWN_FULL_DEG, stability: 0.9 }), 0.85, 'crown');
  assert.ok(deep > shallow + REPLACE_MARGIN, 'the deeper nod is the better crown');
  // With no region named it falls back to the ring bin, as the ring's own frames are scored.
  assert.equal(poseFit(headDirection({ yaw: 0, pitch: 0 })), 1, 'square on fits the front bin');
  assert.equal(poseFit(headDirection({ yaw: YAW_FULL_DEG * FRONT_DEVIATION, pitch: 0 })), 0);
  assert.ok(frameQuality(face({ stability: 0.9 }), 0.85) > 0.5);
});

test('frames: every image the engine let go of was named in a discard, over a whole scan', () => {
  // Every uri the camera ever produced is either kept, or in a discard: nothing leaks.
  let d = drive(scanning());
  d = landAll(d);
  d = dispatch(d, { type: 'cancel', at: d.now });
  const produced = new Set(of(d.events, 'capture').map((c) => `file:///${c.request.id}.jpg`));
  const discarded = of(d.events, 'discard').flatMap((e) => e.images.map((i) => i.uri));
  assert.ok(produced.size >= 4);
  assert.deepEqual(discarded.slice().sort(), [...produced].sort(), 'a captured file went unaccounted for');
  assert.equal(new Set(discarded).size, discarded.length, 'no file is discarded twice');
});

test('reducer: never mutates the state it is given', () => {
  const d = scanning();
  const snapshot = JSON.stringify(d.state);
  const frozen = JSON.parse(snapshot) as ScanState;
  const s1 = reduce(frozen, { type: 'tick', at: d.now + 33, face: face({ yaw: 20, stability: 0.9 }), lighting: 0.8 });
  reduce(s1.state, { type: 'tick', at: d.now + 66, face: face({ yaw: 25, stability: 0.9 }), lighting: 0.8 });
  assert.equal(JSON.stringify(frozen), snapshot);
});

/* --------------------------- the mesh on the still ------------------- */

/** The preview of a tall phone and the still its 4:3 front camera writes. */
const VIEW = { width: 393, height: 852 };
const STILL = { width: 1440, height: 1920 };

/** A tracked face drawn in the preview, frozen for a shutter. */
function meshOf(t = 0): FrameMesh {
  const tracked = trackFrame(createTracker(), syntheticFace(VIEW, t, 1000 + t), 1000 + t);
  const mesh = tracked.face === null ? null : snapshotMesh(tracked.face, VIEW);
  assert.ok(mesh, 'the synthetic face was not tracked');
  return mesh;
}

const near = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test('mesh: a frame keeps the mesh it landed with, and only that one', () => {
  let d = scanning();
  d = run(d, 33, () => face({ stability: 0.6 }), 0.4);
  const poor = meshOf(0);
  d = dispatch(d, { type: 'captured', requestId: 'c1', image, mesh: poor, at: d.now });
  assert.deepEqual(d.state.frames[0]?.mesh, poor);

  // A better frame replaces it, and brings its own mesh — the old one goes with the old frame.
  d = run(d, CAPTURE_INTERVAL_MS, () => face(), 0.9);
  const better = meshOf(400);
  assert.notDeepEqual(better, poor, 'the synthetic head had moved');
  const [request] = d.state.pending;
  assert.ok(request);
  d = dispatch(d, { type: 'captured', requestId: request.id, image, mesh: better, at: d.now });
  assert.equal(d.state.frames.length, 1);
  assert.deepEqual(d.state.frames[0]?.mesh, better);

  // A frame that lands without one carries none, rather than somebody else's.
  const bare = reduce(
    { ...d.state, pending: [{ ...request, id: 'bare', bin: 3, region: regionOfBin(3), target: 'rightTemple' }] },
    { type: 'captured', requestId: 'bare', image, at: d.now },
  ).state;
  const landed = bare.frames.find((f) => f.id === 'bare');
  assert.ok(landed);
  assert.ok(!('mesh' in landed), 'no mesh key at all');
  assert.deepEqual(bare.frames.find((f) => f.bin === 0)?.mesh, better, 'the front kept its own');
});

test('mesh: curation and ordering carry every survivor’s mesh through', () => {
  const meshes = new Map<ScanTarget, FrameMesh>();
  const frames = REQUIRED_REGIONS.map((region, i) => {
    const mesh = meshOf(i * 90);
    meshes.set(region, mesh);
    return { ...spare(region, region === 'crown' ? 0.4 : 0.7), mesh };
  });
  const better: CaptureRequest = {
    id: 'last', bin: SHARED_BIN, region: regionOfBin(SHARED_BIN), target: 'crown',
    sector: SHARED_BIN, yaw: -10, pitch: -26, quality: 0.75, at: 5000,
  };
  const lastMesh = meshOf(1500);
  let e: Driver = { state: { ...scanning().state, frames, pending: [better] }, events: [], now: 5000 };
  e = dispatch(e, { type: 'captured', requestId: 'last', image, mesh: lastMesh, at: e.now });
  assert.equal(e.state.frames.length, REQUIRED_REGIONS.length);
  for (const f of orderedFrames(e.state)) {
    const expected = f.id === 'last' ? lastMesh : meshes.get(f.target);
    assert.deepEqual(f.mesh, expected, `frame ${f.id} lost its mesh`);
  }
  assert.ok(!e.state.frames.some((f) => f.id === 'f-crown'), 'the shallow crown still goes');
});

test('cover: a still fills its box on the longer side and is centred on the other', () => {
  // A 4:3 still into a tall preview: height meets, the sides are cropped.
  const tall = coverFit(STILL, VIEW);
  near(tall.scale, VIEW.height / STILL.height);
  near(tall.y, 0);
  near(tall.x, (VIEW.width - STILL.width * tall.scale) / 2);
  assert.ok(tall.x < 0, 'the sides overflow');

  // Into a square disc: width meets, top and bottom are cropped.
  const disc = coverFit(STILL, { width: 176, height: 176 });
  near(disc.scale, 176 / STILL.width);
  near(disc.x, 0);
  assert.ok(disc.y < 0);

  // Into itself: nothing moves. A box with no size: nothing breaks.
  assert.deepEqual(coverFit(STILL, STILL), { scale: 1, x: 0, y: 0 });
  assert.deepEqual(coverFit(STILL, { width: 0, height: 0 }), { scale: 1, x: 0, y: 0 });
});

test('mesh: the snapshot is the tracked face as fractions of the preview, unflipped', () => {
  const tracked = trackFrame(createTracker(), syntheticFace(VIEW, 0, 1000), 1000);
  const tf = tracked.face;
  assert.ok(tf);
  const mesh = snapshotMesh(tf, VIEW);
  assert.ok(mesh);
  near(mesh.viewAspect, VIEW.width / VIEW.height);
  near(mesh.bounds.x, (tf.cx - tf.width / 2) / VIEW.width);
  near(mesh.bounds.y, (tf.cy - tf.height / 2) / VIEW.height);
  near(mesh.bounds.width, tf.width / VIEW.width);
  const oval = mesh.contours.FACE;
  const rawOval = tf.contours.FACE;
  assert.ok(oval && rawOval && oval.length === rawOval.length);
  for (let i = 0; i < oval.length; i += 1) {
    near(oval[i]?.x ?? Number.NaN, (rawOval[i]?.x ?? Number.NaN) / VIEW.width);
    near(oval[i]?.y ?? Number.NaN, (rawOval[i]?.y ?? Number.NaN) / VIEW.height);
  }
  for (const points of Object.values(mesh.contours)) {
    for (const p of points) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, 'inside the preview');
  }
  // No preview yet is no place to be a fraction of.
  assert.equal(snapshotMesh(tf, { width: 0, height: 0 }), null);
});

test('mesh: the snapshot carries the head\'s angles, and only when they are numbers', () => {
  const tracked = trackFrame(createTracker(), syntheticFace(VIEW, 0, 1000), 1000).face;
  assert.ok(tracked);
  const turned = { ...tracked, yaw: 24, pitch: -6, roll: 3 };
  const mesh = snapshotMesh(turned, VIEW);
  assert.ok(mesh);
  assert.deepEqual(mesh.pose, { yaw: 24, pitch: -6, roll: 3 });

  // A reading with a hole in it carries no pose: the still's cap is then square on, not NaN.
  const blind = snapshotMesh({ ...tracked, roll: Number.NaN }, VIEW);
  assert.ok(blind);
  assert.equal(blind.pose, undefined);
  assert.equal('pose' in blind, false);
});

test('mesh: laid into a box, the angles pass through untouched, and none is invented', () => {
  const base = meshOf(0);
  const posed: FrameMesh = { ...base, pose: { yaw: -31, pitch: 12, roll: -2 } };
  const onDisc = meshInBox(posed, STILL, { width: 176, height: 176 });
  assert.deepEqual(onDisc.pose, { yaw: -31, pitch: 12, roll: -2 });
  // The angles are the head's, not the box's: the same whatever it is drawn into.
  assert.deepEqual(meshInBox(posed, STILL, VIEW).pose, onDisc.pose);

  const { pose: _dropped, ...bare } = posed;
  void _dropped;
  const flat = meshInBox(bare, STILL, { width: 176, height: 176 });
  assert.equal(flat.pose, undefined);
  assert.equal('pose' in flat, false);
});

test('mesh: laid into the still it lands where the preview showed it, through the crop', () => {
  const mesh = meshOf(0);

  // Drawn in a box the preview's own shape, the face comes back where it was, in points.
  const back = meshInBox(mesh, STILL, VIEW);
  const tracked = trackFrame(createTracker(), syntheticFace(VIEW, 0, 1000), 1000).face;
  assert.ok(tracked);
  near(back.cx, tracked.cx, 1e-6);
  near(back.cy, tracked.cy, 1e-6);
  near(back.width, tracked.width, 1e-6);
  near(back.height, tracked.height, 1e-6);
  near(back.contours.FACE?.[0]?.x ?? Number.NaN, tracked.contours.FACE?.[0]?.x ?? Number.NaN, 1e-6);

  // Drawn on the whole still: the preview showed the still scaled to
  // its height (852/1920) with 123 points cropped off each side, so the
  // preview's left edge is 123 / (852/1920) pixels into the still, and
  // the preview's centre is the still's centre.
  const edge: FrameMesh = {
    ...mesh,
    bounds: { x: 0, y: 0.25, width: 0.5, height: 0.5 },
    contours: { FACE: [{ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }] },
  };
  const onStill = meshInBox(edge, STILL, STILL);
  const cropped = (STILL.width * (VIEW.height / STILL.height) - VIEW.width) / 2;
  near(cropped, 123, 1e-9);
  const pxPerPoint = STILL.height / VIEW.height;
  near(onStill.contours.FACE?.[0]?.x ?? Number.NaN, cropped * pxPerPoint, 1e-6);
  near(onStill.contours.FACE?.[1]?.x ?? Number.NaN, STILL.width / 2, 1e-6);
  near(onStill.contours.FACE?.[2]?.x ?? Number.NaN, STILL.width - cropped * pxPerPoint, 1e-6);
  near(onStill.contours.FACE?.[1]?.y ?? Number.NaN, STILL.height / 2, 1e-6);
  near(onStill.width, 0.5 * VIEW.width * pxPerPoint, 1e-6);
  near(onStill.cx, (0.25 * VIEW.width + cropped) * pxPerPoint, 1e-6);

  // On a square disc the width meets and the centre is still the centre.
  const disc = meshInBox(edge, STILL, { width: 176, height: 176 });
  near(disc.contours.FACE?.[1]?.x ?? Number.NaN, 88, 1e-6);
  near(disc.contours.FACE?.[1]?.y ?? Number.NaN, 88, 1e-6);
  const left = disc.contours.FACE?.[0]?.x ?? Number.NaN;
  const right = disc.contours.FACE?.[2]?.x ?? Number.NaN;
  assert.ok(left < 88 && right > 88, 'left stays left: nothing is mirrored twice');
  near(88 - left, right - 88, 1e-6);
});

/* --------------------------- whole-scan driver ----------------------- */

/**
 * A frame the engine did not take, filed under the region it stands for.
 *
 * Every one of them sits in the SAME ring bin on purpose: that is what a
 * phone held below eye level does, and it is the collision that used to
 * throw the crown away frame after frame.
 */
const SHARED_BIN = 7;
function spare(target: ScanTarget, quality: number, uri = `file:///${target}.jpg`): ScanFrame {
  return {
    ...image,
    uri,
    id: `f-${target}`,
    bin: SHARED_BIN,
    region: regionOfBin(SHARED_BIN),
    target,
    sector: SHARED_BIN,
    yaw: 0,
    pitch: -10,
    quality,
    capturedAt: 0,
  };
}

/**
 * Ticks for `ms` with the camera answering every request on the spot —
 * the closest a reducer test gets to a phone taking pictures while
 * somebody keeps moving. Stops early if the scan finishes.
 */
function walkIn(
  d: Driver,
  ms: number,
  pose: (t: number) => FaceReading,
  lighting: number,
): Driver {
  const start = d.now;
  let cur = d;
  for (let t = 33; t <= ms; t += 33) {
    if (cur.state.status !== 'capturing') return cur;
    cur = dispatch(cur, { type: 'tick', at: start + t, face: pose(t), lighting });
    for (const request of [...cur.state.pending]) {
      cur = dispatch(cur, {
        type: 'captured',
        requestId: request.id,
        image: { ...image, uri: `file:///${request.id}.jpg` },
        at: cur.now,
      });
    }
  }
  return cur;
}

/** The same, in good light. */
function walk(d: Driver, ms: number, pose: (t: number) => FaceReading): Driver {
  return walkIn(d, ms, pose, 0.85);
}

/** A head moving from one pose to another over `ms`, then holding it. */
const path =
  (from: { yaw: number; pitch: number }, to: { yaw: number; pitch: number }, ms: number) =>
  (t: number): FaceReading => {
    const k = Math.min(1, t / ms);
    return face({
      yaw: from.yaw + (to.yaw - from.yaw) * k,
      pitch: from.pitch + (to.pitch - from.pitch) * k,
      stability: 0.95,
    });
  };

const SQUARE = { yaw: 0, pitch: 0 };
const RIGHT = { yaw: TURN_YAW_DEG, pitch: 0 };
const LEFT = { yaw: -TURN_YAW_DEG, pitch: 0 };
const DOWN = { yaw: 0, pitch: -DOWN_PITCH_DEG };

/**
 * The scan as the owner describes it: one continuous motion, straight
 * ahead, round to the right, all the way round to the left, then down.
 * Nothing presses a shutter anywhere in it.
 */
function drive(start: Driver): Driver {
  let d = walk(start, 900, () => face({ stability: 0.95 }));
  d = walk(d, 2000, path(SQUARE, RIGHT, 1200));
  d = walk(d, 2600, path(RIGHT, LEFT, 1800));
  d = walk(d, 2600, path(LEFT, DOWN, 1800));
  return d;
}

/** A scan with the three upright steps behind it, standing on `down`. */
function sweptScan(): Driver {
  let d = walk(scanning(), 900, () => face({ stability: 0.95 }));
  d = walk(d, 2000, path(SQUARE, RIGHT, 1200));
  d = walk(d, 2600, path(RIGHT, LEFT, 1800));
  assert.equal(d.state.step, 'down', 'the upright steps did not close');
  return { ...d, events: [] };
}

function fullScan(): Driver {
  let d = drive(scanning());
  assert.equal(d.state.completeReason, 'coverage', `stuck at ${d.state.completion}`);
  d = landAll(d);
  assert.equal(d.state.scanner, 'complete');
  return d;
}
