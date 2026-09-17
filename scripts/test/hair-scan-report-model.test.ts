/**
 * The report model is the whole report: every word the screen shows is
 * built here, so every word can be read here. Three records — a first
 * scan on a fresh install without the segmenter, the same with it, and
 * a mature record with a routine, a streak, several scans and scanned
 * products — are built with and without Premium, and everything they
 * say goes through the honesty sweep: nothing about a head, no outcome,
 * no advice framed as a promise, no figure that was not counted, and the
 * person's own answers read back only as quotations of what they chose.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reportSummary } from '@/features/coach/report-summary';
import {
  FOCUS_REGIONS,
  STRENGTHS_MAX,
  STRENGTHS_MIN,
  buildHairScanReport,
  reportModelQuotes,
  reportModelSentences,
  type HairScanReportModel,
} from '@/features/hair-scan/report-model';
import { HAIR_SCAN_REPORT_MODEL_COPY as COPY, quotedSpans, reportCopySentences, stripQuotes } from '@/features/hair-scan/report-copy';
import { TIPS_BY_GOAL, TIPS_PER_GOAL, tipSentences, tipsFor } from '@/features/hair-scan/tips';
import { toDateKey } from '@/lib/date';
import {
  ANGLES,
  APPROACH_LABELS,
  EMPTY_DATA,
  HAIR_GOAL_LABELS,
  MOTIVATION_LABELS,
  ONSET_LABELS,
  TRACKING_AREA_LABELS,
  type Angle,
  type AppData,
  type HairGoal,
  type Journey,
  type Photo,
  type PhotoCoverage,
  type PhotoQuality,
  type PhotoSession,
  type Product,
  type RoutineItem,
  type RoutineLog,
} from '@/types/domain';

import { HAIR_CLAIMS } from './claims';
import { assertHonest } from './honesty-words';

/* ------------------------------ fixtures ------------------------------- */

const GOOD: PhotoQuality = { brightness: 128, contrast: 40, sharpness: 15, clipped: 0.01, issues: [] };
const DARK: PhotoQuality = { brightness: 40, contrast: 20, sharpness: 4, clipped: 0.05, issues: ['tooDark'] };

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function area(fraction: number, upper = fraction + 0.1, left = 0.5): PhotoCoverage {
  return { fraction, upperFraction: upper, verticalBalance: 0.6, horizontalBalance: left, pixels: 40_000 };
}

function photo(angle: Angle, overrides: Partial<Photo> = {}): Photo {
  return {
    id: `p_${angle}`,
    sessionId: 's1',
    angle,
    uri: `file:///${angle}.jpg`,
    width: 1080,
    height: 1440,
    capturedAt: '2026-09-17T13:59:00.000Z',
    capture: 'scan',
    regions: { hairline: { x: 0.1, y: 0.05, w: 0.8, h: 0.3 }, leftTemple: { x: 0, y: 0.1, w: 0.3, h: 0.3 }, rightTemple: { x: 0.7, y: 0.1, w: 0.3, h: 0.3 }, top: { x: 0.1, y: 0, w: 0.8, h: 0.4 }, crown: { x: 0.1, y: 0, w: 0.8, h: 0.4 } },
    ...overrides,
  };
}

function session(photos: Photo[], overrides: Partial<PhotoSession> = {}): PhotoSession {
  return {
    id: 's1',
    journeyId: 'j1',
    capturedAt: '2026-09-17T13:59:00.000Z',
    isBaseline: true,
    photos,
    scan: { durationMs: 14_200, completion: 1, frameCount: 23, lighting: 0.8, version: 1 },
    ...overrides,
  };
}

function journey(overrides: Partial<Journey> = {}): Journey {
  return {
    id: 'j1',
    profileId: 'p1',
    startedAt: daysAgo(0),
    trackingAreas: ['hairline'],
    motivations: ['confidence'],
    goals: ['hairline'],
    noticed: 'halfYear',
    triggers: ['mirror'],
    approaches: ['topical'],
    updateIntervalDays: 30,
    createdAt: daysAgo(0),
    ...overrides,
  };
}

function dataWith(parts: Partial<AppData>): AppData {
  return {
    ...EMPTY_DATA,
    profile: { id: 'p1', displayName: 'Sam', createdAt: daysAgo(0) },
    journey: journey(),
    onboardingCompletedAt: daysAgo(0),
    ...parts,
  };
}

/** A first scan on a fresh install, on a build where the segmenter did not run: light and focus only. */
function firstScanNoSegmenter(): { data: AppData; session: PhotoSession } {
  const s = session([
    photo('front', { quality: GOOD, pose: { yaw: 2, pitch: -1, roll: 0 } }),
    photo('leftTemple', { quality: GOOD, pose: { yaw: -33, pitch: 0, roll: 0 } }),
    photo('rightTemple', { quality: GOOD, pose: { yaw: 31, pitch: 0, roll: 0 } }),
    photo('top', { quality: GOOD, pose: { yaw: 0, pitch: -30, roll: 0 } }),
  ]);
  return { data: dataWith({ sessions: [s] }), session: s };
}

