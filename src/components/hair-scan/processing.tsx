/**
 * The processing screen: the device's pass over the frames the scan kept.
 *
 * ── What the person sees ──────────────────────────────────────────────
 * A near-black ground. The main frame, large and central, while the first
 * bar reads every frame for light and focus. When that bar fills, the
 * frame draws in to a disc in a soft light, the other frames glide out
 * into orbit around it, settle, and each takes a tick once the device
 * has a reading for it, while the second bar builds the report. At the
 * end the disc takes the frames in one at a time — each glides into its
 * centre, and the disc swells a little and settles as it arrives, with a
 * soft tap — then holds, and the screen hands off.
 *
 * ── How many frames are in orbit ──────────────────────────────────────
 * Every frame the scan kept, which since build 20 is nine to eleven
 * rather than four: two or three moments of each of the four capture
 * regions, so that the crown — the one place on the head that only the
 * last step sees — is read more than once and has an error bar at all
 * (`measure/noise.ts`, and `engine.ts`'s header for what the other five
 * places already had). Nothing here counts them — `others` is whatever
 * the caller handed in, `orbitPositions` spaces them and
 * `orbitFrameSize` shrinks them so a crowded ring does not overlap — so
 * the screen shows what was read rather than a fixed four.
 *
 * ── What that would have cost, and what is done about it ──────────────
 * `analysis.ts` plans 2N+1 units for N frames and holds each finished
 * unit for `ANALYSIS_PACING.unitFloorMs` (350 ms) so a person can see it
 * land. That is a PER-UNIT figure tuned when a scan was four frames:
 * 9 units, 3150 ms. Nine to eleven frames is 19 to 23 units, so left
 * alone this screen would have gone from 3.2 s to 6.7–8.1 s of holding
 * — three and a half to five seconds added, none of it work.
 *
 * So `unitFloorFor` divides the hold by the plan's own unit count and
 * this screen passes it in as `pacing`. The held part of the pass lands
 * back at about 3.2 s whatever the frame count, the bar advances in
 * smaller and more frequent steps, and every unit still runs and still
 * reports. See `PASS_HOLD_BUDGET_MS`.
 *
 * ── What that does NOT cover, stated because the code computes it ─────
 * The hold is one of three things a person waits through, and scaling
 * it back does nothing to the other two. This screen's own ring is
 * paced by the frame count in `orbitReadyMs` (the frames arriving and
 * settling) and `absorbHandoffMs` (the same frames gathering into the
 * disc), and the hand-off runs strictly after both. Through the real
 * functions, at `ORBIT_LEAD_MS` with motion on:
 *
 *   4 frames   hold 3150 ms   ring ready 1880 ms   absorb 1890 ms
 *   9 frames   hold 3154 ms   ring ready 2630 ms   absorb 3190 ms
 *  11 frames   hold 3450 ms   ring ready 2930 ms   absorb 3710 ms
 *
 * The screen cannot end before `max(hold, ring) + absorb`, so it is
 * about 5.0 s at four frames and 6.3–7.2 s at nine to eleven: one to
 * two seconds longer than build 19, not equal to it. That is the price
 * of showing the frames the owner asked to see rotating, and it is a
 * number this file's own schedule produces, so it is written down here
 * rather than left to be discovered. `hair-scan-engine.test.ts` pins
 * all three terms and a ceiling on their sum.
 *
 * The real work is not shortened by any of this either: the segmenter
 * runs once per frame, nine times now rather than four, and on a phone
 * slow enough for that to exceed the hold it is what the person waits
 * for. That is the honest cost of reading nine frames instead of four.
 *
 * ── Two clocks, one hand-off ──────────────────────────────────────────
 * The first bar runs on the runner's clock: it moves when a unit
 * finishes and never otherwise. The ring runs on its own: it takes a
 * fixed time to form, however fast the pass was. The absorb and the
 * hand-off wait for the later of the two — the pass finished, and the
 * ring formed — so a build whose pass ends at its total floor (any
 * build without the segmenter, the simulator included) still shows the
 * whole ring rather than yanking the frames back mid-glide. The
 * absorb's own length is `absorbHandoffMs` in the analysis module: the
 * last arrival, the disc's breath on it, and a settle; the hand-off
 * runs on that clock.
 *
 * ── The second bar slows down ─────────────────────────────────────────
 * The second bar runs on both clocks. The runner's work fills it to
 * `BUILD_BAR_WORK_SHARE` (about 85%) and it holds there — through the
 * total floor and, if the pass was quick, through the ring's settle —
 * until the absorb begins. Then each arrival, reported from the UI
 * thread as a frame's glide actually ends, moves it by a fixed share
 * (`BUILD_BAR_CREEP_RATIO`) of what the one before moved it — the last
 * arrival included, so the last step is the smallest — and the steps
 * are sized so the last lands the bar at exactly 1; the green and the
 * check land on that beat. `buildBarTarget` in the analysis module is
 * the rule, as a function of the work done and the arrivals so far,
 * and `absorbBeats` says how many arrivals there are: one per frame,
 * or one — the disc's lone breath — when nothing glides. The ring
 * reports one arrival per frame it is given, and it is given the same
 * `others` the count is taken from; should it ever report one fewer,
 * a clock at `absorbFloorMs` — after the last glide and its breath
 * should have landed — completes the count, so the bar cannot stall
 * under the report. On a nominal pass that clock changes nothing.
 *
 * ── The absorb ────────────────────────────────────────────────────────
 * Each frame's arrival is reported from the UI thread when its glide has
 * actually finished; on it the disc breathes — scale 1 → 1.07 → 1 with
 * the light behind it brightening the same beat — and the screen plays
 * the caller's soft tap. A scan that kept only the main frame has
 * nothing to absorb; the disc still breathes once, so the beat reads.
 *
 * ── What the two builds show ──────────────────────────────────────────
 * With the segmenter, a frame's area unit runs during the second bar, so
 * the ticks land one by one as that bar builds. Without it, every frame
 * finishes during the first bar, before the ring exists; the ticks then
 * land as each frame settles into orbit, one after another with the
 * stagger, and the second bar is the compose unit alone. That is the
 * honest shape of a pass that has nothing to measure in the second
 * stage, and the note under the bar says so.
 *
 * ── The line it does not cross ────────────────────────────────────────
 * Both bars are bound to `runAnalysis`, which reports a unit only when
 * that unit's work has finished; the second bar's last stretch is bound
 * to the gather, which is a real thing happening on the screen, each
 * step of it an arrival the ring reported. Nothing here paces a bar
 * with a timer; the floors in the runner hold a finished reading on
 * screen for a beat, and the clock on the gather is a floor under a
 * count the ring keeps, never the count itself. The lines under the bars name the device's work on
 * the images. A tick means the device has a reading; a frame it could
 * not read gets no tick. The last line counts frames with a reading, not
 * frames handed in. Nothing on this screen says anything about the hair,
 * and the report it hands off to is the result mapper's to write.
 *
 * ── Colour ────────────────────────────────────────────────────────────
 * The scanning mode is dark whichever appearance the app is in, so this
 * draws from `darkColors` directly rather than the theme hook: a black
 * instrument inside a cream app, by design. No raw colours.
 *
 * ── The mesh on the still ─────────────────────────────────────────────
 * A frame that carries the mesh the live camera had at its shutter keeps
 * it here: the wireframe is drawn over the main still, on the card and
 * then on the disc, and faintly over each frame in orbit. The still is
 * the whole camera frame while the mesh was read off the preview's
 * crop of it, so the frame's mesh is laid into the picture by
 * `meshInBox` — the same cover-fit rule `expo-image` draws the picture
 * by. The overlay is a box the size of the still as drawn on the card,
 * centred, and scaled on the UI thread by exactly the factor the image
 * scales by as the card becomes the disc, so the two never part.
 *
 * Reduced Motion: the frame becomes the disc without the morph, the
 * orbit frames appear in place, the bars still move, and the mesh on
 * the still keeps its lines and loses its lit points. At the end the
 * frames fade together, and the disc's one breath is a brightening of
 * the light behind it rather than a change of size.
 */

