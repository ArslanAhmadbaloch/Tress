/**
 * The hair scan engine, driven by hand.
 *
 * Every rule that matters on a phone is checked here without one: which
 * screen follows which, that the ring fills only when the head moves
 * somewhere new and never on a timer, that the shutter is throttled and
 * gated, that the frames are curated rather than hoarded, and that
 * nobody is ever trapped in a scan that will not end.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CAPTURE_INTERVAL_MS,
  CHIN_SECTORS,
  FORCED_FINISH_MS,
  FRONT_DEVIATION,
  GOOD_QUALITY,
  LEFT_SECTORS,
  LOST_MS,
  MAX_FRAMES,
  PITCH_DOWN_FULL_DEG,
  REGION_NEEDED,
  REPLACE_MARGIN,
  RIGHT_SECTORS,
  RING_SECTORS,
  SETTLE_MS,
  STALL_MS,
  YAW_FULL_DEG,
  binOf,
  canStart,
  completionOf,
  coverFit,
  createScanState,
  evict,
  fillFor,
  frameQuality,
  headDirection,
  meshInBox,
  orderedFrames,
  poseFit,
  primaryFrame,
  reduce,
  regionOfBin,
  sectorOf,
  snapshotMesh,
} from '@/features/hair-scan/engine';
import { createTracker, syntheticFace, trackFrame } from '@/features/hair-scan/tracking';
import type {
  CaptureRequest,
  FaceReading,
  FrameMesh,
  ScanAction,
  ScanEvent,
  ScanFrame,
  ScanState,
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

/** The scanner at `ready` with a face locked, the clock at 1000. */
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
  assert.equal(d.state.startedAt, d.now);
  d = dispatch(d, { type: 'process', at: d.now });
  assert.equal(d.state.scanner, 'scanning', 'process is ignored mid-scan');
  d = dispatch(d, { type: 'processed', at: d.now });
  assert.equal(d.state.scanner, 'scanning');

  d = dispatch(d, { type: 'fail', reason: 'cameraFailed', at: d.now });
  assert.equal(d.state.scanner, 'error');
  assert.equal(d.state.error, 'cameraFailed');
  d = dispatch(d, { type: 'retry', at: d.now });
  assert.equal(d.state.scanner, 'ready', 'granted permission retries straight to the camera');
  assert.equal(d.state.completion, 0, 'a retry starts the ring over');
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

test('ready: the cue names the one thing to fix, and Start is live only when nothing is', () => {
  let d = atReady();
  assert.equal(d.state.status, 'ready');
  assert.equal(d.state.cue, 'perfect');
  assert.ok(canStart(d.state));

  d = run(d, 33, () => null);
  assert.equal(d.state.cue, 'centreFace');
  assert.equal(d.state.status, 'detecting');
  assert.ok(!canStart(d.state));

  d = run(d, 33, () => face({ size: 0.2, bounds: { x: 0.4, y: 0.35, width: 0.2, height: 0.3 } }));
  assert.equal(d.state.cue, 'closer');
  d = run(d, 33, () => face({ size: 0.8, bounds: { x: 0.1, y: 0, width: 0.8, height: 1 } }));
  assert.equal(d.state.cue, 'back');
  d = run(d, 33, () => face({ bounds: { x: 0.5, y: 0.2, width: 0.46, height: 0.6 } }));
  assert.equal(d.state.cue, 'centreFace');
  d = run(d, 33, () => face(), 0.1);
  assert.equal(d.state.cue, 'brighter');
  d = run(d, 33, () => face({ stability: 0.2 }));
  assert.equal(d.state.cue, 'holdStill');
  d = run(d, 33, () => face(), null);
  assert.equal(d.state.cue, 'perfect', 'unmeasured light never gates');
  assert.ok(canStart(d.state));
});

test('ready: an unreadable reading is not a face at the front', () => {
  let d = atReady();
  d = run(d, 33, () => face({ yaw: Number.NaN }));
  assert.equal(d.state.cue, 'centreFace');
  assert.ok(!canStart(d.state));
});

