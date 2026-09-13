/**
 * What the funnel sits in.
 *
 * The questions were set on a bare plate, which read as a form rather
 * than as part of the app the rest of the screens belong to — the ground
 * everywhere else carries light through leaves, and the one place a
 * person is asked how their hair makes them feel had nothing at all.
 *
 * So fronds lean in from the edges and drift, the way a shadow moves
 * across a wall over an afternoon. They are very faint and very slow on
 * purpose: this is the backdrop to a sentence somebody is reading, and
 * anything quick enough to notice would be something to look at instead.
 *
 * Nothing here is interactive and nothing announces itself — it is
 * `pointerEvents="none"` and hidden from the screen reader entirely.
 */

import { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { LeafShadow } from './ui/leaf-shadow';
import { useTheme } from '@/theme';

/** A full drift and back. Long enough to read as weather, not animation. */
const DRIFT_MS = 26000;

type Frond = {
  /** Fraction of the screen width the frond's box starts at. */
  left: number;
  top: number;
  size: number;
  rotate: string;
  opacity: number;
  /** Pixels of travel, and which way it leans first. */
  travel: number;
  delay: number;
};

/*
 * Mostly off the edges, and barely there.
 *
 * The first attempt at this put three fronds across the middle of the
 * screen at half opacity and turned the backdrop into wallpaper — the
 * questions had to compete with it to be read, which is precisely the
 * job a backdrop must not do. These sit at the corners, hang off the
 * frame, and are faint enough that you notice the screen feels alive
 * rather than noticing the leaves.
 */
const FRONDS: Frond[] = [
  { left: -0.48, top: -0.1, size: 0.78, rotate: '22deg', opacity: 0.1, travel: 12, delay: 0 },
  { left: 0.78, top: 0.26, size: 0.7, rotate: '-148deg', opacity: 0.075, travel: -15, delay: 5200 },
  { left: -0.34, top: 0.78, size: 0.62, rotate: '-28deg', opacity: 0.06, travel: 9, delay: 11000 },
];

export function FunnelAmbience() {
  const { width, height } = useWindowDimensions();

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {FRONDS.map((frond, i) => (
        <Drifting key={i} frond={frond} width={width} height={height} />
      ))}
    </View>
  );
}

function Drifting({
  frond,
  width,
  height,
}: {
  frond: Frond;
  width: number;
  height: number;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const sway = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      // Still there, just still. The leaves are part of the ground; only
      // the movement is the thing somebody asked not to see.
      sway.set(0);
      return;
    }
    sway.set(
      withRepeat(
        withTiming(1, { duration: DRIFT_MS, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, [reduceMotion, sway]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: sway.get() * frond.travel },
      { translateY: sway.get() * frond.travel * 0.4 },
      { rotate: frond.rotate },
    ],
  }));

  const size = width * frond.size;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: width * frond.left,
          top: height * frond.top,
          opacity: frond.opacity,
        },
        style,
      ]}>
      <LeafShadow width={size} height={size * 1.15} color={colors.leafShadow} />
    </Animated.View>
  );
}
