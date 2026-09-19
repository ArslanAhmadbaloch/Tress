/**
 * One region of the head, read back.
 *
 * The workhorse of the detailed analysis: the crop the scan actually
 * took, the region's name, its Visual Coverage out of a hundred with the
 * confidence the engine measured on that reading under it, and — where
 * this scan measured them — the share of the region that read as scalp,
 * the difference between the two sides, and the difference from the
 * baseline. Under them, the one observation the model wrote for this
 * region.
 *
 * ── The confidence travels with the score ─────────────────────────────
 * Never a bare number. `grade.ts` puts it plainly: a score shown without
 * its confidence is a claim this app does not make, so the figure and
 * how much it deserves to be believed are one group on the card and one
 * sentence to a screen reader. The scale beside the figure is the
 * assessment's word for it, handed down — the card does not compose a
 * "/100" of its own.
 *
 * ── Absent, never zero ────────────────────────────────────────────────
 * A figure the scan did not produce is not drawn. No dash standing in
 * for a number, no bar at zero, no "0" for a region no frame reached. A
 * card whose grade is null keeps its name, its crop and its observation
 * — the scan saw the place and could not read it well enough to put a
 * figure on it, which is what the observation says — and carries no
 * score line at all.
 *
 * ── The difference from the baseline ──────────────────────────────────
 * Drawn only where `compareScans` decided the difference cleared the two
 * scans' own margin of error; an `unchanged` or `insufficient` verdict
 * draws nothing. A card that printed "+1" for a phone held slightly
 * differently would have invented a change, and the row is silent rather
 * than quietly reassuring.
 *
 * ── What Premium holds ────────────────────────────────────────────────
 * The figures are free and the working is held: a locked card keeps its
 * name, its crop and every measured figure, and its observation becomes
 * a held block — a free reading that was vaguer about the same frames
 * would be a worse reading sold as a lesser one. One button under the
 * cards opens the paywall.
 *
 * Every label, every sentence and every figure is the model's. What is
 * decided here is the glyph beside a region's name and nothing else.
 */

