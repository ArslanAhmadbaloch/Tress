/**
 * Start — the control that switches the machine on.
 *
 * A white disc on a soft shadow, inside two rings of translucent glass.
 * While the scanner is live the rings beat like a heart: a strong
 * expansion, a short gap, a softer second one, then a rest of about a
 * second before it comes round again. The disc itself never moves, so
 * the word on it stays readable through every beat — the pulse belongs
 * to the glass around it, the way a pulse belongs under a wrist rather
 * than on the face of the watch.
 *
 * Pressing it does not swap a word: the rings expand and dissolve
 * outward toward the scan ring while the disc sinks away, and only when
 * that has finished does the screen hear `onActivate`. Something has
 * been switched on, and the eye has watched it happen.
 *
 * The button never gates itself. It is live exactly when the screen
 * says it is, and the screen's rule is now the simplest one there is: a
 * head is being followed. Build 17 shipped a button that decided for
 * itself whether the head was square enough, near enough, still enough
 * and lit enough, and on a real face those four flickered and Start
 * could not be pressed at all. There is no threshold left in this file:
 * one prop, one meaning.
 *
 * The one thing the file does add is a grace: `ready` going false does
 * not take the disc's hit-testing with it for `START_READY_GRACE_MS`.
 * A detector that drops a single frame flips `ready` false and true
 * again within a frame or two, and without the grace the disc — which
 * stays fully white throughout, deliberately — would silently eat a tap
 * that landed in that gap. That is verbatim the build-17 complaint, and
 * it is the one way a button with no thresholds of its own could still
 * swallow a press. The grace only ever keeps the button live: it can
 * never make a live button inert, and it holds nothing open for longer
 * than a person's finger is already travelling.
 *
 * One press is one activation, and an armed press always arrives. The
 * button latches on the press, so a second tap inside the animation does
 * nothing, and the hand-over is not cancelled by anything that happens
 * during those 520 ms. Only after the screen has heard `onActivate` does
 * a `ready` that goes false and comes back re-arm the button — disc and
 * rings returning — which is the screen saying the scan did not begin
 * (an error retried, a scan abandoned before it started).
 *
 * The disc gives no haptic of its own: the scanner's haptic table owns the
 * start tap, and the screen plays `start` from `onPress`, so the person
 * feels exactly one tap. Under Reduce Motion the heart is still, the
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
  type EasingFunction,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { darkColors, motion, radius, shadow } from '@/theme';

/** The disc, and the two rings around it, as diameters. */
export const START_BUTTON_SIZE = 96;
const RING_INNER = 156;
const RING_OUTER = 216;

/**
 * One beat of the heart, as the six spans it is made of.
 *
 * `to` is where the beat value goes during the span, 0 at rest and 1 at
 * the top of the strong beat. Read in order: the systolic kick and its
 * fall, the short gap that separates the two sounds, the softer second
 * beat and its longer fall, then the rest before the next one. The rest
 * is the span that makes it read as a heartbeat rather than as
 * breathing — without it the two beats are just a wobble.
 */
export type HeartbeatSpan = {
  to: number;
  ms: number;
  /** How the value travels: out of a kick, into a fall, or held flat. */
  shape: 'kick' | 'fall' | 'hold';
};

export const HEARTBEAT: readonly HeartbeatSpan[] = [
  { to: 1, ms: 140, shape: 'kick' },
  { to: 0, ms: 200, shape: 'fall' },
  { to: 0, ms: 90, shape: 'hold' },
  { to: 0.52, ms: 120, shape: 'kick' },
  { to: 0, ms: 240, shape: 'fall' },
  { to: 0, ms: 960, shape: 'hold' },
];

/** How long one whole beat takes, rest included. */
export const HEARTBEAT_PERIOD_MS = HEARTBEAT.reduce((total, span) => total + span.ms, 0);

/** How far the rings swell at the top of the strong beat. */
const OUTER_SWELL = 0.09;
const INNER_SWELL = 0.055;

/** Ring opacity at rest, and how much of it the beat adds. */
const OUTER_REST_OPACITY = 0.16;
const OUTER_BEAT_OPACITY = 0.14;
const INNER_REST_OPACITY = 0.24;
const INNER_BEAT_OPACITY = 0.18;

/**
 * How long the disc stays pressable after the screen says `ready` is
 * false. Long enough to cover a detector dropout and the travel of a
 * finger already on its way down; short enough that a scan genuinely
 * abandoned leaves no live target behind.
 */
export const START_READY_GRACE_MS = 900;

/** The activation: rings thrown outward and dissolved, disc sinking. */
export const START_BUTTON_ACTIVATE_MS = 520;

/** How far the rings fly, as a multiple of their size. */
const ACTIVATE_SCALE = 2.4;

