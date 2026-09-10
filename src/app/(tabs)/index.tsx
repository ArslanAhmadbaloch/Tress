import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
  EmptyState,
  Screen,
  ScreenScroll,
  ScreenTitle,
  SectionHeader,
} from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { AnimatedNumber, ProgressBar } from '@/components/ui/stat';
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
  todayProgress,
  weekProgress,
} from '@/store/selectors';
import { useTheme } from '@/theme';
import { ANGLE_LABELS, type Angle } from '@/types/domain';

/** The angle the progress card leads with — the crown shows most change. */
const HERO_ANGLE: Angle = 'crown';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { data, toggleRoutineToday } = useAppStore();

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
  const week = weekProgress(data);

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
        />

        {/* 1. The user's own photographs, first on the screen. */}
        {latest ? (
          <ProgressCard
            baselineUri={
              baseline?.photos.find((p) => p.angle === HERO_ANGLE)?.thumbnailUri
            }
            latestUri={
              latest.photos.find((p) => p.angle === HERO_ANGLE)?.thumbnailUri
            }
            baselineLabel={
              baseline ? formatMilestone(journey.startedAt, baseline.capturedAt) : ''
            }
            latestLabel={formatMilestone(journey.startedAt, latest.capturedAt)}
            baselineDate={baseline ? formatDate(baseline.capturedAt) : ''}
            latestDate={formatDate(latest.capturedAt)}
            onPress={() =>
              hasComparison
                ? router.push('/compare')
                : router.push(`/session/${latest.id}`)
            }
          />
        ) : null}

        {/* 2-4. The three numbers. */}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
          <MetricTile
            icon="target"
            label="Consistency"
            value={score.value}
            delta={score.delta}
            onPress={() => router.push('/calendar')}
            accessibilityHint="How consistently you are documenting. Opens your calendar."
          />
          <MetricTile
            icon="flame"
            label="Streak"
            value={streak}
            unit="days"
            onPress={() => router.push('/calendar')}
          />
          <MetricTile
            icon="camera"
            label="Photos"
            value={data.sessions.length * 5}
            unit="total"
            onPress={() => router.push('/journey')}
          />
        </View>

        {/* 5. This week's routine. */}
        {items.length > 0 ? (
          <>
            <SectionHeader
              title="This week"
              action="Manage"
              onAction={() => router.push('/routine')}
            />
            <Card>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: spacing.md,
                }}>
                <Text variant="subhead" color="textSecondary">
                  {today.done} of {today.total} done today
                </Text>
                <Text variant="subhead" color={week.done > 0 ? 'accent' : 'textTertiary'}>
                  {week.done}/7 days
                </Text>
              </View>

              <ProgressBar
                progress={today.total === 0 ? 0 : today.done / today.total}
              />

              <View style={{ marginTop: spacing.lg }}>
                {items.map((item) => {
                  const done = doneToday.has(item.id);
                  return (
                    <PressableScale
                      key={item.id}
                      onPress={() => toggleRoutineToday(item.id)}
                      haptic={done ? 'light' : 'success'}
                      scaleTo={0.99}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: done }}
                      accessibilityLabel={item.label}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                        paddingVertical: spacing.md,
                      }}>
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: colors.fill,
                        }}>
                        <Icon name="drop" size={16} color={colors.textSecondary} />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text variant="body" color={done ? 'textSecondary' : 'text'}>
                          {item.label}
                        </Text>
                        {item.detail ? (
                          <Text variant="caption" color="textTertiary" style={{ marginTop: 1 }}>
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
                  );
                })}
              </View>
            </Card>
          </>
        ) : (
          <>
            <SectionHeader title="This week" />
            <Card tone="subtle">
              <Text variant="callout" color="textSecondary">
                Build a routine you can actually stick to.
              </Text>
              <PressableScale
                onPress={() => router.push('/routine')}
                style={{
                  alignSelf: 'flex-start',
                  marginTop: spacing.md,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.pill,
                  backgroundColor: colors.accent,
                }}
                accessibilityRole="button"
                accessibilityLabel="Add routine">
                <Text variant="subhead" color="textOnAccent">
                  Add routine
                </Text>
              </PressableScale>
            </Card>
          </>
        )}

        {/* 6. What happens next. */}
        {due ? (
          <>
            <SectionHeader title="Next update" />
            <Card
              onPress={() => router.push('/capture-intro')}
              accessibilityLabel="Start a photo update">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: due.isOverdue ? colors.accent : colors.fill,
                  }}>
                  <Icon
                    name="camera"
                    size={19}
                    color={due.isOverdue ? colors.textOnAccent : colors.textSecondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="headline">
                    {due.isOverdue
                      ? 'Update due now'
                      : `Photo update ${formatRelative(due.dueISO)}`}
                  </Text>
                  <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
                    {data.sessions.length === 0
                      ? 'Capture your baseline to begin'
                      : 'Same five angles as last time'}
                  </Text>
                </View>
                <Icon name="chevronRight" size={15} color={colors.textTertiary} />
              </View>
            </Card>
          </>
        ) : null}

        {/* Learn */}
        <Card
          style={{ marginTop: spacing.xl }}
          onPress={() => router.push('/learn')}
          accessibilityLabel="Open the Learn library">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.accentSoft,
              }}>
              <Icon name="learn" size={19} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headline">Learn &amp; grow</Text>
              <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
                How hair changes, and how to read your own timeline.
              </Text>
            </View>
            <Icon name="arrowRight" size={16} color={colors.textTertiary} />
          </View>
        </Card>

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
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The hair progress card.
 *
 * Photographs are the content of this product, so they take the largest
 * surface on the screen and sit above every metric.
 */
