/**
 * The status pill — the instrument's one-word readout of itself.
 *
 * It sits at the top of the video and says one thing at a time, and it
 * has got quieter. The instruction is the step header's job now, and the
 * corrections are the plate's; what is left for the pill is the thing
 * neither of them says — whether the machine has a head to follow and
 * whether it is taking frames. Four readouts: looking for you, following
 * you, scanning, nearly done.
 *
 * The words come from the scan copy by way of the screen. This file owns
 * the tone and the glyph each readout wears, and how the change looks,
 * and it looks like one object changing colour rather than two objects
 * swapping.
 *
 * While frames are being taken, the glyph is the step's own: the head
 * straight, turning right, turning left, or lowered. That is the only
 * place the pill knows anything about the choreography, and it is there
 * because the four steps share one word — the machine is scanning
 * throughout, and which way the head is going is the arrow's news, not
 * the pill's.
 *
 * Three tones, no red, and nothing about distance. Green is for a
 * machine that has what it needs, a warm amber is reserved for the light
 * readout alone, and neutral is the quiet grey of a readout with nothing
 * to say yet. Nothing here can ever ask a person to move closer or
 * further away: those words are gone from the scanner entirely, and no
 * phase below stands in for them.
 *
 * The first arrival at green carries one calm confirmation — a small
 * swell, no bounce, nothing to celebrate — because "I have you" is the
 * one moment in the scan a person genuinely wants acknowledged.
 */

import { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  interpolateColor,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { ScanStatus, ScanStep } from '@/features/hair-scan/types';
import { darkColors, iconSize, motion, radius, spacing } from '@/theme';

export type StatusTone = 'good' | 'adjust' | 'neutral';

/**
 * The four readouts of the scan, in the order a person meets them.
 *
 * - `searching` — no head is being followed yet.
 * - `tracking` — a head is followed and Start may be pressed.
 * - `capturing` — the motion is running and frames are being taken.
 * - `almost` — enough has been captured; the last frames are landing.
 *
 * There is no phase for "too far", "too close" or "hold still", because
 * the scan no longer asks for any of them, and no phase per step: the
 * header says which step it is, in words, in large type.
 */
export type ScanPhase = 'searching' | 'tracking' | 'capturing' | 'almost';

/**
 * What each phase wears. Only the first is neutral: from the moment a
 * head is followed the instrument has what it needs, and a readout that
 * kept flicking back to grey while a person turned would read as the
 * scan losing them.
 */
export const SCAN_PHASE_TONE: Record<ScanPhase, StatusTone> = {
  searching: 'neutral',
  tracking: 'good',
  capturing: 'good',
  almost: 'good',
};

export function scanPhaseTone(phase: ScanPhase): StatusTone {
  return SCAN_PHASE_TONE[phase];
}

/**
 * The glyph each step wears while frames are being taken.
 *
 * They are the movement itself — a target for the head held straight, a
 * chevron each way for the turns, a chevron down for the crown — so the
 * pill agrees with the arrow rather than repeating it. Nothing here is a
 * warning sign: no triangle, no exclamation, because none of the four is
 * a problem.
 */
export const SCAN_STEP_ICON: Record<ScanStep, IconName> = {
  front: 'target',
  right: 'chevronRight',
  left: 'chevronLeft',
  down: 'chevronDown',
};

/** The glyph for the phases that are not a step. */
export const SCAN_PHASE_ICON: Record<ScanPhase, IconName> = {
  searching: 'search',
  tracking: 'check',
  capturing: 'camera',
  almost: 'sparkle',
};

/**
 * The glyph for a readout. While capturing, the step's own; otherwise the
 * phase's. The step is optional: a caller with none in hand gets the
 * general glyph, which is what the pill wore before the steps existed,
 * so a screen can adopt the step glyphs when it has a step to give and
 * not before.
 */
export function scanPhaseIcon(phase: ScanPhase, step: ScanStep | null = null): IconName {
  if (phase === 'capturing' && step) return SCAN_STEP_ICON[step];
  return SCAN_PHASE_ICON[phase];
}

/**
 * Which readout the machine's own state comes to.
 *
 * One status in, one readout out. The step no longer changes the answer:
 * the four steps are one continuous motion and the machine is doing the
 * same thing throughout it, which is exactly what the pill is for.
 */
export function scanPhaseFor(status: ScanStatus): ScanPhase {
  if (status === 'completing' || status === 'complete') return 'almost';
  if (status === 'capturing') return 'capturing';
  if (status === 'ready') return 'tracking';
  return 'searching';
}

export type StatusPillProps = {
  tone: StatusTone;
  /** One short label from the scan copy, e.g. the pill's tracking line. */
  label: string;
  /** A glyph before the label. The sun for light; none for a neutral readout. */
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
};

/**
 * The layout transition the pill's width follows when its label changes.
 * Anything wrapping the pill — the top bar's glass capsule — uses the same
 * one, so the two surfaces move as one object rather than the glass
 * snapping to the new width while the colour eases into it.
 */
export function statusPillLayout() {
  return LinearTransition.springify().damping(24).stiffness(220);
}

/** Where each tone sits on the colour ramp: neutral, adjust, good. */
const TONE_POSITION: Record<StatusTone, number> = { neutral: 0, adjust: 1, good: 2 };

/** The confirmation swell: how far, and how long the rise takes. */
const CONFIRM_SCALE = 1.05;
const CONFIRM_MS = 160;

export function StatusPill({ tone, label, icon, style }: StatusPillProps) {
  const reduceMotion = useReducedMotion();

  /*
   * One number moves along the ramp, so a change from amber to green
   * passes through neither grey nor a hard swap — the pill visibly
   * becomes the other colour. Reduced motion shortens this to a cut;
   * a colour change needs no motion to be understood.
   */
  const position = useDerivedValue(() =>
    reduceMotion
      ? TONE_POSITION[tone]
      : withTiming(TONE_POSITION[tone], { duration: motion.duration.slow }),
  );

  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      position.get(),
      [0, 1, 2],
      [darkColors.fill, darkColors.warning, darkColors.success],
    ),
  }));

  /*
   * The confirmation. It runs when the readout arrives at green from
   * somewhere else, never on the first render — a pill that was already
   * green when the screen mounted has confirmed nothing.
   */
  const swell = useSharedValue(1);
  const toneWas = useRef(tone);
  useEffect(() => {
    const arrived = tone === 'good' && toneWas.current !== 'good';
    toneWas.current = tone;
    if (!arrived || reduceMotion) return;
    swell.set(
      withSequence(
        withTiming(CONFIRM_SCALE, { duration: CONFIRM_MS }),
        withSpring(1, motion.spring.gentle),
      ),
    );
  }, [tone, reduceMotion, swell]);

  const confirm = useAnimatedStyle(() => ({ transform: [{ scale: swell.get() }] }));

  return (
    <Animated.View
      layout={statusPillLayout()}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      style={[
        {
          borderRadius: radius.pill,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          minHeight: 36,
          alignItems: 'center',
          justifyContent: 'center',
        },
        fill,
        confirm,
        style,
      ]}>
      {/*
        The label is keyed on its text: a new cue fades in as the old one
        fades out, and the pill's width follows through the layout
        transition above. Both stop under Reduce Motion.
      */}
      <Animated.View
        key={`${icon ?? 'none'}:${label}`}
        entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.base)}
        exiting={reduceMotion ? undefined : FadeOut.duration(motion.duration.fast)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs + spacing.xxs }}>
        {icon ? (
          <View>
            <Icon name={icon} size={iconSize.sm} color={darkColors.textOnPhoto} />
          </View>
        ) : null}
        <Text variant="subhead" style={{ color: darkColors.textOnPhoto }}>
          {label}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
