/**
 * The corner brackets — the frame the head sits inside.
 *
 * Four short right angles, one at each corner of the box the head is
 * meant to be in. They are the oldest signal in camera chrome and they
 * still work: an open frame says "somewhere in here" without drawing a
 * closed shape around somebody's face, and four corners cover a quarter
 * of the outline while hiding none of the picture.
 *
 * They are quiet white while the step is being worked, and they take the
 * accent the moment the step's target is reached — the same green the
 * arrow settles into, so the two agree. That is the only thing they say.
 * They do not measure anything, they never turn red, and they carry no
 * opinion about how far away anybody is standing.
 *
 * The component fills whatever box it is put in, so the caller sizes the
 * frame by sizing its parent. It is decorative and never touchable.
 */

import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { darkColors, motion, radius } from '@/theme';

/** Quiet while the step is being worked; the accent once it is reached. */
export type BracketTone = 'neutral' | 'reached';

/** The arm of one bracket, and how thick it is drawn. */
export const BRACKET_ARM = 40;
export const BRACKET_WEIGHT = 3;
/** The corner's curve. Concentric with the rounded video mask behind it. */
export const BRACKET_RADIUS = radius.lg;

/** The four corners, in reading order. */
const CORNERS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const;
type Corner = (typeof CORNERS)[number];

/** Where a corner sits, and which two of its sides are drawn. */
function cornerStyle(corner: Corner): ViewStyle {
  const top = corner === 'topLeft' || corner === 'topRight';
  const left = corner === 'topLeft' || corner === 'bottomLeft';
  return {
    position: 'absolute',
    width: BRACKET_ARM,
    height: BRACKET_ARM,
    top: top ? 0 : undefined,
    bottom: top ? undefined : 0,
    left: left ? 0 : undefined,
    right: left ? undefined : 0,
    borderTopWidth: top ? BRACKET_WEIGHT : 0,
    borderBottomWidth: top ? 0 : BRACKET_WEIGHT,
    borderLeftWidth: left ? BRACKET_WEIGHT : 0,
    borderRightWidth: left ? 0 : BRACKET_WEIGHT,
    borderTopLeftRadius: corner === 'topLeft' ? BRACKET_RADIUS : 0,
    borderTopRightRadius: corner === 'topRight' ? BRACKET_RADIUS : 0,
    borderBottomLeftRadius: corner === 'bottomLeft' ? BRACKET_RADIUS : 0,
    borderBottomRightRadius: corner === 'bottomRight' ? BRACKET_RADIUS : 0,
  };
}

/**
 * One bracket. Its own component so each may hold a hook, and so the
 * colour crosses from white to the accent as one value rather than as a
 * swap between two views.
 */
function Bracket({ corner, lit }: { corner: Corner; lit: SharedValue<number> }) {
  const tint = useAnimatedStyle(() => ({
    borderColor: interpolateColor(lit.get(), [0, 1], [darkColors.textOnPhoto, darkColors.accent]),
  }));

  return <Animated.View style={[cornerStyle(corner), tint]} />;
}

export type FrameBracketsProps = {
  tone: BracketTone;
  style?: StyleProp<ViewStyle>;
};

export function FrameBrackets({ tone, style }: FrameBracketsProps) {
  const reduceMotion = useReducedMotion();
  const lit = useSharedValue(tone === 'reached' ? 1 : 0);

  useEffect(() => {
    const next = tone === 'reached' ? 1 : 0;
    lit.set(reduceMotion ? next : withTiming(next, { duration: motion.duration.base }));
  }, [tone, lit, reduceMotion]);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, style]}>
      {CORNERS.map((corner) => (
        <Bracket key={corner} corner={corner} lit={lit} />
      ))}
    </View>
  );
}
