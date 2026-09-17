/**
 * What a reader without Premium sees where the depth would be.
 *
 * A soft translucent block in the shape of the thing held back — a few
 * lines of a paragraph, drawn faint under a wash of the surface colour —
 * so it reads as something held rather than something broken. Nothing in
 * it is a word, nothing is a number, and it cannot be pressed: the one
 * button that opens the paywall sits under the analysis rows and again
 * in the routine block, and nowhere else.
 *
 * The block's own accessible name says what it is, so a screen reader is
 * told "held for the full report" once rather than reading out shapes.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { HAIR_SCAN_REPORT_UI_COPY as UI } from './ui-copy';

/** Opacity of the lines under the wash. */
const HELD_OPACITY = 0.45;
/** Opacity of the wash over them: most of the way to the surface colour. */
const HELD_WASH_OPACITY = 0.5;

/** The line widths of a held paragraph, in order. Shapes, not text. */
const HELD_LINES: readonly `${number}%`[] = ['92%', '78%', '86%', '54%'];

export function HeldBlock({
  lines = 3,
  style,
}: {
  /** How many lines the held paragraph would have had. */
  lines?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing } = useTheme();
  const widths = HELD_LINES.slice(0, Math.max(1, Math.min(HELD_LINES.length, lines)));

  return (
    <View
      accessible
      accessibilityLabel={UI.locked.placeholder}
      pointerEvents="none"
      style={[
        {
          borderRadius: radius.md,
          overflow: 'hidden',
          backgroundColor: colors.backgroundSubtle,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          gap: spacing.sm,
        },
        style,
      ]}>
      {widths.map((width, i) => (
        <View
          key={i}
          style={{
            height: spacing.md,
            width,
            borderRadius: radius.pill,
            backgroundColor: colors.fill,
            opacity: HELD_OPACITY,
          }}
        />
      ))}
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.backgroundSubtle, opacity: HELD_WASH_OPACITY }]}
      />
    </View>
  );
}

/**
 * The one way to the full report. The note above it says what the full
 * report opens and that it makes no judgement either; the button says
 * where it goes.
 */
export function LockCta({
  onPress,
  note = true,
  style,
}: {
  onPress: () => void;
  /** Whether the sentence about what is held is printed above the button. */
  note?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { spacing } = useTheme();
  return (
    <View style={[{ gap: spacing.md }, style]}>
      {note ? (
        <Text variant="footnote" color="textSecondary">
          {UI.locked.note}
        </Text>
      ) : null}
      <Button
        label={UI.locked.button}
        variant="secondary"
        size="md"
        icon="lock"
        onPress={onPress}
        accessibilityHint={UI.locked.hint}
      />
    </View>
  );
}
