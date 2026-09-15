/**
 * What the device measured in the first photograph.
 *
 * This is the screen the funnel lands on, and the one the paywall comes
 * after. That order matters commercially and it matters ethically, and
 * for once those point the same way: somebody who has just watched a real
 * reading drawn over their own photograph is being asked to pay for
 * something they have seen work, not for a promise.
 *
 * ── What it can say, and what it cannot ───────────────────────────────
 * Every number here was taken on this device when the shutter fired:
 * brightness, contrast, sharpness and clipping from the pixels, and —
 * in the full build, where the segmenter is installed — how much of the
 * frame the hair mask claims. That is a report about the photograph,
 * drawn over the photograph.
 *
 * It is not a report about the hair in it, and the temptation to make it
 * one is strongest exactly here, on the highest-intent screen in the app.
 * A mask cannot see between strands and a phone cannot classify anything,
 * so a stage or a density score printed here would be invented, on the
 * screen a person is most likely to believe, immediately before being
 * charged. The copy is built in features/assessment/scan-reading.ts and
 * the tests sweep it for exactly those words.
 *
 * ── The pacing ────────────────────────────────────────────────────────
 * The photograph first, on its own for a beat; then the overlay draws;
 * then the readings land one card at a time, rings filling as they
 * arrive. It takes a few seconds and it is meant to. A report that is
 * simply there is skimmed; one that is delivered is read.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import {
  FindingRow,
  ReadingRing,
  ReadingTile,
  Reveal,
  ScanHero,
  revealDelay,
} from '@/components/report';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { EmptyState, Screen, ScreenScroll } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import { buildScanReading } from '@/features/assessment/scan-reading';
import { formatDateShort } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import { iconSize, useTheme } from '@/theme';
import { ANGLE_LABELS } from '@/types/domain';

export default function ScanReportScreen() {
  const { data } = useAppStore();
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();

  // Sessions are stored newest-first, so the latest is the head.
  const latest = data.sessions[0];
  const reading = useMemo(() => (latest ? buildScanReading(latest) : null), [latest]);

  if (!latest || !reading) {
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
            title="No photograph to report on"
            body="This report is built from your first photograph. Once it is taken, this fills in with what the device measured as you shot it."
            actionLabel="Take My First Photo"
            onAction={() => router.replace('/capture-intro')}
          />
        </ScreenScroll>
      </Screen>
    );
  }

  /*
    The sequence, numbered so each card knows when to land. Blocks that
    are not shown do not take a slot, so a report without rings does not
    leave a silent gap where they would have been.
  */
  let slot = 0;
  const next = () => slot++;

  const heroSlot = next();
  const ringsSlot = reading.rings.length > 0 || reading.coverageAbsent ? next() : -1;
  const tilesSlot = reading.tiles.length > 0 ? next() : -1;
  const listSlot = reading.tiles.length > 0 || reading.rings.length > 0 ? next() : -1;
  const nextSlot = next();
  const closeSlot = next();

  const eyebrow = `${ANGLE_LABELS[reading.photo.angle]} · ${formatDateShort(reading.photo.capturedAt)}`;
  const balance = reading.tiles.find((t) => t.id === 'balance');
  const qualityTiles = reading.tiles.filter((t) => t.id !== 'balance');

  return (
    <Screen>
      <ScreenScroll clearsTabBar={false} contentContainerStyle={{ paddingTop: spacing.md }}>
        <Animated.View entering={FadeInDown.duration(500).springify().damping(20)}>
          <Text variant="subhead" center color="textSecondary">
            Your first reading
          </Text>
          <Text
            variant="title2"
            center
            accessibilityRole="header"
            style={{ marginTop: spacing.xs, paddingHorizontal: spacing.md }}>
            Here is what your phone measured.
          </Text>
          <Text
            variant="callout"
            center
            color="textSecondary"
            style={{ marginTop: spacing.sm, paddingHorizontal: spacing.lg }}>
            Taken from this photograph, on this device. Nothing was uploaded.
          </Text>
        </Animated.View>

        <Reveal index={heroSlot} style={{ marginTop: spacing.xxl }}>
          <ScanHero reading={reading} eyebrow={eyebrow} />
        </Reveal>

        {/* The two area readings, or the honest reason there are none. */}
        {reading.rings.length > 0 ? (
          <Reveal index={ringsSlot} style={{ marginTop: spacing.lg }}>
            <Card>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-evenly',
                  alignItems: 'flex-start',
                  paddingVertical: spacing.sm,
                }}>
                {reading.rings.map((ring) => (
                  <ReadingRing
                    key={ring.id}
                    value={ring.value}
                    label={ring.label}
                    delay={revealDelay(ringsSlot) + 200}
                  />
                ))}
              </View>
              <Text
                variant="footnote"
                color="textSecondary"
                center
                style={{ marginTop: spacing.lg, paddingHorizontal: spacing.sm }}>
                Area the on-device segmenter marked as hair. Area is not thickness.
              </Text>
            </Card>
          </Reveal>
        ) : reading.coverageAbsent ? (
          <Reveal index={ringsSlot} style={{ marginTop: spacing.lg }}>
            <Card tone="subtle">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name="info" size={iconSize.sm} color={colors.textSecondary} />
                <Text variant="headline" style={{ flex: 1 }}>
                  {reading.coverageAbsent.headline}
                </Text>
              </View>
              <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.sm }}>
                {reading.coverageAbsent.detail}
              </Text>
            </Card>
          </Reveal>
        ) : null}

        {/* The photograph's own quality, one word each. */}
        {qualityTiles.length > 0 ? (
          <Reveal index={tilesSlot} style={{ marginTop: spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              {qualityTiles.map((tile) => (
                <ReadingTile key={tile.id} reading={tile} />
              ))}
            </View>
            {balance ? (
              <View style={{ marginTop: spacing.md }}>
                <ReadingTile reading={balance} style={{ flex: undefined }} />
              </View>
            ) : null}
          </Reveal>
        ) : null}

        {/* The sentence behind every figure above. */}
        {listSlot >= 0 ? (
          <Reveal index={listSlot} style={{ marginTop: spacing.lg }}>
            <Card>
              <Text variant="title3" accessibilityRole="header">
                What was measured
              </Text>
              <View style={{ marginTop: spacing.xs }}>
                {[...reading.rings.map((r) => ({ ...r, tone: 'neutral' as const })), ...reading.tiles].map(
                  (row, i) => (
                    <FindingRow
                      key={row.id}
                      tone={row.tone}
                      headline={row.headline}
                      detail={row.detail}
                      divider={i > 0}
                    />
                  ),
                )}
              </View>
            </Card>
          </Reveal>
        ) : null}

        {/* What to do next month, most useful line first. */}
        <Reveal index={nextSlot} style={{ marginTop: spacing.lg }}>
          <View
            style={{
              padding: spacing.xl,
              borderRadius: radius.card,
              backgroundColor: colors.accentSoft,
              gap: spacing.md,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Icon name="leaf" size={iconSize.sm} color={colors.accent} />
              <Text variant="title3">Next month</Text>
            </View>
            {reading.nextTime.map((line) => (
              <View
                key={line}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <View style={{ paddingTop: 5 }}>
                  <Icon name="check" size={iconSize.xs} color={colors.accent} />
                </View>
                <Text variant="callout" style={{ flex: 1 }}>
                  {line}
                </Text>
              </View>
            ))}
          </View>
        </Reveal>

        {/*
          Said plainly, on the screen where it matters most. Somebody
          arriving here expects a verdict about their hair, and the honest
          answer is that no photograph taken today can give them one —
          only the second can, and that is the whole proposition.
        */}
        <Animated.View
          entering={FadeIn.delay(revealDelay(closeSlot)).duration(560)}
          style={{ marginTop: spacing.xxl, paddingHorizontal: spacing.md, gap: spacing.xl }}>
          <Text variant="footnote" color="textSecondary" center>
            {reading.scope}
          </Text>
          <Button label="Continue" onPress={() => router.replace('/paywall')} />
        </Animated.View>
      </ScreenScroll>
    </Screen>
  );
}
