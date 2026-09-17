/**
 * "What's working": cards that scroll sideways, one true positive each.
 *
 * A glyph and a title on the card, the sentence in the bubble under it,
 * as the reference sets its strengths. The cards are a little narrower
 * than the screen so the next one shows at the edge and says there is
 * more; they snap card by card. Every card is a fact about the frames or
 * the record, built by the model; there are never fewer than two and
 * never more than four.
 */

import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { StrengthCard } from '@/features/hair-scan/report-model';
import { iconSize, useTheme } from '@/theme';

import { Bubble } from './section';

/** The glyph on each kind of card. */
export const STRENGTH_ICON: Record<StrengthCard['icon'], IconName> = {
  light: 'sun',
  framing: 'camera',
  coverage: 'checkCircle',
  routine: 'calendar',
  streak: 'flame',
  record: 'photo',
};

/** How much of the row a card takes, so the next one peeks in. */
const CARD_SHARE = 0.78;

export function StrengthCards({ cards }: { cards: StrengthCard[] }) {
  const { colors, radius, spacing } = useTheme();
  const [rowWidth, setRowWidth] = useState(0);
  const cardWidth = rowWidth > 0 ? Math.round(rowWidth * CARD_SHARE) : undefined;
  const gap = spacing.md;

  return (
    <View onLayout={(e) => setRowWidth(Math.round(e.nativeEvent.layout.width))}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth ? cardWidth + gap : undefined}
        snapToAlignment="start"
        style={{ marginHorizontal: -spacing.xl }}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap }}>
        {cards.map((card) => (
          <View
            key={card.id}
            accessible
            accessibilityLabel={`${card.title}. ${card.body}`}
            style={{
              width: cardWidth,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: spacing.lg,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Icon name={STRENGTH_ICON[card.icon]} size={iconSize.md} color={colors.accent} />
              <Text variant="headline" numberOfLines={2} style={{ flexShrink: 1 }}>
                {card.title}
              </Text>
            </View>
            <Bubble style={{ marginTop: spacing.md }}>
              <Text variant="footnote" color="textSecondary">
                {card.body}
              </Text>
            </Bubble>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
