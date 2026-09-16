/**
 * A row of suggested questions.
 *
 * Each chip is a question the record can actually answer right now, so
 * the row is the coach's honest menu: nothing on it leads to a refusal.
 * The chips stagger in sixty milliseconds apart, and Reanimated stands
 * that down under Reduce Motion.
 */

import { ScrollView } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import type { Chip } from '@/features/coach';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

export function ChipRow({
  chips,
  onPick,
  bleed = 0,
}: {
  chips: Chip[];
  onPick: (chip: Chip) => void;
  /** Negative horizontal margin so the row scrolls edge to edge inside a padded parent. */
  bleed?: number;
}) {
  const { colors, spacing, radius, shadow } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ marginHorizontal: -bleed }}
      contentContainerStyle={{ paddingHorizontal: bleed, gap: spacing.sm }}>
      {chips.map((chip, i) => (
        <Animated.View key={chip.intent} entering={FadeInDown.delay(i * 60).duration(320)}>
          <PressableScale
            onPress={() => onPick(chip)}
            accessibilityRole="button"
            accessibilityLabel={chip.label}
            accessibilityHint="Asks this"
            style={[
              {
                minHeight: MIN_TOUCH_TARGET,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                backgroundColor: colors.surface,
                justifyContent: 'center',
              },
              shadow.soft,
            ]}>
            <Text variant="subhead">{chip.label}</Text>
          </PressableScale>
        </Animated.View>
      ))}
    </ScrollView>
  );
}
