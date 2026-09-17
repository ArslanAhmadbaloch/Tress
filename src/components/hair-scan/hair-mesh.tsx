/**
 * The mesh: a wireframe cap over the head.
 *
 * It is what makes the scan read as an instrument rather than a camera.
 * Thin translucent lines — meridians from the crown down to the eyebrow
 * line, latitude rings between, wrapping past the temples to the ears —
 * following the person at frame rate, lit by a beam that sweeps the
 * dome while the scan runs. There is nothing on the face: the eyes, the
 * nose and the mouth are left alone, because the scan is not looking at
 * them. Never a filter: nothing here is opaque, nothing is coloured like
 * a costume, and the lines are a hair wide.
 *
 * ── How it moves ──────────────────────────────────────────────────────
 * Faces arrive on the JS thread at the detector's rate, fifteen to
 * thirty a second. Each one is folded into a cap — one flat array of
 * numbers, fixed layout, see head-cap.ts — and posted to the UI thread
 * as a *target*. A frame callback on the UI thread then glides the drawn
 * cap towards that target every screen frame, so a detector running at
 * twenty frames a second still moves the mesh at sixty. The paths are
 * rebuilt from the glided numbers on the UI thread; no React render
 * happens per frame, and the screen above never re-renders for a face.
 *
 * The cap turns with the head. Every vertex carries how much it faces
 * the camera, so as the head turns the near side is drawn full and the
 * side that has turned away fades: the temple facing the phone is where
 * the eye goes, which is where the scan is looking.
 *
 * ── The fill ──────────────────────────────────────────────────────────
 * The screen hands over the engine's coverage — the same twenty-four
 * numbers the ring reads — and each line of the cap belongs to one of
 * those sectors (see `CAP_SECTOR_OF`). As a sector is captured its lines
 * take the accent, so the head fills in as the ring does: turn to the
 * right and the right side of the cap comes up green with the right of
 * the ring. It is a picture of where the head has been pointed, not of
 * anything on the head.
 *
 * Reduce Motion takes the glide, the beam and the lit points away and
 * leaves the cap where the head is. Following a head is tracking, not
 * animation; it stays. So does the fill: it is state, as the ring's is.
 *
 * ── The still ─────────────────────────────────────────────────────────
 * `StaticHairMesh`, at the bottom, is the same cap held on a
 * photograph: built once from a face already laid out in the picture's
 * box (see `meshInBox` in the engine), drawn as plain paths with no
 * glide, no beam and nothing to follow. It is what the processing
 * screen puts over the captured still, so the instrument the camera
 * showed is the one the pass is seen to work on.
 *
 * ── What it is not ────────────────────────────────────────────────────
 * The cap is geometry extrapolated from the face oval and the brow. It
 * is where the scan looks, not a measurement of what is there. The mesh
 * knows where the head is; it does not know what is on it.
 */

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type FrameInfo,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';

import {
  CAP,
  CAP_BAND,
  CAP_LENGTH,
  CAP_MERIDIANS,
  CAP_RINGS,
  CAP_SECTOR_OF,
  CAP_SITES,
  CAP_STRIDE,
  buildHeadCap,
  capIndex,
} from '@/features/hair-scan/head-cap';
import type { TrackedFace } from '@/features/hair-scan/tracking';
import type { MeshFace } from '@/features/hair-scan/types';
import { darkColors, motion, useTheme } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * How the mesh is coloured.
 *
 *   neutral  — white lines: the instrument is looking.
 *   good     — a breath of sage: the head is where the scan wants it.
 *   complete — the same sage, held: the scan has what it needs. The
 *              screen turns `scanning` off at the same moment, which is
 *              what stops the beam.
 */
export type MeshTone = 'neutral' | 'good' | 'complete';

export type HairMeshHandle = {
  /**
   * The latest tracked face, or null when there is none. Call it from
   * the frame handler; it never causes a React render.
   */
  setFace(face: TrackedFace | null): void;
};

