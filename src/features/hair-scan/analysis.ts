/**
 * The pass the device makes over the frames a hair scan captured.
 *
 * ── What this is ──────────────────────────────────────────────────────
 * A runner. It takes the curated frames, runs the app's own measurements
 * over each one — light and focus from `analysePhoto`, and, where the
 * segmenter is in the binary, hair area and its outline from
 * `measureCoverage` — and reports every unit of work as it finishes, so
 * the processing screen's bars move on work that has actually happened.
 *
 * ── The line it does not cross ────────────────────────────────────────
 * Nothing here is invented to keep a bar moving. A unit has a readability
 * floor, so a fast phone does not flick three labels past in one frame,
 * and the whole pass has a floor for the same reason; but a floor only
 * ever holds a finished reading on screen for a moment longer. It never
 * advances a bar past the work. When the segmenter is absent the area
 * units are not in the plan at all — the plan says so, the second stage
 * is shorter, and the note under it says why — rather than a bar that
 * fills over nothing.
 *
 * Every unit also has a ceiling. A model that never answers, or a file
 * the decoder cannot open, resolves as "no reading" for that frame and
 * the pass moves on. The screen can therefore never stall, and a frame
 * that was not measured says so in its own record instead of carrying a
 * plausible number.
 *
 * The measurements run one at a time. A unit that outruns its ceiling is
 * given up on for the screen's sake, but its promise is still running in
 * the native module, and the segmenter shares one interpreter with no
 * queue of its own. So the next measurement is chained behind the last
 * rather than started beside it: if the model has hung, every later area
 * unit waits behind it, hits its own ceiling, and is marked failed —
 * which is bounded, honest, and never two runs on one interpreter.
 *
 * ── What it says ──────────────────────────────────────────────────────
 * The labels describe the device's work on the images: reviewing,
 * mapping, comparing, building. None of them describes a head, and the
 * honesty sweep in `hair-scan-analysis.test.ts` reads every one. The line
 * at the end counts the frames that actually carry a reading, not the
 * frames that were handed in.
 *
 * ── The orbit's choreography ──────────────────────────────────────────
 * The processing screen's ring of frames is timed here too, as pure
 * functions — where a frame sits, how long the ring takes to form, when
 * the screen may hand off — because a renderer is not needed to reason
 * about any of that and the tests should not need one either. The
 * components in `components/hair-scan/orbit-frames.tsx` re-export them.
 * The second bar's pacing is here for the same reason: the runner's
 * work fills it to a share, and the gather — each frame's arrival at
 * the disc, reported when its glide has actually finished — fills the
 * rest, the last arrival completing it. `buildBarTarget` is that rule.
 *
 * Nothing in this file touches a native module at import time. The real
 * measurement functions are loaded lazily inside `defaultAnalysisDeps`,
 * behind `nitroAvailable()` where they need it, so the runner's pacing
 * and its null-model path can be exercised in Node with the measurements
 * mocked — which is what the tests do.
 */

import type { PhotoAnalysis } from '@/features/assessment/analyse-photo';
import type { Coverage } from '@/features/assessment/hair-mask';
import type { PhotoMeasurement } from '@/features/assessment/hair-segmenter';
import type { Quality } from '@/features/assessment/image-quality';
import type { Angle, Photo, PhotoMaskTrace } from '@/types/domain';

import type { ScanRegion } from './types';

/* ------------------------------- copy --------------------------------- */

/**
 * Every word the processing pass says.
 *
 * Kept here, next to the units that earn them, so a label cannot be shown
 * for work that is not in the plan. `copy.ts` in this feature is the
 * scan's vocabulary; these lines are the analysis's, and the sweep reads
 * both. Nothing here describes hair.
 */
