/**
 * The night behind the rolling numbers.
 *
 * A field of small pale particles on the dark ground. Between counts they
 * drift, slowly and each on its own path; when a count changes they
 * surge — outward and upward, brighter and larger for a moment — and
 * settle again; and when the plan is ready a handful of them gather into
 * a small bright cluster while the rest fade, which is the shape the
 * ready page opens on.
 *
 * Everything is driven by three shared values — a clock for the drift, a
 * burst that rises and falls once per count, and a gather that goes to
 * one and stays — read on the UI thread by every particle. Positions are
 * seeded rather than random so the field is the same on every mount and
 * nothing is computed during render that React would call impure.
 *
 * Under Reduce Motion the field is still: no drift, no burst, and the
 * cluster simply appears when it is time.
 */

import { useEffect, useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { darkColors } from '@/theme';

/** How many particles the field holds, and how many of them gather. */
const COUNT = 120;
const CLUSTER = 9;

/** One drift cycle. Every particle's wobble is a whole number of turns of it, so the loop has no seam. */
const CLOCK_MS = 16_000;
const BURST_UP_MS = 460;
const BURST_DOWN_MS = 1_150;
const GATHER_MS = 1_200;

/** The cluster: five over four, centred a third of the way down. */
const CLUSTER_ROW = 5;
const CLUSTER_GAP = 30;
const CLUSTER_Y = 0.34;
const CLUSTER_SIZE = 16;

type Particle = {
  x: number;
  y: number;
  size: number;
  opacity: number;
  /** Where a burst sends it, as a unit-ish direction and a distance. */
  dirX: number;
  dirY: number;
  dist: number;
  /** The drift: amplitude, whole turns per clock cycle, and phase. */
  amp: number;
  turns: number;
  phase: number;
  /** Where it gathers to, for the few that do. */
  cluster: { x: number; y: number } | null;
  tint: string;
};

/** A small deterministic generator, so the field is the same every time. */
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

function makeField(width: number, height: number): Particle[] {
  const rand = seeded(20260917);
  const clusterLeft = width / 2 - ((CLUSTER_ROW - 1) * CLUSTER_GAP) / 2;
  const clusterTop = height * CLUSTER_Y;
  const field: Particle[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    const r = rand();
    const inCluster = i < CLUSTER;
    const row = i < CLUSTER_ROW ? 0 : 1;
    const col = row === 0 ? i : i - CLUSTER_ROW;
    field.push({
      x: rand() * width,
      y: rand() * height,
      size: 1.5 + rand() * 2.2,
      opacity: 0.35 + rand() * 0.5,
      dirX: (rand() - 0.5) * 1.4,
      dirY: -(0.35 + rand() * 0.9),
      dist: 70 + rand() * 200,
      amp: 3 + rand() * 9,
      turns: 1 + Math.floor(rand() * 3),
      phase: rand() * Math.PI * 2,
      cluster: inCluster
        ? { x: clusterLeft + col * CLUSTER_GAP + (row === 1 ? CLUSTER_GAP / 2 : 0), y: clusterTop + row * CLUSTER_GAP }
        : null,
      tint: r < 0.18 ? darkColors.accent : darkColors.text,
    });
  }
  return field;
}

function Dot({
  p,
  clock,
  burst,
  gather,
}: {
  p: Particle;
  clock: SharedValue<number>;
  burst: SharedValue<number>;
  gather: SharedValue<number>;
}) {
  const hasCluster = p.cluster !== null;
  const cx = p.cluster?.x ?? 0;
  const cy = p.cluster?.y ?? 0;
  const clusterScale = CLUSTER_SIZE / p.size;

  const style = useAnimatedStyle(() => {
    const c = clock.get();
    const b = burst.get();
    const g = gather.get();
    const angle = 6.283185307 * p.turns * c + p.phase;
    let x = p.x + Math.sin(angle) * p.amp + p.dirX * b * p.dist;
    let y = p.y + Math.cos(angle) * p.amp + p.dirY * b * p.dist;
    let scale = 1 + b * 0.8;
    let opacity = p.opacity + b * 0.5;
    if (hasCluster) {
      x += (cx - x) * g;
      y += (cy - y) * g;
      scale += g * (clusterScale - 1);
      opacity += g * (1 - opacity);
    } else {
      opacity *= 1 - g;
    }
    return {
      opacity: opacity > 1 ? 1 : opacity,
      transform: [{ translateX: x }, { translateY: y }, { scale }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: -p.size / 2,
          top: -p.size / 2,
          width: p.size,
          height: p.size,
          borderRadius: p.size / 2,
          backgroundColor: p.tint,
        },
        hasCluster && {
          shadowColor: darkColors.text,
          shadowOpacity: 0.9,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    />
  );
}

export function Starfield({
  /** Increment to fire one burst. */
  burstKey,
  /** True once the plan is ready: the cluster forms and the rest fade. */
  gathered,
  reduceMotion,
}: {
  burstKey: number;
  gathered: boolean;
  reduceMotion: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const field = useMemo(() => makeField(width, height), [width, height]);

  const clock = useSharedValue(0);
  const burst = useSharedValue(0);
  const gather = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    clock.set(withRepeat(withTiming(1, { duration: CLOCK_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(clock);
  }, [clock, reduceMotion]);

  useEffect(() => {
    if (burstKey === 0 || reduceMotion) return;
    burst.set(
      withSequence(
        withTiming(1, { duration: BURST_UP_MS, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: BURST_DOWN_MS, easing: Easing.inOut(Easing.quad) }),
      ),
    );
  }, [burst, burstKey, reduceMotion]);

  useEffect(() => {
    const target = gathered ? 1 : 0;
    if (reduceMotion) {
      gather.set(target);
      return;
    }
    gather.set(withTiming(target, { duration: GATHER_MS, easing: Easing.inOut(Easing.cubic) }));
  }, [gather, gathered, reduceMotion]);

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {field.map((p, i) => (
        <Dot key={i} p={p} clock={clock} burst={burst} gather={gather} />
      ))}
    </View>
  );
}
