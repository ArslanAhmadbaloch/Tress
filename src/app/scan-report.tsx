/**
 * What the first set of photographs found.
 *
 * This is the screen the baseline lands on, and the one the paywall comes
 * after. That order matters commercially and it matters ethically, and
 * for once those point the same way: somebody who has seen a real reading
 * of their own five photographs is being asked to pay for something they
 * have already watched work, rather than for a promise.
 *
 * ── What it can say, and what it cannot ───────────────────────────────
 * Every line comes from measurements taken on this device when the
 * shutter fired: brightness, contrast, sharpness, clipping, and which of
 * the five angles are present. That is a report about the photographs.
 *
 * It is not a report about the hair in them, and the temptation to make
 * it one is strongest exactly here — this is the highest-intent screen in
 * the app. But no model in this build classifies hair, so a Norwood stage
 * or a density score printed here would be invented, on the screen a
 * person is most likely to believe, immediately before being charged.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { EmptyState, Screen, ScreenScroll } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { buildReport } from '@/features/assessment/engine';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';
import { ANGLES } from '@/types/domain';

const STAGGER = 380;

export default function ScanReportScreen() {
  const { data } = useAppStore();
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();

  const report = useMemo(() => buildReport(data), [data]);
  const framing = report.sections.find((s) => s.kind === 'framing');
  const record = report.sections.find((s) => s.kind === 'record');

  const latest = data.sessions[data.sessions.length - 1];
  const captured = latest?.photos.length ?? 0;
  const measured = latest?.photos.filter((p) => p.quality).length ?? 0;

  // Everything worth showing, in the order it should land.
  const findings = [...(record?.findings ?? []), ...(framing?.findings ?? [])];

  if (!latest || captured === 0) {
    /*
      Reachable by deep link, or if a capture failed to write. A report
      with nothing behind it should say so and offer the way back, not
      render an empty frame with a Continue button under it.
    */
    return (
      <Screen>
        <ScreenScroll clearsTabBar={false}>
          <EmptyState
            icon="camera"
            title="No photographs to report on"
            body="This report is built from your first set. Once those are taken, it fills in with what the device measured as you shot them."
            actionLabel="Take My First Photos"
            onAction={() => router.replace('/capture-intro')}
          />
        </ScreenScroll>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenScroll clearsTabBar={false}>
        <Animated.View entering={FadeInDown.duration(500).springify().damping(20)}>
          <Text variant="caption" center style={{ color: colors.accent, letterSpacing: 1.4 }}>
            Your baseline
          </Text>
          <Text variant="title2" center style={{ marginTop: spacing.xs }}>
            {captured === ANGLES.length
              ? 'All five angles are in.'
              : `${captured} of ${ANGLES.length} angles are in.`}
          </Text>
          <Text
            variant="callout"
            center
            color="textSecondary"
            style={{ marginTop: spacing.sm }}>
            {measured > 0
              ? `Each one was measured on this device as you took it. Nothing was uploaded.`
              : 'This is the set every future month will be compared against.'}
          </Text>
        </Animated.View>

        <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
          {findings.map((f, i) => (
            <Animated.View
              key={f.id}
              entering={FadeInDown.delay(260 + i * STAGGER).duration(520).springify().damping(21)}
              style={{
                flexDirection: 'row',
                gap: spacing.md,
                padding: spacing.lg,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  marginTop: 7,
                  backgroundColor:
                    f.tone === 'good'
                      ? colors.accent
                      : f.tone === 'attention'
                        ? colors.warning
                        : colors.textTertiary,
                }}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="subhead">{f.headline}</Text>
                <Text variant="footnote" color="textSecondary">
                  {f.detail}
                </Text>
              </View>
            </Animated.View>
          ))}
        </View>

        {/*
          Said plainly, on the screen where it matters most. Somebody
          arriving here expects a verdict about their hair, and the honest
          answer is that no photograph taken today can give them one —
          only the second set can, and that is the whole proposition.
        */}
        <Animated.View
          entering={FadeIn.delay(300 + findings.length * STAGGER).duration(560)}
          style={{
            marginTop: spacing.xl,
            padding: spacing.lg,
            borderRadius: radius.md,
            backgroundColor: colors.accentSoft,
            borderWidth: 1,
            borderColor: colors.accentBorder,
            gap: spacing.sm,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Icon name="leaf" size={16} color={colors.accent} />
            <Text variant="subhead">What today cannot tell you</Text>
          </View>
          <Text variant="footnote" color="textSecondary">
            One set of photographs cannot say whether anything is changing — there is
            nothing yet to compare it with. What it does is fix the starting point, so
            that the next one means something. That is the only honest thing a first
            scan can be, and it is worth more than a number invented today.
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeIn.delay(460 + findings.length * STAGGER).duration(520)}
          style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <Button label="Continue" onPress={() => router.replace('/paywall')} />
        </Animated.View>
      </ScreenScroll>
    </Screen>
  );
}
