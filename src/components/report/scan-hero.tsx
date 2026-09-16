/**
 * Their photograph, with what was measured drawn over it.
 *
 * The overlay is arithmetic, not illustration. The sage region is the
 * segmenter's own mask — the pixels it was at least half sure were hair,
 * at the same 0.5 threshold `coverageOf` counted at — traced from that
 * array and not drawn by anybody's hand. The line along its top is the
 * highest row the mask held for a short run in each column — not the
 * highest row it reached, which is the weaker claim the caption makes
 * and the one the tracer can defend. That is the same thing
 * said about a boundary — and it is named as that under the frame,
 * because the boldest mark on a person's face cannot be left to be
 * interpreted. The dashed rule is the upper third of the frame,
 * the exact region `upperFraction` was counted over, and the callout on
 * it carries that number. The midline, when the reading includes a
 * left/right split, is where the split was taken. The bar along the
 * bottom is the whole-frame fraction.
 *
 * Nothing is drawn that was not counted: no hairline curve traced by eye,
 * no heat map, no dots scattered to look clinical. A traced mask is not
 * what that forbids — a curve traced by eye is. The heat map is still
 * refused, and mask-overlay.tsx says why at length: the only per-location
 * quantity in this data is the model's certainty, which is not an amount
 * of hair, and coverage is area either way.
 *
 * Every percentage on this screen comes from the coverage reading and
 * never from the polygon: after simplification the filled outline differs
 * from the counted pixel area by a fraction of a point, so nothing derived
 * from the trace may ever produce a string.
 *
 * ── Why the geometry is mapped rather than placed ─────────────────────
 * The frame shows the photograph with `cover` fit, which can crop a
 * little from the top and bottom of a tall picture. The segmenter's upper
 * third is a third of the *photograph*, so the band's edge is projected
 * through that crop rather than drawn at a third of the frame. Get that
 * wrong and the label says 41% about a region that is not the one it was
 * measured on — a small lie in the one place the screen is supposed to be
 * exact. The mask goes through the same projector, so the two cannot
 * disagree about where the photograph is; the alignment holds only while
 * coverage is measured on the shrunk capture that is then persisted
 * unchanged (see mask-overlay-model.ts).
 *
 * ── The toggle ───────────────────────────────────────────────────────
 * A tap takes all of it away and leaves the untouched photograph. That
 * gesture is the difference between an instrument and a filter, so it is
 * introduced in words under the frame rather than left to be discovered,
 * and everything goes with it — mask, edge, rules, bar, callouts — so
 * "Photo only" means the photograph and nothing else. That has to be true
 * of the accessibility tree as well as the picture: an opacity-0 view is
 * still read out, so the figures are hidden from it outright when the
 * overlay is off, or the pill would announce a state the person is not in.
 *
 * With no coverage reading the frame is just the photograph. With a
 * reading but no stored outline — every photograph taken before outlines
 * were kept, and every build without the native model — this is the hero
 * exactly as it has always been, with no empty frame and no apology.
 */

import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import type { ScanReading } from '@/features/assessment/scan-reading';
import { hapticsAreEnabled } from '@/lib/device-preferences';
import { useTheme } from '@/theme';

import { MaskOverlay, MASK_DELAY, MASK_REGION_IN } from './mask-overlay';
import {
  MASK_OVERLAY_COPY,
  frameAspect,
  hasVisibleEdge,
  maskTraceOf,
  projector,
} from './mask-overlay-model';

/** How long the overlay waits after the photograph before drawing. */
const OVERLAY_DELAY = MASK_DELAY;

