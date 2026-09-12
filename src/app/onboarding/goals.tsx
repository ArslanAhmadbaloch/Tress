import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { OptionCard } from '@/components/ui/option-card';
import { useTheme } from '@/theme';
import { JOURNEY_GOAL_LABELS, type JourneyGoal } from '@/types/domain';

import { useOnboardingDraft } from './_layout';

/** The first one picked is the line printed on the journey card. */
const GOALS: JourneyGoal[] = [
  'trackChanges',
  'monitorProgress',
  'stayConsistent',
  'documentTreatment',
  'documentTransplant',
  'understandLongTerm',
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
            key={goal}
            label={JOURNEY_GOAL_LABELS[goal]}
            selected={draft.goals.includes(goal)}
            onPress={() => toggleGoal(goal)}
          />
        ))}
      </View>
    </OnboardingStep>
  );
}
