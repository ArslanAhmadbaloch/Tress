import { useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { GlassGroup, GlassSurface } from '@/components/ui/glass-surface';
import { Icon, type IconName } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import {
  CAPTURE_TIMERS,
  loadCaptureTimer,
  saveCaptureTimer,
  type CaptureTimer,
} from '@/lib/device-preferences';
import { nitroAvailable } from '@/lib/native';
import { useBackOrHome } from '@/lib/navigation';
import { CaptureRing } from '@/components/capture-ring';
import {
  FaceFrame,
  FlyingFrame,
  FrameStack,
  GhostOverlay,
  SLOT_H,
  SWEEP_RING_INSET,
  ScanAnalysing,
  SweepRing,
  TrackedCamera,
  facePace,
  sampleCameraActive,
  stackSlotFor,
  tracksFace,
  type FaceFrameHandle,
  type FaceObservation,
  type GuideTarget,
  type SweepMark,
  type TrackedCameraHandle,
} from '@/components/capture';
/*
  Straight from the module rather than the barrel: RingScrim is the lower
  half of the FaceFrame — the dimming, which has to sit under the ghost
  and the flash — and `headProximity` is the number both halves of it are
  drawn from, which the turn needs in its own hand so it can take the
  worse of that and the head's stillness. Neither is named by the barrel.
*/
import { RingScrim, headProximity } from '@/components/capture/face-frame';
import { BASELINE_THANKS } from '@/features/content/belonging';
import { useHairContent } from '@/features/content/use-hair-content';
import {
  createScan,
  currentAngle,
  holdProgress,
  reduce,
  type Effect,
  type Event,
  type Phase,
  type Pose,
  type ScanState,
  type SweepCue,
  type SweepState,
} from '@/features/capture/guided-scan';
import { loadHandsFree, saveHandsFree } from '@/features/capture/hands-free';
import { previousPhotoForAngle } from '@/features/capture/previous-photo';
import { SCAN_COPY } from '@/features/capture/scan-copy';
import {
  SEGMENT_HAPTIC_MS,
  fillOf,
  lagFills,
  ringClosed,
  theta,
} from '@/features/capture/sweep';
import { useSteadiness } from '@/features/capture/use-steadiness';
import { analysePhoto } from '@/features/assessment/analyse-photo';
import { SHARPNESS_WIDTH, isSoft, sharpnessAt } from '@/features/assessment/frame-sharpness';
import { formatDateShort } from '@/lib/date';
import { persistCapture, shrinkCapture } from '@/lib/photo-storage';
import { useAppStore } from '@/store/app-store';
import { latestSession } from '@/store/selectors';
import { motion, useTheme } from '@/theme';
import {
  ANGLES,
  ANGLE_LABELS,
  missingAngles,
  sessionToExtend,
  type Angle,
  type Photo,
  type PhotoCoverage,
  type PhotoSession,
} from '@/types/domain';

const SHUTTER_SIZE = 78;

/**
 * The weight of the guide ring's track.
 *
 * Stated here rather than left to a default because two things draw on
 * that circle — the ring's segments and the glow that answers the head —
 * and a point and a half of disagreement between them is a second ring.
 */
const RING_STROKE = 3;

/** The single-scan set: one photograph, from the front. */
const SINGLE_ANGLES: readonly Angle[] = ['front'];

/**
 * How long a save will wait for a coverage reading that is still running.
 * The measurement starts the moment the shutter fires and usually beats
 * the person to the save button; this is for the phone that did not.
 */
const COVERAGE_WAIT_MS = 4000;

/** What `withinTime` hands back when the reading, not the wait, is what ran out. */
const STILL_RUNNING = Symbol('still-running');

/** How many empty frames in a row before the face counts as gone. */
const FACE_LOST_AFTER = 3;

/** The least time between two haptic or spoken framing cues. */
const CUE_INTERVAL_MS = 1500;

/**
 * How long after the last face before the phone's own stillness is worth
 * reporting to the reducer at all.
 *
 * The blind countdown arms on stillness, and the two angles it arms for
 * are shot with the camera pointed away from everybody. A turn leaves the
 * camera full of face and the phone already steady in somebody's hand, so
 * without this the countdown for the top could arm while they were still
 * looking at their own chin. It lives here rather than in the reducer
 * because the screen is what owns the camera, and because the arming rule
 * itself is tested as it stands.
 */
const FACE_GONE_MS = 1500;

/**
 * The phases where a photograph is being framed, and so the accelerometer
 * is worth running. `flying` is one of them on purpose: dropping the
 * sensor for the 900 ms cooldown and picking it up again would reset it
 * to "no reading yet" at the start of every angle.
 */
const FRAMING_PHASES = new Set<Phase['kind']>([
  'tracked',
  'sweep',
  'blind',
  'capturing',
  'flying',
]);

/** The phases the reducer needs a clock for. */
const TICKING = new Set<Phase['kind']>(['tracked', 'sweep', 'blind', 'flying']);

/** How long the cursor takes to reach the head's latest position. */
const CURSOR_MS = 70;

/** The cross-fade from the turn's eight arcs to the five-angle ring. */
const COLLAPSE_MS = 380;

/**
 * Where the ring's own answer to the head stops warming during a turn:
 * degrees of turn per second, and face widths per second.
 *
 * Both are deliberately near the pace at which a photograph stops being
 * possible, so the edge is brightest exactly when a shot could be taken.
 * It is still a reading of where a head is and how fast it is moving, and
 * never a judgement of the photograph.
 */
const LOCK_YAW_RATE = 12;
const LOCK_PACE = 0.55;

/** How much of a new stillness reading counts, so the edge does not flicker. */
const LOCK_SMOOTHING = 0.35;

/** How often the reducer is given the time, and the phone's motion with it. */
const TICK_MS = 250;

/** How often the hold arc is written while a pose is being held. */
const HOLD_TICK_MS = 60;

/**
 * Lines that are events rather than corrections, so they are spoken
 * whenever they happen rather than rationed like the framing cues.
 *
 * The turn's confirmation is a count rather than a name, so every count
 * it could produce is enumerated here — there are at most five
 * photographs in a set, so there are at most twenty-five of them, and
 * matching the exact string is worth more than matching a prefix.
 */
const ALWAYS_SPOKEN = new Set<string>([
  ...Object.values(SCAN_COPY.captured),
  SCAN_COPY.complete,
  ...ANGLES.flatMap((_, i) =>
    ANGLES.map((__, j) => SCAN_COPY.sweep.saved(i + 1, j + 1)),
  ),
]);

/** The least time a work unit's line stays on screen. */
const UNIT_FLOOR_MS = 350;

/** The least time the analysing pass is on screen, however fast the phone. */
const ANALYSING_MIN_MS = 2200;

/**
 * Everything about a scan that the screen actually draws.
 *
 * Faces arrive at camera rate and most of them change nothing anybody can
 * see. The reducer still runs on every one — a hold is measured in
 * milliseconds — but the screen only re-renders when this string moves.
 */
function visibleKey(state: ScanState): string {
  const phase = state.phase;
  return [
    phase.kind,
    currentAngle(state) ?? '',
    phase.kind === 'tracked' ? `${phase.cue}|${phase.manualHint}` : '',
    phase.kind === 'blind' ? String(phase.counting) : '',
    state.index,
    Object.keys(state.shots).length,
    phase.kind === 'analysing' ? `${phase.done}/${phase.label}` : '',
  ].join('|');
}

/**
 * Measures hair coverage in one frame, on the device, and never throws.
 *
 * The segmenter is loaded lazily because importing it touches the TFLite
 * native module, and a binary without one — Expo Go, or a client built
 * before the model was added — would fail at the import rather than at
 * the call. Either way the answer is the same: no reading, and the
 * photograph is kept regardless. Coverage is a note about the photo, not
 * a condition of keeping it.
 */
async function measureCoverageSafely(uri: string): Promise<PhotoCoverage | undefined> {
  // The segmenter runs on Nitro. Without it the import itself would be
  // reported as a fatal error rather than thrown here — see `nitroAvailable`.
  if (!nitroAvailable()) return undefined;
  try {
    const { measureCoverage } = await import('@/features/assessment/hair-segmenter');
    const reading = await measureCoverage(uri);
    if (!reading) return undefined;
    return {
      fraction: reading.fraction,
      upperFraction: reading.upperFraction,
      verticalBalance: reading.verticalBalance,
      horizontalBalance: reading.horizontalBalance,
      pixels: reading.pixels,
    };
  } catch {
    return undefined;
  }
}

/** Resolves with `fallback` if `promise` has not settled within `ms`. */
function withinTime<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Holds until `ms` have passed since `startedAt`; returns at once if they have. */
function minimumElapsed(startedAt: number, ms: number): Promise<void> {
  const left = ms - (Date.now() - startedAt);
  return left > 0 ? sleep(left) : Promise.resolve();
}

export default function CaptureSessionScreen() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const leave = useBackOrHome();
  const { data, addSession, extendSession, patchPhoto } = useAppStore();
  /** Their very first set, which is the one worth acknowledging. */
  const isBaseline = data.sessions.length === 0;

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<TrackedCameraHandle>(null);

  /*
    Four ways in. The intro opens the full session at a chosen angle, and
    the reducer rotates the order so that angle is first and the rest
    follow, wrapping round. The funnel opens a single scan: one
    photograph, from the front, and straight to the report. Home's
    baseline card opens the rest of that scan: only the angles the
    baseline lacks, saved into the baseline rather than beside it. And
    `manual=1` — the intro's "Can't turn your head?" link — forces the
    shutter to be the only way the camera fires, whatever the build can do.
  */
  const { start, single, extend, manual } = useLocalSearchParams<{
    start?: string;
    single?: string;
    extend?: string;
    manual?: string;
  }>();
  const singleMode = single === '1';
  const manualMode = manual === '1';

  /*
    Decided once, as the screen opens. The rule is `sessionToExtend`'s,
    and it applies with or without the card's param: a full capture
    started from the intro while the baseline is still one photograph
    extends it too, because the alternative is a "Day 1" set sitting
    beside a one-photograph baseline for the life of the journey. The
    store re-checks at save, so the session held here going stale costs
    nothing.
  */
  const [extending] = useState<PhotoSession | null>(() =>
    singleMode ? null : sessionToExtend(data.sessions, extend),
  );
  const angles = useMemo<readonly Angle[]>(
    () => (singleMode ? SINGLE_ANGLES : extending ? missingAngles(extending) : ANGLES),
    [singleMode, extending],
  );
  const startAt = ANGLES.includes(start as Angle) ? (start as Angle) : undefined;

  /*
    One state for the whole scan.

    Tracking, hands-free and the accelerometer are all unknown on the
    first frame — the camera has not reported, AsyncStorage has not
    answered and the sensor has not been asked — so the scan starts in the
    state that needs nothing from any of them: the shutter. Each of the
    three is patched in as it becomes known, through `patchScan`.
  */
  const [scan, setScan] = useState<ScanState>(() =>
    createScan({
      angles,
      startAt,
      tracking: false,
      handsFree: false,
      motionAvailable: false,
      baseline: latestSession(data)?.photos,
      now: Date.now(),
    }),
  );
  // The reducer is called from camera-rate callbacks and from timers,
  // both of which would otherwise be reading a render-old state.
  const scanRef = useRef(scan);
  const prevVisible = useRef(scan);

  /** The one door for every change to the state that is not an event. */
  const patchScan = useCallback((next: ScanState) => {
    scanRef.current = next;
    prevVisible.current = next;
    setScan(next);
  }, []);

  const runEffectRef = useRef<(effect: Effect) => void>(() => undefined);

  const dispatch = useCallback((event: Event) => {
    const { state, effects } = reduce(scanRef.current, event);
    if (state !== scanRef.current) {
      scanRef.current = state;
      if (visibleKey(state) !== visibleKey(prevVisible.current)) {
        prevVisible.current = state;
        setScan(state);
      }
    }
    for (const effect of effects) runEffectRef.current(effect);
  }, []);

  const [isSaving, setIsSaving] = useState(false);
  /** True while a system alert is up, so the capture session can pause. */
  const [confirming, setConfirming] = useState(false);
  /** The faint copy of last time's shot: on for updates, off for a baseline. */
  const [ghostOn, setGhostOn] = useState(() => !isBaseline);

  useEffect(() => {
    loadHandsFree().then((value) => {
      patchScan({ ...scanRef.current, handsFree: !manualMode && value });
    });
  }, [manualMode, patchScan]);

  /**
   * Coverage readings in flight, by the frame they were taken from. The
   * measurement starts the moment a frame is shrunk, so by the time the
   * set is analysed it is usually already done; a retake simply leaves
   * its entry behind to be ignored.
   */
  const coverageByUri = useRef(new Map<string, Promise<PhotoCoverage | undefined>>());
  /** How the shutter fired for each angle, kept for the saved record. */
  const captureModeByAngle = useRef(new Map<Angle, Photo['capture']>());
  /** The head's angles at the last face event, attached to the next shot. */
  const lastPose = useRef<Pose | null>(null);
  /** True while a shutter tap is being reduced, so the record says so. */
  const viaShutter = useRef(false);

  /*
   * Self-timer. The top and back angles are shot blind — the screen faces
   * away — so a delay lets the phone be settled before it fires. The
   * choice is remembered, because it is a habit rather than a per-shot
   * decision.
   */
  const [timer, setTimer] = useState<CaptureTimer>(0);
  /** The digits on screen, and what they started from, so the ring can drain. */
  const [countdown, setCountdown] = useState<{ left: number; from: number } | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadCaptureTimer().then(setTimer);
    return () => {
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  }, []);

  const phase = scan.phase;
  const angle = currentAngle(scan) ?? scan.order[0];
  const shotCount = Object.keys(scan.shots).length;
  const content = useHairContent();
  const guidance = content.angles[angle];

  /* ----------------------------- shutter ---------------------------- */

  const flash = useSharedValue(0);
  const shutterScale = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));
  const shutterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterScale.get() }],
  }));

  const startCapture = useCallback(
    async (target: Angle, via: NonNullable<Photo['capture']>) => {
      if (!cameraRef.current) return;

      if (!reduceMotion) {
        shutterScale.set(
          withSequence(
            withTiming(0.88, { duration: 90 }),
            withSpring(1, motion.spring.bouncy),
          ),
        );
        flash.set(
          withSequence(
            withTiming(0.85, { duration: 60 }),
            withTiming(0, { duration: 220 }),
          ),
        );
      }
      // The ring beats too. On a guided shot the eye is on the ring the
      // head is sitting in, not on the shutter it never touched, so the
      // flash alone would fire where nobody is looking. The beat is
      // weight and light, never size — a ring that swells would be two
      // rings again. No-ops under Reduce Motion.
      faceFrameRef.current?.pulse();

      try {
        const photo = await cameraRef.current.takePhoto();
        // Down to storage size before it touches state: what flies into
        // the pile and is reviewed is then the size it will be saved at,
        // not a full-resolution frame waiting to be resized later.
        const small = await shrinkCapture(photo.uri);

        /*
          The hair mask starts now, while the person is moving on to the
          next angle. It is the slowest thing the app does to a
          photograph, and this is the one moment where nobody is waiting
          on it.
        */
        coverageByUri.current.set(small.uri, measureCoverageSafely(small.uri));
        // A frame from the simulator's stand-in camera is recorded as
        // one, so the record says what the pixels already show.
        captureModeByAngle.current.set(target, sampleCameraActive() ? 'sample' : via);
        dispatch({
          type: 'shot',
          uri: small.uri,
          pose: lastPose.current ?? undefined,
          now: Date.now(),
        });
      } catch {
        setConfirming(true);
        Alert.alert(
          "Couldn't take that photo",
          'Something interrupted the camera. Please try again.',
          [{ text: 'OK', onPress: () => setConfirming(false) }],
          { onDismiss: () => setConfirming(false) },
        );
        dispatch({ type: 'shotFailed', now: Date.now() });
      }
    },
    [reduceMotion, flash, shutterScale, dispatch],
  );

  const cancelCountdown = useCallback(() => {
    if (countdownRef.current) clearTimeout(countdownRef.current);
    countdownRef.current = null;
    setCountdown(null);
  }, []);

  /**
   * Runs a countdown, then captures.
   *
   * Shared by the shutter and by the phone settling on a blind angle, so
   * a hands-free capture is the same digits and the same haptic ticks as
   * one you started yourself — the only difference is what began it.
   */
  const runCountdown = useCallback(
    (seconds: number, target: Angle) => {
      let remaining = seconds;
      const say = (n: number) => {
        setCountdown({ left: n, from: seconds });
        Haptics.selectionAsync().catch(() => undefined);
        AccessibilityInfo.announceForAccessibility(String(n));
      };
      const tick = () => {
        remaining -= 1;
        if (remaining <= 0) {
          countdownRef.current = null;
          setCountdown(null);
          // The shutter itself gets a heavier tap than the ticks, so the
          // blind angles can be felt rather than watched.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
            () => undefined,
          );
          /*
            A hands-free count runs while the reducer is still on the
            blind angle — it armed the countdown, it did not take the
            photograph — so the phase is moved here, before the shutter
            fires. Without it the `shot` event would arrive at a phase
            that has no case for it and the frame would be dropped.
          */
          const state = scanRef.current;
          if (state.phase.kind !== 'capturing') {
            patchScan({ ...state, phase: { kind: 'capturing', angle: target } });
          }
          startCapture(target, 'timer');
          return;
        }
        say(remaining);
        countdownRef.current = setTimeout(tick, 1000);
      };

      say(remaining);
      countdownRef.current = setTimeout(tick, 1000);
    },
    [startCapture, patchScan],
  );

  const chooseTimer = (seconds: CaptureTimer) => {
    setTimer(seconds);
    saveCaptureTimer(seconds);
  };

  const onShutter = useCallback(() => {
    /*
      Mid-countdown the shutter is a stop button: the count is running and
      tapping it means "not yet", not "again". Which event says so depends
      on who started it — a blind angle's own count is cancelled by
      `shutter`, which returns the angle to waiting for stillness, while
      the person's self-timer runs with the reducer already in `capturing`,
      where `cancelled` is what puts the angle back.
    */
    if (countdown !== null) {
      cancelCountdown();
      dispatch({
        type: scanRef.current.phase.kind === 'blind' ? 'shutter' : 'cancelled',
        now: Date.now(),
      });
      return;
    }
    /*
      Read back inside the capture effect, which the dispatch below runs
      synchronously, and cleared again straight after — a tap the reducer
      ignored must not label the next automatic shot as a manual one.
    */
    viaShutter.current = true;
    dispatch({ type: 'shutter', now: Date.now() });
    viaShutter.current = false;
  }, [countdown, cancelCountdown, dispatch]);

  /* ------------------------------ cues ------------------------------ */

  /** When the last spoken cue went out, so a flicker cannot nag. */
  const lastCueAt = useRef(0);

  /*
    A plain function rather than a callback: it is only ever reached
    through `runEffectRef`, which is rewritten on every render, so it
    always closes over the current timer and countdown.
  */
  const announce = (text: string) => {
    if (!ALWAYS_SPOKEN.has(text)) {
      const now = Date.now();
      if (now - lastCueAt.current < CUE_INTERVAL_MS) return;
      lastCueAt.current = now;
    }
    AccessibilityInfo.announceForAccessibility(text);
  };

  const runEffect = (effect: Effect) => {
    switch (effect.type) {
      case 'capture': {
        const byHand = viaShutter.current;
        viaShutter.current = false;
        // Somebody's own self-timer sits in front of their own tap, at
        // every angle: it is the thing they set it for.
        if (byHand && timer > 0) {
          runCountdown(timer, effect.angle);
          return;
        }
        startCapture(effect.angle, byHand ? 'manual' : 'guided');
        return;
      }
      case 'countdown': {
        const target = currentAngle(scanRef.current);
        if (target) runCountdown(effect.seconds, target);
        return;
      }
      case 'cancelCountdown':
        cancelCountdown();
        return;
      case 'haptic':
        if (effect.kind === 'holdStart') Haptics.selectionAsync().catch(() => undefined);
        else if (effect.kind === 'captured')
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        else
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => undefined,
          );
        return;
      case 'announce':
        announce(effect.text);
    }
  };

  useEffect(() => {
    runEffectRef.current = runEffect;
  });

  /*
   * Motion, used for two things: knowing when to get out of the way, and
   * knowing when "hold still" has been obeyed.
   *
   * The reducer reads it too — a blind angle's countdown arms only once
   * the phone has been held still — but through the tick timer rather
   * than an effect, because a state set inside an effect body is exactly
   * what the lint set forbids.
   */
  const framing =
    FRAMING_PHASES.has(phase.kind) && !confirming && permission?.granted === true;

  const { moving, steady, unavailable: noMotionSensor } = useSteadiness(framing);

  /* --------------------------- head tracking ------------------------ */

  const { width, height } = useWindowDimensions();
  const guideWidth = width * 0.62;
  /** The ring's diameter; the instruction is sized against it. */
  const RING = guideWidth * 1.18;
  // High in the frame, just under the top bar: where a face sits when the
  // phone is held at arm's length, rather than in the middle of the screen.
  const guideTop = insets.top + 64 + spacing.lg;

  /** Where the head should be, in the coordinates the camera reports in. */
  const target = useMemo<GuideTarget>(
    () => ({ cx: width / 2, cy: guideTop + RING / 2, diameter: RING }),
    [width, guideTop, RING],
  );

  /** Where a captured frame flies to, and where the pile sits. */
  const slot = useMemo(
    () =>
      stackSlotFor({
        width,
        height,
        bottomInset: insets.bottom,
        shutterSize: SHUTTER_SIZE,
      }),
    [width, height, insets.bottom],
  );

  const faceFrameRef = useRef<FaceFrameHandle>(null);

  /*
    How close the head is to sitting in the ring, 0 to 1.

    There is one target on this screen and both halves of it read from
    this: the FaceFrame adds the approach to the hold and publishes the
    sum here, glows on it, and the CaptureRing firms up on it. One number,
    so the two can never disagree about how lit the ring is. Shared rather
    than state — it changes at camera rate, and a re-render of a screen
    carrying a live camera thirty times a second is not a price worth
    paying to move an opacity.
  */
  const lockValue = useSharedValue(0);

  /*
    Per-frame state lives in refs. Faces arrive at camera rate and most
    of them change nothing the person can see.
  */
  const lastFace = useRef<FaceObservation | null>(null);
  const missedFrames = useRef(0);
  const pace = useRef(0);
  const motionRef = useRef({ moving: false, steady: false, unavailable: true });
  useEffect(() => {
    motionRef.current = { moving, steady, unavailable: noMotionSensor };
  }, [moving, steady, noMotionSensor]);
  /** The last motion the reducer was told about, so only changes are sent. */
  const lastMotion = useRef({ moving: false, steady: false });

  /*
    The scan's own answer, not the camera's. `manual=1` forces tracking
    off whatever the build reports, and the ring's response has to go off
    with it: a guide that answers the head and can never fire is the wrong
    promise on the screen somebody opened because they cannot turn their
    head.
  */
  const trackingThisAngle = scan.tracking && framing && tracksFace(angle);

  const onTrackingChanged = useCallback(
    (reporting: boolean) => {
      // Only before the first photograph: after that the order, the sign
      // and the shots are a record of what happened, not a setting.
      if (Object.keys(scanRef.current.shots).length > 0) return;
      const next = !manualMode && reporting;
      if (next === scanRef.current.tracking) return;

      const patched: ScanState = { ...scanRef.current, tracking: next };
      if (patched.phase.kind === 'tracked') {
        patched.phase = {
          ...patched.phase,
          cue: next ? 'searching' : 'manual',
          holdSince: null,
          stillSince: null,
          manualHint: !next,
        };
      }
      patchScan(patched);
    },
    [manualMode, patchScan],
  );

  const onFace = useCallback(
    (seen: FaceObservation | null) => {
      let face = seen;
      if (seen) {
        pace.current = lastFace.current ? facePace(lastFace.current, seen) : 0;
        lastFace.current = seen;
        missedFrames.current = 0;
      } else {
        // A single dropped frame is not a face leaving. Holding the last
        // sighting for a few frames keeps the ring from blinking.
        missedFrames.current += 1;
        if (missedFrames.current < FACE_LOST_AFTER) face = lastFace.current;
        else lastFace.current = null;
      }

      faceFrameRef.current?.update(face);
      if (scanRef.current.phase.kind !== 'tracked') return;

      lastPose.current = face
        ? { yaw: face.yaw, pitch: face.pitch ?? 0, roll: face.roll ?? 0 }
        : null;

      const m = motionRef.current;
      dispatch({
        type: 'face',
        face,
        target,
        phoneMoving: m.moving,
        // No accelerometer — a simulator, say — means the phone's
        // stillness cannot be known, so the face's own has to do.
        phoneSteady: m.unavailable ? true : m.steady,
        facePace: pace.current,
        now: Date.now(),
      });

      const next = scanRef.current.phase;
      faceFrameRef.current?.setAligned(next.kind === 'tracked' && next.cue === 'hold');
    },
    [target, dispatch],
  );

  /* Tracking off — a blind angle, a paused camera — clears the guide. */
  useEffect(() => {
    if (trackingThisAngle) return;
    lastFace.current = null;
    missedFrames.current = 0;
    lastPose.current = null;
    faceFrameRef.current?.update(null);
    faceFrameRef.current?.setAligned(false);
    // The FaceFrame is unmounted by now, so the value it would have wound
    // down has to be put back by hand; otherwise the next angle's ring
    // opens at whatever the last head left it at.
    lockValue.set(0);
  }, [trackingThisAngle, lockValue]);

  /*
    The clock. Motion reaches the reducer from here rather than from an
    effect on `moving`/`steady`, because dispatching can set state and a
    synchronous state set in an effect body is a lint error; a timer
    callback is not an effect body. The cost is that motion is up to one
    tick late, which puts the countdown's arming between 1.2 s and 1.45 s
    of stillness and cancels it within 250 ms of the phone moving.
  */
  useEffect(() => {
    if (!TICKING.has(phase.kind)) return;
    /*
      Every phase is created believing the phone has not been still yet,
      so the record of what the reducer has been told is wound back to
      match it. Without this, a phone that was already reported steady
      when a blind angle opened — propped, or set down — never changes
      either flag, never sends a `motion` event, and the countdown that
      the copy promises "once you are still" can never arm.
    */
    lastMotion.current = { moving: false, steady: false };
    const id = setInterval(() => {
      const now = Date.now();
      const m = motionRef.current;

      // Whether there is an accelerometer at all is answered
      // asynchronously, well after the scan was created.
      const available = !m.unavailable;
      if (available !== scanRef.current.motionAvailable) {
        patchScan({ ...scanRef.current, motionAvailable: available });
      }

      if (m.moving !== lastMotion.current.moving || m.steady !== lastMotion.current.steady) {
        lastMotion.current = { moving: m.moving, steady: m.steady };
        dispatch({ type: 'motion', moving: m.moving, steady: m.steady, now });
      }
      dispatch({ type: 'tick', now });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase.kind, dispatch, patchScan]);

  /*
    The hold arc, as a shared value written by a timer.

    A hold is 600 ms and the ring has to show it filling; mirroring that
    into React state would be sixteen renders a second of a screen
    carrying a live camera. Written every 60 ms with a timing slightly
    longer than the gap, so the arc never stalls between writes — and the
    arc itself applies no easing, or the fill would run a quarter of a
    second behind the thing it is reporting.
  */
  const holdValue = useSharedValue(0);
  const lastHold = useRef(0);
  useEffect(() => {
    if (phase.kind !== 'tracked') {
      if (lastHold.current !== 0) {
        lastHold.current = 0;
        holdValue.set(reduceMotion ? 0 : withTiming(0, { duration: 120 }));
      }
      return;
    }
    const id = setInterval(() => {
      const next = holdProgress(scanRef.current, Date.now());
      if (next === lastHold.current) return;
      // A hold that broke falls back over a slightly longer beat, so the
      // arc reads as released rather than as a dropped frame.
      const broke = next === 0;
      lastHold.current = next;
      holdValue.set(
        reduceMotion
          ? next
          : withTiming(next, { duration: broke ? 120 : 80, easing: Easing.linear }),
      );
    }, HOLD_TICK_MS);
    return () => clearInterval(id);
  }, [phase.kind, holdValue, reduceMotion]);

  const onLanded = useCallback(() => dispatch({ type: 'landed', now: Date.now() }), [dispatch]);

  /** True while the guide has a head to follow. */
  const faceSeen =
    phase.kind === 'tracked' && phase.cue !== 'searching' && phase.cue !== 'manual';

  /**
   * The instruction fades out the moment the phone is disturbed, or the
   * moment a face arrives inside the ring — by then it has been read, and
   * what it is covering is the thing being framed.
   */
  const instructionFade = useSharedValue(1);
  useEffect(() => {
    const hide = moving || faceSeen;
    const to = hide ? 0 : 1;
    instructionFade.set(
      reduceMotion ? to : withTiming(to, { duration: hide ? 180 : 360 }),
    );
  }, [moving, faceSeen, reduceMotion, instructionFade]);

  const instructionStyle = useAnimatedStyle(() => ({
    opacity: instructionFade.get(),
  }));

  /* ---------------------------- analysing --------------------------- */

  /** The frames that exist, front first: the order they are read in. */
  const ordered = useMemo(() => {
    const taken = scan.order.filter((a) => scan.shots[a]);
    return [...taken.filter((a) => a === 'front'), ...taken.filter((a) => a !== 'front')];
  }, [scan]);

  const runAnalysing = useCallback(async () => {
    if (isSaving || ordered.length === 0) return;
    setIsSaving(true);

    const nitro = nitroAvailable();
    const units = nitro ? 3 : 2;
    dispatch({ type: 'analyse', total: ordered.length * units });

    const startedAt = Date.now();
    // Read before the session is added, or it is never the first one. On
    // an extend it is false by construction: the session being extended
    // is itself a session, so an extend always lands on its own detail.
    const isFirstSession = data.sessions.length === 0;
    let done = 0;

    /*
      One unit of work: the line goes up before the work starts, so it
      reads while the work runs, and stays for at least a beat so a fast
      phone does not flicker three labels past in one frame.
    */
    const floor = async <T,>(work: Promise<T>, label: string, a: Angle): Promise<T> => {
      done += 1;
      dispatch({ type: 'work', done, label, angle: a });
      const [value] = await Promise.all([work, sleep(UNIT_FLOOR_MS)]);
      return value;
    };

    try {
      const sessionKey = Date.now().toString(36);
      const stored: {
        photo: Omit<Photo, 'id' | 'sessionId'>;
        late: Promise<PhotoCoverage | undefined> | null;
      }[] = [];

      for (const a of ordered) {
        const shot = scan.shots[a];
        if (!shot) continue;
        const label = ANGLE_LABELS[a];

        const file = await floor(
          persistCapture(shot.uri, sessionKey, a),
          SCAN_COPY.analysing.unit.write(label),
          a,
        );

        /*
          Measured now, while the file is untouched, and stored with the
          photograph rather than recomputed when the report opens. A
          reading taken months later would be of a file that storage may
          since have recompressed — a different photograph, quietly.
        */
        const analysis = await floor(
          analysePhoto(file.uri).catch(() => null),
          SCAN_COPY.analysing.unit.quality(label),
          a,
        );

        let coverage: PhotoCoverage | undefined;
        let late: Promise<PhotoCoverage | undefined> | null = null;
        if (nitro) {
          const running = coverageByUri.current.get(shot.uri) ?? Promise.resolve(undefined);
          const reading = await floor(
            withinTime<PhotoCoverage | undefined | typeof STILL_RUNNING>(
              running,
              COVERAGE_WAIT_MS,
              STILL_RUNNING,
            ),
            SCAN_COPY.analysing.unit.area(label),
            a,
          );
          coverage = reading === STILL_RUNNING ? undefined : reading;
          // Only a reading that outran the wait is worth following up;
          // one that finished without a result has nothing more to say.
          late = reading === STILL_RUNNING ? running : null;
        }

        stored.push({
          photo: {
            angle: a,
            uri: file.uri,
            thumbnailUri: file.thumbnailUri,
            width: file.width,
            height: file.height,
            capturedAt: new Date().toISOString(),
            quality: analysis ? { ...analysis.quality } : undefined,
            coverage,
            pose: shot.pose,
            capture: captureModeByAngle.current.get(a),
          },
          late,
        });
      }

      // The ring reached one when the last write finished; this is so the
      // person can see that it did, not so the bar can be padded.
      await minimumElapsed(startedAt, ANALYSING_MIN_MS);

      const photos = stored.map((s) => s.photo);
      const session = extending ? extendSession(extending.id, photos) : addSession(photos);

      /*
        A reading still running at the save is not lost. It lands on its
        photograph when it finishes — through the store, because this
        screen is usually gone by then.
      */
      if (session) {
        for (const { photo, late } of stored) {
          const saved = session.photos.find((p) => p.uri === photo.uri);
          if (!late || !saved) continue;
          late.then(
            (reading) => {
              if (reading) patchPhoto(session.id, saved.id, { coverage: reading });
            },
            () => undefined,
          );
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
      AccessibilityInfo.announceForAccessibility(SCAN_COPY.analysing.done(photos.length));
      dispatch({ type: 'saved' });

      /*
        The very first set goes to the report rather than to the session
        view, and so does every single scan. It is the moment somebody has
        just produced a photograph and does not yet know what the app will
        do with it. Everything else — every extend included — goes to the
        session it belongs to.
      */
      if (session && (isFirstSession || singleMode)) {
        router.replace('/scan-report');
      } else if (session) {
        router.replace(`/session/${session.id}`);
      } else {
        router.replace('/');
      }
    } catch {
      setIsSaving(false);
      dispatch({ type: 'saveFailed' });
      Alert.alert(
        "Couldn't save your update",
        'Your photos were taken but could not be written to this device. Check your available storage and try again.',
      );
    }
  }, [
    isSaving,
    ordered,
    scan,
    dispatch,
    data.sessions.length,
    extending,
    addSession,
    extendSession,
    patchPhoto,
    router,
    singleMode,
  ]);

  const confirmExit = useCallback(() => {
    if (shotCount === 0) {
      leave();
      return;
    }

    // The camera stops while the confirmation is up. A system alert
    // presented over a running capture session has to wait for it, which
    // is what made "are you sure" arrive seconds after the tap.
    setConfirming(true);
    Alert.alert(
      'Discard this update?',
      'The photos you have taken so far will not be saved.',
      [
        { text: 'Keep capturing', style: 'cancel', onPress: () => setConfirming(false) },
        { text: 'Discard', style: 'destructive', onPress: leave },
      ],
      { onDismiss: () => setConfirming(false) },
    );
  }, [shotCount, leave]);

  /* --------------------------- permissions -------------------------- */

  if (!permission) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <PermissionGate
        canAskAgain={permission.canAskAgain}
        onRequest={requestPermission}
        onCancel={leave}
      />
    );
  }

  /* ---------------------------- analysing --------------------------- */

  if (phase.kind === 'analysing') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}>
        <ScanAnalysing
          title={SCAN_COPY.analysing.title}
          frames={ordered.map((a) => ({
            angle: a,
            uri: scan.shots[a]!.uri,
            label: ANGLE_LABELS[a],
          }))}
          done={phase.done}
          total={phase.total}
          label={phase.label}
          currentAngle={phase.angle}
          segmenter={nitroAvailable()}
          noSegmenterLine={SCAN_COPY.analysing.noSegmenter}
          doneLine={
            phase.done >= phase.total ? SCAN_COPY.analysing.done(ordered.length) : null
          }
        />
      </View>
    );
  }

  // The photographs are saved and the route has been replaced; this is
  // the single frame in between, on the app's own ground rather than on
  // a camera that is no longer running.
  if (phase.kind === 'saved') {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  /* ----------------------------- review ----------------------------- */

  if (phase.kind === 'review') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
          paddingHorizontal: spacing.lg,
        }}>
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(320)}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <Text variant="title2" accessibilityRole="header" style={{ flex: 1 }}>
            {isBaseline || extending ? 'That’s your baseline' : 'Your update'}
          </Text>
          <PressableScale
            hitSlop={8}
            onPress={confirmExit}
            accessibilityRole="button"
            accessibilityLabel="Close capture"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.fill,
            }}>
            <Icon name="close" size={15} color={colors.text} />
          </PressableScale>
        </Animated.View>

        <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.sm }}>
          {/* Photographing your own head five ways, feeling self-conscious
              about it, is the hard part of this product. Saying so once —
              on the first set only — costs a line and is true. */}
          {isBaseline || extending ? `${BASELINE_THANKS} ` : ''}
          {SCAN_COPY.review.title(shotCount)}
        </Text>

        {/* The set as it stands, in capture order. A skipped angle keeps
            its place rather than being left out of the row. */}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.md }}>
            {scan.order.map((a) => {
              const shot = scan.shots[a];
              return (
                <PressableScale
                  key={a}
                  onPress={() => dispatch({ type: 'retake', angle: a, now: Date.now() })}
                  scaleTo={0.97}
                  accessibilityRole="button"
                  accessibilityLabel={
                    shot
                      ? `${ANGLE_LABELS[a]}, captured. Tap to retake.`
                      : `${ANGLE_LABELS[a]}, skipped. Tap to take it.`
                  }
                  style={{ width: 112 }}>
                  {shot ? (
                    <Image
                      source={{ uri: shot.uri }}
                      style={{ width: 112, height: 148, borderRadius: radius.md }}
                      contentFit="cover"
                      accessible={false}
                    />
                  ) : (
                    <View
                      style={{
                        width: 112,
                        height: 148,
                        borderRadius: radius.md,
                        backgroundColor: colors.fill,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Icon name="camera" size={20} color={colors.textTertiary} />
                    </View>
                  )}
                  <Text
                    variant="caption"
                    color={shot ? 'text' : 'textSecondary'}
                    center
                    style={{ marginTop: spacing.xs }}>
                    {ANGLE_LABELS[a]}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Button
            label={shotCount === 1 ? SCAN_COPY.review.ctaOne : SCAN_COPY.review.cta}
            onPress={runAnalysing}
            loading={isSaving}
            disabled={shotCount === 0}
          />
          <Button label="Discard" variant="ghost" size="md" onPress={confirmExit} />
        </View>
      </View>
    );
  }

  /* ---------------------------- camera ------------------------------ */

  const previous = previousPhotoForAngle(data.sessions, angle, extending?.id);
  const blindAngle = angle === 'top' || angle === 'crown';
  /* The hands-free switch, and with it the shape of the top bar. */
  const handsFreeSwitch = !manualMode && phase.kind === 'blind';
  /* A blind angle that will count itself down once the phone is still. */
  const handsFreeHere =
    phase.kind === 'blind' && scan.handsFree && scan.motionAvailable && blindAngle;
  const armedSoon = handsFreeHere && !phase.counting;

  const inRing =
    handsFreeHere && blindAngle ? SCAN_COPY.blind.instruction[angle] : guidance.instruction;

  const overline = singleMode
    ? ANGLE_LABELS[angle]
    : `Angle ${scan.index + 1} of ${scan.order.length} · ${ANGLE_LABELS[angle]}`;
  // Only the tracked cue. While a blind angle counts down, the line that
  // says the shutter stops it sits under the digits — where the eye
  // already is — and the same sentence in two places at once is not the
  // same sentence said louder.
  const headline = phase.kind === 'tracked' ? SCAN_COPY.cue[phase.cue] : '';
  // The hint is for somebody who has been holding a pose and getting
  // nowhere. On a build with no detector the cue above already is the
  // shutter instruction, and saying it twice is not saying it louder.
  const footnote =
    phase.kind === 'tracked' && phase.manualHint && phase.cue !== 'manual'
      ? SCAN_COPY.manualHint
      : null;
  const skipLabel =
    phase.kind === 'blind' && !phase.counting
      ? angle === 'crown'
        ? SCAN_COPY.blind.skipCrown
        : SCAN_COPY.blind.skipTop
      : null;

  /*
    What is on the pile, which is not the same as what has been taken.
    The reducer records a shot the instant the shutter resolves, and the
    frame then spends two thirds of a second flying down to the pile; a
    thumbnail put there at the shutter would have the full-screen frame
    landing on a copy of itself that arrived first, under a count that
    had already ticked over.
  */
  const landedAngles = scan.order.filter(
    (a) => scan.shots[a] && !(phase.kind === 'flying' && phase.angle === a && !phase.landed),
  );
  const stackShots = landedAngles.map((a) => ({
    angle: a,
    uri: scan.shots[a]!.uri,
    label: ANGLE_LABELS[a],
  }));
  /*
    Where the frame in flight is headed: past the frames that come before
    its angle in the capture order, so a retake flies back to the slot
    that angle already holds rather than to the top of the pile.
  */
  const flyingIndex =
    phase.kind === 'flying'
      ? landedAngles.filter((a) => scan.order.indexOf(a) < scan.order.indexOf(phase.angle))
          .length
      : 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <TrackedCamera
        ref={cameraRef}
        active={!confirming}
        onFace={onFace}
        onTrackingChanged={onTrackingChanged}
        sampleSource={guidance.example}
      />

      {/*
        The dimming, down here on the camera itself. Above the ghost it
        would veil the one thing the ghost is for — lining this shot up
        against last month's — and above the flash it would punch a bright
        disc through it at the moment of capture.
      */}
      {trackingThisAngle ? <RingScrim target={target} lock={lockValue} /> : null}

      <GhostOverlay
        uri={previous?.thumbnailUri ?? previous?.uri ?? null}
        visible={ghostOn && previous !== null}
        label={SCAN_COPY.ghost.label(
          previous ? formatDateShort(previous.capturedAt) : '',
        )}
        topInset={insets.top + 64}
      />

      {/* Shutter flash */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#fff',
          },
          flashStyle,
        ]}
      />

      {/*
        The target: one ring, with the head going inside it. What used to
        be a second shape following the face is now the ring's own
        response — the world outside it dims, its edge warms and thickens
        — so there is nothing on screen to line up against and nothing to
        work out.
      */}
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
        {trackingThisAngle ? (
          <FaceFrame
            ref={faceFrameRef}
            target={target}
            ringStroke={RING_STROKE}
            lock={lockValue}
            hold={holdValue}
          />
        ) : null}

        <View
          style={{
            position: 'absolute',
            top: guideTop,
            left: 0,
            right: 0,
            alignItems: 'center',
          }}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <CaptureRing
              size={RING}
              stroke={RING_STROKE}
              total={scan.order.length}
              done={shotCount}
              current={scan.index}
              hold={phase.kind === 'tracked' ? holdValue : null}
              lock={trackingThisAngle ? lockValue : null}
              pulse={armedSoon}
              countdownProgress={countdown === null ? null : countdown.left / countdown.from}
            />

            {/*
              The instruction sits where the face goes, and leaves the
              moment the phone is picked up — by then it has been read,
              and what it is covering is the thing being framed.
            */}
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  // Held inside the ring rather than laid across it.
                  // A line of text running out past the circle on both
                  // sides reads as something that overflowed, and the
                  // ring stops looking like it contains anything.
                  width: RING * 0.72,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                instructionStyle,
              ]}>
              {/* On a scrim, because this is white text over whatever the
                  camera is pointed at — a sunlit face included. */}
              <View
                style={{
                  alignSelf: 'center',
                  backgroundColor: colors.photoScrim,
                  borderRadius: radius.pill,
                  paddingVertical: spacing.xs + 1,
                  paddingHorizontal: spacing.md,
                }}>
                <Text variant="headline" center color="textOnPhoto">
                  {inRing}
                </Text>
              </View>
            </Animated.View>
          </View>
        </View>
      </View>

      {/* Countdown */}
      {countdown !== null ? (
        <View
          pointerEvents="none"
          // Centred on the guide, where the user's eyes already are.
          style={{
            position: 'absolute',
            top: guideTop,
            height: guideWidth * 1.32,
            left: 0,
            right: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Animated.Text
            key={countdown.left}
            entering={reduceMotion ? undefined : ZoomIn.duration(260)}
            accessible={false}
            style={{
              color: '#fff',
              fontSize: 120,
              lineHeight: 132,
              fontWeight: '700',
              fontVariant: ['tabular-nums'],
              textShadowColor: 'rgba(0,0,0,0.35)',
              textShadowRadius: 14,
            }}>
            {countdown.left}
          </Animated.Text>
          <Text variant="subhead" style={{ color: '#fff', opacity: 0.85, marginTop: spacing.sm }}>
            {SCAN_COPY.blind.cancel}
          </Text>
        </View>
      ) : null}

      {/* The photograph that was just taken, on its way to the pile. */}
      {phase.kind === 'flying' ? (
        <FlyingFrame
          key={phase.uri}
          uri={phase.uri}
          index={flyingIndex}
          slot={slot}
          onLanded={onLanded}
        />
      ) : null}

      <FrameStack
        shots={stackShots}
        count={SCAN_COPY.stackCount(landedAngles.length, scan.order.length)}
        slot={slot}
      />

      {/* Top bar */}
      <GlassGroup
        spacing={10}
        style={{
          position: 'absolute',
          top: insets.top + spacing.sm,
          left: spacing.lg,
          right: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}>
        <PressableScale
          hitSlop={2}
          onPress={confirmExit}
          accessibilityRole="button"
          accessibilityLabel="Close capture"
          style={{ borderRadius: 20, overflow: 'hidden' }}>
          <GlassSurface
            borderRadius={20}
            variant="clear"
            over="dark"
            style={{
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name="close" size={18} color="#fff" />
          </GlassSurface>
        </PressableScale>

        {/* One segment per angle. A single scan has nothing to count. */}
        <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
          {scan.order.length > 1
            ? scan.order.map((a) => (
                <View
                  key={a}
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: scan.shots[a] ? colors.accent : 'rgba(255,255,255,0.32)',
                  }}
                />
              ))
            : null}
        </View>

        {/* Last time's frame, to line this one up against — on the angles
            you can see the screen for. On the top and the back the phone
            is pointed away, so the widest pill on the bar would be a
            switch for something nobody can look at, on exactly the two
            angles where the bar is tightest. */}
        {previous && !blindAngle ? (
          <BarPill
            icon="photo"
            label={SCAN_COPY.ghost.toggle}
            active={ghostOn}
            hint={SCAN_COPY.ghost.hint}
            onPress={() => setGhostOn((on) => !on)}
          />
        ) : null}

        {/* Hands-free, where it applies: the angles you cannot reach the
            screen for. Off is a real answer, and the shutter stays. Not
            in manual mode, where the countdown is forced off for the
            whole session and the switch would be a control that moves
            nothing while rewriting the preference behind the person. */}
        {handsFreeSwitch ? (
          <BarPill
            icon="clock"
            label="Hands-free"
            // The pill has room for two words; the spoken name has room
            // to say which angles it is for.
            accessibilityLabel={SCAN_COPY.handsFree.label}
            active={scan.handsFree}
            hint={SCAN_COPY.handsFree.hint}
            onPress={() => {
              const next = !scanRef.current.handsFree;
              saveHandsFree(next);
              patchScan({ ...scanRef.current, handsFree: next });
            }}
          />
        ) : null}

        {/*
          The timer, as two taps rather than a cycle. It was one pill you
          pressed repeatedly to walk Off → 3 → 5, which means finding the
          setting you want by overshooting it; both are on the bar now,
          and pressing the lit one puts it back to off.

          Both stand down only while hands-free is actually counting this
          angle down for you: that is the one place the delay is already
          being run, and four pills plus the close control do not fit a
          375-point bar. Switch hands-free off and they come straight
          back, because turning off the automatic countdown must not also
          take away the one you set yourself — on the angle where you can
          least afford to be without it.
        */}
        {handsFreeSwitch && scan.handsFree
          ? null
          : CAPTURE_TIMERS.filter((seconds) => seconds > 0).map((seconds) => {
              const active = timer === seconds;
              return (
                <BarPill
                  key={seconds}
                  icon="clock"
                  label={`${seconds}s`}
                  active={active}
                  disabled={countdown !== null}
                  accessibilityLabel={`${seconds} second self-timer`}
                  hint={active ? 'Turns the self-timer off' : 'Counts down before the shot'}
                  onPress={() => chooseTimer(active ? 0 : seconds)}
                />
              );
            })}
      </GlassGroup>

      {/* The cue card: low in the frame, in the clear space between the
          head outline and the shutter, and lifted clear of the pile once
          there is one. */}
      <Animated.View
        key={angle}
        entering={FadeIn.duration(250)}
        style={{
          position: 'absolute',
          left: spacing.lg,
          right: spacing.lg,
          bottom:
            insets.bottom +
            spacing.xl +
            SHUTTER_SIZE +
            spacing.lg +
            (shotCount > 0 ? SLOT_H + spacing.md : 0),
        }}>
        <GlassSurface
          variant="regular"
          over="dark"
          style={{
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.lg,
            alignItems: 'center',
            gap: spacing.xxs,
          }}>
          {/*
            The spoken cue is one utterance, so the three lines are read
            together rather than one focus stop at a time — but only the
            three lines. VoiceOver collapses an `accessible` container
            into a single element, and the skip control is a sibling of
            this one precisely so it keeps its own stop: on the angles it
            appears for, it is the only way past an angle somebody cannot
            shoot.
          */}
          <View
            accessible
            // TalkBack reads a changed cue where it happens rather than
            // waiting for a focus move; iOS ignores the live region and
            // takes the rationed announcements instead.
            accessibilityLiveRegion="polite"
            accessibilityLabel={[overline, headline, footnote].filter(Boolean).join('. ')}
            style={{ alignSelf: 'stretch', alignItems: 'center', gap: spacing.xxs }}>
            {/* Which angle, and nothing else. The instruction itself sits
                inside the ring, where the framing is happening. */}
            <Text variant="overline" style={{ color: '#fff', opacity: 0.7 }}>
              {overline}
            </Text>

            {/*
              What the camera can see, in one line. It says where the head
              is — closer, centred, still — and never what is on it. The
              line turns sage when the pose is being held, so the eye reads
              one state rather than two.
            */}
            {headline ? (
              <Text
                variant="headline"
                center
                style={{
                  color:
                    phase.kind === 'tracked' && phase.cue === 'hold' ? colors.accent : '#fff',
                }}>
                {headline}
              </Text>
            ) : null}

            {footnote ? (
              <Text variant="footnote" center style={{ color: '#fff', opacity: 0.7 }}>
                {footnote}
              </Text>
            ) : null}
          </View>

          {skipLabel ? (
            <Pressable
              accessible
              accessibilityRole="button"
              accessibilityLabel={skipLabel}
              hitSlop={8}
              onPress={() => dispatch({ type: 'skip', now: Date.now() })}>
              <Text variant="footnote" center style={{ color: '#fff', opacity: 0.7 }}>
                {skipLabel}
              </Text>
            </Pressable>
          ) : null}
        </GlassSurface>
      </Animated.View>

      {/* The shutter, which never leaves: it is the override on every
          angle and the whole of the way in on a build with no detector. */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + spacing.xl,
          left: spacing.lg,
          right: spacing.lg,
          alignItems: 'center',
        }}>
        <Animated.View style={shutterStyle}>
          <PressableScale
            onPress={onShutter}
            haptic="none"
            // Only while a frame is actually being taken. A countdown is
            // also `capturing`, and there the shutter is the cancel.
            disabled={phase.kind === 'capturing' && countdown === null}
            scaleTo={1}
            accessibilityRole="button"
            accessibilityLabel={
              countdown !== null
                ? 'Cancel countdown'
                : phase.kind === 'tracked' && phase.cue === 'hold'
                  ? 'Take the photo myself'
                  : `Capture ${ANGLE_LABELS[angle]}`
            }
            style={{
              width: SHUTTER_SIZE,
              height: SHUTTER_SIZE,
              borderRadius: SHUTTER_SIZE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 4,
              borderColor: 'rgba(255,255,255,0.9)',
            }}>
            {/* During a countdown the shutter becomes a stop control. */}
            <View
              style={
                countdown !== null
                  ? { width: 26, height: 26, borderRadius: 6, backgroundColor: colors.danger }
                  : {
                      width: 60,
                      height: 60,
                      borderRadius: 30,
                      backgroundColor:
                        phase.kind === 'capturing' ? colors.accent : '#fff',
                    }
              }
            />
          </PressableScale>
        </Animated.View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One control on the camera's top bar.
 *
 * Three of them — the ghost, hands-free and the self-timer — are the same
 * object with a different word in it: a switch that reads lit when it is
 * on. Written once so they cannot drift apart, and so the bar stays a
 * single `GlassGroup` with no glass nested inside glass.
 */
function BarPill({
  icon,
  label,
  active,
  hint,
  disabled,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  hint: string;
  disabled?: boolean;
  /** When the spoken name is not the word on the pill. */
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();
  // White on a live camera, sage when it is on: the one pair that reads
  // on a bright window and in a dark bathroom alike.
  const tint = active ? colors.accent : '#fff';

  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      style={{ borderRadius: 20, overflow: 'hidden' }}>
      <GlassSurface
        borderRadius={20}
        variant="clear"
        over="dark"
        style={{
          height: 40,
          paddingHorizontal: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
        }}>
        <Icon name={icon} size={15} color={tint} />
        <Text variant="subhead" style={{ color: tint }}>
          {label}
        </Text>
      </GlassSurface>
    </PressableScale>
  );
}

/* ------------------------------------------------------------------ */

function PermissionGate({
  canAskAgain,
  onRequest,
  onCancel,
}: {
  canAskAgain: boolean;
  onRequest: () => void;
  onCancel: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
        paddingBottom: insets.bottom + spacing.lg,
        paddingHorizontal: spacing.xl,
        justifyContent: 'center',
      }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.lg,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xl,
        }}>
        <Icon name="camera" size={28} color={colors.accent} />
      </View>

      <Text variant="title2" accessibilityRole="header">
        Camera access needed
      </Text>
      <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.md }}>
        {canAskAgain
          ? 'Tress needs the camera to take your photos. They are saved to this device only — nothing is uploaded.'
          : 'Camera access is currently turned off. You can turn it back on for Tress in your device Settings, under Privacy.'}
      </Text>

      <View style={{ marginTop: spacing.xxl, gap: spacing.sm }}>
        {canAskAgain ? (
          <Button label="Allow Camera" icon="camera" onPress={onRequest} />
        ) : null}
        <Button label="Not now" variant="ghost" size="md" onPress={onCancel} />
      </View>
    </View>
  );
}
