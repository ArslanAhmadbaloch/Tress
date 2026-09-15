/**
 * Paywall copy, which is where an app's honesty is cheapest to sell.
 *
 * Variants exist to find which true sentence lands, not to find how much
 * can be left out — so these check the assignment is stable and even, and
 * sweep every sentence on the screen for the patterns that work by making
 * somebody believe something untrue: manufactured urgency, promised
 * outcomes, and — new with the hero — any suggestion of a before and an
 * after.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PLANS, type PlanConfig } from '@/features/subscription/config';
import {
  CTA_COPY,
  HERO_COPY,
  PAYWALL_VARIANTS,
  PREMIUM_BENEFITS,
  SECOND_ASK,
  ctaLabel,
  heroAccessibilityLabel,
  heroCaption,
  heroFor,
  paywallCopy,
  priceLine,
  renewalTerms,
  variantFor,
  type PaywallVariantId,
} from '@/features/subscription/paywall-variants';
import { EMPTY_DATA, type AppData, type Photo, type PhotoSession } from '@/types/domain';

/* ------------------------------ fixtures ----------------------------- */

function photo(angle: Photo['angle'], sessionId: string, capturedAt: string): Photo {
  return {
    id: `${sessionId}-${angle}`,
    sessionId,
    angle,
    uri: `file:///photos/${sessionId}-${angle}.jpg`,
    thumbnailUri: `file:///photos/${sessionId}-${angle}-thumb.jpg`,
    width: 1080,
    height: 1440,
    capturedAt,
  };
}

function session(id: string, capturedAt: string, angles: Photo['angle'][], isBaseline = false): PhotoSession {
  return {
    id,
    journeyId: 'j1',
    capturedAt,
    isBaseline,
    photos: angles.map((a) => photo(a, id, capturedAt)),
  };
}

const profile: AppData['profile'] = {
  id: 'p1',
  displayName: 'Sam',
  avatarUri: 'file:///photos/portrait.jpg',
  createdAt: '2026-01-05T09:00:00.000Z',
};

/** Every sentence a person can read on the paywall, lower-cased. */
function everyLine(): string {
  const yearlyTrial: PlanConfig = { ...PLANS.yearly, trial: { duration: '7 days' } };
  return [
    ...Object.values(PAYWALL_VARIANTS).map((v) => `${v.headline} ${v.body}`),
    `${SECOND_ASK.headline} ${SECOND_ASK.body} ${SECOND_ASK.accept} ${SECOND_ASK.decline}`,
    ...Object.values(HERO_COPY),
    ...PREMIUM_BENEFITS.map((b) => `${b.title} ${b.body}`),
    ...Object.values(CTA_COPY),
    priceLine(PLANS.yearly),
    priceLine(yearlyTrial),
    renewalTerms(PLANS.monthly),
    renewalTerms(yearlyTrial),
  ]
    .join(' ')
    .toLowerCase();
}

/* ------------------------------ variants ----------------------------- */

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

/* ------------------------------ the sweep ---------------------------- */

test('copy: nothing on the paywall manufactures urgency or scarcity', () => {
  const copy = everyLine();
  for (const trick of [
    'hurry', 'limited time', 'spots left', 'offer ends', 'only today',
    'act now', 'last chance', 'expires', 'don’t miss', "don't miss",
    'ends soon', 'today only', 'one-time offer',
  ]) {
    assert.ok(!copy.includes(trick), `paywall copy must not use "${trick}"`);
  }
});

test('copy: nothing on the paywall promises an outcome', () => {
  const copy = everyLine();
  for (const promise of [
    'regrow', 'thicker', 'fuller', 'restore your', 'guarantee', 'improve',
    'results', 'transform', 'reverse', 'diagnos', 'norwood', 'severe', 'advanced',
  ]) {
    assert.ok(!copy.includes(promise), `paywall copy must not promise "${promise}"`);
  }
});

test('copy: nothing on the paywall is a testimonial or a borrowed face', () => {
  // The only picture on the screen is theirs; the only voice is ours.
  const copy = everyLine();
  for (const fake of ['"', '“', 'rated', 'stars', 'users say', 'reviews', 'trusted by']) {
    assert.ok(!copy.includes(fake), `paywall copy must not carry "${fake}"`);
  }
});

