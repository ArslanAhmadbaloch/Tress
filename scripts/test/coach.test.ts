/**
 * Ask Tress has to answer from the record and from nothing else.
 *
 * A keyword matcher can route a question to the wrong answer with total
 * confidence, and a template can slide from "you ticked 66%" into "great
 * job" without anybody noticing. So the worked precedence table is pinned
 * row by row, every fixture is swept against every intent for the words
 * that would mean the coach had started describing a head, and each
 * number it says is checked against the selector Home and Report read.
 *
 * Fixtures are copied from assessment.test.ts and selectors.test.ts rather
 * than imported: a test file that reaches into another test file's helpers
 * breaks when that file is refactored, and a coach fixture should not
 * change because the report's did.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { coverageTrendFinding } from '@/features/assessment/engine';
import {
  ASK_BAR_PLACEHOLDER,
  CHIPS,
  COMPOSER_PLACEHOLDER,
  WELCOME_FALLBACK_TITLE,
  WELCOME_MUTED,
  answerFor,
  answerSentences,
  matchIntent,
  normalise,
  suggestedQuestions,
  welcomeTitle,
  type CoachIntent,
  type IntentMatch,
  type MatchContext,
} from '@/features/coach';
import { coveragePoints, profileSentence, tressSays } from '@/features/coach/report-summary';
import { confidenceBand, gradeOf } from '@/features/hair-scan/grade';
import { compareScans } from '@/features/hair-scan/measure';
import { stripQuotes } from '@/features/hair-scan/report-copy';
import { TRACKING_TIPS, tipSentences, tipsForProfile } from '@/features/hair-scan/tips';
import { formatRelative, toDateKey } from '@/lib/date';
import {
  activeRoutineItems,
  adherencePercent,
  currentStreak,
  nextUpdate,
  routineItemStats,
  sessionsChronological,
} from '@/store/selectors';
import {
  ANGLES,
  APPROACH_LABELS,
  BUDGET_LABELS,
  EMPTY_DATA,
  HAIR_CONCERN_LABELS,
  HAIR_GOAL_LABELS,
  HAIR_TYPE_LABELS,
  HEAT_STYLING_LABELS,
  INGREDIENT_REACTION_LABELS,
  LIFE_FACTOR_LABELS,
  PRODUCT_FACTOR_LABELS,
  SCALP_CONDITION_LABELS,
  SCALP_SENSITIVITY_LABELS,
  SCALP_TYPE_LABELS,
  SCHEMA_VERSION,
  SELF_CONSISTENCY_LABELS,
  TRACKING_AREA_LABELS,
  type AppData,
  type Journey,
  type Photo,
  type PhotoSession,
  type PhotoSessionMeasurement,
  type PhotoSessionRegionChange,
  type RoutineCadence,
  type RoutineItem,
  type ScanChangeVerdict,
  type ScanMeasureRegion,
} from '@/types/domain';

import { assertHonest } from './honesty-words';

/* ------------------------------ fixtures ------------------------------- */

/** Midnight, `ago` days back, in the device's own timezone, so log keys line up with `toDateKey`. */
function daysAgo(ago: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ago);
}

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
      goals: ['fullness'],
      triggers: [],
      approaches: [],
      selfConsistency: 'onOff',
      updateIntervalDays: 30,
      createdAt: daysAgo(200).toISOString(),
    },
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

const clean = { brightness: 128, contrast: 42, sharpness: 15, clipped: 0.01, issues: [] };
const rough = { brightness: 30, contrast: 9, sharpness: 2, clipped: 0.4, issues: ['tooDark'] };

/** Every photograph measured and found clean. */
function cleanSet(s: PhotoSession): PhotoSession {
  return { ...s, photos: s.photos.map((p) => ({ ...p, quality: clean })) };
}

/**
 * The front shot dark, soft and burnt, the rest clean. Not `withIssue`
 * from assessment.test.ts, which marks the first photo — `top` — and the
 * coach reads the hero, which is the front shot.
 */
function darkFront(s: PhotoSession): PhotoSession {
  return {
    ...s,
    photos: s.photos.map((p) => ({ ...p, quality: p.angle === 'front' ? rough : clean })),
  };
}

function item(
  id: string,
  label: string,
  createdDaysAgo: number,
  cadence: RoutineCadence = 'daily',
): RoutineItem {
  return {
    id,
    journeyId: 'j1',
    label,
    cadence,
    ...(cadence === 'weekly' ? { timesPerWeek: 2 } : {}),
    createdAt: daysAgo(createdDaysAgo).toISOString(),
  };
}

function log(itemId: string, dAgo: number) {
  return {
    id: `log_${itemId}_${dAgo}`,
    routineItemId: itemId,
    date: toDateKey(daysAgo(dAgo)),
    completed: true,
    loggedAt: daysAgo(dAgo).toISOString(),
  };
}

/** Sessions the way the store holds them: newest first. */
function withSessions(data: AppData, ...sessions: PhotoSession[]): AppData {
  return {
    ...data,
    sessions: [...sessions].sort(
      (a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt),
    ),
  };
}

/**
 * Two daily items and a weekly one, sixty days old. Topical ticked every
 * day of the window, Tablet on even days only, Wash never — so there is a
 * real adherence figure and a weakest item to name.
 */
function withRoutine(data: AppData, days = 30): AppData {
  const range = Array.from({ length: days }, (_, d) => d);
  return {
    ...data,
    routineItems: [
      ...data.routineItems,
      item('topical', 'Topical', 60),
      item('tablet', 'Tablet', 60),
      item('wash', 'Wash', 60, 'weekly'),
    ],
    routineLogs: [
      ...data.routineLogs,
      ...range.map((d) => log('topical', d)),
      ...range.filter((d) => d % 2 === 0).map((d) => log('tablet', d)),
    ],
  };
}

/** One daily item ticked every day for the last nine days. */
function withStreak(data: AppData): AppData {
  return {
    ...data,
    routineItems: [...data.routineItems, item('topical', 'Topical', 60)],
    routineLogs: [
      ...data.routineLogs,
      ...Array.from({ length: 9 }, (_, d) => log('topical', d)),
    ],
  };
}

const NEWEST_BODY = 'Switched to mornings. Scalp felt dry after the wash.';

function withJournal(data: AppData): AppData {
  return {
    ...data,
    journal: [
      ...data.journal,
      { id: 'n1', journeyId: 'j1', body: 'Started the journal.', createdAt: daysAgo(40).toISOString() },
      { id: 'n2', journeyId: 'j1', body: NEWEST_BODY, createdAt: daysAgo(1).toISOString() },
    ],
  };
}

const twoMeaningful = withSessions(
  base(),
  withCoverage(cleanSet(session('s1', 90, ANGLES)), coverage(0.5, 0.5)),
  withCoverage(cleanSet(session('s2', 30, ANGLES)), coverage(0.56, 0.6, 0.52)),
);

const full = withJournal(withRoutine(twoMeaningful));

/** A journey from the current funnel: every self-knowledge question answered, "none" answers included. */
function withSelfKnowledge(data: AppData): AppData {
  const journey: Journey = {
    ...data.journey!,
    hairType: 'wavy',
    scalpType: 'oily',
    scalpSensitivity: 'sensitive',
    concerns: ['frizz', 'dandruff'],
    budget: 'midRange',
    productFactors: ['sulfateFree', 'noPreference'],
    ingredientReactions: ['fragrance'],
    scalpConditions: ['dandruff'],
    lifeFactors: ['none'],
    heatStyling: 'daily',
  };
  return { ...data, journey };
}

