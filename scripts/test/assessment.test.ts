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
  FREE_NOTES,
  buildScanReading,
  gateReading,
  heroPhoto,
  lockedSentences,
  readingSentences,
} from '@/features/assessment/scan-reading';
import {
  ANGLES,
  EMPTY_DATA,
  SCHEMA_VERSION,
  type AppData,
  type Photo,
  type PhotoSession,
  type RoutineItem,
} from '@/types/domain';

import { assertHonest } from './honesty-words';

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

/* ------------------------- hair-area findings ------------------------- */

/** A coverage reading, as the segmenter stores it on a photograph. */
function coverage(
  fraction: number,
  upperFraction: number,
  verticalBalance = 0.5,
  horizontalBalance?: number,
) {
  return { fraction, upperFraction, verticalBalance, horizontalBalance, pixels: 1000 };
}

/** Attaches a hair-area reading to the front shot of a set. */
function withCoverage(s: PhotoSession, c: ReturnType<typeof coverage>): PhotoSession {
  return {
    ...s,
    photos: s.photos.map((p) => (p.angle === 'front' ? { ...p, coverage: c } : p)),
  };
}

test('report: a baseline with a hair-area reading states it as area', () => {
  const data = { ...base(), sessions: [withCoverage(session('s1', 30, ANGLES), coverage(0.31, 0.44))] };
  const record = buildReport(data).sections.find((s) => s.kind === 'record')!;
  const found = record.findings.find((f) => f.id === 'record-coverage')!;
  assert.ok(found, 'a measured baseline must say so');
  assert.match(found.headline, /44% of the upper frame/);
  assert.match(found.detail, /31% of the frame/);
  assert.match(found.detail, /not thickness/);
  assert.equal(found.angle, 'front');
});

test('report: a baseline without a reading makes no area claim at all', () => {
  const data = { ...base(), sessions: [session('s1', 30, ANGLES)] };
  const record = buildReport(data).sections.find((s) => s.kind === 'record')!;
  assert.equal(record.findings.find((f) => f.id === 'record-coverage'), undefined);
});

test('report: two measured sets produce one trend finding, from hair-mask', () => {
  const data = {
    ...base(),
    sessions: [
      withCoverage(session('s1', 90, ANGLES), coverage(0.5, 0.5)),
      withCoverage(session('s2', 30, ANGLES), coverage(0.56, 0.6, 0.52)),
    ],
  };
  const framing = buildReport(data).sections.find((s) => s.kind === 'framing')!;
  const trend = framing.findings.find((f) => f.id === 'framing-coverage')!;
  assert.ok(trend, 'both sets measured means a comparison');
  assert.equal(trend.tone, 'neutral', 'a change is neither good nor bad; it is a number');
  assert.match(trend.detail, /area, not thickness/);
});

test('report: a difference inside the noise band is reported as no change', () => {
  const data = {
    ...base(),
    sessions: [
      withCoverage(session('s1', 90, ANGLES), coverage(0.5, 0.5)),
      withCoverage(session('s2', 30, ANGLES), coverage(0.51, 0.5)),
    ],
  };
  const framing = buildReport(data).sections.find((s) => s.kind === 'framing')!;
  const trend = framing.findings.find((f) => f.id === 'framing-coverage')!;
  assert.match(trend.headline, /No measurable change/);
});

test('report: a pair framed differently is refused, and flagged for attention', () => {
  const data = {
    ...base(),
    sessions: [
      withCoverage(session('s1', 90, ANGLES), coverage(0.4, 0.4, 0.5)),
      withCoverage(session('s2', 30, ANGLES), coverage(0.7, 0.8, 0.8)),
    ],
  };
  const framing = buildReport(data).sections.find((s) => s.kind === 'framing')!;
  const trend = framing.findings.find((f) => f.id === 'framing-coverage')!;
  assert.equal(trend.tone, 'attention');
  assert.match(trend.headline, /framed too differently/);
});

test('report: one measured set and one unmeasured set is not a comparison', () => {
  const data = {
    ...base(),
    sessions: [session('s1', 90, ANGLES), withCoverage(session('s2', 30, ANGLES), coverage(0.5, 0.5))],
  };
  const framing = buildReport(data).sections.find((s) => s.kind === 'framing')!;
  assert.equal(framing.findings.find((f) => f.id === 'framing-coverage'), undefined);
});

/* ----------------------------- the scan report ----------------------------- */

/**
 * Words that would mean the report had started describing a head rather
 * than a photograph. Shared by every sweep below; add to it before adding
 * a sentence, not after.
 */
const HAIR_CLAIMS = [
  'thicker',
  'thinner',
  'fuller',
  'regrow',
  'restore',
  'improved',
  'norwood',
  'diagnos',
  'severe',
  'advanced',
  'thinning',
  'density',
  'stage',
  'balding',
  'hair loss',
  'progress',
  'limited time',
  'last chance',
  'spots left',
];

function assertNoHairClaims(sentences: string[], context: string) {
  const text = sentences.join(' ').toLowerCase();
  for (const claim of HAIR_CLAIMS) {
    assert.ok(!text.includes(claim), `${context} must not say "${claim}"`);
  }
}

const clean = { brightness: 128, contrast: 42, sharpness: 15, clipped: 0.01, issues: [] };

function scan(
  quality: PhotoSession['photos'][number]['quality'] | undefined,
  cov: ReturnType<typeof coverage> | undefined,
): PhotoSession {
  const s = session('s1', 0, ['front']);
  return { ...s, photos: s.photos.map((p) => ({ ...p, quality, coverage: cov })) };
}

