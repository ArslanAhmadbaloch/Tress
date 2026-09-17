import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  HairProgressCard,
  HeaderActions,
  JournalCard,
  LearnCard,
  MetricExplainer,
  MetricTile,
  PhotoStack,
} from '@/components/dashboard';
import { BaselineCard } from '@/components/home/baseline-card';
import { StreakGlyph } from '@/components/home/streak-glyph';
import { STACK_TEXT_INSET, StackRow } from '@/components/stack-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GlassOrb } from '@/components/ui/glass-orb';
import { Icon } from '@/components/ui/icon';
import {
  EmptyState,
  Screen,
  ScreenScroll,
  ScreenTitle,
  Separator,
} from '@/components/ui/layout';
import { StrandGlyph } from '@/components/ui/metric-glyphs';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { HAIRSTYLE_COPY, hairstyleCountFor } from '@/features/hairstyles';
import {
  daysBetween,
  formatDate,
  formatRelative,
  toDateKey,
} from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import {
  activeRoutineItems,
  baselineSession,
  dosesOn,
  consistencyScore,
  currentStreak,
  latestSession,
  nextUpdate,
  productFor,
  sessionHistory,
  todayProgress,
  weeklyAdherenceHistory,
  sessionLabel,
} from '@/store/selectors';
import { spacing, useTheme } from '@/theme';
import {
  ANGLES,
  isScanSession,
  journeyHairType,
  sessionToExtend,
  type Angle,
  type PhotoSession,
} from '@/types/domain';

/** The angle the progress card leads with — the crown shows most change. */
const HERO_ANGLE: Angle = 'crown';

/** Streak length the ring treats as full, so it has something to fill against. */
const STREAK_TARGET = 30;

/** Sessions the photo ring fills across — enough for a first real comparison. */
const SESSION_TARGET = 6;

/**
 * The gap between cards. Sixteen, not twelve: the reference's home is a
 * column of white cards with visible ground between them, and at twelve
 * the shadows of neighbouring cards ran together into one long strip.
 */
const CARD_GAP = spacing.lg;

/** Shown in every explainer, because the tiles draw a line from day one. */
const TREND_NOTE =
  'Until there are three weeks of history, the faded line under the number is a placeholder shape, not your data. It turns solid green as your own history builds.';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function hasAngle(session: PhotoSession, angle: Angle): boolean {
  return session.photos.some((p) => p.angle === angle);
}

type Explainer = 'consistency' | 'streak' | 'photos' | null;

