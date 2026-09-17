/**
 * The night behind the facts: a dense field of stars that keeps forming
 * constellations, and ends as the Big Dipper.
 *
 * Four hundred tiny stars sit on the near-black ground, drift slowly and
 * twinkle. For each fact the scene shows, a handful of them drift into a
 * figure — a comb, a strand, a cycle, a hairline, a calendar grid, a
 * head — and thin lines join them one by one. When the fact changes, the
 * lines dissolve, a wave runs out from the centre of the field and
 * brightens and lifts each star as its crest passes, and the same stars
 * drift on to the next figure while the lines draw again.
 *
 * After the last fact the field condenses: seven stars take the Big
 * Dipper's shape in its real proportions (the coordinates live in
 * plan-model.ts beside the hair facts, with their source), each blinking
 * on its own period and phase, while every other star fades. The wash
 * that says the plan is ready rises behind them.
 *
 * Everything is driven by a handful of shared values read on the UI
 * thread by every star and every line: a clock for the twinkle, a blend
 * from the previous figure to the current one, the wave's radius, and
 * the draw and fade of the lines. The field is seeded rather than random
 * so it is the same on every mount, and the figures are fixed tables of
 * unit coordinates so a "head" is the same head each time.
 *
 * Under Reduce Motion nothing moves: the stars sit in the figure, the
 * lines are simply there, a new figure replaces the last in place, and
 * the Dipper's seven simply shine.
 */

import { useEffect, useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { bigDipper, type PlanFactId } from '@/features/onboarding/plan-model';
import { darkColors } from '@/theme';

const AnimatedLine = Animated.createAnimatedComponent(Line);

/**
 * How many stars the field holds, and how many of them a figure can use.
 * Every star is its own animated view, so the count is the one thing to
 * lower first if a device drops frames here.
 */
const COUNT = 400;
const SLOTS = 16;

/** One twinkle cycle. Every star's wobble is a whole number of turns of it, so the loop has no seam. */
const CLOCK_MS = 14_000;
/** The lines dissolve, then the stars drift, then the lines draw. */
const DISSOLVE_MS = 260;
const DRIFT_MS = 900;
const CONNECT_MS = 1_100;
/** The wave: how long it takes to cross the field, how far it lifts a star, and how wide its crest is. */
const RIPPLE_MS = 700;
const RIPPLE_PX = 14;
const RIPPLE_WIDTH = 72;

/** How large a star grows when it is held in a figure, and in the Dipper. */
const HELD_SCALE = 2.1;
const DIPPER_SCALE = 3;
const LINE_WIDTH = 1;
const LINE_OPACITY = 0.75;
const DIPPER_LINE_OPACITY = 0.45;

/* -------------------------------- figures -------------------------------- */

export type FigureId = 'comb' | 'strand' | 'cycle' | 'hairline' | 'grid' | 'head' | 'dipper';

type Figure = {
  id: FigureId;
  /** Unit coordinates, 0–1 on both axes. At most SLOTS of them. */
  points: [number, number][];
  /** Pairs of indices into `points`, in the order the lines draw. */
  edges: [number, number][];
  /** Width over height. One for a square figure. */
  aspect: number;
  /** Whether the stars it does not hold fade out while it is shown. */
  alone: boolean;
};

function comb(): Figure {
  const points: [number, number][] = [];
  const edges: [number, number][] = [];
  for (let i = 0; i < 6; i += 1) points.push([0.1 + 0.16 * i, 0.3]);
  for (let i = 0; i < 6; i += 1) points.push([0.1 + 0.16 * i, 0.72]);
  for (let i = 0; i < 5; i += 1) edges.push([i, i + 1]);
  for (let i = 0; i < 6; i += 1) edges.push([i, i + 6]);
  return { id: 'comb', points, edges, aspect: 1, alone: false };
}

function strand(): Figure {
  const points: [number, number][] = [];
  const edges: [number, number][] = [];
  for (let i = 0; i < 14; i += 1) {
    const t = i / 13;
    points.push([0.08 + 0.84 * t, 0.85 - 0.7 * t + 0.07 * Math.sin(t * Math.PI * 3)]);
    if (i > 0) edges.push([i - 1, i]);
  }
  return { id: 'strand', points, edges, aspect: 1, alone: false };
}

function cycle(): Figure {
  const points: [number, number][] = [];
  const edges: [number, number][] = [];
  const gap = Math.PI * 0.24;
  for (let i = 0; i < 14; i += 1) {
    const a = -Math.PI / 2 + gap / 2 + (i * (Math.PI * 2 - gap)) / 13;
    points.push([0.5 + 0.42 * Math.cos(a), 0.5 + 0.36 * Math.sin(a)]);
    if (i > 0) edges.push([i - 1, i]);
  }
  return { id: 'cycle', points, edges, aspect: 1, alone: false };
}

function hairline(): Figure {
  const points: [number, number][] = [];
  const edges: [number, number][] = [];
  for (let i = 0; i < 13; i += 1) {
    const t = i / 12;
    const dip = 0.08 * Math.exp(-(((t - 0.5) / 0.12) ** 2));
    points.push([0.06 + 0.88 * t, 0.68 - 0.4 * Math.sin(Math.PI * t) + dip]);
    if (i > 0) edges.push([i - 1, i]);
  }
  return { id: 'hairline', points, edges, aspect: 1, alone: false };
}

function grid(): Figure {
  const points: [number, number][] = [];
  const edges: [number, number][] = [];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 4; c += 1) points.push([0.14 + (0.72 * c) / 3, 0.2 + (0.6 * r) / 2]);
  }
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) edges.push([r * 4 + c, r * 4 + c + 1]);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 2; r += 1) edges.push([r * 4 + c, (r + 1) * 4 + c]);
  return { id: 'grid', points, edges, aspect: 1, alone: false };
}

