/**
 * Care notes, by the goal somebody picked and what they told us about
 * themselves.
 *
 * Four per goal, written the way a good hairdresser talks: how to wash,
 * dry, brush and tie hair so it is handled kindly, and when a scalp is a
 * matter for a GP or a dermatologist rather than another bottle. That is
 * the whole of it. None of these notes says what will happen if it is
 * followed, none is a treatment, and none is about the scan — the goal
 * only decides which four everyday habits are worth mentioning to this
 * person. The sweep in scripts/test/hair-scan-report-model.test.ts
 * reads every note for outcome words, advice framed as a promise, and
 * anything that describes a head instead of a habit.
 *
 * ── The profile notes ─────────────────────────────────────────────────
 * The funnel also asks what the person knows about themselves — how
 * their scalp feels, whether it has reacted to products, how often heat
 * goes near their hair, what else is on their mind — and a note that
 * ignores all of that reads as boilerplate. So `tipsForProfile` swaps in
 * up to two notes chosen by those answers, and fills the rest from the
 * goal. A profile note is still a habit: a heat note is offered only to
 * somebody who said heat goes on their hair often, a fragrance note only to
 * somebody who said fragrance has bothered them, and every one of them
 * is chosen by the label of a choice they made, never by anything the
 * app worked out about them. The set says which answer shaped it, so
 * the paragraph under the report can name the same one.
 *
 * Pure: no React, nothing native. Loaded by `node --test`.
 */

import {
  HAIR_CONCERN_LABELS,
  HEAT_STYLING_LABELS,
  INGREDIENT_REACTION_LABELS,
  SCALP_SENSITIVITY_LABELS,
  SCALP_TYPE_LABELS,
  journeyConcerns,
  journeyGoals,
  journeyHeatStyling,
  journeyReactions,
  journeyScalpSensitivity,
  journeyScalpType,
  type HairConcern,
  type HairGoal,
  type HeatStyling,
  type IngredientReaction,
  type Journey,
  type ScalpSensitivity,
  type ScalpType,
} from '@/types/domain';

export type Tip = {
  id: string;
  /** The small grey title above the note: "Wash", "Drying", "Scalp". */
  kicker: string;
  /** One emoji, leading the note the way the reference report does. */
  emoji: string;
  body: string;
};

/** The goal the notes fall back to when nobody picked one. */
export const DEFAULT_TIP_GOAL: HairGoal = 'overall';

/** How many notes each goal carries: the report shows them numbered 1–4. */
export const TIPS_PER_GOAL = 4;

/**
 * How many of the four a person's own answers may choose. The rest come
 * from the goal, so the set never stops being about what they said they
 * are hoping for.
 */
export const PROFILE_TIPS_MAX = 2;

const note = (goal: HairGoal, n: number, kicker: string, emoji: string, body: string): Tip => ({
  id: `${goal}_${n}`,
  kicker,
  emoji,
  body,
});

