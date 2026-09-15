/**
 * One line of a report, with its working underneath.
 *
 * Every finding shows its reasoning. A report that states a conclusion
 * without the working is a black box, and a black box about somebody's
 * body is worth less than nothing. The headline is the sentence; the
 * detail is where it came from.
 */

import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { ReadingTone } from '@/features/assessment/scan-reading';
import { useTheme } from '@/theme';

import { ToneMark } from './reading-tile';

export function FindingRow({
  tone,
  headline,
  detail,
  divider = true,
}: {
  tone: ReadingTone;
  headline: string;
  detail: string;
  /** Hairline above the row, off for the first in a list. */
  divider?: boolean;
}) {
  const { colors, spacing } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${headline} ${detail}`}
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        paddingVertical: spacing.lg,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: colors.separator,
      }}>
      <View style={{ paddingTop: 7 }}>
        <ToneMark tone={tone} />
      </View>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text variant="headline">{headline}</Text>
        <Text variant="footnote" color="textSecondary">
          {detail}
        </Text>
      </View>
    </View>
  );
}
