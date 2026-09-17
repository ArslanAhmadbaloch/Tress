/**
 * Paywall copy, which is where an app's honesty is cheapest to sell.
 *
 * Variants exist to find which true sentence lands, not to find how much
 * can be left out — so these check the assignment is stable and even, and
 * sweep every sentence on the screen for the patterns that work by making
 * somebody believe something untrue: manufactured urgency, promised
 * outcomes, any suggestion of a before and an after, and — since the list
 * grew to name what Premium includes — any feature the app does not have.
 *
 * Two things the sweep now pins down that it did not before:
 *
 *   No trial. The offer is a straight subscription, so the words "free"
 *   and "trial" must not reach any line on the screen, and no function
 *   that builds one of those lines may have a branch that could put them
 *   there.
 *
 *   No recommendations. The app has no recommendation engine — no model,
 *   no rules table, no lookup — so the paywall must not sell one. This is
 *   the one that would cost a submission: advertising a feature that does
 *   not exist is an App Store 2.3 rejection, and it is money taken for
 *   something the customer will go looking for and not find.
 *
 * ── Why the benefits are not checked with existsSync ──────────────────
 * They were, and it was not a test. A bullet was pointed at a filename,
 * the filename existed, and the assertion passed — while the sentence on
 * the screen said the report covered "every reading, for every set" and
 * the screen it named covered one photograph from the first set only. A
 * file existing is not the app doing the thing.
 *
 * So each claim now carries the assertion that would actually fail if the
 * claim stopped being true: the gate that makes it Premium, read out of
 * the screen that enforces it, or — for the report line — the behaviour
 * itself, by building a report from one set and from two and checking the
 * comparison appears only in the second. A well-written lie can pass an
 * existsSync. It cannot pass buildReport.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { buildReport } from '@/features/assessment/engine';
import { DEFAULT_PLAN, PLANS, PLAN_ORDER } from '@/features/subscription/config';
import {
  CTA_COPY,
  HERO_COPY,
  PAYWALL_HIGHLIGHTS,
  PAYWALL_TITLE,
  PAYWALL_VARIANTS,
  PLAN_BADGE,
  PLAN_DISPLAY_ORDER,
  PREMIUM_BENEFITS,
  SECOND_ASK,
  ctaLabel,
  heroAccessibilityLabel,
  heroCaption,
  heroFor,
  heroPill,
  highlightBenefits,
  nextScanLabel,
  paywallCopy,
  planName,
  priceLine,
  renewalTerms,
  variantFor,
  type PaywallVariantId,
} from '@/features/subscription/paywall-variants';
import { EMPTY_DATA, emptyJourney, type AppData, type Photo, type PhotoSession } from '@/types/domain';

/* ------------------------------ fixtures ----------------------------- */

/** A repo-relative path, so a claim can be checked against a real file. */
const repoFile = (rel: string) => new URL(`../../${rel}`, import.meta.url);

/**
 * The text of a repo file, so a claim can be checked against the code that
 * has to satisfy it rather than against the mere existence of a filename.
 */
const source = (rel: string) => readFileSync(repoFile(rel), 'utf8');

/**
 * The same file with its comments removed. The screen's own comments say
 * what it refuses to draw — "no free trial" — and a sweep that flagged
 * its rulebook would be noise rather than signal.
 */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A reading of the kind the segmenter leaves on a photograph. */
function withCoverage(s: PhotoSession, fraction: number, verticalBalance: number): PhotoSession {
  return {
    ...s,
    photos: s.photos.map((p) =>
      p.angle === 'front'
        ? {
            ...p,
            coverage: { fraction, upperFraction: fraction * 0.9, verticalBalance, pixels: 60_000 },
          }
        : p,
    ),
  };
}

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
  return [
    PAYWALL_TITLE,
    ...Object.values(PAYWALL_VARIANTS).map((v) => v.body),
    `${SECOND_ASK.headline} ${SECOND_ASK.body} ${SECOND_ASK.accept} ${SECOND_ASK.decline}`,
    ...Object.values(HERO_COPY),
    nextScanLabel(EMPTY_DATA),
    ...PREMIUM_BENEFITS.map((b) => `${b.title} ${b.body}`),
    ...PAYWALL_HIGHLIGHTS.map((h) => h.label),
    PLAN_BADGE,
    planName(PLANS.yearly),
    planName(PLANS.monthly),
    ...Object.values(CTA_COPY),
    priceLine(PLANS.yearly),
    priceLine(PLANS.monthly),
    renewalTerms(PLANS.yearly),
    renewalTerms(PLANS.monthly),
    ctaLabel(false),
    ctaLabel(true),
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
    'results', 'transform', 'reverse', 'diagnos', 'norwood', 'ludwig',
    'severe', 'advanced',
    // The scan line names a real model, so the sweep now has to hold the
    // line on what that model is allowed to have measured. It reports the
    // hair mask's share of the frame: area. A mask cannot see between
    // strands, so density and thickness are not available to it, and a
    // stage is not available to anything on a phone.
    'density', 'thickness', 'thinning', 'hair loss stage', 'stage of',
    'how much hair you have', 'detect', 'predict', 'forecast',
  ]) {
    assert.ok(!copy.includes(promise), `paywall copy must not promise "${promise}"`);
  }
});

