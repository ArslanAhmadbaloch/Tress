/**
 * The hair scan's camera: a live front preview that reports a face, with
 * its contours, on every frame it can.
 *
 * Three implementations sit behind one component, exactly as they do for
 * the capture screen's TrackedCamera — the pattern is copied rather than
 * shared because this one asks the detector for something different.
 *
 *   VisionCamera + ML Kit, contours on. The one the app ships with. The
 *   detector runs as a native camera output, so frames go from the sensor
 *   to ML Kit and back without touching JavaScript; what crosses the
 *   bridge per frame is a box, three angles and about a hundred and
 *   thirty points, already converted into preview-view coordinates. No
 *   frame processor, no worklets runtime, no network. Everything stays on
 *   the device.
 *
 *   expo-camera. A build without the native module — Expo Go, an older
 *   development client — still gets a live preview and a shutter. It
 *   reports no faces, ever, and says so through `onTrackingChanged`.
 *
 *   SampleCamera. The simulator has no sensor at all, so a development
 *   build there shows a bundled frame that photographs itself, marked as
 *   a sample in the pixels. With `demoTracking` it also emits a drawn
 *   face so the mesh and the tracking can be watched on a machine with no
 *   camera. That face is not a reading of anything, and the camera that
 *   produces it is the one that burns "sample" into every frame.
 *
 * ── Loading the native side ────────────────────────────────────────────
 * VisionCamera touches native code the moment its module is evaluated, so
 * it is never imported statically. It is loaded with a dynamic import,
 * and only after `nitroAvailable()` has confirmed the runtime it needs is
 * in this binary — Metro reports a late module's load error as fatal
 * rather than throwing it, so the question has to be asked first. The
 * capture screen's TrackedCamera does the same with a synchronous
 * `require` inside a try; that needs a lint suppression this feature is
 * not allowed, and the guard — nitroAvailable() first — is identical, so
 * the import is the same decision in the form the lint rules accept.
 *
 * ── The one rule about re-rendering ────────────────────────────────────
 * The detector's camera wrapper rebuilds its native output on every
 * render it receives, and each rebuild reconfigures the capture session.
 * So the native camera is mounted once, behind a memo, and receives only
 * `active` and callbacks that never change identity. Anything that
 * changes per frame — the face handler, the view size — reaches it
 * through a ref.
 */

import { CameraView } from 'expo-camera';
import type { CameraOutput } from 'react-native-vision-camera';
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type Ref,
} from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { SampleCamera, sampleCameraActive } from '@/components/capture/sample-camera';
import type { TrackedCameraHandle } from '@/components/capture/types';
import {
  CONTOUR_NAMES,
  syntheticFace,
  type Contours,
  type RawFace,
  type ViewSize,
} from '@/features/hair-scan/tracking';
import { nitroAvailable } from '@/lib/native';
import { shrinkCapture } from '@/lib/photo-storage';

/** A captured frame, already brought down to storage size. */
export type ScannerPhoto = {
  uri: string;
  width: number;
  height: number;
};

export type ScannerCameraHandle = {
  /**
   * Takes one photograph, shrinks it to storage size and resolves with
   * its file and real dimensions. Rejects if the camera could not.
   */
  takePhoto(): Promise<ScannerPhoto>;
};

/**
 * Called for every processed frame with the most prominent face, or null
 * when there is none, and the size of the preview the coordinates are
 * in. It runs on the JS thread at up to camera rate: keep it cheap.
 */
export type ScannerFrameHandler = (face: RawFace | null, view: ViewSize) => void;

export type ScannerCameraProps = {
  ref?: Ref<ScannerCameraHandle>;
  /** Runs the camera. Off while a sheet is up or the scan is being processed. */
  active: boolean;
  onFrame: ScannerFrameHandler;
  /** The camera stopped working. Fired at most once per implementation. */
  onError?: (error: Error) => void;
  /**
   * Whether faces will be reported. Fires once the implementation is
   * known — at mount when it already is, otherwise when the native module
   * resolves — and again if VisionCamera fails and the fallback takes
   * over. It is not fired while the module is still loading, so a false
   * here means this camera will never report a face.
   */
  onTrackingChanged?: (tracking: boolean) => void;
  /**
   * Further native outputs for the VisionCamera implementation — the
   * lighting probe's frame output, for one. Read only by that
   * implementation; the fallbacks have no outputs to attach to. Keep the
   * array's identity stable: a new array reconfigures the capture
   * session, so build it once (a `useMemo` keyed on its members).
   */
  extraOutputs?: readonly CameraOutput[];
  /** The bundled frame the simulator's stand-in shows. Ignored by real cameras. */
  sampleSource?: number;
  /**
   * On the simulator's stand-in only: emit a drawn face at camera rate so
   * the mesh can be watched. Never has any effect on a device.
   */
  demoTracking?: boolean;
};

