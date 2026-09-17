/**
 * The onboarding funnel, as content.
 *
 * Kept apart from the screen that renders it so the whole arc can be read
 * in one place and reordered without touching layout code. The order is
 * the argument: who this is for, what you want, something useful in
 * return, where you are now, a report built from what you said — and
 * then the scan, which is the first thing the app does rather than says.
 *
 * Every question screen is the question and its answers, and nothing
 * else. There used to be a line of helper text under each heading, and
 * the screens stopped rendering it because a question that needs a
 * sentence of explanation is the wrong question. The copy went with it.
 *
 * Two rules run through every line here.
 *
 * Nothing promises an outcome. The app cannot make anybody's hair grow and
 * does not know why theirs is changing, so the goal someone picks is
 * recorded as the thing they hope for and shown back to them in those
 * words. What is promised is what the app actually does: a record, a
 * routine, and the ability to see change that is otherwise too slow to
 * notice.
 *
 * And nothing frightens. "Don't wait until it's too late" would convert
 * some people and would be beneath the product — these are people opening
 * an app because they are already worried. Every screen here is written to
 * be read by someone anxious, and to leave them steadier than it found
 * them.
 */

import { inferRoutineIcon } from '@/features/routine/icons';
import {
  APPROACH_LABELS,
  GENDER_LABELS,
  HAIR_GOAL_LABELS,
  ONSET_LABELS,
  TRACKING_AREA_LABELS,
} from '@/types/domain';
import type {
  Approach,
  Gender,
  HairGoal,
  Medication,
  Motivation,
  Onset,
  RoutineIcon,
  RoutineTimeOfDay,
  SelfConsistency,
  TrackingArea,
  Trigger,
} from '@/types/domain';

export type StepId =
  | 'welcome'
  | 'you'
  | 'meaning'
  | 'goal'
  | 'caseOne'
  | 'story'
  | 'impact'
  | 'caseTwo'
  | 'approach'
  | 'medication'
  | 'products'
  | 'system'
  | 'cadence'
  | 'howItHelps'
  | 'photo'
  | 'card'
  | 'analysing'
  | 'profile'
  | 'baseline';

/** The order people move through. Progress is measured against it. */
export const STEPS: StepId[] = [
  'welcome',
  // Who they are comes first now. It decides which reference photographs
  // and which questions the rest of the funnel uses, and asking a person
  // their name before asking how their hair makes them feel is simply the
  // right order for that conversation.
  'you',
  'meaning',
  'goal',
  // The breaks between question blocks. They used to be explainers;
  // they are now one person's pair each, and then what the app does.
  'caseOne',
  'story',
  'impact',
  'caseTwo',
  'approach',
  'medication',
  'products',
  'system',
  'cadence',
  'howItHelps',
  'photo',
  'card',
  // Nothing is being asked here either — it is a reveal, and a bar that
  // advanced during it would be charging somebody for watching.
  'analysing',
  // The report the analysing beat was building. Their own answers read
  // back to them, one card at a time, before anything is asked for.
  'profile',
  /*
    Straight from the report to the camera. There used to be two more
    screens here — a "your journey is ready" summary and a timeline that
    said you would be glad you started — and both were the report again
    in different clothes. Somebody who has just read where they stand
    does not need to be told it twice more before being allowed to open
    the camera the whole funnel has been leading to.

    It is the last step here, and the last one the funnel owns: the scan
    it opens carries its own screens, and the reading on what it
    photographed is the next thing the person sees.
  */
  'baseline',
];

/**
 * Steps that do not count toward the progress indicator.
 *
 * The two case studies, the what-it-does card and the reveals are not
 * asking anything, and a bar that advances while somebody reads makes
 * reading feel like a cost.
 */
export const UNCOUNTED: StepId[] = [
  'welcome',
  'caseOne',
  'caseTwo',
  'howItHelps',
  'system',
  'card',
  // Nothing is being asked here either — it is a reveal, and a bar that
  // advanced during it would be charging somebody for watching.
  'analysing',
  'profile',
  'baseline',
];

/* ------------------------------- choices ------------------------------- */

export type Choice<T extends string> = {
  value: T;
  label: string;
  /** A word or two under the label, where it earns its place. */
  detail?: string;
  /** The glyph on the left, where the set is better scanned than read. */
  icon?: string;
};

export const MEANING_CHOICES: Choice<Motivation>[] = [
  { value: 'confidence', label: 'Feel more confident' },
  { value: 'myself', label: 'Feel like myself again' },
  { value: 'photos', label: 'Look better in photos' },
  { value: 'worry', label: 'Stop worrying about my hair' },
  { value: 'comfort', label: 'Feel comfortable with my appearance' },
  { value: 'understand', label: "Just understand what's happening" },
  { value: 'other', label: 'Something else' },
];