test('copy: the paywall sells nothing the app has not built', () => {
  /*
    The owner asked for "product suggestions for their hair type" on this
    list. There is no recommendation engine in this repository — no model,
    no rules table, no lookup — so it is not on the list, and this test is
    what keeps it off until one ships.

    The barcode line is the near miss it has to survive: the app really
    does scan a barcode and really does show what Open Beauty Facts holds,
    and the difference between "here is what the database lists" and "here
    is what you should use" is the whole of the claim.
  */
  const copy = everyLine();
  for (const unbuilt of [
    'recommend', 'suggests', 'suggestion', 'personalised', 'personalized',
    'tailored to', 'matched to your', 'for your hair type', 'built for your',
    'picks for you', 'chosen for you', 'what to use', 'best products',
    'expert review', 'dermatologist',
  ]) {
    assert.ok(!copy.includes(unbuilt), `paywall copy must not sell "${unbuilt}"`);
  }
});

test('copy: no free trial reaches the screen, and no branch could put one there', () => {
  /*
    The offer is a straight subscription. Not "7 days free", not "then
    $49.99" — one price, charged on the tap.

    Matched as word boundaries rather than as substrings with a leading
    space. `everyLine()` joins with a space but the first element is a
    variant headline, so " free" could not have caught a line that opened
    with the word; and "trial" as a bare substring catches "industrial"
    while missing nothing it needs to. The boundary form does both jobs.
  */
  const copy = everyLine();
  for (const pattern of [
    /\bfree\b/,
    /\btrials?\b/,
    /\bdays free\b/,
    /\bthen\s*[$£€]/,
    /\bno charge\b/,
    /\bstart(ing)? free\b/,
  ]) {
    assert.ok(!pattern.test(copy), `paywall copy must not mention ${pattern}`);
  }

  // Not just absent from the defaults: absent whatever the store hands
  // back. A stray introductory offer must not resurrect the old copy.
  for (const plan of [PLANS.yearly, PLANS.monthly]) {
    const withTrial = { ...plan, trial: { duration: '7 days' } };
    assert.equal(priceLine(withTrial), priceLine(plan), 'the price line has no trial branch');
    assert.equal(renewalTerms(withTrial), renewalTerms(plan), 'the terms have no trial branch');
    for (const line of [priceLine(withTrial), renewalTerms(withTrial)]) {
      assert.ok(!/free|trial/i.test(line), line);
    }
  }
  assert.ok(!Object.keys(CTA_COPY).includes('trial'), 'no trial label is left to reach for');
});

test('copy: nothing on the paywall is a testimonial or a borrowed face', () => {
  // The only picture on the screen is theirs; the only voice is ours.
  const copy = everyLine();
  for (const fake of ['"', '“', 'rated', 'stars', 'users say', 'reviews', 'trusted by']) {
    assert.ok(!copy.includes(fake), `paywall copy must not carry "${fake}"`);
  }
});

/* -------------------------------- hero ------------------------------- */