export type HairMeshProps = {
  ref?: Ref<HairMeshHandle>;
  /** Runs the scan effects: the beam over the cap and the lit points on the hairline. */
  scanning: boolean;
  tone?: MeshTone;
  /**
   * The engine's per-sector coverage, 0–1 each, the array the ring
   * reads. Read on the UI thread; the cap's lines in captured sectors
   * take the accent. Leave it out and the cap never fills.
   */
  coverage?: SharedValue<number[]>;
};

/* --------------------------------- tuning -------------------------------- */

/** Time constant of the glide towards a new reading, in milliseconds. */
const GLIDE_TAU_MS = 48;

/** Closer than this, in points, and the glide snaps and goes quiet. */
const SNAP_EPS = 0.05;

/** One sweep of the beam, brow to crown, before it turns back. */
const BEAM_MS = 2400;

/** How long each lit point takes to bloom and fade. */
const PULSE_MS = 1400;

/** How many points are lit at once. */
const POINT_COUNT = 6;

/**
 * A lit point: a small bright core inside a soft halo, so it blooms on
 * the hairline rather than pricking it. Radii in points.
 */
const BLOOM = { core: { min: 1.2, max: 4.2 }, halo: { min: 3, max: 12, opacity: 0.28 } };

/** The finer flecks that drift over the cap while the scan looks: a fast twinkle. */
const SPECKLE_MS = 900;
const SPECKLE = { r: 1.1, floor: 0.3 };

/**
 * Line weights and lights, by region. The cap is dense — a cell is a few
 * points across — so the lines are a hair wide and translucent: at these
 * weights the grid reads as a mesh over the head, not as a veil on it.
 * The hairline band and the temples are the brightest lines; the side
 * that has turned away is the faintest.
 */
const GRID = { width: 0.7, opacity: 0.4 };
const BAND = { width: 0.85, opacity: 0.6 };
const FAR = { width: 0.6, opacity: 0.14 };
/** The fill: three steps of the accent as a sector's coverage climbs. */
const TINT = { width: 0.9, opacity: [0.45, 0.7, 0.95] as const, steps: [0.2, 0.55, 0.9] as const };
const BEAM_CORE = { width: 1.6, opacity: 0.85 };
const BEAM_GLOW = { width: 11, opacity: 0.2 };

/** A line whose ends face the camera less than this, on average, has turned away. */
const FAR_FACING = 0.03;

/** How far towards sage the lines go when the tone is good. All the way reads as a costume. */
const TONE_MIX = 0.65;

/* -------------------------------- topology ------------------------------- */

const ZERO: number[] = new Array<number>(CAP_LENGTH).fill(0);

const POINT_SLOTS = Array.from({ length: POINT_COUNT }, (_, i) => i);

/**
 * The paths a cap is drawn as, by index into the array the builder
 * returns: what faces away, the grid, the band, and the three steps of
 * the fill.
 */
const PATH_FAR = 0;
const PATH_GRID = 1;
const PATH_BAND = 2;
const PATH_TINT = 3;
const PATH_COUNT = PATH_TINT + TINT.steps.length;

/**
 * Where the flecks sit: a fixed scatter over the cap's interior, each
 * one a fraction of the way across a cell so it lands between the lines,
 * with its own phase so they twinkle out of step. Fixed, so the pattern
 * is the same on every phone and there is nothing random on the UI thread.
 */
type Speckle = {
  /** The cell's four corners as offsets into the flat cap, worked out here, not on the UI thread. */
  a: number;
  b: number;
  c: number;
  d: number;
  u: number;
  v: number;
  phase: number;
};

