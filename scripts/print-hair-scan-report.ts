/**
 * Prints every string the hair scan report model emits, so a reader can
 * read the whole report the way the screen will show it — without a
 * phone. Four records: a scan the engine could not read, a first scan it
 * read, a mature record with a comparison behind it, and the second-scan
 * case where the scan before this one is also the baseline. Each is
 * built free and Premium.
 *
 * The fixtures carry a real `measurement`, because a fixture without one
 * prints the unavailable report and nothing else — which is how this
 * script spent a phase showing none of the findings it exists to show.
 * The comparison rows are `compareScans`' own, not hand-written verdicts.
 *
 *   node --import ./scripts/test/register.mjs scripts/print-hair-scan-report.ts
 */

import { compareScans } from '@/features/hair-scan/measure';
import { buildHairScanReport, type HairScanReportModel } from '@/features/hair-scan/report-model';
import { toDateKey } from '@/lib/date';
import {
  ANGLES,
  EMPTY_DATA,
  type Angle,
  type AppData,
  type Journey,
  type Photo,
  type PhotoCoverage,
  type PhotoQuality,
  type PhotoSession,
  type PhotoSessionMeasurement,
  type PhotoSessionRegionMeasurement,
  type ScanMeasureRegion,
  type Product,
  type RoutineItem,
  type RoutineLog,
} from '@/types/domain';

/* ------------------------------ fixtures ------------------------------- */

const GOOD: PhotoQuality = { brightness: 128, contrast: 40, sharpness: 15, clipped: 0.01, issues: [] };

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
 * One region as the engine writes it: a share of hair, a share of
 * visible scalp counted in its own right, how many frames read it, how
 * far they disagreed, and how much of that deserves to be believed.
 */
function region(
  r: ScanMeasureRegion,
  coverage: number,
  visibleScalp: number,
  confidence = 0.8,
  frames = 4,
): PhotoSessionRegionMeasurement {
  return { region: r, coverage, visibleScalp, frames, spread: 0.02, confidence, anchoring: 'landmarks' };
}

/** A scan's reading: the regions it read, and the ones it names as unread. */
function measured(
  rows: PhotoSessionRegionMeasurement[],
  unread: ScanMeasureRegion[],
  capturedAt: string,
): PhotoSessionMeasurement {
  const regions: PhotoSessionMeasurement['regions'] = {};
  for (const row of rows) regions[row.region] = row;
  return { regions, unread, capturedAt };
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

/** The reading of that first scan: five regions read, the part line refused. */
const FIRST_READING = [
  region('hairline', 0.72, 0.1),
  region('leftTemple', 0.61, 0.18),
  region('rightTemple', 0.58, 0.21),
  region('midScalp', 0.55, 0.3, 0.62),
  region('crown', 0.44, 0.41, 0.52, 3),
];

/** The same first scan, every frame measured and the engine's reading stored on it. */
function firstScanMeasured(): { data: AppData; session: PhotoSession } {
  const at = '2026-09-17T13:59:00.000Z';
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
        version: 1,
        measurement: measured(FIRST_READING, ['partLine'], at),
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
  const earlier = (id: string, ago: number, reading: PhotoSessionMeasurement): PhotoSession =>
    session(ANGLES.map((a) => photo(a, { id: `${id}_${a}`, sessionId: id, coverage: area(0.4), quality: GOOD })), {
      id,
      capturedAt: daysAgo(ago),
      isBaseline: id === 's_base',
      scan: { durationMs: 13_000, completion: 1, frameCount: 21, lighting: 0.78, version: 1, measurement: reading },
    });

  // Three readings, each the engine's own shape. The crown falls away
  // across them and the left temple rises; everything else sits inside
  // what two scans can tell apart, which is what makes this record worth
  // printing — most of a comparison is the engine declining to report.
  const baseAt = daysAgo(65);
  const midAt = daysAgo(32);
  const latestAt = daysAgo(0);
  const baseReading = measured(
    [
      region('hairline', 0.7, 0.12),
      region('leftTemple', 0.55, 0.22),
      region('rightTemple', 0.57, 0.2),
      region('midScalp', 0.6, 0.26),
      region('crown', 0.62, 0.24),
    ],
    ['partLine'],
    baseAt,
  );
  const midReading = measured(
    [
      region('hairline', 0.71, 0.12),
      region('leftTemple', 0.6, 0.19),
      region('rightTemple', 0.57, 0.2),
      region('midScalp', 0.59, 0.27),
      region('crown', 0.55, 0.31),
    ],
    ['partLine'],
    midAt,
  );
  const latestReading = measured(
    [
      region('hairline', 0.71, 0.12),
      region('leftTemple', 0.66, 0.15),
      region('rightTemple', 0.56, 0.21),
      region('midScalp', 0.59, 0.27),
      region('crown', 0.46, 0.39),
    ],
    ['partLine'],
    latestAt,
  );
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
      capturedAt: latestAt,
      isBaseline: false,
      scan: {
        durationMs: 15_100,
        completion: 1,
        frameCount: 26,
        lighting: 0.82,
        version: 1,
        measurement: latestReading,
        // The comparison the scanner stores at the time, made by the
        // engine rather than written here.
        changes: [...compareScans(latestReading, midReading)],
      },
    },
  );
  const data = dataWith({
    journey: journey({ startedAt: daysAgo(70), createdAt: daysAgo(70), goals: ['crown', 'routineWorking'], trackingAreas: ['crown'], approaches: ['haircare'], noticed: 'twoYears' }),
    routineItems: items,
    routineLogs: logs,
    products,
    // Newest first, as the store keeps them.
    sessions: [latest, earlier('s2', 32, midReading), earlier('s_base', 65, baseReading)],
  });
  return { data, session: latest };
}

