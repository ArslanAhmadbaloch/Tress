/**
 * A tile for a reading that is a word rather than a number.
 *
 * "Even", "Sharp", "Held": the photograph's own quality, said in one word
 * with a small mark beside it for how it went. The sentence behind each
 * word — the measurement and what to do about it — sits in the readings
 * list further down, so the tile can stay as quiet as the reference's.
 */

import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import type { ReadingTone, TileReading } from '@/features/assessment/scan-reading';
import { useTheme } from '@/theme';

export function toneColour(
  tone: ReadingTone,
  colors: ReturnType<typeof useTheme>['colors'],
): string {
  if (tone === 'good') return colors.accent;
  if (tone === 'attention') return colors.warning;
  return colors.textTertiary;
}

/** The small round mark that says how a reading went. */
export function ToneMark({ tone, size = 8 }: { tone: ReadingTone; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: toneColour(tone, colors),
      }}
    />
  );
}

export function ReadingTile({
  reading,
  style,
}: {
  reading: TileReading;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing, shadow } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${reading.label}: ${reading.value}. ${reading.headline}`}
      style={[
        {
          flex: 1,
          minWidth: 0,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
          gap: spacing.xs,
        },
        shadow.soft,
        style,
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <ToneMark tone={reading.tone} />
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {reading.label}
        </Text>
      </View>
      <Text
        variant="title3"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ marginTop: spacing.xxs }}>
        {reading.value}
      </Text>
    </View>
  );
}
