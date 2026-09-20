/**
 * Tress domain model.
 *
 * Shaped so it can move to Supabase without a rewrite: every entity has
 * a string id and ISO-8601 timestamps, and relationships are by id
 * rather than by nesting. Photo files stay on disk; only their URIs and
 * metadata live in the record.
 */

/** The five standardised capture angles, in the order they're shot. */
/**
 * Capture order, matching the guided capture design: top, both sides,
 * back, then hairline. The keys are storage identifiers and never change,
 * so sessions saved under the old order still load; only the order and
 * the labels are presentation.
 */
export const ANGLES = [
  'top',
  'leftTemple',
  'rightTemple',
  'crown',
  'front',
] as const;

export type Angle = (typeof ANGLES)[number];

export const ANGLE_LABELS: Record<Angle, string> = {
  top: 'Top',
  leftTemple: 'Left Side',
  rightTemple: 'Right Side',
  crown: 'Back',
  front: 'Hairline',
};

/** Shown during guided capture, one per angle. */
export const ANGLE_GUIDANCE: Record<
  Angle,
  { instruction: string; tips: string[] }
> = {
  front: {
    instruction: 'Face the camera with your hair off your forehead so the hairline shows.',
    tips: [
      'Head level, eyes forward',
      'Hair in its normal position',
      'Keep the same distance each time',
    ],
  },
  leftTemple: {
    instruction: 'Turn your head to the right to show your left side.',
    tips: ['Rotate about 45°', 'Keep your chin level', 'Same side every session'],
  },
  rightTemple: {
    instruction: 'Turn your head to the left to show your right side.',
    tips: ['Rotate about 45°', 'Keep your chin level', 'Mirror your left angle'],
  },
  crown: {
    instruction: 'Tilt your head forward and capture the back and crown.',
    tips: ['Chin toward your chest', 'Camera above your head', 'Hold steady'],
  },
  top: {
    instruction: 'Hold your phone above your head and capture a clear top view.',
    tips: ['Camera directly overhead', 'Part your hair as usual', 'Even lighting'],
  },
};

/* ------------------------------------------------------------------ */

export type TrackingArea =
  | 'hairline'
  | 'crown'
  | 'overallThinning'
  | 'diffuseThinning'
  | 'shedding'
  | 'density'
  | 'transplantRecovery'
  | 'generalChanges'
  /* The ways it tends to show up on longer hair. */
  | 'widerPart'
  | 'ponytail'
  | 'edges'
  | 'breakage';

/**
 * What better hair would mean to them.
 *
 * Asked first, before anything about hair itself. Someone says "hair loss"
 * and means "I want to stop thinking about it every time I pass a mirror";
 * the second is the thing worth building around, and it is theirs to name
 * rather than ours to assume.
 */
export type Motivation =
  | 'confidence'
  | 'myself'
  | 'photos'
  | 'worry'
  | 'comfort'
  | 'understand'
  | 'other';

/**
 * The change they most hope to see.
 *
 * Recorded as an aspiration they stated, and shown back to them as one.
 * The app never treats it as a forecast: whether anybody's hair actually
 * changes depends on why it is changing and what they do about it, and
 * nothing here can promise an outcome.
 */
export type HairGoal =
  | 'fullness'
  | 'hairline'
  | 'crown'
  | 'shedding'
  | 'overall'
  | 'routineWorking'
  | 'unsure'
  | 'narrowerPart'
  | 'fullerPonytail'
  | 'lessBreakage';

/** When they first noticed something changing. */
export type Onset =
  | 'recently'
  | 'months'
  | 'halfYear'
  | 'twoYears'
  | 'longer'
  | 'unsure';

/** The moments that bring it to mind. The real-life trigger, not a severity. */
export type Trigger =
  | 'mirror'
  | 'photos'
  | 'lighting'
  | 'styling'
  | 'shower'
  | 'future'
  | 'none'
  | 'parting'
  | 'tyingUp'
  | 'brushing';

/** What they are already doing. Recorded, never judged or recommended. */
export type Approach =
  | 'topical'
  | 'prescription'
  | 'supplements'
  | 'haircare'
  | 'clinic'
  | 'transplant'
  | 'nothing'
  | 'figuring';

/**
 * A treatment the user tells us they are already using.
 *
 * This list exists so someone can tick what they take instead of typing it,
 * and so their routine can carry the real name rather than "Prescription
 * medication". It is a vocabulary for recording, never a menu of options:
 * the app does not rank these, comment on them, suggest one to anybody, or
 * hold any opinion about doses or schedules. Anything not listed goes in as
 * free text under `other`.
 */
export type Medication =
  | 'minoxidilTopical'
  | 'finasterideOral'
  | 'minoxidilOral'
  | 'finasterideTopical'
  | 'dutasteride'
  | 'spironolactone'
  | 'ketoconazole'
  | 'iron'
  | 'hormonal'
  | 'other'
  | 'none';

/**
 * Which reference photographs to show.
 *
 * It decides nothing about the person's hair and nothing about what the
 * app records — only whose head appears in the examples of framing, and
 * the wording alongside them. Somebody photographing their own crown is
 * better served by an example that looks like them.
 *
 * Absent means male, because that is the set the app shipped with and an
 * existing journey should not change under anybody.
 */
export type Gender = 'male' | 'female';

export const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
};

/** How consistent they feel they have been. Their own estimate. */
export type SelfConsistency = 'very' | 'mostly' | 'onOff' | 'forget' | 'notStarted';

/**
 * Display names for the onboarding answers.
 *
 * Kept beside the types rather than in the onboarding screens, because
 * the journey card shows the same answers back to the user months later
 * and the two must never drift into different wording.
 */
export const TRACKING_AREA_LABELS: Record<TrackingArea, string> = {
  hairline: 'Hairline',
  crown: 'Crown',
  overallThinning: 'Overall thinning',
  diffuseThinning: 'Diffuse thinning',
  shedding: 'Shedding',
  density: 'Hair density',
  transplantRecovery: 'Transplant recovery',
  generalChanges: 'General changes',
  widerPart: 'My part looks wider',
  ponytail: 'My ponytail feels thinner',
  edges: 'My edges or temples',
  breakage: 'Breakage and damage',
};

export const MOTIVATION_LABELS: Record<Motivation, string> = {
  confidence: 'Feel more confident',
  myself: 'Feel like myself again',
  photos: 'Look better in photos',
  worry: 'Stop worrying about my hair',
  comfort: 'Feel comfortable with my appearance',
  understand: "Just understand what's happening",
  other: 'Something else',
};

export const HAIR_GOAL_LABELS: Record<HairGoal, string> = {
  fullness: 'More fullness',
  hairline: 'A stronger-looking hairline',
  crown: 'More density at the crown',
  shedding: 'Less shedding',
  overall: 'Better-looking overall hair',
  routineWorking: 'Knowing whether my routine is working',
  unsure: "I'm not sure yet",
  narrowerPart: 'A part that looks less wide',
  fullerPonytail: 'A fuller ponytail',
  lessBreakage: 'Less breakage',
};

export const ONSET_LABELS: Record<Onset, string> = {
  recently: 'Recently',
  months: 'A few months ago',
  halfYear: '6–12 months ago',
  twoYears: '1–2 years ago',
  longer: 'More than 2 years ago',
  unsure: "I'm not sure",
};

export const TRIGGER_LABELS: Record<Trigger, string> = {
  mirror: 'Looking in the mirror',
  photos: 'Taking photos',
  lighting: 'Bright lighting',
  styling: 'Styling my hair',
  shower: 'Seeing my hair after showering',
  future: 'Thinking about the future',
  none: "It doesn't really bother me",
  parting: 'Parting my hair',
  tyingUp: 'Tying it up',
  brushing: 'Brushing or washing it',
};

export const APPROACH_LABELS: Record<Approach, string> = {
  topical: 'Topical treatments',
  prescription: 'Prescription medication',
  supplements: 'Supplements',
  haircare: 'Hair-care routine',
  clinic: 'Dermatologist or clinic',
  transplant: 'Hair transplant',
  nothing: 'Nothing yet',
  figuring: "I'm still figuring it out",
};