export const TIPS_BY_GOAL: Readonly<Record<HairGoal, readonly Tip[]>> = Object.freeze({
  fullness: [
    note('fullness', 1, 'Wash', '🚿', 'Wash with lukewarm water and rinse until the water runs clear; leftover product sits flat on the hair.'),
    note('fullness', 2, 'Drying', '🌬️', 'Blot with a towel rather than rubbing, and keep a dryer moving rather than parked on one spot.'),
    note('fullness', 3, 'Brushing', '🪮', 'Start at the ends and work up in short strokes, so a knot is teased out rather than pulled through.'),
    note('fullness', 4, 'Scalp', '🫧', 'A scalp that itches or flakes for weeks is worth a GP or dermatologist visit, not another product.'),
  ],
  hairline: [
    note('hairline', 1, 'Styling', '🎀', 'Tight styles and hard headbands pull on the same spot every day; loosen them where you can.'),
    note('hairline', 2, 'Hats', '🧢', 'A hat is fine; a hat that leaves a mark is tight enough to swap for the next size.'),
    note('hairline', 3, 'Wet hair', '💧', 'Handle wet hair gently: it stretches further than dry hair and is easier to snap.'),
    note('hairline', 4, 'Scalp', '🩺', 'Redness or soreness along the hairline that lasts more than a couple of weeks is one for a GP or dermatologist.'),
  ],
  crown: [
    note('crown', 1, 'Parting', '✂️', 'Move the parting a little from time to time; the same line every day is the one that catches the sun.'),
    note('crown', 2, 'Sun', '☀️', 'On a bright day the crown catches the most sun; a cap, or a mist with SPF, reaches the part a hand cannot.'),
    note('crown', 3, 'Heat', '🔥', 'Keep the dryer at arm’s length from the crown and finish on the cool setting.'),
    note('crown', 4, 'Scalp', '🫧', 'Itching or flaking at the crown that lasts weeks is worth a GP or dermatologist visit.'),
  ],
  shedding: [
    note('shedding', 1, 'Brushing', '🪮', 'Detangle from the ends up with a wide-tooth comb; a brush dragged from the root pulls more than it needs to.'),
    note('shedding', 2, 'Wash', '🚿', 'Wash as often as your scalp is comfortable with: lukewarm water, fingertips rather than nails.'),
    note('shedding', 3, 'Night', '🛏️', 'A smooth pillowcase and a loose plait at night keep the hair from rubbing while you sleep.'),
    note('shedding', 4, 'Doctor', '🩺', 'Shedding that comes on suddenly, or alongside tiredness or a change in periods or medication, is worth a GP visit.'),
  ],
  overall: [
    note('overall', 1, 'Wash', '🚿', 'Lukewarm water, shampoo worked into the scalp with fingertips, conditioner on the lengths only.'),
    note('overall', 2, 'Heat', '🔥', 'A heat-protection spray and the lowest heat that does the job; hair does not need to sizzle to dry.'),
    note('overall', 3, 'Trim', '✂️', 'A trim every couple of months keeps the ends tidy and the hair easier to comb.'),
    note('overall', 4, 'Everyday', '🥗', 'Regular meals with protein and iron-rich food, and enough sleep, are the everyday things a hairdresser asks about first.'),
  ],
  routineWorking: [
    note('routineWorking', 1, 'Same time', '⏰', 'Tie each step to something you already do every day — the kettle, brushing your teeth — and the tick follows on its own.'),
    note('routineWorking', 2, 'One change', '1️⃣', 'Change one thing at a time; two changes at once cannot be told apart later.'),
    note('routineWorking', 3, 'Note it', '📝', 'A one-line note on wash day — what you used, how it felt — is what makes a scan from months back readable.'),
    note('routineWorking', 4, 'Patience', '🗓️', 'Hair grows slowly, so give any change a few months in the record rather than a few weeks.'),
  ],
  unsure: [
    note('unsure', 1, 'Look', '👀', 'Photographs in the same light, at the same distance, once a month, are the simplest way to know what is there.'),
    note('unsure', 2, 'Gentle', '💧', 'Handle wet hair gently, comb from the ends, and skip the tightest styles.'),
    note('unsure', 3, 'Scalp', '🫧', 'A scalp that itches, flakes or feels sore for weeks is worth a GP or dermatologist visit.'),
    note('unsure', 4, 'Ask', '🗣️', 'A hairdresser sees hundreds of heads a month and is a fair person to ask what they notice.'),
  ],
  narrowerPart: [
    note('narrowerPart', 1, 'Parting', '↔️', 'Switch the parting side every so often; the same line every day is the one that gets the sun and the tension.'),
    note('narrowerPart', 2, 'Drying', '🌬️', 'Dry the roots in the opposite direction to how they fall, then flip back — lift at the root without heat on the parting.'),
    note('narrowerPart', 3, 'Root powder', '💨', 'A root powder in a shade near your own is the hairdresser’s trick for a parting on a big day.'),
    note('narrowerPart', 4, 'Sun', '☀️', 'The parting is bare skin: sunscreen or a hat on bright days.'),
  ],
  fullerPonytail: [
    note('fullerPonytail', 1, 'Tie', '🎀', 'A soft scrunchie or a covered band, tied at a different height each day rather than the same spot.'),
    note('fullerPonytail', 2, 'Loosen', '🌿', 'Take the ponytail down for the evening and for sleep; a band left in overnight rubs the same hairs all night.'),
    note('fullerPonytail', 3, 'Brushing', '🪮', 'Brush from the ends up; gathering a ponytail by dragging a brush through from the root snags.'),
    note('fullerPonytail', 4, 'Ask', '✂️', 'Ask your hairdresser about the band height and the layers that suit how your hair falls.'),
  ],
  lessBreakage: [
    note('lessBreakage', 1, 'Wet hair', '💧', 'Wet hair stretches and snaps more easily than dry: blot, comb from the ends, no rubbing.'),
    note('lessBreakage', 2, 'Heat', '🔥', 'Heat-protection spray every time, the lowest setting that does the job, and keep the tool moving.'),
    note('lessBreakage', 3, 'Trim', '✂️', 'A small trim every couple of months takes off the split ends while they are still small.'),
    note('lessBreakage', 4, 'Fabric', '🧣', 'A silk or satin pillowcase, and a scarf under a wool hat: hair slides over those rather than catching.'),
  ],
});

