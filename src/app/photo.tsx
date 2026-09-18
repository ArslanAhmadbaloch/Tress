/**
 * The plain camera. A picture, kept with the others.
 *
 * ── What this screen deliberately is not ──────────────────────────────
 * It is not the scanner with the instrument taken off. There is no face
 * tracking, no mesh, no ring, no lighting probe, no segmenter, no
 * processing pass and no report — none of it is imported, so none of it
 * can be reached from here by accident later. What is left is a preview,
 * a shutter, a way to turn the phone around and a way out.
 *
 * That restraint is the feature. The owner: "Just an option for if they
 * don't choose scanner to save their photos." A person who wants a
 * photograph should get a photograph, at whatever angle and in whatever
 * light they like, with nothing on screen implying it was examined.
 *
 * ── Which camera is behind the preview ────────────────────────────────
 * Two, chosen once and never both. expo-camera is the real one on every
 * device and in every build: it needs no native module beyond the one
 * the app already ships, and with no detector to feed there is nothing
 * VisionCamera would add here. The simulator has no sensor at all, so a
 * development build there gets `SampleCamera` — the same stand-in the
 * scanner uses, which photographs its own preview and burns "sample"
 * into the pixels, so a picture taken on a simulator says what it is
 * wherever it is later shown.
 *
 * ── Where the picture goes ────────────────────────────────────────────
 * Through the same two steps every stored photograph goes through:
 * `shrinkCapture` the moment it leaves the camera, then `persistCapture`
 * into the document directory with its thumbnail. It is then written as
 * an ordinary one-photograph `PhotoSession` through the store's
 * `addSession`, exactly as a scan's curated frames are — see
 * `features/photo/session.ts` for what that record carries and, more to
 * the point, what it does not. Journey lists it, `session/[id]` opens
 * it, Compare reads it. Nothing about it claims a reading, because
 * nothing here took one.
 *
 * The one thing it does have to decide is which of the journal's five
 * slots the picture is filed under, because the journal captions them.
 * The slot follows the lens, and the line above the shutter says which
 * slot that is before the shutter is pressed — see
 * `features/photo/session.ts`. Filing, said out loud; not a reading.
 *
 * Nothing leaves the device.
 */

import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SampleCamera, sampleCameraActive } from '@/components/capture/sample-camera';
import type { TrackedCameraHandle } from '@/components/capture/types';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { useHairContent } from '@/features/content/use-hair-content';
import { PHOTO_COPY } from '@/features/photo/copy';
import {
  PhotoFailure,
  asCaptureFailure,
  photoFailureKind,
  type PhotoFailureKind,
} from '@/features/photo/failure';
import { plainPhotoAngle, plainPhotoKey, plainPhotoRecord } from '@/features/photo/session';
import { deletePhotoFiles, persistCapture, shrinkCapture } from '@/lib/photo-storage';
import { useAppStore } from '@/store/app-store';
import { MIN_TOUCH_TARGET, darkColors, iconSize, motion, radius, spacing } from '@/theme';

/** The shutter, at the size a camera's shutter is. */
const SHUTTER_SIZE = 74;
/** The ring's thickness, and the gap between it and the bead inside it. */
const SHUTTER_RING = 3;
const SHUTTER_GAP = 5;
/** The two round controls that are not the shutter. */
const CONTROL_SIZE = 46;

/** A picture already brought down to storage size. */
type PlainPhoto = { uri: string; width: number; height: number };

type PlainCameraHandle = {
  /**
   * Takes one picture and resolves with the camera's own file.
   *
   * Only the taking. Shrinking and storing are the screen's, in one
   * place, so a failure in the file work is never reported as a failure
   * of the camera — the whole point of `features/photo/failure.ts`.
   * Anything that goes wrong in here arrives tagged `capture`.
   */
  captureFrame(): Promise<string>;
};

/** What the screen is doing. A failure is a state, not a swallowed promise. */
type Phase = 'camera' | 'saving' | 'error';

/** One sentence per kind of failure, so the screen never has to guess. */
const FAILURE_COPY: Record<PhotoFailureKind, string> = {
  capture: PHOTO_COPY.error.capture,
  save: PHOTO_COPY.error.save,
  noJourney: PHOTO_COPY.error.noJourney,
};