export default function HomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data, advanceRoutineToday } = useAppStore();

  const [explain, setExplain] = useState<Explainer>(null);

  const adherenceHistory = useMemo(() => weeklyAdherenceHistory(data), [data]);
  const photoHistory = useMemo(() => sessionHistory(data), [data]);

  const latest = latestSession(data);
  const baseline = baselineSession(data);

  /*
    The angle the hero compares. The crown, when both sessions have it;
    otherwise the first angle they share. The first session can be a
    single angle from the funnel's scan, and a card that insisted on the
    crown would show "No photo" beside a real photograph for as long as
    that session stayed the baseline.
  */
  const heroAngle = useMemo<Angle>(() => {
    if (!baseline || !latest) return HERO_ANGLE;
    if (hasAngle(baseline, HERO_ANGLE) && hasAngle(latest, HERO_ANGLE)) return HERO_ANGLE;
    return ANGLES.find((a) => hasAngle(baseline, a) && hasAngle(latest, a)) ?? HERO_ANGLE;
  }, [baseline, latest]);

  /* The catalogue's count for the hair type they told the funnel: a number about a catalogue, not a head. */
  const styleCount = useMemo(() => hairstyleCountFor(data), [data]);

  const journey = data.journey;
  if (!journey) return null;

  const name = data.profile?.displayName?.trim();
  const score = consistencyScore(data);
  const streak = currentStreak(data);
  const due = nextUpdate(data);
  const items = activeRoutineItems(data);
  const takenToday = dosesOn(data, toDateKey());
  const today = todayProgress(data);

  const totalPhotos = data.sessions.reduce((n, s) => n + s.photos.length, 0);
  const recentThumbs = data.sessions
    .flatMap((s) => s.photos)
    .slice(0, 3)
    .map((p) => p.thumbnailUri ?? p.uri);

  /*
    Two sessions on different days. Two on the same day — a set retaken
    ten minutes later — are not before and after, and a hero that
    put them side by side under "Baseline → Day 1" would be presenting a
    change that had no time to happen.
  */
  const hasComparison = Boolean(
    baseline &&
      latest &&
      baseline.id !== latest.id &&
      daysBetween(baseline.capturedAt, latest.capturedAt) >= 1,
  );

  /*
    Two kinds of baseline can be the only session. One from before the
    hair scan existed may still lack angles, and the card for that shows
    for exactly the session a capture would extend (see baseline-card.tsx).
    A scan baseline is never "incomplete": a scan keeps the angles the
    turn reached, and nothing here nags about the ones it did not — the
    only thing to offer is the next scan.
  */
  const toExtend = sessionToExtend(data.sessions);
  const needsBaseline = toExtend !== null;
  const only = data.sessions.length === 1 ? data.sessions[0] : null;
  const scanBaselineOnly = only !== null && isScanSession(only);

  const hairType = journeyHairType(journey);

  return (
    <Screen>
      <ScreenScroll>
        <ScreenTitle
          eyebrow="Tress"
          eyebrowTone="brand"
          // The first thing seen each launch, and the only header that
          // arrives in sequence rather than all at once.
          reveal
          title={`${greeting()},`}
          titleMuted={name ? `${name}.` : 'friend.'}
          // No subtitle: the script beside it already carries the warm
          // line, and two motivational statements stacked in one header is
          // one motivational statement too many — it also cost two lines
          // of the first screenful before any of the user's own data.
          // The one place the script appears, and it says what the
          // lockup says. Two versions of a brand line is one too many.
          script={'Better Hair.\nConfident You.'}
          trailing={
            <HeaderActions
              initial={(name ?? 'Y').charAt(0).toUpperCase()}
              avatarUri={data.profile?.avatarUri}
              onSettings={() => router.push('/settings')}
              onProfile={() => router.push('/profile')}
            />
          }
        />

        {/* Hair progress — the photographs come first. */}
        {hasComparison && baseline && latest ? (
          <HairProgressCard
            beforeUri={baseline.photos.find((p) => p.angle === heroAngle)?.thumbnailUri}
            afterUri={latest.photos.find((p) => p.angle === heroAngle)?.thumbnailUri}
            beforeLabel={sessionLabel(journey.startedAt, baseline)}
            afterLabel={sessionLabel(journey.startedAt, latest)}
            beforeDate={formatDate(baseline.capturedAt)}
            afterDate={formatDate(latest.capturedAt)}
            onPress={() => router.push('/compare')}
          />
        ) : (
          // Nothing to compare yet — either no photos at all, or only the
          // baseline. Both show the same labelled example of what the card
          // becomes, because a baseline on its own is not progress and
          // dressing it up as the card's finished state would say it was.
          <HairProgressCard
            example
            awaitingFirstUpdate={Boolean(latest)}
            beforeLabel="Month 0"
            afterLabel="Month 6"
            beforeDate="Example"
            afterDate="Example"
            onPress={() => router.push('/hair-scan')}
          />
        )}

        {/*
          Directly under the hero, because it is about the hero: the
          example photographs above it stay examples until there is a
          second session. A pre-scan baseline that lacks angles gets the
          card that says so; a scan baseline gets the next scan offered
          plainly, and no talk of missing angles. Neither shows once the
          update is overdue — the reminder below turns into the ask then.
          (`due` is never null here: the screen has already returned on a
          missing journey, and that is the only case nextUpdate has none.)
        */}
        {toExtend ? (
          <BaselineCard
            session={toExtend}
            onCapture={() => router.push('/hair-scan')}
            style={{ marginTop: CARD_GAP }}
          />
        ) : scanBaselineOnly && due !== null && !due.isOverdue ? (
          <Card style={{ marginTop: CARD_GAP }}>
            <Text variant="title3" accessibilityRole="header">
              Baseline saved
            </Text>
            <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.sm }}>
              Your next scan is set beside this one. Same light, same distance, and
              the comparison is yours to make.
            </Text>
            <Button
              label="Scan again"
              size="md"
              block={false}
              onPress={() => router.push('/hair-scan')}
              style={{ marginTop: spacing.xl }}
            />
          </Card>
        ) : null}

        {/* Three metrics. */}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: CARD_GAP }}>
          <MetricTile
            glyph={<StrandGlyph size={21} />}
            label="Consistency"
            value={score.value}
            delta={score.delta}
            deltaSuffix=""
            ring={score.value / 100}
            history={adherenceHistory}
            seed="consistency"
            onPress={() => router.push('/calendar')}
            onExplain={() => setExplain('consistency')}
          />
          <MetricTile
            glyph={
              // Ink like its neighbours until the day is actually done,
              // then amber. See streak-glyph.tsx for why the colour is
              // spent on that moment rather than on merely having a streak.
              <StreakGlyph complete={today.total > 0 && today.done === today.total} />
            }
            label="Streak"
            value={streak}
            unit="days"
            ring={Math.min(1, streak / STREAK_TARGET)}
            history={adherenceHistory}
            seed="streak"
            // Consistency opens the calendar; this opens the stack behind
            // the number. Two tiles that led to the same screen made one
            // of them look broken.
            onPress={() => router.push('/streak')}
            onExplain={() => setExplain('streak')}
          />
          <MetricTile
            glyph={<Icon name="camera" size={18} color={colors.text} />}
            label="Photos"
            value={totalPhotos}
            unit="total"
            ring={Math.min(1, data.sessions.length / SESSION_TARGET)}
            history={photoHistory}
            seed="photos"
            footer={
              recentThumbs.length > 0 ? (
                <PhotoStack
                  uris={recentThumbs}
                  remaining={Math.max(0, totalPhotos - recentThumbs.length)}
                />
              ) : undefined
            }
            onPress={() => router.push('/journey')}
            onExplain={() => setExplain('photos')}
          />
        </View>

        {/* Today's stack. */}
        {items.length > 0 ? (
          <Card padded={false} style={{ marginTop: CARD_GAP }}>
            {/*
              The header's side padding matches the rows' rather than the
              card's twenty, so the title sits flush over the first orb
              instead of a few points to its right.
            */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.xl,
                paddingBottom: spacing.sm,
              }}>
              <Text variant="title3">Today&apos;s Stack</Text>
              <Text
                variant="subhead"
                color={today.done === today.total ? 'accent' : 'textSecondary'}>
                {today.done} of {today.total}
              </Text>
            </View>

            {items.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? (
                  <Separator inset={STACK_TEXT_INSET} insetEnd={spacing.lg} />
                ) : null}
                <StackRow
                  item={item}
                  taken={takenToday.get(item.id) ?? 0}
                  onToggle={() => advanceRoutineToday(item.id)}
                  product={productFor(data, item)}
                />
              </View>
            ))}

            {/* The way back into the routine once it has items — without
                this, Home offers no route to add or remove a task. */}
            <Separator inset={STACK_TEXT_INSET} insetEnd={spacing.lg} />
            <PressableScale
              onPress={() => router.push('/routine')}
              scaleTo={0.99}
              accessibilityRole="button"
              accessibilityLabel="Add or edit tasks"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm + spacing.xxs,
                paddingBottom: spacing.md,
              }}>
              <GlassOrb size={38} ring={false}>
                <Icon name="plus" size={15} color={colors.accent} />
              </GlassOrb>
              <Text variant="callout" color="accent" style={{ flex: 1, fontWeight: '500' }}>
                Add or edit tasks
              </Text>
              <Icon name="chevronRight" size={15} color={colors.textTertiary} />
            </PressableScale>
          </Card>
        ) : (
          /*
            White like every other card, not the inset grey it was. An
            empty stack is not a lesser card; it is the same card before
            anything is in it, and a grey panel in a column of white ones
            read as disabled.
          */
          <Card style={{ marginTop: CARD_GAP }}>
            <Text variant="title3">Today&apos;s Stack</Text>
            <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.sm }}>
              Build a routine you can actually stick to.
            </Text>
            <Button
              label="Add routine"
              size="md"
              block={false}
              onPress={() => router.push('/routine')}
              style={{ marginTop: spacing.xl }}
            />
          </Card>
        )}

        <JournalCard
          entries={data.journal}
          onOpen={() => router.push('/journal')}
          onWrite={() => router.push({ pathname: '/journal', params: { compose: '1' } })}
          style={{ marginTop: CARD_GAP }}
        />

        <LearnCard
          style={{ marginTop: CARD_GAP }}
          onPress={() => router.push('/learn')}
        />

        {/*
          The hairstyle catalogue: styling suggestions for the hair type
          on the record, drawn on a blank head. A small card, because it
          is a list to browse rather than a thing to do today.
        */}
        <Card
          style={{ marginTop: CARD_GAP }}
          onPress={() => router.push('/hairstyles')}
          accessibilityLabel={HAIRSTYLE_COPY.home.title}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <GlassOrb size={44} ring={false} tone="neutral">
              <Icon name="sparkle" size={18} color={colors.text} />
            </GlassOrb>
            <View style={{ flex: 1 }}>
              <Text variant="headline">{HAIRSTYLE_COPY.home.title}</Text>
              <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.xxs }}>
                {HAIRSTYLE_COPY.home.body(styleCount, hairType)}
              </Text>
            </View>
            <Icon name="chevronRight" size={15} color={colors.textTertiary} />
          </View>
        </Card>

        {/*
          A reminder, not a metric, so it sits below the fold. Not shown
          while a pre-scan baseline still lacks angles: the baseline card
          above is already the ask.
        */}
        {due && data.sessions.length > 0 && !needsBaseline ? (
          <Card
            style={{ marginTop: CARD_GAP }}
            onPress={() => router.push('/hair-scan')}
            accessibilityLabel="Start a scan">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: due.isOverdue
                    ? colors.accent
                    : colors.backgroundSubtle,
                }}>
                <Icon
                  name="camera"
                  size={18}
                  color={due.isOverdue ? colors.textOnAccent : colors.text}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="headline">
                  {due.isOverdue
                    ? 'Scan due now'
                    : `Next scan ${formatRelative(due.dueISO)}`}
                </Text>
                <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
                  Same light, same distance as last time.
                </Text>
              </View>
              <Icon name="chevronRight" size={15} color={colors.textTertiary} />
            </View>
          </Card>
        ) : null}

        {data.sessions.length === 0 ? (
          <EmptyState
            icon="camera"
            title="Your journey starts here"
            body="Your first scan becomes your baseline. Every scan after it is set beside it."
            actionLabel="Scan your hair"
            onAction={() => router.push('/hair-scan')}
          />
        ) : null}
      </ScreenScroll>

      {explain ? (
        <MetricExplainer {...EXPLAINERS[explain]} onClose={() => setExplain(null)} />
      ) : null}
    </Screen>
  );
}

