/**
 * The half of the ARKit module a laptop can judge.
 *
 * The Swift cannot be compiled here, so what is checked is the boundary:
 * the availability guard says no everywhere it must, the type guards
 * refuse anything that would draw as NaN, the point layout the mesh lane
 * codes against is the one this module documents, and an ARKit frame
 * converted by `toRawFace` really is something the scan's own tracker
 * accepts — that last one runs the app's `trackFrame` over it, so the two
 * halves of the contract are checked against each other rather than
 * against a description of each other. The frame sampler is here on the
 * same terms: the Swift that renders the square cannot run, so what is
 * held is the boundary it hands the square across — a buffer that is not
 * the square it claims to be is refused rather than read as noise, and
 * the sides the two languages clamp to are read off both files.
 *
 * Deliberately imports only the pure files of the module. `src/native.ts`
 * reaches for React Native and would not survive `node --test`, which is
 * exactly why the availability rule lives in `src/points.ts` as a
 * function taking its world as an argument.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

import {
  BROW_START,
  COAST_MS,
  COVERS_CROWN,
  INNER_RADIUS,
  POINT_COUNT,
  POINT_VALUES,
  RIM_START,
  RING_POINTS,
  RING_STEP_DEG,
  hasFullMesh,
  isFaceFrame,
  isFaceLost,
  isTracking,
  pointAt,
  resolveAvailability,
  ringAngle,
} from '../../modules/hair-face-tracking/src/points';
import { toRawFace } from '../../modules/hair-face-tracking/src/raw-face';
import {
  SAMPLE_CHANNELS,
  SAMPLE_MAX,
  SAMPLE_MIN,
  SAMPLE_SIZE,
  clampSampleSize,
  normaliseSample,
} from '../../modules/hair-face-tracking/src/sample';
import type { FaceFrame } from '../../modules/hair-face-tracking/src/types';
import { createTracker, trackFrame } from '../../src/features/hair-scan/tracking';
import type { RawFace } from '../../src/features/hair-scan/tracking';

/* ----------------------------- availability ---------------------------- */

const working = { isAvailable: () => true };

test('face tracking is unavailable off iOS, whatever the native side says', () => {
  for (const os of ['android', 'web', 'windows', 'macos']) {
    assert.equal(resolveAvailability({ os, nativeModule: working }), false, os);
  }
});

test('face tracking is unavailable when the module is not in the binary', () => {
  assert.equal(resolveAvailability({ os: 'ios', nativeModule: null }), false);
  assert.equal(resolveAvailability({ os: 'ios', nativeModule: undefined }), false);
});

test('face tracking is unavailable when the hardware says no', () => {
  assert.equal(
    resolveAvailability({ os: 'ios', nativeModule: { isAvailable: () => false } }),
    false,
  );
});

test('a native module that throws is a no, not a crash', () => {
  assert.equal(
    resolveAvailability({
      os: 'ios',
      nativeModule: {
        isAvailable: () => {
          throw new Error('no such method');
        },
      },
    }),
    false,
  );
});

test('a native module missing isAvailable is a no', () => {
  assert.equal(resolveAvailability({ os: 'ios', nativeModule: {} }), false);
});

test('face tracking is available on iOS when the module and the hardware agree', () => {
  assert.equal(resolveAvailability({ os: 'ios', nativeModule: working }), true);
});

test('only a literal true counts as available', () => {
  const lying = { isAvailable: () => 1 as unknown as boolean };
  assert.equal(resolveAvailability({ os: 'ios', nativeModule: lying }), false);
});

/* ------------------------------ the layout ----------------------------- */

test('the point layout is two rings of thirty-six', () => {
  assert.equal(RING_POINTS, 36);
  assert.equal(POINT_COUNT, 72);
  assert.equal(POINT_VALUES, 144);
  assert.equal(RIM_START, 0);
  assert.equal(BROW_START, RING_POINTS);
  assert.equal(RING_STEP_DEG, 10);
});

test('the inner ring sits inside the rim, not on it', () => {
  assert.ok(INNER_RADIUS > 0 && INNER_RADIUS < 1);
});

