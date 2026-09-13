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
 */

import type { Gender, RoutineIcon } from '@/types/domain';

export type ProductOption = {
  id: string;
  label: string;
  icon: RoutineIcon;
  /** Times a week. Seven is daily. */
  defaultTimesPerWeek: number;
};

/** Used by both, in the order most people would tick them. */
const SHARED: ProductOption[] = [
  { id: 'shampoo', label: 'Shampoo', icon: 'drop', defaultTimesPerWeek: 3 },
  { id: 'conditioner', label: 'Conditioner', icon: 'drop', defaultTimesPerWeek: 3 },
  { id: 'scalpSerum', label: 'Scalp serum', icon: 'dropper', defaultTimesPerWeek: 7 },
  { id: 'scalpMassage', label: 'Scalp massage', icon: 'drop', defaultTimesPerWeek: 7 },
];

const MALE_PRODUCTS: ProductOption[] = [
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
