/**
 * "What changed", and the baseline comparison under it.
 *
 * One row per region the comparison could speak about: the place, a
 * glyph whose tone says whether the difference cleared the two scans'
 * own margin of error, and the model's sentence. The rows are the
 * model's `ChangeRow`s in its order and the span above them — what they
 * are set against — is its sentence too. A list with no rows is not an
 * empty list: the model hands over a line for that case, and the section
 * says it.
 *
 * ── The quiet verdicts ────────────────────────────────────────────────
 * `unchanged` and `insufficient` are drawn as plainly as the rest, in
 * the quiet ink, with no arrow and no colour. They are the honest
 * answers the engine gives most often, and a list that dressed the other
 * three up would teach a reader that a scan with nothing to report had
 * failed. Nothing here is an arrow up or down: the direction, where
 * there is one, is in the model's own words.
 */

import { View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { ChangeRow, ChangeVerdict } from '@/features/hair-scan/report-model';
import { iconSize, useTheme } from '@/theme';

import { HAIR_SCAN_SECTION_COPY as COPY } from './index';
import { HeldBlock } from './locked';

/** The glyph beside a row, by what the comparison decided. */
const VERDICT_ICON: Record<ChangeVerdict, IconName> = {
  unchanged: 'circle',
  small: 'compare',
  moderate: 'compare',
  large: 'compare',
  insufficient: 'info',
};

/** The verdicts the engine says are clear of its own margin of error. */
const CLEARED: ChangeVerdict[] = ['small', 'moderate', 'large'];

export function ChangeRows({
  rows,
  span,
  empty,
  locked = false,
}: {
  rows: ChangeRow[];
  /** The model's sentence about what these rows are set against. */
  span?: string;
  /** The model's sentence for a list with nothing in it. */
  empty?: string;
  locked?: boolean;
}) {
  const { colors, spacing } = useTheme();

  return (
    <View style={{ gap: spacing.md }}>
      {span ? (
        <Text variant="caption" color="textTertiary">
          {span}
        </Text>
      ) : null}

      {/*
        Nothing to hold is not held. A comparison with no rows — a first
        scan, or one where nothing cleared the margin — has no rows to
        promise, and three shimmering placeholder lines over the absence
        of a finding would be selling something that does not exist. So
        the model's line is drawn either way, and the lock only ever
        stands in front of rows that are really there.
      */}
      {rows.length === 0 ? (
        empty ? (
          <Text variant="footnote" color="textSecondary">
            {empty}
          </Text>
        ) : null
      ) : locked ? (
        <HeldBlock lines={3} />
      ) : (
        rows.map((row) => {
          const cleared = CLEARED.includes(row.verdict);
          return (
            <View
              key={row.region}
              accessible
              accessibilityLabel={COPY.a11y.joined(row.label, row.detail)}
              style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
              <Icon
                name={VERDICT_ICON[row.verdict]}
                size={iconSize.sm}
                color={cleared ? colors.accent : colors.textTertiary}
                style={{ marginTop: spacing.xs }}
              />
              <View style={{ flex: 1, minWidth: 0, gap: spacing.xxs }}>
                <Text variant="subhead">{row.label}</Text>
                <Text variant="footnote" color="textSecondary">
                  {row.detail}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}
