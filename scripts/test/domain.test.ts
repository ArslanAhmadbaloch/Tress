/**
 * The self-knowledge answers and the rules that keep them safe on disk.
 *
 * Every one of these fields arrived after journeys were already stored,
 * so the interesting cases are the ones no screenshot shows: a blob from
 * before the questions existed, a value the app no longer offers, a list
 * that is not a list. These pin that such a record loads, that unknown
 * values are dropped rather than fed to a label table, that every label
 * table names every choice, and that saving the funnel one answer at a
 * time builds the same journey the old one-shot write did.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AGE_BAND_LABELS,
  BUDGET_LABELS,
  EMPTY_DATA,
  emptyJourney,
  HAIR_CONCERN_LABELS,
  HAIR_TYPE_DESCRIPTIONS,
  HAIR_TYPE_LABELS,
  HEAT_STYLING_LABELS,
  INGREDIENT_REACTION_LABELS,
  journeyBudget,
  journeyConcerns,
  journeyFactors,
  journeyGoals,
  journeyHairType,
  journeyHeatStyling,
  journeyProductFactors,
  journeyReactions,
  journeyScalpConditions,
  journeyScalpSensitivity,
  journeyScalpType,
  knownChoice,
  knownChoices,
  LIFE_FACTOR_LABELS,
  migrateJourney,
  migrateProfile,
  migrateStoredData,
  PRODUCT_FACTOR_LABELS,
  profileAgeBand,
  SCALP_CONDITION_LABELS,
  SCALP_SENSITIVITY_DESCRIPTIONS,
  SCALP_SENSITIVITY_LABELS,
  SCALP_TYPE_DESCRIPTIONS,
  SCALP_TYPE_LABELS,
  SCHEMA_VERSION,
  withAnswer,
  type AgeBand,
  type AppData,
  type Budget,
  type HairConcern,
  type HairType,
  type HeatStyling,
  type IngredientReaction,
  type Journey,
  type LifeFactor,
  type ProductFactor,
  type Profile,
  type ScalpCondition,
  type ScalpSensitivity,
  type ScalpType,
} from '@/types/domain';

import { ADVICE, FLATTERY, HAIR_CLAIMS, PERSONA } from './honesty-words';

/* ------------------------------ fixtures ------------------------------- */

const NOW = '2026-09-17T09:00:00.000Z';
const FRESH = { profileId: 'prof_fresh', journeyId: 'jrn_fresh', now: NOW };

/** A journey exactly as the version before the questions wrote one. */
function oldJourney(): Journey {
  return {
    id: 'jrn_old',
    profileId: 'prof_old',
    startedAt: '2026-06-01T09:00:00.000Z',
    trackingAreas: ['hairline'],
    motivations: ['confidence'],
    goals: ['hairline'],
    noticed: 'months',
    triggers: ['mirror'],
    approaches: ['haircare'],
    medications: ['minoxidilTopical'],
    selfConsistency: 'mostly',
    updateIntervalDays: 30,
    createdAt: '2026-06-01T09:00:00.000Z',
  };
}

function oldProfile(): Profile {
  return {
    id: 'prof_old',
    displayName: 'Sam',
    age: 38,
    gender: 'female',
    createdAt: '2026-06-01T09:00:00.000Z',
  };
}

function oldBlob(): AppData {
  return {
    ...EMPTY_DATA,
    profile: oldProfile(),
    journey: oldJourney(),
    onboardingCompletedAt: '2026-06-01T09:05:00.000Z',
  };
}

/* ------------------------------ label tables --------------------------- */

