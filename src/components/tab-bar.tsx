/**
 * The floating navigation bar.
 *
 * A custom bar rather than the system tab bar, because the locked design
 * calls for a specific shape: a detached glass pill with an elevated centre
 * action. It still renders in the real Liquid Glass layer — GlassSurface
 * resolves to a native GlassView on iOS 26 — so this is a custom *shape*
 * on the system material, not a reimplementation of it.
 *
 * The centre "+" is deliberately not a tab. It is the app's primary action
 * and pushes the capture flow, so it never takes a selected state.
 */

import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { GlassSurface } from './ui/glass-surface';
import { ScrollEdgeEffect } from './ui/layout';
import { Icon, type IconName } from './ui/icon';
import { PressableScale } from './ui/pressable-scale';
import { Text } from './ui/text';
import { motion, useTheme } from '@/theme';

/** Route name → label and icon. Order here is the order on screen. */
const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'journey', label: 'Journey', icon: 'journey' },
  { name: 'learn', label: 'Learn', icon: 'learn' },
  { name: 'profile', label: 'Profile', icon: 'profile' },
];

/** Where the centre action sits in the row. */
const CENTRE_INDEX = 2;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { spacing, radius, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const activeRoute = state.routes[state.index]?.name;

  const slots: (typeof TABS)[number][] = [
    ...TABS.slice(0, CENTRE_INDEX),
    ...TABS.slice(CENTRE_INDEX),
  ];

  const go = (name: string) => {
    if (name === activeRoute) return;
    navigation.navigate(name);
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: spacing.lg,
        paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.lg,
      }}>
      {/*
        Without this, content simply disappears behind the bar. The fade
        makes it read as passing underneath — the job the system does for
        its own bars.
      */}
      <ScrollEdgeEffect edge="bottom" height={168} />

      <GlassSurface
        variant="regular"
        borderRadius={radius.pill}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.xs,
          },
          shadow.lifted,
        ]}>
        {slots.slice(0, CENTRE_INDEX).map((tab) => (
          <TabItem
            key={tab.name}
            {...tab}
            active={activeRoute === tab.name}
            onPress={() => go(tab.name)}
          />
        ))}

        <CentreAction onPress={() => router.push('/capture-intro')} />

        {slots.slice(CENTRE_INDEX).map((tab) => (
          <TabItem
            key={tab.name}
            {...tab}
            active={activeRoute === tab.name}
            onPress={() => go(tab.name)}
          />
        ))}
      </GlassSurface>
    </View>
  );
}

function TabItem({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: IconName;
  active: boolean;
  onPress: () => void;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      scaleTo={0.94}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 3,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        // The selected tab gets a soft sage wash rather than a hard fill,
        // so the bar stays quiet.
        backgroundColor: active ? colors.accentSoft : 'transparent',
      }}>
      <Icon
        name={icon}
        size={21}
        color={active ? colors.accent : colors.textSecondary}
      />
      <Text variant="caption" color={active ? 'accent' : 'textSecondary'}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** The elevated primary action. Sits proud of the bar and never selects. */
function CentreAction({ onPress }: { onPress: () => void }) {
  const { colors, shadow } = useTheme();
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  const press = (to: number) => {
    if (reduceMotion) return;
    scale.set(withSpring(to, motion.spring.snappy));
  };

  return (
    <Animated.View style={[{ width: 66, alignItems: 'center' }, animatedStyle]}>
      <PressableScale
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
            () => undefined,
          );
          onPress();
        }}
        onPressIn={() => press(0.9)}
        onPressOut={() => press(1)}
        haptic="none"
        scaleTo={1}
        accessibilityRole="button"
        accessibilityLabel="New photo update"
        style={[
          {
            width: 54,
            height: 54,
            borderRadius: 27,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            // Lifts it out of the bar so it reads as the primary action.
            marginTop: -12,
          },
          shadow.lifted,
        ]}>
        <Icon name="plus" size={24} color={colors.text} />
      </PressableScale>
    </Animated.View>
  );
}
