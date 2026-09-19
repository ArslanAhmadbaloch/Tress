/**
 * The coverage map: where the scan looked, and what it read there.
 *
 * A stylised head seen from above and slightly in front — the crown at
 * the top, the forehead and the hairline band at the bottom, the temples
 * down either side, the ears as two small marks outside the silhouette
 * and a nose below it so nobody has to be told which way round it is.
 * The six places the engine reads are drawn as separate shapes inside
 * that silhouette, and each one is tinted by its own measured score.
 *
 * ── What the tint is, and what it is not ──────────────────────────────
 * The tint is one channel carrying one number: the region's Visual
 * Coverage, 0–100, as a share of the sage between `TINT_MIN` and
 * `TINT_MAX`. Deeper is more coverage. Nothing else touches it — not
 * confidence, not the goal, not how recently the region was scanned —
 * because a colour that two things can move is a colour that says
 * neither of them.
 *
 * A region with no reading is NOT tinted at the bottom of that scale.
 * The bottom of the scale is a measurement, and "we could not read this"
 * is not one. It is drawn as a dashed outline over the bare head, which
 * cannot be mistaken for a reading of any value.
 *
 * ── What it never claims ──────────────────────────────────────────────
 * A tint is a share of hair and scalp this scan could see in a place on
 * a head. It is not a count of anything growing there, and no wording
 * here — none of which this file chooses; every word arrives as a prop —
 * may turn it into one.
 *
 * ── The chips ─────────────────────────────────────────────────────────
 * The drawing is hidden from the screen reader, so the row of chips
 * below it is the map's whole readout: six names, six figures, six
 * confidences. They are drawn at full strength whether or not a handler
 * was given for tapping them — a chip with nowhere to send a tap is a
 * plain readout, not a disabled button, because the numbers on it are
 * live either way.
 *
 * ── Pure presentation ─────────────────────────────────────────────────
 * It takes numbers and draws them. It computes no score, decides no
 * order, and says nothing in words beyond the labels it is handed. The
 * geometry and the tint scale below are the whole of its arithmetic, and
 * they are extracted and exercised by scripts/test/coverage-map.test.ts.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import type { ScanRegion } from '@/features/hair-scan/measure';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

/* ---------- pure geometry: extracted by scripts/test/coverage-map.test.ts ---------- */

/** A rectangle in map coordinates. */
export type MapRect = { x: number; y: number; width: number; height: number };

/** The box every coordinate below is stated in. Drawn at whatever size it is given. */
export const MAP_BOX = { width: 280, height: 244 } as const;

/**
 * The silhouette: a head from above and a little in front, its crown at
 * the top and its brow at the bottom. Four curves, so the skull narrows
 * towards the crown and carries its width at the temples the way a head
 * does, rather than reading as an egg.
 */
export const HEAD_PATH =
  'M 140 12 C 192 12 240 56 240 110 C 240 170 212 208 140 220 C 68 208 40 170 40 110 C 40 56 88 12 140 12 Z';

/** Where the ears sit against the silhouette: the two marks that fix the view. */
export const EAR_MARKS = [
  { cx: 41, cy: 134, rx: 7, ry: 16 },
  { cx: 239, cy: 134, rx: 7, ry: 16 },
] as const;

/** The brow-and-nose mark below the silhouette: which way the head is facing. */
export const NOSE_PATH = 'M 128 216 L 140 236 L 152 216 Z';

/**
 * The six places, as rectangles clipped to the silhouette.
 *
 * Front to back they stack: the hairline band across the brow, the
 * mid-scalp above it, the crown across the top, a temple down each side
 * past the hairline, and the part line as a narrow strip down the centre.
 * Every pair but the part line is edge-to-edge and never overlapping, so
 * no square of head is tinted by two readings at once; the part line is
 * the one strip drawn over the others, and it is laid on its own opaque
 * base so its tint is its own.
 */