/*
  The `Record<Union, string>` type already fails to compile with a key
  missing; these pin the same fact at runtime, against a list written out
  by hand, so a value renamed in the type and the table together — the
  one change the compiler cannot see — still has to be renamed here.
*/
const UNIONS: {
  name: string;
  labels: Record<string, string>;
  values: readonly string[];
}[] = [
  {
    name: 'HAIR_TYPE_LABELS',
    labels: HAIR_TYPE_LABELS,
    values: ['straight', 'wavy', 'curly', 'coily'] satisfies HairType[],
  },
  {
    name: 'SCALP_TYPE_LABELS',
    labels: SCALP_TYPE_LABELS,
    values: ['oily', 'dry', 'normal', 'combination'] satisfies ScalpType[],
  },
  {
    name: 'SCALP_SENSITIVITY_LABELS',
    labels: SCALP_SENSITIVITY_LABELS,
    values: ['sensitive', 'notSensitive'] satisfies ScalpSensitivity[],
  },
  {
    name: 'HAIR_CONCERN_LABELS',
    labels: HAIR_CONCERN_LABELS,
    values: [
      'moreScalpShowing',
      'shedding',
      'breakage',
      'dryness',
      'oilyRoots',
      'dandruff',
      'itchOrIrritation',
      'greying',
      'frizz',
    ] satisfies HairConcern[],
  },
  {
    name: 'AGE_BAND_LABELS',
    labels: AGE_BAND_LABELS,
    values: ['under25', '25to34', '35to44', '45to60', 'over60'] satisfies AgeBand[],
  },
  {
    name: 'BUDGET_LABELS',
    labels: BUDGET_LABELS,
    values: ['everyday', 'midRange', 'premium', 'luxury'] satisfies Budget[],
  },
  {
    name: 'PRODUCT_FACTOR_LABELS',
    labels: PRODUCT_FACTOR_LABELS,
    values: [
      'sulfateFree',
      'siliconeFree',
      'fragranceFree',
      'parabenFree',
      'vegan',
      'crueltyFree',
      'noPreference',
    ] satisfies ProductFactor[],
  },
  {
    name: 'INGREDIENT_REACTION_LABELS',
    labels: INGREDIENT_REACTION_LABELS,
    values: [
      'sulfates',
      'fragrance',
      'essentialOils',
      'alcohols',
      'hairDye',
      'smoothingTreatments',
      'none',
    ] satisfies IngredientReaction[],
  },
  {
    name: 'SCALP_CONDITION_LABELS',
    labels: SCALP_CONDITION_LABELS,
    values: [
      'dandruff',
      'seborrheicDermatitis',
      'psoriasis',
      'eczema',
      'none',
    ] satisfies ScalpCondition[],
  },
  {
    name: 'LIFE_FACTOR_LABELS',
    labels: LIFE_FACTOR_LABELS,
    values: [
      'pregnancyOrPostpartum',
      'menopause',
      'thyroidOrHormonal',
      'newMedication',
      'illnessOrSurgery',
      'none',
    ] satisfies LifeFactor[],
  },
  {
    name: 'HEAT_STYLING_LABELS',
    labels: HEAT_STYLING_LABELS,
    values: ['daily', 'fewTimesWeek', 'weekly', 'rarely', 'never'] satisfies HeatStyling[],
  },
  { name: 'HAIR_TYPE_DESCRIPTIONS', labels: HAIR_TYPE_DESCRIPTIONS, values: Object.keys(HAIR_TYPE_LABELS) },
  { name: 'SCALP_TYPE_DESCRIPTIONS', labels: SCALP_TYPE_DESCRIPTIONS, values: Object.keys(SCALP_TYPE_LABELS) },
  {
    name: 'SCALP_SENSITIVITY_DESCRIPTIONS',
    labels: SCALP_SENSITIVITY_DESCRIPTIONS,
    values: Object.keys(SCALP_SENSITIVITY_LABELS),
  },
];

test('every label table names every value of its union, once, and nothing else', () => {
  for (const { name, labels, values } of UNIONS) {
    assert.deepEqual([...Object.keys(labels)].sort(), [...values].sort(), name);
    const texts = Object.values(labels);
    assert.equal(new Set(texts).size, texts.length, `${name} repeats a label`);
    for (const text of texts) {
      assert.ok(text.trim().length > 0, `${name} has an empty label`);
      assert.equal(text, text.trim(), `${name}: "${text}" has stray whitespace`);
    }
  }
});

