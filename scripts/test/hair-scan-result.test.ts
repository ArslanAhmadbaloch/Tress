/**
 * The scan's result has to be right about the images it is describing.
 *
 * Its whole claim is that every figure on a card was counted off the
 * pixels of a kept frame, and that a card with nothing counted says so
 * rather than filling the gap. A card that printed a percentage for a
 * frame nobody measured, or filed a side frame under the wrong angle, or
 * quietly described a head instead of a picture, would look like a
 * perfectly good report — so these cases sit exactly where the result is
 * tempted to flatter.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { regionRectsFor } from '@/features/hair-scan/region-crops';
import {
  FRONT_PITCH_MAX,
  FRONT_YAW_MAX,
  TOP_PITCH,
  areaReading,
  buildHairScanResult,
  closestAngle,
  completionBand,
  frameRank,
  gateObservation,
  lightingBand,
  lockedSentences,
  observationHasDepth,
  observationsOf,
  reminderOfferInterval,
  resultSentences,
  scanBlock,
  scanPhotos,
  type HairScanFrame,
} from '@/features/hair-scan/result';
import {
  ANGLES,
  EMPTY_DATA,
  SCHEMA_VERSION,
  migrateStoredData,
  type Angle,
  type Photo,
  type PhotoCoverage,
  type PhotoQuality,
  type PhotoSession,
} from '@/types/domain';

import { HAIR_CLAIMS } from './claims';
import { assertHonest } from './honesty-words';

/* ------------------------------ fixtures ------------------------------- */

const GOOD: PhotoQuality = { brightness: 128, contrast: 40, sharpness: 15, clipped: 0.01, issues: [] };
const DARK: PhotoQuality = { brightness: 40, contrast: 20, sharpness: 4, clipped: 0.05, issues: ['tooDark'] };

function area(fraction: number, upper = fraction + 0.1, left = 0.5): PhotoCoverage {
  return { fraction, upperFraction: upper, verticalBalance: 0.6, horizontalBalance: left, pixels: 40_000 };
}

function frame(overrides: Partial<HairScanFrame> & { uri: string }): HairScanFrame {
  return { width: 900, height: 1200, capturedAt: '2026-09-17T09:00:00.000Z', ...overrides };
}

function photo(angle: Angle, overrides: Partial<Photo> = {}): Photo {
  return {
    id: `p_${angle}`,
    sessionId: 's1',
    angle,
    uri: `file:///${angle}.jpg`,
    thumbnailUri: `file:///${angle}_t.jpg`,
    width: 900,
    height: 1200,
    capturedAt: '2026-09-17T09:00:00.000Z',
    capture: 'scan',
    ...overrides,
  };
}

function session(photos: Photo[], overrides: Partial<PhotoSession> = {}): PhotoSession {
  return {
    id: 's1',
    journeyId: 'j1',
    capturedAt: '2026-09-17T09:00:00.000Z',
    isBaseline: true,
    photos,
    ...overrides,
  };
}

/** A full turn, every frame measured: the best case the report can meet. */
function measuredSet(): PhotoSession {
  return session(
    [
      photo('front', { quality: GOOD, coverage: area(0.41, 0.52, 0.5), pose: { yaw: 2, pitch: 0, roll: 0 } }),
      photo('leftTemple', { quality: GOOD, coverage: area(0.38), pose: { yaw: -33, pitch: 0, roll: 0 } }),
      photo('rightTemple', { quality: GOOD, coverage: area(0.4), pose: { yaw: 31, pitch: 0, roll: 0 } }),
      photo('top', { quality: GOOD, coverage: area(0.55) }),
      photo('crown', { quality: GOOD, coverage: area(0.5) }),
    ],
    {
      scan: { durationMs: 14_200, completion: 1, frameCount: 23, lighting: 0.8, version: 1 },
    },
  );
}

const cards = (s: PhotoSession) => buildHairScanResult(s).analysis;

/* ------------------------------ the angles ----------------------------- */

