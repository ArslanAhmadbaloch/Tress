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

import type {
  Approach,
  HairGoal,
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
