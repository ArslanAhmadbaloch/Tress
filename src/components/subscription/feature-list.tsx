/**
 * What Premium actually gives you.
 *
 * Seven lines, each a thing the app does rather than a thing it promises
 * will happen to your hair. Nothing here claims growth, and nothing here
 * implies the app produces a medical outcome — what is being sold is the
 * record and the clarity, which is the part we can actually deliver.
 */

import { View } from 'react-native';

import { GlassOrb } from '@/components/ui/glass-orb';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

export type PremiumBenefit = { icon: IconName; title: string; body: string };

export const PREMIUM_BENEFITS: PremiumBenefit[] = [
  {
    icon: 'camera',
    title: 'Unlimited photo tracking',
    body: 'Capture your standardised five-angle updates.',
  },
  {
    icon: 'compare',
    title: 'Progress comparisons',
    body: 'Put any two points in your journey side by side.',
  },
  {
    icon: 'bottle',
    title: 'Your Stack',
    body: 'Keep your treatments and routine in one place.',
  },
  {
    icon: 'chart',
    title: 'Consistency tracking',
    body: 'See how steadily you are keeping to your routine.',
  },
  {
    icon: 'clock',
    title: 'Complete journey history',
    body: 'Photos, notes and milestones, kept together.',
  },
  {
    icon: 'shield',
    title: 'Private by design',
    body: 'Everything stays on your device.',
  },
];

export function PremiumFeatureList({ benefits = PREMIUM_BENEFITS }: { benefits?: PremiumBenefit[] }) {
  const { colors, spacing } = useTheme();

  return (
    <View style={{ gap: spacing.lg }}>
      {benefits.map((benefit) => (
        <View
          key={benefit.title}
          accessible
          accessibilityLabel={`${benefit.title}. ${benefit.body}`}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <GlassOrb size={34} ring={false}>
            <Icon name={benefit.icon} size={16} color={colors.accent} />
          </GlassOrb>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="subhead" style={{ fontWeight: '600' }}>
              {benefit.title}
            </Text>
            <Text variant="footnote" color="textSecondary" style={{ marginTop: 1 }}>
              {benefit.body}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