test('closestAngle: a small turn is the front, a larger one a side, a nod down the top', () => {
  assert.equal(closestAngle({ yaw: 0, pitch: 0, roll: 0 }), 'front');
  assert.equal(closestAngle({ yaw: FRONT_YAW_MAX, pitch: 0, roll: 0 }), 'front');
  assert.equal(closestAngle({ yaw: -34, pitch: 0, roll: 0 }), 'leftTemple');
  assert.equal(closestAngle({ yaw: 34, pitch: 0, roll: 0 }), 'rightTemple');
  // The capture lane can say which sign is left; the default follows the guided scan's fixture.
  assert.equal(closestAngle({ yaw: 34, pitch: 0, roll: 0 }, 1), 'leftTemple');
  assert.equal(closestAngle({ yaw: 3, pitch: TOP_PITCH, roll: 0 }), 'top');
  // A turned head nodded down is still the side it turned to.
  assert.equal(closestAngle({ yaw: 40, pitch: TOP_PITCH, roll: 0 }), 'rightTemple');
});

test('closestAngle: a face-on frame tipped up at the ceiling stands for no angle', () => {
  assert.equal(closestAngle({ yaw: 0, pitch: FRONT_PITCH_MAX, roll: 0 }), 'front');
  assert.equal(closestAngle({ yaw: 0, pitch: FRONT_PITCH_MAX + 1, roll: 0 }), null);
  assert.equal(closestAngle({ yaw: 5, pitch: 30, roll: 0 }), null, "the engine's 'up' region is not the front");
  // Turned, a tipped-up head is still the side it turned to; the rank prefers the level one.
  assert.equal(closestAngle({ yaw: 34, pitch: 30, roll: 0 }), 'rightTemple');
});

test('closestAngle: an unreadable turn is no angle, never the front', () => {
  assert.equal(closestAngle({ yaw: Number.NaN, pitch: 0, roll: 0 }), null);
  assert.equal(closestAngle({ yaw: Number.POSITIVE_INFINITY, pitch: 0, roll: 0 }), null);
  // An unreadable nod is read as level: absent is a reading, unreadable is not a top shot.
  assert.equal(closestAngle({ yaw: 0, pitch: Number.NaN, roll: 0 }), 'front');
});

/* ----------------------------- the curation ---------------------------- */

test('scanPhotos: one photograph per angle, in capture order, marked as scanned', () => {
  const photos = scanPhotos([
    frame({ uri: 'a', pose: { yaw: 1, pitch: 0, roll: 0 } }),
    frame({ uri: 'b', pose: { yaw: -35, pitch: 0, roll: 0 } }),
    frame({ uri: 'c', pose: { yaw: -30, pitch: 0, roll: 0 } }),
    frame({ uri: 'd', pose: { yaw: 36, pitch: 0, roll: 0 } }),
    frame({ uri: 'e', angle: 'crown' }),
  ]);

  assert.deepEqual(
    photos.map((p) => p.angle),
    ['leftTemple', 'rightTemple', 'crown', 'front'],
  );
  assert.ok(photos.every((p) => p.capture === 'scan'));
  assert.ok(ANGLES.indexOf('leftTemple') < ANGLES.indexOf('front'), 'the store order is the capture order');
});

test('scanPhotos: a measured frame beats a sharper unmeasured one, then focus decides', () => {
  const photos = scanPhotos([
    frame({ uri: 'sharp', pose: { yaw: 0, pitch: 0, roll: 0 }, quality: { ...GOOD, sharpness: 40 } }),
    frame({ uri: 'measured', pose: { yaw: 4, pitch: 0, roll: 0 }, quality: DARK, coverage: area(0.3) }),
  ]);
  assert.equal(photos.length, 1);
  assert.equal(photos[0].uri, 'measured');

  const focus = scanPhotos([
    frame({ uri: 'soft', pose: { yaw: 0, pitch: 0, roll: 0 }, quality: { ...GOOD, sharpness: 3 } }),
    frame({ uri: 'crisp', pose: { yaw: 6, pitch: 0, roll: 0 }, quality: { ...GOOD, sharpness: 20 } }),
  ]);
  assert.equal(focus[0].uri, 'crisp');

  const l = frame({ uri: 'x', pose: { yaw: -35, pitch: 0, roll: 0 } });
  assert.ok(frameRank(l, 'leftTemple') > frameRank(frame({ uri: 'y', pose: { yaw: -22, pitch: 0, roll: 0 } }), 'leftTemple'));
});

