/**
 * "Build your routine": the shelf, and the way to the routine builder.
 *
 * A row of product tiles — the picture where one was scanned, a "?"
 * where the shelf has a bottle with no picture or nothing at all in the
 * seat, and "+N" for the rest — over the one line the model writes about
 * the shelf, and the button. Without Premium the button is the one to
 * the paywall instead. Only the wholly empty shelf swaps the "?" row for
 * the example photographs below; a shelf holding one or two products
 * still draws "?" in the seats that are free.
 *
 * ── The empty shelf ───────────────────────────────────────────────────
 * On a fresh install the shelf is empty and the row used to be three "?"
 * tiles. Honest, and unreadable: a row of question marks shows nothing
 * of what the block is for. So an empty shelf now shows three
 * photographs of the KIND of thing that goes on it — an unbranded
 * bottle, tube and dropper on a cream ground, generated for this app and
 * bundled with it (assets/images/products). They are not products
 * anybody sells, they carry no name, and the caption says the first one
 * is an example. Nothing here says a product does anything: the app has
 * no opinion about what is in a bottle, and the one sentence under the
 * row is the model's line about the shelf.
 *
 * Without Premium the first tile is clear and the other two are blurred
 * — the blur is the same shape the lock takes everywhere else in this
 * report, and the button underneath says what opens them. With Premium
 * all three are clear and the caption says how a real one gets there:
 * by scanning its barcode. A blurred EXAMPLE is not a blurred finding —
 * there is nothing behind it to reveal but the same stock photograph —
 * so the caption never implies the subscription unlocks a product.
 *
 * Both captions say the word "example", and that is the point of them.
 * The moment the tiles stop being blurred is the moment three unbranded
 * bottles could be read as three bottles somebody already owns, so the
 * Premium caption names them as examples before it says how to add a
 * real one. The same word is in what a screen reader hears for every
 * tile in the row, clear or held.
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

/**
 * How hard the held tiles are blurred.
 *
 * Measured against the tile, not against the file. These are 64pt
 * squares, so a radius that reads as "blurred bottle" on a full-bleed
 * photograph reads as a plain beige square here — the bottle is only
 * about sixty points tall on screen. Eight leaves the silhouette and
 * takes the surface, which with the fill laid over it is the same shape
 * the lock takes everywhere else in this report.
 */
const BLUR = 8;

/**
 * The three bundled category photographs, in the order a routine is
 * usually written: wash, condition, treat. Generated unbranded for this
 * app — no logo, no label, nothing to mistake for a product on sale.
 *
 * The captions describe the photograph, not an effect. "A gentle
 * shampoo" is what the picture is of; it is not a claim that it, or
 * anything else, will do something to somebody's hair.
 */
/* The three files are cropped tight around the bottle rather than sitting
   small in a wide cream field: drawn with contentFit="cover" into a 64pt
   square, a subject filling a third of its frame becomes a pale square
   with something in the middle of it, and blurred it becomes a pale
   square. */
const EXAMPLES = [
  { id: 'shampoo', image: require('@/assets/images/products/shampoo.png'), label: 'A shampoo bottle' },
  { id: 'conditioner', image: require('@/assets/images/products/conditioner.png'), label: 'A conditioner tube' },
  { id: 'serum', image: require('@/assets/images/products/serum.png'), label: 'A serum dropper' },
] as const;

const EXAMPLE_COPY = {
  /** Under the row when the shelf is empty and Premium is not on. */
  locked: 'Example: a gentle shampoo',
  /**
   * Under the row when the shelf is empty and Premium is on.
   *
   * It has to do the job the blur was doing. With nothing scanned and
   * nothing blurred, three photographs of bottles on a shelf card are
   * three bottles somebody could take for their own, so the line names
   * them before it says how a real one arrives.
   */
  premium: 'Examples. Add your own by scanning a barcode',
  /** What a screen reader hears for a held example tile — an example
      first, held second: there is nothing behind the blur but the same
      photograph. */
  heldSuffix: 'an example photograph, held behind Premium',
  /** And for the clear one. */
  exampleSuffix: 'an example photograph',
} as const;

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
  // Nothing scanned yet: the row becomes the three bundled examples.
  const empty = routine.products.length === 0;

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
      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
          {empty
            ? EXAMPLES.map((example, i) => {
                // The first is always clear; the rest are held only while
                // Premium is off.
                const held = routine.locked && i > 0;
                return (
                  <Tile
                    key={example.id}
                    label={`${example.label}, ${held ? EXAMPLE_COPY.heldSuffix : EXAMPLE_COPY.exampleSuffix}`}>
                    <Image
                      source={example.image}
                      contentFit="cover"
                      blurRadius={held ? BLUR : 0}
                      transition={160}
                      cachePolicy="memory-disk"
                      accessible={false}
                      style={{ width: '100%', height: '100%' }}
                    />
                    {held ? (
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: colors.fill,
                          opacity: 0.45,
                        }}
                      />
                    ) : null}
                  </Tile>
                );
              })
            : seats.map((product, i) =>
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

        {/* Says what the pictures are. Only under the examples — a real
            shelf's tiles are the person's own bottles and need no note. */}
        {empty ? (
          <Text variant="caption" color="textTertiary" center>
            {routine.locked ? EXAMPLE_COPY.locked : EXAMPLE_COPY.premium}
          </Text>
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
