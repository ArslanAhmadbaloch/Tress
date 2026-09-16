/**
 * The camera with eyes: VisionCamera plus the ML Kit face detector.
 *
 * The detector runs as a native camera output, not as a JavaScript frame
 * processor. Frames go from the sensor to ML Kit and back without ever
 * touching JS, and what crosses the bridge is a handful of numbers per
 * frame — a box and three angles. That keeps the preview smooth on a
 * mid-range Android phone, and it means this file needs no worklets
 * runtime, which matters because Reanimated pins its own.
 *
 * Everything stays on the device. ML Kit's face model ships inside the
 * app binary; the detector makes no network calls, and neither does
 * anything here. The store listing's promise holds.
 *
 * This module touches native code the moment it is imported —
 * VisionCamera creates its factory at module scope — so it is never
 * imported directly. `tracked-camera` loads it lazily and falls back to
 * expo-camera if the native side is missing.
 */

import { File } from 'expo-file-system';
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet } from 'react-native';
import {
  CommonResolutions,
  useCameraDevice,
  usePhotoOutput,
  type CameraDevice,
  type CameraRef,
  type CapturePhotoCallbacks,
  type CapturePhotoSettings,
  type QualityPrioritization,
  type Size,
} from 'react-native-vision-camera';
import { Camera, type Face } from 'react-native-vision-camera-face-detector';
import type { Image } from 'react-native-nitro-image';

import type {
  CameraCapabilities,
  PreviewFrame,
  TrackedCameraProps,
} from './types';

/**
 * Smallest face worth reporting, as a fraction of frame width. A phone at
 * arm's length puts the face at roughly a third of the frame; anything
 * much under a fifth is somebody in the background, or the wall.
 */
const MIN_FACE_SIZE = 0.2;

/**
 * One settings object, used for every shot and handed to `prepareSettings`
 * ahead of the first one. Pre-allocation only helps a capture made with
 * settings that were actually prepared, so these must be the same object
 * in both places, not two objects that happen to agree today.
 *
 * The haptic already marks the shutter; a sound on top of it, in a
 * bathroom at seven in the morning, is not a feature.
 */
const CAPTURE_SETTINGS: CapturePhotoSettings = {
  flashMode: 'off',
  enableShutterSound: false,
};

/**
 * The size of the early display frame, where the device can deliver one.
 *
 * It is on screen for the length of one flight and starts at full width,
 * so 480 is a compromise: small enough that encoding it costs a few
 * milliseconds rather than competing with the photograph it is standing
 * in for, large enough not to read as a thumbnail stretched across a
 * phone. The aspect matches the photo output's 3:4, so nothing is
 * cropped between the frame that flies and the file that lands.
 */
const PREVIEW_IMAGE_SIZE: Size = { width: 480, height: 640 };

/** Compression for that same throwaway frame. Display only, never stored. */
const PREVIEW_QUALITY = 80;

/** What a camera reports when nothing has told it otherwise. */
const NO_LEVERS: CameraCapabilities = { previewFrame: false, fastShutter: false };

/**
 * How long to wait for the device list before opening the camera anyway.
 *
 * `useCameraDevice` reads a promise created at the library's module scope
 * and resolves a render or two later, so on a healthy phone this timer is
 * cleared long before it fires. It exists for the phone where the list
 * never arrives — an empty device list, a factory that rejected — because
 * the alternative to a timeout there is a preview that never appears and
 * never says why. When it fires the camera opens with no levers, which is
 * exactly the camera that shipped before either lever existed.
 */
const DEVICE_WAIT_MS = 500;

/**
 * Decides once what this device can do, then mounts the camera.
 *
 * The split matters more than it looks. Both levers below are properties
 * of the photo output, and `usePhotoOutput` rebuilds that output — and
 * with it reconfigures the whole capture session — whenever either
 * changes. `useCameraDevice` resolves asynchronously, so reading the
 * capabilities inside the camera and letting them flip from "unknown" to
 * "known" guaranteed exactly one session reconfiguration a moment after
 * mount, on every device that supports either lever, while the preview
 * was still starting and on the first capture of every app launch.
 *
 * So nothing mounts until there is an answer, and the camera below then
 * freezes the answer it was mounted with. A device list that changes
 * later — someone attaching an external camera mid-scan — is deliberately
 * ignored, for the same reason: no rebuild, ever, after the session is
 * running.
 *
 * The cost is that this renders nothing for the render or two before the
 * list arrives. Nothing is visible either way — a camera preview takes
 * far longer than that to show a first frame — and the screen already
 * holds its own background behind whatever the camera is doing. The
 * handle is absent for the same moment, which the capture screen already
 * checks for before every shutter.
 */
