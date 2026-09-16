/**
 * The flame on the Streak tile.
 *
 * It used to be sage whenever the streak was alive, which made it the odd
 * one out beside the ink-black strand and camera glyphs. It is now ink
 * like its neighbours, and it earns colour only at the moment the day is
 * actually finished: every item in today's stack ticked off.
 *
 * The amber is the state; the animation is only the transition into it.
 * A pilot light catching: one sharp beat, a few sparks thrown off the
 * tip, and then the flame is simply amber and nothing is still moving.
 * The whole thing is over in well under half a second.
 *
 * What it must never do — and what it used to do — is put anything on top
 * of the glyph. An earlier version bloomed an amber halo behind the flame
 * and rested it there at a fifth opacity for as long as the day stayed
 * complete, which read as an orange bubble that swelled, hung, and then
 * swallowed the icon. The silhouette here is the same 18pt flame from
 * the first frame to the last.
 */

import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme';

const SIZE = 18;

/* The beat. Up fast, down almost as fast: a blink, not a bloom. */
const CATCH_MS = 70;
const SETTLE_MS = 170;
/* The colour lands before the beat finishes, so the flame is already
   amber on the way back down rather than fading in afterwards. */
const COLOUR_MS = 150;
const COLOUR_OUT_MS = 180;
/* Sparks leave on the catch and are gone by ~420ms. Nothing outlives them. */
const SPARK_DELAY_MS = 60;
const SPARK_MS = 360;

/**
 * Three, off the tip and to either side. Any more is confetti, and this is
 * a tick of acknowledgement.
 */
const SPARKS = [
  { dx: 6.5, dy: -8.5, r: 1.5, arc: 2 },
  { dx: -5.5, dy: -6.5, r: 1.2, arc: 2.5 },
  { dx: 1.5, dy: -11, r: 1, arc: 1.5 },
] as const;

function Spark({
  progress,
  dx,
  dy,
  r,
  arc,
  color,
}: {
  progress: SharedValue<number>;
  dx: number;
  dy: number;
  r: number;
  arc: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      // Bright immediately, then out. Nothing left on screen at p = 1.
      opacity: interpolate(p, [0, 0.15, 1], [0, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: dx * p },
        // A touch of fall on the way out so they arc rather than shoot.
        { translateY: dy * p + arc * p * p },
        { scale: interpolate(p, [0, 1], [1, 0.3], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: SIZE / 2 - r, top: SIZE / 3 - r }, style]}
    >
      <Svg width={r * 2} height={r * 2} accessible={false}>
        <Circle cx={r} cy={r} r={r} fill={color} />
      </Svg>
    </Animated.View>
  );
}

export function StreakGlyph({ complete }: { complete: boolean }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  // Ink → amber. This is the state, and it holds.
  const lit = useSharedValue(complete ? 1 : 0);
  // The ignition beat: 0 → 1 → 0, scale and brightness together.
  const ignite = useSharedValue(0);
  // Spark flight, 0 → 1 once and then parked.
  const spark = useSharedValue(0);

  // Mounting on an already-finished day is not the moment worth marking,
  // so the celebration is spent only on the crossing.
  const wasComplete = useRef(complete);

  useEffect(() => {
    const crossed = wasComplete.current !== complete;
    wasComplete.current = complete;

    if (!complete) {
      lit.set(reduced ? 0 : withTiming(0, { duration: COLOUR_OUT_MS }));
      ignite.set(0);
      spark.set(0);
      return;
    }

    if (reduced || !crossed) {
      lit.set(1);
      ignite.set(0);
      spark.set(0);
      return;
    }

    lit.set(withTiming(1, { duration: COLOUR_MS, easing: Easing.out(Easing.cubic) }));
    ignite.set(
      withSequence(
        withTiming(1, { duration: CATCH_MS, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: SETTLE_MS, easing: Easing.out(Easing.cubic) }),
      ),
    );
    // `spark` is always parked at 0 here: the only way into this branch
    // is from an incomplete day, which zeroes it.
    spark.set(
      withDelay(
        SPARK_DELAY_MS,
        withTiming(1, { duration: SPARK_MS, easing: Easing.out(Easing.quad) }),
      ),
    );
  }, [complete, reduced, lit, ignite, spark]);

  // The beat lives on the flame itself: a small scale pop and a dip that
  // recovers, which is what a light catching looks like.
  const flame = useAnimatedStyle(() => ({
    opacity: 1 - ignite.get() * 0.5,
    transform: [{ scale: 1 + ignite.get() * 0.18 }],
  }));

  const amber = useAnimatedStyle(() => ({ opacity: lit.get() }));
  const ink = useAnimatedStyle(() => ({ opacity: 1 - lit.get() }));

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Animated.View style={[{ width: SIZE, height: SIZE }, flame]}>
        {/*
          Two glyphs crossfaded rather than one glyph with an animated
          colour: `Icon` takes a plain colour prop, and animating a colour
          string across the bridge is neither smooth nor cheap. Same path,
          same size, so the silhouette never moves.
        */}
        <Animated.View style={[{ position: 'absolute' }, ink]}>
          <Icon name="flame" size={SIZE} color={colors.text} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute' }, amber]}>
          <Icon name="flame" size={SIZE} color={colors.warning} />
        </Animated.View>
      </Animated.View>
      {SPARKS.map((s) => (
        <Spark
          key={`${s.dx}:${s.dy}`}
          progress={spark}
          dx={s.dx}
          dy={s.dy}
          r={s.r}
          arc={s.arc}
          color={colors.warning}
        />
      ))}
    </View>
  );
}
