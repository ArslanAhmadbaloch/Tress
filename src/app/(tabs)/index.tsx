import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  HairProgressCard,
  HeaderActions,
  LearnCard,
  MetricExplainer,
  MetricTile,
  PhotoStack,
} from '@/components/dashboard';
import { Card } from '@/components/ui/card';
import { BarsGlyph, StrandGlyph } from '@/components/ui/metric-glyphs';
import { Icon, type IconName } from '@/components/ui/icon';
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
import { type Angle, type RoutineItem } from '@/types/domain';

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

/** A glyph per routine item, inferred from its name. Cosmetic only. */
function routineIcon(item: RoutineItem): IconName {
  const label = `${item.label} ${item.detail ?? ''}`.toLowerCase();
  if (/topical|serum|oil|spray|foam|solution/.test(label)) return 'bottle';
  if (/water|drink|shake|collagen|tea/.test(label)) return 'glass';
  if (/tablet|capsule|supplement|vitamin|biotin/.test(label)) return 'capsule';
  if (/wash|shampoo|scalp|massage/.test(label)) return 'drop';
  return 'follicle';
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
          subtitle={'Small steps today.\nA healthier, fuller you tomorrow.'}
          script="Better Hair A Healthier You"
          trailing={
            <HeaderActions
              initial={(name ?? 'Y').charAt(0).toUpperCase()}
              avatarUri={data.profile?.avatarUri}
              hasAlert={Boolean(due?.isOverdue) || today.done < today.total}
              onNotifications={() => router.push('/settings')}
              onProfile={() => router.push('/profile')}
            />
          }
        />

        {/* Hair progress — the photographs come first. */}
        {latest ? (
          <HairProgressCard
            beforeUri={
              baseline?.photos.find((p) => p.angle === HERO_ANGLE)?.thumbnailUri
            }
            afterUri={
              latest.photos.find((p) => p.angle === HERO_ANGLE)?.thumbnailUri
            }
            beforeLabel={
              baseline ? formatMilestone(journey.startedAt, baseline.capturedAt) : '—'
            }
            afterLabel={formatMilestone(journey.startedAt, latest.capturedAt)}
            beforeDate={baseline ? formatDate(baseline.capturedAt) : ''}
            afterDate={formatDate(latest.capturedAt)}
            onPress={() =>
              hasComparison
                ? router.push('/compare')
                : router.push(`/session/${latest.id}`)
            }
          />
        ) : null}

        {/* Three metrics. */}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
          <MetricTile
            glyph={<StrandGlyph size={25} />}
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
            glyph={<BarsGlyph size={24} />}
            label="Streak"
            value={streak}
            unit="days"
            ring={Math.min(1, streak / STREAK_TARGET)}
            history={adherenceHistory}
            seed="streak"
            onPress={() => router.push('/calendar')}
            onExplain={() => setExplain('streak')}
          />
          <MetricTile
            glyph={<Icon name="camera" size={22} color={colors.text} />}
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
                paddingBottom: spacing.md,
              }}>
              <Text variant="title3">Today&apos;s Stack</Text>
              <Text
                variant="subhead"
                color={today.done === today.total ? 'accent' : 'textSecondary'}>
                {today.done} of {today.total}
              </Text>
            </View>

            {items.map((item, index) => {
              const done = doneToday.has(item.id);
              return (
                <View key={item.id}>
                  {index > 0 ? <Separator inset={68} /> : null}
                  <PressableScale
                    onPress={() => toggleRoutineToday(item.id)}
                    haptic={done ? 'light' : 'success'}
                    scaleTo={0.995}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    accessibilityLabel={item.label}
                    accessibilityHint={item.detail}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.md,
                    }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.accentSoft,
                      }}>
                      <Icon name={routineIcon(item)} size={16} color={colors.text} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text variant="headline">{item.label}</Text>
                      {item.detail ? (
                        <Text
                          variant="footnote"
                          color="textSecondary"
                          style={{ marginTop: 1 }}>
                          {item.detail}
                        </Text>
                      ) : null}
                    </View>

                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: done ? colors.accentSoft : 'transparent',
                        borderWidth: done ? 0 : 1.5,
                        borderColor: colors.border,
                      }}>
                      {done ? (
                        <Icon name="check" size={15} color={colors.accent} />
                      ) : null}
                    </View>
                  </PressableScale>
                </View>
              );
            })}
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
