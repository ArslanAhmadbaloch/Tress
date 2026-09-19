/**
 * "Symmetry": the two temples, set side by side in the same scan.
 *
 * Two figures and the distance between them. Each side carries its own
 * Visual Coverage, the confidence that reading was taken with and its
 * own bar, and under them the model's sentence —
 * either that the pair reads as close as this scan can tell them apart,
 * or that one side reads so many points above the other. It says nothing
 * about why: a parting, a window on one side and the way the head turned
 * all move this figure, and a scan cannot tell them apart. The note
 * under it says so.
 *
 * The block is absent when the scan did not read both temples. Half a
 * comparison is not drawn as a comparison.
 */

import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { Grade, SymmetryBlock } from '@/features/hair-scan/report-model';
import { useTheme } from '@/theme';

import { ConfidenceNote, CoverageBar, confidenceFigure, type FigureLabels } from './assessment';
import { HAIR_SCAN_SECTION_COPY as COPY } from './index';
import { HeldBlock } from './locked';

function Side({ label, grade, figures }: { label: string; grade: Grade; figures: FigureLabels }) {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={COPY.a11y.figure(
        label,
        `${grade.score} ${figures.scoreScale}`,
        `${figures.confidenceLabel} ${confidenceFigure(grade.confidence)}`,
      )}
      style={{ flex: 1, gap: spacing.sm }}>
      <Text variant="caption" color="textTertiary" numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flexWrap: 'wrap' }}>
        <Text variant="metric">{grade.score}</Text>
        <Text variant="caption" color="textTertiary" numberOfLines={1}>
          {figures.scoreScale}
        </Text>
      </View>
      <ConfidenceNote label={figures.confidenceLabel} confidence={grade.confidence} />
      <CoverageBar points={grade.score} />
    </View>
  );
}

export function SymmetryRows({
  block,
  figures,
}: {
  block: NonNullable<SymmetryBlock>;
  /** The scale and the name of a confidence, both the assessment's. */
  figures: FigureLabels;
}) {
  const { spacing } = useTheme();

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ flexDirection: 'row', gap: spacing.xl }}>
        <Side label={block.leftLabel} grade={block.left} figures={figures} />
        <Side label={block.rightLabel} grade={block.right} figures={figures} />
      </View>

      <View
        accessible
        accessibilityLabel={COPY.a11y.figure(block.label, `${block.differencePoints}`)}
        style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.md }}>
        <Text variant="subhead" color="textSecondary" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
          {block.label}
        </Text>
        <Text variant="headline">{block.differencePoints}</Text>
        <Text variant="caption" color="textTertiary" numberOfLines={1}>
          {figures.pointsLabel}
        </Text>
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
