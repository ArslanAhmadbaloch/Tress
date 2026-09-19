/**
 * The hair scan's camera: a live front preview that reports a face, with
 * its contours, on every frame it can.
 *
 * Four implementations sit behind one component, exactly as three did for
 * the capture screen's TrackedCamera — the pattern is copied rather than
 * shared because this one asks the detector for something different.
 *
 *   ARKit, on an iPhone with a TrueDepth camera. A real 3D face anchor
 *   and head pose at 60 fps, solved from depth, which stays glued to the
 *   head through a turn that a 2D detector can only guess at. The AR view
 *   IS the preview and its stills come out of the live AR frame.
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
 * ── The one architectural rule ─────────────────────────────────────────
 * ARKit and VisionCamera cannot share the front camera. Whichever one is
 * chosen below is mounted ALONE: never both, not even for a frame while
 * one is being swapped for the other. That is why the choice is made
 * before anything mounts and why ARKit's failure path replaces the
 * implementation outright rather than layering a fallback under it.
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
  type RefObject,
} from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import {
  HairFaceTrackingView,
  capture as captureArFrame,
  isFaceFrame,
  isFaceLost,
  isFaceTrackingAvailable,
  isTracking as arkitIsTracking,
  toRawFace as arkitFaceToRaw,
  type FaceEvent,
} from '../../../modules/hair-face-tracking';

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
import { deletePhotoFiles, shrinkCapture } from '@/lib/photo-storage';
import { FRAME_MIRRORED } from '@/features/hair-scan/handedness';

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
 *
 * `held` is true when the pose is a real reading that has stopped being
 * refreshed rather than a fresh one — ARKit's coast, which repeats the
 * last tracked pose while the head is low enough that the face is out of
 * sight. The pose is honest and worth drawing; what it is NOT is
 * evidence that the head stayed where it was, and a caller that judges
 * stillness has to know the difference. Only the AR path ever sets it:
 * ML Kit either sees a face or reports none.
 */
export type ScannerFrameHandler = (face: RawFace | null, view: ViewSize, held: boolean) => void;

/**
 * Which of the four cameras is actually behind the preview.
 *
 * Reported because the choice is made here and one thing above needs it:
 * the lighting probe's frame output can only ride on a VisionCamera
 * session, and ARKit owns the lens on the AR path. It is reported again
 * if ARKit fails and ML Kit takes over, so the screen and this component
 * never disagree about which camera is mounted.
 */
export type ScannerImplementation = 'arkit' | 'mlkit' | 'sample' | 'preview';

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
   * Which camera is mounted. Fires as soon as the answer is known and
   * again whenever it changes — the one change that happens in practice
   * is ARKit failing and VisionCamera taking the screen. Not fired while
   * the VisionCamera module is still loading, because "not yet" is not an
   * implementation.
   */
  onImplementation?: (kind: ScannerImplementation) => void;
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
 * Whether this phone tracks a face in 3D: an iPhone with a TrueDepth
 * camera, running a build that contains the local ARKit module.
 *
 * False on Android always — the module's own check answers on
 * `Platform.OS` before it touches anything native — and false on the
 * simulator, which has no sensor to point at a face and shows a drawn
 * one instead.
 *
 * What it does NOT answer is whether the AR view itself resolved: the
 * hardware can support face tracking in a build whose native view
 * manager will not load, and the module renders nothing at all in that
 * state. `ArkitScannerCamera`'s watchdog is what catches it, because the
 * only way to know is to ask the running session for a frame.
 */
export function arkitScannerAvailable(): boolean {
  return isFaceTrackingAvailable() && !sampleCameraActive();
}

/**
 * Whether this build can be expected to follow a head. Synchronous and
 * conservative: true means a tracker's native side is present and this is
 * a real device, not that a module has finished loading.
 */
export function scannerTrackingPossible(): boolean {
  if (sampleCameraActive()) return false;
  return arkitScannerAvailable() || nitroAvailable();
}

/**
 * Smallest face worth reporting, as a fraction of frame width.
 *
 * ML Kit's own default, and deliberately back at it. This was 0.2, which
 * is a distance gate one layer below the engine: a face smaller than a
 * fifth of the frame was never reported at all, so the scan stayed on
 * "Looking for your face" with Start dead and nothing on screen saying
 * why — which is the exact failure build 17 was rejected for. The engine
 * now promises Start arms at any distance, and a promise the detector can
 * quietly break is not a promise. The cost of the lower figure is that
 * ML Kit considers smaller candidates on each frame; the benefit is that
 * nobody is ever again silently required to bring the phone nearer.
 */
const MIN_FACE_SIZE = 0.1;

/**
 * How long to wait for the device list before opening the camera anyway.
 * See vision-camera.tsx: on a healthy phone this never fires.
 */
const DEVICE_WAIT_MS = 500;

function toUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