const SPECKLES: Speckle[] = (() => {
  const out: Speckle[] = [];
  const count = 12;
  // The interior: rows above the band, columns that face the camera square on.
  const firstRow = 2;
  const lastRow = CAP.rows - 2;
  const firstCol = CAP.templeCols + 1;
  const lastCol = CAP.cols - CAP.templeCols - 2;
  for (let i = 0; i < count; i += 1) {
    // Low-discrepancy scatter: the golden ratio walks the rows, a second
    // irrational the columns, so the flecks spread rather than cluster.
    const row = firstRow + Math.floor(((i * 0.618034) % 1) * (lastRow - firstRow));
    const col = firstCol + Math.floor(((i * 0.414214) % 1) * (lastCol - firstCol));
    out.push({
      a: capIndex(row, col) * CAP_STRIDE,
      b: capIndex(row, col + 1) * CAP_STRIDE,
      c: capIndex(row + 1, col) * CAP_STRIDE,
      d: capIndex(row + 1, col + 1) * CAP_STRIDE,
      u: (i * 0.7548777) % 1,
      v: (i * 0.5698403) % 1,
      phase: (i * 0.3247) % 1,
    });
  }
  return out;
})();

/* --------------------------- path building (UI) -------------------------- */

function num(v: number): string {
  'worklet';
  return (Math.round(v * 10) / 10).toString();
}

/** A vertex's fill, 0–1: its sector's coverage, or the scan's mean for the front centre. */
function tintOf(cover: number[] | null, mean: number, v: number): number {
  'worklet';
  if (cover === null) return 0;
  const sector = CAP_SECTOR_OF[v];
  if (sector < 0) return mean;
  const c = cover[sector];
  return c === undefined ? 0 : c;
}

/** Which path the line between two vertices belongs in. */
function pathOf(pts: number[], cover: number[] | null, mean: number, a: number, b: number): number {
  'worklet';
  const facing = (pts[a * CAP_STRIDE + 2] + pts[b * CAP_STRIDE + 2]) / 2;
  if (facing < FAR_FACING) return PATH_FAR;
  const tint = (tintOf(cover, mean, a) + tintOf(cover, mean, b)) / 2;
  for (let step = TINT.steps.length - 1; step >= 0; step -= 1) {
    if (tint >= TINT.steps[step]) return PATH_TINT + step;
  }
  return CAP_BAND[a] && CAP_BAND[b] ? PATH_BAND : PATH_GRID;
}

/**
 * Walks one ring or meridian, handing each line to its path. Runs of
 * lines in the same path share one subpath; a change starts a new one,
 * so a ring that is half captured is two strokes, not nineteen.
 */
function walk(
  out: string[],
  pts: number[],
  indices: readonly number[],
  cover: number[] | null,
  mean: number,
): void {
  'worklet';
  let prev = -1;
  for (let i = 1; i < indices.length; i += 1) {
    const a = indices[i - 1];
    const b = indices[i];
    const path = pathOf(pts, cover, mean, a, b);
    const ka = a * CAP_STRIDE;
    const kb = b * CAP_STRIDE;
    if (path !== prev) out[path] += 'M' + num(pts[ka]) + ' ' + num(pts[ka + 1]);
    out[path] += 'L' + num(pts[kb]) + ' ' + num(pts[kb + 1]);
    prev = path;
  }
}

/** Every path of the cap, from the drawn vertices and the coverage. */
function capPaths(pts: number[], cover: number[] | null): string[] {
  'worklet';
  const out: string[] = [];
  for (let i = 0; i < PATH_COUNT; i += 1) out.push('');
  let mean = 0;
  if (cover !== null && cover.length > 0) {
    let sum = 0;
    for (let i = 0; i < cover.length; i += 1) sum += cover[i];
    mean = sum / cover.length;
  }
  for (let r = 0; r < CAP_RINGS.length; r += 1) walk(out, pts, CAP_RINGS[r], cover, mean);
  for (let c = 0; c < CAP_MERIDIANS.length; c += 1) walk(out, pts, CAP_MERIDIANS[c], cover, mean);
  return out;
}

/**
 * The beam: one ring, read between the rings the cap actually has, so it
 * conforms to the dome as it sweeps. It never reaches the pole, where
 * every meridian meets and a ring is a point, and it lights only the
 * side that faces the camera.
 */