test('ready: the face-locked milestone fires once, and not again after Start', () => {
  let d: Driver = { state: createScanState(), events: [], now: 0 };
  d = dispatch(d, { type: 'continue', at: 0 });
  d = dispatch(d, { type: 'permission', granted: true, at: 0 });
  d = run(d, 300, () => face());
  const locks = () => of(d.events, 'milestone').filter((m) => m.milestone === 'faceLocked').length;
  assert.equal(locks(), 1);
  assert.equal(of(d.events, 'cue').length, 1, 'the cue is announced once, not every frame');
  assert.deepEqual(d.state.milestones, ['faceLocked']);

  // Start carries the lock: the ring opens with the front seen, no second buzz.
  d = dispatch(d, { type: 'start', at: d.now });
  assert.ok(d.state.frontLocked);
  assert.equal(d.state.completion, 0.1, 'the front is already in');
  d = run(d, 300, () => face());
  assert.equal(locks(), 1, 'faceLocked fired twice across Start');
  assert.deepEqual(d.state.milestones, ['faceLocked']);
});

test('ready: a head that is framed but turned is not ready, and Start stays off', () => {
  let d = atReady();
  for (const pose of [{ yaw: 20 }, { yaw: -20 }, { pitch: 15 }, { pitch: -15 }]) {
    d = run(d, 33, () => face(pose));
    assert.equal(d.state.cue, 'centreFace', JSON.stringify(pose));
    assert.equal(d.state.status, 'detecting');
    assert.ok(!canStart(d.state), `Start is live at ${JSON.stringify(pose)}`);
  }
  d = run(d, 33, () => face({ yaw: 5, pitch: -5 }));
  assert.equal(d.state.cue, 'perfect');
  assert.ok(canStart(d.state));
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
  // A half turn is a half fill, not a full one.
  const half = fillFor(headDirection({ yaw: YAW_FULL_DEG * 0.65, pitch: 0 }));
  assert.ok((half[6] ?? 0) > 0.3 && (half[6] ?? 0) < 0.7, `half turn fills ${half[6]}`);
  // Square on fills nothing.
  assert.ok(fillFor(headDirection({ yaw: 0, pitch: 0 })).every((v) => v === 0));
});

test('ring: a comfortable turn each way and a small chin-down is a sufficient scan', () => {
  // The tracker smooths and lags; a real 30° turn reads nearer 25°.
  let d = scanning();
  d = run(d, 1500, turn(0, 25, 1500));
  assert.ok(d.state.regions.right >= REGION_NEEDED.right, `right ${d.state.regions.right}`);
  d = run(d, 1500, turn(25, 0, 1500));
  d = run(d, 1500, turn(0, -25, 1500));
  assert.ok(d.state.regions.left >= REGION_NEEDED.left, `left ${d.state.regions.left}`);
  d = run(d, 1500, turn(-25, 0, 1500));
  d = run(d, 1000, (t) => face({ pitch: (-12 * Math.min(t, 1000)) / 1000, stability: 0.9 }));
  assert.equal(d.state.completeReason, 'coverage', `stuck at ${d.state.completion}`);

  // A timid turn is not: 15° each way leaves the sides wanting.
  let e = scanning();
  e = run(e, 1500, turn(0, 15, 1500));
  assert.ok(e.state.regions.right < REGION_NEEDED.right);
  assert.ok(e.state.regions.right > 0, 'but it is not nothing');
});

test('ring: completion is 1 exactly at sufficiency and weights the regions', () => {
  assert.equal(completionOf({ front: 0, right: 0, left: 0, chin: 0 }), 0);
  assert.equal(completionOf({ front: 1, right: 0, left: 0, chin: 0 }), 0.1);
  assert.equal(completionOf(REGION_NEEDED), 1);
  assert.equal(completionOf({ front: 1, right: 1, left: 1, chin: 1 }), 1, 'over-filling never exceeds 1');
});

/* ------------------------------ filling ------------------------------ */

