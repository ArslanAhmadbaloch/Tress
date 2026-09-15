import { useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Dimensions, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
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
import { Icon } from '@/components/ui/icon';
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
  FACE_MOVING_PACE,
  FaceFrame,
  facePace,
  guidanceFor,
  TrackedCamera,
  tracksFace,
  type FaceFrameHandle,
  type FaceObservation,
  type Guidance,
  type GuideTarget,
  type TrackedCameraHandle,
} from '@/components/capture';
import { BASELINE_THANKS } from '@/features/content/belonging';
import { useHairContent } from '@/features/content/use-hair-content';
import { useSteadiness } from '@/features/capture/use-steadiness';
import { analysePhoto } from '@/features/assessment/analyse-photo';
import { persistCapture, shrinkCapture } from '@/lib/photo-storage';
import { useAppStore } from '@/store/app-store';
import { motion, useTheme } from '@/theme';
import {
  ANGLES,
  ANGLE_LABELS,
  missingAngles,
  sessionToExtend,
  type Angle,
  type PhotoCoverage,
  type PhotoSession,
} from '@/types/domain';

const SHUTTER_SIZE = 78;

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

type Shot = {
  angle: Angle;
  /** Cache URI from the camera, before it is persisted. */
  tempUri: string;
  /** The hair-mask reading, already running; undefined if it could not. */
  coverage: Promise<PhotoCoverage | undefined>;
};

type Pending = {
  uri: string;
  width: number;
  height: number;
};