export const ANALYSIS_COPY = {
  phase: {
    /** The first bar: reading each captured image. */
    analyse: 'Analysing your scan…',
    /** The second bar: the measurements becoming a report. */
    build: 'Building your hair report…',
  },
  unit: {
    /** Light, focus and clipping, per frame. */
    quality: 'Reviewing captured angles…',
    /** The area reading on the front frame, where the hairline sits. */
    hairline: 'Mapping your hairline…',
    /** The area reading on every other frame, read the same way. */
    coverage: 'Comparing visible coverage…',
    /** The measurements assembled into the report. */
    compose: 'Building your hair report…',
  },
  /** Shown under the second bar when this build carries no segmenter. */
  areaUnavailable: 'Hair area is not measured in this build',
  /**
   * Shown once every unit has finished. `measured` is the number of
   * frames that carry a reading; `total` is how many were handed in. The
   * line says what happened, so a pass over unreadable files does not
   * claim to have measured them.
   */
  done: (measured: number, total: number): string => {
    if (total === 0 || measured === 0) return 'The images could not be measured on this device.';
    const noun = total === 1 ? 'image' : 'images';
    if (measured >= total) return `${countWord(total)} ${noun} measured on this device.`;
    return `${countWord(measured)} of ${countWord(total).toLowerCase()} ${noun} measured on this device.`;
  },
} as const;

/** The engine keeps at most twelve frames; past that, digits. */
const WORDS = [
  'No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six',
  'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
];

function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}

/** Every fixed line, plus each function called with samples, for the sweep. */
export function analysisCopySentences(): string[] {
  const out: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      out.push(value);
      return;
    }
    if (typeof value === 'function') {
      const fn = value as (measured: number, total: number) => string;
      for (const [measured, total] of [[1, 1], [3, 3], [2, 5], [0, 5], [12, 12], [13, 14]]) {
        out.push(fn(measured, total));
      }
      return;
    }
    if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) visit(nested);
    }
  };
  visit(ANALYSIS_COPY);
  return out;
}

/* ------------------------------- types -------------------------------- */

/**
 * One curated frame, as the capture lane hands it over.
 *
 * The engine's `ScanFrame` knows the ring region a frame closed and not
 * yet the journal angle; the mapper resolves the angle later from the
 * pose. Either is enough to find the front frame, which is the one that
 * leads and carries the hairline. A frame with neither is read like any
 * other and simply does not lead.
 */
export type AnalysisFrame = {
  id: string;
  /** The captured file on this device. Never uploaded. */
  uri: string;
  angle?: Angle;
  region?: ScanRegion;
};

/** Whether the area reading was taken, and if not, why. */
export type AreaStatus =
  /** The segmenter ran and returned a mask. */
  | 'measured'
  /** This build has no segmenter; nothing looked. */
  | 'unavailable'
  /** The segmenter was there and could not read this frame, or outran its ceiling. */
  | 'failed';

/**
 * What one frame measured. Ready for the result mapper.
 *
 * Every field that can be absent is `null` rather than a default, because
 * "could not read" and "read as zero" are different things to say about
 * somebody's photograph.
 */
export type FrameMeasurement = {
  id: string;
  uri: string;
  angle?: Angle;
  region?: ScanRegion;
  /** Light, focus and clipping; null when the file could not be read. */
  quality: Quality | null;
  /** Hair area and where it sits in the frame; null unless `area` is 'measured'. */
  coverage: Coverage | null;
  /** The outline the area was counted over; rides with `coverage`. */
  maskTrace: PhotoMaskTrace | null;
  area: AreaStatus;
};

/** True when the frame carries at least one reading. */
export function isMeasured(frame: Pick<FrameMeasurement, 'quality' | 'coverage'>): boolean {
  return frame.quality !== null || frame.coverage !== null;
}

/** How many of the frames carry a reading. */
export function measuredFrameCount(frames: readonly Pick<FrameMeasurement, 'quality' | 'coverage'>[]): number {
  return frames.filter(isMeasured).length;
}

export type AnalysisPhase = 'analyse' | 'build';

export type AnalysisUnitKind = 'quality' | 'area' | 'compose';

