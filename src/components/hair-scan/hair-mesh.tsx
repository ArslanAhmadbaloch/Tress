/**
 * The mesh: a wireframe that sits on the face and reaches up over the
 * hair.
 *
 * It is what makes the scan read as an instrument rather than a camera.
 * Thin translucent lines — a lattice warped to the face's outline, the
 * features as interior curves, and above the brow a dome of rows that
 * stands in for the head — following the person at frame rate, lit by a
 * beam that sweeps the dome while the scan runs. Never a filter: nothing
 * here is opaque, nothing is coloured like a costume, and the lines are
 * a hair wide.
 *
 * ── How it moves ──────────────────────────────────────────────────────
 * Faces arrive on the JS thread at the detector's rate, fifteen to
 * thirty a second. Each one is folded into a lattice — one flat array of
 * numbers, fixed layout, see tracking.ts — and posted to the UI thread
 * as a *target*. A frame callback on the UI thread then glides the drawn
 * lattice towards that target every screen frame, so a detector running
 * at twenty frames a second still moves the mesh at sixty. The paths are
 * rebuilt from the glided numbers on the UI thread; no React render
 * happens per frame, and the screen above never re-renders for a face.
 *
 * Reduce Motion takes the glide, the beam and the lit points away and
 * leaves the mesh where the face is. Following a face is tracking, not
 * animation; it stays.
 *
 * ── The still ─────────────────────────────────────────────────────────
 * `StaticHairMesh`, at the bottom, is the same wireframe held on a
 * photograph: the lattice built once from a face already laid out in
 * the picture's box (see `meshInBox` in the engine), drawn as plain
 * paths with no glide, no beam and nothing to follow. It is what the
 * processing screen puts over the captured still, so the instrument the
 * camera showed is the one the pass is seen to work on.
 *
 * ── What it is not ────────────────────────────────────────────────────
 * The dome above the brow is geometry extrapolated from the face oval.
 * It is where the scan looks, not a measurement of what is there. The
 * mesh knows where the head is; it does not know what is on it.
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
  CAP_OFFSET,
  HAIRLINE_SITES,
  LATTICE_LENGTH,
  MESH,
  buildLattice,
  capIndex,
  faceIndex,
  featureBit,
  featureOffset,
  type FeatureName,
  type TrackedFace,
} from '@/features/hair-scan/tracking';
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
};

/* --------------------------------- tuning -------------------------------- */

/** Time constant of the glide towards a new reading, in milliseconds. */
const GLIDE_TAU_MS = 48;

/** Closer than this, in points, and the glide snaps and goes quiet. */
const SNAP_EPS = 0.05;

/** One sweep of the beam, brow to apex, before it turns back. */
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
 * Line weights and lights, by region. The lattice is dense — a cell is
 * a few points across — so the lines are a hair wide and translucent:
 * at these weights the grid reads as a mesh over the face, not as a veil
 * on it. The cap is the brightest thing here.
 */
const FACE_GRID = { width: 0.6, opacity: 0.3 };
const CAP_GRID = { width: 0.75, opacity: 0.5 };
const OVAL = { width: 1.1, opacity: 0.6 };
const FEATURE_LINES = { width: 0.8, opacity: 0.42 };
const BEAM_CORE = { width: 1.6, opacity: 0.85 };
const BEAM_GLOW = { width: 11, opacity: 0.2 };

/** How far towards sage the lines go when the tone is good. All the way reads as a costume. */
const TONE_MIX = 0.65;

/* -------------------------------- topology ------------------------------- */

const FR = MESH.faceRows;
const CR = MESH.capRows;
const C = MESH.cols;

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Face rows below the brow line; the brow row itself is drawn with the cap. */
const FACE_ROWS: number[][] = range(FR - 1).map((r) => range(C).map((c) => faceIndex(r + 1, c)));
/** Every column, brow to chin. */
const FACE_COLS: number[][] = range(C).map((c) => range(FR).map((r) => faceIndex(r, c)));
/** Cap rows from the brow up, stopping short of the apex where they meet in a point. */
const CAP_ROWS: number[][] = range(CR - 1).map((r) => range(C).map((c) => capIndex(r, c)));
/** Every column, apex down to the brow, where it meets its face column. */
const CAP_COLS: number[][] = range(C).map((c) => range(CR).map((r) => capIndex(CR - 1 - r, c)));

const OVAL_INDICES: number[] = range(36).map((i) => featureOffset('FACE') + i);

type Curve = { indices: number[]; bit: number; closed: boolean };

function curve(name: FeatureName, count: number, closed: boolean): Curve {
  const base = featureOffset(name);
  return { indices: range(count).map((i) => base + i), bit: featureBit(name), closed };
}

const FEATURE_CURVES: Curve[] = [
  curve('LEFT_EYEBROW_TOP', 5, false),
  curve('RIGHT_EYEBROW_TOP', 5, false),
  curve('LEFT_EYE', 16, true),
  curve('RIGHT_EYE', 16, true),
  curve('NOSE_BRIDGE', 2, false),
  curve('NOSE_BOTTOM', 3, false),
  curve('UPPER_LIP_TOP', 11, false),
  curve('LOWER_LIP_BOTTOM', 11, false),
];