/* -------------------------------- hero ------------------------------- */

test('hero: it is one photograph, never a before and an after', () => {
  const copy = `${Object.values(HERO_COPY).join(' ')} ${heroCaption(heroFor({
    ...EMPTY_DATA,
    profile,
  })!)}`.toLowerCase();

  for (const pair of ['before', 'after', 'then and now', 'progress so far', 'vs']) {
    assert.ok(!copy.includes(pair), `hero copy must not suggest a pair: "${pair}"`);
  }
  // What it does say is the one thing that is true in every state.
  assert.equal(HERO_COPY.onDevice, 'On this device');
});

test('hero: the baseline set leads with the hairline shot', () => {
  const data: AppData = {
    ...EMPTY_DATA,
    profile,
    // Newest first, as the store keeps them. The baseline is the last.
    sessions: [
      session('s2', '2026-03-01T10:00:00.000Z', ['front', 'top']),
      session('s1', '2026-01-10T10:00:00.000Z', ['top', 'leftTemple', 'front'], true),
    ],
  };
  const hero = heroFor(data);
  assert.ok(hero);
  assert.equal(hero.source, 'session');
  assert.equal(hero.uri, 'file:///photos/s1-front.jpg', 'the earliest set, not the latest');
  assert.equal(hero.placeholderUri, 'file:///photos/s1-front-thumb.jpg');
  assert.equal(hero.label, 'Hairline');
  assert.equal(hero.takenAt, '2026-01-10T10:00:00.000Z');
});

test('hero: without a hairline shot it takes a side before the top', () => {
  const data: AppData = {
    ...EMPTY_DATA,
    profile,
    sessions: [session('s1', '2026-01-10T10:00:00.000Z', ['crown', 'top', 'rightTemple'], true)],
  };
  const hero = heroFor(data);
  assert.ok(hero);
  assert.equal(hero.label, 'Right Side');
});

test('hero: with no session it falls back to the onboarding portrait, honestly labelled', () => {
  const hero = heroFor({ ...EMPTY_DATA, profile });
  assert.ok(hero);
  assert.equal(hero.source, 'portrait');
  assert.equal(hero.uri, 'file:///photos/portrait.jpg');
  assert.equal(hero.placeholderUri, null);
  assert.equal(hero.label, HERO_COPY.portraitLabel);
  assert.notEqual(hero.label, 'Hairline', 'a portrait must not be captioned as a hairline shot');
  assert.equal(hero.takenAt, profile.createdAt);
});

test('hero: a session with no photographs does not shadow the portrait', () => {
  const data: AppData = {
    ...EMPTY_DATA,
    profile,
    sessions: [session('s1', '2026-01-10T10:00:00.000Z', [], true)],
  };
  assert.equal(heroFor(data)?.source, 'portrait');
});

test('hero: with nothing at all it is null, and the empty frame says so', () => {
  assert.equal(heroFor(EMPTY_DATA), null);
  assert.equal(heroFor({ ...EMPTY_DATA, profile: { ...profile, avatarUri: undefined } }), null);
  const label = heroAccessibilityLabel(null);
  assert.match(label, /starting point/i);
  assert.match(label, /on this device/i);
});

test('hero: the caption is the angle and the date, nothing else', () => {
  const hero = heroFor({
    ...EMPTY_DATA,
    profile,
    sessions: [session('s1', '2026-01-10T10:00:00.000Z', ['front'], true)],
  })!;
  const caption = heroCaption(hero);
  assert.match(caption, /^Hairline · /);
  assert.match(caption, /2026/);
  // The screen reader hears the same facts, not a different story.
  const spoken = heroAccessibilityLabel(hero);
  assert.match(spoken, /hairline photograph/i);
  assert.match(spoken, /2026/);
  assert.match(spoken, /on this device/i);
});

/* ------------------------------ benefits ----------------------------- */

test('benefits: each names a thing the app does, and one of them is privacy', () => {
  assert.ok(PREMIUM_BENEFITS.length >= 3 && PREMIUM_BENEFITS.length <= 5, 'short list');
  for (const b of PREMIUM_BENEFITS) {
    assert.ok(b.title.trim().length > 0 && b.body.trim().length > 0);
    assert.ok(b.body.length <= 80, `one line each: "${b.body}"`);
  }
  assert.ok(
    PREMIUM_BENEFITS.some((b) => /device/i.test(b.body)),
    'the list must say the photographs stay on the device',
  );
  const titles = new Set(PREMIUM_BENEFITS.map((b) => b.title));
  assert.equal(titles.size, PREMIUM_BENEFITS.length, 'no repeated benefit');
});