/** One unit of real work, and the line shown while it runs. */
export type AnalysisUnit = {
  kind: AnalysisUnitKind;
  phase: AnalysisPhase;
  label: string;
  /** The frame this unit reads, or null for the compose unit. */
  frameId: string | null;
};

export type AnalysisPlan = {
  units: AnalysisUnit[];
  areaAvailable: boolean;
  /** Per phase: the bar's label and how many of the units it holds. */
  phases: Record<AnalysisPhase, { label: string; units: number }>;
  /** A line under the second bar when the area units are absent, else null. */
  note: string | null;
};

export type AnalysisProgress = {
  phase: AnalysisPhase;
  /** The unit running now, or the last one once everything has finished. */
  unit: AnalysisUnit;
  /** Units finished so far. */
  done: number;
  total: number;
  /** Each bar's fill, 0–1, from units that have finished. */
  fraction: Record<AnalysisPhase, number>;
  /** Frames whose every unit has finished, in the order they finished. */
  completedFrameIds: string[];
  /**
   * Frames whose every unit has finished AND that carry a reading, in the
   * order they finished. A subset of `completedFrameIds`; the screen's
   * tick means "measured", so this is the list it ticks from.
   */
  measuredFrameIds: string[];
  /** True on the final report, after the last unit and the total floor. */
  finished: boolean;
};

export type AnalysisResult = {
  frames: FrameMeasurement[];
  plan: AnalysisPlan;
  /** How many of `frames` carry a reading. */
  measured: number;
  /** Wall-clock time the pass took, floors included. */
  elapsedMs: number;
  /** True when `signal` fired before the last unit; `frames` is then partial. */
  aborted: boolean;
};

/** The two measurements, so tests can stand in for the native modules. */
export type AnalysisDeps = {
  analysePhoto: (uri: string) => Promise<PhotoAnalysis | null>;
  /** Null when this build has no segmenter — the honest null-model path. */
  measureCoverage: ((uri: string) => Promise<PhotoMeasurement | null>) | null;
};

export type AnalysisPacing = {
  /** The least time a unit's line stays on screen. */
  unitFloorMs: number;
  /** The least time the whole pass is on screen, however fast the phone. */
  totalFloorMs: number;
  /** The most a quality unit may take before it resolves as unread. */
  qualityCeilingMs: number;
  /** The most an area unit may take; the first one also loads the model. */
  areaCeilingMs: number;
};

export const ANALYSIS_PACING: AnalysisPacing = {
  unitFloorMs: 350,
  totalFloorMs: 2400,
  qualityCeilingMs: 3500,
  areaCeilingMs: 8000,
};

/* -------------------------------- plan -------------------------------- */

/** The front frame carries the hairline; it leads and it is the main one. */
export function pickMainFrame<T extends { angle?: Angle; region?: ScanRegion }>(
  frames: readonly T[],
): T | null {
  return (
    frames.find((f) => f.angle === 'front') ??
    frames.find((f) => f.region === 'front') ??
    frames[0] ??
    null
  );
}

/** Frames in reading order: the main one first, the rest as captured. */
export function orderFrames<T extends { angle?: Angle; region?: ScanRegion }>(
  frames: readonly T[],
): T[] {
  const main = pickMainFrame(frames);
  if (!main) return [];
  return [main, ...frames.filter((f) => f !== main)];
}

/**
 * The units a pass will run, in order, before any of them runs.
 *
 * Quality first for every frame, then area for every frame, then the
 * compose unit. Area follows quality rather than interleaving with it so
 * the first bar is entirely the light-and-focus reading and the second
 * bar is entirely the report being built — which is what the two labels
 * say, and what the orbit on the processing screen ticks along to.
 */