/** The four notes for a goal, or for the everyday default when none was picked. */
export function tipsFor(goal: HairGoal | undefined): Tip[] {
  const list = goal !== undefined ? TIPS_BY_GOAL[goal] : undefined;
  return [...(list ?? TIPS_BY_GOAL[DEFAULT_TIP_GOAL])];
}

/* ------------------------------ the profile ------------------------------ */

/**
 * What the funnel's self-knowledge questions contribute to the notes.
 * Every field is optional and every one is the label of a choice, read
 * through the validated accessors when it comes off a journey.
 */
export type TipProfile = {
  goal?: HairGoal;
  heatStyling?: HeatStyling;
  ingredientReactions?: IngredientReaction[];
  scalpSensitivity?: ScalpSensitivity;
  scalpType?: ScalpType;
  concerns?: HairConcern[];
};

/**
 * Which answer chose a profile note, so the paragraph under the report
 * can say "you told Tress ..., and the notes are picked with that in
 * mind" about the same answer the notes were actually picked by.
 * `label` is verbatim from the `*_LABELS` maps: a quotation.
 */
export type TipSignal = {
  kind: 'heat' | 'reaction' | 'sensitivity' | 'scalpType' | 'concern';
  label: string;
};

export type ProfileTips = {
  items: Tip[];
  /** The first answer that shaped the set, or null when the goal alone did. */
  shapedBy: TipSignal | null;
};

const profileNote = (id: string, kicker: string, emoji: string, body: string): Tip => ({ id, kicker, emoji, body });

/**
 * The notes a self-knowledge answer can bring in, one habit each.
 *
 * Kickers are shared with the goal notes on purpose: a heat note from
 * the profile and a heat note from the goal are the same topic, and
 * `tipsForProfile` keeps one topic to one note.
 */
export const PROFILE_TIPS = Object.freeze({
  heatOften: profileNote('heat_often', 'Heat', '🔥', 'Whenever heat goes on the hair, a heat-protection spray first, the lowest setting that does the job, and the tool kept moving rather than parked.'),
  fragrance: profileNote('reaction_fragrance', 'Labels', '🏷️', 'Parfum and fragrance are the words to look for on an ingredient list; they usually sit near the end of it.'),
  sulfates: profileNote('reaction_sulfates', 'Labels', '🏷️', 'Sodium lauryl sulfate and sodium laureth sulfate are the two names sulfates usually go under on a label, near the top of the list.'),
  sensitive: profileNote('scalp_sensitive', 'Products', '🧴', 'One new product at a time, with a week or two between them: a scalp that has reacted in the past is easier to read one change at a time.'),
  oily: profileNote('scalp_oily', 'Wash', '🚿', 'Wash as often as the scalp feels like it needs; shampoo at the roots with fingertips, conditioner on the lengths only.'),
  dry: profileNote('scalp_dry', 'Wash', '💧', 'Lukewarm rather than hot water, and a day or two between washes where the scalp is comfortable with it.'),
  combination: profileNote('scalp_combination', 'Wash', '🚿', 'Shampoo where the scalp feels oily and let the rinse do the rest; conditioner on the lengths, away from the roots.'),
  flakesOrItch: profileNote('concern_scalp', 'Scalp', '🫧', 'Flaking or itching that lasts more than a few weeks is one for a GP or dermatologist rather than another bottle.'),
  dryness: profileNote('concern_dryness', 'Conditioner', '💧', 'Conditioner on the lengths every wash, left a minute or two, and a towel pressed rather than rubbed.'),
  frizz: profileNote('concern_frizz', 'Drying', '🌬️', 'Blot with a soft towel or a T-shirt rather than rubbing, and let the hair mostly dry on its own ahead of the dryer.'),
});

/**
 * The self-knowledge answers of a journey, validated, in the shape the
 * notes read. A null journey reads as nobody having answered anything.
 */
export function tipProfileOf(journey: Journey | null): TipProfile {
  if (!journey) return {};
  return {
    goal: journeyGoals(journey)[0],
    heatStyling: journeyHeatStyling(journey),
    ingredientReactions: journeyReactions(journey),
    scalpSensitivity: journeyScalpSensitivity(journey),
    scalpType: journeyScalpType(journey),
    concerns: journeyConcerns(journey),
  };
}

