/**
 * A catalogue tile for the "More styles" grid: the drawing, the name
 * and the lengths, two to a row. Nothing on it is pressed; the grid is
 * a list to read, and the note is on the card above when a cut is one
 * of the picks.
 */

import { Image } from 'expo-image';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { HAIRSTYLE_COPY, type Hairstyle } from '@/features/hairstyles';
import { useTheme } from '@/theme';

import { lengthsLabel } from './style-card';

export function StyleTile({ style }: { style: Hairstyle }) {
  const { colors, radius, spacing, shadow } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={HAIRSTYLE_COPY.a11y.tile(style.name)}
      style={[
        {
          flex: 1,
          minWidth: 0,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
          padding: spacing.sm,
          gap: spacing.sm,
        },
        shadow.soft,
      ]}>
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
          borderRadius: radius.md,
          overflow: 'hidden',
          backgroundColor: colors.backgroundSubtle,
        }}>
        <Image source={style.image} contentFit="cover" transition={160} accessible={false} style={{ width: '100%', height: '100%' }} />
      </View>
      <View style={{ paddingHorizontal: spacing.xs, paddingBottom: spacing.xs, gap: spacing.xxs }}>
        <Text variant="subhead" numberOfLines={1}>
          {style.name}
        </Text>
        <Text variant="caption" color="textTertiary" numberOfLines={1}>
          {lengthsLabel(style)}
        </Text>
      </View>
    </View>
  );
}
