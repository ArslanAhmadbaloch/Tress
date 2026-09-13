/**
 * The hair-care things people already use, offered as a checklist.
 *
 * This exists because the stack somebody starts with decides whether they
 * keep one at all. A routine seeded from "Prescription medication" and
 * nothing else is a routine that looks like somebody else's; a routine
 * that already says shampoo twice a week and a mask on Sunday is theirs
 * on the first morning.
 *
 * Each carries a default frequency, which is a starting position rather
 * than advice — how often to wash your hair is not something this app has
 * a view on, and every one of them is adjustable before it is saved and
 * afterwards. The defaults are simply the most common answer, so most
 * people change nothing and nobody is told what to do.
 *
 * ── Minoxidil and finasteride are on the male list ────────────────────
 * The funnel also has a medication step, and it is deliberately hidden
 * from anybody who says they are doing nothing yet, on the grounds that a
 * list of drugs put in front of that person reads as a suggestion. That
 * still holds for the medication step, which asks what you take.
 *
 * This step asks what you already use, and for most men tracking hair
 * loss the answer starts with one of these two bottles. Leaving them off
 * the routine list meant somebody on minoxidil who had not ticked
 * "prescription medication" or "topical treatments" earlier could finish
 * the whole funnel with a stack of shampoo and no minoxidil in it. So
 * they are here, with no dose, no detail line and no default beyond
 * "every day" — the label is a name, not an instruction.
 */

import type { Approach, Gender, Medication, RoutineIcon } from '@/types/domain';

export type ProductOption = {
  id: string;
  label: string;
  icon: RoutineIcon;
  /** Times a week. Seven is daily. */
  defaultTimesPerWeek: number;
  /**
   * Named medications this is the same bottle as.
   *
   * Somebody who ticked Minoxidil (topical) on the medication step and
   * Minoxidil here means one bottle, not two rows to tick every morning.
   */
  covers?: Medication[];
  /**
   * The generic approach this replaces. "Topical treatment" is the row we
   * add when we could not name the bottle; once it is named, it goes.
   */
  coversApproach?: Approach;
  /**
   * Treatments lead the stack, ahead of hair care. They are the rows
   * somebody is anxious about keeping up.
   */
  treatment?: boolean;
};

/** Used by both, in the order most people would tick them. */
const SHARED: ProductOption[] = [
  { id: 'shampoo', label: 'Shampoo', icon: 'drop', defaultTimesPerWeek: 3 },
  { id: 'conditioner', label: 'Conditioner', icon: 'drop', defaultTimesPerWeek: 3 },
  { id: 'scalpSerum', label: 'Scalp serum', icon: 'dropper', defaultTimesPerWeek: 7 },
  { id: 'scalpMassage', label: 'Scalp massage', icon: 'drop', defaultTimesPerWeek: 7 },
];

/**
 * The treatments first, then the hair care.
 *
 * Order is the whole argument for putting them here: on the screen this
 * is a list of what somebody already uses, and these are the first two
 * things a man in this app is using.
 */
const MALE_PRODUCTS: ProductOption[] = [
  {
    id: 'minoxidil',
    label: 'Minoxidil',
    icon: 'dropper',
    defaultTimesPerWeek: 7,
    covers: ['minoxidilTopical', 'minoxidilOral'],
    coversApproach: 'topical',
    treatment: true,
  },
  {
    id: 'finasteride',
    label: 'Finasteride',
    icon: 'pill',
    defaultTimesPerWeek: 7,
    covers: ['finasterideOral', 'finasterideTopical'],
    coversApproach: 'prescription',
    treatment: true,
  },
  ...SHARED,
  { id: 'styling', label: 'Styling product', icon: 'dropper', defaultTimesPerWeek: 7 },
  { id: 'dermaroller', label: 'Dermaroller', icon: 'dropper', defaultTimesPerWeek: 1 },
];

/**
 * A longer list, because the routine usually is.
 *
 * Heat protectant and a silk pillowcase are on it for the same reason as
 * everything else: they are things people already do, and a stack that
 * cannot hold them is a stack somebody has to keep half of in their head.
 */
const FEMALE_PRODUCTS: ProductOption[] = [
  { id: 'shampoo', label: 'Shampoo', icon: 'drop', defaultTimesPerWeek: 2 },
  { id: 'conditioner', label: 'Conditioner', icon: 'drop', defaultTimesPerWeek: 2 },
  { id: 'hairMask', label: 'Hair mask or deep conditioner', icon: 'drop', defaultTimesPerWeek: 1 },
  { id: 'scalpSerum', label: 'Scalp serum', icon: 'dropper', defaultTimesPerWeek: 7 },
  { id: 'leaveIn', label: 'Leave-in conditioner', icon: 'dropper', defaultTimesPerWeek: 2 },
  { id: 'hairOil', label: 'Hair oil', icon: 'dropper', defaultTimesPerWeek: 1 },
  { id: 'heatProtectant', label: 'Heat protectant', icon: 'dropper', defaultTimesPerWeek: 2 },
  { id: 'scalpMassage', label: 'Scalp massage', icon: 'drop', defaultTimesPerWeek: 7 },
  { id: 'silkPillowcase', label: 'Silk pillowcase', icon: 'drop', defaultTimesPerWeek: 7 },
];

export function productOptions(gender: Gender): ProductOption[] {
  return gender === 'female' ? FEMALE_PRODUCTS : MALE_PRODUCTS;
}

/** A product the user typed in, before it becomes a routine item. */
export type CustomProduct = {
  id: string;
  label: string;
  timesPerWeek: number;
};
