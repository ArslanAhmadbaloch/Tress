/**
 * The plan sequence states facts and counts real things, and says
 * nothing about a head.
 *
 * Every figure the constellation scene shows is either a fact about hair
 * whose numbers are held to the cited constant in plan-model.ts — growth
 * a month, the years a strand grows, the hairs shed in a day, the months
 * before a change is judged — or a count checked against the record it
 * was taken from: the catalogue's styles for the hair type they told us,
 * answers given, images kept, regions reached. Every sentence it can say
 * goes through the honesty sweep, plus the lies the reference product
 * tells that Tress must not: an outcome by a date ("you'll feel the
 * difference", "results") and invented company ("N people joined today").
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hairstyleCountFor } from '@/features/hairstyles';
import {
  PLAN_COPY,
  everyFact,
  factLine,
  lineSentence,
  planCopySentences,
  sequenceLines,
} from '@/features/onboarding/plan-copy';
import {
  BIG_DIPPER,
  HAIR_FACTS,
  RANGE_DASH,
  SIDE_BY_SIDE_MONTHS,
  answersGiven,
  bigDipper,
  buildPlanModel,
  planFacts,
  recordCounts,
  regionsCovered,
  type PlanFactId,
} from '@/features/onboarding/plan-model';
import { addDays } from '@/lib/date';
import {
  ANGLES,
  EMPTY_DATA,
  HAIR_TYPE_LABELS,
  type Angle,
  type AppData,
  type Journey,
  type Photo,
  type PhotoSession,
} from '@/types/domain';

import { HAIR_CLAIMS } from './claims';
import { assertHonest } from './honesty-words';

/* ------------------------------ fixtures ------------------------------- */

const CAPTURED = '2026-09-17T13:59:00.000Z';

function photo(angle: Angle): Photo {
  return {
    id: `p_${angle}`,
    sessionId: 's1',
    angle,
    uri: `file:///${angle}.jpg`,
    width: 1080,
    height: 1440,
    capturedAt: CAPTURED,
    capture: 'scan',
  };
}

function session(angles: Angle[]): PhotoSession {
  return {
    id: 's1',
    journeyId: 'j1',
    capturedAt: CAPTURED,
    isBaseline: true,
    photos: angles.map(photo),
    scan: { durationMs: 14_200, completion: 1, frameCount: 23, lighting: 0.8, version: 1 },
  };
}

function journey(overrides: Partial<Journey> = {}): Journey {
  return {
    id: 'j1',
    profileId: 'p1',
    startedAt: '2026-09-17T09:00:00.000Z',
    trackingAreas: ['hairline'],
    motivations: ['confidence'],
    goals: ['hairline'],
    noticed: 'halfYear',
    triggers: ['mirror'],
    approaches: ['topical'],
    updateIntervalDays: 30,
    createdAt: '2026-09-17T09:00:00.000Z',
    ...overrides,
  };
}

function dataWith(parts: Partial<AppData>): AppData {
  return {
    ...EMPTY_DATA,
    profile: { id: 'p1', displayName: 'Sam', gender: 'female', ageBand: '25to34', createdAt: CAPTURED },
    journey: journey(),
    onboardingCompletedAt: CAPTURED,
    ...parts,
  };
}

/* ------------------------------- the counts ----------------------------- */

test('plan: every count is a count of the record, in the record’s own numbers', () => {
  const s = session(['front', 'leftTemple', 'rightTemple', 'top']);
  const data = dataWith({ sessions: [s] });
  const byId = new Map(recordCounts(data).map((c) => [c.id, c]));

  // Name, age band, gender; areas, motivations, goals, triggers,
  // approaches, when noticed, cadence: ten questions answered.
  assert.equal(byId.get('answers')?.value, 10);
  assert.equal(answersGiven(data), 10);
  assert.equal(byId.get('frames')?.value, s.photos.length, 'images kept is the photographs in the session');
  assert.equal(byId.get('regions')?.value, 4, 'four angles reach four regions; no crown frame, no crown');
  assert.deepEqual(regionsCovered(s), ['hairline', 'leftTemple', 'rightTemple', 'top']);
  assert.deepEqual(
    recordCounts(data).map((c) => c.id),
    ['answers', 'frames', 'regions'],
    'in the order the record line reads them',
  );
  for (const count of recordCounts(data)) assert.ok(count.value > 0);
});


