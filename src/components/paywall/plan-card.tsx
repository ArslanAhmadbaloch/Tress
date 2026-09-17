/**
 * One subscription plan, as a card you choose between.
 *
 * The reference's plan row: the name, a tag on the plan worth leading
 * with, the price under it, and a round check on the right — an outline
 * until chosen, then the accent filled with a tick, with the card's
 * border turning the accent at the same moment. Both cards are white
 * and rest on the same soft shadow; neither is drawn dimmer, smaller or
 * deliberately awkward, because a monthly plan made to look broken is an
 * argument against the product rather than for the year.
 *
 * Selection is carried by the ring, the filled check *and* the
 * accessibility state — never by colour alone, so it survives both a
 * colour-blind reader and VoiceOver.
 *
 * The price on the card is the price on the receipt: there is no trial
 * and no "then", and the same number is repeated in the terms under the
 * button. The copy comes from paywall-variants.ts, where the tests can
 * read it.
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
import { planName, priceLine } from '@/features/subscription/paywall-variants';
import { motion, useTheme, withZeroAlpha } from '@/theme';

/** Width of the selection ring. Constant, so choosing a plan never
    shifts the text inside it by a point. */
const RING = 2;
const CHECK = 28;
/** The unchosen check's outline: a touch over a hairline, so it survives
    a 2× display without reading as a bold ring. */
const CHECK_OUTLINE = 1.5;

export function PaywallPlanCard({
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
    `transparent`, which some renderers interpolate through black.
  */
  const ringClear = withZeroAlpha(colors.accent);
  const surface = useAnimatedStyle(() => ({
    borderColor: interpolateColor(lift.get(), [0, 1], [ringClear, colors.accent]),
  }));

  const name = planName(plan);
  const price = priceLine(plan);

  return (
    <PressableScale
      onPress={onSelect}
      scaleTo={0.985}
      haptic="light"
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name} plan, ${price}` + (badge ? `. ${badge}` : '')}>
      <Animated.View
        style={[
          {
            paddingVertical: spacing.lg - RING,
            paddingHorizontal: spacing.xl - RING,
            borderWidth: RING,
            borderRadius: radius.card,
            backgroundColor: colors.surface,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
          },
          shadow.soft,
          surface,
        ]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text variant="title3">{name}</Text>
            {badge ? (
              <View
                style={{
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xxs,
                  borderRadius: radius.pill,
                  backgroundColor: colors.accent,
                }}>
                {/* The overline step: the type scale's own small capitals
                    spacing, rather than a tracking written here. */}
                <Text variant="overline" color="textOnAccent">
                  {badge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.xxs }}>
            {price}
          </Text>
        </View>

        {/* The check. Filled when chosen, so the state is a shape and not
            only a tint. */}
        <View
          style={{
            width: CHECK,
            height: CHECK,
            borderRadius: CHECK / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? colors.accent : colors.surface,
            borderWidth: selected ? 0 : CHECK_OUTLINE,
            borderColor: colors.fillSelected,
          }}>
          {selected ? <Icon name="check" size={13} color={colors.textOnAccent} /> : null}
        </View>
      </Animated.View>
    </PressableScale>
  );
}
