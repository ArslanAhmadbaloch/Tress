/**
 * The mesh: a wireframe cap over the head.
 *
 * It is what makes the scan read as an instrument rather than a camera.
 * Thin translucent lines — meridians from the crown down to the eyebrow
 * line, latitude rings between, wrapping past the temples to the ears —
 * following the person at frame rate, lit by a scan line that sweeps up
 * and down the dome while the scan runs and by flicks that twinkle over
 * it. There is nothing on the face: the eyes, the nose and the mouth
 * are left alone, because the scan is not looking at them. Never a
 * filter: nothing here is opaque, nothing is coloured like a costume,
 * and the lines are a hair wide.
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
 * the camera, and that is what gives the flat drawing its depth: lines
 * square to the phone are drawn wider and brighter, lines at the edge
 * of the head are thinner, and what has turned away is barely there at
 * all. So the temple facing the phone is where the eye goes, which is
 * where the scan is looking.
 *
 * ── The lights ────────────────────────────────────────────────────────
 * Two things move over the cap while the scan runs. The scan line is a
 * soft band around a bright core that sweeps from the brow to the crown
 * and back, read between the cap's own rings so it bends with the head
 * rather than crossing the screen. The twinkles are star-like flicks
 * that light on one vertex, fade, and light on another; they are dimmed
 * by facing, so they gather on the side of the head the phone sees.
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
 * Reduce Motion takes the glide, the scan line and the lit points away
 * and leaves the cap where the head is. Following a head is tracking, not
 * animation; it stays. So does the fill: it is state, as the ring's is.
 *
 * ── The still ─────────────────────────────────────────────────────────
 * `StaticHairMesh`, at the bottom, is the same cap held on a
 * photograph: built once from a face already laid out in the picture's
 * box (see `meshInBox` in the engine), drawn as plain paths with no
 * glide, no scan line and nothing to follow. It is what the processing
 * screen puts over the captured still, so the instrument the camera
 * showed is the one the pass is seen to work on.
 *
 * ── What it is not ────────────────────────────────────────────────────
 * The cap is geometry: lofted from a tracked 3D face where the phone
 * has one, extrapolated from the face oval and the brow where it does
 * not. It is where the scan looks, not a measurement of what is there.
 * The mesh knows where the head is; it does not know what is on it.
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
  CAP_VERTICES,
  buildHeadCap,
  capIndex,
  type CapMesh,
} from '@/features/hair-scan/head-cap';
import type { FaceSource, TrackedFace } from '@/features/hair-scan/tracking';
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
 *              what stops the scan line.
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
  /** Runs the scan effects: the line sweeping the cap, the twinkles and the lit points. */
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

/** One sweep of the scan line, brow to crown, before it turns back. */
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

/**
 * The twinkles: small star-like flicks that light for a moment on one
 * vertex of the cap, fade, and light again somewhere else. Several are
 * alive at once, each on its own clock, and each is dimmed by how much
 * its vertex faces the camera — so they gather on the side of the head
 * the phone can see and nothing sparkles round the back.
 */
const TWINKLE_COUNT = 10;
const TWINKLE_MS = 1150;
/** A flick's arms: the long pair across, the short pair on the diagonal. */
const TWINKLE = { arm: 4.2, cross: 0.42, width: 1 };

/**
 * Line weights and lights, by region. The cap is dense — a cell is a few
 * points across — so the lines are a hair wide and translucent: at these
 * weights the grid reads as a mesh over the head, not as a veil on it.
 * The hairline band and the temples are the brightest lines; the side
 * that has turned away is the faintest.
 */
const GRID = { width: 0.7, opacity: 0.4 };
const NEAR = { width: 0.85, opacity: 0.6 };
const BAND = { width: 0.95, opacity: 0.75 };
const FAR = { width: 0.55, opacity: 0.12 };
/** The fill: three steps of the accent as a sector's coverage climbs. */
const TINT = { width: 0.9, opacity: [0.45, 0.7, 0.95] as const, steps: [0.2, 0.55, 0.9] as const };
/** The scan line: a soft band around a bright core, three strokes of one path. */
const BEAM_CORE = { width: 1.6, opacity: 0.85 };
const BEAM_BAND = { width: 4.5, opacity: 0.32 };
const BEAM_GLOW = { width: 13, opacity: 0.18 };

/** A line whose ends face the camera less than this, on average, has turned away. */
const FAR_FACING = 0.03;
/** A line whose ends face the camera more than this is drawn as the near side. */
const NEAR_FACING = 0.5;

/** How far towards sage the lines go when the tone is good. All the way reads as a costume. */
const TONE_MIX = 0.65;

/* -------------------------------- topology ------------------------------- */

const ZERO: number[] = new Array<number>(CAP_LENGTH).fill(0);

const POINT_SLOTS = Array.from({ length: POINT_COUNT }, (_, i) => i);
const TWINKLE_SLOTS = Array.from({ length: TWINKLE_COUNT }, (_, i) => i);

/**
 * The paths a cap is drawn as, by index into the array the builder
 * returns: what faces away, the grid, the side of the dome turned
 * towards the phone, the hairline band, and the three steps of the fill.
 *
 * ── What a frame costs ────────────────────────────────────────────────
 * The cap is 191 vertices: ten rings of nineteen, and a pole. Its rings
 * are 10 × 18 = 180 segments and its meridians 19 × 10 = 190, so 370
 * segments are walked once per drawn frame and appended to whichever of
 * these seven strings each belongs in — the same walk, over the same
 * count, as before the near side, the twinkles and the scan line
 * arrived; none of them added a segment. Runs
 * in the same bucket share a subpath, so a ring crosses into a new one
 * only where the drawing actually changes — a handful of extra `M`s per
 * ring, not one per segment. The whole cap is therefore seven long
 * paths, the scan line one more (three strokes of it), and the lights
 * on top are ten flicks and six blooms: thirty-two animated nodes, the
 * same count this drew before the near side and the twinkles arrived.
 */