import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  ANALYSIS_COPY,
  ANALYSIS_PACING,
  pickMainFrame,
  planAnalysis,
  runAnalysis,
  type AnalysisDeps,
  type AnalysisFrame,
  type AnalysisPhase,
  type AnalysisPlan,
  type AnalysisProgress,
  type AnalysisResult,
} from '@/features/hair-scan/analysis';
import { coverFit, meshInBox } from '@/features/hair-scan/engine';
import type { StillMesh } from '@/features/hair-scan/types';
import { darkColors, motion, radius, spacing } from '@/theme';

import { StaticHairMesh } from './hair-mesh';
import {
  Halo,
  ORBIT_ABSORB_PULSE_MS,
  ORBIT_FRAME_W,
  absorbBeats,
  absorbFloorMs,
  absorbHandoffMs,
  buildBarTarget,
  orbitFrameSize,
  OrbitFrames,
  orbitReadyMs,
  type OrbitPhase,
} from './orbit-frames';

/* ------------------------------ metrics ------------------------------- */

/** The disc the main frame becomes. */
const DISC = 176;
/** The light around it reaches this far past its edge. */
const DISC_HALO = 64;
/** The morph from card to disc. */
const MORPH_MS = 650;
/** The orbit begins this long into the morph, so the two overlap. */
const ORBIT_LEAD_MS = 320;
/** How far the disc swells as a frame arrives. */
const PULSE_SCALE = 1.07;
/** The share of the breath spent swelling; the rest is the settle. */
const PULSE_RISE = 0.4;
/** How much brighter the light behind the disc gets at the top of the breath: a second halo at this opacity. */
const PULSE_FLARE = 0.75;

