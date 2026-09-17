/**
 * The cards of the hair scan report.
 *
 * Each one is a visual observation about the captured images — never a
 * verdict about the person — and every word on it comes from
 * features/hair-scan/report-copy.ts through features/hair-scan/result.ts,
 * so nothing here can say anything the honesty sweep has not read.
 *
 * Two forms of the same card. The compact one sits in the Overview like
 * the reference's list: a thumbnail, the region in the accent, the
 * title, the sentence, and the working in a quiet bubble underneath. The
 * expanded one fills its own tab: the image or pair of images large with
 * the segmenter's mask drawn over them where a trace exists, the ring,
 * the figures, and what a second scan lets it compare.
 *
 * A third form is the locked one, for a reader without Premium: the same
 * region, title, headline and working the Overview showed — the working
 * is where each card's own qualifier lives ("area in the picture, not
 * how close the strands sit"), and a qualifier is never held back — the
 * caveat, and in place of the depth a static translucent block that
 * stands for it — shapes, never a figure — with the one button that
 * opens the paywall. What the block stands for is the images at full
 * size, the ring, the figures and the comparison line.
 *
 * Drawn with the report kit — the ring, the tone mark, the reveal, the
 * mask overlay — rather than re-drawn, so the funnel's reading and this
 * one look like one document written at two moments.
 *
 * Images here are thumbnails on purpose. The one photograph drawn the
 * width of the screen is the hero above these cards, which loads the
 * full file; the frames inside a card are half-width at most and the
 * 320px thumbnail is sharp there. The mask projects through the same
 * cover fit either way, because the thumbnail keeps the photograph's
 * aspect.
 */

import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  MASK_DELAY,
  MaskOverlay,
  ReadingRing,
  ToneMark,
  frameAspect,
  maskTraceOf,
} from '@/components/report';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { LIGHTING_COPY, classifyLighting } from '@/features/hair-scan/lighting';
import { HAIR_SCAN_REPORT_COPY as COPY } from '@/features/hair-scan/report-copy';
import {
  areaReading,
  type GatedObservation,
  type HairScanResult,
  type ScanObservation,
} from '@/features/hair-scan/result';
import { iconSize, useTheme } from '@/theme';
import { ANGLE_LABELS, type Photo } from '@/types/domain';

/** Side of the square thumbnail in a compact card. */
const THUMB = 84;

/** The tallest a frame in an expanded card is drawn. */
const FRAME_MAX_HEIGHT = 360;

/* ------------------------------- one frame ------------------------------- */

/**
 * A kept image, with the mask drawn on it when there is one to draw.
 *
 * The overlay is gated exactly as the hero gates it: a parsed trace, a
 * measured width, and a photograph with dimensions — without the last
 * the projector has no fit to invert and the mask would sit off the head
 * with nothing thrown.
 */
export function FramePhoto({
  photo,
  delay = MASK_DELAY,
  measured,
  style,
}: {
  photo: Photo;
  /** When the mask begins to sweep in, so it can wait for its card. */
  delay?: number;
  /** Whether an area reading is on this photograph, for the chip. */
  measured: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing } = useTheme();
  const [width, setWidth] = useState(0);

  const aspect = frameAspect(photo);
  const height = width > 0 ? Math.min(FRAME_MAX_HEIGHT, Math.round(width / aspect)) : 0;
  const trace = useMemo(() => maskTraceOf(photo), [photo]);
  const hasMask = trace !== null && width > 0 && photo.width > 0 && photo.height > 0;

  return (
    <View
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={[
        {
          borderRadius: radius.md,
          overflow: 'hidden',
          backgroundColor: colors.backgroundSubtle,
          height: height || undefined,
          aspectRatio: height ? undefined : aspect,
        },
        style,
      ]}>
      <Image
        source={{ uri: photo.thumbnailUri ?? photo.uri }}
        contentFit="cover"
        transition={200}
        accessibilityLabel={`${ANGLE_LABELS[photo.angle]} image`}
        style={{ width: '100%', height: '100%' }}
      />

      {hasMask && trace ? (
        <MaskOverlay
          trace={trace}
          photoWidth={photo.width}
          photoHeight={photo.height}
          width={width}
          height={height}
          shown
          delay={delay}
        />
      ) : null}

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: spacing.sm,
          left: spacing.sm,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.sm + spacing.xxs,
          borderRadius: radius.pill,
          backgroundColor: colors.photoScrim,
        }}>
        <Text variant="caption" color="textOnPhoto">
          {ANGLE_LABELS[photo.angle]}
        </Text>
      </View>

      {measured ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: spacing.sm,
            right: spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            paddingVertical: spacing.xs,
            paddingHorizontal: spacing.sm + spacing.xxs,
            borderRadius: radius.pill,
            backgroundColor: colors.photoScrim,
          }}>
          <Icon name="check" size={iconSize.xs} color={colors.accent} />
          <Text variant="caption" color="textOnPhoto">
            {COPY.frames.measured}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ----------------------------- the region row ---------------------------- */