/* --------------------------- the native side --------------------------- */

type VisionCameraModule = typeof import('react-native-vision-camera');
type FaceDetectorModule = typeof import('react-native-vision-camera-face-detector');
type DetectedFace = import('react-native-vision-camera-face-detector').Face;

type StageProps = {
  ref?: Ref<ScannerCameraHandle>;
  active: boolean;
  onFrame: (face: RawFace | null) => void;
  onError: (error: Error) => void;
  extraOutputs?: readonly CameraOutput[];
};

type VisionScanner = ComponentType<StageProps>;

let loading: Promise<VisionScanner | null> | undefined;
let resolved: VisionScanner | null | undefined;

/**
 * The VisionCamera implementation, or null if this binary lacks it.
 * Resolved once: the answer depends on the build, not on the moment.
 */
function loadVisionScanner(): Promise<VisionScanner | null> {
  if (loading) return loading;
  if (!nitroAvailable()) {
    resolved = null;
    loading = Promise.resolve(null);
    return loading;
  }
  loading = Promise.all([
    import('react-native-vision-camera'),
    import('react-native-vision-camera-face-detector'),
  ])
    .then(([vc, fd]) => {
      resolved = buildVisionScanner(vc, fd);
      return resolved;
    })
    .catch(() => {
      resolved = null;
      return null;
    });
  return loading;
}

/**
 * Whether this build can be expected to follow a head. Synchronous and
 * conservative: true means the native runtime is present and this is a
 * real device, not that the module has finished loading.
 */
export function scannerTrackingPossible(): boolean {
  return nitroAvailable() && !sampleCameraActive();
}

/** Smallest face worth reporting, as a fraction of frame width. */
const MIN_FACE_SIZE = 0.2;

/**
 * How long to wait for the device list before opening the camera anyway.
 * See vision-camera.tsx: on a healthy phone this never fires.
 */
const DEVICE_WAIT_MS = 500;

function toUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

/** The detector's face, reduced to plain numbers and plain points. */
function toRawFace(face: DetectedFace, at: number): RawFace {
  const { x, y, width, height } = face.bounds;
  let contours: Contours | undefined;
  if (face.contours) {
    contours = {};
    for (const name of CONTOUR_NAMES) {
      const points = face.contours[name];
      if (points && points.length > 0) {
        contours[name] = points.map((p) => ({ x: p.x, y: p.y }));
      }
    }
  }
  return {
    cx: x + width / 2,
    cy: y + height / 2,
    width,
    height,
    yaw: face.yawAngle,
    pitch: face.pitchAngle,
    roll: face.rollAngle,
    contours,
    at,
  };
}

/**
 * Builds the VisionCamera implementation from the modules once they are
 * loaded. A factory rather than a module-scope component because the
 * hooks it uses live inside the module it cannot import statically.
 */
