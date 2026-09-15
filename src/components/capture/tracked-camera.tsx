/**
 * The capture screen's camera, with head tracking when the build has it.
 *
 * Two implementations sit behind one component. VisionCamera with the
 * on-device face detector is the one the app is meant to ship with; it
 * is what lets the guide follow the head and say "move closer" rather
 * than hoping. It is also a native module, which means it exists only in
 * a binary built after it was added — not in Expo Go, and not in a
 * development client from before.
 *
 * So it is loaded lazily, inside a try. If the native side is missing the
 * require throws, the throw is caught, and the screen gets expo-camera
 * instead: the same shutter, the same files, no tracking. The fallback is
 * also where the camera lands if VisionCamera starts and then fails —
 * a photograph taken without guidance beats no photograph.
 */

import { CameraView } from 'expo-camera';
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { nitroAvailable } from '@/lib/native';

import type { TrackedCameraHandle, TrackedCameraProps } from './types';

type VisionModule = typeof import('./vision-camera');

let vision: VisionModule | null | undefined;

/**
 * The VisionCamera implementation, or null if this binary lacks it.
 * Resolved once: the answer depends on the build, not on the moment.
 */
function loadVision(): VisionModule | null {
  if (vision !== undefined) return vision;
  // Asked before the require, not around it: see `nitroAvailable`.
  if (!nitroAvailable()) {
    vision = null;
    return vision;
  }
  try {
    // A synchronous require, not an import: the point is that evaluating
    // the module can throw, and a static import would throw at app start
    // instead of here where it can be caught.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    vision = require('./vision-camera') as VisionModule;
  } catch {
    vision = null;
  }
  return vision;
}

/** Whether this build can follow a head at all. */
export function headTrackingAvailable(): boolean {
  return loadVision() !== null;
}

export function TrackedCamera({
  onTrackingChanged,
  ...props
}: TrackedCameraProps & {
  /**
   * Tells the screen whether faces will be reported. Fires on mount and
   * again if VisionCamera fails and the fallback takes over.
   */
  onTrackingChanged?: (tracking: boolean) => void;
}) {
  const [visionFailed, setVisionFailed] = useState(false);
  const module = visionFailed ? null : loadVision();
  const tracking = module !== null;

  useEffect(() => {
    onTrackingChanged?.(tracking);
  }, [tracking, onTrackingChanged]);

  // Stable, so the memoised VisionCamera child is not re-rendered — and
  // its session reconfigured — every time this screen renders.
  const onErrorRef = useRef(props.onError);
  useEffect(() => {
    onErrorRef.current = props.onError;
  }, [props.onError]);
  const handleVisionError = useCallback((error: Error) => {
    // Reported once, then the fallback owns the screen. A second error
    // from a camera that has already been replaced would only confuse
    // the person reading the first.
    setVisionFailed(true);
    onErrorRef.current?.(error);
  }, []);

  if (module) {
    return <module.VisionTrackedCamera {...props} onError={handleVisionError} />;
  }

  return <ExpoTrackedCamera {...props} />;
}

/**
 * expo-camera, wearing the same interface. It reports no faces, ever;
 * the screen reads that as "tracking off" and shows its plain guide.
 */
function ExpoTrackedCamera({ ref, active }: TrackedCameraProps) {
  const camera = useRef<CameraView>(null);

  useImperativeHandle(
    ref,
    (): TrackedCameraHandle => ({
      async takePhoto() {
        if (!camera.current) throw new Error('Camera is not ready');
        // `skipProcessing` is deliberately off: it shaves a little latency
        // but on Android it can hand back an unrotated or empty frame, and
        // a black progress photo is worse than a slightly slower shutter.
        const photo = await camera.current.takePictureAsync({ quality: 0.9 });
        if (!photo) throw new Error('Camera returned no photo');
        return { uri: photo.uri };
      },
    }),
    [],
  );

  return (
    <CameraView
      ref={camera}
      /*
        What you see is what gets saved.

        iOS mirrors the front-camera preview, and the `mirror` prop does
        not change that — set true or false the viewfinder is
        pixel-identical, so it only ever reaches the captured file.
        Leaving it false wrote the file as true optics while the preview
        showed a mirror, and every shot came out flipped from the thing
        that had just been composed.

        So the file is mirrored to match the preview. The cost is that it
        is a mirror image: "Left Side" frames the left side as its owner
        sees it in a mirror, not as a camera would record it. Comparisons
        stay sound because every photo is mirrored the same way; what
        matters is that they are all treated alike.
      */
      style={StyleSheet.absoluteFill}
      facing="front"
      mode="picture"
      active={active}
      mirror={true}
    />
  );
}
