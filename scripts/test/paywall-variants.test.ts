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
import { assertNoHairClaims } from './claims';

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

/**
 * Every sentence a person can read on the paywall, one per entry and
 * lower-cased.
 *
 * The sweeps below need both shapes. A banned substring only needs the
 * haystack, so those read everyLine(); a rule of the form "any line that
 * says X must also say Y" needs the lines apart, because in the joined
 * string every line's words sit next to every other line's.
 */
function everyLineList(): string[] {
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
  ].map((line) => line.toLowerCase());
}

/** The same sentences, joined, for the substring sweeps. */
function everyLine(): string {
  return everyLineList().join(' ');
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
    list. There is no PRODUCT recommendation engine in this repository —
    no model, no rules table, no lookup — so it is not on the list, and
    this test is what keeps it off until one ships.

    The barcode line is the near miss it has to survive: the app really
    does scan a barcode and really does show what Open Beauty Facts holds,
    and the difference between "here is what the database lists" and "here
    is what you should use" is the whole of the claim.

    One recommendation IS built, and it shipped this phase: the hairstyle
    catalogue in src/features/hairstyles, a readable rules table over hair
    type, length and gender. That is an EXEMPTION, not a hole: "recommend",
    "suggest" and "for your hair type" stay forbidden on every line the
    screen can draw, and the one way a line may carry them is by naming
    hairstyles or styling — which is the only thing in this repository
    that recommends anything. Written the other way round (ban the words
    only where a hairstyle word is absent, over a hand-picked subset of
    the copy) it would let "Products for your hair type" through on a
    line that says neither "recommend" nor "suggest", which is the exact
    sentence this test exists to stop.
  */
  const copy = everyLine();
  for (const unbuilt of [
    'personalised', 'personalized', 'tailored to', 'matched to your',
    'built for your', 'picks for you', 'chosen for you', 'what to use',
    'best products', 'product recommendations', 'recommended products',
    'expert review', 'dermatologist',
  ]) {
    assert.ok(!copy.includes(unbuilt), `paywall copy must not sell "${unbuilt}"`);
  }

  // The fenced words, swept over every line on the screen — the same
  // everyLineList() the other sweeps read, so HERO_COPY, the CTA copy,
  // the plan names, the price and the renewal terms are all inside it.
  const fenced = /recommend|suggest|for your hair type/i;
  for (const line of everyLineList()) {
    if (!fenced.test(line)) continue;
    assert.match(
      line,
      /hairstyle|styling/i,
      `only hairstyles may be recommended or offered "for your hair type": "${line}"`,
    );
    // A cut is suggested for a head of hair, never pronounced upon a
    // person: "suits you" is a stylist's judgement and not the app's.
    assert.ok(!/suits you|right for you|made for you/i.test(line), line);
  }

  // The fence is only worth having while it has something to catch: this
  // is what fails the day the loop above is silently passing because the
  // screen no longer says any of the three words at all.
  assert.ok(
    everyLineList().some((l) => fenced.test(l)),
    'the fence has nothing to fence — the hairstyle line has left the screen',
  );
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

test('hero: it is one photograph and a waiting frame, never a before and an after', () => {
  /*
    The reference's second card is the same photograph labelled "after".
    Ours is a dashed frame with the next scan's date on it — the picture
    behind the dashes is the app's own example, blurred — so every word
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

test('hero: the waiting frame carries the record\'s next-scan date, and nothing without a journey', () => {
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

test('hero: the frame’s backdrop is the app’s own example, blurred, and never their photograph', () => {
  /*
    The owner asked for a head of hair behind the dashed frame rather than
    a blank card. The danger in that is obvious and worth pinning down: a
    second picture on a paywall is one relabelling away from being an
    "after". So the backdrop is a bundled example the scanner's guides
    already use, read through hairContent by gender, blurred past the
    point where a face survives — and their own photograph, which has a
    date and a card of its own, is never the thing being blurred.

    WHICH example is pinned too, because not all five would do. It is the
    CROWN shot: the back of a head, all hair, no face and no parting. The
    front example is a hairline and eyes for a man and a scalp-part
    close-up for a woman, and a blurred one of those beside somebody's own
    photograph on a paywall reads as a remark about them however hard the
    scrim works. H.9 asked for a full head of hair, and the crown is the
    only angle that is that and nothing else.
  */
  const src = source('src/components/paywall/hero-pair.tsx');
  assert.equal(src.match(/blurRadius=/g)?.length, 1, 'exactly one image on the pair is blurred');
  assert.match(
    src,
    /source=\{backdropSource\(gender\)\}[\s\S]{0,200}blurRadius=\{BACKDROP_BLUR\}/,
    'and it is the backdrop of the dashed frame',
  );
  assert.match(
    src,
    /function backdropSource[\s\S]{0,900}hairContent\(gender\)\.angles\.crown\.example/,
    'the backdrop is the bundled gender-matched crown example, not a generated picture',
  );
  assert.ok(
    !/backdropSource[\s\S]{0,900}angles\.front\.example/.test(src),
    'the hairline and scalp-part crops are not what sits behind the dashes',
  );
  assert.ok(
    !/hero\.uri[\s\S]{0,240}blurRadius/.test(src),
    'their own photograph is never blurred into a backdrop',
  );
  // And a screen reader is told what it is, since a blur cannot say so.
  assert.match(HERO_COPY.waiting, /example/i);
  assert.match(HERO_COPY.waiting, /blurred/i);
  assert.ok(!/after|result/i.test(HERO_COPY.waiting), HERO_COPY.waiting);
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
  assert.match(spoken, /frame waiting for your next scan/i);
  assert.match(spoken, /on this device/i);
});

/* ----------------------------- highlights ---------------------------- */

test('highlights: four cells, each a line from the ledger, with its own glyph', () => {
  /*
    The reference shows three icon benefits. The owner asked for four
    (H.9): Unlimited scans · Hair tracking · Hairstyle recommendations ·
    Assessment report. Ours are drawn from PREMIUM_BENEFITS, so the grid
    can only say what rule 2 has already vouched for: a highlight that
    names no ledger line is dropped rather than drawn, and this is what
    keeps that from ever happening.
  */
  assert.equal(PAYWALL_HIGHLIGHTS.length, 4, "four, as the owner asked (H.9)");
  assert.deepEqual(
    PAYWALL_HIGHLIGHTS.map((h) => h.label),
    ['Unlimited scans', 'Hair tracking', 'Hairstyle recommendations', 'Assessment report'],
    'the owner named these four, in this order',
  );
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

  /*
    Half a phone's width holds about twenty-two characters at the grid's
    normal size, which is what two rows of two buys over a row of four: a
    word that does not fit does not wrap, it runs into the next cell, and
    "recommendations" is fifteen. The grid drops a size when any label
    carries a word longer than the cell, so the guard is read here — a
    label can grow past the cell, but not silently.
  */
  const row = source('src/components/paywall/highlights.tsx');
  assert.match(row, /const COLUMNS = 2;/, 'two rows of two, not a four-up row');
  assert.match(row, /const LONG_WORD = 22;/);
  assert.match(row, /variant=\{tight \? 'caption' : 'subhead'\}/, 'the long-word fallback is drawn');
  for (const h of PAYWALL_HIGHLIGHTS) {
    for (const word of h.label.split(' ')) {
      assert.ok(word.length <= 22, `"${word}" is too long for half a phone at any size`);
    }
  }
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
 *   'styles'   hairstyles.tsx shows the catalogue and holds the full
 *              list behind the entitlement.
 *   'fact'     Not gated, and not claiming to be: a true statement about
 *              what is being paid for. Exactly one line may be this, and
 *              the test below pins which.
 */
type Gated = 'capture' | 'stack' | 'styles' | 'fact';

/** The screen that holds the hairstyle catalogue, and the gate on it. */
const HAIRSTYLES_SCREEN = 'src/app/hairstyles.tsx';

const CLAIMS: { match: RegExp; screen: string; gated: Gated }[] = [
  { match: /unlimited scans/i, screen: 'src/app/hair-scan.tsx', gated: 'capture' },
  {
    // The record, tracked: two dates from it beside each other. Needs a
    // second scan, so the scan gate is what it costs.
    match: /hair tracking/i,
    screen: 'src/app/compare.tsx',
    gated: 'capture',
  },
  {
    // The catalogue's own screen holds the full list behind the
    // entitlement — see the gate test below.
    match: /hairstyle/i,
    screen: HAIRSTYLES_SCREEN,
    gated: 'styles',
  },
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
  { match: /assessment report/i, screen: 'src/app/(tabs)/report.tsx', gated: 'capture' },
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
    the customer already has. Premium is enforced in exactly three places
    in this app — the scan gate, the stack gate, and the hairstyle list —
    and all three are read here, as the module doc in paywall-variants.ts
    lists them. If any of them is deleted, the bullets resting on it fail
    rather than quietly becoming untrue.
  */
  const hairScan = source('src/app/hair-scan.tsx');
  assert.match(
    hairScan,
    /!isPremium\s*&&\s*!isBaseline\)\s*router\.replace\('\/paywall'\)/,
    'hair-scan.tsx must send a non-subscriber reaching past the baseline to the paywall',
  );

  const routine = source('src/app/routine.tsx');
  assert.match(routine, /gate\('buildStack'/, "routine.tsx must gate adding to the stack");

  /*
    The third gate, and the newest. The paywall may name the hairstyle
    catalogue only while two things are true: the screen ships, and the
    full list on it is behind the entitlement. So this reads the gate
    itself — `held={!isPremium && i > 0}` on the card, which is the line
    that shows a free reader the first suggestion and holds the rest —
    and not merely the word isPremium somewhere in the file. A screen
    that imported isPremium and held nothing back would pass that, and
    the paywall's third benefit rests on this and nothing else.
  */
  assert.ok(
    existsSync(repoFile(HAIRSTYLES_SCREEN)),
    `${HAIRSTYLES_SCREEN} must ship before the paywall sells it (hairstyles lane)`,
  );
  assert.match(
    source(HAIRSTYLES_SCREEN),
    /held=\{!isPremium\s*&&\s*i\s*>\s*0\}/,
    `${HAIRSTYLES_SCREEN} must hold the full list behind the entitlement`,
  );
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

  const line = PREMIUM_BENEFITS.find((b) => /assessment report/i.test(b.title));
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

/* --------------------- the routine block's examples -------------------- */

/*
  The one other place on the report where the subscription is drawn as a
  blur rather than a lock, so it is read here beside the paywall's own
  claims. The owner asked (H.7) for real product pictures in "Build your
  routine": the first clear, the rest held behind the subscription.

  The trap is that a blurred picture reads as a finding being withheld.
  These are bundled stock photographs of a bottle, a tube and a dropper —
  unbranded, generated for this app — so there is nothing behind the blur
  but the same photograph, and the captions must never suggest otherwise
  or claim a product does anything.
*/

const ROUTINE_BLOCK = 'src/components/hair-scan/report-sections/routine.tsx';

test('routine examples: three bundled photographs ship, and the block draws them', () => {
  const block = source(ROUTINE_BLOCK);
  for (const name of ['shampoo', 'conditioner', 'serum']) {
    assert.ok(
      existsSync(repoFile(`assets/images/products/${name}.png`)),
      `assets/images/products/${name}.png must ship for the block to draw it`,
    );
    assert.match(
      block,
      new RegExp(`products/${name}\\.png`),
      `the block must draw the bundled ${name} photograph`,
    );
  }
  // The first tile is clear and the rest are held — only while Premium
  // is off. With Premium all three are clear.
  assert.match(block, /const held = routine\.locked && i > 0;/, 'the first example is always clear');
  assert.match(block, /blurRadius=\{held \? BLUR : 0\}/, 'the held examples are the blurred ones');
});

test('routine examples: the captions describe a photograph, never an effect', () => {
  const block = source(ROUTINE_BLOCK);
  const copy = /const EXAMPLE_COPY = \{([\s\S]*?)\} as const;/.exec(block);
  assert.ok(copy, 'the example captions live in one object the sweep can read');
  const lines = [...copy[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
  assert.ok(lines.includes('Example: a gentle shampoo'), 'the clear tile says it is an example');
  assert.ok(
    lines.includes('Examples. Add your own by scanning a barcode'),
    'with Premium the caption names the photographs as examples and says how a real bottle gets there',
  );
  /*
    The word "example" survives the unlock.

    Premium clears the blur from all three tiles, and the caption used to
    become "Add products by scanning a barcode" — three unbranded bottles
    on a shelf card, nothing on screen calling them examples, for somebody
    who has scanned nothing. Every caption drawn over these photographs
    now says what they are, and so does every label a screen reader hears
    for them, blurred or clear.
  */
  assert.equal(lines.length, 4, 'four strings in EXAMPLE_COPY: two captions, two spoken suffixes');
  for (const line of lines) {
    assert.match(line, /example/i, `an example tile's words must say so: "${line}"`);
  }
  assertNoHairClaims(assert, lines, 'the routine examples');
  for (const line of lines) {
    // A photograph of a bottle is not a recommendation, and a caption
    // that said a product worked would be the app having an opinion
    // about what is inside one. It has none.
    assert.ok(
      !/works|helps|repairs|strengthens|treats|recommend|best for|good for/i.test(line),
      `the routine examples must not claim a product does anything: "${line}"`,
    );
  }
});
