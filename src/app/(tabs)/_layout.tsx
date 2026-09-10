import { Redirect, Tabs } from 'expo-router';

import { TabBar } from '@/components/tab-bar';
import { useAppStore } from '@/store/app-store';
import { hasJourney } from '@/store/selectors';

/**
 * Four tabs plus a centre action: Home, Journey, +, Learn, Profile.
 *
 * A custom bar rather than NativeTabs, because the design calls for a
 * detached pill with an elevated centre button — a shape the system bar
 * does not offer. The bar still renders on the real Liquid Glass material;
 * see components/tab-bar.tsx.
 */
export default function TabsLayout() {
  const { data } = useAppStore();

  // Anyone without a journey belongs in onboarding, not the tab bar.
  if (!hasJourney(data)) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // The bar floats over content, so screens own their own background.
        sceneStyle: { backgroundColor: 'transparent' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="journey" options={{ title: 'Journey' }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
