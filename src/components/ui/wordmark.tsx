/**
 * The Tress wordmark that sits above the greeting on Home.
 *
 * It was grey, which made the brand the quietest thing on its own front
 * page. It is now sage and it breathes: a slow opacity and letter-spacing
 * swell, roughly one cycle every four seconds, plus a soft halo behind it.
 *
 * Two rules the animation follows, because an ambient loop that ignores
 * them is a battery drain and an accessibility failure rather than a piece
 * of polish:
 *
 *  1. It stops for `useReducedMotion`. Somebody who has asked the system
 *     to stop moving things gets the sage colour and none of the movement.
 *  2. It never goes fully transparent. The lowest point is still legible,
 *     so the brand does not blink out of existence twice a minute.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

export function Wordmark({ label = 'Tress' }: { label?: string }) {
  const { colors, spacing } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      pulse.set(0);
      return;
    }
    pulse.set(
      withRepeat(
        withTiming(1, { duration: 2100, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
  }, [reduced, pulse]);

  const mark = useAnimatedStyle(() => ({
    opacity: 0.78 + pulse.get() * 0.22,
    letterSpacing: 2 + pulse.get() * 0.9,
  }));

  // The halo carries most of the "glow"; the text itself only brightens.
  // Doing it the other way round makes the letters strobe.
  const halo = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : 0.10 + pulse.get() * 0.22,
    transform: [{ scaleX: 1 + pulse.get() * 0.06 }],
  }));

  return (
    <View style={{ marginBottom: spacing.xs }}>
      {/*
        A radial gradient, not a filled rounded rectangle. The first
        version painted a solid sage block behind the letters, which read
        as a highlighted pill rather than as light — obvious the moment it
        was on a screen, invisible in the code.
      */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', left: -16, right: -16, top: -12, bottom: -12 },
          halo,
        ]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="wordmarkGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.accent} stopOpacity={0.55} />
              <Stop offset="0.55" stopColor={colors.accent} stopOpacity={0.22} />
              <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#wordmarkGlow)" />
        </Svg>
      </Animated.View>
      <Animated.View style={mark}>
        <Text
          variant="caption"
          accessibilityLabel={label}
          style={{ color: colors.accent, fontWeight: '700' }}>
          {label.toUpperCase()}
        </Text>
      </Animated.View>
    </View>
  );
}