function easingFor(shape: HeartbeatSpan['shape']): EasingFunction {
  if (shape === 'kick') return Easing.out(Easing.quad);
  if (shape === 'fall') return Easing.in(Easing.quad);
  return Easing.linear;
}

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
   * True while the scanner is live. The button holds no opinion about
   * what "live" means — it does not measure the head, the light or the
   * distance, and it adds no condition of its own on top of this prop.
   * When false the button is shown but inert and its heart is still —
   * after `START_READY_GRACE_MS`, so one dropped detector frame neither
   * stops the beat nor swallows a press. A change from false back to
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
   * The latch. `pressed` is set on the press and `delivered` once the
   * screen has heard `onActivate`; both are cleared together when `live`
   * comes back true after having been false — but only for a delivered
   * press, so a readiness flicker inside the activation can never cancel
   * it. Tracked as state so the disc's hit-testing follows it, and derived
   * during render so no effect sets state.
   */
  const [pressed, setPressed] = useState(false);
  const [delivered, setDelivered] = useState(false);

  /*
   * The grace. `live` is `ready` with a floor under it: the moment the
   * screen says ready the floor goes up during that same render, and it
   * comes down only once `START_READY_GRACE_MS` has passed with the
   * screen still saying no. A detector dropout therefore never takes the
   * disc's hit-testing away underneath a finger. The grace is the only
   * thing in this file that stands between the screen's word and the
   * disc, and it can only ever keep the disc live.
   */
  const [graced, setGraced] = useState(ready);
  const [readyWas, setReadyWas] = useState(ready);
  if (ready !== readyWas) {
    setReadyWas(ready);
    if (ready) setGraced(true);
  }
  const live = ready || graced;
  useEffect(() => {
    if (ready || !graced) return;
    const timer = setTimeout(() => setGraced(false), START_READY_GRACE_MS);
    return () => clearTimeout(timer);
  }, [ready, graced]);

  const [liveWas, setLiveWas] = useState(live);
  if (live !== liveWas) {
    setLiveWas(live);
    if (live && delivered) {
      setPressed(false);
      setDelivered(false);
    }
  }
  const armed = live && !pressed;

  /*
   * The heartbeat, on the rings only: the disc stays still so its label
   * does. One repeating sequence built from the spans above, so the
   * shape of the beat is data a test can read rather than a chain of
   * calls buried in an effect.
   */
  const beat = useSharedValue(0);
  useEffect(() => {
    if (!armed || reduceMotion) {
      beat.set(withTiming(0, { duration: motion.duration.slow }));
      return;
    }
    const [first, ...rest] = HEARTBEAT.map((span) =>
      withTiming(span.to, { duration: span.ms, easing: easingFor(span.shape) }),
    );
    if (!first) return;
    beat.set(withRepeat(withSequence(first, ...rest), -1, false));
  }, [armed, reduceMotion, beat]);

  /*
   * Activation, 0 → 1 once per press. The disc and rings come back only
   * when the button is re-armed, which happens after the press has been
   * delivered — so nothing interrupts an activation in flight, and the
   * screen hears every press it armed.
   */
  const activation = useSharedValue(0);
  useEffect(() => {
    if (pressed) return;
    activation.set(reduceMotion ? 0 : withTiming(0, { duration: motion.duration.base }));
  }, [pressed, reduceMotion, activation]);

  const deliver = useCallback(() => {
    setDelivered(true);
    onActivate();
  }, [onActivate]);

  const handlePress = useCallback(() => {
    if (!armed) return;
    setPressed(true);
    onPress?.();
    if (reduceMotion) {
      activation.set(1);
      deliver();
      return;
    }
    activation.set(
      withTiming(1, { duration: START_BUTTON_ACTIVATE_MS, easing: Easing.out(Easing.cubic) }, () => {
        runOnJS(deliver)();
      }),
    );
  }, [armed, activation, deliver, onPress, reduceMotion]);

  const outerRing = useAnimatedStyle(() => {
    const t = activation.get();
    const pulse = beat.get();
    return {
      opacity: (1 - t) * (OUTER_REST_OPACITY + pulse * OUTER_BEAT_OPACITY),
      transform: [{ scale: 1 + pulse * OUTER_SWELL + t * (ACTIVATE_SCALE - 1) }],
    };
  });

  const innerRing = useAnimatedStyle(() => {
    const t = activation.get();
    const pulse = beat.get();
    return {
      opacity: (1 - t) * (INNER_REST_OPACITY + pulse * INNER_BEAT_OPACITY),
      transform: [{ scale: 1 + pulse * INNER_SWELL + t * (ACTIVATE_SCALE * 0.8 - 1) }],
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