function head(): Figure {
  const points: [number, number][] = [];
  const edges: [number, number][] = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i * Math.PI * 2) / 12;
    points.push([0.5 + 0.3 * Math.cos(a), 0.55 + 0.42 * Math.sin(a)]);
    edges.push([i, (i + 1) % 12]);
  }
  points.push([0.26, 0.36], [0.39, 0.26], [0.61, 0.26], [0.74, 0.36]);
  edges.push([12, 13], [13, 14], [14, 15]);
  return { id: 'head', points, edges, aspect: 1, alone: false };
}

/** The finale: the real asterism, read from the model so a test can hold it to the sky. */
function dipper(): Figure {
  const sky = bigDipper();
  return {
    id: 'dipper',
    points: sky.stars.map((s) => [s.x, s.y]),
    edges: sky.edges,
    aspect: sky.aspect,
    alone: true,
  };
}

const FIGURES: readonly Figure[] = [comb(), strand(), cycle(), hairline(), grid(), head(), dipper()];
const FIGURE_INDEX: Record<FigureId, number> = {
  comb: 0,
  strand: 1,
  cycle: 2,
  hairline: 3,
  grid: 4,
  head: 5,
  dipper: 6,
};
const DIPPER = FIGURE_INDEX.dipper;

/** The figure each fact is drawn as. */
export function figureForFact(id: PlanFactId): FigureId {
  switch (id) {
    case 'styles':
      return 'comb';
    case 'growth':
      return 'strand';
    case 'lifespan':
      return 'cycle';
    case 'shedding':
      return 'hairline';
    case 'review':
      return 'grid';
    case 'record':
      return 'head';
  }
}

/* --------------------------------- field --------------------------------- */

type Point = {
  /** Where it sits when no figure holds it. */
  hx: number;
  hy: number;
  size: number;
  opacity: number;
  /** The twinkle: amplitude, whole turns per clock cycle, and phase. */
  amp: number;
  turns: number;
  phase: number;
  /** Where each figure takes it — its home, for a figure that has no slot for it. */
  tx: number[];
  ty: number[];
  /** One for each figure that holds it, zero otherwise. */
  held: number[];
  tint: string;
};

/** A small deterministic generator, so the field is the same every time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where the figures are drawn: a square in the upper half, clear of the text beneath. */
function figureBox(width: number, height: number): { left: number; top: number; side: number } {
  const side = Math.min(width * 0.7, height * 0.32);
  return { left: (width - side) / 2, top: height * 0.3 - side / 2, side };
}

/** A figure's slot as a place on the screen, centred in the box and keeping the figure's aspect. */
function slotAt(
  slot: [number, number],
  figure: Figure,
  box: { left: number; top: number; side: number },
): [number, number] {
  const wide = figure.aspect >= 1;
  const w = wide ? box.side : box.side * figure.aspect;
  const h = wide ? box.side / figure.aspect : box.side;
  return [box.left + (box.side - w) / 2 + slot[0] * w, box.top + (box.side - h) / 2 + slot[1] * h];
}