test('ring slot zero is twelve o’clock and the ring runs once round', () => {
  assert.equal(ringAngle(0), 0);
  assert.equal(ringAngle(9), 90);
  assert.equal(ringAngle(18), 180);
  assert.equal(ringAngle(RING_POINTS), 0);
  assert.equal(ringAngle(-1), 350);
});

test('both rings share the same angles, slot for slot', () => {
  for (let slot = 0; slot < RING_POINTS; slot += 1) {
    assert.equal(ringAngle(RIM_START + slot), ringAngle(BROW_START + slot));
  }
});

/* ------------------------------- the guards ---------------------------- */

function frame(overrides: Partial<FaceFrame> = {}): FaceFrame {
  const points: number[] = [];
  const facing: number[] = [];
  for (let slot = 0; slot < POINT_COUNT; slot += 1) {
    points.push(0.5, 0.5);
    facing.push(1);
  }
  return {
    cx: 0.5,
    cy: 0.45,
    width: 0.4,
    height: 0.55,
    yaw: 0,
    pitch: 0,
    roll: 0,
    points,
    facing,
    at: 1_700_000_000_000,
    ...overrides,
  };
}

test('a complete frame is a frame', () => {
  const event: unknown = frame();
  assert.equal(isFaceFrame(event), true);
  assert.equal(isFaceLost(event), false);
  assert.equal(hasFullMesh(frame()), true);
});

test('the lost event is recognised and is never mistaken for a frame', () => {
  assert.equal(isFaceLost({ lost: true }), true);
  assert.equal(isFaceFrame({ lost: true }), false);
  assert.equal(isFaceLost({ lost: false }), false);
  assert.equal(isFaceLost(null), false);
  assert.equal(isFaceLost('lost'), false);
});

test('nothing that is not an object is a frame', () => {
  for (const value of [null, undefined, 0, 'face', [], true]) {
    assert.equal(isFaceFrame(value), false, String(value));
  }
});

test('a frame with a missing or non-finite scalar is refused', () => {
  const keys = ['cx', 'cy', 'width', 'height', 'yaw', 'pitch', 'roll', 'at'] as const;
  for (const key of keys) {
    assert.equal(isFaceFrame(frame({ [key]: Number.NaN })), false, `${key} NaN`);
    assert.equal(isFaceFrame(frame({ [key]: Number.POSITIVE_INFINITY })), false, `${key} inf`);
    const missing: Record<string, unknown> = { ...frame() };
    delete missing[key];
    assert.equal(isFaceFrame(missing), false, `${key} missing`);
  }
});

test('a frame whose arrays disagree is refused', () => {
  assert.equal(isFaceFrame(frame({ points: [0.1, 0.2], facing: [1, 1] })), false);
  assert.equal(isFaceFrame(frame({ points: [0.1], facing: [] })), false);
  assert.equal(isFaceFrame(frame({ points: [Number.NaN, 0.2], facing: [1] })), false);
  assert.equal(isFaceFrame(frame({ facing: [Number.NaN], points: [0.1, 0.2] })), false);
});

test('a pose with no geometry is still a frame, but not a full mesh', () => {
  const poseOnly = frame({ points: [], facing: [] });
  assert.equal(isFaceFrame(poseOnly), true);
  assert.equal(hasFullMesh(poseOnly), false);
});

test('points read back in the order they were written', () => {
  const points: number[] = [];
  for (let slot = 0; slot < POINT_COUNT; slot += 1) {
    points.push(slot / 100, 1 - slot / 100);
  }
  const read = frame({ points });
  assert.deepEqual(pointAt(read, 0), { x: 0, y: 1 });
  assert.deepEqual(pointAt(read, BROW_START), { x: BROW_START / 100, y: 1 - BROW_START / 100 });
  assert.deepEqual(pointAt(read, POINT_COUNT - 1), {
    x: (POINT_COUNT - 1) / 100,
    y: 1 - (POINT_COUNT - 1) / 100,
  });
});

test('reading past the end of a frame gives nothing rather than NaN', () => {
  const read = frame();
  assert.equal(pointAt(read, POINT_COUNT), null);
  assert.equal(pointAt(read, -1), null);
  assert.equal(pointAt(read, 1.5), null);
  assert.equal(pointAt({ points: [] }, 0), null);
});

