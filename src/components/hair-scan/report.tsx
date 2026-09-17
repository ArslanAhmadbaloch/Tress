/**
 * The hair scan report: the payoff at the end of the turn.
 *
 * ── The shape ─────────────────────────────────────────────────────────
 * The scan's main image first and large, the date on a chip in its
 * corner and what was measured drawn over it; then the five tabs —
 * Overview, Hairline, Temples, Coverage, Scalp — and under them the
 * "Hair Analysis" heading and the rows, in that order, because that is
 * the order the reference's report reads in: picture, then the way in,
 * then the words. Overview lists the four observations the way the
 * reference lists its regions, then the scan's own facts about its run
 * and the images it kept; each other tab opens one observation with its
 * images, its ring and its working.
 *
 * ── What it can say, and what it cannot ───────────────────────────────
 * Every figure here was counted on this device from the pixels the scan
 * kept: light, focus and clipping per still, and — where the segmenter
 * ran — the share of each frame the mask marked as hair and how that
 * area sat left to right. Those are readings of the pictures. None of
 * them is a reading of the head in them, and the screen a person opens
 * hoping for a verdict is exactly the screen where inventing one would
 * be believed. The words are built in features/hair-scan/result.ts from
 * features/hair-scan/report-copy.ts, and the tests sweep both.
 *
 * ── The pacing ────────────────────────────────────────────────────────
 * The image first, on its own for a beat; the mask draws; the tiles and
 * the tabs land; then the four cards, one after another, rings filling
 * as they arrive. A report that is simply there is skimmed; one that is
 * delivered is read. The stagger runs once — switching tabs afterwards
 * is a plain fade, because a report that re-performs itself on every
 * tap is a tic.
 *
 * The screen owns two pieces of state: which tab is open, and whether
 * the first reveal has already run. The rest is the session, read
 * through `buildHairScanResult`, and the hero's reading, read through
 * the same `buildScanReading` the funnel report uses — so the overlay,
 * the callouts and the toggle on the photograph are the ones the person
 * has already met.
 *
 * ── What Premium adds ─────────────────────────────────────────────────
 * Depth, and only depth. The Overview is free in full — every headline,
 * every working line, the tiles and the strip — and so is the closing
 * paragraph. Each card's own tab is where the images sit at full size
 * with the ring, the figures and the comparison line, and for a reader
 * without Premium that tab shows the headline, its working and its
 * caveat over a block that stands for the rest, with one button to the
 * paywall. The decision is `gateObservation` in
 * features/hair-scan/result.ts, and a card that says nothing was kept
 * is never locked, because an absence is not a feature.
 *
 * ── The funnel ────────────────────────────────────────────────────────
 * Reached from onboarding, this is the report before the paywall, and
 * the primary action is Continue → `onContinue`; the screen that renders
 * it routes that to the paywall. Done and Scan again step back to quiet
 * buttons under it. Otherwise Done is the way out and Scan again the way
 * round.
 *
 * ── The one ask ───────────────────────────────────────────────────────
 * This is the one place the app asks for notifications, and it asks
 * once per install, the moment the report is on screen rather than
 * while the scan is still processing. See the effect below for why here
 * and not at launch.
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { Reveal, ScanHero, revealDelay } from '@/components/report';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ScreenScroll } from '@/components/ui/layout';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { Text } from '@/components/ui/text';
import { buildScanReading } from '@/features/assessment/scan-reading';
import { HAIR_SCAN_REPORT_COPY as COPY } from '@/features/hair-scan/report-copy';
import {
  buildHairScanResult,
  gateObservation,
  observationsOf,
  reminderOfferInterval,
  type ScanObservationId,
} from '@/features/hair-scan/result';
import { usePremium } from '@/features/subscription/provider';
import { formatDateShort } from '@/lib/date';
import {
  currentReminderHour,
  markRemindersOffered,
  remindersAlreadyOffered,
  routineReminderIsEnabled,
  updateReminderIsEnabled,
} from '@/lib/device-preferences';
import { enableRemindersWithPrompt } from '@/lib/notifications';
import { useAppStore } from '@/store/app-store';
import { iconSize, useTheme } from '@/theme';
import { ANGLE_LABELS, type PhotoSession } from '@/types/domain';

import {
  FrameStrip,
  LockedObservationCard,
  ObservationCard,
  ObservationRow,
  ScanMetaTiles,
} from './report-cards';

export type ReportTab = 'overview' | ScanObservationId;

export const REPORT_TABS: { value: ReportTab; label: string }[] = [
  { value: 'overview', label: COPY.tabs.overview },
  { value: 'hairline', label: COPY.tabs.hairline },
  { value: 'temples', label: COPY.tabs.temples },
  { value: 'coverage', label: COPY.tabs.coverage },
  { value: 'scalp', label: COPY.tabs.scalp },
];

/** How long a tab's content takes to fade in once the reveal has run. */
const TAB_FADE_MS = 220;