const FIXTURES: Record<string, AppData> = {
  empty: base(),
  selfKnown: withSelfKnowledge(full),
  routineOnly: withRoutine(base()),
  routineToday: { ...base(), routineItems: [item('new', 'Topical', 0)] },
  oneUnmeasured: withSessions(base(), session('s1', 30, ANGLES)),
  oneMeasured: withSessions(
    base(),
    withCoverage(cleanSet(session('s1', 30, ANGLES)), coverage(0.31, 0.44, 0.5, 0.48)),
  ),
  oneDark: withSessions(base(), darkFront(session('s1', 30, ANGLES))),
  twoNoise: withSessions(
    base(),
    withCoverage(session('s1', 90, ANGLES), coverage(0.5, 0.5)),
    withCoverage(session('s2', 30, ANGLES), coverage(0.51, 0.5)),
  ),
  twoMeaningful,
  twoFramingSuspect: withSessions(
    base(),
    withCoverage(session('s1', 90, ANGLES), coverage(0.4, 0.4, 0.5)),
    withCoverage(session('s2', 30, ANGLES), coverage(0.7, 0.8, 0.8)),
  ),
  twoMixed: withSessions(
    base(),
    session('s1', 90, ANGLES),
    withCoverage(session('s2', 30, ANGLES), coverage(0.5, 0.5)),
  ),
  twoDropped: withSessions(
    base(),
    session('s1', 90, ANGLES),
    session('s2', 30, ['top', 'leftTemple', 'crown', 'front']),
  ),
  overdue: withSessions(base(), session('s1', 45, ANGLES)),
  dueToday: withSessions(base(), session('s1', 30, ANGLES)),
  full,
  streak9: withStreak(base()),
  noName: { ...full, profile: { ...full.profile!, displayName: '  ' } },
};

const ALL_INTENTS: readonly CoachIntent[] = [
  'consistency', 'streak', 'itemAdherence', 'lastScan', 'nextSet', 'compare', 'keepSame',
  'areaMeaning', 'record', 'stack', 'journal', 'goals', 'privacy', 'help',
  'refuseMedication', 'refuseDiagnose', 'refusePredict', 'unknown',
];

const DATA_INTENTS = ALL_INTENTS.filter(
  (i) => !['areaMeaning', 'privacy', 'help', 'refuseMedication', 'refuseDiagnose', 'refusePredict', 'unknown'].includes(i),
);

/** The match a fixture × intent pair is answered from; itemAdherence names the first item, or nothing. */
function matchFor(intent: CoachIntent, data: AppData): IntentMatch {
  if (intent !== 'itemAdherence') return { intent };
  return { intent, itemId: activeRoutineItems(data)[0]?.id ?? 'nobody' };
}

function ask(intent: CoachIntent, data: AppData) {
  return answerFor(matchFor(intent, data), data);
}

const IN_STACK: MatchContext = { itemLabels: [{ id: 'topical', label: 'Minoxidil (topical)' }] };

/* --------------------------------- matcher --------------------------------- */

test('coach: normalisation', () => {
  assert.equal(normalise("What's the Streak?!"), ' whats the streak ');
  assert.equal(normalise(''), ' ');
  assert.equal(matchIntent('').intent, 'unknown');
});

/** Every row of the worked precedence table in the spec. */
const TABLE: [string, CoachIntent, MatchContext?][] = [
  ['will minoxidil regrow my hair', 'refusePredict'],
  ['is my hair thinning', 'refuseDiagnose'],
  ['what norwood am i', 'refuseDiagnose'],
  ['what stage am i', 'refuseDiagnose'],
  ['am i going bald', 'refuseDiagnose'],
  ['is my hairline ok', 'refuseDiagnose'],
  ['will my hairline get worse', 'refusePredict'],
  ['is my routine working', 'refusePredict'],
  ['will my hair grow back if i stay consistent', 'refusePredict'],
  ['is minoxidil working', 'refuseMedication'],
  ['should i up my dose', 'refuseMedication'],
  ['is it safe to stop finasteride', 'refuseMedication'],
  ['what shampoo should i use', 'refuseMedication'],
  ['should i stop minoxidil', 'refuseMedication', IN_STACK],
  ['should i see a dermatologist', 'refuseDiagnose'],
  ['when did i start minoxidil', 'itemAdherence', IN_STACK],
  ['when did i start minoxidil', 'record'],
  ['did i tick minoxidil today', 'itemAdherence', IN_STACK],
  ['did i tick minoxidil today', 'consistency'],
  ['how consistent have i been with minoxidil', 'itemAdherence', IN_STACK],
  ['how long have i been on rosemary oil', 'record'],
  ['when will my next set be due', 'nextSet'],
  ['will you remind me when the next set is due', 'nextSet'],
  ['how consistent have i been since my last set', 'consistency'],
  ['what changed since my last scan', 'compare'],
  ['what did my last set say', 'lastScan'],
  ['when is my next scan due', 'nextSet'],
  ['how many angles in my last set', 'record'],
  ['what should i keep the same as last time', 'keepSame'],
  ['am i on track', 'consistency'],
  ['what does my record show', 'record'],
  ['how is it going', 'consistency'],
  ['what did the ring mean', 'areaMeaning'],
  ['how many sets so far', 'record'],
  ['compare my last two sets', 'compare'],
  ['where do my photos go', 'privacy'],
  ["What's in my stack?!", 'stack'],
  ['HOW CONSISTENT have i been', 'consistency'],
  ['hi', 'help'],
  ['thanks', 'help'],
  ['what can you do', 'help'],
  ['are you ai', 'help'],
  ['will the app work offline', 'privacy'],
  ['asdf qwerty', 'unknown'],
  ['tell me a joke', 'unknown'],
  ['', 'unknown'],
];

test('coach: intent table', () => {
  for (const [text, expected, ctx] of TABLE) {
    const match = matchIntent(text, ctx);
    assert.equal(match.intent, expected, `"${text}" (${ctx ? 'in stack' : 'empty'})`);
    if (expected === 'itemAdherence') assert.equal(match.itemId, 'topical', `"${text}" names the item`);
    else assert.equal(match.itemId, undefined, `"${text}" names no item`);
  }
  for (const chip of CHIPS) {
    assert.equal(matchIntent(chip.label).intent, chip.intent, `chip "${chip.label}"`);
  }
});

test('coach: refusal precedence', () => {
  const refusals = TABLE.filter(([, intent]) => intent.startsWith('refuse'));
  assert.ok(refusals.length >= 15, 'the table carries the refusal rows');
  for (const [text, expected] of refusals) {
    // A refusal is a refusal whether or not the treatment is in the stack.
    assert.equal(matchIntent(text).intent, expected, `"${text}" (empty)`);
    assert.equal(matchIntent(text, IN_STACK).intent, expected, `"${text}" (in stack)`);
  }
  assert.equal(matchIntent('should i stop minoxidil', IN_STACK).intent, 'refuseMedication');
  for (const text of ['when did i start minoxidil', 'did i tick minoxidil today']) {
    for (const ctx of [undefined, IN_STACK]) {
      assert.ok(!matchIntent(text, ctx).intent.startsWith('refuse'), `"${text}" is answered, not refused`);
    }
  }
});

/* -------------------------------- honesty ---------------------------------- */

