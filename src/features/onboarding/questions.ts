/**
 * The funnel's questions, as data.
 *
 * One table the screen walks with one state machine: welcome, the
 * mascot, a name, then the questions in Lóvi's order with the "great
 * start" beat where theirs sits, the notifications ask, and the scan
 * invitation. Each question says how it is drawn (`kind`), what it asks
 * (`title`, with the one word the bubble colours), why (`subtitle`, or
 * nothing), what can be ticked, and where the answer goes (`save`) — so
 * the screen knows nothing about any particular question and a question
 * can be reordered or reworded here without touching layout code.
 *
 * Every question asks what the person knows about themselves. The
 * options are the labels of choices, recorded as chosen and read back
 * in those words; none is a reading the app took, and none is turned
 * into one. The subtitles explain why a question is asked without
 * promising what the answer will do.
 *
 * Answers are saved as they are given (`answerPatch` → the store's
 * `saveAnswer`), which is what lets a killed app come back to the same
 * page: `resumeIndex` reads the record and lands one step past the
 * furthest answer it finds. A withheld answer is written down as
 * withheld (an empty list), so it counts as given and is not asked again.
 */

import type { IconName } from '@/components/ui/icon';
import {
  AGE_BAND_LABELS,
  BUDGET_LABELS,
  GENDER_LABELS,
  HAIR_CONCERN_LABELS,
  HAIR_TYPE_DESCRIPTIONS,
  HAIR_TYPE_LABELS,
  HAIR_WEARING_LABELS,
  HEAT_STYLING_LABELS,
  INGREDIENT_REACTION_LABELS,
  LIFE_FACTOR_LABELS,
  PRODUCT_FACTOR_LABELS,
  SCALP_CONDITION_LABELS,
  SCALP_SENSITIVITY_DESCRIPTIONS,
  SCALP_SENSITIVITY_LABELS,
  SCALP_TYPE_DESCRIPTIONS,
  SCALP_TYPE_LABELS,
  journeyGoals,
} from '@/types/domain';
import type {
  AgeBand,
  AppData,
  Budget,
  FunnelAnswer,
  Gender,
  HairConcern,
  HairType,
  HairWearing,
  HeatStyling,
  IngredientReaction,
  Journey,
  LifeFactor,
  ProductFactor,
  Profile,
  ScalpCondition,
  ScalpSensitivity,
  ScalpType,
} from '@/types/domain';

import { APPROACH_CHOICES, ASKS_MEDICATION, ONSET_CHOICES, funnelContent } from './script';

/* ------------------------------- shapes -------------------------------- */

/** How a question's options are drawn — the reference's four shapes. */
export type QuestionKind =
  /** White pill rows, label only. */
  | 'pill'
  /** Rows with an outline icon, a title and a grey description. */
  | 'row'
  /** Full-width rows with an outline icon, a label and a circle check on the right. */
  | 'checkRows'
  /** Two-column cards with an icon, a label and a circle check. */
  | 'cards'
  /** Two-column text cards: a label, sub-examples and a circle check. */
  | 'textCards';

/** The mascot beside the bubble. */
export type MascotExpression = 'smile' | 'wink' | 'calm' | 'writing';

/** The coloured disc behind a row's icon, where the reference tints one. */
export type OptionTint = 'none' | 'accent' | 'warm' | 'cool' | 'dark';

/**
 * Glyphs the icon set does not carry, drawn by the funnel screen itself:
 * the feather the reference sets beside "sensitive", the four hair
 * shapes, the two gender signs, and a few scalp textures.
 */
export const CUSTOM_GLYPHS = [
  'feather',
  'hairStraight',
  'hairWavy',
  'hairCurly',
  'hairCoily',
  'genderFemale',
  'genderMale',
  'scalpDry',
  'scalpNormal',
  'scalpCombination',
  'flakes',
  'strandBreak',
  'frizz',
] as const;

export type CustomGlyph = (typeof CUSTOM_GLYPHS)[number];
export type FunnelGlyph = IconName | CustomGlyph;

export function isCustomGlyph(glyph: FunnelGlyph): glyph is CustomGlyph {
  return (CUSTOM_GLYPHS as readonly string[]).includes(glyph);
}

export type QuestionOption = {
  value: string;
  label: string;
  /** The grey line under a row's title, or the sub-examples on a text card. */
  description?: string;
  icon?: FunnelGlyph;
  tint?: OptionTint;
};