test('the answer labels describe a choice, not a head', () => {
  for (const { name, labels } of UNIONS) {
    for (const text of Object.values(labels)) {
      const lower = text.toLowerCase();
      for (const word of [...HAIR_CLAIMS, ...FLATTERY, ...ADVICE]) {
        assert.ok(!lower.includes(word), `${name}: "${text}" must not say "${word}"`);
      }
      assert.ok(!PERSONA.test(text), `${name}: "${text}" speaks as a person`);
      assert.ok(!text.includes('!'), `${name}: "${text}" must not exclaim`);
    }
  }
  // Tiers, not sums: no currency and no number on the budget question.
  for (const text of Object.values(BUDGET_LABELS)) {
    assert.ok(!/[£$€\d]/.test(text), `budget label "${text}" carries a figure`);
  }
});

/* ------------------------------ validation ----------------------------- */

test('knownChoices keeps what the table names, in order, and nothing else', () => {
  assert.deepEqual(knownChoices(['curly', 'purple', 'straight'], HAIR_TYPE_LABELS), ['curly', 'straight']);
  assert.deepEqual(knownChoices('curly', HAIR_TYPE_LABELS), []);
  assert.deepEqual(knownChoices(undefined, HAIR_TYPE_LABELS), []);
  assert.deepEqual(knownChoices([null, 3, {}, 'wavy'], HAIR_TYPE_LABELS), ['wavy']);
  // Own keys only: every object "has" a constructor.
  assert.deepEqual(knownChoices(['constructor', 'toString', '__proto__'], HAIR_TYPE_LABELS), []);
  assert.equal(knownChoice('constructor', HAIR_TYPE_LABELS), undefined);
  assert.equal(knownChoice('coily', HAIR_TYPE_LABELS), 'coily');
  assert.equal(knownChoice(7, HAIR_TYPE_LABELS), undefined);
});

test('journeyGoals still folds the old single goal and drops the unknown', () => {
  assert.deepEqual(journeyGoals({ goals: ['fullness', 'shedding'] }), ['fullness', 'shedding']);
  assert.deepEqual(journeyGoals({ goal: 'hairline' }), ['hairline']);
  assert.deepEqual(journeyGoals({ goals: [], goal: 'hairline' }), ['hairline']);
  assert.deepEqual(journeyGoals({ goals: ['fullness'], goal: 'hairline' }), ['fullness']);
  assert.deepEqual(journeyGoals({ goals: ['renamed' as never, 'crown'] }), ['crown']);
  assert.deepEqual(journeyGoals({ goals: 'fullness' as never }), []);
  assert.deepEqual(journeyGoals({ goal: 'constructor' as never }), []);
  assert.deepEqual(journeyGoals({}), []);
});

