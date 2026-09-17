/**
 * The floating pill at the bottom right that walks the sections.
 *
 * "Next" scrolls to the section after the one the reader is on; on the
 * last it becomes the way out — Done, or Continue in the funnel — and it
 * hides while the reader is scrolling by hand, because a control that
 * floats over moving text is in the way of the text. The screen decides
 * the label and the target from the model's section list and the
 * measured offsets (layout.ts, `nextSectionIndex`); the pill only shows
 * and hides.
 *
 * Under Reduce Motion it is simply shown or not.
 */

import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { iconSize, motion, spacing, useTheme } from '@/theme';

/** The pill's height, and how far it drops when hidden. */
export const NEXT_PILL_HEIGHT = 56;
const HIDE_DROP = 24;
/** The gap the pill floats in, above the bottom safe area and below the page. */
const PILL_GAP = spacing.xl;

/**
 * The room the pill asks of whatever scrolls under it, measured from the
 * top of the bottom safe area: the gap beneath the pill, the pill, and
 * one more gap above it. A scroll view the pill floats over adds this to
 * its content's bottom padding — otherwise its last control (the
 * report's "Scan again") comes to rest right where the pill sits, and
 * the pill covers it.
 */
export const NEXT_PILL_CLEARANCE = PILL_GAP + NEXT_PILL_HEIGHT + PILL_GAP;

export function NextPill({
  label,
  hint,
  visible,
  final,
  onPress,
}: {
  label: string;
  hint?: string;
  /** False while the reader scrolls by hand. */
  visible: boolean;
  /** True when the pill is the way out rather than the next section. */
  final: boolean;
  onPress: () => void;
}) {
  const { colors, radius, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const shown = useSharedValue(1);
  useEffect(() => {
    const to = visible ? 1 : 0;
    shown.set(
      reduceMotion
        ? to
        : visible
          ? withSpring(1, motion.spring.snappy)
          : withTiming(0, { duration: motion.duration.fast }),
    );
  }, [visible, reduceMotion, shown]);

  const animated = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: (1 - shown.get()) * HIDE_DROP }, { scale: 0.92 + 0.08 * shown.get() }],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        {
          position: 'absolute',
          right: spacing.xl,
          bottom: insets.bottom + PILL_GAP,
        },
        animated,
      ]}>
      <PressableScale
        onPress={onPress}
        haptic="light"
        scaleTo={0.95}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        style={[
          {
            height: NEXT_PILL_HEIGHT,
            minWidth: 104,
            paddingHorizontal: spacing.xxl,
            borderRadius: radius.pill,
            backgroundColor: colors.accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
          },
          shadow.lifted,
        ]}>
        <Text variant="headline" color="textOnAccent">
          {label}
        </Text>
        <Icon name={final ? 'check' : 'chevronDown'} size={iconSize.sm} color={colors.textOnAccent} />
      </PressableScale>
    </Animated.View>
  );
}
