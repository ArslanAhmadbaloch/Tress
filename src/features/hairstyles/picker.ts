/**
 * Which cuts the catalogue shows for a record, and how many it holds.
 *
 * ── The rule ──────────────────────────────────────────────────────────
 * The hair type they told the funnel is the filter: a cut is a
 * candidate when it is cut on that hair type and drawn for their
 * gender (or for everybody). With no hair type on the record the
 * candidates are the cuts drawn for everybody, which are the ones the
 * catalogue tags for every kind of hair or for the widest range; with
 * no gender, both sets are in.
 *
 * The goal and concerns they chose break ties, and only ties. A record
 * that mentions scalp showing, or a goal about fullness at the crown or
 * the hairline, leans toward cuts that keep their volume on top; one
 * that mentions breakage, shedding or dryness leans toward cuts that
 * are handled least; either sets back the styles worn under tension,
 * since the American Academy of Dermatology names hairstyles that pull
 * as a cause of traction alopecia
 * (aad.org/public/diseases/hair-loss/causes/hairstyles). None of that
 * is a reading of anybody's hair: it is the answer they gave, matched
 * to a fact about the cut.
 *
 * ── Determinism ───────────────────────────────────────────────────────
 * Scores first, catalogue order between equals, and the same record
 * always gets the same list in the same order. Three to five cuts: the
 * catalogue is built so every hair type has at least three for either
 * gender, and scripts/test/hairstyles.test.ts holds it to that.
 *
 * Pure: no React, nothing native. Loaded by `node --test`.
 */

import {
  journeyConcerns,
  journeyGoals,
  journeyHairType,
  type AppData,
  type Gender,
  type HairConcern,
  type HairGoal,
  type HairType,
} from '@/types/domain';

import { HAIRSTYLE_CATALOGUE, type Hairstyle, type HairstyleTrait } from './catalogue';

/** The most cuts the picker suggests, and the fewest. */
export const HAIRSTYLE_PICKS_MAX = 5;
export const HAIRSTYLE_PICKS_MIN = 3;

/** What the picker reads off the record. */
export type HairstyleProfile = {
  hairType?: HairType;
  gender?: Gender;
  goals: HairGoal[];
  concerns: HairConcern[];
};

export function hairstyleProfileOf(data: Pick<AppData, 'journey' | 'profile'>): HairstyleProfile {
  const journey = data.journey;
  return {
    hairType: journey ? journeyHairType(journey) : undefined,
    gender: data.profile?.gender,
    goals: journey ? journeyGoals(journey) : [],
    concerns: journey ? journeyConcerns(journey) : [],
  };
}

/** Goals about volume kept at the top or the front of the head. */
const VOLUME_GOALS: readonly HairGoal[] = ['fullness', 'crown', 'hairline', 'narrowerPart', 'fullerPonytail'];
/** Concerns and goals that read as hair being handled too hard. */
const HANDLING_CONCERNS: readonly HairConcern[] = ['breakage', 'shedding', 'dryness'];
const HANDLING_GOALS: readonly HairGoal[] = ['lessBreakage', 'shedding'];

/** How much a matching trait counts for. Ties only: the filter is the hair type. */
const TRAIT_WEIGHT = 2;

/** Whether a cut is drawn for this gender: its own set, or the set for everybody. */
function forGender(style: Hairstyle, gender: Gender | undefined): boolean {
  return style.gender === 'any' || gender === undefined || style.gender === gender;
}

/**
 * Every catalogue entry for a hair type and gender, in catalogue order.
 * With no hair type, the cuts drawn for everybody.
 */
export function hairstylesForProfile(profile: Pick<HairstyleProfile, 'hairType' | 'gender'>): Hairstyle[] {
  const { hairType, gender } = profile;
  return HAIRSTYLE_CATALOGUE.filter((style) => {
    if (!forGender(style, gender)) return false;
    return hairType === undefined ? style.gender === 'any' : style.hairTypes.includes(hairType);
  });
}

/** The traits the record leans toward and away from, from the answers they gave. */
export function traitWeights(profile: Pick<HairstyleProfile, 'goals' | 'concerns'>): Partial<Record<HairstyleTrait, number>> {
  const weights: Partial<Record<HairstyleTrait, number>> = {};
  const wantsVolume = profile.goals.some((g) => VOLUME_GOALS.includes(g)) || profile.concerns.includes('moreScalpShowing');
  const wantsLessHandling =
    profile.goals.some((g) => HANDLING_GOALS.includes(g)) || profile.concerns.some((c) => HANDLING_CONCERNS.includes(c));
  if (wantsVolume) weights.volumeOnTop = TRAIT_WEIGHT;
  if (wantsLessHandling) weights.lowManipulation = TRAIT_WEIGHT;
  if (wantsVolume || wantsLessHandling) weights.tension = -TRAIT_WEIGHT;
  return weights;
}

/** A cut's score for a record: the sum of its traits' weights. Zero for a record with no tie-breakers. */
export function hairstyleScore(style: Pick<Hairstyle, 'traits'>, weights: Partial<Record<HairstyleTrait, number>>): number {
  return style.traits.reduce((sum, trait) => sum + (weights[trait] ?? 0), 0);
}

/**
 * Three to five cuts for the record, best score first and catalogue
 * order between equals. Fewer than three candidates for the hair type
 * — which the catalogue does not allow, and the test checks — would be
 * topped up from the cuts drawn for everybody rather than padded.
 */
export function hairstylesFor(data: Pick<AppData, 'journey' | 'profile'>): Hairstyle[] {
  const profile = hairstyleProfileOf(data);
  const weights = traitWeights(profile);
  const candidates = hairstylesForProfile(profile);
  const ranked = candidates
    .map((style, index) => ({ style, index, score: hairstyleScore(style, weights) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.style);

  if (ranked.length >= HAIRSTYLE_PICKS_MIN) return ranked.slice(0, HAIRSTYLE_PICKS_MAX);
  const seen = new Set(ranked.map((s) => s.id));
  const fallback = hairstylesForProfile({ gender: profile.gender }).filter((s) => !seen.has(s.id));
  return [...ranked, ...fallback].slice(0, Math.max(HAIRSTYLE_PICKS_MIN, Math.min(HAIRSTYLE_PICKS_MAX, ranked.length)));
}

/** How many catalogue entries match the record's hair type and gender: the plan's figure. */
export function hairstyleCountFor(data: Pick<AppData, 'journey' | 'profile'>): number {
  return hairstylesForProfile(hairstyleProfileOf(data)).length;
}

/** The rest of the catalogue for the hair type, past the picks, in catalogue order. */
export function moreHairstylesFor(data: Pick<AppData, 'journey' | 'profile'>): Hairstyle[] {
  const picked = new Set(hairstylesFor(data).map((s) => s.id));
  return hairstylesForProfile(hairstyleProfileOf(data)).filter((s) => !picked.has(s.id));
}
