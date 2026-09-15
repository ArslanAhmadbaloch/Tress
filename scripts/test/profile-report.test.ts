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
  goal: 'fullness',
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

test('profile: no card makes a claim about their hair', () => {
  // The report is built before any photograph exists. Every one of these
  // words would mean it had started describing a head nobody has seen.
  const variants: ProfileAnswers[] = [
    base,
    { ...base, noticed: 'longer', preoccupation: 5, consistency: 'very' },
    { ...base, areas: ['crown', 'edges'], medications: [], approaches: [] },
    { ...base, intervalDays: 7, goal: null, name: '' },
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

test('profile: a fortnightly rhythm is allowed but honestly labelled', () => {
  const rhythm = buildProfileReport({ ...base, intervalDays: 14 }).cards.find(
    (c) => c.id === 'rhythm',
  )!;
  assert.match(rhythm.meaning, /lighting rather than hair/);
});
