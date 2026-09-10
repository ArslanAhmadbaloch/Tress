import { useRouter } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { Icon } from '@/components/ui/icon';
import { OptionCard } from '@/components/ui/option-card';
import { Text } from '@/components/ui/text';
import { formatDate } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { useOnboardingDraft } from './_layout';

/**
 * Offsets in calendar months, not days. A fixed 90-day offset lands a day
 * or two short of three calendar months, and the journey duration would
 * then read "2 months" straight after the user picked "3 months ago".
 */
const START_OPTIONS = [
  { label: 'Today', description: 'Start fresh from your baseline photos', months: 0 },
  { label: '1 month ago', description: 'You already started a routine', months: 1 },
  { label: '3 months ago', months: 3 },
  { label: '6 months ago', months: 6 },
];

export default function StartStep() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { draft, update } = useOnboardingDraft();
  const { createJourney } = useAppStore();
  const [selected, setSelected] = useState(0);

  const chooseStart = (index: number) => {
    setSelected(index);
    const date = new Date();
    const months = START_OPTIONS[index].months;
    if (months > 0) {
      const day = date.getDate();
      date.setMonth(date.getMonth() - months);
      // Going back from the 31st into a 30-day month rolls forward a day;
      // clamp to the last day of the target month instead.
      if (date.getDate() !== day) date.setDate(0);
    }
    update({ startedAt: date.toISOString() });
  };

  const create = () => {
    createJourney({
      displayName: draft.displayName,
      trackingAreas: draft.trackingAreas,
      goals: draft.goals,
      startedAt: draft.startedAt,
      routineLabels: draft.routineLabels,
    });
    // Replace so the back gesture can't return into onboarding.
    router.replace('/');
  };

  return (
    <OnboardingStep
      stepIndex={3}
      title="Set up your journey"
      subtitle="Last step. We'll date your timeline from here."
      primaryLabel="Create My Journey"
      onPrimary={create}>
      <Text variant="overline" color="textTertiary" style={{ marginBottom: spacing.sm }}>
        WHAT SHOULD WE CALL YOU?
      </Text>
      <View
        style={{
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.lg,
          height: MIN_TOUCH_TARGET + 8,
          justifyContent: 'center',
          marginBottom: spacing.xl,
        }}>
        <TextInput
          value={draft.displayName}
          onChangeText={(displayName) => update({ displayName })}
          placeholder="Your name (optional)"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="words"
          accessibilityLabel="Display name"
          style={{ color: colors.text, fontSize: 16 }}
        />
      </View>

      <Text variant="overline" color="textTertiary" style={{ marginBottom: spacing.sm }}>
        WHEN DID YOUR JOURNEY START?
      </Text>
      <View style={{ gap: spacing.sm }}>
        {START_OPTIONS.map((option, index) => (
          <OptionCard
            key={option.label}
            label={option.label}
            description={option.description}
            multi={false}
            selected={selected === index}
            onPress={() => chooseStart(index)}
          />
        ))}
      </View>

      <View
        style={{
          marginTop: spacing.xl,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: colors.accentSoft,
        }}>
        <Icon name="calendar" size={18} color={colors.accent} />
        <Text variant="subhead" color="accent" style={{ flex: 1 }}>
          Timeline starts {formatDate(draft.startedAt)}
        </Text>
      </View>

      <View
        style={{
          marginTop: spacing.lg,
          flexDirection: 'row',
          gap: spacing.md,
          padding: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: colors.backgroundSubtle,
        }}>
        <Icon name="lock" size={17} color={colors.textTertiary} />
        <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
          Your journey is private. Photos stay on this device unless you
          choose to share them.
        </Text>
      </View>
    </OnboardingStep>
  );
}
