/**
 * The first screen.
 *
 * Soft blurred blobs of the app's own cream and sage, drifting very
 * slowly; a glass tile holding the app mark; one honest line; a filled
 * pill to begin. Beneath it, quietly, the way to restore a purchase and
 * the line that links the terms and the privacy policy.
 *
 * The blur is not a blur. It is five radial gradients laid over each
 * other in one SVG, each fading to nothing before its edge, which reads
 * as out-of-focus light and costs nothing at runtime. The drift is one
 * slow scale-and-slide on the whole layer, and it stops under Reduce
 * Motion.
 *
 * Every word arrives through props.
 */

import { Image } from 'expo-image';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { concentricRadius, splitAlpha, useTheme } from '@/theme';

const MARK = require('@/assets/images/app-mark.jpg');

/** The glass tile and the mark inside it. */
const TILE = 150;
const TILE_INSET = 14;
/** The primary pill. */
const BAR_HEIGHT = 56;
/** One drift out and back. */
const DRIFT_MS = 9000;

/* --------------------------------- ground -------------------------------- */

/** One out-of-focus blob: a circle fading to nothing before its edge. */
function Blob({
  id,
  cx,
  cy,
  r,
  color,
  strength,
}: {
  id: string;
  cx: number;
  cy: number;
  r: number;
  color: string;
  strength: number;
}) {
  const c = splitAlpha(color);
  return (
    <>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={c.color} stopOpacity={strength * c.opacity} />
          <Stop offset="0.45" stopColor={c.color} stopOpacity={strength * 0.55 * c.opacity} />
          <Stop offset="1" stopColor={c.color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={r} fill={`url(#${id})`} />
    </>
  );
}

function Ground() {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      drift.set(0);
      return;
    }
    drift.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: DRIFT_MS, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: DRIFT_MS, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
  }, [reduceMotion, drift]);

  const drifting = useAnimatedStyle(() => {
    const t = drift.get();
    return {
      transform: [{ translateX: -10 * t }, { translateY: 8 * t }, { scale: 1.08 + 0.06 * t }],
    };
  });

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, drifting]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid slice">
          <Rect x={0} y={0} width={100} height={200} fill={colors.accentSoft} />
          <Blob id="welcomeA" cx={18} cy={38} r={62} color={colors.tabGlow} strength={0.95} />
          <Blob id="welcomeB" cx={88} cy={22} r={58} color={colors.cardRay} strength={0.7} />
          <Blob id="welcomeC" cx={72} cy={118} r={72} color={colors.accentBorder} strength={1} />
          <Blob id="welcomeD" cx={12} cy={160} r={64} color={colors.cardGlow} strength={0.4} />
          <Blob id="welcomeE" cx={52} cy={84} r={46} color={colors.surface} strength={0.85} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/* --------------------------------- screen -------------------------------- */

export function Welcome({
  tagline,
  startLabel,
  restoreLabel,
  legal,
  onStart,
  onRestore,
  onTerms,
  onPrivacy,
  markLabel = 'Tress',
}: {
  tagline: string;
  startLabel: string;
  restoreLabel: string;
  /** The consent line, in pieces, so the two links can be tapped. */
  legal: { before: string; terms: string; between: string; privacy: string; after?: string };
  onStart: () => void;
  onRestore: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
  markLabel?: string;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  const insets = useSafeAreaInsets();

  const tileRadius = radius.xl;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Ground />

      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.xxxl,
          paddingTop: insets.top,
          gap: spacing.xxl,
        }}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={markLabel}
          style={[
            {
              width: TILE,
              height: TILE,
              borderRadius: tileRadius,
              padding: TILE_INSET,
              backgroundColor: colors.glassTint,
              borderWidth: 1,
              borderColor: colors.glassBorder,
            },
            shadow.lifted,
          ]}>
          <Image
            source={MARK}
            contentFit="cover"
            style={{ flex: 1, borderRadius: concentricRadius(tileRadius, TILE_INSET) }}
          />
        </View>

        <Text variant="title2" center accessibilityRole="header" style={{ marginTop: spacing.sm }}>
          {tagline}
        </Text>
      </View>

      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xs,
          gap: spacing.lg,
          alignItems: 'stretch',
        }}>
        <PressableScale
          onPress={onStart}
          scaleTo={0.975}
          accessibilityRole="button"
          accessibilityLabel={startLabel}
          style={[
            {
              height: BAR_HEIGHT,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.accent,
            },
            shadow.soft,
          ]}>
          <Text variant="headline" color="textOnAccent">
            {startLabel}
          </Text>
        </PressableScale>

        <PressableScale
          onPress={onRestore}
          haptic="none"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={restoreLabel}
          style={{ alignSelf: 'center', paddingVertical: spacing.xs }}>
          <Text variant="callout" color="textSecondary">
            {restoreLabel}
          </Text>
        </PressableScale>

        <Text variant="footnote" color="textTertiary" center>
          {legal.before}
          <Text
            variant="footnote"
            color="textSecondary"
            accessibilityRole="link"
            onPress={onTerms}
            style={{ textDecorationLine: 'underline' }}>
            {legal.terms}
          </Text>
          {legal.between}
          <Text
            variant="footnote"
            color="textSecondary"
            accessibilityRole="link"
            onPress={onPrivacy}
            style={{ textDecorationLine: 'underline' }}>
            {legal.privacy}
          </Text>
          {legal.after ?? ''}
        </Text>
      </View>
    </View>
  );
}
