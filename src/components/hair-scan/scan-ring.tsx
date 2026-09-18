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
 * ── Two beats, one dial ────────────────────────────────────────────
 * The scan is now two movements: the head turns left and right, then it
 * lowers and turns again. They share this one ring, and the second beat
 * has to read as the journey continuing rather than as a new screen.
 * Three things say so, in order of how much of the difference they carry:
 *
 *   1. the dial swells once, briefly, at the moment the beat changes —
 *      the acknowledgement that the first half is banked;
 *   2. the resting white ticks firm up a further step, so the whole
 *      instrument reads as further along than it did;
 *   3. the first beat's fill is latched as a floor under every sector.
 *
 * The latch is belt and braces and nothing more, and it is worth saying
 * plainly: the engine's sectors are already monotonic and it never
 * clears them at the boundary, so nothing is emptying today and the
 * latch changes no pixel. It holds if a later reducer decides otherwise.
 *
 * Completion is one sweep of light around the oval and a settle, then
 * the ring holds green. Under Reduce Motion the end state simply appears.
 */

import { useEffect, useMemo, useRef } from 'react';
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

/** How visible the resting white ticks are: waiting, scanning, and on the second beat. */
const REST_FAR = 0.34;
const REST_ACTIVE = 0.62;
const REST_CROWN = 0.74;

/** The second beat's acknowledgement: how far the dial swells, and for how long. */
const BANK_SCALE = 1.03;
const BANK_MS = 160;

/** The completion sweep: one circuit, then a fade. */
const SWEEP_MS = 640;
const SWEEP_FADE_MS = 320;

/**
 * Which beat of the scan the ring is drawing. Structurally the engine's
 * `ScanStage`: the dial does not import the engine, it only needs to
 * know when the second beat has begun so it can latch the first.
 */
export type ScanRingStage = 'sweep' | 'crown';

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
  /**
   * The beat the scan is on. Omitted before it starts. Arriving at
   * `crown` latches whatever the first beat lit, so the second beat adds
   * to the dial rather than replacing it.
   */
  stage?: ScanRingStage;
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

/** How firm the white dial sits: waiting, on the first beat, on the second. */
function restFor(live: boolean, beat: ScanRingStage | undefined): number {
  if (!live) return REST_FAR;
  return beat === 'crown' ? REST_CROWN : REST_ACTIVE;
}

/**
 * How lit one sector is: the live reading, the fill the first beat left
 * behind, and the completion settle, whichever is highest.
 *
 * A worklet — it is read on the UI thread once per sector per frame —
 * and it takes no defaults, because a default that reaches a module
 * constant does not survive the crossing.
 */
export function sectorLevel(live: number, held: number, settle: number): number {
  'worklet';
  const clamped = live < 0 ? 0 : live > 1 ? 1 : live;
  const floor = held > settle ? held : settle;
  return clamped > floor ? clamped : floor;
}

export function ScanRing({
  width,
  height,
  coverage,
  active,
  complete,
  stage,
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

  /* The white dial firming up when the machine is live, and again on the second beat. */
  const rest = useSharedValue(restFor(active, stage));
  useEffect(() => {
    const target = restFor(active, stage);
    rest.set(reduceMotion ? target : withTiming(target, { duration: motion.duration.slow }));
  }, [active, stage, reduceMotion, rest]);

  /*
   * What the first beat left on the dial. Latched the moment the second
   * beat begins — one copy of 24 numbers, once per scan — and cleared
   * whenever the ring goes back to the first beat, which is a scan
   * starting over rather than continuing. Belt and braces: see the note
   * at the top of the file about what this does and does not change.
   */
  const held = useSharedValue<number[]>(emptyCoverage());
  useEffect(() => {
    if (stage !== 'crown') {
      held.set(emptyCoverage());
      return;
    }
    held.set(coverage.get().map((level) => (level < 0 ? 0 : level > 1 ? 1 : level)));
  }, [stage, coverage, held]);

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

  /*
   * The second beat arriving: one short swell of the whole dial, so the
   * change of movement is something the eye catches from the corner of
   * itself while the head is turning. It shares the completion's value —
   * the two can never overlap, one ends the scan and the other is in the
   * middle of it — and it is skipped entirely under Reduce Motion, where
   * the firmer resting ticks carry the beat change on their own. It runs
   * on the *change* into the second beat, never on a mount that starts
   * there: the instruction sheet's third tile is a ring standing still
   * on `crown`, and a tile that twitched as the sheet opened would be a
   * drawing pretending to be alive.
   */
  const beatWas = useRef(stage);
  useEffect(() => {
    const from = beatWas.current;
    beatWas.current = stage;
    if (stage !== 'crown' || from === 'crown' || complete || reduceMotion) return;
    pulse.set(
      withSequence(withTiming(BANK_SCALE, { duration: BANK_MS }), withSpring(1, motion.spring.gentle)),
    );
  }, [stage, complete, reduceMotion, pulse]);

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
            held={held}
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
  held,
  settle,
}: {
  index: number;
  ticks: Tick[];
  stroke: number;
  coverage: SharedValue<number[]>;
  /** What the first beat left lit here, latched when the second began. */
  held: SharedValue<number[]>;
  settle: SharedValue<number>;
}) {
  const animated = useAnimatedProps(() => ({
    opacity: sectorLevel(coverage.get()[index] ?? 0, held.get()[index] ?? 0, settle.get()),
  }));

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
