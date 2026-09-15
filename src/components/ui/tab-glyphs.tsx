/**
 * Navigation glyphs, drawn to match the reference bar — and now moving.
 *
 * The apps that feel best in this category do not animate the icon; they
 * animate the icon's *parts*. A sun's rays sweep round and the disc
 * squashes; a bottle's cap lifts and settles back. The icon becomes a
 * small object responding to being chosen, rather than a picture being
 * highlighted.
 *
 * So each glyph here owns one gesture, timed off the same recipe: the
 * whole thing squashes and stretches (1 → 1.05 → 0.85 → 1.05 → 1) over
 * about 0.75s while its parts do something particular — the chart bars
 * rise in turn, the chart line draws itself, the door fills, the head
 * bobs. Symmetric ease throughout, so nothing snaps.
 *
 * Every part is driven by one shared progress value per glyph, which is
 * what keeps the parts feeling like one object. Reduced motion collapses
 * the whole gesture to the settled state.
 */

import { useEffect } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

export type TabGlyphProps = { size?: number; color: string; active?: boolean };

const STROKE = 1.9;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** The reference's symmetric ease: out 0.333, in 0.667. */
const EASE = Easing.bezier(0.333, 0, 0.667, 1);

/** Parts move over this long; the bounce runs alongside it. */
const SETTLE_MS = 820;

const line = (color: string) => ({
  stroke: color,
  strokeWidth: STROKE,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/**
 * One progress value per glyph, 0 → 1 when it becomes active.
 *
 * Deliberately not a spring. The reference animations are keyframed with
 * a symmetric ease, and a spring's overshoot would fight the explicit
 * squash-and-stretch the bounce provides.
 */
function useSettle(active: boolean | undefined) {
  const reduced = useReducedMotion();
  const t = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      t.set(active ? 1 : 0);
      return;
    }
    t.set(
      active
        ? withTiming(1, { duration: SETTLE_MS, easing: EASE })
        : withTiming(0, { duration: 220, easing: EASE }),
    );
  }, [active, reduced, t]);

  return t;
}

/**
 * The squash-and-stretch the reference uses on every icon: 75 → 79 → 64
 * → 79 → 75 at 0, 0.13, 0.30, 0.60 and 0.73s. Normalised to a scale
 * around 1 so it composes with whatever the glyph is otherwise doing.
 */
function useBounce(active: boolean | undefined) {
  const reduced = useReducedMotion();
  const s = useSharedValue(1);

  useEffect(() => {
    if (!active || reduced) {
      s.set(withTiming(1, { duration: 160 }));
      return;
    }
    s.set(
      withSequence(
        withTiming(1.05, { duration: 130, easing: EASE }),
        withTiming(0.85, { duration: 170, easing: EASE }),
        withTiming(1.05, { duration: 300, easing: EASE }),
        withTiming(1.0, { duration: 130, easing: EASE }),
      ),
    );
  }, [active, reduced, s]);

  return useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
}

/** A slice of the run, 0 → 1, for a part that starts and ends part-way through. */
function slice(t: number, from: number, to: number): number {
  'worklet';
  return Math.min(1, Math.max(0, (t - from) / (to - from)));
}

/* --------------------------------- home --------------------------------- */

export function HomeGlyph({ size = 24, color, active }: TabGlyphProps) {
  const { colors } = useTheme();
  const t = useSettle(active);
  const bounce = useBounce(active);

  // The house fills over the first half; the door lifts into place after.
  const body = useAnimatedProps(() => ({ fillOpacity: slice(t.get(), 0, 0.55) }));
  // Opacity only. A Path has no `y`; lifting it would need a transform,
  // and a fade reads as "arriving" well enough at this size.
  const door = useAnimatedProps(() => ({ opacity: slice(t.get(), 0.4, 1) }));

  return (
    <Animated.View style={bounce}>
      <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
        <AnimatedPath
          d="M4 10.6 L12 3.9 L20 10.6 V19.1 a1.9 1.9 0 0 1 -1.9 1.9 H5.9 a1.9 1.9 0 0 1 -1.9 -1.9 Z"
          {...line(color)}
          fill={color}
          animatedProps={body}
        />
        {active ? (
          // A View cannot live inside an Svg. The filled door is a plain
          // Rect, as it was before; only the outline door animates.
          <Rect x={10.2} y={14.4} width={3.6} height={2.4} rx={0.6} fill={colors.surface} />
        ) : (
          <AnimatedPath
            d="M10.2 21 V15.6 H13.8 V21"
            {...line(color)}
            fill="none"
            animatedProps={door}
          />
        )}
      </Svg>
    </Animated.View>
  );
}

/* -------------------------------- journey ------------------------------- */

