/**
 * "Build your routine": the shelf, and the way to the routine builder.
 *
 * A row of product tiles — the picture where one was scanned, a "?"
 * where the shelf has a bottle with no picture or nothing at all, and
 * "+N" for the rest — over the one line the model writes about the
 * shelf, and the button. On a fresh install the shelf is empty and the
 * row is three "?" tiles: honest, and an invitation. Without Premium the
 * button is the one to the paywall instead.
 */

import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ROUTINE_TILES, type RoutineBlock } from '@/features/hair-scan/report-model';
import { useTheme } from '@/theme';

import { LockCta } from './locked';
import { HAIR_SCAN_REPORT_UI_COPY as UI } from './ui-copy';

const TILE = 64;

function Tile({ children, label }: { children: ReactNode; label: string }) {
  const { colors, radius } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        width: TILE,
        height: TILE,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {children}
    </View>
  );
}

export function RoutineBlockView({
  routine,
  onBuild,
  onSeeFull,
}: {
  routine: RoutineBlock;
  /** Opens the routine builder. */
  onBuild: () => void;
  /** Opens the paywall. */
  onSeeFull: () => void;
}) {
  const { colors, radius, spacing } = useTheme();

  // Three seats. A product fills one; an empty seat is a "?" tile.
  const seats = Array.from({ length: ROUTINE_TILES }, (_, i) => routine.products[i] ?? null);

  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        gap: spacing.lg,
      }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
        {seats.map((product, i) =>
          product ? (
            <Tile key={product.id} label={UI.a11y.product(product.name)}>
              {product.imageUri ? (
                <Image
                  source={{ uri: product.imageUri }}
                  contentFit="contain"
                  transition={160}
                  cachePolicy="memory-disk"
                  accessible={false}
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (
                <Text variant="title3" color="textTertiary">
                  {UI.routine.emptyTile}
                </Text>
              )}
            </Tile>
          ) : (
            <Tile key={`empty_${i}`} label={UI.routine.emptyTile}>
              <Text variant="title3" color="textTertiary">
                {UI.routine.emptyTile}
              </Text>
            </Tile>
          ),
        )}
        {routine.moreCount > 0 ? (
          <Tile label={UI.routine.more(routine.moreCount)}>
            <Text variant="headline" color="textSecondary">
              {UI.routine.more(routine.moreCount)}
            </Text>
          </Tile>
        ) : null}
      </View>

      <Text variant="footnote" color="textSecondary" center>
        {routine.body}
      </Text>

      {routine.locked ? (
        <LockCta onPress={onSeeFull} note={false} style={{ alignSelf: 'stretch' }} />
      ) : (
        <Button label={routine.cta} onPress={onBuild} style={{ alignSelf: 'stretch' }} />
      )}
    </View>
  );
}
