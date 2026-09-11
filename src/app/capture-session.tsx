import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Dimensions, View } from 'react-native';
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
import { persistCapture } from '@/lib/photo-storage';
import { useAppStore } from '@/store/app-store';
import { latestSession } from '@/store/selectors';
import { motion, useTheme } from '@/theme';
import {
  ANGLES,
  ANGLE_GUIDANCE,
  ANGLE_LABELS,
  type Angle,
} from '@/types/domain';

/** Self-timer choices, in seconds; 0 fires immediately. */
const TIMER_SETTINGS = [0, 3, 5] as const;
type TimerSetting = (typeof TIMER_SETTINGS)[number];
const TIMER_KEY = 'hj.captureTimer';

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
  const { data, addSession } = useAppStore();

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
  const [showGhost, setShowGhost] = useState(true);
  const [phase, setPhase] = useState<'capture' | 'summary'>('capture');

  /*
   * Self-timer. The top and back angles are shot blind — the screen faces
   * away — so a delay lets the user settle the phone before it fires. The
   * choice is remembered, because it is a habit rather than a per-shot
   * decision.
   */
  const [timer, setTimer] = useState<TimerSetting>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(TIMER_KEY)
      .then((stored) => {
        const value = Number(stored);
        if (TIMER_SETTINGS.includes(value as TimerSetting)) setTimer(value as TimerSetting);
      })
      .catch(() => undefined);
    return () => {
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  }, []);

  const cycleTimer = () => {
    const next = TIMER_SETTINGS[(TIMER_SETTINGS.indexOf(timer) + 1) % TIMER_SETTINGS.length];
    setTimer(next);
    AsyncStorage.setItem(TIMER_KEY, String(next)).catch(() => undefined);
  };

  const previous = latestSession(data);
  const angle = ANGLES[index];
  const guidance = ANGLE_GUIDANCE[angle];

  const ghostUri = useMemo(
    () => previous?.photos.find((p) => p.angle === angle)?.uri,
    [previous, angle],
  );

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
      if (photo) setPending(photo);
    } catch {
      Alert.alert(
        "Couldn't take that photo",
        'Something interrupted the camera. Please try again.',
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

  /** Shutter: fires now, starts the countdown, or cancels a running one. */
  const onShutter = useCallback(() => {
    if (countdown !== null) {
      cancelCountdown();
      return;
    }
    if (timer === 0) {
      capture();
      return;
    }

    let remaining: number = timer;
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
        capture();
        return;
      }
      announce(remaining);
      countdownRef.current = setTimeout(tick, 1000);
    };

    announce(remaining);
    countdownRef.current = setTimeout(tick, 1000);
  }, [countdown, timer, capture, cancelCountdown]);

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
      router.back();
      return;
    }
    Alert.alert(
      'Discard this update?',
      'The photos you have taken so far will not be saved.',
      [
        { text: 'Keep capturing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ],
    );
  }, [shots.length, pending, router]);

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
        onCancel={() => router.back()}
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
          Your update
        </Text>
        <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.sm }}>
          {shots.length} of {ANGLES.length} angles captured. Tap any angle to
          retake it before saving.
        </Text>

        <View style={{ marginTop: spacing.xl, gap: spacing.sm, flex: 1 }}>
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
                    <Icon name="camera" size={16} color={colors.textTertiary} />
                  </View>
                )}

                <Text variant="headline" style={{ flex: 1 }}>
                  {ANGLE_LABELS[a]}
                </Text>

                <Icon
                  name={shot ? 'checkCircle' : 'circle'}
                  size={20}
                  color={shot ? colors.accent : colors.textTertiary}
                />
              </PressableScale>
            );
          })}
        </View>

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
          style={{ flex: 1 }}
          facing="front"
          mode="picture"
          // Mirroring off so left/right temples map to the real side.
          mirror={false}
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
          {ghostUri && showGhost ? (
            <Image
              source={{ uri: ghostUri }}
              style={{ position: 'absolute', inset: 0, opacity: 0.28 }}
              contentFit="cover"
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
            <View
              style={{
                width: guideWidth,
                height: guideWidth * 1.32,
                borderRadius: guideWidth,
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.55)',
                borderStyle: 'dashed',
              }}
            />
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
            <Icon name="close" size={17} color="#fff" />
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

        <PressableScale
          onPress={cycleTimer}
          haptic="light"
          disabled={countdown !== null}
          accessibilityRole="button"
          accessibilityLabel={`Self-timer, ${timer === 0 ? 'off' : `${timer} seconds`}`}
          accessibilityHint="Changes between off, 3 seconds and 5 seconds"
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
            <Icon name="clock" size={16} color={timer ? colors.accent : '#fff'} />
            <Text variant="subhead" style={{ color: timer ? colors.accent : '#fff' }}>
              {timer === 0 ? 'Off' : `${timer}s`}
            </Text>
          </GlassSurface>
        </PressableScale>

        {ghostUri ? (
          <PressableScale
            onPress={() => setShowGhost((v) => !v)}
            accessibilityRole="switch"
            accessibilityState={{ checked: showGhost }}
            accessibilityLabel="Overlay previous photo"
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
              <Icon
                name="photo"
                size={17}
                color={showGhost ? colors.accent : '#fff'}
              />
            </GlassSurface>
          </PressableScale>
        ) : null}
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
            <Text variant="overline" style={{ color: '#fff', opacity: 0.7 }}>
              {`Angle ${index + 1} of ${ANGLES.length} · ${ANGLE_LABELS[angle]}`}
            </Text>
            <Text
              variant="subhead"
              numberOfLines={2}
              style={{ color: '#fff', marginTop: 4, textAlign: 'center' }}>
              {guidance.instruction}
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
                  ? 'Cancel timer'
                  : timer
                    ? `Capture ${ANGLE_LABELS[angle]} in ${timer} seconds`
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
          ? 'Hair Journey needs the camera to take your progress photos. They are saved to this device only — nothing is uploaded.'
          : 'Camera access is currently turned off. You can turn it back on for Hair Journey in your device Settings, under Privacy.'}
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