export const MAP_REGION_RECTS: Readonly<Record<ScanRegion, MapRect>> = Object.freeze({
  crown: { x: 40, y: 12, width: 200, height: 68 },
  leftTemple: { x: 40, y: 80, width: 58, height: 130 },
  rightTemple: { x: 182, y: 80, width: 58, height: 130 },
  midScalp: { x: 98, y: 80, width: 84, height: 72 },
  hairline: { x: 98, y: 152, width: 84, height: 48 },
  partLine: { x: 132, y: 58, width: 16, height: 94 },
});

/** Back to front, so the strip that crosses the others is laid last. */
export const MAP_DRAW_ORDER: readonly ScanRegion[] = [
  'crown',
  'leftTemple',
  'rightTemple',
  'midScalp',
  'hairline',
  'partLine',
];

/** The one shape drawn over its neighbours, and so the one given an opaque base of its own. */
export const MAP_OVERLAID: readonly ScanRegion[] = ['partLine'];

/**
 * The tint scale.
 *
 * The lightest a measured region is ever drawn, and the deepest. The
 * floor is above nothing on purpose: a region read at 0 has been read,
 * and has to look different from a region nobody could read.
 */
export const TINT_MIN = 0.12;
export const TINT_MAX = 0.62;

/** The score a tint is a share of. */
export const SCORE_MAX = 100;

/**
 * A region's tint, or null when there is no reading to tint it with.
 *
 * Null in, null out — never a zero standing in for a missing number.
 */
export function regionTint(score: number | null | undefined): number | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  const unit = Math.max(0, Math.min(1, score / SCORE_MAX));
  return TINT_MIN + (TINT_MAX - TINT_MIN) * unit;
}

/** Confidence as a share of a chip's underline. Null when it is not a number. */
export function confidenceShare(confidence: number | null | undefined): number | null {
  if (confidence === null || confidence === undefined || !Number.isFinite(confidence)) return null;
  return Math.max(0, Math.min(1, confidence));
}

/** The drawn height for a given drawn width, so the head never distorts. */
export function mapHeightFor(width: number): number {
  return (width * MAP_BOX.height) / MAP_BOX.width;
}

/* ---------- end pure geometry ---------- */

/** How long the tints take to arrive. Slow enough to be watched, once. */
const FILL_MS = 900;
/** The corner on a region shape, in map units. */
const RECT_RADIUS = 7;
/** The seam between two neighbouring regions, in map units. */
const SEAM = 2;
/** The swatch beside a chip's label. */
const SWATCH = 12;

/**
 * One region of the map, as the caller hands it over.
 *
 * Structurally the model lane's `CoverageMapRegion`: stated here so this
 * component depends on numbers and strings rather than on a module that
 * is still being written.
 */
export type CoverageMapRegionInput = {
  region: ScanRegion;
  label: string;
  /** Visual Coverage, 0–100, or null where the scan read nothing. */
  score: number | null;
  /** 0–1. Drawn on the chip, never on the head: the tint carries the score alone. */
  confidence: number;
  /**
   * The confidence in the caller's words — "Confidence 80%" — for the
   * chip's spoken label. Null where there is no score to qualify. The
   * underline shows the same figure; a bar alone says nothing to a
   * screen reader.
   */
  confidenceLabel?: string | null;
};

