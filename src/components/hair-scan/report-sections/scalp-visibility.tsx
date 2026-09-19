/**
 * "Scalp visibility": how much of each region read as scalp rather than
 * hair.
 *
 * The same regions as the cards above, in the model's order, each with
 * the figure this scan counted, the confidence that region was read
 * with, and a quiet bar. Quiet on purpose: visible
 * scalp is a reading of a photograph, and a bar that filled up in a
 * warning colour would turn a measurement into a verdict. It is counted
 * in its own right — not a hundred minus the coverage figure — and the
 * model's note under the rows says what moves it between scans.
 *
 * A region the scan did not measure has no row. There is no row at zero.
 */

import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { ScalpVisibilityBlock } from '@/features/hair-scan/report-model';
import { useTheme } from '@/theme';

import { ConfidenceNote, CoverageBar, confidenceFigure, type FigureLabels } from './assessment';
import { HAIR_SCAN_SECTION_COPY as COPY } from './index';
import { HeldBlock } from './locked';

export function ScalpVisibility({
  block,
  figures,
}: {
  block: NonNullable<ScalpVisibilityBlock>;
  /** The name of a confidence, the assessment's. */
  figures: FigureLabels;
}) {
  const { spacing } = useTheme();

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ gap: spacing.lg }}>
        {block.rows.map((row) => (
          <View
            key={row.region}
            accessible
            accessibilityLabel={COPY.a11y.joined(
              COPY.a11y.figure(row.label, `${row.visibleScalp} ${figures.scoreScale}`, block.label),
              `${figures.confidenceLabel} ${confidenceFigure(row.confidence)}`,
            )}
            style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.md }}>
              <Text variant="subhead" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                {row.label}
              </Text>
              <Text variant="headline">{row.visibleScalp}</Text>
              <Text variant="caption" color="textTertiary" numberOfLines={1}>
                {figures.scoreScale}
              </Text>
            </View>
            <ConfidenceNote label={figures.confidenceLabel} confidence={row.confidence} />
            <CoverageBar points={row.visibleScalp} tone="quiet" />
          </View>
        ))}
      </View>

      {block.locked ? (
        <HeldBlock lines={3} />
      ) : (
        <Text variant="footnote" color="textSecondary">
          {block.body}
        </Text>
      )}

      <Text variant="caption" color="textTertiary">
        {block.note}
      </Text>
    </View>
  );
}
