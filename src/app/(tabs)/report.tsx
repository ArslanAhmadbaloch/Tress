/**
 * The report tab.
 *
 * It replaced Learn, which was a library nobody opened twice. This reads
 * somebody's own record back to them — how complete it is, whether the
 * photographs can honestly be compared, how the routine has gone — and
 * ends on the one thing worth doing next.
 *
 * The articles did not go anywhere. They are reached from the bottom of
 * this screen and from Profile, because the researched, sourced writing
 * is the part of this app that took longest and it would be a strange
 * thing to delete in the name of decluttering.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { EmptyState, Screen, ScreenScroll, ScreenTitle } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { buildReport } from '@/features/assessment/engine';
import type { Finding, ReportSection } from '@/features/assessment/types';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';

function toneColour(tone: Finding['tone'], colors: ReturnType<typeof useTheme>['colors']) {
  if (tone === 'good') return colors.accent;
  if (tone === 'attention') return colors.warning;
  return colors.textSecondary;
}

function FindingRow({ finding, index }: { finding: Finding; index: number }) {
  const { colors, spacing } = useTheme();
  const dot = toneColour(finding.tone, colors);

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).springify().damping(20)}
      style={{ flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: dot,
          marginTop: 7,
        }}
      />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="subhead">{finding.headline}</Text>
        {/*
          Every finding shows its reasoning. A report that states a
          conclusion without the working is a black box, and a black box
          about somebody's body is worth less than nothing.
        */}
        <Text variant="footnote" color="textSecondary">
          {finding.detail}
        </Text>
      </View>
    </Animated.View>
  );
}

function SectionCard({ section, index }: { section: ReportSection; index: number }) {
  const { colors, spacing } = useTheme();

  return (
    <Animated.View entering={FadeInDown.delay(index * 90).springify().damping(20)}>
      <Card style={{ marginTop: spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}>
          <Text variant="title3" style={{ flex: 1 }}>
            {section.title}
          </Text>
          {/*
            A section with nothing recorded shows no number at all. A zero
            would read as a bad score rather than as an absence, and being
            told you scored zero on a thing you have not started is a
            small, avoidable insult.
          */}
          {section.score !== null ? (
            <Text variant="title3" style={{ color: colors.accent }}>
              {Math.round(section.score * 100)}%
            </Text>
          ) : null}
        </View>

        <Text variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
          {section.scoreLabel}
        </Text>

        <View style={{ marginTop: spacing.sm }}>
          {section.findings.map((f, i) => (
            <FindingRow key={f.id} finding={f} index={i} />
          ))}
        </View>
      </Card>
    </Animated.View>
  );
}

export default function ReportScreen() {
  const { data } = useAppStore();
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();

  const report = useMemo(() => buildReport(data), [data]);

  return (
    <Screen>
      <ScreenScroll>
        <ScreenTitle
          eyebrow="Your report"
          title="What your record"
          titleMuted="shows so far."
          subtitle="Built from your own photographs and ticks. Nothing here is a claim about your hair."
        />

        {!report.ready ? (
          <EmptyState
            icon="camera"
            title="Nothing to report yet"
            body="Take your first set of photographs and this fills in. It reads your own record back to you — what you have captured, whether it can be compared, and how the routine has gone."
            actionLabel="Take My First Photos"
            onAction={() => router.push('/capture-intro')}
          />
        ) : (
          <>
            {report.sections.map((s, i) => (
              <SectionCard key={s.kind} section={s} index={i} />
            ))}

            {/* The one thing worth doing next, in the app's own voice. */}
            <Animated.View entering={FadeInDown.delay(360).springify().damping(20)}>
              <View
                style={{
                  marginTop: spacing.xl,
                  padding: spacing.lg,
                  borderRadius: radius.md,
                  backgroundColor: colors.accentSoft,
                  borderWidth: 1,
                  borderColor: colors.accentBorder,
                  gap: spacing.xs,
                }}>
                <Text variant="caption" style={{ color: colors.accent, letterSpacing: 1.4 }}>
                  NEXT
                </Text>
                <Text variant="subhead">{report.nextStep}</Text>
              </View>
            </Animated.View>
          </>
        )}

        <PressableScale
          onPress={() => router.push('/learn')}
          accessibilityRole="button"
          accessibilityLabel="Open the Learn library"
          style={{
            marginTop: spacing.xl,
            padding: spacing.lg,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
          }}>
          <Icon name="learn" size={18} color={colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text variant="subhead">Learn</Text>
            <Text variant="footnote" color="textSecondary">
              How hair grows, how studies measure it, and how to read a claim.
            </Text>
          </View>
          <Icon name="chevronRight" size={15} color={colors.textTertiary} />
        </PressableScale>
      </ScreenScroll>
    </Screen>
  );
}