/** The same first scan, every frame measured. */
function firstScanMeasured(): { data: AppData; session: PhotoSession } {
  const s = session([
    photo('front', { quality: GOOD, coverage: area(0.41, 0.52, 0.5), pose: { yaw: 2, pitch: -1, roll: 0 } }),
    photo('leftTemple', { quality: GOOD, coverage: area(0.38), pose: { yaw: -33, pitch: 0, roll: 0 } }),
    photo('rightTemple', { quality: GOOD, coverage: area(0.4), pose: { yaw: 31, pitch: 0, roll: 0 } }),
    photo('top', { quality: GOOD, coverage: area(0.55), pose: { yaw: 0, pitch: -30, roll: 0 } }),
  ]);
  return { data: dataWith({ sessions: [s] }), session: s };
}

/** A record with a routine ticked most days, a streak, three scans and two scanned products. */
function matureRecord(): { data: AppData; session: PhotoSession } {
  const items: RoutineItem[] = [
    { id: 'rti_1', journeyId: 'j1', label: 'Morning dropper', cadence: 'daily', createdAt: daysAgo(40), productBarcode: '5601059062534' },
    { id: 'rti_2', journeyId: 'j1', label: 'Wash day', cadence: 'weekly', timesPerWeek: 2, createdAt: daysAgo(40), productBarcode: '0000000000011' },
  ];
  const logs: RoutineLog[] = [];
  for (let d = 0; d < 28; d += 1) {
    const day = new Date();
    day.setDate(day.getDate() - d);
    const date = toDateKey(day);
    logs.push({ id: `log_1_${d}`, routineItemId: 'rti_1', date, completed: true, loggedAt: day.toISOString() });
    if (d % 3 === 0) logs.push({ id: `log_2_${d}`, routineItemId: 'rti_2', date, completed: true, loggedAt: day.toISOString() });
  }
  const products: Product[] = [
    { barcode: '5601059062534', source: 'openBeautyFacts', name: 'Gentle shampoo', thumbnailUrl: 'https://images.openbeautyfacts.org/x.200.jpg', fetchedAt: daysAgo(20) },
    { barcode: '0000000000011', source: 'manual', name: 'Thickening tonic', fetchedAt: daysAgo(10) },
    { barcode: '0000000000012', source: 'manual', name: 'Unlisted bottle', fetchedAt: daysAgo(5) },
    { barcode: '0000000000013', source: 'manual', name: 'Leave-in cream', fetchedAt: daysAgo(4) },
  ];
  const earlier = (id: string, ago: number): PhotoSession =>
    session(ANGLES.map((a) => photo(a, { id: `${id}_${a}`, sessionId: id, coverage: area(0.4), quality: GOOD })), {
      id,
      capturedAt: daysAgo(ago),
      isBaseline: id === 's_base',
    });
  const latest = session(
    [
      photo('front', { id: 's3_front', sessionId: 's3', quality: GOOD, coverage: area(0.44, 0.55, 0.58), pose: { yaw: 1, pitch: 0, roll: 0 } }),
      photo('leftTemple', { id: 's3_l', sessionId: 's3', quality: GOOD, coverage: area(0.46), pose: { yaw: -30, pitch: 0, roll: 0 } }),
      photo('rightTemple', { id: 's3_r', sessionId: 's3', quality: GOOD, coverage: area(0.39), pose: { yaw: 29, pitch: 0, roll: 0 } }),
      photo('top', { id: 's3_top', sessionId: 's3', quality: GOOD, coverage: area(0.5) }),
      photo('crown', { id: 's3_crown', sessionId: 's3', quality: GOOD, coverage: area(0.48) }),
    ],
    { id: 's3', capturedAt: daysAgo(0), isBaseline: false },
  );
  const data = dataWith({
    journey: journey({ startedAt: daysAgo(70), createdAt: daysAgo(70), goals: ['crown', 'routineWorking'], trackingAreas: ['crown'], approaches: ['haircare'], noticed: 'twoYears' }),
    routineItems: items,
    routineLogs: logs,
    products,
    // Newest first, as the store keeps them.
    sessions: [latest, earlier('s2', 32), earlier('s_base', 65)],
  });
  return { data, session: latest };
}

const FIXTURES: [string, () => { data: AppData; session: PhotoSession }][] = [
  ['first scan, no segmenter', firstScanNoSegmenter],
  ['first scan, measured', firstScanMeasured],
  ['mature record', matureRecord],
];

const NOW = new Date('2026-09-17T15:00:00.000Z');

function build(fixture: () => { data: AppData; session: PhotoSession }, premium = true): HairScanReportModel {
  const { data, session: s } = fixture();
  return buildHairScanReport(data, s, { premium, now: NOW });
}

/** Every label a tile, a focus block or a quotation may read back — what the person chose, plus the app's own "not answered". */
const KNOWN_LABELS = new Set<string>([
  ...Object.values(HAIR_GOAL_LABELS),
  ...Object.values(ONSET_LABELS),
  ...Object.values(TRACKING_AREA_LABELS),
  ...Object.values(MOTIVATION_LABELS),
  ...Object.values(APPROACH_LABELS),
  COPY.profile.unanswered,
]);

const OUTCOME_WORDS = ['improve', 'prevent', 'restore', 'regrow', 'reverse', 'thicker', 'fuller', 'so that', 'in order to', 'will help', 'helps to', 'promote', 'stimulate', 'boost', 'strengthen'];

/* -------------------------------- shape -------------------------------- */