/**
 * The detector's face, reduced to plain numbers and plain points.
 *
 * `source` is stamped here rather than left to default: the tracker
 * smooths an ML Kit reading hard and an ARKit one barely at all, and a
 * reading that arrives without saying where it came from gets the hard
 * filter. That is the safe way round — a smoothed ARKit pose only lags —
 * but a silent default is not a thing to rely on in the file that knows
 * the answer.
 */
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
    source: 'mlkit',
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
          Whatever `FRAME_MIRRORED` says, applied to the outputs as well
          as the preview, so the file matches what was composed on screen
          — and the detector is told the same, so its points land on the
          face rather than on its reflection. `"auto"` is VisionCamera's
          mirrored front camera; `"off"` leaves it as another person
          would see them. See `handedness.ts` before changing it: the
          iPhone path carries the same bit in Swift and the two are
          checked against each other.
        */
        mirrorMode={FRAME_MIRRORED ? 'auto' : 'off'}
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

/* ------------------------------- ARKit --------------------------------- */

/**
 * How long the AR view has to say *something* — a face, a loss, an error
 * — before it is asked outright whether it is alive.
 *
 * Generous on purpose. ARKit takes about a second to bring the session
 * up, and the check below is only reached when nothing at all has
 * arrived in four seconds, which on the ready screen means either the
 * camera is pointing at a ceiling or there is nothing behind this
 * component at all.
 */
const ARKIT_SIGNAL_MS = 4000;

/**
 * The AR preview, wearing the same interface as the other three.
 *
 * It renders the module's own view and nothing else: ARKit owns the front
 * camera while its session runs, so there is no preview to put it over
 * and no second camera to run beside it. Stills come out of the live AR
 * frame through `capture()` and are shrunk exactly as VisionCamera's are,
 * so everything downstream — the mesh on the still, the region
 * rectangles, the journal — takes the same shape of file on both
 * platforms.
 *
 * The view's size arrives as a ref from the parent, which is the one
 * thing measuring the preview. The native side speaks in fractions of
 * the rendered view and `RawFace` wants the box in preview points; the
 * module's `toRawFace` is the conversion, and it is the module's rather
 * than this file's so a test can hold it.
 */
