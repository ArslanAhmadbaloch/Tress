/**
 * The Plus button's two doors, checked without a phone.
 *
 * Three things are worth holding to here, and none of them needs a
 * camera:
 *
 *   1. What a plain photograph *is* once it lands. `plainPhotoRecord` is
 *      pure, so the record's shape — and, far more importantly, the
 *      fields it deliberately leaves absent — can be asserted directly.
 *      Every absent field means "not measured", and this camera measures
 *      nothing; a day when one of them starts arriving is a day this
 *      screen has quietly started claiming a reading.
 *
 *   2. What the two screens say. The honesty sweep reads the whole
 *      vocabulary through `photoCopySentences()`, exactly as the
 *      scanner's copy is read.
 *
 *   3. That the plain camera is still plain. The screens themselves
 *      import Reanimated, expo-camera and SVG and can only be watched on
 *      a device; what can be held to is their source — that `photo.tsx`
 *      reaches for no tracker, no segmenter and no analysis, that both
 *      doors are wired, and that the centre "+" opens the chooser rather
 *      than one of the doors behind it.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { PHOTO_COPY, photoCopySentences } from '@/features/photo/copy';
import {
  PhotoFailure,
  asCaptureFailure,
  isPhotoFailure,
  photoFailureKind,
} from '@/features/photo/failure';
import {
  PLAIN_PHOTO_ANGLE,
  PLAIN_PHOTO_ANGLES,
  plainPhotoAngle,
  plainPhotoKey,
  plainPhotoRecord,
} from '@/features/photo/session';
import { ANGLES, ANGLE_LABELS, isScanSession, missingAngles } from '@/types/domain';

import { assertHonest } from './honesty-words';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

const PHOTO_SCREEN = read('src/app/photo.tsx');
const CHOOSER_SCREEN = read('src/app/new.tsx');
const TAB_BAR = read('src/components/tab-bar.tsx');

const FILE = {
  uri: 'file:///documents/photos/pab12_front.jpg',
  thumbnailUri: 'file:///documents/photos/pab12_front_thumb.jpg',
  width: 1440,
  height: 1920,
};

/* ------------------------------ the record ------------------------------ */

test('a plain photograph is an ordinary journal photograph', () => {
  const photo = plainPhotoRecord(FILE, '2026-02-01T09:00:00.000Z');

  assert.equal(photo.uri, FILE.uri);
  assert.equal(photo.thumbnailUri, FILE.thumbnailUri);
  assert.equal(photo.width, FILE.width);
  assert.equal(photo.height, FILE.height);
  assert.equal(photo.capturedAt, '2026-02-01T09:00:00.000Z');
  assert.ok(ANGLES.includes(photo.angle), 'filed under an angle the journal knows');
  assert.equal(photo.angle, PLAIN_PHOTO_ANGLE);
});

test('the slot a plain photograph is filed under follows the lens that took it', () => {
  // The journal captions every slot, so a picture taken with the rear
  // lens must not land in the slot captioned "Hairline".
  assert.equal(plainPhotoAngle('front'), 'front');
  assert.equal(plainPhotoAngle('back'), 'crown');
  assert.notEqual(plainPhotoAngle('front'), plainPhotoAngle('back'));
  for (const angle of Object.values(PLAIN_PHOTO_ANGLES)) {
    assert.ok(ANGLES.includes(angle), 'no sixth slot is invented');
  }
});

test('the screen says which slot it will file into, in the journal\'s own words', () => {
  // If these ever drift apart the screen promises one caption and the
  // journal shows another.
  assert.ok(PHOTO_COPY.camera.filedFront.endsWith(ANGLE_LABELS[plainPhotoAngle('front')]));
  assert.ok(PHOTO_COPY.camera.filedBack.endsWith(ANGLE_LABELS[plainPhotoAngle('back')]));
});

test('a rear-lens photograph is filed under the slot the rear lens means', () => {
  const photo = plainPhotoRecord(FILE, '2026-02-01T09:00:00.000Z', plainPhotoAngle('back'));
  assert.equal(photo.angle, 'crown');
  assert.equal(ANGLE_LABELS[photo.angle], 'Back');
});

test('a plain photograph is marked as taken by hand, not by the scan', () => {
  const photo = plainPhotoRecord(FILE, '2026-02-01T09:00:00.000Z');
  assert.equal(photo.capture, 'manual');
  assert.notEqual(photo.capture, 'scan');
});

test('a plain photograph carries no reading, because nothing read it', () => {
  const photo = plainPhotoRecord(FILE, '2026-02-01T09:00:00.000Z') as Record<string, unknown>;

  // Every one of these means "this was measured on this device".
  for (const field of ['quality', 'coverage', 'maskTrace', 'regions', 'pose']) {
    assert.ok(!(field in photo), `a plain photograph must not carry ${field}`);
  }
});

