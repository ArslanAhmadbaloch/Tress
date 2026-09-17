/**
 * The onboarding script's last step: the invitation into the Hair Scan.
 *
 * The baseline is one continuous scan, and every word before the camera
 * — the invitation, the what-it-does beats, the example journeys, the
 * profile report — must describe that scan rather than the five-angle
 * capture it replaced. The old flow's language is swept here, alongside
 * the claims no copy in the app may make.
 *
 * The invitation itself is held to two shapes: the headline carries the
 * person's name when there is one and stands on its own when there is
 * not, and the three cards pinned to the photograph are labels of what
 * they chose, never findings about them.
 *
 * The hero's geometry is checked here too, because it failed once by
 * arithmetic: a ring on a temple sat under the card meant to point at
 * it. Every ring must sit clear of every card, every line must be long
 * enough to read as a line, no line may pass under another card and no
 * two lines may cross — at every width the app runs on, whatever the
 * cards' heights.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { caseStudies } from '@/features/onboarding/case-studies';
import { HELP_BEATS, HELP_FIGURES, HELP_TITLE } from '@/features/onboarding/how-it-helps';
import { buildProfileReport } from '@/features/onboarding/profile-report';
import {
  COPY,
  INVITE_CARD_PAD,
  INVITE_HERO_PLANS,
  INVITE_PILLS,
  areaChoiceLabel,
  funnelContent,
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
import { HAIR_GOAL_LABELS } from '@/types/domain';

import { assertHonest } from './honesty-words';

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
