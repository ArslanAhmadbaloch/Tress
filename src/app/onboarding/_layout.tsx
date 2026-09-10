import { Stack } from 'expo-router';
import { createContext, useContext, useMemo, useState } from 'react';

import { useTheme } from '@/theme';
import type { JourneyGoal, TrackingArea } from '@/types/domain';

/** Answers collected across the onboarding screens before we commit. */
export type OnboardingDraft = {
  displayName: string;
  trackingAreas: TrackingArea[];
  goals: JourneyGoal[];
  routineLabels: string[];
  startedAt: string;
};

type DraftContext = {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
  toggleArea: (area: TrackingArea) => void;
  toggleGoal: (goal: JourneyGoal) => void;
};

const Ctx = createContext<DraftContext | null>(null);

export function useOnboardingDraft(): DraftContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('Onboarding draft used outside its provider.');
  return ctx;
}

export default function OnboardingLayout() {
  const { colors } = useTheme();

  const [draft, setDraft] = useState<OnboardingDraft>({
    displayName: '',
    trackingAreas: [],
    goals: [],
    routineLabels: [],
    startedAt: new Date().toISOString(),
  });

  const value = useMemo<DraftContext>(
    () => ({
      draft,
      update: (patch) => setDraft((prev) => ({ ...prev, ...patch })),
      toggleArea: (area) =>
        setDraft((prev) => ({
          ...prev,
          trackingAreas: prev.trackingAreas.includes(area)
            ? prev.trackingAreas.filter((a) => a !== area)
            : [...prev.trackingAreas, area],
        })),
      toggleGoal: (goal) =>
        setDraft((prev) => ({
          ...prev,
          goals: prev.goals.includes(goal)
            ? prev.goals.filter((g) => g !== goal)
            : [...prev.goals, goal],
        })),
    }),
    [draft],
  );

  return (
    <Ctx.Provider value={value}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          // Each answer feels like a step forward rather than a new modal.
          animation: 'slide_from_right',
          gestureEnabled: true,
        }}
      />
    </Ctx.Provider>
  );
}
