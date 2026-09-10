import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
  EmptyState,
  Screen,
  ScreenScroll,
  ScreenTitle,
} from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { formatDate, formatDuration, formatMilestone } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import { sessionsChronological } from '@/store/selectors';
import { useTheme } from '@/theme';
import { ANGLE_LABELS } from '@/types/domain';

export default function JourneyScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { data } = useAppStore();

  const journey = data.journey;
  if (!journey) return null;

  // Newest first reads better as a journal; the rail still runs oldest
  // to newest visually because each row is labelled by milestone.
  const sessions = sessionsChronological(data).reverse();

  return (
    <Screen>
      <ScreenScroll>
        <ScreenTitle
          title="Journey"
          subtitle={`${formatDuration(journey.startedAt)} · started ${formatDate(journey.startedAt)}`}
          trailing={
            data.sessions.length >= 2 ? (
              <PressableScale
                onPress={() => router.push('/compare')}
                accessibilityRole="button"
                accessibilityLabel="Compare photos"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.xs,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.pill,
                  backgroundColor: colors.fill,
                }}>
                <Icon name="compare" size={15} color={colors.text} />
                <Text variant="subhead">Compare</Text>
              </PressableScale>
            ) : undefined
          }
        />

        {sessions.length === 0 ? (
          <EmptyState
            icon="journey"
            title="Your journey starts here"
            body="Once you capture your baseline, every update lands on this timeline so you can see what changed."
            actionLabel="Create First Update"
            onAction={() => router.push('/capture-session')}
          />
        ) : (
          <View style={{ marginTop: spacing.lg }}>
            {sessions.map((session, index) => {
              const isLast = index === sessions.length - 1;

              return (
                <View key={session.id} style={{ flexDirection: 'row' }}>
                  {/* Timeline rail */}
                  <View style={{ width: 28, alignItems: 'center' }}>
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        marginTop: 6,
                        backgroundColor: session.isBaseline
                          ? colors.accent
                          : colors.textTertiary,
                        borderWidth: session.isBaseline ? 0 : 2,
                        borderColor: colors.background,
                      }}
                    />
                    {!isLast ? (
                      <View
                        style={{
                          flex: 1,
                          width: 2,
                          marginTop: 4,
                          backgroundColor: colors.separator,
                        }}
                      />
                    ) : null}
                  </View>

                  <View style={{ flex: 1, paddingBottom: spacing.xl }}>
                    <PressableScale
                      onPress={() => router.push(`/session/${session.id}`)}
                      scaleTo={0.985}
                      accessibilityRole="button"
                      accessibilityLabel={`${formatMilestone(journey.startedAt, session.capturedAt)}, ${formatDate(session.capturedAt)}`}
                      style={{
                        backgroundColor: colors.surface,
                        borderRadius: radius.card,
                        borderWidth: 1,
                        borderColor: colors.border,
                        overflow: 'hidden',
                      }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: spacing.lg,
                          paddingBottom: spacing.md,
                        }}>
                        <View style={{ flex: 1 }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: spacing.sm,
                            }}>
                            <Text variant="title3">
                              {formatMilestone(journey.startedAt, session.capturedAt)}
                            </Text>
                            {session.isBaseline ? (
                              <View
                                style={{
                                  paddingHorizontal: spacing.sm,
                                  paddingVertical: 2,
                                  borderRadius: radius.xs,
                                  backgroundColor: colors.accentSoft,
                                }}>
                                <Text variant="caption" color="accent">
                                  BASELINE
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text
                            variant="footnote"
                            color="textSecondary"
                            style={{ marginTop: 2 }}>
                            {formatDate(session.capturedAt)}
                          </Text>
                        </View>
                        <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                      </View>

                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        {session.photos.map((photo) => (
                          <View key={photo.id} style={{ flex: 1, aspectRatio: 0.8 }}>
                            <Image
                              source={{ uri: photo.thumbnailUri ?? photo.uri }}
                              style={{ width: '100%', height: '100%' }}
                              contentFit="cover"
                              transition={160}
                              // Thumbnails only — full-res is loaded on the
                              // detail screen, never in this list.
                              recyclingKey={photo.id}
                              accessibilityLabel={ANGLE_LABELS[photo.angle]}
                            />
                          </View>
                        ))}
                      </View>

                      {session.note ? (
                        <View style={{ padding: spacing.lg }}>
                          <Text variant="footnote" color="textSecondary" numberOfLines={2}>
                            {session.note}
                          </Text>
                        </View>
                      ) : null}
                    </PressableScale>
                  </View>
                </View>
              );
            })}

            <Button
              label="Add Update"
              icon="camera"
              variant="secondary"
              style={{ marginTop: spacing.sm }}
              onPress={() => router.push('/capture-session')}
            />
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}
