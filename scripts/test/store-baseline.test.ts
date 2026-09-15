/**
 * The baseline is one photograph until it is five, and the rule for how
 * it gets there is not something a screenshot can check: the wrong
 * outcome — a "Day 1" set beside a one-photograph baseline — looks like
 * a perfectly good journey. These pin the rule the store applies.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addMissingAngles,
  ANGLES,
  missingAngles,
  patchPhotoIn,
  sessionToExtend,
  type Angle,
  type Photo,
  type PhotoSession,
} from '@/types/domain';

/* ------------------------------ fixtures ------------------------------- */

function photo(sessionId: string, angle: Angle, id = `${sessionId}_${angle}`): Photo {
  return {
    id,
    sessionId,
    angle,
    uri: `file:///${id}.jpg`,
    width: 900,
    height: 1200,
    capturedAt: '2026-09-01T09:00:00.000Z',
  };
}

function session(
  id: string,
  angles: readonly Angle[],
  overrides: Partial<PhotoSession> = {},
): PhotoSession {
  return {
    id,
    journeyId: 'j1',
    capturedAt: '2026-09-01T09:00:00.000Z',
    isBaseline: false,
    photos: angles.map((a) => photo(id, a)),
    ...overrides,
  };
}

/** The funnel's scan: one front photograph, flagged as the baseline. */
const scan = session('base', ['front'], { isBaseline: true });

/* --------------------------- missing angles ---------------------------- */

test('missingAngles: lists the angles a session lacks, in capture order', () => {
  assert.deepEqual(missingAngles(scan), ['top', 'leftTemple', 'rightTemple', 'crown']);
  assert.deepEqual(missingAngles(session('s', ANGLES)), []);
  assert.deepEqual(missingAngles(session('s', [])), [...ANGLES]);
});

test('missingAngles: counts angles, not photographs', () => {
  // Two shots of the same angle still leave four angles missing.
  const doubled = session('s', ['front'], {
    photos: [photo('s', 'front', 'a'), photo('s', 'front', 'b')],
  });
  assert.equal(missingAngles(doubled).length, 4);
});

/* -------------------------- when to extend ----------------------------- */

test('sessionToExtend: the one-photograph baseline, when it is the only session', () => {
  assert.equal(sessionToExtend([scan]), scan);
});

test('sessionToExtend: nothing once the baseline holds all five', () => {
  const full = session('base', ANGLES, { isBaseline: true });
  assert.equal(sessionToExtend([full]), null);
});

test('sessionToExtend: nothing once a second session exists', () => {
  // The baseline is what it was; anything captured now is an update.
  const later = session('day30', ANGLES);
  assert.equal(sessionToExtend([later, scan]), null);
  // Even when the newest session is itself short of angles.
  const partial = session('day30', ['front', 'crown']);
  assert.equal(sessionToExtend([partial, scan]), null);
});

test('sessionToExtend: nothing with no sessions, or a lone non-baseline', () => {
  assert.equal(sessionToExtend([]), null);
  // The baseline was deleted; the survivor is not a baseline to complete.
  assert.equal(sessionToExtend([session('day30', ['front'])]), null);
});

test('sessionToExtend: an explicit id is honoured only for the session the rule names', () => {
  assert.equal(sessionToExtend([scan], 'base'), scan);
  // A stale id falls back to a plain capture, never to a different session.
  assert.equal(sessionToExtend([scan], 'gone'), null);
  const full = session('base', ANGLES, { isBaseline: true });
  assert.equal(sessionToExtend([full], 'base'), null);
});

/* ---------------------------- extending -------------------------------- */

test('addMissingAngles: appends the missing angles after the original photographs', () => {
  const set = (['top', 'leftTemple', 'rightTemple', 'crown'] as const).map((a) =>
    photo('base', a, `new_${a}`),
  );
  const extended = addMissingAngles(scan, set);

  assert.equal(extended.photos.length, 5);
  assert.deepEqual(
    extended.photos.map((p) => p.angle),
    ['front', 'top', 'leftTemple', 'rightTemple', 'crown'],
  );
  assert.deepEqual(missingAngles(extended), []);
  // The measured front photograph is untouched, and so is the date the
  // baseline began.
  assert.equal(extended.photos[0], scan.photos[0]);
  assert.equal(extended.capturedAt, scan.capturedAt);
  assert.equal(extended.isBaseline, true);
});

test('addMissingAngles: never replaces an angle the session already holds', () => {
  const retake = photo('base', 'front', 'front_again');
  const extended = addMissingAngles(scan, [retake, photo('base', 'crown', 'new_crown')]);

  assert.equal(extended.photos.length, 2);
  assert.equal(extended.photos[0].id, 'base_front');
  assert.equal(extended.photos[1].id, 'new_crown');
});

test('addMissingAngles: one photograph per angle, first one wins', () => {
  const extended = addMissingAngles(scan, [
    photo('base', 'crown', 'crown_1'),
    photo('base', 'crown', 'crown_2'),
  ]);
  assert.deepEqual(
    extended.photos.map((p) => p.id),
    ['base_front', 'crown_1'],
  );
});

test('addMissingAngles: nothing to add returns the same session', () => {
  assert.equal(addMissingAngles(scan, []), scan);
  assert.equal(addMissingAngles(scan, [photo('base', 'front', 'x')]), scan);
});

test('addMissingAngles: does not touch the original', () => {
  const before = scan.photos.length;
  addMissingAngles(scan, [photo('base', 'crown', 'c')]);
  assert.equal(scan.photos.length, before);
});

/* -------------------------- late readings ------------------------------ */

test('patchPhotoIn: lands a reading on exactly one photograph', () => {
  const full = session('base', ANGLES, { isBaseline: true });
  const later = session('day30', ANGLES);
  const coverage = {
    fraction: 0.31,
    upperFraction: 0.4,
    verticalBalance: 0.55,
    pixels: 12000,
  };

  const next = patchPhotoIn([later, full], 'base', 'base_crown', { coverage });

  const patched = next[1].photos.find((p) => p.id === 'base_crown');
  assert.deepEqual(patched?.coverage, coverage);
  // Everything else is left alone: same object, not an equal copy.
  assert.equal(next[0], later);
  assert.equal(next[1].photos.find((p) => p.id === 'base_front'), full.photos[4]);
  assert.equal(patched?.uri, 'file:///base_crown.jpg');
});

test('patchPhotoIn: a reading for a photograph that is gone changes nothing', () => {
  const sessions = [session('base', ANGLES, { isBaseline: true })];
  const coverage = { fraction: 0.2, upperFraction: 0.2, verticalBalance: 0.5, pixels: 900 };

  // The session was deleted before the segmenter finished.
  assert.equal(patchPhotoIn(sessions, 'deleted', 'base_crown', { coverage }), sessions);
  // Or the photograph id is not one this session holds.
  assert.equal(patchPhotoIn(sessions, 'base', 'nope', { coverage }), sessions);
});