test('coach: honesty sweep', () => {
  for (const [name, data] of Object.entries(FIXTURES)) {
    for (const intent of ALL_INTENTS) {
      assertHonest(assert, answerSentences(ask(intent, data)), `${name}/${intent}`);
    }
  }
  assertHonest(assert, CHIPS.map((c) => c.label), 'chips');
  assertHonest(
    assert,
    [
      WELCOME_MUTED,
      WELCOME_FALLBACK_TITLE,
      ASK_BAR_PLACEHOLDER,
      COMPOSER_PLACEHOLDER,
      welcomeTitle('Sam'),
      welcomeTitle(' '),
    ],
    'welcome and placeholders',
  );
});

test('coach: refusals carry no record', () => {
  const data = FIXTURES.full;
  for (const intent of ['refuseMedication', 'refuseDiagnose', 'refusePredict', 'unknown'] as const) {
    const a = ask(intent, data);
    const text = `${a.headline} ${a.detail ?? ''}`;
    assert.equal(a.refusal, true, intent);
    assert.equal(a.source, 'Outside your record', intent);
    assert.ok(!/\d/.test(text), `${intent} carries no number`);
    assert.equal(a.echo, undefined, `${intent} echoes nothing`);
    assert.equal(a.figure, undefined, `${intent} draws nothing`);
    assert.equal(a.action, undefined, `${intent} offers no action`);
    assert.ok(!text.includes('Topical'), `${intent} names no routine item`);
  }
  for (const intent of ['refuseMedication', 'refuseDiagnose'] as const) {
    assert.match(ask(intent, data).detail!, /qualified healthcare professional/);
  }
  assert.match(ask('refuseMedication', data).detail!, /Terms/);
  for (const intent of ALL_INTENTS.filter((i) => !i.startsWith('refuse') && i !== 'unknown')) {
    assert.equal(ask(intent, data).refusal, false, intent);
  }
});

/* --------------------------------- chips ----------------------------------- */

test('coach: chips', () => {
  for (const chip of CHIPS) {
    assert.equal(matchIntent(chip.label).intent, chip.intent, chip.label);
  }

  const excludes: (CoachIntent | undefined)[] = [undefined, ...ALL_INTENTS];
  for (const [name, data] of Object.entries(FIXTURES)) {
    for (const x of excludes) {
      const chips = suggestedQuestions(data, x);
      assert.equal(chips.length, 3, `${name} excluding ${x}`);
      assert.ok(chips.every((c) => c.intent !== x), `${name} never re-offers ${x}`);
      const intents = chips.map((c) => c.intent);
      if (name === 'empty') {
        for (const never of ['lastScan', 'compare', 'nextSet']) {
          assert.ok(!intents.includes(never as CoachIntent), `${name} never offers ${never}`);
        }
      }
      if (name === 'oneMeasured') assert.ok(!intents.includes('compare'), `${name} never offers compare`);
      if (activeRoutineItems(data).length === 0) {
        for (const never of ['consistency', 'streak', 'stack']) {
          assert.ok(!intents.includes(never as CoachIntent), `${name} does not lead with ${never}`);
        }
      }
    }
  }

  assert.equal(suggestedQuestions(FIXTURES.twoMeaningful)[0].intent, 'compare');
  assert.deepEqual(
    suggestedQuestions(FIXTURES.full, 'refusePredict').map((c) => c.intent),
    ['compare', 'record', 'stack'],
  );
  for (const name of ['empty', 'oneMeasured', 'twoMeaningful']) {
    assert.equal(activeRoutineItems(FIXTURES[name]).length, 0, `${name} has no routine`);
  }
});

/* -------------------------------- numbers ---------------------------------- */

test('coach: numbers agree with Home and Report', () => {
  const data = FIXTURES.full;

  const pct = adherencePercent(data, 30);
  assert.ok(pct !== null, 'the fixture yields an adherence figure');
  const consistency = ask('consistency', data);
  assert.equal(consistency.figure?.value, pct / 100);
  assert.ok(consistency.headline.includes(`${pct}%`), consistency.headline);

  const due = nextUpdate(data)!;
  assert.ok(ask('nextSet', data).headline.includes(formatRelative(due.dueISO)));

  const topical = routineItemStats(data).find((s) => s.item.label === 'Topical')!;
  assert.ok(topical.adherence !== null);
  assert.ok(topical.daysDonePercent !== null);
  const perItem = answerFor({ intent: 'itemAdherence', itemId: topical.item.id }, data);
  assert.equal(perItem.intent, 'itemAdherence');
  // The sentence says "on X% of its days", so it must carry the share of
  // days, not the cadence-weighted figure.
  assert.ok(perItem.headline.includes(`${topical.daysDonePercent}%`), perItem.headline);

  const streak9 = FIXTURES.streak9;
  assert.equal(currentStreak(streak9), 9);
  assert.equal(ask('streak', streak9).headline, '9 days in a row.');
});

test('coach: "ticked least often" counts days, not cadence', () => {
  /*
    The two figures on a stat disagree by design, and this sentence is the
    place it matters. A twice-weekly shampoo ticked on 8 of the last 30
    days has done most of what it asked for; a daily tablet ticked on 25
    of 30 has done less of what it asked for but was ticked on three times
    as many days. Ranked by `adherence` the coach would name the tablet as
    "the one ticked least often", which is true about pace and false about
    days — the sentence says days, so it has to rank on days.
  */
  const data: AppData = {
    ...base(),
    routineItems: [
      item('tablet', 'Tablet', 40),
      item('shampoo', 'Shampoo', 40, 'weekly'),
    ],
    routineLogs: [
      ...Array.from({ length: 25 }, (_, d) => log('tablet', d + 1)),
      ...Array.from({ length: 8 }, (_, d) => log('shampoo', (d + 1) * 3)),
    ],
  };

  const stats = routineItemStats(data);
  const tablet = stats.find((s) => s.item.id === 'tablet')!;
  const shampoo = stats.find((s) => s.item.id === 'shampoo')!;

  // The inversion the sentence has to survive, asserted rather than assumed.
  assert.ok(
    (shampoo.adherence as number) > (tablet.adherence as number),
    'the weekly item is further along its own cadence',
  );
  assert.ok(
    (shampoo.daysDonePercent as number) < (tablet.daysDonePercent as number),
    'and yet it was ticked on far fewer days',
  );

  const detail = ask('consistency', data).detail ?? '';
  assert.match(detail, /ticked least often/);
  assert.match(detail, /Shampoo/, detail);
  assert.ok(!detail.includes('Tablet'), detail);
  assert.ok(
    detail.includes(`${shampoo.daysDonePercent}%`),
    'and the number beside the name is the share of days',
  );
});

/* ---------------------------------- echo ----------------------------------- */