test('scan: the reading is built from the front photograph', () => {
  const s = session('s1', 0, ['top', 'front']);
  const r = buildScanReading(s)!;
  assert.equal(r.photo.angle, 'front');
  assert.equal(heroPhoto({ ...s, photos: [] }), null);
});

test('scan: coverage numbers are stated as percentages of the frame', () => {
  const r = buildScanReading(scan(clean, coverage(0.27, 0.41, 0.6, 0.48)))!;
  assert.equal(r.rings.length, 2);
  assert.equal(r.rings[0].headline, 'Hair covers 27% of the frame.');
  assert.equal(r.rings[1].headline, 'Hair covers 41% of the upper frame.');
  // The working under each ring, which the report draws beneath it: what
  // was measured, and the thing a percentage of pixels is not.
  assert.match(r.rings[0].detail, /marks each pixel as hair or not/);
  assert.match(r.rings[0].detail, /not how close together the strands are/);
  assert.match(r.rings[1].detail, /top third of the photograph/);
  assert.ok(Math.abs(r.rings[1].value - 0.41) < 1e-9, 'the ring fills to the fraction itself');
  assert.deepEqual(r.overlay, { upperFraction: 0.41, fraction: 0.27, leftShare: 0.48 });
  assert.equal(r.coverageAbsent, null);
});

test('scan: a left/right split inside the band reads as square to the camera', () => {
  const even = buildScanReading(scan(clean, coverage(0.3, 0.4, 0.5, 0.53)))!;
  const balance = even.tiles.find((t) => t.id === 'balance')!;
  assert.equal(balance.value, 'Even');
  assert.equal(balance.tone, 'good');
  assert.match(balance.detail, /53% of the hair area sits left of centre, 47% right/);

  const turned = buildScanReading(scan(clean, coverage(0.3, 0.4, 0.5, 0.66)))!;
  const off = turned.tiles.find((t) => t.id === 'balance')!;
  assert.equal(off.value, 'Left');
  assert.match(off.headline, /sits to the left/);
  assert.match(off.detail, /turned a little/, 'framing, not a finding about the hair');
  assert.ok(turned.nextTime.some((l) => /squarely/.test(l)), 'and the fix is in next month’s list');
});

test('scan: a reading with no left/right split draws no balance tile', () => {
  const r = buildScanReading(scan(clean, coverage(0.3, 0.4)))!;
  assert.equal(r.tiles.find((t) => t.id === 'balance'), undefined);
  assert.equal(r.overlay?.leftShare, null);
});

test('scan: without a segmenter the rings are absent and the reason is said plainly', () => {
  const r = buildScanReading(scan(clean, undefined))!;
  assert.equal(r.rings.length, 0);
  assert.equal(r.overlay, null, 'no band is drawn over a photograph nobody measured');
  assert.equal(r.tiles.length, 3, 'the photograph’s own quality is still reported');
  assert.match(r.coverageAbsent!.detail, /full app build/);
  assert.match(r.coverageAbsent!.detail, /nothing was invented/);
});

test('scan: an all-but-empty mask is not turned into a ring', () => {
  const r = buildScanReading(scan(clean, coverage(0.01, 0.0, 0, 0.5)))!;
  assert.equal(r.rings.length, 0);
  assert.equal(r.overlay, null);
  assert.match(r.coverageAbsent!.headline, /Too little hair area/);
  assert.ok(r.nextTime.some((l) => /Fill the frame/.test(l)));
});

test('scan: the photograph’s quality reads as one word per tile, with the number behind it', () => {
  const r = buildScanReading(scan(clean, undefined))!;
  const [light, focus, detail] = r.tiles;
  assert.deepEqual([light.value, focus.value, detail.value], ['Even', 'Sharp', 'Held']);
  assert.equal(light.headline, 'Evenly lit.');
  assert.match(light.detail, /Mean brightness 128 of 255/);
  assert.match(focus.detail, /Edge response 15\.0/);
  assert.ok(r.tiles.every((t) => t.tone === 'good'));
  assert.equal(r.nextTime.length, 1, 'a clean shot gets the one line that is always true');
  assert.match(r.nextTime[0], /Same spot, same time of day/);
});

test('scan: a dark, soft, burnt photograph is named as such and each fix is offered', () => {
  const rough = { brightness: 30, contrast: 9, sharpness: 2, clipped: 0.4, issues: ['tooDark'] };
  const r = buildScanReading(scan(rough, undefined))!;
  const [light, focus, detail] = r.tiles;
  assert.deepEqual([light.value, focus.value, detail.value], ['Dark', 'Soft', 'Burnt']);
  assert.ok(r.tiles.every((t) => t.tone === 'attention'));
  // The report screen shows the first line; the situational ones after it
  // are what the coach reads back when asked how to keep the next
  // photograph the same (features/coach/answers.ts:544), which is why
  // they are a list and not a paragraph.
  assert.equal(r.nextTime.length, 3, 'never more than three lines');
  assert.match(r.nextTime[1], /window/);
  assert.match(r.nextTime[2], /Brace the phone/);
});

test('scan: a photograph with no measurement at all still has a scope and a next step', () => {
  const r = buildScanReading(scan(undefined, undefined))!;
  assert.equal(r.tiles.length, 0);
  assert.equal(r.rings.length, 0);
  assert.match(r.scope, /reading of the picture, not of your hair/);
  assert.equal(r.nextTime.length, 1);
});