export function CoverageMap({
  regions,
  scoreScale,
  onSelectRegion,
  delay = 0,
  style,
}: {
  /** What to draw, in the order the chips should read. Regions absent from this list are not drawn. */
  regions: readonly CoverageMapRegionInput[];
  /** The scale the figures are on, in the caller's words. Spoken with each chip's figure. */
  scoreScale?: string;
  /** A region was tapped; the screen decides what to do about it. */
  onSelectRegion?: (region: ScanRegion) => void;
  /** Milliseconds before the tints arrive, so the map can wait for its section. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing } = useTheme();
  const reduceMotion = useReducedMotion();
  const [boxWidth, setBoxWidth] = useState(0);

  // Ids have to be unique per instance or two maps on one screen share a
  // clip path. React's own id carries characters a url(#…) should not.
  const rawId = useId();
  const clipId = useMemo(() => `coverage-map-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`, [rawId]);

  const reveal = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    reveal.set(
      reduceMotion
        ? 1
        : withDelay(delay, withTiming(1, { duration: FILL_MS, easing: Easing.out(Easing.cubic) })),
    );
  }, [delay, reduceMotion, reveal]);

  const shown = useMemo(() => {
    const byRegion = new Map<ScanRegion, CoverageMapRegionInput>();
    for (const r of regions) byRegion.set(r.region, r);
    return byRegion;
  }, [regions]);

  // Nothing to draw is not an empty head: it is a section the screen
  // should not be rendering at all, so this draws nothing and says so by
  // its absence rather than by inventing an outline of a head.
  if (regions.length === 0) return null;

  const width = Math.min(boxWidth > 0 ? boxWidth : MAP_BOX.width, MAP_BOX.width);
  const height = mapHeightFor(width);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setBoxWidth(Math.round(e.nativeEvent.layout.width))} style={style}>
      <View style={{ alignItems: 'center' }}>
        <Svg
          width={width}
          height={height}
          viewBox={`0 0 ${MAP_BOX.width} ${MAP_BOX.height}`}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <Defs>
            <ClipPath id={clipId}>
              <Path d={HEAD_PATH} />
            </ClipPath>
          </Defs>

          {/* The marks that fix the view: ears outside the silhouette, brow below it. */}
          {EAR_MARKS.map((ear) => (
            <Ellipse key={`ear-${ear.cx}`} cx={ear.cx} cy={ear.cy} rx={ear.rx} ry={ear.ry} fill={colors.fill} />
          ))}
          <Path d={NOSE_PATH} fill={colors.fill} />

          {/* The bare head: what an unread region is drawn over. */}
          <Path d={HEAD_PATH} fill={colors.backgroundSubtle} />

          <G clipPath={`url(#${clipId})`}>
            {MAP_DRAW_ORDER.map((region) => {
              const item = shown.get(region);
              if (!item) return null;
              const rect = MAP_REGION_RECTS[region];
              const tint = regionTint(item.score);
              const overlaid = MAP_OVERLAID.includes(region);

              if (tint === null) {
                return (
                  <Rect
                    key={region}
                    x={rect.x + SEAM / 2}
                    y={rect.y + SEAM / 2}
                    width={rect.width - SEAM}
                    height={rect.height - SEAM}
                    rx={RECT_RADIUS}
                    fill={overlaid ? colors.surface : 'none'}
                    stroke={colors.textTertiary}
                    strokeWidth={1.25}
                    strokeDasharray="5 4"
                  />
                );
              }

              return (
                <RegionShape
                  key={region}
                  rect={rect}
                  tint={tint}
                  reveal={reveal}
                  overlaid={overlaid}
                  tone={colors.accent}
                  base={colors.surface}
                  seam={colors.surface}
                />
              );
            })}
          </G>

          <Path d={HEAD_PATH} fill="none" stroke={colors.border} strokeWidth={1.5} />
        </Svg>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginTop: spacing.lg,
        }}>
        {regions.map((item) => (
          <RegionChip key={item.region} item={item} scoreScale={scoreScale} onSelect={onSelectRegion} />
        ))}
      </View>
    </View>
  );
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/**
 * One tinted place on the head.
 *
 * Its own component because each shape holds one animated value, and a
 * hook cannot be called inside a loop. The tint is the end of a fade
 * from nothing, so the map fills in rather than being already full; the
 * end of the fade is the measured tint and nothing else.
 */
