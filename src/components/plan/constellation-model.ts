/**
 * The geometry behind the constellation scene, with nothing native in it.
 *
 * The figures the stars form (a comb, a strand, a cycle, a hairline, a
 * calendar grid, a head, and the Big Dipper), the seeded field of stars,
 * where each star goes for each figure, and the arithmetic that places a
 * star on a given frame — all here, so `node --test` can hold them: that
 * every figure fits its slots, that the map from a figure's id to its
 * table cannot drift, that the field is the same on every mount, that
 * the Dipper's seven are sized by their real brightness and blink on
 * seven different periods, and that the clock's loop has no seam.
 *
 * The placement functions are worklets: the scene reads them on the UI
 * thread for every star and every line, once per frame. They take plain
 * numbers, never shared values, so the same code runs under the tests.
 * Every default lives in a body, never in a parameter list — a worklet
 * must not close over a module constant through a default.
 */

import { bigDipper, type PlanFactId } from '@/features/onboarding/plan-model';

/**
 * How many stars the field holds, and how many of them a figure can use.
 * Every star is its own animated view, so the count is the one thing to
 * lower first if a device drops frames here — the owner's floor is 350.
 */
export const STAR_COUNT = 400;
export const SLOTS = 16;

/**
 * One turn of the clock. The clock runs 0→1 over this and snaps back to
 * 0; every wobble, twinkle and blink is a whole number of turns of it, so
 * each is exactly where it started when the clock wraps and the loop has
 * no seam. The test holds that: nothing here may multiply the clock by
 * anything but an integer.
 */
export const CLOCK_MS = 14_000;

/** The wave: how far it lifts a star at its crest, and how wide the crest is, in points. */
export const RIPPLE_PX = 14;
export const RIPPLE_WIDTH = 72;

/** How much a star grows when a figure holds it. */
export const HELD_SCALE = 2.1;
/** The brightest of the Dipper's seven, across, in points; the others follow their magnitudes. */
export const DIPPER_PX = 9;

/* -------------------------------- figures -------------------------------- */

export type FigureId = 'comb' | 'strand' | 'cycle' | 'hairline' | 'grid' | 'head' | 'dipper';

export type Figure = {
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

export const FIGURES: readonly Figure[] = [comb(), strand(), cycle(), hairline(), grid(), head(), dipper()];

/** Each figure's index in FIGURES, read from the array itself so the two can never disagree. */
export const FIGURE_INDEX: Readonly<Record<FigureId, number>> = FIGURES.reduce(
  (index, figure, i) => ({ ...index, [figure.id]: i }),
  {} as Record<FigureId, number>,
);

/** One when the stars a figure does not hold fade while it is shown, zero otherwise; by figure index. */
export const ALONE_OF: readonly number[] = FIGURES.map((f) => (f.alone ? 1 : 0));

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

export type Star = {
  /** Where it sits when no figure holds it. */
  hx: number;
  hy: number;
  size: number;
  opacity: number;
  /** The wobble's reach, in points, and its whole turns per clock. */
  amp: number;
  turns: number;
  /** The twinkle's whole turns per clock. */
  twinkleTurns: number;
  /** The blink's whole turns per clock: the Dipper's seven each have their own. */
  blinkTurns: number;
  phase: number;
  /** Where each figure takes it — its home, for a figure that has no slot for it. */
  tx: number[];
  ty: number[];
  /** One for each figure that holds it, zero otherwise. */
  held: number[];
  /** How many times its size it grows to when it stands in the Dipper. */
  dipScale: number;
  /** Whether any figure can hold it: the first SLOTS stars. */
  slot: boolean;
  tint: string;
};

/** A small deterministic generator, so the field is the same every time. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FIELD_SEED = 20260917;

/** Where the figures are drawn: a square in the upper half, clear of the text beneath. */
export function figureBox(width: number, height: number): { left: number; top: number; side: number } {
  const side = Math.min(width * 0.7, height * 0.32);
  return { left: (width - side) / 2, top: height * 0.3 - side / 2, side };
}

/** A figure's slot as a place on the screen, centred in the box and keeping the figure's aspect. */
export function slotAt(
  slot: [number, number],
  figure: Figure,
  box: { left: number; top: number; side: number },
): [number, number] {
  const wide = figure.aspect >= 1;
  const w = wide ? box.side : box.side * figure.aspect;
  const h = wide ? box.side / figure.aspect : box.side;
  return [box.left + (box.side - w) / 2 + slot[0] * w, box.top + (box.side - h) / 2 + slot[1] * h];
}

/**
 * The Dipper's seven blink on seven different periods: whole turns of
 * the clock, so none pops at the wrap, and no two the same, so none
 * blink together. In the order of BIG_DIPPER — bowl, then handle.
 */
export const DIPPER_BLINK_TURNS: readonly number[] = [5, 8, 3, 6, 4, 7, 9];

/**
 * The colours the field is drawn in: the icy star, the sage star, and
 * the wave. Made from the given tokens by `cooled`, never written here.
 */
export type FieldTints = { ice: string; white: string; sage: string };

export function makeField(width: number, height: number, tints: FieldTints): Star[] {
  const rand = seeded(FIELD_SEED);
  const box = figureBox(width, height);
  const sky = bigDipper();
  const field: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const r = rand();
    const hx = rand() * width;
    const hy = rand() * height;
    const tx: number[] = [];
    const ty: number[] = [];
    const held: number[] = [];
    const slot = i < SLOTS;
    for (const figure of FIGURES) {
      const at = slot && figure.points[i] ? slotAt(figure.points[i], figure, box) : undefined;
      tx.push(at ? at[0] : hx);
      ty.push(at ? at[1] : hy);
      held.push(at ? 1 : 0);
    }
    // Most stars are dust: one to two points across. A few are brighter.
    const bright = r < 0.12;
    const size = bright ? 2 + rand() * 1.2 : 1 + rand() * 1.1;
    const tintRoll = rand();
    // The seven that end as the Dipper take their size from the sky, not the seed.
    const inDipper = i < sky.stars.length;
    field.push({
      hx,
      hy,
      size,
      opacity: bright ? 0.6 + rand() * 0.4 : 0.22 + rand() * 0.42,
      amp: 3 + rand() * 8,
      turns: 1 + Math.floor(rand() * 3),
      twinkleTurns: 4 + Math.floor(rand() * 9),
      blinkTurns: inDipper ? DIPPER_BLINK_TURNS[i] : 5,
      phase: rand() * Math.PI * 2,
      tx,
      ty,
      held,
      dipScale: inDipper ? (DIPPER_PX * sky.stars[i].brightness) / size : HELD_SCALE,
      slot,
      // Icy white-blue for most; the brighter ones pure white, and a few of those sage.
      tint: !bright ? tints.ice : tintRoll < 0.35 ? tints.sage : tints.white,
    });
  }
  return field;
}