/**
 * The second scan: the commonest report there is, and the one place the
 * scan before this one IS the baseline. Both comparisons are the same
 * pair of readings, so the report has to state the comparison once.
 */
function secondScan(): { data: AppData; session: PhotoSession } {
  const baseAt = daysAgo(31);
  const nowAt = daysAgo(0);
  const before = measured(
    [
      region('hairline', 0.7, 0.12),
      region('leftTemple', 0.6, 0.19),
      region('rightTemple', 0.58, 0.2),
      region('midScalp', 0.6, 0.26),
      region('crown', 0.6, 0.25),
    ],
    ['partLine'],
    baseAt,
  );
  const now = measured(
    [
      region('hairline', 0.7, 0.12),
      region('leftTemple', 0.6, 0.19),
      region('rightTemple', 0.58, 0.2),
      region('midScalp', 0.59, 0.27),
      region('crown', 0.5, 0.35),
    ],
    ['partLine'],
    nowAt,
  );
  const first = session(
    ANGLES.map((a) => photo(a, { id: `s1_${a}`, sessionId: 's1', coverage: area(0.4), quality: GOOD })),
    {
      id: 's1',
      capturedAt: baseAt,
      isBaseline: true,
      scan: { durationMs: 13_400, completion: 1, frameCount: 22, lighting: 0.8, version: 1, measurement: before },
    },
  );
  const second = session(
    ANGLES.map((a) => photo(a, { id: `s2_${a}`, sessionId: 's2', coverage: area(0.42), quality: GOOD })),
    {
      id: 's2',
      capturedAt: nowAt,
      isBaseline: false,
      scan: {
        durationMs: 14_000,
        completion: 1,
        frameCount: 24,
        lighting: 0.81,
        version: 1,
        measurement: now,
        changes: [...compareScans(now, before)],
      },
    },
  );
  return { data: dataWith({ sessions: [second, first] }), session: second };
}

const FIXTURES: [string, () => { data: AppData; session: PhotoSession }][] = [
  ['no reading — the analysis did not run', firstScanNoSegmenter],
  ['first scan, measured', firstScanMeasured],
  ['second scan — the last scan is also the baseline', secondScan],
  ['mature record', matureRecord],
];

/**
 * The whole report, section by section, in the order `model.sections`
 * puts them — the owner's order, and the one the Next pill walks. Every
 * string the screen can draw is printed; nothing is summarised.
 */
