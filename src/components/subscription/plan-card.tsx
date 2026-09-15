/**
 * One subscription plan, as a card you choose between.
 *
 * The yearly plan carries a "Best value" tag and the monthly one does not,
 * which is the only difference between them. Neither is drawn dimmer,
 * smaller or deliberately awkward: a monthly plan made to look broken is
 * an argument against the product rather than for the year.
 *
 * Both cards are white and borderless, resting on the ground on the same
 * soft shadow every other card uses. The sage — a ring, a tinted ground,
 * the filled radio — belongs to the selected one alone, so the eye reads
 * "this one" without a second colour on the screen to compete with the
 * button below.
 *
 * Selection is carried by the ring, the tinted ground, the filled radio
 * *and* the accessibility state — never by colour alone, so it survives
 * both a colour-blind reader and VoiceOver.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import type { PlanConfig } from '@/features/subscription/config';
import { motion, useTheme, withZeroAlpha } from '@/theme';

/** Width of the selection ring. Constant, so choosing a plan never
    shifts the text inside it by a point. */
const RING = 2;
const RADIO = 22;

export function SubscriptionPlanCard({
  plan,
  selected,
  onSelect,
  badge,
}: {
  plan: PlanConfig;
  selected: boolean;
  onSelect: () => void;
  /** Shown on the plan worth leading with. */
  badge?: string;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  const reduceMotion = useReducedMotion();
  const lift = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    const to = selected ? 1 : 0;
    lift.set(reduceMotion ? to : withSpring(to, motion.spring.snappy));
  }, [selected, reduceMotion, lift]);

  /*
    The ring fades in from the accent at zero alpha rather than from
    `transparent`, which some renderers interpolate through black. The
    ground tints from the card white to the soft sage at the same rate,
    so the two read as one change rather than a border arriving before
    its fill.
  */
  const ringClear = withZeroAlpha(colors.accent);
  const surface = useAnimatedStyle(() => ({
    borderColor: interpolateColor(lift.get(), [0, 1], [ringClear, colors.accent]),
    backgroundColor: interpolateColor(lift.get(), [0, 1], [colors.surface, colors.accentSoft]),
  }));

  const name = plan.period === 'year' ? 'Yearly' : 'Monthly';
  const period = plan.period === 'year' ? 'per year' : 'per month';

  return (
    <PressableScale
      onPress={onSelect}
      scaleTo={0.985}
      haptic="light"
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={
        `${name} plan, ${plan.formattedPrice} ${period}` +
        (plan.formattedMonthlyEquivalent
          ? `, about ${plan.formattedMonthlyEquivalent} a month`
          : '') +
        (badge ? `. ${badge}` : '')
      }>
      <Animated.View
        style={[
          {
            padding: spacing.xl - RING,
            borderWidth: RING,
            borderRadius: radius.card,
          },
          shadow.soft,
          surface,
        ]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          {/* Radio. Filled when chosen, so the state is a shape and not
              only a tint. */}
          <View
            style={{
              width: RADIO,
              height: RADIO,
              borderRadius: RADIO / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.accent : colors.surface,
              borderWidth: selected ? 0 : 1.5,
              borderColor: colors.fillSelected,
            }}>
            {selected ? <Icon name="check" size={12} color={colors.textOnAccent} /> : null}
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text variant="headline">{name}</Text>
              {badge ? (
                /* Sage only while this is the chosen plan; otherwise the
                   tag is a quiet neutral chip, so the one accent on the
                   screen keeps pointing at the selection. */
                <View
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 2,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? colors.accent : colors.fill,
                  }}>
                  <Text
                    variant="caption"
                    color={selected ? 'textOnAccent' : 'textSecondary'}
                    style={{ fontWeight: '600' }}>
                    {badge}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
              {plan.formattedMonthlyEquivalent
                ? `${plan.formattedMonthlyEquivalent} a month, billed yearly`
                : 'Billed every month'}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="headline" numberOfLines={1}>
              {plan.formattedPrice}
            </Text>
            <Text variant="caption" color="textTertiary">
              {plan.period === 'year' ? '/year' : '/month'}
            </Text>
          </View>
        </View>

        {plan.formattedSaving ? (
          <Text
            variant="footnote"
            color={selected ? 'accent' : 'textSecondary'}
            style={{ marginTop: spacing.sm, marginLeft: RADIO + spacing.md, fontWeight: '600' }}>
            Save about {plan.formattedSaving} a year
          </Text>
        ) : null}
      </Animated.View>
    </PressableScale>
  );
}