test('model: every section has real content on a first scan without the segmenter', () => {
  const m = build(firstScanNoSegmenter);
  assert.equal(m.hero.uri, 'file:///front.jpg');
  assert.equal(m.hero.width, 1080);
  assert.match(m.hero.dateLabel, /\d/);
  assert.match(m.hero.dateLabel, / at /);
  assert.deepEqual(m.tabs.map((t) => t.id), ['all', 'hairline', 'temples', 'crown', 'light']);
  assert.deepEqual(m.analysis.rows.map((r) => r.id), ['hairline', 'temples', 'crown', 'light']);
  // Every fixed string the copy file holds for a section reaches the screen through the model, so none is dead.
  assert.equal(m.analysis.subheading, COPY.analysis.subheading);
  assert.deepEqual(m.analysis.marks, { measured: COPY.marks.measured, kept: COPY.marks.kept });
  assert.equal(m.tips.subheading, COPY.tips.subheading);
  assert.equal(m.focus?.heading, COPY.focus.heading);
  assert.equal(m.says.heading, COPY.says.heading);
  assert.equal(m.routine.body, COPY.routine.empty);
  assert.ok(m.strengths.cards.length >= STRENGTHS_MIN && m.strengths.cards.length <= STRENGTHS_MAX);
  assert.equal(m.profile.tiles.length, 4);
  assert.ok(m.focus);
  assert.equal(m.tips.items.length, TIPS_PER_GOAL);
  assert.deepEqual(m.routine.products, []);
  assert.equal(m.routine.moreCount, 0);
  assert.equal(m.says.speaker, 'Tress');
  assert.ok(m.says.body.length > 100);
  assert.deepEqual(
    m.sections.map((s) => s.id),
    ['analysis', 'strengths', 'profile', 'focus', 'tips', 'routine', 'says'],
  );
});

test('model: rows belong to tabs, carry a crop from the frame they describe, and the region labels are places', () => {
  const m = build(firstScanMeasured);
  const [hairline, temples, crown, light] = m.analysis.rows;
  assert.equal(hairline.tab, 'hairline');
  assert.equal(hairline.region, 'hairline');
  assert.equal(hairline.icon, 'hairline');
  assert.equal(hairline.crop?.uri, 'file:///front.jpg');
  assert.deepEqual(hairline.crop?.rect, { x: 0.1, y: 0.05, w: 0.8, h: 0.3 });
  assert.equal(hairline.crop?.approximate, false);
  assert.equal(temples.tab, 'temples');
  assert.equal(temples.icon, 'temple');
  assert.equal(temples.region, 'leftTemple');
  assert.equal(temples.crop?.uri, 'file:///leftTemple.jpg');
  assert.equal(temples.regionLabel, COPY.regions.temples);
  assert.equal(crown.tab, 'crown');
  assert.equal(crown.icon, 'crown');
  assert.equal(crown.region, 'top');
  assert.equal(crown.crop?.uri, 'file:///top.jpg');
  assert.equal(light.tab, 'light');
  assert.equal(light.regionLabel, COPY.regions.light);
  assert.equal(light.icon, 'light', 'the light row has its own icon, not a place');
  assert.equal(light.region, 'hairline', 'and crops the hero at the place its region names');
  assert.equal(light.crop?.uri, 'file:///front.jpg');
  // A frame with no stored regions is still cropped, and the crop says it is approximate.
  const bare = build(() => {
    const f = firstScanMeasured();
    f.session.photos = f.session.photos.map((p) => ({ ...p, regions: undefined }));
    return f;
  });
  assert.equal(bare.analysis.rows[0].crop?.approximate, true);
});

test('model: measured rows print the counted figure; unmeasured rows say what was kept, with no digit', () => {
  const measured = build(firstScanMeasured);
  const [h, t, c] = measured.analysis.rows;
  assert.equal(h.headline, 'Hair covers 52% of the upper third of the front frame.');
  assert.equal(h.measured, true);
  assert.match(h.body, /52% of the top third/);
  assert.match(h.body, /about evenly either side of centre/);
  assert.equal(t.headline, 'Hair covers 38% of the left-side frame and 40% of the right-side frame.');
  assert.match(t.body, /within 2 points/);
  assert.match(t.body, /Turned 33° for the left side and 31° for the right/);
  assert.equal(c.headline, 'In the top frame, 45% of the frame was not counted as hair.');
  assert.match(c.body, /not a scalp measurement/);

  const kept = build(firstScanNoSegmenter);
  const [kh, kt, kc] = kept.analysis.rows;
  assert.equal(kh.headline, 'A front frame was kept: evenly lit, sharp.');
  assert.equal(kh.measured, false, 'light and focus alone do not earn the Measured mark');
  assert.ok(!/\d/.test(kh.headline + kh.body), `no digit on an unmeasured hairline row: ${kh.body}`);
  assert.match(kh.body, /did not run/);
  assert.match(kh.body, /next scan/);
  assert.equal(kt.headline, 'Both side frames were kept.');
  assert.match(kt.body, /Left side evenly lit, sharp; right side evenly lit, sharp/);
  assert.ok(!/\d+%/.test(kt.headline + kt.body), 'no percentage without an area reading');
  assert.equal(kc.headline, 'A top frame was kept: evenly lit, sharp.');
  assert.ok(!/\d/.test(kc.headline + kc.body));

  // A frame with nothing read at all is still a row, still without a digit, and not "measured".
  const bare = build(() => {
    const f = firstScanNoSegmenter();
    f.session.photos = [photo('front'), photo('leftTemple')];
    f.session.scan = undefined;
    return f;
  });
  const [bh, bt, bc] = bare.analysis.rows;
  assert.equal(bh.headline, 'A front frame was kept.');
  assert.equal(bh.measured, false);
  assert.equal(bt.headline, 'Only the left-side frame was kept.');
  assert.equal(bt.region, 'leftTemple');
  assert.equal(bt.measured, false, 'a single side with no area reading is not measured');
  assert.equal(bc.headline, 'No top frame was kept from this turn.');
  assert.equal(bc.crop, null);
  assert.deepEqual(bare.tabs.map((t) => t.id), ['all', 'hairline', 'temples', 'crown'], 'no light tab without a reading');
  for (const row of bare.analysis.rows) assert.ok(!/\d/.test(row.headline + row.body), `${row.id} prints a digit nothing counted`);
});

