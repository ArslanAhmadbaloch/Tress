/**
 * The lines that cross-fade before the paywall.
 *
 * One line at a time on the cream glow, each fading in from a little
 * below as the last fades out above it, on its own clock. The first
 * carries the app mark; the last waits for Next. A tap anywhere moves
 * on early, because a sequence nobody can hurry is a sequence people
 * resent.
 *
 * Under Reduce Motion nothing advances on its own: every line has Next,
 * and the change is a plain cross-fade.
 */

import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutUp } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { SequenceLine } from '@/features/onboarding/plan-copy';
import { fontFamily, useTheme } from '@/theme';

const MARK = require('@/assets/images/app-mark.jpg');

/** How long each line holds before the next, when the sequence runs itself. */
export const LINE_HOLD_MS = 1_800;
const MARK_SIZE = 96;
/** A narrower measure than the screen, so a centred line breaks where a sentence would. */
const MEASURE = 320;

export function TextSequence({
  lines,
  autoAdvance,
  nextLabel,
  onDone,
  reduceMotion,
  bottomInset,
}: {
  lines: SequenceLine[];
  /** False under Reduce Motion: then every line waits for Next. */
  autoAdvance: boolean;
  nextLabel: string;
  onDone: () => void;
  reduceMotion: boolean;
  bottomInset: number;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  const [index, setIndex] = useState(0);
  const current = lines[Math.min(index, lines.length - 1)];
  const isLast = index >= lines.length - 1;

  // Once: a second tap on the last line would hand over twice.
  const done = useRef(false);
  const advance = useCallback(() => {
    if (!isLast) {
      setIndex((i) => i + 1);
      return;
    }
    if (done.current) return;
    done.current = true;
    onDone();
  }, [isLast, onDone]);

  useEffect(() => {
    if (!autoAdvance || isLast) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), LINE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [autoAdvance, isLast, index]);

  const showNext = isLast || !autoAdvance;
  const line = current.line;

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        onPress={advance}
        accessibilityRole="button"
        accessibilityLabel={`${line.before}${line.accent}${line.after}`.trim()}
        accessibilityHint={nextLabel}
        style={{ flex: 1 }}>
        <Animated.View
          key={current.id}
          entering={
            reduceMotion
              ? FadeIn.duration(220)
              : FadeInDown.duration(560).withInitialValues({ opacity: 0, transform: [{ translateY: 18 }] })
          }
          exiting={reduceMotion ? FadeOut.duration(160) : FadeOutUp.duration(420)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.xxl,
          }}>
          {current.mark ? (
            <Image
              source={MARK}
              accessibilityIgnoresInvertColors
              style={[
                {
                  width: MARK_SIZE,
                  height: MARK_SIZE,
                  borderRadius: radius.lg,
                  marginBottom: spacing.xxl,
                  backgroundColor: colors.surface,
                },
                shadow.lifted,
              ]}
            />
          ) : null}
          <Text
            variant="title1"
            center
            style={{ maxWidth: MEASURE, fontFamily: fontFamily.displayMedium }}>
            {line.before}
            {line.accent.length > 0 ? (
              <Text variant="title1" color="accent" style={{ fontFamily: fontFamily.displayMedium }}>
                {line.accent}
              </Text>
            ) : null}
            {line.after}
          </Text>
        </Animated.View>
      </Pressable>

      {showNext ? (
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(220) : FadeIn.duration(420).delay(300)}
          style={{ paddingHorizontal: spacing.xl, paddingBottom: bottomInset + spacing.lg }}>
          <Button label={nextLabel} onPress={advance} />
        </Animated.View>
      ) : null}
    </View>
  );
}