test('scanning: the ring fills as the head turns, one side at a time, and never on a timer', () => {
  let d = scanning();

  // Ten seconds square on: the front locks, nothing else moves.
  d = run(d, 10_000, () => face());
  assert.ok(d.state.frontLocked);
  assert.equal(d.state.completion, 0.1, 'holding still earns nothing but the front');
  for (const i of RIGHT_SECTORS) assert.equal(d.state.sectors[i], 0);

  // A slow right turn.
  d = run(d, 2000, turn(0, YAW_FULL_DEG, 2000));
  for (const i of RIGHT_SECTORS) assert.equal(d.state.sectors[i], 1, `right sector ${i}`);
  for (const i of LEFT_SECTORS) assert.equal(d.state.sectors[i], 0, `left sector ${i}`);
  assert.ok(of(d.events, 'milestone').some((m) => m.milestone === 'rightDone'));
  assert.ok(d.state.regions.right >= REGION_NEEDED.right);
  assert.ok(d.state.completion > 0.35 && d.state.completion < 0.5, `${d.state.completion}`);

  // Turning back through the middle un-fills nothing.
  const filled = d.state.sectors.slice();
  const before = d.state.completion;
  d = run(d, 2000, turn(YAW_FULL_DEG, 0, 2000));
  for (let i = 0; i < RING_SECTORS; i += 1) {
    assert.ok((d.state.sectors[i] ?? 0) >= (filled[i] ?? 0), `sector ${i} went down`);
  }
  assert.ok(d.state.completion >= before);

  // The left side, then the chin.
  d = run(d, 2000, turn(0, -YAW_FULL_DEG, 2000));
  for (const i of LEFT_SECTORS) assert.equal(d.state.sectors[i], 1, `left sector ${i}`);
  assert.ok(of(d.events, 'milestone').some((m) => m.milestone === 'leftDone'));
  assert.ok(d.state.status === 'capturing', 'not complete without the chin');
  d = run(d, 2000, turn(-YAW_FULL_DEG, 0, 2000));
  d = run(d, 1500, (t) => face({ pitch: (-PITCH_DOWN_FULL_DEG * Math.min(t, 1500)) / 1500, stability: 0.9 }));
  assert.ok(of(d.events, 'milestone').some((m) => m.milestone === 'chinDone'));
  assert.equal(d.state.completion, 1);
  assert.deepEqual(of(d.events, 'scanComplete'), [{ type: 'scanComplete', reason: 'coverage' }]);

  const marks = of(d.events, 'milestone').map((m) => m.milestone);
  for (const m of ['quarter', 'half', 'threeQuarters'] as const) {
    assert.equal(marks.filter((x) => x === m).length, 1, `${m} fires exactly once`);
  }
});

test('scanning: completion is monotonic across every tick of a messy scan', () => {
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
    assert.ok(d.state.completion >= last - 1e-12, `completion fell at ${t}`);
    last = d.state.completion;
    for (const v of d.state.sectors) assert.ok(v >= 0 && v <= 1);
  }
});

test('scanning: a dark frame fills nothing and a fast one fills nothing', () => {
  let d = scanning();
  d = run(d, 2000, turn(0, YAW_FULL_DEG, 2000), 0.1);
  assert.ok(d.state.sectors.every((v) => v === 0), 'dark frames do not fill');
  assert.equal(d.state.cue, 'brighter');

  d = scanning();
  // 30° in one frame is a whip, not a turn.
  d = dispatch(d, { type: 'tick', at: d.now + 33, face: face({ yaw: 0 }), lighting: 0.8 });
  d = dispatch(d, { type: 'tick', at: d.now + 33, face: face({ yaw: 30 }), lighting: 0.8 });
  assert.equal(of(d.events, 'tooFast').length, 1);
  assert.equal(d.state.cue, 'slowDown');
  assert.ok(d.state.sectors.every((v) => v === 0), 'a whipped frame does not fill');
  // Still whipping: the event is throttled, the cue holds.
  d = dispatch(d, { type: 'tick', at: d.now + 33, face: face({ yaw: 0 }), lighting: 0.8 });
  assert.equal(of(d.events, 'tooFast').length, 1);
  assert.equal(d.state.cue, 'slowDown');
});

/* ------------------------------ capture ------------------------------ */

test('capture: a request needs a steady, lit, framed face in a bin that wants one', () => {
  let d = scanning();
  d = run(d, 33, () => face({ stability: 0.3 }));
  assert.equal(of(d.events, 'capture').length, 0, 'not steady');
  d = run(d, 33, () => face(), 0.1);
  assert.equal(of(d.events, 'capture').length, 0, 'not lit');
  d = run(d, 33, () => face({ size: 0.2, bounds: { x: 0.4, y: 0.35, width: 0.2, height: 0.3 } }));
  assert.equal(of(d.events, 'capture').length, 0, 'not framed');
  d = run(d, 33, () => face(), null);
  const requests = of(d.events, 'capture');
  assert.equal(requests.length, 1, 'steady, framed, light unmeasured');
  assert.equal(requests[0]?.request.bin, 0);
  assert.equal(requests[0]?.request.region, 'front');
  assert.equal(d.state.pending.length, 1);
});