test('plan: the counts never reach past the record', () => {
  const ids = new Set(['answers', 'frames', 'regions']);
  const full = session([...ANGLES]);
  const data = dataWith({ sessions: [full] });
  const counts = recordCounts(data);
  for (const c of counts) assert.ok(ids.has(c.id), `unknown count ${c.id}`);
  const byId = new Map(counts.map((c) => [c.id, c.value]));
  assert.equal(byId.get('regions'), 5, 'every angle held reaches every region');
  assert.equal(byId.get('frames'), 5);
  // The scanner's own frame tally — the frames it held before curating —
  // is not what "kept" means: kept is what is in the record.
  assert.notEqual(byId.get('frames'), full.scan?.frameCount);
});


test('plan: with no scan and no answers beyond a name, only what exists is counted', () => {
  const data = dataWith({
    profile: { id: 'p1', displayName: 'Sam', createdAt: CAPTURED },
    journey: journey({ trackingAreas: [], motivations: [], goals: [], triggers: [], approaches: [], noticed: undefined, updateIntervalDays: 30 }),
  });
  const byId = new Map(recordCounts(data).map((c) => [c.id, c]));
  assert.equal(byId.get('answers')?.value, 2, 'the name and the cadence');
  assert.equal(byId.get('frames'), undefined, 'nothing kept is no line, not a zero');
  assert.equal(byId.get('regions'), undefined);
});


test('plan: answers are counted per question, and a value the app never offered is no answer', () => {
  const stored = journey({
    goals: ['hairline', 'crown'],
    concerns: ['frizz', 'dryness'],
    hairType: 'wavy',
    budget: 'midRange',
  }) as unknown as Record<string, unknown>;
  stored.scalpType = 'nonsense';
  const data = dataWith({ journey: stored as unknown as Journey });
  // Ten from the base fixture, plus concerns, hair type and budget; the
  // two goals are one question, and the unknown scalp type is nothing.
  assert.equal(answersGiven(data), 13);
});

/* -------------------------------- the facts ----------------------------- */

const FACT_ORDER: PlanFactId[] = ['styles', 'growth', 'lifespan', 'shedding', 'review', 'record'];

test('plan: the four hair facts are the cited constants, worded as fact, in every headline and line', () => {
  const f = HAIR_FACTS;
  // The constants are what the sources say — the comments beside them
  // name the source; this holds the numbers so a later edit to one
  // cannot drift from the other unnoticed.
  assert.equal(f.growthCmPerMonth, 1, 'Loussouarn 2005: ~0.35 mm/day, about 1 cm a month');
  assert.deepEqual(f.anagenYears, { from: 2, to: 7 }, 'anagen: 2 to 7 years');
  assert.deepEqual(f.shedPerDay, { from: 50, to: 100 }, 'AAD: 50 to 100 hairs a day');
  assert.deepEqual(f.reviewMonths, { from: 3, to: 6 }, 'treatment review: 3 to 6 months');

  const facts = planFacts({ ...EMPTY_DATA }, []);
  const byId = new Map(facts.map((x) => [x.id, x]));
  assert.equal(byId.get('growth')?.headline, `1 cm`);
  assert.equal(byId.get('lifespan')?.headline, `2${RANGE_DASH}7 years`);
  assert.equal(byId.get('shedding')?.headline, `50${RANGE_DASH}100`);
  assert.equal(byId.get('review')?.headline, `3${RANGE_DASH}6 months`);
  assert.equal(RANGE_DASH, '–', 'an en dash, so a range never reads as a minus');

  assert.equal(lineSentence(factLine(byId.get('growth')!)), 'Hair grows about 1 cm a month');
  assert.equal(lineSentence(factLine(byId.get('lifespan')!)), 'A strand grows for 2 to 7 years before it sheds');
  assert.equal(lineSentence(factLine(byId.get('shedding')!)), '50 to 100 hairs shed every day, and that is normal');
  assert.equal(
    lineSentence(factLine(byId.get('review')!)),
    'Dermatologists judge a change over 3 to 6 months, so a monthly scan is enough',
  );
  // "judge", never "you will see": the interval is what clinicians do.
  for (const id of ['growth', 'lifespan', 'shedding', 'review'] as const) {
    const line = lineSentence(factLine(byId.get(id)!));
    assert.ok(!/\byou\b/i.test(line), `a hair fact is about hair, not this person: ${line}`);
  }
});