test('hero: it is one photograph and an empty frame, never a before and an after', () => {
  /*
    The reference's second card is the same photograph labelled "after".
    Ours is an empty frame with the next scan's date on it, so every word
    on or under the pair has to be free of the pairing vocabulary — the
    pills, the caption, the frame's label and what a screen reader hears.
  */
  const withJourney: AppData = {
    ...EMPTY_DATA,
    profile,
    journey: emptyJourney('j1', profile.id, '2026-01-05T09:00:00.000Z'),
  };
  const hero = heroFor(withJourney)!;
  const next = nextScanLabel(withJourney);
  const copy = [
    ...Object.values(HERO_COPY),
    heroCaption(hero),
    heroPill(hero),
    next,
    nextScanLabel(EMPTY_DATA),
    heroAccessibilityLabel(hero, next),
    heroAccessibilityLabel(null, next),
  ]
    .join(' ')
    .toLowerCase();

  for (const pair of ['before', 'after', 'then and now', 'progress so far', 'vs', 'result']) {
    assert.ok(!copy.includes(pair), `hero copy must not suggest a pair: "${pair}"`);
  }
  // What it does say is the one thing that is true in every state.
  assert.equal(HERO_COPY.onDevice, 'On this device');
});

test('hero: the empty frame carries the record\'s next-scan date, and nothing without a journey', () => {
  const journey = emptyJourney('j1', profile.id, '2026-01-05T09:00:00.000Z');
  const label = nextScanLabel({ ...EMPTY_DATA, profile, journey });
  assert.ok(label.startsWith(`${HERO_COPY.nextScan} · `), label);
  assert.ok(label.length > `${HERO_COPY.nextScan} · `.length, 'a date follows the separator');
  // The frame is a frame: it names a date the record already holds and
  // says nothing about what will be in it.
  assert.ok(!/\d\s*%|hair|grow/i.test(label), label);
  assert.equal(nextScanLabel(EMPTY_DATA), HERO_COPY.nextScan);
});

test('hero: the card says "Today" only for a photograph taken today', () => {
  // The reference labels the card "before" whatever its date. A card that
  // said "Today" over a photograph from last month would be the same lie.
  const now = new Date();
  const today = heroFor({
    ...EMPTY_DATA,
    profile,
    sessions: [session('s1', now.toISOString(), ['front'], true)],
  })!;
  assert.equal(heroPill(today, now), HERO_COPY.today);

  const then = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000);
  const older = heroFor({
    ...EMPTY_DATA,
    profile,
    sessions: [session('s1', then.toISOString(), ['front'], true)],
  })!;
  const pill = heroPill(older, now);
  assert.notEqual(pill, HERO_COPY.today);
  assert.match(pill, /\d/, 'an older photograph is labelled with its date');
});

