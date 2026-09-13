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
import { STACK_TEXT_INSET, StackRow } from '@/components/stack-row';
import { Card } from '@/components/ui/card';
import { GlassOrb } from '@/components/ui/glass-orb';
import { StrandGlyph } from '@/components/ui/metric-glyphs';
import { Flicker } from '@/components/ui/motion';
import { Icon } from '@/components/ui/icon';
import {
  EmptyState,
  Screen,
  ScreenScroll,
  ScreenTitle,
  Separator,
} from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import {
  formatDate,
  formatMilestone,
  formatRelative,
  toDateKey,
} from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import {
  activeRoutineItems,
  baselineSession,
  completedOn,
  consistencyScore,
  currentStreak,
  latestSession,
  nextUpdate,
  sessionHistory,
  todayProgress,
  weeklyAdherenceHistory,
} from '@/store/selectors';
import { useTheme } from '@/theme';
import { type Angle } from '@/types/domain';

/** The angle the progress card leads with — the crown shows most change. */
const HERO_ANGLE: Angle = 'crown';

/** Streak length the ring treats as full, so it has something to fill against. */
const STREAK_TARGET = 30;

/** Sessions the photo ring fills across — enough for a first real comparison. */
const SESSION_TARGET = 6;

/** Shown in every explainer, because the tiles draw a line from day one. */
const TREND_NOTE =
  'Until there are three weeks of history, the faded line under the number is a placeholder shape, not your data. It turns solid green as your own history builds.';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

type Explainer = 'consistency' | 'streak' | 'photos' | null;

export default function HomeScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { data, toggleRoutineToday } = useAppStore();

  const [explain, setExplain] = useState<Explainer>(null);

  const adherenceHistory = useMemo(() => weeklyAdherenceHistory(data), [data]);
  const photoHistory = useMemo(() => sessionHistory(data), [data]);

  const journey = data.journey;
  if (!journey) return null;

  const name = data.profile?.displayName?.trim();
  const latest = latestSession(data);
  const baseline = baselineSession(data);
  const score = consistencyScore(data);
  const streak = currentStreak(data);
  const due = nextUpdate(data);
  const items = activeRoutineItems(data);
  const doneToday = completedOn(data, toDateKey());
  const today = todayProgress(data);

  const totalPhotos = data.sessions.reduce((n, s) => n + s.photos.length, 0);
  const recentThumbs = data.sessions
    .flatMap((s) => s.photos)
    .slice(0, 3)
    .map((p) => p.thumbnailUri ?? p.uri);

  const hasComparison = Boolean(baseline && latest && baseline.id !== latest.id);

  return (
    <Screen>
      <ScreenScroll>
        <ScreenTitle
          eyebrow="Hair Journey"
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
            beforeUri={baseline.photos.find((p) => p.angle === HERO_ANGLE)?.thumbnailUri}
            afterUri={latest.photos.find((p) => p.angle === HERO_ANGLE)?.thumbnailUri}
            beforeLabel={formatMilestone(journey.startedAt, baseline.capturedAt, baseline.isBaseline)}
            afterLabel={formatMilestone(journey.startedAt, latest.capturedAt, latest.isBaseline)}
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
            onPress={() => router.push('/capture-intro')}
          />
        )}

        {/* Three metrics. */}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
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
              // Lit only while the streak is: an unlit streak should look
              // unlit, and a flame that flickers at zero is a lie.
              <Flicker alive={streak > 0}>
                <Icon
                  name="flame"
                  size={18}
                  color={streak > 0 ? colors.accent : colors.textTertiary}
                />
              </Flicker>
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
          <Card padded={false} style={{ marginTop: spacing.md }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: spacing.lg,
                paddingBottom: spacing.xs,
              }}>
              <Text variant="title3">Today&apos;s Stack</Text>
              <Text
                variant="callout"
                color={today.done === today.total ? 'accent' : 'textSecondary'}
                style={{ fontWeight: '500' }}>
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
                  done={doneToday.has(item.id)}
                  onToggle={() => toggleRoutineToday(item.id)}
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
          <Card tone="subtle" style={{ marginTop: spacing.md }}>
            <Text variant="title3">Today&apos;s Stack</Text>
            <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.sm }}>
              Build a routine you can actually stick to.
            </Text>
            <PressableScale
              onPress={() => router.push('/routine')}
              style={{
                alignSelf: 'flex-start',
                marginTop: spacing.lg,
                paddingHorizontal: spacing.xl,
                paddingVertical: spacing.md,
                borderRadius: 999,
                backgroundColor: colors.accent,
              }}
              accessibilityRole="button"
              accessibilityLabel="Add routine">
              <Text variant="subhead" color="textOnAccent">
                Add routine
              </Text>
            </PressableScale>
          </Card>
        )}

        <JournalCard
          entries={data.journal}
          onOpen={() => router.push('/journal')}
          onWrite={() => router.push({ pathname: '/journal', params: { compose: '1' } })}
          style={{ marginTop: spacing.md }}
        />

        <LearnCard
          style={{ marginTop: spacing.md }}
          onPress={() => router.push('/learn')}
        />

        {/* A reminder, not a metric, so it sits below the fold. */}
        {due && data.sessions.length > 0 ? (
          <Card
            style={{ marginTop: spacing.md }}
            onPress={() => router.push('/capture-intro')}
            accessibilityLabel="Start a photo update">
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
                    ? 'Photo update due now'
                    : `Next update ${formatRelative(due.dueISO)}`}
                </Text>
                <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
                  Same five angles, same conditions as last time.
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
            body="Your first photos become your baseline. Everything you capture later is compared against them."
            actionLabel="Capture baseline"
            onAction={() => router.push('/capture-intro')}
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
      'Five angles per complete session',
      'Kept in the app’s private storage — nothing is uploaded',
      'Deleting a session deletes its photographs too',
      'The ring fills across your first six sessions',
      'Before your first photos, the faded line is a placeholder shape, not your data',
    ],
  },
};
