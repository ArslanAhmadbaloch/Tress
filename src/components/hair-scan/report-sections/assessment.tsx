/**
 * "Your hair assessment": the figure the scan actually produced, and the
 * map of where it came from.
 *
 * The top of the sheet, and the first thing anybody sees after the
 * still: one Visual Coverage score out of a hundred with the confidence
 * the scan measured on itself beside it, the line that says what the
 * number is a reading of, and then the head, tinted region by region.
 * The arc is `grade-dial.tsx` and the head is `coverage-map.tsx`;
 * neither of them chooses a word, and neither of them decides anything.
 * This file is what hands them the model's figures and the model's
 * labels.
 *
 * ── Absent, never zero ────────────────────────────────────────────────
 * An overall figure the engine could not average is null, and the dial
 * draws a bare track with the model's own "not read" word in the middle
 * of it. A region with no reading reaches the map as null and is drawn
 * as a dashed outline. Nothing in this section substitutes a zero for a
 * reading nobody took.
 *
 * The section computes nothing. Every score arrives whole from the
 * model, every confidence arrives as the model's own sentence, and what
 * is here is arrangement and the width of a bar.
 */

import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { COVERAGE_SCORE_MAX, confidencePercent } from '@/features/hair-scan/grade';
import type { AssessmentBlock, ScanRegion } from '@/features/hair-scan/report-model';
import { useTheme } from '@/theme';

import { CoverageMap } from './coverage-map';
import { GradeDial } from './grade-dial';
import { HeldBlock } from './locked';

/** The thickness of a coverage bar. */
const BAR = 6;

/**
 * The two words the model puts around a figure: what the scale is, and
 * what the number beside it is called.
 *
 * They live on the assessment because the scale is the report's, not any
 * one section's — "out of 100" is said once and the sections that draw a
 * figure are handed it rather than writing it themselves. The screen
 * passes this down to the cards, the scalp rows and the two temples so
 * none of them composes a scale or names a confidence of its own.
 */
export type FigureLabels = Pick<AssessmentBlock, 'scoreScale' | 'pointsLabel' | 'confidenceLabel'>;

/**
 * A confidence as it is written beside a score: the engine's own 0–1,
 * put into whole percent by `confidencePercent` — the same function the
 * model uses for the dial's sentence, so the two never disagree.
 */
export function confidenceFigure(confidence: number): string {
  return `${confidencePercent(confidence)}%`;
}

/**
 * The confidence that travels with a score, wherever one is drawn.
 *
 * `grade.ts` states the rule this exists for: a score shown without its
 * confidence is a claim this app does not make. So every figure out of a
 * hundred on this sheet — the overall one on the dial, each region's on
 * its card, each temple's, each scalp share — carries the number the
 * engine measured on itself, in the model's own word for it. It is drawn
 * quietly: it qualifies the figure above it rather than competing with
 * it.
 *
 * Not accessible on its own — it is read out as part of the figure it
 * belongs to, by the group around them both.
 */
export function ConfidenceNote({ label, confidence }: { label: string; confidence: number }) {
  const { spacing } = useTheme();
  return (
    <View accessible={false} style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xxs }}>
      <Text variant="caption" color="textTertiary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {confidenceFigure(confidence)}
      </Text>
    </View>
  );
}

/**
 * The slim track under a figure, filled to it. Everything the report
 * draws on a bar is already out of a hundred: a score from `gradeOf`, a
 * scalp share from `visibleScalpPointsOf`, a side difference the model
 * wrote in the same units.
 */
export function CoverageBar({ points, tone = 'accent' }: { points: number; tone?: 'accent' | 'quiet' }) {
  const { colors, radius } = useTheme();
  const width = `${Math.max(0, Math.min(COVERAGE_SCORE_MAX, points))}%` as const;
  return (
    <View
      accessible={false}
      style={{ height: BAR, borderRadius: radius.pill, backgroundColor: colors.fill, overflow: 'hidden' }}>
      <View
        style={{
          height: BAR,
          width,
          borderRadius: radius.pill,
          backgroundColor: tone === 'accent' ? colors.accent : colors.fillSelected,
        }}
      />
    </View>
  );
}

/** The overall reading: one number, what it is called, and what it is a reading of. */
export function AssessmentScore({
  assessment,
  delay = 0,
}: {
  assessment: AssessmentBlock;
  /** Milliseconds before the arc begins, so it can wait for its section to land. */
  delay?: number;
}) {
  const { colors, radius, spacing } = useTheme();

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
        gap: spacing.md,
      }}>
      <GradeDial
        score={assessment.overall?.score ?? null}
        confidence={assessment.overall?.confidence ?? null}
        label={assessment.scoreLabel}
        confidenceLabel={assessment.overallConfidence}
        emptyLabel={assessment.unreadLabel}
        delay={delay}
      />

      {/*
        The figure, its confidence and what it is a reading of are free —
        a free report that was vaguer about the same frames would be a
        worse reading sold as a lesser one — and the sentence that reads
        the figure back is the first thing Premium opens.
      */}
      {assessment.locked ? (
        <HeldBlock lines={2} style={{ alignSelf: 'stretch' }} />
      ) : assessment.summary ? (
        <Text variant="footnote" color="textSecondary" center>
          {assessment.summary}
        </Text>
      ) : null}

      <Text variant="caption" color="textTertiary" center>
        {assessment.scoreNote}
      </Text>
    </View>
  );
}

/** The coverage map: every region the scan looks for, tinted by its own figure. */
export function CoverageMapSection({
  assessment,
  onSelectRegion,
  delay = 0,
}: {
  assessment: AssessmentBlock;
  /** A region was tapped. The screen decides where that goes; the map only reports it. */
  onSelectRegion?: (region: ScanRegion) => void;
  delay?: number;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <CoverageMap
        regions={assessment.regions}
        scoreScale={assessment.scoreScale}
        onSelectRegion={onSelectRegion}
        delay={delay}
      />
      {assessment.unreadNote ? (
        <Text variant="footnote" color="textSecondary">
          {assessment.unreadNote}
        </Text>
      ) : null}
    </View>
  );
}
