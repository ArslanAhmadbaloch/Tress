/**
 * ARKit face tracking for the Tress hair scan.
 *
 * A local Expo module: it lives in `modules/`, is autolinked by
 * expo-modules-autolinking, and is not an npm dependency. Import it by
 * path from the app — `import { … } from '../../modules/hair-face-tracking'`.
 *
 * iOS only, and only on an iPhone with a TrueDepth camera. Everywhere else
 * `isFaceTrackingAvailable()` is false, `HairFaceTrackingView` renders
 * nothing, and the scan keeps to the ML Kit path.
 *
 * ARKit and react-native-vision-camera cannot share the front camera. A
 * screen that mounts `HairFaceTrackingView` must not mount VisionCamera.
 *
 * `toRawFace` is the only conversion a screen needs: it turns one frame
 * into the shape `src/features/hair-scan/tracking.ts` reads, scaled into
 * the preview's own points and stamped `source: 'arkit'`. README.md has
 * the whole wiring in a dozen lines.
 *
 * `sampleFrame` is the other half of the AR session a screen can reach:
 * a small square of the live frame as raw bytes, for anything that needs
 * pixels rather than a pose. It writes no file and keeps nothing. Ask
 * `canSampleFrame()` first — an iPhone that tracks a face can still be
 * running a binary built before that function existed.
 */

export {
  HairFaceTrackingView,
  canSampleFrame,
  capture,
  isFaceTrackingAvailable,
  nativeModule,
  sampleFrame,
} from './src/native';

export {
  SAMPLE_CHANNELS,
  SAMPLE_MAX,
  SAMPLE_MIN,
  SAMPLE_SIZE,
  clampSampleSize,
  normaliseSample,
} from './src/sample';

export type { FrameSample } from './src/sample';

export {
  BROW_START,
  COAST_MS,
  COVERS_CROWN,
  INNER_RADIUS,
  POINT_COUNT,
  POINT_VALUES,
  RIM_START,
  RING_POINTS,
  RING_STEP_DEG,
  hasFullMesh,
  isFaceFrame,
  isFaceLost,
  isTracking,
  pointAt,
  resolveAvailability,
  ringAngle,
} from './src/points';

export { toRawFace } from './src/raw-face';

export type { ArkitRawFace, ViewSize } from './src/raw-face';

export type {
  CaptureResult,
  FaceEvent,
  FaceFrame,
  FaceLost,
  HairFaceTrackingViewProps,
} from './src/types';