export type HairScanReportProps = {
  /** The session the scan saved. */
  session: PhotoSession;
  initialTab?: ReportTab;
  /** Closes the report. Absent hides the button. */
  onDone?: () => void;
  /** Starts another scan. Absent hides the button. */
  onRescan?: () => void;
  /**
   * True when this report is the one before the paywall — reached from
   * onboarding. Continue becomes the primary action and Done and Scan
   * again step back under it.
   */
  funnel?: boolean;
  /** The funnel's Continue. The screen routes it to the paywall. */
  onContinue?: () => void;
};

export function HairScanReport({
  session,
  initialTab = 'overview',
  onDone,
  onRescan,
  funnel = false,
  onContinue,
}: HairScanReportProps) {
  const { colors, spacing } = useTheme();
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const { isPremium } = usePremium();
  const { data } = useAppStore();

  const result = useMemo(() => buildHairScanResult(session), [session]);
  const reading = useMemo(() => buildScanReading(session), [session]);
  const observations = useMemo(() => observationsOf(result), [result]);

  /*
    The two pieces of state. `settled` flips on the first tab change and
    never back: from then on cards arrive with a plain fade rather than
    the staggered reveal, which belongs to the first reading only.
  */
  const [tab, setTab] = useState<ReportTab>(initialTab);
  const [settled, setSettled] = useState(false);
  const openTab = useCallback((next: ReportTab) => {
    setTab(next);
    setSettled(true);
  }, []);

  /*
    Numbered slots, so each block knows when to land: the image, the
    tabs, the heading, then the cards. The hero's slot is taken by the
    "nothing kept" card when there is no image, so nothing lands early.
  */
  let slot = 0;
  const next = () => slot++;
  const heroSlot = next();
  const tabsSlot = next();
  const headingSlot = next();
  const firstCardSlot = slot;
  /** The closing paragraph and the buttons: the last block to land. */
  const closeSlot = firstCardSlot + observations.length + 2;

  /*
    The one place the app asks for notifications.

    The reminder switches are on by default, but a default is not
    permission — the system still has to ask, and it only ever asks once
    per install. This report is the moment the offer is self-explanatory:
    a first reading is on the screen, and the only thing that turns it
    into a comparison is coming back. Asking at launch instead would
    spend the single prompt on somebody who does not yet know what the
    app does, and "Don't Allow" cannot be undone from inside the app.

    It fires the moment this component mounts, which is the moment the
    scan's processing pass has ended and the report is on screen — the
    same moment the funnel report it replaces fired on. It is not
    deferred past the reveal: a deferred ask has a window in which
    leaving the report cancels it and the single ask moves to the next
    report instead of being spent here, and the reveal is the wrong
    thing to trade that for. It runs once, it never blocks the render,
    and a refusal is final and silent: the switches stay on, nothing is
    scheduled, and Settings is where the system prompt is explained.
    `reminderOfferInterval` holds the once-per-install rule and is tested
    on its own.
  */
  const journeyInterval = data.journey?.updateIntervalDays;
  useEffect(() => {
    const intervalDays = reminderOfferInterval(remindersAlreadyOffered(), journeyInterval);
    if (intervalDays === null) return;

    let cancelled = false;
    void (async () => {
      await enableRemindersWithPrompt({
        routine: routineReminderIsEnabled(),
        update: updateReminderIsEnabled(),
        hour: currentReminderHour(),
        intervalDays,
      });
      if (!cancelled) await markRemindersOffered();
    })();
    return () => {
      cancelled = true;
    };
  }, [journeyInterval]);

  const seeFullReport = useCallback(() => router.push('/paywall'), [router]);

  const eyebrow = reading
    ? `${ANGLE_LABELS[reading.photo.angle]} · ${formatDateShort(reading.photo.capturedAt)}`
    : undefined;

  const enter = (index: number) =>
    reduceMotion ? undefined : FadeIn.delay(settled ? 0 : revealDelay(index)).duration(TAB_FADE_MS);

  const current = observations.find((o) => o.id === tab) ?? null;
  const gated = useMemo(() => (current ? gateObservation(current, isPremium) : null), [current, isPremium]);

  return (
    <ScreenScroll clearsTabBar={false} contentContainerStyle={{ paddingTop: spacing.md }}>
      {/*
        The scan's main image first, with the date on it and what was
        measured drawn over it. When nothing was kept the same place says
        so, and the report goes on to say what each card would have shown.
      */}
      {reading ? (
        <Reveal index={heroSlot}>
          <ScanHero reading={reading} eyebrow={eyebrow} />
        </Reveal>
      ) : (
        <Animated.View entering={enter(heroSlot)}>
          <Card tone="subtle">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Icon name="info" size={iconSize.sm} color={colors.textSecondary} />
              <Text variant="headline" style={{ flex: 1 }}>
                {COPY.frames.none}
              </Text>
            </View>
            <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.sm }}>
              {COPY.frames.noneBody}
            </Text>
          </Card>
        </Animated.View>
      )}

      <Reveal index={tabsSlot} style={{ marginTop: spacing.xl }}>
        <SegmentedTabs options={REPORT_TABS} value={tab} onChange={openTab} />
      </Reveal>

      <Reveal index={headingSlot} style={{ marginTop: spacing.xl }}>
        <Text variant="subhead" color="textSecondary">
          {COPY.eyebrow(formatDateShort(session.capturedAt))}
        </Text>
        <Text variant="title2" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
          {COPY.title}
        </Text>
        <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.sm }}>
          {COPY.subtitle}
        </Text>
      </Reveal>

      {/*
        Keyed on the tab, so a change remounts the block and its entrance
        runs. On the first reading the cards land one after another; after
        the first tap they fade in together, from zero.
      */}
      <View key={tab} style={{ marginTop: spacing.xl }}>
        {tab === 'overview' ? (
          <View style={{ gap: spacing.lg }}>
            {observations.map((observation, i) => (
              <Animated.View key={observation.id} entering={enter(firstCardSlot + i)}>
                <ObservationRow observation={observation} onOpen={openTab} />
              </Animated.View>
            ))}
            {/* The scan's facts about its own run, then the images it kept. */}
            <Animated.View entering={enter(firstCardSlot + observations.length)}>
              <ScanMetaTiles result={result} />
            </Animated.View>
            <Animated.View entering={enter(firstCardSlot + observations.length + 1)}>
              <FrameStrip result={result} />
            </Animated.View>
          </View>
        ) : gated ? (
          <Animated.View entering={enter(firstCardSlot)}>
            {gated.locked ? (
              <LockedObservationCard gated={gated} onSeeFull={seeFullReport} />
            ) : (
              <ObservationCard
                observation={gated.observation}
                delay={settled || reduceMotion ? 0 : revealDelay(firstCardSlot)}
              />
            )}
          </Animated.View>
        ) : null}
      </View>

      {/*
        Said plainly, on the screen where it matters most. Somebody
        arriving here expects a verdict about their hair, and the honest
        answer is that no scan taken today can give them one — only the
        second can, and that is the whole proposition.
      */}
      <Animated.View
        entering={enter(closeSlot)}
        style={{ marginTop: spacing.xxl, paddingHorizontal: spacing.md, gap: spacing.xl }}>
        <Text variant="footnote" color="textSecondary" center>
          {result.scope}
        </Text>
        {/*
          In the funnel, Continue is the whole point of the screen — the
          paywall comes next, and the report is what earns it — so it is
          the one filled button and the others are quiet. Outside it,
          Done is the way out and Scan again the way round.
        */}
        {funnel ? (
          onContinue || onDone || onRescan ? (
            <View style={{ gap: spacing.md }}>
              {onContinue ? <Button label={COPY.actions.continue} onPress={onContinue} /> : null}
              {onRescan ? (
                <Button label={COPY.actions.rescan} variant="ghost" icon="retake" onPress={onRescan} />
              ) : null}
              {onDone ? <Button label={COPY.actions.done} variant="ghost" onPress={onDone} /> : null}
            </View>
          ) : null
        ) : onDone || onRescan ? (
          <View style={{ gap: spacing.md }}>
            {onDone ? <Button label={COPY.actions.done} onPress={onDone} /> : null}
            {onRescan ? (
              <Button label={COPY.actions.rescan} variant="ghost" icon="retake" onPress={onRescan} />
            ) : null}
          </View>
        ) : null}
      </Animated.View>
    </ScreenScroll>
  );
}