test('scan: no sentence the report can show claims anything about hair', () => {
  // Every branch of every tile and ring, swept together. This is the test
  // that decides whether a new sentence ships.
  const qualities = [
    clean,
    { brightness: 30, contrast: 9, sharpness: 2, clipped: 0.4, issues: [] },
    { brightness: 75, contrast: 12, sharpness: 8, clipped: 0.06, issues: [] },
    { brightness: 230, contrast: 40, sharpness: 20, clipped: 0.02, issues: [] },
    undefined,
  ];
  const coverages = [
    coverage(0.27, 0.41, 0.6, 0.48),
    coverage(0.3, 0.4, 0.5, 0.7),
    coverage(0.3, 0.4, 0.5, 0.3),
    coverage(0.3, 0.4),
    coverage(0.005, 0, 0, 0.5),
    undefined,
  ];
  for (const q of qualities) {
    for (const c of coverages) {
      const r = buildScanReading(scan(q, c))!;
      assertNoHairClaims(readingSentences(r), `scan (${q?.brightness ?? 'unmeasured'}, ${c?.fraction ?? 'no mask'})`);
    }
  }
});

test('report: the coverage findings claim nothing about hair either', () => {
  const pairs = [
    [coverage(0.5, 0.5), coverage(0.56, 0.6, 0.52)],
    [coverage(0.5, 0.5), coverage(0.44, 0.4, 0.5)],
    [coverage(0.5, 0.5), coverage(0.51, 0.5)],
    [coverage(0.4, 0.4, 0.5), coverage(0.7, 0.8, 0.8)],
  ];
  for (const [before, now] of pairs) {
    const data = {
      ...base(),
      sessions: [withCoverage(session('s1', 90, ANGLES), before), withCoverage(session('s2', 30, ANGLES), now)],
    };
    const sentences = buildReport(data).sections.flatMap((s) =>
      s.findings.map((f) => `${f.headline} ${f.detail}`),
    );
    assertNoHairClaims(sentences, 'report');
  }
  const single = { ...base(), sessions: [withCoverage(session('s1', 30, ANGLES), coverage(0.31, 0.44))] };
  assertNoHairClaims(
    buildReport(single).sections.flatMap((s) => s.findings.map((f) => `${f.headline} ${f.detail}`)),
    'baseline report',
  );
});

/* --------------------- the three sections of the reading ------------------- */

/**
 * The reading the owner asked for: what went well, what is holding the
 * record back, and what to do about it — in that order.
 *
 * The second section is the one these tests exist for. Every note in it
 * has to be about a photograph, a date, or a tick. The moment one is
 * about the hair in the picture, this app has made a diagnosis it cannot
 * make, on the screen immediately before the paywall.
 */

/** Every route an action is allowed to send somebody to. */
const ACTION_ROUTES = ['/hair-scan', '/routine', '/journal'];

/** Attaches the same measurement to every photograph in a set. */
function measured(s: PhotoSession, q: Photo['quality'] = clean): PhotoSession {
  return { ...s, photos: s.photos.map((p) => ({ ...p, quality: q })) };
}

/** Attaches a measurement, and optionally a pose, to one angle of a set. */
function atAngle(
  s: PhotoSession,
  angle: string,
  patch: Partial<Photo>,
): PhotoSession {
  return { ...s, photos: s.photos.map((p) => (p.angle === angle ? { ...p, ...patch } : p)) };
}

/** A stack item added `added` days ago and ticked on the given day offsets. */
function stack(
  label: string,
  added: number,
  ticks: number[],
  cadence: Partial<Pick<RoutineItem, 'cadence' | 'timesPerWeek'>> = {},
): Pick<AppData, 'routineItems' | 'routineLogs'> {
  const id = `item_${label}`;
  const key = (d: number) => daysAgo(d).toISOString().slice(0, 10);
  return {
    routineItems: [
      {
        id,
        journeyId: 'j1',
        label,
        cadence: 'daily',
        createdAt: daysAgo(added).toISOString(),
        ...cadence,
      },
    ],
    routineLogs: ticks.map((d) => ({
      id: `log_${label}_${d}`,
      routineItemId: id,
      date: key(d),
      completed: true,
      loggedAt: daysAgo(d).toISOString(),
    })),
  };
}

/** Several items in one stack, as the store holds them. */
function stacks(
  ...parts: Pick<AppData, 'routineItems' | 'routineLogs'>[]
): Pick<AppData, 'routineItems' | 'routineLogs'> {
  return {
    routineItems: parts.flatMap((p) => p.routineItems),
    routineLogs: parts.flatMap((p) => p.routineLogs),
  };
}

function withSessions(sessions: PhotoSession[], extra: Partial<AppData> = {}): AppData {
  // Newest first, as the store holds them.
  return { ...base(), sessions: [...sessions].reverse(), ...extra };
}

test('scan: the reading opens with what went well, and every line of it is a measurement', () => {
  const r = buildScanReading(scan(clean, coverage(0.3, 0.4, 0.5, 0.52)))!;
  assert.deepEqual(
    r.strengths.map((n) => n.id),
    ['well-light', 'well-sharpness', 'well-detail', 'well-balance'],
  );
  assert.ok(r.strengths.every((n) => n.tone === 'good'));
  assert.equal(r.strengths[0].headline, 'Evenly lit.');
  assert.match(r.strengths[0].detail, /Mean brightness 128 of 255/);
});

