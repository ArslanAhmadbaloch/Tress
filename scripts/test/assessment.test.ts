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
  buildScanReading,
  heroPhoto,
  readingSentences,
} from '@/features/assessment/scan-reading';
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
