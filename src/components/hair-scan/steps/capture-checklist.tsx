/**
 * The capture checklist — what the scan came away with.
 *
 * At the end of the motion the screen has to say what it actually got,
 * and it has to say it as a list of things rather than as a verdict: the
 * hairline, the temples, the crown. Each row is a record of a photograph
 * having been taken from a known direction. None of them is a finding,
 * and nothing here knows the first thing about the hair in those frames.
 *
 * The rows arrive one after another rather than all at once. Three ticks
 * appearing together is a flash; three arriving in order is the machine
 * showing its work, and it takes about as long to read as it does to
 * play. A row that lands while the list is already up ticks in place with
 * one small swell — the same acknowledgement the status pill gives, at
 * the same size, because it is the same kind of news.
 *
 * Every word is the caller's: this file is handed labels and it sets
 * them. It writes no sentences of its own, counts nothing, and scores
 * nothing.
 */

import { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { darkColors, iconSize, motion, spacing } from '@/theme';

import { rowDelay } from './geometry';

export { CHECKLIST_STAGGER_MS, rowDelay } from './geometry';

/** One thing the scan set out to photograph. */
export type CaptureChecklistItem = {
  /** Stable across renders, so a row is not remounted when another lands. */
  id: string;
  /** What to call it, in the caller's words. */
  label: string;
  /** True once a frame for it has been kept. */
  captured: boolean;
};

/** The swell a row gives when its tick lands while the list is already up. */
const TICK_SCALE = 1.12;
const TICK_MS = 140;

function ChecklistRow({ item, index }: { item: CaptureChecklistItem; index: number }) {
  const reduceMotion = useReducedMotion();
  const swell = useSharedValue(1);

  /*
   * The tick's arrival is only news if it lands after the row did. A row
   * that was already ticked when the list appeared has its entrance, and
   * a second animation on top of that is noise.
   */
  const was = useRef(item.captured);
  useEffect(() => {
    const landed = item.captured && !was.current;
    was.current = item.captured;
    if (!landed || reduceMotion) return;
    swell.set(
      withSequence(withTiming(TICK_SCALE, { duration: TICK_MS }), withSpring(1, motion.spring.gentle)),
    );
  }, [item.captured, reduceMotion, swell]);

  const tick = useAnimatedStyle(() => ({ transform: [{ scale: swell.get() }] }));

  return (
    <Animated.View
      entering={
        reduceMotion
          ? undefined
          : FadeInDown.delay(rowDelay(index)).duration(motion.duration.base)
      }
      /*
        A checkbox rather than a line of text, because `checked` is only
        read aloud for a checkbox-like trait: on role "text" VoiceOver
        drops it and every row sounds the same — "Hairline", "Temples",
        "Crown" — with no word for the one thing the list exists to say.
        The trait supplies "ticked" and "unticked" itself, in the
        reader's own language, so this file still writes nothing. It is
        not touchable and never was; a role is a description, not a
        promise of a tap.
      */
      accessible
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.captured }}
      accessibilityLabel={item.label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Animated.View style={tick}>
        <Icon
          name={item.captured ? 'checkCircle' : 'circle'}
          size={iconSize.lg}
          color={item.captured ? darkColors.success : darkColors.textTertiary}
        />
      </Animated.View>
      <Text
        variant="headline"
        style={{ color: item.captured ? darkColors.textOnPhoto : darkColors.textSecondary }}>
        {item.label}
      </Text>
    </Animated.View>
  );
}

export type CaptureChecklistProps = {
  items: readonly CaptureChecklistItem[];
  style?: StyleProp<ViewStyle>;
};

export function CaptureChecklist({ items, style }: CaptureChecklistProps) {
  return (
    <View style={[{ gap: spacing.lg }, style]}>
      {items.map((item, index) => (
        <ChecklistRow key={item.id} item={item} index={index} />
      ))}
    </View>
  );
}
