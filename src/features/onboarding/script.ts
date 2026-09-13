/**
 * The onboarding funnel, as content.
 *
 * Kept apart from the screen that renders it so the whole arc can be read
 * in one place and reordered without touching layout code. The order is
 * the argument: what this is for, what you want, something useful in
 * return, where you are now, and only then your name.
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
  | 'meaning'
  | 'goal'
  | 'factGradual'
  | 'story'
  | 'impact'
  | 'factFeelings'
  | 'approach'
  | 'medication'
  | 'system'
  | 'cadence'
  | 'factCause'
  | 'photo'
  | 'name'
  | 'card'
  | 'plan'
  | 'future'
  | 'baseline';

/** The order people move through. Progress is measured against it. */
export const STEPS: StepId[] = [
  'welcome',
  'meaning',
  'goal',
  'factGradual',
  'story',
  'impact',
  'factFeelings',
  'approach',
  'medication',
  'system',
  'cadence',
  'factCause',
  'photo',
  'name',
  'card',
  'plan',
  'future',
  'baseline',
];

/**
 * Steps that do not count toward the progress indicator.
 *
 * The three fact cards and the reveals are not being asked anything, and a
 * bar that advances while someone reads makes reading feel like a cost.
 */
export const UNCOUNTED: StepId[] = [
  'welcome',
  'factGradual',
  'factFeelings',
  'factCause',
  'system',
  'card',
  'plan',
  'future',
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

export const GOAL_CHOICES: Choice<HairGoal>[] = [
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
export const AREA_CHOICES: Choice<TrackingArea>[] = [
  { value: 'hairline', label: 'Hairline' },
  { value: 'crown', label: 'Crown' },
  { value: 'overallThinning', label: 'Overall thinning' },
  { value: 'shedding', label: 'Shedding' },
  { value: 'density', label: 'Hair feels less dense' },
  { value: 'generalChanges', label: 'Something else' },
];

export const TRIGGER_CHOICES: Choice<Trigger>[] = [
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
export const MEDICATION_CHOICES: (Choice<Medication> & { covers?: Approach })[] = [
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
  { value: 'male', label: 'Man' },
  { value: 'female', label: 'Woman' },
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

export const COPY = {
  welcome: {
    title: 'Better Hair.',
    titleMuted: 'A Confident You.',
    body: 'Your journey starts with understanding where you are today.',
    cta: 'Begin My Journey',
    footnote: 'Private by design',
  },
  meaning: {
    title: 'What would better hair mean to you?',
    subtitle: 'There’s no right answer. Choose what matters most to you.',
    cta: 'Continue',
  },
  goal: {
    title: 'Imagine six months from now.',
    subtitle:
      'You look in the mirror and feel good about what you see. What would make you happiest?',
    cta: "That's My Goal",
    /** Shown while the chosen goal settles into the middle of the screen. */
    settle: "We'll keep that goal in view.",
  },
  story: {
    title: 'When did you first notice something changing?',
    second: 'What do you notice most?',
    cta: 'Continue',
  },
  impact: {
    title: 'How often does your hair cross your mind?',
    scaleLow: 'Rarely',
    scaleHigh: 'Often',
    second: 'Which moments bother you most?',
    cta: 'Continue',
  },
  approach: {
    title: 'What are you doing for your hair right now?',
    subtitle: 'Whatever it is, it’s a starting point. Nothing here is graded.',
    second: 'How consistent do you feel you’ve been?',
    cta: 'Continue',
  },
  medication: {
    title: 'Are you using anything for your hair?',
    subtitle:
      'Tick whatever you already use and it goes straight into your routine. Nothing here is a suggestion — Hair Journey doesn’t advise on treatments or doses.',
    otherLabel: 'What are you using?',
    otherPlaceholder: 'e.g. Rosemary oil',
    footnote: 'Stays on this device. You can change it any time.',
    skip: 'Prefer not to say',
    cta: 'Continue',
  },
  system: {
    title: 'You don’t need more willpower.',
    titleMuted: 'You need a system that’s easier to follow.',
    body: 'We’ll keep the small things visible, so staying with it is a matter of noticing rather than remembering.',
    cta: 'Build My Routine',
  },
  cadence: {
    title: 'How often would you like to check in with yourself?',
    subtitle:
      'Hair changes take time. Your journey shouldn’t require you to think about it every day.',
    cta: 'Continue',
  },
  photo: {
    title: 'Let’s meet the person behind the journey.',
    subtitle: 'Add a photo of yourself. It makes the journey feel like yours.',
    cta: 'Add My Photo',
    skip: 'Skip for now',
  },
  name: {
    title: 'What should we call you?',
    second: 'And how old are you?',
    genderPrompt: 'Which examples should we show you?',
    genderHint:
      'This only picks the reference photos in the capture guide. Nothing else changes.',
    ageHint: 'Optional. It goes on your card and nowhere else.',
    cta: 'Continue',
  },
  card: {
    title: 'This is your starting point.',
    subtitle: 'Yours to keep. It fills in as you go.',
    cta: 'Continue',
  },
  plan: {
    cta: 'Continue',
    promises: [
      'See your changes over time',
      'Stay consistent with your routine',
      'Keep your journey organised',
      'Learn what’s worth knowing',
      'Build a record you can look back on',
    ],
  },
  future: {
    title: 'One day, you’ll look back at today.',
    titleMuted: 'And you’ll be glad you started.',
    body: 'Let’s make today’s photo your Day 1.',
    cta: 'Start My Journey',
  },
  baseline: {
    title: 'Let’s capture your starting point.',
    subtitle:
      'Five angles, one baseline — so your future self has something real to compare against.',
    cta: 'Take My First Photos',
    skip: 'I’ll do this later',
  },
} as const;

/** The five angles, as the baseline screen lists them. */
export const BASELINE_ANGLES = [
  'Top',
  'Left Side',
  'Right Side',
  'Back',
  'Hairline',
] as const;

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
};

export type RoutineSeed = { label: string; icon: RoutineIcon; timeOfDay: RoutineTimeOfDay };

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
}: {
  approaches: Approach[];
  medications?: Medication[];
  medicationNote?: string;
}): RoutineSeed[] {
  const named = medications.filter(
    (m): m is keyof typeof MEDICATION_SEEDS => m in MEDICATION_SEEDS,
  );

  const seeds: RoutineSeed[] = named.map((m) => MEDICATION_SEEDS[m]);

  const note = medicationNote.trim();
  if (medications.includes('other') && note) {
    seeds.push({ label: note, icon: inferRoutineIcon(note), timeOfDay: 'anytime' });
  }

  const covered = new Set(
    MEDICATION_CHOICES.filter((c) => named.includes(c.value as never))
      .map((c) => c.covers)
      .filter((a) => a !== undefined),
  );

  for (const approach of approaches) {
    if (covered.has(approach)) continue;
    const seed = ROUTINE_SEEDS[approach];
    if (seed) seeds.push(seed);
  }

  return seeds;
}
