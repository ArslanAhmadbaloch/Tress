/**
 * PressableScale — the app's press feedback.
 *
 * Every tappable surface uses this so the whole product responds the
 * same way: a small spring-driven scale plus optional haptics. Motion is
 * skipped when the user has asked for reduced motion.
 */

import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { MIN_TOUCH_TARGET, motion } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far it shrinks. Larger surfaces should move less. */
  scaleTo?: number;
  haptic?: 'none' | 'light' | 'medium' | 'success';
};

export function PressableScale({
  children,
  style,
  scaleTo = motion.pressScale,
  haptic = 'light',
  onPress,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (reduceMotion) return;
    scale.value = withSpring(scaleTo, motion.spring.snappy);
  }, [reduceMotion, scale, scaleTo]);

  const handlePressOut = useCallback(() => {
    if (reduceMotion) return;
    scale.value = withSpring(1, motion.spring.snappy);
  }, [reduceMotion, scale]);

  const handlePress = useCallback<NonNullable<PressableProps['onPress']>>(
    (event) => {
      if (haptic !== 'none') {
        const style =
          haptic === 'medium'
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light;

        // Haptics are unavailable on some devices and on web; a failure
        // here must never take the press with it.
        if (haptic === 'success') {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => undefined);
        } else {
          Haptics.impactAsync(style).catch(() => undefined);
        }
      }
      onPress?.(event);
    },
    [haptic, onPress],
  );

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={rest.hitSlop ?? 4}
      style={[
        { minHeight: undefined },
        animatedStyle,
        style,
        disabled && { opacity: 0.4 },
      ]}>
      {children}
    </AnimatedPressable>
  );
}

export { MIN_TOUCH_TARGET };
