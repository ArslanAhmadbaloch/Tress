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
 * and opens the hair scan over the top of whatever is showing, so it never
 * takes a selected state.
 *
 * One door, not a choice. There used to be a chooser behind the Plus —
 * a scan, or the five angles one at a time — and the owner's call was
 * that there is no scanner choice: the scan is the one way a session is
 * made, so the button opens it directly.
 */

import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassOrb } from './ui/glass-orb';
import { GlassSurface } from './ui/glass-surface';
import { Pop } from './ui/motion';
import { ScrollEdgeEffect } from './ui/layout';
import { PressableScale } from './ui/pressable-scale';
import {
  HomeGlyph,
  JourneyGlyph,
  ReportGlyph,
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
  { name: 'report', label: 'Report', Glyph: ReportGlyph },
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
        <CentreAction onPress={() => router.push('/hair-scan')} />
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
  const reduceMotion = useReducedMotion();
  const tint = active ? colors.text : colors.textSecondary;

  /*
    One value drives the whole selection, rather than three animations
    starting independently. The glyph lifts, the glow blooms behind it and
    the label settles — and because they share a spring they arrive
    together, which is the difference between a tab that animates and a
    tab that feels like one object responding.
  */
  const sel = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    const to = active ? 1 : 0;
    sel.set(
      reduceMotion
        ? to
        : withSpring(to, { damping: 15, stiffness: 220, mass: 0.7 }),
    );
  }, [active, reduceMotion, sel]);

  const glyph = useAnimatedStyle(() => ({
    transform: [
      { translateY: -3 * sel.get() },
      { scale: 1 + 0.12 * sel.get() },
    ],
  }));

  const glow = useAnimatedStyle(() => ({
    opacity: sel.get(),
    transform: [{ scale: 0.7 + 0.3 * sel.get() }],
  }));

  // The label closes the gap the glyph opened, so the pair stays centred.
  const caption = useAnimatedStyle(() => ({ transform: [{ translateY: -1.5 * sel.get() }] }));

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
      {/*
        The wrapper has to fill the item, not wrap the glow. TabGlow
        centres itself with `left: 50%`, which resolves against its
        parent — so an auto-sized animated wrapper silently moved the
        light off to one side. Caught by looking at it, not by a test.
      */}
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, glow]}>
        <TabGlow />
      </Animated.View>
      <Pop active={active}>
        <Animated.View style={glyph}>
          <Glyph size={20} color={tint} active={active} />
        </Animated.View>
      </Pop>
      <Animated.View style={caption}>
        <Text
          variant="caption"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{ color: tint, marginTop: 2, fontWeight: active ? '600' : '500' }}>
          {label}
        </Text>
      </Animated.View>
    </PressableScale>
  );
}

/**
 * A scan line drifting down the capture button, on a slow loop.
 *
 * The reference's scan button is a camera-frame outline with a thin bar
 * sweeping through it every ten seconds — the universal "this thing
 * scans" gesture, and the only ambient motion on its home screen. This is
 * the same idea inside the orb: a faint sage bar that fades in at the
 * top, drifts to the bottom, fades out, waits, and goes again.
 *
 * Ten seconds is deliberate. A loop quick enough to notice is something
 * to watch; one this slow is something you register only when you happen
 * to look, which is how an ambient cue should behave. Reduced motion
 * removes it entirely.
 */
function ScanSweep({ size }: { size: number }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const y = useSharedValue(0);
  const travel = size * 0.62;

  useEffect(() => {
    if (reduceMotion) return;
    y.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
          // The pause before the next pass is most of the loop.
          withTiming(1, { duration: 7600 }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
  }, [reduceMotion, y]);

  const style = useAnimatedStyle(() => {
    const p = y.get();
    // Fade in over the first fifth, out over the last fifth of the pass.
    const fade = Math.min(1, p / 0.2, (1 - p) / 0.2);
    return {
      opacity: Math.max(0, fade) * 0.55,
      transform: [{ translateY: (p - 0.5) * travel }],
    };
  });

  if (reduceMotion) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: size * 0.22,
          right: size * 0.22,
          height: 1.5,
          borderRadius: 1,
          backgroundColor: colors.accent,
        },
        style,
      ]}
    />
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
        // Named for what it opens, which is the one thing behind it.
        accessibilityLabel="Scan your hair">
        <GlassOrb size={CENTRE_SIZE} ring={false} tone="neutral" emphasis="strong">
          <ScanSweep size={CENTRE_SIZE} />
          <PlusGlyph size={24} color={colors.text} />
        </GlassOrb>
      </PressableScale>
    </Animated.View>
  );
}
