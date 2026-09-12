import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/**
 * The funnel is a single screen holding its own step machine, so there is
 * nothing to navigate between here. The layout exists to keep the group's
 * chrome off and its background on the app's own.
 */
export default function OnboardingLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