export const VisionTrackedCamera = memo(function VisionTrackedCamera(
  props: TrackedCameraProps,
) {
  /*
    `useCameraDevice('front')` and the view's `device="front"` resolve to
    the same camera: an unfiltered lookup goes through
    `getDefaultCamera('front')`, which is the pick the native side makes
    from that same string. The view is still handed the position rather
    than the device object, because changing that would risk configuring a
    different front camera than the one every stored photograph was
    framed on.
  */
  const device = useCameraDevice('front');
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (device !== undefined) return undefined;
    const timer = setTimeout(() => setWaited(true), DEVICE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [device]);

  if (device === undefined && !waited) return null;
  return <VisionCameraStage {...props} initialCapabilities={leversOf(device)} />;
});

function leversOf(device: CameraDevice | undefined): CameraCapabilities {
  if (device === undefined) return NO_LEVERS;
  return {
    /*
      Preview image delivery costs extra processing in the pipeline, so
      it is asked for only where it can actually be delivered: paying for
      a frame that will never arrive is worse than not having it.
    */
    previewFrame: device.supportsPreviewImage === true,
    /*
      `qualityPrioritization: 'speed'` throws on a device that does not
      support it, so it is never simply attempted — an unsupported phone
      would raise one exception per shutter, and a sweep takes several.
    */
    fastShutter: device.supportsSpeedQualityPrioritization === true,
  };
}

/**
 * Its callbacks are held in refs so that it re-renders only when `active`
 * changes. The detector's camera wrapper rebuilds its native output on
 * every render it receives, and each rebuild reconfigures the capture
 * session — so a screen that re-renders on every guidance message must
 * not be allowed to pass that through.
 */
function VisionCameraStage({
  ref,
  active,
  onFace,
  onError,
  initialCapabilities,
}: TrackedCameraProps & { initialCapabilities: CameraCapabilities }) {
  const camera = useRef<CameraRef>(null);

  /*
    Read once, at mount, and never read again — a later value of the prop
    is ignored on purpose. This is the second half of the latch described
    above: the gate will not mount this component until it has an answer,
    and this makes sure that the answer it mounted with is the one the
    photo output is built from for the life of the camera, whatever the
    device list does afterwards.
  */
  const [capabilities] = useState(initialCapabilities);

  const onFaceRef = useRef(onFace);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onFaceRef.current = onFace;
    onErrorRef.current = onError;
  }, [onFace, onError]);

  /*
    Every throwaway display frame this camera has written and not yet been
    told it can delete. See `deliverPreview`.
  */
  const outstandingPreviews = useRef(new Set<string>());
  useEffect(() => {
    const held = outstandingPreviews;
    return () => {
      for (const uri of held.current) discardPreview(uri);
      held.current.clear();
    };
  }, []);

  /*
    Asking the pipeline to favour speed is what makes several photographs
    inside one continuous turn feasible. It is set on the output, so it is
    set for every photograph this camera takes, held shots included — the
    session cannot be re-prioritised per shot without reconfiguring it,
    and reconfiguring mid-screen would drop the preview.

    Worth stating plainly because it is not free: a device that takes this
    path gives up whatever multi-frame work it would otherwise do, so its
    files are a little noisier than they were. Whether that trade is right
    for the held angles as well as the swept ones is a question for a
    device and an eye, not for this file. The fallback is the behaviour
    that shipped.
  */
  const prioritization: QualityPrioritization = capabilities.fastShutter
    ? 'speed'
    : 'balanced';

  /*
    Quad-HD rather than the 12-megapixel default. Every kept photograph is
    re-encoded at 1440 pixels on its long edge before it is stored, so
    pixels beyond that are decoded, shrunk and thrown away — at a cost of
    about a second on older phones, paid at the shutter, where a second is
    most noticeable.

    Every argument here is fixed for the life of this component — the
    capabilities were resolved before it mounted, and `PREVIEW_IMAGE_SIZE`
    is one module-level object — so the output is built exactly once and
    the session is configured exactly once.
  */
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.QHD_4_3,
    quality: 0.9,
    qualityPrioritization: prioritization,
    previewImageTargetSize: capabilities.previewFrame ? PREVIEW_IMAGE_SIZE : undefined,
  });
  const outputs = useMemo(() => [photoOutput], [photoOutput]);

  /*
    Pre-allocates the buffers the first capture would otherwise allocate
    while somebody is waiting for it. A no-op on Android by design, and on
    any build whose native side does not carry the method — which is why
    the whole thing sits inside a try: a camera that cannot be warmed is
    still a camera, and nothing above this should ever hear about it.
  */
  const prewarm = useCallback(() => {
    try {
      const prepared = photoOutput.prepareSettings([CAPTURE_SETTINGS]);
      prepared.catch(() => undefined);
    } catch {
      // Warming is an optimisation. Failing to warm is not an error the
      // person taking a photograph has any use for.
    }
  }, [photoOutput]);

  useEffect(() => {
    prewarm();
  }, [prewarm]);

  useImperativeHandle(
    ref,
    () => ({
      capabilities,
      prewarm,
      async takePhoto(options) {
        const onPreview = options?.onPreview;
        const callbacks: CapturePhotoCallbacks =
          onPreview && capabilities.previewFrame
            ? {
                onPreviewImageAvailable: (image) =>
                  deliverPreview(image, outstandingPreviews.current, onPreview),
              }
            : {};

        const { filePath } = await photoOutput.capturePhotoToFile(
          CAPTURE_SETTINGS,
          callbacks,
        );
        // VisionCamera hands back a bare filesystem path; everything
        // downstream (the image manipulator, expo-image) expects a URI.
        return { uri: toUri(filePath) };
      },
    }),
    [photoOutput, capabilities, prewarm],
  );

  const handleFaces = useCallback((faces: Face[]) => {
    if (faces.length === 0) {
      onFaceRef.current(null);
      return;
    }

    // The largest face is the one holding the phone. Anyone else in the
    // frame is background, and is not reported.
    let best = faces[0];
    for (const face of faces) {
      if (face.bounds.width * face.bounds.height > best.bounds.width * best.bounds.height) {
        best = face;
      }
    }

    const { x, y, width, height } = best.bounds;
    onFaceRef.current({
      cx: x + width / 2,
      cy: y + height / 2,
      width,
      height,
      yaw: best.yawAngle,
      // ML Kit reports all three Euler angles in this configuration —
      // they are withheld only when contour detection is asked for
      // alongside "fast" and no landmarks, which is not what runs here.
      // They are passed through exactly as given, including when one of
      // them is not a number: `poseCue` and the sweep's gates both refuse
      // a reading they cannot read, and reporting a head at an angle this
      // file invented would be worse than reporting the angle it got.
      pitch: best.pitchAngle,
      roll: best.rollAngle,
      at: Date.now(),
    });
  }, []);

  const handleError = useCallback((error: Error) => {
    onErrorRef.current?.(error);
  }, []);

  return (
    <Camera
      ref={camera}
      style={StyleSheet.absoluteFill}
      device="front"
      isActive={active}
      outputs={outputs}
      /*
        Mirrored, on the outputs as well as the preview, so the file
        matches what was composed on screen. Comparisons stay sound
        because every photograph is mirrored the same way — and the
        detector is told the same, so its boxes land on the face rather
        than on its reflection.
      */
      mirrorMode="auto"
      resizeMode="cover"
      cameraFacing="front"
      autoMode
      performanceMode="fast"
      minFaceSize={MIN_FACE_SIZE}
      onFacesDetected={handleFaces}
      onError={handleError}
    />
  );
}

function toUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

/**
 * Deletes one throwaway display frame, and says nothing either way.
 *
 * A file that is already gone, or a build where the filesystem module is
 * missing, is the outcome this wanted anyway.
 */
function discardPreview(uri: string): void {
  try {
    new File(uri).delete();
  } catch {
    // Nothing above this can act on a failed cleanup, so nothing above
    // this is told about one.
  }
}

/**
 * Turns the early display frame into something the screen can render.
 *
 * This runs inside a native callback in the middle of a capture, so it
 * cannot be allowed to throw and it cannot be allowed to be awaited: the
 * photograph is the job, and this is a nicety that makes the shutter feel
 * immediate. Every failure path ends in silence, and the flying frame
 * simply waits for the real file instead.
 *
 * The dimensions are read before the first `await`. The frame is a native
 * object with a lifetime of its own, and reading it after the hop is how
 * you find that out the hard way.
 *
 * **The file it writes is rubbish, and rubbish has an owner.** It goes to
 * the system temporary directory on iOS and the app cache on Android, and
 * neither is purged in any hurry — three to five stranded JPEGs per sweep
 * would be a slow leak with nobody's name on it. So the frame carries a
 * `release`, and the camera remembers every file it has handed out until
 * either that release is called or the camera unmounts, whichever comes
 * first. Whoever is showing the frame decides when it stops being shown;
 * forgetting to say so costs a few kilobytes until the screen closes,
 * not a growing pile on somebody's phone.
 */
function deliverPreview(
  image: Image,
  outstanding: Set<string>,
  onPreview: (frame: PreviewFrame) => void,
): void {
  try {
    const { width, height } = image;
    image
      .saveToTemporaryFileAsync('jpg', PREVIEW_QUALITY)
      .then((path) => {
        const previewUri = toUri(path);
        outstanding.add(previewUri);

        // The native frame has done its work the moment it is on disk.
        // Disposing is optional — the collector would get there — but
        // there is no reason to hold a decoded bitmap through a flight.
        try {
          image.dispose();
        } catch {
          // An undisposable frame is still a frame that has been saved.
        }

        onPreview({
          previewUri,
          width,
          height,
          release: () => {
            if (!outstanding.delete(previewUri)) return;
            discardPreview(previewUri);
          },
        });
      })
      .catch(() => undefined);
  } catch {
    // No early frame this time. The photograph is unaffected.
  }
}
