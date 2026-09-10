import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { EmptyState, SectionHeader, Separator } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ProgressBar, StatTile } from '@/components/ui/stat';
import { Text } from '@/components/ui/text';
import { toDateKey } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import {
  activeRoutineItems,
  adherencePercent,
  completedOn,
  currentStreak,
  todayProgress,
} from '@/store/selectors';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

export default function RoutineScreen() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, addRoutineItem, archiveRoutineItem, toggleRoutineToday } =
    useAppStore();

  const [draft, setDraft] = useState('');

  const items = activeRoutineItems(data);
  const done = completedOn(data, toDateKey());
  const progress = todayProgress(data);
  const adherence = adherencePercent(data);
  const streak = currentStreak(data);

  const add = () => {
    const label = draft.trim();
    if (!label) return;
    addRoutineItem({ label, cadence: 'daily', timeOfDay: 'anytime' });
    setDraft('');
  };

  const confirmRemove = (id: string, label: string) => {
    Alert.alert(`Remove "${label}"?`, 'Your past completion history is kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => archiveRoutineItem(id),
      },
    ]);
  };

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        }}>
        <Text variant="title3" accessibilityRole="header">
          Routine
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
        {items.length > 0 ? (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <StatTile
                icon="chart"
                label="Adherence"
                value={adherence ?? 0}
                suffix="%"
                caption="Last 30 days"
                tone={adherence !== null && adherence >= 80 ? 'accent' : 'default'}
              />
              <StatTile icon="flame" label="Day streak" value={streak} />
            </View>

            <SectionHeader title="Today" />
            <Card>
              <View
                style={{
                  flexDirection: 'row',
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
            </Card>
          </>
        ) : null}

        <SectionHeader title={items.length > 0 ? 'Your routine' : 'Add your routine'} />

        {items.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="Nothing tracked yet"
            body="Add what you already do for your hair. Ticking items off is what builds your adherence and streak."
          />
        ) : (
          <Card padded={false}>
            {items.map((item, i) => {
              const isDone = done.has(item.id);
              return (
                <View key={item.id}>
                  {i > 0 ? <Separator inset={56} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <PressableScale
                      onPress={() => toggleRoutineToday(item.id)}
                      haptic={isDone ? 'light' : 'success'}
                      scaleTo={0.99}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isDone }}
                      accessibilityLabel={item.label}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                        paddingVertical: spacing.lg,
                        paddingLeft: spacing.lg,
                      }}>
                      <Icon
                        name={isDone ? 'checkCircle' : 'circle'}
                        size={22}
                        color={isDone ? colors.accent : colors.textTertiary}
                      />
                      <Text
                        variant="body"
                        color={isDone ? 'textSecondary' : 'text'}
                        style={{
                          flex: 1,
                          textDecorationLine: isDone ? 'line-through' : 'none',
                        }}>
                        {item.label}
                      </Text>
                    </PressableScale>

                    <PressableScale
                      onPress={() => confirmRemove(item.id, item.label)}
                      haptic="none"
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.label}`}
                      style={{ padding: spacing.lg }}>
                      <Icon name="trash" size={17} color={colors.textTertiary} />
                    </PressableScale>
                  </View>
                </View>
              );
            })}
          </Card>
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            marginTop: spacing.lg,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.lg,
            height: MIN_TOUCH_TARGET + 8,
          }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a routine item"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="done"
            onSubmitEditing={add}
            accessibilityLabel="New routine item"
            style={{ flex: 1, color: colors.text, fontSize: 16 }}
          />
          <PressableScale
            onPress={add}
            disabled={!draft.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add"
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: draft.trim() ? colors.accent : colors.fill,
            }}>
            <Icon
              name="plus"
              size={16}
              color={draft.trim() ? colors.textOnAccent : colors.textTertiary}
            />
          </PressableScale>
        </View>

        <View
          style={{
            marginTop: spacing.xl,
            flexDirection: 'row',
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radius.md,
            backgroundColor: colors.backgroundSubtle,
          }}>
          <Icon name="info" size={17} color={colors.textTertiary} />
          <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
            Hair Journey tracks what you tell it. It does not recommend
            treatments or doses — speak to a qualified healthcare
            professional about anything medical.
          </Text>
        </View>

        <Button
          label="Done"
          variant="secondary"
          style={{ marginTop: spacing.xl }}
          onPress={() => router.back()}
        />
      </ScrollView>
    </View>
  );
}