/* ------------------------------- coasting ------------------------------ */

test('a frame with no tracking flag counts as tracked', () => {
  assert.equal(isTracking(frame()), true);
  assert.equal(isTracking({}), true);
});

test('a held frame says so and is still a drawable frame', () => {
  const held = frame({ tracking: false });
  assert.equal(isTracking(held), false);
  assert.equal(isFaceFrame(held), true, 'a held pose is still worth drawing');
  assert.equal(hasFullMesh(held), true);
  assert.equal(isTracking(frame({ tracking: true })), true);
});

test('a tracking flag that is not a boolean is refused', () => {
  for (const value of ['false', 0, 1, null]) {
    assert.equal(isFaceFrame(frame({ tracking: value as unknown as boolean })), false, String(value));
  }
});

test('the coast is long enough to lower the head and short enough to notice', () => {
  assert.ok(COAST_MS >= 800, 'shorter than this and the crown stage drops out mid-turn');
  assert.ok(COAST_MS <= 3000, 'longer than this and a person who left is still on screen');
});

test('the native side is asked for the same coast the TypeScript advertises', () => {
  const swift = readFileSync(
    new URL('../../modules/hair-face-tracking/ios/HairFaceTrackingView.swift', import.meta.url),
    'utf8',
  );
  const grace = /coastGrace:\s*CFTimeInterval\s*=\s*([0-9.]+)/.exec(swift);
  assert.ok(grace, 'coastGrace is where the native side decides how long to hold a pose');
  assert.equal(Number(grace[1]) * 1000, COAST_MS);
});

/* ------------------------------- honesty ------------------------------- */

/** Every TypeScript file the module ships, read off disk. */
function moduleSources(): { name: string; text: string }[] {
  const base = new URL('../../modules/hair-face-tracking/', import.meta.url);
  const files = [
    'index.ts',
    ...readdirSync(new URL('src/', base))
      .filter((name) => name.endsWith('.ts'))
      .map((name) => `src/${name}`),
  ];
  return files.map((name) => ({ name, text: readFileSync(new URL(name, base), 'utf8') }));
}

/** Exported identifiers, gathered from the source rather than from memory. */
function exportedNames(): string[] {
  const names: string[] = [];
  for (const file of moduleSources()) {
    const declared = file.text.matchAll(
      /export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g,
    );
    for (const match of declared) names.push(match[1]);
    for (const block of file.text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
      for (const part of block[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) names.push(name);
      }
    }
  }
  return names;
}

test('the module exports what the app codes against, read off the source', () => {
  const names = new Set(exportedNames());
  for (const required of [
    'isFaceTrackingAvailable',
    'capture',
    'sampleFrame',
    'canSampleFrame',
    'normaliseSample',
    'FrameSample',
    'HairFaceTrackingView',
    'isFaceFrame',
    'isFaceLost',
    'isTracking',
    'hasFullMesh',
    'FaceFrame',
    'HairFaceTrackingViewProps',
  ]) {
    assert.ok(names.has(required), `${required} is part of the contract`);
  }
});

test('nothing this module exports claims anything about hair', () => {
  // The real surface, not a list of names written out by hand: an
  // `estimateDensity()` added tomorrow fails this test the same day.
  const names = exportedNames();
  assert.ok(names.length > 15, 'the surface was read, not guessed');
  const claims = ['density', 'thinning', 'progress', 'stage', 'diagnos', 'hairloss', 'loss'];
  for (const name of names) {
    for (const claim of claims) {
      assert.equal(name.toLowerCase().includes(claim), false, `${name} contains "${claim}"`);
    }
  }
});

test('the module measures a face and promises nothing else', () => {
  // The prose is checked too, for the words that would be a claim wherever
  // they appeared: an assessment, a diagnosis, a prediction, an outcome.
  const forbidden = [
    'diagnos',
    'hair loss',
    'regrow',
    'will improve',
    'treatment works',
    'guarantee',
  ];
  for (const file of moduleSources()) {
    const text = file.text.toLowerCase();
    for (const claim of forbidden) {
      assert.equal(text.includes(claim), false, `${file.name} says "${claim}"`);
    }
  }
});