/* -------------------------------- colours -------------------------------- */

/**
 * A token, cooled: red pulled down, green a little, blue pushed toward
 * full — so white turns icy and sage turns teal, and the hue the design
 * system chose is still where it came from. A derivation on a token, in
 * the family of withZeroAlpha; the argument and the result are hex.
 */
export function cooled(hex: string, amount: number): string {
  const m = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const channel = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  const cooledR = r * (1 - amount);
  const cooledG = g * (1 - amount / 2);
  const cooledB = b + (255 - b) * amount;
  return `#${channel(cooledR)}${channel(cooledG)}${channel(cooledB)}`;
}

/* ------------------------------ the position ----------------------------- */

export type Placed = {
  x: number;
  y: number;
  /** How much a figure holds this star, 0–1. */
  held: number;
  /** The wave's crest passing, 0–1. */
  lift: number;
};

const TAU = 6.283185307179586;

/**
 * The wave's push on a point: how much the crest is over it (0–1) and how
 * far to move it outward. `r` is the wave's progress, 0–1; nothing when
 * the wave is not running.
 */
export function rippleAt(
  x: number,
  y: number,
  r: number,
  cx: number,
  cy: number,
  maxR: number,
): { lift: number; dx: number; dy: number } {
  'worklet';
  if (r <= 0 || r >= 1) return { lift: 0, dx: 0, dy: 0 };
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  const crest = r * maxR;
  const off = (d - crest) / RIPPLE_WIDTH;
  const lift = Math.exp(-off * off) * (1 - r);
  const shift = (lift * RIPPLE_PX) / (d + 1);
  return { lift, dx: dx * shift, dy: dy * shift };
}

/**
 * Where a star that figures can hold is right now: between its two
 * figures' places for it, wobbling on the clock unless a figure holds
 * it, and pushed by the wave as the crest passes. Read on the UI thread
 * by the star itself and by every line that ends on it.
 */
export function figureStarAt(
  p: Star,
  cur: number,
  prev: number,
  blend: number,
  clock: number,
  ripple: number,
  cx: number,
  cy: number,
  maxR: number,
): Placed {
  'worklet';
  const fromX = prev < 0 ? p.hx : p.tx[prev];
  const fromY = prev < 0 ? p.hy : p.ty[prev];
  const toX = cur < 0 ? p.hx : p.tx[cur];
  const toY = cur < 0 ? p.hy : p.ty[cur];
  const fromHeld = prev < 0 ? 0 : p.held[prev];
  const toHeld = cur < 0 ? 0 : p.held[cur];
  const held = fromHeld + (toHeld - fromHeld) * blend;

  const angle = TAU * p.turns * clock + p.phase;
  const amp = p.amp * (1 - held) + 1.2 * held;
  const x = fromX + (toX - fromX) * blend + Math.sin(angle) * amp;
  const y = fromY + (toY - fromY) * blend + Math.cos(angle) * amp;
  const wave = rippleAt(x, y, ripple, cx, cy, maxR);
  return { x: x + wave.dx, y: y + wave.dy, held, lift: wave.lift };
}

/**
 * Where one of the dust is right now: its home, wobbling on the clock,
 * pushed by the wave. No figure ever holds it, so there is no blend to
 * read — this is the cheap path the other three hundred and eighty-four
 * stars take every frame.
 */
export function dustStarAt(p: Star, clock: number, ripple: number, cx: number, cy: number, maxR: number): Placed {
  'worklet';
  const angle = TAU * p.turns * clock + p.phase;
  const x = p.hx + Math.sin(angle) * p.amp;
  const y = p.hy + Math.cos(angle) * p.amp;
  const wave = rippleAt(x, y, ripple, cx, cy, maxR);
  return { x: x + wave.dx, y: y + wave.dy, held: 0, lift: wave.lift };
}

/** A star's twinkle on the clock: its own opacity, breathing between 0.6 and 1 of itself. */
export function twinkleAt(p: Star, clock: number): number {
  'worklet';
  return p.opacity * (0.6 + 0.4 * Math.sin(TAU * p.twinkleTurns * clock + p.phase));
}

/** A Dipper star's blink on the clock: never out, never quite steady, on its own turns and phase. */
export function blinkAt(p: Star, clock: number): number {
  'worklet';
  return 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(TAU * p.blinkTurns * clock + p.phase * 1.7));
}
