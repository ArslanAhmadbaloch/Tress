/**
 * The hair scan report: the payoff at the end of the turn.
 *
 * ── The shape ─────────────────────────────────────────────────────────
 * One long sheet over the main still. The still fills the top of the
 * screen with the mesh held on it and the date on a chip; a white sheet
 * with rounded corners rises over its foot and carries, in order, the
 * tab row that filters the analysis rows, the rows themselves — a crop
 * of the actual frame, the place, the headline, the working in a bubble
 * — then what is working, the profile tiles, whether the turn reached
 * the person's own focus, the care notes, the routine shelf and the
 * coach's paragraph. A pill at the bottom right walks the sections and
 * becomes the way out on the last. The structure, density and pacing
 * are the reference report's; the words, the palette and the claims are
 * not.
 *
 * ── What it can say, and what it cannot ───────────────────────────────
 * Nothing. The screen computes no sentence: every string, crop, count
 * and lock is built by `buildHairScanReport` in
 * features/hair-scan/report-model.ts, which the honesty sweep reads by
 * building it. What this file owns is arrangement and motion — which
 * tab is open, which sections have entered the screen, where the pill
 * goes next — and the few chrome labels in report-sections/ui-copy.ts.
 * A row is an observation about the frames; a tile is the label of a
 * choice; the focus block is coverage of a region, never a reading of
 * it. The screen draws them and adds nothing.
 *
 * ── The pacing ────────────────────────────────────────────────────────
 * The still first, on its own for a beat; the mesh lands on it; then
 * the sections arrive as they are reached, each one rising into place a
 * little after the last in its batch, so a report read top to bottom is
 * delivered rather than dumped and one skimmed by scrolling fast is
 * simply there. Switching tabs re-filters the rows without a
 * performance. The still's slide under the sheet and the fade of the
 * chrome over it follow the scroll on the UI thread, frame for frame;
 * the JS side hears about the scroll only every few dozen points and at
 * the lines it switches on. Under Reduce Motion everything is static:
 * the still does not move, the chrome steps, the sections are there.
 *
 * ── The strip under the status bar ────────────────────────────────────
 * The sheet's scroll view starts under the status bar and the still
 * slides more slowly than the sheet, so the still would stay under the
 * clock for as long as anybody reads. A strip in the sheet's own colour
 * is painted there as the sheet's top comes up to meet it, and the
 * status bar takes the theme's ink half-way through; before that it is
 * light over the photograph. The tab row drops its corners and gutters
 * the moment it sticks, so strip and row read as one header.
 *
 * ── What Premium adds ─────────────────────────────────────────────────
 * Depth. The hero, every row's headline, the strengths, the profile and
 * the coach's paragraph are free; each row's working, the focus block,
 * the care notes past the first and the routine builder are held behind
 * translucent blocks — shapes, never fake text — with one button to the
 * paywall under the rows and the same one in the routine block. The
 * model decides every lock; the screen draws the block.
 *
 * ── The funnel ────────────────────────────────────────────────────────
 * Reached from onboarding, this is the report before the paywall, and
 * the primary action is Continue → `onContinue`; the screen that renders
 * it routes that to the paywall. Otherwise Done is the way out and Scan
 * again the way round. Reopened from the journal (app/hair-report.tsx)
 * it draws a way back over the still.
 *
 * ── The one ask ───────────────────────────────────────────────────────
 * This is the one place the app asks for notifications, and it asks
 * once per install, the moment the report is on screen — the scan's own
 * report, not one reopened from the journal (`ask`). See the effect
 * below for why here and not at launch.
 */

import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { buildHairScanReport, type ReportTab } from '@/features/hair-scan/report-model';
import { reminderOfferInterval } from '@/features/hair-scan/result';
import type { StillMesh } from '@/features/hair-scan/types';
import { usePremium } from '@/features/subscription/provider';
import {
  currentReminderHour,
  markRemindersOffered,
  remindersAlreadyOffered,
  routineReminderIsEnabled,
  updateReminderIsEnabled,
} from '@/lib/device-preferences';
import { enableRemindersWithPrompt } from '@/lib/notifications';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';
import type { PhotoSession } from '@/types/domain';

import { AnalysisRows } from './report-sections/analysis-rows';
import { FocusBlockView } from './report-sections/focus';
import { HeroChrome, ReportHero } from './report-sections/hero';
import {
  SHEET_OVERLAP,
  heroHeight,
  heroShift,
  nextSectionIndex,
  pillReturnsAfterDrag,
  rowsForTab,
  sectionsInView,
  shouldSettle,
  statusFlipAt,
  stripOpacity,
} from './report-sections/layout';
import { NEXT_PILL_HEIGHT, NextPill } from './report-sections/next-pill';
import { ProfileTiles } from './report-sections/profile';
import { RoutineBlockView } from './report-sections/routine';
import { SaysBlockView } from './report-sections/says';
import { SHEET_INSET, SectionReveal, SheetBlock } from './report-sections/section';
import { StrengthCards } from './report-sections/strengths';
import { ReportTabs, TAB_ROW_HEIGHT } from './report-sections/tabs';
import { TipList } from './report-sections/tips';
import { HAIR_SCAN_REPORT_UI_COPY as UI } from './report-sections/ui-copy';