test('coach: echo isolation', () => {
  const domainLabels = new Set<string>([
    ...Object.values(HAIR_GOAL_LABELS),
    ...Object.values(TRACKING_AREA_LABELS),
    ...Object.values(APPROACH_LABELS),
    ...Object.values(SELF_CONSISTENCY_LABELS),
    ...Object.values(HAIR_TYPE_LABELS),
    ...Object.values(SCALP_TYPE_LABELS),
    ...Object.values(SCALP_SENSITIVITY_LABELS),
    ...Object.values(HAIR_CONCERN_LABELS),
    ...Object.values(BUDGET_LABELS),
    ...Object.values(PRODUCT_FACTOR_LABELS),
    ...Object.values(INGREDIENT_REACTION_LABELS),
    ...Object.values(SCALP_CONDITION_LABELS),
    ...Object.values(LIFE_FACTOR_LABELS),
    ...Object.values(HEAT_STYLING_LABELS),
  ]);

  let echoed = 0;
  for (const [name, data] of Object.entries(FIXTURES)) {
    const itemLabels = new Set(activeRoutineItems(data).map((i) => i.label));
    const bodies = data.journal.map((e) => e.body);
    for (const intent of ALL_INTENTS) {
      const a = ask(intent, data);
      if (!a.echo) continue;
      echoed += 1;
      assert.ok(a.echoLabel, `${name}/${intent} captions its quotation`);
      const sentences = answerSentences(a);
      for (const line of a.echo) {
        const theirs =
          domainLabels.has(line) ||
          itemLabels.has(line) ||
          bodies.some((b) => b.startsWith(line.replace(/…$/, '')));
        assert.ok(theirs, `${name}/${intent} echoes only their own words: "${line}"`);
        assert.ok(!sentences.includes(line), `${name}/${intent} keeps the echo out of the sweep`);
      }
    }
  }
  assert.ok(echoed > 0, 'the fixtures exercise the echo channel');
});

/* --------------------------------- goals ----------------------------------- */

test('coach: every goal they gave is read back, and only what they gave', () => {
  const one = ask('goals', FIXTURES.full);
  assert.deepEqual(one.echo!.slice(0, 1), ['More fullness']);
  assert.equal(one.echoLabel, 'Your goal and the areas you watch');

  const several: AppData = {
    ...FIXTURES.full,
    journey: { ...FIXTURES.full.journey!, goals: ['fullness', 'shedding', 'routineWorking'] },
  };
  const many = ask('goals', several);
  assert.deepEqual(many.echo!.slice(0, 3), [
    'More fullness',
    'Less shedding',
    'Knowing whether my routine is working',
  ]);
  assert.equal(many.echoLabel, 'What you said you want and the areas you watch');
  assert.ok(
    !answerSentences(many).join(' ').includes('More fullness'),
    'their words stay in the quotation, out of the sweep',
  );
});

test('coach: a journey saved before the change still answers about its goal', () => {
  // The blob on a phone that has not been through the loader yet, or a
  // record the loader could not reach. The reader takes both shapes.
  const legacy: AppData = {
    ...FIXTURES.full,
    journey: { ...FIXTURES.full.journey!, goals: undefined, goal: 'hairline' },
  };
  assert.deepEqual(ask('goals', legacy).echo!.slice(0, 1), ['A stronger-looking hairline']);
});

test('coach: what they told Tress about themselves is read back as the labels they picked', () => {
  const a = ask('goals', FIXTURES.selfKnown);
  assert.equal(a.refusal, false);
  // The one sentence that states an answer attributes it and quotes it; the rest stays as it was.
  assert.equal(
    a.detail,
    'You told Tress your hair is “wavy” and your scalp is “oily” and “sensitive”. Kept as you said it, shown back as you said it.',
  );
  assert.equal(
    a.echoLabel,
    'Your goal, the areas you watch and what you told Tress about yourself',
  );
  // Every new label is in the echo, once — "Dandruff" is both a concern and a condition, and "none" closes a list.
  for (const label of ['Wavy', 'Oily', 'Sensitive', 'Frizz', 'Dandruff', 'Mid-range', 'Sulfate-free', 'No preferences', 'Fragrance (listed as parfum)', 'None', 'Daily']) {
    assert.equal(a.echo!.filter((line) => line === label).length, 1, label);
  }
  assert.ok(!answerSentences(a).join(' ').includes('Wavy'), 'the capitalised label lives in the echo, not the template');
  assertHonest(assert, answerSentences(a), 'goals with self-knowledge');

  // Any one of the three describes on its own; a value the app never offered is dropped, not printed.
  const scalpOnly: AppData = { ...FIXTURES.full, journey: { ...FIXTURES.full.journey!, scalpType: 'dry' } };
  assert.match(ask('goals', scalpOnly).detail!, /^You told Tress your scalp is “dry”\. Kept/);
  const hairOnly: AppData = { ...FIXTURES.full, journey: { ...FIXTURES.full.journey!, hairType: 'coily' } };
  assert.match(ask('goals', hairOnly).detail!, /^You told Tress your hair is “coily”\. Kept/);
  const off: AppData = { ...FIXTURES.full, journey: { ...FIXTURES.full.journey!, hairType: 'mullet' as unknown as Journey['hairType'] } };
  assert.equal(ask('goals', off).detail, 'Kept as you said it, shown back as you said it.');
  assert.ok(!ask('goals', off).echo!.includes('mullet'));

  // A journey from before the questions reads exactly as it did.
  const before = ask('goals', FIXTURES.full);
  assert.equal(before.detail, 'Kept as you said it, shown back as you said it.');
  assert.equal(before.echoLabel, 'Your goal and the areas you watch');
});

test('coach: a journey with no goal at all captions only what it has', () => {
  // Nothing invented, and nothing left promising a goal above a list
  // that has none.
  const none: AppData = {
    ...FIXTURES.full,
    journey: { ...FIXTURES.full.journey!, goals: [], trackingAreas: [], approaches: [] },
  };
  const a = ask('goals', none);
  assert.equal(a.echo, undefined);
  assert.equal(a.echoLabel, undefined);
  assert.match(a.headline, /What you said you wanted/);
});

/* -------------------------------- compare ---------------------------------- */

function pair(data: AppData): [PhotoSession, PhotoSession] {
  const chrono = sessionsChronological(data);
  return [chrono[chrono.length - 1], chrono[chrono.length - 2]];
}

test('coach: compare mirrors the engine', () => {
  const noise = ask('compare', FIXTURES.twoNoise);
  assert.equal(noise.headline, coverageTrendFinding(...pair(FIXTURES.twoNoise))!.headline);
  assert.match(noise.headline, /No measurable change/);
  assert.ok(!noise.detail!.startsWith('No measurable change'), 'the person does not read it twice');

  const meaningful = ask('compare', FIXTURES.twoMeaningful);
  const finding = coverageTrendFinding(...pair(FIXTURES.twoMeaningful))!;
  assert.match(meaningful.headline, /moved measurably/);
  assert.equal(meaningful.detail, finding.detail);
  assert.match(meaningful.detail!, /area, not thickness/);

  const suspect = ask('compare', FIXTURES.twoFramingSuspect);
  assert.match(suspect.headline, /framed too differently/);
  assert.equal(suspect.detail, coverageTrendFinding(...pair(FIXTURES.twoFramingSuspect))!.detail);

  const mixed = ask('compare', FIXTURES.twoMixed);
  assert.match(mixed.headline, /no number to set side by side/);
  assert.equal(mixed.action?.href, '/compare');

  assert.match(
    ask('compare', FIXTURES.twoDropped).detail!,
    /Right Side is in your previous scan but not your latest/,
  );
  assert.match(ask('compare', FIXTURES.oneMeasured).headline, /only one scan/);
  assert.match(ask('compare', FIXTURES.empty).headline, /no scan yet/);
});

/* ------------------------------ empty states ------------------------------- */

