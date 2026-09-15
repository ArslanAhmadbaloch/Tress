/**
 * Paywall copy, which is where an app's honesty is cheapest to sell.
 *
 * Variants exist to find which true sentence lands, not to find how much
 * can be left out — so these check the assignment is stable and even, and
 * sweep every variant for the patterns that work by making somebody
 * believe something untrue.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PAYWALL_VARIANTS,
  SECOND_ASK,
  variantFor,
  type PaywallVariantId,
} from '@/features/subscription/paywall-variants';

test('variants: the same install always sees the same paywall', () => {
  // A paywall that reworded itself between visits would feel like being
  // worked on, and would make the numbers meaningless.
  const a = variantFor('install-abc123');
  for (let i = 0; i < 20; i += 1) {
    assert.equal(variantFor('install-abc123').id, a.id);
  }
});

test('variants: different installs spread across all arms', () => {
  const seen = new Set<PaywallVariantId>();
  for (let i = 0; i < 400; i += 1) seen.add(variantFor(`install-${i}`).id);
  assert.equal(seen.size, Object.keys(PAYWALL_VARIANTS).length, 'every arm must be reachable');
});

test('variants: a missing install id falls back rather than throwing', () => {
  assert.equal(variantFor('').id, 'record');
});

test('variants: none of them manufactures urgency or scarcity', () => {
  const copy = [
    ...Object.values(PAYWALL_VARIANTS).map((v) => `${v.headline} ${v.body}`),
    `${SECOND_ASK.headline} ${SECOND_ASK.body}`,
  ]
    .join(' ')
    .toLowerCase();

  for (const trick of [
    'hurry', 'limited time', 'spots left', 'offer ends', 'only today',
    'act now', 'last chance', 'expires', 'don’t miss', "don't miss",
  ]) {
    assert.ok(!copy.includes(trick), `paywall copy must not use "${trick}"`);
  }
});

test('variants: none of them promises an outcome', () => {
  const copy = Object.values(PAYWALL_VARIANTS)
    .map((v) => `${v.headline} ${v.body}`)
    .join(' ')
    .toLowerCase();

  for (const promise of ['regrow', 'thicker', 'fuller hair', 'restore your', 'guarantee']) {
    assert.ok(!copy.includes(promise), `paywall copy must not promise "${promise}"`);
  }
});

test('second ask: it does not threaten to take their journey away', () => {
  // The photographs are theirs and stay on the device whatever they
  // decide. Implying otherwise would be a threat, and an untrue one.
  assert.match(SECOND_ASK.body, /stay on this device either way/);

  // The word "deleted" appears, as reassurance — "nothing is deleted".
  // What must never appear is the threatening construction: something of
  // theirs being taken if they decline.
  for (const threat of [
    /you will lose/i,
    /will be deleted/i,
    /lose (your|access to your) (photographs|photos|journey|record)/i,
    /removed after/i,
  ]) {
    assert.ok(!threat.test(SECOND_ASK.body), `second ask must not threaten: ${threat}`);
  }
});