test('scan: a pre-scan single-angle baseline says which comparisons do not exist yet', () => {
  const r = buildScanReading(scan(clean, undefined))!;
  const gap = r.shortfalls[0];
  assert.equal(gap.id, 'gap-angles');
  assert.match(gap.headline, /Only 1 angle is on the record\./);
  assert.match(gap.detail, /those comparisons do not exist yet/);
  assert.ok(!/\bfive\b/i.test(gap.headline + gap.detail), 'the old five-angle count is gone');

  const action = r.actions.find((a) => a.answers === 'gap-angles')!;
  assert.ok(action, 'a shortfall with a screen behind it gets the screen');
  assert.equal(action.link?.route, '/hair-scan');
  assert.match(action.headline, /Scan your hair to add the angles a turn reaches\./);
});

test('scan: a session the hair scan made is never nagged about angles', () => {
  // A scan files what the turn reached and never the crown, so every
  // scan is short of at least one angle by the old count. Told to "scan
  // again for the crown", the person would do so and be told it again.
  const base = scan(clean, undefined);
  const byBlock: PhotoSession = {
    ...base,
    scan: { durationMs: 20000, completion: 1, frameCount: 40, lighting: 0.6, version: 1 },
  };
  const byShutter: PhotoSession = {
    ...base,
    photos: base.photos.map((p) => ({ ...p, capture: 'scan' as const })),
  };
  for (const s of [byBlock, byShutter]) {
    const r = buildScanReading(s)!;
    assert.ok(!r.shortfalls.some((g) => g.id === 'gap-angles'), 'no angle shortfall for a scan');
    assert.ok(!r.actions.some((a) => a.answers === 'gap-angles'), 'no rescan-for-angles action');
    for (const line of [...r.strengths, ...r.shortfalls, ...r.actions]) {
      assert.ok(!/\bfive\b/i.test(line.headline + line.detail), `"${line.headline}" counts five angles`);
    }
  }
});

test('scan: a complete, clean set is a short report rather than a padded one', () => {
  // A first scan legitimately has little holding it back, and the honest
  // thing is a section that is absent rather than one filled out to look
  // thorough.
  const r = buildScanReading(measured(session('s1', 0, ANGLES)))!;
  assert.deepEqual(r.shortfalls, []);
  assert.deepEqual(r.actions, []);
  assert.ok(r.strengths.length > 0);
  assert.ok(r.strengths.some((n) => n.id === 'well-angles'));
});

test('scan: every shortfall is about the photograph, the record or the routine', () => {
  const rough = { brightness: 30, contrast: 9, sharpness: 2, clipped: 0.4, issues: ['tooDark'] };
  const data = withSessions([session('s0', 120, ANGLES), measured(session('s1', 0, ['front']), rough)]);
  const r = buildScanReading(data.sessions[0], data)!;

  assert.ok(r.shortfalls.length > 0);
  for (const gap of r.shortfalls) {
    assert.ok(
      /^gap-(angles|interval|exposure|square|light|sharpness|detail|balance|mask|stack|routine|journal)$/.test(gap.id),
      `${gap.id} is not one of the kinds this report is allowed to raise`,
    );
  }
  assertNoHairClaims(
    r.shortfalls.flatMap((g) => [g.headline, g.detail]),
    'the shortfalls',
  );
});

test('scan: a late set names the gap and the interval, and hands over the camera', () => {
  const data = withSessions([session('s0', 90, ANGLES), session('s1', 0, ANGLES)]);
  const r = buildScanReading(data.sessions[0], data)!;

  const gap = r.shortfalls.find((g) => g.id === 'gap-interval')!;
  assert.ok(gap, 'a set taken past the chosen interval is worth raising');
  assert.match(gap.headline, /The last scan was 90 days ago, and the interval you chose is 30 days\./);
  assert.match(gap.detail, /60 days over/);

  const action = r.actions.find((a) => a.answers === 'gap-interval')!;
  assert.equal(action.link?.route, '/hair-scan');
});

test('scan: a set taken on the schedule is said so, and raises nothing', () => {
  const data = withSessions([session('s0', 30, ANGLES), session('s1', 0, ANGLES)]);
  const r = buildScanReading(data.sessions[0], data)!;

  const well = r.strengths.find((n) => n.id === 'well-interval')!;
  assert.match(well.headline, /This scan came 30 days after the last one\./);
  assert.match(well.detail, /interval you chose is 30 days/);
  assert.equal(r.shortfalls.find((g) => g.id === 'gap-interval'), undefined);
});

test('scan: two shots lit differently is a fact about the light, not about the hair', () => {
  const dim = { brightness: 70, contrast: 40, sharpness: 20, clipped: 0, issues: [] };
  const bright = { brightness: 190, contrast: 40, sharpness: 20, clipped: 0, issues: [] };
  const data = withSessions([
    atAngle(session('s0', 30, ANGLES), 'front', { quality: dim }),
    atAngle(session('s1', 0, ANGLES), 'front', { quality: bright }),
  ]);
  const r = buildScanReading(data.sessions[0], data)!;

  const gap = r.shortfalls.find((g) => g.id === 'gap-exposure')!;
  assert.ok(gap, 'a 120-point swing in mean brightness is worth naming');
  assert.match(gap.detail, /Mean brightness 70 last time, 190 this time/);
  assert.match(gap.detail, /could be the light/);

  const action = r.actions.find((a) => a.answers === 'gap-exposure')!;
  assert.equal(action.link, null, 'nothing to navigate to: it is how you stand next time');
  assert.match(action.headline, /the light you used before/);
});