function print(model: HairScanReportModel, title: string): void {
  const line = (s: string) => process.stdout.write(`${s}\n`);
  const held = (locked: boolean) => (locked ? ' [HELD]' : '');
  line(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`);
  line(`HERO  ${model.hero.dateLabel}  (${model.hero.uri || '<no photo>'} ${model.hero.width}x${model.hero.height})`);
  line(`TABS  ${model.tabs.map((t) => t.label).join(' | ')}`);
  line(`AVAILABILITY  ${model.availability}`);
  line(`SECTIONS  ${model.sections.map((s) => s.label).join(' > ')}`);

  for (const s of model.sections) {
    switch (s.id) {
      case 'assessment': {
        const a = model.assessment;
        line(`\n## ${a.heading}${held(a.locked)}\n   ${a.subheading}`);
        if (a.unavailable) {
          line(`   ${a.unavailable.title}`);
          line(`   ${a.unavailable.body}`);
          line(`   [${a.unavailable.cta}]`);
          break;
        }
        line(`   ${a.scoreLabel}: ${a.overall === null ? a.unreadLabel : `${a.overall.score} ${a.scoreScale}`}`);
        line(`   ${a.overallConfidence ?? '<no confidence: no figure>'}`);
        line(`   ${a.summary ?? '<no summary>'}`);
        line(`   ${a.scoreNote}`);
        line(`\n   ${a.mapHeading}\n   ${a.mapSubheading}`);
        for (const r of a.regions) {
          line(`   - ${r.label}: ${r.score === null ? a.unreadLabel : `${r.score} ${a.scoreScale}`}  ${r.confidenceLabel ?? ''}`);
        }
        if (a.unreadNote) line(`   ${a.unreadNote}`);
        break;
      }
      case 'cards': {
        const c = model.cards;
        line(`\n## ${c.heading}${held(c.locked)}\n   ${c.subheading}`);
        for (const card of c.cards) {
          const figure = card.grade === null ? model.assessment.unreadLabel : `${card.grade.score} ${model.assessment.scoreScale}`;
          const confidence = card.grade === null ? '' : `  confidence ${Math.round(card.grade.confidence * 100)}%`;
          line(`   - [${card.tab}] ${card.label}: ${c.coverageLabel} ${figure}${confidence}`);
          if (card.visibleScalp !== null) line(`     ${c.scalpLabel}: ${card.visibleScalp}`);
          if (card.symmetry !== undefined) line(`     ${c.differenceLabel}: ${card.symmetry} ${model.assessment.pointsLabel}`);
          if (card.changePoints !== null) line(`     ${c.changeLabel}: ${card.changePoints > 0 ? '+' : '−'}${Math.abs(card.changePoints)}`);
          line(`     crop: ${card.crop ? card.crop.uri : '<no crop>'}`);
          line(`     ${card.observation}`);
        }
        break;
      }
      case 'scalp': {
        const b = model.scalpVisibility;
        if (!b) break;
        line(`\n## ${b.heading}${held(b.locked)}\n   ${b.subheading}`);
        for (const r of b.rows) line(`   - ${r.label}: ${r.visibleScalp} ${model.assessment.scoreScale}  confidence ${Math.round(r.confidence * 100)}%`);
        line(`   ${b.body}`);
        line(`   ${b.note}`);
        break;
      }
      case 'symmetry': {
        const b = model.symmetry;
        if (!b) break;
        line(`\n## ${b.heading}${held(b.locked)}\n   ${b.subheading}`);
        line(`   ${b.leftLabel}: ${b.left.score} ${model.assessment.scoreScale}  |  ${b.rightLabel}: ${b.right.score} ${model.assessment.scoreScale}`);
        line(`   ${b.label}: ${b.differencePoints} ${model.assessment.pointsLabel}`);
        line(`   ${b.body}`);
        line(`   ${b.note}`);
        break;
      }
      case 'changed': {
        const c = model.changed;
        line(`\n## ${c.heading}${held(c.locked)}\n   ${c.subheading}`);
        if (c.span) line(`   ${c.span}`);
        for (const r of c.sinceLast) line(`   - ${r.label} [${r.verdict}]: ${r.detail}`);
        if (c.body) line(`   ${c.body}`);
        if (c.sinceBaseline.length > 0 || c.baselineBody) {
          line(`\n   ${c.baselineHeading}`);
          if (c.baselineSpan) line(`   ${c.baselineSpan}`);
          for (const r of c.sinceBaseline) line(`   - ${r.label} [${r.verdict}]: ${r.detail}`);
          if (c.baselineBody) line(`   ${c.baselineBody}`);
        } else {
          line(`   <no baseline block>`);
        }
        break;
      }
      case 'watch': {
        const w = model.watch;
        line(`\n## ${w.heading}${held(w.locked)}\n   ${w.subheading}`);
        for (const i of w.items) line(`   - ${i.label}: ${i.reason}`);
        if (w.body) line(`   ${w.body}`);
        break;
      }
      case 'focus': {
        const f = model.goal;
        if (!f) break;
        line(`\n## ${f.heading}${held(f.locked)}`);
        line(`   goal: ${f.goalLabel}`);
        line(`   regions: ${f.regionsLabel} [${f.regions.join(', ')}]  crops: ${f.crops.length}`);
        line(`   status: ${f.status} — ${f.statusLabel}  frames: ${f.framesCaptured}  coverage: ${f.coverage}`);
        // `reading` is carried apart for a screen that wants its own
        // sub-block; the paragraph below already opens with it, which is
        // where it reaches a person today.
        line(`   (carried apart) ${f.readingHeading}: ${f.reading ?? '<no reading at the goal>'}`);
        line(`   ${f.body}`);
        break;
      }
      case 'quality': {
        const q = model.quality;
        line(`\n## ${q.heading}\n   ${q.subheading}`);
        line(`   ${q.summary}`);
        for (const r of q.rows) {
          line(`   - [${r.tab}] ${r.regionLabel} (${r.icon}) ${r.measured ? q.marks.measured : q.marks.kept}${held(r.locked)}`);
          line(`     crop: ${r.crop ? `${r.crop.uri}${r.crop.approximate ? ' (approximate)' : ''}` : '<no crop>'}`);
          line(`     ${r.headline}`);
          line(`     ${r.body}`);
        }
        break;
      }
      case 'says':
        line(`\n## ${model.says.heading}:\n   ${model.says.body}`);
        break;
      case 'tips': {
        const t = model.tips;
        line(`\n## ${t.trackingHeading}${held(t.locked)}\n   ${t.trackingSubheading}`);
        t.tracking.forEach((n, i) => line(`   ${i + 1}. ${n.kicker}\n      ${n.emoji} ${n.body}`));
        line(`\n## ${t.heading}${held(t.locked)}\n   ${t.subheading}`);
        t.items.forEach((n, i) => line(`   ${i + 1}. ${n.kicker}\n      ${n.emoji} ${n.body}`));
        break;
      }
      case 'routine': {
        const r = model.routine;
        line(`\n## ${r.heading}${held(r.locked)}`);
        line(`   tiles: ${r.products.map((p) => `${p.name}${p.imageUri ? '' : ' (?)'}`).join(', ') || '? ? ?'}${r.moreCount ? ` +${r.moreCount}` : ''}`);
        line(`   ${r.body}`);
        line(`   [${r.cta}]`);
        break;
      }
      case 'hairstyles': {
        const h = model.hairstyles;
        line(`\n## ${h.heading}${held(h.locked)}\n   ${h.subheading}`);
        for (const t of h.tiles) line(`   - ${t.name}`);
        line(`   [${h.cta}]`);
        break;
      }
      default:
        line(`\n## <${s.id}: nothing printed for this section>`);
    }
  }
}

const NOW = new Date('2026-09-17T15:00:00.000Z');
for (const [name, fixture] of FIXTURES) {
  for (const premium of [false, true]) {
    const { data, session: s } = fixture();
    print(buildHairScanReport(data, s, { premium, now: NOW }), `${name} — ${premium ? 'Premium' : 'free'}`);
  }
}
