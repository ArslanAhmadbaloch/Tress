/**
 * What a reader without Premium sees where a suggestion's note would be:
 * a few faint lines under a wash, shapes and never words, with one
 * accessible name that says what is held. The same idea as the report's
 * held block, drawn here so the hairstyle screens stand on their own.
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { HAIRSTYLE_COPY } from '@/features/hairstyles';
import { useTheme } from '@/theme';

const LINE_OPACITY = 0.45;
const WASH_OPACITY = 0.5;
const LINES: readonly `${number}%`[] = ['88%', '64%'];

export function HeldNote({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={HAIRSTYLE_COPY.locked.placeholder}
      pointerEvents="none"
      style={[
        {
          borderRadius: radius.sm,
          overflow: 'hidden',
          backgroundColor: colors.backgroundSubtle,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          gap: spacing.sm,
        },
        style,
      ]}>
      {LINES.map((width, i) => (
        <View
          key={i}
          style={{ height: spacing.md, width, borderRadius: radius.pill, backgroundColor: colors.fill, opacity: LINE_OPACITY }}
        />
      ))}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.backgroundSubtle, opacity: WASH_OPACITY }]} />
    </View>
  );
}
