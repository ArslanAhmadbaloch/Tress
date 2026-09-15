/**
 * A ring that fills to a measurement.
 *
 * The arc is a dashed circle whose offset is animated on the UI thread,
 * so it fills rather than appears: a ring that draws itself to 41% is a
 * ring you believe, and one that is simply there at 41% is a number in a
 * costume. The figure in the middle counts up on the same clock.
 *
 * It states a fraction and nothing else. The caller decides what the
 * fraction is of, and says so in the label underneath — the ring itself
 * has no opinion about whether 41% is good.
 */

import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { useCountUp } from './use-count-up';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** How long the arc takes to reach its value. Slow enough to be watched. */
const FILL_MS = 1100;

export function ReadingRing({
  value,
  label,
  size = 124,
  thickness = 9,
  delay = 0,
  variant = 'metric',
  style,
}: {
  /** 0–1. */
  value: number;
  /** What the fraction is of. Set beneath the ring. */
  label?: string;
  size?: number;
  thickness?: number;
  /** Milliseconds before the fill begins, so it can wait for its card. */
  delay?: number;
  /** Type size of the figure. `metric` for a hero ring, `subhead` for a small one. */
  variant?: 'metric' | 'headline' | 'subhead';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing } = useTheme();
  const reduceMotion = useReducedMotion();

  const clamped = Math.max(0, Math.min(1, value));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  const fill = useSharedValue(reduceMotion ? clamped : 0);
  useEffect(() => {
    fill.set(
      reduceMotion
        ? clamped
        : withDelay(
            delay,
            withTiming(clamped, { duration: FILL_MS, easing: Easing.out(Easing.cubic) }),
          ),
    );
  }, [clamped, delay, reduceMotion, fill]);

  const arc = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - fill.get()),
    // A zero-length arc with a round cap still draws a dot at twelve.
    opacity: fill.get() < 0.002 ? 0 : 1,
  }));

  const shown = useCountUp(Math.round(clamped * 100), { delay, duration: FILL_MS });

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ? `${Math.round(clamped * 100)}% ${label}` : undefined}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[{ alignItems: 'center' }, style]}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} accessible={false}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.fill}
            strokeWidth={thickness}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.accent}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={circumference}
            fill="none"
            // Rotated so the arc starts at twelve o'clock and runs clockwise.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            animatedProps={arc}
          />
        </Svg>

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text variant={variant} numberOfLines={1}>
            {shown}%
          </Text>
        </View>
      </View>

      {label ? (
        <Text
          variant="footnote"
          color="textSecondary"
          center
          style={{ marginTop: spacing.sm, maxWidth: size + spacing.xl }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
