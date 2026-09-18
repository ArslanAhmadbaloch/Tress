/**
 * The "Hair analysis" rows: one place per row, the way the reference
 * lists its regions.
 *
 * Each row is a rounded crop of the actual frame on the left, and on the
 * right the place named in the accent with a small glyph, the headline —
 * a fact about the frame, counted on this device — and the working in a
 * grey speech bubble. Rows are divided by a hairline rule. A row marked
 * "Measured" is one the segmenter's hair-area reading is behind; the
 * others say "Kept", and the words come from the model, not from here.
 *
 * Without Premium every row keeps its real headline and its body is a
 * held block — shapes, never a paragraph of fake text — and one button
 * under the rows opens the paywall. The headline stays because the free
 * reading must never be more confident than the paid one about the same
 * frames: what is held is the working, not the claim.
 */

import { View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Separator } from '@/components/ui/layout';
import { Text } from '@/components/ui/text';
import type { AnalysisRow } from '@/features/hair-scan/report-model';
import { iconSize, useTheme } from '@/theme';
import type { Photo } from '@/types/domain';

import { HeldBlock, LockCta } from './locked';
import { RegionCrop, ROW_CROP } from './region-crop';
import { Bubble, Eyebrow } from './section';
import { HAIR_SCAN_REPORT_UI_COPY as UI } from './ui-copy';

/** The glyph beside each region's name. */
export const ROW_ICON: Record<AnalysisRow['icon'], IconName> = {
  hairline: 'follicle',
  temple: 'profile',
  crown: 'target',
  light: 'sun',
};

function Mark({ measured, label }: { measured: boolean; label: string }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: radius.pill,
          backgroundColor: measured ? colors.accent : colors.textTertiary,
        }}
      />
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Half the crop column, so a row with two pictures keeps the row's width. */
const PAIR_GAP = 4;
const PAIR_CROP = (ROW_CROP - PAIR_GAP) / 2;

export function AnalysisRowView({
  row,
  photo,
  photo2,
  marks,
}: {
  row: AnalysisRow;
  /** The photograph the row's crop is cut from, for the mask. */
  photo: Pick<Photo, 'maskTrace' | 'width' | 'height'> | null;
  /** The second photograph, when the row shows a pair — the temples do. */
  photo2?: Pick<Photo, 'maskTrace' | 'width' | 'height'> | null;
  marks: { measured: string; kept: string };
}) {
  const { colors, spacing, radius } = useTheme();
  const second = row.crop2 ?? null;

  return (
    <View
      accessible
      accessibilityLabel={`${row.regionLabel}. ${row.headline}${row.locked ? '' : ` ${row.body}`}`}
      style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start', paddingVertical: spacing.xl }}>
      <View style={{ width: ROW_CROP, alignItems: 'flex-start' }}>
        {row.crop && second ? (
          /*
            Both temples, side by side and half the width each, because
            the scan photographs both and a report that shows one of them
            is a report of a scan that did not happen. Together they
            occupy the same column a single crop does, so no other row
            moves.
          */
          <View style={{ flexDirection: 'row', gap: PAIR_GAP }}>
            <RegionCrop
              crop={row.crop}
              photo={photo}
              size={PAIR_CROP}
              label={UI.a11y.cropLabel(row.regionLabel)}
            />
            <RegionCrop
              crop={second}
              photo={photo2 ?? null}
              size={PAIR_CROP}
              label={UI.a11y.cropLabel(row.regionLabel)}
            />
          </View>
        ) : row.crop ? (
          <RegionCrop crop={row.crop} photo={photo} label={UI.a11y.cropLabel(row.regionLabel)} />
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
        <Mark measured={row.measured} label={row.measured ? marks.measured : marks.kept} />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
        <Eyebrow icon={<Icon name={ROW_ICON[row.icon]} size={iconSize.sm} color={colors.accent} />}>
          {row.regionLabel}
        </Eyebrow>
        <Text variant="headline">{row.headline}</Text>
        {row.locked ? (
          <HeldBlock lines={3} style={{ marginTop: spacing.sm }} />
        ) : (
          <Bubble>
            <Text variant="footnote" color="textSecondary">
              {row.body}
            </Text>
          </Bubble>
        )}
      </View>
    </View>
  );
}

export function AnalysisRows({
  rows,
  marks,
  photoFor,
  onSeeFull,
}: {
  rows: AnalysisRow[];
  marks: { measured: string; kept: string };
  /** The photograph a crop was cut from, by its file. */
  photoFor: (uri: string) => Pick<Photo, 'maskTrace' | 'width' | 'height'> | null;
  /** Opens the paywall. Drawn once under the rows when any row is held. */
  onSeeFull: () => void;
}) {
  const { spacing } = useTheme();
  const anyLocked = rows.some((r) => r.locked);

  return (
    <View>
      {rows.map((row, i) => (
        <View key={row.id}>
          {i > 0 ? <Separator /> : null}
          <AnalysisRowView
            row={row}
            marks={marks}
            photo={row.crop ? photoFor(row.crop.uri) : null}
            photo2={row.crop2 ? photoFor(row.crop2.uri) : null}
          />
        </View>
      ))}
      {anyLocked ? <LockCta onPress={onSeeFull} style={{ marginTop: spacing.sm }} /> : null}
    </View>
  );
}