test('scanPhotos: pitch counts — a level frame outranks a tipped one, and a chin-up frame never takes the front', () => {
  const level = frame({ uri: 'level', pose: { yaw: 0, pitch: 0, roll: 0 }, quality: GOOD });
  const tipped = frame({ uri: 'tipped', pose: { yaw: 0, pitch: 15, roll: 0 }, quality: GOOD });
  assert.ok(frameRank(level, 'front') > frameRank(tipped, 'front'));
  assert.ok(
    frameRank(frame({ uri: 't', pose: { yaw: 0, pitch: TOP_PITCH, roll: 0 } }), 'top') >
      frameRank(frame({ uri: 'u', pose: { yaw: 0, pitch: TOP_PITCH - 20, roll: 0 } }), 'top'),
  );

  const photos = scanPhotos([
    frame({ uri: 'ceiling', pose: { yaw: 2, pitch: 30, roll: 0 }, quality: { ...GOOD, sharpness: 60 } }),
    frame({ uri: 'level', pose: { yaw: 3, pitch: -2, roll: 0 }, quality: { ...GOOD, sharpness: 14 } }),
  ]);
  assert.deepEqual(photos.map((p) => [p.angle, p.uri]), [['front', 'level']]);

  const alone = scanPhotos([frame({ uri: 'ceiling', pose: { yaw: 2, pitch: 30, roll: 0 }, quality: GOOD })]);
  assert.deepEqual(alone, [], 'a chin-up frame on its own is dropped, not made the hero');
});

test('scanPhotos: an explicit angle wins over the pose, and a frame with neither is dropped', () => {
  const photos = scanPhotos([
    frame({ uri: 'tagged', angle: 'top', pose: { yaw: 0, pitch: 0, roll: 0 } }),
    frame({ uri: 'lost' }),
    frame({ uri: '', angle: 'front' }),
    frame({ uri: 'flat', angle: 'front', width: 0 }),
  ]);
  assert.deepEqual(photos.map((p) => [p.angle, p.uri]), [['top', 'tagged']]);
});

test('scanPhotos: every reading on the frame travels onto the photograph', () => {
  const trace = { contours: ['0,0 10,0 10,10'], topEdge: [], cells: 'AAAA', tolerance: 2 };
  const [p] = scanPhotos([
    frame({
      uri: 'a',
      thumbnailUri: 'a_t',
      angle: 'front',
      quality: GOOD,
      coverage: area(0.4),
      maskTrace: trace,
      pose: { yaw: 1, pitch: 2, roll: 3 },
    }),
  ]);
  assert.equal(p.thumbnailUri, 'a_t');
  assert.equal(p.quality, GOOD);
  assert.deepEqual(p.coverage, area(0.4));
  assert.equal(p.maskTrace, trace);
  assert.deepEqual(p.pose, { yaw: 1, pitch: 2, roll: 3 });
});

