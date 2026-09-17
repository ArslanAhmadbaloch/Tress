/**
 * The hair scan report is read at the moment somebody most wants a
 * verdict, so every line of it — the fixed strings and the ones built
 * from a number — goes through the same sweep the funnel report does:
 * nothing about hair, nothing shouted, no advice, no persona, and no
 * "before and after", which is the one comparison a photo journal is
 * never allowed to promise.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { HAIR_SCAN_REPORT_COPY, deg, pct, reportCopySentences } from '@/features/hair-scan/report-copy';

import { HAIR_CLAIMS } from './claims';
import { assertHonest } from './honesty-words';

const sentences = reportCopySentences();

test('report copy: the whole vocabulary is swept, functions included', () => {
  assert.ok(sentences.length > 60, `only ${sentences.length} sentences reached the sweep`);
  assert.ok(sentences.every((s) => typeof s === 'string' && s.length > 0));
  assert.ok(sentences.includes(HAIR_SCAN_REPORT_COPY.title), 'a fixed string');
  assert.ok(sentences.includes(HAIR_SCAN_REPORT_COPY.hairline.measured(41)), 'a one-argument line');
  assert.ok(sentences.includes(HAIR_SCAN_REPORT_COPY.temples.both(38, 41)), 'a two-argument line');
  assert.ok(sentences.includes(HAIR_SCAN_REPORT_COPY.scalp.kept('top', 'evenly lit', 'sharp')), 'a three-argument line');
  assert.ok(sentences.includes(HAIR_SCAN_REPORT_COPY.meta.completionHint(100)), 'both branches of a counted line');
  assert.ok(sentences.includes(HAIR_SCAN_REPORT_COPY.meta.completionHint(0)));
});

test('report copy: nothing describes hair', () => {
  const text = sentences.join(' ').toLowerCase();
  for (const claim of [...HAIR_CLAIMS, 'density', 'receding', 'recession', 'losing', 'follicle']) {
    assert.ok(!text.includes(claim), `the report must not say "${claim}"`);
  }
});

test('report copy: no flattery, no advice, no persona, no urgency, no exclamation', () => {
  assertHonest(assert, sentences, 'hair scan report');
});

test('report copy: nothing says before or after', () => {
  for (const sentence of sentences) {
    assert.ok(!/\b(before|after)\b/i.test(sentence), `"${sentence}" promises a comparison`);
  }
});

test('report copy: the four cards and the five tabs are the ones the report is built around', () => {
  const c = HAIR_SCAN_REPORT_COPY;
  assert.deepEqual(Object.values(c.tabs), ['Overview', 'Hairline', 'Temples', 'Coverage', 'Scalp']);
  assert.equal(c.hairline.title, 'Hairline visibility');
  assert.equal(c.temples.title, 'Temple visibility');
  assert.equal(c.coverage.title, 'Visible hair coverage');
  assert.equal(c.scalp.title, 'Visible scalp');
  assert.equal(c.title, 'Hair Analysis');
});

test('report copy: every headline is about images, and every card says what a second scan compares', () => {
  const c = HAIR_SCAN_REPORT_COPY;
  for (const line of [c.hairline.measured(41), c.temples.both(38, 41), c.coverage.measured(45, 5), c.scalp.measured('top', 45)]) {
    assert.match(line, /image/, `"${line}" is not stated about an image`);
  }
  for (const card of [c.hairline, c.temples, c.coverage, c.scalp]) {
    assert.match(card.compare, /next scan/, `${card.title} has no comparison line`);
  }
  // The remainder of a top image is named as what it is, not as scalp.
  assert.match(c.scalp.measuredDetail, /not a scalp measurement/);
  // The pale line is a line on the picture, and says so.
  assert.match(c.hairline.edge, /not a line on the head/);
  // Area is never thickness, on the card that prints the most figures.
  assert.match(c.coverage.perImage('Front 41%'), /not thickness/);
});

test('report copy: the words describe what was and was not measured, never invent a figure', () => {
  const c = HAIR_SCAN_REPORT_COPY;
  for (const line of [c.hairline.keptDetail, c.temples.keptDetail, c.coverage.unmeasuredDetail(3), c.scalp.keptDetail]) {
    assert.match(line, /did not run/, `"${line}" does not say the segmenter was absent`);
    assert.ok(!/\d+%/.test(line), `"${line}" prints a figure for an unmeasured image`);
  }
  for (const line of [c.hairline.none, c.temples.none, c.scalp.none, c.frames.none]) {
    assert.match(line, /kept/, `"${line}" does not say what was not kept`);
  }
  assert.match(c.subtitle, /nothing was uploaded/i);
});

test('report copy: the two frame counts are told apart', () => {
  const c = HAIR_SCAN_REPORT_COPY;
  assert.notEqual(c.meta.framesCaptured, c.meta.frames);
  assert.match(c.meta.framesCaptured, /captured/i);
  assert.match(c.meta.frames, /kept/i);
  assert.match(c.meta.keptHint(5), /5 kept as images/);
  assert.match(c.meta.keptHint(1), /One kept/);
  assert.match(c.frames.title, /kept/i);
});

test('report copy: the helpers round the way the funnel report rounds', () => {
  assert.equal(pct(0.414), 41);
  assert.equal(pct(1.4), 100);
  assert.equal(pct(-1), 0);
  assert.equal(deg(-33.6), 34);
  assert.equal(deg(31.2), 31);
});

test('report copy: nothing about five angles or sets — the old flow is gone', () => {
  for (const sentence of sentences) {
    assert.ok(!/\bfive\b/i.test(sentence), `"${sentence}" counts the old five angles`);
    assert.ok(!/\bsets?\b/i.test(sentence), `"${sentence}" speaks of a set`);
    assert.ok(!/five[- ]angle/i.test(sentence), `"${sentence}" names the old flow`);
  }
});

test('report copy: the locked state keeps the caveat, names what is held, and makes no verdict', () => {
  const { locked, actions } = HAIR_SCAN_REPORT_COPY;
  assert.match(locked.caveat, /not of your hair/);
  assert.match(locked.caveat, /one scan cannot show change/);
  assert.match(locked.body, /full report/);
  assert.match(locked.body, /no judgement about your hair/);
  assert.match(locked.placeholder, /Nothing here is a figure/);
  assert.equal(locked.button, 'See the full report');
  assert.equal(actions.continue, 'Continue');
  // No figure, real or invented, anywhere in the locked words.
  for (const line of Object.values(locked)) assert.ok(!/\d/.test(line), `"${line}" carries a number`);
  // The locked words are part of the swept vocabulary, not a side channel.
  for (const line of Object.values(locked)) assert.ok(sentences.includes(line));
});

/*
  The component itself imports Reanimated and Expo Router and can only be
  watched on a device; what can be held to here is the source: the two
  product rules the brief moves onto it, read the way the chrome test
  reads the scanner's.
*/
const REPORT_SOURCE = readFileSync('src/components/hair-scan/report.tsx', 'utf8');
const CARDS_SOURCE = readFileSync('src/components/hair-scan/report-cards.tsx', 'utf8');

