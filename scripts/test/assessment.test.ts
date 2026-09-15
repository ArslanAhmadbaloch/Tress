/**
 * The report has to be right about the thing it is reporting on.
 *
 * Its whole claim to be worth reading is that every line is checkable
 * against the user's own files. A section that says "all five angles" when
 * one is missing, or scores a routine nobody has, is worse than no report
 * — so these cases sit exactly where the report is tempted to flatter.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildReport } from '@/features/assessment/engine';
import {
  ANGLES,
  EMPTY_DATA,
  SCHEMA_VERSION,
  type AppData,
  type Photo,
  type PhotoSession,
} from '@/types/domain';

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

function base(): AppData {
  return {
    ...EMPTY_DATA,
    schemaVersion: SCHEMA_VERSION,
    profile: { id: 'p1', displayName: 'Test', createdAt: daysAgo(200).toISOString() },
    journey: {
      id: 'j1',
      profileId: 'p1',
      startedAt: daysAgo(200).toISOString(),
      trackingAreas: ['crown'],
      motivations: [],
      goal: 'fullness',
      triggers: [],
      approaches: [],
      updateIntervalDays: 30,
      createdAt: daysAgo(200).toISOString(),
    },
  };
}

/** Attaches a measured problem to the first photo of a set. */
function withIssue(s: PhotoSession, issue: string): PhotoSession {
  return {
    ...s,
    photos: s.photos.map((p, i) =>
      i === 0
        ? { ...p, quality: { brightness: 30, contrast: 9, sharpness: 2, clipped: 0.4, issues: [issue] } }
        : { ...p, quality: { brightness: 120, contrast: 40, sharpness: 20, clipped: 0, issues: [] } },
    ),
  };
}

function session(id: string, dAgo: number, angles: readonly string[]): PhotoSession {
  return {
    id,
    journeyId: 'j1',
    capturedAt: daysAgo(dAgo).toISOString(),
    isBaseline: id === 's1',
    photos: angles.map((angle, i) => ({
      id: `${id}_${i}`,
      sessionId: id,
      angle,
      uri: `file://${id}_${i}.jpg`,
      width: 1000,
      height: 1000,
      capturedAt: daysAgo(dAgo).toISOString(),
    })) as Photo[],
  };
}

test('report: an empty journey says so instead of scoring nothing', () => {
  const r = buildReport(base());
  assert.equal(r.ready, false);
  const record = r.sections.find((s) => s.kind === 'record')!;
  assert.equal(record.score, null, 'no photographs means no score, not zero');
  assert.match(r.nextStep, /baseline/i);
});

test('report: a missing angle is named, not averaged away', () => {
  const data = { ...base(), sessions: [session('s1', 60, ['top', 'front', 'crown'])] };
  const record = buildReport(data).sections.find((s) => s.kind === 'record')!;
  const missing = record.findings.find((f) => f.id === 'record-missing');
  assert.ok(missing, 'a set short of five angles must raise it');
  assert.equal(missing.tone, 'attention');
  assert.match(missing.headline, /2 of the five/);
});

test('report: a complete set is not reported as missing anything', () => {
  const data = { ...base(), sessions: [session('s1', 60, ANGLES)] };
  const record = buildReport(data).sections.find((s) => s.kind === 'record')!;
  assert.equal(record.findings.find((f) => f.id === 'record-missing'), undefined);
  assert.equal(record.score, 1);
});

test('report: framing waits for a second set rather than guessing', () => {
  const data = { ...base(), sessions: [session('s1', 60, ANGLES)] };
  const framing = buildReport(data).sections.find((s) => s.kind === 'framing')!;
  assert.equal(framing.score, null);
});

test('report: an angle dropped since last time breaks the pair, and is said so', () => {
  const data = {
    ...base(),
    sessions: [session('s1', 90, ANGLES), session('s2', 30, ['top', 'front', 'crown', 'leftTemple'])],
  };
  const framing = buildReport(data).sections.find((s) => s.kind === 'framing')!;
  const matched = framing.findings.find((f) => f.id === 'framing-matched')!;
  assert.equal(matched.tone, 'attention');
  assert.equal(matched.angle, 'rightTemple');
});

test('report: sets taken days apart are flagged as camera noise, not progress', () => {
  const data = {
    ...base(),
    sessions: [session('s1', 34, ANGLES), session('s2', 30, ANGLES)],
  };
  const framing = buildReport(data).sections.find((s) => s.kind === 'framing')!;
  const gap = framing.findings.find((f) => f.id === 'framing-gap')!;
  assert.match(gap.detail, /lighting and styling/);
});

test('report: an empty stack is not scored as perfect adherence', () => {
  const data = { ...base(), sessions: [session('s1', 60, ANGLES)] };
  const routine = buildReport(data).sections.find((s) => s.kind === 'routine')!;
  assert.equal(routine.score, null);
  assert.match(routine.findings[0].headline, /empty/i);
});

test('report: no finding claims anything about hair', () => {
  const data = {
    ...base(),
    sessions: [session('s1', 90, ANGLES), session('s2', 30, ANGLES)],
  };
  const text = buildReport(data)
    .sections.flatMap((s) => s.findings.map((f) => `${f.headline} ${f.detail}`))
    .join(' ')
    .toLowerCase();

  // The report describes the record, the routine and the photographs. Any
  // of these words would mean it had started describing the hair instead.
  for (const claim of ['thicker', 'fuller', 'regrow', 'improved', 'density increased', 'better hair']) {
    assert.ok(!text.includes(claim), `report must not claim "${claim}"`);
  }
});

test('report: a measured problem names the angle and what to do about it', () => {
  const data = {
    ...base(),
    sessions: [session('s1', 90, ANGLES), withIssue(session('s2', 30, ANGLES), 'tooDark')],
  };
  const framing = buildReport(data).sections.find((s) => s.kind === 'framing')!;
  const found = framing.findings.find((f) => f.id === 'framing-quality-tooDark')!;
  assert.ok(found, 'a dark shot must be raised');
  assert.equal(found.angle, 'top', 'and the angle named, so it can be retaken');
  assert.match(found.detail, /window/);
});

test('report: photographs with no measurement produce no quality claim', () => {
  // Sets captured before the analyser existed carry no reading. Saying
  // nothing is right; inventing a clean bill of health is not.
  const data = {
    ...base(),
    sessions: [session('s1', 90, ANGLES), session('s2', 30, ANGLES)],
  };
  const framing = buildReport(data).sections.find((s) => s.kind === 'framing')!;
  assert.equal(
    framing.findings.some((f) => f.id.startsWith('framing-quality')),
    false,
  );
});

test('report: a fully clean set is told so', () => {
  const clean = (s: PhotoSession): PhotoSession => ({
    ...s,
    photos: s.photos.map((p) => ({
      ...p,
      quality: { brightness: 120, contrast: 40, sharpness: 20, clipped: 0, issues: [] },
    })),
  });
  const data = {
    ...base(),
    sessions: [session('s1', 90, ANGLES), clean(session('s2', 30, ANGLES))],
  };
  const framing = buildReport(data).sections.find((s) => s.kind === 'framing')!;
  const ok = framing.findings.find((f) => f.id === 'framing-quality-clean')!;
  assert.equal(ok.tone, 'good');
});
