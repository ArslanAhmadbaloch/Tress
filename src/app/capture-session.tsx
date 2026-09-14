import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
} from '@/lib/device-preferences';
import {
  CAPTURE_TIMERS,
  loadCaptureTimer,
  saveCaptureTimer,
  type CaptureTimer,
} from '@/lib/device-preferences';
import { useBackOrHome } from '@/lib/navigation';
import { CaptureRing } from '@/components/capture-ring';
import { BASELINE_THANKS } from '@/features/content/belonging';
import { useHairContent } from '@/features/content/use-hair-content';
import { useSteadiness } from '@/features/capture/use-steadiness';
import { persistCapture, shrinkCapture } from '@/lib/photo-storage';
import { useAppStore } from '@/store/app-store';
import { motion, useTheme } from '@/theme';
import {
  ANGLES,
  ANGLE_LABELS,
  type Angle,
} from '@/types/domain';

const SHUTTER_SIZE = 78;

type Shot = {
  angle: Angle;
  /** Cache URI from the camera, before it is persisted. */
  tempUri: string;
};

export default function CaptureSessionScreen() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const leave = useBackOrHome();
  const { data, addSession } = useAppStore();
  /** Their very first set, which is the one worth acknowledging. */
  const isBaseline = data.sessions.length === 0;

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // The intro can open capture at a chosen angle; the session still
  // collects all five, wrapping round to any it skipped.
  const { start } = useLocalSearchParams<{ start?: string }>();
  const [index, setIndex] = useState(() =>
    Math.max(0, ANGLES.indexOf(start as Angle)),
  );
  const [shots, setShots] = useState<Shot[]>([]);
  const [pending, setPending] = useState<CameraCapturedPicture | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  /** True while a system alert is up, so the capture session can pause. */
  const [confirming, setConfirming] = useState(false);
  const [phase, setPhase] = useState<'capture' | 'summary'>('capture');

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


  const angle = ANGLES[index];
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
      // `skipProcessing` is deliberately off: it shaves a little latency
      // but on Android it can hand back an unrotated or empty frame, and a
      // black progress photo is worse than a slightly slower shutter.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo) {
        // Down to storage size before it touches state: what is previewed,
        // held and shown in the summary is then the size it will be saved
        // at, not a full-resolution frame waiting to be resized later.
        const small = await shrinkCapture(photo.uri);
        setPending({ ...photo, ...small });
      }
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

  const acceptShot = useCallback(() => {
    if (!pending) return;

    setShots((prev) => [
      ...prev.filter((s) => s.angle !== angle),
      { angle, tempUri: pending.uri },
    ]);
    setPending(null);

    // Next angle still missing, wrapping round, so a session started
    // part-way through still collects all five before the summary.
    const taken = new Set([...shots.map((s) => s.angle), angle]);
    const after = ANGLES.findIndex((a, i) => i > index && !taken.has(a));
    const next = after !== -1 ? after : ANGLES.findIndex((a) => !taken.has(a));
    if (next === -1) setPhase('summary');
    else setIndex(next);
  }, [pending, angle, index, shots]);

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
   * Motion, used for one thing only: knowing when to get out of the way.
   *
   * It drove an automatic shutter once — settle the phone and it fired —
   * and taking the photo out of the user's hands turned out to be worse
   * than the problem it solved. The self-timer does that job, on purpose
   * and when asked. This is now just the signal that the phone has been
   * picked up, so the instruction can stop covering the shot.
   */
  const framing =
    phase === 'capture' && !pending && !confirming && permission?.granted === true;

  const { moving } = useSteadiness(framing);

  /** The instruction fades out the moment the phone is disturbed. */
  const instructionFade = useSharedValue(1);
  useEffect(() => {
    const to = moving ? 0 : 1;
    instructionFade.set(
      reduceMotion ? to : withTiming(to, { duration: moving ? 180 : 360 }),
    );
  }, [moving, reduceMotion, instructionFade]);

  const instructionStyle = useAnimatedStyle(() => ({
    opacity: instructionFade.get(),
  }));

  /* ------------------------------ save ------------------------------ */

  const save = useCallback(async () => {
    if (shots.length === 0 || isSaving) return;
    setIsSaving(true);

    try {
      const sessionKey = `${Date.now().toString(36)}`;
      const stored = await Promise.all(
        shots.map(async (shot) => {
          const file = await persistCapture(shot.tempUri, sessionKey, shot.angle);
          return {
            angle: shot.angle,
            uri: file.uri,
            thumbnailUri: file.thumbnailUri,
            width: file.width,
            height: file.height,
            capturedAt: new Date().toISOString(),
          };
        }),
      );

      const session = addSession(stored);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );

      if (session) {
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
  }, [shots, isSaving, addSession, router]);

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
          {isBaseline ? 'That’s your baseline' : 'Your update'}
        </Text>
        <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.sm }}>
          {/* Photographing your own head five ways, feeling self-conscious
              about it, is the hard part of this product. Saying so once —
              on the first set only — costs a line and is true. */}
          {isBaseline ? `${BASELINE_THANKS} ` : ''}
          {shots.length} of {ANGLES.length} angles captured. Tap any angle to
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
          {ANGLES.map((a) => {
            const shot = shots.find((s) => s.angle === a);
            return (
              <PressableScale
                key={a}
                onPress={() => {
                  setIndex(ANGLES.indexOf(a));
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
            label={isSaving ? 'Saving…' : 'Save Update'}
            onPress={save}
            loading={isSaving}
            disabled={shots.length === 0}
          />
          <Button label="Discard" variant="ghost" size="md" onPress={confirmExit} />
        </View>
      </View>
    );
  }

  /* ---------------------------- camera ------------------------------ */

  const { width } = Dimensions.get('window');
  const guideWidth = width * 0.62;
  /** The ring's diameter; the instruction is sized against it. */
  const RING = guideWidth * 1.18;
  // High in the frame, just under the top bar: where a face sits when the
  // phone is held at arm's length, rather than in the middle of the screen.
  const guideTop = insets.top + 64 + spacing.lg;

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
        <CameraView
          ref={cameraRef}
          /*
            What you see is what gets saved.

            iOS mirrors the front-camera preview, and the `mirror` prop
            does not change that — set true or false the viewfinder is
            pixel-identical, so it only ever reaches the captured file.
            Leaving it false wrote the file as true optics while the
            preview showed a mirror, and every shot came out flipped from
            the thing that had just been composed.

            So the file is mirrored to match the preview. The cost is that
            it is a mirror image: "Left Side" frames the left side as its
            owner sees it in a mirror, not as a camera would record it.
            Comparisons stay sound because every photo is mirrored the
            same way; what matters is that they are all treated alike.
          */
          style={{ flex: 1 }}
          facing="front"
          mode="picture"
          active={!confirming}
          mirror={true}
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

      {/* Alignment guide + ghost of the previous session */}
      {!pending ? (
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
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
                total={ANGLES.length}
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

        <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
          {ANGLES.map((a, i) => (
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
          ))}
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
          accessibilityLabel={`Angle ${index + 1} of ${ANGLES.length}, ${ANGLE_LABELS[angle]}. ${guidance.instruction}`}
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
            }}>
            {/* Which angle, and nothing else. The instruction itself now
                sits inside the ring, where the framing is happening; two
                copies of it meant reading the same sentence twice. */}
            <Text variant="overline" style={{ color: '#fff', opacity: 0.7 }}>
              {`Angle ${index + 1} of ${ANGLES.length} · ${ANGLE_LABELS[angle]}`}
            </Text>
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
              style={{ flex: 1 }}
            />
            <Button
              label={index === ANGLES.length - 1 ? 'Done' : 'Next'}
              icon="check"
              onPress={acceptShot}
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
