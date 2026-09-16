/**
 * Which photograph the guide holds up behind the preview.
 *
 * Every wrong answer here looks plausible on screen — a faint head is a
 * faint head — and only one of them is the person's actual last shot of
 * that angle. So the rule is pinned rather than eyeballed: newest first,
 * the session being extended skipped, and nothing invented when there is
 * no earlier photograph to show.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { previousPhotoForAngle } from '@/features/capture/previous-photo';
import type { Angle, Photo, PhotoSession } from '@/types/domain';

/* ------------------------------ fixtures ------------------------------- */

function photo(sessionId: string, angle: Angle): Photo {
  const id = `${sessionId}_${angle}`;
  return {
    id,
    sessionId,
    angle,
    uri: `file:///${id}.jpg`,
    width: 900,
    height: 1200,
    capturedAt: '2026-01-01T09:00:00.000Z',
  };
}

function session(id: string, angles: Angle[]): PhotoSession {
  return {
    id,
    journeyId: 'j1',
    capturedAt: '2026-01-01T09:00:00.000Z',
    isBaseline: id === 'oldest',
    photos: angles.map((a) => photo(id, a)),
  };
}

/** Newest first, the order the store keeps them in. */
const sessions: PhotoSession[] = [
  session('newest', ['front', 'crown']),
  session('middle', ['front', 'top']),
  session('oldest', ['front', 'crown', 'top']),
];

/* -------------------------------- tests -------------------------------- */

test('takes the angle from the newest session that holds it', () => {
  assert.equal(previousPhotoForAngle(sessions, 'front')?.sessionId, 'newest');
  // 'top' is missing from the newest session, so it falls through.
  assert.equal(previousPhotoForAngle(sessions, 'top')?.sessionId, 'middle');
});

test('skips the session being extended, even when it is the newest', () => {
  assert.equal(previousPhotoForAngle(sessions, 'front', 'newest')?.sessionId, 'middle');
  assert.equal(previousPhotoForAngle(sessions, 'crown', 'newest')?.sessionId, 'oldest');
});

test('returns null when no session holds that angle', () => {
  assert.equal(previousPhotoForAngle(sessions, 'leftTemple'), null);
});

test('returns null for an empty history', () => {
  assert.equal(previousPhotoForAngle([], 'front'), null);
});
