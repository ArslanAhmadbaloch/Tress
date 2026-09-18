/**
 * The hair scan: one continuous movement in four steps — look straight,
 * turn right, turn left, look down.
 *
 * There is no shutter anywhere in it. The engine asks for frames as the
 * head comes round, and what the person is given is a bar across the four
 * steps, a title in type big enough to read with their head turned away
 * from the phone, and one large arrow pointing the way. The brackets
 * light when the step's pose is reached; the mesh fills a quarter of the
 * head as each step's frame lands; and the beat at the end lists what was
 * captured — hairline, temples, crown — before the processing screen
 * takes over.
 *
 * This screen orchestrates and draws almost nothing itself. The engine
 * decides what is happening; the tracker smooths the detector; the step
 * chrome, the mesh, the light meter, the processing pass and the report
 * are each their own component. What lives here is the wiring between
 * them and the two things only a screen can own: the camera's lifetime
 * and the files on disk.
 *
 * ── What the scan measures ────────────────────────────────────────────
 * The processing pass does two things now. It still reads every kept
 * frame for light, focus and hair area, which is what the report has
 * always shown. It also hands each frame's segmentation mask, and the
 * face the tracker held at that shutter, to the measurement engine — so
 * the scan comes away with a share of hair in each of six named places
 * on the head, measured in that person's own face coordinates, with the
 * error bar the scan measured on itself beside every figure. Building
 * the face observation from the shutter-time mesh is this screen's part
 * of that; everything after it belongs to `measure/`.
 *
 * When the journal already holds a measured scan, the two are compared
 * and the comparison is stored with this one. Where the engine refused a
 * region — never in shot, read in too few frames, a difference inside
 * the noise — the refusal is stored as a refusal. Nothing on this path
 * fills a gap in, and nothing on this path turns a figure into a
 * sentence.
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

import {
  SAMPLE_SIZE,
  canSampleFrame,
  sampleFrame as sampleArFrame,
} from '../../modules/hair-face-tracking';

import { sampleCameraActive } from '@/components/capture/sample-camera';
import {
  CaptureChecklist,
  FrameBrackets,
  Guidance,
  InstructionSheet,
  PermissionView,
  START_BUTTON_SIZE,
  STEP_BAR_HEIGHT,
  StartButton,
  StepHeader,
  TopBar,
  TurnArrow,
  type CaptureChecklistItem,
  type TurnDirection,
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
  SCAN_STEPS,
  canStart,
  createScanState,
  isTurnFurtherCue,
  orderedFrames,
  reduce,
  snapshotMesh,
  squareOn,
  stepProgress,
  stepReached,
} from '@/features/hair-scan/engine';
import {
  FIT_CLOCK_START,
  FIT_TICK_MS,
  dueForFit,
  hairSilhouette,
  type FitClock,
} from '@/features/hair-scan/hair-fit';
import { createScanHaptics } from '@/features/hair-scan/haptics';
import { CAP_REGIONS } from '@/features/hair-scan/head-cap';
import { compareScans } from '@/features/hair-scan/measure';
import {
  ANGLE_OF_TARGET,
  faceObservationFor,
  lastMeasurement,
  scanBlock,
  scanPhotos,
  type HairScanFrame,
  type ScanPose,
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
  ScanFrame,
  ScanState,
  ScanStatus,
  ScanStep,
  ScannerState,
} from '@/features/hair-scan/types';
import { nitroAvailable } from '@/lib/native';
import { deletePhotoFiles, persistCapture } from '@/lib/photo-storage';
import { useAppStore } from '@/store/app-store';
import { hairContent } from '@/features/content/hair-content';
import { MIN_TOUCH_TARGET, darkColors, iconSize, motion, radius, spacing, useTheme } from '@/theme';
import { isScanSession, type PhotoSession } from '@/types/domain';

/* ------------------------------- tuning ------------------------------- */

/**
 * The segmenter's live entry point, as a type.
 *
 * Written as a type query rather than imported, because importing the
 * module here would pull the TFLite native module into every build that
 * opens this screen. The value is loaded lazily, behind `nitroAvailable`,
 * in the fit loop below.
 */