/** The line above the shutter naming the slot this picture will file into. */
const FILED_COPY: Record<CameraType, string> = {
  front: PHOTO_COPY.camera.filedFront,
  back: PHOTO_COPY.camera.filedBack,
};

/**
 * The camera's frame, brought down to storage size, with the original
 * discarded on every path.
 *
 * Careful about one thing: `shrinkCapture` can hand back the file it was
 * given, and deleting that would delete the picture. The original goes
 * only when the shrunk copy is genuinely a different file.
 */
async function shrinkAndDiscard(frame: string): Promise<PlainPhoto> {
  try {
    const small = await shrinkCapture(frame);
    if (small.uri !== frame) deletePhotoFiles([frame]);
    return small;
  } catch (error) {
    deletePhotoFiles([frame]);
    throw error;
  }
}

export default function PhotoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { addSession } = useAppStore();
  const content = useHairContent();

  /*
    Constant for the life of the build — `__DEV__` and whether this is a
    device do not change — so it is read straight rather than held in
    state, and the two cameras never both mount.
  */
  const sample = sampleCameraActive();

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [phase, setPhase] = useState<Phase>('camera');
  const [failure, setFailure] = useState<PhotoFailureKind>('save');

  /*
    Which journal slot this shutter will file into. It follows the lens,
    and the line above the shutter says so — see the note in
    `features/photo/session.ts` for why a plain photograph cannot be
    allowed to pick up a caption nobody chose. The stand-in camera has
    no second lens, so on a simulator it is always the front one.
  */
  const lens = sample ? 'front' : facing;
  const angle = plainPhotoAngle(lens);

  const camera = useRef<PlainCameraHandle>(null);
  /*
    The shutter's real latch.

    `phase` is React state and `disabled={busy}` only takes effect after
    a re-render, so two activations inside one frame — a double tap, or a
    VoiceOver double activation — both passed the `phase` check and both
    wrote a session. A ref changes on the first press. The scanner guards
    its own shutter the same way.
  */
  const shooting = useRef(false);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const flip = useCallback(() => {
    setFacing((f) => (f === 'front' ? 'back' : 'front'));
  }, []);

  const askForCamera = useCallback(() => {
    requestPermission().catch(() => undefined);
  }, [requestPermission]);

  /**
   * The shutter.
   *
   * Every file this makes is accounted for on every path: the camera's
   * own frame is deleted as soon as it has been shrunk, the shrunk copy
   * as soon as it has been written into the journal, and the journal
   * copies themselves if the session they were written for never lands.
   * A failed photograph should cost nothing but a moment.
   */
  const capture = useCallback(() => {
    if (shooting.current) return;
    shooting.current = true;
    setPhase('saving');

    (async () => {
      const device = camera.current;
      if (!device) throw new PhotoFailure('capture');

      const frame = await device.captureFrame();

      // The camera's full-size frame is a cache file nothing purges
      // promptly, and it is finished with the moment it is shrunk.
      const shot = await shrinkAndDiscard(frame);

      const stored = await persistCapture(
        shot.uri,
        plainPhotoKey(Date.now()),
        angle,
      ).finally(() => {
        // The journal has its own copy now, or nothing does; either way
        // the working file has done its job.
        deletePhotoFiles([shot.uri]);
      });

      const saved = addSession([plainPhotoRecord(stored, new Date().toISOString(), angle)]);
      if (!saved) {
        deletePhotoFiles([stored.uri, stored.thumbnailUri]);
        throw new PhotoFailure('noJourney');
      }

      // The update it just made, rather than back to the chooser: the
      // picture is the point, and this is where it lives now.
      router.replace(`/session/${saved.id}`);
    })().catch((error: unknown) => {
      // The latch lifts only on a failure: on success the screen has
      // already left for the update it just saved.
      shooting.current = false;
      setFailure(photoFailureKind(error));
      setPhase('error');
    });
  }, [addSession, angle, router]);

  /* ------------------------------ permission ----------------------------- */

  /*
    The sample path needs no permission: there is no sensor to open. On
    everything else the answer is awaited before anything mounts, so the
    camera is never asked to start without one.
  */
  if (!sample) {
    if (!permission) {
      return <View style={{ flex: 1, backgroundColor: darkColors.background }} />;
    }
    if (!permission.granted) {
      return (
        <CameraAccess
          denied={!permission.canAskAgain}
          onContinue={askForCamera}
          onClose={close}
        />
      );
    }
  }

  /* -------------------------------- camera ------------------------------- */

  const saving = phase === 'saving';

  return (
    <View style={{ flex: 1, backgroundColor: darkColors.background }}>
      <StatusBar style="light" />

      {sample ? (
        <SamplePlainCamera
          ref={camera}
          active={phase !== 'error'}
          // Any bundled frame will do — this screen reads nothing in it.
          // The front example is simply the one a camera opens on.
          sampleSource={content.angles.front.example}
        />
      ) : (
        <ExpoPlainCamera ref={camera} active={phase !== 'error'} facing={facing} />
      )}

      <RoundControl
        glyph="close"
        label={PHOTO_COPY.camera.close}
        onPress={close}
        style={{ position: 'absolute', top: insets.top + spacing.sm, left: spacing.lg }}
      />

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: insets.bottom + spacing.xl,
          alignItems: 'center',
          gap: spacing.lg,
          paddingHorizontal: spacing.xxl,
        }}>
        <View
          style={{
            backgroundColor: darkColors.photoScrim,
            borderRadius: radius.pill,
            paddingVertical: spacing.xs + 1,
            paddingHorizontal: spacing.lg,
          }}>
          <Text variant="footnote" color="textOnPhoto" center>
            {PHOTO_COPY.camera.hint}
          </Text>
          {/*
            Quieter than the hint above it, because it is a fact about
            filing rather than an instruction — but present, because the
            journal will caption this picture with it.
          */}
          <Text
            variant="caption"
            color="textOnPhoto"
            center
            style={{ marginTop: spacing.xxs, opacity: 0.75 }}>
            {FILED_COPY[lens]}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'stretch',
          }}>
          <View style={{ flex: 1 }} />
          <Shutter onPress={capture} busy={saving} />
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            {/*
              No flip control on the simulator's stand-in: there is no
              second camera to turn to, and a control that does nothing is
              worse than no control.
            */}
            {sample ? null : (
              <RoundControl glyph="retake" label={PHOTO_COPY.camera.flip} onPress={flip} />
            )}
          </View>
        </View>
      </View>

      {saving ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.fast)}
          pointerEvents="auto"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: darkColors.scrim,
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.md,
            },
          ]}>
          <ActivityIndicator color={darkColors.text} />
          <Text variant="subhead" style={{ color: darkColors.textSecondary }}>
            {PHOTO_COPY.camera.saving}
          </Text>
        </Animated.View>
      ) : null}

      {phase === 'error' ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: darkColors.scrim,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: spacing.xxl,
              gap: spacing.xl,
            },
          ]}>
          <Text variant="body" center style={{ color: darkColors.text }}>
            {FAILURE_COPY[failure]}
          </Text>
          <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
            <Button label={PHOTO_COPY.error.retry} onPress={() => setPhase('camera')} />
            <Button label={PHOTO_COPY.error.dismiss} variant="ghost" onPress={close} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------- controls ------------------------------- */

