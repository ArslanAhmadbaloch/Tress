/**
 * The report shown two taps before a paywall.
 *
 * This is the copy under the most commercial pressure in the whole app:
 * it is read at the moment somebody is most worried, and a sentence that
 * sounded like a diagnosis would convert better in the short run. These
 * cases pin the shape every card has to keep — their words in, a
 * conclusion about the *record* out — and fail loudly if a later edit
 * starts describing the hair instead.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildProfileReport,
  type ProfileAnswers,
} from '@/features/onboarding/profile-report';

const base: ProfileAnswers = {
  name: 'Sam',
  noticed: 'halfYear',
  areas: ['hairline'],
  preoccupation: 4,
  approaches: ['topical'],
  medications: ['minoxidilTopical'],
  consistency: 'onOff',
  goals: ['fullness'],
  intervalDays: 30,
};

test('profile: the report is addressed to them by name', () => {
  assert.match(buildProfileReport(base).title, /^Sam,/);
  assert.match(buildProfileReport({ ...base, name: '  ' }).title, /^Here/);
});

test('profile: every card echoes something they actually answered', () => {
  const r = buildProfileReport(base);
  const echoes = r.cards.map((c) => c.echo.toLowerCase()).join(' ');
  assert.match(echoes, /6–12 months ago|six/i, 'when they noticed');
  assert.match(echoes, /hairline/, 'what they watch');
  assert.match(echoes, /minoxidil/i, 'what they use');
  assert.match(echoes, /once a month/, 'their chosen rhythm');
});

test('profile: someone using nothing yet is given a reason to start, not a warning', () => {
  const r = buildProfileReport({ ...base, approaches: [], medications: [] });
  const doing = r.cards.find((c) => c.id === 'doing')!;
  assert.match(doing.meaning, /most useful moment/);
  assert.ok(!/too late|losing|worse/i.test(doing.meaning));
});

test('profile: an honest "on and off" answer is met with reassurance, not a scold', () => {
  const doing = buildProfileReport(base).cards.find((c) => c.id === 'doing')!;
  assert.match(doing.meaning, /almost everybody/);
});

test('profile: the goal is never promised', () => {
  const r = buildProfileReport(base);
  assert.match(r.closing, /not ours to promise/);
  for (const promise of ['will grow', 'you will see results', 'guarantee', 'restore']) {
    assert.ok(!r.closing.toLowerCase().includes(promise), `must not promise "${promise}"`);
  }
});

test('profile: one goal, two, or several all read as things they said they want', () => {
  // The question takes as many answers as somebody has reasons, and the
  // closing line is the only place they are read back. Its job does not
  // change with the count: their words in, and the same refusal to
  // promise them out. "You want X and Y" must never become "you will
  // get X and Y", which is the sentence a longer list invites.
  const closing = (...goals: ProfileAnswers['goals']) =>
    buildProfileReport({ ...base, goals }).closing;

  assert.match(closing('fullness'), /^You told us what you want is more fullness\./);
  assert.match(
    closing('fullness', 'shedding'),
    /^You told us what you want is more fullness and less shedding\./,
  );
  assert.match(
    closing('fullness', 'shedding', 'hairline'),
    /^You told us what you want is more fullness, less shedding and a stronger-looking hairline\./,
  );

  for (const line of [
    closing('fullness'),
    closing('fullness', 'shedding'),
    closing('fullness', 'shedding', 'hairline', 'crown'),
  ]) {
    assert.match(line, /not ours to promise/, 'however long the list, it is still not a promise');
    assert.ok(
      !/\byou will\b|\bwe will\b|\bexpect\b|\bresults?\b/i.test(line),
      `"${line}" forecasts the goals instead of echoing them`,
    );
  }
});

test('profile: ticking nothing, or only "not sure", states no goal at all', () => {
  // An old record whose goal was neither shape, and somebody who said
  // the honest thing. Neither may produce "what you want is I'm not sure
  // yet", and neither may produce a blank where a sentence was.
  for (const goals of [[], ['unsure']] as ProfileAnswers['goals'][]) {
    const closing = buildProfileReport({ ...base, goals }).closing;
    assert.equal(
      closing,
      'What we can do is make sure you can see what is happening, instead of wondering.',
    );
    assert.ok(!closing.includes('what you want'), 'nothing is put in their mouth');
  }
});

test('profile: no card makes a claim about their hair', () => {
  // The report is built before any photograph exists. Every one of these
  // words would mean it had started describing a head nobody has seen.
  const variants: ProfileAnswers[] = [
    base,
    { ...base, noticed: 'longer', preoccupation: 5, consistency: 'very' },
    { ...base, areas: ['crown', 'edges'], medications: [], approaches: [] },
    { ...base, intervalDays: 7, goals: [], name: '' },
    { ...base, goals: ['fullness', 'shedding', 'hairline', 'routineWorking'] },
  ];

  for (const answers of variants) {
    const r = buildProfileReport(answers);
    const text = [
      r.title,
      r.closing,
      ...r.cards.map((c) => `${c.echo} ${c.meaning}`),
    ]
      .join(' ')
      .toLowerCase();

    for (const claim of [
      'thinning at',
      'your hair is',
      'balding',
      'norwood',
      'diagnos',
      'severe',
      'advanced',
    ]) {
      assert.ok(!text.includes(claim), `profile report must not say "${claim}"`);
    }
  }
});

test('profile: nothing in the report hurries anybody', () => {
  // This screen is one tap from the camera and two from the paywall,
  // which is exactly where a "before it's too late" would earn its keep.
  // It is the one place in the app such a line must never appear.
  const urgency =
    /\b(too late|limited time|spots? left|last chance|hurry|act now|only today|don.t miss|expires?|right now)\b/i;

  for (const answers of [base, { ...base, approaches: [], medications: [] }]) {
    const r = buildProfileReport(answers);
    for (const line of [r.title, r.closing, ...r.cards.flatMap((c) => [c.echo, c.meaning])]) {
      assert.ok(!urgency.test(line), `"${line}" is hurrying somebody`);
    }
  }
});

test('profile: a fortnightly rhythm is allowed but honestly labelled', () => {
  const rhythm = buildProfileReport({ ...base, intervalDays: 14 }).cards.find(
    (c) => c.id === 'rhythm',
  )!;
  assert.match(rhythm.meaning, /lighting rather than hair/);
});