type SegmentFrame = typeof import('@/features/assessment/hair-segmenter').segmentFrame;

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

/*
  ── The screen's vertical budget ──────────────────────────────────────

  The chrome is measured first and the oval is given what is left, which
  is the opposite of how this screen used to work. The oval was placed at
  a fixed share of the window's height, the step header and the
  corrective plate were stacked into whatever column happened to remain
  under it, and neither of them shrinks: on a 375×667 phone the column
  came to 139 points and held 192 points of chrome, so most of "Hold
  still" — the only corrective voice the scan has — was off the bottom of
  the screen, and the "Step 2 of 4" line the owner's own reference names
  drew on exactly one phone in the range.

  So the four rooms below are reserved, in order, and the oval takes the
  rest. Each is the real floor of the thing that goes in it, named here
  rather than guessed: a change to any of those components changes a
  number in this block and nothing else.

  What that gives, computed from these constants and each phone's own
  safe-area insets — oval, then the room left under it, against the 76
  the corrective plate needs and the 96 the Start disc needs:

    375×667 (SE)      227×299   100
    375×812 (mini)    288×380   100
    390×844           312×412   102
    393×852           311×411   100
    430×932 (Max)     340×449   121

  On every phone in the range the header's band is met in full, so the
  "Step N of 4" line the reference names is always drawn; on the large
  ones the oval is the size it always was and has only moved down.
*/

/** The band the top bar sits in: its own button height, plus the gap above it. */
const TOP_BAR_ROOM = spacing.sm + MIN_TOUCH_TARGET;
/**
 * The step header's own floor, matching `step-header.tsx`: the counter
 * line and its gap, the bar, the gap under it, and the title block's
 * `minHeight`. Reserved whether or not a step is running, so the oval
 * does not move when the scan starts.
 */
const HEADER_COUNTER_ROOM = 20 + spacing.sm;
const HEADER_TITLE_ROOM = 96;
const HEADER_ROOM = HEADER_COUNTER_ROOM + STEP_BAR_HEIGHT + spacing.lg + HEADER_TITLE_ROOM;
/** The corrective plate's floor, matching `guidance.tsx`. */
const GUIDANCE_ROOM = 76;
/**
 * The Start disc and the air under it. The button's box is larger than
 * its disc — the rings around it are what swell on a press — and those
 * are allowed to run past the bottom of this room, because they are
 * decoration and the disc is the target.
 */
const START_ROOM = START_BUTTON_SIZE + spacing.xl;
/** What the band under the oval has to hold in the phase that asks most of it. */
const UNDER_OVAL_ROOM = Math.max(GUIDANCE_ROOM, START_ROOM);
/**
 * An oval smaller than this is not worth putting a head in, and the
 * height rule gives way to it rather than the other way round. It only
 * bites on a screen narrower than any this build runs on; above it, the
 * chrome's rooms are always met in full.
 */
const MASK_MIN_WIDTH = 160;

/* ---------------------------- view model ----------------------------- */

