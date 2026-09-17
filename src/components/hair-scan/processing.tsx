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
 * ── Two clocks, one hand-off ──────────────────────────────────────────
 * The bars run on the runner's clock: they move when a unit finishes and
 * never otherwise. The ring runs on its own: it takes a fixed time to
 * form, however fast the pass was. The absorb and the hand-off wait for
 * the later of the two — the pass finished, and the ring formed — so a
 * build whose pass ends at its total floor (any build without the
 * segmenter, the simulator included) still shows the whole ring rather
 * than yanking the frames back mid-glide. The absorb's own length is
 * `absorbHandoffMs` in the analysis module: the last arrival, the
 * disc's breath on it, and a settle; the hand-off runs on that clock.
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
 * that unit's work has finished. Nothing here paces a bar with a timer;
 * the floors in the runner hold a finished reading on screen for a beat,
 * and that is all. The lines under the bars name the device's work on
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
  pickMainFrame,
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
  absorbHandoffMs,
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
function useAnalysisRun(frames: readonly AnalysisFrame[], deps: AnalysisDeps | undefined): RunState {
  const [state, setState] = useState<RunState>({
    plan: null,
    progress: null,
    result: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    runAnalysis(frames, {
      deps,
      signal: controller.signal,
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
  }, [frames, deps]);

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
  /** This bar's units are the ones running. */
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
};

export function Processing({ frames, onComplete, onAbsorb, onError, deps }: ProcessingProps) {
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  /** Measured on layout; until then a share of the window stands in, so the first frame is not a pop. */
  const [measuredStage, setMeasuredStage] = useState<number | null>(null);
  const stageHeight = measuredStage ?? Math.round(height * 0.55);

  const run = useAnalysisRun(frames, deps);
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
  const buildDone = (progress?.fraction.build ?? 0) >= 1 && finished;

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
          fraction={progress?.fraction.build ?? 0}
          active={phase === 'build' && !finished}
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
