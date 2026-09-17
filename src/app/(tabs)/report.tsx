/**
 * The report tab.
 *
 * It replaced Learn, which was a library nobody opened twice. This reads
 * somebody's own record back to them — how complete it is, whether the
 * photographs can honestly be compared, how the routine has gone — and
 * ends on the one thing worth doing next.
 *
 * It is drawn with the same kit as the scan report at the end of the
 * funnel: a ring for each section's score, the same tone marks, the same
 * row for a finding and its working. The first reading and the ongoing
 * one are one document written at two moments, and they should look it.
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

import { AskBar } from '@/components/coach';
import { FindingRow, ReadingRing } from '@/components/report';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { EmptyState, Screen, ScreenScroll, ScreenTitle } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { buildReport } from '@/features/assessment/engine';
import type { ReportSection } from '@/features/assessment/types';
import { useAppStore } from '@/store/app-store';
import { iconSize, useTheme } from '@/theme';

/** Gap between section cards landing. Quicker than the funnel's report: this one is revisited. */
const STAGGER = 110;

function SectionCard({ section, index }: { section: ReportSection; index: number }) {
  const { colors, spacing, radius } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.delay(index * STAGGER).duration(480).springify().damping(20)}>
      <Card style={{ marginTop: spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title3" accessibilityRole="header">
              {section.title}
            </Text>
            <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.xxs }}>
              {section.scoreLabel}
            </Text>
          </View>

          {/*
            A section with nothing recorded shows no ring at all — only a
            quiet empty well where one would go. A ring at zero would read
            as a bad score rather than as an absence, and being told you
            scored zero on a thing you have not started is a small,
            avoidable insult.
          */}
          {section.score !== null ? (
            <ReadingRing
              value={section.score}
              size={60}
              thickness={5}
              variant="subhead"
              delay={index * STAGGER + 200}
            />
          ) : (
            <View
              accessible={false}
              style={{
                width: 60,
                height: 60,
                borderRadius: radius.pill,
                borderWidth: 5,
                borderColor: colors.fill,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text variant="subhead" color="textTertiary">
                —
              </Text>
            </View>
          )}
        </View>

        <View style={{ marginTop: spacing.sm }}>
          {section.findings.map((f, i) => (
            <FindingRow
              key={f.id}
              tone={f.tone}
              headline={f.headline}
              detail={f.detail}
              divider={i > 0}
            />
          ))}
        </View>
      </Card>
    </Animated.View>
  );
}

export default function ReportScreen() {
  const { data } = useAppStore();
  const { colors, spacing, radius, shadow } = useTheme();
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
        <AskBar />

        {!report.ready ? (
          <EmptyState
            icon="camera"
            title="Nothing to report yet"
            body="Scan your hair and this fills in. It reads your own record back to you — what you have captured, whether it can be compared, and how the routine has gone."
            actionLabel="Scan your hair"
            onAction={() => router.push('/hair-scan')}
          />
        ) : (
          <>
            {report.sections.map((s, i) => (
              <SectionCard key={s.kind} section={s} index={i} />
            ))}

            {/* The one thing worth doing next, in the app's own voice. */}
            <Animated.View
              entering={FadeInDown.delay(report.sections.length * STAGGER)
                .duration(480)
                .springify()
                .damping(20)}>
              <View
                style={{
                  marginTop: spacing.xl,
                  padding: spacing.xl,
                  borderRadius: radius.card,
                  backgroundColor: colors.accentSoft,
                  gap: spacing.sm,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Icon name="leaf" size={iconSize.sm} color={colors.accent} />
                  <Text variant="title3">Next</Text>
                </View>
                <Text variant="callout">{report.nextStep}</Text>
              </View>
            </Animated.View>
          </>
        )}

        <PressableScale
          onPress={() => router.push('/learn')}
          accessibilityRole="button"
          accessibilityLabel="Open the Learn library"
          style={[
            {
              marginTop: spacing.xl,
              padding: spacing.xl,
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
            },
            shadow.soft,
          ]}>
          <Icon name="learn" size={iconSize.md} color={colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text variant="headline">Learn</Text>
            <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.xxs }}>
              How hair grows, how studies measure it, and how to read a claim.
            </Text>
          </View>
          <Icon name="chevronRight" size={iconSize.sm} color={colors.textTertiary} />
        </PressableScale>
      </ScreenScroll>
    </Screen>
  );
}
