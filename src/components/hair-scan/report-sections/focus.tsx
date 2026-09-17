/**
 * "Your focus": whether the turn reached the part of the head the person
 * said they are watching.
 *
 * Three crops in a row, the regions in the accent, the goal they chose
 * as the title, a pill with the status, a thin bar from "Not captured"
 * to "Captured" filled to the share of the focus regions a frame
 * reached, and the paragraph. The pill is filled in the accent with a
 * tick only when every focus region was reached; a partial or missed
 * turn gets a quiet pill, so the pill never looks like a pass for a
 * status that is not one. For a goal no photograph can cover — the
 * model's `notVisible` — there is no bar: a coverage bar at zero would
 * read as a failed scan rather than a thing a scan does not see. The
 * bar is coverage of a region — frames kept — and never a reading of
 * it; the model's words say so and this block adds none of its own.
 *
 * Without Premium the crops and the goal — the person's own answer —
 * stay, and the status, the bar and the paragraph are one held block.
 */

import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { FocusBlock } from '@/features/hair-scan/report-model';
import { iconSize, useTheme } from '@/theme';
import type { Photo } from '@/types/domain';

import { HeldBlock } from './locked';
import { FOCUS_CROP, RegionCrop } from './region-crop';
import { Eyebrow } from './section';
import { HAIR_SCAN_REPORT_UI_COPY as UI } from './ui-copy';

/** The bar's thickness and the tick at its end. */
const BAR = 5;
const BAR_TICK = 14;

export function FocusBlockView({
  focus,
  photoFor,
}: {
  focus: NonNullable<FocusBlock>;
  photoFor: (uri: string) => Pick<Photo, 'maskTrace' | 'width' | 'height'> | null;
}) {
  const { colors, radius, spacing } = useTheme();
  const fill = Math.max(0, Math.min(1, focus.coverage));
  const captured = focus.status === 'captured';
  /** No bar for a goal a scan cannot cover: there is nothing to fill. */
  const hasBar = focus.status !== 'notVisible' && focus.regions.length > 0;

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
      {focus.crops.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
          {focus.crops.map((crop, i) => (
            <RegionCrop
              key={`${crop.uri}:${i}`}
              crop={crop}
              photo={photoFor(crop.uri)}
              size={FOCUS_CROP}
              label={UI.a11y.cropLabel(focus.regionsLabel)}
              showApproximate={false}
            />
          ))}
        </View>
      ) : null}

      <Eyebrow icon={<Icon name="target" size={iconSize.sm} color={colors.accent} />}>{focus.regionsLabel}</Eyebrow>

      <Text variant="title3" center accessibilityRole="header">
        {focus.goalLabel}
      </Text>

      {focus.locked ? (
        <HeldBlock lines={4} style={{ alignSelf: 'stretch' }} />
      ) : (
        <>
          <View
            accessible
            accessibilityLabel={focus.statusLabel}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs + spacing.xxs,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.pill,
              backgroundColor: captured ? colors.accent : colors.fill,
            }}>
            <Icon
              name={captured ? 'checkCircle' : focus.status === 'notVisible' ? 'info' : 'circle'}
              size={iconSize.sm}
              color={captured ? colors.textOnAccent : colors.textSecondary}
            />
            <Text variant="subhead" color={captured ? 'textOnAccent' : 'textSecondary'}>
              {focus.statusLabel}
            </Text>
          </View>

          {hasBar ? (
            <View
              accessible
              accessibilityLabel={`${UI.focus.framesLabel(focus.framesCaptured)}. ${UI.focus.barValue(Math.round(fill * 100))}. ${focus.statusLabel}`}
              style={{ alignSelf: 'stretch', marginTop: spacing.sm, gap: spacing.sm }}>
              <View style={{ height: BAR_TICK, justifyContent: 'center' }}>
                <View style={{ height: BAR, borderRadius: radius.pill, backgroundColor: colors.fill }} />
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    height: BAR,
                    width: `${Math.round(fill * 100)}%`,
                    borderRadius: radius.pill,
                    backgroundColor: colors.accent,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    right: 0,
                    width: BAR,
                    height: BAR_TICK,
                    borderRadius: radius.pill,
                    backgroundColor: fill >= 1 ? colors.accent : colors.fillSelected,
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="caption" color="textTertiary">
                  {UI.focus.barStart}
                </Text>
                <Text variant="caption" color={fill >= 1 ? 'text' : 'textTertiary'}>
                  {UI.focus.barEnd}
                </Text>
              </View>
            </View>
          ) : null}

          <Text variant="footnote" color="textSecondary" style={{ alignSelf: 'stretch', marginTop: spacing.xs }}>
            {focus.body}
          </Text>
        </>
      )}
    </View>
  );
}