test('scanPhotos: a frame with a mesh persists the report’s region rectangles, as fractions of the still', () => {
  const mesh = {
    bounds: { x: 0.27, y: 0.12, width: 0.46, height: 0.6 },
    contours: {},
    viewAspect: 9 / 16,
  };
  const [p] = scanPhotos([frame({ uri: 'a', angle: 'front', mesh })]);
  assert.ok(p.regions, 'regions were placed');
  const regions = p.regions;
  for (const region of ['hairline', 'leftTemple', 'rightTemple', 'top', 'crown'] as const) {
    const r = regions[region];
    assert.ok(r, `${region} was not placed`);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9, `${region} is off the image`);
  }
  assert.deepEqual(regions, regionRectsFor(mesh, { width: 900, height: 1200 }), 'the same mapping the crops module uses');

  // The mesh itself is transient: it does not travel onto the photograph.
  assert.ok(!('mesh' in p));

  // Without a mesh there is no key at all — absent, not empty — and an old blob still loads.
  const [bare] = scanPhotos([frame({ uri: 'b', angle: 'front' })]);
  assert.ok(!('regions' in bare), 'a frame with no mesh stores no regions key');
  const [sizeless] = scanPhotos([frame({ uri: 'c', angle: 'front', mesh: { ...mesh, bounds: { ...mesh.bounds, width: 0 } } })]);
  assert.ok(!('regions' in sizeless), 'a mesh with no size places nothing');
});

test('Photo.regions is additive: the schema version is untouched and a photograph with one survives the loader', () => {
  assert.equal(SCHEMA_VERSION, 2);
  const kept = photo('front', { regions: { hairline: { x: 0.1, y: 0.05, w: 0.8, h: 0.3 } } });
  const loaded = migrateStoredData({ ...EMPTY_DATA, sessions: [session([kept])] });
  assert.ok(loaded);
  assert.deepEqual(loaded.sessions[0].photos[0].regions, kept.regions);
  const old = migrateStoredData({ ...EMPTY_DATA, sessions: [session([photo('front')])] });
  assert.ok(old);
  assert.equal(old.sessions[0].photos[0].regions, undefined);
});

/* ------------------------------- the block ----------------------------- */

test('scanBlock: clamped into shape, and nothing invented for a missing reading', () => {
  const block = scanBlock({ startedAt: 1000, endedAt: 15_400, completion: 1.4, frameCount: 23.6, lighting: null });
  assert.deepEqual(block, { durationMs: 14_400, completion: 1, frameCount: 24, lighting: null, version: 1 });
  assert.ok(!('tracked' in block), 'an unreported tracked share stores no key');

  const odd = scanBlock({ startedAt: 10, endedAt: 5, completion: -1, frameCount: Number.NaN, lighting: 2, tracked: 0.5 });
  assert.equal(odd.durationMs, 0);
  assert.equal(odd.completion, 0);
  assert.equal(odd.frameCount, 0);
  assert.equal(odd.lighting, 1);
  assert.equal(odd.tracked, 0.5);
});

test('the scan block is additive: the schema version is untouched and an old blob still loads', () => {
  assert.equal(SCHEMA_VERSION, 2, 'a bump erases every installed journey; see types/domain.ts');

  const s = measuredSet();
  const loaded = migrateStoredData({ ...EMPTY_DATA, sessions: [s] });
  assert.ok(loaded);
  assert.deepEqual(loaded.sessions[0].scan, s.scan, 'the block survives the loader');

  const old = migrateStoredData({ ...EMPTY_DATA, sessions: [session([photo('front')])] });
  assert.ok(old);
  assert.equal(old.sessions[0].scan, undefined, 'a set from before the block reads as having none');
  assert.equal(completionBand(old.sessions[0]), 'partial');
});

/* ------------------------------ the cards ------------------------------ */

test('hairline: the upper-frame share of the front image, and only that', () => {
  const { hairline } = cards(measuredSet());
  assert.equal(hairline.headline, 'Hair covers 52% of the upper frame in the front image.');
  assert.equal(hairline.ring?.value, 0.52);
  assert.equal(hairline.measured, true);
  assert.deepEqual(hairline.photos.map((p) => p.angle), ['front']);
  assert.ok(hairline.figures.some((f) => f.value === '52% hair'));
  assert.ok(hairline.figures.some((f) => f.value === '41% hair'));
  assert.ok(!hairline.detail.includes('pale line'), 'no line is named when no edge was traced');
});

