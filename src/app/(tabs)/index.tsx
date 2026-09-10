import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
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
import { ProgressBar, StatTile } from '@/components/ui/stat';
import { Text } from '@/components/ui/text';
import { formatDuration, formatMilestone, formatRelative } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import {
  activeRoutineItems,
  adherencePercent,
  completedOn,
  currentStreak,
  latestSession,
  nextUpdate,
  todayProgress,
} from '@/store/selectors';
import { toDateKey } from '@/lib/date';
import { useTheme } from '@/theme';
import { ANGLE_LABELS } from '@/types/domain';

export default function HomeScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { data, toggleRoutineToday } = useAppStore();

  const journey = data.journey;
  if (!journey) return null;

  const last = latestSession(data);
  const due = nextUpdate(data);
  const adherence = adherencePercent(data);
  const streak = currentStreak(data);
  const progress = todayProgress(data);
  const items = activeRoutineItems(data);
  const doneToday = completedOn(data, toDateKey());

  const greeting = data.profile?.displayName
    ? `Hello, ${data.profile.displayName}`
    : 'Your journey';

  return (
    <Screen>
      <ScreenScroll>
        <ScreenTitle
          title={greeting}
          subtitle={
            last
              ? `Last update ${formatRelative(last.capturedAt)}`
              : 'Start with your baseline photos'
          }
        />

        {/* Journey duration — the single number that frames everything. */}
        <Card style={{ marginTop: spacing.lg }} tone="surface">
          <Text variant="overline" color="textTertiary">
            JOURNEY
          </Text>
          <Text variant="display" style={{ marginTop: spacing.xs }}>
            {formatDuration(journey.startedAt)}
          </Text>
          <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.xs }}>
            {data.sessions.length}{' '}
            {data.sessions.length === 1 ? 'photo session' : 'photo sessions'} recorded
          </Text>
        </Card>

        {last ? (
          <>
            <SectionHeader
              title="Latest update"
              action="View"
              onAction={() => router.push(`/session/${last.id}`)}
            />
            <Card padded={false} onPress={() => router.push(`/session/${last.id}`)}>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {last.photos.slice(0, 5).map((photo) => (
                  <View key={photo.id} style={{ flex: 1, aspectRatio: 0.78 }}>
                    <Image
                      source={{ uri: photo.thumbnailUri ?? photo.uri }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      transition={180}
                      accessibilityLabel={`${ANGLE_LABELS[photo.angle]} photo`}
                    />
                  </View>
                ))}
              </View>
              <View style={{ padding: spacing.lg }}>
                <Text variant="headline">
                  {formatMilestone(journey.startedAt, last.capturedAt)}
                </Text>
                <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
                  {formatRelative(last.capturedAt)} · {last.photos.length} of 5 angles
                </Text>
              </View>
            </Card>
          </>
        ) : null}

        {/* Progress metrics */}
        <SectionHeader title="Progress" />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <StatTile
            icon="photo"
            label="Sessions"
            value={data.sessions.length}
            caption={data.sessions.length === 0 ? 'None yet' : undefined}
          />
          <StatTile
            icon="chart"
            label="Adherence"
            value={adherence ?? '—'}
            suffix={adherence === null ? '' : '%'}
            caption="Last 30 days"
            tone={adherence !== null && adherence >= 80 ? 'accent' : 'default'}
          />
        </View>

        {streak > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              marginTop: spacing.md,
              padding: spacing.lg,
              borderRadius: radius.card,
              backgroundColor: colors.accentSoft,
            }}>
            <Icon name="flame" size={20} color={colors.accent} />
            <Text variant="headline" color="accent" style={{ flex: 1 }}>
              {streak}-day streak
            </Text>
            <Text variant="footnote" color="textSecondary">
              Keep it going
            </Text>
          </View>
        ) : null}

        {/* Today's routine */}
        <SectionHeader
          title="Today's routine"
          action={items.length > 0 ? 'Manage' : undefined}
          onAction={items.length > 0 ? () => router.push('/routine') : undefined}
        />

        {items.length === 0 ? (
          <Card tone="subtle">
            <Text variant="callout" color="textSecondary">
              Add your routine to start tracking consistency.
            </Text>
            <Button
              label="Add routine"
              variant="secondary"
              size="md"
              block={false}
              style={{ marginTop: spacing.md }}
              onPress={() => router.push('/routine')}
            />
          </Card>
        ) : (
          <Card>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: spacing.md,
              }}>
              <Text variant="subhead" color="textSecondary">
                {progress.done} of {progress.total} done
              </Text>
              {progress.done === progress.total ? (
                <Text variant="subhead" color="accent">
                  Complete
                </Text>
              ) : null}
            </View>

            <ProgressBar
              progress={progress.total === 0 ? 0 : progress.done / progress.total}
            />

            <View style={{ marginTop: spacing.lg, gap: spacing.xs }}>
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
                    <Icon
                      name={done ? 'checkCircle' : 'circle'}
                      size={22}
                      color={done ? colors.accent : colors.textTertiary}
                    />
                    <Text
                      variant="body"
                      color={done ? 'textSecondary' : 'text'}
                      style={{
                        flex: 1,
                        textDecorationLine: done ? 'line-through' : 'none',
                      }}>
                      {item.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </Card>
        )}

        {/* Next update */}
        {due ? (
          <>
            <SectionHeader title="Next update" />
            <Card
              tone={due.isOverdue ? 'surface' : 'subtle'}
              onPress={() => router.push('/capture-session')}
              accessibilityLabel="Start a photo update">
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
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
                    size={20}
                    color={due.isOverdue ? colors.textOnAccent : colors.textSecondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="headline">
                    {due.isOverdue ? 'Update due now' : `Photo update ${formatRelative(due.dueISO)}`}
                  </Text>
                  <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
                    {data.sessions.length === 0
                      ? 'Capture your baseline to begin'
                      : 'Same five angles as last time'}
                  </Text>
                </View>
                <Icon name="chevronRight" size={16} color={colors.textTertiary} />
              </View>
            </Card>
          </>
        ) : null}

        {data.sessions.length === 0 ? (
          <EmptyState
            icon="camera"
            title="Your journey starts here"
            body="Take your baseline photos. Everything you capture later gets compared against them."
            actionLabel="Create First Update"
            onAction={() => router.push('/capture-session')}
          />
        ) : (
          <Button
            label="Update Journey"
            icon="camera"
            style={{ marginTop: spacing.xxl }}
            onPress={() => router.push('/capture-session')}
          />
        )}
      </ScreenScroll>
    </Screen>
  );
}
