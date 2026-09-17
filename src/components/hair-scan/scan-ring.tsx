/**
 * The scan ring — the instrument's dial, drawn around the head.
 *
 * Seventy-two short ticks on an oval, the way Face ID draws its own: at
 * rest they are quiet white, and as the head turns the engine writes a
 * coverage value for each of twenty-four sectors and the three ticks of
 * that sector come up green. It is a reading of where the head has been,
 * never a reading of hair, and it never becomes a bar: a sector lights
 * where the head was, not where a counter has reached, so a person who
 * turns left first sees the left side light first.
 *
 * Nothing here re-renders per frame. The engine owns one shared value —
 * an array of 24 numbers, 0-1 — and each sector reads its own entry on
 * the UI thread. React sees the ring's shape, its resting state and the
 * moment it completes, which is three props that change a handful of
 * times per scan.
 *
 * The ticks sit outside the oval and radiate outward, the way Face ID's
 * do around the face: the oval itself is the edge of the video mask, so
 * no tick ever lands over the picture. Lit ticks are longer than resting
 * ones, so a captured sector reads as brighter and taller at once. A
 * screen that masks its video to a box sizes the ring with
 * `scanRingBoxFor(mask)` and centres the two on the same point.
 *
 * Completion is one sweep of light around the oval and a settle, then
 * the ring holds green. Under Reduce Motion the end state simply appears.
 */

import { useEffect, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Ellipse, G, Line } from 'react-native-svg';

import { darkColors, motion } from '@/theme';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

/** The engine's coverage array has this many entries. */
export const SCAN_SECTORS = 24;

/** Ticks per sector: three reads as a dial, one reads as a progress bar. */
export const SCAN_TICKS_PER_SECTOR = 3;

const TICK_COUNT = SCAN_SECTORS * SCAN_TICKS_PER_SECTOR;

/** Length of a resting tick, in points, unless the caller says otherwise. */
export const SCAN_RING_TICK_LENGTH = 9;

/** A lit tick is this much longer than a resting one. */
export const SCAN_RING_LIT_SCALE = 1.6;

/** Clear space between the oval's edge and the root of each tick. */
export const SCAN_RING_GAP = 4;

/**
 * Room beyond the lit ticks' outer ends, so the round caps and the
 * completion sweep stay inside the component.
 */
export const SCAN_RING_INSET = 4;

/**
 * How far the oval sits inside the ring's box on every side: the gap, the
 * longest tick and the inset. The oval's semi-axes are the box's halves
 * less this.
 */
export function scanRingMargin(tickLength: number = SCAN_RING_TICK_LENGTH): number {
  return SCAN_RING_GAP + tickLength * SCAN_RING_LIT_SCALE + SCAN_RING_INSET;
}

/**
 * The box a ring needs so that its oval coincides with a video mask of
 * the given size. Centre the ring on the mask and the ticks radiate from
 * the mask's edge without crossing it.
 */
export function scanRingBoxFor(
  mask: { width: number; height: number },
  tickLength: number = SCAN_RING_TICK_LENGTH,
): { width: number; height: number } {
  const margin = scanRingMargin(tickLength);
  return { width: mask.width + margin * 2, height: mask.height + margin * 2 };
}

/** How visible the resting white ticks are: waiting, and while scanning. */
const REST_FAR = 0.34;
const REST_ACTIVE = 0.62;

/** The completion sweep: one circuit, then a fade. */
const SWEEP_MS = 640;
const SWEEP_FADE_MS = 320;

export type ScanRingProps = {
  /** Box the oval fills. A portrait oval (height > width) sits around a head. */
  width: number;
  height: number;
  /**
   * Per-sector coverage, 0-1 each, `SCAN_SECTORS` long, written by the
   * engine at camera rate. Read here on the UI thread and never eased:
   * it arrives already eased, and easing it twice would put the ring
   * behind the head it is reporting.
   */
  coverage: SharedValue<number[]>;
  /**
   * True from the moment the machine is activated. The resting ticks
   * firm up so the dial reads as live rather than as a decoration.
   */
  active: boolean;
  /** True once every sector is captured: runs the completion sweep. */
  complete: boolean;
  /** Length of a resting tick, in points; a lit tick is `SCAN_RING_LIT_SCALE` times this. */
  tickLength?: number;
  /** Stroke of a tick, in points. */
  stroke?: number;
  style?: StyleProp<ViewStyle>;
};

export type Tick = {
  /** The root, just outside the oval's edge. */
  x1: number;
  y1: number;
  /** The tip of the resting tick. */
  x2: number;
  y2: number;
  /** The tip of the lit tick, further out along the same line. */
  x3: number;
  y3: number;
};

/**
 * Where each tick sits around the oval.
 *
 * A tick lies along the outward normal at its point — (b·cosθ, a·sinθ)
 * for an ellipse with semi-axes a, b — rather than along the radius from
 * the centre, which on a tall oval would lean the ticks at the sides. It
 * starts `SCAN_RING_GAP` outside the edge and points away from it. The
 * first tick sits just past twelve o'clock so the sector boundaries, not
 * the ticks, land on the compass points.
 */
export function layoutTicks(
  cx: number,
  cy: number,
  a: number,
  b: number,
  length: number,
): Tick[][] {
  const sectors: Tick[][] = [];
  const lit = length * SCAN_RING_LIT_SCALE;
  for (let s = 0; s < SCAN_SECTORS; s += 1) {
    const ticks: Tick[] = [];
    for (let t = 0; t < SCAN_TICKS_PER_SECTOR; t += 1) {
      const k = s * SCAN_TICKS_PER_SECTOR + t;
      const theta = ((k + 0.5) / TICK_COUNT) * Math.PI * 2 - Math.PI / 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const px = cx + a * cos;
      const py = cy + b * sin;
      const nx = b * cos;
      const ny = a * sin;
      const norm = Math.hypot(nx, ny) || 1;
      const ux = nx / norm;
      const uy = ny / norm;
      const rootX = px + ux * SCAN_RING_GAP;
      const rootY = py + uy * SCAN_RING_GAP;
      ticks.push({
        x1: rootX,
        y1: rootY,
        x2: rootX + ux * length,
        y2: rootY + uy * length,
        x3: rootX + ux * lit,
        y3: rootY + uy * lit,
      });
    }
    sectors.push(ticks);
  }
  return sectors;
}

