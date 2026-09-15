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
import { GENDER_LABELS } from '@/types/domain';
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
  | 'plan'
  | 'future'
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
  'plan',
  'future',
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

export const COPY = {
  welcome: {
    title: 'Better Hair.',
    titleMuted: 'A Confident You.',
    body: 'Your journey starts with understanding where you are today.',
    cta: 'Begin My Journey',
  },
  meaning: {
    title: 'What would better hair mean to you{name}?',
    subtitle: 'There’s no right answer. Choose what matters most to you.',
    cta: 'Continue',
  },
  goal: {
    title: 'Imagine six months from now{name}.',
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
    title: 'How often does your hair cross your mind{name}?',
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
      'Tick whatever you already use and it goes straight into your routine. Nothing here is a suggestion — Tress doesn’t advise on treatments or doses.',
    otherLabel: 'What are you using?',
    otherPlaceholder: 'e.g. Rosemary oil',
    footnote: 'Stays on this device. You can change it any time.',
    skip: 'Prefer not to say',
    cta: 'Continue',
  },
  products: {
    title: 'What does your hair routine look like?',
    subtitle:
      'Tick what you already use and set how often. It becomes your stack — you can change any of it later.',
    second: 'Anything else?',
    addPlaceholder: 'e.g. Rice water rinse',
    addLabel: 'Add your own',
    addCta: 'Add',
    skip: 'I’ll set this up later',
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
  you: {
    title: 'First, who are we doing this for?',
    genderPrompt: 'Your hair',
    genderHint:
      'This sets the examples you are shown and the questions we ask. You can change it later.',
    nameLabel: 'And what should we call you?',
    second: 'How old are you?',
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

/** Wording that differs, over the shared copy. */
const FEMALE_COPY = {
  goal: {
    subtitle:
      'You look in the mirror and feel good about what you see. What would make you happiest?',
  },
  story: {
    title: 'When did you first notice something changing?',
    second: 'Where do you notice it most?',
  },
  approach: {
    title: 'What are you doing for your hair right now?',
  },
  medication: {
    otherPlaceholder: 'e.g. Rosemary oil',
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