export function JourneyGlyph({ size = 24, color, active }: TabGlyphProps) {
  const t = useSettle(active);
  const bounce = useBounce(active);

  return (
    <Animated.View style={bounce}>
      <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
        {/*
          Three bars rise in turn — the reference's rays sweeping in, on a
          chart. Each owns a slice of the run so they land one after
          another rather than together. Inactive, the bars simply sit at
          full height as they always did.
        */}
        {active ? (
          <>
            <RisingBar t={t} x={6.5} top={14.5} from={0.0} to={0.45} color={color} />
            <RisingBar t={t} x={12} top={9.5} from={0.15} to={0.65} color={color} />
            <RisingBar t={t} x={17.5} top={3.8} from={0.3} to={0.9} color={color} />
          </>
        ) : (
          <Path d="M6.5 20 V14.5 M12 20 V9.5 M17.5 20 V3.8" {...line(color)} fill="none" />
        )}
      </Svg>
    </Animated.View>
  );
}

/**
 * One bar, grown from the baseline to `top` over its slice of the run.
 *
 * A rounded rect rather than a stroked path: animating `y` and `height`
 * as numbers is cheap, where rebuilding a path string every frame
 * allocates. Its own component so it can own its own animated props —
 * hooks in a helper called three times work only by accident of order.
 */
function RisingBar({
  t,
  x,
  top,
  from,
  to,
  color,
}: {
  t: { get(): number };
  x: number;
  top: number;
  from: number;
  to: number;
  color: string;
}) {
  const props = useAnimatedProps(() => {
    const y = 20 - (20 - top) * slice(t.get(), from, to);
    return { y, height: Math.max(0.01, 20 - y) };
  });
  return (
    <AnimatedRect
      x={x - STROKE / 2}
      width={STROKE}
      rx={STROKE / 2}
      fill={color}
      animatedProps={props}
    />
  );
}

/* -------------------------------- report -------------------------------- */

const LINE_LENGTH = 9.4; // approximate length of the rising chart line

export function ReportGlyph({ size = 24, color, active }: TabGlyphProps) {
  const t = useSettle(active);
  const bounce = useBounce(active);

  // The document sits; the line on it draws itself left to right.
  const draw = useAnimatedProps(() => ({
    strokeDashoffset: LINE_LENGTH * (1 - slice(t.get(), 0.25, 1)),
  }));

  return (
    <Animated.View style={bounce}>
      <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
        <Path
          d="M6.2 3.4 h8.1 L18.8 8 v12.6 H6.2 Z M14.1 3.6 V8 h4.5"
          {...line(color)}
          fill="none"
        />
        <AnimatedPath
          d="M9 16.4 l2.4-2.9 2 1.7 2.3-3.3"
          {...line(color)}
          fill="none"
          strokeDasharray={LINE_LENGTH}
          animatedProps={draw}
        />
      </Svg>
    </Animated.View>
  );
}

/* -------------------------------- profile ------------------------------- */

export function ProfileGlyph({ size = 24, color, active }: TabGlyphProps) {
  const t = useSettle(active);
  const bounce = useBounce(active);

  // The head lifts a touch and settles — the reference's "piece bobs out
  // and back". Out over the first half, back over the second.
  const head = useAnimatedProps(() => {
    const p = t.get();
    const lift = p < 0.5 ? slice(p, 0, 0.5) : 1 - slice(p, 0.5, 1);
    return { cy: 8 - lift * 1.6 };
  });

  return (
    <Animated.View style={bounce}>
      <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
        <AnimatedCircle cx={12} r={3.9} {...line(color)} fill="none" animatedProps={head} />
        <Path d="M4.8 20.6 a7.2 6.4 0 0 1 14.4 0 Z" {...line(color)} fill="none" />
      </Svg>
    </Animated.View>
  );
}

/* --------------------------------- plus --------------------------------- */

export function PlusGlyph({ size = 24, color }: TabGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d="M12 5 V19 M5 12 H19" {...line(color)} strokeWidth={2.2} fill="none" />
    </Svg>
  );
}

/* --------------------------------- bulb --------------------------------- */

export function BulbGlyph({ size = 26, color }: TabGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d="M12 2.9 a6.4 6.4 0 0 0 -4 11.4 c0.75 0.6 1.15 1.3 1.15 2.2 V17.3 h5.7 v-0.8 c0 -0.9 0.4 -1.6 1.15 -2.2 A6.4 6.4 0 0 0 12 2.9 Z"
        {...line(color)}
        fill="none"
      />
      <Path d="M9.2 20 H14.8 M10.4 22.1 H13.6" {...line(color)} fill="none" />
    </Svg>
  );
}
