/**
 * The onboarding kit, held to its contract without a phone.
 *
 * The kit is Reanimated and SVG through and through, which Node cannot
 * render, so what is checked here is read from the source: that every
 * piece the funnel composes is exported, that no piece carries a raw
 * colour or a font weight, that every piece which moves asks about
 * Reduce Motion, that nothing is switched off with an eslint comment,
 * and that no piece says anything of its own — every `<Text>` in the kit
 * renders an expression, never a literal, so the words stay with the
 * funnel's script where the honesty tests can read them.
 *
 * The two pure helpers the kit does export — the accent split and the
 * greeting — live in a plain module and are exercised directly, since
 * they are the only string work the kit does.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { greet, splitAccent } from '@/components/onboarding/kit/copy';

const KIT = join('src', 'components', 'onboarding', 'kit');

const files = readdirSync(KIT)
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
  .map((f) => ({ name: f, text: readFileSync(join(KIT, f), 'utf8') }));

const index = files.find((f) => f.name === 'index.ts')?.text ?? '';

/** The contract the flow lane composes against. */
const CONTRACT = [
  'Mascot',
  'SpeechBubble',
  'OptionPill',
  'OptionRow',
  'OptionCard',
  'CardGrid',
  'ContinueBar',
  'BackButton',
  'FunnelPage',
  'Welcome',
  'MascotIntro',
  'Interstitial',
  'NotificationsPage',
];

/** The quality gate's own definition of a raw colour. */
const RAW_COLOR = /(?<![\w-])#[0-9a-fA-F]{3,8}\b|rgba?\(/;

/** A `<Text …>` whose first child is a literal rather than `{…}`. */
const LITERAL_TEXT = /<Text\b[^>]*>\s*[^\s{<]/;

/* -------------------------------- exports -------------------------------- */

test('kit: every piece of the contract is exported from the index', () => {
  for (const name of CONTRACT) {
    assert.match(index, new RegExp(`\\b${name}\\b`), `${name} is not exported from kit/index.ts`);
  }
  for (const m of index.matchAll(/from '\.\/([^']+)'/g)) {
    assert.ok(
      files.some((f) => f.name === `${m[1]}.tsx` || f.name === `${m[1]}.ts`),
      `index re-exports ./${m[1]}, which does not exist`,
    );
  }
});

test('kit: each contract name is defined as an exported function somewhere in the kit', () => {
  for (const name of CONTRACT) {
    assert.ok(
      files.some((f) => new RegExp(`export function ${name}\\b`).test(f.text)),
      `${name} has no exported function`,
    );
  }
});

/* --------------------------------- tokens -------------------------------- */

test('kit: no raw colours, no font weights, no eslint-disable', () => {
  for (const f of files) {
    assert.ok(!RAW_COLOR.test(f.text), `${f.name} carries a raw colour`);
    assert.ok(!/fontWeight/.test(f.text), `${f.name} sets a fontWeight; the cut in the family name is the weight`);
    assert.ok(!/eslint-disable/.test(f.text), `${f.name} switches a lint rule off`);
  }
});

test('kit: every piece that moves asks about Reduce Motion', () => {
  const MOVES = /withRepeat|withTiming|withSpring|entering=|useAnimatedStyle/;
  for (const f of files) {
    if (!MOVES.test(f.text)) continue;
    assert.ok(f.text.includes('useReducedMotion'), `${f.name} animates without checking useReducedMotion`);
  }
});

