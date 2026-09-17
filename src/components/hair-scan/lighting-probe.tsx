/**
 * The scanner's light meter.
 *
 * Two ways of reading the room sit behind one hook, and the screen never
 * learns which it got:
 *
 *   1. A frame processor. VisionCamera hands every camera frame to a
 *      worklet on the camera's own thread; about four times a second the
 *      worklet reads a grid of luma samples from a small YUV buffer and
 *      posts one number back to JavaScript. Frames in between are
 *      released untouched, so the preview and the face detector never
 *      wait on this. Needs `react-native-vision-camera-worklets` and its
 *      native side, which exist only in a binary built after they were
 *      added — not in Expo Go, and not in a development client from
 *      before.
 *   2. The stills. When the frame processor is absent the level is taken
 *      from the brightness of each photograph the scanner captures,
 *      measured by the same pass that already judges every kept frame.
 *      Slower — it moves only when a still lands — but honest, and it
 *      needs nothing the app did not already have.
 *
 * Both feed the tracker in `features/hair-scan/lighting.ts`, which
 * smooths, holds and names the level, so the pill behaves the same way on
 * either path; only its reaction time differs.
 *
 * ── Why the modules are loaded with `import()` ──────────────────────
 * VisionCamera, the worklets bridge and Nitro itself all touch native
 * code the moment they are evaluated, and a synchronous `require` inside
 * a try is not enough on its own: Metro reports a module that first
 * loads after start-up and throws as *fatal*, not as an exception (see
 * `lib/native.ts`). So the question is asked of the native side before
 * anything is imported — is Nitro here, and are the three hybrid objects
 * this path needs registered — and only a yes leads to the import. The
 * import is asynchronous, which is why the hook reports `resolving` for
 * its first render or two; the screen shows the camera behind an empty
 * pill for that moment and nothing else waits on it.
 *
 * ── What proves the frame processor is alive ────────────────────────
 * `status === 'frame'` says the bridge loaded and the callback was
 * installed. The pill leaving "Reading the light" for a word says a frame
 * actually arrived; the word following a hand over the lens, within a
 * second or two, says they keep arriving. On the fallback path
 * `status === 'fallback'` and the word moves only when a still lands.
 * `sampleCount()` gives the exact number either way, for a debug overlay.
 *
 * A still is ignored only while live frames are actually landing — the
 * last frame sample younger than `LIGHTING_STALE_MS` — never merely
 * because the bridge loaded. A bridge whose output was not attached to a
 * camera (the simulator's stand-in has none to attach to) or whose frames
 * have stopped therefore falls back to the stills on its own, and the
 * pill is never left reading nothing on a build that has the module.
 *
 * ── What React is told, and when ────────────────────────────────────
 * Samples arrive four times a second for as long as the camera runs, and
 * nothing on screen changes four times a second. So the tracker's latest
 * reading lives in a ref, and React state is set only when the word
 * changes — the pill re-renders when it has something new to say, and
 * the engine reads the smoothed level at its own pace through
 * `gateLevel()` rather than being handed a new prop per frame.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import type { CameraFrameOutput, Frame } from 'react-native-vision-camera';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';

import { GlassSurface } from '@/components/ui/glass-surface';
import { Text } from '@/components/ui/text';
import { loadGrey } from '@/features/assessment/analyse-photo';
import { assessQuality } from '@/features/assessment/image-quality';
import {
  LIGHTING_COPY,
  LIGHTING_PENDING_LABEL,
  LIGHTING_STALE_MS,
  createLightingTracker,
  levelFromBrightness,
  lightingAllowsCapture,
  lightingGateLevel,
  meanLuminance,
  meanLuminanceInterleaved,
  type LightingLevel,
  type LightingReading,
  type LightingSource,
} from '@/features/hair-scan/lighting';
import { nitroAvailable } from '@/lib/native';
import { darkColors, motion, radius, spacing, useTheme } from '@/theme';

/**
 * How often the worklet reads a frame. Four a second is enough to follow
 * a person turning towards a window and far slower than the pill is
 * allowed to change, so most frames are released without being read.
 */
const SAMPLE_INTERVAL_MS = 250;

/** Grid pitch of the luma read, in pixels. See `meanLuminance`. */
const SAMPLE_STEP = 8;

/**
 * The frame output's resolution target. Small on purpose: the mean of a
 * 640×480 luma plane is the mean of the room, and asking the pipeline for
 * a second full-size stream would cost the preview more than the number
 * is worth. Preview-sized buffers are deliberately not requested — they
 * would replace this target with whatever the preview is, and the grid
 * read would then grow with the screen rather than staying at the 4,800
 * samples budgeted here.
 */
const PROBE_RESOLUTION = { width: 640, height: 480 };