test('plan: the styles figure is the catalogue’s count for the hair type they told us, and is left out at zero', () => {
  const wavy = dataWith({ journey: journey({ hairType: 'wavy' }) });
  const facts = planFacts(wavy, []);
  const styles = facts.find((x) => x.id === 'styles');
  const expected = hairstyleCountFor(wavy);
  if (expected === 0) {
    assert.equal(styles, undefined, 'nothing in the catalogue for this hair type: no figure');
  } else {
    assert.ok(styles);
    assert.equal(styles.value, expected, 'the count is the catalogue’s, never a number for the screen');
    assert.equal(styles.headline, `${expected} ${expected === 1 ? 'style' : 'styles'}`);
    assert.equal(styles.hairType, 'wavy');
    const line = factLine(styles);
    assert.equal(line.quoted, true, 'the hair type is their own answer, read back');
    assert.equal(line.accent, 'wavy hair');
    assert.equal(line.before, `${expected} ${expected === 1 ? 'hairstyle' : 'hairstyles'} for `);
  }

  // No hair type given: the count is the catalogue's for anyone, and the line says "your hair".
  const unknown = planFacts(dataWith({}), []).find((x) => x.id === 'styles');
  if (unknown) {
    assert.equal(unknown.hairType, undefined);
    assert.equal(unknown.value, hairstyleCountFor(dataWith({})));
    assert.equal(factLine(unknown).accent, 'your hair');
    assert.notEqual(factLine(unknown).quoted, true);
  }
  // Every hair type label reads back as a quotation, so the sweep never judges it.
  for (const hairType of Object.keys(HAIR_TYPE_LABELS) as (keyof typeof HAIR_TYPE_LABELS)[]) {
    const line = factLine({ id: 'styles', headline: '3 styles', value: 3, hairType });
    assert.equal(line.quoted, true);
    assert.ok(line.accent.endsWith(' hair'));
  }
});

test('plan: the record figure folds the record’s own counts and is left out before there is a record', () => {
  const s = session(['front', 'leftTemple', 'rightTemple', 'top']);
  const data = dataWith({ sessions: [s] });
  const model = buildPlanModel(data);
  const record = model.facts.find((x) => x.id === 'record');
  assert.ok(record);
  assert.equal(record.value, answersGiven(data), 'the headline is the answers count');
  assert.equal(record.headline, `${answersGiven(data)} answers`);
  assert.deepEqual(
    record.counts?.map((c) => [c.id, c.value]),
    [
      ['answers', 10],
      ['frames', 4],
      ['regions', 4],
    ],
    'answers, images and regions, in the record’s own numbers; notes and routine steps stay out',
  );
  assert.equal(lineSentence(factLine(record)), '10 answers, 4 images, 4 regions on your record');

  const one = factLine({ id: 'record', headline: '1 answer', value: 1, counts: [{ id: 'answers', value: 1 }] });
  assert.equal(lineSentence(one), '1 answer on your record');

  const none = buildPlanModel({ ...EMPTY_DATA });
  assert.equal(none.facts.find((x) => x.id === 'record'), undefined);
  assert.equal(none.facts.find((x) => x.id === 'styles')?.value ?? 0, hairstyleCountFor({ ...EMPTY_DATA }));
});

test('plan: the figures run in the scene’s order, and every headline is digits with a word', () => {
  const s = session([...ANGLES]);
  const model = buildPlanModel(dataWith({ sessions: [s], journey: journey({ hairType: 'curly' }) }));
  const ids = model.facts.map((x) => x.id);
  const order = FACT_ORDER.filter((id) => ids.includes(id));
  assert.deepEqual(ids, order, 'in the scene’s order, with nothing repeated');
  assert.ok(ids.includes('growth') && ids.includes('lifespan') && ids.includes('shedding') && ids.includes('review'));
  assert.ok(ids.includes('record'));
  for (const fact of [...model.facts, ...everyFact()]) {
    assert.match(fact.headline, /^\d/, `a headline opens on the figure that rolls: ${fact.headline}`);
    assert.ok(fact.headline.length <= 12, `a headline is a word or a short phrase: ${fact.headline}`);
    assert.ok(!/\d\.\d/.test(fact.headline), 'whole figures only');
    const line = lineSentence(factLine(fact));
    assert.ok(line.length > 0);
    assert.ok(factLine(fact).accent.length > 0, `one accent phrase: ${line}`);
  }
});

