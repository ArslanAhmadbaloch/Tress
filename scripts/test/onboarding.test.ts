/**
 * The onboarding funnel: its order, its questions, and its last step.
 *
 * The funnel runs in the reference app's rhythm — welcome, the mascot,
 * a name, the questions with one beat of encouragement among them, the
 * notifications ask, and the invitation into the Hair Scan. The order is
 * pinned here, and so is the shape of every question: the word the
 * bubble colours is a word the title has, a pill row is label only, a
 * row has its icon, a multi question has a way past, and every answer
 * lands on the field it names and reads back as the choice that was
 * made. That last one is the funnel's resume mechanism, so it is walked
 * end to end below.
 *
 * The words are swept the way every sentence in the app is swept. The
 * questions ask what the person knows about themselves and promise
 * nothing; the options are the labels of choices; the mascot is the one
 * voice allowed to say "I", and it may not claim to know anything.
 *
 * The baseline is one continuous scan, and every word before the camera
 * must describe that scan rather than the five-angle capture it
 * replaced. The invitation is held to two shapes: the headline carries
 * the person's name when there is one and stands on its own when there
 * is not, and the three cards pinned to the photograph are labels of
 * what they chose, never findings about them. The hero's geometry is
 * checked here too, because it failed once by arithmetic: every ring
 * must sit clear of every card, every line must be long enough to read
 * as a line, no line may pass under another card and no two lines may
 * cross — at every width the app runs on, whatever the cards' heights.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { greet, splitAccent } from '@/components/onboarding/kit/copy';
import { caseStudies } from '@/features/onboarding/case-studies';
import { HELP_BEATS, HELP_FIGURES, HELP_TITLE } from '@/features/onboarding/how-it-helps';
import { buildProfileReport } from '@/features/onboarding/profile-report';
import {
  FUNNEL_STEPS,
  QUESTIONS,
  SELECT_SETTLE_MS,
  answerOf,
  answerPatch,
  funnelSteps,
  optionsOf,
  profileName,
  resumeIndex,
  toggleChoice,
  type FunnelStep,
  type Question,
} from '@/features/onboarding/questions';
import {
  COPY,
  INVITE_CARD_PAD,
  INVITE_HERO_PLANS,
  INVITE_PILLS,
  areaChoiceLabel,
  funnelContent,
  interstitialTitle,
  inviteCallouts,
  inviteCardRect,
  inviteExitPoint,
  inviteGeometry,
  inviteHeadline,
  type InviteAnchor,
  type InviteGeometry,
  type InvitePoint,
  type InviteRect,
} from '@/features/onboarding/script';
import {
  EMPTY_DATA,
  HAIR_GOAL_LABELS,
  INGREDIENT_REACTION_LABELS,
  withAnswer,
  type AppData,
  type Gender,
} from '@/types/domain';

import { ADVICE, FLATTERY, HAIR_CLAIMS, URGENCY, assertHonest } from './honesty-words';

const OLD_FLOW = /\bfive\b|5[- ]angles?|photo sets?|set of photos|one at a time|hold still for each/i;

/* ------------------------------ the invitation --------------------------- */

test('onboarding: the invitation names the scan, the button says what it does, and there is a way past', () => {
  const copy = COPY.baseline.scan;
  const text = `${copy.title} ${copy.body} ${copy.cta} ${copy.notNow}`;
  assert.match(copy.title, /Hair Scan/, 'the headline names the scan');
  assert.equal(copy.cta, 'Scan my hair', 'the button says what the tap does');
  assert.equal(copy.notNow, 'Not now', 'the funnel can be finished without the baseline');
  assert.ok(!OLD_FLOW.test(text), `the invitation still describes the per-angle capture: "${text}"`);
  assert.match(copy.body, /stays? on your phone/i, 'the body says where the images stay');
  assert.match(copy.body, /beside the last one/i, 'the body is about keeping a record over time');
  // The one limitation said before the camera: a phone held in front of
  // you does not see the back of your head. Not "look back" — the head.
  assert.match(copy.body, /back of your head/i, 'the body says what one turn does not reach');
  assert.match(copy.body, /front, both sides and the top/, 'the body says what one turn does reach');
  assertHonest(assert, [copy.title, copy.body, copy.cta, copy.notNow], 'baseline.scan');
});

test('onboarding: the invitation has one description of the scan', () => {
  // The walk and the one-photograph fallback were words for mechanisms the
  // button no longer opens. Copy nothing reads is copy nobody sweeps, so
  // the step keeps exactly the one description the funnel screen shows.
  assert.deepEqual(Object.keys(COPY.baseline), ['scan']);
});

test('onboarding: the headline carries the name when there is one, and stands alone when there is not', () => {
  assert.equal(inviteHeadline('Sam'), 'Sam, let’s look at your hair with the Hair Scan.');
  assert.equal(inviteHeadline('  Amara  '), 'Amara, let’s look at your hair with the Hair Scan.');
  assert.equal(inviteHeadline(''), 'Let’s look at your hair with the Hair Scan.');
  assert.equal(inviteHeadline('   '), 'Let’s look at your hair with the Hair Scan.');
  assertHonest(assert, [inviteHeadline('Sam'), inviteHeadline('')], 'invite headline');
});

/* ------------------------------- the callouts ---------------------------- */