const MALE_GOALS: Choice<HairGoal>[] = [
  { value: 'fullness', label: 'More fullness' },
  { value: 'hairline', label: 'A stronger-looking hairline' },
  { value: 'crown', label: 'More density at the crown' },
  { value: 'shedding', label: 'Less shedding' },
  { value: 'overall', label: 'Better-looking overall hair' },
  { value: 'routineWorking', label: 'Knowing whether my routine is working' },
  { value: 'unsure', label: "I'm not sure yet" },
];

export const ONSET_CHOICES: Choice<Onset>[] = [
  { value: 'recently', label: 'Recently' },
  { value: 'months', label: 'A few months ago' },
  { value: 'halfYear', label: '6–12 months ago' },
  { value: 'twoYears', label: '1–2 years ago' },
  { value: 'longer', label: 'More than 2 years ago' },
  { value: 'unsure', label: "I'm not sure" },
];

/** "What do you notice most?" — the same areas the app tracks. */
const MALE_AREAS: Choice<TrackingArea>[] = [
  { value: 'hairline', label: 'Hairline' },
  { value: 'crown', label: 'Crown' },
  { value: 'overallThinning', label: 'Overall thinning' },
  { value: 'shedding', label: 'Shedding' },
  { value: 'density', label: 'Hair feels less dense' },
  { value: 'generalChanges', label: 'Something else' },
];

const MALE_TRIGGERS: Choice<Trigger>[] = [
  { value: 'mirror', label: 'Looking in the mirror' },
  { value: 'photos', label: 'Taking photos' },
  { value: 'lighting', label: 'Bright lighting' },
  { value: 'styling', label: 'Styling my hair' },
  { value: 'shower', label: 'Seeing my hair after showering' },
  { value: 'future', label: 'Thinking about the future' },
  { value: 'none', label: "It doesn't really bother me" },
];

export const APPROACH_CHOICES: Choice<Approach>[] = [
  { value: 'topical', label: 'Topical treatments', icon: 'bottle' },
  { value: 'prescription', label: 'Prescription medication', icon: 'pill' },
  { value: 'supplements', label: 'Supplements', icon: 'capsule' },
  { value: 'haircare', label: 'Hair-care routine', icon: 'drop' },
  { value: 'clinic', label: 'Dermatologist or clinic', icon: 'shield' },
  { value: 'transplant', label: 'Hair transplant', icon: 'follicle' },
  { value: 'nothing', label: 'Nothing yet', icon: 'circle' },
  { value: 'figuring', label: "I'm still figuring it out", icon: 'help' },
];

/**
 * The treatments people are most often already using.
 *
 * A checklist, not a menu. Nobody is being offered these — the question is
 * only what is already in their bathroom cabinet, asked so their routine
 * can say "Finasteride" instead of "Prescription medication" and remind
 * them of the real thing. The order is roughly how commonly each comes up,
 * because a list you scan is a list you answer honestly.
 *
 * `covers` is the generic approach this replaces in the stack, so someone
 * who ticked "Topical treatments" and then named minoxidil gets one item
 * rather than two saying the same thing.
 */
const MALE_MEDICATIONS: (Choice<Medication> & { covers?: Approach })[] = [
  { value: 'minoxidilTopical', label: 'Minoxidil (topical)', detail: 'Liquid or foam', icon: 'bottle', covers: 'topical' },
  { value: 'finasterideOral', label: 'Finasteride (oral)', icon: 'pill', covers: 'prescription' },
  { value: 'minoxidilOral', label: 'Minoxidil (oral)', icon: 'pill', covers: 'prescription' },
  { value: 'finasterideTopical', label: 'Finasteride (topical)', icon: 'bottle', covers: 'topical' },
  { value: 'dutasteride', label: 'Dutasteride', icon: 'pill', covers: 'prescription' },
  { value: 'spironolactone', label: 'Spironolactone', icon: 'pill', covers: 'prescription' },
  { value: 'ketoconazole', label: 'Ketoconazole shampoo', icon: 'drop', covers: 'haircare' },
  { value: 'other', label: 'Something else', detail: 'Type it in', icon: 'help' },
  { value: 'none', label: 'Nothing right now', icon: 'circle' },
];

/** Ticking this clears the rest, and the rest clear it. */
export const MEDICATION_EXCLUSIVE: Medication = 'none';

/**
 * Approaches that make the medication question worth asking.
 *
 * Somebody who has just said they are doing nothing yet has answered it
 * already, and putting a list of drugs in front of them reads as a
 * suggestion that they should be on one.
 */
export const ASKS_MEDICATION: Approach[] = [
  'topical',
  'prescription',
  'supplements',
  'haircare',
  'clinic',
];

/**
 * Chooses whose head appears in the examples, and nothing else.
 *
 * Asked plainly rather than dressed up, because the honest reason is
 * mundane: the app has two sets of reference photographs and wants to
 * show the right one. It does not change what is recorded or how any of
 * it is read back.
 */
export const GENDER_CHOICES: Choice<Gender>[] = [
  { value: 'male', label: GENDER_LABELS.male },
  { value: 'female', label: GENDER_LABELS.female },
];

