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
  SWEEP_SEGMENTS,
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
  type PhotoMaskTrace,
  type PhotoSession,
} from '@/types/domain';

const SHUTTER_SIZE = 78;

/**
 * A small display-only frame the camera handed back before the
 * photograph itself was through the pipeline.
 *
 * It is never the photograph. Nothing stores it, measures it, or puts it
 * beside last month — it exists so the frame can leave for the pile at
 * the moment the shutter is felt rather than half a second later, and
 * the file behind it is deleted the moment it stops being shown.
 */
type EarlyFrame = { angle: Angle; uri: string; release: () => void };

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
    state.sweep ? sweepKey(state.sweep) : '',
  ].join('|');
}

/**
 * The turn, reduced to what is drawn in React rather than in a shared
 * value.
 *
 * Everything that moves at camera rate — the dwell in each arc, the
 * cursor, the ring's answer to the head — is deliberately absent: those
 * are written straight to the UI thread and a re-render of a screen
 * carrying a live camera thirty times a second is not a price worth
 * paying to move an arc. What is here is the handful of facts that change
 * the words on screen or the shape of a control.
 */
function sweepKey(sweep: SweepState): string {
  return [
    sweep.step,
    sweep.cue,
    sweep.finished,
    sweep.manualHint,
    sweep.forcedOffer,
    ringClosed(sweep.segments),
    sweep.wells.front.status,
    sweep.wells.templeA.status,
    sweep.wells.templeB.status,
  ].join(',');
}

