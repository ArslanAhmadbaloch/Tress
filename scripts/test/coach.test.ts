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
  EMPTY_DATA,
  HAIR_GOAL_LABELS,
  SCHEMA_VERSION,
  SELF_CONSISTENCY_LABELS,
  TRACKING_AREA_LABELS,
  type AppData,
  type Photo,
  type PhotoSession,
  type RoutineCadence,
  type RoutineItem,
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

const FIXTURES: Record<string, AppData> = {
  empty: base(),
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
