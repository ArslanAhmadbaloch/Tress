/**
 * The app's micro-interactions.
 *
 * Small, repeated pieces of motion — a pop when something is chosen, a
 * burst when something is finished, a ring that fills rather than appears.
 * They live together so the whole product moves the same way: one spring,
 * one duration, one idea of what "done" feels like.
 *
 * Motion here is always feedback, never decoration. Something has to have
 * happened for any of it to run, and every piece of it stops under Reduce
 * Motion, where the end state simply appears.
 */

import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Line } from 'react-native-svg';

import { motion, useTheme } from '@/theme';

/* --------------------------------- pop ---------------------------------- */

/** How far a pop overshoots, and the spring that carries it back. */
const POP_SCALE = 1.16;
const POP_IN = { damping: 12, stiffness: 420, mass: 0.7 };

/**
 * A spring overshoot when something becomes true.
 *
 * The reference's tab bounce, badge unlock and calendar selection are all
 * this one gesture: the thing you just chose acknowledges you by moving,
 * then settles. It fires on the transition into `active`, not while it
 * stays there — a control that keeps bouncing is a control that is nagging.
 */
export function Pop({
  active,
  children,
  style,
  /** Larger for a badge unlocking than for a tab being chosen. */
  scale = POP_SCALE,
}: {
  active: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scale?: number;
}) {
  const reduceMotion = useReducedMotion();
  const value = useSharedValue(1);
  const first = useSharedValue(true);

  useEffect(() => {
    if (first.value) {
      first.value = false;
      return;
    }
    if (!active || reduceMotion) return;
    value.set(withSequence(withSpring(scale, POP_IN), withSpring(1, motion.spring.snappy)));
  }, [active, reduceMotion, scale, value, first]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: value.get() }] }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/* -------------------------------- burst --------------------------------- */

const BURST_RAYS = 8;
const BURST_MS = 620;

/**
 * The little starburst that marks a thing being finished.
 *
 * Eight short rays thrown outward and faded. It sits behind whatever it is
 * celebrating and draws nothing at rest, so it costs nothing on the
 * hundreds of rows that are never ticked.
 */
export function Burst({ active, size }: { active: boolean; size: number }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  const first = useSharedValue(true);

  useEffect(() => {
    if (first.value) {
      first.value = false;
      return;
    }
    if (!active || reduceMotion) return;
    t.set(0);
    t.set(withTiming(1, { duration: BURST_MS }));
  }, [active, reduceMotion, t, first]);

  const animated = useAnimatedStyle(() => {
    const v = t.get();
    return {
      opacity: v === 0 || v === 1 ? 0 : 1 - v,
      transform: [{ scale: 0.55 + v * 0.75 }],
    };
  });

  const r = size / 2;
  const inner = r * 0.62;
  const outer = r * 0.96;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { alignItems: 'center', justifyContent: 'center' },
        animated,
      ]}>
      <Svg width={size} height={size}>
        <G>
          {Array.from({ length: BURST_RAYS }, (_, i) => {
            const angle = (i / BURST_RAYS) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            return (
              <Line
                key={i}
                x1={r + cos * inner}
                y1={r + sin * inner}
                x2={r + cos * outer}
                y2={r + sin * outer}
                stroke={colors.accent}
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          })}
        </G>
      </Svg>
    </Animated.View>
  );
}

/* -------------------------------- sprout -------------------------------- */

/**
 * The seedling on an empty screen.
 *
 * Breathes rather than sits, because an empty state is the one screen that
 * has nothing else to say. Drawn rather than a glyph so it can grow: the
 * stem rises and the leaves open once, on arrival.
 */
export function Sprout({ size = 64 }: { size?: number }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const grow = useSharedValue(reduceMotion ? 1 : 0);
  const breathe = useSharedValue(0.5);

  useEffect(() => {
    if (reduceMotion) return;
    grow.set(withDelay(180, withSpring(1, motion.spring.gentle)));
    breathe.set(
      withDelay(
        900,
        withSequence(
          withTiming(1, { duration: 2400 }),
          withTiming(0, { duration: 2400 }),
          withTiming(0.5, { duration: 1600 }),
        ),
      ),
    );
  }, [reduceMotion, grow, breathe]);

  const stem = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.5 + 0.5 * grow.get() }],
    opacity: grow.get(),
  }));

  const leaves = useAnimatedStyle(() => ({
    opacity: grow.get(),
    transform: [{ scale: 0.7 + 0.3 * grow.get() }, { rotate: `${(breathe.get() - 0.5) * 4}deg` }],
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, stem]}>
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Line
            x1="32"
            y1="58"
            x2="32"
            y2="30"
            stroke={colors.accent}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, leaves]}>
        <Svg width={size} height={size} viewBox="0 0 64 64">
          {/* Two leaves opening from the stem. */}
          <Circle cx="20" cy="28" r="11" fill={colors.accent} opacity={0.55} />
          <Circle cx="44" cy="24" r="13" fill={colors.accent} opacity={0.8} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/* -------------------------------- flicker ------------------------------- */

/**
 * A slow, uneven flicker — for the streak flame while it is alight.
 *
 * Two loops on prime-ish durations so the wobble never repeats visibly. At
 * zero it does not run at all: an unlit streak should look unlit.
 */
export function Flicker({ alive, children }: { alive: boolean; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const a = useSharedValue(0.5);
  const b = useSharedValue(0.5);

  useEffect(() => {
    if (!alive || reduceMotion) {
      a.set(withTiming(0.5, { duration: 200 }));
      b.set(withTiming(0.5, { duration: 200 }));
      return;
    }
    a.set(withRepeat(withTiming(1, { duration: 1300 }), -1, true));
    b.set(withRepeat(withTiming(0, { duration: 1900 }), -1, true));
  }, [alive, reduceMotion, a, b]);

  const animated = useAnimatedStyle(() => ({
    transform: [
      { scale: 0.94 + 0.1 * a.get() },
      { translateX: (b.get() - 0.5) * 1.4 },
    ],
    opacity: 0.86 + 0.14 * b.get(),
  }));

  return <Animated.View style={animated}>{children}</Animated.View>;
}
