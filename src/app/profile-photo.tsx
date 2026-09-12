/**
 * Choose the picture on the journey card.
 *
 * Two sources, and the distinction matters. The five-angle progress
 * photographs are in-app only and stay that way — their whole worth is
 * that they were taken here under known conditions, and a library import
 * among them would quietly break the comparison.
 *
 * The card portrait is not one of those. It is a picture of a person on a
 * keepsake, and insisting it be a clinical top-down crown shot made the
 * card worse for no gain. Onboarding already offered the library for it;
 * this screen simply stopped offering it afterwards, so anyone who skipped
 * that step, or wanted a better photo later, had no way in.
 */

import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { EmptyState, SectionHeader } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { formatDate, formatMilestone } from '@/lib/date';
import { persistProfilePhoto } from '@/lib/photo-storage';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';
import { ANGLE_LABELS } from '@/types/domain';

const TILE = 84;

export default function ProfilePhotoScreen() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, updateProfile } = useAppStore();

  /** True while the picked file is being copied out of the OS cache. */
  const [importing, setImporting] = useState(false);

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

  const chooseFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photos are not available',
        permission.canAskAgain
          ? 'Hair Journey needs permission to open your photo library.'
          : 'Turn on photo access for Hair Journey in your device Settings, then try again.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled) return;

    setImporting(true);
    try {
      // The picker's file lives in a cache the OS may clear, so keep our
      // own copy; the portrait it replaces is cleaned up in there too.
      const uri = await persistProfilePhoto(result.assets[0].uri, current);
      choose(uri);
    } catch {
      Alert.alert('That photo could not be saved', 'Try another, or pick one you have taken.');
    } finally {
      setImporting(false);
    }
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxxl,
        }}>
        <Text variant="callout" color="textSecondary" style={{ marginBottom: spacing.lg }}>
          Any photo you like. It stays on this device.
        </Text>

        {/* The library first: it is the one most people want, and it is
            the only option that works before any photos have been taken. */}
        <PressableScale
          onPress={chooseFromLibrary}
          disabled={importing}
          scaleTo={0.99}
          accessibilityRole="button"
          accessibilityLabel="Choose a photo from your gallery"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: importing ? 0.6 : 1,
          }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.fill,
            }}>
            <Icon name="photo" size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="body">Choose from gallery</Text>
            <Text variant="footnote" color="textSecondary" style={{ marginTop: 1 }}>
              Pick any picture of yourself
            </Text>
          </View>
          {importing ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Icon name="chevronRight" size={15} color={colors.textTertiary} />
          )}
        </PressableScale>

        {data.sessions.length === 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <EmptyState
              icon="camera"
              title="No photos taken yet"
              body="Photos you take in the app appear here too, so you can use one of those instead."
              actionLabel="Take photos"
              onAction={() => router.replace('/capture-intro')}
            />
          </View>
        ) : (
          <SectionHeader title="Or one you have taken" />
        )}

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
              marginTop: spacing.lg,
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
    </View>
  );
}
