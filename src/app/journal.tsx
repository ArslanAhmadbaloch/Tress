import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { EmptyState, SectionHeader } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { formatDate } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import { sessionLabel } from '@/store/selectors';
import { useTheme, typography } from '@/theme';

export default function JournalScreen() {
  const { colors, spacing, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, addJournalEntry, deleteJournalEntry } = useAppStore();

  const [draft, setDraft] = useState('');
  // Home's "+" opens the journal ready to write.
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  const [composing, setComposing] = useState(compose === '1');

  const journey = data.journey;

  /** Held just long enough for the tick to be seen, then the composer goes. */
  const [saved, setSaved] = useState(false);

  const save = () => {
    addJournalEntry(draft);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setDraft('');
      setComposing(false);
    }, 620);
  };

  const confirmDelete = (id: string) => {
    Alert.alert('Delete this entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteJournalEntry(id),
      },
    ]);
  };

  return (
    // A page sheet on iOS already clears the status bar; Android is full screen.
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: Platform.OS === 'ios' ? spacing.md : insets.top,
      }}>
      {/*
        A sheet's title at title2, not title3. This is a whole screen
        that slides up, and a heading the size of a card's heading made
        it look like a card that had escaped. The close button is the
        white disc the rest of the app uses for its header controls.
      */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.lg,
        }}>
        <Text variant="title2" accessibilityRole="header">
          Journal
        </Text>
        <PressableScale
          hitSlop={5}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={[
            {
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
            },
            shadow.soft,
          ]}>
          <Icon name="close" size={15} color={colors.text} />
        </PressableScale>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxxl,
        }}>
        {composing ? (
          <Card>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="What did you notice this week?"
              placeholderTextColor={colors.textTertiary}
              multiline
              autoFocus
              accessibilityLabel="New journal entry"
              style={{
                color: colors.text,
                fontSize: typography.body.fontSize,
                lineHeight: typography.body.lineHeight,
                minHeight: 120,
                textAlignVertical: 'top',
              }}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
              <Button
                label="Cancel"
                variant="secondary"
                size="md"
                onPress={() => {
                  setComposing(false);
                  setDraft('');
                }}
                style={{ flex: 1 }}
              />
              <Button
                label="Save"
                size="md"
                onPress={save}
                succeeded={saved}
                disabled={!draft.trim() || saved}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ) : data.journal.length > 0 ? (
          <Button label="New entry" icon="plus" onPress={() => setComposing(true)} />
        ) : null}

        {data.journal.length === 0 ? (
          <EmptyState
            icon="sparkle"
            title="No entries yet"
            body="Journal entries give your photos context — what changed, what you started, how your hair felt."
            actionLabel="Write your first"
            onAction={() => setComposing(true)}
          />
        ) : (
          <>
            <SectionHeader
              title={`${data.journal.length} ${data.journal.length === 1 ? 'entry' : 'entries'}`}
            />
            {/*
              Each entry on the shared card. They were outlined boxes,
              eight points apart, which stacked into something that read
              as a table; on shadows with twelve points between them they
              read as pages.
            */}
            <View style={{ gap: spacing.md }}>
              {data.journal.map((entry) => {
                const session = entry.sessionId
                  ? data.sessions.find((s) => s.id === entry.sessionId)
                  : undefined;

                return (
                  <Card key={entry.id}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: spacing.md,
                      }}>
                      <Text variant="caption" color="textTertiary" style={{ flexShrink: 1 }}>
                        {formatDate(entry.createdAt)}
                        {session && journey
                          ? ` · ${sessionLabel(journey.startedAt, session)}`
                          : ''}
                      </Text>
                      <PressableScale
                        onPress={() => confirmDelete(entry.id)}
                        haptic="none"
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel="Delete entry">
                        <Icon name="trash" size={15} color={colors.textTertiary} />
                      </PressableScale>
                    </View>
                    <Text variant="body" style={{ marginTop: spacing.sm }}>
                      {entry.body}
                    </Text>
                  </Card>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
