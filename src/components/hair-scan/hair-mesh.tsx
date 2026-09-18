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
 * ── On the hair, not on the skull ─────────────────────────────────────
 * A face tracker sees a face. Left to it the cap is drawn to a bare
 * head, and anyone with volume watches the mesh cut through their hair —
 * which is the whole complaint. Two things answer it, and the first one
 * needs nothing wired at all:
 *
 *   • the cap carries a STANDING ALLOWANCE (`CAP_FIT_DEFAULT` in
 *     head-cap.ts) — a tenth taller above the brow, a sixteenth wider —
 *     so the dome every phone draws, segmenter or no segmenter, already
 *     clears a head of hair instead of hugging the scalp.
 *   • where a mask can say how much hair there actually is, the
 *     segmenter's silhouette comes in through `setHair` and REPLACES
 *     that guess with the measured one: a SIZE — taller, wider, nudged
 *     across for a parting — and a SHAPE, which is what stops the thing
 *     on the head being a dome. The shape is a radial scale per ray of
 *     a dial cast from the middle of the cap (`CapFit.profile` in
 *     head-cap.ts), so a swept fringe comes out swept, a flat top flat,
 *     and hair standing higher on one side higher on one side. Both
 *     ease in, ray by ray, so the mesh GROWS onto the hair instead of
 *     stepping at the segmenter's rate.
 *
 * `setHair` is called, and where from matters enough to write down:
 * `src/app/hair-scan.tsx` runs a slow loop — about three beats a second,
 * never per frame — that asks the ARKit module for a small square of the
 * live frame, runs the bundled segmenter on those bytes, turns the mask
 * into an outline in the preview's own points (`hair-fit.ts`) and hands
 * it here with the face it was sampled against. That road exists only on
 * an iPhone whose binary has both the AR sampler and the TFLite runtime
 * in it. Android, Expo Go, the simulator and an older iPhone never reach
 * it and draw the standing allowance, which is a supported way to run
 * and is the only thing that changes about the scan on those phones.
 *
 * The scan works either way, and a refusal never collapses the cap back
 * onto the skull: `nextCapFit` holds the shape through a bad frame and
 * lets go only after a run of them.
 *
 * ── The fill ──────────────────────────────────────────────────────────
 * The screen hands over what has been captured and each line of the cap
 * belongs to a part of it. With the guided scan's four regions
 * (`CAP_REGION_OF`) the head fills a quarter at a time as each step
 * lands. With the ring's twenty-four sectors (`CAP_SECTOR_OF`) it fills
 * as the ring does. Both are a picture of where the head has been
 * pointed, not of anything on the head.
 *
 * The `regions` array is indexed by `CAP_REGIONS`, and which region a
 * STEP fills is the opposite of the obvious pairing: turn right and it
 * is the screen's LEFT quarter — `leftTemple` — that swings towards the
 * lens and should light. Do not infer it from the names; the pairing is
 * written once, as `REGION_OF_STEP` in engine.ts, and argued from the
 * geometry in head-cap.ts.
 *
 * Reduce Motion takes the glide, the scan line and the lit points away
 * and leaves the cap where the head is. Following a head is tracking, not
 * animation; it stays, and so does sitting the cap on the hair. So does
 * the fill: it is state, as the ring's is.
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
 * not, and sat on the hair where a mask says where the hair is. It is
 * where the scan looks, not a measurement of what is there. Nothing it
 * computes is displayed, stored or compared: the mesh says Tress is
 * mapping the hair, and never what it found. No number appears on it,
 * ever — the measurement engine does that work, later, on the frames.
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
  CAP_FIT_DEFAULT,
  CAP_FIT_START,
  CAP_LENGTH,
  CAP_MERIDIANS,
  CAP_REGION_OF,
  CAP_RINGS,
  CAP_SECTOR_OF,
  CAP_SITES,
  CAP_STRIDE,
  CAP_VERTICES,
  blendCapFit,
  buildHeadCap,
  capIndex,
  fitHairCap,
  nextCapFit,
  type CapFit,
  type CapFitState,
  type CapMesh,
  type CapSource,
  type HairSilhouette,
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
  /**
   * A hair silhouette from the segmenter — the outline of what it called
   * hair, in the PREVIEW's own points — together with the face it was
   * measured against.
   *
   * ── `from` is not optional in spirit ──────────────────────────────
   * A silhouette on its own says nothing: the fit is the hair measured
   * against a head, and `widen` in particular is a width read across the
   * picture, which a few degrees of stale yaw corrupts. The mask comes
   * back from an async pass over a frame that is by then several frames
   * old, and this choreography has the head turning for most of the
   * scan — so pass the face that was tracked WHEN THAT FRAME WAS TAKEN.
   * Left out, the newest tracked face stands in, which is right only
   * while the head is still.
   *
   * ── How often ─────────────────────────────────────────────────────
   * Not per frame, and not casually. `fitHairCap` walks the whole point
   * cloud three times before it starts (see its own note), and the
   * segmenter in front of it is 30-245 ms of Hermes on old hardware. The
   * live caller runs at `FIT_INTERVAL_MS` — about three beats a second —
   * and drops a beat outright rather than queueing one behind a fit that
   * has not finished, because the shape of somebody's hair does not
   * change between frames and the fit eases in over half a second
   * anyway. `dueForFit` in `hair-fit.ts` is that rule, written once.
   *
   * "About three a second" is the measured cadence, not the intended
   * one: the loop shipped once at half that, because the beat was timed
   * from the END of each fit rather than its start, and no test ran the
   * rule against a tick train. One does now
   * (`scripts/test/hair-fit.test.ts`), at several fit durations, and it
   * fails on the discipline that halved it.
   *
   * ── Null, and refusals ────────────────────────────────────────────
   * Null means "this reading had nothing in it", NOT "there is no
   * hair": the cap holds the shape it has and only lets go after
   * `CAP_FIT.hold` refusals in a row. Never calling this at all is a
   * supported way to run — every phone without both the AR frame
   * sampler and the TFLite runtime does — and draws the standing
   * allowance for the whole scan.
   *
   * It is a drawing instruction and nothing else: no number it produces
   * is shown, stored or compared.
   */
  setHair(hair: HairSilhouette | null, from?: CapSource): void;
  /**
   * The fit the cap is being DRAWN to at this instant — not the one the
   * last reading asked for. The two differ while the cap is still
   * growing towards a new shape, and it is the drawn one a still should
   * carry, because that is the cap the person was looking at when the
   * shutter fired.
   *
   * Read it at a shutter and hand it to `snapshotMesh`, so the
   * processing screen and the report hero draw the cap the camera drew
   * rather than rebuilding the standing allowance. It never causes a
   * render, and on a build that never calls `setHair` it is the
   * standing allowance, which is what those screens drew before.
   */
  fit(): CapFit;
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
  /**
   * The guided scan's four regions, 0–1 each, in `CAP_REGIONS` order —
   * hairline, left temple, right temple, crown. As each step's region is
   * captured its part of the cap takes the accent, so the head fills in
   * a quarter at a time as the person turns.
   *
   * Given, it is what the cap fills from and `coverage` is ignored: the
   * two are different dials over the same head and blending them would
   * light parts of the cap twice.
   */
  regions?: SharedValue<number[]>;
};

