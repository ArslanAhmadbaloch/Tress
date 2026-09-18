/**
 * The hair scan engine, driven by hand.
 *
 * Every rule that matters on a phone is checked here without one: that
 * Start arms the moment a head is seen and nothing else, that the two
 * stages ask for the four regions the report is built from, that the
 * ring fills only when the head moves somewhere new and never on a
 * timer, that the shutter is throttled and gated, that the frames are
 * curated rather than hoarded, and that nobody is ever trapped in a scan
 * that will not end — or told to move closer.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CAPTURE_INTERVAL_MS,
  CHIN_SECTORS,
  CROWN_FULL_DEG,
  CROWN_PITCH_DEG,
  FORCED_FINISH_MS,
  FRONT_DEVIATION,
  GOOD_QUALITY,
  HAIRLINE_YAW_DEG,
  LEFT_SECTORS,
  LEVEL_PITCH_DEG,
  LOST_MS,
  MAX_FRAMES,
  PITCH_DOWN_FULL_DEG,
  REACH_CEILING,
  REGION_NEEDED,
  REPLACE_MARGIN,
  REQUIRED_REGIONS,
  RIGHT_SECTORS,
  RING_SECTORS,
  SETTLE_MS,
  STAGE_ONE_MAX_MS,
  STALL_MS,
  SWEEP_PITCH_LIMIT_DEG,
  TEMPLE_FULL_DEG,
  TEMPLE_YAW_DEG,
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
  sweepDone,
  targetFit,
  targetFor,
  targetReach,
} from '@/features/hair-scan/engine';
import { faceRegionRects } from '@/features/hair-scan/region-crops';
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

/** Ticks on to just past the forced finish, and no further. */
function toForcedFinish(d: Driver, pose: (t: number) => FaceReading): Driver {
  const deadline = (d.state.startedAt ?? d.now) + FORCED_FINISH_MS;
  return run(d, Math.max(66, deadline - d.now + 66), pose);
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
  assert.equal(d.state.stage, 'sweep', 'the scan opens on the turn');
  assert.equal(d.state.startedAt, d.now);
  assert.equal(d.state.stageStartedAt, d.now, 'tracking begins on the press');
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
  assert.equal(d.state.cue, 'perfect');
  assert.ok(canStart(d.state));

  // No reading at all is the one thing that is not a head.
  d = run(d, 33, () => null);
  assert.equal(d.state.status, 'detecting');
  assert.equal(d.state.cue, 'centreFace');
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
  assert.ok(cues.size > 0);
});

test('ready: a head leaving the picture is asked back, and Start stays live', () => {
  let d = atReady();
  d = run(d, 33, () => face({ bounds: { x: 0.85, y: 0.2, width: 0.46, height: 0.6 } }));
  assert.equal(d.state.cue, 'centreFace');
  assert.ok(canStart(d.state), 'it is a nudge, not a gate');
});