test('hairline: the top edge is named only when a trace holds one', () => {
  const traced = session([
    photo('front', {
      coverage: area(0.4),
      maskTrace: { contours: ['0,0 10,0 10,10'], topEdge: ['0,100 500,100'], cells: '', tolerance: 2 },
    }),
  ]);
  assert.ok(cards(traced).hairline.detail.includes('pale line'));

  const shattered = session([
    photo('front', {
      coverage: area(0.4),
      maskTrace: { contours: [], topEdge: [], cells: '', tolerance: 0 },
    }),
  ]);
  assert.ok(!cards(shattered).hairline.detail.includes('pale line'));
});

test('hairline: a front image with no area reading says what was measured, not a number', () => {
  const { hairline } = cards(session([photo('front', { quality: DARK })]));
  assert.equal(hairline.headline, 'A front image was kept: dark, soft.');
  assert.equal(hairline.ring, null);
  assert.equal(hairline.tone, 'attention');
  assert.ok(!/\d+%/.test(hairline.headline + hairline.detail));

  const bare = cards(session([photo('front')])).hairline;
  assert.equal(bare.headline, 'A front image was kept.');
  assert.equal(bare.measured, false);
  assert.deepEqual(bare.figures, []);
});

test('hairline: no front image is said plainly, with the way to get one', () => {
  const { hairline } = cards(session([photo('leftTemple')]));
  assert.equal(hairline.headline, 'No front image was kept from this scan.');
  assert.equal(hairline.tone, 'attention');
  assert.deepEqual(hairline.photos, []);
  assert.match(hairline.detail, /next scan/);
});

test('hairline: an empty mask is no reading, not a two-percent reading', () => {
  const empty = photo('front', { coverage: area(0.01, 0.01) });
  assert.equal(areaReading(empty), null);
  assert.equal(cards(session([empty])).hairline.ring, null);
});

test('temples: two measured sides within the noise band are said to be within it', () => {
  const { temples } = cards(measuredSet());
  assert.equal(temples.headline, 'Hair covers 38% of the left-side image and 40% of the right-side image.');
  assert.match(temples.detail, /within 2 points of each other/);
  assert.match(temples.detail, /Turned 33° for the left side and 31° for the right/);
  assert.match(temples.detail, /50% of the hair area sits left of centre and 50% right/);
  assert.ok(!temples.detail.includes('differ by'), 'two degrees of turn is not a mismatch');
  assert.equal(temples.tone, 'good');
  assert.equal(temples.ring?.value, (0.38 + 0.4) / 2);
});

test('temples: a difference beyond the noise band names the side and the turns', () => {
  const s = measuredSet();
  s.photos[1] = photo('leftTemple', { coverage: area(0.46), pose: { yaw: -20, pitch: 0, roll: 0 } });
  const { temples } = cards(s);
  assert.match(temples.detail, /more hair area in the left-side image, by 6 points/);
  assert.match(temples.detail, /Turned 20° for the left side and 31° for the right/);
  assert.ok(!temples.detail.includes('differ by'), 'eleven degrees is inside the mirror tolerance');
  assert.equal(temples.tone, 'good');

  s.photos[1] = photo('leftTemple', { coverage: area(0.46), pose: { yaw: -12, pitch: 0, roll: 0 } });
  const mismatched = cards(s).temples;
  assert.match(mismatched.detail, /two turns differ by 19°/);
  assert.equal(mismatched.tone, 'neutral');
});

test('temples: one side is one picture, and is not balanced against anything', () => {
  const only = cards(session([photo('rightTemple', { coverage: area(0.4) })])).temples;
  assert.equal(only.headline, 'Only the right-side image was kept; hair covers 40% of it.');
  assert.equal(only.tone, 'attention');
  assert.equal(only.ring?.value, 0.4);

  const unmeasured = cards(session([photo('leftTemple')])).temples;
  assert.equal(unmeasured.headline, 'Only the left-side image was kept.');
  assert.equal(unmeasured.ring, null);
  assert.deepEqual(unmeasured.figures, []);
});