export function planAnalysis(frames: readonly AnalysisFrame[], areaAvailable: boolean): AnalysisPlan {
  const ordered = orderFrames(frames);
  const units: AnalysisUnit[] = [];

  for (const frame of ordered) {
    units.push({
      kind: 'quality',
      phase: 'analyse',
      label: ANALYSIS_COPY.unit.quality,
      frameId: frame.id,
    });
  }

  if (areaAvailable) {
    // The main frame is the front one where there is a front one, and
    // the hairline is what its area reading maps. The rest are read the
    // same way and compared.
    ordered.forEach((frame, index) => {
      units.push({
        kind: 'area',
        phase: 'build',
        label: index === 0 ? ANALYSIS_COPY.unit.hairline : ANALYSIS_COPY.unit.coverage,
        frameId: frame.id,
      });
    });
  }

  units.push({
    kind: 'compose',
    phase: 'build',
    label: ANALYSIS_COPY.unit.compose,
    frameId: null,
  });

  return {
    units,
    areaAvailable,
    phases: {
      analyse: {
        label: ANALYSIS_COPY.phase.analyse,
        units: units.filter((u) => u.phase === 'analyse').length,
      },
      build: {
        label: ANALYSIS_COPY.phase.build,
        units: units.filter((u) => u.phase === 'build').length,
      },
    },
    note: areaAvailable ? null : ANALYSIS_COPY.areaUnavailable,
  };
}

/**
 * A measurement as the record stores it.
 *
 * The mapper takes frames shaped like `Photo`, where an absent reading
 * is an absent field. `null` here becomes `undefined` there, and the
 * area status is not carried: on the record, "not measured" is the
 * absence of the figure, whichever reason it was absent for.
 */
export function toPhotoReadings(
  measurement: FrameMeasurement,
): Pick<Photo, 'quality' | 'coverage' | 'maskTrace'> {
  return {
    quality: measurement.quality ? { ...measurement.quality } : undefined,
    coverage: measurement.coverage ? { ...measurement.coverage } : undefined,
    maskTrace: measurement.maskTrace ?? undefined,
  };
}

/* ------------------------------- runner ------------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A sentinel for work that outran its ceiling, distinct from a null reading. */
const OUTRAN = Symbol('outran');

/** Resolves with the work's value, or `OUTRAN` once `ms` have passed. */
function withinTime<T>(work: Promise<T>, ms: number): Promise<T | typeof OUTRAN> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(OUTRAN), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        // A measurement that threw is a frame we say nothing about.
        resolve(OUTRAN);
      },
    );
  });
}

/**
 * One measurement at a time.
 *
 * Every call is chained behind the previous one, settled or not. The
 * runner may stop waiting for a measurement at its ceiling, but the
 * measurement itself is still running in the native module, and the
 * segmenter's interpreter is one object with no queue of its own; a
 * second `model.run` beside the first is exactly what this prevents. A
 * hung measurement therefore holds every later one behind it — each of
 * which then hits its own ceiling — rather than piling on top of it.
 */
function serialLane() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
  };
}

/**
 * The real measurements, loaded only when asked for.
 *
 * `analysePhoto` pulls in expo-file-system and the image manipulator;
 * `measureCoverage` pulls in TFLite through Nitro. Neither may be imported
 * at the top of a module that Node has to load, and the segmenter may not
 * be imported at all in a binary without Nitro — Metro reports that as a
 * fatal error rather than a thrown one (see `lib/native`).
 */
export async function defaultAnalysisDeps(): Promise<AnalysisDeps> {
  const [{ analysePhoto }, { nitroAvailable }] = await Promise.all([
    import('@/features/assessment/analyse-photo'),
    import('@/lib/native'),
  ]);

  let measureCoverage: AnalysisDeps['measureCoverage'] = null;
  if (nitroAvailable()) {
    try {
      const segmenter = await import('@/features/assessment/hair-segmenter');
      measureCoverage = segmenter.measureCoverage;
    } catch {
      // A binary built without the model: the area units stay out of the
      // plan, and the screen says so.
      measureCoverage = null;
    }
  }

  return { analysePhoto, measureCoverage };
}

