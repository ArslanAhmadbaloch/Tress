/**
 * The report, revealed one card at a time.
 *
 * The staging is the point. Four cards that appear together are a summary
 * somebody skims; four that land in sequence, each after the last has
 * been read, are a report being delivered. Same words, different weight —
 * and the weight is what the screen after this one depends on.
 *
 * Each card carries two lines with a rule between them: what they told
 * us, and what it means for the record. Keeping that shape visible is
 * deliberate — it makes the source of every claim obvious at a glance,
 * which is the opposite of how this genre usually works.
 */

import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import type { ProfileReport } from '@/features/onboarding/profile-report';
import { useTheme } from '@/theme';

/** Gap between cards landing. Slow enough to read the one before it. */
const STAGGER = 420;

export function ProfileReportScreen({ report }: { report: ProfileReport }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View style={{ gap: spacing.md }}>
      <Animated.View entering={FadeInDown.duration(460).springify().damping(20)}>
        <Text variant="title2" center accessibilityRole="header">
          {report.title}
        </Text>
      </Animated.View>

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        {report.cards.map((card, i) => (
          <Animated.View
            key={card.id}
            entering={FadeInDown.delay(300 + i * STAGGER)
              .duration(520)
              .springify()
              .damping(21)}
            style={{
              padding: spacing.lg,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              gap: spacing.sm,
            }}>
            <Text
              variant="caption"
              style={{ color: colors.accent, letterSpacing: 1.3 }}>
              {card.eyebrow.toUpperCase()}
            </Text>

            {/* Their words. */}
            <Text variant="subhead">{card.echo}</Text>

            <View style={{ height: 1, backgroundColor: colors.separator }} />

            {/* What it means for the record. */}
            <Text variant="footnote" color="textSecondary">
              {card.meaning}
            </Text>
          </Animated.View>
        ))}
      </View>

      <Animated.View
        entering={FadeIn.delay(300 + report.cards.length * STAGGER).duration(600)}
        style={{ marginTop: spacing.md }}>
        <Text variant="callout" center color="textSecondary">
          {report.closing}
        </Text>
      </Animated.View>
    </View>
  );
}