function ArkitScannerCamera({
  ref,
  active,
  view,
  onFrame,
  onError,
}: {
  ref?: Ref<ScannerCameraHandle>;
  active: boolean;
  view: RefObject<ViewSize>;
  onFrame: (face: RawFace | null, held: boolean) => void;
  onError: (error: Error) => void;
}) {
  const onFrameRef = useRef(onFrame);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onFrameRef.current = onFrame;
    onErrorRef.current = onError;
  }, [onFrame, onError]);

  /** Whether the native side has said anything at all yet. See the watchdog below. */
  const signalled = useRef(false);

  useImperativeHandle(
    ref,
    (): ScannerCameraHandle => ({
      async takePhoto() {
        const frame = await captureArFrame();
        // The module writes a full-size JPEG into the cache; everything
        // above this holds storage-size files only, as it does for the
        // VisionCamera path.
        return shrinkCapture(frame.uri);
      },
    }),
    [],
  );

  const handleFace = useCallback(
    (event: { nativeEvent: FaceEvent }) => {
      signalled.current = true;
      const face = event.nativeEvent;
      if (isFaceLost(face)) {
        onFrameRef.current(null, false);
        return;
      }
      // Anything that is neither a frame nor a loss is a payload this
      // build does not understand. Reporting it as "no face" would be a
      // lie about the camera; it is dropped instead.
      if (!isFaceFrame(face)) return;
      const raw = arkitFaceToRaw(face, view.current);
      // The view has not been laid out yet: a fraction of nothing is not
      // a place, and the module says so by answering null.
      if (raw === null) return;
      /*
        A coasted frame — the last tracked pose, repeated while the head
        is low enough that ARKit is looking at a scalp — is passed on,
        because that is the whole point of the coast: the crown stage
        asks for the pose the camera can no longer read, and a stream
        that fell silent there would leave the ring and the mesh with
        nothing to run on.

        It is passed on WITH THE FLAG, though, and that part is not
        decoration. A repeated box has travelled nowhere, so the tracker
        would compute perfect stillness from it within three ticks — and
        the engine both gates the shutter on stillness and makes it
        nearly half of a frame's quality score. A held pose is evidence
        of where the head was, never evidence that it stayed there, and
        the screen substitutes the last stillness that was actually
        measured rather than letting a repeat manufacture one.
      */
      onFrameRef.current(raw, !arkitIsTracking(face));
    },
    [view],
  );

  const handleError = useCallback((event: { nativeEvent: { message: string } }) => {
    signalled.current = true;
    onErrorRef.current(new Error(event.nativeEvent.message));
  }, []);

  /*
    The liveness watchdog.

    `isFaceTrackingAvailable()` answers for the hardware and the binary;
    it cannot answer for the view. The module falls back to a component
    that renders nothing if the native view manager will not resolve, and
    that component draws no preview, sends no face and reports no error —
    a black screen with a Start button that never arms, which is exactly
    the symptom this whole rework exists to end, arrived at from the
    other side. The native side is also silent, legitimately, whenever
    the session is up and no face has come into view.

    `capture()` is what tells those two apart, and it is the only thing
    that can: it resolves from a live AR frame and rejects when no view
    is on screen or the session has delivered nothing. So after four
    quiet seconds the camera is asked for a picture. One that arrives is
    proof the preview is real — the file is deleted at once and the
    question is never asked again. One that is refused is reported as a
    camera failure, and ML Kit takes the screen.
  */
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      if (signalled.current) return;
      captureArFrame().then(
        (frame) => {
          signalled.current = true;
          deletePhotoFiles([frame.uri]);
        },
        () => {
          if (!live) return;
          onErrorRef.current(new Error('The face tracking camera delivered no frames.'));
        },
      );
    }, ARKIT_SIGNAL_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [active]);

  return (
    <HairFaceTrackingView
      style={StyleSheet.absoluteFill}
      paused={!active}
      onFace={handleFace}
      onError={handleError}
    />
  );
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
  onImplementation,
  extraOutputs,
  sampleSource,
  demoTracking = false,
}: ScannerCameraProps) {
  const [vision, setVision] = useState<VisionState>(initialVisionState);
  const [visionFailed, setVisionFailed] = useState(false);
  /*
    Whether the AR session is the one running. Latched at mount, because
    the answer is a fact about the phone and the build; it goes false only
    if ARKit reports a failure, and then VisionCamera takes the screen —
    the two are never mounted together.
  */
  const [arkitPossible] = useState(arkitScannerAvailable);
  const [arkitFailed, setArkitFailed] = useState(false);
  const arkit = arkitPossible && !arkitFailed;

  useEffect(() => {
    // The VisionCamera module is not loaded at all on the AR path: it is
    // the camera this screen has decided not to open.
    if (arkit || vision !== 'pending') return undefined;
    let live = true;
    loadVisionScanner().then((scanner) => {
      if (live) setVision(scanner);
    });
    return () => {
      live = false;
    };
  }, [arkit, vision]);

  const sample = sampleCameraActive();
  const scanner = arkit || visionFailed || sample || vision === 'pending' ? null : vision;
  const tracking = arkit || scanner !== null || (sample && demoTracking);

  useEffect(() => {
    // Not answered while the module is loading: `tracking` is false then
    // only because nothing has mounted yet, and a screen that fails on a
    // false answer would fail every scan on a phone that can track.
    if (!arkit && vision === 'pending') return;
    onTrackingChanged?.(tracking);
  }, [arkit, tracking, vision, onTrackingChanged]);

  /*
    Which camera ended up on screen. Unanswered while the module loads —
    for the same reason as above — and answered again the moment ARKit
    hands the screen over, so nothing upstream is left addressing a
    camera that is no longer mounted.
  */
  const implementation: ScannerImplementation | null = arkit
    ? 'arkit'
    : sample
      ? 'sample'
      : scanner !== null
        ? 'mlkit'
        : vision === 'pending'
          ? null
          : 'preview';

  useEffect(() => {
    if (implementation === null) return;
    onImplementation?.(implementation);
  }, [implementation, onImplementation]);

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

  /*
    `held` is false unless the caller says otherwise, and only the AR
    path ever does: ML Kit, the sample face and the plain preview each
    either have a reading or have none, with nothing in between to hold.
  */
  const emitFrame = useCallback((face: RawFace | null, held = false) => {
    onFrameRef.current(face, viewRef.current, held);
  }, []);

  const handleVisionError = useCallback((error: Error) => {
    // Reported once, then the fallback owns the screen.
    setVisionFailed(true);
    onErrorRef.current?.(error);
  }, []);

  /*
    ARKit could not start — an iPhone whose hardware answered `isSupported`
    and then refused the session, or an interruption it could not recover
    from. The AR view goes, ML Kit takes the screen, and the scan runs the
    same choreography on the simpler tracker. The screen is not told:
    nothing failed for the person, and the fallback is a camera.
  */
  const handleArkitError = useCallback(() => {
    setArkitFailed(true);
  }, []);

  let camera: ReactNode;
  if (arkit) {
    camera = (
      <ArkitScannerCamera
        ref={ref}
        active={active}
        view={viewRef}
        onFrame={emitFrame}
        onError={handleArkitError}
      />
    );
  } else if (sample) {
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
        //
        // `shutterSound: false` because this implementation takes the
        // light meter's reading on the ready screen, a second after the
        // camera appears and before anybody has pressed anything —
        // expo-camera defaults it to true, so build 17 clicked at
        // somebody who had not asked for a photograph. The preview's
        // matching flash is off at the view below.
        const photo = await camera.current.takePictureAsync({ quality: 0.9, shutterSound: false });
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
      // The file matches the preview, as every stored photograph in the
      // app does. See `handedness.ts` for the bit and tracked-camera.tsx.
      mirror={FRAME_MIRRORED}
      // No white flash over the preview: the one shot this camera takes
      // unprompted is the light meter's, and a flash for a photograph
      // nobody asked for reads as a bug. See takePictureAsync above.
      animateShutter={false}
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
