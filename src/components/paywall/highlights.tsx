/**
 * The three benefits under the headline, as the reference draws them:
 * a disc holding a glyph, and a two-line label beneath, in a row of
 * three. The copy comes from paywall-variants.ts — each column is a line
 * from the Premium ledger there, and the tests hold it to that — so this
 * file only draws it.
 *
 * White discs on the cream ground rather than sage ones. The screen has
 * one accent and it points at the chosen plan and the button; a row of
 * green beads above them would be a row of things asking to be looked
 * at. The columns arrive one after another behind the headline, and
 * simply appear under Reduce Motion — Rise handles both.
 */

import { View } from 'react-native';

import { Rise } from '@/components/funnel';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { highlightBenefits } from '@/features/subscription/paywall-variants';
import { useTheme } from '@/theme';

const DISC = 56;

export function PaywallHighlights({
  /** The Rise index of the first column; the others follow it. */
  firstIndex = 0,
}: {
  firstIndex?: number;
}) {
  const { colors, spacing, shadow } = useTheme();
  const items = highlightBenefits();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
      {items.map((item, i) => (
        <Rise key={item.label} index={firstIndex + i} style={{ flex: 1 }}>
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
            <Text variant="subhead" center style={{ paddingHorizontal: spacing.xxs }}>
              {item.label}
            </Text>
          </View>
        </Rise>
      ))}
    </View>
  );
}