function buildVisionScanner(vc: VisionCameraModule, fd: FaceDetectorModule): VisionScanner {
  const { CommonResolutions, useCameraDevice, usePhotoOutput } = vc;
  const { Camera } = fd;

  /** One settings object, prepared once and used for every shot. */
  const CAPTURE_SETTINGS: import('react-native-vision-camera').CapturePhotoSettings = {
    flashMode: 'off',
    enableShutterSound: false,
  };

  /**
   * Decides once what the device can do, then mounts the camera. The
   * capabilities are read from the device list, which resolves a render
   * or two after mount; nothing mounts until it has, so the photo output
   * is built exactly once and the session configured exactly once.
   */
  const Gate = memo(function VisionScannerCamera(props: StageProps) {
    const device = useCameraDevice('front');
    const [waited, setWaited] = useState(false);

    useEffect(() => {
      if (device !== undefined) return undefined;
      const timer = setTimeout(() => setWaited(true), DEVICE_WAIT_MS);
      return () => clearTimeout(timer);
    }, [device]);

    if (device === undefined && !waited) return null;
    return (
      <VisionScannerStage
        {...props}
        fastShutter={device?.supportsSpeedQualityPrioritization === true}
      />
    );
  });

  function VisionScannerStage({
    ref,
    active,
    onFrame,
    onError,
    extraOutputs,
    fastShutter,
  }: StageProps & { fastShutter: boolean }) {
    // Latched at mount. A later value is ignored on purpose: the photo
    // output is built from the answer this mounted with, for its life.
    const [speed] = useState(fastShutter);

    const onFrameRef = useRef(onFrame);
    const onErrorRef = useRef(onError);
    useEffect(() => {
      onFrameRef.current = onFrame;
      onErrorRef.current = onError;
    }, [onFrame, onError]);

    /*
      Quad-HD rather than the full sensor: every kept frame is re-encoded
      at 1440 pixels on its long edge, so pixels beyond that are decoded,
      shrunk and thrown away at the shutter, where the cost shows. Speed
      over quality where the device offers it — a scan takes several
      frames inside one continuous turn and the chain from shutter to
      file has to be short.
    */
    const photoOutput = usePhotoOutput({
      targetResolution: CommonResolutions.QHD_4_3,
      quality: 0.9,
      qualityPrioritization: speed ? 'speed' : 'balanced',
    });
    // The photo output plus whatever the screen attaches (the lighting
    // probe's frame output, once its bridge has resolved). The session is
    // reconfigured when this array changes identity, which is once when
    // the probe arrives and never per frame.
    const outputs = useMemo(
      () => [photoOutput, ...(extraOutputs ?? [])],
      [photoOutput, extraOutputs],
    );

    // Pre-allocates what the first shutter would otherwise allocate while
    // somebody is waiting for it. A camera that cannot be warmed is still
    // a camera, so nothing above hears about a failure here.
    useEffect(() => {
      try {
        photoOutput.prepareSettings([CAPTURE_SETTINGS]).catch(() => undefined);
      } catch {
        // Warming is an optimisation, not a promise.
      }
    }, [photoOutput]);

    useImperativeHandle(
      ref,
      (): ScannerCameraHandle => ({
        async takePhoto() {
          const { filePath } = await photoOutput.capturePhotoToFile(CAPTURE_SETTINGS, {});
          // VisionCamera hands back a bare filesystem path; everything
          // downstream expects a URI. Shrunk before it is handed on, so
          // nothing above this ever holds a full-resolution frame.
          return shrinkCapture(toUri(filePath));
        },
      }),
      [photoOutput],
    );

    const handleFaces = useCallback((faces: DetectedFace[]) => {
      if (faces.length === 0) {
        onFrameRef.current(null);
        return;
      }
      // With contours on, ML Kit reports only the most prominent face,
      // but the choice is made explicitly anyway: the largest box is the
      // person holding the phone.
      let best = faces[0];
      for (const face of faces) {
        if (face.bounds.width * face.bounds.height > best.bounds.width * best.bounds.height) {
          best = face;
        }
      }
      onFrameRef.current(toRawFace(best, Date.now()));
    }, []);

    const handleError = useCallback((error: Error) => {
      onErrorRef.current(error);
    }, []);

    return (
      <Camera
        style={StyleSheet.absoluteFill}
        device="front"
        isActive={active}
        outputs={outputs}
        /*
          Mirrored on the outputs as well as the preview, so the file
          matches what was composed on screen — and the detector is told
          the same, so its points land on the face rather than on its
          reflection.
        */
        mirrorMode="auto"
        resizeMode="cover"
        cameraFacing="front"
        /*
          `autoMode` converts bounds, contours and landmarks from frame
          coordinates into preview-view points before they reach this
          file, so the mesh can be drawn straight over the preview.
        */
        autoMode
        performanceMode="fast"
        /*
          Contours are the mesh's raw material. Landmarks are on alongside
          them because ML Kit withholds the Euler angles when contours run
          in fast mode without landmarks — and the yaw is what the scan's
          ring turns on. Ten extra points per frame is the price of three
          angles this cannot do without.
        */
        runContours
        runLandmarks
        minFaceSize={MIN_FACE_SIZE}
        onFacesDetected={handleFaces}
        onError={handleError}
      />
    );
  }

  return Gate;
}

/* ---------------------------- the component ---------------------------- */

type VisionState = VisionScanner | null | 'pending';

function initialVisionState(): VisionState {
  if (sampleCameraActive() || !nitroAvailable()) return null;
  return resolved === undefined ? 'pending' : resolved;
}