test('the accessors read their field through the table, like journeyGoals', () => {
  const journey: Journey = {
    ...oldJourney(),
    hairType: 'curly',
    scalpType: 'combination',
    scalpSensitivity: 'sensitive',
    concerns: ['frizz', 'dryness'],
    budget: 'midRange',
    productFactors: ['sulfateFree', 'vegan'],
    ingredientReactions: ['fragrance'],
    scalpConditions: ['none'],
    lifeFactors: ['menopause'],
    heatStyling: 'weekly',
  };
  assert.equal(journeyHairType(journey), 'curly');
  assert.equal(journeyScalpType(journey), 'combination');
  assert.equal(journeyScalpSensitivity(journey), 'sensitive');
  assert.deepEqual(journeyConcerns(journey), ['frizz', 'dryness']);
  assert.equal(journeyBudget(journey), 'midRange');
  assert.deepEqual(journeyProductFactors(journey), ['sulfateFree', 'vegan']);
  assert.deepEqual(journeyReactions(journey), ['fragrance']);
  assert.deepEqual(journeyScalpConditions(journey), ['none']);
  assert.deepEqual(journeyFactors(journey), ['menopause']);
  assert.equal(journeyHeatStyling(journey), 'weekly');

  const unanswered = oldJourney();
  assert.equal(journeyHairType(unanswered), undefined);
  assert.equal(journeyBudget(unanswered), undefined);
  assert.deepEqual(journeyConcerns(unanswered), []);
  assert.deepEqual(journeyFactors(unanswered), []);

  // A record built in memory has not been through the loader.
  const stray = { ...journey, hairType: 'purple', concerns: 'frizz', lifeFactors: ['x', 'none'] } as unknown as Journey;
  assert.equal(journeyHairType(stray), undefined);
  assert.deepEqual(journeyConcerns(stray), []);
  assert.deepEqual(journeyFactors(stray), ['none']);
});

test('profileAgeBand prefers the band picked, and places a typed age', () => {
  assert.equal(profileAgeBand({ ageBand: '35to44', age: 70 }), '35to44');
  assert.equal(profileAgeBand({ age: 24 }), 'under25');
  assert.equal(profileAgeBand({ age: 25 }), '25to34');
  assert.equal(profileAgeBand({ age: 34 }), '25to34');
  assert.equal(profileAgeBand({ age: 44 }), '35to44');
  assert.equal(profileAgeBand({ age: 60 }), '45to60');
  assert.equal(profileAgeBand({ age: 61 }), 'over60');
  assert.equal(profileAgeBand({}), undefined);
  assert.equal(profileAgeBand({ age: Number.NaN }), undefined);
  assert.equal(profileAgeBand({ age: -3 }), undefined);
  assert.equal(profileAgeBand({ age: '40' as never }), undefined);
  assert.equal(profileAgeBand({ ageBand: 'teen' as never }), undefined);
  assert.equal(profileAgeBand({ ageBand: 'teen' as never, age: 40 }), '35to44');
});

/* ------------------------------- migration ----------------------------- */

test('the storage version has not moved: a bump erases every installed journey', () => {
  assert.equal(SCHEMA_VERSION, 2);
});

test('a blob from before the questions loads unchanged, with no new keys', () => {
  const loaded = migrateStoredData(JSON.parse(JSON.stringify(oldBlob())));
  assert.ok(loaded);
  assert.deepEqual(loaded.journey, oldJourney());
  assert.deepEqual(loaded.profile, oldProfile());
  assert.equal(loaded.onboardingCompletedAt, '2026-06-01T09:05:00.000Z');

  const journeyKeys = Object.keys(loaded.journey ?? {});
  for (const key of [
    'hairType',
    'scalpType',
    'scalpSensitivity',
    'concerns',
    'budget',
    'productFactors',
    'ingredientReactions',
    'scalpConditions',
    'lifeFactors',
    'heatStyling',
  ]) {
    assert.ok(!journeyKeys.includes(key), `loader invented journey.${key}`);
  }
  assert.ok(!('ageBand' in (loaded.profile ?? {})), 'loader invented profile.ageBand');
});

test('the old single goal is still folded into goals on the way in', () => {
  const journey = { ...oldJourney(), goal: 'crown' } as Journey;
  delete journey.goals;
  const loaded = migrateStoredData({ ...oldBlob(), journey });
  assert.deepEqual(loaded?.journey?.goals, ['crown']);
  assert.ok(!('goal' in (loaded?.journey ?? {})));
});

test('a blob from another version is still refused', () => {
  assert.equal(migrateStoredData({ ...oldBlob(), schemaVersion: 1 }), null);
  assert.equal(migrateStoredData({ ...oldBlob(), schemaVersion: 3 }), null);
  assert.equal(migrateStoredData(null), null);
  assert.equal(migrateStoredData('{}'), null);
});

