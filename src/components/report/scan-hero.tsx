/**
 * Their photograph, with what was measured drawn over it.
 *
 * The overlay is arithmetic, not illustration. The band across the top
 * is the upper third of the frame — the exact region the segmenter's
 * `upperFraction` was counted over — and the callout on it carries that
 * number. The bar along the bottom is the whole-frame fraction. The
 * midline, when the reading includes a left/right split, is where the
 * split was taken. Nothing is drawn that was not counted: no hairline
 * curve traced by eye, no heat map, no dots scattered to look clinical.
 *
 * ── Why the band is mapped rather than placed ─────────────────────────
 * The frame shows the photograph with `cover` fit, which can crop a
 * little from the top and bottom of a tall picture. The segmenter's
 * upper third is a third of the *photograph*, so the band's edge is
 * projected through that crop rather than drawn at a third of the frame.
 * Get that wrong and the label says 41% about a region that is not the
 * one it was measured on — a small lie in the one place the screen is
 * supposed to be exact.
 *
 * With no coverage reading the frame is just the photograph. A band
 * with no number behind it would be decoration wearing a lab coat.
 */

import { Image } from 'expo-image';
import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import type { ScanReading } from '@/features/assessment/scan-reading';
import { useTheme } from '@/theme';
import type { Photo } from '@/types/domain';

/** The frame's proportions are the photograph's, held inside this range. */
const MIN_ASPECT = 0.74;
const MAX_ASPECT = 1;

/** How long the overlay waits after the photograph before drawing. */
const OVERLAY_DELAY = 700;

/** Where a fraction of the photograph lands inside the frame, under cover fit. */
function projector(photo: Photo, frameW: number, frameH: number) {
  const pw = photo.width > 0 ? photo.width : frameW;
  const ph = photo.height > 0 ? photo.height : frameH;
  const scale = Math.max(frameW / pw, frameH / ph);
  const drawnW = pw * scale;
  const drawnH = ph * scale;
  const offX = (frameW - drawnW) / 2;
  const offY = (frameH - drawnH) / 2;
  return {
    x: (fx: number) => offX + fx * drawnW,
    y: (fy: number) => offY + fy * drawnH,
  };
}

function Callout({
  caption,
  value,
  style,
}: {
  caption: string;
  value: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing, shadow } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          alignItems: 'flex-start',
        },
        shadow.soft,
        style,
      ]}>
      <Text variant="micro" color="textSecondary">
        {caption}
      </Text>
      <Text variant="headline" style={{ marginTop: 1 }}>
        {value}
      </Text>
    </View>
  );
}

export function ScanHero({
  reading,
  eyebrow,
  style,
}: {
  reading: ScanReading;
  /** The chip in the corner: which shot this is and when. */
  eyebrow?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing, shadow } = useTheme();
  const [width, setWidth] = useState(0);

  const { photo, overlay } = reading;
  const natural = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 0.8;
  const aspect = Math.max(MIN_ASPECT, Math.min(MAX_ASPECT, natural));
  const height = width > 0 ? Math.round(width / aspect) : 0;

  const project = width > 0 ? projector(photo, width, height) : null;
  const bandBottom = project ? project.y(1 / 3) : 0;
  const midX = width / 2;

  const upperPct = overlay ? Math.round(overlay.upperFraction * 100) : 0;
  const framePct = overlay ? Math.round(overlay.fraction * 100) : 0;
  const leftPct = overlay?.leftShare !== null && overlay ? Math.round(overlay.leftShare * 100) : null;

  return (
    <View
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={[{ borderRadius: radius.lg, backgroundColor: colors.surface }, shadow.lifted, style]}>
      <View
        style={{
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: colors.backgroundSubtle,
          width: '100%',
          height: height || undefined,
          aspectRatio: height ? undefined : aspect,
        }}>
        {/*
          Full resolution on purpose: this is the one photograph the screen
          is about, drawn the width of the screen, and the 320px thumbnail
          would read as soft on exactly the screen whose job is to say
          whether the shot was sharp. The thumbnail paints first, so the
          frame is never empty while the full file decodes.
        */}
        <Image
          source={{ uri: reading.photo.uri }}
          placeholder={photo.thumbnailUri ? { uri: photo.thumbnailUri } : undefined}
          placeholderContentFit="cover"
          contentFit="cover"
          transition={240}
          accessibilityLabel="Your photograph"
          style={{ width: '100%', height: '100%' }}
        />

        {overlay && project && width > 0 ? (
          <Animated.View
            entering={FadeIn.delay(OVERLAY_DELAY).duration(600)}
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, width, height }}>
            <Svg width={width} height={height} accessible={false}>
              {/* The upper third, as counted. */}
              <Rect
                x={0}
                y={0}
                width={width}
                height={Math.max(0, bandBottom)}
                fill={colors.accent}
                fillOpacity={0.16}
              />
              <Line
                x1={0}
                y1={bandBottom}
                x2={width}
                y2={bandBottom}
                stroke={colors.textOnPhoto}
                strokeOpacity={0.85}
                strokeWidth={1.5}
                strokeDasharray="6 5"
              />
              <Circle
                cx={width - spacing.xxxl}
                cy={bandBottom}
                r={4}
                fill={colors.textOnPhoto}
              />
              <Circle
                cx={width - spacing.xxxl}
                cy={bandBottom}
                r={8}
                fill={colors.textOnPhoto}
                fillOpacity={0.28}
              />

              {/* The centre line the left/right split was taken on. */}
              {leftPct !== null ? (
                <Line
                  x1={midX}
                  y1={bandBottom}
                  x2={midX}
                  y2={height - spacing.huge}
                  stroke={colors.textOnPhoto}
                  strokeOpacity={0.45}
                  strokeWidth={1}
                  strokeDasharray="3 6"
                />
              ) : null}

              {/* Whole-frame coverage, as a bar along the bottom edge. */}
              <Rect
                x={spacing.lg}
                y={height - spacing.lg - 4}
                width={width - spacing.lg * 2}
                height={4}
                rx={2}
                fill={colors.textOnPhoto}
                fillOpacity={0.35}
              />
              <Rect
                x={spacing.lg}
                y={height - spacing.lg - 4}
                width={Math.max(4, (width - spacing.lg * 2) * Math.min(1, overlay.fraction))}
                height={4}
                rx={2}
                fill={colors.textOnPhoto}
              />
            </Svg>

            <Callout
              caption="Upper frame"
              value={`${upperPct}% hair`}
              style={{ right: spacing.lg, top: bandBottom + spacing.md }}
            />
            <Callout
              caption="Whole frame"
              value={`${framePct}% hair`}
              style={{ left: spacing.lg, bottom: spacing.xxxl }}
            />
            {leftPct !== null ? (
              <Callout
                caption="Left · right"
                value={`${leftPct}% · ${100 - leftPct}%`}
                style={{ right: spacing.lg, bottom: spacing.xxxl }}
              />
            ) : null}
          </Animated.View>
        ) : null}

        {eyebrow ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: spacing.md,
              left: spacing.md,
              paddingVertical: spacing.xs + 1,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              backgroundColor: colors.photoScrim,
            }}>
            <Text variant="caption" color="textOnPhoto">
              {eyebrow}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