test('a session of one plain photograph is never read as a scan', () => {
  const photos = [plainPhotoRecord(FILE, '2026-02-01T09:00:00.000Z')];
  assert.equal(isScanSession({ photos: photos.map((p) => ({ ...p, id: 'p1', sessionId: 's1' })) }), false);
});

test('a plain session reports the angles it does not hold, rather than implying it holds them', () => {
  const photos = [plainPhotoRecord(FILE, '2026-02-01T09:00:00.000Z')].map((p) => ({
    ...p,
    id: 'p1',
    sessionId: 's1',
  }));
  const missing = missingAngles({ photos });

  assert.equal(missing.includes(PLAIN_PHOTO_ANGLE), false);
  assert.equal(missing.length, ANGLES.length - 1);
});

test('two shots in the same millisecond-free moment get their own file stems', () => {
  assert.notEqual(plainPhotoKey(1), plainPhotoKey(2));
  assert.equal(plainPhotoKey(1), plainPhotoKey(1));
  assert.ok(/^p[0-9a-z]+$/.test(plainPhotoKey(Date.now())), 'a safe filename stem');
});

/* -------------------------------- the copy ------------------------------- */

test('copy: nothing the chooser or the plain camera says describes hair', () => {
  assertHonest(assert, photoCopySentences(), 'photo copy');
});

test('copy: every sentence is a real sentence', () => {
  for (const line of photoCopySentences()) {
    assert.ok(line.trim().length > 0, 'an empty string is not copy');
    assert.equal(line, line.trim(), `"${line}" has loose whitespace`);
  }
});

test('copy: the two doors say what the owner asked them to say', () => {
  assert.equal(
    PHOTO_COPY.chooser.scan.description,
    'A guided scan that reads your hairline, temples and crown',
  );
  assert.equal(
    PHOTO_COPY.chooser.photo.description,
    'Just take a picture and keep it with the others',
  );
});

test('copy: the plain camera never claims anything was read', () => {
  const camera = [
    ...Object.values(PHOTO_COPY.camera),
    ...Object.values(PHOTO_COPY.error),
    PHOTO_COPY.privacy,
  ];
  for (const line of camera) {
    for (const word of ['scan', 'analys', 'measur', 'read', 'assess', 'detect']) {
      assert.ok(
        !line.toLowerCase().includes(word),
        `the plain camera must not say "${word}": ${line}`,
      );
    }
  }
});

test('copy: a refusal is not a dead end', () => {
  assert.ok(PHOTO_COPY.permission.denied.includes('Settings'));
  assert.ok(PHOTO_COPY.permission.openSettings.length > 0);
  assert.ok(PHOTO_COPY.permission.close.length > 0, 'and a way out that is not Settings');
});

/* ------------------------------ the failures ----------------------------- */

test('a failure carries its kind rather than leaving it to be guessed from a message', () => {
  assert.equal(photoFailureKind(new PhotoFailure('capture')), 'capture');
  assert.equal(photoFailureKind(new PhotoFailure('noJourney')), 'noJourney');
  assert.equal(photoFailureKind(new PhotoFailure('save')), 'save');
});

test('a camera that fails for its own reasons is still reported as a camera failure', () => {
  // The two real ones: expo-camera rejecting because the sensor is not
  // ready, and the simulator's stand-in before its frame has decoded.
  // Both used to be read as "that photo could not be saved".
  for (const raw of [
    new Error('Camera is not ready yet. Wait for camera to become available.'),
    new Error('Sample frame not loaded'),
    'a string nobody expected',
  ]) {
    assert.equal(photoFailureKind(asCaptureFailure(raw)), 'capture');
  }
});

test('a failure that is already tagged is not retagged on the way out of the camera', () => {
  const tagged = new PhotoFailure('noJourney');
  assert.equal(asCaptureFailure(tagged), tagged);
});

test('anything untagged is read as a failure of the file work', () => {
  for (const raw of [new Error('capture'), new Error(''), undefined, null, { kind: 'nonsense' }]) {
    assert.equal(photoFailureKind(raw), 'save');
    assert.equal(isPhotoFailure(raw), false);
  }
});

test('every kind of failure has a sentence, and the screen picks it by kind', () => {
  for (const kind of ['capture', 'save', 'noJourney'] as const) {
    const line: string = PHOTO_COPY.error[kind];
    assert.ok(line.trim().length > 0, `${kind} needs a sentence`);
  }
  assert.ok(
    PHOTO_SCREEN.includes('photoFailureKind'),
    'the screen classifies by the tag, never by comparing error.message',
  );
  assert.ok(
    !/error\.message\s*===/.test(PHOTO_SCREEN),
    'string equality on an error message is how the wrong sentence gets shown',
  );
});

