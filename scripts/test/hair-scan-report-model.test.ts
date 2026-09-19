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
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { profileSentence } from '@/features/coach/report-summary';
import {
  CARD_ORDER,
  CONTRAST_POINTS,
  FOCUS_REGIONS,
  GOAL_SCAN_REGIONS,
  HAIRSTYLE_TILES,
  STRENGTHS_MAX,
  STRENGTHS_MIN,
  SYMMETRY_POINTS,
  WATCH_MAX,
  buildHairScanReport,
  reportModelQuotes,
  reportModelSentences,
  type HairScanReportModel,
} from '@/features/hair-scan/report-model';
import { SCAN_REGIONS, compareScans } from '@/features/hair-scan/measure';
import { HAIRSTYLE_CATALOGUE, HAIRSTYLE_COPY, hairstylesFor } from '@/features/hairstyles';
import { HAIR_SCAN_REPORT_MODEL_COPY as COPY, quotedSpans, reportCopySentences, stripQuotes } from '@/features/hair-scan/report-copy';
import { reminderOfferInterval } from '@/features/hair-scan/result';
import {
  PROFILE_TIPS,
  PROFILE_TIPS_MAX,
  TIPS_BY_GOAL,
  TIPS_PER_GOAL,
  tipProfileOf,
  tipSentences,
  tipsFor,
  tipsForProfile,
} from '@/features/hair-scan/tips';
import { toDateKey } from '@/lib/date';
import {
  ANGLES,
  APPROACH_LABELS,
  EMPTY_DATA,
  HAIR_CONCERN_LABELS,
  HAIR_GOAL_LABELS,
  HAIR_TYPE_LABELS,
  HEAT_STYLING_LABELS,
  INGREDIENT_REACTION_LABELS,
  MOTIVATION_LABELS,
  ONSET_LABELS,
  SCALP_SENSITIVITY_LABELS,
  SCALP_TYPE_LABELS,
  TRACKING_AREA_LABELS,
  type Angle,
  type AppData,
  type HairGoal,
  type Journey,
  type Photo,
  type PhotoCoverage,
  type PhotoQuality,
  type PhotoSession,
  type PhotoSessionMeasurement,
  type PhotoSessionRegionChange,
  type PhotoSessionRegionMeasurement,
  type Product,
  type ScanMeasureRegion,
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

/* --------------------------- the measurement ---------------------------- */

/**
 * One region as the measurement engine records it.
 *
 * Four frames, a narrow spread and a high confidence unless a test says
 * otherwise, because those are the conditions under which the report is
 * allowed to say anything at all — a test that wants a refusal asks for
 * one explicitly rather than getting it by accident off a default.
 */
function region(
  name: ScanMeasureRegion,
  coverage: number,
  visibleScalp: number,
  overrides: Partial<PhotoSessionRegionMeasurement> = {},
): PhotoSessionRegionMeasurement {
  return {
    region: name,
    coverage,
    visibleScalp,
    frames: 4,
    spread: 0.02,
    confidence: 0.8,
    anchoring: 'landmarks',
    ...overrides,
  };
}

function measured(
  regions: PhotoSessionRegionMeasurement[],
  unread: ScanMeasureRegion[] = [],
  capturedAt = '2026-09-17T13:59:00.000Z',
): PhotoSessionMeasurement {
  return {
    regions: Object.fromEntries(regions.map((r) => [r.region, r])),
    unread,
    capturedAt,
  };
}

/**
 * The reading behind `firstScanMeasured`: five of the six places read,
 * the part line refused. Chosen so the report has something true to say
 * in every measured section — a clear widest gap (hairline 72 against
 * crown 44), two temples inside the symmetry band, and one region whose
 * visible scalp leads the next by more than `CONTRAST_POINTS`.
 */
const READING: PhotoSessionRegionMeasurement[] = [
  region('hairline', 0.72, 0.1),
  region('leftTemple', 0.61, 0.18),
  region('rightTemple', 0.58, 0.21),
  region('midScalp', 0.55, 0.3),
  region('crown', 0.44, 0.41),
];

/** The same head, a scan earlier, for a comparison to be made against. */
const EARLIER_READING: PhotoSessionRegionMeasurement[] = [
  region('hairline', 0.71, 0.11),
  region('leftTemple', 0.6, 0.19),
  region('rightTemple', 0.57, 0.22),
  region('midScalp', 0.54, 0.31),
  region('crown', 0.62, 0.24),
];

/** A crown that moved further than the two scans' own margin of error, as the engine records it. */
const CROWN_CHANGE: PhotoSessionRegionChange = {
  region: 'crown',
  delta: -0.18,
  noiseFloor: 0.06,
  verdict: 'moderate',
  confidence: 0.8,
  anchoring: 'same',
};

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

/** The same first scan, every frame measured and the engine's reading on the record. */
function firstScanMeasured(): { data: AppData; session: PhotoSession } {
  const s = session(
    [
      photo('front', { quality: GOOD, coverage: area(0.41, 0.52, 0.5), pose: { yaw: 2, pitch: -1, roll: 0 } }),
      photo('leftTemple', { quality: GOOD, coverage: area(0.38), pose: { yaw: -33, pitch: 0, roll: 0 } }),
      photo('rightTemple', { quality: GOOD, coverage: area(0.4), pose: { yaw: 31, pitch: 0, roll: 0 } }),
      photo('top', { quality: GOOD, coverage: area(0.55), pose: { yaw: 0, pitch: -30, roll: 0 } }),
    ],
    {
      scan: {
        durationMs: 14_200,
        completion: 1,
        frameCount: 23,
        lighting: 0.8,
        measurement: measured(READING, ['partLine']),
        version: 1,
      },
    },
  );
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
      scan: {
        durationMs: 14_200,
        completion: 1,
        frameCount: 23,
        lighting: 0.8,
        measurement: measured(EARLIER_READING, [], daysAgo(ago)),
        version: 1,
      },
    });
  const latest = session(
    [
      photo('front', { id: 's3_front', sessionId: 's3', quality: GOOD, coverage: area(0.44, 0.55, 0.58), pose: { yaw: 1, pitch: 0, roll: 0 } }),
      photo('leftTemple', { id: 's3_l', sessionId: 's3', quality: GOOD, coverage: area(0.46), pose: { yaw: -30, pitch: 0, roll: 0 } }),
      photo('rightTemple', { id: 's3_r', sessionId: 's3', quality: GOOD, coverage: area(0.39), pose: { yaw: 29, pitch: 0, roll: 0 } }),
      photo('top', { id: 's3_top', sessionId: 's3', quality: GOOD, coverage: area(0.5) }),
      photo('crown', { id: 's3_crown', sessionId: 's3', quality: GOOD, coverage: area(0.48) }),
    ],
    {
      id: 's3',
      capturedAt: daysAgo(0),
      isBaseline: false,
      scan: {
        durationMs: 14_200,
        completion: 1,
        frameCount: 23,
        lighting: 0.8,
        measurement: measured(READING, ['partLine'], daysAgo(0)),
        changes: [CROWN_CHANGE],
        version: 1,
      },
    },
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

/**
 * A journey from the current funnel: every self-knowledge question
 * answered. The same first scan as `firstScanMeasured`, so the only
 * thing that differs between the two reports is what the person said.
 */
function newFunnelJourney(): Journey {
  return journey({
    goals: ['overall'],
    hairType: 'wavy',
    scalpType: 'oily',
    scalpSensitivity: 'sensitive',
    concerns: ['frizz', 'dandruff'],
    budget: 'midRange',
    productFactors: ['sulfateFree', 'fragranceFree'],
    ingredientReactions: ['fragrance'],
    scalpConditions: ['none'],
    lifeFactors: ['none'],
    heatStyling: 'daily',
  });
}

function newFunnelRecord(): { data: AppData; session: PhotoSession } {
  const f = firstScanMeasured();
  f.data.journey = newFunnelJourney();
  return f;
}

const FIXTURES: [string, () => { data: AppData; session: PhotoSession }][] = [
  ['first scan, no segmenter', firstScanNoSegmenter],
  ['first scan, measured', firstScanMeasured],
  ['mature record', matureRecord],
  ['new funnel, first scan', newFunnelRecord],
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
  ...Object.values(HAIR_TYPE_LABELS),
  ...Object.values(SCALP_TYPE_LABELS),
  ...Object.values(SCALP_SENSITIVITY_LABELS),
  ...Object.values(HAIR_CONCERN_LABELS),
  ...Object.values(HEAT_STYLING_LABELS),
  ...Object.values(INGREDIENT_REACTION_LABELS),
  COPY.profile.unanswered,
]);

