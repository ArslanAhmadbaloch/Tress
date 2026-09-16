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

import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { CommonResolutions, usePhotoOutput, type CameraRef } from 'react-native-vision-camera';
import { Camera, type Face } from 'react-native-vision-camera-face-detector';

import type { TrackedCameraProps } from './types';

/**
 * Smallest face worth reporting, as a fraction of frame width. A phone at
 * arm's length puts the face at roughly a third of the frame; anything
 * much under a fifth is somebody in the background, or the wall.
 */
const MIN_FACE_SIZE = 0.2;

/**
 * Memoised, and its callbacks held in refs, so that it re-renders only
 * when `active` changes. The detector's camera wrapper rebuilds its
 * native output on every render it receives, and each rebuild
 * reconfigures the capture session — so a screen that re-renders on
 * every guidance message must not be allowed to pass that through.
 */
export const VisionTrackedCamera = memo(function VisionTrackedCamera({
  ref,
  active,
  onFace,
  onError,
}: TrackedCameraProps) {
  const camera = useRef<CameraRef>(null);

  const onFaceRef = useRef(onFace);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onFaceRef.current = onFace;
    onErrorRef.current = onError;
  }, [onFace, onError]);

  /*
    Quad-HD rather than the 12-megapixel default. Every kept photograph is
    re-encoded at 1440 pixels on its long edge before it is stored, so
    pixels beyond that are decoded, shrunk and thrown away — at a cost of
    about a second on older phones, paid at the shutter, where a second is
    most noticeable.
  */
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.QHD_4_3,
    quality: 0.9,
  });
  const outputs = useMemo(() => [photoOutput], [photoOutput]);

  useImperativeHandle(
    ref,
    () => ({
      async takePhoto() {
        const { filePath } = await photoOutput.capturePhotoToFile(
          // The haptic already marks the shutter; a sound on top of it,
          // in a bathroom at seven in the morning, is not a feature.
          { flashMode: 'off', enableShutterSound: false },
          {},
        );
        // VisionCamera hands back a bare filesystem path; everything
        // downstream (the image manipulator, expo-image) expects a URI.
        return { uri: filePath.startsWith('file://') ? filePath : `file://${filePath}` };
      },
    }),
    [photoOutput],
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
      // The reducer reads an absent angle as level, so passing them
      // through unguarded costs nothing on a build that omits them.
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
});
