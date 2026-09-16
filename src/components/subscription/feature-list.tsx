/**
 * What Premium actually gives you, as a short list.
 *
 * The copy lives in paywall-variants.ts with the rest of the paywall's
 * sentences, where the honesty tests can read it. This file only draws
 * it: a row per thing Premium includes, each a neutral disc holding a
 * glyph, a title in the display face and one line under it.
 *
 * Neutral discs, not sage ones. The screen has one accent and it points
 * at the selected plan and the button; a column of green beads above
 * them would be a column of things asking to be looked at.
 *
 * The rows sit on spacing.lg rather than spacing.xl. The list grew past
 * four when it started naming everything Premium actually includes, and
 * at seven the wider gap stopped reading as breathing room and started
 * reading as a scroll — each row is already two lines tall, which is its
 * own separation.
 */

import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  PREMIUM_BENEFITS,
  type PremiumBenefit,
} from '@/features/subscription/paywall-variants';
import { useTheme } from '@/theme';

export type { PremiumBenefit };
export { PREMIUM_BENEFITS };

const DISC = 40;

export function PremiumFeatureList({ benefits = PREMIUM_BENEFITS }: { benefits?: PremiumBenefit[] }) {
  const { colors, spacing } = useTheme();

  return (
    <View style={{ gap: spacing.lg }}>
      {benefits.map((benefit) => (
        <View
          key={benefit.title}
          accessible
          accessibilityLabel={`${benefit.title}. ${benefit.body}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <View
            style={{
              width: DISC,
              height: DISC,
              borderRadius: DISC / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.fill,
            }}>
            <Icon name={benefit.icon} size={17} color={colors.text} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="headline">{benefit.title}</Text>
            <Text variant="footnote" color="textSecondary" style={{ marginTop: 1 }}>
              {benefit.body}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
