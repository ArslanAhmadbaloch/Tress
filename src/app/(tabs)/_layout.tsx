import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import { useAppStore } from '@/store/app-store';
import { hasJourney } from '@/store/selectors';
import { useTheme } from '@/theme';

/**
 * The five primary areas. NativeTabs gives a real UITabBar / BottomNavigation,
 * which is what makes the app feel native — and on iOS 26 it picks up
 * Liquid Glass automatically.
 *
 * Android caps native tabs at five, which is exactly our count.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const { data } = useAppStore();

  // Anyone without a journey belongs in onboarding, not the tab bar.
  if (!hasJourney(data)) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <NativeTabs
      tintColor={colors.accent}
      backgroundColor={Platform.select({
        // Let iOS render its own translucent material; Android needs an
        // explicit surface or the bar reads as a flat grey slab.
        ios: undefined,
        default: colors.surface,
      })}
      labelStyle={{ color: colors.textSecondary, selected: { color: colors.accent } }}
      minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md={{ default: 'home', selected: 'home' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="journey">
        <NativeTabs.Trigger.Label>Journey</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: 'chart.line.uptrend.xyaxis',
            selected: 'chart.line.uptrend.xyaxis',
          }}
          md={{ default: 'timeline', selected: 'timeline' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="capture">
        <NativeTabs.Trigger.Label>Capture</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'camera', selected: 'camera.fill' }}
          md={{ default: 'photo_camera', selected: 'photo_camera' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="community">
        <NativeTabs.Trigger.Label>Community</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.2', selected: 'person.2.fill' }}
          md={{ default: 'group', selected: 'group' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md={{ default: 'account_circle', selected: 'account_circle' }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