function ProgressCard({
  baselineUri,
  latestUri,
  baselineLabel,
  latestLabel,
  baselineDate,
  latestDate,
  onPress,
}: {
  baselineUri?: string;
  latestUri?: string;
  baselineLabel: string;
  latestLabel: string;
  baselineDate: string;
  latestDate: string;
  onPress: () => void;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <Card
      padded={false}
      style={{ marginTop: spacing.lg }}
      onPress={onPress}
      accessibilityLabel={`Hair progress, ${baselineLabel} to ${latestLabel}`}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: spacing.lg,
        }}>
        <Text variant="headline">Hair progress</Text>
        <View
          style={{
            paddingHorizontal: spacing.md,
            paddingVertical: 5,
            borderRadius: radius.pill,
            backgroundColor: colors.fill,
          }}>
          <Text variant="caption" color="textSecondary">
            {baselineLabel} → {latestLabel}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 3, paddingHorizontal: 3 }}>
        <Frame uri={baselineUri} label={baselineLabel} date={baselineDate} />
        <Frame uri={latestUri} label={latestLabel} date={latestDate} />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          padding: spacing.lg,
        }}>
        <Icon name="compare" size={15} color={colors.accent} />
        <Text variant="subhead" color="accent" style={{ flex: 1 }}>
          Compare angles
        </Text>
        <Icon name="chevronRight" size={14} color={colors.textTertiary} />
      </View>
    </Card>
  );
}

function Frame({
  uri,
  label,
  date,
}: {
  uri?: string;
  label: string;
  date: string;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View style={{ flex: 1, aspectRatio: 0.86 }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%', borderRadius: radius.sm }}
          contentFit="cover"
          transition={180}
          accessibilityLabel={`${ANGLE_LABELS[HERO_ANGLE]}, ${label}`}
        />
      ) : (
        <View
          style={{
            width: '100%',
            height: '100%',
            borderRadius: radius.sm,
            backgroundColor: colors.fill,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
          }}>
          <Icon name="camera" size={20} color={colors.textTertiary} />
          <Text variant="caption" color="textTertiary">
            {label || 'Not yet'}
          </Text>
        </View>
      )}

      {uri ? (
        <View
          style={{
            position: 'absolute',
            left: spacing.sm,
            bottom: spacing.sm,
            paddingHorizontal: spacing.sm,
            paddingVertical: 4,
            borderRadius: radius.xs,
            backgroundColor: colors.photoScrim,
          }}>
          <Text variant="caption" color="textOnPhoto">
            {date}
          </Text>
          <Text variant="caption" color="textOnPhoto" style={{ opacity: 0.75 }}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function MetricTile({
  icon,
  label,
  value,
  unit,
  delta,
  onPress,
  accessibilityHint,
}: {
  icon: 'target' | 'flame' | 'camera';
  label: string;
  value: number;
  unit?: string;
  delta?: number | null;
  onPress: () => void;
  accessibilityHint?: string;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}
      accessibilityHint={accessibilityHint}
      style={{
        flex: 1,
        padding: spacing.lg,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.md,
      }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.accentSoft,
        }}>
        <Icon name={icon} size={16} color={colors.accent} />
      </View>

      <View>
        <Text variant="footnote" color="textSecondary">
          {label}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <AnimatedNumber value={value} />
          {unit ? (
            <Text variant="caption" color="textTertiary">
              {unit}
            </Text>
          ) : null}
        </View>

        {typeof delta === 'number' && delta !== 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Icon
              name="chart"
              size={11}
              color={delta > 0 ? colors.accent : colors.textTertiary}
            />
            <Text variant="caption" color={delta > 0 ? 'accent' : 'textTertiary'}>
              {delta > 0 ? '+' : ''}
              {delta}
            </Text>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}
