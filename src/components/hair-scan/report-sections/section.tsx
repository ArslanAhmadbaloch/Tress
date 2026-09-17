/**
 * One section of the sheet, and the way it arrives.
 *
 * A white block on the cream ground with its heading, or a run of the
 * same block continuing from the one above (the analysis rows continue
 * from the tab row without a seam). It lands when it enters the screen:
 * the screen watches the scroll, marks each section as seen the moment
 * its top comes within the viewport, and hands the section its place in
 * that batch; the section fades and rises with a short stagger from its
 * place. A section that is already there when the screen opens lands in
 * the first batch; one four screens down lands when it is reached, not
 * before, because a report that performs itself out of sight has wasted
 * the performance.
 *
 * Under Reduce Motion the block is simply there.
 */

import { useEffect, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { motion, useTheme } from '@/theme';

/** Gap between sections landing in the same batch. */
export const SECTION_STAGGER = 140;
/** How far a section rises as it lands. */
const RISE = 18;

/** The horizontal inset of every sheet block from the screen edge. */
export const SHEET_INSET = 8;

export function SectionReveal({
  shown,
  order,
  onLayout,
  children,
  style,
}: {
  /** Whether the section has entered the screen yet. */
  shown: boolean;
  /** Its place in the batch that entered together; sets the stagger. */
  order: number;
  /** Where the section sits in the sheet; the transform never moves the layout. */
  onLayout?: (e: LayoutChangeEvent) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const v = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      v.set(1);
      return;
    }
    if (!shown) return;
    v.set(withDelay(order * SECTION_STAGGER, withSpring(1, motion.spring.gentle)));
  }, [shown, order, reduceMotion, v]);

  const animated = useAnimatedStyle(() => ({
    opacity: v.get(),
    transform: [{ translateY: (1 - v.get()) * RISE }],
  }));

  return (
    <Animated.View onLayout={onLayout} style={[style, animated]}>
      {children}
    </Animated.View>
  );
}

export function SheetBlock({
  heading,
  subheading,
  headingTone = 'text',
  continues = false,
  plain = false,
  padded = true,
  onLayout,
  children,
  style,
}: {
  heading?: string;
  subheading?: string;
  /** Ink for a section heading; muted for the profile block, which the reference sets quiet. */
  headingTone?: 'text' | 'textSecondary';
  /** True when the block carries on from the one above without a seam (no top corners, no top margin). */
  continues?: boolean;
  /** True for a block that sits on the ground rather than on a white card, as the profile tiles do. */
  plain?: boolean;
  padded?: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      onLayout={onLayout}
      style={[
        {
          marginHorizontal: SHEET_INSET,
          marginTop: continues ? 0 : spacing.md,
          backgroundColor: plain ? undefined : colors.surface,
          borderRadius: radius.lg,
          borderTopLeftRadius: continues ? 0 : radius.lg,
          borderTopRightRadius: continues ? 0 : radius.lg,
          paddingHorizontal: padded ? spacing.xl : 0,
          paddingTop: continues ? spacing.md : spacing.xxl,
          paddingBottom: spacing.xxl,
        },
        style,
      ]}>
      {heading ? (
        <View style={{ paddingHorizontal: padded ? 0 : spacing.xl, marginBottom: spacing.lg }}>
          <Text variant="title2" color={headingTone} accessibilityRole="header">
            {heading}
          </Text>
          {subheading ? (
            <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.sm }}>
              {subheading}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** The grey speech bubble the reference sets a paragraph in, with its small tail at the top left. */
export function Bubble({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, radius, spacing } = useTheme();
  const tail = spacing.sm;
  return (
    <View style={[{ marginTop: tail }, style]}>
      {/* The tail: a square turned through 45°, half hidden behind the bubble. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -tail / 2,
          left: spacing.lg,
          width: tail * 1.5,
          height: tail * 1.5,
          borderRadius: 2,
          backgroundColor: colors.backgroundSubtle,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          backgroundColor: colors.backgroundSubtle,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
        }}>
        {children}
      </View>
    </View>
  );
}

/** Ink and glyph in the accent, before a short label: how a region and a strength are named. */
export function Eyebrow({
  icon,
  children,
  tone = 'accent',
}: {
  icon: ReactNode;
  children: string;
  tone?: 'accent' | 'textSecondary';
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs + spacing.xxs }}>
      {icon}
      <Text variant="subhead" color={tone} numberOfLines={1} style={{ flexShrink: 1 }}>
        {children}
      </Text>
    </View>
  );
}
