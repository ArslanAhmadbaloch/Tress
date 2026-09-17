/**
 * The four benefits under the headline: a disc holding a glyph, and a
 * two-line label beneath, laid out as two rows of two. The copy comes
 * from paywall-variants.ts — each cell is a line from the Premium ledger
 * there, and the tests hold it to that — so this file only draws it.
 *
 * ── Why two rows of two rather than one row of four ───────────────────
 * The reference draws three benefits across the page. The owner asked
 * for four (H.9): Unlimited scans · Hair tracking · Hairstyle
 * recommendations · Assessment report. Four across a phone gives each
 * cell about 70 points, which "Hairstyle recommendations" cannot be read
 * in at any size worth setting. Two rows of two gives each cell roughly
 * half the page, which holds the longest of the four on two lines at the
 * row's normal size — so the four fit without the type shrinking to fit
 * them, and the pair of rows reads as a small table of what is included
 * rather than a strip of icons.
 *
 * White discs on the cream ground rather than sage ones. The screen has
 * one accent and it points at the chosen plan and the button; a grid of
 * green beads above them would be a grid of things asking to be looked
 * at. The cells arrive one after another behind the headline, and simply
 * appear under Reduce Motion — Rise handles both.
 */

import { View } from 'react-native';

import { Rise } from '@/components/funnel';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  highlightBenefits,
  type ResolvedHighlight,
} from '@/features/subscription/paywall-variants';
import { useTheme } from '@/theme';

const DISC = 56;

/** Cells per row. Two, for the reason in the header. */
const COLUMNS = 2;

/**
 * The longest word a cell can hold at subhead size.
 *
 * Half a phone's width, less the page margins and the gap, is about 165
 * points. At 14pt medium that is roughly twenty-two characters — so
 * "recommendations" (fifteen) fits, and a word longer than that would
 * not wrap but run past the cell into the next one. The grid drops to
 * caption size when any label carries a word that long, and it drops as
 * a whole rather than per cell, because four headings at two different
 * sizes reads as a mistake. Measured in characters rather than points on
 * purpose — this is a guard against one long word, and a layout pass to
 * measure it would cost a frame on every open.
 */
const LONG_WORD = 22;

/** The items in rows of COLUMNS, the last row short if the count is odd. */
function inRows(items: ResolvedHighlight[]): ResolvedHighlight[][] {
  const rows: ResolvedHighlight[][] = [];
  for (let i = 0; i < items.length; i += COLUMNS) {
    rows.push(items.slice(i, i + COLUMNS));
  }
  return rows;
}

export function PaywallHighlights({
  /** The Rise index of the first cell; the others follow it. */
  firstIndex = 0,
}: {
  firstIndex?: number;
}) {
  const { colors, spacing, shadow } = useTheme();
  const items = highlightBenefits();
  const tight = items.some((item) =>
    item.label.split(' ').some((word) => word.length > LONG_WORD),
  );

  return (
    <View style={{ gap: spacing.xl }}>
      {inRows(items).map((row, rowIndex) => (
        <View
          key={row.map((item) => item.label).join('|')}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          {row.map((item, columnIndex) => (
            <Rise
              key={item.label}
              index={firstIndex + rowIndex * COLUMNS + columnIndex}
              style={{ flex: 1 }}>
              <View
                accessible
                accessibilityLabel={`${item.label}. ${item.body}`}
                style={{ alignItems: 'center', gap: spacing.sm }}>
                <View
                  style={[
                    {
                      width: DISC,
                      height: DISC,
                      borderRadius: DISC / 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.surface,
                    },
                    shadow.soft,
                  ]}>
                  <Icon name={item.icon} size={22} color={colors.text} />
                </View>
                <Text
                  variant={tight ? 'caption' : 'subhead'}
                  center
                  style={{ paddingHorizontal: spacing.xxs }}>
                  {item.label}
                </Text>
              </View>
            </Rise>
          ))}
          {/* An odd last row keeps its cells the same width as the rows
              above rather than stretching to fill: a lone benefit twice
              the width of the three above it would read as the important
              one, which is a claim the ledger does not make. */}
          {row.length < COLUMNS
            ? Array.from({ length: COLUMNS - row.length }, (_, i) => (
                <View key={`pad_${i}`} style={{ flex: 1 }} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}