test('onboarding: the callouts are the labels of what they chose, each with the question it answers', () => {
  const cards = inviteCallouts({
    gender: 'male',
    goals: ['fullness'],
    areas: ['hairline', 'crown'],
    noticed: 'halfYear',
    approaches: ['topical', 'supplements'],
  });

  assert.deepEqual(
    cards.map((c) => [c.id, c.title, c.pill]),
    [
      ['focus', 'Hairline', 'Your focus'],
      ['noticed', '6–12 months ago', 'When you noticed'],
      ['tried', 'Topical treatments', 'What you’ve tried'],
    ],
  );
  // Three cards, three points on the head, no two sharing one.
  assert.deepEqual(new Set(cards.map((c) => c.anchor)).size, 3);
  assert.equal(cards.find((c) => c.id === 'focus')?.anchor, 'hairline');
});

test('onboarding: the focus card is pinned where they said they look', () => {
  const at = (areas: Parameters<typeof inviteCallouts>[0]['areas']) =>
    inviteCallouts({ gender: 'male', goals: [], areas, noticed: 'recently', approaches: ['nothing'] }).find(
      (c) => c.id === 'focus',
    )?.anchor;

  assert.equal(at(['crown']), 'crown');
  assert.equal(at(['widerPart']), 'crown');
  assert.equal(at(['edges']), 'temple');
  assert.equal(at(['hairline']), 'hairline');
  assert.equal(at(['shedding']), 'hairline');
});

test('onboarding: a missing answer drops its card rather than inventing one', () => {
  // The area step was skipped: the focus falls back to the first goal
  // they are sure about, and "not sure yet" is not a focus.
  const fromGoal = inviteCallouts({
    gender: 'male',
    goals: ['unsure', 'shedding'],
    areas: [],
    noticed: 'recently',
    approaches: ['nothing'],
  });
  assert.equal(fromGoal.find((c) => c.id === 'focus')?.title, 'Less shedding');

  const nothing = inviteCallouts({ gender: 'male', goals: ['unsure'], areas: [], noticed: null, approaches: [] });
  assert.deepEqual(nothing, []);

  const one = inviteCallouts({ gender: 'male', goals: [], areas: [], noticed: 'longer', approaches: [] });
  assert.deepEqual(one.map((c) => [c.id, c.title]), [['noticed', 'More than 2 years ago']]);
});

test('onboarding: a shrug is not pinned to the head', () => {
  // "I'm not sure" is not a time and "I'm still figuring it out" is not
  // a thing tried, any more than "not sure yet" is a focus. A card the
  // funnel would pin to a point on the head has to name something.
  const shrugs = inviteCallouts({
    gender: 'male',
    goals: ['unsure'],
    areas: [],
    noticed: 'unsure',
    approaches: ['figuring'],
  });
  assert.deepEqual(shrugs, []);

  // A shrug ahead of a real answer does not hide the real one.
  const behind = inviteCallouts({
    gender: 'male',
    goals: [],
    areas: ['crown'],
    noticed: 'unsure',
    approaches: ['figuring', 'haircare'],
  });
  assert.deepEqual(
    behind.map((c) => [c.id, c.title]),
    [
      ['focus', 'Crown'],
      ['tried', 'Hair-care routine'],
    ],
  );

  // One reachable set of titles through the sweep: the sweep bans words
  // some funnel labels carry ("thinning"), and those are the person's
  // own words read back, so the sweep is not run over every label —
  // the test below holds each title to the funnel's label instead.
  const every = inviteCallouts({
    gender: 'male',
    goals: ['hairline'],
    areas: ['edges'],
    noticed: 'months',
    approaches: ['clinic'],
  });
  assertHonest(assert, every.map((c) => c.title), 'invite titles');
});

test('onboarding: every reachable focus title is the label the funnel showed, and "Something else" is not pinned', () => {
  for (const gender of ['male', 'female'] as const) {
    for (const choice of funnelContent(gender).areas) {
      const focus = inviteCallouts({
        gender,
        goals: [],
        areas: [choice.value],
        noticed: null,
        approaches: [],
      }).find((c) => c.id === 'focus');
      if (choice.value === 'generalChanges') {
        assert.equal(focus, undefined, `${gender}: "${choice.label}" is not a place on the head`);
      } else {
        assert.equal(focus?.title, choice.label, `${gender} ${choice.value}: the card quotes the funnel`);
        assert.equal(areaChoiceLabel(gender, choice.value), choice.label);
      }
    }
  }
  // "Something else" ahead of a real area does not hide the real one, and
  // on its own the focus falls back to the goal.
  const behind = inviteCallouts({ gender: 'female', goals: [], areas: ['generalChanges', 'edges'], noticed: null, approaches: [] });
  assert.equal(behind.find((c) => c.id === 'focus')?.title, 'My edges or temples');
  const alone = inviteCallouts({ gender: 'male', goals: ['hairline'], areas: ['generalChanges'], noticed: null, approaches: [] });
  assert.equal(alone.find((c) => c.id === 'focus')?.title, HAIR_GOAL_LABELS.hairline);
});

test('onboarding: the pills name questions, never findings', () => {
  for (const pill of Object.values(INVITE_PILLS)) {
    assert.ok(!/confirm|found|detect|shows?|looks?/i.test(pill), `"${pill}" reads as a finding`);
  }
  assertHonest(assert, Object.values(INVITE_PILLS), 'invite pills');
});

/* -------------------------------- the hero ------------------------------- */

/** Content widths: an iPhone SE, a 6.1" and a 6.7" phone, less the funnel's 20pt margins. */
const CONTENT_WIDTHS = [335, 353, 390];
/**
 * A card with a one- or two-line title: 24 of padding, 23 a line, 8 of
 * gap, 25 of pill. Two lines is the most any label the funnel can put
 * on a card takes — the card is sized to its longest word — so this is
 * the range the strict checks cover; a three-line card, which nothing
 * reachable produces, still keeps every ring uncovered (checked below).
 */