const OUTCOME_WORDS = ['improve', 'prevent', 'restore', 'regrow', 'reverse', 'thicker', 'fuller', 'so that', 'in order to', 'will help', 'helps to', 'promote', 'stimulate', 'boost', 'strengthen'];

/* -------------------------------- shape -------------------------------- */

test('model: a scan with no measurement is an honest absence, not a page of zeroes', () => {
  const m = build(firstScanNoSegmenter);
  assert.equal(m.availability, 'unavailable');
  assert.equal(m.hero.uri, 'file:///front.jpg');
  assert.equal(m.hero.width, 1080);
  assert.match(m.hero.dateLabel, /\d/);
  assert.match(m.hero.dateLabel, / at /);

  // The whole analysis half is empty, and the assessment carries the words and the way out.
  assert.equal(m.assessment.overall, null);
  assert.equal(m.assessment.overallConfidence, null);
  assert.equal(m.assessment.summary, null);
  assert.deepEqual(m.assessment.regions, []);
  assert.equal(m.assessment.unavailable?.title, COPY.assessment.unavailableTitle);
  assert.equal(m.assessment.unavailable?.cta, COPY.assessment.unavailableCta);
  assert.deepEqual(m.cards.cards, []);
  assert.equal(m.scalpVisibility, null);
  assert.equal(m.symmetry, null);
  assert.deepEqual(m.changed.sinceLast, []);
  assert.deepEqual(m.changed.sinceBaseline, []);
  assert.deepEqual(m.watch.items, []);
  assert.equal(m.watch.body, null, 'nothing "stands out" on a scan that was never read');
  // No figure anywhere in the analysis half, invented or otherwise.
  const analysisHalf = [
    m.assessment.unavailable?.title ?? '',
    m.assessment.unavailable?.body ?? '',
    m.assessment.unavailable?.cta ?? '',
  ].join(' ');
  assert.ok(!/\d/.test(analysisHalf), analysisHalf);
  // And no paragraph pretending a reading was taken.
  assert.equal(m.says.body, '');

  // The rest of the report is a real report: the frames were still kept, read and filed.
  assert.deepEqual(m.tabs.map((t) => t.id), ['all', 'hairline', 'temples', 'crown', 'light']);
  assert.deepEqual(m.quality.rows.map((r) => r.id), ['hairline', 'temples', 'crown', 'light']);
  assert.equal(m.quality.subheading, COPY.quality.subheading);
  assert.equal(m.quality.summary, '4 frames kept, covering 4 regions of the head.');
  assert.deepEqual(m.quality.marks, { measured: COPY.marks.measured, kept: COPY.marks.kept });
  assert.equal(m.analysis, m.quality, 'the former name points at the same block');
  assert.equal(m.focus, m.goal, 'and so does the goal block’s');
  assert.equal(m.tips.subheading, COPY.tips.subheading);
  assert.equal(m.goal?.heading, COPY.focus.heading);
  assert.equal(m.says.heading, COPY.says.heading);
  assert.equal(m.routine.body, COPY.routine.empty);
  assert.ok(m.strengths.cards.length >= STRENGTHS_MIN && m.strengths.cards.length <= STRENGTHS_MAX);
  assert.equal(m.profile.tiles.length, 4);
  assert.equal(m.tips.items.length, TIPS_PER_GOAL);
  assert.deepEqual(m.routine.products, []);
  assert.equal(m.routine.moreCount, 0);
  assert.equal(m.says.speaker, 'Tress');
  // The hairstyles block: three catalogue drawings for the record and the way to the rest — and nothing the section does not draw.
  assert.equal(m.hairstyles.tiles.length, HAIRSTYLE_TILES);
  assert.equal(m.hairstyles.heading, HAIRSTYLE_COPY.report.heading);
  assert.equal(m.hairstyles.subheading, HAIRSTYLE_COPY.report.subheading);
  assert.equal(m.hairstyles.cta, HAIRSTYLE_COPY.report.cta);
  assert.deepEqual(m.hairstyles.tiles.map((t) => t.id), hairstylesFor(firstScanNoSegmenter().data).slice(0, HAIRSTYLE_TILES).map((s) => s.id));
  assert.deepEqual(Object.keys(m.hairstyles).sort(), ['cta', 'hairTypeLabel', 'heading', 'locked', 'subheading', 'tiles'], 'no dead payload on the block');
  for (const tile of m.hairstyles.tiles) assert.deepEqual(Object.keys(tile).sort(), ['id', 'image', 'name'], 'a tile is a drawing and a name');
  // Neither the paragraph nor any measured section is walked to.
  assert.deepEqual(
    m.sections.map((s) => s.id),
    ['assessment', 'focus', 'quality', 'tips', 'routine', 'hairstyles'],
  );
});

test('model: a measured scan leads with the assessment and ends on the hairstyles', () => {
  const m = build(firstScanMeasured);
  assert.equal(m.availability, 'measured');
  assert.deepEqual(
    m.sections.map((s) => s.id),
    ['assessment', 'cards', 'scalp', 'symmetry', 'changed', 'watch', 'focus', 'quality', 'says', 'tips', 'routine', 'hairstyles'],
  );
  assert.equal(m.sections[0].label, COPY.sections.assessment);
  assert.equal(m.sections[m.sections.length - 1].label, HAIRSTYLE_COPY.report.sectionLabel);
  // The symmetry section is drawn whichever way the pair came out; "even"
  // is a finding, and leaving it out would show the section only when
  // there was something to be uneasy about.
  assert.equal(m.symmetry?.balanced, true);
  assert.equal(m.symmetry?.differencePoints, 3);
});

