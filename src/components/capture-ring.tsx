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
 * Two things do sweep the active arc, and both are real. The countdown
 * is the seconds left on the person's own timer. The hold is how long
 * they have kept a tracked pose — not how close the hair is to anything,
 * and not a judgement of the photograph; just a bar that has to fill
 * before the shutter fires, so the wait is visible rather than mysterious.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
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

/**
 * Where one segment's arc sits on the ring, and how long a full one is.
 *
 * Shared by the segments themselves and by the two arcs that draw over
 * the current one, so a sweeping arc always lands on the segment it
 * belongs to rather than near it.
 */
function arcOf(circumference: number, segment: number, index: number) {
  const sweep = segment - GAP;
  return {
    full: (sweep / 360) * circumference,
    offset: -((index * segment + GAP / 2) / 360) * circumference,
  };
}

export function CaptureRing({
  size,
  total,
  /** How many angles are already captured. */
  done,
  /** Index of the angle being shot now. */
  current,
  /** 0-1 while a countdown runs; null when it is not. */
  countdownProgress,
  /**
   * 0-1 rising while a tracked pose is held, written on the screen's
   * behalf as a shared value so a hold costs no re-render. Null when no
   * hold can be running. It outranks the countdown: a tracked hold and a
   * self-timer are never armed at the same time.
   */
  hold,
  /** True once every angle is captured: one sweep, then it settles. */
  complete,
  /** True while a hands-free countdown is armed and waiting. */
  pulse,
  stroke = 3,
}: {
  size: number;
  total: number;
  done: number;
  current: number;
  countdownProgress?: number | null;
  hold?: SharedValue<number> | null;
  complete?: boolean;
  pulse?: boolean;
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
            const { full, offset } = arcOf(circumference, segment, i);

            // A finished set reads as finished everywhere: there is no
            // "current" angle left to be on.
            const isDone = complete === true || i < done;
            const isCurrent = complete !== true && i === current;

            if (isCurrent) {
              return (
                <CurrentSegment
                  key={i}
                  size={size}
                  radius={radius}
                  circumference={circumference}
                  length={full}
                  offset={offset}
                  stroke={stroke + 1}
                  // A retake lands on a segment that is already captured;
                  // it keeps the white it earned rather than going back
                  // to "waiting on you".
                  color={isDone ? DONE : active}
                  pulse={pulse === true}
                />
              );
            }

            return (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={isDone ? DONE : TRACK}
                strokeWidth={stroke}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${full} ${circumference}`}
                strokeDashoffset={offset}
                opacity={isDone ? 1 : 0.75}
              />
            );
          })}

          {hold ? (
            <HoldArc
              size={size}
              radius={radius}
              circumference={circumference}
              segment={segment}
              index={current}
              stroke={stroke + 1}
              progress={hold}
            />
          ) : countdownProgress !== null && countdownProgress !== undefined ? (
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

          <CompleteSweep
            size={size}
            radius={radius}
            circumference={circumference}
            stroke={stroke + 1}
            color={active}
            complete={complete === true}
          />
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

  const { full, offset } = arcOf(circumference, segment, index);

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

/**
 * The active segment, filling as a pose is held.
 *
 * The same geometry as the countdown and the opposite direction: it grows
 * from the segment's start rather than draining towards it. It applies no
 * easing of its own, because the value arrives already eased — the screen
 * writes it every 60 ms with a timing curve slightly longer than the gap,
 * so the fill never stalls between writes. Easing it twice would put the
 * arc a quarter of a second behind the thing it is reporting.
 */
function HoldArc({
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
  progress: SharedValue<number>;
}) {
  const { full, offset } = arcOf(circumference, segment, index);

  const animated = useAnimatedProps(() => ({
    strokeDasharray: [full * progress.get(), circumference],
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

/**
 * The segment being shot now, breathing while a countdown is armed.
 *
 * Its own component so the animation hooks belong to one segment rather
 * than to the ring; every other segment stays a plain SVG circle with no
 * animation attached to it at all.
 */
function CurrentSegment({
  size,
  radius,
  circumference,
  length,
  offset,
  stroke,
  color,
  pulse,
}: {
  size: number;
  radius: number;
  circumference: number;
  length: number;
  offset: number;
  stroke: number;
  color: string;
  pulse: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!pulse) {
      cancelAnimation(opacity);
      opacity.set(reduceMotion ? 1 : withTiming(1, { duration: 200 }));
      return;
    }
    if (reduceMotion) {
      // Somebody who has asked for less movement still gets the signal:
      // the segment sits a shade back instead of breathing.
      opacity.set(0.85);
      return;
    }
    opacity.set(1);
    opacity.set(
      withRepeat(withTiming(0.6, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
  }, [pulse, reduceMotion, opacity]);

  const animated = useAnimatedProps(() => ({ opacity: opacity.get() }));

  return (
    <AnimatedCircle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      fill="none"
      strokeDasharray={`${length} ${circumference}`}
      strokeDashoffset={offset}
      animatedProps={animated}
    />
  );
}

/**
 * One sage circuit of the whole ring when the last angle lands.
 *
 * Mounted always and invisible until then, so finishing a set needs no
 * state change here — the effect writes two shared values and the sweep
 * ends at zero opacity, leaving the filled segments to say the rest.
 */
function CompleteSweep({
  size,
  radius,
  circumference,
  stroke,
  color,
  complete,
}: {
  size: number;
  radius: number;
  circumference: number;
  stroke: number;
  color: string;
  complete: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const sweepT = useSharedValue(0);
  const sweepOpacity = useSharedValue(0);

  useEffect(() => {
    if (!complete || reduceMotion) {
      sweepT.set(0);
      sweepOpacity.set(0);
      return;
    }
    sweepT.set(withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
    sweepOpacity.set(
      withSequence(withTiming(1, { duration: 380 }), withTiming(0, { duration: 240 })),
    );
  }, [complete, reduceMotion, sweepT, sweepOpacity]);

  const animated = useAnimatedProps(() => ({
    strokeDasharray: [circumference * sweepT.get(), circumference],
    opacity: sweepOpacity.get(),
  }));

  return (
    <AnimatedCircle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      fill="none"
      animatedProps={animated}
    />
  );
}