/* --------------------------------- the sky ------------------------------ */

test('plan: the finale’s seven stars are the Big Dipper, in the asterism’s own proportions', () => {
  const sky = bigDipper();
  assert.equal(BIG_DIPPER.length, 7);
  assert.equal(sky.stars.length, 7);
  assert.deepEqual(
    sky.stars.map((s) => s.name),
    ['Dubhe', 'Merak', 'Phecda', 'Megrez', 'Alioth', 'Mizar', 'Alkaid'],
    'the bowl from its lip, then the handle to its tip',
  );
  // Unit coordinates, filling the figure's box on both axes.
  for (const s of sky.stars) {
    assert.ok(s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1, `${s.name} is inside the figure`);
  }
  assert.ok(sky.stars.some((s) => s.x === 0) && sky.stars.some((s) => s.x === 1));
  assert.ok(sky.stars.some((s) => s.y === 0) && sky.stars.some((s) => s.y === 1));

  // The shape a person knows: north up, east left. Dubhe, the pointer at
  // the lip of the bowl, is the highest star; Alkaid, the tip of the
  // handle, is the lowest and the furthest east; Merak sits below Dubhe
  // at the bowl's far side, so the pointers stand almost upright.
  const star = (name: string) => sky.stars.find((s) => s.name === name)!;
  assert.equal(star('Dubhe').y, 0, 'Dubhe is the top of the figure');
  assert.equal(star('Alkaid').y, 1, 'Alkaid is the bottom of the figure');
  assert.equal(star('Alkaid').x, 0, 'the handle reaches furthest east, on the left');
  assert.equal(star('Merak').x, 1, 'the bowl’s far side is the west edge, on the right');
  assert.ok(Math.abs(star('Dubhe').x - star('Merak').x) < 0.05, 'the pointers are nearly vertical');
  // The handle steps down and eastward from the bowl, star by star.
  const handle = ['Megrez', 'Alioth', 'Mizar', 'Alkaid'].map(star);
  for (let i = 1; i < handle.length; i += 1) {
    assert.ok(handle[i].x < handle[i - 1].x, `${handle[i].name} is east of ${handle[i - 1].name}`);
    assert.ok(handle[i].y > handle[i - 1].y - 0.01, `${handle[i].name} is no higher than ${handle[i - 1].name}`);
  }
  // The asterism spans roughly 25° of sky east–west and 12° north–south:
  // about twice as wide as it is tall, and the figure keeps that.
  assert.ok(sky.aspect > 1.7 && sky.aspect < 2.1, `the Dipper is about twice as wide as tall: ${sky.aspect}`);

  // Seven lines: four round the bowl, three along the handle, every one
  // between two of the seven and none drawn twice.
  assert.equal(sky.edges.length, 7);
  const seen = new Set<string>();
  for (const [a, b] of sky.edges) {
    assert.ok(a >= 0 && a < 7 && b >= 0 && b < 7 && a !== b);
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    assert.ok(!seen.has(key), `line ${key} drawn twice`);
    seen.add(key);
  }
  const bowl = sky.edges.slice(0, 4).map(([a, b]) => [sky.stars[a].name, sky.stars[b].name].sort().join('–'));
  assert.deepEqual(
    bowl.sort(),
    ['Dubhe–Megrez', 'Dubhe–Merak', 'Megrez–Phecda', 'Merak–Phecda'],
    'the bowl closes on its four stars',
  );
});

/* -------------------------------- the dates ----------------------------- */

