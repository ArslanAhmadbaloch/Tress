/**
 * Prints every string the hair scan report model emits, so a reader can
 * read the whole report the way the screen will show it — without a
 * phone. Three records (a first scan without the segmenter, the same
 * with it, and a mature record), each built free and Premium. The
 * fixtures are the ones scripts/test/hair-scan-report-model.test.ts
 * sweeps; this script exists so the words can be read, not only swept.
 *
 *   node --import ./scripts/test/register.mjs scripts/print-hair-scan-report.ts
 */

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

function print(model: HairScanReportModel, title: string): void {
  const line = (s: string) => process.stdout.write(`${s}\n`);
  line(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`);
  line(`HERO  ${model.hero.dateLabel}  (${model.hero.uri || '<no photo>'} ${model.hero.width}x${model.hero.height})`);
  line(`TABS  ${model.tabs.map((t) => t.label).join(' | ')}`);
  line(`SECTIONS  ${model.sections.map((s) => s.label).join(' > ')}`);
  line(`\n## ${model.analysis.heading}\n   ${model.analysis.subheading}`);
  for (const r of model.analysis.rows) {
    const crop = r.crop ? `${r.crop.uri}${r.crop.approximate ? ' (approximate)' : ''}` : '<no crop>';
    line(`- [${r.tab}] ${r.regionLabel} (${r.icon}) ${r.measured ? model.analysis.marks.measured : model.analysis.marks.kept}${r.locked ? ' LOCKED' : ''}`);
    line(`  crop: ${crop}`);
    line(`  headline: ${r.headline}`);
    line(`  body: ${r.body}`);
  }
  line(`\n## ${model.strengths.heading}`);
  for (const c of model.strengths.cards) line(`- (${c.icon}) ${c.title}\n  ${c.body}`);
  line(`\n## ${model.profile.heading}`);
  for (const t of model.profile.tiles) line(`- (${t.icon}) ${t.value} — ${t.label}`);
  if (model.focus) {
    const f = model.focus;
    line(`\n## ${f.heading}${f.locked ? ' LOCKED' : ''}`);
    line(`   regions: ${f.regionsLabel} [${f.regions.join(', ')}]  crops: ${f.crops.length}`);
    line(`   goal: ${f.goalLabel}`);
    line(`   status: ${f.status} — ${f.statusLabel}  frames: ${f.framesCaptured}  coverage: ${f.coverage}`);
    line(`   ${f.body}`);
  } else {
    line('\n## (no focus block: no goal on the journey)');
  }
  line(`\n## ${model.tips.heading}${model.tips.locked ? ' LOCKED (first shown)' : ''}\n   ${model.tips.subheading}`);
  model.tips.items.forEach((t, i) => line(`${i + 1}. ${t.kicker}\n   ${t.emoji} ${t.body}`));
  line(`\n## ${model.routine.heading}${model.routine.locked ? ' LOCKED' : ''}`);
  line(`   tiles: ${model.routine.products.map((p) => `${p.name}${p.imageUri ? '' : ' (?)'}`).join(', ') || '? ? ?'}${model.routine.moreCount ? ` +${model.routine.moreCount}` : ''}`);
  line(`   ${model.routine.body}`);
  line(`   [${model.routine.cta}]`);
  line(`\n## ${model.says.heading}:\n   ${model.says.body}`);
}

const NOW = new Date('2026-09-17T15:00:00.000Z');
for (const [name, fixture] of FIXTURES) {
  for (const premium of [false, true]) {
    const { data, session: s } = fixture();
    print(buildHairScanReport(data, s, { premium, now: NOW }), `${name} — ${premium ? 'Premium' : 'free'}`);
  }
}