/**
 * How each treatment is named, everywhere it appears.
 *
 * Generic names only. A brand name would read as an endorsement of one
 * manufacturer, and the person ticking the box may well be using a
 * different one.
 */
export const MEDICATION_LABELS: Record<Medication, string> = {
  minoxidilTopical: 'Minoxidil (topical)',
  finasterideOral: 'Finasteride (oral)',
  minoxidilOral: 'Minoxidil (oral)',
  finasterideTopical: 'Finasteride (topical)',
  dutasteride: 'Dutasteride',
  spironolactone: 'Spironolactone',
  ketoconazole: 'Ketoconazole shampoo',
  iron: 'Iron or ferritin supplement',
  hormonal: 'Hormonal medication',
  other: 'Something else',
  none: 'Nothing right now',
};

export const SELF_CONSISTENCY_LABELS: Record<SelfConsistency, string> = {
  very: 'Very consistent',
  mostly: 'Mostly consistent',
  onOff: 'On and off',
  forget: 'I keep forgetting',
  notStarted: "I haven't started",
};

/* ------------------------------------------------------------------ */
/*
  What the person knows about themselves.

  The funnel's second set of questions. Every one of these is something
  the person can answer from their own experience — how their hair falls,
  how their scalp feels, what they have reacted to, what a professional
  has told them, what is going on in their life — and every one is
  recorded as the label of a choice they made. None is a reading the app
  took, none is a finding, and none is used to work anything out about
  their head: they are shown back as what they said, and the product
  shelf and coach use them only to speak in the person's own terms.

  Each list carries a "none" or "no preferences" answer of its own, so an
  empty list means the question was never answered, not "nothing".
*/

/** How their hair falls, in their own estimate. */
export type HairType = 'straight' | 'wavy' | 'curly' | 'coily';

export const HAIR_TYPE_LABELS: Record<HairType, string> = {
  straight: 'Straight',
  wavy: 'Wavy',
  curly: 'Curly',
  coily: 'Coily',
};

/** One line under each hair type, describing the shape and nothing else. */
export const HAIR_TYPE_DESCRIPTIONS: Record<HairType, string> = {
  straight: 'Falls flat, with little or no bend',
  wavy: 'Loose S-shaped bends along the length',
  curly: 'Defined curls or ringlets',
  coily: 'Tight coils or zigzag strands',
};

/**
 * How they usually wear their hair.
 *
 * Their own account of a habit, like every other answer here: nothing in
 * it is read off a photograph, and it says nothing about anybody's head.
 *
 * It earns its place because a parting is the one thing on a scalp with
 * enough contrast to be worth looking for at all, and only some people
 * have one. Somebody who says "short all over" or "no defined part" is
 * telling the app, before it ever opens the camera, that the search
 * would find nothing — which is the difference between a measurement
 * that declines to speak and one that invents a line. It matters as much
 * to a man with a side part as to a woman with a middle one.
 */
export type HairWearing =
  | 'middlePart'
  | 'sidePart'
  | 'noDefinedPart'
  | 'pulledBack'
  | 'shortAllOver'
  | 'other';

export const HAIR_WEARING_LABELS: Record<HairWearing, string> = {
  middlePart: 'Middle part',
  sidePart: 'Side part',
  noDefinedPart: 'No defined part',
  pulledBack: 'Pulled back',
  shortAllOver: 'Short all over',
  other: 'Other',
};

/** How their scalp tends to feel between washes. */
export type ScalpType = 'oily' | 'dry' | 'normal' | 'combination';

export const SCALP_TYPE_LABELS: Record<ScalpType, string> = {
  oily: 'Oily',
  dry: 'Dry',
  normal: 'Normal',
  combination: 'Combination',
};

export const SCALP_TYPE_DESCRIPTIONS: Record<ScalpType, string> = {
  oily: 'Feels greasy within a day or so of washing',
  dry: 'Feels tight or flaky',
  normal: 'Neither oily nor dry most of the time',
  combination: 'Oily in some places, dry in others',
};

/** Whether their scalp has reacted to products before. Their own account. */
export type ScalpSensitivity = 'sensitive' | 'notSensitive';

export const SCALP_SENSITIVITY_LABELS: Record<ScalpSensitivity, string> = {
  sensitive: 'Sensitive',
  notSensitive: 'Not sensitive',
};

export const SCALP_SENSITIVITY_DESCRIPTIONS: Record<ScalpSensitivity, string> = {
  sensitive: 'My scalp has reacted to products before',
  notSensitive: 'My scalp is fine with most products',
};

/**
 * Anything else on their mind about their hair, beside the main goal.
 *
 * The names of things a person notices — more scalp showing in a photo,
 * frizz, an itch — in the words they would use. Not a list of conditions,
 * and never turned into one.
 */
export type HairConcern =
  | 'moreScalpShowing'
  | 'shedding'
  | 'breakage'
  | 'dryness'
  | 'oilyRoots'
  | 'dandruff'
  | 'itchOrIrritation'
  | 'greying'
  | 'frizz';

export const HAIR_CONCERN_LABELS: Record<HairConcern, string> = {
  moreScalpShowing: 'More scalp showing',
  shedding: 'Shedding',
  breakage: 'Breakage',
  dryness: 'Dryness',
  oilyRoots: 'Oily roots',
  dandruff: 'Dandruff',
  itchOrIrritation: 'Itch or irritation',
  greying: 'Greying',
  frizz: 'Frizz',
};

/**
 * Their age as a band, which is all the app has any use for. `Profile.age`
 * stays for journeys that typed a number before the question became a
 * choice.
 */
export type AgeBand = 'under25' | '25to34' | '35to44' | '45to60' | 'over60';

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  under25: 'Under 25',
  '25to34': '25–34',
  '35to44': '35–44',
  '45to60': '45–60',
  over60: 'Over 60',
};

/** What they are comfortable spending on hair products. Tiers, never sums. */
export type Budget = 'everyday' | 'midRange' | 'premium' | 'luxury';

export const BUDGET_LABELS: Record<Budget, string> = {
  everyday: 'Everyday',
  midRange: 'Mid-range',
  premium: 'Premium',
  luxury: 'Luxury',
};

/** What they look for on a label. Preferences, recorded as stated. */
export type ProductFactor =
  | 'sulfateFree'
  | 'siliconeFree'
  | 'fragranceFree'
  | 'parabenFree'
  | 'vegan'
  | 'crueltyFree'
  | 'noPreference';

export const PRODUCT_FACTOR_LABELS: Record<ProductFactor, string> = {
  sulfateFree: 'Sulfate-free',
  siliconeFree: 'Silicone-free',
  fragranceFree: 'Fragrance-free',
  parabenFree: 'Paraben-free',
  vegan: 'Vegan',
  crueltyFree: 'Cruelty-free',
  noPreference: 'No preferences',
};

/**
 * Ingredients they tell us they have reacted to. Their own history, kept
 * so the shelf can say "you said fragrance bothers you" beside a label
 * that lists it — and nothing more than that.
 */
export type IngredientReaction =
  | 'sulfates'
  | 'fragrance'
  | 'essentialOils'
  | 'alcohols'
  | 'hairDye'
  | 'smoothingTreatments'
  | 'none';

/*
  One label per answer, and this table is the only one.

  The fragrance row used to read "Fragrance/parfum" here while the funnel
  drew "Fragrance (listed as parfum)" over the top of it (H.3). That
  split broke the rule the rest of the app is built on: every place that
  quotes an answer back — the shelf's note, the report's paragraph, a
  care note's attribution — quotes THIS string, so the report was putting
  words in quotation marks that nobody had ever been shown. The wording
  the owner asked for now lives here, where the echo reads it, and the
  funnel draws it unchanged.

  "Parfum" stays inside it because that is the word an ingredient list
  prints. Nothing depends on the label to find it, though: the shelf
  matches on its own token array (features/products/shelf.ts), not on
  this text, so the label is free to be written for a reader.
*/
export const INGREDIENT_REACTION_LABELS: Record<IngredientReaction, string> = {
  sulfates: 'Sulfates',
  fragrance: 'Fragrance (listed as parfum)',
  essentialOils: 'Essential oils',
  alcohols: 'Alcohols',
  hairDye: 'Hair dye (PPD)',
  smoothingTreatments: 'Keratin/smoothing treatments',
  none: 'None',
};

