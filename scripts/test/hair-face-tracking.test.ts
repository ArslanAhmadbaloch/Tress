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

/* ------------------------------ handedness ----------------------------- */

/*
  Which way round the pictures are. This module is one end of a convention
  the whole scan is built on: the preview is mirrored, so the mesh is in
  mirrored fractions, so the rectangles measured on that mesh are laid onto
  a still that has to be mirrored the same way — and `region-crops.ts` cuts
  `leftTemple` from the image-LEFT of the still while `measure/regions.ts`
  gives `leftTemple` a negative u, which is image-left too. Both because of
  one expression in the Swift.

  A HALF-FLIP IS THE FAILURE. Un-mirroring the still and leaving the mesh
  alone, or flipping one of `capture()` / `sampleFrame()` and not the other,
  swaps the sides of the record with no error anywhere — and on a symmetric
  head it looks perfectly right while it does it.

  So what is held here is NOT "there is one mirroring". There are FOUR, in
  three files, and an earlier version of this test asserted the opposite by
  looking only at the file that happens to contain none of them:

    1  HairFaceTrackingView.swift  `mirrorTransform`, scaleX: -1   the preview
    2  HairFaceTrackingView.swift  `1 - projected.x / width`  ×2    the points
    3  HairFaceGeometry.swift      `yaw: -yawEye`, roll's sense     the angles
    4  HairFaceTrackingView.swift  `captureOrientation`, …Mirrored  still+sample

  What is held is that the count and the sites do not drift. A flip added,
  moved or deleted in any of the three files fails here, which is the only
  signal a laptop can give about a difference no screenshot would show.
  `atan2(-dx, dy)` in HairFaceOutline.init is deliberately NOT on the list:
  it is the ring's clockwise ordering in anchor space, not a flip of the
  image. Changing the convention means changing this test, the README's
  Handedness section and the app files it lists, in one commit.
*/

/** The view, as text: it holds three of the module's four flips. */
function viewSwift(): string {
  return readFileSync(
    new URL('../../modules/hair-face-tracking/ios/HairFaceTrackingView.swift', import.meta.url),
    'utf8',
  );
}

/** The geometry, as text: it holds the fourth, on the angles. */
function geometrySwift(): string {
  return readFileSync(
    new URL('../../modules/hair-face-tracking/ios/HairFaceGeometry.swift', import.meta.url),
    'utf8',
  );
}

/** Every horizontal flip the module applies, wherever it lives. */
function horizontalFlips(swift: string): string[] {
  const code = withoutComments(swift);
  return [
    ...[...code.matchAll(/CGAffineTransform\(\s*scaleX:\s*-[^)]*\)/g)].map((m) => m[0]),
    ...[...code.matchAll(/1 - Double\(projected\.x\)[^\n]*/g)].map((m) => m[0]),
    ...[...code.matchAll(/yaw: -\w+/g)].map((m) => m[0]),
  ];
}

test("every orientation the still can take is the preview's, both ways round", () => {
  // Not "every orientation is a mirrored one" any more. The still has to
  // agree with the PREVIEW, and the preview is `mirrorPreview`'s to say,
  // so what is checked is that each of the four ways of holding the phone
  // offers both answers and picks between them with that one flag. A
  // branch that returns the same orientation either way, or that reads
  // something else, is a still that can disagree with the screen.
  const code = withoutComments(viewSwift());
  const body = /var captureOrientation: CGImagePropertyOrientation \{([\s\S]*?)\n  \}/.exec(code);
  assert.ok(body, 'the view names the orientation the capture is taken at');
  assert.match(
    body[1],
    /let mirrored = HairFaceTrackingView\.mirrorPreview/,
    'the table reads the one flag rather than deciding for itself',
  );
  const branches = [...body[1].matchAll(/return mirrored \? \.(\w+) : \.(\w+)/g)];
  assert.equal(branches.length, 4, 'one branch per way of holding the phone');
  for (const [, mirrored, plain] of branches) {
    assert.match(mirrored, /Mirrored$/, `.${mirrored} is not a mirrored orientation`);
    assert.equal(/Mirrored$/.test(plain), false, `.${plain} is mirrored on the un-mirrored side`);
  }
});

