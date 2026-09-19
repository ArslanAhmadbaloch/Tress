/**
 * "Scan quality", folded away.
 *
 * Everything the report says about light, focus and framing lives behind
 * one row: the model's summary of what the turn kept, then two words and
 * a chevron. It sits low on the sheet on purpose. How a photograph was
 * lit is a fact about the photograph, and a report that opens with it is
 * a report about the camera; the reader who wants it — the one whose
 * scan came out dim, or who is about to take another — finds it exactly
 * where they would look, and everybody else never has to scroll past it.
 *
 * The row opens and closes without motion: the sections around it are
 * already animated as they arrive, and a height animation here would run
 * a second performance over the first. Whether it is open is the only
 * state any section keeps, and the words inside are the model's.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { iconSize, useTheme } from '@/theme';

import { HAIR_SCAN_SECTION_COPY as COPY } from './index';

export function QualityDisclosure({ summary, children }: { summary?: string; children: ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((was) => !was), []);
  const label = open ? COPY.quality.hide : COPY.quality.show;

  return (
    <View style={{ gap: spacing.lg }}>
      {summary ? (
        <Text variant="footnote" color="textSecondary">
          {summary}
        </Text>
      ) : null}

      <PressableScale
        onPress={toggle}
        haptic="light"
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={COPY.a11y.quality}
        accessibilityState={{ expanded: open }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.backgroundSubtle,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
        }}>
        <Text variant="subhead" color="textSecondary" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
          {label}
        </Text>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={iconSize.sm} color={colors.textTertiary} />
      </PressableScale>

      {open ? children : null}
    </View>
  );
}