test('capture: at most one request every 700 ms, and none for a bin already in flight', () => {
  let d = scanning();
  d = run(d, 33, () => face());
  assert.equal(of(d.events, 'capture').length, 1);
  const first = of(d.events, 'capture')[0]?.request as CaptureRequest;

  // The camera is slow; the front bin is in flight, so no second request for it.
  d = run(d, 990, () => face());
  assert.equal(of(d.events, 'capture').length, 1, 'no duplicate while pending');

  // It fails: the bin wants one again, but the throttle still applies from the last request.
  d = dispatch(d, { type: 'captureFailed', requestId: first.id, at: d.now });
  d = run(d, 33, () => face());
  assert.equal(of(d.events, 'capture').length, 2, 'a failed request is asked again once the throttle allows');
  const second = of(d.events, 'capture')[1]?.request as CaptureRequest;
  assert.ok(second.at - first.at >= CAPTURE_INTERVAL_MS);

  // Fail again immediately: within 700 ms nothing fires; after, it does.
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

test('curation: a replaced frame is named for deletion, and so is an evicted one', () => {
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

  // Thirteen bins, twelve places: the weakest ring frame is let go of by name.
  const frames: ScanFrame[] = [];
  for (let bin = 0; bin < MAX_FRAMES; bin += 1) {
    frames.push({
      ...image,
      uri: `file:///bin${bin}.jpg`,
      id: `f${bin}`,
      bin,
      region: regionOfBin(bin),
      sector: bin === 0 ? null : bin,
      yaw: 0,
      pitch: 0,
      quality: bin === 3 ? 0.4 : 0.7,
      capturedAt: bin,
    });
  }
  const last: CaptureRequest = {
    id: 'last', bin: 12, region: regionOfBin(12), sector: 23, yaw: -10, pitch: 10, quality: 0.75, at: d.now,
  };
  let e: Driver = { state: { ...scanning().state, frames, pending: [last] }, events: [], now: d.now };
  e = dispatch(e, { type: 'captured', requestId: 'last', image: { ...image, uri: 'file:///bin12.jpg' }, at: e.now });
  assert.equal(e.state.frames.length, MAX_FRAMES);
  assert.ok(e.state.frames.some((f) => f.id === 'last'), 'the new frame is kept');
  assert.ok(!e.state.frames.some((f) => f.id === 'f3'), 'the weakest goes');
  assert.deepEqual(
    of(e.events, 'discard').map((x) => [x.reason, x.images.map((i) => i.uri)]),
    [['evicted', ['file:///bin3.jpg']]],
  );
});

test('cancel: mid-scan, the kept frames are named for deletion and in-flight requests are not forgotten', () => {
  let d = scanning();
  d = run(d, 33, () => face(), 0.9);
  d = landAll(d);
  d = run(d, 1500, turn(0, YAW_FULL_DEG, 1500));
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

test('retry: from a mid-scan failure the frames are named for deletion and the ring starts over', () => {
  let d = scanning();
  d = run(d, 33, () => face(), 0.9);
  d = landAll(d);
  d = run(d, 1500, turn(0, YAW_FULL_DEG, 1500));
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
  assert.deepEqual(d.state.abandoned, inFlight, 'still owed by the camera');
  assert.deepEqual(of(d.events, 'discard').map((e) => [e.reason, e.images.map((i) => i.uri)]), [['abandoned', uris]]);
});

test('capture: an answer to an unknown request is ignored', () => {
  const d = scanning();
  const step = reduce(d.state, { type: 'captured', requestId: 'nope', image, at: d.now });
  assert.equal(step.state, d.state);
  assert.deepEqual(step.events, []);
});

test('curation: never more than twelve frames, and the front is never the one evicted', () => {
  const frames: ScanFrame[] = [];
  for (let bin = 0; bin <= 12; bin += 1) {
    frames.push({
      ...image,
      id: `f${bin}`,
      bin,
      region: regionOfBin(bin),
      sector: bin === 0 ? null : bin,
      yaw: 0,
      pitch: 0,
      quality: bin === 0 ? 0.05 : 0.5 + bin / 100,
      capturedAt: bin,
    });
  }
  const kept = evict(frames);
  assert.equal(kept.length, MAX_FRAMES);
  assert.ok(kept.some((f) => f.bin === 0), 'the front stays even at the lowest quality');
  assert.ok(!kept.some((f) => f.id === 'f1'), 'the weakest ring frame goes');
  assert.equal(evict(frames.slice(0, 5)).length, 5);
});

test('curation: a whole scan keeps a dozen frames at most, one per bin', () => {
  const d = fullScan();
  assert.ok(d.state.frames.length >= 4, `only ${d.state.frames.length} frames`);
  assert.ok(d.state.frames.length <= MAX_FRAMES);
  const bins = d.state.frames.map((f) => f.bin);
  assert.equal(new Set(bins).size, bins.length, 'one frame per bin');
  assert.equal(primaryFrame(d.state)?.bin, 0);
  assert.equal(orderedFrames(d.state)[0]?.bin, 0);
  const regions = new Set(d.state.frames.map((f) => f.region));
  for (const r of ['front', 'right', 'left', 'chin'] as const) assert.ok(regions.has(r), `no ${r} frame`);
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

test('scanning: a framed head that earns nothing for a while is a stall, said once', () => {
  let d = scanning();
  d = run(d, STALL_MS + 200, () => face());
  assert.equal(of(d.events, 'stall').length, 1);
  d = run(d, 2000, () => face());
  assert.equal(of(d.events, 'stall').length, 1, 'not repeated');
  // Movement clears it and re-arms it.
  d = run(d, 1500, turn(0, YAW_FULL_DEG, 1500));
  assert.ok(!d.state.stalled);
  d = run(d, STALL_MS + 200, () => face({ yaw: YAW_FULL_DEG, stability: 0.9 }));
  assert.equal(of(d.events, 'stall').length, 2);
});

test('scanning: the hold-still cue appears only after lingering unsteadily where a frame is wanted', () => {
  let d = scanning();
  d = run(d, 200, () => face({ stability: 0.3 }));
  assert.equal(d.state.cue, 'moveSlowly');
  d = run(d, 500, () => face({ stability: 0.3 }));
  assert.equal(d.state.cue, 'holdStill');
  d = run(d, 33, () => face());
  assert.equal(d.state.cue, 'keepGoing', 'a frame was just taken');
});

/* ------------------------------ finishing ---------------------------- */

test('finish: after 45 s the scan completes with whatever it has', () => {
  let d = scanning();
  d = run(d, 33, () => face());
  d = landAll(d);
  // A small drift, still the front bin, which already has its frame.
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
  // A camera that answers only the first request: the rest stay in flight.
  const slow = (r: CaptureRequest) => r.id === 'c1';
  let d = scanning();
  d = drive(d, slow);
  assert.equal(d.state.status, 'completing');
  assert.ok(d.state.pending.length > 0, 'a request is still out');
  assert.equal(d.state.scanner, 'scanning');
  const n = of(d.events, 'capture').length;
  d = run(d, 300, () => face());
  assert.equal(d.state.scanner, 'scanning', 'still waiting');
  assert.equal(of(d.events, 'capture').length, n, 'no new requests while completing');
  d = run(d, SETTLE_MS, () => face());
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

  // Or the frame lands, and it completes at once.
  let e = drive(scanning(), slow);
  const outstanding = e.state.pending.map((r) => r.id);
  assert.ok(outstanding.length >= 1);
  for (const id of outstanding) {
    assert.equal(e.state.scanner, 'scanning', `still waiting on ${id}`);
    e = dispatch(e, { type: 'captured', requestId: id, image: { ...image, uri: `file:///${id}.jpg` }, at: e.now });
  }
  assert.equal(e.state.scanner, 'complete');
  for (const id of outstanding) assert.ok(e.state.frames.some((f) => f.id === id), `${id} kept`);
});

test('curation: the side frames are taken at the turn, not at the inner edge of their bin', () => {
  // Without a pose term the first frame into a bin (about 8° of yaw)
  // scored as good and the bin refused every fuller turn after it, so
  // "Right side" in the report was a near-frontal picture.
  const d = fullScan();
  const right = d.state.frames.find((f) => f.region === 'right');
  const left = d.state.frames.find((f) => f.region === 'left');
  assert.ok(right && left, 'a frame for each side');
  assert.ok(right.yaw >= YAW_FULL_DEG * 0.75, `right side kept at ${right.yaw}°`);
  assert.ok(left.yaw <= -YAW_FULL_DEG * 0.75, `left side kept at ${left.yaw}°`);
  assert.ok(of(d.events, 'frame').some((f) => f.replaced), 'the fuller turn replaced the edge frame');
  const front = d.state.frames.find((f) => f.bin === 0);
  assert.ok(front && Math.abs(front.yaw) < 2, 'the front frame is square on');
});

test('quality: a frame at a bin’s inner edge is never good; the same conditions at the turn are', () => {
  const edge = frameQuality(face({ yaw: YAW_FULL_DEG * FRONT_DEVIATION + 0.1, stability: 0.9 }), 0.85);
  const turned = frameQuality(face({ yaw: YAW_FULL_DEG, stability: 0.9 }), 0.85);
  assert.ok(edge < GOOD_QUALITY, `${edge}`);
  assert.ok(turned >= GOOD_QUALITY, `${turned}`);
  assert.ok(turned > edge + REPLACE_MARGIN, 'worth the shutter');
  assert.equal(poseFit(headDirection({ yaw: 0, pitch: 0 })), 1, 'square on fits the front bin');
  assert.equal(poseFit(headDirection({ yaw: YAW_FULL_DEG * FRONT_DEVIATION, pitch: 0 })), 0);
});

test('scanning: a stall is not said again while sectors grow without the ring gaining', () => {
  let d = scanning();
  d = run(d, STALL_MS + 200, () => face());
  assert.equal(of(d.events, 'stall').length, 1);
  // A slow tilt back: the sectors above the head fill, no region asks for them.
  d = run(d, 3000, (t) => face({ pitch: (15 * Math.min(t, 3000)) / 3000, stability: 0.9 }));
  assert.equal(of(d.events, 'stall').length, 1, 'said once, not on every tick');
  assert.ok(d.state.stalled, 'still stalled: nothing was gained');
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
    { ...d.state, pending: [{ ...request, id: 'bare', bin: 3, region: regionOfBin(3) }] },
    { type: 'captured', requestId: 'bare', image, at: d.now },
  ).state;
  const landed = bare.frames.find((f) => f.id === 'bare');
  assert.ok(landed);
  assert.ok(!('mesh' in landed), 'no mesh key at all');
  assert.deepEqual(bare.frames.find((f) => f.bin === 0)?.mesh, better, 'the front kept its own');
});

test('mesh: curation and ordering carry every survivor’s mesh through', () => {
  const frames: ScanFrame[] = [];
  const meshes = new Map<number, FrameMesh>();
  for (let bin = 0; bin < MAX_FRAMES; bin += 1) {
    const mesh = meshOf(bin * 90);
    meshes.set(bin, mesh);
    frames.push({
      ...image,
      uri: `file:///bin${bin}.jpg`,
      id: `f${bin}`,
      bin,
      region: regionOfBin(bin),
      sector: bin === 0 ? null : bin,
      yaw: 0,
      pitch: 0,
      quality: bin === 3 ? 0.4 : 0.7,
      capturedAt: bin,
      mesh,
    });
  }
  const last: CaptureRequest = {
    id: 'last', bin: 12, region: regionOfBin(12), sector: 23, yaw: -10, pitch: 10, quality: 0.75, at: 5000,
  };
  const lastMesh = meshOf(1500);
  let e: Driver = { state: { ...scanning().state, frames, pending: [last] }, events: [], now: 5000 };
  e = dispatch(e, { type: 'captured', requestId: 'last', image, mesh: lastMesh, at: e.now });
  assert.equal(e.state.frames.length, MAX_FRAMES);
  for (const f of orderedFrames(e.state)) {
    const expected = f.id === 'last' ? lastMesh : meshes.get(f.bin);
    assert.deepEqual(f.mesh, expected, `frame ${f.id} lost its mesh`);
  }
  assert.ok(!e.state.frames.some((f) => f.id === 'f3'), 'the weakest still goes');
  assert.deepEqual(evict(frames).map((f) => f.mesh), evict(frames).map((f) => meshes.get(f.bin)));
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
 * Front, right, back, left, back, chin — the scan as a person would do
 * it, with the camera answering every request as it comes. Stops the
 * moment the ring is sufficient, leaving the last request in flight.
 */
function drive(start: Driver, answer: (r: CaptureRequest) => boolean = () => true): Driver {
  let d = start;
  const legs: ((t: number) => FaceReading)[] = [
    () => face(),
    turn(0, YAW_FULL_DEG, 2000),
    () => face({ yaw: YAW_FULL_DEG, stability: 0.95 }),
    turn(YAW_FULL_DEG, 0, 2000),
    turn(0, -YAW_FULL_DEG, 2000),
    () => face({ yaw: -YAW_FULL_DEG, stability: 0.95 }),
    turn(-YAW_FULL_DEG, 0, 2000),
    (t) => face({ pitch: (-PITCH_DOWN_FULL_DEG * Math.min(t, 1500)) / 1500, stability: 0.95 }),
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

function fullScan(): Driver {
  let d = drive(scanning());
  assert.equal(d.state.completeReason, 'coverage');
  d = landAll(d);
  assert.equal(d.state.scanner, 'complete');
  return d;
}
