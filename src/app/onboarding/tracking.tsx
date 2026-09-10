import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { OptionCard } from '@/components/ui/option-card';
import { useTheme } from '@/theme';
import type { TrackingArea } from '@/types/domain';

import { useOnboardingDraft } from './_layout';

const AREAS: { value: TrackingArea; label: string; description?: string }[] = [
  { value: 'hairline', label: 'Hairline', description: 'Recession at the front or temples' },
  { value: 'crown', label: 'Crown', description: 'Thinning at the back of the head' },
  { value: 'overallThinning', label: 'Overall thinning' },
  { value: 'diffuseThinning', label: 'Diffuse thinning', description: 'Spread across the scalp' },
  { value: 'shedding', label: 'Shedding' },
  { value: 'density', label: 'Hair density' },
  { value: 'transplantRecovery', label: 'Hair transplant recovery' },
  { value: 'generalChanges', label: 'General hair changes' },
];

export default function TrackingStep() {
  const router = useRouter();
  const { spacing } = useTheme();
  const { draft, toggleArea } = useOnboardingDraft();

  return (
    <OnboardingStep
      stepIndex={0}
      title="What are you tracking?"
      subtitle="Choose everything that applies. This shapes your capture guidance and timeline — you can change it later."
      primaryLabel="Continue"
      onPrimary={() => router.push('/onboarding/goals')}
      primaryDisabled={draft.trackingAreas.length === 0}
      footnote={
        draft.trackingAreas.length === 0 ? 'Select at least one to continue' : undefined
      }>
      <View style={{ gap: spacing.sm }}>
        {AREAS.map((area) => (
          <OptionCard
            key={area.value}
            label={area.label}
            description={area.description}
            selected={draft.trackingAreas.includes(area.value)}
            onPress={() => toggleArea(area.value)}
          />
        ))}
      </View>
    </OnboardingStep>
  );
}
