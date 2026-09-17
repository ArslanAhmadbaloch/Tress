/**
 * Care notes, by the goal somebody picked.
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
 * Pure: no React, nothing native. Loaded by `node --test`.
 */

import type { HairGoal } from '@/types/domain';

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

/** Every note, for the sweep. */
export function tipSentences(): string[] {
  return Object.values(TIPS_BY_GOAL).flatMap((list) => list.flatMap((t) => [t.kicker, t.body]));
}
