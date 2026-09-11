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
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { GlassOrb } from './ui/glass-orb';
import { GlassSurface } from './ui/glass-surface';
import { ScrollEdgeEffect } from './ui/layout';
import { PressableScale } from './ui/pressable-scale';
import {
  HomeGlyph,
  JourneyGlyph,
  LearnGlyph,
  PlusGlyph,
  ProfileGlyph,
  type TabGlyphProps,
} from './ui/tab-glyphs';
import { Text } from './ui/text';
import { motion, splitAlpha, useTheme } from '@/theme';

/** Route name → label and glyph. Order here is the order on screen. */
const TABS: {
  name: string;
  label: string;
  Glyph: (props: TabGlyphProps) => ReactNode;
}[] = [
  { name: 'index', label: 'Home', Glyph: HomeGlyph },
  { name: 'journey', label: 'Journey', Glyph: JourneyGlyph },
  { name: 'learn', label: 'Learn', Glyph: LearnGlyph },
  { name: 'profile', label: 'Profile', Glyph: ProfileGlyph },
];

/** Where the centre action sits in the row. */
const CENTRE_INDEX = 2;

const ITEM_HEIGHT = 50;
const GLOW_SIZE = 52;
const CENTRE_SIZE = 54;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { spacing, radius, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const activeRoute = state.routes[state.index]?.name;

  const go = (name: string) => {
    if (name === activeRoute) return;
    navigation.navigate(name);
  };

  const renderTab = (tab: (typeof TABS)[number]) => (
    <TabItem
      key={tab.name}
      label={tab.label}
      Glyph={tab.Glyph}
      active={activeRoute === tab.name}
      onPress={() => go(tab.name)}
    />
  );

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
            paddingVertical: spacing.xs,
            paddingHorizontal: spacing.sm,
          },
          shadow.lifted,
        ]}>
        {TABS.slice(0, CENTRE_INDEX).map(renderTab)}
        <CentreAction onPress={() => router.push('/capture-intro')} />
        {TABS.slice(CENTRE_INDEX).map(renderTab)}
      </GlassSurface>
    </View>
  );
}

function TabItem({
  label,
  Glyph,
  active,
  onPress,
}: {
  label: string;
  Glyph: (props: TabGlyphProps) => ReactNode;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const tint = active ? colors.text : colors.textSecondary;

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
        height: ITEM_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {/* The selected tab sits in a pool of soft green light rather than a
          filled chip, so the bar stays white and calm. */}
      {active ? <TabGlow /> : null}
      <Glyph size={20} color={tint} active={active} />
      <Text
        variant="caption"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{ color: tint, marginTop: 2, fontWeight: active ? '600' : '500' }}>
        {label}
      </Text>
    </PressableScale>
  );
}

function TabGlow() {
  const { colors } = useTheme();
  const glow = splitAlpha(colors.tabGlow);
  const r = GLOW_SIZE / 2;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: GLOW_SIZE,
        height: GLOW_SIZE,
        top: (ITEM_HEIGHT - GLOW_SIZE) / 2,
        left: '50%',
        marginLeft: -r,
      }}>
      <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
        <Defs>
          <RadialGradient id="tabglow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={glow.color} stopOpacity={glow.opacity} />
            <Stop offset="0.62" stopColor={glow.color} stopOpacity={glow.opacity * 0.85} />
            <Stop offset="1" stopColor={glow.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill="url(#tabglow)" />
      </Svg>
    </View>
  );
}

/** The primary action: a bead of clear glass set into the bar. Never selects. */
function CentreAction({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
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
    <Animated.View
      style={[{ width: CENTRE_SIZE + 12, alignItems: 'center' }, animatedStyle]}>
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
        accessibilityLabel="New photo update">
        <GlassOrb size={CENTRE_SIZE} ring={false} tone="neutral" emphasis="strong">
          <PlusGlyph size={24} color={colors.text} />
        </GlassOrb>
      </PressableScale>
    </Animated.View>
  );
}