export type RunAnalysisOptions = {
  /** Called once, before the first unit, with the units that will run. */
  onPlan?: (plan: AnalysisPlan) => void;
  onProgress?: (progress: AnalysisProgress) => void;
  /** Supplied by tests; the app loads the real modules when this is absent. */
  deps?: AnalysisDeps;
  /** Fired when the screen goes away; the pass stops between units. */
  signal?: AbortSignal;
  pacing?: Partial<AnalysisPacing>;
};

/**
 * Runs the plan and reports each unit as it finishes.
 *
 * Progress is reported twice per unit — once as it starts, with its label,
 * and once as it finishes, with the bar advanced — and once more after the
 * total floor with `finished: true`. Bars only ever advance on the second
 * kind, so they are bound to work that has happened.
 */
export async function runAnalysis(
  frames: readonly AnalysisFrame[],
  options: RunAnalysisOptions = {},
): Promise<AnalysisResult> {
  const startedAt = Date.now();
  const pacing = { ...ANALYSIS_PACING, ...options.pacing };
  const deps = options.deps ?? (await defaultAnalysisDeps());
  const plan = planAnalysis(frames, deps.measureCoverage !== null);
  const ordered = orderFrames(frames);
  options.onPlan?.(plan);

  const measurements = new Map<string, FrameMeasurement>(
    ordered.map((f) => [
      f.id,
      {
        id: f.id,
        uri: f.uri,
        angle: f.angle,
        region: f.region,
        quality: null,
        coverage: null,
        maskTrace: null,
        area: plan.areaAvailable ? 'failed' : 'unavailable',
      },
    ]),
  );

  const unitsPerFrame = plan.areaAvailable ? 2 : 1;
  const unitsDoneByFrame = new Map<string, number>();
  const completedFrameIds: string[] = [];
  const measuredFrameIds: string[] = [];
  const total = plan.units.length;
  const measure = serialLane();
  let done = 0;

  const report = (unit: AnalysisUnit, finished: boolean) => {
    const analyseDone = Math.min(done, plan.phases.analyse.units);
    const buildDone = Math.max(0, done - plan.phases.analyse.units);
    options.onProgress?.({
      phase: unit.phase,
      unit,
      done,
      total,
      fraction: {
        analyse: plan.phases.analyse.units > 0 ? analyseDone / plan.phases.analyse.units : 1,
        build: plan.phases.build.units > 0 ? buildDone / plan.phases.build.units : 1,
      },
      completedFrameIds: [...completedFrameIds],
      measuredFrameIds: [...measuredFrameIds],
      finished,
    });
  };

  const result = (aborted: boolean): AnalysisResult => {
    const out = ordered.map((f) => measurements.get(f.id)!);
    return {
      frames: out,
      plan,
      measured: measuredFrameCount(out),
      elapsedMs: Date.now() - startedAt,
      aborted,
    };
  };

  for (const unit of plan.units) {
    if (options.signal?.aborted) return result(true);

    report(unit, false);
    const unitStartedAt = Date.now();

    if (unit.kind === 'quality' && unit.frameId !== null) {
      const frame = measurements.get(unit.frameId)!;
      const reading = await withinTime(
        measure(() => deps.analysePhoto(frame.uri)).catch(() => null),
        pacing.qualityCeilingMs,
      );
      frame.quality = reading === OUTRAN || reading === null ? null : reading.quality;
    } else if (unit.kind === 'area' && unit.frameId !== null && deps.measureCoverage) {
      const frame = measurements.get(unit.frameId)!;
      const measureCoverage = deps.measureCoverage;
      const reading = await withinTime(
        measure(() => measureCoverage(frame.uri)).catch(() => null),
        pacing.areaCeilingMs,
      );
      if (reading !== OUTRAN && reading !== null) {
        frame.coverage = reading.coverage;
        frame.maskTrace = reading.maskTrace;
        frame.area = 'measured';
      }
      // Otherwise the frame keeps 'failed': the model was there and it
      // did not answer for this file, which is what the record says.
    }
    // The compose unit's work is the assembly in `result` below; its
    // floor is what lets the second bar be seen reaching its end.

    // The floor holds a finished reading on screen for a beat; it never
    // starts the next unit early.
    const left = pacing.unitFloorMs - (Date.now() - unitStartedAt);
    if (left > 0) await sleep(left);

    done += 1;
    if (unit.frameId !== null) {
      const count = (unitsDoneByFrame.get(unit.frameId) ?? 0) + 1;
      unitsDoneByFrame.set(unit.frameId, count);
      if (count === unitsPerFrame) {
        completedFrameIds.push(unit.frameId);
        if (isMeasured(measurements.get(unit.frameId)!)) measuredFrameIds.push(unit.frameId);
      }
    }
    report(unit, false);
  }

  // The bars reached their ends when the last unit finished; this is so
  // the person can see that they did, not so the bars can be padded.
  const remaining = pacing.totalFloorMs - (Date.now() - startedAt);
  if (remaining > 0) await sleep(remaining);

  const last = plan.units[plan.units.length - 1];
  if (last) report(last, true);
  return result(false);
}