/** The shutter: a ring with a bead in it, the way a camera's shutter reads. */
function Shutter({ onPress, busy }: { onPress: () => void; busy: boolean }) {
  const inner = SHUTTER_SIZE - (SHUTTER_RING + SHUTTER_GAP) * 2;

  return (
    <PressableScale
      onPress={onPress}
      disabled={busy}
      haptic="medium"
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={PHOTO_COPY.camera.shutter}
      accessibilityState={{ disabled: busy, busy }}
      style={{
        width: SHUTTER_SIZE,
        height: SHUTTER_SIZE,
        borderRadius: SHUTTER_SIZE / 2,
        borderWidth: SHUTTER_RING,
        borderColor: darkColors.text,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: busy ? 0.5 : 1,
      }}>
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: darkColors.text,
        }}
      />
    </PressableScale>
  );
}

/** Close, and flip. Two small dark beads over the picture. */
function RoundControl({
  glyph,
  label,
  onPress,
  style,
}: {
  glyph: 'close' | 'retake';
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        {
          width: CONTROL_SIZE,
          height: CONTROL_SIZE,
          borderRadius: CONTROL_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: darkColors.photoScrim,
        },
        style,
      ]}>
      <Icon name={glyph} size={iconSize.sm} color={darkColors.textOnPhoto} />
    </PressableScale>
  );
}