export const CONSISTENCY_CHOICES: Choice<SelfConsistency>[] = [
  { value: 'very', label: 'Very consistent' },
  { value: 'mostly', label: 'Mostly consistent' },
  { value: 'onOff', label: 'On and off' },
  { value: 'forget', label: 'I keep forgetting' },
  { value: 'notStarted', label: "I haven't started" },
];

/** The ones that mean a routine would help more than resolve would. */
export const NEEDS_SYSTEM: SelfConsistency[] = ['onOff', 'forget', 'notStarted'];

export const CADENCE_CHOICES: Choice<string>[] = [
  { value: '7', label: 'Every week' },
  { value: '14', label: 'Every 2 weeks' },
  { value: '30', label: 'Once a month', detail: 'Recommended' },
  { value: '90', label: "I'll decide later" },
];

/* -------------------------------- copy --------------------------------- */

/*
  The register, in one place so it does not drift.

  Questions are short and asked the way a person would ask them. Buttons
  say "Continue" rather than "That's My Goal" or "Build My Routine": a
  button that narrates what you just did is a button trying too hard, and
  eleven of them in a row read as a sales script. The buttons that do say
  something specific — the profile photo, and whichever camera the last
  step opens — say it because the tap actually does that thing, and the
  last step carries one label per camera for exactly that reason.

  No screen tells the person how to feel, and no screen says the app will
  make anything happen to their hair. The one line that comes close, on
  the camera screen, says only what the photograph is for: it is the point
  later photographs are measured against, which is true of any baseline.
*/
/**
 * The invitation into the Hair Scan — the funnel's last page.
 *
 * The screen reads it as `COPY.baseline.scan`, and nothing else describes
 * the step, so the words before the camera cannot drift from it. The
 * title is the no-name form; `inviteHeadline` puts the person's name in
 * front of it. The body is the line under the headline: what one turn
 * gives the camera and what it does not, then the record — a scan set
 * beside the last one — because that is what the app does with the
 * images. It promises nothing about what they will show.
 *
 * `notNow` is the way past. The baseline used to be compulsory, and the
 * cost of that was somebody who could not scan right now could not get
 * in at all. Now the funnel finishes without one and the Home screen
 * carries the same invitation until they take it.
 */
const SCAN_BASELINE = {
  title: 'Let’s look at your hair with the Hair Scan.',
  /*
    Two sentences, and the first is the one limitation worth saying
    before the camera opens: a phone held in front of you cannot see the
    back of your head, and a person who does not hear that here hears it
    first from the report. The second is what the app does with the
    images, and it promises nothing about what they will show.
  */
  body: 'One slow turn gives the camera the front, both sides and the top — not the back of your head. Every scan stays on your phone beside the last one, so months from now you have a record instead of a memory.',
  cta: 'Scan my hair',
  notNow: 'Not now',
} as const;

/**
 * The headline with the person's name in front of it.
 *
 * "Sam, let's look at your hair with the Hair Scan." — the sentence
 * carries on in lower case after the name, and with no name it starts
 * itself. Not `withName`: that slot sits mid-sentence, and a name at the
 * front of a sentence is punctuated differently.
 */