test('model: "measured" means a hair-area figure is on the row, and nothing weaker', () => {
  const measured = build(firstScanMeasured).analysis.rows;
  assert.deepEqual(
    measured.map((r) => [r.id, r.measured]),
    [['hairline', true], ['temples', true], ['crown', true], ['light', false]],
  );
  const kept = build(firstScanNoSegmenter).analysis.rows;
  assert.ok(kept.every((r) => !r.measured), 'light and focus words alone do not earn the mark');
  // One measured side and one not: the temples row prints no split and is not measured.
  const oneSide = build(() => {
    const f = firstScanMeasured();
    f.session.photos[2] = photo('rightTemple', { quality: GOOD, pose: { yaw: 31, pitch: 0, roll: 0 } });
    return f;
  }).analysis.rows[1];
  assert.equal(oneSide.headline, 'Both side frames were kept.');
  assert.equal(oneSide.measured, false);
  assert.ok(!/\d+%/.test(oneSide.body));
  // Every measured row prints a percentage, and no unmeasured row does.
  for (const m of [measured, kept]) {
    for (const row of m) {
      if (row.id === 'light') continue;
      assert.equal(/\d+%/.test(row.headline), row.measured, `${row.id}: mark and figure disagree`);
    }
  }
});

test('model: a segmenter that ran and found nothing is told apart from one that did not run', () => {
  const empty = build(() => {
    const f = firstScanNoSegmenter();
    // The mask answered on every frame, with too little to print.
    f.session.photos = f.session.photos.map((p) => ({ ...p, coverage: area(0.005, 0.01) }));
    return f;
  });
  const [h, t, c] = empty.analysis.rows;
  for (const row of [h, t, c]) {
    assert.ok(!/did not run/.test(row.body), `${row.id} says the segmenter did not run when it did: ${row.body}`);
    assert.match(row.body, /ran/, `${row.id} says the segmenter ran`);
    assert.match(row.body, /too little/, row.id);
    assert.ok(!/\d+%/.test(row.headline + row.body), `${row.id} prints a figure off an empty mask`);
    assert.equal(row.measured, false);
  }
  assert.match(empty.says.body, /ran but marked too little/);
  assert.ok(!/did not run on this build/.test(empty.says.body));

  const absent = build(firstScanNoSegmenter);
  for (const row of absent.analysis.rows.slice(0, 3)) assert.match(row.body, /did not run/, row.id);
  assert.match(absent.says.body, /did not run on this build/);
});

test('model: the hairline row names a left/right lean only past the noise band', () => {
  const lean = build(() => {
    const f = firstScanMeasured();
    f.session.photos[0] = photo('front', { quality: GOOD, coverage: area(0.41, 0.52, 0.58), pose: { yaw: 2, pitch: -1, roll: 0 } });
    return f;
  });
  assert.match(lean.analysis.rows[0].body, /16 points more to the left of centre/);
  const even = build(firstScanMeasured);
  assert.ok(!/points more to the/.test(even.analysis.rows[0].body));
});

test('model: the temples row names the side with more area, and the turns, past the noise band', () => {
  const m = build(matureRecord);
  const t = m.analysis.rows[1];
  assert.match(t.body, /left-side frame shows more hair area, by 7 points/);
  assert.match(t.body, /Turned 30° for the left side and 29° for the right/);
});

test('model: the light row reads the spread across the frames, and the turn', () => {
  const m = build(firstScanMeasured);
  const light = m.analysis.rows[3];
  assert.equal(light.headline, 'The frames were lit to the same brightness reading, on a scale of 255.');
  assert.match(light.body, /^Light and focus were read on 4 frames, so/);
  assert.match(light.body, /The ring closed to 100%/);
  const close = build(() => {
    const f = firstScanMeasured();
    f.session.photos[1] = { ...f.session.photos[1], quality: { ...GOOD, brightness: 134 } };
    return f;
  });
  assert.equal(close.analysis.rows[3].headline, 'The frames were lit within 6 points of each other on a scale of 255.');

  const mixed = build(() => {
    const f = firstScanMeasured();
    f.session.photos[2] = { ...f.session.photos[2], quality: DARK };
    return f;
  });
  assert.equal(mixed.analysis.rows[3].headline, 'The frames were lit 88 points apart on a scale of 255.');
  assert.match(mixed.analysis.rows[3].body, /could be the light/);
});

/* ------------------------------- strengths ------------------------------ */