const ZERO: number[] = new Array<number>(LATTICE_LENGTH).fill(0);

const POINT_SLOTS = range(POINT_COUNT);

/**
 * Where the flecks sit: a fixed scatter over the cap's interior, each
 * one a fraction of the way across a cell so it lands between the lines,
 * with its own phase so they twinkle out of step. Fixed, so the pattern
 * is the same on every phone and there is nothing random on the UI thread.
 */
type Speckle = {
  /** The cell's four corners as offsets into the flat lattice, worked out here, not on the UI thread. */
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
  const count = 14;
  for (let i = 0; i < count; i += 1) {
    // Low-discrepancy scatter: the golden ratio walks the rows, a second
    // irrational the columns, so the flecks spread rather than cluster.
    const row = 1 + Math.floor(((i * 0.618034) % 1) * (CR - 3));
    const col = 1 + Math.floor(((i * 0.414214) % 1) * (C - 2));
    out.push({
      a: capIndex(row, col) * 2,
      b: capIndex(row, col + 1) * 2,
      c: capIndex(row + 1, col) * 2,
      d: capIndex(row + 1, col + 1) * 2,
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

function polyline(pts: number[], indices: number[], closed: boolean): string {
  'worklet';
  let d = '';
  for (let i = 0; i < indices.length; i += 1) {
    const k = indices[i] * 2;
    d += (i === 0 ? 'M' : 'L') + num(pts[k]) + ' ' + num(pts[k + 1]);
  }
  return closed ? d + 'Z' : d;
}

function polylines(pts: number[], groups: number[][]): string {
  'worklet';
  let d = '';
  for (let g = 0; g < groups.length; g += 1) d += polyline(pts, groups[g], false);
  return d;
}

function featurePaths(pts: number[], mask: number): string {
  'worklet';
  let d = '';
  for (let i = 0; i < FEATURE_CURVES.length; i += 1) {
    const f = FEATURE_CURVES[i];
    if ((mask & f.bit) === 0) continue;
    d += polyline(pts, f.indices, f.closed);
  }
  return d;
}

/**
 * The beam: one cap row, read between the rows the lattice actually has,
 * so it conforms to the dome as it sweeps. It never reaches the apex,
 * where every column meets and a row is a point.
 */
function beamPath(pts: number[], position: number): string {
  'worklet';
  const j = position * (CR - 1.6);
  const j0 = Math.floor(j);
  const j1 = Math.min(CR - 1, j0 + 1);
  const f = j - j0;
  let d = '';
  for (let c = 0; c < C; c += 1) {
    const a = (CAP_OFFSET + j0 * C + c) * 2;
    const b = (CAP_OFFSET + j1 * C + c) * 2;
    const x = pts[a] + (pts[b] - pts[a]) * f;
    const y = pts[a + 1] + (pts[b + 1] - pts[a + 1]) * f;
    d += (c === 0 ? 'M' : 'L') + num(x) + ' ' + num(y);
  }
  return d;
}

/* ------------------------------- component ------------------------------- */

export function HairMesh({ ref, scanning, tone = 'neutral' }: HairMeshProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  /** Where the face is, per the last reading. */
  const target = useSharedValue<number[]>(ZERO);
  /** Where the mesh is drawn: glides towards `target`. */
  const current = useSharedValue<number[]>(ZERO);
  const mask = useSharedValue(0);
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
        const lattice = buildLattice(face);
        target.set(lattice.pts);
        mask.set(lattice.mask);
        if (!presentRef.current) {
          presentRef.current = true;
          // A face arriving from nothing appears where it is: no glide
          // across the screen from wherever the last one faded.
          current.set(lattice.pts);
          visible.set(
            reducedRef.current ? 1 : withTiming(1, { duration: motion.duration.slow }),
          );
        }
        dirty.set(1);
      },
    }),
    [target, mask, current, visible, dirty],
  );

  /*
    The glide. Runs every screen frame; does nothing once the drawn
    lattice has caught up with the target, so a still head costs no path
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
      for (let i = 0; i < LATTICE_LENGTH; i += 1) {
        const gap = Math.abs(tgt[i] - cur[i]);
        if (gap > worst) worst = gap;
      }
      const converged = reduced || worst < SNAP_EPS;
      const k = 1 - Math.exp(-dt / GLIDE_TAU_MS);
      current.modify((values) => {
        'worklet';
        for (let i = 0; i < LATTICE_LENGTH; i += 1) {
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

  const faceGrid = useAnimatedProps(() => {
    const pts = current.get();
    return { d: polylines(pts, FACE_ROWS) + polylines(pts, FACE_COLS), stroke: stroke.get() };
  });
  const capGrid = useAnimatedProps(() => {
    const pts = current.get();
    return { d: polylines(pts, CAP_ROWS) + polylines(pts, CAP_COLS), stroke: stroke.get() };
  });
  const oval = useAnimatedProps(() => ({
    d: polyline(current.get(), OVAL_INDICES, true),
    stroke: stroke.get(),
  }));
  const features = useAnimatedProps(() => ({
    d: featurePaths(current.get(), mask.get()),
    stroke: stroke.get(),
  }));

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
          animatedProps={faceGrid}
          fill="none"
          strokeWidth={FACE_GRID.width}
          strokeOpacity={FACE_GRID.opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPath
          animatedProps={capGrid}
          fill="none"
          strokeWidth={CAP_GRID.width}
          strokeOpacity={CAP_GRID.opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPath
          animatedProps={oval}
          fill="none"
          strokeWidth={OVAL.width}
          strokeOpacity={OVAL.opacity}
          strokeLinejoin="round"
        />
        <AnimatedPath
          animatedProps={features}
          fill="none"
          strokeWidth={FEATURE_LINES.width}
          strokeOpacity={FEATURE_LINES.opacity}
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
 * band and its edges, chosen by a fixed sequence so the pattern is the
 * same on every phone.
 */
function AnalysisPoint({ slot, current, clock, strength, color }: PointProps & { slot: number }) {
  const place = useDerivedValue(() => {
    const pts = current.get();
    const t = clock.get() + (slot * PULSE_MS) / POINT_COUNT;
    const generation = Math.floor(t / PULSE_MS);
    const phase = (t - generation * PULSE_MS) / PULSE_MS;
    const site = HAIRLINE_SITES[(generation * 7 + slot * 13) % HAIRLINE_SITES.length];
    const lit = Math.sin(Math.PI * phase);
    return { x: pts[site * 2], y: pts[site * 2 + 1], lit: lit * strength.get() };
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
 * so it rides the dome with the lattice.
 */
function SpecklePoint({ speckle, current, clock, strength, color }: PointProps & { speckle: Speckle }) {
  const props = useAnimatedProps(() => {
    const pts = current.get();
    const { a, b, c, d, u, v } = speckle;
    const top = { x: pts[a] + (pts[b] - pts[a]) * u, y: pts[a + 1] + (pts[b + 1] - pts[a + 1]) * u };
    const bottom = { x: pts[c] + (pts[d] - pts[c]) * u, y: pts[c + 1] + (pts[d + 1] - pts[c + 1]) * u };
    const phase = (clock.get() / SPECKLE_MS + speckle.phase) % 1;
    const twinkle = Math.sin(Math.PI * phase);
    return {
      cx: top.x + (bottom.x - top.x) * v,
      cy: top.y + (bottom.y - top.y) * v,
      r: SPECKLE.r,
      opacity: (SPECKLE.floor + (1 - SPECKLE.floor) * twinkle * twinkle) * strength.get(),
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
  const stride = Math.max(1, Math.floor(HAIRLINE_SITES.length / STILL_POINT_COUNT));
  const out: number[] = [];
  for (let i = 0; i < STILL_POINT_COUNT; i += 1) {
    const site = HAIRLINE_SITES[(i * stride + 3) % HAIRLINE_SITES.length];
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
  /** Leave out the face grid — the densest lines, a haze at thumbnail size. */
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
 * The wireframe held on a still.
 *
 * Built once per face and drawn as plain paths: no glide, no beam, no
 * tracking. It always draws on a photograph inside the dark instrument,
 * so its colours come from `darkColors` whichever appearance the app is
 * in, as the processing screen's do.
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
    const shim: TrackedFace = {
      cx: face.cx,
      cy: face.cy,
      width: face.width,
      height: face.height,
      yaw: 0,
      pitch: 0,
      roll: 0,
      contours: face.contours,
      hasContours: (face.contours.FACE?.length ?? 0) > 0,
      stability: 1,
      yawRate: 0,
      held: false,
      lastSeenAt: 0,
      at: 0,
    };
    const { pts, mask } = buildLattice(shim);
    return {
      faceGrid: sparse ? '' : polylines(pts, FACE_ROWS) + polylines(pts, FACE_COLS),
      capGrid: polylines(pts, CAP_ROWS) + polylines(pts, CAP_COLS),
      oval: polyline(pts, OVAL_INDICES, true),
      features: featurePaths(pts, mask),
      sites: STILL_SITES.map((site) => ({ x: pts[site * 2] ?? 0, y: pts[site * 2 + 1] ?? 0 })),
    };
  }, [face, sparse]);

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
          d={paths.faceGrid}
          fill="none"
          stroke={stroke}
          strokeWidth={FACE_GRID.width}
          strokeOpacity={FACE_GRID.opacity * strength}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <Path
        d={paths.capGrid}
        fill="none"
        stroke={stroke}
        strokeWidth={CAP_GRID.width}
        strokeOpacity={CAP_GRID.opacity * strength}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d={paths.oval}
        fill="none"
        stroke={stroke}
        strokeWidth={OVAL.width}
        strokeOpacity={OVAL.opacity * strength}
        strokeLinejoin="round"
      />
      <Path
        d={paths.features}
        fill="none"
        stroke={stroke}
        strokeWidth={FEATURE_LINES.width}
        strokeOpacity={FEATURE_LINES.opacity * strength}
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