test('coach: empty states', () => {
  const empty = FIXTURES.empty;
  for (const intent of ['lastScan', 'nextSet', 'compare', 'record'] as const) {
    const a = ask(intent, empty);
    assert.ok(!answerSentences(a).join(' ').includes('%'), `${intent} has no percentage to give`);
    // The old five-angle capture is gone: an empty record is answered with the Hair Scan.
    assert.equal(a.action?.href, '/hair-scan', intent);
  }
  assert.match(ask('keepSame', empty).headline, /Same spot/);

  assert.equal(ask('consistency', empty).action?.href, '/routine');
  assert.equal(ask('stack', empty).action?.href, '/routine');
  const streak = ask('streak', empty);
  assert.equal(streak.action?.href, '/routine');
  assert.match(streak.headline, /every day/);

  assert.match(ask('consistency', FIXTURES.routineToday).headline, /started today/);

  assert.equal(ask('journal', empty).action?.href, '/journal?compose=1');
  const journal = ask('journal', FIXTURES.full);
  assert.equal(journal.action?.href, '/journal');
  assert.ok(NEWEST_BODY.startsWith(journal.echo![0].replace(/…$/, '')));

  assert.match(ask('lastScan', FIXTURES.oneUnmeasured).headline, /carries no reading/);

  const overdue = ask('nextSet', FIXTURES.overdue);
  assert.match(overdue.headline, /was due .* days ago/);
  assert.ok(overdue.action, 'an overdue scan offers the next one');
  assert.match(ask('nextSet', FIXTURES.dueToday).headline, /due today/);
});

/* ------------------------------ their labels ------------------------------- */

test('coach: a routine label with a claim word is only ever quoted, never adopted', () => {
  const LABEL = 'Regrowth serum';
  const data: AppData = {
    ...base(),
    routineItems: [item('serum', LABEL, 40), item('topical', 'Topical', 40)],
    routineLogs: [
      ...Array.from({ length: 30 }, (_, d) => log('topical', d)),
      ...Array.from({ length: 30 }, (_, d) => d).filter((d) => d % 3 === 0).map((d) => log('serum', d)),
    ],
  };

  for (const intent of ['consistency', 'itemAdherence', 'stack'] as const) {
    const a = answerFor({ intent, itemId: 'serum' }, data);
    const sentences = answerSentences(a);
    for (const s of sentences) {
      assert.ok(s.split(LABEL).length <= 2, `${intent} names the item at most once: "${s}"`);
    }
    assertHonest(assert, sentences.map((s) => s.split(LABEL).join('')), `${intent} minus the label`);
  }
  // The weakest-item line and the per-item headline do name it, so the
  // test above is exercising the template around the label, not an absence.
  assert.ok(ask('consistency', data).detail!.includes(LABEL), 'the weakest item is named');
  assert.ok(answerFor({ intent: 'itemAdherence', itemId: 'serum' }, data).headline.startsWith(LABEL));
});

/* -------------------------------- readings --------------------------------- */

test('coach: keepSame uses the reading’s own lines', () => {
  const dark = ask('keepSame', FIXTURES.oneDark);
  assert.match(dark.headline, /Same spot/);
  assert.match(dark.detail!, /window/);
  assert.match(dark.detail!, /Brace the phone/);

  assert.match(ask('keepSame', FIXTURES.oneMeasured).detail!, /matching it is the whole job/);
});

test('coach: lastScan states area as area', () => {
  const measured = ask('lastScan', FIXTURES.oneMeasured);
  assert.equal(measured.headline, 'Hair covers 44% of the upper frame.');
  assert.match(measured.detail!, /31% of the frame/);
  assert.match(measured.detail!, /Area is not thickness/);
  assert.match(measured.source, /Baseline Hairline shot/);

  const qualityOnly = withSessions(base(), cleanSet(session('s1', 30, ANGLES)));
  assert.equal(ask('lastScan', qualityOnly).headline, 'The area reading runs in the full app.');
});

/* --------------------------------- welcome --------------------------------- */

test('coach: welcome', () => {
  assert.equal(welcomeTitle('Sam'), 'Sam.');
  assert.equal(welcomeTitle('  '), 'Hello.');
  assert.equal(welcomeTitle(undefined), 'Hello.');
  assert.equal(welcomeTitle(FIXTURES.noName.profile?.displayName), 'Hello.');
});

/* -------------------------------- no journey -------------------------------- */

test('coach: no journey', () => {
  const data: AppData = { ...EMPTY_DATA };
  assert.equal(data.journey, null);
  for (const intent of DATA_INTENTS) {
    const a = ask(intent, data);
    assert.equal(a.headline, 'There is no record yet.', intent);
    assert.equal(a.refusal, false, intent);
  }
  for (const intent of ['refuseMedication', 'refuseDiagnose', 'refusePredict', 'unknown'] as const) {
    assert.deepEqual(ask(intent, data), ask(intent, FIXTURES.full), `${intent} needs no journey`);
  }
  for (const intent of ['help', 'privacy', 'areaMeaning'] as const) {
    assert.deepEqual(ask(intent, data), ask(intent, FIXTURES.full), `${intent} needs no journey`);
  }
});

/* ------------------------------ scan sessions ----------------------------- */

/** A session the continuous hair scan wrote: the angles a turn reaches, tagged as scan frames. */
function scanSession(id: string, dAgo: number, angles: readonly string[]): PhotoSession {
  const s = session(id, dAgo, angles);
  return {
    ...s,
    photos: s.photos.map((p) => ({ ...p, capture: 'scan' as const })),
    scan: { durationMs: 12_000, completion: 1, frameCount: 40, lighting: 0.6, version: 1 },
  };
}

test('coach: record describes a scan by what it captured, never as four of five', () => {
  const full = withSessions(base(), scanSession('s1', 30, ['front', 'leftTemple', 'rightTemple', 'top']));
  const a = ask('record', full);
  assert.equal(a.refusal, false);
  assert.match(a.headline, /^One scan, /);
  assert.match(a.detail!, /^Your last scan, .*, captured the front, both sides and the top\.$/);
  const text = answerSentences(a).join(' ');
  assert.ok(!/\bfive\b|\b\d of \d\b|\bBack\b|\bset\b/i.test(text), text);
  assertHonest(assert, answerSentences(a), 'scan/record');

  // A turn that stopped part-way is described by the frames it kept.
  const partial = withSessions(base(), scanSession('s1', 30, ['front', 'rightTemple']));
  const p = ask('record', partial);
  assert.match(p.detail!, /captured the front and the right side\.$/);
  assert.ok(!/\bno\b|\bmissing\b|\d of \d/i.test(p.detail!), p.detail);
  assertHonest(assert, answerSentences(p), 'partial scan/record');

  // The old capture is still counted the old way.
  const old = ask('record', FIXTURES.twoDropped);
  assert.match(old.detail!, /holds 4 of 5 angles — no Right Side\.$/);
});

/* ---------------------------- the report paragraph --------------------------- */