/** How long the toggle takes, matched to the overlay's own. */
const TOGGLE_MS = 180;

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
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);

  const { photo, overlay } = reading;
  const aspect = frameAspect(photo);
  const height = width > 0 ? Math.round(width / aspect) : 0;

  const project = width > 0 ? projector(photo, width, height) : null;
  const bandBottom = project ? project.y(1 / 3) : 0;
  const midX = width / 2;

  /*
    Read structurally, because the field arrives on `Photo` from the
    capture lane and a malformed or half-written blob must be a missing
    overlay rather than a wrong one. Gated on `overlay` as well: that is
    already null under exactly the condition the reading calls unusable,
    so a mask can never outlive the numbers behind it.

    And gated on the photograph having dimensions. Without them the
    projector has no fit to invert and falls back to "the photograph
    exactly fills the frame", which is false for every real picture whose
    aspect is not the fallback's — expo-image goes on cover-fitting the
    actual file at its actual aspect, so the mask would sit off the head
    with nothing thrown and nothing logged. There is no mask to draw
    through a fit nobody knows, so none is drawn.
  */
  const trace = useMemo(() => maskTraceOf(photo), [photo]);
  const hasMask =
    overlay !== null && trace !== null && width > 0 && photo.width > 0 && photo.height > 0;
  /*
    Whether the line is drawn, not whether a run was stored. The frame is
    a cover fit with the aspect clamped, so a tall photograph loses a band
    top and bottom — and the top edge is the part that lives up there. A
    run that is stored and entirely cropped out used to print the heading
    and the paragraph anyway, naming a mark that is nowhere on the frame.
    `hasVisibleEdge` runs the same projection the drawing runs, so the
    words and the line cannot disagree.
  */
  const hasEdge =
    hasMask && trace !== null && project !== null && hasVisibleEdge(trace, project, width, height);

  /*
    Per screen, and never persisted. Somebody who turned the overlay off
    to look at their photograph two weeks ago did not thereby express a
    preference about this month's reading.
  */
  const [shown, setShown] = useState(true);
  const toggle = useCallback(() => {
    setShown((on) => !on);
    // Selection, not impact: this changes a view, it does not commit anything.
    if (hapticsAreEnabled()) Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const toggled = useSharedValue(1);
  useEffect(() => {
    toggled.set(
      reduceMotion
        ? shown
          ? 1
          : 0
        : withTiming(shown ? 1 : 0, { duration: TOGGLE_MS, easing: Easing.out(Easing.quad) }),
    );
  }, [reduceMotion, shown, toggled]);
  const fade = useAnimatedStyle(() => ({ opacity: toggled.get() }));

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

        {hasMask && trace ? (
          <MaskOverlay
            trace={trace}
            photoWidth={photo.width}
            photoHeight={photo.height}
            width={width}
            height={height}
            shown={shown}
          />
        ) : null}

        {/*
          The figures land when they always landed, mask or no mask. They
          are the reading, not the drawing: the rings below this card
          repeat the whole-frame number and arrive within a second of the
          screen opening, so holding the hero's own callouts back until
          the sweep and the trace had finished made the card the screen is
          about the last place on it to say anything. The overlay sweeps in
          underneath them instead.
        */}
        {overlay && project && width > 0 ? (
          <Animated.View
            entering={FadeIn.delay(OVERLAY_DELAY).duration(600)}
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, width, height }}>
            {/*
              Off is off for a screen reader too. An opacity-0 view stays
              in the accessibility tree on both platforms, so without this
              the toggle would be inert to the one person who cannot check
              it by looking: the pill would announce "Photo only" while
              VoiceOver still read out the three callouts behind it.
            */}
            <Animated.View
              accessibilityElementsHidden={!shown}
              importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
              style={[{ position: 'absolute', top: 0, left: 0, width, height }, fade]}>
              <Svg width={width} height={height} accessible={false}>
                {/*
                  The upper third, as counted. Filled only when there is no
                  mask to paint: a 16% block across the top is noise once
                  the measured region itself is on the frame, and the rule
                  alone still says where the third was taken.
                */}
                {hasMask ? null : (
                  <Rect
                    x={0}
                    y={0}
                    width={width}
                    height={Math.max(0, bandBottom)}
                    fill={colors.accent}
                    fillOpacity={0.16}
                  />
                )}
                <Line
                  x1={0}
                  y1={bandBottom}
                  x2={width}
                  y2={bandBottom}
                  stroke={colors.textOnPhoto}
                  strokeOpacity={hasMask ? 0.45 : 0.85}
                  strokeWidth={1.5}
                  strokeDasharray="6 5"
                />
                <Circle cx={width - spacing.xxxl} cy={bandBottom} r={4} fill={colors.textOnPhoto} />
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
          </Animated.View>
        ) : null}

        {/*
          One gesture, one target, and only when there is something to
          take away. A plain Pressable rather than PressableScale: shrinking
          the one photograph the screen is about under a finger makes it
          feel like a button. `switch` rather than `button` because the
          state is the point — the screen reader announces on and off and
          supplies the "double tap to toggle" itself, so the label stays a
          noun and never becomes an instruction. It sits over the image
          rather than around it, so the photograph keeps its own label.
        */}
        {hasMask ? (
          <Pressable
            onPress={toggle}
            accessibilityRole="switch"
            accessibilityState={{ checked: shown }}
            accessibilityLabel={MASK_OVERLAY_COPY.toggleLabel}
            accessibilityHint={MASK_OVERLAY_COPY.toggleHint}
            style={{ position: 'absolute', top: 0, left: 0, width, height }}
          />
        ) : null}

        {/*
          The control's state, which is why it does not fade with the
          overlay: in the "off" state it is the only thing saying there is
          a way back. The dot carries the state at a glance and the label
          says which state in words, because a dot alone is a puzzle.
        */}
        {hasMask ? (
          <Animated.View
            entering={FadeIn.delay(MASK_REGION_IN).duration(400)}
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: spacing.md,
              right: spacing.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              paddingVertical: spacing.xs + 1,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              backgroundColor: colors.photoScrim,
            }}>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: radius.pill,
                backgroundColor: shown ? colors.accent : undefined,
                borderWidth: shown ? 0 : 1,
                borderColor: colors.textOnPhoto,
              }}
            />
            <Text variant="caption" color="textOnPhoto">
              {shown ? MASK_OVERLAY_COPY.pillOn : MASK_OVERLAY_COPY.pillOff}
            </Text>
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

      {/*
        The key to the drawing, in words, under it.

        The tap has to be introduced, not just added: nothing in this hero
        has ever been tappable, so nobody will try it, and a pill on a
        photograph reads as a badge rather than a control.

        The pale line has to be named. It is the boldest mark on the
        frame and it lands on a person's face, so leaving it to be
        interpreted is leaving it to be read as a hairline the app found —
        the one claim this whole feature is built to avoid making. It is
        named only when there is a line to name.

        And the gap has to be accounted for. The mask stops at the 0.5
        threshold, so the sage visibly falls short of the wisps in the
        photograph; unexplained, that reads as the app seeing less hair
        than is there. Three sentences is more than a caption wants to be,
        and every one of them is answering something the picture asks.
      */}
      {hasMask ? (
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.lg,
            gap: spacing.md,
          }}>
          <Text variant="footnote" color="textSecondary">
            {MASK_OVERLAY_COPY.heroCaption}
          </Text>

          {hasEdge ? (
            <View style={{ gap: spacing.xxs }}>
              <Text variant="overline">{MASK_OVERLAY_COPY.edgeTitle}</Text>
              <Text variant="footnote" color="textSecondary">
                {MASK_OVERLAY_COPY.edgeDetail}
              </Text>
            </View>
          ) : null}

          <Text variant="footnote" color="textSecondary">
            {MASK_OVERLAY_COPY.softEdges}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