test('scan: a head turned further than last time is reported with both angles', () => {
  const data = withSessions([
    atAngle(session('s0', 30, ANGLES), 'front', { pose: { yaw: 2, pitch: 0, roll: 0 } }),
    atAngle(session('s1', 0, ANGLES), 'front', { pose: { yaw: -31, pitch: 0, roll: 0 } }),
  ]);
  const r = buildScanReading(data.sessions[0], data)!;

  const gap = r.shortfalls.find((g) => g.id === 'gap-square')!;
  assert.ok(gap, 'a 29° difference in turn breaks the pair');
  assert.match(gap.detail, /2° of turn then, 31° now/);
  assertNoHairClaims([gap.headline, gap.detail], 'the pose shortfall');
});

test('scan: a head held at the same angle twice raises nothing about the pose', () => {
  const data = withSessions([
    atAngle(session('s0', 30, ANGLES), 'front', { pose: { yaw: 4, pitch: 0, roll: 0 } }),
    atAngle(session('s1', 0, ANGLES), 'front', { pose: { yaw: -6, pitch: 0, roll: 0 } }),
  ]);
  const r = buildScanReading(data.sessions[0], data)!;
  assert.equal(r.shortfalls.find((g) => g.id === 'gap-square'), undefined);
});

test('scan: an item ticked on most of its days is a strength, and one ticked on few is not', () => {
  const kept = withSessions([session('s1', 0, ANGLES)], stack('Minoxidil', 20, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]));
  const r = buildScanReading(kept.sessions[0], kept)!;
  const well = r.strengths.find((n) => n.id === 'well-routine')!;
  // 18 of 21 is 86%, and the line says both numbers. See the arithmetic
  // test below for why the percentage is counted from the denominator it
  // prints rather than from `daysDonePercent`.
  assert.match(well.headline, /You ticked Minoxidil on 86% of its days\./);
  assert.match(well.detail, /18 of the 21 days it has been in your stack/);
  assert.equal(r.shortfalls.find((g) => g.id === 'gap-routine'), undefined);
  assert.equal(r.shortfalls.find((g) => g.id === 'gap-stack'), undefined);

  const dropped = withSessions([session('s1', 0, ANGLES)], stack('Minoxidil', 20, [1, 2, 3]));
  const d = buildScanReading(dropped.sessions[0], dropped)!;
  const gap = d.shortfalls.find((g) => g.id === 'gap-routine')!;
  assert.match(gap.headline, /You ticked Minoxidil on 14% of its days\./);
  assert.match(gap.detail, /3 of the 21 days it has been in your stack/);
  assert.equal(d.strengths.find((n) => n.id === 'well-routine'), undefined);

  const action = d.actions.find((a) => a.answers === 'gap-routine')!;
  assert.equal(action.link?.route, '/routine');
});