test('the shutter is latched by a ref, not by state a render has not happened yet', () => {
  /*
    `disabled={busy}` and a `phase` check are both state, and state is
    read as of the last render. Two activations inside one frame — a
    double tap, or VoiceOver activating twice — would both pass and both
    write a session, leaving the person with two updates for one press.
    The scanner latches its shutter with a ref; so does this.
  */
  assert.ok(
    /if \(shooting\.current\) return;\s*\n\s*shooting\.current = true;/.test(PHOTO_SCREEN),
    'the shutter must latch on a ref before anything else happens',
  );
  assert.ok(
    !/if \(phase === 'saving'\) return;/.test(PHOTO_SCREEN),
    'a state check is not a latch and must not be the only guard',
  );
  assert.ok(
    /shooting\.current = false;/.test(PHOTO_SCREEN),
    'the latch has to lift again on a failure, or the retry button does nothing',
  );
});

/* ------------------------------ the plumbing ----------------------------- */

test('the plain camera imports no tracker, no segmenter and no analysis', () => {
  const forbidden = [
    'hair-face-tracking',
    'react-native-vision-camera',
    'react-native-fast-tflite',
    '@/features/hair-scan/tracking',
    '@/features/hair-scan/result',
    '@/features/hair-scan/report-model',
    '@/features/hair-scan/engine',
    '@/components/hair-scan/scanner-camera',
    '@/components/hair-scan/hair-mesh',
    '@/components/hair-scan/processing',
  ];
  for (const module of forbidden) {
    assert.ok(
      !PHOTO_SCREEN.includes(module),
      `src/app/photo.tsx must not reach for ${module}`,
    );
  }
});

test('the plain camera writes through the same storage every photograph uses', () => {
  for (const call of ['shrinkCapture', 'persistCapture', 'deletePhotoFiles', 'addSession']) {
    assert.ok(PHOTO_SCREEN.includes(call), `src/app/photo.tsx should use ${call}`);
  }
  assert.ok(
    PHOTO_SCREEN.includes('plainPhotoRecord'),
    'the record comes from the pure builder, not from an object literal on the screen',
  );
});

test('the plain camera works where there is no sensor', () => {
  assert.ok(PHOTO_SCREEN.includes('sampleCameraActive'), 'the simulator path is chosen explicitly');
  assert.ok(PHOTO_SCREEN.includes('SampleCamera'), 'and it mounts the bundled stand-in');
});

test('the plain camera handles a refusal rather than opening a dead camera', () => {
  assert.ok(PHOTO_SCREEN.includes('useCameraPermissions'));
  assert.ok(PHOTO_SCREEN.includes('canAskAgain'), '"never ask again" is its own state');
  assert.ok(PHOTO_SCREEN.includes('openSettings'), 'with the only route that still works');
});

test('a failed capture becomes a state the screen draws', () => {
  assert.ok(PHOTO_SCREEN.includes("'error'"), 'failure is a phase');
  assert.ok(PHOTO_SCREEN.includes('PHOTO_COPY.error.'), 'with a sentence somebody can read');
});

test('the chooser offers both doors and hands the stack over to them', () => {
  assert.ok(CHOOSER_SCREEN.includes("router.replace('/hair-scan')"));
  assert.ok(CHOOSER_SCREEN.includes("router.replace('/photo')"));
  assert.ok(
    !CHOOSER_SCREEN.includes("router.push('/hair-scan')"),
    'a chooser left under the scanner is a chooser the report would strand you on',
  );
});

test('the chooser respects reduced motion', () => {
  assert.ok(CHOOSER_SCREEN.includes('useReducedMotion'));
  assert.ok(
    /reduceMotion\s*\?\s*undefined/.test(CHOOSER_SCREEN),
    'the entrance is removed rather than shortened',
  );
});

test('the chooser can be scrolled, so a fixed sheet height cannot hide the way out', () => {
  assert.ok(CHOOSER_SCREEN.includes('ScrollView'), 'Text does not cap Dynamic Type');
  // The way out is the round close button under the two cards; what
  // matters is that it scrolls with them rather than sitting outside.
  assert.ok(
    CHOOSER_SCREEN.indexOf('ScrollView') < CHOOSER_SCREEN.lastIndexOf('copy.close'),
    'the close control is inside it',
  );
});

test('the centre "+" opens the chooser, not one of the doors behind it', () => {
  assert.ok(TAB_BAR.includes("router.push('/new')"));
  assert.ok(
    !TAB_BAR.includes("router.push('/hair-scan')"),
    'the tab bar no longer goes straight to the scanner',
  );
});