import { View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { CardsBlock, RegionCard, ScanRegion } from '@/features/hair-scan/report-model';
import { iconSize, useTheme } from '@/theme';
import type { Photo } from '@/types/domain';

import { ConfidenceNote, CoverageBar, confidenceFigure, type FigureLabels } from './assessment';
import { HAIR_SCAN_SECTION_COPY as COPY } from './index';
import { HeldBlock, LockCta } from './locked';
import { RegionCrop, ROW_CROP } from './region-crop';
import { Bubble, Eyebrow } from './section';
import { HAIR_SCAN_REPORT_UI_COPY as UI } from './ui-copy';

/** The glyph beside each region's name. A place, not a grade. */
export const REGION_ICON: Record<ScanRegion, IconName> = {
  hairline: 'follicle',
  leftTemple: 'profile',
  rightTemple: 'profile',
  midScalp: 'target',
  crown: 'circle',
  partLine: 'compare',
};

/** The labels a card puts on its figures. All of them the model's. */
export type RegionCardLabels = Pick<
  CardsBlock,
  'coverageLabel' | 'scalpLabel' | 'differenceLabel' | 'changeLabel'
> &
  FigureLabels;

/** A small labelled figure under the score: a share, a difference, a change. */
function Figure({ label, value }: { label: string; value: string }) {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={COPY.a11y.figure(label, value)} style={{ gap: spacing.xxs, minWidth: 0 }}>
      <Text variant="caption" color="textTertiary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="headline" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function RegionCardView({
  card,
  labels,
  photo,
  locked = false,
}: {
  card: RegionCard;
  labels: RegionCardLabels;
  /** The photograph the crop was cut from, for the mask. */
  photo: Pick<Photo, 'maskTrace' | 'width' | 'height'> | null;
  locked?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();

  /*
    The model's figure, not one worked out here. It is the same
    arithmetic as the sentence in the comparison below — rounded away
    from zero, floored at one — and the card used to do its own, which
    let one measurement read as two different numbers on one screen.
  */
  const shift = card.changePoints;

  const figures: { key: string; label: string; value: string }[] = [];
  if (card.visibleScalp !== null) {
    figures.push({ key: 'scalp', label: labels.scalpLabel, value: `${card.visibleScalp}` });
  }
  if (card.symmetry !== undefined) {
    figures.push({ key: 'difference', label: labels.differenceLabel, value: `${card.symmetry}` });
  }
  if (shift !== null && shift !== 0) {
    figures.push({
      key: 'change',
      label: labels.changeLabel,
      value: `${shift > 0 ? '+' : '−'}${Math.abs(shift)}`,
    });
  }

  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing.lg,
        gap: spacing.lg,
      }}>
      <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' }}>
        {card.crop ? (
          <RegionCrop crop={card.crop} photo={photo} label={UI.a11y.cropLabel(card.label)} />
        ) : (
          <View
            accessible={false}
            style={{
              width: ROW_CROP,
              height: ROW_CROP,
              borderRadius: radius.md,
              backgroundColor: colors.fill,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name="photo" size={iconSize.lg} color={colors.textTertiary} />
          </View>
        )}

        <View style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
          <Eyebrow icon={<Icon name={REGION_ICON[card.region]} size={iconSize.sm} color={colors.accent} />}>
            {card.label}
          </Eyebrow>

          {card.grade ? (
            <View style={{ gap: spacing.sm }}>
              <View
                accessible
                accessibilityLabel={COPY.a11y.figure(
                  labels.coverageLabel,
                  `${card.grade.score} ${labels.scoreScale}`,
                  `${labels.confidenceLabel} ${confidenceFigure(card.grade.confidence)}`,
                )}
                style={{ gap: spacing.xxs }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flexWrap: 'wrap' }}>
                  <Text variant="metric">{card.grade.score}</Text>
                  <Text variant="callout" color="textTertiary">
                    {labels.scoreScale}
                  </Text>
                </View>
                <ConfidenceNote label={labels.confidenceLabel} confidence={card.grade.confidence} />
              </View>
              <CoverageBar points={card.grade.score} />
            </View>
          ) : null}
        </View>
      </View>

      {figures.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: spacing.xxl, flexWrap: 'wrap' }}>
          {figures.map((f) => (
            <Figure key={f.key} label={f.label} value={f.value} />
          ))}
        </View>
      ) : null}

      {locked ? (
        <HeldBlock lines={3} />
      ) : (
        <Bubble>
          <Text variant="footnote" color="textSecondary">
            {card.observation}
          </Text>
        </Bubble>
      )}
    </View>
  );
}

/** The cards the open tab leaves, in the model's order. */
export function RegionCards({
  block,
  figures,
  cards,
  photoFor,
  onSeeFull,
}: {
  block: CardsBlock;
  /** The scale and the name of a confidence, both the assessment's. */
  figures: FigureLabels;
  /** `block.cards` through the open tab; the screen filters, the model orders. */
  cards: RegionCard[];
  photoFor: (uri: string) => Pick<Photo, 'maskTrace' | 'width' | 'height'> | null;
  /** Opens the paywall. Drawn once under the cards when they are held. */
  onSeeFull: () => void;
}) {
  const { spacing } = useTheme();
  const labels: RegionCardLabels = { ...block, ...figures };
  return (
    <View style={{ gap: spacing.md }}>
      {cards.map((card) => (
        <RegionCardView
          key={card.region}
          card={card}
          labels={labels}
          locked={block.locked}
          photo={card.crop ? photoFor(card.crop.uri) : null}
        />
      ))}
      {block.locked ? <LockCta onPress={onSeeFull} style={{ marginTop: spacing.sm }} /> : null}
    </View>
  );
}