test('coach: the report paragraph reads an answer back in the plainest words it can', () => {
  // The owner walked build 17 and read "You told Tress heat goes on your
  // hair …" aloud: it reports a conversation instead of saying the
  // thing. That sentence now opens with a plain verb. The answer itself
  // stays inside the quotation marks either way — the coach echoes a
  // label, it never adopts it as a claim — and that is what the sweep at
  // the end of this test holds for the whole repertoire.
  const heat = profileSentence({ kind: 'heat', label: HEAT_STYLING_LABELS.fewTimesWeek })!;
  assert.equal(
    heat,
    'You said heat goes on your hair “a few times a week”, and the care notes are picked with that in mind.',
  );
  assert.ok(!stripQuotes(heat).toLowerCase().includes('few times'), 'the answer stays in the quotation');

  for (const label of Object.values(HEAT_STYLING_LABELS)) {
    const sentence = profileSentence({ kind: 'heat', label })!;
    assert.ok(sentence.startsWith('You said heat goes on your hair “'), sentence);
    assert.ok(!sentence.includes('!'), sentence);
  }

  // Nothing else in the paragraph's repertoire forecasts or diagnoses.
  const every = [
    heat,
    profileSentence({ kind: 'reaction', label: INGREDIENT_REACTION_LABELS.fragrance })!,
    profileSentence({ kind: 'sensitivity', label: SCALP_SENSITIVITY_LABELS.sensitive })!,
    profileSentence({ kind: 'scalpType', label: SCALP_TYPE_LABELS.oily })!,
    profileSentence({ kind: 'concern', label: HAIR_CONCERN_LABELS.frizz })!,
  ];
  assertHonest(assert, every, 'report paragraph, profile sentences');

  // Every sentence puts the person first and the answer in quotation
  // marks, so none of them can be read as the app's own claim. None of
  // them narrates the conversation either: "You told Tress you have
  // reacted to …" reports that an exchange happened instead of saying
  // the thing, which is the construction the owner read aloud and
  // rejected, and both branches that used it now say the thing.
  for (const sentence of every) {
    assert.match(sentence, /^You (said|told|described|mentioned) /, sentence);
    assert.match(sentence, /“[^”]+”/, sentence);
  }
  assert.ok(
    profileSentence({ kind: 'reaction', label: INGREDIENT_REACTION_LABELS.fragrance })!.startsWith(
      'You said you have reacted to “',
    ),
  );

  assert.equal(profileSentence(null), null);
});

/* -------------------------- the says paragraph --------------------------- */

/**
 * "Tress says" used to describe the scanner: how many frames the turn
 * kept, which angles they were, and whether the segmenter had run. The
 * owner read that as a report about photographs rather than about hair,
 * and he was right. These tests hold the paragraph to the other thing:
 * every clause traces to a figure the engine computed, and with no
 * figures at all the paragraph is not written.
 */

function reading(coverage: number, confidence = 0.8) {
  return {
    coverage,
    visibleScalp: 1 - coverage,
    frames: 4,
    spread: 0.02,
    confidence,
    anchoring: 'landmarks' as const,
  };
}

/** A measurement in the shape the scanner stores on a session. */
function measurement(
  entries: [ScanMeasureRegion, number, number?][],
  capturedAt = daysAgo(10).toISOString(),
): PhotoSessionMeasurement {
  const regions: PhotoSessionMeasurement['regions'] = {};
  for (const [region, coverage, confidence] of entries) {
    regions[region] = { region, ...reading(coverage, confidence ?? 0.8) };
  }
  const all: ScanMeasureRegion[] = ['hairline', 'leftTemple', 'rightTemple', 'midScalp', 'crown', 'partLine'];
  return { regions, unread: all.filter((r) => regions[r] === undefined), capturedAt };
}

function change(
  region: ScanMeasureRegion,
  delta: number,
  verdict: ScanChangeVerdict,
): PhotoSessionRegionChange {
  return { region, delta, noiseFloor: 0.02, verdict, confidence: 0.7, anchoring: 'same' };
}

/** A scan session carrying what the engine read off it. */
function measuredScan(
  id: string,
  dAgo: number,
  m: PhotoSessionMeasurement | null,
  changes?: PhotoSessionRegionChange[],
): PhotoSession {
  const s = scanSession(id, dAgo, ['front', 'leftTemple', 'rightTemple', 'top']);
  return {
    ...s,
    scan: {
      ...s.scan!,
      ...(m ? { measurement: m } : {}),
      ...(changes && changes.length > 0 ? { changes } : {}),
    },
  };
}

const FIVE: [ScanMeasureRegion, number, number?][] = [
  ['hairline', 0.62, 0.75],
  ['leftTemple', 0.54, 0.5],
  ['rightTemple', 0.58],
  ['midScalp', 0.74],
  ['crown', 0.81, 0.9],
];

test('says: the paragraph reads the measurement back, and every figure in it was counted', () => {
  const s = measuredScan('s1', 10, measurement(FIVE));
  const data = withSessions(base(), s);
  const body = tressSays(data, s, 'Sam', new Date())!;
  assert.ok(body !== null);

  // Four or five sentences, the scan's own scope first.
  const sentences = body.split(/(?<=[.])\s+/);
  assert.ok(sentences.length >= 4 && sentences.length <= 5, `${sentences.length} sentences: ${body}`);
  assert.match(body, /^Sam, this scan read five of the six areas Tress measures; your part line was not clear enough in these frames to read\./);

  // Highest and lowest, each with the confidence its own reading carried.
  assert.match(body, /Your crown reads highest of them at 81 out of 100 for visual coverage, with high confidence/);
  assert.match(body, /your left temple lowest at 54, with moderate confidence/);
  // The figures in the sentence are the ones the cards above it show:
  // both read through grade.ts, which is the only place a share becomes
  // a score at all.
  assert.deepEqual(gradeOf({ region: 'crown', ...reading(0.81, 0.9) }), { score: 81, confidence: 0.9 });
  assert.equal(confidenceBand(0.9), 'high');
  assert.equal(confidenceBand(0.5), 'moderate');
  assert.equal(confidenceBand(0.39), 'low');

  // Nothing earlier was measured, so nothing is set beside anything.
  assert.match(body, /Nothing earlier on record carries a reading of its own/);

  // What is watched next is the lowest reading, with the goal quoted rather than restated.
  assert.match(body, /You said you are hoping for “more fullness”, and your left temple is the lowest reading here, which is what Tress watches next/);
  assert.match(body, /Tress watches next, on the scan due in 20 days\.$/);

  // No number appears that the fixture did not carry.
  for (const n of body.match(/\b\d+\b/g) ?? []) {
    assert.ok(['81', '54', '100', '20'].includes(n), `${n} is not a figure the record holds: ${body}`);
  }
  assertHonest(assert, [stripQuotes(body)], 'says');
  assert.ok(!/density|follicle|shaft|hairs per/i.test(body), body);
});