test('ready: an unreadable reading is not a head', () => {
  let d = atReady();
  d = run(d, 33, () => face({ yaw: Number.NaN }));
  assert.equal(d.state.cue, 'centreFace');
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
  assert.equal(of(d.events, 'cue').length, 1, 'the cue is announced once, not every frame');
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

test('regions: a turn shows the temple on the OPPOSITE side to the way it went', () => {
  /*
    The test that was missing, and whose absence let three files disagree
    in the tree the owner installed. Four statements have to line up, and
    a turn of the head is the only thing that lines them up:

      1. the sign convention  — positive yaw is the head turned towards
         its own right (engine.ts, and the native module's contract);
      2. the journal's own instruction, which has said the same thing
         since long before this scan existed: to show your LEFT side you
         turn towards your right;
      3. the label this engine files the photograph under;
      4. the corner of the mirrored still that `region-crops.ts` cuts for
         that label.

    Read any one of them the other way round and the report crops the
    patch of air in front of somebody's face and captions it as a temple.
  */
  assert.match(ANGLE_GUIDANCE.leftTemple.instruction, /turn your head to the right/i);
  assert.match(ANGLE_GUIDANCE.rightTemple.instruction, /turn your head to the left/i);

  assert.equal(targetFor(face({ yaw: TEMPLE_FULL_DEG }), 'sweep'), 'leftTemple');
  assert.equal(targetFor(face({ yaw: -TEMPLE_FULL_DEG }), 'sweep'), 'rightTemple');

  // And the crop for that label is on the side of the picture the turn
  // actually put the head's side on. The still is mirrored, so a head
  // turned towards its own right has its nose towards the image's right
  // and its left temple towards the image's left.
  const box = { width: 1000, height: 1000 };
  const rects = faceRegionRects(
    { cx: 500, cy: 500, width: 300, height: 400, contours: {} },
    box,
  );
  assert.ok(rects.leftTemple !== undefined && rects.rightTemple !== undefined);
  assert.ok(rects.leftTemple.x + rects.leftTemple.w <= 0.5, 'the left temple is cut from the image\'s left');
  assert.ok(rects.rightTemple.x >= 0.5, 'the right temple from the image\'s right');
});

test('regions: which region a pose serves, in each stage', () => {
  assert.equal(targetFor(face(), 'sweep'), 'hairline');
  assert.equal(targetFor(face({ yaw: HAIRLINE_YAW_DEG }), 'sweep'), 'hairline');
  assert.equal(targetFor(face({ yaw: TEMPLE_YAW_DEG }), 'sweep'), 'leftTemple');
  assert.equal(targetFor(face({ yaw: -TEMPLE_YAW_DEG }), 'sweep'), 'rightTemple');
  assert.equal(targetFor(face({ yaw: 15 }), 'sweep'), null, 'between the two: in transit');

  // Stage two is the crown and nothing else.
  assert.equal(targetFor(face({ pitch: -CROWN_PITCH_DEG }), 'crown'), 'crown');
  assert.equal(targetFor(face({ pitch: -CROWN_PITCH_DEG + 1 }), 'crown'), null);
  assert.equal(targetFor(face({ yaw: 30 }), 'crown'), null, 'a turn with the chin up is not the crown');
  assert.equal(targetFor(face({ yaw: 30, pitch: -CROWN_FULL_DEG }), 'crown'), 'crown');
  assert.equal(targetFor(face({ yaw: Number.NaN }), 'sweep'), null);

  // Stage one photographs a head held the way people hold phones. A chin
  // a little down is not a reason to take nothing; only a head bowed (or
  // tipped back) far enough to lose the front of the head is.
  for (const pitch of [-CROWN_PITCH_DEG, -CROWN_PITCH_DEG - 5, LEVEL_PITCH_DEG + 4]) {
    assert.equal(targetFor(face({ pitch }), 'sweep'), 'hairline', `${pitch}° of pitch`);
    assert.equal(targetFor(face({ yaw: -TEMPLE_FULL_DEG, pitch }), 'sweep'), 'rightTemple');
  }
  assert.equal(targetFor(face({ pitch: -SWEEP_PITCH_LIMIT_DEG }), 'sweep'), null, 'bowed: a scalp, not a hairline');
  assert.equal(targetFor(face({ pitch: SWEEP_PITCH_LIMIT_DEG }), 'sweep'), null, 'tipped back: nostrils');
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
  assert.equal(targetFit(face({ pitch: SWEEP_PITCH_LIMIT_DEG }), 'hairline'), 0);
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
  assert.ok(!sweepDone(state.targets));
  const all = { ...state.targets };
  for (const region of REQUIRED_REGIONS) {
    all[region] = { captured: true, quality: 0.8, frameId: region, reach: 1 };
  }
  assert.equal(journeyProgress(all), 1);
  assert.ok(isSufficient(all));
  assert.ok(sweepDone({ ...all, crown: { captured: false, quality: 0, frameId: null, reach: 0 } }));
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

test('choreography: stage one takes the hairline and both temples, then stage two the crown', () => {
  let d = scanning();
  assert.equal(d.state.cue, 'turnLeftRight');

  // Square on: the hairline.
  d = landAll(run(d, 100, () => face()));
  assert.ok(held(d.state, 'hairline').captured);
  assert.equal(d.state.stage, 'sweep');

  // A comfortable turn towards the person's own right — which shows the
  // camera their LEFT side — and back.
  d = landAll(run(d, 2000, turn(0, TEMPLE_FULL_DEG, 2000)));
  assert.ok(held(d.state, 'leftTemple').captured, 'the left temple');
  d = landAll(run(d, 2000, turn(TEMPLE_FULL_DEG, 0, 2000)));

  // And the other way: stage one is done, and the cue changes on its own.
  d = landAll(run(d, 2000, turn(0, -TEMPLE_FULL_DEG, 2000)));
  assert.ok(held(d.state, 'rightTemple').captured, 'the right temple');
  assert.deepEqual(of(d.events, 'stage'), [{ type: 'stage', from: 'sweep', to: 'crown' }]);
  assert.equal(d.state.stage, 'crown');
  d = run(d, 66, () => face({ yaw: -TEMPLE_FULL_DEG, stability: 0.9 }));
  assert.equal(d.state.cue, 'lowerHead');
  assert.ok(!held(d.state, 'crown').captured, 'the crown is not taken with the chin up');
  assert.equal(d.state.status, 'capturing', 'three of four is not a scan');

  // The head goes down, and the cue asks for the turn again.
  d = run(d, 1500, nod(0, -CROWN_FULL_DEG, 1500, -10));
  assert.ok(d.state.cue === 'turnAgain' || d.state.cue === 'almost', `${d.state.cue}`);
  d = landAll(d);
  assert.ok(held(d.state, 'crown').captured);
  // The first crown is the shallowest of the nod, so the scan stays open
  // a moment for a better one — and closes when it lands.
  d = landAll(run(d, CAPTURE_INTERVAL_MS + 99, () => face({ pitch: -CROWN_FULL_DEG, stability: 0.95 })));
  assert.ok(held(d.state, 'crown').quality >= GOOD_QUALITY, `${held(d.state, 'crown').quality}`);
  assert.equal(d.state.completion, 1);
  assert.deepEqual(of(d.events, 'scanComplete'), [{ type: 'scanComplete', reason: 'coverage' }]);
  assert.equal(d.state.scanner, 'complete');

  const marks = of(d.events, 'milestone').map((m) => m.milestone);
  for (const m of ['hairlineDone', 'leftTempleDone', 'rightTempleDone', 'crownDone'] as const) {
    assert.equal(marks.filter((x) => x === m).length, 1, `${m} fires exactly once`);
  }
  for (const m of ['quarter', 'half', 'threeQuarters'] as const) {
    assert.equal(marks.filter((x) => x === m).length, 1, `${m} fires exactly once`);
  }
});

test('choreography: a crown taken deeper replaces one taken at the edge of the nod', () => {
  let d = sweptScan();
  assert.equal(d.state.stage, 'crown');
  d = landAll(run(d, 200, () => face({ pitch: -(CROWN_PITCH_DEG + 1), stability: 0.9 })));
  const first = held(d.state, 'crown');
  assert.ok(first.captured);
  assert.ok(first.quality < GOOD_QUALITY, `${first.quality}`);
  d = landAll(run(d, CAPTURE_INTERVAL_MS + 66, () => face({ pitch: -CROWN_FULL_DEG, stability: 0.95 })));
  const better = held(d.state, 'crown');
  assert.ok(better.quality > first.quality + REPLACE_MARGIN, `${first.quality} → ${better.quality}`);
  assert.notEqual(better.frameId, first.frameId);
});

test('choreography: a sweep that never closes still reaches the crown, and the scan still ends', () => {
  // A head that turns only a little: the temples never register.
  let d = scanning();
  d = run(d, STAGE_ONE_MAX_MS - 2000, (t) => face({ yaw: 8 * Math.sin(t / 700), stability: 0.9 }));
  assert.equal(d.state.stage, 'sweep');
  assert.ok(!held(d.state, 'leftTemple').captured);
  d = run(d, 2100, () => face({ stability: 0.9 }));
  assert.equal(d.state.stage, 'crown', 'stage one does not hold anybody for ever');
  assert.deepEqual(of(d.events, 'stage'), [{ type: 'stage', from: 'sweep', to: 'crown' }]);
  d = landAll(run(d, 1500, nod(0, -CROWN_FULL_DEG, 1500)));
  assert.ok(held(d.state, 'crown').captured);
  // Still not all four, so it runs to the forced finish rather than lying.
  assert.equal(d.state.status, 'capturing');
  d = run(d, FORCED_FINISH_MS, () => face({ stability: 0.9 }));
  assert.equal(d.state.completeReason, 'timeout');
  assert.ok(d.state.frames.length >= 2);
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
  assert.equal(d.state.cue, 'slowDown');
  assert.deepEqual(d.state.sectors, before, 'a whipped frame does not fill');
  d = dispatch(d, { type: 'tick', at: d.now + 33, face: face({ yaw: 0 }), lighting: 0.8 });
  assert.equal(of(d.events, 'tooFast').length, 1, 'the event is throttled');
  assert.equal(d.state.cue, 'slowDown');
});

/* ------------------------------ capture ------------------------------ */

test('capture: a request needs a steady head in a pose one of the four regions wants', () => {
  // Three ticks a pose: the first of a jump reads as a whip, and a
  // whipped frame is refused whatever else is true of it.
  let d = scanning();
  d = run(d, 99, () => face({ stability: 0.3 }));
  assert.equal(of(d.events, 'capture').length, 0, 'not steady');
  d = run(d, 99, () => face({ yaw: 15, stability: 0.9 }));
  assert.equal(of(d.events, 'capture').length, 0, 'between two regions');
  d = run(d, 99, () => face({ pitch: -CROWN_FULL_DEG, stability: 0.9 }));
  assert.equal(of(d.events, 'capture').length, 0, 'the crown is stage two’s');
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

test('capture: at most one request every 700 ms, and none for a region already in flight', () => {
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
  let d = scanning();
  // Poor light and a shaky hand: a frame worth about 0.6.
  d = run(d, 33, () => face({ stability: 0.6 }), 0.4);
  assert.equal(of(d.events, 'capture').length, 1);
  const poor = of(d.events, 'capture')[0]?.request as CaptureRequest;
  assert.ok(poor.quality < 0.7, `${poor.quality}`);
  d = landAll(d);
  assert.equal(d.state.frames.length, 1);
  assert.deepEqual(of(d.events, 'frame').map((f) => f.replaced), [false]);
  assert.ok(of(d.events, 'milestone').some((m) => m.milestone === 'firstFrame'));

  // Same conditions: no point taking it again.
  d = run(d, 1000, () => face({ stability: 0.6 }), 0.4);
  assert.equal(of(d.events, 'capture').length, 1, 'an equal frame is not requested');

  // Better light, steady hand: worth the shutter, and it replaces the poor one.
  d = run(d, 33, () => face(), 0.9);
  assert.equal(of(d.events, 'capture').length, 2);
  d = landAll(d);
  assert.equal(d.state.frames.length, 1, 'replaced, not added');
  assert.ok((d.state.frames[0]?.quality ?? 0) > poor.quality);
  assert.deepEqual(of(d.events, 'frame').map((f) => f.replaced), [false, true]);

  // Now good: never asked for again however long the head sits there.
  d = run(d, 3000, () => face(), 0.9);
  assert.equal(of(d.events, 'capture').length, 2);
  assert.equal(held(d.state, 'hairline').frameId, d.state.frames[0]?.id);
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
  assert.equal(d.state.stage, 'sweep');
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
  let d = scanning();
  d = landAll(run(d, 300, () => face({ pitch: low, stability: 0.95 })));
  d = landAll(run(d, 2000, turn(0, TEMPLE_FULL_DEG, 2000, low)));
  d = landAll(run(d, 2000, turn(TEMPLE_FULL_DEG, 0, 2000, low)));
  d = landAll(run(d, 2000, turn(0, -TEMPLE_FULL_DEG, 2000, low)));
  d = landAll(run(d, 2000, turn(-TEMPLE_FULL_DEG, 0, 2000, low)));
  assert.equal(d.state.stage, 'crown', 'stage one closed');

  d = landAll(run(d, 1500, nod(low, -24, 1500)));
  d = landAll(run(d, 2000, turn(-4, 4, 2000, -24)));
  d = landAll(run(d, 2000, turn(4, -4, 2000, -26)));
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
  Lighting gates nothing and never took the button down, but it could
  still take the line — and the line is the only place the choreography
  is taught while the scan runs. Somebody scanning in a dim room was
  told to find a brighter spot for the whole seventy-five seconds and
  never once told what to do with their head.
*/
test('scanning: a dark room never costs the instruction', () => {
  const dark = 0.05;
  let d = scanning();
  d = landAll(run(d, 300, () => face({ stability: 0.9 }), dark));
  d = landAll(run(d, 2000, turn(0, TEMPLE_FULL_DEG, 2000), dark));
  d = landAll(run(d, 2000, turn(TEMPLE_FULL_DEG, 0, 2000), dark));
  d = landAll(run(d, 2000, turn(0, -TEMPLE_FULL_DEG, 2000), dark));
  d = landAll(run(d, 2000, turn(-TEMPLE_FULL_DEG, 0, 2000), dark));
  assert.equal(d.state.stage, 'crown', 'stage one closed in the dark');
  const cues = of(d.events, 'cue').map((c) => c.cue);
  assert.ok(!cues.includes('brighter'), `the light took the line: ${cues.join(', ')}`);
  assert.ok(cues.includes('turnLeftRight'), 'and the choreography was taught');
  d = run(d, 1000, () => face({ stability: 0.9 }), dark);
  assert.equal(d.state.cue, 'lowerHead', 'stage two is taught in the dark too');
});

/* --------------------------- lost and stalled ------------------------ */

test('scanning: losing the face asks for it back, and finding it says so once', () => {
  let d = scanning();
  d = run(d, 300, () => face());
  d = run(d, LOST_MS - 100, () => null);
  assert.equal(of(d.events, 'lost').length, 0, 'a dropped frame or two is not a loss');
  d = run(d, 200, () => null);
  assert.equal(of(d.events, 'lost').length, 1);
  assert.equal(d.state.cue, 'backInFrame');
  d = run(d, 200, () => null);
  assert.equal(of(d.events, 'lost').length, 1, 'said once');
  d = run(d, 66, () => face());
  assert.equal(of(d.events, 'found').length, 1);
  assert.notEqual(d.state.cue, 'backInFrame');
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
  assert.equal(d.state.cue, 'turnLeftRight', 'the stage’s own instruction is the floor');
  d = run(d, 500, () => face({ stability: 0.3 }));
  assert.equal(d.state.cue, 'holdStill');
  d = run(d, 33, () => face());
  assert.equal(d.state.cue, 'keepGoing', 'a frame was just taken');
});

/* ------------------------------ finishing ---------------------------- */

test('finish: after 75 s the scan completes with whatever it has', () => {
  assert.equal(FORCED_FINISH_MS, 75_000);
  let d = scanning();
  d = run(d, 33, () => face());
  d = landAll(d);
  // A small drift, still the hairline, which already has its frame.
  d = run(d, FORCED_FINISH_MS - 500, () => face({ yaw: 5, stability: 0.9 }));
  assert.equal(d.state.status, 'capturing');
  d = run(d, 600, () => face({ yaw: 5, stability: 0.9 }));
  assert.deepEqual(of(d.events, 'scanComplete'), [{ type: 'scanComplete', reason: 'timeout' }]);
  assert.equal(d.state.scanner, 'complete');
  assert.equal(d.state.status, 'complete');
  assert.ok(d.state.completion < 1);
  assert.equal(d.state.frames.length, 1);
});

test('finish: a forced finish with no frames at all is an error, not a report', () => {
  let d = scanning();
  d = run(d, FORCED_FINISH_MS + 100, () => face({ stability: 0.2 }));
  assert.equal(d.state.scanner, 'error');
  assert.equal(d.state.error, 'noFrames');
});

test('finish: completing waits for in-flight frames, but not forever', () => {
  // A camera that answers the hairline and then goes quiet: the temple's
  // request is still out when the forced finish arrives.
  let d = scanning();
  d = landAll(run(d, 33, () => face()));
  assert.equal(d.state.frames.length, 1);
  d = run(d, 1500, turn(0, TEMPLE_FULL_DEG, 1500));
  assert.equal(d.state.pending.length, 1, 'a request is out');
  d = toForcedFinish(d, () => face({ yaw: TEMPLE_FULL_DEG, stability: 0.95 }));
  assert.equal(d.state.status, 'completing');
  assert.equal(d.state.scanner, 'scanning');
  const n = of(d.events, 'capture').length;
  d = run(d, 300, () => face({ yaw: TEMPLE_FULL_DEG, stability: 0.95 }));
  assert.equal(d.state.scanner, 'scanning', 'still waiting');
  assert.equal(of(d.events, 'capture').length, n, 'no new requests while completing');
  d = run(d, SETTLE_MS, () => face({ yaw: TEMPLE_FULL_DEG, stability: 0.95 }));
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
  e = run(e, 1500, turn(0, TEMPLE_FULL_DEG, 1500));
  e = toForcedFinish(e, () => face({ yaw: TEMPLE_FULL_DEG, stability: 0.95 }));
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
 * The scan as a person does it: square on, right, back, left, back —
 * then, once the stage turns over, the head down and turning again.
 * Stops the moment every region is in, leaving the last request in flight.
 */
function drive(start: Driver, answer: (r: CaptureRequest) => boolean = () => true): Driver {
  let d = start;
  const legs: ((t: number) => FaceReading)[] = [
    () => face(),
    turn(0, TEMPLE_FULL_DEG, 2000),
    () => face({ yaw: TEMPLE_FULL_DEG, stability: 0.95 }),
    turn(TEMPLE_FULL_DEG, 0, 2000),
    turn(0, -TEMPLE_FULL_DEG, 2000),
    () => face({ yaw: -TEMPLE_FULL_DEG, stability: 0.95 }),
    turn(-TEMPLE_FULL_DEG, 0, 2000),
    nod(0, -CROWN_FULL_DEG, 1500),
    turn(0, 20, 1500, -CROWN_FULL_DEG),
    turn(20, -20, 2000, -CROWN_FULL_DEG),
  ];
  for (const leg of legs) {
    const legStart = d.now;
    for (let t = 33; t <= 2000; t += 33) {
      if (d.state.status !== 'capturing') return d;
      const wasPending = d.state.pending.length;
      d = dispatch(d, { type: 'tick', at: legStart + t, face: leg(t), lighting: 0.85 });
      // The camera answers the previous request about a frame later.
      const oldest = d.state.pending.find(answer);
      if (wasPending > 0 && oldest && d.state.status === 'capturing') {
        d = dispatch(d, { type: 'captured', requestId: oldest.id, image: { ...image, uri: `file:///${oldest.id}.jpg` }, at: d.now });
      }
    }
  }
  return d;
}

/** A scan with stage one behind it: the hairline and both temples in. */
function sweptScan(): Driver {
  let d = scanning();
  d = landAll(run(d, 100, () => face()));
  d = landAll(run(d, 2000, turn(0, TEMPLE_FULL_DEG, 2000)));
  d = landAll(run(d, 2000, turn(TEMPLE_FULL_DEG, 0, 2000)));
  d = landAll(run(d, 2000, turn(0, -TEMPLE_FULL_DEG, 2000)));
  d = landAll(run(d, 2000, turn(-TEMPLE_FULL_DEG, 0, 2000)));
  assert.ok(sweepDone(d.state.targets), 'stage one did not close');
  return { ...d, events: [] };
}

function fullScan(): Driver {
  let d = drive(scanning());
  assert.equal(d.state.completeReason, 'coverage', `stuck at ${d.state.completion}`);
  d = landAll(d);
  assert.equal(d.state.scanner, 'complete');
  return d;
}