/** What React draws. Everything else the engine knows stays in the ref. */
type ViewModel = {
  scanner: ScannerState;
  status: ScanStatus;
  /** Which of the four things the person is being asked to do. */
  step: ScanStep;
  /** Where that step sits in `SCAN_STEPS`: what the header counts and the bar fills. */
  stepIndex: number;
  /** The head has come as far as this step asks: the brackets light and the arrow stops running. */
  reached: boolean;
  /**
   * How hard the arrow is asking, in quarters. 0 is calm, 1 is insisting.
   *
   * It is what the step has LEFT to do, not what it has done. The arrow
   * exists to get somebody to turn, so it has to be loudest at the moment
   * the instruction lands and nobody has moved yet, and to ease off as
   * the head comes round — the way a turnstile arrow does. Feeding it
   * `stepProgress` directly put it the other way about: dimmest, slowest
   * and driftless at zero degrees of turn, keenest in the last instant
   * before `settled` stopped it altogether. `turn-arrow.tsx` has always
   * said "visibly keener as a step stalls"; this is the figure that
   * means it.
   *
   * `stepProgress` moves on every tracker frame and the arrow takes a
   * plain number, so passing it through would re-render the screen thirty
   * times a second to feed an animation whose own gearbox is coarser than
   * that. Rounded to quarters it changes at most four times in a step,
   * and the bar's own fill is bound to the shared value instead.
   */
  urgency: number;
  /** What the Scan Complete list ticks. Both temples, because the row says "Temples". */
  hairlineDone: boolean;
  templesDone: boolean;
  crownDone: boolean;
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

/** How many places the arrow's urgency is rounded to. See `ViewModel.urgency`. */
const URGENCY_STEPS = 4;

function viewOf(state: ScanState): ViewModel {
  return {
    scanner: state.scanner,
    status: state.status,
    step: state.step,
    stepIndex: state.stepIndex,
    reached: stepReached(state, state.step),
    urgency: Math.round((1 - stepProgress(state)) * URGENCY_STEPS) / URGENCY_STEPS,
    hairlineDone: state.targets.hairline.captured,
    templesDone: state.targets.leftTemple.captured && state.targets.rightTemple.captured,
    crownDone: state.targets.crown.captured,
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

/**
 * The square the turn arrow is laid out in.
 *
 * The arrow is three chevrons, 38 across and 64 tall with two points of
 * gap — 118 by 64 lying down, and the same turned on its side for the
 * step that asks the head down. One square big enough for either, plus
 * the drift it swings through, is simpler than two boxes and cannot get
 * the rotated case wrong.
 */
const ARROW_BOX = 132;

/**
 * Which way each step turns the head, or null for the step that asks for
 * nothing but staying put.
 *
 * `right` and `left` here are the direction the HEAD moves, which is what
 * the person is told and what the arrow points at — never the side of the
 * head the camera ends up seeing. The engine's `REGION_OF_STEP` is the
 * one place those two are turned into one another.
 */
const ARROW_OF_STEP: Record<ScanStep, TurnDirection | null> = {
  front: null,
  right: 'right',
  left: 'left',
  down: 'down',
};

/** How far off the oval's centre the arrow sits, as a share of the oval's width. */
function arrowShift(direction: TurnDirection): number {
  if (direction === 'right') return 0.34;
  if (direction === 'left') return -0.34;
  return 0;
}

/** The same, down the oval, as a share of its height. */
function arrowDrop(direction: TurnDirection): number {
  return direction === 'down' ? 0.34 : 0;
}

/**
 * A kept frame's whole pose: the engine's yaw and pitch, with the roll
 * the tracker held at that shutter.
 *
 * Null when any of the three was never read. A pose with a hole in it is
 * not a pose: the journal would rather store no `pose` at all than one
 * with a zero standing in for a number nobody measured, and the
 * measurement engine refuses a frame whose head it cannot place — which
 * is the whole reason `faceFrameOf` returns null on a non-finite angle.
 */
function poseOf(frame: Pick<ScanFrame, 'yaw' | 'pitch'>, roll: number | undefined): ScanPose | null {
  if (roll === undefined || !Number.isFinite(roll)) return null;
  if (!Number.isFinite(frame.yaw) || !Number.isFinite(frame.pitch)) return null;
  return { yaw: frame.yaw, pitch: frame.pitch, roll };
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

    The test is "no scan has been taken yet", not "no session exists".
    Those were the same thing while the scanner was the only way to make
    a session; `/photo` is a second way, and it is not gated, so counting
    every session would charge somebody for their first scan because they
    had taken two plain photographs first — a free thing spending a free
    thing. The `sessionToExtend` clause that used to sit here is now
    implied rather than dropped: the only session it ever named is a
    pre-scan baseline, which is by definition not a scan session, so it
    still reads as unspent and completing it is still the free first
    session.
  */
  const [isBaseline] = useState(() => !data.sessions.some(isScanSession));

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
  /** When the scan ended, ISO-8601: what the measurement is stamped with. */
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [session, setSession] = useState<PhotoSession | null>(null);
  /**
   * A head is being followed and it is turned away from the camera. Not
   * a state of the engine — it is still `detecting` — so it is kept
   * beside the view model rather than in it, and it changes the pill's
   * word and nothing else.
   */
  const [facingAway, setFacingAway] = useState(false);
  /**
   * The cap's four quarters — hairline, left temple, right temple, crown,
   * each 0 or 1. The mesh reads it on the UI thread and lights that part
   * of the head as its step's frame lands, so the head fills in a
   * quarter at a time as the person turns.
   *
   * Built from `CAP_REGIONS` itself, which is the list the mesh INDEXES
   * this array by. It used to be built from the engine's
   * `REQUIRED_REGIONS` — a separately declared constant that happens to
   * hold the same four names in the same order — so reordering either
   * one would have lit the wrong quarter of somebody's head with every
   * test still green and nothing on screen to say so. One list, read
   * from the file that defines what the index means.
   */
  const regions = useSharedValue<number[]>(CAP_REGIONS.map(() => 0));
  /**
   * How far through the current step the head has come, 0–1. It feeds the
   * header's bar and the arrow's run without React seeing a frame: the
   * engine is reduced on every tracker tick and this is set there, beside
   * the regions, rather than being carried through the view model.
   */
  const stepBar = useSharedValue(0);
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
      if (state.targets !== before.targets) {
        regions.set(CAP_REGIONS.map((r) => (state.targets[r].captured ? 1 : 0)));
      }
      stepBar.set(stepProgress(state));
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
              setCapturedAt(new Date(current.completedAt ?? Date.now()).toISOString());
              setProcessingFrames(
                orderedFrames(current).map((f) => {
                  const still = { width: f.width, height: f.height };
                  const pose = poseOf(f, rollAt.current.get(f.id));
                  /*
                    The face as the measurement engine wants it: the box
                    and the landmarks in fractions of THIS still, built
                    from the mesh the live camera had at the shutter. It
                    is what lets the six regions be placed in the
                    person's own face coordinates rather than in the
                    picture's. A frame the tracker had no face for gets
                    none, and takes no part in the measurement.
                  */
                  const face =
                    f.mesh && pose ? faceObservationFor(f.mesh, still, pose) : null;
                  return {
                    id: f.id,
                    uri: f.uri,
                    region: f.region,
                    // The region the engine ASKED this frame for, never the
                    // ring bin the head happened to be in when the shutter
                    // fired: those are two different things and only one of
                    // them says what is in the picture.
                    angle: ANGLE_OF_TARGET[f.target],
                    label: HAIR_SCAN_COPY.target[f.target],
                    captureQuality: f.quality,
                    ...(face ? { face } : {}),
                    ...(f.mesh
                      ? { mesh: { still, face: f.mesh } }
                      : {}),
                  };
                }),
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
    [canTrack, haptics, regions, sampleStill, stepBar],
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

  /**
   * Where the chrome above the oval ends: the top bar's band, the step
   * header's whole floor, and the gap under it. Reserved in every phase,
   * so the oval sits in one place from the ready screen to the last step.
   */
  const bandTop = insets.top + TOP_BAR_ROOM;
  const ovalTop = bandTop + HEADER_ROOM + spacing.lg;

  const mask = useMemo<Rect>(() => {
    /*
      The oval takes what the chrome leaves, and is centred in it. On a
      large phone the width rule still decides and the oval is the size
      it always was, only lower; on a small one the height rule takes
      over and the oval narrows rather than pushing the corrective plate
      off the bottom of the screen.
    */
    const bottom = height - insets.bottom - spacing.xl - UNDER_OVAL_ROOM;
    const span = Math.max(MASK_MIN_WIDTH * MASK_ASPECT, bottom - ovalTop);
    const w = Math.max(
      MASK_MIN_WIDTH,
      Math.min(width * MASK_WIDTH_SHARE, MASK_MAX_WIDTH, span / MASK_ASPECT),
    );
    const h = w * MASK_ASPECT;
    return {
      x: (width - w) / 2,
      y: ovalTop + Math.max(0, (span - h) / 2),
      width: w,
      height: h,
    };
  }, [width, height, insets.bottom, ovalTop]);
  const scrim = useMemo(() => ovalCutout(width, height, mask), [width, height, mask]);
  /**
   * The band under the oval: one thing in it per phase — the Start
   * button before the scan, the corrective plate during it.
   *
   * It is measured rather than assumed only so the two can be centred
   * and anchored honestly; nothing is dropped when it is short, because
   * the oval above it was sized to leave `UNDER_OVAL_ROOM` here.
   */
  const bandUnder = mask.y + mask.height + spacing.lg;

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

  /* ------------------------ the cap on the hair ----------------------- */

  /**
   * Whether a fit is running, and when the last one finished. The rule
   * that reads it is `dueForFit`, which is pure and tested; this holds
   * only the state it reads.
   */
  const fitClock = useRef<FitClock>(FIT_CLOCK_START);

  /*
    Sitting the mesh on the hair, live.

    ── The chain, end to end ──────────────────────────────────────────
    `sampleArFrame` renders a 256-square of the AR frame on screen into raw
    RGBA bytes and hands them over with the size of the picture they came
    from. `segmentFrame` runs the bundled MediaPipe hair segmenter on
    those bytes — no file is written, nothing is decoded off disk, and
    nothing leaves the phone. `hairSilhouette` thresholds the mask, takes
    its largest connected region, walks that region's boundary and maps
    it into the preview's own points. `setHair` hands the outline to the
    mesh with the face it was sampled against, and `fitHairCap` inside
    the mesh turns the two into the three numbers the dome is stretched
    by. The cap then eases onto that shape over about half a second.

    ── Which phones run it ────────────────────────────────────────────
    Only the AR path, and only where every part of it exists: an iPhone
    with a TrueDepth camera (`arkit`), a binary whose native module has
    `sampleFrame` in it (`canSampleFrame` asks), and a binary with the Nitro
    runtime the TFLite model needs (`nitroAvailable`). Android, Expo Go,
    the simulator, an older iPhone and a development client built before
    any of this keep the standing dome — the same cap they draw today,
    with nothing else about the scan changed. Android keeps the dome this
    phase; nothing here has an Android half.

    ── The beat, and what happens when it slips ───────────────────────
    A fit is taken at most every `FIT_INTERVAL_MS` — about three a
    second — and never while the last one is still running: `dueForFit`
    says so. The clock is stamped when a fit STARTS, so the beat is the
    interval whenever a fit fits inside one and the fit's own duration
    when it does not; a fit that overruns therefore spreads the beat out
    rather than stacking one behind it, and a fit that does not overrun
    does not slow the beat down at all. Stamping on COMPLETION instead —
    which is what this did once — measures the interval from the wrong
    end and quietly halves the rate: every second tick lands inside the
    interval and is refused. The timer ticks at `FIT_TICK_MS`, half the
    beat, so its own jitter cannot cost a whole one. A skipped beat
    costs nothing — the cap is already wearing a shape and hair does not
    change between frames.

    ── Nothing is asked for before it can be used ─────────────────────
    The outline has to arrive in the PREVIEW's points, and the preview's
    size is only known once the camera has delivered a frame. Until then
    `hairSilhouette` would refuse every mask, so the beat would pay a
    native render and a whole model run per tick to throw the answer
    away. The size is therefore checked before the sample is asked for,
    and the clock is left alone so the first real frame is fitted at
    once rather than an interval later.

    ── The face, grabbed before the sample ────────────────────────────
    `fitHairCap` reads a width across the picture, which a few degrees of
    stale yaw corrupts, so the fit has to be measured against the head as
    it was WHEN THE FRAME WAS TAKEN. The tracked face is therefore read
    before the sample is asked for, not after the mask comes back.

    ── Refusals ───────────────────────────────────────────────────────
    A sample that could not be taken, a model that would not run, a mask
    with nothing honest in it: each is `setHair(null, …)`, which HOLDS
    the shape the cap is wearing. Only a long run of them eases the cap
    back to the standing allowance. None of it is a statement about
    anybody's hair, and no number any of it computes is shown, stored or
    compared.
  */
  useEffect(() => {
    // `foreground` is what the camera itself runs on: with the app behind
    // something else the AR session is down, every sample would be
    // refused, and a run of refusals is what eventually lets the cap go.
    if (!arkit || !cameraLive || !foreground) return undefined;
    if (!canSampleFrame() || !nitroAvailable()) return undefined;

    let live = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    let segment: SegmentFrame | null = null;

    const stop = (): void => {
      live = false;
      if (timer !== null) clearInterval(timer);
      timer = null;
    };

    /*
      How long the cap keeps re-fitting on the ready screen.

      The loop is worth its cost while the head is moving — that is the
      scan. On the ready screen the head is being lined up, not turned,
      and a phone parked there would otherwise render an AR frame and run
      the segmenter three times a second for as long as somebody left it
      sitting: a hot phone and a flat battery for a cap that has already
      settled. So the ready screen gets enough beats to fit the hair and
      then holds the last one; pressing Start begins the scan and the
      loop runs again for as long as the scan does.
    */
    const READY_FIT_BUDGET_MS = 12000;
    const startedAt = Date.now();

    const fit = async (): Promise<void> => {
      const now = Date.now();
      if (scanner === 'ready' && now - startedAt > READY_FIT_BUDGET_MS) return;
      if (segment === null || !dueForFit(fitClock.current, now)) return;
      // The head as it is at the moment the frame is asked for.
      const face = tracker.current.face;
      if (face === null) return;
      // And the preview it will be drawn into. No size yet means no
      // frame has arrived, so the fit could only be refused: costing a
      // native render and a model run to learn that is the one waste
      // this loop can see coming.
      const view = previewSize.current;
      if (!(view.width > 0) || !(view.height > 0)) return;
      fitClock.current = { busy: true, at: now };
      try {
        const sample = await sampleArFrame(SAMPLE_SIZE);
        const mask = await segment({
          data: sample.data,
          width: sample.size,
          height: sample.size,
        });
        if (!live) return;
        mesh.current?.setHair(
          mask === null
            ? null
            : hairSilhouette(mask, {
                source: { width: sample.sourceWidth, height: sample.sourceHeight },
                view,
              }),
          face,
        );
      } catch {
        // A frame the camera would not give, or a model run that threw.
        // A refusal holds the cap's shape; it never collapses it.
        if (live) mesh.current?.setHair(null, face);
      } finally {
        // `now`, not the time it is now: the beat is measured from one
        // fit's start to the next's, so a fit that took a moment does
        // not push the next one past the following tick. See `FitClock`.
        fitClock.current = { busy: false, at: now };
      }
    };

    void (async () => {
      try {
        // Never a static import: the segmenter reaches the TFLite native
        // module, and Metro reports a late module's load failure as fatal
        // rather than throwing it. `nitroAvailable()` above is the
        // question that has to be asked first — see `lib/native`.
        const model = await import('@/features/assessment/hair-segmenter');
        if (!live) return;
        segment = model.segmentFrame;
      } catch {
        // A binary built without the model. The dome is what this phone
        // draws, which is what every phone drew before this existed.
        stop();
        return;
      }
      timer = setInterval(() => {
        void fit();
      }, FIT_TICK_MS);
    })();

    return stop;
  }, [arkit, cameraLive, foreground, scanner]);

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
  /*
    What is said aloud, and only what is not said elsewhere. The step's
    title and instruction are the header's to announce — it speaks them
    itself as each step arrives — so this is the corrective line and the
    completion plate, and nothing while a step is simply running.
  */
  const spoken = !cameraLive ? null : complete ? HAIR_SCAN_COPY.complete.title : cueLine;

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
        const pose = poseOf(f, rollAt.current.get(f.id));
        return {
          uri: f.uri,
          width: f.width,
          height: f.height,
          capturedAt: new Date(f.capturedAt).toISOString(),
          angle: ANGLE_OF_TARGET[f.target],
          ...(pose ? { pose } : {}),
          // The shutter-time mesh gives the report its region crops; without
          // it every crop is the centred fallback.
          ...(f.mesh ? { mesh: f.mesh } : {}),
          ...(m ? toPhotoReadings(m) : {}),
        };
      });
      const picked = scanPhotos(frames);
      const t = tally.current;
      /*
        The regional measurement, and — when there is an earlier one to
        set it beside — the comparison.

        Both are the engine's answers, carried through untouched. Where
        it refused a region (never in shot, too few frames, confidence
        below its bar) the refusal travels with them: an unread region
        carries no figure, and a change it could not distinguish from the
        phone having been held differently comes back as `insufficient`
        with a delta of zero that means nothing. Nothing here fills
        either in, and nothing here turns one into a sentence — that is
        the report's job, in a later phase, and it will have to say what
        it does not know.

        `data.sessions` is newest-first, so the first session carrying a
        measurement is the most recent one; a build with no segmenter in
        it saves scans with no measurement at all, and those are stepped
        over rather than compared against.
      */
      const measurement = result.measurement;
      const previous = lastMeasurement(data.sessions);
      const changes = measurement && previous ? compareScans(measurement, previous) : null;
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
            measurement,
            changes,
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
    [addSession, data.sessions, step],
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
          {...(capturedAt === null ? {} : { capturedAt })}
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
    and the pill now says exactly that. Which step the head is on is the
    step header's news — in words, in large type — and a pill repeating
    it in one word underneath was two voices saying the same thing. So
    one status in, one readout out, and the phase carries the tone and
    the glyph with it.

    The completion plate below says it once; the pill goes quiet for the beat.
  */
  /*
    The arrow this step wants, and only while the steps are walking: the
    ready screen has a Start button to look at and the completion beat
    has a list.
  */
  const arrow = scanning ? ARROW_OF_STEP[view.step] : null;
  const stepCopy = HAIR_SCAN_COPY.step[view.step];
  /** What the Scan Complete list says, and which rows have their tick. */
  const captured: CaptureChecklistItem[] = [
    { id: 'hairline', label: HAIR_SCAN_COPY.checklist.hairline, captured: view.hairlineDone },
    { id: 'temples', label: HAIR_SCAN_COPY.checklist.temples, captured: view.templesDone },
    { id: 'crown', label: HAIR_SCAN_COPY.checklist.crown, captured: view.crownDone },
  ];
  const phase = scanPhaseFor(view.status);
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
              : phase === 'almost'
                ? HAIR_SCAN_COPY.phase.almost
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
          <HairMesh ref={mesh} scanning={scanning} tone={meshTone} regions={regions} />
          {/*
            The four corner brackets, on the oval rather than round the
            whole screen: what they frame is the head, and they light
            when this step's pose is reached. The dial that used to sit
            here went out with the two-beat choreography — a ring filling
            by sector said nothing a person could act on, and the arrow
            and the bar now say the two things they can.
          */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: mask.x,
              top: mask.y,
              width: mask.width,
              height: mask.height,
            }}>
            {/* The brackets fill their box; the box is the oval's. */}
            <FrameBrackets tone={scanning && view.reached ? 'reached' : 'neutral'} />
          </View>
          {arrow ? (
            /*
              The arrow, over the video and offset the way it points, so
              it is in the corner of the eye of somebody whose head is
              already turning. It stops running the moment the step's
              pose is reached: an arrow still insisting after the person
              has done the thing is the app not watching.
            */
            <TurnArrow
              direction={arrow}
              urgency={view.urgency}
              /*
                And when the engine is asking for more turn, the arrow
                asks with it: the plate's words and the arrow are one
                ask, not a sentence with a shrug behind it. Read off the
                cue rather than kept here, so the two can never disagree
                about whether the ask is on.
              */
              nudge={isTurnFurtherCue(view.cue)}
              settled={view.reached}
              style={{
                position: 'absolute',
                left: mask.x + mask.width / 2 - ARROW_BOX / 2 + arrowShift(arrow) * mask.width,
                top: mask.y + mask.height / 2 - ARROW_BOX / 2 + arrowDrop(arrow) * mask.height,
                width: ARROW_BOX,
                height: ARROW_BOX,
              }}
            />
          ) : null}
          <TopBar
            status={status}
            onClose={onClose}
            helpLabel={HAIR_SCAN_COPY.ready.help}
            closeLabel={HAIR_SCAN_COPY.ready.close}
          />
          {/*
            The band under the top bar, which is where the owner's
            reference puts the progress bar and where `step-header.tsx`
            says the header belongs. It is reserved in every phase — see
            the vertical budget above — so nothing below it moves when
            the steps begin.

            While the steps walk, the header has it: the bar across the
            four, the counter line, the title in type big enough to read
            with the head turned away from the phone, and one line under
            it. Before they do, it holds the light meter — the one moment
            somebody can still do something about a dark room — and the
            corrective line, because before the scan the bottom of the
            screen belongs to Start.
          */}
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: bandTop,
              paddingHorizontal: spacing.xxl,
              gap: spacing.md,
            }}>
            {complete ? null : scanning ? (
              /*
                The bar is driven from a shared value the reducer sets on
                every tracker frame, so it moves without React drawing a
                frame. The counter is always drawn: the band it sits in
                was measured for it, rather than being whatever was left
                over under the oval.
              */
              <StepHeader
                index={view.stepIndex}
                total={SCAN_STEPS.length}
                title={stepCopy.title}
                instruction={stepCopy.instruction}
                progress={stepBar}
                counter={HAIR_SCAN_COPY.stepCounter(view.stepIndex + 1, SCAN_STEPS.length)}
              />
            ) : (
              <>
                <LightingPill
                  level={lightLevel}
                  status={lightStatus}
                  style={{ alignSelf: 'center' }}
                />
                {/*
                  The plate is corrective only now — the step's own
                  instruction is the header's — so the line is chosen
                  here and the plate is handed one finished sentence or
                  nothing at all.
                */}
                <Guidance cue={cueLine} />
              </>
            )}
          </View>
          {/*
            The band under the oval holds one thing per phase, which is
            why nothing in it has to shrink: the Start button before the
            scan, the corrective plate during it. The oval above was
            sized to leave `UNDER_OVAL_ROOM` here, so neither can be
            pushed off the bottom of a small screen.
          */}
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: bandUnder,
              bottom: insets.bottom + spacing.xl,
              paddingHorizontal: spacing.xxl,
              alignItems: 'center',
              justifyContent: scanning ? 'flex-start' : 'center',
            }}>
            {complete ? null : scanning ? (
              <Guidance cue={cueLine} />
            ) : (
              <StartButton
                label={HAIR_SCAN_COPY.ready.cta}
                hint={HAIR_SCAN_COPY.ready.hint}
                ready={view.startReady}
                onPress={onStartPress}
                onActivate={onStart}
              />
            )}
          </View>
          {complete ? (
            /*
              The Scan Complete beat: one plate, at the foot of the
              screen, over the head the mesh is still settling on.

              It says three things and none of them is a finding. That
              the scan is done; what it came away with, named and ticked
              — the three places a person can check against their own
              head; and how many angles were kept. A row without its tick
              is a row whose frame never landed, and it stays unticked:
              the list says what happened, never what was meant to.
            */
            <Animated.View
              pointerEvents="none"
              entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.slow)}
              style={{
                position: 'absolute',
                left: spacing.xxl,
                right: spacing.xxl,
                bottom: insets.bottom + spacing.xl,
                alignItems: 'center',
                gap: spacing.xl,
                backgroundColor: darkColors.photoScrim,
                borderRadius: radius.lg,
                paddingVertical: spacing.xl,
                paddingHorizontal: spacing.xl,
              }}>
              {/*
                The live region is the headline alone, not the plate. The
                rows below are each their own checkbox with their own
                ticked state, and a polite region around all of them
                would have TalkBack read the list twice — once as the
                region's new content and once row by row.
              */}
              <View
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name="checkCircle" size={iconSize.md} color={darkColors.success} />
                <Text variant="headline" style={{ color: darkColors.textOnPhoto }}>
                  {HAIR_SCAN_COPY.complete.title}
                </Text>
              </View>
              <View style={{ alignSelf: 'stretch', gap: spacing.md }}>
                <Text variant="subhead" style={{ color: darkColors.textSecondary }}>
                  {HAIR_SCAN_COPY.complete.captured}
                </Text>
                <CaptureChecklist items={captured} />
              </View>
              <Text variant="subhead" center style={{ color: darkColors.textSecondary }}>
                {HAIR_SCAN_COPY.complete.frames(view.frameCount)}
              </Text>
            </Animated.View>
          ) : null}
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