test('temples: both sides kept but unmeasured give words, never a split', () => {
  const { temples } = cards(
    session([photo('leftTemple', { quality: GOOD }), photo('rightTemple', { quality: DARK })]),
  );
  assert.equal(temples.headline, 'Both side images were kept.');
  assert.equal(temples.ring, null);
  assert.ok(!/\d+%/.test(temples.headline + temples.detail));
  assert.deepEqual(
    temples.figures.map((f) => f.value),
    ['evenly lit, sharp', 'dark, soft'],
  );
  assert.equal(temples.tone, 'attention');
});

test('coverage: the mean of the measured images, each one listed, and how they were lit', () => {
  const { coverage } = cards(measuredSet());
  assert.equal(coverage.headline, 'Hair covers 45% of the frame across the 5 measured images.');
  assert.match(coverage.detail, /Top 55%, Left Side 38%, Right Side 40%, Back 50%, Hairline 41%/);
  assert.match(coverage.detail, /lit within 0 points of each other/);
  assert.equal(coverage.tone, 'good');
  assert.equal(coverage.figures.length, 5);
});

test('coverage: images lit far apart are said to be, and the tone drops', () => {
  const s = measuredSet();
  s.photos[0] = { ...s.photos[0], quality: { ...GOOD, brightness: 60 } };
  const { coverage } = cards(s);
  assert.match(coverage.detail, /lit 68 points apart/);
  assert.equal(coverage.tone, 'neutral');
  assert.equal(lightingBand(s.photos), 'mixed');
});

test('coverage: with no area reading there is no percentage anywhere on the card', () => {
  const s = session(ANGLES.map((a) => photo(a, { quality: GOOD })));
  const { coverage } = cards(s);
  assert.equal(coverage.headline, 'No hair-area reading on these 5 images.');
  assert.equal(coverage.ring, null);
  assert.ok(!/\d+%/.test(coverage.headline + coverage.detail + coverage.figures.map((f) => f.value).join(' ')));
  assert.equal(coverage.measured, true, 'light and focus were still measured');

  const bare = cards(session([photo('front')])).coverage;
  assert.equal(bare.headline, 'Nothing was measured on the kept images.');
  assert.equal(bare.measured, false);
});

test('scalp: the remainder of the top image, named as the mask’s remainder', () => {
  const { scalpVisibility } = cards(measuredSet());
  assert.equal(scalpVisibility.headline, 'In the top image, 45% of the frame was not counted as hair.');
  assert.match(scalpVisibility.detail, /not a scalp measurement/);
  assert.ok(Math.abs((scalpVisibility.ring?.value ?? 0) - 0.45) < 1e-9);
  assert.deepEqual(
    scalpVisibility.figures.map((f) => f.value),
    ['45% not hair', '50% not hair'],
  );
});

test('scalp: the back stands in when the top is missing, and nothing when both are', () => {
  const back = cards(session([photo('crown', { quality: GOOD })])).scalpVisibility;
  assert.equal(back.headline, 'A back image was kept: evenly lit, sharp.');
  assert.equal(back.ring, null);

  const none = cards(session([photo('front')])).scalpVisibility;
  assert.equal(none.headline, 'No top or back image was kept from this scan.');
  // What was not captured, not a capture step the scanner does not have.
  assert.match(none.detail, /tipped far enough down/);
  assert.match(none.detail, /back of the head is out of reach/);
  assert.ok(!/held shot/.test(none.detail));
  assert.equal(none.tone, 'neutral');
});

/* ------------------------------ the result ----------------------------- */