/**
 * Scalp conditions a professional has told them about.
 *
 * Self-report of somebody else's words: the question asks what they have
 * been told, and the answer is stored as that. The app never arrives at
 * one of these on its own, from a photograph or from anything else.
 */
export type ScalpCondition =
  | 'dandruff'
  | 'seborrheicDermatitis'
  | 'psoriasis'
  | 'eczema'
  | 'none';

export const SCALP_CONDITION_LABELS: Record<ScalpCondition, string> = {
  dandruff: 'Dandruff',
  seborrheicDermatitis: 'Seborrheic dermatitis',
  psoriasis: 'Psoriasis',
  eczema: 'Eczema',
  none: 'None',
};

/**
 * Things going on in their life that they chose to mention. Context for
 * the record, in their words; the app draws no line from any of these to
 * anything it shows.
 */
export type LifeFactor =
  | 'pregnancyOrPostpartum'
  | 'menopause'
  | 'thyroidOrHormonal'
  | 'newMedication'
  | 'illnessOrSurgery'
  | 'none';

export const LIFE_FACTOR_LABELS: Record<LifeFactor, string> = {
  pregnancyOrPostpartum: 'Pregnancy or postpartum',
  menopause: 'Menopause or perimenopause',
  thyroidOrHormonal: 'Thyroid or hormonal condition',
  newMedication: 'Started a medication recently',
  illnessOrSurgery: 'Major illness or surgery this year',
  none: 'None',
};

/** How often they use heat on their hair. */
export type HeatStyling = 'daily' | 'fewTimesWeek' | 'weekly' | 'rarely' | 'never';

export const HEAT_STYLING_LABELS: Record<HeatStyling, string> = {
  daily: 'Daily',
  fewTimesWeek: 'A few times a week',
  weekly: 'Weekly',
  rarely: 'Rarely',
  never: 'Never',
};

/**
 * Whether a value off disk is one of the choices a label table names.
 *
 * Own keys only: `'constructor' in labels` is true of every object, and a
 * blob is exactly the kind of place such a string turns up.
 */
function isChoiceIn<K extends string>(labels: Record<K, string>) {
  return (value: unknown): value is K =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(labels, value);
}

/**
 * The members of `list` that `labels` knows, in order.
 *
 * Everything here comes off disk, so none of it can be trusted to be
 * what the type says. A value the app no longer offers — renamed in a
 * later version, or simply corrupt — used to render as a blank line;
 * once it is fed to a label table it becomes a crash on the Profile tab
 * instead. And a list is only an array in the type: a string on disk has
 * a length too, and would pass a truthiness check and then iterate
 * character by character. Anything that is not an array reads as empty.
 */
export function knownChoices<K extends string>(list: unknown, labels: Record<K, string>): K[] {
  return Array.isArray(list) ? list.filter(isChoiceIn(labels)) : [];
}

/** `value` when `labels` knows it, else undefined. Same rule, one answer. */
export function knownChoice<K extends string>(
  value: unknown,
  labels: Record<K, string>,
): K | undefined {
  return isChoiceIn(labels)(value) ? value : undefined;
}

/** How often hair crosses their mind, from rarely to often. */
export const PREOCCUPATION_STEPS = 5;

/* ------------------------------------------------------------------ */

export type Profile = {
  id: string;
  displayName: string;
  /**
   * A number, on journeys that typed one before the question became a
   * choice of bands. Nothing writes it any more; read `profileAgeBand`.
   */
  age?: number;
  /** The band they picked. Optional: the question can be passed over. */
  ageBand?: AgeBand;
  /** Chooses the reference imagery. See `Gender`. */
  gender?: Gender;
  /** Local file URI or remote URL; undefined renders initials. */
  avatarUri?: string;
  bio?: string;
  createdAt: string;
};

export type Journey = {
  id: string;
  profileId: string;
  /** The day the user considers their journey to have begun. */
  startedAt: string;
  trackingAreas: TrackingArea[];
  /** Everything the funnel asked, kept so the app can speak to the person. */
  motivations: Motivation[];
  /**
   * What they said they are hoping for, in the words they picked.
   *
   * Several, because almost nobody has one reason — and, as `HairGoal`
   * says, an aspiration rather than a forecast. Optional only because a
   * journey written before the question took more than one answer has
   * `goal` on disk instead: read both shapes through `journeyGoals`,
   * never this field directly, and an old record answers the same as a
   * new one.
   */
  goals?: HairGoal[];
  /**
   * The single answer the question used to take.
   *
   * Nothing writes it any more. `migrateStoredData` folds it into `goals`
   * as the app loads, so a journey that has come through the loader has
   * `goals` and no `goal` — but it stays on the type because every
   * install made before this change has one sitting in storage.
   *
   * @deprecated Read `journeyGoals(journey)`.
   */
  goal?: HairGoal;
  noticed?: Onset;
  /** 0 to PREOCCUPATION_STEPS - 1: how often their hair crosses their mind. */
  preoccupation?: number;
  triggers: Trigger[];
  approaches: Approach[];
  /**
   * What they told us they are using, if they answered. Optional because
   * the question can be passed over and because journeys created before it
   * existed have no answer to give — absent means unanswered, not "none".
   */
  medications?: Medication[];
  /** Whatever they typed after ticking "Something else". */
  medicationNote?: string;
  selfConsistency?: SelfConsistency;
  /** Days between photo-session reminders. */
  updateIntervalDays: number;
  /*
    What the person knows about themselves, one field per funnel question.

    All optional, and all additive: every one arrived after journeys were
    already on disk, and `SCHEMA_VERSION` is not bumped for a field that
    reads as "unanswered" when absent (see the note on SCHEMA_VERSION).
    Read the lists through `journeyConcerns` and friends, never directly —
    `migrateJourney` drops values the app no longer offers on the way in,
    but a record built in memory has not been through it.
  */
  hairType?: HairType;
  /** How they say they usually wear it. Absent means unanswered. */
  hairWearing?: HairWearing;
  scalpType?: ScalpType;
  scalpSensitivity?: ScalpSensitivity;
  concerns?: HairConcern[];
  budget?: Budget;
  productFactors?: ProductFactor[];
  ingredientReactions?: IngredientReaction[];
  scalpConditions?: ScalpCondition[];
  lifeFactors?: LifeFactor[];
  heatStyling?: HeatStyling;
  createdAt: string;
};

/*
  The answer fields, grouped by shape, so the migration and the accessors
  share one list and a field added to the type cannot be missed by either.
*/
const JOURNEY_LIST_ANSWERS = {
  concerns: HAIR_CONCERN_LABELS,
  productFactors: PRODUCT_FACTOR_LABELS,
  ingredientReactions: INGREDIENT_REACTION_LABELS,
  scalpConditions: SCALP_CONDITION_LABELS,
  lifeFactors: LIFE_FACTOR_LABELS,
} as const satisfies { [K in keyof Journey]?: Record<string, string> };

const JOURNEY_CHOICE_ANSWERS = {
  hairType: HAIR_TYPE_LABELS,
  hairWearing: HAIR_WEARING_LABELS,
  scalpType: SCALP_TYPE_LABELS,
  scalpSensitivity: SCALP_SENSITIVITY_LABELS,
  budget: BUDGET_LABELS,
  heatStyling: HEAT_STYLING_LABELS,
} as const satisfies { [K in keyof Journey]?: Record<string, string> };

/**
 * Their answers to the self-knowledge questions, validated.
 *
 * Each reads its field through the label table that names the choices,
 * the way `journeyGoals` reads goals: a value the app never offered comes
 * out as absent, and a list that is not one comes out empty.
 */
export function journeyConcerns(journey: Pick<Journey, 'concerns'>): HairConcern[] {
  return knownChoices(journey.concerns, HAIR_CONCERN_LABELS);
}