/**
 * How each number is actually derived.
 *
 * Written out because these are the claims the dashboard makes, and a
 * tracking app that will not show its working is asking to be trusted on
 * nothing.
 */
const EXPLAINERS: Record<
  Exclude<Explainer, null>,
  { title: string; body: string; points: string[] }
> = {
  consistency: {
    title: 'Consistency',
    body: 'How consistently you are documenting — not an assessment of your hair. Nothing in this app measures hair; it stores your photographs and puts them side by side so you can judge for yourself.',
    points: [
      'Routine adherence over the last 30 days, weighted 60%',
      'Photo sessions taken against those expected for your interval, weighted 40%',
      'The change compares this 30-day window with the previous one',
      'With no routine recorded, it is based on photo sessions alone',
      TREND_NOTE,
    ],
  },
  streak: {
    title: 'Streak',
    body: 'Consecutive days on which every item in your stack was ticked off.',
    points: [
      'Today does not break a streak until the day ends',
      'Items only count from the day you added them',
      'Every item has to be ticked, so one missed task holds the whole day',
      'Opening this tile shows each item, when you started it and how it has gone',
      'The ring fills against a 30-day mark',
      TREND_NOTE,
    ],
  },
  photos: {
    title: 'Photos',
    body: 'Every photograph stored on this device, across all your sessions.',
    points: [
      'Each scan keeps the angles the turn reached, up to five',
      'Kept in the app’s private storage — nothing is uploaded',
      'Deleting a session deletes its photographs too',
      'The ring fills across your first six sessions',
      'Before your first photos, the faded line is a placeholder shape, not your data',
    ],
  },
};
