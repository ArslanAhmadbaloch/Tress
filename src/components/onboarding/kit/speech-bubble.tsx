/**
 * The question, as the orb saying it.
 *
 * A translucent bubble to the right of a small Tress, its tail — two
 * thought-dots — trailing back toward the orb at the bottom-left. The
 * question is a bold headline with one keyword picked out in the accent;
 * the optional line beneath, in grey, is the reason it is being asked.
 *
 * The orb sits partly off the page's left edge, as in the reference, so
 * the bubble's left margin is where the eye lands and the character is
 * present without taking a column of its own.
 *
 * Every word here comes in through props. The bubble decides where the
 * accent falls, never what is said.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { fontFamily, useTheme } from '@/theme';

import { splitAccent } from './copy';
import { Mascot, type MascotExpression } from './mascot';

/** The orb beside a question. */
const ORB = 60;
/**
 * Where the bubble starts, from the padded content's left edge. The orb
 * is placed back from there so that it hangs a few points off the screen,
 * as in the reference, with a breath of ground between it and the bubble.
 */
const BUBBLE_INSET = 44;

export function SpeechBubble({
  title,
  accentWord,
  subtitle,
  expression = 'smile',
  children,
}: {
  title: string;
  /** The one word of the headline set in the accent colour. */
  accentWord?: string;
  subtitle?: string;
  expression?: MascotExpression;
  children?: ReactNode;
}) {
  const { colors, spacing, radius } = useTheme();
  const reduceMotion = useReducedMotion();

  const parts = splitAccent(title, accentWord);

  return (
    <Animated.View
      entering={
        reduceMotion
          ? FadeIn.duration(220)
          : FadeInDown.springify().damping(22).mass(0.9).withInitialValues({
              transform: [{ translateY: 12 }],
            })
      }
      style={{ marginLeft: BUBBLE_INSET }}>
      <View
        accessibilityRole="header"
        style={{
          backgroundColor: colors.glassTint,
          borderRadius: radius.section,
          borderWidth: 1,
          borderColor: colors.glassBorder,
          paddingHorizontal: spacing.xxl,
          paddingVertical: spacing.xl,
          gap: spacing.sm,
        }}>
        <Text variant="title2" style={{ fontFamily: fontFamily.displayBold }}>
          {parts ? (
            <>
              {parts.before}
              <Text variant="title2" color="accent" style={{ fontFamily: fontFamily.displayBold }}>
                {parts.word}
              </Text>
              {parts.after}
            </>
          ) : (
            title
          )}
        </Text>
        {subtitle ? (
          <Text variant="body" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
        {children}
      </View>

      {/* The tail: two dots falling away toward the orb. */}
      <Svg
        pointerEvents="none"
        width={22}
        height={18}
        viewBox="0 0 22 18"
        style={{ position: 'absolute', left: -spacing.md, bottom: -spacing.xs }}>
        <Circle cx={15} cy={5} r={4.5} fill={colors.glassTint} stroke={colors.glassBorder} strokeWidth={1} />
        <Circle cx={5} cy={13} r={2.5} fill={colors.glassTint} stroke={colors.glassBorder} strokeWidth={1} />
      </Svg>

      <Mascot
        size={ORB}
        expression={expression}
        style={{ position: 'absolute', left: -ORB - spacing.sm, bottom: 0 }}
      />
    </Animated.View>
  );
}