/* --------------------------------- tuning -------------------------------- */

/** Time constant of the glide towards a new reading, in milliseconds. */
const GLIDE_TAU_MS = 48;

/** Closer than this, in points, and the glide snaps and goes quiet. */
const SNAP_EPS = 0.05;

/**
 * Time constant of the cap's growth onto the hair, in milliseconds.
 *
 * Far slower than the glide, and on purpose. The glide is following a
 * head, which has to be instant or the mesh lags; the fit is a change of
 * SHAPE, which arrives a few times a second from the segmenter and would
 * be seen as the cap pulsing if it were taken whole each time. At this
 * constant a person who steps into frame sees the cap settle onto their
 * hair over about half a second, once, and then hold.
 *
 * Reduce Motion takes it away, as it takes the glide: the cap is built
 * to the new shape at once and holds there. What makes that bearable
 * rather than a pulse is the pair of rules in `nextCapFit` — a reading
 * inside the deadband is the reading the cap already has, and a refusal
 * holds rather than collapsing — so a reduced-motion reader sees the
 * shape change when the hair genuinely reads differently and not
 * otherwise. Without those two this could not honestly be switched off.
 */
const FIT_TAU_MS = 520;

/** Milliseconds assumed between readings when the tracker stamps none. */
const FIT_STEP_MS = 60;

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
 *
 * Sitting the cap on the hair did not change that count either, and
 * neither did giving it a shape. The fit is three numbers applied to
 * the dome's three axes and one radial scale per vertex, all before the
 * 191 vertices are written — no vertex added, no segment added, no node
 * added — and it is COMPUTED off the drawn frame entirely, on the JS
 * thread, when a silhouette arrives. What it costs there is not small
 * and is counted honestly on `fitHairCap`: three walks of the tracked
 * point cloud, three dome writes, eleven walks of these 191 vertices
 * and eight of the silhouette's own points, about 80 µs measured. That
 * is why the handle asks to be called once per captured frame rather
 * than at the segmenter's rate.
 *
 * The UI thread's per-frame work is unchanged: the same 191 vertices
 * and 370 segments it always was. On the JS thread, building one cap
 * from one tracked face of 1,224 points measured 25 µs with no shape on
 * it — which is every phone without a segmenter, and what it cost
 * before any of this — and 29 µs with one. The 2.6 µs between them is
 * one cheap radial scale per vertex (`turnOf`, deliberately not
 * `Math.atan2`, which measured 6.9).
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