function beamPath(pts: number[], position: number): string {
  'worklet';
  const j = position * (CAP.rows - 1.4);
  const j0 = Math.floor(j);
  const j1 = Math.min(CAP.rows - 1, j0 + 1);
  const f = j - j0;
  let d = '';
  let open = false;
  for (let c = 0; c < CAP.cols; c += 1) {
    const a = capIndex(j0, c) * CAP_STRIDE;
    const b = capIndex(j1, c) * CAP_STRIDE;
    const facing = pts[a + 2] + (pts[b + 2] - pts[a + 2]) * f;
    if (facing < FAR_FACING) {
      open = false;
      continue;
    }
    const x = pts[a] + (pts[b] - pts[a]) * f;
    const y = pts[a + 1] + (pts[b + 1] - pts[a + 1]) * f;
    d += (open ? 'L' : 'M') + num(x) + ' ' + num(y);
    open = true;
  }
  return d;
}

/* ------------------------------- component ------------------------------- */

export function HairMesh({ ref, scanning, tone = 'neutral', coverage }: HairMeshProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  /** Where the head is, per the last reading. */
  const target = useSharedValue<number[]>(ZERO);
  /** Where the cap is drawn: glides towards `target`. */
  const current = useSharedValue<number[]>(ZERO);
  /** Set when the target moves; cleared once the glide has caught up. */
  const dirty = useSharedValue(0);
  const visible = useSharedValue(0);
  /** 1 while the scan runs; the effects and the clock hang off it. */
  const scanningValue = useSharedValue(0);
  /** Milliseconds of scanning so far. Stops when the scan does. */
  const clock = useSharedValue(0);
  const beam = useSharedValue(0);
  const toneValue = useSharedValue(0);

  const presentRef = useRef(false);
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  useImperativeHandle(
    ref,
    (): HairMeshHandle => ({
      setFace(face) {
        if (face === null) {
          if (!presentRef.current) return;
          presentRef.current = false;
          // Fades where it stands. Collapsing it would be a pop.
          visible.set(
            reducedRef.current ? 0 : withTiming(0, { duration: motion.duration.base }),
          );
          return;
        }
        const cap = buildHeadCap(face);
        target.set(cap);
        if (!presentRef.current) {
          presentRef.current = true;
          // A head arriving from nothing appears where it is: no glide
          // across the screen from wherever the last one faded.
          current.set(cap);
          visible.set(
            reducedRef.current ? 1 : withTiming(1, { duration: motion.duration.slow }),
          );
        }
        dirty.set(1);
      },
    }),
    [target, current, visible, dirty],
  );

  /*
    The glide. Runs every screen frame; does nothing once the drawn cap
    has caught up with the target, so a still head costs no path
    rebuilds at all. The clock for the effects lives here too, so it
    advances only while frames are actually being drawn.
  */
  const step = useCallback(
    (info: FrameInfo) => {
      'worklet';
      const dt = Math.min(64, info.timeSincePreviousFrame ?? 16);
      if (scanningValue.get() > 0.5 && !reduced) clock.set(clock.get() + dt);
      if (dirty.get() === 0) return;

      const tgt = target.get();
      const cur = current.get();
      let worst = 0;
      for (let i = 0; i < CAP_LENGTH; i += 1) {
        const gap = Math.abs(tgt[i] - cur[i]);
        if (gap > worst) worst = gap;
      }
      const converged = reduced || worst < SNAP_EPS;
      const k = 1 - Math.exp(-dt / GLIDE_TAU_MS);
      current.modify((values) => {
        'worklet';
        for (let i = 0; i < CAP_LENGTH; i += 1) {
          values[i] = converged ? tgt[i] : values[i] + (tgt[i] - values[i]) * k;
        }
        return values;
      });
      if (converged) dirty.set(0);
    },
    [scanningValue, reduced, clock, dirty, target, current],
  );
  useFrameCallback(step);

  useEffect(() => {
    const on = scanning ? 1 : 0;
    scanningValue.set(reduced ? on : withTiming(on, { duration: motion.duration.base }));
  }, [scanning, reduced, scanningValue]);

  useEffect(() => {
    if (scanning && !reduced) {
      beam.set(
        withRepeat(
          withTiming(1, { duration: BEAM_MS, easing: Easing.inOut(Easing.sin) }),
          -1,
          true,
        ),
      );
      return () => cancelAnimation(beam);
    }
    // The beam fades where it stopped — its opacity is following
    // `scanningValue` down over the same duration — and only then goes
    // home to the brow, so the next scan starts from the hairline. Sent
    // home at once it would be seen jumping there mid-fade.
    beam.set(reduced ? 0 : withDelay(motion.duration.base, withTiming(0, { duration: 0 })));
    return undefined;
  }, [scanning, reduced, beam]);

  useEffect(() => {
    const v = tone === 'neutral' ? 0 : 1;
    toneValue.set(reduced ? v : withTiming(v, { duration: motion.duration.slow }));
  }, [tone, reduced, toneValue]);

  const white = colors.textOnPhoto;
  const sage = colors.success;

  const wrapper = useAnimatedStyle(() => ({ opacity: visible.get() }));

  const stroke = useDerivedValue(() =>
    interpolateColor(toneValue.get() * TONE_MIX, [0, 1], [white, sage]),
  );

  const paths = useDerivedValue(() =>
    capPaths(current.get(), coverage === undefined ? null : coverage.get()),
  );

  const far = useAnimatedProps(() => ({ d: paths.get()[PATH_FAR], stroke: stroke.get() }));
  const grid = useAnimatedProps(() => ({ d: paths.get()[PATH_GRID], stroke: stroke.get() }));
  const band = useAnimatedProps(() => ({ d: paths.get()[PATH_BAND], stroke: stroke.get() }));
  const tint0 = useAnimatedProps(() => ({ d: paths.get()[PATH_TINT] }));
  const tint1 = useAnimatedProps(() => ({ d: paths.get()[PATH_TINT + 1] }));
  const tint2 = useAnimatedProps(() => ({ d: paths.get()[PATH_TINT + 2] }));

  const beamD = useDerivedValue(() => beamPath(current.get(), beam.get()));
  const beamStrength = useDerivedValue(() => (reduced ? 0 : scanningValue.get()));
  const beamCore = useAnimatedProps(() => ({
    d: beamD.get(),
    opacity: BEAM_CORE.opacity * beamStrength.get(),
  }));
  const beamGlow = useAnimatedProps(() => ({
    d: beamD.get(),
    opacity: BEAM_GLOW.opacity * beamStrength.get(),
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, wrapper]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" accessible={false}>
        <AnimatedPath
          animatedProps={far}
          fill="none"
          strokeWidth={FAR.width}
          strokeOpacity={FAR.opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPath
          animatedProps={grid}
          fill="none"
          strokeWidth={GRID.width}
          strokeOpacity={GRID.opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPath
          animatedProps={band}
          fill="none"
          strokeWidth={BAND.width}
          strokeOpacity={BAND.opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPath
          animatedProps={tint0}
          fill="none"
          stroke={sage}
          strokeWidth={TINT.width}
          strokeOpacity={TINT.opacity[0]}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPath
          animatedProps={tint1}
          fill="none"
          stroke={sage}
          strokeWidth={TINT.width}
          strokeOpacity={TINT.opacity[1]}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPath
          animatedProps={tint2}
          fill="none"
          stroke={sage}
          strokeWidth={TINT.width}
          strokeOpacity={TINT.opacity[2]}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPath
          animatedProps={beamGlow}
          fill="none"
          stroke={sage}
          strokeWidth={BEAM_GLOW.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPath
          animatedProps={beamCore}
          fill="none"
          stroke={white}
          strokeWidth={BEAM_CORE.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {SPECKLES.map((speckle, i) => (
          <SpecklePoint
            key={i}
            speckle={speckle}
            current={current}
            clock={clock}
            strength={beamStrength}
            color={white}
          />
        ))}
        {POINT_SLOTS.map((slot) => (
          <AnalysisPoint
            key={slot}
            slot={slot}
            current={current}
            clock={clock}
            strength={beamStrength}
            color={white}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

type PointProps = {
  current: SharedValue<number[]>;
  clock: SharedValue<number>;
  strength: SharedValue<number>;
  color: string;
};

/**
 * One of the lights that visit the hairline and temples while the scan
 * runs. Each blooms and fades over a pulse — a bright core inside a soft
 * halo — then moves to another site; the sites are the cap's hairline
 * band and its temples, chosen by a fixed sequence so the pattern is the
 * same on every phone. A site that has turned away from the camera stays
 * dark.
 */
function AnalysisPoint({ slot, current, clock, strength, color }: PointProps & { slot: number }) {
  const place = useDerivedValue(() => {
    const pts = current.get();
    const t = clock.get() + (slot * PULSE_MS) / POINT_COUNT;
    const generation = Math.floor(t / PULSE_MS);
    const phase = (t - generation * PULSE_MS) / PULSE_MS;
    const site = CAP_SITES[(generation * 7 + slot * 13) % CAP_SITES.length] * CAP_STRIDE;
    const facing = Math.max(0, Math.min(1, pts[site + 2] * 2));
    const lit = Math.sin(Math.PI * phase) * facing;
    return { x: pts[site], y: pts[site + 1], lit: lit * strength.get() };
  });
  const halo = useAnimatedProps(() => {
    const { x, y, lit } = place.get();
    return {
      cx: x,
      cy: y,
      r: BLOOM.halo.min + (BLOOM.halo.max - BLOOM.halo.min) * lit,
      opacity: lit * lit * BLOOM.halo.opacity,
    };
  });
  const core = useAnimatedProps(() => {
    const { x, y, lit } = place.get();
    return {
      cx: x,
      cy: y,
      r: BLOOM.core.min + (BLOOM.core.max - BLOOM.core.min) * lit,
      opacity: lit * lit * 0.95,
    };
  });
  return (
    <>
      <AnimatedCircle animatedProps={halo} fill={color} />
      <AnimatedCircle animatedProps={core} fill={color} />
    </>
  );
}

/**
 * One fleck over the cap: a tiny point between the lines that twinkles
 * while the scan looks, placed by bilinear interpolation inside its cell
 * so it rides the dome with the cap, and dimmed with the cell as it
 * turns away.
 */
function SpecklePoint({ speckle, current, clock, strength, color }: PointProps & { speckle: Speckle }) {
  const props = useAnimatedProps(() => {
    const pts = current.get();
    const { a, b, c, d, u, v } = speckle;
    const top = { x: pts[a] + (pts[b] - pts[a]) * u, y: pts[a + 1] + (pts[b + 1] - pts[a + 1]) * u };
    const bottom = { x: pts[c] + (pts[d] - pts[c]) * u, y: pts[c + 1] + (pts[d + 1] - pts[c + 1]) * u };
    const facing = Math.max(0, Math.min(1, ((pts[a + 2] + pts[d + 2]) / 2) * 2));
    const phase = (clock.get() / SPECKLE_MS + speckle.phase) % 1;
    const twinkle = Math.sin(Math.PI * phase);
    return {
      cx: top.x + (bottom.x - top.x) * v,
      cy: top.y + (bottom.y - top.y) * v,
      r: SPECKLE.r,
      opacity: (SPECKLE.floor + (1 - SPECKLE.floor) * twinkle * twinkle) * strength.get() * facing,
    };
  });
  return <AnimatedCircle animatedProps={props} fill={color} />;
}

/* ------------------------------ the still ------------------------------- */

/** How many hairline points a still lights, and how slowly they breathe. */
const STILL_POINT_COUNT = 7;
const STILL_BREATH_MS = 2200;
/** The lit points on a still sit between these, so they glow rather than blink. */
const STILL_GLOW = { min: 0.55, max: 1 };
/** A still's point: a fixed bloom, smaller than the live one's peak. */
const STILL_BLOOM = { core: 2.4, halo: 7, haloOpacity: 0.22 };

/**
 * A fixed handful of the hairline sites, spread along the band by a
 * stride, so every still lights the same places and nothing is random.
 */
const STILL_SITES: readonly number[] = (() => {
  const stride = Math.max(1, Math.floor(CAP_SITES.length / STILL_POINT_COUNT));
  const out: number[] = [];
  for (let i = 0; i < STILL_POINT_COUNT; i += 1) {
    const site = CAP_SITES[(i * stride + 3) % CAP_SITES.length];
    if (site !== undefined) out.push(site);
  }
  return out;
})();

export type StaticHairMeshProps = {
  /** The face, already in the points of the box this is drawn in. */
  face: MeshFace;
  width: number;
  height: number;
  tone?: MeshTone;
  /** 0–1: how strongly the lines are drawn. A thumbnail draws faint. */
  strength?: number;
  /** Leave out the lines that face away — a haze at thumbnail size. */
  sparse?: boolean;
  /**
   * Light a few points on the hairline, breathing slowly. They are the
   * one thing here that moves, so Reduce Motion leaves them out and
   * keeps the lines.
   */
  points?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The cap held on a still.
 *
 * Built once per face and drawn as plain paths: no glide, no beam, no
 * tracking, no fill. A still that carries the head's angles from its
 * shutter gets a cap turned the same way, so a frame taken from the
 * side shows a cap seen from the side; one without them is square on.
 * It always draws on a photograph inside the dark instrument, so its
 * colours come from `darkColors` whichever appearance the app is in, as
 * the processing screen's do.
 */
export function StaticHairMesh({
  face,
  width,
  height,
  tone = 'neutral',
  strength = 1,
  sparse = false,
  points = false,
  style,
}: StaticHairMeshProps) {
  const reduced = useReducedMotion();
  const white = darkColors.textOnPhoto;
  const sage = darkColors.success;
  const stroke = tone === 'neutral' ? white : interpolateColor(TONE_MIX, [0, 1], [white, sage]);

  const paths = useMemo(() => {
    const pts = buildHeadCap(
      face.pose === undefined ? face : { ...face, yaw: face.pose.yaw, pitch: face.pose.pitch },
    );
    const built = capPaths(pts, null);
    return {
      far: built[PATH_FAR],
      grid: built[PATH_GRID],
      band: built[PATH_BAND],
      sites: STILL_SITES.map((site) => ({
        x: pts[site * CAP_STRIDE] ?? 0,
        y: pts[site * CAP_STRIDE + 1] ?? 0,
      })),
    };
  }, [face]);

  const lit = points && !reduced;
  const breath = useSharedValue(0);
  useEffect(() => {
    if (!lit) return undefined;
    breath.set(
      withRepeat(withTiming(1, { duration: STILL_BREATH_MS, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    return () => cancelAnimation(breath);
  }, [lit, breath]);
  const glow = useAnimatedProps(() => ({
    opacity: STILL_GLOW.min + (STILL_GLOW.max - STILL_GLOW.min) * breath.get(),
  }));

  return (
    <Svg
      width={width}
      height={height}
      style={style}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants">
      {sparse ? null : (
        <Path
          d={paths.far}
          fill="none"
          stroke={stroke}
          strokeWidth={FAR.width}
          strokeOpacity={FAR.opacity * strength}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <Path
        d={paths.grid}
        fill="none"
        stroke={stroke}
        strokeWidth={GRID.width}
        strokeOpacity={GRID.opacity * strength}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d={paths.band}
        fill="none"
        stroke={stroke}
        strokeWidth={BAND.width}
        strokeOpacity={BAND.opacity * strength}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lit ? (
        <AnimatedG animatedProps={glow}>
          {paths.sites.map((site, i) => (
            <G key={i}>
              <Circle
                cx={site.x}
                cy={site.y}
                r={STILL_BLOOM.halo}
                fill={white}
                opacity={STILL_BLOOM.haloOpacity * strength}
              />
              <Circle cx={site.x} cy={site.y} r={STILL_BLOOM.core} fill={white} opacity={strength} />
            </G>
          ))}
        </AnimatedG>
      ) : null}
    </Svg>
  );
}
