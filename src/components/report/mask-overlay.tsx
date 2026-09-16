/**
 * The segmenter's own mask, drawn on the photograph it was measured from.
 *
 * Every mark is the 0.5 iso-boundary of the same array `coverageOf`
 * counted — the pixels the model was at least half sure were hair. The
 * outline is not smoothed, stray specks are not tidied away, and gaps are
 * never closed. A mask that has gone wrong therefore announces itself as
 * scatter instead of posing as a hairline, which is the behaviour to want
 * from something painted on a person's face.
 *
 * ── What it does to the photograph ────────────────────────────────────
 * It does not paint over the person; it *un-dims* the region that was
 * measured. Outside the mask sits a scrim, inside it a sage wash light
 * enough to read individual strands straight through. That is the whole
 * difference between marking what is there and covering it up, and it is
 * why the wash never gets heavier: dimming the outside further is the
 * first step towards hiding the photograph, which is what this exists not
 * to do.
 *
 * ── No heat map, and there cannot be one ──────────────────────────────
 * A heat map shows the intensity of a quantity at a point. The only
 * per-location quantity here is the model's softmax confidence that a
 * pixel of the *photograph* shows hair, and that is the network's
 * certainty, not an amount of hair: a pixel at 0.9 does not have more hair
 * than one at 0.6, it is one the model is surer about, which tracks
 * contrast and focus as much as anything on the scalp. `coverageOf`
 * thresholds at 0.5 and throws the gradient away, so painting that ramp
 * would show a variation no printed figure uses and invite the exact
 * reading — density, thickness — this app is built to refuse. There is no
 * renaming that fixes it. The quantity is not there to map.
 *
 * ── Motion ───────────────────────────────────────────────────────────
 * The wipe runs top to bottom because `coverageOf` iterates y then x: it
 * retraces the scan order that produced the number. The region is revealed
 * before the edge draws, because the measurement is the area and the
 * boundary is where the area stops — a line arriving first would stage the
 * boundary as the finding. Under reduced motion the mask is simply there.
 *
 * Nothing inside the `<Svg>` is animated except `strokeDashoffset`; the
 * wipe is an `Animated.View` clip outside it, so no SVG element ever
 * re-lays-out or re-rasterises. No `<Mask>`, no `<ClipPath>`, no filter —
 * Android allocates a full-size bitmap per filter primitive per pass, so
 * none appears here.
 *
 * ── What it costs, stated as what is known ────────────────────────────
 * Three `<Path>`s for the region, whatever the contour count: every
 * contour, speck included, is joined into one `d`. Then one `<Path>` per
 * unbroken run of the top edge — not a fixed number. The tracer samples
 * 128 columns and needs a run of 8, so it can emit up to 16 runs; the
 * frame clip can split each of those again at every crossing and give
 * each piece a faded tail. Tens of paths is the worst case, each with an
 * animated-prop worklet for the length of the draw. It is bounded and it
 * has not been measured on a device (D5), which is why this says so
 * rather than naming a count.
 */

import { useEffect, useMemo } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/theme';

import { maskPaths, projector, type MaskEdge, type ParsedMaskTrace } from './mask-overlay-model';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The photograph gets this long on its own before anything is drawn on it. */
export const MASK_DELAY = 700;

/** How long the region takes to sweep in. */
const WIPE_MS = 900;

/** The edge starts drawing before the wipe has finished, and overlaps it. */
const DRAW_OFFSET = 800;
const DRAW_MS = 700;

/**
 * When the region has finished sweeping in — the first moment the overlay
 * is a thing on the screen rather than a thing arriving. The pill that
 * names it lands here. The figures do not: they belong to the reading, not
 * to the drawing, and they keep the entrance they had before any of this
 * existed.
 */
export const MASK_REGION_IN = MASK_DELAY + WIPE_MS;

/** When the last mark stops moving. */
export const MASK_SETTLED = MASK_DELAY + DRAW_OFFSET + DRAW_MS;

/** How long the toggle takes. Deliberately unlike the entrance. */
const TOGGLE_MS = 180;

/**
 * One unbroken run of the top edge, drawing itself.
 *
 * Its own component because each run animates on the shared clock with its
 * own dash length, and a hook cannot be called in a loop. Gaps stay gaps:
 * nothing here joins two runs.
 */
function EdgeLine({
  edge,
  draw,
  colour,
}: {
  edge: MaskEdge;
  draw: SharedValue<number>;
  colour: string;
}) {
  const dash = useAnimatedProps(() => ({
    strokeDashoffset: edge.length * (1 - draw.get()),
  }));

  return (
    <AnimatedPath
      d={edge.d}
      fill="none"
      stroke={colour}
      // A run that ran off the frame fades out rather than stopping dead.
      strokeOpacity={edge.faded ? 0.3 : 0.95}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={edge.length}
      animatedProps={dash}
    />
  );
}