const CARD_HEIGHTS = [80, 103];
const TALL_CARD = 126;
/** The ring's radius, plus a hair of clearance. */
const RING_CLEAR = 7 + 2;
/** A line shorter than this is a dot with a tail, not a pointer. */
const MIN_LINE = 24;

const ANCHORS: InviteAnchor[] = ['hairline', 'temple', 'crown'];

function inflated(rect: InviteRect, by: number): InviteRect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

function contains(rect: InviteRect, p: InvitePoint): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
}

/** Whether the segment a–b enters the rectangle (Liang–Barsky). */
function crossesRect(a: InvitePoint, b: InvitePoint, rect: InviteRect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.width - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

function cross(o: InvitePoint, a: InvitePoint, b: InvitePoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsCross(a: InvitePoint, b: InvitePoint, c: InvitePoint, d: InvitePoint): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** The visible line: from where it leaves the card to the ring's edge. */
function visibleLine(from: InvitePoint, to: InvitePoint): { a: InvitePoint; b: InvitePoint; length: number } {
  const full = Math.hypot(to.x - from.x, to.y - from.y);
  const length = full - RING_CLEAR;
  const k = length / full;
  return { a: from, b: { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }, length };
}

/** Every way three cards can wrap: each independently one or two lines tall. */
function heightCombinations(heights = CARD_HEIGHTS): Record<InviteAnchor, number>[] {
  const out: Record<InviteAnchor, number>[] = [];
  for (const hairline of heights)
    for (const temple of heights)
      for (const crown of heights) out.push({ hairline, temple, crown });
  return out;
}

function layoutFor(geometry: InviteGeometry, plan: (typeof INVITE_HERO_PLANS)['male'], heights: Record<InviteAnchor, number>) {
  return ANCHORS.map((anchor) => {
    const card = inviteCardRect(geometry, plan.slots[anchor], heights[anchor]);
    const ring = geometry.point(plan.anchors[anchor]);
    const line = visibleLine(inviteExitPoint(card, ring), ring);
    return { anchor, card, ring, line };
  });
}

test('onboarding hero: every ring is on the photograph, and the cards take three bands on two sides', () => {
  for (const [gender, plan] of Object.entries(INVITE_HERO_PLANS)) {
    for (const anchor of ANCHORS) {
      const p = plan.anchors[anchor];
      assert.ok(p.x > 0.05 && p.x < 0.95 && p.y > 0.05 && p.y < 0.95, `${gender} ${anchor} is on the photograph`);
    }
    assert.deepEqual(new Set(ANCHORS.map((a) => plan.slots[a].band)).size, 3, `${gender}: one card a band`);
    assert.deepEqual(new Set(ANCHORS.map((a) => plan.slots[a].side)).size, 2, `${gender}: cards on both sides`);
  }
});

test('onboarding hero: the portrait pins keep to the hair, never the face', () => {
  // angle-portrait.jpg is a whole face: the hairline runs at about y 0.26
  // across the middle, the eyes sit at y 0.45 and the cheeks below them.
  // The front view's pins on this photograph ringed an eye and a cheek,
  // which is what this guards: every pin sits above the hairline, or out
  // at the side of the head where the hair still is.
  for (const anchor of ANCHORS) {
    const p = INVITE_HERO_PLANS.portrait.anchors[anchor];
    const aboveHairline = p.y <= 0.28;
    const sideHair = (p.x <= 0.3 || p.x >= 0.7) && p.y <= 0.42;
    assert.ok(aboveHairline || sideHair, `portrait ${anchor} (${p.x}, ${p.y}) lands on the face`);
  }
  // And the three plans are three: the portrait does not borrow the front view's pins.
  assert.notDeepEqual(INVITE_HERO_PLANS.portrait.anchors, INVITE_HERO_PLANS.male.anchors);
});

test('onboarding hero: the female pins keep to the hair, never the hand', () => {
  // In female-angle-front.jpg a hand holds the hair back at the left: the
  // fingers reach x 0.28–0.39 for y 0.17–0.36, and the palm covers the
  // left edge below that. Nothing points at it.
  for (const anchor of ANCHORS) {
    const p = INVITE_HERO_PLANS.female.anchors[anchor];
    const onFingers = p.x < 0.42 && p.y > 0.14 && p.y < 0.4;
    const onPalm = p.x < 0.3 && p.y >= 0.4;
    assert.ok(!onFingers && !onPalm, `female ${anchor} (${p.x}, ${p.y}) lands on the hand`);
  }
});

test('onboarding hero: the photograph outweighs the cards, and a card never breaks its longest word', () => {
  // The reference's face is the subject and the cards are notes pinned to
  // it. "Dermatologist" is 112pt in the card's type, plus the padding.
  for (const width of CONTENT_WIDTHS) {
    const geometry = inviteGeometry(width);
    assert.ok(geometry.photo.width > geometry.cardWidth * 1.4, `${width}: the cards outweigh the photograph`);
    assert.ok(geometry.cardWidth >= 112 + INVITE_CARD_PAD * 2, `${width}: a card is too narrow for "Dermatologist"`);
    // A card still overhangs the photograph, so it reads as pinned to it.
    assert.ok(geometry.cardWidth > geometry.photo.x + 24, `${width}: the cards sit beside the photograph, not on it`);
  }
});

test('onboarding hero: at every width, every ring sits clear of every card and every line can be read', () => {
  for (const width of CONTENT_WIDTHS) {
    const geometry = inviteGeometry(width);
    assert.ok(geometry.photo.x >= 0 && geometry.photo.width <= width, `${width}: the photograph fits`);
    for (const [gender, plan] of Object.entries(INVITE_HERO_PLANS)) {
      for (const heights of heightCombinations()) {
        const layout = layoutFor(geometry, plan, heights);
        const label = `${gender} at ${width} with heights ${JSON.stringify(heights)}`;

        for (const { anchor, ring, line } of layout) {
          // The ring is on the photograph, not on the ground beside it.
          assert.ok(contains(geometry.photo, ring), `${label}: ${anchor} ring is off the photograph`);
          // The ring sits clear of every card, including its own.
          for (const other of layout) {
            assert.ok(
              !contains(inflated(other.card, RING_CLEAR), ring),
              `${label}: the ${anchor} ring is under the ${other.anchor} card`,
            );
          }
          // The line is long enough to read as a pointer.
          assert.ok(line.length >= MIN_LINE, `${label}: the ${anchor} line is ${Math.round(line.length)}pt`);
          // The line does not pass under any other card.
          for (const other of layout) {
            if (other.anchor === anchor) continue;
            assert.ok(
              !crossesRect(line.a, line.b, other.card),
              `${label}: the ${anchor} line passes under the ${other.anchor} card`,
            );
          }
        }

        // No two lines cross.
        for (let i = 0; i < layout.length; i += 1) {
          for (let j = i + 1; j < layout.length; j += 1) {
            assert.ok(
              !segmentsCross(layout[i].line.a, layout[i].line.b, layout[j].line.a, layout[j].line.b),
              `${label}: the ${layout[i].anchor} and ${layout[j].anchor} lines cross`,
            );
          }
        }

        // Cards on the same side do not overlap.
        for (let i = 0; i < layout.length; i += 1) {
          for (let j = i + 1; j < layout.length; j += 1) {
            const a = layout[i].card;
            const b = layout[j].card;
            if (a.x !== b.x) continue;
            const apart = a.y + a.height <= b.y || b.y + b.height <= a.y;
            assert.ok(apart, `${label}: the ${layout[i].anchor} and ${layout[j].anchor} cards overlap`);
          }
        }
      }
    }
  }
});

test('onboarding hero: even a card taller than any label makes still leaves every ring uncovered', () => {
  for (const width of CONTENT_WIDTHS) {
    const geometry = inviteGeometry(width);
    for (const [gender, plan] of Object.entries(INVITE_HERO_PLANS)) {
      for (const heights of heightCombinations([...CARD_HEIGHTS, TALL_CARD])) {
        const layout = layoutFor(geometry, plan, heights);
        for (const { anchor, ring } of layout) {
          for (const other of layout) {
            assert.ok(
              !contains(inflated(other.card, 7), ring),
              `${gender} at ${width} with heights ${JSON.stringify(heights)}: the ${anchor} ring is under the ${other.anchor} card`,
            );
          }
        }
      }
    }
  }
});

/* ------------------------- the rest of the funnel ------------------------ */

test('onboarding: what the app does is described as one scan, not five photographs', () => {
  const lines = [HELP_TITLE, ...HELP_BEATS.flatMap((b) => [b.title, b.body])];
  for (const line of lines) {
    assert.ok(!OLD_FLOW.test(line), `"${line}" still describes the per-angle capture`);
  }
  assert.match(HELP_BEATS[0].title, /scan/i, 'the first beat is the scan');
  assert.match(HELP_BEATS[0].body, /front, both sides and the top/);
  // Nothing in the scanner lines a scan up with the previous one — there
  // is no guide or overlay from an earlier session — so the beat may not
  // say so. What it may say is that each view is labelled and paired.
  assert.ok(
    !/lined? up|align|last time|same spot|same place/i.test(HELP_BEATS[0].body),
    `"${HELP_BEATS[0].body}" claims an alignment the scanner does not do`,
  );
  assert.match(HELP_BEATS[0].body, /labelled/, 'the beat says how the views are kept');
  assert.match(HELP_BEATS[2].title, /every scan/i, 'the journal line sits beside a scan');

  for (const figure of HELP_FIGURES) {
    assert.ok(!OLD_FLOW.test(figure.label), `"${figure.label}" counts the old angles`);
    assert.ok(!/%|percent/.test(figure.value), 'no invented outcome figure');
  }
  assert.deepEqual(HELP_FIGURES[0], { value: '1', label: 'Scan an update' });
  assertHonest(assert, lines, 'how it helps');
});

test('onboarding: the example journeys are about scans, and the counts are of what the person did', () => {
  for (const study of [...caseStudies('male'), ...caseStudies('female')]) {
    for (const line of [study.headline, study.story, ...study.stats.map((s) => s.label)]) {
      assert.ok(!OLD_FLOW.test(line), `${study.id}: "${line}" still describes the per-angle capture`);
    }
    assert.match(study.story, /scan/i, `${study.id}'s habit is the scan`);
    assert.ok(
      study.stats.some((s) => s.label === 'Scans'),
      `${study.id} counts scans taken`,
    );
    assertHonest(assert, [study.headline, study.story], study.id);
  }
});

test('onboarding: the profile report describes the scan, not the old photo sets', () => {
  const variants = [
    { areas: ['hairline' as const], intervalDays: 30 },
    { areas: ['crown' as const, 'edges' as const], intervalDays: 14 },
    { areas: [] as never[], intervalDays: 7 },
  ];
  for (const v of variants) {
    const report = buildProfileReport({
      name: 'Sam',
      noticed: 'halfYear',
      preoccupation: 3,
      approaches: ['topical'],
      medications: [],
      consistency: 'mostly',
      goals: ['fullness'],
      ...v,
    });
    for (const line of [report.title, report.closing, ...report.cards.flatMap((c) => [c.echo, c.meaning])]) {
      assert.ok(!OLD_FLOW.test(line), `"${line}" still describes the per-angle capture`);
    }
    const watching = report.cards.find((c) => c.id === 'watching');
    if (v.areas.length > 0) {
      assert.match(watching?.meaning ?? '', /front, both sides and the top/);
    }
  }
});

/* ------------------------------ the funnel ------------------------------ */

const FRESH = { profileId: 'prof_test', journeyId: 'jrn_test', now: '2026-09-17T09:41:00.000Z' };

const ids = (steps: FunnelStep[]) => steps.map((s) => s.id);
const indexOf = (steps: FunnelStep[], id: FunnelStep['id']) => ids(steps).indexOf(id);
const questionSteps = (steps: FunnelStep[]) =>
  steps.filter((s): s is Extract<FunnelStep, { kind: 'question' }> => s.kind === 'question');

/** Both wordings of every question's options. */
const everyOption = (q: Question) =>
  (['male', 'female'] as Gender[]).flatMap((g) => optionsOf(q, g));

/**
 * The sweep for a choice the person makes: the words are theirs, so the
 * first-person ban does not apply, but nothing they can tick may claim,
 * flatter, advise, hurry or shout. "Nothing right now" is the one
 * choice that shares words with a nudge — it is an answer, not a push —
 * so that phrase alone is lifted from the urgency check here.
 */
const CHOICE_URGENCY = new RegExp(URGENCY.source.replace('|right now', ''), 'i');

function assertHonestChoices(sentences: string[], context: string): void {
  const text = sentences.join(' ');
  const lower = text.toLowerCase();
  for (const w of [...HAIR_CLAIMS, ...FLATTERY, ...ADVICE]) {
    assert.ok(!lower.includes(w), `${context} must not say "${w}"`);
  }
  assert.ok(!CHOICE_URGENCY.test(text), `${context} hurries somebody: ${text}`);
  assert.ok(!text.includes('!'), `${context} must not exclaim`);
}

/**
 * The sweep for the mascot's own lines. It is the one voice allowed to
 * say "I", so that clause of the persona check is lifted — and only
 * that clause: it may still not think, know, read or promise anything,
 * may not call itself an AI, and may not claim any expertise at all.
 * Typographic apostrophes are normalised first so the lift is explicit
 * rather than an accident of punctuation.
 */
function assertMascotVoice(sentences: string[], context: string): void {
  const text = sentences.join(' ').replace(/’/g, "'");
  const lower = text.toLowerCase();
  for (const w of [...HAIR_CLAIMS, ...FLATTERY, ...ADVICE]) {
    assert.ok(!lower.includes(w), `${context} must not say "${w}"`);
  }
  assert.ok(!URGENCY.test(text), `${context} hurries somebody: ${text}`);
  assert.ok(!text.includes('!'), `${context} must not exclaim`);
  assert.ok(
    !/\b(AI|assistant|bot)\b|\bI (think|believe|can|cannot|would|read|am|will|know)\b/.test(text),
    `${context} claims a mind: ${text}`,
  );
  assert.ok(
    !/expert|dermatolog|scien|clinic|trust|analy|diagnos|result/i.test(text),
    `${context} claims expertise: ${text}`,
  );
}

test('funnel: the steps run in the reference order, with no progress bar to count against', () => {
  assert.deepEqual(ids(FUNNEL_STEPS), [
    'welcome',
    'intro',
    'name',
    'age',
    'gender',
    'hairType',
    'scalpType',
    'scalpSensitivity',
    'interstitial',
    'goal',
    'concerns',
    'noticed',
    'approaches',
    'medications',
    'budget',
    'productFactors',
    'ingredientReactions',
    'scalpConditions',
    'lifeFactors',
    'heatStyling',
    'notifications',
    'invite',
  ]);
  // The beat sits where the reference puts its own: after the sensitivity question.
  assert.equal(indexOf(FUNNEL_STEPS, 'interstitial'), indexOf(FUNNEL_STEPS, 'scalpSensitivity') + 1);
  assert.equal(FUNNEL_STEPS[FUNNEL_STEPS.length - 1].id, 'invite', 'the scan invitation is the last page');
  assert.equal(FUNNEL_STEPS[FUNNEL_STEPS.length - 2].id, 'notifications');
  assert.equal(FUNNEL_STEPS[0].id, 'welcome');
  // Every question the funnel has is on the walk, once.
  assert.deepEqual(
    questionSteps(FUNNEL_STEPS).map((s) => s.id),
    QUESTIONS.map((q) => q.id),
  );
});

test('funnel: the medication question is only asked of somebody it is worth asking, and reminders once', () => {
  const asked = (approaches: never[] | string[]) =>
    ids(funnelSteps({ approaches: approaches as never }, { askReminders: true }));
  assert.ok(!asked([]).includes('medications'), 'nothing tried yet: no list of drugs');
  assert.ok(!asked(['nothing', 'figuring']).includes('medications'));
  assert.ok(asked(['topical']).includes('medications'));
  assert.ok(asked(['clinic']).includes('medications'));
  assert.ok(!ids(funnelSteps(null, { askReminders: false })).includes('notifications'));
  assert.ok(ids(funnelSteps(null, { askReminders: true })).includes('notifications'));
});

test('funnel: every question has the word its bubble colours, the shape its options take, and a way past', () => {
  for (const q of QUESTIONS) {
    const parts = splitAccent(q.title, q.accent);
    assert.ok(parts, `${q.id}: "${q.accent}" is not a word of "${q.title}"`);
    assert.equal(parts.before + parts.word + parts.after, q.title);

    for (const gender of ['male', 'female'] as Gender[]) {
      const options = optionsOf(q, gender);
      assert.ok(options.length >= 2, `${q.id} offers a choice`);
      assert.equal(new Set(options.map((o) => o.value)).size, options.length, `${q.id}: one value each`);
      switch (q.kind) {
        case 'pill':
          for (const o of options) {
            assert.equal(o.icon, undefined, `${q.id}: a pill row is label only`);
            assert.equal(o.description, undefined, `${q.id}: a pill row is label only`);
          }
          break;
        case 'row':
        case 'checkRows':
          for (const o of options) assert.ok(o.icon, `${q.id}: "${o.label}" needs its outline icon`);
          break;
        case 'cards':
          for (const o of options) assert.ok(o.icon, `${q.id}: "${o.label}" needs its icon`);
          break;
        case 'textCards':
          for (const o of options) assert.equal(o.icon, undefined, `${q.id}: text cards carry no icon`);
          break;
      }
      if (q.exclusive !== undefined) {
        assert.ok(options.some((o) => o.value === q.exclusive), `${q.id}: the exclusive choice is on offer`);
      }
      // Only the budget rows carry a coloured disc.
      for (const o of options) {
        assert.equal(o.tint !== undefined, q.id === 'budget', `${q.id}: tint on "${o.label}"`);
      }
    }

    if (q.multi) {
      // The way past is a row of the question's own — the reference's
      // "No, I don't" — never a helper control beneath the bar.
      const escape = q.exclusive !== undefined ||
        everyOption(q).some((o) => ['nothing', 'none', 'noPreference'].includes(o.value));
      assert.ok(escape, `${q.id}: a multi question needs a way past with nothing ticked`);
      if (q.emptyAs !== undefined) {
        assert.equal(q.exclusive, q.emptyAs, `${q.id}: the "none" row clears the rest`);
        assert.ok(!(q.skip), `${q.id}: one way past, not two`);
      }
    } else {
      assert.equal(q.exclusive, undefined, `${q.id}: a single choice has nothing to be exclusive of`);
      assert.equal(q.emptyAs, undefined, `${q.id}: a single choice advances on its own`);
      assert.equal(q.skip, undefined, `${q.id}: a single choice advances on its own`);
    }
  }
  // Only the one question that asks for medical information may be withheld.
  assert.deepEqual(QUESTIONS.filter((q) => q.skip).map((q) => q.id), ['medications']);
  // The concerns page is the reference's: full-width rows with a check, and a "nothing else" row of its own.
  assert.deepEqual(QUESTIONS.filter((q) => q.emptyAs).map((q) => q.id), ['concerns']);
  assert.equal(QUESTIONS.find((q) => q.id === 'concerns')?.kind, 'checkRows');
  assert.ok(SELECT_SETTLE_MS >= 120 && SELECT_SETTLE_MS <= 300, 'the chosen row shows before the page moves');
});

test('funnel: every answer lands on the field it names and reads back as the choice made', () => {
  for (const q of QUESTIONS) {
    for (const gender of ['male', 'female'] as Gender[]) {
      const options = optionsOf(q, gender).filter((o) => o.value !== q.exclusive);
      const values = q.multi ? options.slice(0, 2).map((o) => o.value) : [options[0].value];
      const data = withAnswer(EMPTY_DATA, answerPatch(q, values), FRESH);
      assert.deepEqual(answerOf(q, data), values, `${q.id} (${gender}) round-trips`);

      // The record is created by the first answer, and not completed by it.
      assert.ok(data.journey && data.profile);
      assert.equal(data.onboardingCompletedAt, null);
    }
    assert.equal(answerOf(q, EMPTY_DATA), null, `${q.id} reads as unanswered on an empty record`);
  }

  // The main goal is one choice that every reader finds under `goals`.
  const goal = QUESTIONS.find((q) => q.id === 'goal');
  assert.ok(goal);
  const withGoal = withAnswer(EMPTY_DATA, answerPatch(goal, ['shedding']), FRESH);
  assert.deepEqual(withGoal.journey?.goals, ['shedding']);

  // "Nothing else" is a row the record has no word for: it is written as
  // an empty list, which is an answer, not a gap, and reads back as the row.
  const concerns = QUESTIONS.find((q) => q.id === 'concerns');
  assert.ok(concerns);
  const nothingElse = withAnswer(EMPTY_DATA, answerPatch(concerns, ['none']), FRESH);
  assert.deepEqual(nothingElse.journey?.concerns, []);
  assert.deepEqual(answerOf(concerns, nothingElse), ['none']);
  assert.deepEqual(toggleChoice(['shedding', 'frizz'], 'none', 'none'), ['none']);
  assert.deepEqual(toggleChoice(['none'], 'frizz', 'none'), ['frizz']);

  // A withheld medication answer is on record as withheld: answered, nothing chosen.
  const medications = QUESTIONS.find((q) => q.id === 'medications');
  assert.ok(medications);
  assert.deepEqual(answerOf(medications, withAnswer(EMPTY_DATA, answerPatch(medications, []), FRESH)), []);
  // Where no such row exists, an empty list is the store's default and reads as unanswered.
  const approaches = QUESTIONS.find((q) => q.id === 'approaches');
  assert.ok(approaches);
  assert.equal(answerOf(approaches, withAnswer(EMPTY_DATA, { journey: { approaches: [] } }, FRESH)), null);

  // A value the app never offered is dropped where it is written.
  const hairType = QUESTIONS.find((q) => q.id === 'hairType');
  assert.ok(hairType);
  assert.equal(answerOf(hairType, withAnswer(EMPTY_DATA, answerPatch(hairType, ['spiky']), FRESH)), null);
});

test('funnel: ticking the exclusive choice clears the rest, and the rest clear it', () => {
  assert.deepEqual(toggleChoice([], 'a'), ['a']);
  assert.deepEqual(toggleChoice(['a'], 'a'), []);
  assert.deepEqual(toggleChoice(['a'], 'b', 'none'), ['a', 'b']);
  assert.deepEqual(toggleChoice(['a', 'b'], 'none', 'none'), ['none']);
  assert.deepEqual(toggleChoice(['none'], 'a', 'none'), ['a']);
  assert.deepEqual(toggleChoice(['none'], 'none', 'none'), []);
});

test('funnel: a killed app comes back one step past the furthest answer on record', () => {
  const steps = funnelSteps({ approaches: ['topical'] }, { askReminders: true });
  const walk = (through: string, withholding: string[] = []): AppData => {
    let data: AppData = withAnswer(EMPTY_DATA, { profile: { displayName: 'Sam' } }, FRESH);
    for (const step of questionSteps(steps)) {
      // "Prefer not to say" writes an empty answer, as the page does.
      const first = withholding.includes(step.id) ? [] : [optionsOf(step.question, 'female')[0].value];
      data = withAnswer(data, answerPatch(step.question, first), FRESH);
      if (step.id === through) break;
    }
    return data;
  };

  assert.equal(resumeIndex(steps, EMPTY_DATA), 0, 'nothing on record: the welcome page');
  assert.equal(
    resumeIndex(steps, withAnswer(EMPTY_DATA, { profile: { displayName: 'Sam' } }, FRESH)),
    indexOf(steps, 'age'),
    'a name only: the first question',
  );
  assert.equal(resumeIndex(steps, walk('scalpSensitivity')), indexOf(steps, 'interstitial'));
  assert.equal(resumeIndex(steps, walk('approaches')), indexOf(steps, 'medications'));
  // The one question that may be withheld is not asked again on every return —
  // even when it was the last thing answered before the app was killed.
  assert.equal(resumeIndex(steps, walk('medications', ['medications'])), indexOf(steps, 'budget'));
  assert.equal(resumeIndex(steps, walk('budget', ['medications'])), indexOf(steps, 'productFactors'));
  assert.equal(resumeIndex(steps, walk('heatStyling', ['medications'])), indexOf(steps, 'notifications'));
  const quiet = funnelSteps({ approaches: ['topical'] }, { askReminders: false });
  assert.equal(resumeIndex(quiet, walk('heatStyling')), indexOf(quiet, 'invite'));
  assert.equal(resumeIndex(quiet, walk('heatStyling')), quiet.length - 1, 'never past the last page');

  // The store's placeholder is not a name somebody gave.
  assert.equal(profileName({ displayName: 'You' }), '');
  assert.equal(profileName({ displayName: '  Amara ' }), 'Amara');
  assert.equal(profileName(null), '');
  const placeholder = withAnswer(EMPTY_DATA, { journey: { hairType: 'wavy' } }, FRESH);
  assert.equal(placeholder.profile?.displayName, 'You');
  assert.equal(resumeIndex(steps, placeholder), indexOf(steps, 'scalpType'), 'an answer without a name still resumes');
});

test('funnel: the questions ask what the person knows, the options are their words, and nothing promises', () => {
  for (const q of QUESTIONS) {
    assertHonest(assert, [q.title, q.subtitle ?? ''], `question ${q.id}`);
    assert.ok(!/\b(AI|scan|analy|detect|diagnos)\b/i.test(q.title + (q.subtitle ?? '')), `${q.id} asks, it does not read`);
    /*
      The goal lists are the funnel's oldest words — the person's hopes,
      in the words people use for them — and they are held by
      selectors.test.ts to the rules they were written under. Every
      other option is swept here.
    */
    if (q.id === 'goal') continue;
    assertHonestChoices(
      everyOption(q).flatMap((o) => [o.label, o.description ?? '']),
      `options of ${q.id}`,
    );
  }
});

test('funnel: the budget tiers carry the bracket they mean, and the money is a guide rather than a price', () => {
  /*
    The owner's note after the Phase 4 walk (H.2): four tier names with no
    figures behind them made the page read as though the app were shy
    about money, and a tier nobody can price is not a comparison. So every
    tier now opens with its bracket.

    What the brackets are not: a price the app looked up, a price of
    anything it sells, or a number attached to anybody's hair. They are
    the owner's own guide brackets in US dollars, per product, and this
    test pins each one so a later edit cannot quietly move a boundary or
    open a gap between two tiers.
  */
  const budget = QUESTIONS.find((q) => q.id === 'budget')!;
  const described = new Map(
    optionsOf(budget, 'female').map((o) => [o.value, o.description ?? '']),
  );
  assert.match(described.get('everyday')!, /^Under \$15 a product/);
  assert.match(described.get('midRange')!, /^\$15–40 a product/);
  assert.match(described.get('premium')!, /^\$40–90 a product/);
  assert.match(described.get('luxury')!, /^\$90 and up/);
  for (const [value, description] of described) {
    assert.ok(/\$/.test(description), `${value} names no bracket`);
    /*
      A tier is what somebody spends, never a claim about what the money
      buys. Naming a dearer shelf is allowed — that is what a tier is —
      but saying the bottles on it work is not, because the app has no
      idea whether they do.
    */
    assert.ok(
      !/\b(works?|effective|stronger|results?|proven|clinically)\b/i.test(description),
      `${value} claims an effect: "${description}"`,
    );
  }
  // The tiers themselves stay the record's own words.
  assert.deepEqual(
    optionsOf(budget, 'male').map((o) => o.label),
    ['Everyday', 'Mid-range', 'Premium', 'Luxury'],
  );
});

test('funnel: the fragrance row leads with the word people use and keeps the one printed on the bottle', () => {
  /*
    H.3: "parfum" is the term an ingredient list actually prints — the
    shelf matches on it (src/features/products/shelf.ts) — so it cannot be
    dropped. What it can stop doing is standing beside "fragrance" with a
    slash, leaving the reader to work out they are the same thing.

    And the wording is the LABEL TABLE's, not a funnel override laid over
    it. It was an override for one build, and in that build the report
    quoted "fragrance/parfum" back at somebody who had only ever been
    shown "Fragrance (listed as parfum)" — a quotation of words that were
    never on screen. A funnel answer is echoed as its label, which only
    works while there is one label, so this reads the row against
    INGREDIENT_REACTION_LABELS rather than against a copy of the words.
  */
  const reactions = QUESTIONS.find((q) => q.id === 'ingredientReactions')!;
  const row = optionsOf(reactions, 'female').find((o) => o.value === 'fragrance')!;
  assert.equal(row.label, 'Fragrance (listed as parfum)');
  assert.equal(row.label, INGREDIENT_REACTION_LABELS.fragrance);
  assert.ok(!row.label.includes('/'), 'one word, with the label term behind it');
  assert.ok(
    !/parfum/i.test(row.description ?? ''),
    'the line under it does not say parfum a second time',
  );
});

test('funnel: the pages around the questions keep the same register', () => {
  const { welcome, name, question, notifications, medication } = COPY;
  assertHonest(
    assert,
    [
      welcome.tagline,
      welcome.cta,
      welcome.legal.before,
      welcome.legal.terms,
      welcome.legal.between,
      welcome.legal.privacy,
      name.title,
      name.placeholder,
      name.cta,
      question.cta,
      notifications.title,
      notifications.body,
      notifications.preview.line,
      notifications.preview.date,
      notifications.allow,
      notifications.notNow,
      medication.otherLabel,
      medication.otherPlaceholder,
    ],
    'funnel pages',
  );
  // One honest tagline: what the app is, not what it will do to anybody's hair.
  assert.ok(!/\b(AI|science|trust|result|expert)/i.test(welcome.tagline), `"${welcome.tagline}" oversells`);
  assert.match(welcome.tagline, /record/i);
  // No accounts to sign into: the only thing to bring back is a subscription,
  // and the link says so in the store's own words for it. "Restore" is a word
  // the funnel may not say about hair, and this is the one phrase in which it
  // is not about hair — so the phrase, exactly, and nothing wider.
  assert.equal(welcome.restore, 'Restore purchases');
  assert.equal(question.cta, 'Continue');
  assert.equal(COPY.intro.cta, 'Next', 'the mascot page moves on as the reference does');
  assert.equal(COPY.interstitial.cta, 'Let’s go', 'the beat moves on as the reference does, without the shout');
  assert.equal(notifications.allow, 'Allow notifications', 'the button says what the tap asks');
  assert.equal(notifications.notNow, 'Not now', 'the ask can be declined');
  assert.match(notifications.body, /nudge, not a stream/, 'the promise is one the app can keep');
  assert.ok(!/spam!|promise!/i.test(notifications.body), 'no pinky promise');
  assert.ok(splitAccent(name.title, name.accent), 'the name bubble colours a word it has');
});

test('funnel: the mascot says who it is and keeps a record; it claims no expertise and does not shout', () => {
  const { intro, interstitial } = COPY;
  assertMascotVoice([intro.title, intro.cta], 'mascot intro');
  assertMascotVoice([interstitial.title, interstitial.body, interstitial.cta], 'interstitial');
  assert.match(intro.title, /^Hi, I’m Tress\./, 'it introduces itself by name');
  assert.match(intro.title, /record/, 'and says what it is here for');
  assert.match(interstitial.body, /not here to fix/, 'the beat is support, not a fix');
  assert.match(interstitial.body, /over time/, 'and it is about the record');

  // The headline carries the name, and the comma goes with a missing one.
  assert.equal(interstitialTitle('Sam'), 'Great start, Sam.');
  assert.equal(interstitialTitle('  Amara  '), 'Great start, Amara.');
  assert.equal(interstitialTitle(''), 'Great start.');
  // The kit's greeting reads the same line the same way.
  assert.equal(greet(interstitial.title, 'Sam'), interstitialTitle('Sam'));
  assert.equal(greet(interstitial.title, ''), interstitialTitle(''));
  assert.equal(greet(interstitial.title, undefined), interstitialTitle(''));
});
