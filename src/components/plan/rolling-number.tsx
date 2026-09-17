/**
 * A large number that rolls up like a slot machine and settles.
 *
 * Each digit is a window over a vertical strip of 0–9 that spins past
 * and stops on the digit it was given; the leftmost settles first and
 * the rest follow, so the number resolves from the left the way the
 * reference does. While a digit is moving, two faint copies of its strip
 * sit just above and below it — the smear a fast-moving column leaves —
 * and they fade as it stops. That is the whole of the "blur": no filter,
 * so it draws the same on both platforms.
 *
 * The number it lands on is the number it was given. Nothing here rounds,
 * pads, or invents a digit; the spin is presentation over a count that
 * was made elsewhere.
 *
 * Under Reduce Motion the digits are simply there.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { fontFamily } from '@/theme';

/** The strip: 0–9 and a second 0, so the wrap from 9 back round is seamless. */
const STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/** The first digit's spin, and how much longer each later digit runs. */
const SPIN_MS = 900;
const SPIN_STAGGER_MS = 320;
/** How long the smear takes to clear as a digit settles. */
const SETTLE_MS = 380;
/** Whole turns the first digit makes before landing; later digits make one more each. */
const BASE_TURNS = 2;
/** How far the smear copies sit from the strip, as a share of a digit's height. */
const SMEAR = 0.45;
const SMEAR_OPACITY = 0.3;

function Digit({
  digit,
  index,
  fontSize,
  height,
  width,
  color,
  reduceMotion,
}: {
  digit: number;
  index: number;
  fontSize: number;
  height: number;
  width: number;
  color: string;
  reduceMotion: boolean;
}) {
  const pos = useSharedValue(reduceMotion ? digit : 0);
  const smear = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      pos.set(digit);
      smear.set(0);
      return;
    }
    const target = (BASE_TURNS + index) * 10 + digit;
    const duration = SPIN_MS + index * SPIN_STAGGER_MS;
    pos.set(0);
    pos.set(withTiming(target, { duration, easing: Easing.out(Easing.cubic) }));
    smear.set(1);
    smear.set(withDelay(Math.max(0, duration - SETTLE_MS), withTiming(0, { duration: SETTLE_MS })));
  }, [digit, index, pos, smear, reduceMotion]);

  const strip = useAnimatedStyle(() => {
    const p = pos.get();
    const wrapped = ((p % 10) + 10) % 10;
    return { transform: [{ translateY: -wrapped * height }] };
  });
  const above = useAnimatedStyle(() => {
    const p = pos.get();
    const wrapped = ((p % 10) + 10) % 10;
    return {
      opacity: smear.get() * SMEAR_OPACITY,
      transform: [{ translateY: -wrapped * height - height * SMEAR }],
    };
  });
  const below = useAnimatedStyle(() => {
    const p = pos.get();
    const wrapped = ((p % 10) + 10) % 10;
    return {
      opacity: smear.get() * SMEAR_OPACITY,
      transform: [{ translateY: -wrapped * height + height * SMEAR }],
    };
  });

  const glyph = {
    fontSize,
    lineHeight: height,
    height,
    width,
    textAlign: 'center' as const,
    fontFamily: fontFamily.display,
    fontVariant: ['tabular-nums' as const],
    letterSpacing: -fontSize * 0.03,
    color,
  };

  const column = (style: typeof strip) => (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, style]}>
      {STRIP.map((n, i) => (
        <Text key={i} variant="display" style={glyph}>
          {n}
        </Text>
      ))}
    </Animated.View>
  );

  return (
    <View style={{ width, height, overflow: 'hidden' }} accessible={false}>
      {reduceMotion ? null : column(above)}
      {reduceMotion ? null : column(below)}
      {column(strip)}
    </View>
  );
}

export function RollingNumber({
  value,
  color,
  reduceMotion,
  fontSize = 96,
}: {
  value: number;
  color: string;
  reduceMotion: boolean;
  fontSize?: number;
}) {
  const digits = String(Math.max(0, Math.floor(value)))
    .split('')
    .map((d) => Number(d));
  const height = Math.round(fontSize * 1.14);
  const width = Math.round(fontSize * 0.6);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={String(value)}
      style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
      {digits.map((digit, i) => (
        <Digit
          key={`${digits.length}-${i}`}
          digit={digit}
          index={i}
          fontSize={fontSize}
          height={height}
          width={width}
          color={color}
          reduceMotion={reduceMotion}
        />
      ))}
    </View>
  );
}