/** Bytes per pixel of the interleaved formats a non-planar frame arrives in. */
const INTERLEAVED_BYTES_PER_PIXEL = 4;

/**
 * The hybrid objects this path creates, by their registered names. All
 * three have to be in the binary; a build with the camera but not the
 * worklets bridge has the first two and not the third.
 */
const REQUIRED_HYBRID_OBJECTS = ['CameraFactory', 'NativeThreadFactory', 'WorkletQueueFactory'];

export type LightingProbeStatus =
  /** The native side is being asked. The first render or two. */
  | 'resolving'
  /** The frame processor is installed and will report. */
  | 'frame'
  /** No frame processor in this build: the level follows the stills. */
  | 'fallback';

export type LightingProbe = {
  status: LightingProbeStatus;
  /**
   * The camera output that carries the frame processor, or null on the
   * fallback path. Spread it into the camera's `outputs` when it is
   * non-null. It is created once and never replaced, so a camera mounted
   * after `status` leaves `resolving` is configured exactly once.
   */
  frameOutput: CameraFrameOutput | null;
  /**
   * The word the pill shows, or null before the first sample. This is
   * React state: it changes when the word does and at no other time, so
   * a screen that reads it re-renders only then.
   */
  level: LightingLevel | null;
  /** Where the sample behind `level` came from. State, like `level`. */
  source: LightingSource;
  /**
   * The tracker's latest reading — smoothed level, raw sample, times —
   * read synchronously and without a render. For an effect, a tick
   * builder or a debug overlay, not for JSX: it moves under a render.
   */
  latest(): LightingReading | null;
  /**
   * The number to hand the engine as a tick's `lighting`: see
   * `lightingGateLevel`. Null until something has been measured.
   */
  gateLevel(): number | null;
  /** How many samples have reached the tracker. Proof of life, no render. */
  sampleCount(): number;
  /**
   * Fallback input: the brightness of a captured still, 0–255, as
   * `assessQuality` reports it. Ignored while the frame processor is
   * alive, so a caller that already measured the photograph can pass the
   * number along without checking which path is running.
   */
  reportBrightness(brightness: number): LightingReading | null;
  /**
   * Fallback input for a caller that has the file and not the number:
   * decodes the still, measures it, and feeds the result. Ignored while
   * the frame processor is alive. Resolves null when the file cannot be
   * read, and never throws.
   */
  sampleStill(uri: string): Promise<LightingReading | null>;
};

/* --------------------------- the frame path --------------------------- */

type FrameProcessing = {
  createOutput(): CameraFrameOutput;
  /** Installs the callback on the output's thread; returns the uninstaller. */
  attach(output: CameraFrameOutput, onFrame: (frame: Frame) => void): () => void;
};

let frameProcessing: Promise<FrameProcessing | null> | undefined;

/**
 * Whether this binary can run a frame processor, resolved once: the
 * answer depends on the build, not on the moment. Never rejects — a
 * bridge that fails to load is a build without one.
 */
function loadFrameProcessing(): Promise<FrameProcessing | null> {
  frameProcessing ??= resolveFrameProcessing().catch(() => null);
  return frameProcessing;
}

async function resolveFrameProcessing(): Promise<FrameProcessing | null> {
  // Asked before the import, not around it: see the module comment.
  if (!nitroAvailable()) return null;

  const { NitroModules } = await import('react-native-nitro-modules');
  for (const name of REQUIRED_HYBRID_OBJECTS) {
    if (!NitroModules.hasHybridObject(name)) return null;
  }

  const [camera, worklets] = await Promise.all([
    import('react-native-vision-camera'),
    import('react-native-vision-camera-worklets'),
  ]);

  return {
    createOutput() {
      return camera.VisionCamera.createFrameOutput({
        targetResolution: PROBE_RESOLUTION,
        // YUV so the luma plane can be read directly; RGB would make the
        // pipeline convert every frame for a number that only needs Y.
        pixelFormat: 'yuv',
        enablePreviewSizedOutputBuffers: false,
        allowDeferredStart: true,
        enablePhysicalBufferRotation: false,
        enableCameraMatrixDelivery: false,
        dropFramesWhileBusy: true,
      });
    },
    attach(output, onFrame) {
      /*
        The same provider VisionCamera's own `useFrameOutput` resolves
        through its worklets proxy — reached directly here because the
        proxy is not exported, and because a hook cannot be called for a
        module that arrives asynchronously.

        Both calls are *scheduled* onto the camera thread's runtime and
        return at once; the uninstall has not happened when the detacher
        returns. That is why the output is never disposed from here: a
        dispose on the JS thread would race the queued uninstall, which
        would then run against a dead hybrid object outside any catch.
        VisionCamera's own hooks never dispose an output either — the
        object is released when nothing holds it any more.
      */
      const runtime = worklets.provider.createRuntimeForThread(output.thread);
      runtime.setOnFrameCallback(output, onFrame);
      return () => runtime.setOnFrameCallback(output, undefined);
    },
  };
}