export function journeyProductFactors(
  journey: Pick<Journey, 'productFactors'>,
): ProductFactor[] {
  return knownChoices(journey.productFactors, PRODUCT_FACTOR_LABELS);
}

export function journeyReactions(
  journey: Pick<Journey, 'ingredientReactions'>,
): IngredientReaction[] {
  return knownChoices(journey.ingredientReactions, INGREDIENT_REACTION_LABELS);
}

export function journeyScalpConditions(
  journey: Pick<Journey, 'scalpConditions'>,
): ScalpCondition[] {
  return knownChoices(journey.scalpConditions, SCALP_CONDITION_LABELS);
}

/** The life factors they chose to mention. */
export function journeyFactors(journey: Pick<Journey, 'lifeFactors'>): LifeFactor[] {
  return knownChoices(journey.lifeFactors, LIFE_FACTOR_LABELS);
}

export function journeyHairType(journey: Pick<Journey, 'hairType'>): HairType | undefined {
  return knownChoice(journey.hairType, HAIR_TYPE_LABELS);
}

/**
 * How they said they wear it, or nothing.
 *
 * Read through here rather than off the field: a value the app never
 * offered — a hand-edited blob, an answer from a build that offered a
 * different list — comes out as unanswered rather than as a choice
 * nobody made. Anything downstream that decides whether to look for a
 * parting must read it this way round: absent means "we were not told",
 * never "they have none".
 */
export function journeyHairWearing(
  journey: Pick<Journey, 'hairWearing'>,
): HairWearing | undefined {
  return knownChoice(journey.hairWearing, HAIR_WEARING_LABELS);
}

export function journeyScalpType(journey: Pick<Journey, 'scalpType'>): ScalpType | undefined {
  return knownChoice(journey.scalpType, SCALP_TYPE_LABELS);
}

export function journeyScalpSensitivity(
  journey: Pick<Journey, 'scalpSensitivity'>,
): ScalpSensitivity | undefined {
  return knownChoice(journey.scalpSensitivity, SCALP_SENSITIVITY_LABELS);
}

export function journeyBudget(journey: Pick<Journey, 'budget'>): Budget | undefined {
  return knownChoice(journey.budget, BUDGET_LABELS);
}

export function journeyHeatStyling(
  journey: Pick<Journey, 'heatStyling'>,
): HeatStyling | undefined {
  return knownChoice(journey.heatStyling, HEAT_STYLING_LABELS);
}

/**
 * The band they picked, or the one a typed age from an older journey
 * falls in, or nothing. A number outside any band — negative, NaN, a
 * string that got in somehow — reads as nothing rather than as a guess.
 */
export function profileAgeBand(profile: Pick<Profile, 'age' | 'ageBand'>): AgeBand | undefined {
  const picked = knownChoice(profile.ageBand, AGE_BAND_LABELS);
  if (picked) return picked;
  const age = profile.age;
  if (typeof age !== 'number' || !Number.isFinite(age) || age < 0 || age > 130) return undefined;
  if (age < 25) return 'under25';
  if (age < 35) return '25to34';
  if (age < 45) return '35to44';
  if (age <= 60) return '45to60';
  return 'over60';
}

/**
 * Their goals, whichever shape the record is in.
 *
 * One `goal` from before the question took several, or `goals` from
 * after — and possibly neither, because a blob can be older or stranger
 * than either. Every screen that shows a goal reads it through here, so
 * no screen has to know which shape it was handed, and "nothing
 * selected" arrives as an empty list rather than as a crash.
 */
export function journeyGoals(journey: Pick<Journey, 'goals' | 'goal'>): HairGoal[] {
  // Off disk, so validated the way every answer is: see `knownChoices`.
  const list = knownChoices(journey.goals, HAIR_GOAL_LABELS);
  if (list.length > 0) return list;
  const single = knownChoice(journey.goal, HAIR_GOAL_LABELS);
  return single ? [single] : [];
}

/**
 * "a, b and c" — how the app reads a list of someone's answers back.
 *
 * No serial comma: this is a sentence a person reads, not a citation.
 */