test('says: with no measurement there is no paragraph at all, and no explanation of why', () => {
  // A scan from a build with no segmenter in it: the block is there, the measurement is not.
  const bare = measuredScan('s1', 10, null);
  assert.equal(tressSays(withSessions(base(), bare), bare, 'Sam', new Date()), null);

  // A measurement that read nothing is the same thing: null, not a row of zeroes.
  const empty = measuredScan('s1', 10, measurement([]));
  assert.equal(tressSays(withSessions(base(), empty), empty, 'Sam', new Date()), null);

  // An ordinary set of photographs, never scanned, says nothing either.
  const plain = session('s1', 10, ['front', 'top']);
  assert.equal(tressSays(withSessions(base(), plain), plain, 'Sam', new Date()), null);

  // And nothing anywhere in the file explains the segmenter to somebody reading a report.
  const source = readFileSync(new URL('../../src/features/coach/report-summary.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const strings = [...source.matchAll(/'([^'\n]{25,})'|`([^`\n]{25,})`/g)].map((m) => m[1] ?? m[2]);
  for (const s of strings) {
    assert.ok(!/segmenter|on-device|did not run|this build|model/i.test(s), `debugging text in a sentence: ${s}`);
  }
});

test('says: a difference is only a change when it cleared the noise floor the engine set', () => {
  const now = new Date();

  // Inside the margin, every region: the paragraph says so and names no figure.
  const flat = measuredScan('s2', 10, measurement(FIVE), [
    change('crown', 0.01, 'unchanged'),
    change('hairline', 0.004, 'insufficient'),
  ]);
  const quiet = tressSays(withSessions(base(), flat), flat, 'Sam', now)!;
  assert.match(quiet, /Set beside your last scan with a reading, no area both scans read moved further than the two scans' own margin of error, so nothing here counts as a change\./);
  assert.ok(!/points (higher|lower)/.test(quiet), quiet);

  // One region clear of it: named, with the difference in the same units as the score.
  const one = measuredScan('s2', 10, measurement(FIVE), [
    change('crown', 0.01, 'unchanged'),
    change('leftTemple', -0.05, 'moderate'),
  ]);
  const moved = tressSays(withSessions(base(), one), one, 'Sam', now)!;
  assert.match(moved, /your left temple is the one area that moved further than the two scans' own margin of error, reading 5 points lower\./);
  assert.equal(coveragePoints(-0.05), 5);

  // Several: counted, and the largest named, never all of them listed.
  const many = measuredScan('s2', 10, measurement(FIVE), [
    change('leftTemple', -0.05, 'small'),
    change('crown', 0.09, 'large'),
    change('midScalp', 0.04, 'small'),
  ]);
  const lots = tressSays(withSessions(base(), many), many, 'Sam', now)!;
  assert.match(lots, /three areas moved further than the two scans' own margin of error, your crown most of all, reading 9 points higher\./);

  // The baseline comparison is the report's to hand over, and reads as its own sentence.
  const withBaseline = tressSays(withSessions(base(), one), one, 'Sam', now, {
    sinceLast: [change('leftTemple', -0.05, 'moderate')],
    sinceBaseline: [change('leftTemple', -0.08, 'moderate'), change('crown', 0.06, 'small')],
    baselineSpan: '4 months',
  })!;
  assert.match(withBaseline, /Against your baseline, 4 months back, two areas have moved further than that margin, your left temple most of all, reading 8 points lower\./);
  assert.equal(withBaseline.split(/(?<=[.])\s+/).length, 5);
  assertHonest(assert, [stripQuotes(withBaseline)], 'says, with a baseline');

  // A baseline that moved nowhere says that, rather than nothing.
  const still = tressSays(withSessions(base(), one), one, 'Sam', now, {
    sinceBaseline: [change('crown', 0.005, 'unchanged')],
    baselineSpan: '4 months',
  })!;
  assert.match(still, /Against your baseline, 4 months back, nothing both scans read has moved further than that margin either\./);
});

/**
 * `insufficient` is the engine refusing to subtract, not the engine
 * finding a difference of nothing. `measure/compare.ts` writes it when a
 * region is missing from one of the two scans, when either kept too few
 * frames, when the confidence is under its own floor, or when a coverage
 * is not finite — a previous scan that read only the hairline leaves
 * every other region on that verdict, which makes this the ordinary case
 * rather than the odd one. Wording it as "no area moved" would assert
 * five comparisons nobody performed.
 */
test('says: a comparison the engine declined to make is never worded as one that found nothing', () => {
  const now = new Date();
  const all: ScanMeasureRegion[] = ['hairline', 'leftTemple', 'rightTemple', 'midScalp', 'crown', 'partLine'];

  // Every stored row refused: the sentence says the two scans could not be
  // set beside each other, and claims nothing about any area.
  const none = measuredScan('s2', 10, measurement(FIVE), all.map((r) => change(r, 0.004, 'insufficient')));
  const refused = tressSays(withSessions(base(), none), none, 'Sam', now)!;
  assert.match(refused, /Neither this scan nor your last scan with a reading read any one area well enough in both for the two to be set beside each other, so no difference is reported\./);
  assert.ok(!/no area moved|nothing here counts as a change/.test(refused), refused);
  assert.ok(!/points (higher|lower)/.test(refused), refused);
  assertHonest(assert, [stripQuotes(refused)], 'says, nothing comparable');

  // The same refusal against the baseline reads as a refusal there too.
  const base2 = tressSays(withSessions(base(), none), none, 'Sam', now, {
    sinceLast: [change('crown', 0.01, 'unchanged')],
    sinceBaseline: all.map((r) => change(r, 0.004, 'insufficient')),
    baselineSpan: '4 months',
  })!;
  assert.match(base2, /Against your baseline, 4 months back, no area was read well enough in both scans for the two to be set beside each other\./);
  assert.ok(!/nothing has moved/.test(base2), base2);

  // One real comparison among the refusals is still a comparison, and the
  // sentence is careful to count only the areas both scans read.
  const partly = measuredScan('s2', 10, measurement(FIVE), [
    change('crown', 0.01, 'unchanged'),
    change('hairline', 0.004, 'insufficient'),
    change('midScalp', 0.004, 'insufficient'),
  ]);
  const mixed = tressSays(withSessions(base(), partly), partly, 'Sam', now)!;
  assert.match(mixed, /no area both scans read moved further than/);
});

/**
 * On a second scan the baseline IS the scan before it, so the report
 * hands the same rows down twice. Two of five sentences stating one fact
 * is how a paragraph of findings starts reading like padding — and it is
 * the shape every new user meets first.
 */
test('says: when the baseline is the scan before this one, the fact is stated once', () => {
  const now = new Date();
  const rows = [change('leftTemple', -0.1, 'moderate'), change('crown', 0.01, 'unchanged')];
  const s = measuredScan('s2', 10, measurement(FIVE), rows);

  // The same rows on both sides: one sentence, and it names the baseline.
  const folded = tressSays(withSessions(base(), s), s, 'Sam', now, {
    sinceLast: rows,
    sinceBaseline: rows.map((r) => ({ ...r })),
    baselineSpan: '3 months',
  })!;
  assert.match(folded, /Set beside your last scan with a reading, which is also your baseline, your left temple is the one area that moved further than the two scans' own margin of error, reading 10 points lower\./);
  assert.ok(!folded.includes('Against your baseline'), folded);
  assert.equal(folded.split(/(?<=[.])\s+/).length, 4);

  // The model can say so outright, and is believed.
  const flagged = tressSays(withSessions(base(), s), s, 'Sam', now, {
    sinceLast: rows,
    sinceBaseline: [change('crown', 0.09, 'large')],
    baselineIsPrevious: true,
  })!;
  assert.ok(!flagged.includes('Against your baseline'), flagged);
  assert.match(flagged, /which is also your baseline/);

  // And on the real path, where both sets come off the engine rather than
  // out of a fixture: a second scan's stored comparison and its baseline
  // comparison are the same call on the same pair, so the rows match and
  // the duplicate is caught without the model having to say so.
  const before = measurement([['hairline', 0.62], ['leftTemple', 0.64], ['crown', 0.8]], daysAgo(100).toISOString());
  const after = measurement([['hairline', 0.62], ['leftTemple', 0.54], ['crown', 0.8]], daysAgo(10).toISOString());
  const engine = compareScans(after, before);
  const real = measuredScan('s2', 10, after, [...engine]);
  const once = tressSays(withSessions(base(), real), real, 'Sam', now, {
    measurement: after,
    sinceLast: engine,
    sinceBaseline: compareScans(after, before),
    baselineSpan: '3 months',
  })!;
  assert.match(once, /Set beside your last scan with a reading, which is also your baseline, your left temple is the one area that moved further than/);
  assert.ok(!once.includes('Against your baseline'), once);
  assert.equal(once.split(/(?<=[.])\s+/).length, 4);

  // A baseline that really is a different scan keeps its own sentence.
  const apart = tressSays(withSessions(base(), s), s, 'Sam', now, {
    sinceLast: rows,
    sinceBaseline: [change('crown', 0.09, 'large')],
    baselineSpan: '6 months',
  })!;
  assert.match(apart, /Against your baseline, 6 months back, your crown has moved 9 points higher, further than that margin\./);
  assert.ok(!apart.includes('which is also your baseline'), apart);
  assert.equal(apart.split(/(?<=[.])\s+/).length, 5);
});

/**
 * "read five of the six areas" is arithmetic, and the sentence has to be
 * able to account for the other one. A region present in the map but
 * unreadable used to fall through both halves: not a reading, and not on
 * the list of places named as unread either.
 */
test('says: every one of the six is accounted for, read or not', () => {
  const now = new Date();

  // Present, and not a finite coverage: unreadable, and named as unread.
  const broken = measurement(FIVE);
  broken.regions.partLine = { region: 'partLine', ...reading(0.5) , coverage: Number.NaN };
  broken.unread = [];
  const s = measuredScan('s1', 10, broken);
  const body = tressSays(withSessions(base(), s), s, 'Sam', now)!;
  assert.match(body, /^Sam, this scan read five of the six areas Tress measures; your part line was not clear enough in these frames to read\./);

  // The engine's own refusal list wins over whatever else is in the map.
  const declined = measurement(FIVE);
  declined.unread = ['crown', 'partLine'];
  const d = measuredScan('s1', 10, declined);
  const dBody = tressSays(withSessions(base(), d), d, 'Sam', now)!;
  assert.match(dBody, /^Sam, this scan read four of the six areas Tress measures; your crown and your part line were not clear enough in these frames to read\./);
  assert.ok(!dBody.includes('81'), 'a region the engine declined to report carries no figure either');
});

test('says: the goal decides which area leads, and a blank name leaves no hole', () => {
  const now = new Date();
  const s = measuredScan('s1', 10, measurement(FIVE));

  // A hairline goal puts the hairline beside the lowest reading; a crown goal, the crown.
  const hairline = tressSays(withSessions({ ...base(), journey: { ...base().journey!, goals: ['hairline'] } }, s), s, 'Sam', now)!;
  assert.match(hairline, /so your hairline and your left temple, the lowest reading here, are what Tress watches next/);
  const crown = tressSays(withSessions({ ...base(), journey: { ...base().journey!, goals: ['crown'] } }, s), s, 'Sam', now)!;
  assert.match(crown, /so your crown and your left temple, the lowest reading here, are what Tress watches next/);

  // A goal that is one area, and that area is already the lowest: said once, not twice.
  const low = measuredScan('s1', 10, measurement([['hairline', 0.4], ['crown', 0.8]]));
  const same = tressSays(withSessions({ ...base(), journey: { ...base().journey!, goals: ['hairline'] } }, low), low, 'Sam', now)!;
  assert.match(same, /and your hairline is also the lowest reading here, which is what Tress watches next/);

  // No goal picked at all: the lowest reading still leads, with nothing quoted.
  const noGoal = tressSays(withSessions({ ...base(), journey: null }, s), s, 'Sam', now)!;
  assert.match(noGoal, /Your left temple is the lowest reading here, and that is what Tress watches next\.$/);
  assert.ok(!noGoal.includes('“'), noGoal);

  // A blank name is dropped rather than printed.
  const blank = tressSays(withSessions(base(), s), s, '  ', now)!;
  assert.match(blank, /^This scan read five of the six areas/);

  // One area read is not two: the sentence does not claim a highest and a lowest.
  const single = measuredScan('s1', 10, measurement([['crown', 0.66, 0.45]]));
  const alone = tressSays(withSessions(base(), single), single, 'Sam', now)!;
  assert.match(alone, /^Sam, this scan read one of the six areas Tress measures;/);
  assert.match(alone, /Your crown came out at 66 out of 100 for visual coverage, with moderate confidence\./);
  assert.ok(!/highest|lowest of them/.test(alone), alone);
});

/* --------------------- the care and tracking notes ----------------------- */

test('notes: the section leads with what makes a run of scans readable, then the care habits', () => {
  // The five tracking notes are the same for everybody, and they are about
  // the scans rather than about hair: conditions, styling, interval, a
  // written note, and when to ask somebody qualified.
  assert.equal(TRACKING_TIPS.length, 5);
  assert.deepEqual(
    TRACKING_TIPS.map((t) => t.id),
    ['track_conditions', 'track_styling', 'track_interval', 'track_notes', 'track_ask'],
  );
  for (const tip of TRACKING_TIPS) {
    assert.ok(tip.kicker.length > 0 && tip.emoji.length > 0 && tip.body.length > 20, tip.id);
    assert.ok(/^[A-Z]/.test(tip.body) && /[.]$/.test(tip.body), tip.id);
  }
  assert.match(TRACKING_TIPS[0].body, /same light|Same room/i);
  assert.match(TRACKING_TIPS[4].body, /GP or dermatologist/);

  // Every profile gets them, ahead of the care notes, and the care notes
  // are still chosen by the goal and the answers exactly as before.
  const set = tipsForProfile({ goal: 'hairline', heatStyling: 'daily' });
  assert.deepEqual(set.tracking.map((t) => t.id), TRACKING_TIPS.map((t) => t.id));
  assert.equal(set.items[0].id, 'heat_often');
  assert.deepEqual(tipsForProfile({}).tracking.map((t) => t.id), TRACKING_TIPS.map((t) => t.id));

  // A tracking note is a habit, not a prescription, and the sweep reaches it.
  const swept = tipSentences();
  for (const tip of TRACKING_TIPS) assert.ok(swept.includes(tip.body), `${tip.id} is swept`);
  assertHonest(assert, swept, 'care and tracking notes');
  const text = swept.join(' ').toLowerCase();
  for (const word of ['density', 'to prevent', 'to stop', 'minoxidil', 'finasteride', 'treatment', 'blood test', 'cure']) {
    assert.ok(!text.includes(word), `the notes must not say "${word}"`);
  }
  // None of them is about what this scan found: that is the report's job, not a note's.
  for (const tip of TRACKING_TIPS) {
    assert.ok(!/your (crown|hairline|temple|part line|mid-scalp)\b/i.test(tip.body), tip.id);
    assert.ok(!/out of 100|coverage score/i.test(tip.body), tip.id);
  }
});

test('says: two readings are set side by side only when both are sure enough of themselves', () => {
  // A crown read across four steady frames and a part line barely caught:
  // "highest and lowest" would be a claim about both, and the weaker half
  // cannot support it. So the paragraph names the surest reading and says
  // why the other is not beside it, rather than printing a faint figure.
  const faint = measuredScan('s1', 10, measurement([['crown', 0.81, 0.9], ['partLine', 0.3, 0.2]]));
  const body = tressSays(withSessions(base(), faint), faint, 'Sam', new Date())!;
  assert.match(body, /Your crown is the reading this scan is surest of, at 81 out of 100 for visual coverage, with high confidence; the rest were read too faintly to set beside it\./);
  assert.ok(!/highest|lowest/.test(body), body);
  assert.ok(!body.includes('30'), 'a reading too faint to compare is not printed as a figure either');
  assert.match(body, /and your crown is the reading this scan is surest of, which is what Tress watches next/);
  assertHonest(assert, [stripQuotes(body)], 'says, one faint reading');
});