test('kit: the orb breathes and blinks, and both are drawn in SVG', () => {
  const mascot = files.find((f) => f.name === 'mascot.tsx')?.text ?? '';
  assert.match(mascot, /from 'react-native-svg'/, 'the orb is drawn with react-native-svg');
  assert.match(mascot, /BREATH_SCALE = 1\.03/, 'the breath is a three percent swell');
  assert.match(mascot, /BLINK_GAP_MIN_MS = 4000/, 'a blink waits at least four seconds');
  assert.match(mascot, /BLINK_GAP_RANGE_MS = 2000/, 'and at most six');
  for (const expression of ['smile', 'wink', 'calm', 'writing']) {
    assert.match(mascot, new RegExp(`'${expression}'`), `the orb has no ${expression} expression`);
  }
  assert.match(mascot, /\.get\(\)/, 'shared values are read with .get()');
  assert.match(mascot, /\.set\(/, 'and written with .set()');
  assert.ok(!/\.value\b/.test(mascot), 'no .value access on a shared value');
});

/* ---------------------------------- copy --------------------------------- */

test('kit: no piece says anything of its own', () => {
  for (const f of files) {
    const m = LITERAL_TEXT.exec(f.text);
    assert.equal(m, null, `${f.name} renders a literal inside <Text>: ${m?.[0].trim()}`);
  }
});

test('kit: the words the kit is not allowed to own live in props, not here', () => {
  // Either quote, and a template literal too: the kit is written with
  // single quotes, so a guard that only read double ones read nothing.
  const OWNED_BY_THE_SCRIPT = /['"`](Get Started|Continue|Next|Not now|Restore purchases|Let.s go|Allow)['"`]/;
  for (const f of files) {
    assert.ok(!OWNED_BY_THE_SCRIPT.test(f.text), `${f.name} hard-codes funnel copy`);
  }
  assert.match("x = 'Next'", OWNED_BY_THE_SCRIPT, 'the guard reads a single-quoted string');
  assert.match('x = "Not now"', OWNED_BY_THE_SCRIPT, 'and a double-quoted one');
});

/* -------------------------------- drawings ------------------------------- */

test('kit: the phone is cut off below the card, and its ink survives the dark theme', () => {
  const page = files.find((f) => f.name === 'notifications-page.tsx')?.text ?? '';
  assert.match(page, /PHONE_VISIBLE = 0\.86/, 'most of the phone shows');
  assert.match(
    page,
    /height: visible, overflow: 'hidden'/,
    'the box the phone sits in clips it, so the cut-off part does not paint over the headline',
  );
  assert.match(page, /useInk\(\)/, 'the frame takes its ink from the scheme-safe pair');
  assert.ok(
    !/backgroundColor: colors\.text\b/.test(page),
    'the frame is never `text`, which is pale in the dark theme',
  );
});

test('kit: ink is dark in both themes and built from tokens', () => {
  const ink = files.find((f) => f.name === 'ink.ts')?.text ?? '';
  assert.match(ink, /scheme === 'dark'/, 'the pair is picked by scheme');
  assert.match(ink, /ink: colors\.background, onInk: colors\.text/, 'dark: the ground is the ink');
  assert.match(ink, /ink: colors\.text, onInk: colors\.background/, 'light: the text is the ink');
});

test('kit: a row chooses the colour its icon is drawn in, so a dark disc never hides one', () => {
  const options = files.find((f) => f.name === 'options.tsx')?.text ?? '';
  assert.match(
    options,
    /OptionIcon = ReactNode \| \(\(color: string\) => ReactNode\)/,
    'an icon may be a function of colour',
  );
  assert.match(options, /tint === 'dark' \? onInk/, 'a dark disc draws its icon in the colour that reads on ink');
  assert.match(options, /check\?: boolean/, 'a row can carry a circle check for multiple choice');
  assert.match(options, /accessibilityRole=\{check \? 'checkbox' : 'radio'\}/, 'and says so to the screen reader');
  assert.match(options, /PILL_HEIGHT = 70/, 'a pill is as tall as the reference');
});

test('kit: the pencil cap reads on the outline in both themes', () => {
  const mascot = files.find((f) => f.name === 'mascot.tsx')?.text ?? '';
  assert.ok(
    !/orbNeutralEdge\b[^\n]*strokeWidth|stroke=\{colors\.orbNeutralEdge\}/.test(mascot),
    'no stroke in the orb edge tint',
  );
  assert.match(mascot, /stroke=\{colors\.fillSelected\}/, 'the cap is the neutral fill');
});

/* -------------------------------- helpers -------------------------------- */

test('kit: the accent split colours one whole word and leaves the rest alone', () => {
  assert.deepEqual(splitAccent('How old are you?', 'old'), { before: 'How ', word: 'old', after: ' are you?' });
  assert.deepEqual(splitAccent('What is your hair type?', 'hair'), {
    before: 'What is your ',
    word: 'hair',
    after: ' type?',
  });
  assert.equal(splitAccent('Your haircare, kept', 'hair'), null, 'a keyword inside a longer word is left alone');
  assert.equal(splitAccent('How old are you?', undefined), null);
  assert.equal(splitAccent('How old are you?', 'young'), null, 'a keyword that is not there does not throw');
  assert.equal(
    splitAccent('Hair, and hair again', 'hair')?.before,
    'Hair, and ',
    'case-sensitive, first whole-word match',
  );
  assert.deepEqual(splitAccent('Sulfate-free?', 'Sulfate-free'), { before: '', word: 'Sulfate-free', after: '?' });
});

test('kit: the greeting fills the name in and reads cleanly without one', () => {
  assert.equal(greet('Great start, {name}!', 'Sam'), 'Great start, Sam!');
  assert.equal(greet('Great start, {name}!', undefined), 'Great start!');
  assert.equal(greet('Great start, {name}!', '  '), 'Great start!');
  assert.equal(greet('{name}, welcome back', 'Sam'), 'Sam, welcome back');
  assert.equal(greet('No placeholder here', 'Sam'), 'No placeholder here');
});
