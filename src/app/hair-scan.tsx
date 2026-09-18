/**
 * The hair scan: two beats in front of the camera — turn the head left
 * and right, then lower it and turn again.
 *
 * This screen orchestrates and draws almost nothing itself. The engine
 * decides what is happening; the tracker smooths the detector; the chrome,
 * the ring, the mesh, the light meter, the processing pass and the report
 * are each their own component. What lives here is the wiring between
 * them and the two things only a screen can own: the camera's lifetime
 * and the files on disk.
 *
 * The engine's state lives in a ref and is reduced on every tracker frame;
 * React is told only when something it draws has changed. Every frame the
 * engine lets go of arrives as a `discard` event and its file is deleted
 * at once. Saving the report re-encodes the kept frames into the journal
 * and deletes the scan's working files; leaving any other way — close,
 * hardware back, a navigation reset — cancels the engine on unmount and
 * deletes the same files. Nothing leaves the device. "Scan again" remounts
 * the scanner under a new key, so nothing carries over between runs.
 *
 * ── One choreography, two trackers ────────────────────────────────────
 * On an iPhone with a TrueDepth camera the preview is ARKit's own view
 * and the head is followed in 3D; on Android it is VisionCamera with ML
 * Kit. That choice is made entirely inside `ScannerCamera` — this screen
 * is handed the same `RawFace` either way, runs the same engine, asks for
 * the same four regions and writes the same record, so the report, the
 * plan and the hairstyles are identical on both.
 */

import { useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { sampleCameraActive } from '@/components/capture/sample-camera';
import {
  Guidance,
  InstructionSheet,
  PermissionView,
  ScanRing,
  StartButton,
  TopBar,
  emptyCoverage,
  scanRingBoxFor,
} from '@/components/hair-scan';
import { HairMesh, type HairMeshHandle, type MeshTone } from '@/components/hair-scan/hair-mesh';
import { LightingPill, useLightingProbe } from '@/components/hair-scan/lighting-probe';
import { Processing, type ProcessingFrame } from '@/components/hair-scan/processing';
import { HairScanReport } from '@/components/hair-scan/report';
import {
  ScannerCamera,
  arkitScannerAvailable,
  scannerTrackingPossible,
  type ScannerCameraHandle,
  type ScannerImplementation,
} from '@/components/hair-scan/scanner-camera';
import {
  scanPhaseFor,
  scanPhaseIcon,
  scanPhaseTone,
} from '@/components/hair-scan/status-pill';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { toPhotoReadings, type AnalysisResult } from '@/features/hair-scan/analysis';
import { HAIR_SCAN_COPY } from '@/features/hair-scan/copy';
import {
  canStart,
  createScanState,
  orderedFrames,
  reduce,
  snapshotMesh,
  squareOn,
} from '@/features/hair-scan/engine';
import { createScanHaptics } from '@/features/hair-scan/haptics';
import {
  ANGLE_OF_TARGET,
  scanBlock,
  scanPhotos,
  type HairScanFrame,
} from '@/features/hair-scan/result';
import { usePremium } from '@/features/subscription/provider';
import {
  createTracker,
  expireTracker,
  toEngineReading,
  trackFrame,
  type RawFace,
  type Rect,
  type TrackerState,
  type ViewSize,
} from '@/features/hair-scan/tracking';
import type {
  ScanAction,
  ScanEvent,
  ScanStage,
  ScanState,
  ScanStatus,
  ScannerState,
} from '@/features/hair-scan/types';
import { deletePhotoFiles, persistCapture } from '@/lib/photo-storage';
import { useAppStore } from '@/store/app-store';
import { hairContent } from '@/features/content/hair-content';
import { darkColors, iconSize, motion, radius, spacing, useTheme } from '@/theme';
import { sessionToExtend, type PhotoSession } from '@/types/domain';

/* ------------------------------- tuning ------------------------------- */

/** How often the tracker is asked whether its last face has gone stale. */
const EXPIRE_TICK_MS = 250;
/**
 * How long the ready screen waits before taking the light meter's one
 * still. Long enough for the camera to have settled its exposure, short
 * enough that the pill has a word on it before anybody has read the hint
 * under the oval.
 */
const PROBE_STILL_DELAY_MS = 900;
/**
 * How many times the light meter's still is asked for, and how long it
 * waits between asks.
 *
 * One ask was enough while VisionCamera was the only camera: its preview
 * is live before this screen has finished its first render. ARKit is not
 * — a face tracking session takes about a second to bring the camera up,
 * and a `capture()` before its first frame is honestly refused. A single
 * latched attempt then left the lighting readout blank for the whole
 * ready screen on the one platform this build exists for. Three asks a
 * second apart cover the slowest start seen; nothing is measured twice,
 * because the first answer clears the need.
 */
const PROBE_STILL_TRIES = 3;
const PROBE_STILL_RETRY_MS = 1000;
/** The "Scan complete" beat, before the processing screen. */
const COMPLETE_BEAT_MS = 1600;
const COMPLETE_BEAT_REDUCED_MS = 600;
/** The oval of live video, as a share of the window's width. */
const MASK_WIDTH_SHARE = 0.8;
const MASK_MAX_WIDTH = 340;
const MASK_ASPECT = 1.32;
/** Where the oval's centre sits, as a share of the window's height. */
const MASK_CENTRE_Y = 0.44;

/* ---------------------------- view model ----------------------------- */

/** What React draws. Everything else the engine knows stays in the ref. */
type ViewModel = {
  scanner: ScannerState;
  status: ScanStatus;
  /** Which beat of the choreography: the ring, the plate and the pill all read it. */
  stage: ScanStage;
  cue: ScanState['cue'];
  error: ScanState['error'];
  frameCount: number;
  /**
   * Whether Start is live. The engine owns the condition — a head being
   * followed, at any distance, at any angle, in any light — and the
   * screen adds nothing to it. Build 17 added four things and the owner
   * could not press the button.
   */
  startReady: boolean;
};

function viewOf(state: ScanState): ViewModel {
  return {
    scanner: state.scanner,
    status: state.status,
    stage: state.stage,
    cue: state.cue,
    error: state.error,
    frameCount: state.frames.length,
    startReady: canStart(state),
  };
}

function sameView(a: ViewModel, b: ViewModel): boolean {
  return (Object.keys(a) as (keyof ViewModel)[]).every((k) => a[k] === b[k]);
}

const GOOD_STATUS: ReadonlySet<ScanStatus> = new Set([
  'ready',
  'capturing',
  'completing',
  'complete',
]);

/** Whether this build can follow a head: the native detector, or the simulator's drawn face. */
function trackable(): boolean {
  return scannerTrackingPossible() || sampleCameraActive();
}

/** The engine's starting point: the instructions, or straight to the camera on a rescan. */
function initialScanState(skipInstructions: boolean, granted: boolean): ScanState {
  let state = createScanState();
  if (!skipInstructions || !granted) return state;
  const at = Date.now();
  state = reduce(state, { type: 'permission', granted: true, at }).state;
  return reduce(state, { type: 'continue', at }).state;
}

/** Every file a set of captured images owns. */
function filesOf(images: { uri: string; thumbnailUri?: string }[]): (string | undefined)[] {
  return images.flatMap((i) => [i.uri, i.thumbnailUri]);
}

/** A full-screen rectangle with the oval cut out: the scrim around the live video. */
function ovalCutout(width: number, height: number, mask: Rect): string {
  const cx = mask.x + mask.width / 2;
  const cy = mask.y + mask.height / 2;
  const rx = mask.width / 2;
  const ry = mask.height / 2;
  return (
    `M0 0H${width}V${height}H0Z` +
    `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`
  );
}

/* ------------------------------ the route ----------------------------- */

export default function HairScanRoute() {
  const router = useRouter();
  /*
    `origin=onboarding` is the funnel's route in. The funnel is
    onboarding → scan → report → paywall, and the last arrow is drawn
    here: a report reached from onboarding ends in Continue, which
    replaces it with the paywall, exactly as the old scan report did.
    Reached from anywhere else the report ends in Done, which goes to
    the journal the scan was saved into.
  */
  const { origin } = useLocalSearchParams<{ origin?: string }>();
  const funnel = origin === 'onboarding';
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [run, setRun] = useState(0);
  const restart = useCallback(() => setRun((r) => r + 1), []);
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
  const done = useCallback(() => router.replace('/journey'), [router]);
  const toPaywall = useCallback(() => router.replace('/plan'), [router]); // by way of the plan sequence, which ends on the paywall
  // A new run is a new scanner: every ref, tracker and timer starts clean.
  return (
    <Scanner
      key={run}
      skipInstructions={run > 0}
      funnel={funnel}
      granted={permission?.granted === true}
      canAskAgain={permission?.canAskAgain !== false}
      requestPermission={requestPermission}
      getPermission={getPermission}
      onLeave={leave}
      onReportDone={done}
      onReportContinue={toPaywall}
      onRestart={restart}
    />
  );
}

type ScannerProps = {
  skipInstructions: boolean;
  /** Reached from onboarding: the report ends in Continue → paywall. */
  funnel: boolean;
  granted: boolean;
  canAskAgain: boolean;
  requestPermission: () => Promise<{ granted: boolean }>;
  getPermission: () => Promise<{ granted: boolean }>;
  /** Closing the scan before there is a report. */
  onLeave: () => void;
  /** Leaving the report outside the funnel: to the journal. */
  onReportDone: () => void;
  /** Leaving the report inside the funnel: to the paywall. */
  onReportContinue: () => void;
  onRestart: () => void;
};

function Scanner({
  skipInstructions,
  funnel,
  granted,
  canAskAgain,
  requestPermission,
  getPermission,
  onLeave,
  onReportDone,
  onReportContinue,
  onRestart,
}: ScannerProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { data, addSession } = useAppStore();
  const { isPremium } = usePremium();
  /*
    The frame the simulator's stand-in camera shows and photographs — the
    bundled front example, matched to the profile the way the rest of the
    app matches it. A real camera ignores it; without it the stand-in has
    nothing to load and every capture request fails.
  */
  const sampleFrame = hairContent(data.profile?.gender).angles.front.example;

  /* ---------------------------- the free tier ---------------------------- */

  /*
    Whether this run is the baseline. Read once, when the run starts: the
    scan that makes the baseline turns `isBaseline` false the moment it
    saves, and a value read live would send the person to the paywall
    while their first report was on screen. "Scan again" remounts the
    scanner under a new key, so the next run reads it afresh — and for
    someone without the entitlement that run is the one the paywall is
    for. A one-photograph baseline from before the scan existed that
    still lacks angles is still the baseline: completing it is the same
    free first session, not an update.
  */
  const [isBaseline] = useState(
    () => data.sessions.length === 0 || sessionToExtend(data.sessions) !== null,
  );

  /*
    Every route into the camera passes through this screen, so this is the
    only place capture has to be gated — a new entry point added later
    cannot slip past it.

    The baseline is the exception, and deliberately so. Asking somebody to
    pay before they have taken a single photograph is asking them to buy a
    comparison against nothing; letting them take the first scan and then
    showing what it found is the same money asked for at the point it
    means something. It is also the honest order: they see what the app
    actually does before deciding it is worth paying for.
  */
  useEffect(() => {
    if (!isPremium && !isBaseline) router.replace('/paywall');
  }, [isPremium, isBaseline, router]);
  const {
    gateLevel,
    sampleStill,
    frameOutput,
    needsStill,
    level: lightLevel,
    status: lightStatus,
  } = useLightingProbe();
  /*
    Which tracker is behind the preview. It decides nothing about the
    choreography — that is one thing on both platforms — only how the
    light gets measured.

    Not latched, and that is the point. The first answer is this phone
    and this build; the second, if it comes, is ARKit having failed and
    ML Kit having taken the screen. A screen that never heard the second
    answer would keep withholding the probe's frame output from a
    VisionCamera session that is now running and could use it, and the
    two components would disagree about which camera is mounted with
    only one of them right.
  */
  const [arkit, setArkit] = useState(arkitScannerAvailable);
  const onImplementation = useCallback((kind: ScannerImplementation) => {
    setArkit(kind === 'arkit');
  }, []);
  // The probe's frame output rides on the camera's session. Built once
  // when the bridge resolves; undefined (not a fresh empty array) before
  // that, so the camera's outputs keep their identity until there is
  // something to add. On the AR path there is no VisionCamera session to
  // attach it to, so it is not offered — a frame output hanging off no
  // camera would sit there reporting nothing.
  const extraOutputs = useMemo(
    () => (arkit || !frameOutput ? undefined : [frameOutput]),
    [arkit, frameOutput],
  );

  /* ------------------------------ engine ------------------------------ */

  const [initial] = useState(() => initialScanState(skipInstructions, granted));
  const [canTrack] = useState(trackable);
  const engine = useRef<ScanState>(initial);
  const [view, setView] = useState<ViewModel>(() => viewOf(initial));
  const [processingFrames, setProcessingFrames] = useState<ProcessingFrame[]>([]);
  const [session, setSession] = useState<PhotoSession | null>(null);
  /**
   * A head is being followed and it is turned away from the camera. Not
   * a state of the engine — it is still `detecting` — so it is kept
   * beside the view model rather than in it, and it changes the pill's
   * word and nothing else.
   */
  const [facingAway, setFacingAway] = useState(false);
  const coverage = useSharedValue<number[]>(emptyCoverage());
  const [haptics] = useState(() => createScanHaptics());
  const tracker = useRef<TrackerState>(createTracker());
  const camera = useRef<ScannerCameraHandle>(null);
  const mesh = useRef<HairMeshHandle>(null);
  /** False once the scanner has unmounted; late camera answers are then deleted, not kept. */
  const alive = useRef(true);
  /** The tracker's roll at each shutter, so a kept frame carries a whole pose. */
  const rollAt = useRef(new Map<string, number>());
  /** The preview's measured size, as the camera reports it with every frame: what the mesh's fractions are of. */
  const previewSize = useRef<ViewSize>({ width: 0, height: 0 });
  /** The scan's record of itself — light and tracking over the ticks — for the journal. */
  const tally = useRef({ ticks: 0, faced: 0, lightSum: 0, lightN: 0 });
  /**
   * The last stillness read off a frame the detector actually saw. It
   * stands in while a pose is being held over, so a repeated reading
   * cannot pass itself off as a head that has stopped moving. See
   * `onFrame`.
   */
  const measuredStillness = useRef(0);
  /** `step`, reachable from the promises it starts. Bound in an effect below. */
  const stepRef = useRef<(action: ScanAction) => void>(() => undefined);
  /**
   * The ready screen's light-meter shot while it is in flight, so the
   * scan's first capture queues behind it instead of racing it. Null
   * every other moment, which is every moment on a build whose frame
   * processor is alive. See the probe effect below.
   */
  const probeShot = useRef<Promise<void> | null>(null);

  /* The one place the engine is advanced; every event is acted on here. */
  const step = useCallback(
    (action: ScanAction) => {
      if (!alive.current) {
        // The screen is gone: an image that lands now has no owner.
        if (action.type === 'captured') deletePhotoFiles(filesOf([action.image]));
        return;
      }
      const before = engine.current;
      let { state, events } = reduce(before, action);
      // A build that cannot follow a head cannot scan, and says so rather
      // than showing a camera that would never become ready.
      if (state.scanner === 'ready' && before.scanner !== 'ready' && !canTrack) {
        const failed = reduce(state, {
          type: 'fail',
          reason: 'trackingUnavailable',
          at: action.at,
        });
        state = failed.state;
        events = [...events, ...failed.events];
      }
      engine.current = state;
      if (state.sectors !== before.sectors) coverage.set(state.sectors);
      // A frame that also completes a region or opens the ring is one
      // moment, not two: the milestone's buzz stands in for the frame's.
      const milestoneToo = events.some(
        (e) => e.type === 'milestone' && e.milestone !== 'faceLocked',
      );
      for (const event of events) act(event, state);
      const next = viewOf(state);
      setView((current) => (sameView(current, next) ? current : next));

      function act(event: ScanEvent, current: ScanState) {
        switch (event.type) {
          case 'discard':
            deletePhotoFiles(filesOf(event.images));
            return;
          case 'capture': {
            const { id } = event.request;
            const face = tracker.current.face;
            rollAt.current.set(id, face?.roll ?? Number.NaN);
            // The mesh as the live camera has it at this shutter, frozen
            // now rather than when the file lands: by then the head has
            // moved on. It rides on the frame to the processing screen
            // and no further.
            const frameMesh = face === null ? null : snapshotMesh(face, previewSize.current);
            // Almost always the shutter itself. The one exception is the
            // ready screen's light-meter shot: if Start was pressed while
            // it was still in flight, this waits for the camera to be
            // free rather than asking it for two photographs at once.
            const take = () => Promise.resolve(camera.current?.takePhoto());
            const pending = probeShot.current;
            const shot = pending ? pending.then(take) : take();
            shot.then(
              (image) => {
                // No camera to ask: the same nothing that happened before
                // this call was ever made through a promise.
                if (!image) return;
                // The still is the light meter's only input on a build
                // without a frame processor; the probe ignores it otherwise.
                sampleStill(image.uri).catch(() => undefined);
                stepRef.current({
                  type: 'captured',
                  requestId: id,
                  image,
                  ...(frameMesh === null ? {} : { mesh: frameMesh }),
                  at: Date.now(),
                });
              },
              () =>
                stepRef.current({
                  type: 'captureFailed',
                  requestId: id,
                  at: Date.now(),
                }),
            );
            return;
          }
          case 'state':
            if (event.to === 'processing') {
              setProcessingFrames(
                orderedFrames(current).map((f) => ({
                  id: f.id,
                  uri: f.uri,
                  region: f.region,
                  // The region the engine ASKED this frame for, never the
                  // ring bin the head happened to be in when the shutter
                  // fired: those are two different things and only one of
                  // them says what is in the picture.
                  angle: ANGLE_OF_TARGET[f.target],
                  label: HAIR_SCAN_COPY.target[f.target],
                  ...(f.mesh
                    ? { mesh: { still: { width: f.width, height: f.height }, face: f.mesh } }
                    : {}),
                })),
              );
            }
            return;
          case 'frame':
            if (!milestoneToo) haptics.play('sectorCaptured');
            return;
          case 'milestone':
            haptics.play(event.milestone === 'faceLocked' ? 'trackingLock' : 'milestone');
            return;
          case 'scanComplete':
            haptics.play('complete');
            return;
          default:
            return;
        }
      }
    },
    [canTrack, coverage, haptics, sampleStill],
  );

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Leaving by any road — close, hardware back, a navigation reset — is a
  // cancel: the engine lets go of every frame and the files go with them.
  // Once the report is saved the journal owns its copies and nothing is left.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const s = engine.current;
      if (s.scanner === 'report' || (s.frames.length === 0 && s.pending.length === 0)) return;
      const { state, events } = reduce(s, { type: 'cancel', at: Date.now() });
      engine.current = state;
      for (const event of events)
        if (event.type === 'discard') deletePhotoFiles(filesOf(event.images));
    };
  }, []);

  /* ----------------------------- geometry ----------------------------- */

  const mask = useMemo<Rect>(() => {
    const w = Math.min(width * MASK_WIDTH_SHARE, MASK_MAX_WIDTH);
    const h = w * MASK_ASPECT;
    return {
      x: (width - w) / 2,
      y: height * MASK_CENTRE_Y - h / 2,
      width: w,
      height: h,
    };
  }, [width, height]);
  const ring = useMemo(() => scanRingBoxFor(mask), [mask]);
  const scrim = useMemo(() => ovalCutout(width, height, mask), [width, height, mask]);

  /* ----------------------------- tracking ----------------------------- */

  const scanner = view.scanner;
  const cameraLive = scanner === 'ready' || scanner === 'scanning' || scanner === 'complete';
  const [foreground, setForeground] = useState(true);

  const onFrame = useCallback(
    (raw: RawFace | null, preview: ViewSize, held: boolean) => {
      const now = Date.now();
      previewSize.current = preview;
      tracker.current = trackFrame(tracker.current, raw, now);
      const face = tracker.current.face;
      mesh.current?.setFace(face);
      let reading = face ? toEngineReading(face, mask) : null;
      /*
        Stillness, when the pose is a held one.

        ARKit coasts: while the head is low enough that the face is out
        of sight — the crown beat, which is the one beat the coast exists
        for — it repeats the last tracked pose so the ring and the mesh
        have something to run on. A repeated box has travelled nowhere,
        so the tracker reads perfect stillness off it within about three
        ticks, and the engine both refuses a capture below STABLE_MIN and
        makes stability nearly half of a frame's quality. Left alone, the
        coast would therefore manufacture the very evidence the shutter
        is waiting for and fire it at a head that may still be turning.

        So a held frame carries forward the last stillness that was
        actually measured, which is what the tracker itself does when the
        detector blinks. It claims nothing new in either direction: a
        head that was still when the face went out of sight can still
        have its crown photographed, and one that was moving has to be
        seen again before it can.
      */
      if (reading !== null) {
        if (held) reading = { ...reading, stability: measuredStillness.current };
        else measuredStillness.current = reading.stability;
      }
      /*
        A head in hand, turned away. Nothing stops the scan starting
        here — square on is not asked for and has not been since build 17
        — but while the engine is still `detecting` the pill should not
        claim the phone cannot find a face it is plainly following.
        React is told only when the answer changes; identical values
        bail out of `setState` without a render.
      */
      setFacingAway(reading !== null && !squareOn(reading));
      const lighting = gateLevel();
      if (engine.current.scanner === 'scanning') {
        const t = tally.current;
        t.ticks += 1;
        // The journal's "tracked" share is how much of the run the
        // detector actually had the head, so a pose being held over —
        // by the tracker through a blink, or by ARKit's coast — is not
        // one of those ticks. Counting it would inflate a number whose
        // only job is to say how well the scan went.
        if (face && !face.held && !held) t.faced += 1;
        if (lighting !== null) {
          t.lightSum += lighting;
          t.lightN += 1;
        }
      }
      step({ type: 'tick', at: now, face: reading, lighting });
    },
    [gateLevel, mask, step],
  );

  // A detector that goes quiet leaves the tracker holding its last face;
  // this lets it go, so "lost" is reported even when no frame says so.
  useEffect(() => {
    if (!cameraLive) return undefined;
    const timer = setInterval(() => {
      const now = Date.now();
      const expired = expireTracker(tracker.current, now);
      if (expired === tracker.current) return;
      tracker.current = expired;
      mesh.current?.setFace(null);
      // The face is gone, so the pill goes back to looking for one, and
      // the stillness measured off the head that has left the frame
      // stands for nothing about the next one.
      setFacingAway(false);
      measuredStillness.current = 0;
      step({ type: 'tick', at: now, face: null, lighting: gateLevel() });
    }, EXPIRE_TICK_MS);
    return () => clearInterval(timer);
  }, [cameraLive, gateLevel, step]);

  /*
    The light meter's one still on the ready screen.

    On a build without the frame processor the meter has nothing to read
    until a photograph is taken, and the scanner takes none until the
    scan starts — so the pill would sit on "Reading the light" through
    the whole ready screen and only find a word once the turn was under
    way. One photograph is taken here instead, measured, and its file
    deleted: no haptic, no frame added to the scan, and nothing at all on
    a build whose frame processor is alive (`needsStill` is false there
    from the start).

    Silent, as of build 18. `needsStill` is true whenever the lighting
    engine is on its stills fallback, which on an Expo Go build — the
    build the owner walked — is the expo-camera implementation, and
    expo-camera defaults both `shutterSound` and `animateShutter` to true
    (`Camera.types.d.ts`, `@default true` on each). Build 17 therefore
    played the system shutter and flashed the preview about a second into
    the ready screen, at somebody who had not pressed anything. Both
    switches are now off in `scanner-camera.tsx`.

    Once, per mount. A camera that refuses the shot leaves the pill as it
    was, which is the honest outcome — a reading was not taken, so none
    is shown.

    `probeShot` holds the shot while it is in flight so the scan's first
    capture can queue behind it (see the `capture` event): two captures
    at once on one camera can have the second rejected, and on this path
    the shot is not quick — it includes a resize.
  */
  /*
    The AR path is on the stills road too, and for a plainer reason than
    a missing bridge: ARKit owns the camera, so the probe's frame output
    has nothing to ride on and no live frame ever reaches it. The probe
    itself cannot know that — it only sees that its bridge loaded — so
    the screen, which chose the camera, says it.
  */
  const needsProbeStill = needsStill || (arkit && lightLevel === null);
  const probedLight = useRef(false);
  useEffect(() => {
    if (!needsProbeStill || scanner !== 'ready' || probedLight.current) return undefined;
    probedLight.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let left = PROBE_STILL_TRIES;
    const again = () => {
      left -= 1;
      if (left > 0) timer = setTimeout(attempt, PROBE_STILL_RETRY_MS);
    };
    const attempt = () => {
      timer = null;
      // The turn may have started in the meantime, and the scan's own
      // frames are the meter's input from then on.
      if (engine.current.scanner !== 'ready') return;
      const shot = camera.current?.takePhoto();
      if (!shot) {
        again();
        return;
      }
      // The scan waits for the camera, not for the measurement, so the
      // promise it queues behind settles with the shutter.
      const done = shot.then(
        (image) => {
          // The file this call wrote is the meter's input and nothing
          // else: measured, then deleted, whether or not the measurement
          // worked. Deleting it is all this screen can delete — the
          // camera's own temporary original is upstream of `takePhoto`,
          // and is left where every other capture in this file leaves it.
          void sampleStill(image.uri)
            .catch(() => undefined)
            .finally(() => deletePhotoFiles(filesOf([image])));
        },
        // A refusal here is almost always a camera that has not produced
        // its first frame yet, which is a thing that fixes itself.
        again,
      );
      probeShot.current = done;
      void done.finally(() => {
        if (probeShot.current === done) probeShot.current = null;
      });
    };
    timer = setTimeout(attempt, PROBE_STILL_DELAY_MS);
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [needsProbeStill, scanner, sampleStill]);

  const onCameraError = useCallback(() => {
    step({ type: 'fail', reason: 'cameraFailed', at: Date.now() });
  }, [step]);

  // The camera settled on an implementation that will never report a
  // face — the native module failed to load and the plain preview took
  // over. That is not a camera fault and a retry would find the same
  // thing, so it fails the scan visibly rather than sitting on
  // "Center your face" for ever.
  const onTrackingChanged = useCallback(
    (tracking: boolean) => {
      if (tracking) return;
      step({ type: 'fail', reason: 'trackingUnavailable', at: Date.now() });
    },
    [step],
  );

  /* ----------------------------- lifecycle ---------------------------- */

  // The camera is released when the app leaves the foreground and comes
  // back with it. Settings is where a refused permission gets fixed, so a
  // return from there is also when the system is asked again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setForeground(next === 'active');
      if (next !== 'active') return;
      const s = engine.current;
      const waiting =
        s.scanner === 'permission' || (s.scanner === 'error' && s.error === 'cameraDenied');
      if (!waiting) return;
      getPermission().then(
        (result) => {
          if (!result.granted) return;
          const now = Date.now();
          if (engine.current.scanner === 'error') step({ type: 'retry', at: now });
          step({ type: 'permission', granted: true, at: now });
        },
        () => undefined,
      );
    });
    return () => sub.remove();
  }, [getPermission, step]);

  // The completion beat: the ring sweeps, the mesh settles, and then the
  // processing screen takes over. Never a spinner.
  useEffect(() => {
    if (scanner !== 'complete') return undefined;
    const timer = setTimeout(
      () => step({ type: 'process', at: Date.now() }),
      reduceMotion ? COMPLETE_BEAT_REDUCED_MS : COMPLETE_BEAT_MS,
    );
    return () => clearTimeout(timer);
  }, [scanner, reduceMotion, step]);

  /* ------------------------------- voice ------------------------------ */

  // The one line the camera phases say: the cue, or the scanning line
  // when the ring is saying everything else, or the completion plate.
  const scanning = scanner === 'scanning';
  const complete = scanner === 'complete';
  /*
    The engine's own cue, and nothing else. It used to be second-guessed
    here: when the turn stalled with the chin band missing, the screen
    substituted a "lower your head" line of its own. The choreography now
    says that itself — `lowerHead`, then `turnAgain` — so a second voice
    over the top could only disagree with the first.
  */
  const cueLine = complete ? null : view.cue ? HAIR_SCAN_COPY.cue[view.cue] : null;
  const spoken = !cameraLive
    ? null
    : complete
      ? HAIR_SCAN_COPY.complete.title
      : (cueLine ?? (scanning ? HAIR_SCAN_COPY.scanning.hint : null));

  // A live region is Android's; VoiceOver hears nothing from it. So on
  // iOS the line is spoken outright each time it changes — and only
  // then: the engine changes its cue only when the advice changes, so
  // there is nothing to throttle. On Android the Guidance plate and the
  // completion plate already carry this exact line as a polite live
  // region, and `announceForAccessibility` is not a no-op there: TalkBack
  // would speak every cue twice. A screen-reader user on either platform
  // is guided by the same sentence a sighted one reads, and the scan ends
  // for both by the forced finish.
  useEffect(() => {
    if (spoken !== null && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(spoken);
    }
  }, [spoken]);

  /* ------------------------------ actions ----------------------------- */

  const onContinue = useCallback(() => {
    const now = Date.now();
    if (granted) step({ type: 'permission', granted: true, at: now });
    step({ type: 'continue', at: now });
  }, [granted, step]);

  const onAskPermission = useCallback(() => {
    requestPermission().then(
      (result) => step({ type: 'permission', granted: result.granted, at: Date.now() }),
      () => step({ type: 'permission', granted: false, at: Date.now() }),
    );
  }, [requestPermission, step]);

  const onStartPress = useCallback(() => {
    haptics.play('start');
  }, [haptics]);

  const onStart = useCallback(() => {
    haptics.reset();
    tally.current = { ticks: 0, faced: 0, lightSum: 0, lightN: 0 };
    step({ type: 'start', at: Date.now() });
  }, [haptics, step]);

  // From processing this discards every frame; the runner aborts itself
  // when it unmounts, and its late results are refused below.
  const onClose = useCallback(() => {
    step({ type: 'cancel', at: Date.now() });
    onLeave();
  }, [step, onLeave]);

  const onRetry = useCallback(() => {
    step({ type: 'retry', at: Date.now() });
  }, [step]);

  /* ---------------------------- persistence --------------------------- */

  const onProcessed = useCallback(
    (result: AnalysisResult) => {
      const state = engine.current;
      if (state.scanner !== 'processing') return;
      const measured = new Map(result.frames.map((m) => [m.id, m]));
      const frames: HairScanFrame[] = orderedFrames(state).map((f) => {
        const m = measured.get(f.id);
        const roll = rollAt.current.get(f.id);
        return {
          uri: f.uri,
          width: f.width,
          height: f.height,
          capturedAt: new Date(f.capturedAt).toISOString(),
          angle: ANGLE_OF_TARGET[f.target],
          ...(roll !== undefined && Number.isFinite(roll)
            ? { pose: { yaw: f.yaw, pitch: f.pitch, roll } }
            : {}),
          // The shutter-time mesh gives the report its region crops; without
          // it every crop is the centred fallback.
          ...(f.mesh ? { mesh: f.mesh } : {}),
          ...(m ? toPhotoReadings(m) : {}),
        };
      });
      const picked = scanPhotos(frames);
      const t = tally.current;
      const key = Date.now().toString(36);
      const stored: string[] = [];
      // The scan was closed while the copies were being made: they have no home.
      const abandoned = () => engine.current.scanner !== 'processing';

      (async () => {
        if (picked.length === 0) throw new Error('noFrames');
        // Settled, not raced: every copy that lands is on the `stored`
        // list before anything is thrown, so a cancel mid-copy (which
        // deletes the working files under the copies still in flight)
        // cannot leave a journal file that nothing owns.
        const copies = await Promise.allSettled(
          picked.map((p) => persistCapture(p.uri, key, p.angle)),
        );
        for (const copy of copies) {
          if (copy.status === 'fulfilled') stored.push(copy.value.uri, copy.value.thumbnailUri);
        }
        if (abandoned()) throw new Error('abandoned');
        const photos = picked.map((p, i) => {
          const copy = copies[i];
          if (copy === undefined || copy.status === 'rejected') throw new Error('persist');
          return { ...p, ...copy.value };
        });
        const saved = addSession(
          photos,
          undefined,
          scanBlock({
            startedAt: state.startedAt ?? Date.now(),
            endedAt: state.completedAt ?? Date.now(),
            completion: state.completion,
            frameCount: state.frames.length,
            lighting: t.lightN > 0 ? t.lightSum / t.lightN : null,
            tracked: t.ticks > 0 ? t.faced / t.ticks : undefined,
          }),
        );
        if (!saved) throw new Error('save');
        // The journal has its own copies now; the scan's working files go.
        deletePhotoFiles(filesOf(state.frames));
        setSession(saved);
        step({ type: 'processed', at: Date.now() });
      })().catch((error: unknown) => {
        deletePhotoFiles(stored);
        if (abandoned()) return;
        const noFrames = error instanceof Error && error.message === 'noFrames';
        step({
          type: 'fail',
          reason: noFrames ? 'noFrames' : 'processingFailed',
          at: Date.now(),
        });
      });
    },
    [addSession, step],
  );

  const onProcessingError = useCallback(() => {
    if (engine.current.scanner !== 'processing') return;
    step({ type: 'fail', reason: 'processingFailed', at: Date.now() });
  }, [step]);

  /* ------------------------------ screens ----------------------------- */

  if (scanner === 'report' && session) {
    // In the funnel the report ends in Continue, and Continue is the
    // paywall; everywhere else it ends in Done, and Done is the journal.
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="auto" />
        <HairScanReport
          session={session}
          funnel={funnel}
          onContinue={onReportContinue}
          onDone={funnel ? undefined : onReportDone}
          onRescan={onRestart}
        />
      </View>
    );
  }

  if (scanner === 'processing') {
    return (
      <View style={{ flex: 1, backgroundColor: darkColors.background }}>
        <StatusBar style="light" />
        <Processing
          frames={processingFrames}
          onComplete={onProcessed}
          onAbsorb={() => haptics.play('absorb')}
          onError={onProcessingError}
        />
        <TopBar
          status={null}
          onClose={onClose}
          helpLabel={HAIR_SCAN_COPY.ready.help}
          closeLabel={HAIR_SCAN_COPY.ready.close}
        />
      </View>
    );
  }

  if (scanner === 'permission' || (scanner === 'error' && view.error === 'cameraDenied')) {
    const denied = scanner === 'error' || !canAskAgain;
    return (
      <>
        <StatusBar style="light" />
        <PermissionView
          status={denied ? 'denied' : 'undetermined'}
          onContinue={onAskPermission}
          onClose={onClose}
        />
      </>
    );
  }

  if (scanner === 'error') {
    const copy = HAIR_SCAN_COPY.error;
    // A missing detector is not a camera fault, and trying again would only
    // find it missing again: honest words and one way out.
    const untrackable = view.error === 'trackingUnavailable';
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
          <Icon name="warning" size={iconSize.xl} color={darkColors.text} />
          <Text variant="title2" center style={{ color: darkColors.text }}>
            {untrackable ? copy.untrackableTitle : copy.title}
          </Text>
          <Text variant="body" center style={{ color: darkColors.textSecondary }}>
            {copy.reason[view.error ?? 'cameraFailed']}
          </Text>
        </View>
        <View style={{ gap: spacing.md }}>
          {untrackable ? null : <Button label={copy.retry} icon="retake" onPress={onRetry} />}
          <Button
            label={copy.close}
            variant={untrackable ? 'primary' : 'ghost'}
            onPress={onClose}
          />
        </View>
      </View>
    );
  }

  /* The camera phases: instructions over the dark ground, then ready, scanning, complete. */
  const meshTone: MeshTone = complete
    ? 'complete'
    : GOOD_STATUS.has(view.status)
      ? 'good'
      : 'neutral';
  /*
    The pill's readout. The engine has one status for the whole capture
    because capturing is one thing to a reducer; to a person it is two,
    and the stage is which. `scanPhaseFor` makes that one phase, and the
    phase carries the tone and the glyph — a turn arrow while the head
    goes left and right, a chevron down while it is lowered — so the two
    beats are told apart even though the copy has one word for both.

    The completion plate below says it once; the pill goes quiet for the beat.
  */
  const phase = scanPhaseFor(view.status, scanning ? view.stage : null);
  const status =
    cameraLive && !complete
      ? {
          tone: scanPhaseTone(phase),
          icon: scanPhaseIcon(phase),
          // "Looking for your face" is only true while there is no face
          // to look at. With one in hand and turned away, the pill asks
          // for the one thing that would move the scan on.
          label:
            view.status === 'detecting' && facingAway
              ? HAIR_SCAN_COPY.facingAway
              : phase === 'turning' || phase === 'headDown' || phase === 'almost'
                ? HAIR_SCAN_COPY.phase[phase]
                : HAIR_SCAN_COPY.status[view.status],
        }
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: darkColors.background }}>
      <StatusBar style="light" />
      {cameraLive ? (
        <>
          <ScannerCamera
            ref={camera}
            active={foreground}
            onFrame={onFrame}
            onError={onCameraError}
            onTrackingChanged={onTrackingChanged}
            onImplementation={onImplementation}
            extraOutputs={extraOutputs}
            demoTracking
            sampleSource={sampleFrame}
          />
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Path d={scrim} fill={darkColors.photoScrim} fillRule="evenodd" />
          </Svg>
          <HairMesh ref={mesh} scanning={scanning} tone={meshTone} coverage={coverage} />
          <ScanRing
            width={ring.width}
            height={ring.height}
            coverage={coverage}
            active={scanning || complete}
            complete={complete}
            /*
              The beat, so the dial swells as the second one opens and
              latches what the first one lit. Omitted before Start: a ring
              at rest is on no beat.
            */
            stage={scanning || complete ? view.stage : undefined}
            style={{
              position: 'absolute',
              left: mask.x + mask.width / 2 - ring.width / 2,
              top: mask.y + mask.height / 2 - ring.height / 2,
            }}
          />
          <TopBar
            status={status}
            onClose={onClose}
            helpLabel={HAIR_SCAN_COPY.ready.help}
            closeLabel={HAIR_SCAN_COPY.ready.close}
          />
          <LightingPill
            level={lightLevel}
            status={lightStatus}
            style={{
              position: 'absolute',
              top: insets.top + spacing.sm + spacing.huge + spacing.md,
              alignSelf: 'center',
            }}
          />
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: mask.y + mask.height + spacing.xl,
              bottom: insets.bottom + spacing.xl,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            {complete ? (
              <Animated.View
                entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.slow)}
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  backgroundColor: darkColors.photoScrim,
                  borderRadius: radius.lg,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.xl,
                }}>
                <Icon name="checkCircle" size={iconSize.md} color={darkColors.success} />
                <Text variant="headline" style={{ color: darkColors.textOnPhoto }}>
                  {HAIR_SCAN_COPY.complete.title}
                </Text>
              </Animated.View>
            ) : (
              // The beat is passed rather than read off the sentence, so
              // the change from "turn left and right" to "lower your
              // head" rises into place instead of cross-fading.
              <Guidance
                cue={cueLine}
                scanning={scanning}
                stage={scanning ? view.stage : undefined}
              />
            )}
            {complete ? (
              <Text variant="subhead" center style={{ color: darkColors.textSecondary }}>
                {HAIR_SCAN_COPY.complete.frames(view.frameCount)}
              </Text>
            ) : scanning ? null : (
              <StartButton
                label={HAIR_SCAN_COPY.ready.cta}
                hint={HAIR_SCAN_COPY.ready.hint}
                ready={view.startReady}
                onPress={onStartPress}
                onActivate={onStart}
              />
            )}
          </View>
        </>
      ) : null}
      <InstructionSheet
        visible={scanner === 'instructions'}
        onContinue={onContinue}
        onClose={onClose}
      />
    </View>
  );
}