function RegionRow({ observation }: { observation: ScanObservation }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <ToneMark tone={observation.tone} />
      <Text variant="caption" color="accent" numberOfLines={1}>
        {observation.region}
      </Text>
    </View>
  );
}

/** The working, in the quiet bubble the reference puts it in. */
function DetailBubble({ text }: { text: string }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.backgroundSubtle,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
      }}>
      <Text variant="footnote" color="textSecondary">
        {text}
      </Text>
    </View>
  );
}

/** A number that was computed, with what it is a number of. */
function Figure({ label, value }: { label: string; value: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xxs, minWidth: 0 }}>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="headline" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/* ------------------------------ compact card ----------------------------- */

/**
 * One observation as the Overview lists it. A tap opens its tab, and the
 * whole card is the target: the chevron says so, the label reads the
 * sentence out, and the working underneath is not a separate control.
 */
export function ObservationRow({
  observation,
  onOpen,
}: {
  observation: ScanObservation;
  onOpen: (id: ScanObservation['id']) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const lead = observation.photos[0];

  return (
    <Card
      onPress={() => onOpen(observation.id)}
      accessibilityLabel={`${observation.title}. ${observation.headline}`}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        {lead ? (
          <Image
            source={{ uri: lead.thumbnailUri ?? lead.uri }}
            contentFit="cover"
            transition={200}
            accessible={false}
            style={{
              width: THUMB,
              height: THUMB,
              borderRadius: radius.md,
              backgroundColor: colors.backgroundSubtle,
            }}
          />
        ) : (
          <View
            accessible={false}
            style={{
              width: THUMB,
              height: THUMB,
              borderRadius: radius.md,
              backgroundColor: colors.fill,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name="photo" size={iconSize.lg} color={colors.textTertiary} />
          </View>
        )}

        <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
          <RegionRow observation={observation} />
          <Text variant="headline">{observation.title}</Text>
          <Text variant="subhead" color="textSecondary">
            {observation.headline}
          </Text>
        </View>

        <Icon name="chevronRight" size={iconSize.sm} color={colors.textTertiary} />
      </View>

      <View style={{ marginTop: spacing.md }}>
        <DetailBubble text={observation.detail} />
      </View>
    </Card>
  );
}

/* ----------------------------- expanded card ----------------------------- */

/** Photographs in rows of two, in the order given. */
export function pairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

/**
 * One observation filling its tab: the images, the ring, the figures,
 * the sentence, the working, and what the next scan sets beside it.
 */
export function ObservationCard({
  observation,
  delay = 0,
}: {
  observation: ScanObservation;
  /** When the card's ring and mask begin, so they wait for the card. */
  delay?: number;
}) {
  const { colors, radius, spacing } = useTheme();
  const { photos, ring, figures } = observation;
  const measuredIds = new Set(photos.filter((p) => areaReading(p) !== null).map((p) => p.id));

  return (
    <Card>
      <RegionRow observation={observation} />
      <Text variant="title3" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
        {observation.title}
      </Text>

      {/*
        Every photograph the card is about, two to a row — the Coverage
        card says "all measured images" and has to show all of them. A
        row with one image keeps it at half width with an empty seat
        beside it, so the last frame is the same size as the others.
      */}
      {photos.length > 0 ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {pairs(photos).map((row, i) => (
            <View key={row.map((p) => p.id).join('+') || String(i)} style={{ flexDirection: 'row', gap: spacing.sm }}>
              {row.map((photo) => (
                <FramePhoto
                  key={photo.id}
                  photo={photo}
                  measured={measuredIds.has(photo.id)}
                  delay={delay + MASK_DELAY}
                  style={{ flex: 1 }}
                />
              ))}
              {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </View>
      ) : null}

      {ring || figures.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xl,
            marginTop: spacing.xl,
          }}>
          {ring ? (
            <ReadingRing
              value={ring.value}
              label={ring.label}
              size={104}
              thickness={8}
              delay={delay + 200}
              variant="subhead"
            />
          ) : null}
          {figures.length > 0 ? (
            <View style={{ flex: 1, minWidth: 0, gap: spacing.md }}>
              {figures.map((f) => (
                <Figure key={f.label} label={f.label} value={f.value} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <Text variant="subhead" style={{ marginTop: spacing.xl }}>
        {observation.headline}
      </Text>
      <View style={{ marginTop: spacing.md }}>
        <DetailBubble text={observation.detail} />
      </View>

      <View
        style={{
          marginTop: spacing.md,
          flexDirection: 'row',
          gap: spacing.sm,
          alignItems: 'flex-start',
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: colors.accentSoft,
        }}>
        <View style={{ paddingTop: 2 }}>
          <Icon name="leaf" size={iconSize.sm} color={colors.accent} />
        </View>
        <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
          {observation.compare}
        </Text>
      </View>
    </Card>
  );
}

/* ------------------------------ locked card ------------------------------ */

/**
 * The block's shapes, in the sizes the real depth is drawn at, so the
 * held part takes the room it would take: the ring is the reading ring
 * at the card's thumbnail size, the bars are lines of the figures. The
 * theme has no opacity scale — these are the block's own, like `THUMB`
 * above is the compact card's own.
 */
/** Opacity of the shapes under the wash. */
const HELD_OPACITY = 0.4;
/** Opacity of the wash over them: most of the way to the surface colour. */
const HELD_WASH_OPACITY = 0.55;
/** Side of the faint ring, and the thickness of its stroke. */
const HELD_RING = 72;
const HELD_RING_STROKE = 8;

/**
 * The shapes the depth would have had — a ring's circle, a few lines of
 * figures — drawn faint and covered by a translucent wash so they read
 * as something held back rather than something broken. Nothing in it is
 * a number, and it cannot be pressed: the button under it is the only
 * control, and the block's own accessible name says what it is.
 */
function HeldBlock({ label }: { label: string }) {
  const { colors, radius, spacing } = useTheme();
  const bar = (width: `${number}%`) => (
    <View
      style={{
        height: spacing.md,
        width,
        borderRadius: radius.pill,
        backgroundColor: colors.fill,
      }}
    />
  );

  return (
    <View
      accessible
      accessibilityLabel={label}
      pointerEvents="none"
      style={{
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: colors.backgroundSubtle,
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.lg,
      }}>
      <View style={{ opacity: HELD_OPACITY, flexDirection: 'row', alignItems: 'center', gap: spacing.xl }}>
        <View
          style={{
            width: HELD_RING,
            height: HELD_RING,
            borderRadius: HELD_RING / 2,
            borderWidth: HELD_RING_STROKE,
            borderColor: colors.fill,
          }}
        />
        <View style={{ flex: 1, gap: spacing.md }}>
          {bar('62%')}
          {bar('84%')}
          {bar('48%')}
        </View>
      </View>
      {/* The wash: the surface colour, most of the way opaque, over the shapes. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.backgroundSubtle, opacity: HELD_WASH_OPACITY },
        ]}
      />
    </View>
  );
}

/**
 * One observation with its depth held back: the same region, title,
 * headline and working the Overview showed, the caveat that is never
 * held, the block that stands for the rest — the images at full size,
 * the ring, the figures, the comparison line — and the one button that
 * opens the paywall.
 *
 * The working stays because it is where the card qualifies its own
 * headline: "area in the picture, not how close the strands sit", "is
 * not thickness", "not a scalp measurement". A headline shown with its
 * qualifier held back would be a more confident reading than the paid
 * one of the same pictures, and the Overview shows it anyway.
 */
export function LockedObservationCard({
  gated,
  onSeeFull,
}: {
  gated: GatedObservation;
  /** Opens the paywall. */
  onSeeFull: () => void;
}) {
  const { spacing } = useTheme();
  const { observation } = gated;

  return (
    <Card>
      <RegionRow observation={observation} />
      <Text variant="title3" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
        {observation.title}
      </Text>

      <Text variant="subhead" style={{ marginTop: spacing.lg }}>
        {observation.headline}
      </Text>
      <View style={{ marginTop: spacing.md }}>
        <DetailBubble text={observation.detail} />
      </View>
      <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.md }}>
        {gated.caveat}
      </Text>

      <View style={{ marginTop: spacing.lg }}>
        <HeldBlock label={gated.placeholder} />
      </View>

      <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.md }}>
        {gated.body}
      </Text>

      <Button
        label={gated.button}
        variant="secondary"
        size="md"
        icon="lock"
        onPress={onSeeFull}
        accessibilityHint={COPY.locked.hint}
        style={{ marginTop: spacing.lg }}
      />
    </Card>
  );
}

/* ------------------------------- meta tiles ------------------------------ */

type MetaTile = { label: string; value: string; hint?: string };

/** The scan's facts about its own run, as tiles. Only what was recorded. */
export function metaTiles(result: HairScanResult): MetaTile[] {
  const { metadata } = result;
  const tiles: MetaTile[] = [];

  if (metadata.scanDuration !== null) {
    tiles.push({
      label: COPY.meta.duration,
      value: COPY.meta.seconds(Math.round(metadata.scanDuration / 1000)),
    });
  }
  if (metadata.completion !== null) {
    const n = Math.round(metadata.completion * 100);
    tiles.push({
      label: COPY.meta.completion,
      value: COPY.meta.percent(n),
      hint: COPY.meta.completionHint(n),
    });
  }
  /*
    The frames the scanner held during the turn are not the images that
    survived curation, and the strip under these tiles shows the second
    under its own title. With a scan block the tile prints the first and
    names the second in its hint; without one there was no turn to count,
    and the only number is the images themselves.
  */
  if (metadata.frameCount !== null) {
    tiles.push({
      label: COPY.meta.framesCaptured,
      value: COPY.meta.count(metadata.frameCount),
      hint: result.frames.length > 0 ? COPY.meta.keptHint(result.frames.length) : undefined,
    });
  } else {
    tiles.push({ label: COPY.meta.frames, value: COPY.meta.count(result.frames.length) });
  }
  if (metadata.scanDuration !== null) {
    // The reading is mean luminance, 0–1 of full white, and a bare percent
    // of that reads as a score; the pill's own word for the same number
    // is what the scan showed while it ran, so it is what the tile shows.
    tiles.push({
      label: COPY.meta.lighting,
      value:
        metadata.lighting === null
          ? COPY.meta.unmeasured
          : LIGHTING_COPY[classifyLighting(metadata.lighting)].label,
      hint: metadata.lighting === null ? undefined : COPY.meta.lightingHint,
    });
  }
  return tiles;
}

export function ScanMetaTiles({ result }: { result: HairScanResult }) {
  const { colors, radius, spacing, shadow } = useTheme();
  const tiles = metaTiles(result);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
      {tiles.map((tile) => (
        <View
          key={tile.label}
          accessible
          accessibilityLabel={`${tile.label}: ${tile.value}${tile.hint ? `. ${tile.hint}` : ''}`}
          style={[
            {
              flexGrow: 1,
              flexBasis: '40%',
              paddingVertical: spacing.lg,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              gap: spacing.xs,
            },
            shadow.soft,
          ]}>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {tile.label}
          </Text>
          <Text variant="title3" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {tile.value}
          </Text>
          {tile.hint ? (
            <Text variant="footnote" color="textTertiary" numberOfLines={2}>
              {tile.hint}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/* ------------------------------ frame strip ------------------------------ */

/** The kept images in a row, each with its angle and whether it was measured. */
export function FrameStrip({ result }: { result: HairScanResult }) {
  const { colors, radius, spacing } = useTheme();

  return (
    <Card>
      <Text variant="title3" accessibilityRole="header">
        {COPY.frames.title}
      </Text>
      <Text variant="footnote" color="textSecondary" style={{ marginTop: spacing.xs }}>
        {result.frames.length > 0 ? COPY.frames.body : COPY.frames.noneBody}
      </Text>

      {result.frames.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: spacing.lg, marginHorizontal: -spacing.xl }}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
          {result.frames.map((frame) => (
            <View
              key={frame.angle}
              accessible
              accessibilityLabel={`${ANGLE_LABELS[frame.angle]} image, ${
                frame.measured ? COPY.frames.measured : COPY.frames.kept
              }`}
              style={{ width: 88, gap: spacing.sm }}>
              <Image
                source={{ uri: frame.thumbnailUri ?? frame.uri }}
                contentFit="cover"
                transition={200}
                accessible={false}
                style={{
                  width: 88,
                  height: 112,
                  borderRadius: radius.md,
                  backgroundColor: colors.backgroundSubtle,
                }}
              />
              <Text variant="caption" numberOfLines={1}>
                {ANGLE_LABELS[frame.angle]}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <ToneMark tone={frame.measured ? 'good' : 'neutral'} size={6} />
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {frame.measured ? COPY.frames.measured : COPY.frames.kept}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </Card>
  );
}