/* --------------------------- orbit choreography ----------------------- */

/**
 * The ring of frames on the processing screen, as numbers.
 *
 * The frames leave the centre one after another and glide out to a ring;
 * at the end they glide back together. The screen may only hand off once
 * two things have both happened: the pass has finished, and the ring has
 * formed. The first is the runner's; the second is these numbers'. Keying
 * the hand-off to the pass alone — as an earlier draft did — cut the ring
 * off mid-glide on any build where the pass ends at its total floor,
 * which is every build without the segmenter.
 */

/** How long one frame's glide out takes, and the gap between frames. */
export const ORBIT_ENTER_MS = 760;
export const ORBIT_STAGGER_MS = 150;
/** The glide back in at the end; all frames leave together, faster than they came. */
export const ORBIT_CONVERGE_MS = 520;
export const ORBIT_CONVERGE_STAGGER_MS = 60;
/** Once the last frame has settled, how long the ring is held before it may gather. */
export const ORBIT_SETTLE_HOLD_MS = 500;
/** After the last frame has gathered, how long the disc holds before the hand-off. */
export const HANDOFF_HOLD_MS = 260;

/*
  The absorb: the gather the screen actually plays. The frames leave
  orbit one at a time, each gliding into the disc's centre, and the disc
  takes a breath as each arrives; once the last is in and the breath is
  over, the disc holds, then the hand-off runs. `orbitConvergeMs` and
  `handoffSchedule` above describe the earlier all-together gather and
  are kept for what still holds them.
*/
/** One frame's glide from its place in orbit to the disc's centre. */
export const ORBIT_ABSORB_MS = 560;
/** The gap between one frame leaving orbit and the next. */
export const ORBIT_ABSORB_STAGGER_MS = 260;
/** The breath the disc takes as a frame arrives: 1 → 1.07 → 1. */
export const ORBIT_ABSORB_PULSE_MS = 360;
/** Once the last frame is in and the disc has settled, how long it holds before the hand-off. */
export const ORBIT_ABSORB_SETTLE_MS = 450;

/*
  The second bar and the gather. The runner's work fills the bar only to
  `BUILD_BAR_WORK_SHARE`; the rest is the gather, which is a real thing
  on the screen — each frame's arrival at the disc is reported from the
  UI thread when its glide has actually finished — so the bar's last
  stretch is bound to arrivals, not to a clock. Each arrival adds
  `BUILD_BAR_CREEP_RATIO` of what the one before added, every arrival
  including the last, and the steps are sized so the last — the
  smallest — lands the bar at exactly 1. That is the shape the owner
  asked for: the bar slows down while the frames go in, and finishes
  when the last one has. With four frames the arrival before the last
  leaves the bar at about 98%.
*/
/** The share of the second bar the runner's work fills; the gather fills the rest. */
export const BUILD_BAR_WORK_SHARE = 0.85;
/** How much of the previous arrival's step the next arrival adds: under 1, so the bar slows down. */
export const BUILD_BAR_CREEP_RATIO = 0.7;