test('strengths: a first scan has at least two true positives, and never more than four', () => {
  for (const [name, fixture] of FIXTURES) {
    const cards = build(fixture).strengths.cards;
    assert.ok(cards.length >= STRENGTHS_MIN && cards.length <= STRENGTHS_MAX, `${name}: ${cards.length} cards`);
    assert.equal(new Set(cards.map((c) => c.id)).size, cards.length, `${name}: duplicate cards`);
  }
  const first = build(firstScanNoSegmenter).strengths.cards;
  assert.deepEqual(first.map((c) => c.id), ['light', 'framing', 'coverage']);
  assert.match(first[0].body, /lit to the same brightness reading/);
  const spread = build(() => {
    const f = firstScanNoSegmenter();
    f.session.photos[1] = { ...f.session.photos[1], quality: { ...GOOD, brightness: 120 } };
    return f;
  }).strengths.cards[0];
  assert.match(spread.body, /within 8 points/);
  assert.match(first[1].body, /turned 2° and tipped 1°/);
  assert.match(first[2].body, /ring closed to 100%/);
});

test('strengths: with nothing measured and a stopped turn, the first scan itself is the positive', () => {
  const m = build(() => {
    const f = firstScanNoSegmenter();
    f.session.photos = [photo('front')];
    f.session.scan = { durationMs: 3000, completion: 0.3, frameCount: 2, lighting: null, version: 1 };
    return f;
  });
  assert.deepEqual(m.strengths.cards.map((c) => c.id), ['first', 'device']);
  assert.equal(m.strengths.cards[0].title, 'A first scan on record');
  assert.match(m.strengths.cards[1].body, /Nothing in this report was uploaded/);
});

test('strengths: a mature record earns routine, streak and record cards, capped at four', () => {
  const cards = build(matureRecord).strengths.cards;
  assert.equal(cards.length, STRENGTHS_MAX);
  const ids = cards.map((c) => c.id);
  assert.ok(ids.includes('routine'), ids.join(','));
  assert.ok(ids.includes('streak'));
  assert.ok(!ids.includes('first'), 'a third scan is not a first scan');
  const routine = cards.find((c) => c.id === 'routine')!;
  assert.match(routine.title, /^Routine ticked \d+% of days$/);
  const streak = cards.find((c) => c.id === 'streak')!;
  assert.match(streak.title, /^\d+ days in a row$/);
});

test('strengths: the "scans on record" card counts only sessions the scanner saved', () => {
  // The card's body says every one was taken by the same scanner, so a
  // set from the retired one-angle-at-a-time flow, still in an upgraded
  // install's record, must not be counted into it. A lean record — no
  // light or pose readings, a stopped turn, no routine — so the cap
  // cannot push the card out.
  const bare = (id: string, ago: number, capture: Photo['capture']): PhotoSession => ({
    id,
    journeyId: 'j1',
    capturedAt: daysAgo(ago),
    isBaseline: false,
    photos: [{ ...photo('front', { id: `${id}_front`, sessionId: id }), capture }],
    ...(capture === 'scan' ? { scan: { durationMs: 3000, completion: 0.3, frameCount: 2, lighting: null, version: 1 } } : {}),
  });
  const withOldSet = build(() => {
    const latest = bare('s_new', 0, 'scan');
    return { data: dataWith({ sessions: [latest, bare('s_prev', 30, 'scan'), bare('s_old', 90, 'guided')] }), session: latest };
  });
  const record = withOldSet.strengths.cards.find((c) => c.id === 'record');
  assert.ok(record, 'two scans earn the card');
  assert.equal(record.title, '2 scans on record', 'the old set is not counted');

  const onlyOld = build(() => {
    const latest = bare('s_new', 0, 'scan');
    return { data: dataWith({ sessions: [latest, bare('s_old', 90, 'guided')] }), session: latest };
  });
  assert.ok(!onlyOld.strengths.cards.some((c) => c.id === 'record'), 'one scan beside an old set is not two scans');
  assert.ok(onlyOld.strengths.cards.some((c) => c.id === 'first'), 'it is a first scan');
});

/* -------------------------------- profile ------------------------------- */

test('profile: four tiles, each the label of a choice, never a finding', () => {
  const m = build(firstScanMeasured);
  assert.deepEqual(
    m.profile.tiles.map((t) => [t.id, t.value, t.label]),
    [
      ['goal', 'A stronger-looking hairline', 'Your focus'],
      ['noticed', '6–12 months ago', 'When you noticed'],
      ['watching', 'Hairline', 'What you watch'],
      ['approach', 'Topical treatments', 'Your approach'],
    ],
  );
  for (const tile of m.profile.tiles) assert.ok(KNOWN_LABELS.has(tile.value), `${tile.id} is not a label: ${tile.value}`);

  // No tracking area falls back to the motivation; no answer at all is said to be none.
  const sparse = build(() => {
    const f = firstScanMeasured();
    f.data.journey = journey({ trackingAreas: [], motivations: ['worry'], goals: [], approaches: [], noticed: undefined });
    return f;
  });
  assert.deepEqual(
    sparse.profile.tiles.map((t) => [t.id, t.value]),
    [
      ['goal', 'Not answered'],
      ['noticed', 'Not answered'],
      ['motivation', 'Stop worrying about my hair'],
      ['approach', 'Not answered'],
    ],
  );
  // With no journey at all the tiles still stand, all unanswered.
  const none = build(() => {
    const f = firstScanMeasured();
    f.data.journey = null;
    return f;
  });
  assert.equal(none.profile.tiles.length, 4);
  assert.ok(none.profile.tiles.every((t) => t.value === 'Not answered'));
  assert.equal(none.focus, null);
});