/* -------------------------------- access -------------------------------- */

/**
 * Camera permission, on this screen's own dark ground.
 *
 * The scanner's `PermissionView` says what it says about a scan, and
 * this camera does not scan; the shape is the same and the words are
 * this screen's own. No dead end: after a refusal the system will not
 * ask again, so the only route that still works is offered instead.
 */
function CameraAccess({
  denied,
  onContinue,
  onClose,
}: {
  denied: boolean;
  onContinue: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const copy = PHOTO_COPY.permission;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: darkColors.background,
        paddingTop: insets.top + spacing.giant,
        paddingBottom: insets.bottom + spacing.xl,
        paddingHorizontal: spacing.xxl,
        justifyContent: 'space-between',
      }}>
      <StatusBar style="light" />
      <View style={{ alignItems: 'center', gap: spacing.lg }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: radius.pill,
            backgroundColor: darkColors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="camera" size={iconSize.xl} color={darkColors.text} />
        </View>
        <Text variant="title2" center style={{ color: darkColors.text }}>
          {copy.title}
        </Text>
        <Text variant="body" center style={{ color: darkColors.textSecondary }}>
          {denied ? copy.denied : copy.body}
        </Text>
      </View>

      <View style={{ gap: spacing.md, minHeight: MIN_TOUCH_TARGET }}>
        {denied ? (
          <Button
            label={copy.openSettings}
            icon="settings"
            onPress={() => {
              Linking.openSettings().catch(() => undefined);
            }}
          />
        ) : (
          <Button label={copy.cta} onPress={onContinue} />
        )}
        <Button label={copy.close} variant="ghost" onPress={onClose} />
      </View>
    </View>
  );
}

/* ------------------------------- the camera ------------------------------ */

/**
 * expo-camera, wearing this screen's handle.
 *
 * The scanner's own expo fallback is the model for the options here, and
 * for the same reasons: `skipProcessing` stays off because on Android it
 * can hand back an unrotated or empty frame, and the file is mirrored to
 * match the preview when the front lens is in use, as every stored
 * photograph in the app is.
 */
function ExpoPlainCamera({
  ref,
  active,
  facing,
}: {
  ref?: Ref<PlainCameraHandle>;
  active: boolean;
  facing: CameraType;
}) {
  const view = useRef<CameraView>(null);

  useImperativeHandle(
    ref,
    (): PlainCameraHandle => ({
      async captureFrame() {
        const view_ = view.current;
        if (!view_) throw new PhotoFailure('capture');
        try {
          const photo = await view_.takePictureAsync({ quality: 0.9 });
          // `takePictureAsync` rejects when the sensor is not ready or
          // the OS takes it away mid-session, which is the common real
          // failure on a device; either way it is a failure to take a
          // picture and is reported as one.
          if (!photo) throw new PhotoFailure('capture');
          return photo.uri;
        } catch (error) {
          throw asCaptureFailure(error);
        }
      },
    }),
    [],
  );

  return (
    <CameraView
      ref={view}
      style={StyleSheet.absoluteFill}
      facing={facing}
      mode="picture"
      active={active}
      mirror={facing === 'front'}
    />
  );
}

/**
 * The simulator's stand-in, with no drawn face and nothing to track.
 *
 * `SampleCamera` photographs its own preview, marker and all, so what
 * lands in the journal on a simulator is a real JPEG that says on its
 * face what it is.
 */
function SamplePlainCamera({
  ref,
  active,
  sampleSource,
}: {
  ref?: Ref<PlainCameraHandle>;
  active: boolean;
  sampleSource?: number;
}) {
  const inner = useRef<TrackedCameraHandle>(null);
  const ignoreFace = useCallback(() => undefined, []);

  useImperativeHandle(
    ref,
    (): PlainCameraHandle => ({
      async captureFrame() {
        const stand = inner.current;
        if (!stand) throw new PhotoFailure('capture');
        try {
          // The stand-in throws "Sample frame not loaded" before its
          // bundled frame has decoded — a failure to take a picture,
          // and it used to be reported as a failure to save one.
          const frame = await stand.takePhoto();
          return frame.uri;
        } catch (error) {
          throw asCaptureFailure(error);
        }
      },
    }),
    [],
  );

  return (
    <SampleCamera ref={inner} active={active} onFace={ignoreFace} sampleSource={sampleSource} />
  );
}