test('result: read back from the session, with the scan’s own facts alongside', () => {
  const s = measuredSet();
  const r = buildHairScanResult(s);
  assert.equal(r.id, 's1');
  assert.equal(r.createdAt, s.capturedAt);
  assert.deepEqual(
    r.frames.map((f) => [f.angle, f.measured]),
    ANGLES.map((a) => [a, true]),
  );
  assert.deepEqual(r.metadata, {
    scanDuration: 14_200,
    lightingQuality: 'even',
    completionQuality: 'complete',
    completion: 1,
    frameCount: 23,
    lighting: 0.8,
  });
  assert.equal(r.hasArea, true);
  assert.equal(observationsOf(r).map((o) => o.id).join(','), 'hairline,temples,coverage,scalp');
  assert.match(r.scope, /area is not thickness/);
});

test('result: a set that came from no scan carries no scan facts, and says so through nulls', () => {
  const r = buildHairScanResult(session([photo('front', { quality: DARK })]));
  assert.equal(r.metadata.scanDuration, null);
  assert.equal(r.metadata.completion, null);
  assert.equal(r.metadata.frameCount, null);
  assert.equal(r.metadata.lighting, null);
  assert.equal(r.metadata.lightingQuality, 'dim');
  assert.equal(r.metadata.completionQuality, 'partial');
  assert.equal(r.hasArea, false);
  assert.ok(!r.scope.includes('thickness'));
});

test('result: a stopped scan is partial even with every angle on the record', () => {
  const s = measuredSet();
  s.scan = { ...s.scan!, completion: 0.6 };
  assert.equal(buildHairScanResult(s).metadata.completionQuality, 'partial');
  assert.equal(lightingBand([]), 'unmeasured');
});

/* --------------------------- the honesty sweep -------------------------- */

const FIXTURES: [string, PhotoSession][] = [
  ['measured', measuredSet()],
  ['quality only', session(ANGLES.map((a) => photo(a, { quality: a === 'front' ? DARK : GOOD })))],
  ['bare', session(ANGLES.map((a) => photo(a)))],
  ['front only', session([photo('front', { coverage: area(0.3), quality: GOOD })])],
  ['one side', session([photo('leftTemple', { coverage: area(0.3) })])],
  ['empty', session([])],
  [
    'uneven',
    session([
      photo('front', { coverage: area(0.4, 0.5, 0.62), quality: { ...GOOD, brightness: 210 } }),
      photo('leftTemple', { coverage: area(0.5), quality: { ...GOOD, brightness: 90 }, pose: { yaw: -40, pitch: 0, roll: 0 } }),
      photo('rightTemple', { coverage: area(0.3), quality: DARK, pose: { yaw: 14, pitch: 0, roll: 0 } }),
    ]),
  ],
];

for (const [name, fixture] of FIXTURES) {
  test(`honesty: the ${name} result describes images, never a head`, () => {
    const sentences = resultSentences(buildHairScanResult(fixture));
    assert.ok(sentences.length >= 10, `only ${sentences.length} sentences reached the sweep`);
    assertHonest(assert, sentences, `hair scan result (${name})`);
    const text = sentences.join(' ').toLowerCase();
    for (const claim of [...HAIR_CLAIMS, 'density', 'receding', 'recession', 'losing']) {
      assert.ok(!text.includes(claim), `the ${name} result must not say "${claim}"`);
    }
    for (const sentence of sentences) {
      assert.ok(!/\b(before|after)\b/i.test(sentence), `"${sentence}" promises a comparison`);
    }
  });
}

test('honesty: a percentage appears only on a card with an area reading behind it', () => {
  for (const [name, fixture] of FIXTURES) {
    for (const card of observationsOf(buildHairScanResult(fixture))) {
      const text = [card.headline, card.detail, ...card.figures.map((f) => f.value)].join(' ');
      const printed = /\d+%/.test(text);
      const counted = card.photos.some((p) => areaReading(p) !== null) || card.ring !== null;
      if (printed) assert.ok(counted, `${name}/${card.id} prints a percentage nothing counted: ${text}`);
      if (card.ring) assert.ok(printed, `${name}/${card.id} draws a ring with no figure in words`);
    }
  }
});

