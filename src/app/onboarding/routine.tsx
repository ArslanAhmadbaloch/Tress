import { useRouter } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { useOnboardingDraft } from './_layout';

/**
 * Deliberately free text. The app records whatever routine the user
 * already follows — it never suggests treatments, doses or products.
 */
const EXAMPLES = ['Morning routine', 'Evening routine', 'Supplement', 'Hair care'];

export default function RoutineStep() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { draft, update } = useOnboardingDraft();
  const [value, setValue] = useState('');

  const add = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (draft.routineLabels.some((l) => l.toLowerCase() === trimmed.toLowerCase())) {
      setValue('');
      return;
    }
    update({ routineLabels: [...draft.routineLabels, trimmed] });
    setValue('');
  };

  const remove = (label: string) =>
    update({ routineLabels: draft.routineLabels.filter((l) => l !== label) });

  const unusedExamples = EXAMPLES.filter(
    (e) => !draft.routineLabels.some((l) => l.toLowerCase() === e.toLowerCase()),
  );

  return (
    <OnboardingStep
      stepIndex={2}
      title="Your routine"
      subtitle="Add anything you already do for your hair. This is only for your own tracking — you can skip it and add items later."
      primaryLabel={draft.routineLabels.length > 0 ? 'Continue' : 'Skip for now'}
      onPrimary={() => router.push('/onboarding/start')}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.lg,
          height: MIN_TOUCH_TARGET + 8,
        }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="Add a routine item"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
          onSubmitEditing={() => add(value)}
          accessibilityLabel="Routine item name"
          style={{ flex: 1, color: colors.text, fontSize: 16 }}
        />
        <PressableScale
          onPress={() => add(value)}
          disabled={!value.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add routine item"
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: value.trim() ? colors.accent : colors.fill,
          }}>
          <Icon
            name="plus"
            size={16}
            color={value.trim() ? colors.textOnAccent : colors.textTertiary}
          />
        </PressableScale>
      </View>

      {draft.routineLabels.length > 0 ? (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          {draft.routineLabels.map((label) => (
            <View
              key={label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.md,
                backgroundColor: colors.accentSoft,
                borderWidth: 1,
                borderColor: colors.accentBorder,
              }}>
              <Text variant="headline" color="accent">
                {label}
              </Text>
              <PressableScale
                onPress={() => remove(label)}
                haptic="none"
                accessibilityRole="button"
                accessibilityLabel={`Remove ${label}`}
                hitSlop={10}>
                <Icon name="close" size={16} color={colors.textSecondary} />
              </PressableScale>
            </View>
          ))}
        </View>
      ) : null}

      {unusedExamples.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <Text variant="overline" color="textTertiary" style={{ marginBottom: spacing.sm }}>
            SUGGESTIONS
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {unusedExamples.map((example) => (
              <PressableScale
                key={example}
                onPress={() => add(example)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${example}`}
                style={{
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.pill,
                  backgroundColor: colors.fill,
                }}>
                <Text variant="subhead" color="textSecondary">
                  + {example}
                </Text>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}

      <View
        style={{
          marginTop: spacing.xxl,
          flexDirection: 'row',
          gap: spacing.md,
          padding: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: colors.backgroundSubtle,
        }}>
        <Icon name="info" size={17} color={colors.textTertiary} />
        <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
          Hair Journey records what you tell it. It does not recommend
          treatments or doses. Talk to a qualified healthcare professional
          about anything medical.
        </Text>
      </View>
    </OnboardingStep>
  );
}
