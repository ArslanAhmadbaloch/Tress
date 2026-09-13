/**
 * The reference set for whoever is signed in, in one line.
 *
 * Screens ask for content rather than for a gender, so no screen ever
 * branches on it and the number of places that can disagree stays at one.
 */

import { hairContent, type HairContent } from './hair-content';
import { useAppStore } from '@/store/app-store';

export function useHairContent(): HairContent {
  const { data } = useAppStore();
  return hairContent(data.profile?.gender);
}
