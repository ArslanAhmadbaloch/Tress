/**
 * The launch animation.
 *
 * The brand lockup was delivered as two renders: an empty plate and the
 * finished composition. `scripts/splash-tiles.swift` cuts the mark and
 * the two lines of the wordmark out of the finished render and feathers
 * them, so each piece can be laid back over the plate at the coordinates
 * it came from and brought up on its own beat. Nothing is re-typeset:
 * what animates is the designer's artwork, pixel for pixel.
 *
 * Everything is positioned in the plate's own coordinate space and then
 * mapped onto whatever rectangle the plate covers on this screen, so the
 * lockup stays registered on any aspect ratio.
 *
 * The sequence is light arriving on a still surface rather than motion
 * for its own sake: the plate settles out of a slight push-in, warm light
 * gathers over the mark and clears as the mark resolves, a soft sheen
 * crosses it, and the two lines of the phrase settle up into place one
 * after the other. With Reduce Motion on it is a plain cross-fade, held
 * just long enough to read.
 */

import { useEffect, useId } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { launch } from '@/theme';

import {
  DISC,
  EMBLEM_TILE,
  LINE_ONE_TILE,
  LINE_TWO_TILE,
  LOCKUP_ASSETS,
  LockupTile,
  PLATE_W,
  Plate,
  coverRect,
} from './brand-lockup';

/** Held until these have decoded, so the first frame is the finished plate. */
export const SPLASH_ASSETS = LOCKUP_ASSETS;

/** How far each line of the wordmark rises into place, in plate pixels. */
const LINE_RISE = 13;

/* ------------------------------- timing ------------------------------- */

const PLATE_FADE = 420;
const SETTLE = 2200;
const EMBLEM_IN = { delay: 260, duration: 620 };
const BLOOM = { delay: 200, rise: 420, fall: 900 };
const SHEEN = { delay: 560, duration: 1000 };
/**
 * The two lines are separate pieces of artwork and arrive separately,
 * each settling up into place: the phrase is a sentence with a turn in
 * it, and reading it in one flash loses that.
 */
const LINE_ONE_IN = { delay: 900, duration: 620 };
const LINE_TWO_IN = { delay: 1160, duration: 620 };
/**
 * When the lockup starts to clear, measured from the first frame.
 *
 * The tagline lands at 1560ms, so this leaves the finished lockup whole
 * and still on screen for a beat under two seconds — long enough to be
 * looked at rather than glimpsed, which is the whole point of showing it.
 */
const HOLD_UNTIL = 3500;
/** Unhurried, so the lockup dissolves rather than cutting away. */
const EXIT = 560;

/** The same beats, collapsed for Reduce Motion. */
const CALM = { fade: 280, hold: 1900, exit: 320 };