export function MaskOverlay({
  trace,
  photoWidth,
  photoHeight,
  width,
  height,
  shown,
  delay = MASK_DELAY,
}: {
  /** The traced boundary, already read and validated. */
  trace: ParsedMaskTrace;
  /** The photograph's own pixel dimensions, for the cover fit. */
  photoWidth: number;
  photoHeight: number;
  /** The frame, in points. The caller gates on `width > 0`. */
  width: number;
  height: number;
  /** False shows the untouched photograph. The wipe does not replay. */
  shown: boolean;
  delay?: number;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  /*
    Projected in JS rather than by an SVG `<G transform>`: consuming the
    path verbatim would need a non-uniform scale for any photograph that
    is not square, and a 1.25pt stroke under a 4:3 scale renders a third
    thicker vertically than horizontally. Memoised because a rotation or a
    keyboard would otherwise re-project and re-join every path on each
    layout pass.
  */
  const paths = useMemo(
    () =>
      maskPaths(
        trace,
        projector({ width: photoWidth, height: photoHeight }, width, height),
        width,
        height,
      ),
    [trace, photoWidth, photoHeight, width, height],
  );

  const reveal = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    reveal.set(
      reduceMotion
        ? 1
        : withDelay(delay, withTiming(1, { duration: WIPE_MS, easing: Easing.inOut(Easing.cubic) })),
    );
  }, [delay, reduceMotion, reveal]);

  const draw = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    draw.set(
      reduceMotion
        ? 1
        : withDelay(
            delay + DRAW_OFFSET,
            withTiming(1, { duration: DRAW_MS, easing: Easing.out(Easing.cubic) }),
          ),
    );
  }, [delay, reduceMotion, draw]);

  /*
    Re-enabling does not replay the wipe. A sweep on every tap would turn a
    measurement into a toy, and would mean the mask could never simply
    appear — which is the one thing a toggle is for.
  */
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
  const clip = useAnimatedStyle(() => ({ height: reveal.get() * height }));
  const leadingEdge = useAnimatedStyle(() => ({
    transform: [{ translateY: reveal.get() * height - 1 }],
    opacity: 0.9 * Math.min(1, (1 - reveal.get()) / 0.2),
  }));

  return (
    /*
      Nothing here is a screen-reader target, in either state. The drawing
      carries no text, and what it means is said in words twice over — the
      caption under the frame and the pill that holds the toggle's state —
      so announcing the shapes would only add noise between the label and
      the numbers.
    */
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ position: 'absolute', top: 0, left: 0, width, height }, fade]}>
      <Animated.View
        style={[{ position: 'absolute', top: 0, left: 0, width, overflow: 'hidden' }, clip]}>
        <Svg
          width={width}
          height={height}
          accessible={false}
          style={{ position: 'absolute', top: 0, left: 0 }}>
          {/*
            The frame, then every contour, filled even-odd: this paints
            the *outside* of the measured region. Holes in the mask are
            holes here too, because a gap inside the hair is a gap the
            count already excluded.
          */}
          <Path d={paths.outside} fillRule="evenodd" fill={colors.photoScrim} fillOpacity={0.6} />
          {/* The wash, light enough to read the photograph through. */}
          <Path d={paths.region} fillRule="evenodd" fill={colors.accent} fillOpacity={0.22} />
          {/* The measured boundary itself. */}
          <Path
            d={paths.region}
            fillRule="evenodd"
            fill="none"
            stroke={colors.accent}
            strokeOpacity={0.9}
            strokeWidth={1.25}
            strokeLinejoin="round"
          />
          {/*
            Last, so it reads as the one line being called out: the
            highest row the mask held for a short run in each column. Being
            called out
            is precisely why it cannot be left unexplained — a bold line
            traced across the top of somebody's hair and never named is
            read as a hairline, which is a claim the model never made. It
            is labelled under the frame, as the top edge of the measured
            area, and the caller is what draws that label.
          */}
          {paths.edges.map((edge, i) => (
            <EdgeLine key={i} edge={edge} draw={draw} colour={colors.textOnPhoto} />
          ))}
        </Svg>
      </Animated.View>

      {/* The sweep's leading edge: a plain view, so nothing in the SVG moves. */}
      {reduceMotion ? null : (
        <Animated.View
          style={[
            { position: 'absolute', left: 0, width, height: 2, backgroundColor: colors.accent },
            leadingEdge,
          ]}
        />
      )}
    </Animated.View>
  );
}