export function ScannerCamera({
  ref,
  active,
  onFrame,
  onError,
  onTrackingChanged,
  extraOutputs,
  sampleSource,
  demoTracking = false,
}: ScannerCameraProps) {
  const [vision, setVision] = useState<VisionState>(initialVisionState);
  const [visionFailed, setVisionFailed] = useState(false);

  useEffect(() => {
    if (vision !== 'pending') return undefined;
    let live = true;
    loadVisionScanner().then((scanner) => {
      if (live) setVision(scanner);
    });
    return () => {
      live = false;
    };
  }, [vision]);

  const sample = sampleCameraActive();
  const scanner = visionFailed || sample || vision === 'pending' ? null : vision;
  const tracking = scanner !== null || (sample && demoTracking);

  useEffect(() => {
    // Not answered while the module is loading: `tracking` is false then
    // only because nothing has mounted yet, and a screen that fails on a
    // false answer would fail every scan on a phone that can track.
    if (vision === 'pending') return;
    onTrackingChanged?.(tracking);
  }, [tracking, vision, onTrackingChanged]);

  // Per-frame data reaches the memoised native camera through refs only.
  const onFrameRef = useRef(onFrame);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onFrameRef.current = onFrame;
    onErrorRef.current = onError;
  }, [onFrame, onError]);

  const viewRef = useRef<ViewSize>({ width: 0, height: 0 });
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    viewRef.current = { width, height };
  }, []);

  const emitFrame = useCallback((face: RawFace | null) => {
    onFrameRef.current(face, viewRef.current);
  }, []);

  const handleVisionError = useCallback((error: Error) => {
    // Reported once, then the fallback owns the screen.
    setVisionFailed(true);
    onErrorRef.current?.(error);
  }, []);

  let camera: ReactNode;
  if (sample) {
    camera = (
      <SampleScannerCamera
        ref={ref}
        active={active}
        sampleSource={sampleSource}
        demoTracking={demoTracking}
        onFrame={emitFrame}
      />
    );
  } else if (scanner) {
    const VisionScannerCamera = scanner;
    camera = (
      <VisionScannerCamera
        ref={ref}
        active={active}
        onFrame={emitFrame}
        onError={handleVisionError}
        extraOutputs={extraOutputs}
      />
    );
  } else if (vision === 'pending') {
    // The module is on its way. A preview takes longer than that to
    // show a first frame, so nothing is lost by waiting for the answer
    // rather than mounting a fallback that would be torn down at once.
    camera = null;
  } else {
    camera = <ExpoScannerCamera ref={ref} active={active} />;
  }

  return (
    <View style={StyleSheet.absoluteFill} onLayout={handleLayout}>
      {camera}
    </View>
  );
}

/* ------------------------------ fallbacks ------------------------------ */

/**
 * expo-camera, wearing the same interface. It reports no faces, ever;
 * the screen reads that as "tracking off".
 */
function ExpoScannerCamera({ ref, active }: { ref?: Ref<ScannerCameraHandle>; active: boolean }) {
  const camera = useRef<CameraView>(null);

  useImperativeHandle(
    ref,
    (): ScannerCameraHandle => ({
      async takePhoto() {
        if (!camera.current) throw new Error('Camera is not ready');
        // `skipProcessing` is deliberately off: on Android it can hand
        // back an unrotated or empty frame.
        const photo = await camera.current.takePictureAsync({ quality: 0.9 });
        if (!photo) throw new Error('Camera returned no photo');
        return shrinkCapture(photo.uri);
      },
    }),
    [],
  );

  return (
    <CameraView
      ref={camera}
      style={StyleSheet.absoluteFill}
      facing="front"
      mode="picture"
      active={active}
      // The file is mirrored to match the preview, as every stored
      // photograph in the app is. See tracked-camera.tsx.
      mirror={true}
    />
  );
}

/** How often the simulator's drawn face is reported: a slow camera's rate. */
const DEMO_FRAME_MS = 40;

/**
 * The simulator's stand-in, with an optional drawn face.
 *
 * The face is synthetic and the camera that shows it marks every frame
 * as a sample; nothing it reports is a reading of anything.
 */
function SampleScannerCamera({
  ref,
  active,
  sampleSource,
  demoTracking,
  onFrame,
}: {
  ref?: Ref<ScannerCameraHandle>;
  active: boolean;
  sampleSource?: number;
  demoTracking: boolean;
  onFrame: (face: RawFace | null) => void;
}) {
  const inner = useRef<TrackedCameraHandle>(null);
  const viewRef = useRef<ViewSize>({ width: 0, height: 0 });

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    viewRef.current = { width, height };
  }, []);

  useImperativeHandle(
    ref,
    (): ScannerCameraHandle => ({
      async takePhoto() {
        if (!inner.current) throw new Error('Sample camera is not ready');
        const frame = await inner.current.takePhoto();
        return shrinkCapture(frame.uri);
      },
    }),
    [],
  );

  useEffect(() => {
    if (!demoTracking || !active) return undefined;
    const started = Date.now();
    const timer = setInterval(() => {
      const view = viewRef.current;
      if (view.width === 0 || view.height === 0) return;
      // Phase from the demo's start; stamped on the wall clock, the one
      // the real detector and the screen's expiry tick both read.
      const now = Date.now();
      onFrame(syntheticFace(view, now - started, now));
    }, DEMO_FRAME_MS);
    return () => {
      clearInterval(timer);
      onFrame(null);
    };
  }, [demoTracking, active, onFrame]);

  const ignoreFace = useCallback(() => undefined, []);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={handleLayout}>
      <SampleCamera ref={inner} active={active} onFace={ignoreFace} sampleSource={sampleSource} />
    </View>
  );
}