test('hairstyles: the block reads the hair type back as a label, never into a sentence, and its drawings are the catalogue’s', () => {
  const typed = build(newFunnelRecord);
  assert.equal(typed.hairstyles.hairTypeLabel, HAIR_TYPE_LABELS.wavy, 'the label of the choice, verbatim');
  assert.ok(reportModelQuotes(typed).includes(HAIR_TYPE_LABELS.wavy), 'and it is a quotation');
  for (const tile of typed.hairstyles.tiles) {
    const entry = HAIRSTYLE_CATALOGUE.find((s) => s.id === tile.id);
    assert.ok(entry, `${tile.id} is in the catalogue`);
    assert.equal(tile.image, entry.image, 'the drawing is the catalogue’s, not a frame');
    assert.ok(entry.hairTypes.includes('wavy'), `${tile.id} is cut on wavy hair`);
    assert.equal(tile.name, entry.name);
  }
  // No hair type on the record: no label, and the cuts drawn for everybody.
  const untyped = build(firstScanNoSegmenter);
  assert.equal(untyped.hairstyles.hairTypeLabel, null);
  for (const tile of untyped.hairstyles.tiles) {
    assert.equal(HAIRSTYLE_CATALOGUE.find((s) => s.id === tile.id)?.gender, 'any');
  }
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
  /*
    BOTH temples, not one. The scan asks for four photographs and the
    report used to show three of them: the temples row cut its crop from
    whichever side happened to exist and, when both did, always from the
    left — so the right temple was photographed, measured, filed and
    never shown. A row about two places carries two pictures.
  */
  assert.equal(temples.crop2?.uri, 'file:///rightTemple.jpg');
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
  const [kh, kt, kc] = kept.quality.rows;
  assert.equal(kh.headline, 'A front frame was kept: evenly lit, sharp.');
  assert.equal(kh.measured, false, 'light and focus alone do not earn the Measured mark');
  assert.ok(!/\d/.test(kh.headline + kh.body), `no digit on an unmeasured hairline row: ${kh.body}`);
  assert.match(kh.body, /No hair-area figure was read/);
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

test('model: no row anywhere reaches for the debugging vocabulary the owner struck out', () => {
  /*
    The report used to explain itself in the words of its own
    implementation — "the hair-area reading needs the on-device
    segmenter, which did not run on these frames". Nobody outside this
    repository knows what a segmenter is, and somebody who has just
    photographed their own head does not want to be told about one. The
    words are gone, from both vocabularies, and this is what keeps them
    gone.
  */
  const forbidden = /segmenter|on-device mask|the mask (marked|did not|was)|did not run/i;
  for (const sentence of reportCopySentences()) {
    assert.doesNotMatch(sentence, forbidden, sentence);
  }
  for (const [name, fixture] of FIXTURES) {
    for (const premium of [true, false]) {
      for (const sentence of reportModelSentences(build(fixture, premium))) {
        assert.doesNotMatch(sentence, forbidden, `${name}: ${sentence}`);
      }
    }
  }

  // The rows still tell a frame that was never read apart from one that
  // was read and held too little to print — the distinction is real and
  // the words for it are now plain.
  const empty = build(() => {
    const f = firstScanNoSegmenter();
    f.session.photos = f.session.photos.map((p) => ({ ...p, coverage: area(0.005, 0.01) }));
    return f;
  });
  for (const row of empty.quality.rows.slice(0, 3)) {
    assert.match(row.body, /Too little/, row.id);
    assert.ok(!/\d+%/.test(row.headline + row.body), `${row.id} prints a figure off an empty reading`);
    assert.equal(row.measured, false);
  }
  const absent = build(firstScanNoSegmenter);
  for (const row of absent.quality.rows.slice(0, 3)) {
    assert.match(row.body, /No hair-area figure was read/, row.id);
  }
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
  assert.match(light.body, /held frames from \d+ regions of the head/);
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
  assert.match(first[2].body, /four steps held frames from \d+ regions/);
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

  // The current funnel: the goal, then how they described their hair, their scalp and its sensitivity.
  const current = build(newFunnelRecord);
  assert.deepEqual(
    current.profile.tiles.map((t) => [t.id, t.value, t.label]),
    [
      ['goal', 'Better-looking overall hair', 'Your focus'],
      ['hairType', 'Wavy', 'Your hair type'],
      ['scalpType', 'Oily', 'Your scalp'],
      ['sensitivity', 'Sensitive', 'Scalp sensitivity'],
    ],
  );
  for (const tile of current.profile.tiles) assert.ok(KNOWN_LABELS.has(tile.value), `${tile.id} is not a label: ${tile.value}`);

  // Every glyph a tile names is one the section draws by name, so no tile falls back to the generic mark.
  const section = readFileSync(new URL('../../src/components/hair-scan/report-sections/profile.tsx', import.meta.url), 'utf8');
  const drawn = new Set([...section.match(/TILE_ICONS: readonly IconName\[\] = \[([^\]]*)\]/)![1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]));
  for (const [name, fixture] of FIXTURES) {
    for (const tile of build(fixture).profile.tiles) assert.ok(drawn.has(tile.icon), `${name}: ${tile.id} names ${tile.icon}, which the section does not draw`);
  }

  // A value off disk the app never offered reads as unanswered, and the older answer takes the tile.
  const corrupt = build(() => {
    const f = newFunnelRecord();
    f.data.journey = { ...newFunnelJourney(), hairType: 'mullet' as unknown as Journey['hairType'], noticed: 'months' };
    return f;
  });
  assert.deepEqual(corrupt.profile.tiles[1], { id: 'noticed', icon: 'calendar', value: 'A few months ago', label: 'When you noticed' });

  // No tracking area falls back to the motivation; no answer at all is said to be none — under the current question.
  const sparse = build(() => {
    const f = firstScanMeasured();
    f.data.journey = journey({ trackingAreas: [], motivations: ['worry'], goals: [], approaches: [], noticed: undefined });
    return f;
  });
  assert.deepEqual(
    sparse.profile.tiles.map((t) => [t.id, t.value]),
    [
      ['goal', 'Not answered'],
      ['hairType', 'Not answered'],
      ['motivation', 'Stop worrying about my hair'],
      ['sensitivity', 'Not answered'],
    ],
  );
  // With no journey at all the tiles still stand, all unanswered.
  const none = build(() => {
    const f = firstScanMeasured();
    f.data.journey = null;
    return f;
  });
  assert.equal(none.profile.tiles.length, 4);
  assert.deepEqual(none.profile.tiles.map((t) => t.id), ['goal', 'hairType', 'scalpType', 'sensitivity']);
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
  // The profile notes reach the same sweep as the goal notes.
  for (const tip of Object.values(PROFILE_TIPS)) {
    assert.ok(sentences.includes(tip.body), `${tip.id} is swept`);
    assert.ok(/^[A-Z]/.test(tip.body) && /[.]$/.test(tip.body), tip.id);
  }
});

test('tips: the self-knowledge answers choose up to two notes, the goal the rest, one note per topic', () => {
  // Nothing answered beyond the goal: exactly the goal's four, and nothing shaped them.
  const plain = tipsForProfile({ goal: 'hairline' });
  assert.deepEqual(plain.items, [...TIPS_BY_GOAL.hairline]);
  assert.equal(plain.shapedBy, null);
  assert.deepEqual(tipsForProfile({}).items, [...TIPS_BY_GOAL.overall]);
  assert.deepEqual(tipsForProfile(tipProfileOf(null)).items, [...TIPS_BY_GOAL.overall]);

  // Heat most days and a fragrance reaction: those two lead, then the goal fills in without repeating a topic.
  const shaped = tipsForProfile({ goal: 'overall', heatStyling: 'daily', ingredientReactions: ['fragrance'], scalpType: 'oily' });
  assert.equal(shaped.items.length, TIPS_PER_GOAL);
  assert.deepEqual(shaped.items.slice(0, PROFILE_TIPS_MAX).map((t) => t.id), ['heat_often', 'reaction_fragrance']);
  assert.ok(!shaped.items.some((t) => t.id === 'overall_2'), 'the goal\'s own heat note is the same topic, shown once');
  assert.ok(!shaped.items.some((t) => t.id === 'scalp_oily'), 'the profile chooses at most two');
  assert.equal(new Set(shaped.items.map((t) => t.kicker.toLowerCase())).size, TIPS_PER_GOAL, 'one note per topic');
  assert.deepEqual(shaped.shapedBy, { kind: 'heat', label: 'Daily' });

  // Heat weekly or less earns no heat note; a normal scalp earns none; a scalp that has not reacted earns none.
  for (const heat of ['weekly', 'rarely', 'never'] as const) {
    assert.ok(!tipsForProfile({ goal: 'overall', heatStyling: heat }).items.some((t) => t.id === 'heat_often'), heat);
  }
  assert.equal(tipsForProfile({ goal: 'crown', scalpType: 'normal', scalpSensitivity: 'notSensitive' }).shapedBy, null);

  // "A few times a week" earns the same heat note as "Daily", so the note must not restate either frequency as theirs.
  const fewTimes = tipsForProfile({ goal: 'overall', heatStyling: 'fewTimesWeek' });
  assert.equal(fewTimes.items[0].id, 'heat_often');
  assert.deepEqual(fewTimes.shapedBy, { kind: 'heat', label: 'A few times a week' });
  assert.doesNotMatch(PROFILE_TIPS.heatOften.body, /daily|most days|every day|times a week|weekly/i, PROFILE_TIPS.heatOften.body);

  // A sensitive scalp, and each scalp type, brings its own note.
  assert.equal(tipsForProfile({ goal: 'crown', scalpSensitivity: 'sensitive' }).items[0].id, 'scalp_sensitive');
  assert.equal(tipsForProfile({ goal: 'crown', scalpType: 'dry' }).items[0].id, 'scalp_dry');
  assert.equal(tipsForProfile({ goal: 'crown', scalpType: 'combination' }).items[0].id, 'scalp_combination');
  assert.deepEqual(tipsForProfile({ goal: 'crown', scalpType: 'oily' }).shapedBy, { kind: 'scalpType', label: 'Oily' });

  // A concern brings a habit for it, and never a second note on a topic the goal already covers.
  const concerned = tipsForProfile({ goal: 'lessBreakage', concerns: ['breakage', 'frizz'] });
  assert.equal(concerned.items.filter((t) => t.kicker === 'Wet hair').length, 1);
  assert.ok(concerned.items.some((t) => t.id === 'concern_frizz'));
  assert.deepEqual(concerned.shapedBy, { kind: 'concern', label: 'Breakage' });
  for (const concern of ['dandruff', 'itchOrIrritation'] as const) {
    assert.ok(tipsForProfile({ goal: 'fullerPonytail', concerns: [concern] }).items.some((t) => t.id === 'concern_scalp'), concern);
  }
  assert.equal(tipsForProfile({ goal: 'crown', concerns: ['greying'] }).shapedBy, null, 'a concern with no habit for it changes nothing');

  // Always four, never a note twice, whatever the combination.
  const everything = tipsForProfile({
    goal: 'crown', heatStyling: 'fewTimesWeek', ingredientReactions: ['fragrance', 'sulfates'],
    scalpSensitivity: 'sensitive', scalpType: 'dry', concerns: ['dryness', 'frizz', 'shedding', 'moreScalpShowing'],
  });
  assert.equal(everything.items.length, TIPS_PER_GOAL);
  assert.equal(new Set(everything.items.map((t) => t.id)).size, TIPS_PER_GOAL);

  // The report reads the journey through the same call, validated, so a value the app never offered is ignored.
  const m = build(newFunnelRecord);
  assert.equal(m.tips.items.length, TIPS_PER_GOAL);
  assert.deepEqual(m.tips.items.slice(0, 2).map((t) => t.id), ['heat_often', 'reaction_fragrance']);
  const off = tipProfileOf({ ...newFunnelJourney(), heatStyling: 'always' as unknown as Journey['heatStyling'], concerns: 'frizz' as unknown as Journey['concerns'] });
  assert.equal(off.heatStyling, undefined);
  assert.deepEqual(off.concerns, []);
});

/* -------------------------------- routine ------------------------------- */

test('routine: the shelf products, drawn as placeholders, the rest counted', () => {
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
  assert.equal(shampoo.name, 'Gentle shampoo');
  /*
    The barcode scanner and the lookup behind it are gone. The record in
    this fixture is a leftover from that era and still carries the address
    of a photo on the database's image server; the shelf no longer passes
    it on, so the tile draws its placeholder and the report makes no
    network request to fill it. Both products read the same way now.
  */
  assert.equal(shampoo.imageUri, null, 'no remote product photo reaches the report');
  const typed = mature.products.find((p) => p.id === '0000000000011')!;
  assert.equal(typed.imageUri, null, 'a typed product has no picture: the screen draws a placeholder');
  // Linked products come first, as the shelf orders them.
  assert.ok(mature.products.slice(0, 2).every((p) => ['5601059062534', '0000000000011'].includes(p.id)));
});

/* --------------------------------- says --------------------------------- */

test('says: the paragraph is the measurement read back, and there is none without one', () => {
  /*
    The paragraph belongs to features/coach/report-summary.ts and its
    wording is pinned in scripts/test/coach.test.ts, which owns that
    file. What is held HERE is the handshake the report depends on: the
    model hands the coach the findings it has already worked out, the
    coach hands back a paragraph, and with no measurement there is no
    paragraph and no section for one.
  */
  const measuredModel = build(firstScanMeasured);
  assert.ok(measuredModel.says.body.length > 100, measuredModel.says.body);
  assert.ok(!measuredModel.says.body.includes('!'));
  assert.ok(measuredModel.sections.some((sec) => sec.id === 'says'));
  // Every quotation in it is the person's own answer, read back.
  const lowered = new Set([...KNOWN_LABELS].map((l) => l.toLowerCase()));
  assert.deepEqual(
    quotedSpans(measuredModel.says.body).filter((q) => !lowered.has(q.toLowerCase())),
    [],
  );

  // The baseline comparison the model made is handed over rather than
  // worked out again, so the paragraph can name it.
  const mature = build(matureRecord);
  assert.match(mature.says.body, /baseline/i, mature.says.body);

  const unmeasured = build(firstScanNoSegmenter);
  assert.equal(unmeasured.says.body, '', 'no measurement, no paragraph');
  assert.ok(!unmeasured.sections.some((sec) => sec.id === 'says'), 'and no section walked to');
});

test('says: when their own answer shaped the care notes, the paragraph names that answer, and only as a quotation', () => {
  // The paragraph's sentence and the notes are read off the same call, so they cannot name different answers.
  const shapedBy = tipsForProfile(tipProfileOf(newFunnelJourney())).shapedBy;
  assert.deepEqual(shapedBy, { kind: 'heat', label: 'Daily' });
  const sentence = profileSentence(shapedBy)!;
  assert.equal(sentence, 'You said heat goes on your hair “daily”, and the care notes are picked with that in mind.');
  assert.ok(!stripQuotes(sentence).includes('daily'), 'the answer stays inside the quotation');

  // Each kind of answer has its own sentence, all attributed, none adopted.
  // Built from the label table rather than from a copy of it: the echo has
  // to quote the words the funnel drew, and a literal here is how the two
  // drifted apart once already (the row read "Fragrance (listed as parfum)"
  // while the report quoted "fragrance/parfum").
  const reactionSentence = profileSentence({
    kind: 'reaction',
    label: INGREDIENT_REACTION_LABELS.fragrance,
  })!;
  assert.match(reactionSentence, /^You /);
  assert.match(
    reactionSentence,
    /you have reacted to “fragrance \(listed as parfum\)”, and the care notes are picked with that in mind\.$/,
  );
  // The quotation is the label table's own words, character for character,
  // so the two cannot drift apart again without this failing.
  assert.ok(
    reactionSentence.includes(`“${INGREDIENT_REACTION_LABELS.fragrance.toLowerCase()}”`),
    reactionSentence,
  );
  // The funnel asked "Have you ever reacted to any of these?" with no body part, so the echo names none.
  for (const reaction of Object.values(INGREDIENT_REACTION_LABELS)) {
    assert.doesNotMatch(profileSentence({ kind: 'reaction', label: reaction })!, /scalp|skin|hair has/i, reaction);
  }
  assert.match(profileSentence({ kind: 'sensitivity', label: 'Sensitive' })!, /^You described your scalp as “sensitive”, and/);
  assert.match(profileSentence({ kind: 'scalpType', label: 'Combination' })!, /^You described your scalp as “combination”, and/);
  assert.match(profileSentence({ kind: 'concern', label: 'More scalp showing' })!, /^You mentioned “more scalp showing” as something on your mind, and/);
  assert.equal(profileSentence(null), null);

  // A journey from before the questions existed gets no such sentence at all.
  assert.equal(tipsForProfile(tipProfileOf(journey())).shapedBy, null);
});

test('tips: the sentence that names their own answer is ON the block the screen draws', () => {
  /*
    The renderer for the care notes is `TipList({ items, locked })` under
    the section's heading and subheading — `shapedBy` on its own reached
    no screen. Built off a model rather than off `profileSentence`, so
    this fails the day the sentence stops being drawn again.
  */
  const m = build(newFunnelRecord);
  const sentence = profileSentence(tipsForProfile(tipProfileOf(newFunnelJourney())).shapedBy)!;
  assert.equal(m.tips.shapedBy, sentence);
  assert.ok(m.tips.subheading.endsWith(sentence), m.tips.subheading);
  assert.ok(m.tips.subheading.startsWith(COPY.tips.subheading), m.tips.subheading);

  // And the answer is still only ever a quotation: the sweep reads our
  // words with theirs lifted out, and reads theirs as a quoted label.
  assert.ok(!reportModelSentences(m).some((line) => line.includes('daily')));
  assert.ok(reportModelQuotes(m).includes('daily'));

  // A journey with no such answer keeps the plain subheading, with no dangling space.
  const plain = build(firstScanMeasured);
  assert.equal(plain.tips.shapedBy, null);
  assert.equal(plain.tips.subheading, COPY.tips.subheading);
});

test('tips: the tracking notes are on the model and are what the section opens with', () => {
  /*
    `tipsForProfile` has returned the five tracking notes for two phases
    while the model dropped them on the floor, so nobody ever saw the
    only notes in this report that change what the next one can say.
  */
  const m = build(firstScanMeasured);
  const expected = tipsForProfile(tipProfileOf(journey()));
  assert.deepEqual(m.tips.tracking.map((t) => t.id), expected.tracking.map((t) => t.id));
  assert.equal(m.tips.tracking.length, 5);
  assert.equal(m.tips.trackingHeading, COPY.tips.trackingHeading);
  assert.equal(m.tips.trackingSubheading, COPY.tips.trackingSubheading);

  // And the screen draws them, above the care notes rather than instead of them.
  const source = readFileSync(new URL('../../src/components/hair-scan/report.tsx', import.meta.url), 'utf8');
  const at = source.indexOf("case 'tips'");
  assert.ok(at > 0);
  const block = source.slice(at, at + 900);
  assert.ok(block.includes('items={model.tips.tracking}'), 'the tracking notes are not drawn');
  assert.ok(block.includes('items={model.tips.items}'), 'the care notes are not drawn');
  assert.ok(
    block.indexOf('model.tips.tracking') < block.indexOf('model.tips.items'),
    'the care notes come first',
  );

  // Every one of them is swept for honesty by the model, not only by tips.ts.
  const sentences = reportModelSentences(m);
  for (const tip of m.tips.tracking) assert.ok(sentences.includes(tip.body), `${tip.id} is unswept`);
});

test('cards: the change on a card is the model\u2019s figure, and the row below says the same number', () => {
  /*
    The card used to round the raw delta itself, against a verdict list
    of its own. Two roundings of one measurement can disagree — JS rounds
    half towards +infinity, so a delta of -0.025 read as -2 on the card
    and 3 points in the sentence under it.
  */
  const m = build(matureRecord);
  const crown = m.cards.cards.find((c) => c.region === 'crown')!;
  assert.ok(crown.changePoints !== null);
  const row = m.changed.sinceBaseline.find((r) => r.region === 'crown') ?? m.changed.sinceLast.find((r) => r.region === 'crown');
  assert.ok(row, 'the crown is reported somewhere in the comparison');
  assert.match(row!.detail, new RegExp(`\\b${Math.abs(crown.changePoints!)} points of visual coverage`));

  // An unchanged verdict puts no figure on the card at all.
  const quiet = build(() => {
    const f = matureRecord();
    const latest = f.data.sessions[0];
    const baseline = f.data.sessions[2];
    baseline.scan = { ...baseline.scan!, measurement: measured(READING, [], baseline.capturedAt) };
    return { data: f.data, session: latest };
  });
  for (const card of quiet.cards.cards) assert.equal(card.changePoints, null, card.region);
});

test('assessment: every region on the map carries its confidence in words, or no score at all', () => {
  const m = build(firstScanMeasured);
  for (const r of m.assessment.regions) {
    if (r.score === null) {
      assert.equal(r.confidenceLabel, null, `${r.region} qualifies a figure it does not have`);
      continue;
    }
    assert.equal(r.confidenceLabel, `${COPY.assessment.confidenceLabel} ${Math.round(r.confidence * 100)}%`);
  }
});

/* ------------------------------- reminders ------------------------------ */

test('reminders: the report asks the system only when nothing on this install has asked yet', () => {
  // The once-per-install rule itself, from the result module the screen reads it through.
  assert.equal(reminderOfferInterval(true, 30), null, 'already offered — by the funnel or an earlier report — means no ask');
  assert.equal(reminderOfferInterval(false, 30), 30);

  // And the screen reaches the system prompt only through that rule: the
  // guard comes first, the prompt after it, and the flag is set after the ask.
  const source = readFileSync(new URL('../../src/components/hair-scan/report.tsx', import.meta.url), 'utf8');
  const effect = source.slice(source.indexOf('reminderOfferInterval(remindersAlreadyOffered()'));
  const guard = effect.indexOf('if (intervalDays === null) return;');
  const prompt = effect.indexOf('enableRemindersWithPrompt(');
  const mark = effect.indexOf('markRemindersOffered()');
  assert.ok(guard >= 0 && prompt > guard && mark > prompt, 'guard, then prompt, then the flag');
  assert.equal((source.match(/enableRemindersWithPrompt\(/g) ?? []).length, 1, 'one ask on the report');
});

/* -------------------------------- locking ------------------------------- */

test('locking: without Premium the rows, focus, tips and routine are locked and everything else is free', () => {
  for (const [name, fixture] of FIXTURES) {
    const free = build(fixture, false);
    assert.ok(free.analysis.rows.every((r) => r.locked), `${name}: a free row`);
    assert.equal(free.focus?.locked, true, name);
    assert.equal(free.tips.locked, true, name);
    assert.equal(free.hairstyles.locked, true, name);
    assert.equal(free.routine.locked, true, name);
    // The locked rows keep their real headline: the screen shows the first and blurs the bodies.
    const paid = build(fixture, true);
    assert.deepEqual(free.analysis.rows.map((r) => r.headline), paid.analysis.rows.map((r) => r.headline), name);
    assert.deepEqual(free.strengths, paid.strengths, `${name}: strengths are free`);
    assert.deepEqual(free.profile, paid.profile, `${name}: the profile is free`);
    assert.deepEqual(free.says, paid.says, `${name}: the paragraph is free`);
    assert.deepEqual(free.hero, paid.hero);
    // The picks are the same either way: a free reading is never a different reading.
    assert.deepEqual(free.hairstyles.tiles, paid.hairstyles.tiles, `${name}: the same cuts with or without Premium`);

    assert.ok(paid.analysis.rows.every((r) => !r.locked), `${name}: a locked row for Premium`);
    assert.equal(paid.focus?.locked, false);
    assert.equal(paid.tips.locked, false);
    assert.equal(paid.hairstyles.locked, false);
    assert.equal(paid.routine.locked, false);
  }
});

/* ========================= the measured half ============================= */

test('assessment: the overall figure is what the engine read, weighted by how sure it was', () => {
  const m = build(firstScanMeasured);
  // 72, 61, 58, 55, 44 at one confidence apiece: the weighted mean is the plain one.
  assert.deepEqual(m.assessment.overall, { score: 58, confidence: 0.8 });
  assert.equal(m.assessment.overallConfidence, 'High confidence · 80%');
  assert.equal(m.assessment.summary, COPY.assessment.overall(58, 5));
  assert.equal(m.assessment.scoreLabel, 'Visual Coverage', 'the figure has exactly one name');
  assert.equal(m.assessment.unavailable, null);
  assert.equal(m.assessment.locked, false, 'the headline finding is never held behind the gate');

  // Every figure traces to the stored measurement, and none was rounded into existence.
  const stored = firstScanMeasured().session.scan!.measurement!;
  for (const row of m.assessment.regions) {
    const held = stored.regions[row.region];
    if (!held) {
      assert.equal(row.score, null, `${row.region} was not read and carries no figure`);
      assert.equal(row.confidence, 0);
      continue;
    }
    assert.equal(row.score, Math.round(held.coverage * 100), row.region);
    assert.equal(row.confidence, held.confidence, row.region);
  }
});

test('assessment: the coverage map holds every region the scan looks for, read or not', () => {
  const m = build(firstScanMeasured);
  assert.deepEqual(m.assessment.regions.map((r) => r.region), [...SCAN_REGIONS]);
  assert.deepEqual(
    m.assessment.regions.map((r) => r.score),
    [72, 61, 58, 55, 44, null],
  );
  // The refused region is an absence on the map, not a low score, and it is named as one.
  const partLine = m.assessment.regions.find((r) => r.region === 'partLine')!;
  assert.equal(partLine.score, null);
  assert.notEqual(partLine.score, 0, 'a region nobody could read did not score nothing');
  assert.equal(m.assessment.unreadNote, COPY.assessment.unreadNote(1));
  assert.equal(m.assessment.unreadLabel, COPY.assessment.unread);
});

test('assessment: a measurement that read nothing is as unavailable as no measurement at all', () => {
  const m = build(() => {
    const f = firstScanMeasured();
    f.session.scan = { ...f.session.scan!, measurement: measured([], [...SCAN_REGIONS]) };
    return f;
  });
  assert.equal(m.availability, 'unavailable');
  assert.equal(m.assessment.overall, null);
  assert.deepEqual(m.assessment.regions, []);
  assert.equal(m.assessment.unavailable?.body, COPY.assessment.unavailableBody);
  assert.deepEqual(m.cards.cards, []);
  assert.equal(m.says.body, '');
});

test('cards: one per region read, and the observation on each is two figures the model holds', () => {
  const m = build(firstScanMeasured);
  assert.deepEqual(
    m.cards.cards.map((c) => c.region),
    ['hairline', 'leftTemple', 'rightTemple', 'crown', 'midScalp'],
  );
  assert.ok(!m.cards.cards.some((c) => c.region === 'partLine'), 'a refused region has no card');

  const hairline = m.cards.cards[0];
  assert.deepEqual(hairline.grade, { score: 72, confidence: 0.8 });
  assert.equal(hairline.visibleScalp, 10);
  assert.equal(
    hairline.observation,
    'Visual coverage reads 72 out of 100 here, and 10 of every 100 samples read as scalp rather than hair. That is 28 points of visual coverage above your crown in this same scan.',
  );
  // 28 is 72 − 44, and both are on the model: the sentence can be checked against the map.
  const map = new Map(m.assessment.regions.map((r) => [r.region, r.score]));
  assert.equal((map.get('hairline') ?? 0) - (map.get('crown') ?? 0), 28);

  const crown = m.cards.cards.find((c) => c.region === 'crown')!;
  assert.match(crown.observation, /28 points of visual coverage below your hairline in this same scan\.$/);

  // Tabs and crops: the place the figure was read, shown as a place.
  assert.deepEqual(
    m.cards.cards.map((c) => c.tab),
    ['hairline', 'temples', 'temples', 'crown', 'midScalp'],
  );
  assert.equal(hairline.crop?.uri, 'file:///front.jpg');
  assert.equal(m.cards.cards[1].crop?.uri, 'file:///leftTemple.jpg');
  assert.equal(crown.crop?.uri, 'file:///top.jpg', 'no back-of-head frame: the crown crop is the top frame');
  assert.equal(m.cards.cards[4].crop?.uri, 'file:///top.jpg', 'and so is the mid-scalp’s');
  // The tab row grew the two tabs no photograph is named after.
  assert.deepEqual(m.tabs.map((t) => t.id), ['all', 'hairline', 'temples', 'crown', 'midScalp', 'light']);
});

test('cards: a reading too shaky to compare says so, and is never set beside another', () => {
  const m = build(() => {
    const f = firstScanMeasured();
    f.session.scan = {
      ...f.session.scan!,
      measurement: measured([
        region('hairline', 0.72, 0.1),
        region('crown', 0.44, 0.41, { confidence: 0.2, frames: 1, spread: 0.08 }),
      ]),
    };
    return f;
  });
  const crown = m.cards.cards.find((c) => c.region === 'crown')!;
  assert.match(crown.observation, /worth little on its own/);
  assert.ok(!/points of visual coverage/.test(crown.observation), crown.observation);
  const hairline = m.cards.cards.find((c) => c.region === 'hairline')!;
  assert.ok(
    !/your crown/.test(hairline.observation),
    'the sure reading does not lean on the shaky one either',
  );
});

test('cards: a gap inside the noise of two readings is not put into words', () => {
  const m = build(() => {
    const f = firstScanMeasured();
    f.session.scan = {
      ...f.session.scan!,
      measurement: measured([
        region('hairline', 0.62, 0.2),
        region('crown', 0.6, 0.21),
      ]),
    };
    return f;
  });
  for (const card of m.cards.cards) {
    // One sentence: what was read here, and nothing set beside it.
    assert.equal(
      card.observation,
      COPY.cards.reading(card.grade!.score, card.visibleScalp!),
      card.observation,
    );
    assert.ok(!/points of visual coverage (above|below)/.test(card.observation), card.observation);
    assert.ok(!/greater visible scalp/.test(card.observation), card.observation);
  }
  assert.ok(CONTRAST_POINTS > 2, 'a two-point gap is rounding, and the threshold says so');
});

test('scalp visibility: the engine’s own count, ordered, and "the most" only when it is clear', () => {
  const m = build(firstScanMeasured);
  assert.deepEqual(
    m.scalpVisibility?.rows.map((r) => [r.region, r.visibleScalp]),
    [['crown', 41], ['midScalp', 30], ['rightTemple', 21], ['leftTemple', 18], ['hairline', 10]],
  );
  assert.equal(m.scalpVisibility?.body, COPY.scalp.most('crown', 41));
  // None of these is 100 minus the score: they are counted in their own right.
  const map = new Map(m.assessment.regions.map((r) => [r.region, r.score]));
  for (const row of m.scalpVisibility!.rows) {
    assert.notEqual(row.visibleScalp, 100 - (map.get(row.region) ?? 0), row.region);
  }

  // A flat scan has no "most": the honest line is that nothing stands out.
  const flat = build(() => {
    const f = firstScanMeasured();
    f.session.scan = {
      ...f.session.scan!,
      measurement: measured([region('hairline', 0.6, 0.2), region('crown', 0.58, 0.22)]),
    };
    return f;
  });
  assert.equal(flat.scalpVisibility?.body, COPY.scalp.even);
});

test('symmetry: a pair or nothing, and the difference is in points of visual coverage', () => {
  const even = build(firstScanMeasured);
  assert.equal(even.symmetry?.differencePoints, 3);
  assert.equal(even.symmetry?.balanced, true);
  assert.equal(even.symmetry?.body, COPY.symmetry.balanced(3));
  assert.deepEqual(even.symmetry?.left, { score: 61, confidence: 0.8 });
  assert.deepEqual(even.symmetry?.right, { score: 58, confidence: 0.8 });

  const uneven = build(() => {
    const f = firstScanMeasured();
    f.session.scan = {
      ...f.session.scan!,
      measurement: measured([region('leftTemple', 0.61, 0.18), region('rightTemple', 0.48, 0.28)]),
    };
    return f;
  });
  assert.equal(uneven.symmetry?.differencePoints, 13);
  assert.equal(uneven.symmetry?.balanced, false);
  assert.equal(uneven.symmetry?.body, COPY.symmetry.apart('left', 13));
  assert.ok(13 >= SYMMETRY_POINTS);

  // One side is not a pair.
  const one = build(() => {
    const f = firstScanMeasured();
    f.session.scan = { ...f.session.scan!, measurement: measured([region('leftTemple', 0.61, 0.18)]) };
    return f;
  });
  assert.equal(one.symmetry, null);
  assert.ok(!one.sections.some((sec) => sec.id === 'symmetry'));
});

test('changed: the verdicts are the engine’s, and nothing under the noise floor is reported', () => {
  const m = build(matureRecord);
  assert.deepEqual(m.changed.sinceLast.map((r) => [r.region, r.verdict]), [['crown', 'moderate']]);
  assert.equal(
    m.changed.sinceLast[0].detail,
    '18 points of visual coverage lower — a moderate difference against the two scans’ margin of error.',
  );
  assert.match(m.changed.span, /Set against your last scan with a reading, taken on /);

  // The baseline comparison is made by the engine, not by this model: the
  // crown moved 18 points against a baseline that read 62.
  assert.deepEqual(m.changed.sinceBaseline.map((r) => [r.region, r.verdict]), [['crown', 'moderate']]);
  assert.match(m.changed.baselineSpan, /Set against your baseline scan, taken on /);

  // Nothing unchanged and nothing insufficient reaches the rows: they are
  // the absence of news, and the four regions that moved one point are
  // exactly the case the owner struck out — "your hair improved 1%".
  for (const row of [...m.changed.sinceLast, ...m.changed.sinceBaseline]) {
    assert.ok(row.verdict !== 'unchanged' && row.verdict !== 'insufficient', row.region);
    assert.ok(!/^1 point/.test(row.detail), row.detail);
  }
  assert.equal(m.changed.body, '');
});

test('changed: a one-point difference inside the noise floor is never reported as a change', () => {
  const m = build(() => {
    const f = matureRecord();
    // The crown moves a single point — inside the two scans' combined error bar.
    const latest = f.data.sessions[0];
    latest.scan = {
      ...latest.scan!,
      measurement: measured(
        [...READING.filter((r) => r.region !== 'crown'), region('crown', 0.63, 0.24)],
        ['partLine'],
        daysAgo(0),
      ),
      changes: [],
    };
    return { data: f.data, session: latest };
  });
  assert.deepEqual(m.changed.sinceLast, []);
  assert.deepEqual(m.changed.sinceBaseline, []);
  assert.equal(m.changed.body, COPY.changed.none);
  assert.ok(!reportModelSentences(m).some((line) => /1 point of visual coverage/.test(line)));
});

test('changed: a first measured scan says so, and has nothing to be set against', () => {
  const m = build(firstScanMeasured);
  assert.deepEqual(m.changed.sinceLast, []);
  assert.deepEqual(m.changed.sinceBaseline, []);
  assert.equal(m.changed.span, '');
  assert.equal(m.changed.baselineSpan, '');
  assert.equal(m.changed.body, COPY.changed.firstScan);
});

test('watch: three derivations, each carrying the figure that put it on the list', () => {
  const m = build(firstScanMeasured);
  assert.deepEqual(m.watch.items.map((i) => i.region), ['crown']);
  assert.equal(m.watch.items[0].reason, COPY.watch.scalp(41));
  assert.equal(m.watch.body, null);

  // An uneven pair puts the LOWER side on the list, never the higher one.
  const uneven = build(() => {
    const f = firstScanMeasured();
    f.session.scan = {
      ...f.session.scan!,
      measurement: measured([region('leftTemple', 0.61, 0.2), region('rightTemple', 0.48, 0.2)]),
    };
    return f;
  });
  assert.deepEqual(uneven.watch.items.map((i) => i.region), ['rightTemple']);
  assert.equal(uneven.watch.items[0].reason, COPY.watch.asymmetry(13));

  // A reported change puts its own region on the list, and never twice.
  const changed = build(matureRecord);
  assert.deepEqual(changed.watch.items.map((i) => i.region), ['crown']);
  assert.ok(changed.watch.items.length <= WATCH_MAX);

  // Nothing standing out is said in words rather than left blank.
  const flat = build(() => {
    const f = firstScanMeasured();
    f.session.scan = {
      ...f.session.scan!,
      measurement: measured([region('hairline', 0.6, 0.2), region('crown', 0.58, 0.22)]),
    };
    return f;
  });
  assert.deepEqual(flat.watch.items, []);
  assert.equal(flat.watch.body, COPY.watch.none);
});

test('watch: an unavailable report has no list, even off a record that kept a comparison', () => {
  /*
    "Areas to watch" is a measured block, and the unavailable contract is
    that every measured block is empty. Two of its three derivations fall
    silent on their own when nothing was read; the third reads the stored
    comparison, so a record whose measurement is unreadable while its
    stored changes survive — a partial write, a record edited by hand —
    could otherwise draw a row under "we could not reliably analyse this
    scan". Today's engine cannot produce that pair, which is why this is
    a fixture and not a bug report.
  */
  const m = build(() => {
    const f = firstScanMeasured();
    f.session.scan = {
      ...f.session.scan!,
      measurement: measured(READING.map((r) => ({ ...r, coverage: Number.NaN }))),
      changes: [CROWN_CHANGE],
    };
    return f;
  });
  assert.equal(m.availability, 'unavailable');
  assert.deepEqual(m.watch.items, []);
  assert.equal(m.watch.body, null);
  assert.ok(!m.sections.some((s) => s.id === 'watch'));
  // And no row's words survive anywhere in the report.
  assert.ok(!reportModelSentences(m).some((line) => line === COPY.watch.changed));
});

test('changed: an unavailable report sets nothing beside anything, whatever the record kept', () => {
  /*
    The same corrupt record the watch list is held to: a measurement
    present but unreadable, with the comparison the scanner stored still
    on the session. "9 points of visual coverage lower — a moderate
    difference" under the words "we could not reliably analyse this scan"
    is the exact thing the unavailable contract exists to stop, and
    leaving it off the sheet by keeping the section out of the list is
    not the same as not building it: the sweep reads the model, not the
    screen.
  */
  const m = build(() => {
    const f = matureRecord();
    const latest = f.data.sessions[0];
    latest.scan = {
      ...latest.scan!,
      measurement: measured(READING.map((r) => ({ ...r, coverage: Number.NaN }))),
      changes: [CROWN_CHANGE],
    };
    return { data: f.data, session: latest };
  });
  assert.equal(m.availability, 'unavailable');
  assert.deepEqual(m.changed.sinceLast, []);
  assert.deepEqual(m.changed.sinceBaseline, []);
  assert.equal(m.changed.span, '');
  assert.equal(m.changed.baselineSpan, '');
  assert.equal(m.changed.body, '');
  assert.equal(m.changed.baselineBody, '');
  assert.ok(!m.sections.some((s) => s.id === 'changed'));
  // No figure and no verdict survives anywhere in the report.
  assert.ok(!reportModelSentences(m).some((line) => /points of visual coverage/.test(line)));
});

test('changed: the second scan states one comparison once, not the same one under two headings', () => {
  /*
    The commonest report there is. The scan before this one IS the
    baseline, so drawing both blocks is the same region, the same figure
    and the same date twice — and under two words for it, since one side
    is the verdict the engine stored at the time and the other a
    comparison made just now off the same two readings.
  */
  const m = build(() => {
    const f = matureRecord();
    const latest = f.data.sessions[0];
    const baseline = f.data.sessions[1];
    baseline.isBaseline = true;
    // Two sessions only: the scan before this one is the baseline, and
    // the stored rows really were made against it.
    f.data = { ...f.data, sessions: [latest, baseline] };
    latest.scan = {
      ...latest.scan!,
      changes: [...compareScans(measured(READING, ['partLine']), measured(EARLIER_READING, [], baseline.capturedAt))],
    };
    return { data: f.data, session: latest };
  });
  assert.deepEqual(m.changed.sinceLast.map((r) => r.region), ['crown']);
  assert.deepEqual(m.changed.sinceBaseline, [], 'the same comparison is not drawn twice');
  assert.equal(m.changed.baselineSpan, '');
  assert.equal(m.changed.baselineBody, '');
  assert.match(m.changed.span, /also your baseline/);
  // And the coach says it once too.
  assert.ok(!m.says.body.includes('Against your baseline'), m.says.body);
  assert.match(m.says.body, /which is also your baseline/);
});

test('changed: a quiet baseline comparison says so under its own heading', () => {
  /*
    `body` used to be one line for both blocks, written only when NEITHER
    had a row — so a scan whose last-scan comparison found something
    while the baseline one found nothing left "Baseline comparison" as a
    heading, a date sentence and empty space.
  */
  const m = build(() => {
    const f = matureRecord();
    const latest = f.data.sessions[0];
    const baseline = f.data.sessions[2];
    // A baseline that reads the same as this scan everywhere: nothing
    // clears the floor against it, while the stored crown row stands.
    baseline.scan = { ...baseline.scan!, measurement: measured(READING, [], baseline.capturedAt) };
    return { data: f.data, session: latest };
  });
  assert.ok(m.changed.sinceLast.length > 0, 'the since-last comparison still has a row');
  assert.deepEqual(m.changed.sinceBaseline, []);
  assert.equal(m.changed.baselineBody, COPY.changed.noneBaseline);
  assert.notEqual(m.changed.baselineSpan, '');
  assert.equal(m.changed.body, '', 'the since-last block has rows and needs no line');
});

test('changed: the span is dated only by a scan that provably reproduces the stored comparison', () => {
  const m = build(matureRecord);
  assert.match(m.changed.span, /Set against your last scan with a reading, taken on /);

  /*
    The stored rows carry no identity for the other side, and the scan
    they were made against can be deleted long after they were stored.
    Deleting it here leaves the same rows — they are the engine's, and are
    never recomputed — but the candidate that is left does not reproduce
    their deltas, so it does not get to put its date on them.
  */
  const orphaned = build(() => {
    const f = matureRecord();
    const latest = f.data.sessions[0];
    // s2 is what the crown row was compared against; s_base read the same
    // crown, so the survivor is a plausible-looking wrong answer.
    const survivor = f.data.sessions[2];
    survivor.scan = {
      ...survivor.scan!,
      measurement: measured(
        [...EARLIER_READING.filter((r) => r.region !== 'crown'), region('crown', 0.5, 0.3)],
        [],
        survivor.capturedAt,
      ),
    };
    f.data = { ...f.data, sessions: [latest, survivor] };
    return { data: f.data, session: latest };
  });
  assert.deepEqual(orphaned.changed.sinceLast.map((r) => [r.region, r.verdict]), [['crown', 'moderate']]);
  assert.equal(orphaned.changed.span, COPY.changed.spanUndated);
  assert.ok(!/taken on/.test(orphaned.changed.span));
});

test('goal: the block is rebuilt around the measured region the goal points at', () => {
  const m = build(firstScanMeasured);
  assert.equal(m.goal?.lead?.region, 'hairline', 'the stated goal is a stronger-looking hairline');
  assert.deepEqual(m.goal?.lead?.grade, { score: 72, confidence: 0.8 });
  assert.equal(m.goal?.lead?.visibleScalp, 10);
  assert.equal(
    m.goal?.reading,
    'In this scan your hairline reads 72 out of 100 for visual coverage. In this scan 10 of every 100 samples read in your hairline came back as scalp rather than hair.',
  );
  assert.equal(m.goal?.readingHeading, COPY.focus.readingHeading);

  // A goal the scan cannot see keeps its old answer and gains no figure.
  const shedding = build(() => {
    const f = firstScanMeasured();
    f.data.journey = journey({ goals: ['shedding'] });
    return f;
  });
  assert.equal(shedding.goal?.status, 'notVisible');
  assert.equal(shedding.goal?.lead, null);
  assert.equal(shedding.goal?.reading, null);

  // With no measurement the block still says whether the turn reached the region.
  const unmeasured = build(firstScanNoSegmenter);
  assert.equal(unmeasured.goal?.lead, null);
  assert.equal(unmeasured.goal?.reading, null);
  assert.equal(unmeasured.goal?.status, 'captured');
});

test('goal: the reading is IN the paragraph, and leads it — a payload no screen reads is not delivered', () => {
  /*
    The renderer for this block draws `body` and does not touch `reading`
    or `lead`. A reading that lived only on those two reached nobody, and
    "Your goal" went on saying whether the turn photographed the region —
    the "did we get good enough photos" framing the owner struck out.
  */
  const m = build(firstScanMeasured);
  const goal = m.goal!;
  assert.ok(goal.reading !== null);
  assert.ok(goal.body.startsWith(goal.reading), goal.body);
  assert.match(goal.body, /reads 72 out of 100 for visual coverage/);
  // The capture sentence is still there, after the finding rather than instead of it.
  assert.ok(goal.body.includes('The turn kept'), goal.body);

  // A goal pointing at a region this scan did not read says so, in the
  // same paragraph, and puts no figure in its place.
  const unreadGoal = build(() => {
    const f = firstScanMeasured();
    f.data.journey = journey({ goals: ['crown'], trackingAreas: ['crown'] });
    f.session.scan = { ...f.session.scan!, measurement: measured([region('hairline', 0.72, 0.1)], ['crown']) };
    return f;
  });
  assert.equal(unreadGoal.availability, 'measured');
  assert.equal(unreadGoal.goal?.lead, null);
  assert.equal(unreadGoal.goal?.reading, COPY.focus.readingUnread('crown'));
  assert.ok(unreadGoal.goal!.body.startsWith(COPY.focus.readingUnread('crown')));
  assert.ok(!/\d+ out of 100/.test(unreadGoal.goal!.body), unreadGoal.goal!.body);

  // A goal whose own region was not read never borrows another one. The
  // section is headed after what they said they are watching, and a
  // figure from somewhere else under that heading answers a question
  // nobody asked — and silences the one line written for this case.
  const borrowed = build(() => {
    const f = firstScanMeasured();
    f.data.journey = journey({ goals: ['crown'], trackingAreas: ['edges'] });
    f.session.scan = {
      ...f.session.scan!,
      // Neither of the crown goal's own two regions read; the temples,
      // which a tracking answer points at, did.
      measurement: measured(
        READING.filter((r) => r.region !== 'crown' && r.region !== 'midScalp'),
        ['crown', 'midScalp'],
      ),
    };
    return f;
  });
  assert.equal(borrowed.availability, 'measured');
  assert.equal(borrowed.goal?.lead, null, 'the goal block borrowed a region the goal does not point at');
  assert.equal(borrowed.goal?.reading, COPY.focus.readingUnread('crown'));
  assert.ok(!/\d+ out of 100/.test(borrowed.goal!.body), borrowed.goal!.body);

  // With nothing read at all the block says nothing about a reading: the
  // assessment's unavailable block is the one place that is said.
  const none = build(firstScanNoSegmenter);
  assert.equal(none.goal?.reading, null);
  assert.ok(!none.goal!.body.includes('could not read'), none.goal!.body);
});

test('adaptation: one report for everybody — the answers reorder it, they never change a figure', () => {
  const base = build(firstScanMeasured);
  const figures = (m: HairScanReportModel): [string, number | null][] =>
    m.assessment.regions.map((r) => [r.region, r.score]);

  // A middle part and a narrower-part goal put the part line first — and
  // the part line was not read, so the mid-scalp leads in its place.
  const part = build(() => {
    const f = firstScanMeasured();
    f.data.journey = journey({ goals: ['narrowerPart'], trackingAreas: ['widerPart'], hairWearing: 'middlePart' });
    return f;
  });
  assert.equal(part.cards.cards[0].region, 'midScalp');
  assert.equal(part.goal?.lead?.region, 'midScalp');

  // A temple concern puts the temples first.
  const temples = build(() => {
    const f = firstScanMeasured();
    f.data.journey = journey({ goals: ['unsure'], trackingAreas: ['edges'] });
    return f;
  });
  assert.deepEqual(temples.cards.cards.map((c) => c.region), [
    'leftTemple',
    'rightTemple',
    'hairline',
    'crown',
    'midScalp',
  ]);

  // Diffuse thinning leads with the mid-scalp and the crown.
  const diffuse = build(() => {
    const f = firstScanMeasured();
    f.data.journey = journey({ goals: ['fullness'], trackingAreas: ['diffuseThinning'] });
    return f;
  });
  assert.deepEqual(diffuse.cards.cards.slice(0, 2).map((c) => c.region), ['midScalp', 'crown']);

  // Every one of them read the same head: the map is identical, in the
  // engine's order, whatever the person said about themselves.
  for (const m of [part, temples, diffuse]) {
    assert.deepEqual(figures(m), figures(base));
    assert.deepEqual(m.assessment.overall, base.assessment.overall);
    assert.equal(m.cards.cards.length, base.cards.cards.length);
  }
  // And the goal tables cover every goal the funnel offers, so no answer falls through.
  for (const goal of Object.keys(HAIR_GOAL_LABELS) as HairGoal[]) {
    assert.ok(Array.isArray(GOAL_SCAN_REGIONS[goal]), goal);
    assert.equal(GOAL_SCAN_REGIONS[goal].every((r) => SCAN_REGIONS.includes(r)), true, goal);
  }
  assert.deepEqual([...CARD_ORDER].sort(), [...SCAN_REGIONS].sort(), 'every region the engine reads has a place in the order');
});

test('locking: the analysis detail is held without Premium, the headline figure never is', () => {
  const free = build(firstScanMeasured, false);
  assert.equal(free.assessment.locked, false);
  assert.equal(free.cards.locked, true);
  assert.equal(free.scalpVisibility?.locked, true);
  assert.equal(free.symmetry?.locked, true);
  assert.equal(free.changed.locked, true);
  assert.equal(free.watch.locked, true);
  // The figures themselves are the same either way: a free reading is never a different reading.
  const paid = build(firstScanMeasured, true);
  assert.deepEqual(free.assessment.overall, paid.assessment.overall);
  assert.deepEqual(
    free.cards.cards.map((c) => c.observation),
    paid.cards.cards.map((c) => c.observation),
  );
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

test('honesty: the new-funnel report reads the self-knowledge answers back only as labels of choices', () => {
  const model = build(newFunnelRecord);
  const quotes = reportModelQuotes(model);
  for (const label of ['Wavy', 'Oily', 'Sensitive']) assert.ok(quotes.includes(label), label);
  assert.ok(quotes.includes('daily'), 'the paragraph quotes the heat answer');
  // Nothing authored describes the scalp: the words are theirs, inside quotation marks.
  const authored = reportModelSentences(model).join(' ');
  assert.ok(!/\boily\b|\bwavy\b|\bsensitive\b/i.test(authored), authored);
});

test('honesty: the sweep is not vacuous — the raw report really does carry a label the sweep forbids', () => {
  const model = build(matureRecord);
  assert.ok(model.profile.tiles.some((t) => /density/i.test(t.value)), 'the crown goal reads back its own label');
  assert.match(model.says.body, /density/);
  assert.ok(!/density/.test(stripQuotes(model.says.body)), 'and it is a quotation');
  assert.ok(model.routine.products.some((p) => /Thickening/.test(p.name)), 'a typed product name is read back verbatim');
});