test('unknown answer values are dropped on load; known ones and absent fields are untouched', () => {
  const journey = {
    ...oldJourney(),
    hairType: 'wavy',
    scalpType: 'silky',
    scalpSensitivity: 'sensitive',
    concerns: ['frizz', 'thinning', 'greying'],
    budget: 'free',
    productFactors: 'vegan',
    scalpConditions: ['eczema', null, 'ringworm'],
    lifeFactors: [],
    heatStyling: 'never',
  } as unknown as Journey;
  const profile = { ...oldProfile(), ageBand: 'teen' } as unknown as Profile;

  const loaded = migrateStoredData({ ...oldBlob(), journey, profile });
  assert.ok(loaded?.journey && loaded.profile);
  const next = loaded.journey;

  assert.equal(next.hairType, 'wavy');
  assert.ok(!('scalpType' in next), 'an unknown choice is removed, not kept as garbage');
  assert.equal(next.scalpSensitivity, 'sensitive');
  assert.deepEqual(next.concerns, ['frizz', 'greying']);
  assert.ok(!('budget' in next));
  assert.deepEqual(next.productFactors, [], 'a list that is not a list reads as empty');
  assert.deepEqual(next.scalpConditions, ['eczema']);
  assert.deepEqual(next.lifeFactors, []);
  assert.equal(next.heatStyling, 'never');
  assert.ok(!('ingredientReactions' in next), 'an absent answer stays absent');

  assert.ok(!('ageBand' in loaded.profile));
  assert.equal(loaded.profile.age, 38, 'a typed age is left alone');

  // The rest of the journey is exactly what it was.
  const { hairType, scalpSensitivity, concerns, productFactors, scalpConditions, lifeFactors, heatStyling, ...rest } = next;
  void [hairType, scalpSensitivity, concerns, productFactors, scalpConditions, lifeFactors, heatStyling];
  assert.deepEqual(rest, oldJourney());
});

test('migrateJourney and migrateProfile return their input untouched when there is nothing to do', () => {
  const journey = { ...oldJourney(), hairType: 'coily' as const, concerns: ['frizz' as const] };
  assert.deepEqual(migrateJourney(journey), journey);
  const profile = { ...oldProfile(), ageBand: 'over60' as const };
  assert.equal(migrateProfile(profile), profile, 'same object when nothing was dropped');
  const plain = oldProfile();
  assert.equal(migrateProfile(plain), plain, 'same object when there was no band at all');
});

/* ------------------------- one answer at a time ------------------------ */

test('the first answer creates a profile and a journey; the funnel stays incomplete', () => {
  const next = withAnswer(EMPTY_DATA, { profile: { displayName: '  Ayesha ' } }, FRESH);
  assert.deepEqual(next.profile, { id: 'prof_fresh', displayName: 'Ayesha', createdAt: NOW });
  assert.deepEqual(next.journey, emptyJourney('jrn_fresh', 'prof_fresh', NOW));
  assert.equal(next.journey?.updateIntervalDays, 30);
  assert.equal(next.onboardingCompletedAt, null);
  assert.deepEqual(next.sessions, []);
});