/** The bars' track. */
const BAR = 12;
/** The check beside each bar's label. */
const MARK = 20;

/* ---------------------------- the pass's pace -------------------------- */

/**
 * How long the deliberate part of the pass is allowed to take, whatever
 * the frame count.
 *
 * `analysis.ts` holds each finished unit on screen for
 * `ANALYSIS_PACING.unitFloorMs` before starting the next, so a person
 * can see it land. That hold was tuned against a four-frame scan: nine
 * units, 3150 ms. It is a PER-UNIT figure, so build 20's nine to eleven
 * frames would have carried it to 19–23 units and 6650–8050 ms — three
 * and a half to five seconds added to a screen the owner wants at a KYC
 * pace, and not one millisecond of it real work.
 *
 * So the hold is divided by the units the plan actually has, to land the
 * whole held part back where a four-frame scan put it, and floored at
 * `UNIT_FLOOR_MIN_MS` so a unit never flicks past unseen. Nothing is
 * skipped and nothing is faked: every unit still runs, reports and
 * lands, the bar just advances in smaller, more frequent steps.
 *
 * What this does NOT shorten is the real work — the segmenter still runs
 * once per frame, and on a slow phone that, not the hold, is what the
 * person waits for. This only stops the app waiting on purpose for
 * longer than it used to.
 */
export const PASS_HOLD_BUDGET_MS = 3_150;
/** The least a finished unit stays up. Below this the bar's step is not seen. */
export const UNIT_FLOOR_MIN_MS = 150;

/** The per-unit hold for a plan of this many units. Never longer than the default. */
export function unitFloorFor(units: number): number {
  if (!Number.isFinite(units) || units <= 0) return ANALYSIS_PACING.unitFloorMs;
  const share = Math.round(PASS_HOLD_BUDGET_MS / units);
  return Math.min(ANALYSIS_PACING.unitFloorMs, Math.max(UNIT_FLOOR_MIN_MS, share));
}

/* ------------------------------- the run ------------------------------ */

export type ProcessingFrame = AnalysisFrame & {
  /** Read to screen readers; never drawn. */
  label: string;
  /** The mesh the live camera had at this frame's shutter, with the still's size. Drawn over the picture. */
  mesh?: StillMesh;
};

type RunState = {
  plan: AnalysisPlan | null;
  progress: AnalysisProgress | null;
  result: AnalysisResult | null;
  error: Error | null;
};

/**
 * Runs the pass once for a set of frames and mirrors it into state.
 *
 * `frames` has to be a stable reference — memoised by the caller — or
 * the run restarts on every render. The run is aborted if the frames
 * change or the screen goes away.
 */