/* --------------------------------- focus -------------------------------- */

test('focus: the goal maps to regions, and the block says whether the turn reached them — never what they show', () => {
  for (const goal of Object.keys(FOCUS_REGIONS) as HairGoal[]) {
    const m = build(() => {
      const f = firstScanMeasured();
      f.data.journey = journey({ goals: [goal] });
      return f;
    });
    const focus = m.focus!;
    assert.ok(focus, goal);
    assert.equal(focus.goalLabel, HAIR_GOAL_LABELS[goal]);
    const regions = FOCUS_REGIONS[goal];
    if (regions === null) {
      assert.equal(focus.statusLabel, 'Not something a scan can see', goal);
      assert.equal(focus.status, 'notVisible', goal);
      assert.deepEqual(focus.regions, []);
      assert.deepEqual(focus.crops, []);
      assert.equal(focus.coverage, 0);
      assert.match(focus.body, /record/, goal);
    } else {
      assert.deepEqual(focus.regions, [...regions], goal);
      assert.ok(focus.coverage >= 0 && focus.coverage <= 1);
      assert.ok(focus.crops.length <= 3);
      assert.ok(focus.crops.every((c) => c.uri.startsWith('file:///')));
      assert.match(focus.body, /reading of it|reached|gives it one/, `${goal}: the block is about coverage, not what the region shows`);
    }
  }

  const hairline = build(firstScanMeasured).focus!;
  assert.equal(hairline.statusLabel, 'Focus area captured');
  assert.equal(hairline.status, 'captured');
  assert.equal(hairline.coverage, 1);
  assert.equal(hairline.framesCaptured, 1);
  assert.equal(hairline.regionsLabel, 'Hairline');
  assert.equal(hairline.crops[0].uri, 'file:///front.jpg');
  assert.match(hairline.body, /coverage of the region, not a reading of it/);

  // A face-on scan cannot reach the back of the head, so the top frame is
  // the one that reaches the crown: the crown goal is captured by it, the
  // one frame is counted once, and the block says how the crown was read.
  const crown = build(() => {
    const f = firstScanMeasured();
    f.data.journey = journey({ goals: ['crown'] });
    return f;
  }).focus!;
  assert.equal(crown.statusLabel, 'Focus area captured');
  assert.equal(crown.coverage, 1);
  assert.equal(crown.framesCaptured, 1, 'one top frame reaches both the crown and the top');
  assert.equal(crown.regionsLabel, 'Crown and Top');
  assert.equal(crown.crops.length, 1, 'the crown and the top share a band on the same frame, shown once');
  assert.equal(crown.crops[0].uri, 'file:///top.jpg');
  assert.match(crown.body, /kept 1 frame covering the crown and top/);
  assert.match(crown.body, /so the crown counts the top frame/);
  assert.ok(!/not reached/.test(crown.body));
  assert.ok(!/Pausing/.test(crown.body));

  // Without a top frame, the crown and the top are both missing, and the fix named is the chin, not a pause.
  const noTop = build(() => {
    const f = firstScanMeasured();
    f.data.journey = journey({ goals: ['crown'] });
    f.session.photos = f.session.photos.filter((p) => p.angle !== 'top');
    return f;
  }).focus!;
  assert.equal(noTop.statusLabel, 'Focus area not captured');
  assert.equal(noTop.status, 'missed');
  assert.equal(noTop.coverage, 0);
  assert.match(noTop.body, /tipping the chin further down/);

  // Every goal a frame can reach is reachable in full from what the scanner produces: front, both sides and the top.
  for (const goal of Object.keys(FOCUS_REGIONS) as HairGoal[]) {
    if (FOCUS_REGIONS[goal] === null) continue;
    const full = build(() => {
      const f = firstScanMeasured();
      f.data.journey = journey({ goals: [goal] });
      return f;
    }).focus!;
    assert.equal(full.statusLabel, 'Focus area captured', goal);
    assert.equal(full.coverage, 1, goal);
  }

  // Several missing places take a plural verb.
  const partly = build(() => {
    const f = firstScanMeasured();
    f.data.journey = journey({ goals: ['fullness'] });
    f.session.photos = [f.session.photos[0]];
    return f;
  }).focus!;
  assert.equal(partly.statusLabel, 'Focus area partly captured');
  assert.equal(partly.status, 'partly');
  assert.match(partly.body, /the left temple, right temple, crown and top were not reached this time/);
  assert.equal(partly.framesCaptured, 1);
  const oneMissing = build(() => {
    const f = firstScanMeasured();
    f.data.journey = journey({ goals: ['fullness'] });
    f.session.photos = f.session.photos.filter((p) => p.angle !== 'rightTemple');
    return f;
  }).focus!;
  assert.match(oneMissing.body, /the right temple was not reached this time/);
  assert.equal(oneMissing.framesCaptured, 3);

  // Nothing reached is said plainly.
  const missed = build(() => {
    const f = firstScanMeasured();
    f.session.photos = [photo('leftTemple', { quality: GOOD })];
    return f;
  }).focus!;
  assert.equal(missed.statusLabel, 'Focus area not captured');
  assert.equal(missed.coverage, 0);
  assert.deepEqual(missed.crops, []);

  // The whole-head goals count all five places; a full mature turn covers them.
  const whole = build(() => {
    const f = matureRecord();
    f.data.journey = journey({ goals: ['fullness'] });
    return f;
  }).focus!;
  assert.equal(whole.coverage, 1);
  assert.equal(whole.framesCaptured, 5);
  assert.equal(whole.crops.length, 3);
});

