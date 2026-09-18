/**
 * The turn arrow — the piece that makes this read like a KYC check.
 *
 * Three chevrons, big, pointing the way the head has to go. A light runs
 * through them in the direction of travel, so the arrow is not merely
 * pointing, it is *moving* — which is the difference between a sign and
 * an instruction. The whole group drifts a few points the same way as it
 * runs, the way an arrow on a turnstile does.
 *
 * ── Insistence ───────────────────────────────────────────────────────
 * `urgency` is how hard the arrow is asking, 0 to 1, and it comes from
 * the step's own progress — a number that moves on every tracker frame.
 * Two things are made of it, and they are made of it differently.
 *
 * The floor, the scale and the drift ease off a smoothed copy of it, so
 * they follow it continuously: the arrow is visibly keener as a step
 * stalls. The run's speed is *geared* instead — three speeds, not three
 * hundred — because a repeating animation has to be cancelled and
 * restarted to change its duration, and a run restarted on every tracker
 * frame never travels far enough to light a single chevron. Geared, the
 * speed changes at most twice in a step and each change is one somebody
 * can see. `geometry.ts` holds both the gears and the reason.
 *
 * Nothing flashes and nothing turns red — a person who has not
 * understood yet is not doing anything wrong, and this is a phone asking
 * for a turn, not a warning light.
 *
 * ── Settling ─────────────────────────────────────────────────────────
 * The instant the step's target is reached the caller sets `settled`:
 * the run stops on the spot, all three chevrons come up together in the
 * accent, and the arrow gives one small nod and holds. That moment is
 * the only acknowledgement in the step, so it is worth being crisp.
 *
 * Under Reduce Motion there is no run and no drift — a static arrow of
 * three even chevrons at full strength. Full strength is the point: the
 * resting floor is where a chevron sits *between* passes of a light that
 * is about to come back, and with no light coming back it is simply a
 * dim arrow on the one element that has to read from two feet away.
 *
 * One geometry, three directions: the chevrons are drawn pointing right
 * and the group is rotated, so left is the same arrow turned round and
 * down is the same arrow turned a quarter. Nothing here is a word; the
 * header above says it in the caller's language, and this is hidden from
 * the screen reader for that reason.
 */

import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { darkColors, motion } from '@/theme';

import {
  CHEVRON_COUNT,
  CHEVRON_GAP,
  CHEVRON_HEIGHT,
  CHEVRON_WIDTH,
  INSIST_SCALE,
  SETTLE_SCALE,
  chevronFloor,
  chevronLit,
  driftFor,
  gearDuration,
  rotationFor,
  sweepGear,
  unit,
  type TurnDirection,
} from './geometry';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export {
  CHEVRON_COUNT,
  CHEVRON_GAP,
  CHEVRON_HEIGHT,
  CHEVRON_WIDTH,
  FLOOR_CALM,
  FLOOR_URGENT,
  SWEEP_CALM_MS,
  SWEEP_GEARS,
  SWEEP_URGENT_MS,
  chevronFloor,
  chevronLit,
  chevronOpacity,
  gearDuration,
  rotationFor,
  sweepDuration,
  sweepGear,
  type TurnDirection,
} from './geometry';

/** The stroke, in the chevron's own 24x40 box. */
const CHEVRON_PATH = 'M6 4 L20 20 L6 36';
const CHEVRON_BOX = '0 0 24 40';
const CHEVRON_STROKE = 4.5;

function Chevron({
  index,
  phase,
  settle,
  insist,
  still,
}: {
  index: number;
  phase: SharedValue<number>;
  settle: SharedValue<number>;
  insist: SharedValue<number>;
  /** True when there is no run: the chevron is drawn whole rather than at rest. */
  still: boolean;
}) {
  const props = useAnimatedProps(() => {
    const lit = chevronLit(
      still,
      phase.get(),
      index,
      CHEVRON_COUNT,
      chevronFloor(insist.get()),
    );
    const rest = settle.get();
    return {
      opacity: lit + (1 - lit) * rest,
      stroke: interpolateColor(rest, [0, 1], [darkColors.textOnPhoto, darkColors.accent]),
    };
  });

  return (
    <Svg width={CHEVRON_WIDTH} height={CHEVRON_HEIGHT} viewBox={CHEVRON_BOX}>
      <AnimatedPath
        d={CHEVRON_PATH}
        fill="none"
        strokeWidth={CHEVRON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        animatedProps={props}
      />
    </Svg>
  );
}

export type TurnArrowProps = {
  direction: TurnDirection;
  /** How hard the arrow is asking, 0–1. The caller raises it as a step stalls. */
  urgency: number;
  /** True the instant the step's target is reached: the run stops and the arrow holds. */
  settled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function TurnArrow({ direction, urgency, settled, style }: TurnArrowProps) {
  const reduceMotion = useReducedMotion();

  const phase = useSharedValue(0);
  const settle = useSharedValue(settled ? 1 : 0);
  const insist = useSharedValue(unit(urgency));
  const nod = useSharedValue(1);

  /*
    The run.

    It depends on the *gear* rather than on the urgency itself, so a
    number arriving thirty times a second restarts nothing: the effect
    runs again only when the speed genuinely changes. It stops dead when
    the target is reached, never starts under Reduce Motion, and is
    cancelled on the way out — an infinite repeat left behind would go on
    driving a shared value belonging to a screen that has gone.
  */
  const gear = sweepGear(urgency);
  const still = reduceMotion || settled === true;
  useEffect(() => {
    cancelAnimation(phase);
    if (still) {
      phase.set(0);
      return;
    }
    phase.set(0);
    phase.set(
      withRepeat(
        withTiming(1, { duration: gearDuration(gear), easing: Easing.linear }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(phase);
  }, [still, gear, phase]);

  /* Insistence eases rather than steps: the arrow gets keener, it does
     not switch modes. This one does follow the raw number. */
  useEffect(() => {
    const next = unit(urgency);
    insist.set(reduceMotion ? next : withTiming(next, { duration: motion.duration.slow }));
  }, [urgency, insist, reduceMotion]);

  /* The settle: the colour change carries it, and one nod marks it. */
  useEffect(() => {
    const next = settled ? 1 : 0;
    settle.set(reduceMotion ? next : withTiming(next, { duration: motion.duration.fast }));
    if (!settled || reduceMotion) return;
    nod.set(
      withSequence(withSpring(SETTLE_SCALE, motion.spring.snappy), withSpring(1, motion.spring.gentle)),
    );
  }, [settled, settle, nod, reduceMotion]);

  const group = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotationFor(direction)}deg` },
      /*
        Out and back on a sine, not a saw: the run loops, and a drift
        that ramped from one edge to the other would snap back to the
        start every cycle. This leaves and returns to zero, so the loop
        boundary is invisible.
      */
      { translateX: reduceMotion ? 0 : driftFor(phase.get(), insist.get()) },
      { scale: nod.get() * (1 + INSIST_SCALE * insist.get()) },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
      <Animated.View style={[{ flexDirection: 'row', gap: CHEVRON_GAP }, group]}>
        {Array.from({ length: CHEVRON_COUNT }, (_, index) => (
          <Chevron
            key={index}
            index={index}
            phase={phase}
            settle={settle}
            insist={insist}
            still={still}
          />
        ))}
      </Animated.View>
    </Animated.View>
  );
}
