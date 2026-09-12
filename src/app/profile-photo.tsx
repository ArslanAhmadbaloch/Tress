/**
 * Choose the picture on the journey card.
 *
 * Only from photos the user has already captured in the app. There is no
 * camera-roll picker on purpose: the whole product is built on photos the
 * user took here, under known conditions, and reaching into the library
 * would be a new permission for a cosmetic feature.
 */

import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { formatDate, formatMilestone } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';
import { ANGLE_LABELS } from '@/types/domain';

const TILE = 84;

export default function ProfilePhotoScreen() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, updateProfile } = useAppStore();

  const current = data.profile?.avatarUri;
  const startedAt = data.journey?.startedAt;

  const choose = (uri: string) => {
    updateProfile({ avatarUri: uri });
    router.back();
  };

  const clear = () => {
    updateProfile({ avatarUri: undefined });
    router.back();
  };

  return (
    // A page sheet on iOS already clears the status bar; Android is full screen.
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: Platform.OS === 'ios' ? spacing.sm : insets.top,
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        }}>
        <Text variant="title3" accessibilityRole="header">
          Your picture
        </Text>
        <PressableScale
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.fill,
          }}>
          <Icon name="close" size={15} color={colors.text} />
        </PressableScale>
      </View>

      {data.sessions.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: spacing.giant }}>
          <EmptyState
            icon="camera"
            title="No photos yet"
            body="Your card shows one of your own captured photos. Take your first set and it will appear here."
            actionLabel="Take photos"
            onAction={() => router.replace('/capture-intro')}
          />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + spacing.xxxl,
          }}>
          <Text variant="callout" color="textSecondary" style={{ marginBottom: spacing.lg }}>
            Pick any photo you have taken. It stays on this device.
          </Text>

          {data.sessions.map((session) => (
            <View key={session.id} style={{ marginBottom: spacing.xl }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  gap: spacing.sm,
                  marginBottom: spacing.sm,
                }}>
                <Text variant="subhead">
                  {startedAt ? formatMilestone(startedAt, session.capturedAt, session.isBaseline) : 'Session'}
                </Text>
                <Text variant="caption" color="textTertiary">
                  {formatDate(session.capturedAt)}
                </Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}>
                {session.photos.map((photo) => {
                  const selected = current === photo.uri;
                  // Grids never load a full-resolution file.
                  const preview = photo.thumbnailUri ?? photo.uri;

                  return (
                    <PressableScale
                      key={photo.id}
                      onPress={() => choose(photo.uri)}
                      scaleTo={0.95}
                      accessibilityRole="button"
                      accessibilityLabel={`Use the ${ANGLE_LABELS[photo.angle]} photo as your picture${
                        selected ? ', currently selected' : ''
                      }`}
                      style={{ width: TILE, gap: spacing.xs }}>
                      <View
                        style={{
                          width: TILE,
                          height: TILE,
                          borderRadius: radius.md,
                          overflow: 'hidden',
                          borderWidth: selected ? 2 : 1,
                          borderColor: selected ? colors.accent : colors.border,
                        }}>
                        <Image
                          source={{ uri: preview }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          transition={150}
                          accessibilityLabel={`${ANGLE_LABELS[photo.angle]} photo`}
                        />
                        {selected ? (
                          <View
                            style={{
                              position: 'absolute',
                              right: 4,
                              bottom: 4,
                              width: 20,
                              height: 20,
                              borderRadius: 10,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: colors.accent,
                            }}>
                            <Icon name="check" size={12} color={colors.textOnAccent} />
                          </View>
                        ) : null}
                      </View>
                      <Text variant="caption" color="textTertiary" numberOfLines={1}>
                        {ANGLE_LABELS[photo.angle]}
                      </Text>
                    </PressableScale>
                  );
                })}
              </ScrollView>
            </View>
          ))}

          {current ? (
            <PressableScale
              onPress={clear}
              scaleTo={0.99}
              accessibilityRole="button"
              accessibilityLabel="Remove your picture and show your initial instead"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
                paddingVertical: spacing.lg,
                borderRadius: radius.md,
                backgroundColor: colors.fill,
              }}>
              <Icon name="trash" size={15} color={colors.danger} />
              <Text variant="subhead" color="danger">
                Remove picture
              </Text>
            </PressableScale>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
