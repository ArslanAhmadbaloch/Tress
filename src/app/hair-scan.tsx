/**
 * The hair scan: one continuous turn in front of the camera.
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
  type StatusTone,
} from '@/components/hair-scan';
import { HairMesh, type HairMeshHandle, type MeshTone } from '@/components/hair-scan/hair-mesh';
import { LightingPill, useLightingProbe } from '@/components/hair-scan/lighting-probe';
import { Processing, type ProcessingFrame } from '@/components/hair-scan/processing';
import { HairScanReport } from '@/components/hair-scan/report';
import {
  ScannerCamera,
  scannerTrackingPossible,
  type ScannerCameraHandle,
} from '@/components/hair-scan/scanner-camera';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { toPhotoReadings, type AnalysisResult } from '@/features/hair-scan/analysis';
import { HAIR_SCAN_COPY } from '@/features/hair-scan/copy';
import {
  REGION_NEEDED,
  createScanState,
  orderedFrames,
  reduce,
  snapshotMesh,
} from '@/features/hair-scan/engine';
import { createScanHaptics } from '@/features/hair-scan/haptics';
import { scanBlock, scanPhotos, type HairScanFrame } from '@/features/hair-scan/result';
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
  ScanRegion,
  ScanState,
  ScanStatus,
  ScannerState,
} from '@/features/hair-scan/types';
import { deletePhotoFiles, persistCapture } from '@/lib/photo-storage';
import { useAppStore } from '@/store/app-store';
import { darkColors, iconSize, motion, radius, spacing, useTheme } from '@/theme';
import { sessionToExtend, type Angle, type PhotoSession } from '@/types/domain';

/* ------------------------------- tuning ------------------------------- */

/** How often the tracker is asked whether its last face has gone stale. */
const EXPIRE_TICK_MS = 250;
/** The "Scan complete" beat, before the processing screen. */
const COMPLETE_BEAT_MS = 1600;
const COMPLETE_BEAT_REDUCED_MS = 600;
/** The oval of live video, as a share of the window's width. */
const MASK_WIDTH_SHARE = 0.8;
const MASK_MAX_WIDTH = 340;
const MASK_ASPECT = 1.32;
/** Where the oval's centre sits, as a share of the window's height. */
const MASK_CENTRE_Y = 0.44;

/** Which of the journal's five angles a ring region files under. `up` files nowhere. */
const ANGLE_OF_REGION: Partial<Record<ScanRegion, Angle>> = {
  front: 'front',
  right: 'rightTemple',
  rightUp: 'rightTemple',
  rightDown: 'rightTemple',
  left: 'leftTemple',
  leftUp: 'leftTemple',
  leftDown: 'leftTemple',
  chin: 'top',
};

/* ---------------------------- view model ----------------------------- */

/** What React draws. Everything else the engine knows stays in the ref. */
type ViewModel = {
  scanner: ScannerState;
  status: ScanStatus;
  cue: ScanState['cue'];
  error: ScanState['error'];
  frameCount: number;
  /** The turn has stalled and the chin band is what is still missing. */
  chinWanted: boolean;
};

function viewOf(state: ScanState): ViewModel {
  return {
    scanner: state.scanner,
    status: state.status,
    cue: state.cue,
    error: state.error,
    frameCount: state.frames.length,
    chinWanted: state.stalled && state.regions.chin < REGION_NEEDED.chin,
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

function toneOf(view: ViewModel): StatusTone {
  if (GOOD_STATUS.has(view.status)) return 'good';
  if (view.cue && view.cue !== 'holdStill' && view.cue !== 'perfect') return 'adjust';
  return 'neutral';
}

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
  const toPaywall = useCallback(() => router.replace('/paywall'), [router]);
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
    level: lightLevel,
    status: lightStatus,
  } = useLightingProbe();
  // The probe's frame output rides on the camera's session. Built once
  // when the bridge resolves; undefined (not a fresh empty array) before
  // that, so the camera's outputs keep their identity until there is
  // something to add.
  const extraOutputs = useMemo(() => (frameOutput ? [frameOutput] : undefined), [frameOutput]);

  /* ------------------------------ engine ------------------------------ */

  const [initial] = useState(() => initialScanState(skipInstructions, granted));
  const [canTrack] = useState(trackable);
  const engine = useRef<ScanState>(initial);
  const [view, setView] = useState<ViewModel>(() => viewOf(initial));
  const [processingFrames, setProcessingFrames] = useState<ProcessingFrame[]>([]);
  const [session, setSession] = useState<PhotoSession | null>(null);
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
  /** `step`, reachable from the promises it starts. Bound in an effect below. */
  const stepRef = useRef<(action: ScanAction) => void>(() => undefined);

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
            camera.current?.takePhoto().then(
              (image) => {
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
                  angle: ANGLE_OF_REGION[f.region],
                  label: HAIR_SCAN_COPY.region[f.region],
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
    (raw: RawFace | null, preview: ViewSize) => {
      const now = Date.now();
      previewSize.current = preview;
      tracker.current = trackFrame(tracker.current, raw, now);
      const face = tracker.current.face;
      mesh.current?.setFace(face);
      const lighting = gateLevel();
      if (engine.current.scanner === 'scanning') {
        const t = tally.current;
        t.ticks += 1;
        if (face) t.faced += 1;
        if (lighting !== null) {
          t.lightSum += lighting;
          t.lightN += 1;
        }
      }
      step({
        type: 'tick',
        at: now,
        face: face ? toEngineReading(face, mask) : null,
        lighting,
      });
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
      step({ type: 'tick', at: now, face: null, lighting: gateLevel() });
    }, EXPIRE_TICK_MS);
    return () => clearInterval(timer);
  }, [cameraLive, gateLevel, step]);

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
  const stalledOnChin = view.chinWanted && (view.cue === 'moveSlowly' || view.cue === 'keepGoing');
  const cueLine = complete
    ? null
    : stalledOnChin
      ? HAIR_SCAN_COPY.scanning.chin
      : view.cue
        ? HAIR_SCAN_COPY.cue[view.cue]
        : null;
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
          angle: ANGLE_OF_REGION[f.region],
          ...(roll !== undefined && Number.isFinite(roll)
            ? { pose: { yaw: f.yaw, pitch: f.pitch, roll } }
            : {}),
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
  // The completion plate below says it once; the pill goes quiet for the beat.
  const status =
    cameraLive && !complete
      ? { tone: toneOf(view), label: HAIR_SCAN_COPY.status[view.status] }
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
            extraOutputs={extraOutputs}
            demoTracking
          />
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Path d={scrim} fill={darkColors.photoScrim} fillRule="evenodd" />
          </Svg>
          <HairMesh ref={mesh} scanning={scanning} tone={meshTone} />
          <ScanRing
            width={ring.width}
            height={ring.height}
            coverage={coverage}
            active={scanning || complete}
            complete={complete}
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
              <Guidance cue={cueLine} scanning={scanning} />
            )}
            {complete ? (
              <Text variant="subhead" center style={{ color: darkColors.textSecondary }}>
                {HAIR_SCAN_COPY.complete.frames(view.frameCount)}
              </Text>
            ) : scanning ? null : (
              <StartButton
                label={HAIR_SCAN_COPY.ready.cta}
                hint={HAIR_SCAN_COPY.ready.hint}
                ready={scanner === 'ready' && view.status === 'ready'}
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