test('scan: the percentage a routine line quotes is the one its own numerals make', () => {
  /*
    The report's whole claim is that every line is checkable against the
    user's own files, and a headline stating a share over a detail stating
    a different fraction breaks that on the one screen where it matters
    most. `daysDonePercent` counts against the days that have fully
    elapsed — today is out of the denominator until it is ticked — which
    is the fair way to score a day that is not over and the wrong number
    to print above "18 of the 21 days". So the reading counts its own,
    from the two numerals it shows, and this holds it to that.
  */
  const stacks = [
    stack('Minoxidil', 20, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
    stack('Minoxidil', 20, [1, 2, 3]),
    stack('Biotin', 30, [1, 2]),
    stack('Biotin', 30, Array.from({ length: 25 }, (_, i) => i + 1)),
    stack('Biotin', 9, [1, 2, 3, 4, 5, 6, 7, 8]),
  ];

  for (const s of stacks) {
    const data = withSessions([session('s1', 0, ANGLES)], s);
    const r = buildScanReading(data.sessions[0], data)!;
    const lines = [...r.strengths, ...r.shortfalls].filter((n) => n.id.endsWith('-routine'));
    assert.ok(lines.length > 0, 'each of these fixtures has a week of ticks behind it');

    for (const note of lines) {
      const said = Number(/on (\d+)% of its days/.exec(note.headline)![1]);
      const working = /(\d+) of the (\d+) days/.exec(note.detail)!;
      const done = Number(working[1]);
      const days = Number(working[2]);
      assert.equal(
        said,
        Math.round((done / days) * 100),
        `"${note.headline}" over "${note.detail}" — the working does not make the figure`,
      );
    }

    // And the action repeats the same share, not a third one.
    const action = r.actions.find((a) => a.id === 'do-routine');
    const gap = r.shortfalls.find((n) => n.id === 'gap-routine');
    if (action && gap) {
      const said = /on (\d+)% of its days/.exec(gap.headline)![1];
      assert.match(action.detail, new RegExp(`Ticked on ${said}% of its days`));
    }
  }
});

test('scan: the routine action moves when something sits, and says nothing about a dose', () => {
  /*
    The label is user-supplied and is very often a medication. How much of
    one to take, and how often, is a decision this app takes no part in —
    routine.tsx says so in as many words — so the one thing this action is
    allowed to suggest is moving the time it sits at, which is a setting
    in the app and nothing to do with the substance.
  */
  const data = withSessions([session('s1', 0, ANGLES)], stack('Minoxidil', 20, [1, 2, 3]));
  const r = buildScanReading(data.sessions[0], data)!;
  const action = r.actions.find((a) => a.id === 'do-routine')!;

  assert.match(action.headline, /time of day/);
  assert.equal(action.link?.route, '/routine');
  for (const dosing of [/less often/i, /more often/i, /fewer doses/i, /cut back/i, /skip a/i, /every other day/i]) {
    assert.ok(!dosing.test(`${action.headline} ${action.detail}`), `the action must not suggest ${dosing}`);
  }
  assert.match(action.detail, /dosing question/, 'and it says outright that dosing is not its business');
  assertHonest(assert, [action.headline, action.detail], 'the routine action');
});

test('scan: an empty stack and an empty journal are shortfalls of the record', () => {
  const data = withSessions([session('s0', 30, ANGLES), session('s1', 0, ANGLES)]);
  const r = buildScanReading(data.sessions[0], data)!;

  assert.ok(r.shortfalls.find((g) => g.id === 'gap-stack'));
  assert.ok(r.shortfalls.find((g) => g.id === 'gap-journal'));
  assert.equal(r.actions.find((a) => a.answers === 'gap-stack')?.link?.route, '/routine');
  assert.equal(r.actions.find((a) => a.answers === 'gap-journal')?.link?.route, '/journal');
});

test('scan: a journal written in since the last set raises nothing', () => {
  const data = withSessions([session('s0', 30, ANGLES), session('s1', 0, ANGLES)], {
    journal: [
      { id: 'n1', journeyId: 'j1', body: 'Changed shampoo.', createdAt: daysAgo(10).toISOString() },
    ],
  });
  const r = buildScanReading(data.sessions[0], data)!;
  assert.equal(r.shortfalls.find((g) => g.id === 'gap-journal'), undefined);
});

test('scan: with no record in hand the reading claims nothing about the record', () => {
  // The coach and the quality tests pass a session on its own. A reading
  // built that way must not invent an empty stack or a missed interval it
  // was never shown.
  const r = buildScanReading(measured(session('s1', 0, ANGLES)))!;
  for (const id of ['gap-stack', 'gap-journal', 'gap-interval', 'gap-exposure', 'gap-square']) {
    assert.equal(r.shortfalls.find((g) => g.id === id), undefined, `${id} needs a record to be true`);
  }
});

test('scan: every action answers a shortfall the same reading raised, and goes somewhere real', () => {
  const rough = { brightness: 30, contrast: 9, sharpness: 2, clipped: 0.4, issues: ['tooDark'] };
  const fixtures: AppData[] = [
    withSessions([session('s1', 0, ['front'])]),
    withSessions([session('s0', 90, ANGLES), measured(session('s1', 0, ['front', 'top']), rough)]),
    withSessions([session('s0', 30, ANGLES), session('s1', 0, ANGLES)], stack('Biotin', 30, [1, 2])),
    withSessions([measured(session('s1', 0, ANGLES))], stack('Biotin', 30, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25])),
  ];

  for (const data of fixtures) {
    const r = buildScanReading(data.sessions[0], data)!;
    const ids = new Set(r.shortfalls.map((g) => g.id));
    for (const action of r.actions) {
      assert.ok(ids.has(action.answers), `${action.id} answers ${action.answers}, which is not in the report`);
      if (action.link) {
        assert.ok(ACTION_ROUTES.includes(action.link.route), `${action.id} points at ${action.link.route}`);
        assert.ok(action.link.label.length > 0);
      }
    }
    // One action per subject: two shortfalls about framing do not produce
    // the same instruction twice.
    assert.equal(new Set(r.actions.map((a) => a.headline)).size, r.actions.length);
    assert.ok(r.actions.length <= r.shortfalls.length);
  }
});

