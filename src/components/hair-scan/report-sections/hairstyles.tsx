/**
 * "Hairstyles for your hair": three catalogue drawings and the way to
 * the rest.
 *
 * The tiles are the catalogue's illustrations for the picks the model
 * made — a blank head with a cut drawn on it, never a frame from the
 * scan — with the cut's name under each. The hair type, when the funnel
 * has one, is read back as the label of the choice in quotation marks,
 * the way the profile tiles read theirs. Without Premium the first tile
 * is clear and the others are blurred with a lock on them; the one
 * button goes to /hairstyles either way, and that screen holds the full
 * list behind the entitlement. Nothing here computes a sentence.
 */

import { Image } from 'expo-image';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
// The one blur radius both held surfaces share, so the report's tiles and
// the catalogue's cards hold a drawing back by the same amount.
import { HELD_BLUR } from '@/components/hairstyles';
import type { HairstylesBlock } from '@/features/hair-scan/report-model';
import { HAIRSTYLE_COPY } from '@/features/hairstyles';
import { useTheme } from '@/theme';

export function HairstylesBlockView({ block, onSeeAll }: { block: HairstylesBlock; onSeeAll: () => void }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View style={{ gap: spacing.lg }}>
      {block.hairTypeLabel !== null ? (
        <Text variant="subhead" color="textSecondary">
          {HAIRSTYLE_COPY.report.typeLead} “{block.hairTypeLabel}” {HAIRSTYLE_COPY.report.typeTrail}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {block.tiles.map((tile, i) => {
          const held = block.locked && i > 0;
          return (
            <View
              key={tile.id}
              accessible
              accessibilityLabel={held ? HAIRSTYLE_COPY.a11y.held(tile.name) : HAIRSTYLE_COPY.a11y.tile(tile.name)}
              style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
              <View
                style={{
                  width: '100%',
                  aspectRatio: 1,
                  borderRadius: radius.md,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.backgroundSubtle,
                }}>
                <Image
                  source={tile.image}
                  contentFit="cover"
                  transition={160}
                  blurRadius={held ? HELD_BLUR : 0}
                  accessible={false}
                  style={{ width: '100%', height: '100%' }}
                />
                {held ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      right: spacing.xs,
                      bottom: spacing.xs,
                      width: 24,
                      height: 24,
                      borderRadius: radius.pill,
                      backgroundColor: colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Icon name="lock" size={11} color={colors.textSecondary} />
                  </View>
                ) : null}
              </View>
              <Text variant="caption" color={held ? 'textTertiary' : 'textSecondary'} numberOfLines={1} center>
                {tile.name}
              </Text>
            </View>
          );
        })}
      </View>

      <Button
        label={block.cta}
        variant="secondary"
        size="md"
        icon={block.locked ? 'lock' : 'arrowRight'}
        onPress={onSeeAll}
        accessibilityHint={HAIRSTYLE_COPY.a11y.seeAllHint}
      />
    </View>
  );
}