/* --------------------------------- tips --------------------------------- */

test('tips: four per goal, the goal decides which, and none is a treatment or an outcome', () => {
  for (const goal of Object.keys(HAIR_GOAL_LABELS) as HairGoal[]) {
    const list = TIPS_BY_GOAL[goal];
    assert.equal(list.length, TIPS_PER_GOAL, goal);
    assert.equal(new Set(list.map((t) => t.id)).size, TIPS_PER_GOAL);
    for (const tip of list) {
      assert.ok(tip.kicker.length > 0 && tip.emoji.length > 0 && tip.body.length > 20);
      assert.ok(/^[A-Z]/.test(tip.body), `${tip.id} starts with a capital`);
      assert.ok(/[.]$/.test(tip.body), `${tip.id} ends with a full stop`);
    }
  }
  assert.deepEqual(tipsFor(undefined), [...TIPS_BY_GOAL.overall]);
  assert.deepEqual(tipsFor('crown'), [...TIPS_BY_GOAL.crown]);
  const m = build(firstScanMeasured);
  assert.deepEqual(m.tips.items, [...TIPS_BY_GOAL.hairline]);

  const sentences = tipSentences();
  assertHonest(assert, sentences, 'care notes');
  const text = sentences.join(' ').toLowerCase();
  for (const word of [...HAIR_CLAIMS, 'density', ...OUTCOME_WORDS, 'to prevent', 'to stop', 'minoxidil', 'finasteride', 'treatment', 'blood test']) {
    assert.ok(!text.includes(word), `the care notes must not say "${word}"`);
  }
  // A note is a habit, never a habit-for-a-purpose: no ", so the" purpose clause.
  for (const sentence of sentences) assert.ok(!/, so the\b/.test(sentence), `"${sentence}" is advice with a purpose clause`);
});

/* -------------------------------- routine ------------------------------- */

test('routine: the shelf products, scanned ones with images, the rest counted', () => {
  const first = build(firstScanNoSegmenter).routine;
  assert.deepEqual(first.products, []);
  assert.equal(first.moreCount, 0);
  assert.equal(first.cta, 'Build your routine');

  assert.equal(first.body, COPY.routine.empty);

  const mature = build(matureRecord).routine;
  assert.equal(mature.products.length, 3);
  assert.equal(mature.moreCount, 1);
  assert.equal(mature.body, '4 products on your shelf. The scans are read against what you did, so the list is worth keeping current.');
  const shampoo = mature.products.find((p) => p.id === '5601059062534')!;
  assert.equal(shampoo.imageUri, 'https://images.openbeautyfacts.org/x.200.jpg');
  assert.equal(shampoo.name, 'Gentle shampoo');
  const typed = mature.products.find((p) => p.id === '0000000000011')!;
  assert.equal(typed.imageUri, null, 'a typed product has no picture: the screen draws a placeholder');
  // Linked products come first, as the shelf orders them.
  assert.ok(mature.products.slice(0, 2).every((p) => ['5601059062534', '0000000000011'].includes(p.id)));
});

/* --------------------------------- says --------------------------------- */

test('says: three or four sentences, addressed by name, quoting the goal, saying what was kept and when the next scan is due', () => {
  const measured = build(firstScanMeasured).says.body;
  const sentences = measured.split(/(?<=[.])\s+/);
  assert.ok(sentences.length >= 3 && sentences.length <= 4, `${sentences.length} sentences: ${measured}`);
  assert.match(measured, /^Sam, this scan kept 4 frames from your turn: the front, both sides and the top\./);
  assert.match(measured, /“a stronger-looking hairline”/);
  assert.match(measured, /the front frame is the part of the record to watch/);
  assert.match(measured, /ran on every one of them/);
  assert.match(measured, /The next scan is due in \d+ days: taken in the same light/);
  assert.match(measured, /it is the first one this can be laid beside\.$/, 'one scan on record: the next is the first comparison');
  assert.ok(!measured.includes('!'));

  const kept = build(firstScanNoSegmenter).says.body;
  assert.match(kept, /did not run on this build/);
  assert.match(kept, /no figure was invented/);

  const { data, session: s } = matureRecord();
  const mature = reportSummary(data, s, undefined, NOW);
  assert.match(mature, /^This scan kept 5 frames/);
  assert.match(mature, /“more density at the crown”/);
  assert.match(mature, /the top frame is the part of the record to watch/);
  // Three scans on record: the next one is not the first comparison, and the sentence must not say it is.
  assert.match(mature, /it goes beside the 3 already on record\.$/);
  assert.ok(!mature.includes('first one this can be laid beside'));

  const shedding = reportSummary({ ...data, journey: journey({ goals: ['shedding'] }) }, s, '  ', NOW);
  assert.match(shedding, /which a photograph cannot count/);
  assert.match(shedding, /^This scan/, 'a blank name is dropped, not printed');

  const noJourney = reportSummary({ ...data, journey: null }, s, 'Sam', NOW);
  assert.match(noJourney, /have not picked a focus yet/);
  // No journey means no due date; with three scans on record the next is not "a second scan".
  assert.match(noJourney, /Another scan, taken in the same light at the same distance, goes beside the 3 already on record\.$/);
  const { data: firstData, session: firstSession } = firstScanNoSegmenter();
  const noJourneyFirst = reportSummary({ ...firstData, journey: null }, firstSession, 'Sam', NOW);
  assert.match(noJourneyFirst, /A second scan, taken in the same light/);

  const empty = reportSummary(data, { ...s, photos: [] }, 'Sam', NOW);
  assert.match(empty, /kept no frames from your turn/);
  assert.ok(!/hair-area reading/.test(empty));
});