/**
 * How many arrivals the second bar waits on before it may complete: one
 * per frame gliding in, or one — the disc's lone breath — when nothing
 * glides (a scan that kept only the main frame, or Reduce Motion, where
 * the frames fade together).
 */
export function absorbBeats(count: number, reduceMotion: boolean): number {
  return reduceMotion || count <= 0 ? 1 : count;
}

/**
 * Where the second bar should be, given the runner's work and the
 * gather so far.
 *
 * `workDone` is the runner's build fraction (0–1); `absorbed` is how many
 * arrivals have been reported and `total` how many there will be (see
 * `absorbBeats`). The bar never runs ahead of the work: below full work
 * it is the work's share, whatever `absorbed` says. With the work done
 * it holds at the work share until the first arrival; then each arrival
 * adds `BUILD_BAR_CREEP_RATIO` of the step before it — the last arrival
 * included, so the final step is the smallest — and the steps are sized
 * so that the last lands the bar at exactly 1. A `total` of 0 means
 * nothing to wait on at all, and the bar is the work alone.
 */
export function buildBarTarget(input: { workDone: number; absorbed: number; total: number }): number {
  const { workDone, absorbed, total } = input;
  const work = Math.min(1, Math.max(0, workDone));
  if (total <= 0) return work;
  if (work < 1 || absorbed <= 0) return work * BUILD_BAR_WORK_SHARE;
  if (absorbed >= total) return 1;
  // A geometric series over the arrivals: step k is r^(k-1) times the
  // first, and the `total` steps sum to the whole of the gather's share.
  const r = BUILD_BAR_CREEP_RATIO;
  const climbed = (1 - r ** absorbed) / (1 - r ** total);
  return BUILD_BAR_WORK_SHARE + (1 - BUILD_BAR_WORK_SHARE) * climbed;
}

/** The largest a frame in orbit is drawn, and the smallest a crowded ring shrinks one to. */
export const ORBIT_FRAME_MAX = 80;
export const ORBIT_FRAME_MIN = 56;

export type OrbitPosition = { x: number; y: number };

/**
 * Places `count` frames evenly around a ring of `radius`.
 *
 * The first frame sits at the top-left rather than straight up, so a
 * ring of four lands on the diagonals — which keeps the row of bars
 * beneath and the disc's top clear — and alternate frames sit slightly
 * inside the ring so it reads as a loose constellation rather than a
 * clock face.
 */
export function orbitPositions(count: number, radius: number): OrbitPosition[] {
  if (count <= 0) return [];
  const step = 360 / count;
  const start = -90 - step / 2;
  return Array.from({ length: count }, (_, i) => {
    const angle = ((start + i * step) * Math.PI) / 180;
    const r = radius * (i % 2 === 0 ? 1 : 0.9);
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  });
}

/**
 * The side of one frame in orbit: as large as the reference's, unless
 * the ring is crowded, in which case the frames shrink so neighbours do
 * not overlap. Twelve frames on a phone-sized ring is the crowded case.
 */
export function orbitFrameSize(count: number, radius: number): number {
  if (count <= 0) return ORBIT_FRAME_MAX;
  const spacing = (2 * Math.PI * radius) / count;
  return Math.round(Math.min(ORBIT_FRAME_MAX, Math.max(ORBIT_FRAME_MIN, spacing * 0.85)));
}

/** How long, from the orbit phase starting, until the last frame has settled. */
export function orbitSettleMs(count: number): number {
  return count <= 0 ? 0 : ORBIT_ENTER_MS + (count - 1) * ORBIT_STAGGER_MS;
}

