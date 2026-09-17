/**
 * Ink that stays ink.
 *
 * `colors.text` is the darkest thing on the page in the light theme and
 * the lightest in the dark one, which is right for words and wrong for
 * a drawing that is meant to be dark in both: a phone's frame, the disc
 * behind a luxury icon, a pencil's outline. This picks the token that is
 * actually dark under the current scheme, and the token that reads on
 * it, so a drawing keeps its contrast when the theme flips.
 *
 * Both values are existing tokens; nothing here is a raw colour.
 */

import { useTheme } from '@/theme';

export function useInk(): { ink: string; onInk: string } {
  const { colors, scheme } = useTheme();
  return scheme === 'dark'
    ? { ink: colors.background, onInk: colors.text }
    : { ink: colors.text, onInk: colors.background };
}