const PATH_FAR = 0;
const PATH_GRID = 1;
const PATH_NEAR = 2;
const PATH_BAND = 3;
const PATH_TINT = 4;
const PATH_COUNT = PATH_TINT + TINT.steps.length;

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
  if (CAP_BAND[a] && CAP_BAND[b]) return PATH_BAND;
  return facing > NEAR_FACING ? PATH_NEAR : PATH_GRID;
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

/**
 * One flick: a four-pointed star drawn as two crossing strokes, the
 * long pair across and the short pair on the diagonal, so it reads as a
 * twinkle rather than a dot. Four subpaths, eight points.
 */
function starPath(x: number, y: number, arm: number): string {
  'worklet';
  const d = arm * TWINKLE.cross;
  return (
    'M' + num(x - arm) + ' ' + num(y) + 'L' + num(x + arm) + ' ' + num(y) +
    'M' + num(x) + ' ' + num(y - arm) + 'L' + num(x) + ' ' + num(y + arm) +
    'M' + num(x - d) + ' ' + num(y - d) + 'L' + num(x + d) + ' ' + num(y + d) +
    'M' + num(x - d) + ' ' + num(y + d) + 'L' + num(x + d) + ' ' + num(y - d)
  );
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
  const near = useAnimatedProps(() => ({ d: paths.get()[PATH_NEAR], stroke: stroke.get() }));
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
  const beamBand = useAnimatedProps(() => ({
    d: beamD.get(),
    opacity: BEAM_BAND.opacity * beamStrength.get(),
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
          animatedProps={near}
          fill="none"
          strokeWidth={NEAR.width}
          strokeOpacity={NEAR.opacity}
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
          animatedProps={beamBand}
          fill="none"
          stroke={sage}
          strokeWidth={BEAM_BAND.width}
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
        {TWINKLE_SLOTS.map((slot) => (
          <TwinklePoint
            key={slot}
            slot={slot}
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
 * One twinkle: a star-like flick that lights on a vertex of the cap for
 * a moment, fades, and lights again on another.
 *
 * Every slot walks the same fixed sequence of vertices at its own
 * offset, so several are alive at once and the pattern is the same on
 * every phone — nothing random runs on the UI thread. A vertex that has
 * turned away from the camera is dark, which is what gathers the flicks
 * on the side of the head the phone can see.
 */
function TwinklePoint({ slot, current, clock, strength, color }: PointProps & { slot: number }) {
  const props = useAnimatedProps(() => {
    const pts = current.get();
    const t = clock.get() + (slot * TWINKLE_MS) / TWINKLE_COUNT;
    const generation = Math.floor(t / TWINKLE_MS);
    const phase = (t - generation * TWINKLE_MS) / TWINKLE_MS;
    const v = CAP_VERTICES[(generation * 37 + slot * 61) % CAP_VERTICES.length] * CAP_STRIDE;
    const facing = Math.max(0, Math.min(1, pts[v + 2] * 1.8));
    const lit = Math.sin(Math.PI * phase);
    return {
      d: starPath(pts[v], pts[v + 1], TWINKLE.arm * (0.45 + 0.55 * lit)),
      opacity: lit * lit * facing * strength.get(),
    };
  });
  return (
    <AnimatedPath
      animatedProps={props}
      fill="none"
      stroke={color}
      strokeWidth={TWINKLE.width}
      strokeLinecap="round"
    />
  );
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

/**
 * A face laid out in a still's own box, and — when the frame that took
 * the still had one — the tracked 3D mesh it had at the shutter.
 *
 * The mesh matters because the two roads the cap is built from do not
 * put a head in the same place. A phone that tracks in 3D draws the live
 * cap off its anchor; if the still it hands on carries only contours,
 * the processing screen and the report hero draw a cap lofted from an
 * oval instead, and the owner sees two different meshes on one head in
 * one walk through the scan. Carrying the mesh through keeps them one
 * shape. The still's points must be in the same box the face is in.
 */
export type StaticMeshFace = MeshFace & {
  mesh?: CapMesh;
  hasMesh?: boolean;
  source?: FaceSource;
};

export type StaticHairMeshProps = {
  /** The face, already in the points of the box this is drawn in. */
  face: StaticMeshFace;
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
 * Built once per face and drawn as plain paths: no glide, no scan line,
 * no tracking, no fill. A still that carries the head's angles from its
 * shutter gets a cap turned the same way, so a frame taken from the
 * side shows a cap seen from the side; one without them is square on.
 * A still that carries the tracked mesh from its shutter as well gets
 * the same cap the camera drew, rather than one lofted from an oval —
 * see `StaticMeshFace`. It always draws on a photograph inside the dark
 * instrument, so its colours come from `darkColors` whichever appearance
 * the app is in, as the processing screen's do.
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
      face.pose === undefined
        ? face
        : { ...face, yaw: face.pose.yaw, pitch: face.pose.pitch, roll: face.pose.roll },
    );
    const built = capPaths(pts, null);
    return {
      far: built[PATH_FAR],
      grid: built[PATH_GRID],
      near: built[PATH_NEAR],
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
        d={paths.near}
        fill="none"
        stroke={stroke}
        strokeWidth={NEAR.width}
        strokeOpacity={NEAR.opacity * strength}
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