export function joinPhrases(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * A choice label landing in the middle of a sentence.
 *
 * The labels are written to stand alone in a list — "Less shedding" — so
 * the capital comes down when one is quoted mid-sentence. "I'm not sure
 * yet" keeps its own, because lowercasing a person's "I" reads as a typo.
 */
export function midSentence(label: string): string {
  return /^I(?![a-z])/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * Their goals as a phrase: "more fullness and less shedding".
 *
 * Only ever what they said they want. Whoever builds the sentence around
 * it owns the harder half — see the closing line of the profile report,
 * where the same list is followed by the reason it is not a promise.
 */
export function goalSentence(goals: HairGoal[]): string {
  return joinPhrases(goals.map((g) => midSentence(HAIR_GOAL_LABELS[g])));
}

/**
 * Their goals in the one line a card has room for.
 *
 * As many as fit, and then a count of the rest. The line under the name
 * on the membership card is small, two lines tall and as wide as a
 * photograph, so a list of five joined with commas would be cut off
 * mid-word by the renderer rather than by us. Counting characters rather
 * than goals is what keeps "knowing whether my routine is working" — the
 * longest thing anybody can tick — from pushing a second label off the
 * end on its own.
 *
 * Nothing is hidden by it: the count says how many are not shown, and
 * the coach reads the whole list back when asked.
 */
export function goalSummary(goals: HairGoal[], budget = 46): string | undefined {
  if (goals.length === 0) return undefined;

  const named: string[] = [];
  let used = 0;

  for (const goal of goals) {
    const label = HAIR_GOAL_LABELS[goal];
    // The first always goes in, however long it is: a card that named
    // none of somebody's goals would be worse than one that names a long
    // one. ", " is the join, hence the two.
    if (named.length > 0 && used + label.length > budget) break;
    named.push(named.length === 0 ? label : midSentence(label));
    used += label.length + 2;
  }

  const rest = goals.length - named.length;
  return joinPhrases(rest > 0 ? [...named, `${rest} more`] : named);
}

/**
 * What the device measured about a photograph at the moment it was taken.
 *
 * Optional, and stays optional. Photographs captured before this existed
 * have no reading, and the honest thing to show for them is nothing —
 * not a zero, and not a re-analysis months later against a file that has
 * since been recompressed.
 */
export type PhotoQuality = {
  /** Mean luminance, 0-255. */
  brightness: number;
  /** Standard deviation of luminance. */
  contrast: number;
  /** Mean absolute Laplacian response; low is soft. */
  sharpness: number;
  /** Fraction of pixels crushed or blown, 0-1. */
  clipped: number;
  /** Named problems, empty when there are none. */
  issues: string[];
};

/**
 * What the on-device hair segmenter measured in a photograph.
 *
 * Area, not density: a mask cannot see between strands, so a thin
 * covering and a thick one over the same region produce the same number.
 * Present only when the native model ran — Expo Go has no TFLite, so
 * photographs taken there carry no reading, and the honest thing to show
 * for them is nothing. Mirrors `Coverage` in features/assessment/hair-mask
 * so the domain types do not depend on a feature module.
 */
export type PhotoCoverage = {
  /** Fraction of the frame the mask claims as hair, 0-1. */
  fraction: number;
  /** Coverage of the upper third of the frame, 0-1. */
  upperFraction: number;
  /** How much of the mask sits above the midline, 0-1. */
  verticalBalance: number;
  /**
   * Share of the mask on the left half, 0-1; 0.5 is even. Optional
   * because it arrived a version later than the other four and older
   * readings do not carry it. The segmenter computes it, and without this
   * field it was being thrown away between the model and the report.
   */
  horizontalBalance?: number;
  /** Pixels counted as hair, so tiny masks can be rejected. */
  pixels: number;
};

/**
 * The shape the segmenter marked, traced from the same mask the figures
 * above were counted on.
 *
 * Kept so the reading can be *shown* on the photograph rather than only
 * printed as a percentage. It is the 0.5 boundary — the same threshold
 * `coverageOf` counts at — and nothing else: no smoothing, no curve
 * fitting, no sub-threshold gradient. Whatever draws this is drawing the
 * counted edge or it is drawing something the numbers do not describe.
 *
 * Still area, not density, for exactly the reason `PhotoCoverage` says:
 * an outline around a region cannot see between the strands inside it.
 *
 * Coordinates are integers in a 1024 box spanning the whole photograph,
 * on both axes independently — `x / 1024` and `y / 1024` are fractions of
 * the stored photograph's width and height. That is a pure axis-wise
 * scale with no crop and no offset, and it holds only because the mask is
 * measured on the same shrunk frame that is persisted; the scanner hands
 * back the shrunk capture from every camera and the analysis measures
 * that file (see features/hair-scan/analysis.ts). 1024 is twice the model's 512,
 * so every vertex lands on an even integer and the conversion is exact.
 *
 * Absent on builds without the native model, on every photograph taken
 * before this existed, and on a mask too fragmented to trace. Every
 * reader has to render the photograph correctly without one.
 */
export type PhotoMaskTrace = {
  /**
   * Closed loops of the 0.5 boundary, `"x,y x,y …"`, the first point
   * implicitly repeated at the end. Outer boundaries and the holes
   * inside them both appear, so this is drawn with an even-odd fill —
   * a gap in the hair is a gap the count already excluded.
   *
   * Empty when the mask came back in too many pieces to trace as one
   * shape. That is a different thing from this whole field being
   * absent, and the two have to be said differently: empty means the
   * mask shattered and the squares below are still good, absent means
   * the photograph predates outlines being kept at all.
   */
  contours: string[];
  /**
   * Open polylines, same encoding: per sampled column, the highest row
   * the mask *held* for a short run of rows. Not the highest row it
   * touched — a strand thinner than the run sits above this line and
   * inside the outline both, by design, because a single stray pixel
   * would otherwise carry the line to the top of the frame. Anything
   * describing this to a person has to describe the weaker claim.
   *
   * Broken where the mask broke, and never joined across a gap — a
   * joined gap would be a line the model did not draw.
   */
  topEdge: string[];
  /**
   * A 16x16 grid as base64 of 256 bytes, each the share of that cell's
   * own area counted as hair, times 255. The 256 values average back to
   * `PhotoCoverage.fraction`: it is the printed figure taken apart, not
   * a second opinion, and emphatically not a map of how much hair is in
   * a place.
   */
  cells: string;
  /** Simplification tolerance actually used, in 1024-box units. */
  tolerance: number;
};

/**
 * The parts of the head the scan report shows a crop of.
 *
 * Names of places on a photograph, never findings about them: `hairline`
 * is the band above the face, the temples are the corners beside it, and
 * `top`/`crown` are the upper part of a frame taken with the head tipped
 * down or from behind.
 */
export type PhotoRegion = 'hairline' | 'leftTemple' | 'rightTemple' | 'crown' | 'top';

/**
 * A rectangle on a photograph, every side a fraction of the image (0–1),
 * `x`/`y` the top-left corner. Clamped to the image when it is written.
 */
export type PhotoRegionRect = { x: number; y: number; w: number; h: number };

export type Photo = {
  id: string;
  sessionId: string;
  angle: Angle;
  /** Full-resolution file on disk. */
  uri: string;
  /** Small pre-scaled file used by lists and grids. */
  thumbnailUri?: string;
  width: number;
  height: number;
  capturedAt: string;
  quality?: PhotoQuality;
  coverage?: PhotoCoverage;
  /**
   * The head's angles when the shutter fired, from the on-device detector,
   * in degrees. A framing fact about the photograph — it is what lets next
   * month's shot be lined up with this one — never a fact about the hair.
   * Absent on blind angles, on builds without the detector, and on every
   * photograph taken before this existed.
   */
  pose?: { yaw: number; pitch: number; roll: number };
  /**
   * How the shutter fired. Absent on photographs from before it was
   * recorded. 'sample' is a development build's simulator stand-in for a
   * camera (see components/capture/sample-camera.tsx); such a photograph
   * also carries its marker in its own pixels. 'scan' is a frame the
   * continuous hair scan kept out of the turn — one the person never saw
   * as a photograph while it was taken (see features/hair-scan/result.ts).
   */
  capture?: 'guided' | 'manual' | 'timer' | 'sample' | 'scan';
  /**
   * The outline of what `coverage` was counted over, if it was kept.
   *
   * Optional for the same reason `horizontalBalance` is: it arrived after
   * photographs had already been stored, and `SCHEMA_VERSION` cannot be
   * bumped to make room for it — the loader discards a blob whose version
   * differs, so a bump would erase every installed journey. Additive and
   * absent is the only safe shape, and absent is the common case.
   *
   * Present with an empty `contours` is not the same as absent: see the
   * note there. Present means a mask was measured on this photograph.
   */
  maskTrace?: PhotoMaskTrace;
  /**
   * Where on this photograph the report's region crops sit, when the
   * scanner had a tracked face at the shutter to place them from.
   *
   * Geometry, not a reading: each rectangle is a band or corner beside
   * the face box the detector held on the live preview, mapped into the
   * still through the same cover-fit the processing screen draws the
   * mesh by (see features/hair-scan/region-crops.ts). Kept so the report
   * can crop the same places when it is reopened months later, when the
   * live mesh is long gone. Additive and absent by the same rule as
   * `maskTrace`: a photograph without it is cropped by a fallback the
   * report marks as approximate, and `SCHEMA_VERSION` is not bumped.
   */
  regions?: Partial<Record<PhotoRegion, PhotoRegionRect>>;
};

export type PhotoSession = {
  id: string;
  journeyId: string;
  capturedAt: string;
  /** True for the very first session, which anchors every comparison. */
  isBaseline: boolean;
  /**
   * What the user calls this update. Absent means the automatic milestone
   * — "Baseline", "Month 3" — which is what every update starts as.
   *
   * Only the name is theirs to set. The date stays the date the shutter
   * fired, because the whole product rests on when a photograph was
   * actually taken, and a record you can backdate is not a record.
   */
  title?: string;
  photos: Photo[];
  note?: string;
  /**
   * What the continuous hair scan recorded about the scan itself, when
   * this session came out of one.
   *
   * Optional and additive, by the same rule as `Photo.maskTrace`: absent
   * on every session written before the scan existed and on every set
   * taken one angle at a time, and `SCHEMA_VERSION` is not bumped for it
   * because the loader discards a blob whose version differs. Every reader
   * has to render a session correctly without it, and the photographs
   * remain ordinary photographs at the five ordinary angles, so Journey,
   * Timeline and Compare are none the wiser.
   */
  scan?: PhotoSessionScan;
};

/**
 * What the scan measured, region by region, in the frame of the person's
 * own face.
 *
 * The stored shape of the hair-scan measurement engine's `ScanMeasurement`
 * (features/hair-scan/measure). It is written out here rather than
 * imported from there for two reasons, and both matter: this file is the
 * bottom of the app and must not import a feature, and a schema that is
 * read back off a phone months later should be pinned in its own words
 * rather than following an internal type wherever it goes.
 * `storedMeasurement` in features/hair-scan/result.ts is the one place
 * the two are checked against each other, and it is a compile error the
 * day they drift.
 *
 * Nothing here is a verdict, a grade or a forecast. `coverage` is the
 * share of a region's counted samples a segmentation mask called hair;
 * `spread` is how much the frames of that one scan disagreed with each
 * other about it, and `confidence` is how much that deserves to be
 * believed. A region the scan could not read is in `unread` and carries
 * no figure at all — absent, never zero.
 */
export type PhotoSessionMeasurement = {
  regions: Partial<Record<ScanMeasureRegion, PhotoSessionRegionMeasurement>>;
  /** Regions this scan could not read well enough to report at all. */
  unread: ScanMeasureRegion[];
  capturedAt: string;
  /**
   * What the masks themselves held: frames measured, their mean and peak
   * value, and the share of pixels the model called hair.
   *
   * Four numbers, diagnostics only, never shown to anybody and never
   * compared. Stored rather than kept in memory because the report is
   * built from the stored measurement, and the one question it answers
   * can only be asked after a scan: a region reading zero coverage and a
   * hundred visible scalp is either a mask with no hair in it or samples
   * landing off the head, and `peak` is what tells those apart.
   *
   * OPTIONAL, and that is the whole of its schema story. A scan measured
   * before this existed simply has none, which is why `SCHEMA_VERSION`
   * does not move: bumping it would discard every stored scan to add a
   * diagnostic.
   */
  maskStats?: {
    frames: number;
    mean: number;
    peak: number;
    hairShare: number;
  };
};

/** The six places on a head the measurement engine reads. */
export type ScanMeasureRegion =
  | 'hairline'
  | 'leftTemple'
  | 'rightTemple'
  | 'midScalp'
  | 'crown'
  | 'partLine';

/** Which landmarks the face coordinates were measured from: what the figures are in units of. */
export type ScanMeasureAnchoring = 'landmarks' | 'partial' | 'box';

export type PhotoSessionRegionMeasurement = {
  region: ScanMeasureRegion;
  /** Share of the region's counted samples the mask called hair, 0–1. */
  coverage: number;
  /** Share it confidently called skin rather than hair, 0–1. */
  visibleScalp: number;
  /** How many frames contributed a reading. */
  frames: number;
  /** How much those frames disagreed: this scan's own error bar. */
  spread: number;
  confidence: number;
  anchoring: ScanMeasureAnchoring;
};

/** How sure the engine is that a difference is a difference at all. */
export type ScanChangeVerdict = 'unchanged' | 'small' | 'moderate' | 'large' | 'insufficient';

/**
 * One region set beside the same region in an earlier scan.
 *
 * `delta` is this scan's coverage minus that one's, and it means nothing
 * at all when the verdict is `insufficient` — which is what the engine
 * says whenever the difference is inside the two scans' combined error
 * bars, or either side read the region in too few frames to have one.
 */
export type PhotoSessionRegionChange = {
  region: ScanMeasureRegion;
  delta: number;
  /** The combined error bar the difference had to beat. */
  noiseFloor: number;
  verdict: ScanChangeVerdict;
  confidence: number;
  /** `mixed` when the two scans were anchored differently, and the floor was widened for it. */
  anchoring: 'same' | 'mixed';
};

/**
 * The scan-level record: facts about the run, and what the device
 * measured off the frames it kept.
 *
 * It began as facts about the turn alone — how long it took, how much of
 * the ring closed, how many frames it kept, what the live lighting
 * reading averaged — and those are still the first five fields. The two
 * additive fields below are the measurement engine's output, and they
 * are here rather than on the photographs because they are not per-
 * photograph facts: a region's figure is read across every frame that
 * showed it, and its error bar IS the disagreement between them. Putting
 * a scan-wide reading on one still would be filing it under a picture it
 * is only partly about.
 *
 * What has not changed is the line: nothing stored here is a verdict
 * about a person. Every figure is a share some loop on this device
 * counted, or a confidence saying how much it deserves to be believed,
 * and a region nobody could read carries no figure.
 */
export type PhotoSessionScan = {
  /** Milliseconds from Start to the ring closing, or to the scan being stopped. */
  durationMs: number;
  /**
   * How much of the ring had filled when the scan ended, 0–1. One means
   * the turn reached every part it asks for; anything less is a scan that
   * was stopped, or that ran out of time, part-way round.
   */
  completion: number;
  /** Frames the scanner kept before curating them down to the angles. */
  frameCount: number;
  /**
   * Mean of the live lighting reading over the scan, 0–1, when the
   * scanner reported one. Null means the lighting lane had nothing to
   * report — not that the light was bad — and the report says so.
   */
  lighting: number | null;
  /** Share of the scan the detector held a face for, 0–1, when tracked. */
  tracked?: number;
  /**
   * What the measurement engine read off this scan's frames, when it
   * could read anything at all.
   *
   * Additive and absent by the same rule as `maskTrace` and `regions` on
   * a photograph: a session saved before the engine existed, or by a
   * build with no segmenter in it, simply has no `measurement`, and
   * `SCHEMA_VERSION` is not bumped for a field that reads as "nobody
   * measured" when it is missing.
   */
  measurement?: PhotoSessionMeasurement;
  /**
   * This scan's regions set beside the most recent earlier scan that
   * carried a measurement of its own, when there was one. Absent on a
   * first scan, and absent when nothing before it was ever measured —
   * there is no comparison to store, rather than a row of zeroes.
   */
  changes?: PhotoSessionRegionChange[];
  /** Shape version of this block, for a future reader. */
  version: 1;
};

/* ------------------------------------------------------------------ */

/** Angles, in capture order, that a session holds no photograph for. */
export function missingAngles(session: Pick<PhotoSession, 'photos'>): Angle[] {
  const held = new Set(session.photos.map((p) => p.angle));
  return ANGLES.filter((angle) => !held.has(angle));
}

/**
 * Whether a session came out of the continuous hair scan.
 *
 * Either mark says so: the scan block the scanner writes, or a
 * photograph whose shutter was the scan's. Both are additive fields, so
 * a session from before the scan existed reads as not a scan, which is
 * what it is.
 */
export function isScanSession(session: Pick<PhotoSession, 'photos' | 'scan'>): boolean {
  return session.scan !== undefined || session.photos.some((p) => p.capture === 'scan');
}

/**
 * The session a new capture extends instead of sitting beside.
 *
 * A baseline from before the hair scan existed could be one photograph,
 * with the other angles taken afterwards, one at a time, into the same
 * session: saved as a session of their own they would be "Day 1", and
 * every comparison from then on would be between one hairline
 * photograph and a set taken an hour later. So such a baseline is
 * "extended" while it still lacks angles and is the only session there
 * is. Once a second session exists the baseline is whatever it was.
 *
 * A scan baseline is never extended. A scan keeps the angles the turn
 * reached, and there is no camera left that takes one angle to order;
 * the next scan is a session of its own, and nothing should nag about
 * the angles a turn did not reach. The rule still matters for the free
 * tier: completing a pre-scan baseline is the same free first session,
 * not a second one.
 *
 * `requestedId` is the explicit route in from Home's baseline card. It
 * is honoured only where the same rule holds for that session: a stale
 * id — the session was deleted, or filled in from another entry — falls
 * back to a plain capture rather than landing photographs in the wrong
 * place.
 */
export function sessionToExtend(
  sessions: PhotoSession[],
  requestedId?: string,
): PhotoSession | null {
  const only = sessions.length === 1 ? sessions[0] : null;
  if (!only?.isBaseline) return null;
  if (isScanSession(only)) return null;
  if (requestedId !== undefined && only.id !== requestedId) return null;
  return missingAngles(only).length > 0 ? only : null;
}

/**
 * The session with the given photographs added for the angles it lacks.
 *
 * A photograph for an angle the session already holds is dropped, so the
 * front photograph the funnel measured is never replaced. `capturedAt`
 * stays the original scan's: that is when the baseline began, and the
 * milestone labels count from it.
 */
export function addMissingAngles(session: PhotoSession, photos: Photo[]): PhotoSession {
  const missing = new Set(missingAngles(session));
  const added: Photo[] = [];
  for (const photo of photos) {
    if (!missing.has(photo.angle)) continue;
    missing.delete(photo.angle);
    added.push(photo);
  }
  if (added.length === 0) return session;
  return { ...session, photos: [...session.photos, ...added] };
}

/**
 * One photograph's record updated in place. Returns the same array when
 * nothing matched, so a reading that arrives after its session was
 * deleted changes nothing.
 */
export function patchPhotoIn(
  sessions: PhotoSession[],
  sessionId: string,
  photoId: string,
  patch: Partial<Omit<Photo, 'id' | 'sessionId'>>,
): PhotoSession[] {
  const session = sessions.find((s) => s.id === sessionId);
  if (!session?.photos.some((p) => p.id === photoId)) return sessions;

  return sessions.map((s) =>
    s === session
      ? { ...s, photos: s.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)) }
      : s,
  );
}