/* ------------------------------- price ------------------------------- */

test('price: a trial always names the price it turns into', () => {
  const yearly: PlanConfig = { ...PLANS.yearly, trial: { duration: '7 days' } };
  const line = priceLine(yearly);
  assert.ok(line.startsWith('7 days free, then '));
  assert.ok(line.includes(PLANS.yearly.formattedPrice));
  assert.ok(line.includes(PLANS.yearly.formattedMonthlyEquivalent!));

  const monthly: PlanConfig = { ...PLANS.monthly, trial: { duration: '1 month' } };
  assert.equal(priceLine(monthly), `1 month free, then ${PLANS.monthly.formattedPrice} a month`);
});

test('price: without a trial the line is the price, and never mentions one', () => {
  assert.equal(
    priceLine(PLANS.yearly),
    `${PLANS.yearly.formattedPrice} a year · about ${PLANS.yearly.formattedMonthlyEquivalent} a month`,
  );
  assert.equal(priceLine(PLANS.monthly), `${PLANS.monthly.formattedPrice} a month`);
  for (const plan of [PLANS.yearly, PLANS.monthly]) {
    assert.ok(!/free|trial/i.test(priceLine(plan)));
    assert.ok(!/free|trial/i.test(renewalTerms(plan)));
    assert.ok(!/free|trial/i.test(ctaLabel(plan, false)));
  }
});

test('price: the renewal terms carry every clause the stores require', () => {
  const trial: PlanConfig = { ...PLANS.yearly, trial: { duration: '7 days' } };
  const terms = renewalTerms(trial);
  assert.match(terms, /7 days are free/);
  assert.match(terms, /renews automatically/);
  assert.ok(terms.includes(PLANS.yearly.formattedPrice));
  assert.match(terms, /24 hours/);
  assert.match(terms, /Cancel anytime/);

  const plain = renewalTerms(PLANS.monthly);
  assert.match(plain, /renew automatically unless cancelled/);
  assert.match(plain, /Cancel anytime/);
});

test('cta: the button says what the tap does', () => {
  const trial: PlanConfig = { ...PLANS.yearly, trial: { duration: '7 days' } };
  assert.equal(ctaLabel(trial, false), CTA_COPY.trial);
  assert.equal(ctaLabel(PLANS.yearly, false), CTA_COPY.subscribe);
  assert.equal(ctaLabel(trial, true), CTA_COPY.done);
  assert.match(CTA_COPY.trial, /free trial/i);
});

/* ----------------------------- second ask ---------------------------- */

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

test('second ask: it replaces the headline and body, and nothing else', () => {
  // The install's arm is untouched by the second ask — the same person
  // sees the same variant again the moment the second ask is spent.
  for (const variant of Object.values(PAYWALL_VARIANTS)) {
    const first = paywallCopy(variant, false);
    assert.equal(first.headline, variant.headline);
    assert.equal(first.body, variant.body);

    const second = paywallCopy(variant, true);
    assert.equal(second.headline, SECOND_ASK.headline);
    assert.equal(second.body, SECOND_ASK.body);
    assert.deepEqual(Object.keys(second).sort(), ['body', 'headline'], 'no extra copy on the second visit');
  }
});

test('second ask: the price and the terms are not part of the copy it swaps', () => {
  // A second ask that moved the price would be a different offer wearing
  // the first one's clothes. The swap has no hook to touch either.
  const copy = paywallCopy(PAYWALL_VARIANTS.record, true);
  const yearlyTrial: PlanConfig = { ...PLANS.yearly, trial: { duration: '7 days' } };
  for (const line of [priceLine(PLANS.yearly), priceLine(yearlyTrial), renewalTerms(yearlyTrial)]) {
    assert.ok(!copy.body.includes(line) && !copy.headline.includes(line));
  }
  assert.ok(!/\$|£|€|\d/.test(`${copy.headline} ${copy.body}`), 'the second ask names no number');
});
