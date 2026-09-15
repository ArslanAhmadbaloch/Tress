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
 *
 * ── Why it looks the way it does ──────────────────────────────────────
 * The cards are the same object as the option rows on the question
 * screens — white, borderless, on a soft shadow, with the same corner —
 * so the report reads as the same conversation answering back rather
 * than as a different document. The label above each card is title case
 * in the accent, not tracked capitals: the small shouting label is the
 * one thing that made the old cards look like a form's section headers.
 */

import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import type { ProfileReport } from '@/features/onboarding/profile-report';
import { useTheme } from '@/theme';

/** Gap between cards landing. Slow enough to read the one before it. */
const STAGGER = 420;

export function ProfileReportScreen({ report }: { report: ProfileReport }) {
  const { colors, radius, spacing, shadow } = useTheme();

  return (
    <View>
      <Animated.View entering={FadeInDown.duration(460).springify().damping(20)}>
        <Text variant="question" center accessibilityRole="header">
          {report.title}
        </Text>
      </Animated.View>

      <View style={{ gap: spacing.md, marginTop: spacing.xxxl }}>
        {report.cards.map((card, i) => (
          <Animated.View
            key={card.id}
            entering={FadeInDown.delay(300 + i * STAGGER)
              .duration(520)
              .springify()
              .damping(21)}
            style={[
              {
                paddingVertical: spacing.xl,
                paddingHorizontal: spacing.xl,
                borderRadius: radius.card,
                backgroundColor: colors.surface,
                gap: spacing.md,
              },
              shadow.soft,
            ]}>
            <Text variant="overline" color="accent">
              {card.eyebrow}
            </Text>

            {/* Their words. */}
            <Text variant="headline">{card.echo}</Text>

            <View style={{ height: 1, backgroundColor: colors.separator }} />

            {/* What it means for the record. */}
            <Text variant="callout" color="textSecondary">
              {card.meaning}
            </Text>
          </Animated.View>
        ))}
      </View>

      <Animated.View
        entering={FadeIn.delay(300 + report.cards.length * STAGGER).duration(600)}
        style={{ marginTop: spacing.xxl, paddingHorizontal: spacing.sm }}>
        <Text variant="callout" center color="textSecondary">
          {report.closing}
        </Text>
      </Animated.View>
    </View>
  );
}
