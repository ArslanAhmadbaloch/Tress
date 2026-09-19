/**
 * "Areas to watch": the places this scan could say least about, and why.
 *
 * Not a warning list. An item is here because a figure above put it
 * there — the most visible scalp in the scan, the side that read lower
 * than the other, the region the comparison reported a difference in —
 * so every reason points back at a number on this same page, and the
 * model writes it. A reader should finish this section knowing which
 * part of the next scan to take more care over, and nothing about their
 * hair they did not already know.
 *
 * When nothing stood out the model hands over one line instead of a
 * list, and the section says it rather than drawing an empty box.
 */

import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { WatchBlock } from '@/features/hair-scan/report-model';
import { iconSize, useTheme } from '@/theme';

import { HAIR_SCAN_SECTION_COPY as COPY } from './index';
import { HeldBlock } from './locked';

export function WatchList({ block }: { block: WatchBlock }) {
  const { colors, radius, spacing } = useTheme();

  if (block.locked) return <HeldBlock lines={3} />;

  if (block.items.length === 0) {
    return block.body ? (
      <Text variant="footnote" color="textSecondary">
        {block.body}
      </Text>
    ) : null;
  }

  return (
    <View style={{ gap: spacing.md }}>
      {block.items.map((item) => (
        <View
          key={item.region}
          accessible
          accessibilityLabel={COPY.a11y.joined(item.label, item.reason)}
          style={{
            flexDirection: 'row',
            gap: spacing.md,
            alignItems: 'flex-start',
            borderRadius: radius.md,
            backgroundColor: colors.backgroundSubtle,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.lg,
          }}>
          <Icon name="target" size={iconSize.sm} color={colors.accent} style={{ marginTop: spacing.xs }} />
          <View style={{ flex: 1, minWidth: 0, gap: spacing.xxs }}>
            <Text variant="subhead">{item.label}</Text>
            <Text variant="footnote" color="textSecondary">
              {item.reason}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