/** How long, from the converge phase starting, until the last frame is gone. */
export function orbitConvergeMs(count: number): number {
  return count <= 0 ? 0 : ORBIT_CONVERGE_MS + (count - 1) * ORBIT_CONVERGE_STAGGER_MS;
}

/** When, from the absorb beginning, frame `index` arrives at the disc's centre. */
export function orbitAbsorbAtMs(index: number): number {
  return index * ORBIT_ABSORB_STAGGER_MS + ORBIT_ABSORB_MS;
}

/** How long, from the absorb beginning, until the last frame has arrived at the disc. */
export function orbitAbsorbMs(count: number): number {
  return count <= 0 ? 0 : orbitAbsorbAtMs(count - 1);
}

/**
 * How long, from the absorb beginning, until the screen may hand off:
 * the last arrival, the breath the disc takes on it, and the settle. A
 * scan that kept only the main frame has nothing to absorb, and under
 * Reduce Motion the frames fade together instead of gliding; in both
 * the disc still takes its one breath, so the beat reads.
 */
export function absorbHandoffMs(count: number, reduceMotion: boolean, reducedFadeMs = 240): number {
  const gather = reduceMotion ? (count > 0 ? reducedFadeMs : 0) : orbitAbsorbMs(count);
  return gather + ORBIT_ABSORB_PULSE_MS + ORBIT_ABSORB_SETTLE_MS;
}

/**
 * How long, from the absorb beginning, until every arrival the second
 * bar waits on should have been reported: the last frame's glide and
 * the breath on it. The screen treats this as a floor on the count, not
 * as its pace — on a nominal pass every arrival has landed before it,
 * and the floor changes nothing; if the ring ever reported one arrival
 * fewer than the bar was told to wait on, the bar would otherwise never
 * complete, and the report would open over a stalled bar. The settle
 * that follows keeps the completed bar on screen before the hand-off.
 */
export function absorbFloorMs(count: number, reduceMotion: boolean, reducedFadeMs = 240): number {
  return absorbHandoffMs(count, reduceMotion, reducedFadeMs) - ORBIT_ABSORB_SETTLE_MS;
}

/**
 * How long after the orbit phase begins the ring may start to gather:
 * the lead, the last frame's settle, and a hold so the finished ring is
 * seen. Under Reduce Motion the frames appear in place, so only a short
 * fade needs to be waited out.
 */
export function orbitReadyMs(count: number, leadMs: number, reduceMotion: boolean, reducedFadeMs = 240): number {
  if (count <= 0) return 0;
  if (reduceMotion) return reducedFadeMs + ORBIT_SETTLE_HOLD_MS;
  return leadMs + orbitSettleMs(count) + ORBIT_SETTLE_HOLD_MS;
}

/**
 * When, on the screen's clock, the frames may gather and the screen may
 * hand off. Both wait for the later of two moments: the ring being ready
 * (`orbitStartedAt + orbitReadyMs`) and the pass finishing (`finishedAt`).
 * Null while either has not happened.
 */
export function handoffSchedule(input: {
  count: number;
  orbitStartedAt: number | null;
  finishedAt: number | null;
  leadMs: number;
  reduceMotion: boolean;
  reducedFadeMs?: number;
}): { convergeAt: number; handoffAt: number } | null {
  const { count, orbitStartedAt, finishedAt, leadMs, reduceMotion, reducedFadeMs } = input;
  if (orbitStartedAt === null || finishedAt === null) return null;
  const ringReadyAt = orbitStartedAt + orbitReadyMs(count, leadMs, reduceMotion, reducedFadeMs);
  const convergeAt = Math.max(ringReadyAt, finishedAt);
  const gather = reduceMotion ? (reducedFadeMs ?? 240) : orbitConvergeMs(count);
  return { convergeAt, handoffAt: convergeAt + gather + HANDOFF_HOLD_MS };
}