/** The turn's own vocabulary, or the walk's where it borrows one. */
function sweepCueText(cue: SweepCue): string {
  return cue in SCAN_COPY.sweep.cue
    ? SCAN_COPY.sweep.cue[cue as keyof typeof SCAN_COPY.sweep.cue]
    : SCAN_COPY.cue[cue as keyof typeof SCAN_COPY.cue];
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * What one frame measured: the figures, and the outline they came from.
 *
 * The outline travels with the figures rather than behind them because
 * they are the same reading — one is the number and the other is the
 * shape it was counted over, and a photograph carrying one without the
 * other would be a drawing nobody could check or a figure nobody could
 * see. Either half can be absent; both are optional on the record.
 */
type FrameReading = {
  coverage: PhotoCoverage;
  maskTrace?: PhotoMaskTrace;
};

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
async function measureCoverageSafely(uri: string): Promise<FrameReading | undefined> {
  // The segmenter runs on Nitro. Without it the import itself would be
  // reported as a fatal error rather than thrown here — see `nitroAvailable`.
  if (!nitroAvailable()) return undefined;
  try {
    const { measureCoverage } = await import('@/features/assessment/hair-segmenter');
    const reading = await measureCoverage(uri);
    if (!reading) return undefined;
    const { coverage } = reading;
    return {
      coverage: {
        fraction: coverage.fraction,
        upperFraction: coverage.upperFraction,
        verticalBalance: coverage.verticalBalance,
        horizontalBalance: coverage.horizontalBalance,
        pixels: coverage.pixels,
      },
      /*
        Kept whole, including the case where the mask shattered and the
        outline came back empty. An empty outline with its squares still
        in it is a photograph that was measured and could not be drawn
        as one shape; no field at all is a photograph from before any of
        this existed. A reader that cannot tell those apart has to
        explain the second to somebody it happened to the first way.
      */
      maskTrace: reading.maskTrace,
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
    Five ways in. The intro opens the full session at a chosen angle, and
    the reducer rotates the order so that angle is first and the rest
    follow, wrapping round. The funnel opens a single scan: one
    photograph, from the front, and straight to the report. Home's
    baseline card opens the rest of that scan: only the angles the
    baseline lacks, saved into the baseline rather than beside it.
    `manual=1` — the intro's "Can't turn your head?" link — forces the
    shutter to be the only way the camera fires, whatever the build can do.

    And `mode` is what the centre button's chooser asks for: `sweep` for
    one continuous turn, `walk` for the same angles one at a time.
    Anything else, including nothing at all, is the walk — every route
    that existed before the chooser did lands here without the parameter
    and gets exactly the screen it always got.
  */
  const { start, single, extend, manual, mode } = useLocalSearchParams<{
    start?: string;
    single?: string;
    extend?: string;
    manual?: string;
    mode?: string;
  }>();
  const singleMode = single === '1';
  const manualMode = manual === '1';
  /*
    Asked for, which is not the same as available. A turn needs a build
    that reports faces and a person who is not reading the screen through
    a screen reader, and neither is known on the first frame; both are
    answered later, through `syncMode`.
  */
  const sweepAsked = mode === 'sweep' && !singleMode && !manualMode;
  /*
    Which of the two doors this came through, and so what the person is
    left holding at the end.

    The chooser sends a `mode` on both of its scan routes and none at all
    on the record route, which makes the parameter's presence the signal
    rather than its value — a turn and a one-at-a-time scan are two ways
    through the same door and both end in a reading, while a set of
    photographs ends in the session it belongs to, beside last month's.
    Every route that predates the chooser sends no `mode`, and every one
    of them was a record route.
  */
  const forReading = mode === 'sweep' || mode === 'walk';

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

  /* ------------------------------ mode ------------------------------ */

  /** Whether a screen reader is running. Null until the platform answers. */
  const screenReader = useRef<boolean | null>(null);

  /**
   * Chooses between the turn and the walk, from what is now known.
   *
   * It is called from callbacks rather than from an effect body on
   * purpose — dispatching sets state, and a synchronous state set in an
   * effect body is a lint error — and it is idempotent, so calling it
   * again when nothing has changed costs one comparison. The reducer
   * refuses the change once a photograph exists; this refuses it too,
   * so the intent is stated in both places rather than relied on in one.
   */
  const syncMode = useCallback(() => {
    const state = scanRef.current;
    if (Object.keys(state.shots).length > 0) return;
    /*
      A continuous turn is a visual gesture with no honest non-visual
      analogue, so with a screen reader running the walk is the default —
      one finite, announced target at a time. It is a default and not a
      lock: the chooser offers the walk to everybody at equal prominence,
      and this is the same answer arrived at without anybody being asked.
    */
    const want = sweepAsked && screenReader.current === false && state.tracking;
    const next = want ? 'sweep' : 'walk';
    if (next === state.mode) return;
    dispatch({ type: 'mode', mode: next, now: Date.now() });
  }, [sweepAsked, dispatch]);

  useEffect(() => {
    let alive = true;
    const answer = (on: boolean) => {
      if (!alive) return;
      screenReader.current = on;
      syncMode();
    };
    // A platform that cannot answer is read as no screen reader rather
    // than left unknown, or the turn would never be offered on it.
    AccessibilityInfo.isScreenReaderEnabled().then(answer, () => answer(false));
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', answer);
    return () => {
      alive = false;
      sub.remove();
    };
  }, [syncMode]);

  /**
   * Coverage readings in flight, by the frame they were taken from. The
   * measurement starts the moment a frame is shrunk, so by the time the
   * set is analysed it is usually already done; a retake simply leaves
   * its entry behind to be ignored.
   */
  const coverageByUri = useRef(new Map<string, Promise<FrameReading | undefined>>());
  /** How the shutter fired for each angle, kept for the saved record. */
  const captureModeByAngle = useRef(new Map<Angle, Photo['capture']>());
  /**
   * The head's angles at the last face event.
   *
   * A fallback only. The pose a photograph is recorded with travels on
   * the capture effect, because the reducer knows the frame it decided
   * on and this ref does not: it is frozen for the length of a capture
   * only because `onFace` returns before writing it while the phase is
   * `capturing`, and a screen that widened that guard by a word would
   * start recording where the head ended up instead of where the
   * photograph was taken, with nothing to catch it.
   */
  const lastPose = useRef<Pose | null>(null);
  /** When a face was last actually seen, so a blind angle knows it is alone. */
  const lastFaceSeenAt = useRef<number | null>(null);
  /** True while a shutter tap is being reduced, so the record says so. */
  const viaShutter = useRef(false);
  /** The last segment tick, so eight of them over ten seconds stay texture. */
  const lastSegmentHaptic = useRef(0);

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

  /**
   * The frame currently on its way to the pile, when it is one the camera
   * handed over early.
   *
   * Held here rather than read off the phase because it exists before the
   * phase does: the point of it is that the flight starts at the shutter
   * rather than when the file lands. `release` is the camera's own, and
   * it is called when this is replaced or the screen closes — the file is
   * ours, not the person's photograph, and three of them a turn left
   * behind would be a slow leak with nobody's name on it.
   */
  const [flight, setFlight] = useState<EarlyFrame | null>(null);
  const flightRef = useRef<EarlyFrame | null>(null);

  /**
   * Shows one early frame, and lets go of whatever was being shown.
   *
   * The letting go is done here rather than in an effect's cleanup
   * because it deletes a file: a cleanup that ran for any reason other
   * than the frame being replaced would delete one that is still on
   * screen, and the flight would finish on a missing image.
   */
  const showFlight = useCallback((next: EarlyFrame | null) => {
    const previous = flightRef.current;
    if (previous === next) return;
    flightRef.current = next;
    previous?.release();
    setFlight(next);
  }, []);

  // Whatever is still in hand when the screen closes. The camera would
  // sweep it up on its own unmount; saying so here as well costs nothing
  // and means the file's owner is the code that was showing it.
  useEffect(
    () => () => {
      flightRef.current?.release();
      flightRef.current = null;
    },
    [],
  );

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));
  const shutterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterScale.get() }],
  }));

  const startCapture = useCallback(
    async (target: Angle, via: NonNullable<Photo['capture']>, decided?: Pose) => {
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

      /*
        The pose the reducer decided on, carried through the await as a
        local. The ref behind it is the fallback for the one caller that
        has none — a blind angle, where there is no face and no pose to
        record either way.
      */
      const pose = decided ?? lastPose.current ?? undefined;

      /*
        Whatever the last shutter left behind goes now, before this one
        can hand back a frame of its own. A retake that reached the same
        angle would otherwise fly the previous photograph's stand-in down
        the screen, and the temporary file behind it would be released
        only when something else replaced it.
      */
      showFlight(null);

      try {
        const photo = await cameraRef.current.takePhoto({
          /*
            Some devices can hand back a small display-ready frame before
            the photograph itself is through the pipeline. Where they do,
            the frame leaves for the pile at the moment the shutter is
            felt rather than half a second later. It is never the
            photograph: nothing stores it, measures it or compares it.
          */
          onPreview: (frame) => {
            const phase = scanRef.current.phase;
            if (phase.kind !== 'capturing' || phase.angle !== target) {
              frame.release();
              return;
            }
            showFlight({ angle: target, uri: frame.previewUri, release: frame.release });
          },
        });
        // Down to storage size before it touches state: what flies into
        // the pile and is reviewed is then the size it will be saved at,
        // not a full-resolution frame waiting to be resized later.
        const small = await shrinkCapture(photo.uri);

        /*
          The hair mask starts now, while the person is moving on to the
          next angle. It is the slowest thing the app does to a
          photograph, and this is the one moment where nobody is waiting
          on it.

          ── THE ALIGNMENT INVARIANT ────────────────────────────────────
          It is measured on `small`, not on `photo.uri`, and that is not
          an accident of ordering. `shrinkCapture` resizes by width only
          and crops nothing, and the file that is persisted is a re-render
          of this same frame at this same width — so the mask, the stored
          photograph and the outline drawn over it all share one framing,
          and a point in the mask maps onto the photograph by a scale on
          each axis with no crop and no offset.

          Measuring the raw camera frame here would look like a saving
          and would break every overlay alignment silently: the figures
          would still be plausible, the outline would sit off the head,
          no error would be thrown and no test that only reads numbers
          would fail. If this line ever has to move, the drawing has to
          learn the crop first. The other half of this invariant is in
          hair-segmenter's `inputTensor`, where the square resize is.
        */
        coverageByUri.current.set(small.uri, measureCoverageSafely(small.uri));
        // A frame from the simulator's stand-in camera is recorded as
        // one, so the record says what the pixels already show.
        captureModeByAngle.current.set(target, sampleCameraActive() ? 'sample' : via);
        dispatch({ type: 'shot', uri: small.uri, pose, now: Date.now() });

        /*
          A turn photographs a moving head, so it re-reads its own frame
          for sharpness at a width where the answer means something —
          the report's own note is taken at 64 pixels and is advice
          rather than a gate. Paid during the cooldown, while the person
          is already turning away, and never awaited: a measurement that
          fails says nothing, and an angle is never lost over a number
          that was never taken.
        */
        const sweeping = scanRef.current.sweep;
        if (sweeping && !sweeping.finished) {
          sharpnessAt(small.uri, SHARPNESS_WIDTH).then(
            (sharpness) => {
              if (isSoft(sharpness)) {
                dispatch({ type: 'shotSoft', angle: target, now: Date.now() });
              }
            },
            () => undefined,
          );
        }
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
    [reduceMotion, flash, shutterScale, dispatch, showFlight],
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
    (seconds: number, target: Angle, pose?: Pose) => {
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
          startCapture(target, 'timer', pose);
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
        /*
          Somebody's own self-timer sits in front of their own tap, at
          every angle: it is the thing they set it for. Not inside a
          turn, where its two controls are off the bar — a hidden setting
          that still fires three seconds after the tap is a control
          acting from somewhere nobody can see it — and where the shutter
          is the override on a gesture that is already running.
        */
        const held = scanRef.current.sweep;
        const inTurn = held !== null && !held.finished;
        if (byHand && timer > 0 && !inTurn) {
          runCountdown(timer, effect.angle, effect.pose);
          return;
        }
        startCapture(effect.angle, byHand ? 'manual' : 'guided', effect.pose);
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
        else if (effect.kind === 'segment') {
          /*
            One tick per slice of the turn, and rationed: eight of them
            over ten seconds should read as texture under the thumb, not
            as a rattle. Dropped rather than queued — a tick that arrives
            after the slice it was about is worse than no tick.
          */
          const now = Date.now();
          if (now - lastSegmentHaptic.current < SEGMENT_HAPTIC_MS) return;
          lastSegmentHaptic.current = now;
          Haptics.selectionAsync().catch(() => undefined);
        } else if (effect.kind === 'captured')
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
    The turn's three live values, all written on the JS side at camera
    rate and read on the UI thread, so a turn costs no re-renders.

    `sweepFills` is the time held in each of the eight slices, already
    lagged: the lag belongs in the writer and not in an animation,
    because the value arrives eased and easing it twice puts the arc
    behind the head it is reporting. `sweepCursor` is where the head is
    on the ring, signed and never wrapped. `sweepLock` is how close this
    is to a usable frame — the ring's own answer to the head, which says
    nothing about the hair.
  */
  const sweepFills = useSharedValue<number[]>(Array.from({ length: SWEEP_SEGMENTS }, () => 0));
  const sweepCursor = useSharedValue(0);
  const sweepLock = useSharedValue(0);
  /** A value nothing writes: the scrim sits still for the whole turn. */
  const scrimPinned = useSharedValue(0);

  /*
    Per-frame state lives in refs. Faces arrive at camera rate and most
    of them change nothing the person can see.
  */
  const lastFace = useRef<FaceObservation | null>(null);
  const missedFrames = useRef(0);
  const pace = useRef(0);
  /** The fills as drawn, which trail the fills as measured by 65 ms. */
  const shownFills = useRef<number[]>(Array.from({ length: SWEEP_SEGMENTS }, () => 0));
  const lastLagAt = useRef<number | null>(null);
  /** The last turn reading and its time, for the rate the ring answers to. */
  const lastYaw = useRef<{ yaw: number; at: number } | null>(null);
  const shownLock = useRef(0);
  const motionRef = useRef({ moving: false, steady: false, unavailable: true });
  useEffect(() => {
    motionRef.current = { moving, steady, unavailable: noMotionSensor };
  }, [moving, steady, noMotionSensor]);
  /** The last motion the reducer was told about, so only changes are sent. */
  const lastMotion = useRef({ moving: false, steady: false });
  /** A flight that finished before its photograph did. */
  const landedPending = useRef(false);

  /*
    The scan's own answer, not the camera's. `manual=1` forces tracking
    off whatever the build reports, and the ring's response has to go off
    with it: a guide that answers the head and can never fire is the wrong
    promise on the screen somebody opened because they cannot turn their
    head.
  */
  /* ------------------------------ the turn -------------------------- */

  /** The turn as the screen is currently drawing it, or null for a walk. */
  const sweep = scan.sweep;
  /** True while one continuous turn is running, rather than a walk. */
  const sweeping = scan.mode === 'sweep' && sweep !== null && !sweep.finished;
  /** The live turn, which a finished one is not. */
  const turning = sweeping ? sweep : null;

  /*
    A turn is tracking whichever angle it happens to be nearest: the
    whole gesture is one target, and the ring answers the head for the
    length of it.
  */
  const trackingThisAngle = scan.tracking && framing && (sweeping || tracksFace(angle));

  const onTrackingChanged = useCallback(
    (reporting: boolean) => {
      // Only before the first photograph: after that the order, the sign
      // and the shots are a record of what happened, not a setting.
      if (Object.keys(scanRef.current.shots).length > 0) return;
      const next = !manualMode && reporting;

      if (next !== scanRef.current.tracking) {
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
      }

      /*
        Whether faces will be reported at all is the other half of the
        mode question, and this is where the answer arrives. A camera
        that stops reporting mid-turn takes the turn with it: the walk is
        the only thing that works without a detector, and it is what the
        turn falls back to here.
      */
      syncMode();
    },
    [manualMode, patchScan, syncMode],
  );

  /**
   * The three values the turn's ring reads, written straight to the UI
   * thread once the reducer has had the frame.
   *
   * Nothing here decides anything and nothing here is state: the whole
   * point is that a head moving through a ring costs no re-render of a
   * screen carrying a live camera.
   */
  const writeSweepValues = useCallback(
    (sweep: SweepState, face: FaceObservation | null, now: number) => {
      /*
        The fill, lagged by 65 ms here in the writer. Under Reduce Motion
        it steps rather than lags: the fill is the information, and a
        person who asked for less movement still needs to read it.
      */
      const dt = lastLagAt.current === null ? 0 : Math.max(0, now - lastLagAt.current);
      lastLagAt.current = now;
      const measured = fillOf(sweep.segments);
      const drawn =
        reduceMotion || dt <= 0 ? measured : lagFills(shownFills.current, measured, dt);
      shownFills.current = drawn;
      sweepFills.modify((values) => {
        'worklet';
        for (let i = 0; i < values.length; i += 1) values[i] = drawn[i] ?? 0;
        return values;
      });

      if (!face) {
        lastYaw.current = null;
        shownLock.current = 0;
        sweepLock.set(0);
        return;
      }

      const position = theta(face.yaw);
      // Slightly longer than the gap between frames, so the cap never
      // stalls between writes. θ is signed and never wraps, so there is
      // no long way round for it to take.
      sweepCursor.set(
        reduceMotion
          ? position
          : withTiming(position, { duration: CURSOR_MS, easing: Easing.out(Easing.quad) }),
      );

      /*
        The ring's edge warms on the worse of two readings: how close the
        head is to sitting in the ring, and how still it is. It reaches
        full exactly where a photograph becomes possible, which teaches
        the micro-pause the turn depends on without a sentence for it.
        During the centre gate there is nothing to be still for yet, so
        it is the geometry alone, as it is everywhere else in the app.
      */
      const proximity = headProximity(face, target);
      let level = proximity;
      if (sweep.step !== 'centre') {
        const previous = lastYaw.current;
        const span = previous === null ? 0 : Math.max(1, now - previous.at);
        const rate =
          previous === null ? 0 : (Math.abs(face.yaw - previous.yaw) / span) * 1000;
        const stillness = Math.min(
          clamp01(1 - rate / LOCK_YAW_RATE),
          clamp01(1 - pace.current / LOCK_PACE),
        );
        level = Math.min(proximity, stillness);
      }
      lastYaw.current = { yaw: face.yaw, at: now };
      // Averaged rather than animated: the detector wobbles by a percent
      // or two while a head sits still, and nothing should move unless
      // the head does.
      shownLock.current += (level - shownLock.current) * LOCK_SMOOTHING;
      sweepLock.set(shownLock.current);
    },
    [reduceMotion, target, sweepFills, sweepCursor, sweepLock],
  );

  const onFace = useCallback(
    (seen: FaceObservation | null) => {
      const now = Date.now();
      let face = seen;
      if (seen) {
        pace.current = lastFace.current ? facePace(lastFace.current, seen) : 0;
        lastFace.current = seen;
        missedFrames.current = 0;
        lastFaceSeenAt.current = now;
      } else {
        // A single dropped frame is not a face leaving. Holding the last
        // sighting for a few frames keeps the ring from blinking.
        missedFrames.current += 1;
        if (missedFrames.current < FACE_LOST_AFTER) face = lastFace.current;
        else lastFace.current = null;
      }

      faceFrameRef.current?.update(face);
      const kind = scanRef.current.phase.kind;
      if (kind !== 'tracked' && kind !== 'sweep') return;

      /*
        Written only in the two phases that are framing something, which
        is what keeps it frozen for the length of a capture. Widening the
        guard above by one word would make it follow the head through the
        whole shutter chain and quietly record where it ended up.
      */
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
        now,
      });

      const next = scanRef.current;
      const sweep = next.sweep;
      if (next.phase.kind === 'tracked') {
        faceFrameRef.current?.setAligned(next.phase.cue === 'hold');
      } else if (sweep && !sweep.finished) {
        faceFrameRef.current?.setAligned(sweep.cue === 'hold');
        writeSweepValues(sweep, face, now);
      } else {
        faceFrameRef.current?.setAligned(false);
      }
    },
    [target, dispatch, writeSweepValues],
  );

  /* Tracking off — a blind angle, a paused camera — clears the guide. */
  useEffect(() => {
    if (trackingThisAngle) return;
    lastFace.current = null;
    missedFrames.current = 0;
    lastPose.current = null;
    lastYaw.current = null;
    lastLagAt.current = null;
    shownLock.current = 0;
    faceFrameRef.current?.update(null);
    faceFrameRef.current?.setAligned(false);
    // The FaceFrame is unmounted by now, so the value it would have wound
    // down has to be put back by hand; otherwise the next angle's ring
    // opens at whatever the last head left it at.
    lockValue.set(0);
    sweepLock.set(0);
  }, [trackingThisAngle, lockValue, sweepLock]);

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

      /*
        A frame that left for the pile before its photograph did lands
        while the reducer is still capturing, and the reducer has no case
        for that — so the landing is held and delivered as soon as there
        is a flight for it to end. Without this the flight would never
        complete and the cooldown would never run out.
      */
      const held = scanRef.current.phase;
      if (landedPending.current) {
        if (held.kind === 'flying') {
          landedPending.current = false;
          if (!held.landed) dispatch({ type: 'landed', now });
        } else if (held.kind !== 'capturing') {
          landedPending.current = false;
        }
      }

      /*
        The phone's stillness is only news to a blind angle, and a blind
        angle is one where the camera is pointed away from everybody. A
        turn leaves the camera full of face and the phone already steady,
        so nothing is reported until the face has actually gone.
      */
      const alone =
        lastFaceSeenAt.current === null || now - lastFaceSeenAt.current >= FACE_GONE_MS;
      if (
        alone &&
        (m.moving !== lastMotion.current.moving || m.steady !== lastMotion.current.steady)
      ) {
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
    // The turn runs the same hold, once, at the centre gate before it
    // opens — so the arc is driven for that phase too.
    if (phase.kind !== 'tracked' && phase.kind !== 'sweep') {
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

  /*
    The collapse. When the turn ends, the eight arcs and the five-angle
    ring cross-fade over the same circle: the person watches a ring they
    just closed become a set that is three fifths done, rather than one
    ring vanishing and another arriving. Two opacities and no layout
    animation — the two rings are mounted at radii that already agree.
  */
  const sweepFade = useSharedValue(0);
  const ringFade = useSharedValue(1);
  useEffect(() => {
    const to = sweeping ? 1 : 0;
    const ease = { duration: COLLAPSE_MS, easing: Easing.out(Easing.cubic) };
    sweepFade.set(reduceMotion ? to : withTiming(to, ease));
    ringFade.set(reduceMotion ? 1 - to : withTiming(1 - to, ease));
  }, [sweeping, reduceMotion, sweepFade, ringFade]);

  const sweepRingStyle = useAnimatedStyle(() => ({ opacity: sweepFade.get() }));
  const fiveRingStyle = useAnimatedStyle(() => ({ opacity: ringFade.get() }));

  /**
   * The three marks on the ring: where each photograph is being asked
   * for, and whether it has been taken.
   *
   * With a previous set to match they stand where those photographs were
   * taken — the well targets are the baseline's own poses — so the turn
   * is simply asked to pass through last month's three again.
   */
  const sweepMarks = useMemo<SweepMark[]>(() => {
    if (!sweep) return [];
    return [sweep.wells.front, sweep.wells.templeA, sweep.wells.templeB].map((well) => ({
      key: well.key,
      yaw: well.target.yaw,
      state: well.status,
    }));
  }, [sweep]);

  /*
    Two beats, one each for two different facts: the ring opening when
    the front photograph lands, and the ring closing when the last slice
    fills. There is no third — what has been saved is the frame stack's
    to report, and it already does.
  */
  const sweepBeat =
    sweep === null || sweep.step === 'centre' ? 0 : ringClosed(sweep.segments) ? 2 : 1;

  const onLanded = useCallback(() => {
    if (scanRef.current.phase.kind !== 'flying') {
      // The frame beat its own photograph down to the pile. The landing
      // is kept and delivered by the clock, above.
      landedPending.current = true;
      return;
    }
    dispatch({ type: 'landed', now: Date.now() });
  }, [dispatch]);

  /** True while the guide has a head to follow. */
  const faceSeen = turning
    ? turning.cue !== 'searching' && turning.cue !== 'manual'
    : phase.kind === 'tracked' && phase.cue !== 'searching' && phase.cue !== 'manual';

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
        late: Promise<FrameReading | undefined> | null;
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
        let maskTrace: PhotoMaskTrace | undefined;
        let late: Promise<FrameReading | undefined> | null = null;
        if (nitro) {
          const running = coverageByUri.current.get(shot.uri) ?? Promise.resolve(undefined);
          const reading = await floor(
            withinTime<FrameReading | undefined | typeof STILL_RUNNING>(
              running,
              COVERAGE_WAIT_MS,
              STILL_RUNNING,
            ),
            SCAN_COPY.analysing.unit.area(label),
            a,
          );
          // The outline rides the reading it was traced from. There is no
          // second pass over the photograph and no second model run: the
          // mask was traced inside the measurement that produced these
          // figures, so the two cannot be of different pixels.
          coverage = reading === STILL_RUNNING ? undefined : reading?.coverage;
          maskTrace = reading === STILL_RUNNING ? undefined : reading?.maskTrace;
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
            maskTrace,
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
              if (!reading) return;
              patchPhoto(session.id, saved.id, {
                coverage: reading.coverage,
                maskTrace: reading.maskTrace,
              });
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
        The report is where a scan ends: it is what the person came
        through that door for, and the chooser said so in words before
        they chose. The very first set of all goes there too, whichever
        door it came through — it is the moment somebody has just
        produced a photograph and does not yet know what the app will do
        with it — and so does every single scan. Everything else, a set
        of photographs taken for the record included, goes to the session
        it belongs to.
      */
      if (session && (isFirstSession || singleMode || forReading)) {
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
    forReading,
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

  /*
    A turn has no current angle to name — it is filling three at once —
    so the line that counts them stands down and the ring does the
    counting. The centre gate is the exception: at that moment the front
    photograph is the only thing being asked for, and saying so is true.
  */
  const overline = turning
    ? turning.step === 'centre'
      ? ANGLE_LABELS.front
      : ''
    : singleMode
      ? ANGLE_LABELS[angle]
      : `Angle ${scan.index + 1} of ${scan.order.length} · ${ANGLE_LABELS[angle]}`;
  // The tracked cue, or the turn's own. While a blind angle counts down,
  // the line that says the shutter stops it sits under the digits — where
  // the eye already is — and the same sentence in two places at once is
  // not the same sentence said louder.
  const headline = turning
    ? sweepCueText(turning.cue)
    : phase.kind === 'tracked'
      ? SCAN_COPY.cue[phase.cue]
      : '';
  const holding = turning ? turning.cue === 'hold' : phase.kind === 'tracked' && phase.cue === 'hold';
  // The hint is for somebody who has been holding a pose and getting
  // nowhere. On a build with no detector the cue above already is the
  // shutter instruction, and saying it twice is not saying it louder.
  // Under the turn it is joined by the sentence that says what one pass
  // in front of a front-facing camera reaches — shown until the first
  // photograph lands, by which time it has been read.
  const footnote = turning
    ? turning.manualHint
      ? SCAN_COPY.manualHint
      : shotCount === 0
        ? SCAN_COPY.sweep.scope
        : null
    : phase.kind === 'tracked' && phase.manualHint && phase.cue !== 'manual'
      ? SCAN_COPY.manualHint
      : null;
  const skipLabel =
    phase.kind === 'blind' && !phase.counting
      ? angle === 'crown'
        ? SCAN_COPY.blind.skipCrown
        : SCAN_COPY.blind.skipTop
      : null;
  /*
    The way out of a turn that is not going anywhere. It keeps whatever
    has been taken and hands the rest to the held shots — a temple it
    never reached is simply missing, which the record and the Home card
    already know how to ask for next time.
  */
  const finishLabel = turning?.forcedOffer ? SCAN_COPY.sweep.finish : null;

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
    The frame on its way to the pile, and the angle it belongs to.

    Usually it is the photograph itself, from the moment the file lands.
    Where the camera handed back an early display frame, the flight
    started at the shutter instead and carries on through the photograph
    arriving — the same component, the same key, so nothing restarts
    halfway down. What the pile then shows is always the real file.
  */
  const flyingAngle =
    flight && (phase.kind === 'capturing' || phase.kind === 'flying') && phase.angle === flight.angle
      ? flight.angle
      : phase.kind === 'flying'
        ? phase.angle
        : null;
  const flyingUri =
    flyingAngle === null
      ? null
      : flight && flight.angle === flyingAngle
        ? flight.uri
        : phase.kind === 'flying'
          ? phase.uri
          : null;
  /*
    Where it is headed: past the frames that come before its angle in the
    capture order, so a retake flies back to the slot that angle already
    holds rather than to the top of the pile.
  */
  const flyingIndex =
    flyingAngle === null
      ? 0
      : landedAngles.filter((a) => scan.order.indexOf(a) < scan.order.indexOf(flyingAngle))
          .length;

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
      {/* Through a turn the dimming sits still. A scrim that lifts and
          falls on every pass of the head is noise, and the eye is on the
          ring by then rather than on the room. */}
      {trackingThisAngle ? (
        <RingScrim target={target} lock={sweeping ? scrimPinned : lockValue} />
      ) : null}

      {/*
        Off through a turn. The ghost is one previous photograph for one
        current angle, and a turn has no current angle for it to be
        about; the marks on the ring carry the same information, and they
        carry it for all three at once.
      */}
      <GhostOverlay
        uri={previous?.thumbnailUri ?? previous?.uri ?? null}
        visible={ghostOn && previous !== null && !sweeping}
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
          {/*
            Sized for the larger of the two rings, and pulled back up by
            exactly the difference, so the five-angle ring's own circle
            still lands where the FaceFrame and the scrim's hole are.
            Without the room the turn's three marks sit just outside the
            stroke, and Android would cut them off at the box.
          */}
          <View
            style={{
              width: RING + SWEEP_RING_INSET * 2,
              height: RING + SWEEP_RING_INSET * 2,
              marginTop: -SWEEP_RING_INSET,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Animated.View style={fiveRingStyle}>
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
            </Animated.View>

            {/*
              The turn's own ring, mounted so its stroke lands on exactly
              the circle the five-angle ring draws — that is what
              SWEEP_RING_INSET is for, and it is why the collapse reads
              as one circle becoming another rather than as two circles
              swapping places.
            */}
            {sweep ? (
              <Animated.View
                pointerEvents="none"
                style={[{ position: 'absolute', left: 0, top: 0 }, sweepRingStyle]}>
                <SweepRing
                  size={RING + SWEEP_RING_INSET * 2}
                  stroke={RING_STROKE}
                  fills={sweepFills}
                  cursor={faceSeen ? sweepCursor : null}
                  hold={sweep.step === 'centre' ? holdValue : null}
                  lock={trackingThisAngle ? sweepLock : null}
                  step={sweep.step}
                  marks={sweepMarks}
                  beat={sweepBeat}
                />
              </Animated.View>
            ) : null}

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
      {flyingUri !== null ? (
        <FlyingFrame
          key={flyingUri}
          uri={flyingUri}
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
        {previous && !blindAngle && !sweeping ? (
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

          Both stand down while hands-free is actually counting this angle
          down for you, and through a turn: those are the two places the
          delay is already being run or has nowhere to sit, and four pills
          plus the close control do not fit a 375-point bar. Switch hands-free off and they come straight
          back, because turning off the automatic countdown must not also
          take away the one you set yourself — on the angle where you can
          least afford to be without it.
        */}
        {sweeping || (handsFreeSwitch && scan.handsFree)
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
        // One card for the whole of a turn: it is one gesture, and a card
        // re-entering as the harvest moves from one angle to the next
        // would be the screen flinching at its own progress.
        key={sweeping ? 'sweep' : angle}
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
                style={{ color: holding ? colors.accent : '#fff' }}>
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

          {/* The end of a turn that has gone on long enough, offered
              rather than taken: it keeps what has been photographed and
              hands whatever is left to the held shots. */}
          {finishLabel ? (
            <Pressable
              accessible
              accessibilityRole="button"
              accessibilityLabel={finishLabel}
              hitSlop={8}
              onPress={() => dispatch({ type: 'finish', now: Date.now() })}>
              <Text variant="footnote" center style={{ color: '#fff', opacity: 0.7 }}>
                {finishLabel}
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
                : turning || holding
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