export type RoutineCadence = 'daily' | 'weekly';

/** How often something is done, as the routine screen offers it. */
export const FREQUENCY_OPTIONS = [7, 1, 2, 3, 4, 5] as const;

export const FREQUENCY_LABELS: Record<number, string> = {
  7: 'Every day',
  1: 'Once a week',
  2: 'Twice a week',
  3: '3 times a week',
  4: '4 times a week',
  5: '5 times a week',
  6: '6 times a week',
};

/**
 * How many times a week an item is meant to happen.
 *
 * Daily is seven, which is what makes the rest of the arithmetic work
 * without a special case: a weekly item is simply one with a smaller
 * target, and every number derived from the routine can divide by seven
 * rather than branching on a kind.
 *
 * Anything unrecognised reads as daily, because that is what every item
 * was before frequency existed.
 */
export function weeklyTarget(
  item: Pick<RoutineItem, 'cadence' | 'timesPerWeek'>,
): number {
  if (item.cadence !== 'weekly') return 7;
  const n = item.timesPerWeek ?? 1;
  if (!Number.isFinite(n)) return 1;
  return Math.min(6, Math.max(1, Math.round(n)));
}

/** True for something expected every day, which gates the daily streak. */
export function isDailyItem(
  item: Pick<RoutineItem, 'cadence' | 'timesPerWeek'>,
): boolean {
  return weeklyTarget(item) >= 7;
}