test('the still and the live sample take their handedness from the same one place', () => {
  const code = withoutComments(moduleSwift());
  const oriented = [...code.matchAll(/\.oriented\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.deepEqual(
    oriented,
    ['view.captureOrientation', 'view.captureOrientation'],
    'the photograph and the sample are turned by the view, and by nothing else',
  );
});

test('nothing hard-codes the flip: every site that can reverse the image reads the one flag', () => {
  // This used to count flips. Counting was the right idea against the
  // wrong shape: the flips were literals scattered across three files, so
  // the only defence was to know how many there should be. They are now
  // derived from `mirrorPreview`, so what is checked is that no literal
  // has crept back in beside them — a single hard-coded reflection is a
  // half-flip, invisible on a symmetric head and invisible in a
  // screenshot, which is why it is checked rather than reviewed.
  const view = withoutComments(viewSwift());

  assert.match(
    view,
    /static let mirrorPreview = (true|false)/,
    'the view still carries the one flag the rest of the app is checked against',
  );

  // The preview's transform and the reported x are the two places the
  // view can reverse the image, and both are behind the flag.
  assert.match(
    view,
    /mirrorPreview \? CGAffineTransform\(scaleX: -1, y: 1\) : \.identity/,
    'the preview transform is chosen by the flag',
  );
  assert.match(
    view,
    /return mirrorPreview \? 1 - fraction : fraction/,
    'the reported x is chosen by the flag',
  );
  assert.equal(
    horizontalFlips(view).length,
    1,
    'a reflection in the view outside the two the flag chooses between',
  );

  // The geometry may reverse exactly one rotation, and only through the
  // flag. Yaw is not a screen quantity and must stay put; see the note on
  // `degrees(faceInEye:)`.
  const geometry = withoutComments(geometrySwift());
  assert.match(
    geometry,
    /let rollSign: Float = HairFaceTrackingView\.mirrorPreview \? -1 : 1/,
    'roll takes its sign from the flag',
  );
  assert.match(
    geometry,
    /yaw: yawEye/,
    "yaw is negated again: ARKit's view matrix already carries the front camera's flip",
  );
  assert.equal(
    /yaw: -yawEye/.test(geometry),
    false,
    'the negation that made a head turning right satisfy the left step is back',
  );
  assert.match(geometry, /pitch: pitchEye/, 'pitch is never flipped: a mirror leaves its axis alone');
  assert.equal(
    /roll: -rollEye/.test(geometry),
    false,
    'roll is hard-coded again instead of following the preview',
  );

  // The module turns the still with the view's orientation and nothing else.
  assert.deepEqual(
    horizontalFlips(moduleSwift()),
    [],
    'the module file itself flips nothing: the still is turned only by captureOrientation',
  );
  assert.equal(
    /Mirrored/.test(withoutComments(moduleSwift())),
    false,
    'the module names no orientation of its own; it asks the view',
  );

  // In the view the only mirrored orientations are captureOrientation's
  // four cases, one per way of holding the phone.
  assert.equal(
    [...view.matchAll(/Mirrored/g)].length,
    4,
    'a mirrored orientation outside the four captureOrientation cases',
  );
});

test('the picture path scales but never reflects', () => {
  // Every other transform on the way to a JPEG is a fit, not a flip: a
  // negative scale in either axis there would reflect the still away from
  // the preview it is measured against.
  const code = withoutComments(moduleSwift());
  assert.equal(/\.transformed\(by:\s*\.identity/.test(code), false, 'an identity that is not');
  const scales = [...code.matchAll(/CGAffineTransform\(\s*scaleX:([^,]*),\s*y:([^)]*)\)/g)];
  assert.ok(scales.length > 0, 'the sample square is still scaled to fit');
  for (const scale of scales) {
    assert.equal(scale[1].includes('-'), false, `a negative x scale: ${scale[0]}`);
    assert.equal(scale[2].includes('-'), false, `a negative y scale: ${scale[0]}`);
  }
});

test('the module writes the convention down, because a wrong guess costs a phase', () => {
  const readme = readFileSync(
    new URL('../../modules/hair-face-tracking/README.md', import.meta.url),
    'utf8',
  );
  assert.match(readme, /^## Handedness$/m, 'the README has a section on which way round it all is');
  const from = readme.indexOf('## Handedness');
  const rest = readme.slice(from + 1);
  const next = rest.indexOf('\n## ');
  const section = next === -1 ? rest : rest.slice(0, next);

  for (const named of [
    // The module's own flips, by file and line. A section that leaves these
    // out sends the next reader to `captureOrientation` alone, which is
    // precisely the half-flip.
    'mirrorPreview',
    'FRAME_MIRRORED',
    'previewTransform',
    'screenX',
    'rollSign',
    'captureOrientation',
    // And the app files that read the still by image side.
    'handedness.ts',
    'region-crops.ts',
    'measure/regions.ts',
    'result.ts',
    'engine.ts',
    'scanner-camera.tsx',
    // The failure the whole section exists to prevent.
    'half-flip',
  ]) {
    assert.ok(section.includes(named), `the Handedness section names ${named}`);
  }

  // The claim this section was written to retract. It was false, it read as
  // an invitation to a one-line change, and it must not come back.
  assert.equal(
    /exactly one mirroring/.test(section),
    false,
    'the module does not have exactly one mirroring; it has four that agree',
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


/*
  The mirror reverses the image plane, so a head the camera sees leaning
  one way is drawn on screen leaning the other. Yaw was negated for that
  and roll was not, and the cap rode on a head tilted opposite to the face
  beneath it. Both live in one return in HairFaceGeometry.swift; this
  reads it rather than trusting the comment above it.
*/
test('the preview decides roll and only roll; yaw and pitch describe the head', () => {
  const swift = readFileSync(
    new URL('../../modules/hair-face-tracking/ios/HairFaceGeometry.swift', import.meta.url),
    'utf8',
  );
  const fn = swift.slice(swift.indexOf('static func degrees'));
  const returned = fn.slice(fn.indexOf('return ('));
  // Yaw is a fact about where the head is pointing, and the engine's step
  // targets, `REGION_OF_STEP` and `closestAngle` are all built on positive
  // meaning the head's own right. A flip of the picture must not touch it.
  assert.match(returned, /yaw:\s*yawEye/, "yaw is positive for the head's own right");
  assert.equal(
    /yaw:\s*-yawEye/.test(returned),
    false,
    "negated, a head turned to its own right reports the sign the LEFT step waits for",
  );
  assert.match(returned, /pitch:\s*pitchEye/, 'pitch turns about the one axis a flip leaves alone');
  // Roll is drawn on top of the preview, so its sign belongs to the preview.
  assert.match(returned, /roll:\s*rollSign \* rollEye/, 'roll takes its sign from the flag');
  assert.match(
    fn,
    /let rollSign: Float = HairFaceTrackingView\.mirrorPreview \? -1 : 1/,
    'and the flag is the view\'s one flag, not a second opinion',
  );
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