export function inviteHeadline(name: string): string {
  const trimmed = name.trim();
  const title = SCAN_BASELINE.title;
  if (!trimmed) return title;
  return `${trimmed}, ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}

/* ------------------------------ callouts ------------------------------- */

/** Where a callout is pinned on the hero photograph. */
export type InviteAnchor = 'hairline' | 'temple' | 'crown';

export type InviteCallout = {
  id: 'focus' | 'noticed' | 'tried';
  anchor: InviteAnchor;
  /** The label of the choice they made, exactly as the funnel showed it. */
  title: string;
  /** Which question it answers. */
  pill: string;
};

/**
 * The pills under each callout title. They name the question, never a
 * finding: "Your focus" says what they chose to watch, and the scan is
 * what decides whether that region was covered.
 */
export const INVITE_PILLS: Record<InviteCallout['id'], string> = {
  focus: 'Your focus',
  noticed: 'When you noticed',
  tried: 'What you’ve tried',
};

/**
 * Areas that sit on top of the head rather than at the front of it, so
 * the focus card points at the crown of the photograph rather than the
 * hairline. Purely where the pin lands; it decides nothing else.
 */
const TOP_AREAS: TrackingArea[] = ['crown', 'widerPart', 'ponytail'];
const SIDE_AREAS: TrackingArea[] = ['edges'];

/**
 * The three cards pinned to the hero, built from what they chose.
 *
 * Each card is a label the funnel already showed them and a pill naming
 * the question it answered. Nothing is inferred: the focus is the first
 * area they said they notice most (or the first goal, if the area step
 * was somehow skipped), the onset is the one they picked, and what they
 * have tried is the first approach they ticked. The focus title is the
 * choice's own label from this gender's funnel — "Hair feels less
 * dense", not the app's "Hair density" — because a card that quotes
 * the person has to quote them exactly; the app's own name for the area
 * is only the fallback for a value this funnel never showed. A missing
 * answer drops its card rather than inventing one — and so does an
 * answer that is itself a shrug. "I'm not sure yet" is not a focus,
 * "Something else" is not a place, "I'm not sure" is not a time, and
 * "I'm still figuring it out" is not a thing tried: a ring on the head
 * pointing at any of them would be pointing at nothing.
 *
 * The focus card is pinned where they said they look — a crown answer
 * points at the top of the photograph — and the other two take the
 * anchors left over, so no two cards share a point.
 */
/** The label the funnel showed for an area, as this gender's step listed it; the app's own name only for a value it never showed. */
export function areaChoiceLabel(gender: Gender, area: TrackingArea): string {
  const shown = funnelContent(gender).areas.find((c) => c.value === area);
  return shown ? shown.label : TRACKING_AREA_LABELS[area];
}

export function inviteCallouts(a: {
  gender: Gender;
  goals: HairGoal[];
  areas: TrackingArea[];
  noticed: Onset | null;
  approaches: Approach[];
}): InviteCallout[] {
  const cards: Omit<InviteCallout, 'anchor'>[] = [];
  const area = a.areas.find((x) => x !== 'generalChanges');
  const goal = a.goals.find((g) => g !== 'unsure');
  const noticed = a.noticed && a.noticed !== 'unsure' ? a.noticed : null;
  const tried = a.approaches.find((approach) => approach !== 'figuring');

  if (area) {
    cards.push({ id: 'focus', title: areaChoiceLabel(a.gender, area), pill: INVITE_PILLS.focus });
  } else if (goal) {
    cards.push({ id: 'focus', title: HAIR_GOAL_LABELS[goal], pill: INVITE_PILLS.focus });
  }
  if (noticed) {
    cards.push({ id: 'noticed', title: ONSET_LABELS[noticed], pill: INVITE_PILLS.noticed });
  }
  if (tried) {
    cards.push({ id: 'tried', title: APPROACH_LABELS[tried], pill: INVITE_PILLS.tried });
  }

  const focusAnchor: InviteAnchor =
    area && TOP_AREAS.includes(area) ? 'crown' : area && SIDE_AREAS.includes(area) ? 'temple' : 'hairline';
  const spare: InviteAnchor[] = (['hairline', 'temple', 'crown'] as InviteAnchor[]).filter(
    (anchor) => anchor !== focusAnchor,
  );

  return cards.map((card) => ({
    ...card,
    anchor: card.id === 'focus' ? focusAnchor : (spare.shift() ?? 'hairline'),
  }));
}

/* ------------------------------ the hero ------------------------------- */

/**
 * Where the three pins land on each reference photograph, and where the
 * card for each one sits — the plan the invitation screen draws from.
 *
 * ── The problem this solves ───────────────────────────────────────────
 * A card sits at the edge of the hero and overhangs the photograph; a
 * temple sits at the edge of a head, at mid-height. Put the temple's
 * card on the temple's side at the temple's height and the card covers
 * the ring it is meant to point at. So the layout is three bands — one
 * card at the top, one in the middle, one at the bottom — with the two
 * cards on the temple's side taking the top and bottom bands, and the
 * middle band on the other side. Each pin then sits in a band its own
 * side leaves clear, and the numbers below are checked against every
 * card at every width in `inviteGeometry` (and in onboarding.test.ts).
 *
 * The male reference is a front view with the hairline across its
 * middle: the crown is the mass of hair top-right of centre, the
 * hairline is the front edge left of centre, and the temple is the
 * left corner where that edge turns down. The female reference is the
 * part seen from above with a hand holding the hair back at the left,
 * so every pin keeps to the hair: the hairline is the top of the part,
 * the temple is the side of the head at the right, and the crown is the
 * hair beside the whorl. Nothing points at the hand. The portrait —
 * for a record with no gender on it — is a whole face, so its hairline
 * sits a quarter of the way down rather than across the middle: the
 * crown is the top of the hair, the hairline is the front edge above
 * the forehead, and the temple is the hair at the left, level with the
 * brow. Its pins are its own; the front view's pins on this photograph
 * would ring an eye and a cheek.
 */
export type InvitePoint = { x: number; y: number };

export type InviteSlot = { side: 'left' | 'right'; band: 'top' | 'middle' | 'bottom' };

export type InviteHeroPlan = {
  /** Where each ring sits, as fractions of the photograph's side. */
  anchors: Record<InviteAnchor, InvitePoint>;
  /** Which side and band the card for each ring takes. */
  slots: Record<InviteAnchor, InviteSlot>;
  /** Sparkle points in the hair, with their size in points. */
  sparkles: (InvitePoint & { size: number })[];
};

export const INVITE_HERO_PLANS: Record<'male' | 'female' | 'portrait', InviteHeroPlan> = {
  male: {
    anchors: {
      crown: { x: 0.6, y: 0.18 },
      hairline: { x: 0.4, y: 0.49 },
      temple: { x: 0.28, y: 0.52 },
    },
    slots: {
      crown: { side: 'left', band: 'top' },
      hairline: { side: 'right', band: 'middle' },
      temple: { side: 'left', band: 'bottom' },
    },
    sparkles: [
      { x: 0.36, y: 0.32, size: 4 },
      { x: 0.64, y: 0.3, size: 3 },
      { x: 0.48, y: 0.42, size: 5 },
      { x: 0.72, y: 0.46, size: 3 },
      { x: 0.56, y: 0.36, size: 3 },
    ],
  },
  female: {
    anchors: {
      hairline: { x: 0.45, y: 0.13 },
      temple: { x: 0.74, y: 0.46 },
      crown: { x: 0.44, y: 0.6 },
    },
    slots: {
      hairline: { side: 'right', band: 'top' },
      temple: { side: 'left', band: 'middle' },
      crown: { side: 'right', band: 'bottom' },
    },
    sparkles: [
      { x: 0.56, y: 0.26, size: 4 },
      { x: 0.66, y: 0.2, size: 3 },
      { x: 0.62, y: 0.46, size: 5 },
      { x: 0.7, y: 0.58, size: 3 },
      { x: 0.54, y: 0.76, size: 3 },
    ],
  },
  portrait: {
    anchors: {
      crown: { x: 0.55, y: 0.1 },
      hairline: { x: 0.45, y: 0.27 },
      temple: { x: 0.26, y: 0.4 },
    },
    slots: {
      crown: { side: 'left', band: 'top' },
      hairline: { side: 'right', band: 'middle' },
      temple: { side: 'left', band: 'bottom' },
    },
    sparkles: [
      { x: 0.4, y: 0.15, size: 4 },
      { x: 0.62, y: 0.13, size: 3 },
      { x: 0.5, y: 0.2, size: 5 },
      { x: 0.31, y: 0.27, size: 3 },
      { x: 0.7, y: 0.24, size: 3 },
    ],
  },
};

export type InviteRect = { x: number; y: number; width: number; height: number };

export type InviteGeometry = {
  /** The hero frame: the content width, and the photograph plus its overhang. */
  width: number;
  height: number;
  /** The photograph, square, centred in the frame. */
  photo: InviteRect;
  cardWidth: number;
  /** A card's top edge in the frame, by band; `bottom` is bottom-aligned, so its top depends on its height. */
  cardTop: (band: InviteSlot['band'], cardHeight: number) => number;
  /** Where each ring's centre sits in the frame. */
  point: (anchor: InvitePoint) => InvitePoint;
};

/**
 * The hero's numbers for a content width.
 *
 * The photograph takes 0.58 of the width and the cards 0.38 of it, so
 * the photograph outweighs the three cards rather than the other way
 * round — in the reference the face is the subject and the cards are
 * notes pinned to it — and each card still overhangs the photograph by
 * about a sixth of the width, enough to read as pinned to it, not
 * beside it. The frame runs `INVITE_OVERHANG` above and below the
 * photograph so the top and bottom cards can sit outside its corners.
 * The middle card starts a little above the photograph's centre line.
 *
 * The card's width has a floor set by its longest word: "Dermatologist"
 * is 112pt in the card's type, and the card has `INVITE_CARD_PAD` of
 * padding each side, so a card narrower than `INVITE_CARD_MIN` breaks
 * the word in the middle. At 0.38 the floor only bites on the narrowest
 * phone (335 of content), and every label the funnel can put on a card
 * fits in two lines.
 */
export const INVITE_OVERHANG = 60;
/** A card's horizontal padding, in points. */
export const INVITE_CARD_PAD = 10;
/** The narrowest card that keeps the funnel's longest label whole. */
export const INVITE_CARD_MIN = 112 + INVITE_CARD_PAD * 2;

export function inviteGeometry(width: number): InviteGeometry {
  const side = Math.round(width * 0.58);
  const height = side + INVITE_OVERHANG * 2;
  const photo = { x: (width - side) / 2, y: INVITE_OVERHANG, width: side, height: side };
  return {
    width,
    height,
    photo,
    cardWidth: Math.max(INVITE_CARD_MIN, Math.round(width * 0.38)),
    cardTop: (band, cardHeight) =>
      band === 'top'
        ? 0
        : band === 'middle'
          ? Math.round(photo.y + side * 0.38)
          : height - cardHeight,
    point: (anchor) => ({ x: photo.x + anchor.x * side, y: photo.y + anchor.y * side }),
  };
}

/**
 * The card's rectangle in the frame, for a slot, a width and a height.
 */
export function inviteCardRect(
  geometry: InviteGeometry,
  slot: InviteSlot,
  cardHeight: number,
): InviteRect {
  return {
    x: slot.side === 'left' ? 0 : geometry.width - geometry.cardWidth,
    y: geometry.cardTop(slot.band, cardHeight),
    width: geometry.cardWidth,
    height: cardHeight,
  };
}

/**
 * Where a line leaves a card on its way to a point: the spot on the
 * card's border where the ray from the card's centre to the point
 * crosses it. A card beside its ring sends the line out of its inner
 * edge; a card below its ring sends it out of the top. The line never
 * crosses the card that owns it.
 */
export function inviteExitPoint(rect: InviteRect, to: InvitePoint): InvitePoint {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = to.x - cx;
  const dy = to.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const tx = dx === 0 ? Infinity : (rect.width / 2) / Math.abs(dx);
  const ty = dy === 0 ? Infinity : (rect.height / 2) / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

export const COPY = {
  welcome: {
    cta: 'Get started',
  },
  meaning: {
    title: 'What would better hair mean to you{name}?',
    cta: 'Continue',
  },
  goal: {
    // Their hope, asked as a hope. The options underneath are the things
    // people say when asked this, and the one they pick is shown back to
    // them in those words — never as something the app is going to do.
    title: 'What are you hoping for{name}?',
    cta: 'Continue',
  },
  story: {
    title: 'When did you first notice something changing?',
    second: 'What do you notice most?',
    cta: 'Continue',
  },
  impact: {
    title: 'How often does your hair cross your mind{name}?',
    scaleLow: 'Rarely',
    scaleHigh: 'Often',
    second: 'When does it bother you most?',
    cta: 'Continue',
  },
  approach: {
    title: 'What are you doing for your hair right now?',
    second: 'How consistent have you been?',
    cta: 'Continue',
  },
  medication: {
    title: 'Are you using anything for your hair?',
    otherLabel: 'What are you using?',
    otherPlaceholder: 'e.g. Rosemary oil',
    skip: 'Prefer not to say',
    cta: 'Continue',
  },
  products: {
    title: 'What does your hair routine look like?',
    second: 'Anything else?',
    addPlaceholder: 'e.g. Rice water rinse',
    addLabel: 'Add your own',
    addCta: 'Add',
    skip: 'I’ll set this up later',
    cta: 'Continue',
  },
  system: {
    title: 'You don’t need more willpower.',
    titleMuted: 'Just something easier to keep.',
    body: 'Tress keeps the small things visible, so staying with it is noticing rather than remembering.',
    cta: 'Continue',
  },
  cadence: {
    title: 'How often would you like to check in?',
    cta: 'Continue',
  },
  photo: {
    title: 'Add a photo of yourself.',
    // True, and the only reason anyone needs: it goes on the card, and
    // like every photograph in this app it never leaves the phone.
    body: 'It goes on your card, and it stays on your phone.',
    cta: 'Choose a photo',
    skip: 'Not now',
  },
  you: {
    title: 'First, a little about you.',
    genderPrompt: 'You are',
    nameLabel: 'What should we call you?',
    second: 'And how old are you?',
    cta: 'Continue',
  },
  card: {
    cta: 'Continue',
  },
  profile: {
    cta: 'Continue',
  },
  /*
    The last screen, and the camera behind it.

    The funnel ends in the Hair Scan: the questions, one continuous scan,
    the report on what the scan captured, and then the paywall. The
    report is the thing the whole funnel has been promising, and it lands
    on something the person just did rather than on a single frame.

    `scan` is the step as the owner describes it: you turn your head, and
    Tress captures the important angles automatically. There is no
    per-angle capture behind this button any more — no orbit of five to
    read first, no shutter to line up five times — so the words here must
    not describe one. It is also the only ending: with a screen reader
    running, the scanner announces every cue it shows and finishes on its
    own, so there is no separate walk to read aloud; and a build with no
    face detector is told so by the scan itself, so there is no
    one-photograph fallback to fall to. One mechanism, one set of words.

    The screen is an invitation rather than an instruction: their name,
    the photograph with three of their own answers pinned to it, and the
    button. The scanner's own instruction sheet explains the mechanism —
    the turn, the ring, where the images stay — one tap later, so the
    invitation does not repeat it. It promises nothing about what the
    images will show.

    `notNow` finishes the funnel without a baseline. The journey already
    exists by this step, so declining lands on Home, where the first-scan
    card carries the same invitation until it is taken.
  */
  baseline: {
    scan: SCAN_BASELINE,
  },
} as const;

/* ------------------------------- routine -------------------------------- */

/**
 * The stack their answers seed.
 *
 * Only the things a person does on a schedule become items; seeing a
 * dermatologist or having had a transplant are facts about their journey,
 * not something to tick off each morning. Nothing here is suggested — it is
 * only what they already told us they are doing, written down.
 */
export const ROUTINE_SEEDS: Partial<
  Record<Approach, { label: string; icon: RoutineIcon; timeOfDay: RoutineTimeOfDay }>
> = {
  topical: { label: 'Topical treatment', icon: 'dropper', timeOfDay: 'evening' },
  prescription: { label: 'Prescription medication', icon: 'pill', timeOfDay: 'morning' },
  supplements: { label: 'Supplements', icon: 'capsule', timeOfDay: 'morning' },
  haircare: { label: 'Hair-care routine', icon: 'drop', timeOfDay: 'evening' },
};

/**
 * The stack entry each named treatment becomes.
 *
 * Every one is 'anytime', and that is the whole point: the generic seeds
 * above can guess at a morning or an evening because "supplements" carries
 * no schedule of its own, but putting a named drug in the morning slot is
 * this app telling somebody when to take their medicine. It has no business
 * doing that. Whoever prescribed it said when; the user moves the item to
 * match, and the app records what they tell it.
 */
export const MEDICATION_SEEDS: Record<
  Exclude<Medication, 'other' | 'none'>,
  { label: string; icon: RoutineIcon; timeOfDay: RoutineTimeOfDay }
> = {
  minoxidilTopical: { label: 'Minoxidil (topical)', icon: 'dropper', timeOfDay: 'anytime' },
  finasterideOral: { label: 'Finasteride (oral)', icon: 'pill', timeOfDay: 'anytime' },
  minoxidilOral: { label: 'Minoxidil (oral)', icon: 'pill', timeOfDay: 'anytime' },
  finasterideTopical: { label: 'Finasteride (topical)', icon: 'dropper', timeOfDay: 'anytime' },
  dutasteride: { label: 'Dutasteride', icon: 'pill', timeOfDay: 'anytime' },
  spironolactone: { label: 'Spironolactone', icon: 'pill', timeOfDay: 'anytime' },
  ketoconazole: { label: 'Ketoconazole shampoo', icon: 'drop', timeOfDay: 'anytime' },
  iron: { label: 'Iron supplement', icon: 'capsule', timeOfDay: 'anytime' },
  hormonal: { label: 'Hormonal medication', icon: 'pill', timeOfDay: 'anytime' },
};

export type RoutineSeed = {
  label: string;
  icon: RoutineIcon;
  timeOfDay: RoutineTimeOfDay;
  /** Times a week. Absent is daily, which is what seeds used to be. */
  timesPerWeek?: number;
};

/**
 * Everything the funnel's answers put in the stack, in the order it appears.
 *
 * Named treatments lead, because they are the specific things and the
 * generic ones are a fallback for what we could not name. Where a named
 * treatment covers an approach, the approach's generic seed is dropped:
 * "Topical treatment" and "Minoxidil (topical)" are one bottle, and two
 * rows for it would be two rows to tick every day.
 */
export function routineSeedsFor({
  approaches,
  medications = [],
  medicationNote = '',
  treatments = [],
  treatmentCovers = [],
  products = [],
}: {
  approaches: Approach[];
  medications?: Medication[];
  medicationNote?: string;
  /**
   * Treatments ticked on the routine step, already deduplicated against
   * the medication step by whoever collected them.
   */
  treatments?: RoutineSeed[];
  /**
   * Approaches those treatments make redundant. "Topical treatment" is a
   * fallback for a bottle we could not name; once it is named, it goes.
   */
  treatmentCovers?: Approach[];
  /** Hair care, already carrying the frequency the user set. */
  products?: RoutineSeed[];
}): RoutineSeed[] {
  const named = medications.filter(
    (m): m is keyof typeof MEDICATION_SEEDS => m in MEDICATION_SEEDS,
  );

  const seeds: RoutineSeed[] = named.map((m) => MEDICATION_SEEDS[m]);

  // Straight after the named ones, for the same reason they lead: these
  // are the rows somebody worries about having missed.
  seeds.push(...treatments);

  const note = medicationNote.trim();
  if (medications.includes('other') && note) {
    seeds.push({ label: note, icon: inferRoutineIcon(note), timeOfDay: 'anytime' });
  }

  const covered = new Set(
    MALE_MEDICATIONS.filter((c) => named.includes(c.value as never))
      .map((c) => c.covers)
      .filter((a) => a !== undefined),
  );

  // Minoxidil ticked on the routine step is the topical treatment: the
  // generic row was a fallback for what we could not name, and now it
  // has a name.
  for (const approach of treatmentCovers) covered.add(approach);

  for (const approach of approaches) {
    if (covered.has(approach)) continue;
    const seed = ROUTINE_SEEDS[approach];
    if (seed) seeds.push(seed);
  }

  // Hair care last: the treatments are the things somebody is anxious to
  // keep up, and they should be the first rows on the stack each morning.
  seeds.push(...products);

  return seeds;
}

/* ------------------------------- female -------------------------------- */

/**
 * The same conversation, about a different experience of it.
 *
 * Thinning on longer hair tends to announce itself differently: a part
 * that widens, a ponytail that needs another turn of the band, shedding
 * that collects in a brush. Asking a woman whether her hairline is
 * receding is asking about somebody else's hair, and the answer she gives
 * is the one she has been given room to give.
 *
 * What does not change is the register. These are still questions about
 * how it feels and when it is noticed, because that is what someone
 * opening this app is actually carrying. Nothing here asks after a cause,
 * and nothing implies the app can find one.
 */
const FEMALE_GOALS: Choice<HairGoal>[] = [
  { value: 'fullness', label: 'More fullness on top' },
  { value: 'narrowerPart', label: 'A part that looks less wide' },
  { value: 'fullerPonytail', label: 'A fuller ponytail' },
  { value: 'shedding', label: 'Less shedding' },
  { value: 'lessBreakage', label: 'Less breakage' },
  { value: 'overall', label: 'Hair that feels like mine again' },
  { value: 'routineWorking', label: 'Knowing whether my routine is working' },
  { value: 'unsure', label: "I'm not sure yet" },
];

const FEMALE_AREAS: Choice<TrackingArea>[] = [
  { value: 'widerPart', label: 'My part looks wider' },
  { value: 'overallThinning', label: 'Thinning across the top' },
  { value: 'ponytail', label: 'My ponytail feels thinner' },
  { value: 'shedding', label: 'How much comes out' },
  { value: 'edges', label: 'My edges or temples' },
  { value: 'breakage', label: 'Breakage and damage' },
  { value: 'generalChanges', label: 'Something else' },
];

const FEMALE_TRIGGERS: Choice<Trigger>[] = [
  { value: 'parting', label: 'Parting my hair' },
  { value: 'tyingUp', label: 'Tying it up' },
  { value: 'brushing', label: 'Brushing or washing it' },
  { value: 'lighting', label: 'Bright lighting' },
  { value: 'photos', label: 'Taking photos' },
  { value: 'mirror', label: 'Looking in the mirror' },
  { value: 'future', label: 'Thinking about the future' },
  { value: 'none', label: "It doesn't really bother me" },
];

/**
 * What women are most often already using.
 *
 * A different list because different things are prescribed, not because
 * the app has a view about any of them. Dutasteride comes off it — it is
 * very rarely given to women, and a list you scan is a list you answer
 * honestly — and anything missing goes in under "Something else".
 */
const FEMALE_MEDICATIONS: (Choice<Medication> & { covers?: Approach })[] = [
  { value: 'minoxidilTopical', label: 'Minoxidil (topical)', detail: 'Liquid or foam', icon: 'bottle', covers: 'topical' },
  { value: 'minoxidilOral', label: 'Minoxidil (oral)', icon: 'pill', covers: 'prescription' },
  { value: 'spironolactone', label: 'Spironolactone', icon: 'pill', covers: 'prescription' },
  { value: 'hormonal', label: 'Hormonal medication', icon: 'pill', covers: 'prescription' },
  { value: 'iron', label: 'Iron or ferritin supplement', icon: 'capsule', covers: 'supplements' },
  { value: 'finasterideOral', label: 'Finasteride (oral)', icon: 'pill', covers: 'prescription' },
  { value: 'ketoconazole', label: 'Ketoconazole shampoo', icon: 'drop', covers: 'haircare' },
  { value: 'other', label: 'Something else', detail: 'Type it in', icon: 'help' },
  { value: 'none', label: 'Nothing right now', icon: 'circle' },
];

/**
 * Wording that differs, over the shared copy.
 *
 * Only the second story question, in the end. "Where" rather than
 * "what", because the female set asks about places on the head — the
 * part, the temples — and "what do you notice most" sat oddly above
 * them. Everything else reads the same to everyone.
 */
const FEMALE_COPY = {
  story: {
    title: COPY.story.title,
    second: 'Where do you notice it most?',
  },
};

export type FunnelContent = {
  goals: Choice<HairGoal>[];
  areas: Choice<TrackingArea>[];
  triggers: Choice<Trigger>[];
  medications: (Choice<Medication> & { covers?: Approach })[];
  /** Copy for the steps whose wording differs. */
  story: { title: string; second: string };
};

/**
 * The question set for whoever is answering.
 *
 * Read in the funnel from the gender already chosen, so changing that
 * answer changes the questions underneath it on the next render — which
 * is the point of asking it first.
 */
export function funnelContent(gender: Gender): FunnelContent {
  if (gender === 'female') {
    return {
      goals: FEMALE_GOALS,
      areas: FEMALE_AREAS,
      triggers: FEMALE_TRIGGERS,
      medications: FEMALE_MEDICATIONS,
      story: { title: FEMALE_COPY.story.title, second: FEMALE_COPY.story.second },
    };
  }
  return {
    goals: MALE_GOALS,
    areas: MALE_AREAS,
    triggers: MALE_TRIGGERS,
    medications: MALE_MEDICATIONS,
    story: { title: COPY.story.title, second: COPY.story.second },
  };
}

/**
 * Puts the person's name into a line written with a `{name}` slot.
 *
 * The slot carries its own comma, so the name arrives as ", Arslan" and a
 * blank one takes the punctuation with it — the sentence reads either way
 * rather than ending up with a stray comma or a name jammed onto a word.
 *
 * Used on three screens and not on all of them: a funnel that says your
 * name in every heading stops sounding like it is talking to you and
 * starts sounding like a mail merge.
 */
export function withName(line: string, name: string): string {
  const trimmed = name.trim();
  return line.replace('{name}', trimmed ? `, ${trimmed}` : '');
}
