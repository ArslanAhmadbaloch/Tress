/**
 * The alignment guide, as a ring of one segment per angle.
 *
 * Segments run in the order the angles are shot, so the guide doubles as
 * the progress meter: the arcs behind you are filled, the one you are on
 * is lit, the rest are waiting. It is the Face ID idea — a ring that
 * closes as you work through a set — and the set is whatever the session
 * asked for: the full five on an update, a single front shot on the
 * first scan, where the ring is one arc and there is nothing to count.
 *
 * Nothing here fills because of where the head is. Following the head is
 * the FaceFrame oval's job, on the builds and angles that can do it; this
 * ring only ever shows what has been captured.
 *
 * The countdown segment is the exception: while the timer runs, the active
 * arc sweeps, and that sweep is real — it is the seconds left.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Gap between segments, in degrees. */
const GAP = 5;

/*
 * Chrome over a live camera, which is real black rather than a themed
 * surface — so the track and the completed arcs are stated in white
 * directly, the way the rest of the capture screen states its own. The
 * accent is not: sage is a brand colour and comes from the theme.
 */
const TRACK = 'rgba(255,255,255,0.22)';
const DONE = 'rgba(255,255,255,0.9)';

export function CaptureRing({
  size,
  total,
  /** How many angles are already captured. */
  done,
  /** Index of the angle being shot now. */
  current,
  /** 0-1 while a countdown runs; null when it is not. */
  countdownProgress,
  stroke = 3,
}: {
  size: number;
  total: number;
  done: number;
  current: number;
  countdownProgress?: number | null;
  stroke?: number;
}) {
  const { colors } = useTheme();
  const active = colors.accent;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const segment = 360 / total;

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size}>
        {/* Rotated so segment zero starts at the top. */}
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {Array.from({ length: total }, (_, i) => {
            const sweep = segment - GAP;
            const length = (sweep / 360) * circumference;
            const offset = -((i * segment + GAP / 2) / 360) * circumference;

            const isDone = i < done;
            const isCurrent = i === current;

            return (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={isDone ? DONE : isCurrent ? active : TRACK}
                strokeWidth={isCurrent ? stroke + 1 : stroke}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${length} ${circumference}`}
                strokeDashoffset={offset}
                opacity={isDone || isCurrent ? 1 : 0.75}
              />
            );
          })}

          {countdownProgress !== null && countdownProgress !== undefined ? (
            <CountdownArc
              size={size}
              radius={radius}
              circumference={circumference}
              segment={segment}
              index={current}
              stroke={stroke + 1}
              progress={countdownProgress}
            />
          ) : null}
        </G>
      </Svg>
    </View>
  );
}

/**
 * The active segment, draining as the timer runs.
 *
 * Drawn over the lit arc rather than replacing it, so the segment keeps
 * its place in the ring while it empties.
 */
function CountdownArc({
  size,
  radius,
  circumference,
  segment,
  index,
  stroke,
  progress,
}: {
  size: number;
  radius: number;
  circumference: number;
  segment: number;
  index: number;
  stroke: number;
  progress: number;
}) {
  const reduceMotion = useReducedMotion();
  const value = useSharedValue(progress);

  useEffect(() => {
    value.set(reduceMotion ? progress : withTiming(progress, { duration: 260 }));
  }, [progress, reduceMotion, value]);

  const sweep = segment - GAP;
  const full = (sweep / 360) * circumference;
  const offset = -((index * segment + GAP / 2) / 360) * circumference;

  const animated = useAnimatedProps(() => ({
    strokeDasharray: [full * value.get(), circumference],
  }));

  return (
    <AnimatedCircle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      stroke="#fff"
      strokeWidth={stroke}
      strokeLinecap="round"
      fill="none"
      strokeDashoffset={offset}
      animatedProps={animated}
    />
  );
}