test('honesty: every card says what the next scan will let it compare', () => {
  for (const [, fixture] of FIXTURES) {
    for (const card of observationsOf(buildHairScanResult(fixture))) {
      assert.match(card.compare, /next scan|second/i, `${card.id} has no comparison line`);
    }
  }
});

/* -------------------------------- the gate ------------------------------ */

test('gate: Premium is never locked, and a free reader keeps the headline of every card', () => {
  for (const [name, fixture] of FIXTURES) {
    for (const card of observationsOf(buildHairScanResult(fixture))) {
      const paid = gateObservation(card, true);
      assert.equal(paid.locked, false, `${name}/${card.id} is locked for Premium`);
      assert.equal(paid.observation, card, 'the paid card is the card itself, unaltered');
      assert.deepEqual(lockedSentences(paid), []);

      const free = gateObservation(card, false);
      assert.equal(free.observation.headline, card.headline, 'the headline is never held');
      assert.equal(free.observation.title, card.title);
      if (free.locked) {
        const shown = lockedSentences(free);
        assert.ok(shown.includes(card.headline));
        assert.ok(shown.includes(card.detail), `${name}/${card.id} holds the working that qualifies its headline`);
        assert.ok(shown.includes(free.caveat));
        // What is held is what the next scan compares against — the depth, never a qualifier.
        assert.ok(!shown.includes(card.compare), `${name}/${card.id} shows the comparison line on a locked card`);
      }
    }
  }
});

test('gate: a card is locked exactly when it has depth — an image, a ring or a figure', () => {
  const measured = cards(measuredSet());
  for (const card of [measured.hairline, measured.temples, measured.coverage, measured.scalpVisibility]) {
    assert.equal(observationHasDepth(card), true);
    assert.equal(gateObservation(card, false).locked, true, `${card.id} has depth and is open`);
  }

  // A kept image with nothing measured is still an image at full size.
  const bare = cards(session([photo('front')])).hairline;
  assert.equal(bare.measured, false);
  assert.equal(gateObservation(bare, false).locked, true);

  // A card that says nothing was kept is an honesty statement, not a feature.
  const empty = cards(session([]));
  for (const card of [empty.hairline, empty.temples, empty.coverage, empty.scalpVisibility]) {
    assert.equal(observationHasDepth(card), false);
    assert.equal(gateObservation(card, false).locked, false, `${card.id} locks an absence`);
  }
  const noFront = cards(session([photo('leftTemple')])).hairline;
  assert.equal(gateObservation(noFront, false).locked, false);
});

test('gate: the locked words carry the caveat, no figure, and no verdict', () => {
  for (const [name, fixture] of FIXTURES) {
    for (const card of observationsOf(buildHairScanResult(fixture))) {
      const free = gateObservation(card, false);
      if (!free.locked) continue;
      const sentences = lockedSentences(free);
      assertHonest(assert, sentences, `locked card (${name}/${card.id})`);
      assert.match(free.caveat, /one scan cannot show change/);
      assert.match(free.body, /no judgement about your hair/);
      for (const line of [free.caveat, free.body, free.placeholder, free.button]) {
        assert.ok(!/\d/.test(line), `${name}/${card.id} prints a number in its locked state: ${line}`);
      }
      // The closing paragraph is outside the gate: the result carries it whatever the entitlement.
      assert.match(buildHairScanResult(fixture).scope, /one scan cannot show change/);
    }
  }
});

/* ----------------------------- the reminder ask ---------------------------- */

test('reminders: offered once per install, and only with a journey interval to schedule against', () => {
  assert.equal(reminderOfferInterval(false, 30), 30);
  assert.equal(reminderOfferInterval(true, 30), null, 'a second ask on the same install');
  assert.equal(reminderOfferInterval(false, undefined), null, 'a report with no journey behind it');
  assert.equal(reminderOfferInterval(false, null), null);
  assert.equal(reminderOfferInterval(false, 0), null);
  assert.equal(reminderOfferInterval(false, Number.NaN), null);
  assert.equal(reminderOfferInterval(true, undefined), null);
});
