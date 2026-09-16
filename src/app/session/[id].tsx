import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShareUpdateModal } from '@/components/session/share-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
  Screen,
  ScreenScroll,
  SectionHeader,
  Separator,
} from '@/components/ui/layout';
import { BackButton } from '@/components/ui/back-button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { SHARE_COPY, buildSessionSheet } from '@/features/share/session-sheet';
import { formatDate, formatMilestone } from '@/lib/date';
import { useBackOrHome } from '@/lib/navigation';
import { deletePhotoFiles } from '@/lib/photo-storage';
import { useAppStore } from '@/store/app-store';
import { productFor, sessionLabel } from '@/store/selectors';
import { useTheme, typography } from '@/theme';
import { ANGLE_LABELS, type Photo } from '@/types/domain';

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const leave = useBackOrHome();
  const { data, updateSessionNote, renameSession, deleteSession } = useAppStore();

  const session = data.sessions.find((s) => s.id === id);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState(session?.note ?? '');
  const [sharing, setSharing] = useState(false);

  /*
    One object per session rather than a fresh one every render: the share
    panel keys its "which frames have loaded" bookkeeping to this sheet,
    and a new identity on every keystroke in the note field would reset it.
  */
  const sheet = useMemo(
    () =>
      session && data.journey
        ? buildSessionSheet({
            session,
            journeyStartedAt: data.journey.startedAt,
            baselineCapturedAt:
              data.sessions.find((s) => s.isBaseline)?.capturedAt ?? null,
          })
        : null,
    [session, data.journey, data.sessions],
  );

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
            onPress={leave}
          />
        </View>
      </Screen>
    );
  }

  const journey = data.journey;
  const milestone = sessionLabel(journey.startedAt, session);
  /** What it would be called with no name of its own. */
  const autoLabel = formatMilestone(
    journey.startedAt,
    session.capturedAt,
    session.isBaseline,
  );

  const saveTitle = () => {
    renameSession(session.id, titleDraft);
    setEditingTitle(false);
  };

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
            leave();
          },
        },
      ],
    );
  };

  return (
    <Screen edges={[]}>
      <ScreenScroll
        clearsTabBar={false}
        contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}>
        <View style={{ marginBottom: spacing.md }}>
          <BackButton onPress={leave} />
        </View>

        {editingTitle ? (
          // Renaming the update, not re-dating it. The date below stays
          // exactly as it was: it is when the shutter fired, and a record
          // whose dates can be edited is not a record.
          <View style={{ gap: spacing.sm }}>
            <TextInput
              value={titleDraft}
              onChangeText={setTitleDraft}
              placeholder={autoLabel}
              placeholderTextColor={colors.textTertiary}
              autoFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={saveTitle}
              accessibilityLabel="Name for this update"
              style={{
                color: colors.text,
                fontSize: typography.title2.fontSize,
                fontWeight: '700',
                paddingVertical: spacing.xs,
                borderBottomWidth: 1,
                borderBottomColor: colors.accent,
              }}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                label="Cancel"
                variant="secondary"
                size="md"
                onPress={() => setEditingTitle(false)}
                style={{ flex: 1 }}
              />
              <Button label="Save" size="md" onPress={saveTitle} style={{ flex: 1 }} />
            </View>
            {session.title ? (
              <PressableScale
                onPress={() => {
                  renameSession(session.id, '');
                  setEditingTitle(false);
                }}
                hitSlop={8}
                haptic="none"
                accessibilityRole="button"
                accessibilityLabel={`Use the automatic name, ${autoLabel}`}
                style={{ paddingVertical: spacing.xs }}>
                <Text variant="footnote" color="textSecondary">
                  Use {autoLabel} instead
                </Text>
              </PressableScale>
            ) : null}
          </View>
        ) : (
        <PressableScale
          onPress={() => {
            setTitleDraft(session.title ?? '');
            setEditingTitle(true);
          }}
          scaleTo={0.99}
          accessibilityRole="button"
          accessibilityLabel={`${milestone}. Tap to rename this update.`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="title1" accessibilityRole="header">
            {milestone}
          </Text>
          <Icon name="pencil" size={15} color={colors.textTertiary} />
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
        </PressableScale>
        )}
        <Text variant="callout" color="textSecondary" style={{ marginTop: 2 }}>
          {formatDate(session.capturedAt)}
        </Text>

        <SectionHeader
          title={`${session.photos.length} ${session.photos.length === 1 ? 'photo' : 'photos'}`}
        />
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

        {session.photos.length > 0 ? (
          <Button
            label={SHARE_COPY.button}
            icon="share"
            variant="secondary"
            style={{ marginTop: spacing.xl }}
            onPress={() => setSharing(true)}
            accessibilityHint={SHARE_COPY.buttonHint}
          />
        ) : null}

        {data.sessions.length >= 2 ? (
          <Button
            label="Compare with another update"
            icon="compare"
            variant="secondary"
            // Paired tight under the share button; on its own it keeps the
            // full gap it had from the grid above.
            style={{ marginTop: session.photos.length > 0 ? spacing.sm : spacing.xl }}
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
                fontSize: typography.body.fontSize,
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
        ) : (
          // The box is the control. Putting the only way in on a small
          // "Add" at the far end of a header made writing feel like a
          // command you had to find; tapping the empty space where the
          // words go is what everyone tries first.
          <PressableScale
            onPress={() => {
              setNoteDraft(session.note ?? '');
              setEditingNote(true);
            }}
            scaleTo={0.995}
            accessibilityRole="button"
            accessibilityLabel={
              session.note ? `Journal note: ${session.note}. Tap to edit.` : 'Write a journal note'
            }>
            <Card tone={session.note ? 'surface' : 'subtle'}>
              {session.note ? (
                <Text variant="body">{session.note}</Text>
              ) : (
                <Text variant="callout" color="textTertiary">
                  How did your hair feel this month? Any changes you noticed?
                </Text>
              )}
            </Card>
          </PressableScale>
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
            data.routineItems.map((item, i) => {
              // The bottle in use at the time sits beside the photographs
              // of that update; the picture is the database's, the label
              // is the person's.
              const product = productFor(data, item);
              return (
                <View key={item.id}>
                  {i > 0 ? <Separator inset={spacing.lg} /> : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      padding: spacing.lg,
                    }}>
                    {product?.thumbnailUrl ? (
                      <Image
                        source={{ uri: product.thumbnailUrl }}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: colors.fill,
                        }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        accessible={false}
                      />
                    ) : (
                      <Icon name="checkCircle" size={18} color={colors.textTertiary} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text variant="body">{item.label}</Text>
                      {product?.brand ? (
                        <Text variant="footnote" color="textTertiary" style={{ marginTop: 2 }}>
                          {product.brand}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })
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

      <ShareUpdateModal sheet={sharing ? sheet : null} onClose={() => setSharing(false)} />
    </Screen>
  );
}