function RegionShape({
  rect,
  tint,
  reveal,
  overlaid,
  tone,
  base,
  seam,
}: {
  rect: MapRect;
  tint: number;
  reveal: SharedValue<number>;
  /** True for the strip drawn over its neighbours: it gets an opaque base first. */
  overlaid: boolean;
  tone: string;
  base: string;
  seam: string;
}) {
  const animated = useAnimatedProps(() => ({ fillOpacity: tint * reveal.get() }));
  const box = {
    x: rect.x + SEAM / 2,
    y: rect.y + SEAM / 2,
    width: rect.width - SEAM,
    height: rect.height - SEAM,
  };

  return (
    <>
      {overlaid ? (
        <Rect x={box.x} y={box.y} width={box.width} height={box.height} rx={RECT_RADIUS} fill={base} />
      ) : null}
      <AnimatedRect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={RECT_RADIUS}
        fill={tone}
        stroke={seam}
        strokeWidth={SEAM}
        animatedProps={animated}
      />
    </>
  );
}

/**
 * One region's readout, beside the head.
 *
 * The drawing above is hidden from the screen reader — six clipped
 * rectangles are not something to be read out one by one — so these
 * chips are the whole of the map's spoken and legible content: the
 * region's name, its figure, and how much of the reading the scan stood
 * behind. They are drawn at full strength whether or not the screen
 * gave the map somewhere to send a tap. A chip is a pressable only when
 * there is a handler to press it into; with none it is a plain readout,
 * which is what it looks like and what it is announced as. Nothing here
 * is ever dimmed, because the numbers on it are live either way.
 */
function RegionChip({
  item,
  scoreScale,
  onSelect,
}: {
  item: CoverageMapRegionInput;
  /** The scale every figure on this sheet is on, in the caller's words: "out of 100". */
  scoreScale?: string;
  onSelect?: (region: ScanRegion) => void;
}) {
  const { colors, radius, spacing } = useTheme();

  const tint = regionTint(item.score);
  // No reading, no confidence in one: a region the scan never read is
  // not given a bar of any length, empty included.
  const share = item.score === null ? null : confidenceShare(item.confidence);
  /*
    What the chip says out loud: the place, the figure with the scale it
    is on, and the confidence beside it. The scale and the confidence are
    the caller's words — the model says them once for the whole sheet —
    and a chip that read out a bare "62" would be handing over a number
    with nothing attached to it, which is the one thing grade.ts says
    this app never does.
  */
  const scale = scoreScale ? ` ${scoreScale}` : '';
  const saidConfidence = item.confidenceLabel ? `. ${item.confidenceLabel}` : '';
  const spoken = item.score === null ? item.label : `${item.label}, ${Math.round(item.score)}${scale}${saidConfidence}`;

  const box = {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundSubtle,
  } as const;

  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View
          style={{
            width: SWATCH,
            height: SWATCH,
            borderRadius: SWATCH / 2,
            backgroundColor: tint === null ? undefined : colors.accent,
            opacity: tint ?? 1,
            borderWidth: tint === null ? 1 : 0,
            borderColor: colors.textTertiary,
          }}
        />
        <Text variant="caption" numberOfLines={1}>
          {item.label}
        </Text>
        <Text variant="caption" color={item.score === null ? 'textTertiary' : 'text'}>
          {item.score === null ? '—' : Math.round(item.score)}
        </Text>
      </View>

      {/* Confidence, under the chip and nowhere near the tint. */}
      {share === null ? null : (
        <View
          style={{
            height: 2,
            marginTop: spacing.xs,
            borderRadius: 1,
            backgroundColor: colors.fill,
            overflow: 'hidden',
          }}>
          <View
            style={{
              width: `${Math.round(share * 100)}%`,
              height: '100%',
              backgroundColor: colors.accent,
            }}
          />
        </View>
      )}
    </>
  );

  if (!onSelect) {
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={spoken} style={box}>
        {body}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={() => onSelect(item.region)}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityValue={
        item.score === null ? undefined : { min: 0, max: SCORE_MAX, now: Math.round(item.score) }
      }
      style={box}>
      {body}
    </PressableScale>
  );
}
