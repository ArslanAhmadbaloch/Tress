/**
 * One card landing after the last.
 *
 * The staging is most of what makes a report feel delivered rather than
 * dumped. Cards that arrive together are a summary somebody skims; cards
 * that arrive four hundred milliseconds apart, each after the one before
 * has been read, are a reading being given. Same words, different weight.
 *
 * Reanimated's entering animations already stand down under Reduce
 * Motion, so nothing here has to check for it — the cards simply appear.
 */

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

/** Gap between cards landing. */
export const REVEAL_STAGGER = 400;
/** Time before the first card, so the screen has settled first. */
export const REVEAL_LEAD = 220;

/** When the card at `index` begins to land. */
export function revealDelay(index: number): number {
  return REVEAL_LEAD + index * REVEAL_STAGGER;
}

export function Reveal({
  index,
  children,
  style,
}: {
  /** Position in the sequence; sets the delay. */
  index: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(revealDelay(index)).duration(520).springify().damping(21)}
      style={style}>
      {children}
    </Animated.View>
  );
}