function makeField(width: number, height: number): Point[] {
  const rand = seeded(20260917);
  const box = figureBox(width, height);
  const field: Point[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    const r = rand();
    const hx = rand() * width;
    const hy = rand() * height;
    const tx: number[] = [];
    const ty: number[] = [];
    const held: number[] = [];
    for (const figure of FIGURES) {
      const slot = i < SLOTS ? figure.points[i] : undefined;
      const at = slot ? slotAt(slot, figure, box) : undefined;
      tx.push(at ? at[0] : hx);
      ty.push(at ? at[1] : hy);
      held.push(at ? 1 : 0);
    }
    // Most stars are dust: one to two points across. A few are brighter.
    const bright = r < 0.12;
    field.push({
      hx,
      hy,
      size: bright ? 2 + rand() * 1.2 : 1 + rand() * 1.1,
      opacity: bright ? 0.6 + rand() * 0.4 : 0.22 + rand() * 0.42,
      amp: 3 + rand() * 8,
      turns: 1 + Math.floor(rand() * 3),
      phase: rand() * Math.PI * 2,
      tx,
      ty,
      held,
      // Icy white, with a little of the sage in the brighter ones.
      tint: bright && rand() < 0.4 ? darkColors.accent : darkColors.textOnPhoto,
    });
  }
  return field;
}

/* ------------------------------ the position ----------------------------- */

type Frame = {
  /** The figure being shown, -1 for none. */
  cur: SharedValue<number>;
  /** The figure before it, -1 for none. */
  prev: SharedValue<number>;
  /** 0 at `prev`, 1 at `cur`. */
  blend: SharedValue<number>;
  clock: SharedValue<number>;
  ripple: SharedValue<number>;
  cx: number;
  cy: number;
  maxR: number;
};

type Placed = {
  x: number;
  y: number;
  /** How much a figure holds this star, 0–1. */
  held: number;
  /** The wave's crest passing, 0–1. */
  lift: number;
  /** How far the scene is into the Dipper, 0–1. */
  alone: number;
};

/**
 * Where a star is right now: between its two figures' places for it,
 * wobbling on the clock unless a figure holds it, and lifted by the
 * wave as the crest passes. Read on the UI thread by the star itself
 * and by every line that ends on it. Every default lives in the body,
 * never in the parameter list: a worklet must not close over a module
 * constant through a default.
 */
function placeAt(p: Point, f: Frame): Placed {
  'worklet';
  const cur = f.cur.get();
  const prev = f.prev.get();
  const b = f.blend.get();
  const t = f.clock.get();
  const r = f.ripple.get();

  const fromX = prev < 0 ? p.hx : p.tx[prev];
  const fromY = prev < 0 ? p.hy : p.ty[prev];
  const toX = cur < 0 ? p.hx : p.tx[cur];
  const toY = cur < 0 ? p.hy : p.ty[cur];
  const fromHeld = prev < 0 ? 0 : p.held[prev];
  const toHeld = cur < 0 ? 0 : p.held[cur];
  const held = fromHeld + (toHeld - fromHeld) * b;
  const fromAlone = prev === DIPPER ? 1 : 0;
  const toAlone = cur === DIPPER ? 1 : 0;
  const alone = fromAlone + (toAlone - fromAlone) * b;

  const angle = 6.283185307 * p.turns * t + p.phase;
  const amp = p.amp * (1 - held) + 1.2 * held;
  let x = fromX + (toX - fromX) * b + Math.sin(angle) * amp;
  let y = fromY + (toY - fromY) * b + Math.cos(angle) * amp;

  let lift = 0;
  if (r > 0 && r < 1) {
    const dx = x - f.cx;
    const dy = y - f.cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const crest = r * f.maxR;
    const off = (d - crest) / RIPPLE_WIDTH;
    lift = Math.exp(-off * off) * (1 - r);
    const shift = (lift * RIPPLE_PX) / (d + 1);
    x += dx * shift;
    y += dy * shift;
  }
  return { x, y, held, lift, alone };
}

/* --------------------------------- pieces -------------------------------- */