test('report screen: the one ask for notifications lives here, guarded once per install', () => {
  assert.match(REPORT_SOURCE, /remindersAlreadyOffered\(\)/, 'the guard is read');
  assert.match(REPORT_SOURCE, /markRemindersOffered\(\)/, 'the guard is set once the ask has run');
  assert.match(REPORT_SOURCE, /enableRemindersWithPrompt\(/, 'the ask goes through the one prompt helper');
  assert.match(REPORT_SOURCE, /reminderOfferInterval\(remindersAlreadyOffered\(\)/, 'the rule is the tested one');
  /*
    It fires on mount — the report only mounts once processing has ended
    — and is not deferred behind a timer, because a deferred ask has a
    window in which leaving the report cancels it and the one ask per
    install is spent on a later report instead. The old funnel report
    fired on mount, and this matches it.
  */
  assert.ok(!/setTimeout\(/.test(REPORT_SOURCE), 'the ask is not deferred behind a timer');
  assert.match(
    REPORT_SOURCE,
    /if \(intervalDays === null\) return;[\s\S]*?void \(async \(\) => \{[\s\S]*?await enableRemindersWithPrompt\(/,
    'the ask runs in the effect body, on mount',
  );
  assert.match(REPORT_SOURCE, /if \(!cancelled\) await markRemindersOffered\(\)/, 'the guard is set after the ask, not before');
  // One place, one effect: the old funnel report's ask is not duplicated elsewhere in the scan.
  assert.equal(REPORT_SOURCE.match(/enableRemindersWithPrompt\(/g)?.length, 1);
});

test('report screen: depth is Premium — the tab decides through the gate and the button opens the paywall', () => {
  assert.match(REPORT_SOURCE, /usePremium\(\)/);
  assert.match(REPORT_SOURCE, /gateObservation\(current, isPremium\)/);
  assert.match(REPORT_SOURCE, /router\.push\('\/paywall'\)/);
  assert.match(REPORT_SOURCE, /gated\.locked \?[\s\S]*?<LockedObservationCard/, 'a locked card is drawn locked');
  // The Overview and the closing paragraph never pass through the gate.
  assert.match(REPORT_SOURCE, /tab === 'overview' \?[\s\S]*?<ObservationRow observation=\{observation\}/);
  assert.match(REPORT_SOURCE, /\{result\.scope\}/);
  // The locked card shows the real headline, its working and the caveat, then one button; the block is shapes, not a number.
  assert.match(
    CARDS_SOURCE,
    /\{observation\.headline\}[\s\S]*?<DetailBubble text=\{observation\.detail\} \/>[\s\S]*?\{gated\.caveat\}[\s\S]*?<HeldBlock/,
    'the working — where each card qualifies its own headline — is never held',
  );
  // What the block stands for: the images, the ring, the figures and the comparison line are not drawn on a locked card.
  const lockedCard = CARDS_SOURCE.slice(CARDS_SOURCE.indexOf('export function LockedObservationCard'), CARDS_SOURCE.indexOf('/* ------------------------------- meta tiles'));
  for (const held of ['<FramePhoto', '<ReadingRing', '<Figure', 'observation.compare']) {
    assert.ok(!lockedCard.includes(held), `${held} is drawn on the locked card`);
  }
  assert.equal(CARDS_SOURCE.match(/<Button[\s\S]*?label=\{gated\.button\}/g)?.length, 1);
  assert.match(CARDS_SOURCE, /pointerEvents="none"[\s\S]*?accessibilityLabel=\{label\}|accessibilityLabel=\{label\}[\s\S]*?pointerEvents="none"/);
  assert.ok(!/BlurView/.test(CARDS_SOURCE), 'a static translucent block, not a blur that Android cannot draw');
});

test('report screen: in the funnel the primary action is Continue, and Done and Scan again step back', () => {
  assert.match(REPORT_SOURCE, /funnel \?[\s\S]*?label=\{COPY\.actions\.continue\} onPress=\{onContinue\}/);
  const funnelBlock = REPORT_SOURCE.slice(REPORT_SOURCE.indexOf('{funnel ? ('), REPORT_SOURCE.indexOf(') : onDone || onRescan ?'));
  assert.match(funnelBlock, /label=\{COPY\.actions\.done\} variant="ghost"/);
  assert.match(funnelBlock, /label=\{COPY\.actions\.rescan\} variant="ghost"/);
  assert.ok(!/label=\{COPY\.actions\.continue\} variant=/.test(funnelBlock), 'Continue is the filled button');
  // Outside the funnel, Done is the filled button and Continue is not offered.
  const plainBlock = REPORT_SOURCE.slice(REPORT_SOURCE.indexOf(') : onDone || onRescan ?'));
  assert.match(plainBlock, /<Button label=\{COPY\.actions\.done\} onPress=\{onDone\} \/>/);
  assert.ok(!plainBlock.includes('COPY.actions.continue'));
});