export type QuestionId =
  | 'age'
  | 'gender'
  | 'hairType'
  | 'hairWearing'
  | 'scalpType'
  | 'scalpSensitivity'
  | 'goal'
  | 'concerns'
  | 'noticed'
  | 'approaches'
  | 'medications'
  | 'budget'
  | 'productFactors'
  | 'ingredientReactions'
  | 'scalpConditions'
  | 'lifeFactors'
  | 'heatStyling';

/** Where an answer is written. The store validates the value on the way in. */
export type SaveTarget =
  | { record: 'profile'; field: 'ageBand' | 'gender' }
  | {
      record: 'journey';
      field:
        | 'hairType'
        | 'hairWearing'
        | 'scalpType'
        | 'scalpSensitivity'
        | 'goal'
        | 'concerns'
        | 'noticed'
        | 'approaches'
        | 'medications'
        | 'budget'
        | 'productFactors'
        | 'ingredientReactions'
        | 'scalpConditions'
        | 'lifeFactors'
        | 'heatStyling';
    };

export type Question = {
  id: QuestionId;
  kind: QuestionKind;
  /** The headline in the bubble. */
  title: string;
  /** The one word (or two) of the title the bubble sets in the accent colour. */
  accent: string;
  /** One grey line under the headline saying why, where a why earns its place. */
  subtitle?: string;
  expression: MascotExpression;
  multi: boolean;
  /** For a multi question: ticking this clears the rest, and the rest clear it. */
  exclusive?: string;
  /**
   * The options — or, for the two questions the female funnel words
   * differently, where they come from. Read through `optionsOf`.
   */
  options: QuestionOption[] | ((gender: Gender) => QuestionOption[]);
  save: SaveTarget;
  /**
   * For a multi question whose record has no value for "none of these":
   * the exclusive option that stands for it. Ticking it saves an empty
   * list, and an empty list on record reads back as it ticked — so the
   * row shows as chosen, the page reads as answered, and the store never
   * sees a value its table does not hold.
   */
  emptyAs?: string;
  /**
   * For the one question a person may withhold: the way past beneath
   * the bar. The medication question is theirs not to answer, and
   * withholding it saves an empty list — on record as withheld, so it is
   * not asked again on every return, and nothing in it is a choice.
   */
  skip?: string;
};

/** How long a chosen row shows as chosen before a single-choice page moves on. */
export const SELECT_SETTLE_MS = 180;

/* ------------------------------- options ------------------------------- */