function Dot({ p, frame }: { p: Point; frame: Frame }) {
  const canHold = p.held.some((h) => h === 1);
  const style = useAnimatedStyle(() => {
    const at = placeAt(p, frame);
    const t = frame.clock.get();
    const angle = 6.283185307 * p.turns * t * 1.7 + p.phase;
    const twinkle = p.opacity * (0.6 + 0.4 * Math.sin(angle));
    // In the Dipper each star blinks on its own period and phase; in any
    // other figure a held star simply shines.
    const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(6.283185307 * p.turns * t * 2.3 + p.phase * 1.7));
    const shine = 1 - at.alone * (1 - blink);
    let opacity = twinkle + (shine - twinkle) * at.held + at.lift * 0.9;
    // The stars the Dipper does not hold fade as it forms.
    opacity *= 1 - at.alone * (1 - at.held);
    const grow = HELD_SCALE - 1 + at.alone * (DIPPER_SCALE - HELD_SCALE);
    const scale = 1 + at.held * grow + at.lift * 0.8;
    return {
      opacity: opacity > 1 ? 1 : opacity,
      transform: [{ translateX: at.x }, { translateY: at.y }, { scale }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: -p.size / 2,
          top: -p.size / 2,
          width: p.size,
          height: p.size,
          borderRadius: p.size / 2,
          backgroundColor: p.tint,
        },
        canHold && {
          shadowColor: darkColors.textOnPhoto,
          shadowOpacity: 0.85,
          shadowRadius: 5,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    />
  );
}

function Edge({
  a,
  b,
  index,
  count,
  frame,
  draw,
  fade,
  stroke,
  opacity,
}: {
  a: Point;
  b: Point;
  index: number;
  count: number;
  frame: Frame;
  draw: SharedValue<number>;
  fade: SharedValue<number>;
  stroke: string;
  opacity: number;
}) {
  const props = useAnimatedProps(() => {
    const from = placeAt(a, frame);
    const to = placeAt(b, frame);
    // Each line draws in its own slice of the draw, so they appear one by one.
    let k = draw.get() * count - index;
    if (k < 0) k = 0;
    if (k > 1) k = 1;
    const seen = k * 3 > 1 ? 1 : k * 3;
    return {
      x1: from.x,
      y1: from.y,
      x2: from.x + (to.x - from.x) * k,
      y2: from.y + (to.y - from.y) * k,
      strokeOpacity: fade.get() * seen * opacity,
    };
  });
  return <AnimatedLine animatedProps={props} stroke={stroke} strokeWidth={LINE_WIDTH} strokeLinecap="round" />;
}

/* --------------------------------- scene --------------------------------- */

export function Constellation({
  /** The figure to form, or null for a plain field. */
  figure,
  reduceMotion,
}: {
  figure: FigureId | null;
  reduceMotion: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const field = useMemo(() => makeField(width, height), [width, height]);
  const target = figure === null ? -1 : FIGURE_INDEX[figure];

  const cur = useSharedValue(-1);
  const prev = useSharedValue(-1);
  const blend = useSharedValue(1);
  const clock = useSharedValue(0);
  const ripple = useSharedValue(0);
  const draw = useSharedValue(0);
  const fade = useSharedValue(1);

  /** The figure the lines belong to: it trails the stars by one dissolve. */
  const [drawn, setDrawn] = useState(-1);
  const shown = reduceMotion ? target : drawn;

  const frame = useMemo<Frame>(() => {
    const box = figureBox(width, height);
    const cx = width / 2;
    const cy = box.top + box.side / 2;
    const maxR = Math.sqrt(cx * cx + Math.max(cy, height - cy) ** 2) + RIPPLE_WIDTH;
    return { cur, prev, blend, clock, ripple, cx, cy, maxR };
  }, [cur, prev, blend, clock, ripple, width, height]);

  useEffect(() => {
    if (reduceMotion) return;
    clock.set(withRepeat(withTiming(1, { duration: CLOCK_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(clock);
  }, [clock, reduceMotion]);

  useEffect(() => {
    const from = cur.get();
    if (from === target) return;
    if (reduceMotion) {
      prev.set(target);
      cur.set(target);
      blend.set(1);
      draw.set(1);
      fade.set(1);
      return;
    }
    prev.set(from);
    cur.set(target);
    blend.set(0);
    blend.set(withDelay(DISSOLVE_MS, withTiming(1, { duration: DRIFT_MS, easing: Easing.inOut(Easing.cubic) })));
    // The wave runs when a figure gives way to the next, not when the first arrives.
    if (from >= 0) {
      ripple.set(0);
      ripple.set(withTiming(1, { duration: RIPPLE_MS, easing: Easing.out(Easing.quad) }));
    }
    fade.set(withTiming(0, { duration: DISSOLVE_MS, easing: Easing.out(Easing.quad) }));
    const timer = setTimeout(() => {
      setDrawn(target);
      draw.set(0);
      fade.set(1);
      draw.set(withDelay(DRIFT_MS * 0.6, withTiming(1, { duration: CONNECT_MS, easing: Easing.linear })));
    }, DISSOLVE_MS);
    return () => clearTimeout(timer);
  }, [target, reduceMotion, cur, prev, blend, ripple, draw, fade]);

  const edges = shown < 0 ? [] : FIGURES[shown].edges;
  // The Dipper's lines are faint and white, so they read on the wash that rises behind it.
  const stroke = shown === DIPPER ? darkColors.textOnPhoto : darkColors.accent;
  const lineOpacity = shown === DIPPER ? DIPPER_LINE_OPACITY : LINE_OPACITY;

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        {edges.map(([a, b], k) => (
          <Edge
            key={`${shown}-${k}`}
            a={field[a]}
            b={field[b]}
            index={k}
            count={edges.length}
            frame={frame}
            draw={draw}
            fade={fade}
            stroke={stroke}
            opacity={lineOpacity}
          />
        ))}
      </Svg>
      {field.map((p, i) => (
        <Dot key={i} p={p} frame={frame} />
      ))}
    </View>
  );
}