function useAnalysisRun(
  frames: readonly AnalysisFrame[],
  deps: AnalysisDeps | undefined,
  capturedAt: string | undefined,
): RunState {
  const [state, setState] = useState<RunState>({
    plan: null,
    progress: null,
    result: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    /*
      The hold is sized against the longest plan these frames could make
      — every frame read for area — so the budget is never overrun. A
      build with no segmenter plans fewer units and finishes inside it.
    */
    const units = planAnalysis(frames, true).units.length;
    runAnalysis(frames, {
      deps,
      signal: controller.signal,
      pacing: { unitFloorMs: unitFloorFor(units) },
      ...(capturedAt === undefined ? {} : { capturedAt }),
      onPlan: (plan) => {
        if (live) setState((s) => ({ ...s, plan }));
      },
      onProgress: (progress) => {
        if (live) setState((s) => ({ ...s, progress }));
      },
    }).then(
      (result) => {
        if (live) setState((s) => ({ ...s, result }));
      },
      (error: unknown) => {
        if (live) {
          setState((s) => ({
            ...s,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        }
      },
    );
    return () => {
      live = false;
      controller.abort();
    };
  }, [frames, deps, capturedAt]);

  return state;
}

/**
 * True once the ring has had time to form after the orbit began.
 *
 * The ring's own clock, kept apart from the runner's. `orbiting` flips
 * when the first bar fills; this flips `orbitReadyMs` later, and only
 * then may the gather begin.
 */
function useOrbitReady(orbiting: boolean, waitMs: number): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!orbiting) return;
    const timer = setTimeout(() => setReady(true), waitMs);
    return () => clearTimeout(timer);
  }, [orbiting, waitMs]);
  return ready;
}

/* ------------------------------- the bars ----------------------------- */

