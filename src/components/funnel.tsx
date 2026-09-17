/**
 * The one piece of funnel furniture that outlived the funnel's rebuild.
 *
 * The shell, the progress bar, the centred question heading and the
 * bordered choice rows all went with the old sequence: the funnel now
 * draws itself from the onboarding kit (components/onboarding/kit), which
 * has no progress bar to draw and its own shapes for every option. What
 * stayed is the entrance — each piece of a screen arriving in a short
 * stagger so the eye has somewhere to start — because the paywall and
 * the funnel both use it, and it is the same motion everywhere.
 *
 * With Reduce Motion on, everything cross-fades in place instead.
 */

import type { ReactNode } from 'react';
import { type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';

/** How far apart the staggered pieces of a screen arrive. */
const STAGGER = 55;
const RISE = 14;

/** A piece of a screen, arriving in order. */
export function Rise({
  index = 0,
  children,
  style,
  onLayout,
}: {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      entering={
        reduceMotion
          ? FadeIn.duration(220).delay(index * 40)
          : FadeInDown.springify()
              .damping(22)
              .mass(0.9)
              .delay(index * STAGGER)
              .withInitialValues({ transform: [{ translateY: RISE }] })
      }
      onLayout={onLayout}
      style={style}>
      {children}
    </Animated.View>
  );
}
