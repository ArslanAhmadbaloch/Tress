/**
 * The step header — the thin bar, the big title, one line beneath.
 *
 * The scan is one continuous movement in four steps: look straight, turn
 * right, turn left, look down. Nobody is going to read a paragraph while
 * their head is turned away from the phone, so the top of the screen is
 * built the way a KYC check builds it — a hairline bar that says how far
 * through you are, a title big enough to catch out of the corner of an
 * eye, and exactly one line under it saying what to do.
 *
 * ── The bar ──────────────────────────────────────────────────────────
 * One segment per step, and the current segment fills as the head comes
 * round. A single long bar could not show which of four steps you were
 * on without a label; four segments show it at a glance, which is the
 * whole job. The fill is a scale on the UI thread — the caller hands
 * over a shared value and the bar moves without React seeing a frame.
 * A plain number works too, for a caller that already re-renders on
 * every tick; it eases to the new value rather than jumping.
 *
 * ── The title ────────────────────────────────────────────────────────
 * It changes while the person is mid-movement, so the change has to be
 * *noticed*: the new title drops into place rather than cross-fading,
 * and the old one leaves on the quiet fade every departure uses. Set at
 * `title1`, because the reader is at arm's length with their head at an
 * angle to the screen and a 17pt line at that angle is a grey smudge.
 *
 * ── Being told ───────────────────────────────────────────────────────
 * The same change has to reach somebody who is not looking at all. A
 * live region is Android's alone — VoiceOver hears nothing from one — so
 * on iOS the header speaks the new step outright as it arrives, the way
 * the scan screen already speaks its cue line. Mid-turn is exactly when
 * a person cannot go looking for the header to read it.
 *
 * Every word here is the caller's. This file writes no sentences and it
 * assembles none either: with no counter handed to it, it draws no
 * counter, rather than inventing "2/4" out of its own props.
 */

import { useEffect } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { darkColors, motion, radius, spacing } from '@/theme';

import { STEP_BAR_HEIGHT, segmentFill } from './geometry';

export { STEP_BAR_HEIGHT, segmentFill } from './geometry';

/**
 * One segment of the bar.
 *
 * Its own component so each segment may hold a hook of its own, and so
 * the fill runs as a scale from the left edge rather than as an animated
 * width — a width animation lays out every frame, a scale does not.
 */
function Segment({
  index,
  segment,
  progress,
}: {
  index: number;
  segment: number;
  progress: SharedValue<number>;
}) {
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: segmentFill(index, progress.get(), segment) }],
  }));

  return (
    <View
      style={{
        flex: 1,
        height: STEP_BAR_HEIGHT,
        borderRadius: radius.pill,
        backgroundColor: darkColors.fill,
        overflow: 'hidden',
      }}>
      <Animated.View
        style={[
          {
            width: '100%',
            height: '100%',
            borderRadius: radius.pill,
            backgroundColor: darkColors.accent,
            transformOrigin: 'left center',
          },
          fill,
        ]}
      />
    </View>
  );
}

export type StepHeaderProps = {
  /** Which step the scan is on, from zero. */
  index: number;
  /** How many steps there are in all. */
  total: number;
  /** The big line: what this step is. The caller's words. */
  title: string;
  /** The one line under it: what to do. The caller's words. */
  instruction: string;
  /**
   * How far through the current step the head has come, 0–1. A shared
   * value moves the bar on the UI thread; a number eases to its new
   * place. Left out, the bar shows the finished steps and no more.
   */
  progress?: SharedValue<number> | number;
  /**
   * The counter line — "Step 2 of 4" — in the caller's words. Left out,
   * no counter is drawn: the bar already shows the position, and a line
   * of type is the copy's to write, never this file's to assemble.
   */
  counter?: string;
  style?: StyleProp<ViewStyle>;
};

export function StepHeader({
  index,
  total,
  title,
  instruction,
  progress,
  counter,
  style,
}: StepHeaderProps) {
  const reduceMotion = useReducedMotion();

  /*
   * The bar's own value, used when the caller passes a number or nothing
   * at all. A caller that owns a shared value drives the bar directly and
   * this one simply sits at rest.
   */
  const held = useSharedValue(typeof progress === 'number' ? progress : 0);
  useEffect(() => {
    if (typeof progress !== 'number') return;
    held.set(reduceMotion ? progress : withTiming(progress, { duration: motion.duration.fast }));
  }, [progress, held, reduceMotion]);
  const filled = typeof progress === 'object' ? progress : held;

  const segments = Array.from({ length: Math.max(1, total) }, (_, i) => i);

  /*
   * What a screen reader is given, and — on iOS — what is said aloud as
   * it changes. It is the caller's three lines joined and nothing else:
   * no number this file made up, and nothing said here that a sighted
   * person cannot read on the screen.
   */
  const spoken = counter ? `${counter}. ${title}. ${instruction}` : `${title}. ${instruction}`;
  useEffect(() => {
    // Android hears this from the live region below; announcing it here
    // as well would have TalkBack say every step twice.
    if (Platform.OS !== 'ios') return;
    AccessibilityInfo.announceForAccessibility(spoken);
  }, [spoken]);

  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityRole="header"
      accessibilityLiveRegion="polite"
      accessibilityLabel={spoken}
      style={[{ gap: spacing.lg }, style]}>
      {/*
        The counter sits above the bar, the way it does on a KYC check:
        the words say where you are, the bar shows it, and the title
        underneath says what to do about it.
      */}
      <View style={{ gap: spacing.sm }}>
        {counter ? (
          <Text variant="subhead" center style={{ color: darkColors.textSecondary }}>
            {counter}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {segments.map((segment) => (
            <Segment key={segment} index={index} segment={segment} progress={filled} />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.xxs, alignItems: 'center', minHeight: 96 }}>
        {/*
          Keyed on the title, so a change of step remounts the block and
          the new instruction drops in with it. One arrival, one exit:
          the arrival is what carries the news.
        */}
        <Animated.View
          key={title}
          entering={reduceMotion ? undefined : FadeInDown.duration(motion.duration.base)}
          exiting={reduceMotion ? undefined : FadeOut.duration(motion.duration.fast)}
          style={{ gap: spacing.xs, alignItems: 'center' }}>
          <Text variant="title1" center style={{ color: darkColors.textOnPhoto }}>
            {title}
          </Text>
          <Text variant="body" center style={{ color: darkColors.textSecondary }}>
            {instruction}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}
