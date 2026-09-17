/**
 * The status pill — the instrument's one-word readout of the light.
 *
 * It sits at the top of the video and says one thing at a time: the light
 * is good, or one adjustment would make it good. The caller maps the
 * engine's state to a tone and a label from the scan copy; this file only
 * decides how the change looks, and it looks like one object changing
 * colour rather than two objects swapping.
 *
 * Three tones, no red. Green is for good, a warm amber is for "move a
 * little", and neutral is the quiet grey of a readout with nothing to say
 * yet. An alarming colour has no place on a screen a person points at
 * their own head.
 */

import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  interpolateColor,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { darkColors, iconSize, motion, radius, spacing } from '@/theme';

export type StatusTone = 'good' | 'adjust' | 'neutral';

export type StatusPillProps = {
  tone: StatusTone;
  /** One short label from the scan copy, e.g. the pill's "good light" line. */
  label: string;
  /** A glyph before the label. The sun for light; none for a neutral readout. */
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
};

/**
 * The layout transition the pill's width follows when its label changes.
 * Anything wrapping the pill — the top bar's glass capsule — uses the same
 * one, so the two surfaces move as one object rather than the glass
 * snapping to the new width while the colour eases into it.
 */
export function statusPillLayout() {
  return LinearTransition.springify().damping(24).stiffness(220);
}

/** Where each tone sits on the colour ramp: neutral, adjust, good. */
const TONE_POSITION: Record<StatusTone, number> = { neutral: 0, adjust: 1, good: 2 };

export function StatusPill({ tone, label, icon, style }: StatusPillProps) {
  const reduceMotion = useReducedMotion();

  /*
   * One number moves along the ramp, so a change from amber to green
   * passes through neither grey nor a hard swap — the pill visibly
   * becomes the other colour. Reduced motion shortens this to a cut;
   * a colour change needs no motion to be understood.
   */
  const position = useDerivedValue(() =>
    reduceMotion
      ? TONE_POSITION[tone]
      : withTiming(TONE_POSITION[tone], { duration: motion.duration.slow }),
  );

  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      position.get(),
      [0, 1, 2],
      [darkColors.fill, darkColors.warning, darkColors.success],
    ),
  }));

  return (
    <Animated.View
      layout={statusPillLayout()}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      style={[
        {
          borderRadius: radius.pill,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          minHeight: 36,
          alignItems: 'center',
          justifyContent: 'center',
        },
        fill,
        style,
      ]}>
      {/*
        The label is keyed on its text: a new cue fades in as the old one
        fades out, and the pill's width follows through the layout
        transition above. Both stop under Reduce Motion.
      */}
      <Animated.View
        key={`${icon ?? 'none'}:${label}`}
        entering={FadeIn.duration(motion.duration.base)}
        exiting={FadeOut.duration(motion.duration.fast)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs + spacing.xxs }}>
        {icon ? (
          <View>
            <Icon name={icon} size={iconSize.sm} color={darkColors.textOnPhoto} />
          </View>
        ) : null}
        <Text variant="subhead" style={{ color: darkColors.textOnPhoto }}>
          {label}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
