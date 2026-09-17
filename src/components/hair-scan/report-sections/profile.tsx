/**
 * "Based on your profile": four tiles in a row, each the label of a
 * choice made in the funnel.
 *
 * A quiet glyph, the value in ink, the question under it in grey — the
 * reference's own layout. The values are quotations: what the person
 * chose, verbatim from the `*_LABELS` maps, and never a finding. The
 * model decides the four; the tile only draws them. Its icon name
 * arrives as a string so the model stays free of the UI, and is checked
 * against the glyphs the app has before it is drawn.
 */

import { View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { ProfileTile } from '@/features/hair-scan/report-model';
import { iconSize, useTheme } from '@/theme';

import { HAIR_SCAN_REPORT_UI_COPY as UI } from './ui-copy';

/** The glyphs a profile tile may name. Anything else draws the fallback. */
const TILE_ICONS: readonly IconName[] = ['target', 'calendar', 'search', 'heart', 'leaf', 'follicle', 'drop', 'shield'];
const TILE_ICON_FALLBACK: IconName = 'info';

export function tileIcon(name: string): IconName {
  return (TILE_ICONS as readonly string[]).includes(name) ? (name as IconName) : TILE_ICON_FALLBACK;
}

export function ProfileTiles({ tiles }: { tiles: ProfileTile[] }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      {tiles.map((tile) => (
        <View
          key={tile.id}
          accessible
          accessibilityLabel={UI.a11y.tile(tile.value, tile.label)}
          style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.pill,
              backgroundColor: colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name={tileIcon(tile.icon)} size={iconSize.md} color={colors.accent} />
          </View>
          <Text variant="subhead" numberOfLines={2} style={{ marginTop: spacing.xs }}>
            {tile.value}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {tile.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