/** Ramanujan's approximation, close enough for a dash the eye follows. */
export function ellipsePerimeter(a: number, b: number): number {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

export function ScanRing({
  width,
  height,
  coverage,
  active,
  complete,
  tickLength = SCAN_RING_TICK_LENGTH,
  stroke = 2.5,
  style,
}: ScanRingProps) {
  const reduceMotion = useReducedMotion();

  const cx = width / 2;
  const cy = height / 2;
  const margin = scanRingMargin(tickLength);
  const a = width / 2 - margin;
  const b = height / 2 - margin;

  const sectors = useMemo(() => layoutTicks(cx, cy, a, b, tickLength), [cx, cy, a, b, tickLength]);
  const perimeter = useMemo(() => ellipsePerimeter(a, b), [a, b]);

  /* The white dial firming up when the machine is live. */
  const rest = useSharedValue(active ? REST_ACTIVE : REST_FAR);
  useEffect(() => {
    const target = active ? REST_ACTIVE : REST_FAR;
    rest.set(reduceMotion ? target : withTiming(target, { duration: motion.duration.slow }));
  }, [active, reduceMotion, rest]);

  /* Completion: every sector held green, one sweep of light, a settle. */
  const settle = useSharedValue(complete ? 1 : 0);
  const sweepT = useSharedValue(0);
  const sweepOpacity = useSharedValue(0);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!complete) {
      settle.set(0);
      sweepT.set(0);
      sweepOpacity.set(0);
      pulse.set(1);
      return;
    }
    if (reduceMotion) {
      settle.set(1);
      return;
    }
    settle.set(withTiming(1, { duration: SWEEP_MS, easing: Easing.out(Easing.cubic) }));
    sweepT.set(0);
    sweepT.set(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.cubic) }));
    sweepOpacity.set(
      withSequence(
        withTiming(1, { duration: 120 }),
        withDelay(SWEEP_MS - 120, withTiming(0, { duration: SWEEP_FADE_MS })),
      ),
    );
    pulse.set(
      withDelay(
        SWEEP_MS - 80,
        withSequence(withTiming(1.03, { duration: 140 }), withSpring(1, motion.spring.gentle)),
      ),
    );
  }, [complete, reduceMotion, settle, sweepT, sweepOpacity, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.get() }] }));
  const restProps = useAnimatedProps(() => ({ opacity: rest.get() }));
  const sweepProps = useAnimatedProps(() => ({
    strokeDasharray: [perimeter * sweepT.get(), perimeter],
    opacity: sweepOpacity.get(),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height }, pulseStyle, style]}>
      <Svg width={width} height={height}>
        {/* The resting dial, in white. */}
        <AnimatedG animatedProps={restProps}>
          {sectors.map((ticks, s) =>
            ticks.map((tick, t) => (
              <Line
                key={`rest-${s}-${t}`}
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
                stroke={darkColors.textOnPhoto}
                strokeWidth={stroke}
                strokeLinecap="round"
              />
            )),
          )}
        </AnimatedG>

        {/* The same ticks in green, each sector revealed by its coverage. */}
        {sectors.map((ticks, s) => (
          <Sector
            key={`sector-${s}`}
            index={s}
            ticks={ticks}
            stroke={stroke}
            coverage={coverage}
            settle={settle}
          />
        ))}

        {/*
          The completion sweep, drawn from twelve o'clock. An ellipse
          starts its stroke at three o'clock, so the group is turned a
          quarter back — and that turn swaps the axes, so the ellipse is
          drawn with the oval's semi-axes exchanged and lands, once
          rotated, exactly on the oval rather than across it.
        */}
        <G rotation={-90} origin={`${cx}, ${cy}`}>
          <AnimatedEllipse
            cx={cx}
            cy={cy}
            rx={b}
            ry={a}
            stroke={darkColors.success}
            strokeWidth={stroke + 1}
            strokeLinecap="round"
            fill="none"
            animatedProps={sweepProps}
          />
        </G>
      </Svg>
    </Animated.View>
  );
}

/**
 * One sector's three ticks, lit by one number — drawn at the lit length,
 * over the shorter resting ticks, so a captured sector grows outward.
 *
 * Its own component so the animated property belongs to one group: 24
 * small reads on the UI thread per frame, no timings, no allocation.
 */
function Sector({
  index,
  ticks,
  stroke,
  coverage,
  settle,
}: {
  index: number;
  ticks: Tick[];
  stroke: number;
  coverage: SharedValue<number[]>;
  settle: SharedValue<number>;
}) {
  const animated = useAnimatedProps(() => {
    const raw = coverage.get()[index] ?? 0;
    const level = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    const held = settle.get();
    return { opacity: level > held ? level : held };
  });

  return (
    <AnimatedG animatedProps={animated}>
      {ticks.map((tick, t) => (
        <Line
          key={t}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x3}
          y2={tick.y3}
          stroke={darkColors.success}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      ))}
    </AnimatedG>
  );
}

/** A coverage array at rest, for a screen that has not started yet. */
export function emptyCoverage(): number[] {
  return Array.from({ length: SCAN_SECTORS }, () => 0);
}
