import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
  Screen,
  ScreenScroll,
  SectionHeader,
  Separator,
} from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { formatDate, formatMilestone } from '@/lib/date';
import { deletePhotoFiles } from '@/lib/photo-storage';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';
import { ANGLE_LABELS, type Photo } from '@/types/domain';

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, updateSessionNote, deleteSession } = useAppStore();

  const session = data.sessions.find((s) => s.id === id);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(session?.note ?? '');

  if (!session || !data.journey) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="title3">Update not found</Text>
          <Text variant="callout" color="textSecondary" style={{ marginTop: 8 }}>
            It may have been deleted.
          </Text>
          <Button
            label="Go back"
            variant="secondary"
            block={false}
            style={{ marginTop: 20 }}
            onPress={() => router.back()}
          />
        </View>
      </Screen>
    );
  }

  const journey = data.journey;
  const milestone = formatMilestone(journey.startedAt, session.capturedAt);

  const saveNote = () => {
    updateSessionNote(session.id, noteDraft);
    setEditingNote(false);
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete this update?',
      'The photos in this update will be permanently removed from this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deletePhotoFiles(
              session.photos.flatMap((p) => [p.uri, p.thumbnailUri]),
            );
            deleteSession(session.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <Screen edges={[]}>
      <ScreenScroll
        clearsTabBar={false}
        contentContainerStyle={{ paddingTop: insets.top + 56 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="title1" accessibilityRole="header">
            {milestone}
          </Text>
          {session.isBaseline ? (
            <View
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: 3,
                borderRadius: radius.xs,
                backgroundColor: colors.accentSoft,
              }}>
              <Text variant="caption" color="accent">
                BASELINE
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="callout" color="textSecondary" style={{ marginTop: 2 }}>
          {formatDate(session.capturedAt)}
        </Text>

        <SectionHeader title={`${session.photos.length} photos`} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {session.photos.map((photo) => (
            <PressableScale
              key={photo.id}
              onPress={() => setViewing(photo)}
              scaleTo={0.97}
              accessibilityRole="imagebutton"
              accessibilityLabel={`View ${ANGLE_LABELS[photo.angle]} photo full screen`}
              style={{ width: '31.5%' }}>
              <Image
                source={{ uri: photo.thumbnailUri ?? photo.uri }}
                style={{
                  width: '100%',
                  aspectRatio: 0.78,
                  borderRadius: radius.sm,
                  backgroundColor: colors.fill,
                }}
                contentFit="cover"
                transition={160}
              />
              <Text variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
                {ANGLE_LABELS[photo.angle]}
              </Text>
            </PressableScale>
          ))}
        </View>

        {data.sessions.length >= 2 ? (
          <Button
            label="Compare with another update"
            icon="compare"
            variant="secondary"
            style={{ marginTop: spacing.xl }}
            onPress={() => router.push(`/compare?from=${session.id}`)}
          />
        ) : null}

        <SectionHeader
          title="Journal"
          action={editingNote ? undefined : session.note ? 'Edit' : 'Add'}
          onAction={() => {
            setNoteDraft(session.note ?? '');
            setEditingNote(true);
          }}
        />

        {editingNote ? (
          <Card>
            <TextInput
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="How did your hair feel this month? Any changes you noticed?"
              placeholderTextColor={colors.textTertiary}
              multiline
              autoFocus
              accessibilityLabel="Journal note"
              style={{
                color: colors.text,
                fontSize: 16,
                lineHeight: 23,
                minHeight: 110,
                textAlignVertical: 'top',
              }}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button
                label="Cancel"
                variant="secondary"
                size="md"
                onPress={() => setEditingNote(false)}
                style={{ flex: 1 }}
              />
              <Button label="Save" size="md" onPress={saveNote} style={{ flex: 1 }} />
            </View>
          </Card>
        ) : session.note ? (
          <Card>
            <Text variant="body">{session.note}</Text>
          </Card>
        ) : (
          <Card tone="subtle">
            <Text variant="callout" color="textSecondary">
              No note on this update yet.
            </Text>
          </Card>
        )}

        <SectionHeader title="Routine at the time" />
        <Card padded={false}>
          {data.routineItems.length === 0 ? (
            <View style={{ padding: spacing.lg }}>
              <Text variant="callout" color="textSecondary">
                No routine items recorded.
              </Text>
            </View>
          ) : (
            data.routineItems.map((item, i) => (
              <View key={item.id}>
                {i > 0 ? <Separator inset={spacing.lg} /> : null}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    padding: spacing.lg,
                  }}>
                  <Icon name="checkCircle" size={18} color={colors.textTertiary} />
                  <Text variant="body" style={{ flex: 1 }}>
                    {item.label}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>

        <Button
          label="Delete update"
          variant="ghost"
          size="md"
          style={{ marginTop: spacing.xxl }}
          onPress={confirmDelete}
        />
      </ScreenScroll>

      {/* Full-resolution viewer */}
      <Modal
        visible={viewing !== null}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setViewing(null)}>
        <Pressable
          onPress={() => setViewing(null)}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.94)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {viewing ? (
            <>
              <Image
                source={{ uri: viewing.uri }}
                style={{ width: '100%', height: '76%' }}
                contentFit="contain"
                accessibilityLabel={`${ANGLE_LABELS[viewing.angle]} photo`}
              />
              <View
                style={{
                  position: 'absolute',
                  bottom: insets.bottom + spacing.xxl,
                  alignItems: 'center',
                }}>
                <Text variant="headline" style={{ color: '#fff' }}>
                  {ANGLE_LABELS[viewing.angle]}
                </Text>
                <Text variant="footnote" style={{ color: '#fff', opacity: 0.6, marginTop: 2 }}>
                  {milestone} · Tap to close
                </Text>
              </View>
            </>
          ) : null}
        </Pressable>
      </Modal>
    </Screen>
  );
}