/* ------------------------------- the hook ------------------------------ */

type Engine = { status: LightingProbeStatus; frameOutput: CameraFrameOutput | null };
/** What the screen is told: the word and where it came from. Nothing else. */
type Shown = { level: LightingLevel | null; source: LightingSource };

const RESOLVING: Engine = { status: 'resolving', frameOutput: null };
const FALLBACK: Engine = { status: 'fallback', frameOutput: null };
const UNSHOWN: Shown = { level: null, source: 'none' };

export function useLightingProbe(): LightingProbe {
  const [tracker] = useState(createLightingTracker);
  const [engine, setEngine] = useState<Engine>(RESOLVING);
  const [shown, setShown] = useState<Shown>(UNSHOWN);
  const samplesRef = useRef(0);
  /*
    The word last handed to React, kept beside the state so a sample can
    be judged without a render: state is set only when this differs from
    the tracker's answer, and a stream of identical words costs nothing.
  */
  const shownRef = useRef<Shown>(UNSHOWN);

  const absorb = useCallback(
    (reading: LightingReading) => {
      samplesRef.current += 1;
      const last = shownRef.current;
      if (last.level === reading.level && last.source === reading.source) return;
      const next: Shown = { level: reading.level, source: reading.source };
      shownRef.current = next;
      setShown(next);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | null = null;

    // Runs on the JS thread, four times a second, with one number.
    const deliver = (level: number, at: number) => {
      if (cancelled) return;
      absorb(tracker.push(level, at, 'frame'));
    };

    loadFrameProcessing().then((processing) => {
      if (cancelled) return;
      if (processing === null) {
        setEngine(FALLBACK);
        return;
      }

      try {
        const output = processing.createOutput();
        // No warning per dropped frame: dropping is the design here.
        output.setOnFrameDroppedCallback(() => undefined);

        /*
          Shared between calls on the camera thread. A worklet's closure
          is copied when it is installed, so a plain variable would reset
          on every frame; this is the one kind of value that persists.
        */
        const lastSampleAt = createSynchronizable(0);

        const onFrame = (frame: Frame) => {
          'worklet';
          try {
            const now = Date.now();
            if (now - lastSampleAt.getDirty() < SAMPLE_INTERVAL_MS) return;
            lastSampleAt.setBlocking(now);

            let level: number | null = null;
            if (frame.isPlanar) {
              // Y is the first plane of every YUV layout the camera streams.
              const luma = frame.getPlanes()[0];
              if (luma !== undefined && luma.isValid) {
                level = meanLuminance(
                  new Uint8Array(luma.getPixelBuffer()),
                  luma.width,
                  luma.height,
                  luma.bytesPerRow,
                  SAMPLE_STEP,
                );
              }
            } else if (frame.hasPixelBuffer) {
              level = meanLuminanceInterleaved(
                new Uint8Array(frame.getPixelBuffer()),
                frame.width,
                frame.height,
                frame.bytesPerRow,
                INTERLEAVED_BYTES_PER_PIXEL,
                SAMPLE_STEP,
              );
            }

            if (level !== null) scheduleOnRN(deliver, level, now);
          } finally {
            // Always, or the pipeline stalls behind a frame nobody freed.
            frame.dispose();
          }
        };

        detach = processing.attach(output, onFrame);
        setEngine({ status: 'frame', frameOutput: output });
      } catch {
        // The bridge loaded but the pipeline refused it. The stills still
        // work, and the screen is told nothing it could act on.
        setEngine(FALLBACK);
      }
    });

    return () => {
      cancelled = true;
      try {
        detach?.();
      } catch {
        // A runtime that is already gone has nothing to uninstall.
      }
      // The output is not disposed here: see `attach`. Once nothing
      // references it — this closure and the camera's `outputs` — it goes
      // the way every other hybrid object does.
    };
  }, [tracker, absorb]);

  /**
   * Whether live frames are landing right now: the last sample came from
   * a frame and is younger than the staleness window. Only then would a
   * still muddy the reading; otherwise it is the reading.
   */
  const framesLanding = useCallback(() => {
    const reading = tracker.current();
    return (
      reading !== null && reading.source === 'frame' && Date.now() - reading.at < LIGHTING_STALE_MS
    );
  }, [tracker]);

  const reportBrightness = useCallback(
    (brightness: number): LightingReading | null => {
      if (framesLanding()) return tracker.current();
      const reading = tracker.push(levelFromBrightness(brightness), Date.now(), 'still');
      absorb(reading);
      return reading;
    },
    [framesLanding, tracker, absorb],
  );

  const sampleStill = useCallback(
    async (uri: string): Promise<LightingReading | null> => {
      if (framesLanding()) return tracker.current();
      const grey = await loadGrey(uri);
      if (grey === null) return tracker.current();
      return reportBrightness(assessQuality(grey).brightness);
    },
    [framesLanding, tracker, reportBrightness],
  );

  const latest = useCallback(() => tracker.current(), [tracker]);
  const gateLevel = useCallback(() => lightingGateLevel(tracker.current()), [tracker]);
  const sampleCount = useCallback(() => samplesRef.current, []);

  return {
    status: engine.status,
    frameOutput: engine.frameOutput,
    level: shown.level,
    source: shown.source,
    latest,
    gateLevel,
    sampleCount,
    reportBrightness,
    sampleStill,
  };
}

