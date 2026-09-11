import type { RoutineIcon, RoutineItem } from '@/types/domain';

/**
 * A best guess at an icon from what the user typed.
 *
 * Used to preselect the picker while they type, and for items saved before
 * icons could be chosen. It matches words only to pick a picture; it never
 * interprets, validates or comments on what the item is.
 */
export function inferRoutineIcon(text: string): RoutineIcon {
  const t = text.toLowerCase();
  if (/topical|serum|oil|spray|foam|solution|dropper|minoxidil|tonic/.test(t)) return 'dropper';
  if (/capsule|softgel|biotin|omega|fish oil/.test(t)) return 'capsule';
  if (/collagen|water|drink|shake|tea|smoothie|juice|serving|powder/.test(t)) return 'cup';
  if (/wash|shampoo|condition|scalp|massage|rinse|microneedl|derma/.test(t)) return 'drop';
  if (/tablet|pill|vitamin|supplement|finasteride|mg\b|zinc|iron/.test(t)) return 'pill';
  return 'pill';
}

/** The icon to draw for an item: the chosen one, else the guess. */
export function routineIconFor(item: Pick<RoutineItem, 'icon' | 'label' | 'detail'>): RoutineIcon {
  return item.icon ?? inferRoutineIcon(`${item.label} ${item.detail ?? ''}`);
}