/* -------------------------------- locking ------------------------------- */

test('locking: without Premium the rows, focus, tips and routine are locked and everything else is free', () => {
  for (const [name, fixture] of FIXTURES) {
    const free = build(fixture, false);
    assert.ok(free.analysis.rows.every((r) => r.locked), `${name}: a free row`);
    assert.equal(free.focus?.locked, true, name);
    assert.equal(free.tips.locked, true, name);
    assert.equal(free.routine.locked, true, name);
    // The locked rows keep their real headline: the screen shows the first and blurs the bodies.
    const paid = build(fixture, true);
    assert.deepEqual(free.analysis.rows.map((r) => r.headline), paid.analysis.rows.map((r) => r.headline), name);
    assert.deepEqual(free.strengths, paid.strengths, `${name}: strengths are free`);
    assert.deepEqual(free.profile, paid.profile, `${name}: the profile is free`);
    assert.deepEqual(free.says, paid.says, `${name}: the paragraph is free`);
    assert.deepEqual(free.hero, paid.hero);

    assert.ok(paid.analysis.rows.every((r) => !r.locked), `${name}: a locked row for Premium`);
    assert.equal(paid.focus?.locked, false);
    assert.equal(paid.tips.locked, false);
    assert.equal(paid.routine.locked, false);
  }
});

/* --------------------------- the honesty sweep -------------------------- */

test('honesty: the fixed copy of the report describes images and a record, never a head', () => {
  const sentences = reportCopySentences();
  assert.ok(sentences.some((s) => s === COPY.strengths.heading));
  assert.ok(sentences.includes(COPY.focus.capturedBody('leftTemple', 7)), 'the model copy reaches the sweep, functions included');
  assertHonest(assert, sentences, 'report copy');
  const text = sentences.join(' ').toLowerCase();
  for (const claim of [...HAIR_CLAIMS, 'density', 'receding', 'recession', 'losing', 'follicle', ...OUTCOME_WORDS]) {
    assert.ok(!text.includes(claim), `the report copy must not say "${claim}"`);
  }
});

for (const [name, fixture] of FIXTURES) {
  for (const premium of [true, false]) {
    test(`honesty: the ${name} report${premium ? '' : ' (free)'} says nothing about a head, and reads answers back only as quotations`, () => {
      const model = build(fixture, premium);
      const sentences = reportModelSentences(model);
      assert.ok(sentences.length >= 30, `only ${sentences.length} sentences reached the sweep`);
      assertHonest(assert, sentences, `report model (${name})`);
      const text = sentences.join(' ').toLowerCase();
      for (const claim of [...HAIR_CLAIMS, 'density', 'receding', 'recession', 'losing', 'follicle', ...OUTCOME_WORDS]) {
        assert.ok(!text.includes(claim), `the ${name} report must not say "${claim}"`);
      }
      for (const sentence of sentences) {
        assert.ok(!/\b(before|after)\b/i.test(sentence), `"${sentence}" promises a comparison`);
      }

      // Every quotation is something the record holds: a label they chose, or a product name as stored.
      const { data } = fixture();
      const owned = new Set<string>([...KNOWN_LABELS, ...data.products.map((p) => p.name)]);
      const lowered = new Set([...owned].map((s) => s.toLowerCase()));
      for (const q of reportModelQuotes(model)) {
        assert.ok(owned.has(q) || lowered.has(q.toLowerCase()), `${name}: "${q}" is read back but is nothing they chose`);
      }
      // And the paragraph's quotations are all accounted for.
      assert.deepEqual(quotedSpans(model.says.body).filter((q) => !lowered.has(q.toLowerCase())), []);
      assert.ok(!stripQuotes(model.says.body).includes('“'));
    });
  }
}

test('honesty: a percentage appears on a row only when an area reading is behind it', () => {
  for (const [name, fixture] of FIXTURES) {
    const { session: s } = fixture();
    const model = build(fixture);
    for (const row of model.analysis.rows) {
      if (row.id === 'light') continue;
      const printed = /\d+%/.test(row.headline + row.body);
      const counted = s.photos.some((p) => p.coverage !== undefined);
      if (printed) assert.ok(counted, `${name}/${row.id} prints a percentage nothing counted`);
    }
  }
});

test('honesty: the sweep is not vacuous — the raw report really does carry a label the sweep forbids', () => {
  const model = build(matureRecord);
  assert.ok(model.profile.tiles.some((t) => /density/i.test(t.value)), 'the crown goal reads back its own label');
  assert.match(model.says.body, /density/);
  assert.ok(!/density/.test(stripQuotes(model.says.body)), 'and it is a quotation');
  assert.ok(model.routine.products.some((p) => /Thickening/.test(p.name)), 'a typed product name is read back verbatim');
});