test('the module documents that it never sees the crown', () => {
  assert.equal(COVERS_CROWN, false);
  const points = readFileSync(
    new URL('../../modules/hair-face-tracking/src/points.ts', import.meta.url),
    'utf8',
  );
  assert.ok(
    /mask, not a head/i.test(points),
    'the drawing side has to be told the geometry stops at the forehead',
  );
});

/* --------------------------- the frame sample -------------------------- */

/** One square of bytes, the shape the native side sends. */
function sample(side = SAMPLE_MIN, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data: new Uint8Array(side * side * SAMPLE_CHANNELS),
    size: side,
    sourceWidth: 720,
    sourceHeight: 1280,
    ...overrides,
  };
}

test('a square of bytes comes through with the picture it was squashed out of', () => {
  const read = normaliseSample(sample(64));
  assert.ok(read);
  assert.equal(read.size, 64);
  assert.equal(read.sourceWidth, 720);
  assert.equal(read.sourceHeight, 1280);
  assert.equal(read.data.length, 64 * 64 * 4);
});

test('an ArrayBuffer and a plain array are read as the bytes they are', () => {
  const square = SAMPLE_MIN * SAMPLE_MIN * SAMPLE_CHANNELS;
  const bytes = new Uint8Array(square);
  const fromBuffer = normaliseSample(sample(SAMPLE_MIN, { data: bytes.buffer }));
  assert.equal(fromBuffer?.data.length, square);
  const fromArray = normaliseSample(sample(SAMPLE_MIN, { data: Array.from(bytes) }));
  assert.equal(fromArray?.data.length, square);
});

test('a buffer that is not the square it claims to be is refused, not read as noise', () => {
  // The whole reason this function exists: read anyway and the outline
  // lands somewhere the head is not, with nothing to say so.
  const square = SAMPLE_MIN * SAMPLE_MIN;
  assert.equal(normaliseSample(sample(SAMPLE_MIN, { data: new Uint8Array(square * 3) })), null);
  assert.equal(normaliseSample(sample(SAMPLE_MIN, { data: new Uint8Array(square * 4 + 1) })), null);
});

test('a payload missing any of its three numbers is refused', () => {
  for (const missing of ['size', 'sourceWidth', 'sourceHeight']) {
    const payload = sample();
    delete payload[missing];
    assert.equal(normaliseSample(payload), null, missing);
  }
  assert.equal(normaliseSample(sample(SAMPLE_MIN, { sourceWidth: 0 })), null);
  assert.equal(normaliseSample(sample(SAMPLE_MIN, { sourceHeight: Number.NaN })), null);
  assert.equal(normaliseSample(sample(SAMPLE_MIN, { data: 'bytes' })), null);
  assert.equal(normaliseSample(null), null);
  assert.equal(normaliseSample('nothing'), null);
});

test('a square outside the sides the native side renders is refused', () => {
  assert.equal(normaliseSample(sample(SAMPLE_MIN - 1)), null);
  assert.equal(normaliseSample(sample(SAMPLE_MAX + 1)), null);
  assert.ok(normaliseSample(sample(SAMPLE_MIN)));
  assert.ok(normaliseSample(sample(SAMPLE_SIZE)));
});

test('the side asked for is held inside what the native side accepts', () => {
  assert.equal(clampSampleSize(SAMPLE_SIZE), SAMPLE_SIZE);
  assert.equal(clampSampleSize(4), SAMPLE_MIN);
  assert.equal(clampSampleSize(4096), SAMPLE_MAX);
  assert.equal(clampSampleSize(Number.NaN), SAMPLE_SIZE);
  assert.equal(clampSampleSize(255.6), 256);
});

