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
  FRAMES_PER_REGION,
  FRAME_GAP_MS,
  FRAME_TURN_DEG,
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
  PENDING_PER_TARGET,
  PITCH_DOWN_FULL_DEG,
  REACH_CEILING,
  REGION_MIN_FRAMES,
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
  distinctMoment,
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
  regionFrames,
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
import type { MaskImage } from '@/features/assessment/hair-mask';
import {
  ANALYSIS_PACING,
  absorbHandoffMs,
  orbitReadyMs,
  planAnalysis,
} from '@/features/hair-scan/analysis';
import { measureScan, type FaceObservation, type ScanFrameInput } from '@/features/hair-scan/measure';
import {
  REPEATED_FRAMES,
  SINGLE_FRAME_SPREAD,
  SPREAD_FLOOR,
  UNREPEATED_CONFIDENCE,
} from '@/features/hair-scan/measure/noise';
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
    all[region] = { captured: true, quality: 0.8, weakest: 0.8, frameIds: [region], reach: 1 };
  }
  assert.equal(journeyProgress(all), 1);
  assert.ok(isSufficient(all));
  assert.ok(
    !isSufficient({ ...all, crown: { captured: false, quality: 0, weakest: 0, frameIds: [], reach: 0 } }),
  );
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
    moved[region] = { captured: false, quality: 0, weakest: 0, frameIds: [], reach: 1 };
  }
  assert.equal(journeyProgress(moved), REACH_CEILING);
  assert.ok(REACH_CEILING < 1);
  assert.ok(journeyProgress(moved) > 0.5, 'but a head that went everywhere reads as most of the way');

  const threeOfFour = {
    ...moved,
    hairline: { captured: true, quality: 0.8, weakest: 0.8, frameIds: ['a'], reach: 1 },
    leftTemple: { captured: true, quality: 0.8, weakest: 0.8, frameIds: ['b'], reach: 1 },
    rightTemple: { captured: true, quality: 0.8, weakest: 0.8, frameIds: ['c'], reach: 1 },
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
  // Past the arrival by the settle beat: the step hands over on its
  // target rather than on its timeout, and a six-second turn is still a
  // turn being made, so nothing is ever asked for.
  slow = walk(slow, 6000 + STEP_SETTLE_MS + 200, path(SQUARE, { yaw: TURN_HANDOVER_DEG, pitch: 0 }, 6000));
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
    assert.ok(target.weakest >= 0 && target.weakest <= target.quality);
    // A region reads as captured only while the frames it names are held.
    assert.equal(target.captured, target.frameIds.length > 0);
    for (const id of target.frameIds) {
      assert.ok(d.state.frames.some((f) => f.id === id), `${region} names a frame it has not got`);
    }
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
  assert.notEqual(better.frameIds[0], first.frameIds[0]);
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

test('choreography: several frames per step, all of them kept and every other image named for deletion', () => {
  const d = walk(scanning(), 2400, path(SQUARE, RIGHT, 1200));
  const asked = of(d.events, 'capture').filter((r) => r.request.target === 'leftTemple').length;
  assert.ok(asked >= 2, `only ${asked} frames asked for across a step`);
  const kept = d.state.frames.filter((f) => f.target === 'leftTemple');
  assert.ok(kept.length >= REGION_MIN_FRAMES, `${kept.length} kept: a region needs two to disagree`);
  assert.ok(kept.length <= FRAMES_PER_REGION, `${kept.length} kept: past the region's own cap`);
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
  What paces the shutter, and what does not.

  `CAPTURE_INTERVAL_MS` is a floor between two requests; `FRAME_GAP_MS`
  is what makes a second picture worth taking at all. A still head is
  therefore photographed about every `FRAME_GAP_MS` and a turning one
  every `CAPTURE_INTERVAL_MS`, because the picture is changing — and a
  region may have two requests out at once, so a step no longer has to
  wait out a whole camera round trip between frames.
*/
test('capture: two requests may be in flight for a region, and never two for one moment', () => {
  let d = scanning();
  d = run(d, 33, () => face());
  assert.equal(of(d.events, 'capture').length, 1);
  const first = of(d.events, 'capture')[0]?.request as CaptureRequest;

  // The throttle has passed and the head has not moved: a second
  // photograph of one instant measures nothing and costs a file.
  d = run(d, CAPTURE_INTERVAL_MS + 66, () => face());
  assert.equal(of(d.events, 'capture').length, 1, 'the same instant is not asked for twice');

  // The gap passes and the region asks again with the first still out.
  d = run(d, FRAME_GAP_MS, () => face());
  assert.equal(of(d.events, 'capture').length, 2, 'a new moment, while the first is still unanswered');
  const second = of(d.events, 'capture')[1]?.request as CaptureRequest;
  assert.ok(second.at - first.at >= CAPTURE_INTERVAL_MS, 'never sooner than the throttle');
  assert.ok(second.at - first.at >= FRAME_GAP_MS, 'and never for a moment the region already has');
  assert.equal(d.state.pending.length, PENDING_PER_TARGET);

  // And never a third while those two are out.
  d = run(d, FRAME_GAP_MS * 2, () => face());
  assert.equal(of(d.events, 'capture').length, 2, 'two in flight is the ceiling');

  // A failed request frees the flight and is asked again.
  d = dispatch(d, { type: 'captureFailed', requestId: first.id, at: d.now });
  d = run(d, 33, () => face());
  assert.equal(of(d.events, 'capture').length, 3, 'a failed request leaves room for another');

  // A head that has turned is a new picture without waiting for the clock.
  let e = scanning();
  e = run(e, 33, () => face());
  assert.equal(of(e.events, 'capture').length, 1);
  e = run(e, CAPTURE_INTERVAL_MS + 33, turn(0, 12, 400));
  assert.equal(of(e.events, 'capture').length, 2, 'a turn is a new picture, clock or no clock');
  const moved = of(e.events, 'capture')[1]?.request as CaptureRequest;
  assert.ok(Math.abs(moved.yaw) >= FRAME_TURN_DEG, `${moved.yaw}° is not a different picture`);
});

test('capture: two requests in flight is never two shutters at once', () => {
  /*
    The device risk this phase introduced, pinned in the only place a
    reducer test can reach it: the screen's source.

    Build 19 could not have two capture requests out for one region, so
    it could not ask the camera for two photographs at once. This one
    can. On iOS every `capture()` builds a `CIImage` over one of the AR
    session's pixel buffers and holds it until the JPEG encode finishes,
    on a serial queue — two in flight hold two slots of a pool ARKit is
    still filling from the camera, and the second encode queues behind
    the first anyway. So `hair-scan.tsx` chains the `takePhoto` calls.

    If the chain ever goes, this fails, and the engine's constant keeps
    its meaning: a limit on OUTSTANDING REQUESTS, not on shutters.
  */
  assert.ok(PENDING_PER_TARGET > 1, 'the chain below is only needed while this is');
  const screen = readFileSync('src/app/hair-scan.tsx', 'utf8');
  assert.match(screen, /const shutter = useRef<Promise<unknown>>/, 'no shutter queue');
  assert.match(screen, /shutter\.current = shot\.then\(/, 'the queue never advances');
  /*
    Two places in this file ask the camera for a still, and both are
    accounted for: the scan's own capture, which goes through the chain,
    and the ready screen's light-meter probe, which only fires while the
    scanner is at 'ready' and which the chain waits for (`probeShot`). A
    third would be a shutter nobody is queueing.
  */
  const takes = screen.match(/camera\.current\?\.takePhoto\(\)/g) ?? [];
  assert.equal(takes.length, 2, `${takes.length} shutters in this file; two are queued`);
  assert.match(screen, /const free = probeShot\.current/, 'the probe is not the first link');
});

test('capture: a region wants two moments whatever they score, then only a better picture', () => {
  /*
    The rule, on its own, and the first line of it is the one that
    changed. A capture region with one perfect photograph still wants a
    second, because a place on the head that only one step ever sees —
    the crown — then has one reading, nothing to disagree with, and no
    error bar: `measure/noise.ts` caps it and `compareScans` refuses it,
    for the life of the journal. Quality decides which frames are kept;
    it does not decide whether that measurement is allowed to exist.
  */
  const base = createScanState();
  const withFrames = (...qualities: number[]): ScanState => ({
    ...base,
    targets: {
      ...base.targets,
      hairline: {
        captured: qualities.length > 0,
        quality: Math.max(0, ...qualities),
        weakest: qualities.length === 0 ? 0 : Math.min(...qualities),
        frameIds: qualities.map((_, i) => `h${i}`),
        reach: 1,
      },
    },
  });
  assert.ok(targetWants(base, 'hairline', 0.1), 'nothing yet: anything is worth having');
  assert.ok(
    targetWants(withFrames(1), 'hairline', 0.1),
    'one perfect picture is still one picture: the region has no spread of its own yet',
  );
  assert.ok(
    !targetWants(withFrames(GOOD_QUALITY, GOOD_QUALITY), 'hairline', 1),
    'two good ones: nothing more is asked for',
  );
  assert.ok(
    targetWants(withFrames(GOOD_QUALITY, 0.5), 'hairline', 0.1),
    'a third, while the poorest of them is short of good',
  );
  assert.ok(
    !targetWants(withFrames(0.9, 0.6, 0.5), 'hairline', 0.5 + REPLACE_MARGIN / 2),
    'a full region: not enough better than its poorest',
  );
  assert.ok(targetWants(withFrames(0.9, 0.6, 0.5), 'hairline', 0.5 + REPLACE_MARGIN + 0.01));
  assert.ok(
    !targetWants(
      { ...withFrames(0.2), pending: [pendingFor('hairline'), { ...pendingFor('hairline'), id: 'p2' }] },
      'hairline',
      0.9,
    ),
    'and never a third request while two are in flight for it',
  );
  assert.ok(
    !targetWants({ ...withFrames(GOOD_QUALITY), pending: [pendingFor('hairline')] }, 'hairline', 0.9),
    'a request in flight counts towards the region’s list',
  );

  // And on the step itself: held short of the turn it asks for, the step
  // keeps working, takes the moments it can get up to the region's cap,
  // and then only a better picture is worth a shutter.
  let d = walk(scanning(), 900, () => face({ stability: 0.95 }));
  assert.equal(d.state.step, 'right');
  const part = TURN_HANDOVER_DEG - 1;
  // Turned into the pose rather than snapped to it: a jump is a whip.
  d = landAll(run(d, 600, (t) => face({ yaw: (part * Math.min(t, 600)) / 600, stability: 0.6 }), 0.4));
  d = landAll(run(d, FRAME_GAP_MS * FRAMES_PER_REGION, () => face({ yaw: part, stability: 0.6 }), 0.4));
  const poor = held(d.state, 'leftTemple');
  assert.equal(poor.frameIds.length, FRAMES_PER_REGION, 'the region filled up on what it could get');
  assert.ok(poor.quality < 0.7, `${poor.quality}`);
  assert.equal(d.state.step, 'right', 'the step is still waiting for the turn itself');

  const n = of(d.events, 'capture').length;
  d = run(d, FRAME_GAP_MS + 66, () => face({ yaw: part, stability: 0.6 }), 0.4);
  assert.equal(of(d.events, 'capture').length, n, 'a full region does not ask for more of the same');

  // A short beat, because the gap has long since passed: the very next
  // tick in better light is worth a shutter, and one is all it takes.
  d = run(d, 99, () => face({ yaw: part, stability: 1 }), 0.95);
  assert.equal(of(d.events, 'capture').length, n + 1, 'better light and a steadier hand are');
  d = landAll(d);
  const after = held(d.state, 'leftTemple');
  assert.equal(after.frameIds.length, FRAMES_PER_REGION, 'the cap holds: the poorest made way');
  assert.ok(after.weakest > poor.weakest, `${poor.weakest} → ${after.weakest}`);
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

test('curation: a better picture of one moment replaces it; a new moment joins it', () => {
  /*
    The two halves of the curation, and they answer different questions.
    A frame that stands for a moment the region already holds is the SAME
    reading twice: keeping both would hand the measurement engine a
    spread of zero it never measured. A frame from a different moment is
    a second reading, which is the only thing that gives the region an
    error bar at all — so it joins rather than displaces.
  */
  let d = scanning();
  d = run(d, 33, () => face({ stability: 0.6 }), 0.4);
  const poorAt = d.now;
  d = dispatch(d, { type: 'captured', requestId: 'c1', image: { ...image, uri: 'file:///poor.jpg' }, at: d.now });
  const first = d.state.frames[0] as ScanFrame;
  assert.equal(d.state.frames.length, 1);

  // A better picture of that same instant: the engine would not ask for
  // one — `newMoment` sees to that — but a camera answering out of order
  // can still land one, so the rule is tested where it is enforced.
  const twin: CaptureRequest = {
    ...first,
    id: 'twin',
    quality: first.quality + 0.3,
    at: poorAt + FRAME_GAP_MS / 2,
  };
  assert.ok(!distinctMoment(first, { ...twin, requestedAt: twin.at }), 'the twin really is the same moment');
  d = { ...d, state: { ...d.state, pending: [twin] }, events: [] };
  d = dispatch(d, { type: 'captured', requestId: 'twin', image: { ...image, uri: 'file:///twin.jpg' }, at: d.now });
  assert.equal(d.state.frames.length, 1, 'one moment, one photograph of it');
  assert.deepEqual(of(d.events, 'frame').map((f) => f.replaced), [true]);
  assert.deepEqual(
    of(d.events, 'discard').map((e) => [e.reason, e.images.map((i) => i.uri)]),
    [['replaced', ['file:///poor.jpg']]],
  );

  // A different moment, and no better: it joins, and nothing is let go of.
  const later: CaptureRequest = { ...first, id: 'later', quality: 0.3, at: poorAt + FRAME_GAP_MS * 2 };
  d = { ...d, state: { ...d.state, pending: [later] }, events: [] };
  d = dispatch(d, { type: 'captured', requestId: 'later', image: { ...image, uri: 'file:///later.jpg' }, at: d.now });
  assert.equal(d.state.frames.length, 2, 'two moments, two photographs');
  assert.deepEqual(of(d.events, 'discard'), [], 'and nothing thrown away for being second');
  assert.deepEqual(held(d.state, 'hairline').frameIds, ['twin', 'later'], 'best first');
});

test('curation: a full region gives up its poorest, and only its own region’s', () => {
  // A region holding its three, all in the same ring bin, and a better
  // crown lands: the poorest crown goes and nothing else is touched.
  const crowns = [0.4, 0.55, 0.6].map((quality, i) => ({
    ...spare('crown', quality, `file:///crown${i}.jpg`),
    id: `f-crown${i}`,
    requestedAt: i * FRAME_GAP_MS * 2,
  }));
  const frames = [
    ...(['hairline', 'leftTemple', 'rightTemple'] as const).map((region) => spare(region, 0.7)),
    ...crowns,
  ];
  const better: CaptureRequest = {
    id: 'last', bin: SHARED_BIN, region: regionOfBin(SHARED_BIN), target: 'crown',
    sector: SHARED_BIN, yaw: 0, pitch: -26, quality: 0.75, at: 6000,
  };
  let e: Driver = { state: { ...scanning().state, frames, pending: [better] }, events: [], now: 6000 };
  e = dispatch(e, { type: 'captured', requestId: 'last', image: { ...image, uri: 'file:///better-crown.jpg' }, at: e.now });
  assert.equal(e.state.frames.filter((f) => f.target === 'crown').length, FRAMES_PER_REGION, 'the cap holds');
  assert.ok(e.state.frames.some((f) => f.id === 'last'), 'the better crown is kept');
  assert.deepEqual(
    of(e.events, 'discard').map((x) => [x.reason, x.images.map((i) => i.uri)]),
    [['replaced', ['file:///crown0.jpg']]],
    'the poorest crown, and nothing that shared its bin',
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
      targets: {
        ...createScanState().targets,
        hairline: { captured: true, quality: 0.9, weakest: 0.9, frameIds: [hairline.id], reach: 1 },
      },
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
      targets: {
        ...createScanState().targets,
        leftTemple: { captured: true, quality: 0.3, weakest: 0.3, frameIds: [temple.id], reach: 1 },
      },
      pending: [crown],
    },
    events: [],
    now: 6000,
  };
  e = dispatch(e, { type: 'captured', requestId: 'crown1', image: { ...image, uri: 'file:///crown1.jpg' }, at: e.now });
  assert.ok(held(e.state, 'leftTemple').captured, 'the temple is still the report’s');
  assert.deepEqual(held(e.state, 'leftTemple').frameIds, [temple.id]);
  assert.ok(held(e.state, 'crown').captured);
});

test('curation: a whole scan keeps several frames per region and never more than the cap', () => {
  const d = fullScan();
  assert.equal(MAX_FRAMES, REQUIRED_REGIONS.length * FRAMES_PER_REGION);
  assert.ok(d.state.frames.length <= MAX_FRAMES, `${d.state.frames.length} frames`);
  // What the owner asked for — several pictures, not four — and what the
  // measurement needs, which is the same thing said in arithmetic.
  assert.ok(d.state.frames.length >= 5, `${d.state.frames.length} frames is not several`);
  for (const region of REQUIRED_REGIONS) {
    const kept = d.state.frames.filter((f) => f.target === region);
    assert.ok(kept.length <= FRAMES_PER_REGION, `${region} holds ${kept.length}`);
  }
  assert.equal(primaryFrame(d.state)?.target, 'hairline');
  assert.deepEqual(
    [...new Set(orderedFrames(d.state).map((f) => f.target))],
    [...REQUIRED_REGIONS],
    'region by region, in the order the scan asked for them',
  );
  const four = requiredFrames(d.state);
  assert.equal(four.length, 4, 'and one best picture for each of the four regions');
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
  let d = walk(scanning(), 900, () => face({ pitch: low, stability: 0.95 }));
  const hairline = d.state.frames.find((f) => f.target === 'hairline');
  assert.ok(hairline, 'no hairline frame');
  assert.equal(hairline.bin, SHARED_BIN, 'the pose really was off to one side of the ring');
  assert.equal(hairline.region, 'front', 'and the picture is still of the front of the head');

  d = walk(d, 2000, path({ yaw: 0, pitch: low }, { yaw: TEMPLE_FULL_DEG, pitch: low }, 1200));
  assert.equal(d.state.frames.find((f) => f.target === 'leftTemple')?.region, 'left');
  d = walk(d, 2600, path({ yaw: TEMPLE_FULL_DEG, pitch: low }, { yaw: -TEMPLE_FULL_DEG, pitch: low }, 1800));
  assert.equal(d.state.frames.find((f) => f.target === 'rightTemple')?.region, 'right');
  d = walk(d, 2600, path({ yaw: -TEMPLE_FULL_DEG, pitch: low }, { yaw: -4, pitch: -CROWN_FULL_DEG }, 1800));
  assert.equal(d.state.frames.find((f) => f.target === 'crown')?.region, 'chin');
  // Every repeat a region kept is labelled the same way: the label comes
  // from what the step asked for, never from the pose that answered.
  for (const frame of d.state.frames) {
    assert.equal(frame.region, d.state.frames.find((f) => f.target === frame.target)?.region);
  }
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

/* ------------------------- the repeated region ----------------------- */

/**
 * A still, a face in it and a mask over it, for the one test that takes
 * a driven scan all the way into the measurement engine.
 *
 * Deliberately crude, and only the poses are real. The face is a box
 * whose width narrows with the yaw and whose height narrows with the
 * pitch, as a detector's does; the mask is a head-shaped blob with a
 * slanted hairline across it, so a region's reading changes when the box
 * it is measured in moves. What the test is entitled to conclude from it
 * is about FRAME COUNTS and whether a spread was measured at all —
 * never about hair, and never about a person.
 */
const MEASURE_STILL = { width: 1000, height: 1000 };
const DEG = Math.PI / 180;

function observationOf(frame: Pick<ScanFrame, 'yaw' | 'pitch'>): FaceObservation {
  const width = 0.3 * Math.cos(frame.yaw * DEG);
  const height = 0.4 * Math.cos(frame.pitch * DEG);
  return {
    bounds: { x: 0.5 - width / 2, y: 0.52 - height / 2, width, height },
    image: MEASURE_STILL,
    yaw: frame.yaw,
    pitch: frame.pitch,
    roll: 0,
  };
}

const MEASURE_MASK: MaskImage = (() => {
  const side = 160;
  const data = new Float32Array(side * side);
  for (let row = 0; row < side; row += 1) {
    for (let col = 0; col < side; col += 1) {
      const x = (col + 0.5) / side;
      const y = (row + 0.5) / side;
      const onHead = Math.hypot((x - 0.5) / 0.32, (y - 0.44) / 0.38) <= 1;
      data[row * side + col] = onHead && y < 0.3 + 0.22 * x ? 1 : 0;
    }
  }
  return { width: side, height: side, data };
})();


/*
  What several frames a region buys, in three statements.

  The owner asked for more pictures — "it only captures like 3 total
  images... we need 5-6, so when there is the rotation part there are
  multiple images rotating" — and that is the half of this he can see.

  The half he cannot needs a distinction to be stated carefully, because
  the first version of these tests' prose overstated it. A CAPTURE
  region (`ScanTarget`, four of them) is not a MEASUREMENT region
  (`measure/regions.ts`'s `ScanRegion`, six of them), and `measureScan`
  reads all six out of every frame whatever it was filed under. So build
  19's four frames were never four readings: driven through this same
  motion they gave hairline 4, partLine 4, leftTemple 3, rightTemple 3,
  midScalp 2 — all repeated, all comparable — and CROWN 1. The crown is
  the region only the last step sees, and it was the one with no error
  bar, pinned to `UNREPEATED_CONFIDENCE` and refused by `compareScans`.

  So these three tests are one narrower statement made three ways: the
  scan keeps several moments a capture region, they are genuinely
  different moments, and the measurement that comes out the other end
  has an error bar of its own for every place on the head — the crown
  included, which is the part that changed.
*/

test('frames: a driven scan keeps several moments a region, and never one instant twice', () => {
  const d = fullScan();
  const kept = d.state.frames.length;
  assert.ok(kept >= 5, `${kept} frames is not the several the owner asked for`);
  assert.ok(kept <= MAX_FRAMES, `${kept} frames is past the ceiling`);

  const repeated = REQUIRED_REGIONS.filter(
    (region) => d.state.targets[region].frameIds.length >= REGION_MIN_FRAMES,
  );
  assert.ok(repeated.length >= 3, `only ${repeated.length} regions were photographed more than once`);

  // And no region holds one instant twice. Two frames of one moment
  // would agree by construction and publish a spread of zero — an error
  // bar claiming a precision nobody measured, which is worse than none.
  for (const region of REQUIRED_REGIONS) {
    const frames = regionFrames(d.state, region);
    for (let i = 0; i < frames.length; i += 1) {
      for (let j = i + 1; j < frames.length; j += 1) {
        const a = frames[i] as ScanFrame;
        const b = frames[j] as ScanFrame;
        assert.ok(
          distinctMoment(a, b),
          `${region}: ${a.id} and ${b.id} are the same instant twice`,
        );
        const apart = Math.abs(a.requestedAt - b.requestedAt);
        const moved = Math.hypot(a.yaw - b.yaw, a.pitch - b.pitch);
        assert.ok(
          apart >= FRAME_GAP_MS || moved >= FRAME_TURN_DEG,
          `${region}: ${apart} ms and ${moved.toFixed(1)}° apart is neither`,
        );
      }
    }
  }
});

test('frames: the extra moments cost the scan no time a person would notice', () => {
  /*
    Measured, not asserted from the timeouts. The same driven motion
    through the same four steps took 7194 ms on build 19, which kept one
    frame a region, and 7260 ms here, which keeps nine: one tick of
    difference, because what paces a driven scan is the head's own
    movement and not the shutter. Driven again with the camera answering
    150, 300 and 500 ms late instead of on the spot: 7260 / 7260 /
    7425 ms here against 7260 / 7260 / 7425 ms at build 19 — identical,
    keeping 9 / 10 / 11 frames against 4 / 4 / 4.

    THIS IS THE CAPTURE ONLY. The processing screen that follows is paced
    by `analysis.ts`, which plans 2N+1 units, and that IS longer with
    more frames; `processing.tsx` divides the per-unit hold by the unit
    count to hold the deliberate part of it near where four frames put
    it. The segmenter still runs once per frame either way.
  */
  const d = fullScan();
  const elapsed = (d.state.completedAt ?? d.now) - (d.state.startedAt ?? d.now);
  assert.ok(elapsed <= 8_000, `${elapsed} ms is not a KYC pace`);
  const timeouts = SCAN_STEPS.reduce((sum, step) => sum + STEP_TIMEOUT_MS[step], 0);
  assert.ok(elapsed < timeouts / 2, `${elapsed} ms of a ${timeouts} ms ceiling`);
  assert.equal(d.state.completeReason, 'coverage');
});

test('frames: the extra moments cost the processing screen a second, not four', () => {
  /*
    The cost the capture timings above do NOT cover, and the part a
    person actually waits through.

    `analysis.ts` plans 2N+1 units for N frames and holds each finished
    one for `ANALYSIS_PACING.unitFloorMs` so it can be seen landing. That
    is a per-unit figure tuned when a scan was four frames, so more
    frames multiply it: left alone, this phase would have taken the held
    part of the pass from 3150 ms to 6650–8050 ms. `processing.tsx`
    divides the hold by the plan's own unit count (`unitFloorFor`,
    budget `PASS_HOLD_BUDGET_MS`) and passes it in as `pacing`.

    Asserted here because this is the test that answers the pace
    question, and because nothing else in the suite loads a .tsx. The
    arithmetic is checked against the real planner; the wiring is checked
    against the screen's own source.
  */
  const framesOf = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `f${i}`,
      uri: `file:///f${i}.jpg`,
      angle: (i === 0 ? 'front' : 'leftTemple') as 'front' | 'leftTemple',
    }));
  const unitsFor = (n: number) => planAnalysis(framesOf(n) as never, true).units.length;
  assert.equal(unitsFor(4), 9, 'build 19: four frames, nine units');
  assert.equal(unitsFor(9), 19);
  assert.equal(unitsFor(11), 23);
  // What the unscaled hold would have cost, stated so the saving is not
  // a claim about a number nobody wrote down.
  assert.equal(unitsFor(4) * ANALYSIS_PACING.unitFloorMs, 3150);
  assert.equal(unitsFor(9) * ANALYSIS_PACING.unitFloorMs, 6650);
  assert.equal(unitsFor(11) * ANALYSIS_PACING.unitFloorMs, 8050);

  const screen = readFileSync('src/components/hair-scan/processing.tsx', 'utf8');
  const budget = /PASS_HOLD_BUDGET_MS = ([\d_]+)/.exec(screen)?.[1]?.replace(/_/g, '');
  const floorMin = /UNIT_FLOOR_MIN_MS = ([\d_]+)/.exec(screen)?.[1]?.replace(/_/g, '');
  assert.ok(budget && floorMin, 'the screen no longer states a hold budget');
  const held = (units: number) =>
    units *
    Math.min(ANALYSIS_PACING.unitFloorMs, Math.max(Number(floorMin), Math.round(Number(budget) / units)));
  for (const n of [4, 9, 10, 11]) {
    const ms = held(unitsFor(n));
    assert.ok(ms <= 3_500, `${n} frames would hold the screen for ${ms} ms`);
  }
  assert.equal(held(unitsFor(4)), 3150, 'a four-frame scan is paced exactly as it was');
  assert.match(
    screen,
    /pacing: \{ unitFloorMs: unitFloorFor\(units\) \}/,
    'the screen computes a hold and then does not pass it in',
  );

  /*
    And the two terms the hold does NOT cover, which are the ones that
    actually grew. An earlier version of this test asserted the hold
    alone under the name "does not stretch the processing screen", which
    was false: the ring is paced by the frame count in `orbitReadyMs`
    and `absorbHandoffMs`, and the hand-off runs strictly after both, so
    the screen cannot end before `max(hold, ring) + absorb`.

    Pinned as a ceiling and a floor, so neither can drift: more frames
    must cost something (they are more pictures to show) and must not
    cost the four seconds the unscaled hold would have.
  */
  const lead = Number(/ORBIT_LEAD_MS = ([\d_]+)/.exec(screen)?.[1]?.replace(/_/g, ''));
  assert.ok(Number.isFinite(lead), 'the screen no longer states an orbit lead');
  const screenFloor = (n: number) =>
    Math.max(held(unitsFor(n)), orbitReadyMs(n - 1, lead, false)) + absorbHandoffMs(n - 1, false);
  const atFour = screenFloor(4);
  assert.equal(atFour, 5040, 'a four-frame screen is paced exactly as it was');
  for (const n of [9, 10, 11]) {
    const ms = screenFloor(n);
    assert.ok(ms > atFour, `${n} frames somehow show faster than four`);
    assert.ok(ms - atFour <= 2_500, `${n} frames add ${ms - atFour} ms to the screen`);
    assert.ok(ms <= 7_500, `${n} frames hold the screen for ${ms} ms`);
  }
  // Written down in the file itself, so the accounting in its header is
  // the whole accounting and not just the part that was fixed.
  assert.match(screen, /orbitReadyMs/, 'the header must name the terms it did not scale');
  assert.match(screen, /absorbHandoffMs/);
});

test('frames: the repeats are what give the measurement an error bar of its own', () => {
  /*
    End to end, engine into `measure`. The mask and the face observations
    are synthetic — this is a reducer test, there is no camera — but the
    POSES are the ones the engine actually kept, and that is the whole
    point: a region's readings differ here because the frames it kept are
    different moments of the turn. On a phone they would differ for that
    reason and for every other reason `measure/noise.ts` names.
  */
  const d = fullScan();
  const inputs: ScanFrameInput[] = orderedFrames(d.state).map((f) => ({
    mask: MEASURE_MASK,
    face: observationOf(f),
    quality: f.quality,
  }));
  const measurement = measureScan(inputs, '2026-09-19T09:00:00.000Z');

  for (const [region, read] of Object.entries(measurement.regions)) {
    assert.ok(read, region);
    assert.ok(read.frames >= REPEATED_FRAMES, `${region} was read in ${read.frames} frame(s)`);
    /*
      `spreadOf` is `Math.max(SPREAD_FLOOR, sd)`, so "spread > 0" is true
      of anything at all and would assert nothing — an earlier version of
      this test made exactly that mistake. What is worth asserting is
      that the number came from the readings: it is the sample deviation
      or the floor under one, and NOT `SINGLE_FRAME_SPREAD`, which is
      this module's stand-in for a region it could not repeat.
    */
    assert.ok(read.spread >= SPREAD_FLOOR, `${region}: ${read.spread} is under the floor`);
    assert.notEqual(read.spread, SINGLE_FRAME_SPREAD, `${region} fell back to the stand-in spread`);
    assert.ok(
      read.confidence > UNREPEATED_CONFIDENCE,
      `${region} is still capped as unrepeated at ${read.confidence}`,
    );
  }
  /*
    And at least one region's frames genuinely disagreed — a spread ABOVE
    the floor, measured rather than clamped.

    Only one, and said plainly: on this synthetic mask five of the six
    land exactly on `SPREAD_FLOOR` and `leftTemple` (about 0.059) is the
    one that clears it. That is the mask's fault, not the engine's — it
    is a hard 0/1 blob with a straight hairline, so most regions read the
    same number from every frame by construction. A floor-valued spread
    is an honest "these agreed to within the mask's own wobble", not a
    missing error bar; what would be dishonest is `SINGLE_FRAME_SPREAD`,
    asserted against above, and that is the one this phase removed.
  */
  const measured = Object.entries(measurement.regions).filter(
    ([, read]) => (read?.spread ?? 0) > SPREAD_FLOOR,
  );
  assert.ok(measured.length >= 1, 'no region measured a spread above the floor');

  /*
    And the counterfactual, which is the bug the owner could not see —
    stated at exactly its real size. The same scan curated the way build
    19 curated it (the best frame of each capture region and nothing
    else) leaves FIVE of the six places on the head repeated and
    comparable, and the CROWN read in ONE frame: its spread is this
    module's stand-in rather than anything measured, and its confidence
    sits exactly on the unrepeated cap, below every bar `compareScans`
    acts on. So it is the crown, and only the crown, that no scan could
    ever have reported a change in. The assertions below say only that.
  */
  const oneEach = measureScan(
    requiredFrames(d.state).map((f) => ({
      mask: MEASURE_MASK,
      face: observationOf(f),
      quality: f.quality,
    })),
    '2026-09-19T09:00:00.000Z',
  );
  const crown = oneEach.regions.crown;
  assert.ok(crown);
  assert.equal(crown.frames, 1);
  assert.equal(crown.spread, SINGLE_FRAME_SPREAD, 'assumed, not measured');
  assert.equal(crown.confidence, UNREPEATED_CONFIDENCE, 'capped, and below every bar');
  const now = measurement.regions.crown;
  assert.ok(now && now.confidence > crown.confidence, 'the repeats are what lifted it');

  /*
    The other half of the counterfactual, asserted so the claim above
    cannot quietly grow back into "build 19 could never measure
    anything". Every OTHER place on the head was already repeated on four
    frames, because `measureScan` reads all six out of every frame.
  */
  const alreadyRepeated = Object.entries(oneEach.regions).filter(
    ([region, read]) => region !== 'crown' && (read?.frames ?? 0) >= REPEATED_FRAMES,
  );
  assert.equal(
    alreadyRepeated.length,
    Object.keys(oneEach.regions).length - 1,
    'build 19 already repeated every region but the crown; do not claim otherwise',
  );
  for (const [region, read] of alreadyRepeated) {
    assert.ok(
      (read?.confidence ?? 0) > UNREPEATED_CONFIDENCE,
      `${region} was already comparable at build 19`,
    );
  }
});

/* ------------------------------ finishing ---------------------------- */

test('finish: a scan nobody follows still ends, on the steps’ own timeouts', () => {
  // Somebody who presses Start and then does nothing at all: each step
  // waits its own time, hands over, and the scan ends honestly.
  let d = scanning();
  d = landAll(run(d, 33, () => face()));
  assert.equal(d.state.frames.length, 1, 'the hairline, which needs nothing doing');
  // Nothing answers the camera from here on, so the frames stay at one
  // and the requests still out are given up on at the settle.
  d = toEnd(d, () => face({ yaw: 5, stability: 0.9 }));
  d = run(d, SETTLE_MS + 66, () => face({ yaw: 5, stability: 0.9 }));
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
  // Two hairline frames, so the front step is satisfied and hands over.
  d = landAll(run(d, FRAME_GAP_MS + 66, () => face()));
  assert.equal(d.state.frames.length, REGION_MIN_FRAMES);
  assert.equal(d.state.step, 'right');
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
  assert.equal(d.state.frames.length, REGION_MIN_FRAMES, 'the frames that landed');

  // The camera answers after all: the file is discarded, the frame set is not touched.
  const lateId = d.state.abandoned[0];
  assert.ok(lateId, 'the request given up on is remembered');
  d = { ...d, events: [] };
  d = dispatch(d, { type: 'captured', requestId: lateId, image: { ...image, uri: 'file:///late.jpg' }, at: d.now });
  assert.equal(d.state.scanner, 'complete');
  assert.equal(d.state.frames.length, REGION_MIN_FRAMES);
  assert.deepEqual(d.events, [{ type: 'discard', images: [{ ...image, uri: 'file:///late.jpg' }], reason: 'late' }]);
  assert.ok(!d.state.abandoned.includes(lateId));

  // Or the frame lands in time, and the scan completes at once.
  let e = scanning();
  e = landAll(run(e, 33, () => face()));
  e = run(e, 800, () => face({ yaw: TURN_YAW_DEG, stability: 0.95 }));
  e = toEnd(e, () => face({ yaw: TURN_YAW_DEG, stability: 0.95 }));
  assert.equal(e.state.status, 'completing');
  const outstanding = [...e.state.pending];
  assert.ok(outstanding.length > 0);
  for (const request of outstanding) {
    e = dispatch(e, {
      type: 'captured',
      requestId: request.id,
      image: { ...image, uri: `file:///in-time-${request.id}.jpg` },
      at: e.now,
    });
  }
  assert.equal(e.state.scanner, 'complete', 'every one of them landed, so there is nothing left to wait for');
  for (const request of outstanding) {
    assert.ok(e.state.frames.some((f) => f.id === request.id), `${request.id} was kept`);
  }
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

  // A better picture of the same moment replaces it, and brings its own
  // mesh — the old one goes with the old frame.
  const kept = d.state.frames[0] as ScanFrame;
  const better = meshOf(400);
  assert.notDeepEqual(better, poor, 'the synthetic head had moved');
  const request: CaptureRequest = { ...kept, id: 'twin', quality: kept.quality + 0.3, at: kept.requestedAt };
  d = { ...d, state: { ...d.state, pending: [request] } };
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
  // A different moment from the shallow crown, so it joins rather than
  // displaces it: the region now has two readings and an error bar.
  assert.equal(e.state.frames.length, REQUIRED_REGIONS.length + 1);
  assert.ok(e.state.frames.some((f) => f.id === 'f-crown'), 'the shallow crown is a reading too');
  for (const f of orderedFrames(e.state)) {
    const expected = f.id === 'last' ? lastMesh : meshes.get(f.target);
    assert.deepEqual(f.mesh, expected, `frame ${f.id} lost its mesh`);
  }
  assert.deepEqual(held(e.state, 'crown').frameIds, ['last', 'f-crown'], 'best first, both kept');
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
    requestedAt: 0,
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

test('mesh: the cap a still wears is the cap the camera drew, fringe and all', () => {
  /*
    The half of the shaped-cap work that is not arithmetic at all.

    `fitHairCap` sits the live cap on the hair, and a `CapFit` now
    carries the SHAPE as well as the size. But the processing screen and
    the report hero rebuild the cap from a still, and if nothing hands
    them the fit they rebuild `CAP_FIT_DEFAULT` — the standing allowance
    — so a person watches a cap sitting on their fringe in the camera
    and a plain dome on the same head a second later. That is not a
    wrong number anywhere; it is two different drawings of one head, and
    only a reader looking at both screens would ever catch it.

    So the road is pinned end to end: the shutter reads the DRAWN fit
    off the mesh handle, `snapshotMesh` freezes it onto the frame,
    `meshInBox` carries it into the box untouched (a fit is
    dimensionless — there is nothing in it to rescale), and all three
    screens that draw a still hand it to `StaticHairMesh`.
  */
  const tracked = trackFrame(createTracker(), syntheticFace(VIEW, 0, 1000), 1000);
  const tf = tracked.face;
  assert.ok(tf);

  // A fit with a shape in it: a fringe standing proud on one side.
  const worn = { lift: 1.2, widen: 1.05, shift: -0.04, profile: [1.3, 1.2, 1.0, 0.9, 1.0, 1.1] };
  const carried = snapshotMesh(tf, VIEW, worn);
  assert.ok(carried);
  assert.deepEqual(carried.fit, worn, 'the shutter froze the fit onto the frame');
  const inBox = meshInBox(carried, STILL, { width: 176, height: 176 });
  assert.deepEqual(inBox.fit, worn, 'and the box carried it through unrescaled');

  // A build with no segmenter never had one, and must still say nothing
  // rather than an invented fit: that is what the screens drew before.
  const bare = snapshotMesh(tf, VIEW);
  assert.ok(bare);
  assert.ok(!('fit' in bare), 'no fit key at all when none was worn');
  assert.ok(!('fit' in meshInBox(bare, STILL, { width: 176, height: 176 })), 'and none downstream');

  // And the screens. Read off their own source with the comments
  // stripped, because a comment saying a still wears the live cap is
  // exactly what shipped last time nothing passed it.
  const bare_ = (path: string) =>
    readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n');
  assert.match(
    bare_('src/app/hair-scan.tsx'),
    /snapshotMesh\(face, previewSize\.current, mesh\.current\?\.fit\(\)\)/,
    'the shutter must read the drawn fit off the live mesh',
  );
  for (const screen of [
    'src/components/hair-scan/processing.tsx',
    'src/components/hair-scan/orbit-frames.tsx',
    'src/components/hair-scan/report-sections/hero.tsx',
  ]) {
    const source = bare_(screen);
    const call = /<StaticHairMesh[\s\S]*?\/>/.exec(source);
    assert.ok(call, `${screen} no longer draws a static mesh`);
    assert.match(call[0], /fit=\{/, `${screen} draws a still without the cap the camera drew`);
  }
});
