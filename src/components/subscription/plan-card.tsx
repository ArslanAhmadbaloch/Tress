/**
 * One subscription plan, as a card you choose between.
 *
 * The yearly plan carries a "Best value" tag and the monthly one does not,
 * which is the only difference between them. Neither is drawn dimmer,
 * smaller or deliberately awkward: a monthly plan made to look broken is
 * an argument against the product rather than for the year.
 *
 * Selection is carried by the ring, the tinted ground, the filled radio
 * *and* the accessibility state — never by colour alone, so it survives
 * both a colour-blind reader and VoiceOver.
 */

import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import type { PlanConfig } from '@/features/subscription/config';
import { motion, useTheme } from '@/theme';

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
  const { colors, spacing, radius } = useTheme();
  const reduceMotion = useReducedMotion();
  const lift = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    const to = selected ? 1 : 0;
    lift.set(reduceMotion ? to : withSpring(to, motion.spring.snappy));
  }, [selected, reduceMotion, lift]);

  const ring = useAnimatedStyle(() => ({
    borderWidth: 1 + lift.get(),
    borderColor: lift.get() > 0.5 ? colors.accent : colors.border,
  }));

  const period = plan.period === 'year' ? 'per year' : 'per month';

  return (
    <PressableScale
      onPress={onSelect}
      scaleTo={0.985}
      haptic="light"
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={
        `${plan.period === 'year' ? 'Yearly' : 'Monthly'} plan, ` +
        `${plan.formattedPrice} ${period}` +
        (plan.formattedMonthlyEquivalent
          ? `, about ${plan.formattedMonthlyEquivalent} a month`
          : '') +
        (badge ? `. ${badge}` : '')
      }>
      <Animated.View
        style={[
          {
            padding: spacing.lg,
            borderRadius: radius.card,
            backgroundColor: selected ? colors.accentSoft : colors.surface,
          },
          ring,
        ]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          {/* Radio. Filled when chosen, so the state is a shape and not
              only a tint. */}
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.accent : 'transparent',
              borderWidth: selected ? 0 : 1.5,
              borderColor: colors.border,
            }}>
            {selected ? (
              <Icon name="check" size={12} color={colors.textOnAccent} />
            ) : null}
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text variant="headline">
                {plan.period === 'year' ? 'Yearly' : 'Monthly'}
              </Text>
              {badge ? (
                <View
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 2,
                    borderRadius: radius.pill,
                    backgroundColor: colors.accent,
                  }}>
                  <Text
                    variant="caption"
                    color="textOnAccent"
                    style={{ fontWeight: '700', letterSpacing: 0.4 }}>
                    {badge}
                  </Text>
                </View>
              ) : null}
            </View>

            {plan.formattedMonthlyEquivalent ? (
              <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
                {plan.formattedMonthlyEquivalent} a month, billed yearly
              </Text>
            ) : (
              <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
                Billed every month
              </Text>
            )}
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
            color="accent"
            style={{ marginTop: spacing.sm, marginLeft: 22 + spacing.md, fontWeight: '600' }}>
            Save about {plan.formattedSaving} a year
          </Text>
        ) : null}
      </Animated.View>
    </PressableScale>
  );
}
