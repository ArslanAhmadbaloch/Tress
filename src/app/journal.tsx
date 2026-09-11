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
import { formatDate, formatMilestone } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';

export default function JournalScreen() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, addJournalEntry, deleteJournalEntry } = useAppStore();

  const [draft, setDraft] = useState('');
  // Home's "+" opens the journal ready to write.
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  const [composing, setComposing] = useState(compose === '1');

  const journey = data.journey;

  const save = () => {
    addJournalEntry(draft);
    setDraft('');
    setComposing(false);
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
          Journal
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
                disabled={!draft.trim()}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ) : (
          <Button label="New entry" icon="plus" onPress={() => setComposing(true)} />
        )}

        {data.journal.length === 0 ? (
          <EmptyState
            icon="note"
            title="No entries yet"
            body="Journal entries give your photos context — what changed, what you started, how your hair felt."
          />
        ) : (
          <>
            <SectionHeader
              title={`${data.journal.length} ${data.journal.length === 1 ? 'entry' : 'entries'}`}
            />
            <View style={{ gap: spacing.sm }}>
              {data.journal.map((entry) => {
                const session = entry.sessionId
                  ? data.sessions.find((s) => s.id === entry.sessionId)
                  : undefined;

                return (
                  <View
                    key={entry.id}
                    style={{
                      padding: spacing.lg,
                      borderRadius: radius.card,
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}>
                      <Text variant="caption" color="textTertiary">
                        {formatDate(entry.createdAt)}
                        {session && journey
                          ? ` · ${formatMilestone(journey.startedAt, session.capturedAt)}`
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
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