/**
 * A vertex's fill, 0–1.
 *
 * Which dial it is read off is passed in rather than guessed: the
 * guided scan's four regions when the screen hands those over, the
 * ring's twenty-four sectors otherwise. A vertex belonging to neither —
 * the ring leaves its front centre unassigned — fills with the scan's
 * mean.
 */
function tintOf(cover: number[] | null, byRegion: boolean, mean: number, v: number): number {
  'worklet';
  if (cover === null) return 0;
  const key = byRegion ? CAP_REGION_OF[v] : CAP_SECTOR_OF[v];
  if (key < 0) return mean;
  const c = cover[key];
  return c === undefined ? 0 : c;
}

/** Which path the line between two vertices belongs in. */
function pathOf(
  pts: number[],
  cover: number[] | null,
  byRegion: boolean,
  mean: number,
  a: number,
  b: number,
): number {
  'worklet';
  const facing = (pts[a * CAP_STRIDE + 2] + pts[b * CAP_STRIDE + 2]) / 2;
  if (facing < FAR_FACING) return PATH_FAR;
  const tint = (tintOf(cover, byRegion, mean, a) + tintOf(cover, byRegion, mean, b)) / 2;
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
  byRegion: boolean,
  mean: number,
): void {
  'worklet';
  let prev = -1;
  for (let i = 1; i < indices.length; i += 1) {
    const a = indices[i - 1];
    const b = indices[i];
    const path = pathOf(pts, cover, byRegion, mean, a, b);
    const ka = a * CAP_STRIDE;
    const kb = b * CAP_STRIDE;
    if (path !== prev) out[path] += 'M' + num(pts[ka]) + ' ' + num(pts[ka + 1]);
    out[path] += 'L' + num(pts[kb]) + ' ' + num(pts[kb + 1]);
    prev = path;
  }
}

