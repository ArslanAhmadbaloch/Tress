/**
 * The plan sequence counts real things and says nothing about a head.
 *
 * Every number it rolls up is checked against the record it was taken
 * from — answers given, images kept, regions reached, notes chosen,
 * routine steps — and every sentence it can say goes through the honesty
 * sweep, plus the two lies the reference product tells that Tress must
 * not: an outcome by a date ("you'll feel the difference") and invented
 * company ("N people joined today").
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { tipsFor } from '@/features/hair-scan/tips';
import {
  PLAN_COPY,
  countLine,
  lineSentence,
  planCopySentences,
  sequenceLines,
} from '@/features/onboarding/plan-copy';
import {
  SIDE_BY_SIDE_MONTHS,
  answersGiven,
  buildPlanModel,
  regionsCovered,
} from '@/features/onboarding/plan-model';
import { addDays } from '@/lib/date';
import {
  ANGLES,
  EMPTY_DATA,
  HAIR_GOAL_LABELS,
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
  const model = buildPlanModel(data);
  const byId = new Map(model.counts.map((c) => [c.id, c]));

  // Name, age band, gender; areas, motivations, goals, triggers,
  // approaches, when noticed, cadence: ten questions answered.
  assert.equal(byId.get('answers')?.value, 10);
  assert.equal(answersGiven(data), 10);
  assert.equal(byId.get('frames')?.value, s.photos.length, 'images kept is the photographs in the session');
  assert.equal(byId.get('regions')?.value, 4, 'four angles reach four regions; no crown frame, no crown');
  assert.deepEqual(regionsCovered(s), ['hairline', 'leftTemple', 'rightTemple', 'top']);
  assert.equal(byId.get('tips')?.value, tipsFor('hairline').length);
  assert.equal(byId.get('tips')?.goal, 'hairline');
  assert.equal(byId.get('routine'), undefined, 'an empty routine list is not rolled up to zero');
  assert.deepEqual(
    model.counts.map((c) => c.id),
    ['answers', 'frames', 'regions', 'tips'],
    'in the order the sequence rolls them',
  );
  for (const count of model.counts) assert.ok(count.value > 0);
});

test('plan: the counts never reach past the record', () => {
  const ids = new Set(['answers', 'frames', 'regions', 'tips', 'routine']);
  const full = session([...ANGLES]);
  const data = dataWith({
    sessions: [full],
    routineItems: [
      { id: 'r1', journeyId: 'j1', label: 'Morning dropper', cadence: 'daily', createdAt: CAPTURED },
      { id: 'r2', journeyId: 'j1', label: 'Old', cadence: 'daily', createdAt: CAPTURED, archivedAt: CAPTURED },
    ],
  });
  const model = buildPlanModel(data);
  for (const c of model.counts) assert.ok(ids.has(c.id), `unknown count ${c.id}`);
  const byId = new Map(model.counts.map((c) => [c.id, c.value]));
  assert.equal(byId.get('regions'), 5, 'every angle held reaches every region');
  assert.equal(byId.get('frames'), 5);
  assert.equal(byId.get('routine'), 1, 'archived items are not steps on the list');
  // The scanner's own frame tally — the frames it held before curating —
  // is not what "kept" means: kept is what is in the record.
  assert.notEqual(byId.get('frames'), full.scan?.frameCount);
});

test('plan: with no scan and no answers beyond a name, only what exists is counted', () => {
  const data = dataWith({
    profile: { id: 'p1', displayName: 'Sam', createdAt: CAPTURED },
    journey: journey({ trackingAreas: [], motivations: [], goals: [], triggers: [], approaches: [], noticed: undefined, updateIntervalDays: 30 }),
  });
  const model = buildPlanModel(data);
  const byId = new Map(model.counts.map((c) => [c.id, c]));
  assert.equal(byId.get('answers')?.value, 2, 'the name and the cadence');
  assert.equal(byId.get('frames'), undefined);
  assert.equal(byId.get('regions'), undefined);
  assert.equal(byId.get('tips')?.value, tipsFor(undefined).length, 'the everyday notes when no goal was picked');
  assert.equal(byId.get('tips')?.goal, undefined);
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

const OUTCOME = /\byou.ll\b|\bothers will\b|\bfeel the difference\b|\bsee it\b|\bnotice\b|\bresults?\b/i;
const SOCIAL_PROOF = /\bjoined today\b|\bpeople joined\b|\d[\d,]*\s+(people|users|members)\b/i;
const CATALOGUE = /\bproducts? (overall|in the|match)\b|\bdatabase\b|\bmost effective\b|\bsuited for\b/i;

test('plan: every sentence passes the honesty sweep, and the two reference lies are absent', () => {
  const sentences = planCopySentences();
  assert.ok(sentences.length > 20, 'the sweep reads the whole script');
  assertHonest(assert, sentences, 'plan copy');
  const text = sentences.join(' ');
  for (const word of ['density', 'progress', 'thinning', 'stage']) {
    assert.ok(!text.toLowerCase().includes(word), `plan copy must not say "${word}"`);
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

test('plan: a count line names the count and one accent word, and quotes the goal rather than adopting it', () => {
  assert.equal(lineSentence(countLine({ id: 'answers', value: 1 })), 'answer about your hair');
  assert.equal(lineSentence(countLine({ id: 'answers', value: 12 })), 'answers about your hair');
  assert.equal(lineSentence(countLine({ id: 'frames', value: 4 })), 'images kept from your scan');
  assert.equal(lineSentence(countLine({ id: 'regions', value: 1 })), 'region of your head covered');
  assert.equal(lineSentence(countLine({ id: 'routine', value: 2 })), 'steps already on your routine');

  const crown = countLine({ id: 'tips', value: 4, goal: 'crown' });
  assert.equal(crown.quoted, true, 'the goal is the person’s own answer');
  assert.equal(crown.accent, 'more density at the crown', 'read back as the label they chose, mid-sentence');
  assert.equal(lineSentence(crown), 'care notes chosen for', 'the quotation is left out of the sweep');
  const unsure = countLine({ id: 'tips', value: 4, goal: 'unsure' });
  assert.equal(unsure.accent, 'everyday care');
  assert.equal(unsure.quoted, false, 'a stand-in phrase is authored, and the sweep reads it');
  // Every goal label reads as a quotation, so the sweep never judges them.
  for (const goal of Object.keys(HAIR_GOAL_LABELS) as (keyof typeof HAIR_GOAL_LABELS)[]) {
    const line = countLine({ id: 'tips', value: 4, goal });
    assert.ok(line.accent.length > 0);
  }
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