function StageRow({
  label,
  fraction,
  active,
  done,
  detail,
}: {
  label: string;
  fraction: number;
  /** This bar is the one moving: its units are running, or its gather is under way. */
  active: boolean;
  done: boolean;
  /** The line under the bar, or null for none. */
  detail: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(0);
  const presence = useSharedValue(active || done ? 1 : 0.45);
  const mark = useSharedValue(0);

  useEffect(() => {
    // The bars move under Reduce Motion too: a bar that jumps is harder
    // to read than one that fills, and it is information, not decoration.
    fill.set(withTiming(fraction, { duration: motion.duration.slow, easing: Easing.out(Easing.cubic) }));
  }, [fraction, fill]);

  useEffect(() => {
    presence.set(withTiming(active || done ? 1 : 0.45, { duration: motion.duration.slow }));
  }, [active, done, presence]);

  useEffect(() => {
    if (!done) return;
    mark.set(reduceMotion ? 1 : withSpring(1, motion.spring.bouncy));
  }, [done, reduceMotion, mark]);

  const rowStyle = useAnimatedStyle(() => ({ opacity: presence.get() }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: mark.get(),
    transform: [{ scale: mark.get() }],
  }));

  return (
    <Animated.View style={[{ gap: spacing.sm }, rowStyle]}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}>
        <View style={{ width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={[
              {
                width: MARK,
                height: MARK,
                borderRadius: MARK / 2,
                backgroundColor: darkColors.success,
                alignItems: 'center',
                justifyContent: 'center',
              },
              markStyle,
            ]}>
            <Icon name="check" size={11} color={darkColors.textOnAccent} />
          </Animated.View>
        </View>
        <Text variant="subhead" style={{ color: darkColors.text }}>
          {label}
        </Text>
      </View>

      <View
        style={{
          height: BAR,
          borderRadius: radius.pill,
          backgroundColor: darkColors.fill,
          overflow: 'hidden',
        }}>
        <Animated.View
          style={[
            {
              height: BAR,
              borderRadius: radius.pill,
              backgroundColor: done ? darkColors.success : darkColors.text,
            },
            fillStyle,
          ]}
        />
      </View>

      {detail !== null ? (
        <Text
          variant="footnote"
          center
          accessibilityLiveRegion="polite"
          style={{ color: darkColors.textSecondary }}>
          {detail}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/* ------------------------------- the screen --------------------------- */

export type ProcessingProps = {
  /** The curated frames, in capture order. Memoise: the run restarts when this changes. */
  frames: readonly ProcessingFrame[];
  /**
   * Called once the pass has finished and the frames have gathered. The
   * result is the runner's — per-frame measurements for the mapper.
   */
  onComplete: (result: AnalysisResult) => void;
  /**
   * Called as each frame is taken into the disc at the end, on the beat
   * the disc breathes: the screen plays its soft tap here. Once for the
   * lone breath when there is nothing to absorb or motion is reduced.
   */
  onAbsorb?: () => void;
  /** Called if the pass could not start at all (the measurement modules failed to load). */
  onError?: (error: Error) => void;
  /** Tests and previews stand the measurements in here; the app leaves it unset. */
  deps?: AnalysisDeps;
  /**
   * When the scan was taken, ISO-8601. Stamped on the regional
   * measurement so the record says when it was read rather than when the
   * pass happened to finish. Left out, the runner stamps it with now.
   */
  capturedAt?: string;
};

export function Processing({
  frames,
  onComplete,
  onAbsorb,
  onError,
  deps,
  capturedAt,
}: ProcessingProps) {
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  /** Measured on layout; until then a share of the window stands in, so the first frame is not a pop. */
  const [measuredStage, setMeasuredStage] = useState<number | null>(null);
  const stageHeight = measuredStage ?? Math.round(height * 0.55);

  const run = useAnalysisRun(frames, deps, capturedAt);
  const main = useMemo(() => pickMainFrame(frames), [frames]);
  const others = useMemo(() => frames.filter((f) => f !== main), [frames, main]);

  const leadMs = reduceMotion ? 0 : ORBIT_LEAD_MS;
  const analyseDone = (run.progress?.fraction.analyse ?? 0) >= 1;
  const finished = run.result !== null && !run.result.aborted;
  const orbitReady = useOrbitReady(
    analyseDone,
    orbitReadyMs(others.length, leadMs, reduceMotion, motion.duration.base),
  );
  const absorbing = finished && orbitReady;
  const orbitPhase: OrbitPhase = absorbing ? 'absorb' : analyseDone ? 'orbit' : 'hidden';

  /* ----------------------------- geometry ---------------------------- */

  const cardW = Math.min(width - spacing.xl * 2, 340);
  const cardH = Math.min(cardW * (4 / 3), Math.max(DISC, stageHeight - spacing.xl * 2));
  const ringRadius = Math.min(
    DISC / 2 + DISC_HALO + 8,
    width / 2 - ORBIT_FRAME_W / 2 - spacing.lg,
    Math.max(DISC / 2 + 40, stageHeight / 2 - ORBIT_FRAME_W / 2 - spacing.lg),
  );
  /*
    The disc gives way to the ring, never the other way round. Every
    other frame sits at 0.9 of the radius, so on a narrow phone the
    reference disc would sit under the inner frames; the disc is the
    largest circle that leaves a gap inside them. On a 430 pt screen it
    is the reference's 176; on a 375 pt one it is about 140.
  */
  const frameSize = orbitFrameSize(others.length, ringRadius);
  const discSize = Math.min(
    DISC,
    Math.floor(2 * (ringRadius * 0.9 - frameSize / 2 - spacing.sm)),
  );

  /* ------------------------------ motion ----------------------------- */

  /** 0 while the frame is the card, 1 once it is the disc. */
  const disc = useSharedValue(0);
  /** The disc's scale: 1 at rest, swelling to `PULSE_SCALE` as a frame arrives. */
  const pulse = useSharedValue(1);
  /** The extra light behind the disc on the same beat: 0 at rest, 1 at the top of the breath. */
  const flare = useSharedValue(0);

  useEffect(() => {
    if (!analyseDone) return;
    disc.set(
      reduceMotion ? 1 : withTiming(1, { duration: MORPH_MS, easing: Easing.inOut(Easing.cubic) }),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [analyseDone, reduceMotion, disc]);

  /*
    The breath. Played once per arriving frame, from the ring's own
    report of the arrival, and once on its own when there is nothing to
    absorb. The caller's tap is read through a ref so the callback the
    ring holds stays the same object across renders: the ring keys each
    frame's glide to it, and a fresh one would restart the glide.
  */
  const onAbsorbRef = useRef(onAbsorb);
  useEffect(() => {
    onAbsorbRef.current = onAbsorb;
  }, [onAbsorb]);
  const reduceMotionRef = useRef(reduceMotion);
  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  /*
    How many breaths the disc has taken: one per frame that has arrived,
    or the lone one. The second bar's last stretch is paced on this — it
    is the gather, counted, not a clock. `frames` is a stable reference
    by contract, so the count is never reset; a new set of frames is a
    new screen.
  */
  const [absorbed, setAbsorbed] = useState(0);
  /*
    How many the bar waits on. The ring reports one arrival per entry
    of `others` — it renders every one, and each glide that runs to its
    end reports — so this is the ring's own count, taken from the same
    list it is handed.
  */
  const absorbTotal = absorbBeats(others.length, reduceMotion);

  const breathe = useCallback(() => {
    const rise = ORBIT_ABSORB_PULSE_MS * PULSE_RISE;
    const settle = ORBIT_ABSORB_PULSE_MS - rise;
    flare.set(
      withSequence(
        withTiming(1, { duration: rise, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: settle, easing: Easing.inOut(Easing.cubic) }),
      ),
    );
    if (!reduceMotionRef.current) {
      pulse.set(
        withSequence(
          withTiming(PULSE_SCALE, { duration: rise, easing: Easing.out(Easing.cubic) }),
          withTiming(1, { duration: settle, easing: Easing.inOut(Easing.cubic) }),
        ),
      );
    }
    onAbsorbRef.current?.();
    setAbsorbed((n) => n + 1);
  }, [pulse, flare]);

  // With nothing gliding in — no other frames, or Reduce Motion, where
  // they fade together instead — the disc still takes its one breath,
  // once the fade (if any) is over.
  useEffect(() => {
    if (!absorbing) return;
    if (others.length > 0 && !reduceMotion) return;
    const wait = others.length > 0 ? motion.duration.base : 0;
    const timer = setTimeout(breathe, wait);
    return () => clearTimeout(timer);
  }, [absorbing, others.length, reduceMotion, breathe]);

  // The floor under the count. By this time every arrival should have
  // been reported (the last glide, and the breath on it); if the ring
  // came up one short — a glide cut off, a callback that changed under
  // it — the count is completed here, so the bar goes green and the
  // check lands during the settle rather than never. No breath and no
  // tap: those belong to arrivals, and this is not one. On a nominal
  // pass the count is already full and this does nothing.
  useEffect(() => {
    if (!absorbing) return;
    const wait = absorbFloorMs(others.length, reduceMotion, motion.duration.base);
    const timer = setTimeout(() => setAbsorbed((n) => Math.max(n, absorbTotal)), wait);
    return () => clearTimeout(timer);
  }, [absorbing, others.length, reduceMotion, absorbTotal]);

  // The hand-off waits for the last frame to be taken in, the breath on
  // it, and the settle, so the report opens on a disc at rest rather
  // than on a ring still in flight. `absorbing` already waited for the
  // ring to have formed.
  useEffect(() => {
    if (!absorbing || run.result === null) return;
    const result = run.result;
    const wait = absorbHandoffMs(others.length, reduceMotion, motion.duration.base);
    const timer = setTimeout(() => onComplete(result), wait);
    return () => clearTimeout(timer);
  }, [absorbing, run.result, reduceMotion, others.length, onComplete]);

  useEffect(() => {
    if (run.error === null) return;
    onError?.(run.error);
  }, [run.error, onError]);

  const frameStyle = useAnimatedStyle(() => {
    const t = disc.get();
    return {
      width: interpolate(t, [0, 1], [cardW, discSize]),
      height: interpolate(t, [0, 1], [cardH, discSize]),
      borderRadius: interpolate(t, [0, 1], [radius.xl, discSize / 2]),
      transform: [{ scale: pulse.get() }],
    };
  });

  /*
    The mesh over the main still. The box is the still as the card
    draws it (cover-fit, so at least one edge meets the card's); the
    lattice is laid into that box once. As the card becomes the disc the
    image is re-fitted every frame, and its scale is the cover rule on
    the card's size at that moment; the box is scaled by the same rule
    from its centre, which is the card's centre, which is the image's.
  */
  const mainStill = main?.mesh ?? null;
  const meshBox = useMemo(() => {
    if (mainStill === null) return null;
    const { scale } = coverFit(mainStill.still, { width: cardW, height: cardH });
    const width = mainStill.still.width * scale;
    const height = mainStill.still.height * scale;
    return { width, height, scale, face: meshInBox(mainStill.face, mainStill.still, { width, height }) };
  }, [mainStill, cardW, cardH]);
  const stillW = mainStill?.still.width ?? 1;
  const stillH = mainStill?.still.height ?? 1;
  const cardScale = meshBox?.scale ?? 1;
  const meshStyle = useAnimatedStyle(() => {
    const t = disc.get();
    const w = interpolate(t, [0, 1], [cardW, discSize]);
    const h = interpolate(t, [0, 1], [cardH, discSize]);
    const now = Math.max(w / stillW, h / stillH);
    return { transform: [{ scale: now / cardScale }] };
  });

  const haloStyle = useAnimatedStyle(() => ({
    opacity: disc.get(),
    transform: [{ scale: interpolate(disc.get(), [0, 1], [0.7, 1]) * pulse.get() }],
  }));
  // The brightening on the beat: a second light over the first, at
  // nothing between breaths and `PULSE_FLARE` at the top of one.
  const flareStyle = useAnimatedStyle(() => ({
    opacity: disc.get() * flare.get() * PULSE_FLARE,
    transform: [{ scale: pulse.get() }],
  }));

  /* ------------------------------- words ----------------------------- */

  const plan = run.plan;
  const progress = run.progress;
  const phase: AnalysisPhase = progress?.phase ?? 'analyse';
  const analyseLabel = plan?.phases.analyse.label ?? ANALYSIS_COPY.phase.analyse;
  const buildLabel = plan?.phases.build.label ?? ANALYSIS_COPY.phase.build;
  /*
    The second bar: the runner's work to its share, then the gather.
    `absorbed` only ever moves once `absorbing` is true, and `absorbing`
    needs `finished`, so the bar can never be pulled past the work.
  */
  const buildTarget = buildBarTarget({
    workDone: progress?.fraction.build ?? 0,
    absorbed,
    total: absorbTotal,
  });
  const buildDone = buildTarget >= 1;

  const unitLine = progress && !finished ? progress.unit.label : null;
  const doneLine = run.result && finished ? ANALYSIS_COPY.done(run.result.measured, run.result.frames.length) : null;
  // A unit worded the same as its bar (the compose unit under the build
  // bar) is not printed twice: the bar's label already says it.
  const analyseDetail =
    phase === 'analyse' && !finished && unitLine !== analyseLabel ? unitLine : null;
  const buildDetail = finished
    ? doneLine
    : phase === 'build' && unitLine !== buildLabel
      ? unitLine
      : null;

  const onStageLayout = (e: LayoutChangeEvent) => {
    setMeasuredStage(e.nativeEvent.layout.height);
  };

  const mainUri = main?.uri ?? null;
  const haloSize = discSize + DISC_HALO * 2;

  return (
    <View style={{ flex: 1, backgroundColor: darkColors.background }}>
      <View
        onLayout={onStageLayout}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: insets.top,
        }}>
        {/* The light behind the disc, present only once there is a disc. */}
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', width: haloSize, height: haloSize },
            haloStyle,
          ]}>
          <Halo size={haloSize} />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', width: haloSize, height: haloSize },
            flareStyle,
          ]}>
          <Halo size={haloSize} />
        </Animated.View>

        {/*
          The ring's centre is the stage's centre, which is the disc's.
          It sits beneath the disc so a frame being taken in slips under
          the disc's edge rather than over its face.
        */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <OrbitFrames
            frames={others}
            radius={ringRadius}
            phase={orbitPhase}
            leadMs={leadMs}
            tickedIds={progress?.measuredFrameIds ?? []}
            finishedIds={progress?.completedFrameIds ?? []}
            onAbsorbed={breathe}
          />
        </View>

        {mainUri !== null ? (
          <Animated.View
            accessible
            accessibilityLabel={main?.label}
            style={[
              {
                overflow: 'hidden',
                backgroundColor: darkColors.surface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: darkColors.glassBorder,
              },
              frameStyle,
            ]}>
            <Image
              source={{ uri: mainUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessible={false}
            />
            {meshBox !== null ? (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <Animated.View style={[{ width: meshBox.width, height: meshBox.height }, meshStyle]}>
                  <StaticHairMesh
                    face={meshBox.face}
                    fit={meshBox.face.fit}
                    width={meshBox.width}
                    height={meshBox.height}
                    points
                  />
                </Animated.View>
              </View>
            ) : null}
          </Animated.View>
        ) : null}
      </View>

      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: insets.bottom + spacing.xxl,
          gap: spacing.xl,
        }}>
        <StageRow
          label={analyseLabel}
          fraction={progress?.fraction.analyse ?? 0}
          active={phase === 'analyse' && !finished}
          done={analyseDone}
          detail={analyseDetail}
        />
        <StageRow
          label={buildLabel}
          fraction={buildTarget}
          active={phase === 'build' && !buildDone}
          done={buildDone}
          detail={buildDetail}
        />
        {plan?.note ? (
          <Text variant="caption" center style={{ color: darkColors.textTertiary }}>
            {plan.note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
