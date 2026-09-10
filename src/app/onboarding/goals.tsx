import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { OptionCard } from '@/components/ui/option-card';
import { useTheme } from '@/theme';
import type { JourneyGoal } from '@/types/domain';

import { useOnboardingDraft } from './_layout';

const GOALS: { value: JourneyGoal; label: string; description?: string }[] = [
  { value: 'trackChanges', label: 'Track changes over time' },
  { value: 'monitorProgress', label: 'Monitor my progress' },
  { value: 'stayConsistent', label: 'Stay consistent with my routine' },
  { value: 'documentTreatment', label: 'Document a treatment journey' },
  { value: 'documentTransplant', label: 'Document transplant recovery' },
  { value: 'understandLongTerm', label: 'Understand my long-term changes' },
];

export default function GoalsStep() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { draft, toggleGoal } = useOnboardingDraft();

  return (
    <OnboardingStep
      stepIndex={1}
      title="What's your goal?"
      subtitle="We'll use this to decide what your dashboard puts front and centre."
      primaryLabel="Continue"
      onPrimary={() => router.push('/onboarding/routine')}
      primaryDisabled={draft.goals.length === 0}
      footnote={draft.goals.length === 0 ? 'Select at least one to continue' : undefined}>
      <View style={{ gap: spacing.sm }}>
        {GOALS.map((goal) => (
          <OptionCard
            key={goal.value}
            label={goal.label}
            description={goal.description}
            selected={draft.goals.includes(goal.value)}
            onPress={() => toggleGoal(goal.value)}
          />
        ))}
      </View>
    </OnboardingStep>
  );
}