test('later answers merge in without changing ids or what was said before', () => {
  let data = withAnswer(EMPTY_DATA, { profile: { displayName: 'Ayesha' } }, FRESH);
  const later = { profileId: 'prof_other', journeyId: 'jrn_other', now: '2026-09-18T09:00:00.000Z' };
  data = withAnswer(data, { profile: { ageBand: '25to34' } }, later);
  data = withAnswer(data, { profile: { gender: 'female' } }, later);
  data = withAnswer(data, { journey: { hairType: 'curly' } }, later);
  data = withAnswer(data, { journey: { scalpType: 'dry' } }, later);
  data = withAnswer(data, { journey: { concerns: ['frizz', 'dryness'] } }, later);
  data = withAnswer(data, { journey: { lifeFactors: ['none'] } }, later);
  data = withAnswer(data, { journey: { heatStyling: 'rarely' } }, later);

  assert.equal(data.profile?.id, 'prof_fresh');
  assert.equal(data.profile?.createdAt, NOW);
  assert.equal(data.profile?.displayName, 'Ayesha');
  assert.equal(data.profile?.ageBand, '25to34');
  assert.equal(data.profile?.gender, 'female');
  assert.equal(data.journey?.id, 'jrn_fresh');
  assert.equal(data.journey?.profileId, 'prof_fresh');
  assert.equal(data.journey?.createdAt, NOW);
  assert.equal(journeyHairType(data.journey ?? {}), 'curly');
  assert.equal(journeyScalpType(data.journey ?? {}), 'dry');
  assert.deepEqual(journeyConcerns(data.journey ?? {}), ['frizz', 'dryness']);
  assert.deepEqual(journeyFactors(data.journey ?? {}), ['none']);
  assert.equal(journeyHeatStyling(data.journey ?? {}), 'rarely');
  assert.equal(data.onboardingCompletedAt, null);
});

test('a single main goal lands in goals, and goals[0] is what they picked', () => {
  let data = withAnswer(EMPTY_DATA, { journey: { goal: 'shedding' } }, FRESH);
  assert.deepEqual(journeyGoals(data.journey ?? {}), ['shedding']);
  assert.ok(!('goal' in (data.journey ?? {})), 'one place a goal lives');

  // Changing their mind replaces, rather than appending to, the goal.
  data = withAnswer(data, { journey: { goal: 'fullness' } }, FRESH);
  assert.deepEqual(journeyGoals(data.journey ?? {}), ['fullness']);

  // Several, when a page passes several.
  data = withAnswer(data, { journey: { goals: ['crown', 'lessBreakage'] } }, FRESH);
  assert.deepEqual(journeyGoals(data.journey ?? {}), ['crown', 'lessBreakage']);
});

test('an answer is validated as it is written, not the next time the app loads', () => {
  const data = withAnswer(
    EMPTY_DATA,
    {
      profile: { ageBand: 'teen' as never },
      journey: { hairType: 'purple' as never, concerns: ['frizz', 'thinning' as never] },
    },
    FRESH,
  );
  assert.ok(!('ageBand' in (data.profile ?? {})));
  assert.ok(!('hairType' in (data.journey ?? {})));
  assert.deepEqual(data.journey?.concerns, ['frizz']);
});

test('clearing the name keeps the name; an answer on a finished journey merges into it', () => {
  const kept = withAnswer(withAnswer(EMPTY_DATA, { profile: { displayName: 'Ayesha' } }, FRESH), { profile: { displayName: '   ' } }, FRESH);
  assert.equal(kept.profile?.displayName, 'Ayesha');
  const unnamed = withAnswer(EMPTY_DATA, { journey: { budget: 'everyday' } }, FRESH);
  assert.equal(unnamed.profile?.displayName, 'You');

  const finished = withAnswer(oldBlob(), { journey: { scalpSensitivity: 'notSensitive' } }, FRESH);
  assert.equal(finished.journey?.id, 'jrn_old');
  assert.equal(finished.journey?.scalpSensitivity, 'notSensitive');
  assert.deepEqual(finished.journey?.goals, ['hairline']);
  assert.equal(finished.onboardingCompletedAt, '2026-06-01T09:05:00.000Z');
});

test('answers written one at a time survive a save and a load', () => {
  let data = withAnswer(EMPTY_DATA, { profile: { displayName: 'Ayesha', ageBand: '45to60' } }, FRESH);
  data = withAnswer(data, { journey: { hairType: 'wavy', productFactors: ['fragranceFree'] } }, FRESH);
  const loaded = migrateStoredData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(loaded, data);
});