test('hero: the latest set leads with the hairline shot', () => {
  const data: AppData = {
    ...EMPTY_DATA,
    profile,
    // Newest first, as the store keeps them. The latest scan is the first.
    sessions: [
      session('s2', '2026-03-01T10:00:00.000Z', ['top', 'front']),
      session('s1', '2026-01-10T10:00:00.000Z', ['top', 'leftTemple', 'front'], true),
    ],
  };
  const hero = heroFor(data);
  assert.ok(hero);
  assert.equal(hero.source, 'session');
  assert.equal(hero.uri, 'file:///photos/s2-front.jpg', 'the latest set, as the card is captioned');
  assert.equal(hero.placeholderUri, 'file:///photos/s2-front-thumb.jpg');
  assert.equal(hero.label, 'Hairline');
  assert.equal(hero.takenAt, '2026-03-01T10:00:00.000Z');
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

test('hero: with nothing at all it is null, and the example is called an example', () => {
  assert.equal(heroFor(EMPTY_DATA), null);
  assert.equal(heroFor({ ...EMPTY_DATA, profile: { ...profile, avatarUri: undefined } }), null);
  const label = heroAccessibilityLabel(null, nextScanLabel(EMPTY_DATA));
  assert.match(label, /example/i, 'a face the app did not name would read as a result');
  assert.match(label, /next scan/i);
  assert.match(label, /on this device/i);
  assert.equal(HERO_COPY.example, 'Example');
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
  const spoken = heroAccessibilityLabel(hero, HERO_COPY.nextScan);
  assert.match(spoken, /hairline photograph/i);
  assert.match(spoken, /2026/);
  assert.match(spoken, /empty frame/i);
  assert.match(spoken, /on this device/i);
});

/* ----------------------------- highlights ---------------------------- */

test('highlights: three columns, each a line from the ledger, with its own glyph', () => {
  /*
    The reference shows three icon benefits and nothing more. Ours are
    drawn from PREMIUM_BENEFITS, so the row can only say what rule 2 has
    already vouched for: a highlight that names no ledger line is dropped
    rather than drawn, and this is what keeps that from ever happening.
  */
  assert.equal(PAYWALL_HIGHLIGHTS.length, 3, 'three, as the reference draws them');
  const resolved = highlightBenefits();
  assert.equal(resolved.length, PAYWALL_HIGHLIGHTS.length, 'every highlight names a ledger line');
  for (const h of PAYWALL_HIGHLIGHTS) {
    assert.ok(
      PREMIUM_BENEFITS.some((b) => b.title === h.benefit),
      `"${h.benefit}" is not on the Premium ledger`,
    );
    assert.ok(h.label.trim().length > 0 && h.label.length <= 30, `two short lines at most: "${h.label}"`);
    // The shortened label may not say more than the line it stands for.
    const claim = CLAIMS.find((c) => c.match.test(h.benefit));
    assert.ok(claim, `"${h.benefit}" has no gate behind it`);
    assert.notEqual(claim.gated, 'fact', 'the ungated fact is the footer line, not a highlight');
  }
  assert.equal(new Set(resolved.map((r) => r.icon)).size, resolved.length, 'no repeated glyph');
  assert.equal(new Set(PAYWALL_HIGHLIGHTS.map((h) => h.label)).size, PAYWALL_HIGHLIGHTS.length);
});

/* ------------------------------- plans ------------------------------- */

test('plans: the cards are named plainly and the tag makes no promise', () => {
  assert.equal(planName(PLANS.yearly), 'Yearly');
  assert.equal(planName(PLANS.monthly), 'Monthly');
  assert.ok(!/free|trial|offer ends|limited/i.test(PLAN_BADGE), PLAN_BADGE);
});

test('plans: the short plan is drawn first and the chosen yearly card second, as the reference lists them', () => {
  /*
    The reference's order is a comparison made by position: the month's
    price read first, then the year with the tick already in it. Every
    plan the store can sell is drawn — none is hidden to make the other
    look better — and the one drawn last is the one that opens selected.
  */
  assert.deepEqual([...PLAN_DISPLAY_ORDER].sort(), [...PLAN_ORDER].sort(), 'every plan is drawn');
  assert.equal(PLAN_DISPLAY_ORDER[0], 'monthly');
  assert.equal(PLAN_DISPLAY_ORDER[PLAN_DISPLAY_ORDER.length - 1], DEFAULT_PLAN);
  assert.equal(DEFAULT_PLAN, 'yearly', 'the badge and the tick are on the same card');
});

test('screen: the first ask is headline then benefits, with no paragraph between', () => {
  /*
    The reference has nothing between "Unlock Lóvi Premium" and its three
    icons, and no caption under its two cards. A framing paragraph in
    either place pushed the plans a text block lower for the sake of
    sentences the pills and the benefits already carried. The first
    visit therefore has no body at all; only the second ask does.
  */
  for (const variant of Object.values(PAYWALL_VARIANTS)) {
    assert.equal(paywallCopy(variant, false).body, null, 'no paragraph under the first-ask headline');
  }
  const screen = stripComments(source('src/app/paywall.tsx'));
  assert.match(screen, /copy\.body \?/, 'the body is drawn only when the visit has one');

  const hero = stripComments(source('src/components/paywall/hero-pair.tsx'));
  assert.ok(!/heroCaption\(/.test(hero), 'no caption is drawn under the cards');
  assert.ok(!/HERO_COPY\.emptyBody/.test(hero), 'the example note is spoken, not drawn');
  assert.ok(!/HERO_COPY\.onDevice/.test(hero), 'the lock line lives in the footer, said once');
  assert.match(screen, /HERO_COPY\.onDevice/, 'and the footer does say it');
});

test('screen: no trial toggle, and the promo code only where the store has a sheet', () => {
  /*
    The reference has a Premium | Free Trial segmented toggle under its
    plans. The owner's decision is no trial, so the screen must not draw
    one — checked on the JSX with the comments stripped, since the
    comments are where the screen says so.
  */
  const screen = stripComments(source('src/app/paywall.tsx'));
  assert.ok(!/\btrial\b/i.test(screen), 'the paywall must draw no trial toggle');
  assert.ok(!/\bfree\b/i.test(screen), 'nor the word free');
  assert.match(screen, /redeemCode \?/, 'the promo link is drawn only when the provider hands back a sheet to open');

  const provider = source('src/features/subscription/provider.tsx');
  assert.match(provider, /presentCodeRedemptionSheet/, 'the code goes to the store\'s own sheet');
  assert.match(
    provider,
    /Platform\.OS !== 'ios'[^\n]*return null/,
    'and only on iOS — Android has no sheet, so it gets no link',
  );
});

/* ------------------------------ benefits ----------------------------- */

test('benefits: each names a thing the app does, and one of them is privacy', () => {
  assert.ok(PREMIUM_BENEFITS.length >= 5 && PREMIUM_BENEFITS.length <= 8, 'a list, not a brochure');
  for (const b of PREMIUM_BENEFITS) {
    assert.ok(b.title.trim().length > 0 && b.body.trim().length > 0);
    assert.ok(b.body.length <= 80, `one line each: "${b.body}"`);
    assert.ok(b.title.length <= 30, `a title, not a sentence: "${b.title}"`);
  }
  assert.ok(
    PREMIUM_BENEFITS.some((b) => /device/i.test(b.body)),
    'the list must say the photographs stay on the device',
  );
  const titles = new Set(PREMIUM_BENEFITS.map((b) => b.title));
  assert.equal(titles.size, PREMIUM_BENEFITS.length, 'no repeated benefit');
  const icons = new Set(PREMIUM_BENEFITS.map((b) => b.icon));
  assert.equal(icons.size, PREMIUM_BENEFITS.length, 'no repeated glyph');
});

/**
 * What has to be true of a bullet, beyond the file behind it existing.
 *
 *   'capture'  The entitlement decides it through hair-scan.tsx: a
 *              non-subscriber is sent here the moment they reach for a
 *              scan after the free baseline. Anything that needs a second
 *              scan — the comparison, the report's framing half — is
 *              behind this gate whether or not it names it.
 *   'stack'    routine.tsx puts it behind gate('buildStack').
 *   'fact'     Not gated, and not claiming to be: a true statement about
 *              what is being paid for. Exactly one line may be this, and
 *              the test below pins which.
 */
type Gated = 'capture' | 'stack' | 'fact';

const CLAIMS: { match: RegExp; screen: string; gated: Gated }[] = [
  { match: /unlimited scans/i, screen: 'src/app/hair-scan.tsx', gated: 'capture' },
  {
    // The reading has to be named on a screen, not merely computed in a
    // module. One reading per set is displayed: the report tab's coverage
    // line for every set after the first. The model itself lives in
    // src/features/assessment/hair-segmenter.ts, which is not a screen and
    // so cannot carry the claim on its own.
    match: /scan on your phone/i,
    screen: 'src/app/(tabs)/report.tsx',
    gated: 'capture',
  },
  { match: /your report/i, screen: 'src/app/(tabs)/report.tsx', gated: 'capture' },
  { match: /side-by-side/i, screen: 'src/app/compare.tsx', gated: 'capture' },
  { match: /routine and stack/i, screen: 'src/app/routine.tsx', gated: 'stack' },
  { match: /barcode/i, screen: 'src/app/scan-product.tsx', gated: 'stack' },
  { match: /kept on this device/i, screen: 'src/app/privacy.tsx', gated: 'fact' },
];

test('benefits: every line names a screen, and nothing on the list is unaccounted for', () => {
  for (const claim of CLAIMS) {
    assert.ok(
      PREMIUM_BENEFITS.some((b) => claim.match.test(b.title)),
      `${claim.screen} ships, so the list should name it: ${claim.match}`,
    );
    assert.ok(existsSync(repoFile(claim.screen)), `${claim.screen} must exist to be sold`);
  }
  for (const b of PREMIUM_BENEFITS) {
    assert.ok(
      CLAIMS.some((c) => c.match.test(b.title)),
      `"${b.title}" is on the paywall with no screen behind it`,
    );
  }
});

test('benefits: the gates the list leans on are really in the code', () => {
  /*
    This is the half the old existsSync check could not do. A screen can
    exist and be free; a bullet that sells it is then selling something
    the customer already has. Premium is enforced in exactly two places
    in this app, and both of them are read here — if either is deleted,
    the bullets resting on it fail rather than quietly becoming untrue.
  */
  const hairScan = source('src/app/hair-scan.tsx');
  assert.match(
    hairScan,
    /!isPremium\s*&&\s*!isBaseline\)\s*router\.replace\('\/paywall'\)/,
    'hair-scan.tsx must send a non-subscriber reaching past the baseline to the paywall',
  );

  const routine = source('src/app/routine.tsx');
  assert.match(routine, /gate\('buildStack'/, "routine.tsx must gate adding to the stack");
  assert.match(
    routine,
    /router\.push\('\/scan-product'\)/,
    'the barcode line is sold as part of the stack, so the stack screen must be the way in',
  );

  // Exactly one line is allowed to be an ungated fact, and it is the one
  // about where the photographs sit. A second would mean the list had
  // started charging for things a free user already has.
  const facts = CLAIMS.filter((c) => c.gated === 'fact');
  assert.equal(facts.length, 1, 'only one line on the list may be ungated');
  assert.match(facts[0].match.source, /device/i);
});

test('benefits: "set after set" is a thing the report does, not a thing it is called', () => {
  /*
    The claim is that a new set is read into the report and lined up
    against the one before. That is checkable, so it is checked: build a
    report from one set and from two, and assert the comparison shows up
    only in the second. This is the assertion the previous version of
    this file was missing — its bullet named a screen that reports on one
    photograph from the first set, and a filename check waved it through.
  */
  const first = withCoverage(session('s1', '2026-01-10T10:00:00.000Z', ['front', 'top'], true), 0.30, 0.55);
  const second = withCoverage(session('s2', '2026-03-01T10:00:00.000Z', ['front', 'top']), 0.36, 0.56);

  const alone = buildReport({ ...EMPTY_DATA, profile, sessions: [first] });
  const framingAlone = alone.sections.find((s) => s.kind === 'framing')!;
  assert.equal(framingAlone.score, null, 'one set is not a comparison');
  assert.equal(
    framingAlone.findings.find((f) => f.id === 'framing-coverage'),
    undefined,
    'with one set there is nothing to line up against',
  );

  // Newest first, as the store keeps them.
  const paired = buildReport({ ...EMPTY_DATA, profile, sessions: [second, first] });
  const framingPaired = paired.sections.find((s) => s.kind === 'framing')!;
  assert.notEqual(framingPaired.score, null, 'two sets are comparable');
  assert.ok(
    framingPaired.findings.some((f) => f.id === 'framing-matched'),
    'the second set is lined up angle for angle against the first',
  );
  const trend = framingPaired.findings.find((f) => f.id === 'framing-coverage');
  assert.ok(trend, 'and the newest hair-area reading is put beside the one before it');
  // Area, and only area — the same rule the scan line is held to. The
  // detail is allowed to say "not thickness", because saying so is the
  // point; what it may not do is claim density.
  const said = `${trend.headline} ${trend.detail}`;
  assert.match(said, /area/i, 'area is what a mask can measure');
  assert.ok(!/density/i.test(said), 'and density is what it cannot');

  const line = PREMIUM_BENEFITS.find((b) => /your report/i.test(b.title));
  assert.ok(line, 'the report is one of the things being paid for and should be named');
  assert.match(`${line.title} ${line.body}`, /set/i, 'the line says what makes it Premium');
});

test('benefits: the list does not sell the free first-photograph report', () => {
  /*
    The report at the end of the baseline scan is real, and it is free:
    the first scan costs nothing and hair-scan.tsx shows its report before
    the paywall. A bullet promising "the full scan report" or "every
    reading, for every set" is therefore false, and it is the bullet this
    list is most tempted to write.
  */
  const benefits = PREMIUM_BENEFITS.map((b) => `${b.title} ${b.body}`).join(' ').toLowerCase();
  for (const overclaim of [
    'scan report',
    'every reading',
    'for every set you take',
    'all five readings',
    'full report',
    // A reading per photograph is measured and never shown: only one
    // photograph per set is ever read back to a person. Selling the other
    // four is the same overclaim rotated onto the per-photograph axis.
    'each photograph',
    'every photograph',
  ]) {
    assert.ok(!benefits.includes(overclaim), `the benefits must not claim "${overclaim}"`);
  }
});

test('benefits: the on-device scan claims area, and nothing a mask cannot see', () => {
  const scan = PREMIUM_BENEFITS.find((b) => /scan on your phone/i.test(b.title));
  assert.ok(scan, 'the scan is one of the things being paid for and should be named');
  assert.match(scan.body, /area/i, 'area is what the hair mask measures');
  // "AI" is allowed because there is a real model in the binary — see
  // src/features/assessment/hair-segmenter.ts — and the line says where
  // it runs, which is the part that is worth the customer knowing.
  assert.match(scan.title, /\bAI\b/, 'the model is real, so it can be named');
  assert.match(`${scan.title} ${scan.body}`, /phone|device/i, 'say where it runs');
});

test('benefits: the barcode line credits the database rather than the app', () => {
  const barcode = PREMIUM_BENEFITS.find((b) => /barcode/i.test(b.title));
  assert.ok(barcode);
  assert.match(barcode.body, /database/i, 'scan-product.tsx shows what Open Beauty Facts holds');
  assert.ok(
    !/recommend|suggest|best|should/i.test(barcode.body),
    'a lookup is not advice',
  );
});

/* ------------------------------- price ------------------------------- */

test('price: the line is the price, and never mentions a trial', () => {
  assert.equal(
    priceLine(PLANS.yearly),
    `${PLANS.yearly.formattedPrice} a year · about ${PLANS.yearly.formattedMonthlyEquivalent} a month`,
  );
  assert.equal(priceLine(PLANS.monthly), `${PLANS.monthly.formattedPrice} a month`);
  for (const plan of [PLANS.yearly, PLANS.monthly]) {
    assert.ok(!/free|trial|then /i.test(priceLine(plan)));
    assert.ok(!/free|trial/i.test(renewalTerms(plan)));
  }
  assert.ok(!/free|trial/i.test(ctaLabel(false)));
});

test('price: the renewal terms carry every clause the stores require', () => {
  // Apple wants these whether or not there is an introductory offer, so
  // dropping the trial does not drop them.
  for (const plan of [PLANS.yearly, PLANS.monthly]) {
    const terms = renewalTerms(plan);
    assert.match(terms, /renews automatically/);
    assert.ok(terms.includes(plan.formattedPrice), 'the terms name the price that will be charged');
    // And how often, in the same sentence. This one has to stand on its
    // own in a review, and a price with no period attached does not say
    // what the subscription costs.
    assert.ok(
      terms.includes(`${plan.formattedPrice} a ${plan.period}`),
      `the terms must name the billing period: "${terms}"`,
    );
    assert.match(terms, /unless cancelled/);
    assert.match(terms, /App Store or Google Play/);
    assert.match(terms, /Cancel anytime/);
  }
});

test('cta: the button says what the tap does, and has one thing to say', () => {
  assert.equal(ctaLabel(false), CTA_COPY.subscribe);
  assert.equal(ctaLabel(true), CTA_COPY.done);
  assert.equal(ctaLabel.length, 1, 'the label takes no plan, so no plan can reintroduce a trial');
  assert.ok(!/free|trial/i.test(Object.values(CTA_COPY).join(' ')));
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

test('second ask: it swaps the headline, adds the one paragraph, and nothing else', () => {
  /*
    The first visit is the fixed title alone, whatever the arm. The
    second ask is where the arms differ: its paragraph opens with the
    fixed reassurance and closes with the install's one framing sentence,
    so the same person sees the same variant every time it is drawn.
  */
  for (const variant of Object.values(PAYWALL_VARIANTS)) {
    const first = paywallCopy(variant, false);
    assert.equal(first.headline, PAYWALL_TITLE, 'the title is fixed across arms');
    assert.equal(first.body, null, 'and stands alone on the first visit');

    const second = paywallCopy(variant, true);
    assert.equal(second.headline, SECOND_ASK.headline);
    assert.ok(second.body, 'the second ask is the one visit with a paragraph');
    assert.ok(second.body.startsWith(SECOND_ASK.body), 'it opens with the reassurance');
    assert.ok(second.body.endsWith(variant.body), 'and closes with the arm');
    assert.ok(second.body.split(' ').length <= 45, `one short paragraph: "${second.body}"`);
    assert.deepEqual(Object.keys(second).sort(), ['body', 'headline'], 'no extra copy on the second visit');
  }
});

test('second ask: the price and the terms are not part of the copy it swaps', () => {
  // A second ask that moved the price would be a different offer wearing
  // the first one's clothes. The swap has no hook to touch either.
  for (const variant of Object.values(PAYWALL_VARIANTS)) {
    const copy = paywallCopy(variant, true);
    for (const line of [priceLine(PLANS.yearly), priceLine(PLANS.monthly), renewalTerms(PLANS.yearly)]) {
      assert.ok(!copy.body?.includes(line) && !copy.headline.includes(line));
    }
    assert.ok(!/\$|£|€|\d/.test(`${copy.headline} ${copy.body}`), 'the second ask names no number');
  }
});
