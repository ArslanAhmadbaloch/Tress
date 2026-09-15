/**
 * The passcode interface.
 *
 * One scene serves all three jobs — unlocking, setting a code, confirming
 * it — because they are the same act and should not look like three
 * different screens. The app's own mark sits at the top, the dots fill as
 * you type, and the keypad is the app's glass: neutral beads that light up
 * green under a finger, the same optics as the metric orbs.
 *
 * The system keyboard is deliberately not used. A numeric keyboard for six
 * digits puts a grey slab over half the screen, moves the dots as it opens,
 * and hands the most-repeated interaction in the app to a control we cannot
 * make feel like the rest of it.
 */

import { Image } from 'expo-image';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { GlassOrb } from './ui/glass-orb';
import { Icon } from './ui/icon';
import { PressableScale } from './ui/pressable-scale';
import { Text } from './ui/text';
import { fontFamily, motion, useTheme } from '@/theme';

const MARK = require('@/assets/images/app-mark.jpg');

const MARK_SIZE = 76;
const DOT = 13;
const KEY = 74;

/* -------------------------------- dots -------------------------------- */

/**
 * The dots.
 *
 * Solid accent rather than the glass bead used elsewhere: this is the only
 * readout of how far through the code you are, and a pale bead of tinted
 * glass on a pale ground could not be counted at a glance. On a wrong code
 * the row shakes — the one piece of motion here that is information rather
 * than decoration, so Reduce Motion gets the red outline instead.
 */
export function PasscodeDots({
  filled,
  total,
  error,
}: {
  filled: number;
  total: number;
  error: boolean;
}) {
  const { colors, spacing } = useTheme();
  const reduceMotion = useReducedMotion();
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!error) return;
    if (reduceMotion) return;
    shake.set(
      withSequence(
        withTiming(-9, { duration: 55 }),
        withTiming(9, { duration: 55 }),
        withTiming(-6, { duration: 55 }),
        withTiming(0, { duration: 55 }),
      ),
    );
  }, [error, reduceMotion, shake]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));

  return (
    <Animated.View
      accessible
      accessibilityLabel={`${filled} of ${total} digits entered`}
      style={[{ flexDirection: 'row', gap: spacing.lg }, style]}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: DOT,
            height: DOT,
            borderRadius: DOT / 2,
            backgroundColor:
              i < filled ? (error ? colors.danger : colors.accent) : 'transparent',
            borderWidth: i < filled ? 0 : 1.5,
            borderColor: error ? colors.danger : colors.textTertiary,
          }}
        />
      ))}
    </Animated.View>
  );
}

/* ------------------------------- keypad ------------------------------- */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function Key({
  label,
  onPress,
  accessibilityLabel,
  children,
  plain,
}: {
  label?: string;
  onPress: () => void;
  accessibilityLabel: string;
  children?: ReactNode;
  /** No glass bead — used by the two controls flanking the zero. */
  plain?: boolean;
}) {
  const { colors } = useTheme();
  const pressed = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const glow = useAnimatedStyle(() => ({ opacity: pressed.get() }));

  const press = (down: boolean) => {
    const to = down ? 1 : 0;
    pressed.set(reduceMotion ? to : withSpring(to, motion.spring.snappy));
  };

  return (
    <PressableScale
      onPress={onPress}
      onPressIn={() => press(true)}
      onPressOut={() => press(false)}
      scaleTo={0.9}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        width: KEY,
        height: KEY,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {!plain ? (
        <>
          {/* The resting bead is uncoloured glass; the green only arrives
              under a finger, so the pad reads as a surface rather than as
              twelve lit buttons. */}
          <View style={StyleSheet.absoluteFill}>
            <GlassOrb size={KEY} ring={false} tone="neutral" />
          </View>
          <Animated.View style={[StyleSheet.absoluteFill, glow]}>
            <GlassOrb size={KEY} ring={false} tone="green" />
          </Animated.View>
        </>
      ) : null}

      {label ? (
        <Text variant="title2" style={{ color: colors.text, fontFamily: fontFamily.displayMedium }}>
          {label}
        </Text>
      ) : (
        children
      )}
    </PressableScale>
  );
}

export function Keypad({
  onDigit,
  onDelete,
  onBiometric,
  biometricLabel,
}: {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  /** Shown in the bottom-left slot when the device can offer it. */
  onBiometric?: () => void;
  biometricLabel?: string;
}) {
  const { colors, spacing } = useTheme();

  return (
    <View style={{ gap: spacing.md }}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={{ flexDirection: 'row', gap: spacing.xl }}>
          {KEYS.slice(row * 3, row * 3 + 3).map((key) => (
            <Key
              key={key}
              label={key}
              accessibilityLabel={key}
              onPress={() => onDigit(key)}
            />
          ))}
        </View>
      ))}

      <View style={{ flexDirection: 'row', gap: spacing.xl }}>
        {onBiometric && biometricLabel ? (
          <Key
            plain
            accessibilityLabel={`Unlock with ${biometricLabel}`}
            onPress={onBiometric}>
            <Icon
              name={biometricLabel === 'Touch ID' ? 'phone' : 'profile'}
              size={28}
              color={colors.accent}
            />
          </Key>
        ) : (
          <View style={{ width: KEY, height: KEY }} />
        )}

        <Key label="0" accessibilityLabel="0" onPress={() => onDigit('0')} />

        <Key plain accessibilityLabel="Delete" onPress={onDelete}>
          <Icon name="chevronLeft" size={22} color={colors.textSecondary} />
        </Key>
      </View>
    </View>
  );
}

/* -------------------------------- scene ------------------------------- */

/**
 * The whole passcode screen, minus the background it sits on.
 *
 * Callers supply that: the lock uses the app's ground so it follows the
 * theme, and the setup flow sits on a sheet.
 */
export function PasscodeScene({
  title,
  subtitle,
  filled,
  total,
  error,
  message,
  onDigit,
  onDelete,
  onBiometric,
  biometricLabel,
  footer,
}: {
  title: string;
  subtitle?: string;
  filled: number;
  total: number;
  error: boolean;
  /** Replaces the subtitle while something has gone wrong. */
  message?: string;
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onBiometric?: () => void;
  biometricLabel?: string;
  footer?: ReactNode;
}) {
  const { spacing, radius, shadow } = useTheme();

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', paddingHorizontal: spacing.xl }}>
        <Image
          source={MARK}
          style={[
            {
              width: MARK_SIZE,
              height: MARK_SIZE,
              borderRadius: radius.xl,
            },
            shadow.lifted,
          ]}
          contentFit="cover"
          transition={0}
          accessible={false}
        />

        <Text variant="title3" center style={{ marginTop: spacing.xl }}>
          {title}
        </Text>

        <Text
          variant="footnote"
          color={error ? 'danger' : 'textSecondary'}
          center
          style={{ marginTop: spacing.xs, minHeight: 18 }}>
          {message ?? subtitle ?? ''}
        </Text>

        <View style={{ marginTop: spacing.xxl }}>
          <PasscodeDots filled={filled} total={total} error={error} />
        </View>
      </View>

      <View style={{ marginTop: spacing.huge }}>
        <Keypad
          onDigit={onDigit}
          onDelete={onDelete}
          onBiometric={onBiometric}
          biometricLabel={biometricLabel}
        />
      </View>

      {footer ? <View style={{ marginTop: spacing.xxl }}>{footer}</View> : null}
    </View>
  );
}
