/**
 * The wash that says the plan is ready.
 *
 * A soft sage light rising from the top of the dark ground once the last
 * count has settled: bright at the top, fading to the night by the lower
 * third, so the cluster of particles sits in it and the number beneath
 * stays on the dark. A thin veil of the ground colour at the very top
 * keeps the caption legible where the wash is brightest.
 *
 * Under Reduce Motion it appears in place.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { darkColors, withZeroAlpha } from '@/theme';

const RISE_MS = 1_100;
/** How far up the wash starts, as a share of the screen. */
const RISE_FROM = 0.35;

export function ReadyWash({ visible, reduceMotion }: { visible: boolean; reduceMotion: boolean }) {
  const { height } = useWindowDimensions();
  const rise = useSharedValue(0);

  useEffect(() => {
    const target = visible ? 1 : 0;
    if (reduceMotion) {
      rise.set(target);
      return;
    }
    rise.set(withTiming(target, { duration: RISE_MS, easing: Easing.out(Easing.cubic) }));
  }, [rise, visible, reduceMotion]);

  const style = useAnimatedStyle(() => {
    const r = rise.get();
    return { opacity: r, transform: [{ translateY: (r - 1) * height * RISE_FROM }] };
  });

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.78 }, style]}>
      <LinearGradient
        colors={[darkColors.cardGlow, darkColors.accent, withZeroAlpha(darkColors.accent)]}
        locations={[0, 0.42, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <LinearGradient
        colors={[darkColors.background, withZeroAlpha(darkColors.background)]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120 }}
      />
    </Animated.View>
  );
}