/** The profile notes a set of answers earns, most specific first, each with the answer that earned it. */
function profileCandidates(profile: TipProfile): { tip: Tip; signal: TipSignal }[] {
  const out: { tip: Tip; signal: TipSignal }[] = [];
  const reactions = profile.ingredientReactions ?? [];
  const concerns = profile.concerns ?? [];

  // Heat first: it is the one answer that names a habit outright.
  if (profile.heatStyling === 'daily' || profile.heatStyling === 'fewTimesWeek') {
    out.push({ tip: PROFILE_TIPS.heatOften, signal: { kind: 'heat', label: HEAT_STYLING_LABELS[profile.heatStyling] } });
  }
  if (reactions.includes('fragrance')) {
    out.push({ tip: PROFILE_TIPS.fragrance, signal: { kind: 'reaction', label: INGREDIENT_REACTION_LABELS.fragrance } });
  }
  if (reactions.includes('sulfates')) {
    out.push({ tip: PROFILE_TIPS.sulfates, signal: { kind: 'reaction', label: INGREDIENT_REACTION_LABELS.sulfates } });
  }
  if (profile.scalpSensitivity === 'sensitive') {
    out.push({ tip: PROFILE_TIPS.sensitive, signal: { kind: 'sensitivity', label: SCALP_SENSITIVITY_LABELS.sensitive } });
  }
  const byScalp: Partial<Record<ScalpType, Tip>> = { oily: PROFILE_TIPS.oily, dry: PROFILE_TIPS.dry, combination: PROFILE_TIPS.combination };
  const scalpTip = profile.scalpType ? byScalp[profile.scalpType] : undefined;
  if (scalpTip && profile.scalpType) {
    out.push({ tip: scalpTip, signal: { kind: 'scalpType', label: SCALP_TYPE_LABELS[profile.scalpType] } });
  }
  const byConcern: Partial<Record<HairConcern, Tip>> = {
    dandruff: PROFILE_TIPS.flakesOrItch,
    itchOrIrritation: PROFILE_TIPS.flakesOrItch,
    dryness: PROFILE_TIPS.dryness,
    frizz: PROFILE_TIPS.frizz,
    oilyRoots: PROFILE_TIPS.oily,
    breakage: TIPS_BY_GOAL.lessBreakage[0],
    shedding: TIPS_BY_GOAL.shedding[0],
    moreScalpShowing: TIPS_BY_GOAL.narrowerPart[3],
  };
  for (const concern of concerns) {
    const tip = byConcern[concern];
    if (tip) out.push({ tip, signal: { kind: 'concern', label: HAIR_CONCERN_LABELS[concern] } });
  }
  return out;
}

/**
 * Four notes for this person: up to `PROFILE_TIPS_MAX` chosen by what
 * they told us about themselves, the rest by their goal, one note per
 * topic and no note twice. With nothing answered beyond the goal the
 * set is exactly `tipsFor(goal)`, so an older journey reads as it did.
 */
export function tipsForProfile(profile: TipProfile): ProfileTips {
  const items: Tip[] = [];
  const topics = new Set<string>();
  const ids = new Set<string>();
  let shapedBy: TipSignal | null = null;

  const take = (tip: Tip): boolean => {
    const topic = tip.kicker.toLowerCase();
    if (ids.has(tip.id) || topics.has(topic)) return false;
    ids.add(tip.id);
    topics.add(topic);
    items.push(tip);
    return true;
  };

  let fromProfile = 0;
  for (const { tip, signal } of profileCandidates(profile)) {
    if (fromProfile >= PROFILE_TIPS_MAX) break;
    if (!take(tip)) continue;
    fromProfile += 1;
    shapedBy ??= signal;
  }
  for (const tip of tipsFor(profile.goal)) {
    if (items.length >= TIPS_PER_GOAL) break;
    take(tip);
  }
  // A goal whose own notes share topics with the profile's can leave a
  // gap; the everyday notes fill it, so the report always numbers four.
  for (const tip of TIPS_BY_GOAL[DEFAULT_TIP_GOAL]) {
    if (items.length >= TIPS_PER_GOAL) break;
    take(tip);
  }

  return { items, shapedBy };
}

/** Every note, goal and profile alike, for the sweep. */
export function tipSentences(): string[] {
  const all = [...Object.values(TIPS_BY_GOAL).flat(), ...Object.values(PROFILE_TIPS)];
  return all.flatMap((t) => [t.kicker, t.body]);
}