const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.quad);

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const rect = coverRect(width, height);

  const plate = useSharedValue(0);
  const settle = useSharedValue(0);
  const emblem = useSharedValue(0);
  const bloom = useSharedValue(0);
  const sheen = useSharedValue(0);
  const lineOne = useSharedValue(0);
  const lineTwo = useSharedValue(0);
  const exit = useSharedValue(1);

  useEffect(() => {
    const finish = () => {
      exit.set(
        withDelay(
          reduceMotion ? CALM.hold : HOLD_UNTIL,
          withTiming(0, { duration: reduceMotion ? CALM.exit : EXIT }, (done) => {
            if (done) runOnJS(onFinish)();
          }),
        ),
      );
    };

    if (reduceMotion) {
      const fade = withTiming(1, { duration: CALM.fade });
      plate.set(fade);
      emblem.set(withTiming(1, { duration: CALM.fade }));
      lineOne.set(withTiming(1, { duration: CALM.fade }));
      lineTwo.set(withTiming(1, { duration: CALM.fade }));
      settle.set(1);
      finish();
      return;
    }

    plate.set(withTiming(1, { duration: PLATE_FADE, easing: easeOut }));
    settle.set(withTiming(1, { duration: SETTLE, easing: easeOut }));
    emblem.set(
      withDelay(
        EMBLEM_IN.delay,
        withTiming(1, { duration: EMBLEM_IN.duration, easing: easeOut }),
      ),
    );
    bloom.set(
      withDelay(
        BLOOM.delay,
        withSequence(
          withTiming(1, { duration: BLOOM.rise, easing: easeOut }),
          withTiming(0, { duration: BLOOM.fall, easing: easeInOut }),
        ),
      ),
    );
    sheen.set(
      withDelay(SHEEN.delay, withTiming(1, { duration: SHEEN.duration, easing: easeInOut })),
    );
    lineOne.set(
      withDelay(
        LINE_ONE_IN.delay,
        withTiming(1, { duration: LINE_ONE_IN.duration, easing: easeOut }),
      ),
    );
    lineTwo.set(
      withDelay(
        LINE_TWO_IN.delay,
        withTiming(1, { duration: LINE_TWO_IN.duration, easing: easeOut }),
      ),
    );
    finish();
  }, [reduceMotion, onFinish, plate, settle, emblem, bloom, sheen, lineOne, lineTwo, exit]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: exit.get() }));

  // One transform for the whole composition, so the plate and the artwork
  // laid over it can never drift apart.
  const stageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.045 * (1 - settle.get()) }],
  }));

  const plateStyle = useAnimatedStyle(() => ({ opacity: plate.get() }));
  const emblemStyle = useAnimatedStyle(() => ({ opacity: emblem.get() }));

  // Each line settles up into place. The travel is in plate pixels, so it
  // scales with the artwork rather than being a fixed number of points.
  const rise = LINE_RISE * (rect.width / PLATE_W);
  const lineOneStyle = useAnimatedStyle(() => ({
    opacity: lineOne.get(),
    transform: [{ translateY: rise * (1 - lineOne.get()) }],
  }));
  const lineTwoStyle = useAnimatedStyle(() => ({
    opacity: lineTwo.get(),
    transform: [{ translateY: rise * (1 - lineTwo.get()) }],
  }));

  const bloomSize = rect.width * 0.95;
  const bloomStyle = useAnimatedStyle(() => ({
    opacity: bloom.get() * 0.42,
    transform: [{ scale: 0.8 + 0.35 * bloom.get() }],
  }));

  // A soft highlight crossing the mark from upper left to lower right.
  const sheenSize = rect.width * 0.52;
  const travel = rect.width * 0.3;
  const sheenStyle = useAnimatedStyle(() => {
    const t = sheen.get();
    return {
      // Brightest halfway across, absent at both ends.
      opacity: Math.sin(Math.PI * t) * 0.5,
      transform: [
        { translateX: (t - 0.5) * 2 * travel },
        { translateY: (t - 0.5) * 2 * travel * 0.62 },
      ],
    };
  });

  const centred = (size: number) => ({
    position: 'absolute' as const,
    left: rect.left + DISC.x * rect.width - size / 2,
    top: rect.top + DISC.y * rect.height - size / 2,
    width: size,
    height: size,
  });

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: launch.paper, overflow: 'hidden' },
        rootStyle,
      ]}>
      <Animated.View style={[StyleSheet.absoluteFill, stageStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, plateStyle]}>
          <Plate />
        </Animated.View>

        <Animated.View style={emblemStyle}>
          <LockupTile tile={EMBLEM_TILE} rect={rect} />
        </Animated.View>

        {/* Light gathering over the mark, then clearing as it resolves. */}
        <Animated.View style={[centred(bloomSize), bloomStyle]}>
          <Glow size={bloomSize} inner={0.9} mid={0.4} />
        </Animated.View>

        {/* The sheen that crosses it once the mark is there. */}
        <Animated.View style={[centred(sheenSize), sheenStyle]}>
          <Glow size={sheenSize} inner={0.95} mid={0.3} />
        </Animated.View>

        <Animated.View style={lineOneStyle}>
          <LockupTile tile={LINE_ONE_TILE} rect={rect} />
        </Animated.View>

        <Animated.View style={lineTwoStyle}>
          <LockupTile tile={LINE_TWO_TILE} rect={rect} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * A round of soft light with no edge of its own.
 *
 * Drawn rather than blurred: a radial gradient that reaches zero at its
 * rim leaves nothing to give away where the shape ends, which is what
 * lets it pass over the artwork without looking like a pasted highlight.
 */
function Glow({ size, inner, mid }: { size: number; inner: number; mid: number }) {
  // Gradient ids must be unique per instance, and useId's colons are not
  // valid inside url(#…) on every renderer.
  const id = `glow${useId().replace(/[^A-Za-z0-9]/g, '')}`;

  return (
    <Svg width={size} height={size} accessible={false}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={launch.light} stopOpacity={inner} />
          <Stop offset="0.5" stopColor={launch.light} stopOpacity={mid} />
          <Stop offset="1" stopColor={launch.light} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}