test('plan: the dates are the record’s own — next scan from the cadence, three months from the scan', () => {
  const s = session(['front']);
  const data = dataWith({ sessions: [s] });
  const model = buildPlanModel(data);
  assert.equal(model.nextScanISO, addDays(CAPTURED, 30));
  const three = new Date(CAPTURED);
  three.setMonth(three.getMonth() + SIDE_BY_SIDE_MONTHS);
  assert.equal(model.threeMonthsISO, three.toISOString());

  // A cadence that already reaches past three months makes the second
  // line redundant, so it is dropped rather than said out of order.
  const slow = buildPlanModel(dataWith({ sessions: [s], journey: journey({ updateIntervalDays: 120 }) }));
  assert.equal(slow.threeMonthsISO, null);
  const lines = sequenceLines(slow).map((l) => l.id);
  assert.ok(lines.includes('secondScan') && !lines.includes('threeMonths'));

  // Before a journey there is nothing to date.
  const none = buildPlanModel({ ...EMPTY_DATA });
  assert.equal(none.nextScanISO, null);
  assert.equal(none.threeMonthsISO, null);
  assert.deepEqual(sequenceLines(none).map((l) => l.id), ['welcome', 'minutes', 'stays', 'start']);
});

/* ------------------------------- the words ------------------------------ */

const OUTCOME = /\byou.ll\b|\byou will\b|\bothers will\b|\bfeel the difference\b|\bsee it\b|\bnotice\b|\bresults?\b/i;
const SOCIAL_PROOF = /\bjoined today\b|\bpeople joined\b|\d[\d,]*\s+(people|users|members)\b/i;
const CATALOGUE = /\bproducts? (overall|in the|match)\b|\bdatabase\b|\bmost effective\b|\bsuited for\b/i;

test('plan: every sentence passes the honesty sweep, and the two reference lies are absent', () => {
  const sentences = planCopySentences();
  assert.ok(sentences.length > 30, 'the sweep reads the whole script, facts included');
  assertHonest(assert, sentences, 'plan copy');
  const text = sentences.join(' ');
  for (const word of ['density', 'progress', 'thinning', 'stage', 'you will', 'you’ll', "you'll", 'results']) {
    assert.ok(!text.toLowerCase().includes(word), `plan copy must not say "${word}"`);
  }
  // A fact is worded as what is known, never as a promise about one head.
  for (const word of ['will look', 'suits you', 'improves', 'promise', 'guaranteed']) {
    assert.ok(!text.toLowerCase().includes(word), `plan copy promises: "${word}"`);
  }
  assert.ok(!OUTCOME.test(text), `plan copy forecasts an outcome: ${text}`);
  assert.ok(!SOCIAL_PROOF.test(text), `plan copy invents company: ${text}`);
  assert.ok(!CATALOGUE.test(text), `plan copy counts a catalogue: ${text}`);
});

test('plan: the one exclamation is the person’s own word, and it is the only one', () => {
  // "Yes!" is the pill's label for under a second after the slide. It is
  // not in the sweep above because the sweep forbids exclamation, and it
  // is held here to exactly that one word so nothing else can hide in it.
  assert.equal(PLAN_COPY.commit.done, 'Yes!');
  const lower = PLAN_COPY.commit.done.toLowerCase();
  for (const claim of HAIR_CLAIMS) assert.ok(!lower.includes(claim));
  for (const s of planCopySentences()) assert.ok(!s.includes('!'), `only the commit word may exclaim: ${s}`);
});


test('plan: the citation is the real paper, verbatim, with no institution’s logo to stand in for it', () => {
  assert.equal(
    PLAN_COPY.commit.citation.title,
    'The effectiveness of nudging: A meta-analysis of choice architecture interventions across behavioral domains',
  );
  assert.equal(PLAN_COPY.commit.citation.source, 'Mertens, Herberz, Hahnel & Brosch, PNAS 2022');
});

test('plan: the sequence opens on the welcome, ends on the record, and dates only what the record will hold', () => {
  const s = session(['front']);
  const lines = sequenceLines(buildPlanModel(dataWith({ sessions: [s] })));
  assert.equal(lines[0].id, 'welcome');
  assert.equal(lines[0].mark, true);
  assert.equal(lines[lines.length - 1].id, 'start');
  assert.equal(lines[lines.length - 1].last, true);
  assert.equal(lines.filter((l) => l.last).length, 1);
  const dated = lines.filter((l) => l.id === 'secondScan' || l.id === 'threeMonths');
  assert.equal(dated.length, 2);
  for (const l of dated) {
    assert.match(l.line.before, /^By $/);
    assert.ok(l.line.accent.length > 0, 'the date is the accent word');
    assert.match(l.line.after, /scan|side by side/, 'what the record will hold by then');
    assert.ok(!OUTCOME.test(l.line.after), `a dated line forecasts: ${l.line.after}`);
  }
});
