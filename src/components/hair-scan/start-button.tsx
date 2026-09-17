/**
 * Start — the control that switches the machine on.
 *
 * A white disc on a soft shadow, inside two rings of translucent glass.
 * While the scanner is ready the rings breathe, slowly, so the button
 * reads as a live control waiting for a hand rather than a label sitting
 * on a photograph. Pressing it does not swap a word: the rings expand
 * and dissolve outward toward the scan ring while the disc sinks away,
 * and only when that has finished does the screen hear `onActivate`.
 * Something has been switched on, and the eye has watched it happen.
 *
 * The disc stays solid white the whole time it is on screen, ready or
 * not — a machine that cannot start yet is still a machine, not a greyed
 * label — and only the rings go quiet while the head is being found.
 *
 * One press is one activation. The button latches on the press, so a
 * second tap inside the animation does nothing, and it unlatches — disc
 * and rings returning — only when `ready` goes false and comes back, which
 * is the screen saying the scan did not begin (an error retried, a scan
 * abandoned before it started). No key or remount is needed.
 *
 * The disc gives no haptic of its own: the scanner's haptic table owns the
 * start tap, and the screen plays `start` from `onPress`, so the person
 * feels exactly one tap. Under Reduce Motion the breathing stops, the
 * press is a tap, and the screen hears `onActivate` at once.
 */

import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { darkColors, motion, radius, shadow } from '@/theme';

/** The disc, and the two rings around it, as diameters. */
export const START_BUTTON_SIZE = 96;
const RING_INNER = 156;
const RING_OUTER = 216;

/** One breath in, one breath out. */
const BREATH_MS = 2200;

/** The activation: rings thrown outward and dissolved, disc sinking. */
export const START_BUTTON_ACTIVATE_MS = 520;

/** How far the rings fly, as a multiple of their size. */
const ACTIVATE_SCALE = 2.4;

export type StartButtonProps = {
  /** The word on the disc, from the scan copy. */
  label: string;
  /**
   * Called once the activation animation has run — not on the press. The
   * screen moves to `scanning` from here, so the ring never lights before
   * the button has finished handing over to it. Fires once per press.
   */
  onActivate: () => void;
  /**
   * Called on the press itself, before the animation. This is where the
   * screen plays the haptic table's `start`; the disc plays nothing.
   */
  onPress?: () => void;
  /**
   * True while the scanner is ready for a press. When false the button is
   * shown but inert and does not breathe: a machine that cannot start yet
   * should not look like it is waiting to. A change from false back to
   * true after a press re-arms the button and brings the disc back.
   */
  ready: boolean;
  /** Accessibility hint, from the scan copy. */
  hint?: string;
  style?: StyleProp<ViewStyle>;
};

export function StartButton({ label, onActivate, onPress, ready, hint, style }: StartButtonProps) {
  const reduceMotion = useReducedMotion();

  /*
   * The latch. Set on the press; cleared when `ready` comes back true
   * after having been false. Tracked as state so the disc's hit-testing
   * follows it, and derived during render so no effect sets state.
   */
  const [latched, setLatched] = useState(false);
  const [readyWas, setReadyWas] = useState(ready);
  if (ready !== readyWas) {
    setReadyWas(ready);
    if (ready) setLatched(false);
  }
  const armed = ready && !latched;

  /* Breathing, on the rings only: the disc stays still so its label does. */
  const breath = useSharedValue(0);
  useEffect(() => {
    if (!armed || reduceMotion) {
      breath.set(withTiming(0, { duration: motion.duration.slow }));
      return;
    }
    breath.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: BREATH_MS / 2, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: BREATH_MS / 2, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
  }, [armed, reduceMotion, breath]);

  /*
   * Activation, 0 → 1 once per press. When the screen re-arms the button
   * the disc and rings come back; a press whose animation was still
   * running when that happened is cancelled and never reaches the screen.
   */
  const activation = useSharedValue(0);
  useEffect(() => {
    if (!ready) return;
    activation.set(reduceMotion ? 0 : withTiming(0, { duration: motion.duration.base }));
  }, [ready, reduceMotion, activation]);

  const handlePress = useCallback(() => {
    if (!armed) return;
    setLatched(true);
    onPress?.();
    if (reduceMotion) {
      activation.set(1);
      onActivate();
      return;
    }
    activation.set(
      withTiming(
        1,
        { duration: START_BUTTON_ACTIVATE_MS, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(onActivate)();
        },
      ),
    );
  }, [armed, activation, onActivate, onPress, reduceMotion]);

  const outerRing = useAnimatedStyle(() => {
    const t = activation.get();
    const breathe = 1 + breath.get() * 0.05;
    return {
      opacity: (1 - t) * (0.18 + breath.get() * 0.08),
      transform: [{ scale: breathe + t * (ACTIVATE_SCALE - 1) }],
    };
  });

  const innerRing = useAnimatedStyle(() => {
    const t = activation.get();
    const breathe = 1 + breath.get() * 0.03;
    return {
      opacity: (1 - t) * (0.26 + breath.get() * 0.1),
      transform: [{ scale: breathe + t * (ACTIVATE_SCALE * 0.8 - 1) }],
    };
  });

  const disc = useAnimatedStyle(() => {
    const t = activation.get();
    return {
      opacity: 1 - t,
      transform: [{ scale: 1 - t * 0.35 }],
    };
  });

  return (
    <View
      pointerEvents="box-none"
      style={[
        { width: RING_OUTER, height: RING_OUTER, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius.pill, backgroundColor: darkColors.textOnPhoto },
          outerRing,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: RING_INNER,
            height: RING_INNER,
            borderRadius: radius.pill,
            backgroundColor: darkColors.textOnPhoto,
          },
          innerRing,
        ]}
      />
      {/*
        Hit-testing is switched off rather than the control disabled, so
        the disc keeps its full white while the head is being found and
        never becomes an invisible target after it has sunk away.
      */}
      <Animated.View pointerEvents={armed ? 'auto' : 'none'} style={disc}>
        <PressableScale
          onPress={handlePress}
          scaleTo={0.94}
          haptic="none"
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={hint}
          accessibilityState={{ disabled: !armed }}
          style={[
            {
              width: START_BUTTON_SIZE,
              height: START_BUTTON_SIZE,
              borderRadius: radius.pill,
              backgroundColor: darkColors.textOnPhoto,
              alignItems: 'center',
              justifyContent: 'center',
            },
            shadow.lifted,
          ]}>
          <Text variant="title3" style={{ color: darkColors.background }}>
            {label}
          </Text>
        </PressableScale>
      </Animated.View>
    </View>
  );
}