/**
 * The glyph a routine item is shown with. Purely a visual cue so a list
 * is scannable without reading; it carries no meaning about the item.
 */
export type RoutineIcon = 'dropper' | 'pill' | 'capsule' | 'cup' | 'drop';

export const ROUTINE_ICONS: RoutineIcon[] = ['dropper', 'pill', 'capsule', 'cup', 'drop'];

export const ROUTINE_ICON_LABELS: Record<RoutineIcon, string> = {
  dropper: 'Dropper bottle',
  pill: 'Tablet',
  capsule: 'Capsule',
  cup: 'Drink',
  drop: 'Wash or massage',
};

export type RoutineTimeOfDay = 'morning' | 'evening' | 'anytime';

export const TIME_OF_DAY_LABELS: Record<RoutineTimeOfDay, string> = {
  morning: 'Morning',
  evening: 'Evening',
  anytime: 'Anytime',
};

export type RoutineItem = {
  id: string;
  journeyId: string;
  label: string;
  /** Free text; the app never suggests or validates treatments. */
  detail?: string;
  /**
   * Chosen when the item is added. Optional so items saved before icons
   * existed still load; those fall back to a guess from the label.
   */
  icon?: RoutineIcon;
  cadence: RoutineCadence;
  /**
   * Times a week, when the cadence is weekly. Absent on everything that
   * predates frequency, all of which was daily.
   */
  timesPerWeek?: number;
  timeOfDay?: RoutineTimeOfDay;
  /**
   * Times a day this is taken. Absent means once, which is what every
   * item was before doses existed.
   *
   * The app never sets this above one on anybody's behalf. How often a
   * treatment is taken is a dosing decision, and the only honest source
   * for it is whoever prescribed it.
   */
  dosesPerDay?: number;
  /**
   * Key of the product record this item is, when the person entered one.
   * Optional and additive: items made before products existed have none,
   * and absent means "no product". Resolved through `productFor`.
   *
   * The name is historical — it once held a scanned barcode — and is
   * kept because it is what is on disk. See `Product.barcode`.
   */
  productBarcode?: string;
  createdAt: string;
  archivedAt?: string;
};

/** One completion tick. Keyed by item + calendar day. */
export type RoutineLog = {
  id: string;
  routineItemId: string;
  /** YYYY-MM-DD in the device's local time. */
  date: string;
  /** True once every dose for the day is in. */
  completed: boolean;
  /**
   * Doses taken that day. Absent on logs written before doses existed, so
   * read it through `dosesTaken`, which falls back to `completed`.
   */
  doses?: number;
  loggedAt: string;
};

/** The most doses a day the app will track. */
export const MAX_DOSES_PER_DAY = 4;

export const DOSE_OPTIONS = [1, 2, 3, 4];

export const DOSE_LABELS: Record<number, string> = {
  1: 'Once a day',
  2: 'Twice a day',
  3: 'Three times a day',
  4: 'Four times a day',
};

/** Doses a day for an item, clamped and defaulting to one. */
export function doseCount(item: Pick<RoutineItem, 'dosesPerDay'>): number {
  const n = item.dosesPerDay ?? 1;
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_DOSES_PER_DAY, Math.max(1, Math.round(n)));
}

/**
 * Doses recorded by a log, out of `total`.
 *
 * Logs written before doses existed only say completed or not, so those
 * read as all-or-nothing. Clamped, because `total` can drop after the
 * fact if someone changes an item from three times a day to one.
 */
export function dosesTaken(
  log: Pick<RoutineLog, 'doses' | 'completed'> | undefined,
  total: number,
): number {
  if (!log) return 0;
  if (typeof log.doses === 'number' && Number.isFinite(log.doses)) {
    return Math.min(total, Math.max(0, Math.round(log.doses)));
  }
  return log.completed ? total : 0;
}

export type JournalEntry = {
  id: string;
  journeyId: string;
  /** Optional link to the session this note describes. */
  sessionId?: string;
  body: string;
  createdAt: string;
};

/* ------------------------------------------------------------------ */

/**
 * Where a product record came from.
 *
 * Only 'manual' can be written now: a product is something a person
 * types on the routine sheet, and there is no lookup left to write the
 * other value. 'openBeautyFacts' stays in the union because records
 * written by the retired barcode scanner are still on disk, and a type
 * that described only what the app writes today would be a type that
 * lies about what the loader reads.
 */
export type ProductSource = 'openBeautyFacts' | 'manual';

/**
 * A product, as the person typed it.
 *
 * Every field is theirs. The app adds nothing: no rating, no category of
 * its own, no reading of an ingredient list, and — since the barcode
 * scanner and its lookup were removed — no third party's words either.
 * Nothing in this record is fetched, and nothing in it leaves the phone.
 *
 * `barcode` is the key. On a record made now it is a local id generated
 * on this device; on one made by the retired scanner it is the digits
 * that scanner read. The name is kept because it is the persisted field
 * name — `RoutineItem.productBarcode` points at it, and renaming either
 * would orphan every link already written to disk.
 *
 * LEGACY FIELDS. `ingredientsText`, `imageUrl`, `thumbnailUrl` and
 * `analysisTags` were only ever written by the lookup. Nothing writes
 * them now and the shelf no longer reads any of them, so no attribution
 * is owed for them and no image is fetched to draw one. They stay in the
 * type because an install upgraded from an earlier build still holds
 * them; see the note in features/products/shelf.ts.
 */
export type Product = {
  barcode: string;
  source: ProductSource;
  /** As typed. Never rewritten by the app. */
  name: string;
  /** As typed. */
  brand?: string;
  /** e.g. "200 ml", as printed on the bottle. */
  quantity?: string;
  /** LEGACY. Ingredient text the retired lookup stored. Never read now. */
  ingredientsText?: string;
  /** LEGACY. Remote product photo the retired lookup stored. Never read now. */
  imageUrl?: string;
  /** LEGACY. Remote thumbnail the retired lookup stored. Never read now. */
  thumbnailUrl?: string;
  /** LEGACY. Database tags the retired lookup stored. Never read now. */
  analysisTags?: string[];
  /**
   * When this record was made: typed in, on one written now; fetched, on
   * one the retired scanner wrote. The shelf shows it, and reads `source`
   * to say which of the two it is rather than calling both "typed in".
   */
  fetchedAt: string;
};

/** The products list with `next` in place of any record sharing its barcode. */
export function upsertProduct(products: Product[], next: Product): Product[] {
  const index = products.findIndex((p) => p.barcode === next.barcode);
  if (index === -1) return [...products, next];
  return products.map((p, i) => (i === index ? next : p));
}

/** The item with no product linked. Returns the same item when none was. */
export function withoutProduct(item: RoutineItem): RoutineItem {
  if (item.productBarcode === undefined) return item;
  const rest = { ...item };
  delete rest.productBarcode;
  return rest;
}