test('scan: with nothing holding the record back there is nothing to do', () => {
  const data = withSessions([session('s0', 30, ANGLES), measured(session('s1', 0, ANGLES))], {
    ...stack('Biotin', 20, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
    journal: [{ id: 'n1', journeyId: 'j1', body: 'Same as last month.', createdAt: daysAgo(2).toISOString() }],
  });
  const r = buildScanReading(data.sessions[0], data)!;
  assert.deepEqual(r.shortfalls, []);
  assert.deepEqual(r.actions, []);
  // …and still the one instruction that is true of every set. The report
  // closes its "what to do next" card with nextTime[0] whether or not
  // anything is holding the record back, so the person whose set came out
  // right is not the one who loses the method.
  assert.match(r.nextTime[0], /Same spot, same time of day/);
});

test('scan: every reading carries the capture line the report always shows', () => {
  const rough = { brightness: 30, contrast: 9, sharpness: 2, clipped: 0.4, issues: ['tooDark'] };
  const readings = [
    buildScanReading(scan(clean, coverage(0.3, 0.4, 0.5, 0.52)))!,
    buildScanReading(scan(rough, undefined))!,
    buildScanReading(scan(undefined, undefined))!,
    buildScanReading(measured(session('s1', 0, ANGLES)))!,
  ];
  for (const r of readings) {
    assert.ok(r.nextTime.length >= 1, 'the always-true line is the first of the list, never absent');
    assert.match(r.nextTime[0], /Same spot, same time of day, same distance from the phone\./);
  }
});

/* ------------------------------ the gating ------------------------------- */

/** The free lines, in the full reading's own order and none of them altered. */
function assertSubsequence(shown: { id: string }[], all: { id: string }[], what: string) {
  let at = 0;
  for (const note of shown) {
    const found = all.indexOf(all.find((n) => n.id === note.id)!, at);
    assert.ok(found >= at, `${what}: ${note.id} is not in the full reading, or is out of order`);
    assert.deepEqual(note, all[found], `${what}: ${note.id} differs from the line behind the gate`);
    at = found + 1;
  }
}

test('gate: a free reading is the same lines, cut short — never different ones', () => {
  const data = withSessions([session('s0', 90, ANGLES), measured(session('s1', 0, ['front']))]);
  const r = buildScanReading(data.sessions[0], data)!;
  const free = gateReading(r, false);
  const paid = gateReading(r, true);

  assert.deepEqual(paid.strengths, r.strengths);
  assert.deepEqual(paid.shortfalls, r.shortfalls);
  assert.deepEqual(paid.actions, r.actions);
  assert.equal(paid.locked, null);

  // The free lines are the full reading's own lines, unaltered and in its
  // order, so no figure a free reader is shown is corrected behind the
  // gate: what is hidden is extra, never a revision. It is a subsequence
  // rather than a prefix because the caveats are exempt from the cut
  // wherever they land — see the test below.
  assertSubsequence(free.strengths, r.strengths, 'the strengths');
  assertSubsequence(free.shortfalls, r.shortfalls, 'the shortfalls');
  assertSubsequence(free.actions, r.actions, 'the actions');
  assert.ok(free.strengths.length <= FREE_NOTES, 'nothing in the strengths is exempt from the cut');
});

test('gate: a caveat about a free line is never the part behind the paywall', () => {
  /*
    The failure this exists for: a free reader is told the light is
    "comfortably inside the range the comparison needs" while the line
    saying the two photographs were lit differently sits behind the
    paywall. The figure is not revised, but the assurance is — which is
    the same dishonesty wearing a different hat. An ordinary late
    single-angle set is enough to produce it, so the caveats are exempt
    by name and this checks every reading that can raise one.
  */
  const dim = { brightness: 40, contrast: 42, sharpness: 15, clipped: 0.01, issues: [] };
  const fixtures: AppData[] = [
    // Late, single-angle, lit differently: the exposure caveat lands third.
    withSessions([
      measured(session('s0', 90, ANGLES), dim),
      measured(session('s1', 0, ['front'])),
    ]),
    // Late, single-angle, turned further: the pose caveat lands third.
    withSessions([
      atAngle(measured(session('s0', 90, ANGLES)), 'front', { pose: { yaw: 1, pitch: 0, roll: 0 } }),
      atAngle(measured(session('s1', 0, ['front'])), 'front', { pose: { yaw: 35, pitch: 0, roll: 0 } }),
    ]),
    // Nothing for the segmenter to read, on a late single-angle set.
    withSessions([
      measured(session('s0', 90, ANGLES)),
      atAngle(measured(session('s1', 0, ['front'])), 'front', {
        coverage: coverage(0.005, 0, 0, 0.5),
      }),
    ]),
  ];

  const CAVEATS = ['gap-exposure', 'gap-square', 'gap-mask'];
  let raised = 0;

  for (const data of fixtures) {
    const r = buildScanReading(data.sessions[0], data)!;
    const free = gateReading(r, false);
    for (const id of CAVEATS) {
      const note = r.shortfalls.find((n) => n.id === id);
      if (!note) continue;
      raised += 1;
      assert.equal(note.premium, false, `${id} qualifies a line shown for free and must be shown too`);
      assert.ok(free.shortfalls.some((n) => n.id === id), `${id} is missing from the free reading`);
    }
  }

  assert.equal(raised, 3, 'all three caveats are exercised, one per fixture');
});

test('gate: the shortfalls are cut the same way as the strengths', () => {
  // Hiding the shortfalls while showing the good half would make the free
  // report more flattering than the paid one, which is the one direction
  // this gate is never allowed to go.
  const data = withSessions([session('s0', 90, ANGLES), measured(session('s1', 0, ['front']))]);
  const free = gateReading(buildScanReading(data.sessions[0], data)!, false);
  assert.ok(free.shortfalls.length > 0, 'a free reader still sees what is holding the record back');
});

test('gate: the locked panel counts lines that really exist behind it', () => {
  const data = withSessions([session('s0', 90, ANGLES), measured(session('s1', 0, ['front']))]);
  const r = buildScanReading(data.sessions[0], data)!;
  const free = gateReading(r, false);

  const hidden =
    r.strengths.length - free.strengths.length +
    (r.shortfalls.length - free.shortfalls.length) +
    (r.actions.length - free.actions.length);
  assert.ok(hidden > 0, 'this fixture is meant to have depth behind the gate');
  assert.equal(free.locked!.count, hidden);
  assert.match(free.locked!.headline, new RegExp(`^${hidden} more line`));
});

test('gate: a reading with nothing beyond the free window shows no locked panel', () => {
  // Two angles and no measurement: one line in each section, so there is
  // nothing to hold back and nothing to advertise.
  const r = buildScanReading(session('s1', 0, ['front', 'top']))!;
  assert.ok(r.strengths.length <= FREE_NOTES);
  assert.ok(r.shortfalls.length <= FREE_NOTES);
  assert.ok(r.actions.length <= FREE_NOTES);
  const free = gateReading(r, false);
  assert.equal(free.locked, null);
  assert.deepEqual(free.strengths, r.strengths);
  assert.deepEqual(free.shortfalls, r.shortfalls);
});

test('gate: the teaser never suggests the verdict is the part behind the paywall', () => {
  const data = withSessions([session('s0', 90, ANGLES), measured(session('s1', 0, ['front']))]);
  const free = gateReading(buildScanReading(data.sessions[0], data)!, false);
  const sentences = lockedSentences(free);
  assert.ok(sentences.length > 0);
  assertNoHairClaims(sentences, 'the locked panel');
  assert.match(free.locked!.detail, /no judgement about your hair/);
});

/* --------------------------- the honesty sweep ---------------------------- */

test('scan: no sentence in any of the three sections claims anything about hair', () => {
  const rough = { brightness: 30, contrast: 9, sharpness: 2, clipped: 0.4, issues: ['tooDark'] };
  const bright = { brightness: 230, contrast: 12, sharpness: 8, clipped: 0.2, issues: [] };
  const fixtures: AppData[] = [
    withSessions([session('s1', 0, ['front'])]),
    withSessions([measured(session('s1', 0, ANGLES))]),
    withSessions([session('s0', 120, ANGLES), measured(session('s1', 0, ['front']), rough)]),
    withSessions([
      atAngle(measured(session('s0', 30, ANGLES), bright), 'front', { pose: { yaw: 1, pitch: 0, roll: 0 } }),
      atAngle(measured(session('s1', 0, ANGLES), rough), 'front', { pose: { yaw: 40, pitch: 0, roll: 0 } }),
    ]),
    withSessions([session('s0', 30, ANGLES), session('s1', 0, ANGLES)], stack('Biotin', 30, [1])),
    withSessions([session('s1', 0, ANGLES)], stack('Biotin', 30, Array.from({ length: 29 }, (_, i) => i + 1))),
  ];

  for (const data of fixtures) {
    const r = buildScanReading(data.sessions[0], data)!;
    const sentences = [...readingSentences(r), ...lockedSentences(gateReading(r, false))];
    assertNoHairClaims(sentences, 'the reading');
    // The wider sweep: flattery, advice, urgency, a persona, an exclamation.
    assertHonest(assert, sentences, 'the reading');
  }
});

test('scan: an item followed exactly as it was set up is never the one held up as lagging', () => {
  /*
    `selectors.ts` refuses to count a twice-weekly item as missed on the
    five days it was never due — "counting it as missed would hold
    somebody's streak at zero for following their routine exactly as they
    set it". A share of days cannot go behind that and call the same
    person lagging on the one screen whose job is to be checkable: two of
    seven is 29%, which no threshold on a share of days can ever pass.
    Only items expected every day are ranked at all.
  */
  const exact = withSessions(
    [session('s1', 0, ANGLES)],
    stack('Ketoconazole shampoo', 28, [1, 4, 8, 11, 15, 18, 22, 25], { cadence: 'weekly', timesPerWeek: 2 }),
  );
  const r = buildScanReading(exact.sessions[0], exact)!;
  assert.equal(r.shortfalls.find((n) => n.id === 'gap-routine'), undefined);
  assert.equal(r.strengths.find((n) => n.id === 'well-routine'), undefined);
  assert.equal(r.actions.find((a) => a.id === 'do-routine'), undefined);
  for (const note of [...r.strengths, ...r.shortfalls]) {
    assert.ok(!note.headline.includes('Ketoconazole'), 'nothing is said about it either way');
    assert.ok(!note.detail.includes('Ketoconazole'));
  }

  // A daily item in the same stack is still ranked, so the filter is the
  // only thing that changed.
  const mixed = withSessions(
    [session('s1', 0, ANGLES)],
    stacks(
      stack('Ketoconazole shampoo', 28, [1, 4, 8, 11, 15, 18, 22, 25], { cadence: 'weekly', timesPerWeek: 2 }),
      stack('Minoxidil', 20, [1, 2, 3]),
    ),
  );
  const m = buildScanReading(mixed.sessions[0], mixed)!;
  assert.match(m.shortfalls.find((n) => n.id === 'gap-routine')!.headline, /Minoxidil/);
});

test('scan: the routine line claims only the ranking it actually made', () => {
  /*
    The items are ranked by the share of their days they were ticked on,
    so that is what the sentence underneath may claim. It said "the most
    days unticked behind it", which is a count, and a long-standing item
    kept well has far more unticked days than a young one kept badly — so
    on this fixture the old sentence was simply false.
  */
  const data = withSessions(
    [session('s1', 0, ANGLES)],
    stacks(
      stack('Alpha', 100, Array.from({ length: 60 }, (_, i) => i + 1)),
      stack('Beta', 10, [1, 2, 3]),
    ),
  );
  const r = buildScanReading(data.sessions[0], data)!;
  const gap = r.shortfalls.find((n) => n.id === 'gap-routine')!;

  // Beta is the smaller share (3 of 11) and Alpha has far more unticked
  // days behind it (41 of 101), so only one of the two sentences is true.
  assert.match(gap.headline, /Beta/);
  assert.match(gap.detail, /smallest share of its days ticked/);
  assert.ok(!gap.detail.includes('most days unticked'), 'a share is not a count');
});

test('scan: no paragraph on the report is printed twice', () => {
  /*
    An empty mask draws its own card above the sections, in words the
    reading also had in its shortfalls. Two identical paragraphs on one
    screen read as a fault in the app, and the second one carries nothing
    the first did not.
  */
  const empty = scan(clean, coverage(0.001, 0.0005, 0.0005, 0.5));
  const r = buildScanReading(empty)!;
  assert.ok(r.coverageAbsent, 'the mask came back empty');

  const said = [
    r.coverageAbsent!.headline,
    r.coverageAbsent!.detail,
    ...[...r.strengths, ...r.shortfalls, ...r.rings].flatMap((n) => [n.headline, n.detail]),
    ...r.actions.flatMap((a) => [a.headline, a.detail]),
    ...r.nextTime,
  ].map((line) => line.trim().replace(/\.$/, ''));

  assert.equal(new Set(said).size, said.length, `a line is on the screen twice: ${said.join(' | ')}`);
  assert.ok(r.shortfalls.some((n) => n.id === 'gap-mask'), 'and the shortfall is still made');
  assert.equal(r.shortfalls.find((n) => n.id === 'gap-mask')!.premium, false, 'still free');
});
