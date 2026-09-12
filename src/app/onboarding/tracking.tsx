import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { OptionCard } from '@/components/ui/option-card';
import { useTheme } from '@/theme';
import { TRACKING_AREA_LABELS, type TrackingArea } from '@/types/domain';

import { useOnboardingDraft } from './_layout';

/**
 * Labels come from the shared map, so the answers the journey card shows
 * back months later are worded exactly as the question that set them.
 */
const AREAS: { value: TrackingArea; description?: string }[] = [
  { value: 'hairline', description: 'Recession at the front or temples' },
  { value: 'crown', description: 'Thinning at the back of the head' },
  { value: 'overallThinning' },
  { value: 'diffuseThinning', description: 'Spread across the scalp' },
  { value: 'shedding' },
  { value: 'density' },
  { value: 'transplantRecovery' },
  { value: 'generalChanges' },
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
            label={TRACKING_AREA_LABELS[area.value]}
            description={area.description}
            selected={draft.trackingAreas.includes(area.value)}
            onPress={() => toggleArea(area.value)}
          />
        ))}
      </View>
    </OnboardingStep>
  );
}