test('the sizes the JavaScript clamps to are the sizes the Swift clamps to', () => {
  const swift = readFileSync(
    new URL('../../modules/hair-face-tracking/ios/HairFaceTrackingModule.swift', import.meta.url),
    'utf8',
  );
  const min = /sampleMin\s*=\s*(\d+)/.exec(swift);
  const max = /sampleMax\s*=\s*(\d+)/.exec(swift);
  assert.ok(min, 'the Swift names its own floor');
  assert.ok(max, 'and its own ceiling');
  assert.equal(Number(min[1]), SAMPLE_MIN);
  assert.equal(Number(max[1]), SAMPLE_MAX);
});

/** The Swift module, as text: it cannot be compiled here, so it is read. */
function moduleSwift(): string {
  return readFileSync(
    new URL('../../modules/hair-face-tracking/ios/HairFaceTrackingModule.swift', import.meta.url),
    'utf8',
  );
}

/** One function's body, from its `func` line to the end of the file. */
function swiftFrom(marker: string): string {
  const swift = moduleSwift();
  const from = swift.indexOf(marker);
  assert.ok(from > 0, `${marker} is there to read`);
  return swift.slice(from);
}

/** Source with its `///` and `//` lines dropped, so prose cannot satisfy a check. */
function withoutComments(swift: string): string {
  return swift
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

test('the native sampler writes no file and keeps no picture', () => {
  const body = swiftFrom('func sampleFrame(');
  assert.ok(!body.includes('data.write(to:'), 'a live sample is not a photograph on disk');
  assert.ok(!body.includes('jpegRepresentation'), 'and it is not encoded either');
  assert.ok(body.includes('samplingNow'), 'a sample already in flight is refused rather than queued');
});

test('nothing in the native module is force-unwrapped', () => {
  // A crash in here takes the scan down mid-turn, on somebody's phone,
  // with the camera open. There is no honest way to recover from one, so
  // the rule is that there is nothing to recover from: every optional is
  // a `guard let`, and `promise.reject` is the failure. Checked over the
  // code rather than the comments, because a `///` line is allowed to
  // write `try!` while explaining why it is not used.
  const code = withoutComments(moduleSwift());
  for (const unsafe of ['try!', 'as!', ')!', ']!', '!.', '! .']) {
    assert.ok(!code.includes(unsafe), `HairFaceTrackingModule.swift force-unwraps: ${unsafe}`);
  }
  // `foo!` on a plain identifier, which the list above cannot see.
  assert.equal(
    /[A-Za-z0-9_]!(?![=~])/.exec(code),
    null,
    'an identifier is force-unwrapped somewhere in the module',
  );
});

test('the sample holds a slot of the AR capture pool, so it does not run below the photograph', () => {
  // `CIImage(cvPixelBuffer:)` retains one slot of the session's capture
  // pool until the render finishes with it, and the render is on the
  // sampling queue — so that queue is holding something ARKit needs,
  // about three times a second, for the whole scan. At the lowest
  // priority in the file that is a priority inversion waiting for a
  // thermally throttled phone, and the symptom is the face tracker
  // stuttering. Both queues that hold a pool slot run in the same band.
  const code = withoutComments(moduleSwift());
  const sampling = /label: "app\.tress\.hair-face-tracking\.sample",?\s*\n?\s*qos: \.(\w+)/.exec(
    code,
  );
  assert.ok(sampling, 'the sampling queue names its own priority');
  assert.equal(sampling[1], 'userInitiated');
  const capture = /label: "app\.tress\.hair-face-tracking\.capture", qos: \.(\w+)/.exec(code);
  assert.ok(capture, 'and so does the capture queue');
  assert.equal(capture[1], 'userInitiated');
});

/* ------------------------- into the app's tracker ---------------------- */

const view = { width: 390, height: 844 };

test('a frame is scaled into the preview’s own points', () => {
  const raw = toRawFace(frame({ cx: 0.5, cy: 0.4, width: 0.6, height: 0.5 }), view);
  assert.ok(raw);
  assert.equal(raw.cx, 195);
  assert.equal(raw.cy, 337.6);
  assert.equal(raw.width, 234);
  assert.equal(raw.height, 422);
});

test('a converted frame says it came from ARKit, which is what turns the smoothing down', () => {
  const raw = toRawFace(frame(), view);
  assert.equal(raw?.source, 'arkit');
});

test('the angles pass through untouched — they are already in ML Kit’s convention', () => {
  const raw = toRawFace(frame({ yaw: -23.5, pitch: -18, roll: 4.25 }), view);
  assert.equal(raw?.yaw, -23.5);
  assert.equal(raw?.pitch, -18);
  assert.equal(raw?.roll, 4.25);
});

test('the mesh crosses over whole, in the order it arrived', () => {
  const points: number[] = [];
  const facing: number[] = [];
  for (let slot = 0; slot < POINT_COUNT; slot += 1) {
    points.push(slot / 100, 1 - slot / 100);
    facing.push(slot < RING_POINTS ? 1 : -1);
  }
  const raw = toRawFace(frame({ points, facing }), view);
  assert.deepEqual(raw?.mesh?.points, points);
  assert.deepEqual(raw?.mesh?.facing, facing);
  // A copy, so a later frame reusing its arrays cannot rewrite this one.
  assert.notEqual(raw?.mesh?.points, points);
});

test('a pose with no geometry converts to a pose, not to a broken mesh', () => {
  const raw = toRawFace(frame({ points: [], facing: [] }), view);
  assert.ok(raw);
  assert.equal(raw.mesh, undefined);
  assert.equal('mesh' in raw, false, 'an absent mesh is absent, not undefined-valued');
});

test('a half-sent mesh is refused rather than drawn with holes', () => {
  const raw = toRawFace(frame({ points: [0.1, 0.2, 0.3, 0.4], facing: [1, 1] }), view);
  assert.equal(raw?.mesh, undefined);
});

test('a held frame converts exactly like a tracked one', () => {
  const tracked = toRawFace(frame({ tracking: true }), view);
  const held = toRawFace(frame({ tracking: false }), view);
  assert.deepEqual(held, tracked, 'the crown stage runs on held poses');
});

test('a view with no size yet gives nothing rather than a face in the corner', () => {
  assert.equal(toRawFace(frame(), { width: 0, height: 844 }), null);
  assert.equal(toRawFace(frame(), { width: 390, height: 0 }), null);
  assert.equal(toRawFace(frame(), { width: Number.NaN, height: 844 }), null);
});

test('what the adapter returns is what the scan’s tracker takes', () => {
  // The assignment is the test: if `RawFace` or `ArkitRawFace` ever drift,
  // this file stops compiling and `npx tsc --noEmit` says so.
  const raw = toRawFace(frame(), view);
  assert.ok(raw);
  const asTracked: RawFace = raw;
  assert.equal(asTracked.source, 'arkit');

  const tracked = trackFrame(createTracker(), asTracked, asTracked.at);
  assert.ok(tracked.face, 'the tracker accepts an ARKit frame');
  assert.equal(tracked.face.source, 'arkit');
  assert.equal(tracked.face.hasMesh, true, 'an ARKit frame carries a real 3D mesh');
  // The box came over in preview points, so the face lands where it was
  // seen rather than in a corner.
  assert.ok(tracked.face.cx > 1 && tracked.face.cx < view.width);
  assert.ok(tracked.face.cy > 1 && tracked.face.cy < view.height);
});

test('a pose-only ARKit frame reaches the tracker without a mesh', () => {
  const raw = toRawFace(frame({ points: [], facing: [] }), view);
  assert.ok(raw);
  const tracked = trackFrame(createTracker(), raw, raw.at);
  assert.equal(tracked.face?.hasMesh, false);
});

test('a run of held frames keeps the face alive for the crown stage', () => {
  // What the crown stage actually depends on: the head goes down, ARKit
  // stops tracking, the native side keeps sending the last pose, and the
  // tracker still has a face a second later.
  let state = trackFrame(createTracker(), toRawFace(frame({ pitch: -24 }), view) as RawFace);
  const start = frame().at;
  for (let step = 1; step * 100 <= COAST_MS; step += 1) {
    const at = start + step * 100;
    const held = toRawFace(frame({ pitch: -24, tracking: false, at }), view);
    assert.ok(held);
    state = trackFrame(state, held, at);
  }
  assert.ok(state.face, 'the face survives the whole coast');
  assert.equal(state.face.source, 'arkit');
});
