/**
 * The launch animation.
 *
 * The brand lockup was delivered as two renders: an empty plate and the
 * finished composition. `scripts/splash-tiles.swift` cuts the mark, the
 * wordmark and the tagline out of the finished render and feathers them,
 * so each piece can be laid back over the plate at the coordinates it
 * came from and brought up on its own beat. Nothing is re-typeset: what
 * animates is the designer's artwork, pixel for pixel.
 *
 * Everything is positioned in the plate's own coordinate space and then
 * mapped onto whatever rectangle the plate covers on this screen, so the
 * lockup stays registered on any aspect ratio.
 *
 * The sequence is light arriving on a still surface rather than motion
 * for its own sake: the plate settles out of a slight push-in, warm light
 * gathers over the mark and clears as the mark resolves, a soft sheen
 * crosses it, and the words follow. With Reduce Motion on it is a plain
 * cross-fade, held just long enough to read.
 */

import { Image } from 'expo-image';
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

const PLATE = require('@/assets/images/splash-plate.jpg');
const EMBLEM = require('@/assets/images/splash-emblem.png');
const WORDMARK = require('@/assets/images/splash-wordmark.png');
const TAGLINE = require('@/assets/images/splash-tagline.png');

/** Held until these have decoded, so the first frame is the finished plate. */
export const SPLASH_ASSETS = [PLATE, EMBLEM, WORDMARK, TAGLINE];

/** The design's own pixel dimensions; every position below is a fraction of it. */
const PLATE_W = 853;
const PLATE_H = 1844;

type Tile = {
  source: number;
  /** Top-left corner and width, as fractions of the plate. */
  left: number;
  top: number;
  width: number;
  /** The tile's own pixel aspect, so it is never stretched. */
  aspect: number;
};

/** Printed by scripts/splash-tiles.swift when it cuts the artwork. */
const EMBLEM_TILE: Tile = {
  source: EMBLEM,
  left: 0.26729,
  top: 0.28254,
  width: 0.45252,
  aspect: 386 / 469,
};
const WORDMARK_TILE: Tile = {
  source: WORDMARK,
  left: 0.19343,
  top: 0.48861,
  width: 0.61782,
  aspect: 527 / 236,
};
const TAGLINE_TILE: Tile = {
  source: TAGLINE,
  left: 0.22157,
  top: 0.57809,
  width: 0.56038,
  aspect: 478 / 199,
};

/** Centre and radius of the mark's disc, for the light that plays on it. */
const DISC = { x: 0.498, y: 0.42, r: 0.182 };

/* ------------------------------- timing ------------------------------- */

const PLATE_FADE = 420;
const SETTLE = 2200;
const EMBLEM_IN = { delay: 260, duration: 620 };
const BLOOM = { delay: 200, rise: 420, fall: 900 };
const SHEEN = { delay: 560, duration: 1000 };
const WORDMARK_IN = { delay: 820, duration: 520 };
const TAGLINE_IN = { delay: 1040, duration: 520 };
/** How long the finished lockup is held before it clears. */
const HOLD_UNTIL = 2080;
const EXIT = 420;

/** The same beats, collapsed for Reduce Motion. */
const CALM = { fade: 280, hold: 620, exit: 280 };

const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.quad);

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  // The rectangle the plate covers on this screen. Cover rather than fit:
  // the lockup is centred artwork on a much larger field, so cropping the
  // field costs nothing and letterboxing would break the illusion.
  const scale = Math.max(width / PLATE_W, height / PLATE_H);
  const rect = {
    width: PLATE_W * scale,
    height: PLATE_H * scale,
    left: (width - PLATE_W * scale) / 2,
    top: (height - PLATE_H * scale) / 2,
  };

  const plate = useSharedValue(0);
  const settle = useSharedValue(0);
  const emblem = useSharedValue(0);
  const bloom = useSharedValue(0);
  const sheen = useSharedValue(0);
  const wordmark = useSharedValue(0);
  const tagline = useSharedValue(0);
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
      wordmark.set(withTiming(1, { duration: CALM.fade }));
      tagline.set(withTiming(1, { duration: CALM.fade }));
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
    wordmark.set(
      withDelay(
        WORDMARK_IN.delay,
        withTiming(1, { duration: WORDMARK_IN.duration, easing: easeOut }),
      ),
    );
    tagline.set(
      withDelay(
        TAGLINE_IN.delay,
        withTiming(1, { duration: TAGLINE_IN.duration, easing: easeOut }),
      ),
    );
    finish();
  }, [reduceMotion, onFinish, plate, settle, emblem, bloom, sheen, wordmark, tagline, exit]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: exit.get() }));

  // One transform for the whole composition, so the plate and the artwork
  // laid over it can never drift apart.
  const stageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.045 * (1 - settle.get()) }],
  }));

  const plateStyle = useAnimatedStyle(() => ({ opacity: plate.get() }));
  const emblemStyle = useAnimatedStyle(() => ({ opacity: emblem.get() }));
  const wordmarkStyle = useAnimatedStyle(() => ({ opacity: wordmark.get() }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: tagline.get() }));

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

  const place = (tile: Tile) => {
    const w = tile.width * rect.width;
    return {
      position: 'absolute' as const,
      left: rect.left + tile.left * rect.width,
      top: rect.top + tile.top * rect.height,
      width: w,
      height: w / tile.aspect,
    };
  };

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
          <Image
            source={PLATE}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="center"
            transition={0}
            cachePolicy="memory-disk"
            accessible={false}
          />
        </Animated.View>

        <Animated.View style={[place(EMBLEM_TILE), emblemStyle]}>
          <Image
            source={EMBLEM}
            style={StyleSheet.absoluteFill}
            contentFit="fill"
            transition={0}
            cachePolicy="memory-disk"
            accessible={false}
          />
        </Animated.View>

        {/* Light gathering over the mark, then clearing as it resolves. */}
        <Animated.View style={[centred(bloomSize), bloomStyle]}>
          <Glow size={bloomSize} inner={0.9} mid={0.4} />
        </Animated.View>

        {/* The sheen that crosses it once the mark is there. */}
        <Animated.View style={[centred(sheenSize), sheenStyle]}>
          <Glow size={sheenSize} inner={0.95} mid={0.3} />
        </Animated.View>

        <Animated.View style={[place(WORDMARK_TILE), wordmarkStyle]}>
          <Image
            source={WORDMARK}
            style={StyleSheet.absoluteFill}
            contentFit="fill"
            transition={0}
            cachePolicy="memory-disk"
            accessible={false}
          />
        </Animated.View>

        <Animated.View style={[place(TAGLINE_TILE), taglineStyle]}>
          <Image
            source={TAGLINE}
            style={StyleSheet.absoluteFill}
            contentFit="fill"
            transition={0}
            cachePolicy="memory-disk"
            accessible={false}
          />
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
