/**
 * The scan says a lot while the screen is facing away from the person
 * reading it, and some of it is read aloud. So every line of it — the
 * fixed strings and the ones built from a number — goes through the same
 * sweep the report does: nothing about hair, nothing shouted, and no
 * "before and after", which is the one comparison a photo journal is
 * never allowed to promise.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SCAN_COPY, scanCopySentences } from '@/features/capture/scan-copy';

import { HAIR_CLAIMS } from './claims';

const sentences = scanCopySentences();

test('scan copy: the whole vocabulary is swept, functions included', () => {
  assert.ok(sentences.length > 30, `only ${sentences.length} sentences reached the sweep`);
  assert.ok(sentences.every((s) => typeof s === 'string' && s.length > 0));
  assert.ok(sentences.includes(SCAN_COPY.complete), 'a fixed string');
  assert.ok(sentences.includes(SCAN_COPY.stackCount(2, 5)), 'a two-argument line');
  assert.ok(sentences.includes(SCAN_COPY.review.title(3)), 'a counted line');
});

test('scan copy: nothing describes hair', () => {
  const text = sentences.join(' ').toLowerCase();
  for (const claim of HAIR_CLAIMS) {
    assert.ok(!text.includes(claim), `the scan must not say "${claim}"`);
  }
});

test('scan copy: nothing exclaims', () => {
  for (const sentence of sentences) {
    assert.ok(!sentence.includes('!'), `"${sentence}" exclaims`);
  }
});

test('scan copy: nothing says before or after', () => {
  // The ghost overlay is "Last time" — a date the person can check, not
  // half of a transformation.
  for (const sentence of sentences) {
    assert.ok(!/\b(before|after)\b/i.test(sentence), `"${sentence}" promises a comparison`);
  }
});

test('scan copy: only the sweep bodies behind hands-free promise a countdown', () => {
  // The same rule the walk bodies keep: the countdown is only named by the
  // body shown when the preference that arms it is on.
  assert.ok(SCAN_COPY.intro.sweepBody.handsFree.includes('counts down'));
  assert.ok(!SCAN_COPY.intro.sweepBody.manual.toLowerCase().includes('count'));

  // And the turn never claims more than a front camera can reach: three
  // angles out of the turn, the other two held.
  const scope = SCAN_COPY.sweep.scope;
  assert.ok(scope.includes('the front and the two sides'), scope);
  assert.ok(/\btop\b/.test(scope) && /\bback\b/.test(scope), scope);
  assert.ok(scope.includes('held shots'), scope);
  for (const body of Object.values(SCAN_COPY.intro.sweepBody)) {
    assert.ok(body.includes('held shots'), `"${body}" leaves the top and the back unexplained`);
  }

  // Everything added under intro.sweepBody and sweep is reached by the
  // flattener, so the three tests above this one read it too.
  const added = [
    ...Object.values(SCAN_COPY.intro.sweepBody),
    scope,
    SCAN_COPY.sweep.altLink,
    ...Object.values(SCAN_COPY.sweep.cue),
    SCAN_COPY.sweep.saved(2, 5),
    SCAN_COPY.sweep.closed,
    SCAN_COPY.sweep.finish,
  ];
  for (const sentence of added) {
    assert.ok(sentences.includes(sentence), `"${sentence}" never reached the sweep`);
  }
  const withoutSweep = sentences.filter((s) => !added.includes(s));
  assert.ok(sentences.length > withoutSweep.length, 'the sweep group added nothing to the sweep');
});