/* ------------------------------- the pill ------------------------------ */

/** The glyph's box, in points. */
const SUN = 14;
const SUN_CORE = 2.6;
const SUN_RAY_FROM = 4.6;
const SUN_RAY_TO = 6.4;
const SUN_RAYS = 8;

/** How much of the fill shows through when the light is good. */
const GLOW_OPACITY = 0.62;

/** How far the label dips while one word becomes the next. */
const SWAP_DIP = 0.3;

function Sun({ color }: { color: string }) {
  const c = SUN / 2;
  const rays = Array.from({ length: SUN_RAYS }, (_, i) => {
    const angle = (i / SUN_RAYS) * Math.PI * 2;
    return {
      x1: c + Math.cos(angle) * SUN_RAY_FROM,
      y1: c + Math.sin(angle) * SUN_RAY_FROM,
      x2: c + Math.cos(angle) * SUN_RAY_TO,
      y2: c + Math.sin(angle) * SUN_RAY_TO,
    };
  });
  return (
    <Svg width={SUN} height={SUN} viewBox={`0 0 ${SUN} ${SUN}`} accessible={false}>
      <Circle cx={c} cy={c} r={SUN_CORE} fill={color} />
      {rays.map((ray, i) => (
        <Line key={i} {...ray} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

/**
 * The lighting pill: a glass capsule over the camera with a sun and one
 * word. It fills with the accent while the light is good enough to
 * capture in and drains when it is not, and the word crossfades rather
 * than snapping. Both stop under Reduce Motion, where the end state
 * simply appears.
 *
 * It is chrome over video, so it takes the dark treatment whatever the
 * app theme is; the colours it reaches for are the dark palette's, by
 * name, because "over the camera" is not a theme the person chose.
 */
export function LightingPill({
  level,
  status,
  style,
}: {
  /** The probe's `level`: the word to show, or null before the first sample. */
  level: LightingLevel | null;
  status: LightingProbeStatus;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  const label = level ? LIGHTING_COPY[level].label : LIGHTING_PENDING_LABEL;
  const good = level !== null && lightingAllowsCapture(level);
  const pending = level === null;

  const glow = useSharedValue(good ? 1 : 0);
  const swap = useSharedValue(1);
  // The label this pill last showed, so the first one is not faded in
  // from a word nobody saw.
  const shownLabel = useRef(label);

  useEffect(() => {
    if (reduceMotion) {
      glow.set(good ? 1 : 0);
      return;
    }
    glow.set(withTiming(good ? 1 : 0, { duration: motion.duration.slow }));
  }, [good, reduceMotion, glow]);

  useEffect(() => {
    if (shownLabel.current === label) return;
    shownLabel.current = label;
    if (reduceMotion) {
      swap.set(1);
      return;
    }
    swap.set(
      withSequence(
        withTiming(SWAP_DIP, { duration: motion.duration.fast }),
        withTiming(1, { duration: motion.duration.base }),
      ),
    );
  }, [label, reduceMotion, swap]);

  const fillStyle = useAnimatedStyle(() => ({ opacity: glow.get() * GLOW_OPACITY }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: swap.get() }));

  return (
    <View
      style={style}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Lighting: ${label}`}
      accessibilityLiveRegion="polite">
      <GlassSurface borderRadius={radius.pill} variant="clear" over="dark">
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: darkColors.accent }, fillStyle]}
        />
        <Animated.View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              paddingVertical: spacing.sm + spacing.xxs,
              paddingHorizontal: spacing.lg,
              // Faded while the meter is still finding its feet, so a pill
              // that has nothing to say yet does not look like a verdict.
              opacity: pending && status === 'resolving' ? 0.72 : 1,
            },
            labelStyle,
          ]}>
          <Sun color={colors.textOnPhoto} />
          <Text variant="subhead" color="textOnPhoto">
            {label}
          </Text>
        </Animated.View>
      </GlassSurface>
    </View>
  );
}