function fromLabels<T extends string>(labels: Record<T, string>): QuestionOption[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

/**
 * The self-knowledge questions' descriptions that are not in the domain
 * tables: the shelves each budget tier means, and the names an ingredient
 * hides behind on a label. Neither says anything about anybody's hair.
 */
/*
  The four tiers with the money in them.

  The owner's note after the Phase 4 walk: four tiers named and nothing
  else made the page read as though the app were embarrassed to mention
  price. A tier is only a comparison if the reader can see what separates
  one from the next, so each line now opens with the bracket it means and
  then says which shelf that is.

  The numbers are the brackets the owner set (H.2, 2026-09-17), in US
  dollars, per product — a guide to what the tier means, not a price the
  app has looked up, and nothing is sold here. They are written as plain
  text rather than through a currency formatter for exactly that reason:
  a formatted price implies a figure that came from somewhere.
*/
const BUDGET_DESCRIPTIONS: Record<Budget, string> = {
  everyday: 'Under $15 a product · supermarket and pharmacy shelves',
  midRange: '$15–40 a product · salon brands and the better pharmacy lines',
  premium: '$40–90 a product · specialist lines and clinic-sold products',
  luxury: '$90 and up · whatever it costs',
};

const BUDGET_TINTS: Record<Budget, OptionTint> = {
  everyday: 'accent',
  midRange: 'warm',
  premium: 'cool',
  luxury: 'dark',
};

const BUDGET_ICONS: Record<Budget, FunnelGlyph> = {
  everyday: 'leaf',
  midRange: 'drop',
  premium: 'star',
  luxury: 'sparkle',
};

/*
  The fragrance row's wording (H.3) is INGREDIENT_REACTION_LABELS' own
  now, not an override laid over it here.

  It was an override for one build, and that was the bug: the funnel drew
  "Fragrance (listed as parfum)" while every screen that reads an answer
  back — the shelf, the report's paragraph — quoted the table's
  "Fragrance/parfum", so the report attributed to somebody words they had
  never been offered. A funnel answer is echoed as its label, which only
  works while there is one label. So the wording moved to the table and
  this file reads it like every other row.
*/

const REACTION_EXAMPLES: Partial<Record<IngredientReaction, string>> = {
  sulfates: 'e.g. SLS, SLES',
  // The label carries the term now, so the line under it says where it
  // is found rather than saying "parfum" a second time.
  fragrance: 'The scent added to a product',
  essentialOils: 'e.g. rosemary, tea tree, peppermint',
  alcohols: 'e.g. denatured alcohol, alcohol denat.',
  hairDye: 'Permanent or semi-permanent colour',
  smoothingTreatments: 'Salon straightening or smoothing',
};

const CONCERN_ICONS: Record<HairConcern, FunnelGlyph> = {
  moreScalpShowing: 'follicle',
  shedding: 'drop',
  breakage: 'strandBreak',
  dryness: 'sun',
  oilyRoots: 'glass',
  dandruff: 'flakes',
  itchOrIrritation: 'flame',
  greying: 'moon',
  frizz: 'frizz',
};

const FACTOR_ICONS: Record<ProductFactor, FunnelGlyph> = {
  sulfateFree: 'bottle',
  siliconeFree: 'drop',
  fragranceFree: 'leaf',
  parabenFree: 'shield',
  vegan: 'leaf',
  crueltyFree: 'heart',
  noPreference: 'circle',
};

const HAIR_TYPE_ICONS: Record<HairType, FunnelGlyph> = {
  straight: 'hairStraight',
  wavy: 'hairWavy',
  curly: 'hairCurly',
  coily: 'hairCoily',
};

const SCALP_TYPE_ICONS: Record<ScalpType, FunnelGlyph> = {
  oily: 'drop',
  dry: 'scalpDry',
  normal: 'scalpNormal',
  combination: 'scalpCombination',
};

// The reference's pair: a feather for the scalp that reacts, a shield for the one that does not.
const SENSITIVITY_ICONS: Record<ScalpSensitivity, FunnelGlyph> = {
  sensitive: 'feather',
  notSensitive: 'shield',
};

const GENDER_ICONS: Record<Gender, FunnelGlyph> = {
  female: 'genderFemale',
  male: 'genderMale',
};

const withKeyed = <T extends string>(
  labels: Record<T, string>,
  icons?: Record<T, FunnelGlyph>,
  descriptions?: Partial<Record<T, string>>,
  tints?: Record<T, OptionTint>,
): QuestionOption[] =>
  (Object.keys(labels) as T[]).map((value) => ({
    value,
    label: labels[value],
    ...(icons ? { icon: icons[value] } : {}),
    ...(descriptions?.[value] ? { description: descriptions[value] } : {}),
    ...(tints ? { tint: tints[value] } : {}),
  }));

/* ------------------------------ the questions ------------------------------ */

/** The value of a "none of these" row the record has no word for. */
const NONE = 'none';

/**
 * The order is Lóvi's: who you are, then your hair and scalp as you
 * know them, a beat, then what you hope for and notice, what you have
 * tried, and the product and life questions that let the shelf and the
 * coach speak in your own terms.
 */
export const QUESTIONS: Question[] = [
  {
    id: 'age',
    kind: 'pill',
    title: 'Which age band are you in?',
    accent: 'age band',
    subtitle: 'A band is enough — nothing here needs the exact number.',
    expression: 'smile',
    multi: false,
    options: fromLabels<AgeBand>(AGE_BAND_LABELS),
    save: { record: 'profile', field: 'ageBand' },
  },
  {
    id: 'gender',
    kind: 'row',
    title: 'Which set of questions fits you?',
    accent: 'fits you',
    subtitle: 'This chooses the example photographs and the wording of a few questions, nothing more.',
    expression: 'writing',
    multi: false,
    options: withKeyed<Gender>(GENDER_LABELS, GENDER_ICONS),
    save: { record: 'profile', field: 'gender' },
  },
  {
    id: 'hairType',
    kind: 'row',
    title: 'How does your hair usually fall?',
    accent: 'hair',
    subtitle: 'In your own estimate — there is no wrong answer.',
    expression: 'smile',
    multi: false,
    options: withKeyed<HairType>(HAIR_TYPE_LABELS, HAIR_TYPE_ICONS, HAIR_TYPE_DESCRIPTIONS),
    save: { record: 'journey', field: 'hairType' },
  },
  {
    /*
      Beside the hair-type question because it is the same kind of
      question — how your hair is, in your own words — and because the
      two are answered in one breath.

      It is also the one funnel answer the measurement side of the app
      has a use for. A parting is a bright stripe of scalp with hair
      either side, which makes it the highest-contrast thing on a head
      and the only one worth trying to find in a mask. Half the people
      using this app have no parting at all, and a detector that is
      asked to look anyway will eventually find one in a shadow. So the
      question is asked here, of the person, rather than guessed there,
      from the pixels — and "no defined part" or "short all over" is an
      answer that stands, not a gap to be filled in later.
    */
    id: 'hairWearing',
    kind: 'pill',
    title: 'How do you usually wear your hair?',
    accent: 'wear your hair',
    subtitle: 'However it falls most days — not how it looks today.',
    expression: 'smile',
    multi: false,
    options: fromLabels<HairWearing>(HAIR_WEARING_LABELS),
    save: { record: 'journey', field: 'hairWearing' },
  },
  {
    id: 'scalpType',
    kind: 'row',
    title: 'How does your scalp feel between washes?',
    accent: 'scalp',
    expression: 'writing',
    multi: false,
    options: withKeyed<ScalpType>(SCALP_TYPE_LABELS, SCALP_TYPE_ICONS, SCALP_TYPE_DESCRIPTIONS),
    save: { record: 'journey', field: 'scalpType' },
  },
  {
    id: 'scalpSensitivity',
    kind: 'row',
    title: 'Has your scalp reacted to products before?',
    accent: 'reacted',
    expression: 'calm',
    multi: false,
    options: withKeyed<ScalpSensitivity>(
      SCALP_SENSITIVITY_LABELS,
      SENSITIVITY_ICONS,
      SCALP_SENSITIVITY_DESCRIPTIONS,
    ),
    save: { record: 'journey', field: 'scalpSensitivity' },
  },
  {
    id: 'goal',
    kind: 'pill',
    title: 'What are you hoping for most?',
    accent: 'hoping for',
    subtitle: 'Pick the one that matters most. It is kept in your words.',
    expression: 'wink',
    multi: false,
    // The lists the funnel has always used, worded for whoever is answering.
    options: (gender) => funnelContent(gender).goals.map(({ value, label }) => ({ value, label })),
    save: { record: 'journey', field: 'goal' },
  },
  {
    id: 'concerns',
    // The reference's shape for this page: full-width rows, a check on the right.
    kind: 'checkRows',
    title: 'Anything else you notice about your hair?',
    accent: 'notice',
    subtitle: 'Tick whatever applies.',
    expression: 'smile',
    multi: true,
    exclusive: NONE,
    emptyAs: NONE,
    options: [
      ...withKeyed<HairConcern>(HAIR_CONCERN_LABELS, CONCERN_ICONS),
      // The way past, as a row of its own: the record holds no value for it.
      { value: NONE, label: 'Nothing else', icon: 'circle' },
    ],
    save: { record: 'journey', field: 'concerns' },
  },
  {
    id: 'noticed',
    kind: 'pill',
    title: 'When did you first notice something changing?',
    accent: 'first notice',
    expression: 'calm',
    multi: false,
    options: ONSET_CHOICES.map(({ value, label }) => ({ value, label })),
    save: { record: 'journey', field: 'noticed' },
  },
  {
    id: 'approaches',
    kind: 'cards',
    title: 'What have you tried so far?',
    accent: 'tried',
    subtitle: 'Only what you already do. Nothing here is being suggested.',
    expression: 'writing',
    multi: true,
    options: APPROACH_CHOICES.map(({ value, label, icon }) => ({
      value,
      label,
      icon: icon as FunnelGlyph | undefined,
    })),
    save: { record: 'journey', field: 'approaches' },
  },
  {
    id: 'medications',
    kind: 'row',
    title: 'Are you using anything for your hair?',
    accent: 'using',
    subtitle: 'Yours to skip. It only names what is already on your shelf.',
    expression: 'calm',
    multi: true,
    exclusive: 'none',
    options: (gender) =>
      funnelContent(gender).medications.map(({ value, label, detail, icon }) => ({
        value,
        label,
        ...(detail ? { description: detail } : {}),
        icon: icon as FunnelGlyph | undefined,
      })),
    save: { record: 'journey', field: 'medications' },
    skip: 'Prefer not to say',
  },
  {
    id: 'budget',
    kind: 'row',
    title: 'What do you usually spend on hair products?',
    accent: 'spend',
    subtitle: 'Tiers, not sums — a range is all that is written down.',
    expression: 'smile',
    multi: false,
    options: withKeyed<Budget>(BUDGET_LABELS, BUDGET_ICONS, BUDGET_DESCRIPTIONS, BUDGET_TINTS),
    save: { record: 'journey', field: 'budget' },
  },
  {
    id: 'productFactors',
    kind: 'cards',
    title: 'What matters to you in a product?',
    accent: 'matters',
    expression: 'wink',
    multi: true,
    exclusive: 'noPreference',
    options: withKeyed<ProductFactor>(PRODUCT_FACTOR_LABELS, FACTOR_ICONS),
    save: { record: 'journey', field: 'productFactors' },
  },
  {
    id: 'ingredientReactions',
    kind: 'textCards',
    title: 'Have you ever reacted to any of these?',
    accent: 'reacted',
    subtitle: 'Only what you already know about yourself.',
    expression: 'calm',
    multi: true,
    exclusive: 'none',
    options: withKeyed<IngredientReaction>(INGREDIENT_REACTION_LABELS, undefined, REACTION_EXAMPLES),
    save: { record: 'journey', field: 'ingredientReactions' },
  },
  {
    id: 'scalpConditions',
    kind: 'textCards',
    title: 'Has a professional ever told you about any of these?',
    accent: 'professional',
    subtitle: 'Only what you have already been told by someone qualified to say.',
    expression: 'writing',
    multi: true,
    exclusive: 'none',
    options: fromLabels<ScalpCondition>(SCALP_CONDITION_LABELS),
    save: { record: 'journey', field: 'scalpConditions' },
  },
  {
    id: 'lifeFactors',
    kind: 'textCards',
    title: 'Is anything like this going on for you?',
    accent: 'going on',
    subtitle: 'Written down beside the record, and nothing more.',
    expression: 'calm',
    multi: true,
    exclusive: 'none',
    options: fromLabels<LifeFactor>(LIFE_FACTOR_LABELS),
    save: { record: 'journey', field: 'lifeFactors' },
  },
  {
    id: 'heatStyling',
    kind: 'pill',
    title: 'How often do you use heat on your hair?',
    accent: 'heat',
    expression: 'smile',
    multi: false,
    options: fromLabels<HeatStyling>(HEAT_STYLING_LABELS),
    save: { record: 'journey', field: 'heatStyling' },
  },
];

export function questionById(id: QuestionId): Question {
  const found = QUESTIONS.find((q) => q.id === id);
  if (!found) throw new Error(`No funnel question "${id}".`);
  return found;
}

/** The options for whoever is answering. */
export function optionsOf(question: Question, gender: Gender): QuestionOption[] {
  return typeof question.options === 'function' ? question.options(gender) : question.options;
}

/* -------------------------------- steps -------------------------------- */

export type FunnelStep =
  | { kind: 'welcome'; id: 'welcome' }
  | { kind: 'intro'; id: 'intro' }
  | { kind: 'name'; id: 'name' }
  | { kind: 'question'; id: QuestionId; question: Question }
  | { kind: 'interstitial'; id: 'interstitial' }
  | { kind: 'notifications'; id: 'notifications' }
  | { kind: 'invite'; id: 'invite' };

const question = (id: QuestionId): FunnelStep => ({ kind: 'question', id, question: questionById(id) });

/**
 * Every step, in order. The interstitial sits after the sensitivity
 * question, where the reference puts its own; the scan invitation is the
 * last page the funnel owns.
 */
export const FUNNEL_STEPS: FunnelStep[] = [
  { kind: 'welcome', id: 'welcome' },
  { kind: 'intro', id: 'intro' },
  { kind: 'name', id: 'name' },
  question('age'),
  question('gender'),
  question('hairType'),
  question('hairWearing'),
  question('scalpType'),
  question('scalpSensitivity'),
  { kind: 'interstitial', id: 'interstitial' },
  question('goal'),
  question('concerns'),
  question('noticed'),
  question('approaches'),
  question('medications'),
  question('budget'),
  question('productFactors'),
  question('ingredientReactions'),
  question('scalpConditions'),
  question('lifeFactors'),
  question('heatStyling'),
  { kind: 'notifications', id: 'notifications' },
  { kind: 'invite', id: 'invite' },
];

/**
 * The steps this person walks.
 *
 * The medication question only appears for somebody whose answer to
 * "what have you tried" makes it worth asking — a list of drugs put in
 * front of somebody who has just said they do nothing reads as a
 * suggestion. The notifications page appears once per install: the
 * system prompt can only be shown once, and the report's own offer
 * reads the same flag.
 */
export function funnelSteps(
  journey: Pick<Journey, 'approaches'> | null,
  { askReminders }: { askReminders: boolean },
): FunnelStep[] {
  const asksMedication = (journey?.approaches ?? []).some((a) => ASKS_MEDICATION.includes(a));
  return FUNNEL_STEPS.filter((step) => {
    if (step.id === 'medications') return asksMedication;
    if (step.id === 'notifications') return askReminders;
    return true;
  });
}

/* ------------------------------- answers ------------------------------- */

/** The name the store holds when a profile was created by some other answer first. */
const PLACEHOLDER_NAME = 'You';

/** The name they gave, or nothing — never the store's placeholder. */
export function profileName(profile: Pick<Profile, 'displayName'> | null): string {
  const name = profile?.displayName.trim() ?? '';
  return name === PLACEHOLDER_NAME ? '' : name;
}

/**
 * What the record holds for a question: the chosen values, or null when
 * it has not been answered.
 *
 * An empty list is an answer only where the question writes one on
 * purpose: the "none of these" row (`emptyAs`) reads back as that row
 * ticked, and a withheld answer (`skip`) reads back as answered with
 * nothing chosen. Anywhere else an empty list is the store's own default
 * (a fresh journey starts with `approaches: []`), not something the
 * person said, so it reads as unanswered and the funnel does not skip
 * the question.
 */
export function answerOf(
  question: Question,
  data: Pick<AppData, 'profile' | 'journey'>,
): string[] | null {
  const { save } = question;
  if (save.record === 'profile') {
    const value = data.profile?.[save.field];
    return value === undefined ? null : [value];
  }
  const journey = data.journey;
  if (!journey) return null;
  if (save.field === 'goal') {
    const goals = journeyGoals(journey);
    return goals.length > 0 ? [goals[0]] : null;
  }
  const value = journey[save.field];
  if (value === undefined) return null;
  if (!Array.isArray(value)) return [value];
  if (value.length > 0) return value;
  if (question.emptyAs !== undefined) return [question.emptyAs];
  return question.skip !== undefined ? [] : null;
}

/**
 * One question's answer as the store takes it.
 *
 * The values arrive as strings and are written under the question's
 * field; the store's `withAnswer` validates them against the label table
 * on the way in, so a value the app never offered is dropped there
 * rather than typed away here. The one value the table never held — the
 * "none of these" row — is written as the empty list it stands for.
 */
export function answerPatch(question: Question, values: string[]): FunnelAnswer {
  const { save } = question;
  const chosen =
    question.emptyAs !== undefined && values.includes(question.emptyAs) ? [] : values;
  const value: unknown = question.multi ? chosen : chosen[0];
  if (save.record === 'profile') {
    return { profile: { [save.field]: value } as FunnelAnswer['profile'] };
  }
  return { journey: { [save.field]: value } as FunnelAnswer['journey'] };
}

/** Toggle one value in a multi answer, honouring the exclusive choice. */
export function toggleChoice(selected: string[], value: string, exclusive?: string): string[] {
  if (exclusive !== undefined && value === exclusive) {
    return selected.includes(value) ? [] : [value];
  }
  const rest = selected.filter((v) => v !== exclusive);
  return rest.includes(value) ? rest.filter((v) => v !== value) : [...rest, value];
}

/**
 * Where a funnel picks up.
 *
 * Nothing on record means the welcome page. Otherwise the person lands
 * one step past the furthest answer the record holds — the interstitial
 * after the sensitivity question, the notifications page after the last
 * question — so a killed app comes back where it was. A withheld
 * medication answer is on record as withheld, so it counts as far as any
 * other and is not put in front of them again.
 */
export function resumeIndex(
  steps: FunnelStep[],
  data: Pick<AppData, 'profile' | 'journey'>,
): number {
  if (!data.journey && !profileName(data.profile)) return 0;
  let furthest = -1;
  steps.forEach((step, index) => {
    if (step.kind === 'name' && profileName(data.profile)) furthest = index;
    if (step.kind === 'question' && answerOf(step.question, data) !== null) furthest = index;
  });
  if (furthest < 0) return 0;
  return Math.min(furthest + 1, steps.length - 1);
}