const NO_GUIDANCE: Guidance = { status: 'off', message: null, aligned: false };

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
    Three ways in. The intro opens the full session at a chosen angle, and
    the session still collects all five, wrapping round to any it skipped.
    The funnel opens a single scan: one photograph, from the front, and
    straight to the report — the shortest honest path from "I wonder" to
    "here is what the device measured". Home's baseline card opens the
    rest of that scan: only the angles the baseline lacks, saved into the
    baseline rather than beside it.
  */
  const { start, single, extend } = useLocalSearchParams<{
    start?: string;
    single?: string;
    extend?: string;
  }>();
  const singleMode = single === '1';

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

  const [index, setIndex] = useState(() =>
    Math.max(0, angles.indexOf(start as Angle)),
  );
  const [shots, setShots] = useState<Shot[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  /** True while a system alert is up, so the capture session can pause. */
  const [confirming, setConfirming] = useState(false);
  const [phase, setPhase] = useState<'capture' | 'summary'>('capture');

  /**
   * Coverage readings in flight, by the frame they were taken from. The
   * measurement starts the moment a frame is shrunk, so by the time the
   * shot is accepted it is usually already done; a retake simply leaves
   * its entry behind to be ignored.
   */
  const coverageByUri = useRef(new Map<string, Promise<PhotoCoverage | undefined>>());

  /*
   * Self-timer. The top and back angles are shot blind — the screen faces
   * away — so a delay lets the phone be settled before it fires. The
   * choice is remembered, because it is a habit rather than a per-shot
   * decision.
   */
  const [timer, setTimer] = useState<CaptureTimer>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadCaptureTimer().then(setTimer);
    return () => {
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  }, []);


  const angle = angles[index];
  const guidance = useHairContent().angles[angle];


  /* ----------------------------- shutter ---------------------------- */

  const flash = useSharedValue(0);
  const shutterScale = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));
  const shutterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterScale.get() }],
  }));

  const capture = useCallback(async () => {
    if (isCapturing || !cameraRef.current) return;
    setIsCapturing(true);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);

    try {
      const photo = await cameraRef.current.takePhoto();
      // Down to storage size before it touches state: what is previewed,
      // held and shown in the summary is then the size it will be saved
      // at, not a full-resolution frame waiting to be resized later.
      const small = await shrinkCapture(photo.uri);

      /*
        The hair mask starts now, while the person is looking at the
        frame and deciding whether to keep it. It is the slowest thing
        the app does to a photograph, and this is the one moment where
        nobody is waiting on it.
      */
      coverageByUri.current.set(small.uri, measureCoverageSafely(small.uri));
      setPending(small);
    } catch {
      setConfirming(true);
      Alert.alert(
        "Couldn't take that photo",
        'Something interrupted the camera. Please try again.',
        [{ text: 'OK', onPress: () => setConfirming(false) }],
        { onDismiss: () => setConfirming(false) },
      );
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, reduceMotion, flash, shutterScale]);

  const retake = useCallback(() => setPending(null), []);

  const cancelCountdown = useCallback(() => {
    if (countdownRef.current) clearTimeout(countdownRef.current);
    countdownRef.current = null;
    setCountdown(null);
  }, []);

  /**
   * Runs a countdown, then captures.
   *
   * Shared by the shutter and by settling the phone, so a hands-free
   * capture is the same three seconds and the same haptic ticks as one
   * you started yourself — the only difference is what began it.
   */
  const runCountdown = useCallback(
    (seconds: number) => {
      let remaining = seconds;
      const announce = (n: number) => {
        setCountdown(n);
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
          capture();
          return;
        }
        announce(remaining);
        countdownRef.current = setTimeout(tick, 1000);
      };

      announce(remaining);
      countdownRef.current = setTimeout(tick, 1000);
    },
    [capture],
  );

  /** Shutter: fires now, starts the countdown, or cancels a running one. */
  const chooseTimer = (seconds: CaptureTimer) => {
    setTimer(seconds);
    saveCaptureTimer(seconds);
  };

  const onShutter = useCallback(() => {
    // Mid-countdown the shutter is a stop button: the hands-free count is
    // running and tapping it means "not yet", not "again".
    if (countdown !== null) {
      cancelCountdown();
      return;
    }
    if (timer === 0) {
      capture();
      return;
    }
    runCountdown(timer);
  }, [countdown, timer, capture, cancelCountdown, runCountdown]);


  /*
   * Motion, used for two things: knowing when to get out of the way, and
   * knowing when "hold still" has been obeyed.
   *
   * It drove an automatic shutter once — settle the phone and it fired —
   * and taking the photo out of the user's hands turned out to be worse
   * than the problem it solved. The self-timer does that job, on purpose
   * and when asked. This is the signal that the phone has been picked up,
   * so the instruction can stop covering the shot, and the signal that it
   * has been put still, so the guide can turn green honestly.
   */
  const framing =
    phase === 'capture' && !pending && !confirming && permission?.granted === true;

  const { moving, steady, unavailable: noMotionSensor } = useSteadiness(framing);

  /* --------------------------- head tracking ------------------------ */

  const { width } = Dimensions.get('window');
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

  const [tracking, setTracking] = useState(false);
  const [headGuidance, setHeadGuidance] = useState<Guidance>(NO_GUIDANCE);
  const faceFrameRef = useRef<FaceFrameHandle>(null);

  /*
    Per-frame state lives in refs. Faces arrive at camera rate and most
    of them change nothing the person can see; only a change of message
    is worth a render.
  */
  const lastFace = useRef<FaceObservation | null>(null);
  const missedFrames = useRef(0);
  const pace = useRef(0);
  const motionRef = useRef({ moving: false, steady: false, unavailable: true });
  useEffect(() => {
    motionRef.current = { moving, steady, unavailable: noMotionSensor };
  }, [moving, steady, noMotionSensor]);
  const guidanceRef = useRef<Guidance>(NO_GUIDANCE);
  /** When the last tap or spoken cue went out, so a flicker cannot nag. */
  const lastCueAt = useRef(0);

  const trackingThisAngle = tracking && framing && tracksFace(angle);

  const publishGuidance = useCallback((next: Guidance) => {
    if (next.status === guidanceRef.current.status) return;
    const wasAligned = guidanceRef.current.aligned;
    guidanceRef.current = next;
    setHeadGuidance(next);
    faceFrameRef.current?.setAligned(next.aligned);

    /*
      The oval changes colour instantly; the tap and the spoken line are
      rationed. A head hovering on the edge of "still" can cross it
      several times a second, and a phone that buzzes on each crossing
      would be telling the person to hold still by shaking in their hand.
    */
    const now = Date.now();
    if (now - lastCueAt.current < CUE_INTERVAL_MS) return;
    lastCueAt.current = now;

    // The moment it lines up gets a tap, so it can be felt with the
    // phone held out at arm's length and the eyes on the ring.
    if (next.aligned && !wasAligned) {
      Haptics.selectionAsync().catch(() => undefined);
    }
    if (next.message) AccessibilityInfo.announceForAccessibility(next.message);
  }, []);

  const onFace = useCallback(
    (seen: FaceObservation | null) => {
      if (!trackingThisAngle) return;

      let face = seen;
      if (seen) {
        pace.current = lastFace.current ? facePace(lastFace.current, seen) : 0;
        lastFace.current = seen;
        missedFrames.current = 0;
      } else {
        // A single dropped frame is not a face leaving. Holding the last
        // sighting for a few frames keeps the oval from blinking.
        missedFrames.current += 1;
        if (missedFrames.current < FACE_LOST_AFTER) face = lastFace.current;
        else lastFace.current = null;
      }

      faceFrameRef.current?.update(face);

      const m = motionRef.current;
      publishGuidance(
        guidanceFor({
          angle,
          face,
          target,
          phoneMoving: m.moving,
          // No accelerometer — a simulator, say — means the phone's
          // stillness cannot be known, so the face's own has to do.
          phoneSteady: m.unavailable ? true : m.steady,
          faceMoving: pace.current > FACE_MOVING_PACE,
        }),
      );
    },
    [trackingThisAngle, angle, target, publishGuidance],
  );

  /* Tracking off — a blind angle, a paused camera — clears the guide. */
  useEffect(() => {
    if (trackingThisAngle) return;
    lastFace.current = null;
    missedFrames.current = 0;
    faceFrameRef.current?.update(null);
    publishGuidance(NO_GUIDANCE);
  }, [trackingThisAngle, publishGuidance]);

  /** True while the guide has a head to follow. */
  const faceSeen = headGuidance.status !== 'off' && headGuidance.status !== 'searching';

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

  /* ------------------------------ save ------------------------------ */

  const save = useCallback(
    async (toSave: Shot[]) => {
      if (toSave.length === 0 || isSaving) return;
      setIsSaving(true);

      // Read before the session is added, or it is never the first one.
      const isFirstSession = data.sessions.length === 0;

      try {
        const sessionKey = `${Date.now().toString(36)}`;
        const stored = await Promise.all(
          toSave.map(async (shot) => {
            const file = await persistCapture(shot.tempUri, sessionKey, shot.angle);

            /*
              Measured now, while the file is untouched, and stored with the
              photograph rather than recomputed when the report opens. Two
              reasons: re-decoding five frames every time somebody visits a
              tab is wasteful, and a reading taken months later would be of
              a file that storage may since have recompressed — a different
              photograph, quietly.

              The coverage reading was started at the shutter, on the
              shrunk frame this file was encoded from, and is awaited here
              with a ceiling: a phone that is still segmenting after four
              seconds saves the photograph without it.

              A failure of either is not a failure of the capture. The
              photograph is the thing being saved; the measurements are
              notes about it, and a session without one is simply a session
              we say nothing about.
            */
            const [analysis, coverage] = await Promise.all([
              analysePhoto(file.uri).catch(() => null),
              withinTime<PhotoCoverage | undefined | typeof STILL_RUNNING>(
                shot.coverage,
                COVERAGE_WAIT_MS,
                STILL_RUNNING,
              ),
            ]);

            return {
              photo: {
                angle: shot.angle,
                uri: file.uri,
                thumbnailUri: file.thumbnailUri,
                width: file.width,
                height: file.height,
                capturedAt: new Date().toISOString(),
                quality: analysis ? { ...analysis.quality } : undefined,
                coverage: coverage === STILL_RUNNING ? undefined : coverage,
              },
              // Only a reading that outran the wait is worth following up;
              // one that finished without a result has nothing more to say.
              late: coverage === STILL_RUNNING ? shot.coverage : null,
            };
          }),
        );

        const photos = stored.map((s) => s.photo);
        const session = extending
          ? extendSession(extending.id, photos)
          : addSession(photos);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        );

        /*
          A reading still running at the save is not lost. It lands on
          its photograph when it finishes — through the store, because
          this screen is usually gone by then. The photograph is found by
          file, which is unique to this save.
        */
        if (session) {
          for (const { photo, late } of stored) {
            const saved = session.photos.find((p) => p.uri === photo.uri);
            if (!late || !saved) continue;
            late.then(
              (reading) => {
                if (reading) patchPhoto(session.id, saved.id, { coverage: reading });
              },
              // A reading that fails after the save is no reading; the
              // photograph is already kept.
              () => undefined,
            );
          }
        }

        /*
          The very first set goes to the report rather than to the session
          view, and so does every single scan. It is the moment somebody
          has just produced a photograph and does not yet know what the
          app will do with it — sending them to a gallery of their own
          scalp wastes it. Every full set after the first goes where it
          always did.
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
        Alert.alert(
          "Couldn't save your update",
          'Your photos were taken but could not be written to this device. Check your available storage and try again.',
        );
      }
    },
    [
      isSaving,
      addSession,
      extendSession,
      patchPhoto,
      extending,
      router,
      data.sessions.length,
      singleMode,
    ],
  );

  const acceptShot = useCallback(() => {
    if (!pending) return;

    const shot: Shot = {
      angle,
      tempUri: pending.uri,
      coverage: coverageByUri.current.get(pending.uri) ?? Promise.resolve(undefined),
    };
    const next = [...shots.filter((s) => s.angle !== angle), shot];
    setShots(next);

    /*
      A single scan saves the moment it is accepted. There is no set to
      review, so a summary screen listing one photograph would be a step
      that exists only to be tapped through. The frame stays on screen
      while it saves; if the save fails, it is still there to try again.
    */
    if (singleMode) {
      save(next);
      return;
    }

    setPending(null);

    // Next angle still missing, wrapping round, so a session started
    // part-way through still collects all five before the summary.
    const taken = new Set(next.map((s) => s.angle));
    const after = angles.findIndex((a, i) => i > index && !taken.has(a));
    const following = after !== -1 ? after : angles.findIndex((a) => !taken.has(a));
    if (following === -1) setPhase('summary');
    else setIndex(following);
  }, [pending, angle, index, shots, angles, singleMode, save]);

  const confirmExit = useCallback(() => {
    if (shots.length === 0 && !pending) {
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
  }, [shots.length, pending, leave]);

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

  /* ---------------------------- summary ----------------------------- */

  if (phase === 'summary') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
          paddingHorizontal: spacing.lg,
        }}>
        <Text variant="title1" accessibilityRole="header">
          {isBaseline || extending ? 'That’s your baseline' : 'Your update'}
        </Text>
        <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.sm }}>
          {/* Photographing your own head five ways, feeling self-conscious
              about it, is the hard part of this product. Saying so once —
              on the first set only — costs a line and is true. */}
          {isBaseline || extending ? `${BASELINE_THANKS} ` : ''}
          {shots.length} of {angles.length} angles captured. Tap any angle to
          retake it before saving.
        </Text>

        {/*
          Scrolls. Five rows, a title and two buttons fit a large phone and
          not a small one, and as a fixed column the rows simply overflowed
          the space and painted over the buttons — so the way to save your
          photos was underneath the list of them.
        */}
        <ScrollView
          style={{ flex: 1, marginTop: spacing.xl }}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}
          showsVerticalScrollIndicator={false}>
          {angles.map((a) => {
            const shot = shots.find((s) => s.angle === a);
            return (
              <PressableScale
                key={a}
                onPress={() => {
                  setIndex(angles.indexOf(a));
                  setPending(null);
                  setPhase('capture');
                }}
                scaleTo={0.99}
                accessibilityRole="button"
                accessibilityLabel={`${ANGLE_LABELS[a]}, ${shot ? 'captured' : 'missing'}. Tap to retake.`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  padding: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}>
                {shot ? (
                  <Image
                    source={{ uri: shot.tempUri }}
                    style={{ width: 46, height: 56, borderRadius: radius.xs }}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: 46,
                      height: 56,
                      borderRadius: radius.xs,
                      backgroundColor: colors.fill,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Icon name="camera" size={15} color={colors.textTertiary} />
                  </View>
                )}

                <Text variant="headline" style={{ flex: 1 }}>
                  {ANGLE_LABELS[a]}
                </Text>

                <Icon
                  name={shot ? 'checkCircle' : 'circle'}
                  size={18}
                  color={shot ? colors.accent : colors.textTertiary}
                />
              </PressableScale>
            );
          })}
        </ScrollView>

        <View style={{ gap: spacing.sm }}>
          <Button
            label={isSaving ? 'Saving…' : isBaseline || extending ? 'Save My Baseline' : 'Save Update'}
            onPress={() => save(shots)}
            loading={isSaving}
            disabled={shots.length === 0}
          />
          <Button label="Discard" variant="ghost" size="md" onPress={confirmExit} />
        </View>
      </View>
    );
  }

  /* ---------------------------- camera ------------------------------ */

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {pending ? (
        <Image
          source={{ uri: pending.uri }}
          style={{ flex: 1 }}
          contentFit="cover"
          accessibilityLabel={`Captured ${ANGLE_LABELS[angle]} photo`}
        />
      ) : (
        <TrackedCamera
          ref={cameraRef}
          active={!confirming}
          onFace={onFace}
          onTrackingChanged={setTracking}
        />
      )}

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

      {/* Alignment guide, and the oval that follows the head */}
      {!pending ? (
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
          {trackingThisAngle ? <FaceFrame ref={faceFrameRef} target={target} /> : null}

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
                total={angles.length}
                done={shots.length}
                current={index}
                countdownProgress={
                  countdown === null || timer === 0 ? null : countdown / timer
                }
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
                <Text
                  variant="headline"
                  center
                  style={{ color: '#fff' }}>
                  {guidance.instruction}
                </Text>
              </Animated.View>
            </View>
          </View>
        </View>
      ) : null}

      {/* Self-timer countdown */}
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
            key={countdown}
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
            {countdown}
          </Animated.Text>
          <Text variant="subhead" style={{ color: '#fff', opacity: 0.85, marginTop: spacing.sm }}>
            Tap the shutter to cancel
          </Text>
        </View>
      ) : null}

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
          {angles.length > 1
            ? angles.map((a) => (
                <View
                  key={a}
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 2,
                    backgroundColor:
                      shots.some((s) => s.angle === a)
                        ? colors.accent
                        : 'rgba(255,255,255,0.32)',
                  }}
                />
              ))
            : null}
        </View>

        {/*
          The timer, as two taps rather than a cycle. It was one pill you
          pressed repeatedly to walk Off → 3 → 5, which means finding the
          setting you want by overshooting it; both are on the bar now,
          and pressing the lit one puts it back to off.
        */}
        {CAPTURE_TIMERS.filter((seconds) => seconds > 0).map((seconds) => {
          const active = timer === seconds;
          return (
            <PressableScale
              key={seconds}
              onPress={() => chooseTimer(active ? 0 : seconds)}
              haptic="light"
              disabled={countdown !== null}
              accessibilityRole="switch"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${seconds} second self-timer`}
              accessibilityHint={
                active ? 'Turns the self-timer off' : 'Counts down before the shot'
              }
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
                <Icon
                  name="clock"
                  size={15}
                  color={active ? colors.accent : '#fff'}
                />
                <Text
                  variant="subhead"
                  style={{ color: active ? colors.accent : '#fff' }}>
                  {seconds}s
                </Text>
              </GlassSurface>
            </PressableScale>
          );
        })}


      </GlassGroup>

      {/* Angle guide: low in the frame, in the clear space between the head
          outline and the shutter, so it never sits over the outline. */}
      {!pending ? (
        <Animated.View
          key={angle}
          entering={FadeIn.duration(250)}
          pointerEvents="none"
          accessible
          accessibilityLabel={[
            singleMode
              ? `${ANGLE_LABELS[angle]} photo.`
              : `Angle ${index + 1} of ${angles.length}, ${ANGLE_LABELS[angle]}.`,
            guidance.instruction,
            headGuidance.message,
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            position: 'absolute',
            left: spacing.lg,
            right: spacing.lg,
            bottom: insets.bottom + spacing.xl + SHUTTER_SIZE + spacing.lg,
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
            {/* Which angle, and nothing else. The instruction itself now
                sits inside the ring, where the framing is happening; two
                copies of it meant reading the same sentence twice. */}
            <Text variant="overline" style={{ color: '#fff', opacity: 0.7 }}>
              {singleMode
                ? ANGLE_LABELS[angle]
                : `Angle ${index + 1} of ${angles.length} · ${ANGLE_LABELS[angle]}`}
            </Text>

            {/*
              What the camera can see, in one line, only when it can see
              anything. It says where the head is — closer, centred, still
              — and never what is on it. The line turns sage with the
              oval, so the eye reads one state, not two.
            */}
            {headGuidance.message ? (
              <Text
                variant="headline"
                center
                style={{ color: headGuidance.aligned ? colors.accent : '#fff' }}>
                {headGuidance.message}
              </Text>
            ) : null}
          </GlassSurface>
        </Animated.View>
      ) : null}

      {/* Bottom controls */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + spacing.xl,
          left: spacing.lg,
          right: spacing.lg,
          alignItems: 'center',
        }}>
        {pending ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={{ flexDirection: 'row', gap: spacing.md, width: '100%' }}>
            <Button
              label="Retake"
              icon="retake"
              variant="secondary"
              onPress={retake}
              disabled={isSaving}
              style={{ flex: 1 }}
            />
            <Button
              label={
                singleMode
                  ? isSaving
                    ? 'Saving…'
                    : 'Use Photo'
                  : index === angles.length - 1
                    ? 'Done'
                    : 'Next'
              }
              icon="check"
              onPress={acceptShot}
              loading={isSaving}
              style={{ flex: 1 }}
            />
          </Animated.View>
        ) : (
          <Animated.View style={shutterStyle}>
            <PressableScale
              onPress={onShutter}
              haptic="none"
              disabled={isCapturing}
              scaleTo={1}
              accessibilityRole="button"
              accessibilityLabel={
                countdown !== null
                  ? 'Cancel countdown'
                  : `Capture ${ANGLE_LABELS[angle]}`
              }
              style={{
                width: 78,
                height: 78,
                borderRadius: 39,
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
                        backgroundColor: isCapturing ? colors.accent : '#fff',
                      }
                }
              />
            </PressableScale>
          </Animated.View>
        )}
      </View>
    </View>
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
          ? 'Tress needs the camera to take your progress photos. They are saved to this device only — nothing is uploaded.'
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