/* ------------------------------------------------------------------ */

/** Everything the app persists locally, versioned for future migration. */
export type AppData = {
  schemaVersion: number;
  profile: Profile | null;
  journey: Journey | null;
  sessions: PhotoSession[];
  routineItems: RoutineItem[];
  routineLogs: RoutineLog[];
  journal: JournalEntry[];
  products: Product[];
  onboardingCompletedAt: string | null;
};

/**
 * Bumped for the funnel: a journey now records what the person said they
 * want and where they are starting from, and the old three-question shape
 * cannot be filled in after the fact.
 *
 * NOT bumped for products. The loader in app-store.tsx discards storage
 * whose version differs, so a bump would erase every installed journey.
 * `products` and `RoutineItem.productBarcode` are additive: a record saved
 * before they existed reads `products` as [] from the EMPTY_DATA spread.
 *
 * NOT bumped for `Photo.maskTrace` either, for the same reason and by the
 * same rule: a new field on a record is additive, reads as `undefined` on
 * everything written before it, and every screen that shows one already
 * has to handle its absence. A field that could not be read as absent
 * would be the case for a bump — and would still cost every journey.
 *
 * NOT bumped for `PhotoSession.scan` or `Photo.capture: 'scan'` either,
 * by the same rule again — nor for `Photo.regions`, which the report
 * reads as "crop by the fallback" when it is absent.
 *
 * NOT bumped for the self-knowledge answers (`Journey.hairType` through
 * `heatStyling`, and `Profile.ageBand`): every one is optional, absent
 * means unanswered, and `migrateJourney` drops a value the app no longer
 * offers instead of crashing on it.
 */
export const SCHEMA_VERSION = 2;

export const EMPTY_DATA: AppData = {
  schemaVersion: SCHEMA_VERSION,
  profile: null,
  journey: null,
  sessions: [],
  routineItems: [],
  routineLogs: [],
  journal: [],
  products: [],
  onboardingCompletedAt: null,
};

/**
 * One journey, brought forward to the shape this version reads.
 *
 * The goal question used to take a single answer and now takes several,
 * so a journey saved by the old version carries `goal: 'hairline'` and no
 * `goals`. It has to come out of here reading as one selected goal —
 * somebody who updates mid-journey opens the app and finds what they
 * said, not an empty line where it was.
 *
 * The old field is dropped once it has been folded in: one place a goal
 * lives, so the two cannot drift apart the day somebody changes theirs.
 */
export function migrateJourney(journey: Journey): Journey {
  const next: Journey = { ...journey, goals: journeyGoals(journey) };
  delete next.goal;

  /*
    The self-knowledge answers: a value the app no longer offers is
    dropped rather than carried to a label table that would crash on it.
    Only fields that are present are touched — an absent answer stays
    absent, so a journey from before the questions existed comes out
    exactly as it went in, with no new keys.
  */
  const record = next as Record<string, unknown>;
  // Entries of a union of tables: each is read as a plain table of strings.
  const lists = Object.entries(JOURNEY_LIST_ANSWERS) as [string, Record<string, string>][];
  const choices = Object.entries(JOURNEY_CHOICE_ANSWERS) as [string, Record<string, string>][];
  for (const [field, labels] of lists) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    record[field] = knownChoices(record[field], labels);
  }
  for (const [field, labels] of choices) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    if (knownChoice(record[field], labels) === undefined) delete record[field];
  }
  return next;
}

/**
 * One profile, brought forward by the same rule: an age band the app
 * never offered is dropped; everything else, including a typed `age`,
 * is left exactly as it was.
 */
export function migrateProfile(profile: Profile): Profile {
  if (!Object.prototype.hasOwnProperty.call(profile, 'ageBand')) return profile;
  if (profileAgeBand({ ageBand: profile.ageBand }) !== undefined) return profile;
  const next = { ...profile };
  delete next.ageBand;
  return next;
}

/* ------------------------------------------------------------------ */
/*
  Saving the funnel one answer at a time.

  The funnel used to hold every answer in screen state and write a journey
  once, at the end. Now each page saves what it was told as it is told, so
  a person who closes the app on question nine finds their answers on
  question nine. The first answer creates the profile and journey it lands
  on; every later one merges in. Nothing here touches
  `onboardingCompletedAt`, so a journey with answers and no completion
  stamp is a funnel in progress, and `hasJourney` still says so.
*/

/** What one funnel page can set. Either half may be absent. */
export type FunnelAnswer = {
  profile?: Partial<Pick<Profile, 'displayName' | 'age' | 'ageBand' | 'gender' | 'avatarUri'>>;
  journey?: Partial<Omit<Journey, 'id' | 'profileId' | 'createdAt'>>;
};

/** Days between reminders before the person has chosen. */
export const DEFAULT_UPDATE_INTERVAL_DAYS = 30;

/** A journey with nothing answered yet, for the first answer to land on. */
export function emptyJourney(id: string, profileId: string, now: string): Journey {
  return {
    id,
    profileId,
    startedAt: now,
    trackingAreas: [],
    motivations: [],
    goals: [],
    triggers: [],
    approaches: [],
    updateIntervalDays: DEFAULT_UPDATE_INTERVAL_DAYS,
    createdAt: now,
  };
}

/** Ids and a timestamp for records `withAnswer` may have to create. */
export type FreshRecords = { profileId: string; journeyId: string; now: string };

/**
 * The data with one answer merged in.
 *
 * Creates the profile and journey when there are none yet — ids and the
 * timestamp come from `fresh`, so this stays a pure function the tests
 * can pin — and otherwise merges into what is there. Answers go through
 * the same validation as a record off disk, so an unknown value is
 * dropped at the moment it is written rather than the next time the app
 * loads; and a single `goal`, which the main-goal page still sets, is
 * folded into `goals` here the way the loader folds it.
 *
 * A display name is trimmed, and an empty one keeps whatever name was
 * there before: a person who clears the field and moves on has not
 * renamed themselves to nothing.
 */
export function withAnswer(data: AppData, answer: FunnelAnswer, fresh: FreshRecords): AppData {
  const profile: Profile = data.profile ?? {
    id: fresh.profileId,
    displayName: 'You',
    createdAt: fresh.now,
  };
  const journey: Journey = data.journey ?? emptyJourney(fresh.journeyId, profile.id, fresh.now);

  let nextProfile = profile;
  if (answer.profile) {
    const { displayName, ...rest } = answer.profile;
    const trimmed = displayName?.trim();
    nextProfile = migrateProfile({
      ...profile,
      ...rest,
      displayName: trimmed || profile.displayName,
    });
  }

  let nextJourney = journey;
  if (answer.journey) {
    const patch = { ...answer.journey };
    // The main-goal page picks one; `goals` is where every reader looks.
    if (patch.goal !== undefined && patch.goals === undefined) {
      const goal = knownChoice(patch.goal, HAIR_GOAL_LABELS);
      patch.goals = goal ? [goal] : [];
    }
    nextJourney = migrateJourney({ ...journey, ...patch });
  }

  return { ...data, profile: nextProfile, journey: nextJourney };
}

/**
 * Whatever was on disk, as data this version can render — or null.
 *
 * "Start clean" stays the only honest answer to a record written by a
 * version that kept different things, which is what the version check
 * is for. What it is *not* for is a field that can still be read: the
 * note on SCHEMA_VERSION explains that a bump erases every installed
 * journey, so the goal question took the other route, and the old shape
 * is folded into the new one here on the way in.
 */
export function migrateStoredData(parsed: unknown): AppData | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const stored = parsed as Partial<AppData>;
  if (stored.schemaVersion !== SCHEMA_VERSION) return null;

  // Fields added since the blob was written read their default from
  // EMPTY_DATA; fields whose shape changed are migrated by hand.
  const data: AppData = { ...EMPTY_DATA, ...stored };
  return {
    ...data,
    profile: data.profile ? migrateProfile(data.profile) : null,
    journey: data.journey ? migrateJourney(data.journey) : null,
  };
}