export type { ReportTab };

export type HairScanReportProps = {
  /** The session the scan saved. */
  session: PhotoSession;
  /**
   * The main still's shutter-time mesh, when the screen that ran the
   * scan still has it. A report reopened later has only the record, and
   * the hero places the mesh from the stored regions instead.
   */
  mesh?: StillMesh | null;
  initialTab?: ReportTab;
  /** Closes the report. Absent hides the button. */
  onDone?: () => void;
  /** Starts another scan. Absent hides the button. */
  onRescan?: () => void;
  /** Draws a way back over the still, for a report reopened from the journal. */
  onBack?: () => void;
  /**
   * True when this report is the one before the paywall — reached from
   * onboarding. Continue becomes the primary action and Done and Scan
   * again step back under it.
   */
  funnel?: boolean;
  /** The funnel's Continue. The screen routes it to the paywall. */
  onContinue?: () => void;
  /**
   * Whether this report may spend the one notifications ask. True for
   * the report a scan ends on; false for one reopened from the journal,
   * so the single system prompt is spent on a scan's own report.
   */
  ask?: boolean;
};

export function HairScanReport({
  session,
  mesh = null,
  initialTab = 'all',
  onDone,
  onRescan,
  onBack,
  funnel = false,
  onContinue,
  ask = true,
}: HairScanReportProps) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const { isPremium } = usePremium();
  const { data } = useAppStore();

  const model = useMemo(
    () => buildHairScanReport(data, session, { premium: isPremium }),
    [data, session, isPremium],
  );

  /** The photograph a crop was cut from, by its file, for the mask. */
  const photoByUri = useMemo(() => new Map(session.photos.map((p) => [p.uri, p])), [session.photos]);
  const photoFor = useCallback((uri: string) => photoByUri.get(uri) ?? null, [photoByUri]);
  const heroPhoto = useMemo(() => photoByUri.get(model.hero.uri) ?? session.photos[0] ?? null, [photoByUri, model.hero.uri, session.photos]);

  /* ------------------------------- state ------------------------------ */

  const [tab, setTab] = useState<ReportTab>(initialTab);
  const rows = useMemo(() => rowsForTab(model.analysis.rows, tab), [model.analysis.rows, tab]);

  /*
    The still's height on this screen, and where the sheet begins: the
    tab row sits SHEET_OVERLAP above the still's foot, and the scroll
    view itself starts under the status bar so the row sticks below it.
  */
  const heroH = heroHeight({ width: model.hero.width, height: model.hero.height }, window);
  const spacerH = Math.max(0, heroH - SHEET_OVERLAP - insets.top);
  /** The scroll at which the status bar takes the sheet's ink; the tab row sticks at `spacerH`. */
  const flipAt = statusFlipAt(spacerH, insets.top, reduceMotion);

  /* -------------------------- scroll bookkeeping ---------------------- */

  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollY = useSharedValue(0);
  const scrollYRef = useRef(0);
  const viewportRef = useRef(0);
  /** Each section's top, in content points, once measured. */
  const offsetsRef = useRef<Record<string, number>>({});
  const sectionIds = useMemo(() => model.sections.map((s) => s.id), [model.sections]);

  /** The order each section landed in, once it has entered the screen. */
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [nextIndex, setNextIndex] = useState<number | null>(0);
  const [pillVisible, setPillVisible] = useState(true);
  /** The status bar has left the still. */
  const [pastHero, setPastHero] = useState(false);
  /** The tab row is stuck under the status bar. */
  const [stuck, setStuck] = useState(false);

  const offsetsInOrder = useCallback(
    () => sectionIds.map((id) => offsetsRef.current[id] ?? null),
    [sectionIds],
  );

  /** Re-reads what is in view and what is next from the latest scroll and layout. */
  const settle = useCallback(() => {
    const y = scrollYRef.current;
    const offsets = offsetsInOrder();
    const inView = sectionsInView(offsets, y, viewportRef.current);
    setSeen((prev) => {
      const fresh = inView.filter((i) => !(sectionIds[i] in prev));
      if (fresh.length === 0) return prev;
      const next = { ...prev };
      fresh.forEach((i, order) => {
        next[sectionIds[i]] = order;
      });
      return next;
    });
    // The reader's line is under the stuck tab row, not at the very top.
    setNextIndex(nextSectionIndex(offsets, y + TAB_ROW_HEIGHT));
    setPastHero(y >= flipAt);
    setStuck(y >= spacerH);
  }, [offsetsInOrder, sectionIds, spacerH, flipAt]);

  /** The JS side's reading of the scroll: every few dozen points, and at every line it switches on. */
  const settleAt = useCallback(
    (y: number) => {
      scrollYRef.current = y;
      settle();
    },
    [settle],
  );

  /*
    The scroll, on the UI thread. `scrollY` drives the still's slide and
    the chrome's fade frame for frame; the JS side is told only when the
    sheet has moved far enough to change what it keeps, or has crossed
    the status bar's flip or the tab row's sticking, and when a drag or
    a glide ends. The pill goes while the sheet moves and comes back when
    it has stopped — after a drag only if no glide follows.
  */
  const settledY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      scrollY.set(y);
      if (shouldSettle(settledY.get(), y, [flipAt, spacerH])) {
        settledY.set(y);
        runOnJS(settleAt)(y);
      }
    },
    onBeginDrag: () => {
      runOnJS(setPillVisible)(false);
    },
    onEndDrag: (e) => {
      settledY.set(e.contentOffset.y);
      runOnJS(settleAt)(e.contentOffset.y);
      if (pillReturnsAfterDrag(e.velocity?.y)) runOnJS(setPillVisible)(true);
    },
    onMomentumBegin: () => {
      runOnJS(setPillVisible)(false);
    },
    onMomentumEnd: (e) => {
      settledY.set(e.contentOffset.y);
      runOnJS(settleAt)(e.contentOffset.y);
      runOnJS(setPillVisible)(true);
    },
  });

  const onViewport = useCallback(
    (e: LayoutChangeEvent) => {
      viewportRef.current = e.nativeEvent.layout.height;
      settle();
    },
    [settle],
  );

  const onSectionLayout = useCallback(
    (id: string) => (e: LayoutChangeEvent) => {
      offsetsRef.current[id] = e.nativeEvent.layout.y;
      settle();
    },
    [settle],
  );

  /* The still slides under the sheet; not under Reduce Motion. */
  const parallax = useAnimatedStyle(() => ({
    transform: [{ translateY: heroShift(scrollY.get(), reduceMotion) }],
  }));

  /* The strip under the status bar, painted as the sheet comes up to meet it. */
  const strip = useAnimatedStyle(() => ({
    opacity: stripOpacity(scrollY.get(), spacerH, insets.top, reduceMotion),
  }));

  /* ------------------------------ the pill ---------------------------- */

  const finalAction = funnel ? onContinue : onDone;
  const finalLabel = funnel ? UI.actions.continue : UI.actions.done;
  const nextSection = nextIndex === null ? null : model.sections[nextIndex];
  const showPill = nextSection !== null || finalAction !== undefined;

  const onNext = useCallback(() => {
    if (nextSection) {
      const y = offsetsRef.current[nextSection.id];
      if (y !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - TAB_ROW_HEIGHT), animated: !reduceMotion });
      }
      return;
    }
    finalAction?.();
  }, [nextSection, finalAction, reduceMotion]);

  /* ------------------------------ the ask ----------------------------- */

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
    scan's processing pass has ended and the report is on screen. It is
    not deferred past the reveal: a deferred ask has a window in which
    leaving the report cancels it and the single ask moves to the next
    report instead of being spent here. It runs once, it never blocks
    the render, and a refusal is final and silent: the switches stay
    on, nothing is scheduled, and Settings is where the system prompt
    is explained. `reminderOfferInterval` holds the once-per-install
    rule and is tested on its own.

    A report reopened from the journal mounts this same component and
    passes `ask={false}`: the once-per-install guard would stop a second
    prompt either way, but without the gate the single prompt could be
    spent on an old report rather than the scan's own.
  */
  const journeyInterval = data.journey?.updateIntervalDays;
  useEffect(() => {
    if (!ask) return;
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
  }, [ask, journeyInterval]);

  const seeFullReport = useCallback(() => router.push('/paywall'), [router]);
  const buildRoutine = useCallback(() => router.push('/routine'), [router]);

  /* ----------------------------- the sections ------------------------- */

  const section = (id: string, node: ReactNode) => {
    const order = seen[id];
    return (
      <SectionReveal key={id} shown={order !== undefined} order={order ?? 0} onLayout={onSectionLayout(id)}>
        {node}
      </SectionReveal>
    );
  };

  const blocks = model.sections.map((s) => {
    switch (s.id) {
      case 'analysis':
        return section(
          s.id,
          <SheetBlock continues heading={model.analysis.heading} subheading={model.analysis.subheading}>
            <AnalysisRows rows={rows} marks={model.analysis.marks} photoFor={photoFor} onSeeFull={seeFullReport} />
          </SheetBlock>,
        );
      case 'strengths':
        return section(
          s.id,
          <SheetBlock heading={model.strengths.heading}>
            <StrengthCards cards={model.strengths.cards} />
          </SheetBlock>,
        );
      case 'profile':
        return section(
          s.id,
          <SheetBlock plain heading={model.profile.heading} headingTone="textSecondary">
            <ProfileTiles tiles={model.profile.tiles} />
          </SheetBlock>,
        );
      case 'focus':
        return model.focus
          ? section(
              s.id,
              <SheetBlock heading={model.focus.heading}>
                <FocusBlockView focus={model.focus} photoFor={photoFor} />
              </SheetBlock>,
            )
          : null;
      case 'tips':
        return section(
          s.id,
          <SheetBlock heading={model.tips.heading} subheading={model.tips.subheading}>
            <TipList items={model.tips.items} locked={model.tips.locked} />
          </SheetBlock>,
        );
      case 'routine':
        return section(
          s.id,
          <SheetBlock heading={model.routine.heading}>
            <RoutineBlockView routine={model.routine} onBuild={buildRoutine} onSeeFull={seeFullReport} />
          </SheetBlock>,
        );
      case 'says':
        return section(
          s.id,
          <SheetBlock heading={`${model.says.heading}:`}>
            <SaysBlockView says={model.says} />
          </SheetBlock>,
        );
      default:
        return null;
    }
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Light over the still; the theme's own once the strip under it is painted. */}
      <StatusBar style={pastHero ? 'auto' : 'light'} />

      <Animated.View
        pointerEvents="box-none"
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: heroH }, parallax]}>
        <ReportHero hero={model.hero} photo={heroPhoto} mesh={mesh} height={heroH} />
      </Animated.View>

      {/* The strip under the status bar, in the sheet's colour, as the sheet comes up to meet it. */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.surface },
          strip,
        ]}
      />

      <Animated.ScrollView
        ref={scrollRef}
        style={{ flex: 1, marginTop: insets.top }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        stickyHeaderIndices={[1]}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={onViewport}
        contentContainerStyle={{ paddingBottom: insets.bottom + NEXT_PILL_HEIGHT + spacing.xxxl }}>
        {/* The still shows through here; the sheet begins under it. */}
        <View pointerEvents="none" style={{ height: spacerH }} />

        {/*
          The top of the sheet: the tab row, which sticks under the status
          bar. Stuck, it drops its corners and gutters so it and the strip
          above it read as one header; the change lands the moment it
          sticks, under the status bar, where nothing is looking.
        */}
        <View
          style={{
            marginHorizontal: stuck ? 0 : SHEET_INSET,
            backgroundColor: colors.surface,
            borderTopLeftRadius: stuck ? 0 : radius.lg,
            borderTopRightRadius: stuck ? 0 : radius.lg,
            overflow: 'hidden',
          }}>
          <ReportTabs tabs={model.tabs} value={tab} onChange={setTab} />
        </View>

        {blocks}

        {/*
          In the funnel, Continue is the whole point of the screen — the
          paywall comes next, and the report is what earns it — so it is
          the one filled button and the others are quiet. Outside it,
          Done is the way out and Scan again the way round.
        */}
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, gap: spacing.md }}>
          {funnel ? (
            <>
              {onContinue ? <Button label={UI.actions.continue} onPress={onContinue} /> : null}
              {onRescan ? <Button label={UI.actions.rescan} variant="ghost" icon="retake" onPress={onRescan} /> : null}
              {onDone ? <Button label={UI.actions.done} variant="ghost" onPress={onDone} /> : null}
            </>
          ) : (
            <>
              {onDone ? <Button label={UI.actions.done} onPress={onDone} /> : null}
              {onRescan ? <Button label={UI.actions.rescan} variant="ghost" icon="retake" onPress={onRescan} /> : null}
            </>
          )}
        </View>
      </Animated.ScrollView>

      {/* Above the sheet, so the still's controls take the tap; gone once the sheet has risen. */}
      <View pointerEvents={pastHero ? 'none' : 'box-none'} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <HeroChrome dateLabel={model.hero.dateLabel} onBack={onBack} scrollY={scrollY} fadeBy={Math.max(1, spacerH * 0.6)} />
      </View>

      {showPill ? (
        <NextPill
          label={nextSection ? UI.actions.next : finalLabel}
          hint={nextSection ? UI.a11y.nextHint(nextSection.label) : undefined}
          visible={pillVisible}
          final={nextSection === null}
          onPress={onNext}
        />
      ) : null}
    </View>
  );
}