/** Every path of the cap, from the drawn vertices and the fill. */
function capPaths(pts: number[], cover: number[] | null, byRegion: boolean): string[] {
  'worklet';
  const out: string[] = [];
  for (let i = 0; i < PATH_COUNT; i += 1) out.push('');
  let mean = 0;
  if (cover !== null && cover.length > 0) {
    let sum = 0;
    for (let i = 0; i < cover.length; i += 1) sum += cover[i];
    mean = sum / cover.length;
  }
  for (let r = 0; r < CAP_RINGS.length; r += 1) walk(out, pts, CAP_RINGS[r], cover, byRegion, mean);
  for (let c = 0; c < CAP_MERIDIANS.length; c += 1) {
    walk(out, pts, CAP_MERIDIANS[c], cover, byRegion, mean);
  }
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

export function HairMesh({ ref, scanning, tone = 'neutral', coverage, regions }: HairMeshProps) {
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

  /*
    The hair fit. Three numbers, all on the JS thread: `drawnFit` is the
    shape the cap is being built to, `fitState` holds the shape it is
    heading for and the run of readings that said nothing, and every
    face walks the first a little way towards the second — so a fit that
    lands between two frames grows in over about half a second rather
    than stepping. Both start at the standing allowance, so the very
    first cap drawn already clears the skull.

    `faceRef` is the newest tracked face, kept only as the stand-in for
    a caller that hands over a silhouette without saying which head it
    was measured against.
  */
  const drawnFit = useRef<CapFit>(CAP_FIT_DEFAULT);
  const fitState = useRef<CapFitState>(CAP_FIT_START);
  const faceRef = useRef<TrackedFace | null>(null);
  const fitAtRef = useRef(0);

  useImperativeHandle(
    ref,
    (): HairMeshHandle => ({
      setFace(face) {
        if (face === null) {
          faceRef.current = null;
          if (!presentRef.current) return;
          presentRef.current = false;
          // Fades where it stands. Collapsing it would be a pop.
          visible.set(
            reducedRef.current ? 0 : withTiming(0, { duration: motion.duration.base }),
          );
          return;
        }
        faceRef.current = face;
        const now = Number.isFinite(face.at) ? face.at : fitAtRef.current + FIT_STEP_MS;
        const dt = Math.min(500, Math.max(0, now - fitAtRef.current));
        fitAtRef.current = now;
        drawnFit.current = blendCapFit(
          drawnFit.current,
          fitState.current.wanted,
          reducedRef.current ? 1 : 1 - Math.exp(-dt / FIT_TAU_MS),
        );
        const cap = buildHeadCap(face, drawnFit.current);
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
      setHair(hair, from) {
        // The head the mask was measured against, which is the one the
        // caller names. The newest tracked face is only the stand-in.
        const face: CapSource | null = from ?? faceRef.current;
        // Refined from where the cap already is, so a steady head
        // converges on a steady answer instead of re-deriving one. A
        // reading with nothing in it — no silhouette, no head to
        // measure it against, or a trace `fitHairCap` will not answer
        // for — is a refusal, and a refusal HOLDS the shape the cap
        // has. Collapsing here on one bad frame is what made the mesh
        // deflate onto the skull and re-inflate a moment later.
        const fit =
          hair === null || face === null ? null : fitHairCap(face, hair, drawnFit.current);
        fitState.current = nextCapFit(fitState.current, fit);
      },
      fit() {
        // The drawn fit, not the wanted one: see the handle's note.
        return drawnFit.current;
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

  const paths = useDerivedValue(() => {
    const cover =
      regions !== undefined ? regions.get() : coverage === undefined ? null : coverage.get();
    return capPaths(current.get(), cover, regions !== undefined);
  });

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
  /**
   * The hair fit the live cap was wearing when this frame was taken.
   *
   * Carried for the same reason the tracked mesh is: the camera drew a
   * cap sitting on this person's hair, and a still that rebuilt a
   * differently-shaped dome would show a different cap on the same head
   * a second later. The SHAPE travels inside it — a `CapFit` is the
   * size and the shape together — so a still handed the live fit wears
   * the same fringe the camera drew. Left out, the standing allowance
   * is drawn, which is the dome, and is what a phone with no segmenter
   * showed live too, so the two agree.
   */
  fit?: CapFit;
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
  fit,
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
      fit,
    );
    const built = capPaths(pts, null, false);
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
  }, [face, fit]);

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
