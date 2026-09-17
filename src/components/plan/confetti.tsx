/**
 * Confetti for the moment the slide completes.
 *
 * Squares, circles, small bars and stars in the app's own colours —
 * sage, its lighter tints, the warm amber and a soft grey — fall from
 * above the headline, swaying a little and turning as they go, and fade
 * before they reach the slider. Each piece has its own delay, speed and
 * spin, seeded so the shower is the same shape every time and nothing is
 * drawn from Math.random during render.
 *
 * Under Reduce Motion the pieces appear scattered and still, part-way
 * down, and stay.
 */

import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/theme';

const COUNT = 44;
/** How far down the screen a piece travels before it is gone, as a share of the height. */
const FALL_TO = 0.6;
/** Where a still shower sits under Reduce Motion, as a share of the fall. */
const STILL_AT = 0.32;

type Shape = 'square' | 'circle' | 'bar' | 'star';
const SHAPES: Shape[] = ['square', 'circle', 'bar', 'star', 'square', 'circle'];

type Piece = {
  x: number;
  startY: number;
  size: number;
  delay: number;
  duration: number;
  sway: number;
  spin: number;
  shape: Shape;
  tint: number;
};

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeShower(width: number): Piece[] {
  const rand = seeded(7_1_2022);
  const pieces: Piece[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    pieces.push({
      x: rand() * width,
      startY: -24 - rand() * 90,
      size: 8 + rand() * 9,
      delay: rand() * 360,
      duration: 1_500 + rand() * 1_100,
      sway: 0.8 + rand() * 1.6,
      spin: (rand() - 0.5) * 2 * 540,
      shape: SHAPES[Math.floor(rand() * SHAPES.length)],
      tint: Math.floor(rand() * 5),
    });
  }
  return pieces;
}

/** A five-point star in a unit box. */
const STAR = 'M12 1.5 L14.9 8.6 L22.5 9.2 L16.7 14.2 L18.5 21.6 L12 17.6 L5.5 21.6 L7.3 14.2 L1.5 9.2 L9.1 8.6 Z';

function Bit({
  p,
  color,
  height,
  active,
  reduceMotion,
}: {
  p: Piece;
  color: string;
  height: number;
  active: boolean;
  reduceMotion: boolean;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    if (reduceMotion) {
      t.set(STILL_AT);
      return;
    }
    t.set(withDelay(p.delay, withTiming(1, { duration: p.duration, easing: Easing.in(Easing.sin) })));
  }, [active, reduceMotion, t, p.delay, p.duration]);

  const fallTo = height * FALL_TO;
  const style = useAnimatedStyle(() => {
    const v = t.get();
    const y = p.startY + v * (fallTo - p.startY);
    const x = p.x + Math.sin(v * 6.283185307 * p.sway) * 16;
    const fade = v < 0.8 ? 1 : 1 - (v - 0.8) / 0.2;
    return {
      opacity: v === 0 ? 0 : fade,
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${v * p.spin}deg` }],
    };
  });

  const base = { position: 'absolute' as const, left: 0, top: 0 };
  if (p.shape === 'star') {
    return (
      <Animated.View style={[base, style]}>
        <Svg width={p.size * 1.4} height={p.size * 1.4} viewBox="0 0 24 24">
          <Path d={STAR} fill={color} />
        </Svg>
      </Animated.View>
    );
  }
  return (
    <Animated.View
      style={[
        base,
        {
          width: p.shape === 'bar' ? p.size * 0.45 : p.size,
          height: p.shape === 'bar' ? p.size * 1.6 : p.size,
          borderRadius: p.shape === 'circle' ? p.size / 2 : p.shape === 'bar' ? 2 : 1.5,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export function Confetti({
  active,
  reduceMotion,
  width,
  height,
}: {
  active: boolean;
  reduceMotion: boolean;
  width: number;
  height: number;
}) {
  const { colors } = useTheme();
  const shower = useMemo(() => makeShower(width), [width]);
  const tints = [colors.accent, colors.arcEnd, colors.warning, colors.accentBorder, colors.textTertiary];

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {shower.map((p, i) => (
        <Bit key={i} p={p} color={tints[p.tint]} height={height} active={active} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}
