/**
 * The hair scan report's view-model: everything the report screen draws,
 * built once, in one place, out of the measurement the scan already took.
 *
 * ── What the report is ────────────────────────────────────────────────
 * A hero still, and then a sheet of sections in one order: what the scan
 * found, what that is set against, and then everything else. The
 * assessment with its overall figure and its coverage map; a card for
 * each region the scan could read; visible scalp; the two temples side
 * by side; what cleared the noise floor since the last scan and since
 * the baseline; the places worth aiming the next scan at; the goal they
 * stated, with the reading at the region it points at. Only then how the
 * frames themselves came out, the coach's paragraph, the care notes, the
 * routine shelf and the hairstyles.
 *
 * The screen renders this model and computes nothing, so the honesty
 * sweep in scripts/test/hair-scan-report-model.test.ts reads the whole
 * report by building it.
 *
 * ── Where the figures come from ───────────────────────────────────────
 * Every one of them was computed before this file ran. `measureScan`
 * reads the frames during processing and the result is stored on the
 * session; `compareScans` decides, and is the only thing allowed to
 * decide, whether a difference between two scans is a difference at all.
 * This file turns a measured share into a score in `grade.ts`, picks
 * which region leads, and chooses the English. It measures nothing,
 * re-derives nothing, and softens no verdict.
 *
 * The score has one name, `Visual Coverage`, and one meaning: the share
 * of a region that read as hair in an image. It is not hair density, a
 * follicle count or a shaft measurement, and no sentence this file
 * builds may be worded as though it were. `grade.ts` states the rule;
 * the sweeps enforce it.
 *
 * ── Availability ──────────────────────────────────────────────────────
 * A scan that carries no measurement, or one that read no region, has no
 * analysis half at all: `availability` is `unavailable`, the assessment
 * carries the words and the rescan action, and every measured block is
 * empty. No zeroes, no coverage map of dashes, no paragraph written as
 * though a reading had been taken. The quality section, the profile, the
 * care notes and the shelf are still a real report about a real scan.
 *
 * ── One report for everybody ──────────────────────────────────────────
 * There is no male report and no female report, and there must never be
 * one. Which region leads is decided by three things the person said —
 * their goal, the part of the head they watch, and how they wear their
 * hair — and by what the scan could actually read. A middle part leads
 * with the part line; a temple concern leads with the temples. The
 * figures are identical whatever the answers: only the order changes.
 *
 * ── What each section may say ─────────────────────────────────────────
 * An observation is a comparison of two figures this model holds. A
 * change row is a verdict the engine reached. A watch item carries the
 * figure that put it on the list. A quality row is an observation about
 * a frame. A strength is a true positive about the images or the record.
 * A profile tile is the label of a choice, never a finding. The tips are
 * general care practice. The routine block is the shelf. The coach's
 * paragraph is the coach's.
 *
 * ── Locking ───────────────────────────────────────────────────────────
 * Without Premium the analysis detail — the cards, scalp visibility,
 * symmetry, the comparisons, the watch list — the quality rows, the goal
 * block, the tips and the routine block are held. The hero, the
 * assessment's own figure, the strengths, the profile and the coach's
 * paragraph are free: a free reading is never less qualified, and never
 * a different reading, about the same pictures. Premium locks nothing.
 *
 * ── "Measured" ────────────────────────────────────────────────────────
 * A quality row is `measured` only when a hair-area reading is behind a
 * figure on it. Light and focus are read off the pixels too, but they do
 * not earn the mark, and the light row never carries it.
 *
 * Pure: no React, nothing native. Loaded by `node --test`.
 */

import { profileSentence, tressSays } from '@/features/coach/report-summary';
import { buildShelf } from '@/features/products/shelf';
import { daysBetween, formatDateShort, formatDuration } from '@/lib/date';
import { adherencePercent, currentStreak } from '@/store/selectors';
import {
  APPROACH_LABELS,
  HAIR_GOAL_LABELS,
  HAIR_TYPE_LABELS,
  MOTIVATION_LABELS,
  ONSET_LABELS,
  SCALP_SENSITIVITY_LABELS,
  SCALP_TYPE_LABELS,
  TRACKING_AREA_LABELS,
  isScanSession,
  joinPhrases,
  journeyGoals,
  journeyHairType,
  journeyHairWearing,
  journeyScalpSensitivity,
  journeyScalpType,
  type Angle,
  type AppData,
  type HairGoal,
  type HairWearing,
  type Journey,
  type Photo,
  type PhotoRegion,
  type PhotoSession,
  type TrackingArea,
} from '@/types/domain';

import { HAIRSTYLE_COPY, hairstylesFor } from '@/features/hairstyles';

import { FRONT_LOCK_DEG } from './engine';
import {
  COMPARABLE_CONFIDENCE,
  COVERAGE_SCORE_MAX,
  comparable,
  confidenceBand,
  confidencePercent,
  gradeOf,
  overallGrade,
  visibleScalpPointsOf,
  type Grade,
} from './grade';
import {
  SCAN_REGIONS,
  compareScans,
  type ChangeVerdict,
  type RegionChange,
  type RegionMeasurement,
  type ScanMeasurement,
  type ScanRegion,
} from './measure';
import { cropFor, type ReportCrop } from './region-crops';
import {
  HAIR_SCAN_REPORT_MODEL_COPY as COPY,
  deg,
  pct,
  quotedSpans,
  stripQuotes,
} from './report-copy';
import { SCAN_THRESHOLDS, areaReading, focusWord, lightWord, lightingBand } from './result';
import { tipProfileOf, tipsForProfile, type Tip } from './tips';

/* -------------------------------- the model ------------------------------ */

export type ReportRegion = PhotoRegion;
export type { ReportCrop, Tip };

/**
 * The tab row over the detailed analysis.
 *
 * `midScalp` and `partLine` are places the measurement engine reads but
 * the scan never photographs on their own — both are read off the frame
 * taken with the chin down — so they had no tab while the report was
 * built out of frames. They have one now that the report is built out of
 * the measurement. `light` stays: it is the scan-quality row's tab, and
 * the quality section still filters by it.
 */
export type ReportTab =
  | 'all'
  | 'hairline'
  | 'temples'
  | 'crown'
  | 'midScalp'
  | 'partLine'
  | 'light';

/* --------------------------- the measured half --------------------------- */

export type { Grade, ScanRegion, RegionChange, ChangeVerdict };

/**
 * Whether the measurement engine read this scan at all.
 *
 * `unavailable` is not a degraded `measured`. It means the whole
 * analysis half of the report is absent — no overall figure, no map, no
 * cards, no comparison — and the screen shows the rescan state instead
 * of a page of zeroes. Nothing is estimated to stand in for a reading
 * that was never taken.
 */
export type Availability = 'measured' | 'unavailable';

/** One region on the coverage map: the figure, or the absence of one. */
export type CoverageMapRegion = {
  region: ScanRegion;
  label: string;
  /** `Visual Coverage` out of 100, or null where the scan could not read the region. */
  score: number | null;
  /** 0–1, the engine's own. Zero where there is no score. */
  confidence: number;
  /**
   * The confidence in words, for the chip a screen reader reads out:
   * "Confidence 80%". Null where there is no score, because there is no
   * confidence in a reading nobody took.
   */
  confidenceLabel: string | null;
};

/**
 * One region's card in the detailed analysis.
 *
 * Every field is either something the engine measured or a sentence
 * built out of two figures this model holds. `grade` is null for a
 * region the engine refused — null, never zero.
 */
export type RegionCard = {
  region: ScanRegion;
  label: string;
  grade: Grade | null;
  /** Samples in this region that read as scalp rather than hair, out of 100. */
  visibleScalp: number | null;
  /** Points of visual coverage between this temple and the other one. Temples only. */
  symmetry?: number;
  /** This region set beside the baseline scan, when there is one to set it beside. */
  changeFromBaseline?: RegionChange;
  /**
   * That difference in whole points of visual coverage, signed, or null
   * where the engine reported none clear of the two scans' own margin of
   * error.
   *
   * Worked out here rather than on the card, and by the same arithmetic
   * as the change rows below it — rounded away from zero and floored at
   * one, so one measurement never reads as two different figures in two
   * places on one screen.
   */
  changePoints: number | null;
  crop: ReportCrop | null;
  observation: string;
  tab: ReportTab;
};

/** One row of a comparison: the engine's verdict, and what that verdict says in words. */
export type ChangeRow = {
  region: ScanRegion;
  label: string;
  verdict: ChangeVerdict;
  detail: string;
};

/** One place the next scan is worth aiming at, and the figure that put it on the list. */
export type WatchItem = { region: ScanRegion; label: string; reason: string };

export type AssessmentBlock = {
  heading: string;
  subheading: string;
  /** The name of the figure, everywhere it is shown: "Visual Coverage". */
  scoreLabel: string;
  scoreScale: string;
  /** The unit on a difference between two of those figures: "points". */
  pointsLabel: string;
  scoreNote: string;
  confidenceLabel: string;
  /** The whole scan in one figure, or null when nothing was read. */
  overall: Grade | null;
  /** "High confidence · 72%", or null with no overall figure to qualify. */
  overallConfidence: string | null;
  /** One line under the figure, or null when there is no figure. */
  summary: string | null;
  mapHeading: string;
  mapSubheading: string;
  /** Every region the scan looks for, front to back; the unread ones carry no score. */
  regions: CoverageMapRegion[];
  /** The word beside a region with no score. */
  unreadLabel: string;
  /** One line about the regions that carry no score, or null when they all do. */
  unreadNote: string | null;
  /** Set only when `availability` is `unavailable`: the whole analysis half, replaced by an honest absence. */
  unavailable: { title: string; body: string; cta: string } | null;
  locked: boolean;
};

export type CardsBlock = {
  heading: string;
  subheading: string;
  coverageLabel: string;
  scalpLabel: string;
  differenceLabel: string;
  changeLabel: string;
  cards: RegionCard[];
  locked: boolean;
};

export type ScalpVisibilityBlock = {
  heading: string;
  subheading: string;
  label: string;
  rows: { region: ScanRegion; label: string; visibleScalp: number; confidence: number }[];
  body: string;
  note: string;
  locked: boolean;
} | null;

export type SymmetryBlock = {
  heading: string;
  subheading: string;
  label: string;
  left: Grade;
  right: Grade;
  leftLabel: string;
  rightLabel: string;
  /** Points of visual coverage between the two sides, sign dropped. */
  differencePoints: number;
  balanced: boolean;
  body: string;
  note: string;
  locked: boolean;
} | null;

export type ChangedBlock = {
  heading: string;
  subheading: string;
  baselineHeading: string;
  /** What the rows are set against, in words. Empty when there is nothing to set them against. */
  span: string;
  baselineSpan: string;
  /** Only verdicts that cleared the two scans' own margin of error. */
  sinceLast: ChangeRow[];
  sinceBaseline: ChangeRow[];
  /** What to say when the since-last comparison has no row of its own. */
  body: string;
  /** What to say when the baseline comparison has no row of its own. */
  baselineBody: string;
  locked: boolean;
};

export type WatchBlock = {
  heading: string;
  subheading: string;
  items: WatchItem[];
  /** Said in place of the list when nothing stood out. */
  body: string | null;
  locked: boolean;
};

export type QualityBlock = {
  heading: string;
  subheading: string;
  summary: string;
  rows: AnalysisRow[];
  /** The two words a row is marked with, by `AnalysisRow.measured`. */
  marks: { measured: string; kept: string };
};

export type AnalysisRow = {
  id: string;
  /** The place the crop shows; the light row crops the hero's hairline band. */
  region: ReportRegion;
  regionLabel: string;
  /** `light` is the light-and-framing row, which is about every frame and no one place. */
  icon: 'hairline' | 'temple' | 'crown' | 'light';
  headline: string;
  body: string;
  crop: ReportCrop | null;
  /**
   * A second picture for a row that is about two places rather than one.
   * Only the temples row sets it, and only when the scan actually took
   * both: the scan asks for both temples, so a report that shows one of
   * them is showing half of what was photographed.
   */
  crop2?: ReportCrop | null;
  /**
   * True only when the on-device segmenter's hair-area reading is behind
   * a figure on this row. Light and focus words alone do not earn it, and
   * the light row never carries it: the "Measured" mark means the mask
   * counted this, nothing weaker.
   */
  measured: boolean;
  locked: boolean;
  tab: ReportTab;
};

export type StrengthCard = {
  id: string;
  icon: 'light' | 'framing' | 'coverage' | 'routine' | 'streak' | 'record';
  title: string;
  body: string;
};

export type ProfileTile = {
  id: string;
  /** An `IconName` from components/ui/icon, as a string so this file stays free of the UI. */
  icon: string;
  /** The label of the choice, verbatim from the `*_LABELS` maps: a quotation, not a finding. */
  value: string;
  label: string;
};

export type FocusStatus = 'captured' | 'partly' | 'missed' | 'notVisible';

export type FocusBlock = {
  heading: string;
  goalLabel: string;
  regions: ReportRegion[];
  regionsLabel: string;
  crops: ReportCrop[];
  framesCaptured: number;
  /** 0–1: the share of the focus regions the turn kept a frame for. */
  coverage: number;
  /**
   * Which of the four status lines `statusLabel` is, so the screen can
   * draw the pill and the bar to match: only `captured` earns the
   * affirmative pill, and `notVisible` has no coverage bar at all.
   */
  status: FocusStatus;
  statusLabel: string;
  body: string;
  /**
   * The measured region the goal points at, when the scan read one.
   *
   * The block used to say only whether the turn REACHED the region
   * somebody said they watch. Now that the engine measures that region,
   * the block carries the reading as well — the same figure the card and
   * the map carry, lifted from the same measurement rather than worked
   * out a second time.
   */
  lead: { region: ScanRegion; label: string; grade: Grade | null; visibleScalp: number | null } | null;
  readingHeading: string;
  /** One line about what the scan read at the lead region, or null when there is no lead. */
  reading: string | null;
  locked: boolean;
} | null;

export type RoutineBlock = {
  heading: string;
  /** One line under the heading: the shelf is empty, or how many products are on it. */
  body: string;
  products: { id: string; imageUri: string | null; name: string }[];
  moreCount: number;
  cta: string;
  locked: boolean;
};

export type SaysBlock = { heading: string; speaker: 'Tress'; body: string };

/** A tile is a drawing and a name; the cut's note is on /hairstyles, not here. */
export type HairstyleTile = {
  id: string;
  name: string;
  /** A bundled catalogue illustration (`require()`), never a frame from the scan. */
  image: number;
};

/**
 * "Hairstyles for your hair": the first three of the catalogue's picks
 * for the hair type on the record, and the way to the rest. The tiles
 * are the catalogue's own drawings — nothing from the scan is in them.
 * The hair type is read back as the label of the choice, a quotation
 * like the profile tiles'. The block carries only what the section
 * draws: the catalogue's count and the cuts' notes belong to /hairstyles.
 */
export type HairstylesBlock = {
  heading: string;
  subheading: string;
  /** The label of the hair type they chose, or null when the funnel has no answer. */
  hairTypeLabel: string | null;
  tiles: HairstyleTile[];
  cta: string;
  locked: boolean;
};

/**
 * Everything the report screen draws, in the order it draws it.
 *
 * The analysis half — `assessment` through `watch` — exists only where
 * `availability` is `measured`. Where it is `unavailable` those blocks
 * are empty and `assessment.unavailable` carries the words and the
 * rescan action instead: no zeroes, no prose written as though a reading
 * had been taken.
 */
export type HairScanReportModel = {
  hero: { uri: string; width: number; height: number; dateLabel: string; contours?: unknown };
  tabs: { id: ReportTab; label: string }[];

  /** Whether the measurement engine read this scan at all. */
  availability: Availability;
  /** The overall figure and the coverage map. */
  assessment: AssessmentBlock;
  /** One card per region the scan could read, the person's own lead regions first. */
  cards: CardsBlock;
  scalpVisibility: ScalpVisibilityBlock;
  symmetry: SymmetryBlock;
  changed: ChangedBlock;
  watch: WatchBlock;
  /** The goal block, rebuilt around the region the person's goal points at. */
  goal: FocusBlock;
  /** How the frames themselves came out. Moved below the findings, where it belongs. */
  quality: QualityBlock;

  says: SaysBlock;
  /**
   * The care notes, and — where one of the person's own answers picked
   * them — the sentence that names that answer.
   *
   * `shapedBy` sits here rather than in the coach's paragraph because it
   * is not a measurement: the paragraph reads what the scan found, and
   * an answer somebody typed into the funnel is not a finding. It is a
   * quotation of their own words, and the sweep checks it as one.
   *
   * It is also on the END of `subheading`, which is the string the
   * section actually draws. Both, deliberately: the field is the shape a
   * screen can lay out on its own, the subheading is the one that
   * reaches a person today, and the field alone reached nobody.
   */
  tips: {
    heading: string;
    /** The notes that decide what the next report can say, and the heading over them. */
    trackingHeading: string;
    trackingSubheading: string;
    tracking: Tip[];
    subheading: string;
    shapedBy: string | null;
    items: Tip[];
    locked: boolean;
  };
  routine: RoutineBlock;
  hairstyles: HairstylesBlock;

  /**
   * The scan-quality block under its former name, and the goal block
   * under its former one.
   *
   * The report screen is moving onto `quality` and `goal`; until it has,
   * both names point at the same object, so neither lane has to land its
   * half of the change in the same commit as the other. Deleting these
   * two is the last step of that move, not a change of behaviour.
   *
   * @deprecated Read `quality` and `goal`.
   */
  analysis: QualityBlock;
  /** @deprecated Read `goal`. */
  focus: FocusBlock;

  strengths: { heading: string; cards: StrengthCard[] };
  profile: { heading: string; tiles: ProfileTile[] };
  /** In scroll order, for the Next pill. */
  sections: { id: string; label: string }[];
};

/* ------------------------------- constants ------------------------------- */

/**
 * Which of the record's regions each goal points at; null is a goal no
 * photograph can count. The crown is listed where the goal names it, and
 * is reached by the top frame: a scan that faces the camera never sees
 * the back of the head, so the frame taken with the chin down is the one
 * that shows the crown, and the block says so (see `frameForRegion`).
 */
export const FOCUS_REGIONS: Readonly<Record<HairGoal, readonly ReportRegion[] | null>> = Object.freeze({
  hairline: ['hairline'],
  crown: ['crown', 'top'],
  fullness: ['hairline', 'leftTemple', 'rightTemple', 'crown', 'top'],
  overall: ['hairline', 'leftTemple', 'rightTemple', 'crown', 'top'],
  unsure: ['hairline', 'leftTemple', 'rightTemple', 'crown', 'top'],
  narrowerPart: ['top', 'crown'],
  fullerPonytail: ['top', 'crown'],
  shedding: null,
  lessBreakage: null,
  routineWorking: null,
});

/** The photograph each region is cropped from. */
const REGION_ANGLE: Record<ReportRegion, Angle> = {
  hairline: 'front',
  leftTemple: 'leftTemple',
  rightTemple: 'rightTemple',
  crown: 'crown',
  top: 'top',
};

/** Coverage at or above this reads as a full turn on a strength card. */
export const FULL_TURN_AT = 0.8;
/** A streak this long is worth a card. */
export const STREAK_CARD_AT = 3;
/** A routine ticked this share of days is worth a card. */
export const ROUTINE_CARD_AT = 60;
/** Left/right shares further than this from even are named as such, in points. */
export const BALANCE_NOTE_POINTS = 5;
/** The most strength cards the report shows, and the fewest. */
export const STRENGTHS_MAX = 4;
export const STRENGTHS_MIN = 2;
/** Products drawn on the routine block before the "+N" tile. */
export const ROUTINE_TILES = 3;
/** Catalogue drawings on the hairstyles block; the rest are on /hairstyles. */
export const HAIRSTYLE_TILES = 3;

/* ----------------------- the measured half's dials ----------------------- */

/**
 * The detailed analysis, in the order the report reads down the head:
 * the frontal hairline, the two temples beside it, then the crown, the
 * mid-scalp and the part line on top. The coverage map uses the
 * engine's own `SCAN_REGIONS` order instead — a map is a diagram and
 * must not be reordered by whose goal is whose.
 */
export const CARD_ORDER: readonly ScanRegion[] = [
  'hairline',
  'leftTemple',
  'rightTemple',
  'crown',
  'midScalp',
  'partLine',
];

/** Which tab a region's card sits under. */
const TAB_OF_REGION: Readonly<Record<ScanRegion, ReportTab>> = Object.freeze({
  hairline: 'hairline',
  leftTemple: 'temples',
  rightTemple: 'temples',
  midScalp: 'midScalp',
  crown: 'crown',
  partLine: 'partLine',
});

/**
 * Which photograph a region's crop is cut from.
 *
 * The engine reads six places; the scan photographs four. The mid-scalp
 * and the part line are both read off the frame taken with the chin
 * down, which the journal files as `top`, so that is the picture their
 * cards show. A crop is a place, never a finding: showing the top frame
 * beside a part-line figure says "this is where we looked".
 */
const CROP_REGION_OF: Readonly<Record<ScanRegion, ReportRegion>> = Object.freeze({
  hairline: 'hairline',
  leftTemple: 'leftTemple',
  rightTemple: 'rightTemple',
  midScalp: 'top',
  crown: 'crown',
  partLine: 'top',
});

/**
 * Which measured regions a stated goal points at. Empty is a goal that
 * points at the whole head, or at something no photograph can count —
 * either way, nothing leads and the cards stay in their own order.
 *
 * One report for everybody. There is no male list and no female list
 * here, and there must never be one: a middle part puts the part line
 * first whoever is wearing it, and a temple concern puts the temples
 * first whoever raised it.
 */
export const GOAL_SCAN_REGIONS: Readonly<Record<HairGoal, readonly ScanRegion[]>> = Object.freeze({
  hairline: ['hairline', 'leftTemple', 'rightTemple'],
  crown: ['crown', 'midScalp'],
  fullness: ['midScalp', 'crown', 'partLine'],
  overall: [],
  unsure: [],
  narrowerPart: ['partLine', 'midScalp'],
  fullerPonytail: ['partLine', 'crown'],
  shedding: [],
  lessBreakage: [],
  routineWorking: [],
});

/** The same, for the part of the head they said they watch. */
export const TRACKING_SCAN_REGIONS: Readonly<Record<TrackingArea, readonly ScanRegion[]>> =
  Object.freeze({
    hairline: ['hairline'],
    crown: ['crown'],
    overallThinning: [],
    diffuseThinning: ['midScalp', 'crown'],
    shedding: [],
    density: ['midScalp', 'crown'],
    transplantRecovery: ['hairline'],
    generalChanges: [],
    widerPart: ['partLine'],
    ponytail: ['partLine', 'crown'],
    edges: ['leftTemple', 'rightTemple', 'hairline'],
    breakage: [],
  });

/** And for how they said they wear it, which decides what is on show. */
export const WEARING_SCAN_REGIONS: Readonly<Record<HairWearing, readonly ScanRegion[]>> =
  Object.freeze({
    middlePart: ['partLine', 'crown'],
    sidePart: ['partLine'],
    noDefinedPart: ['midScalp', 'crown'],
    pulledBack: ['hairline', 'leftTemple', 'rightTemple'],
    shortAllOver: ['crown', 'midScalp'],
    other: [],
  });

/**
 * The fewest points of visual coverage between two regions of the SAME
 * scan that the report will name in a sentence.
 *
 * This is a display threshold and nothing more. It is not a change
 * verdict — `compareScans` owns those, and only it may say a difference
 * between two SCANS is real. What it guards against is prose: a report
 * that says the crown "reads below the hairline" on a two-point gap is
 * describing rounding, and would say something different next month for
 * no reason anybody could see. Eight points is of the same order as the
 * frame-to-frame spread of a decent scan.
 *
 * It is on this build's deviceOnly list: nobody has yet held a phone up
 * and checked what the gap between two regions of one head actually
 * varies by.
 */
export const CONTRAST_POINTS = 8;

/**
 * The fewest points of visual coverage between the two temples before
 * the symmetry block calls them uneven rather than even.
 *
 * Smaller than `CONTRAST_POINTS` on purpose: the two temples are the one
 * pair in the scan that is measured the same way, at the same moment, on
 * the same head, so the gap between them carries less of the error that
 * separates a hairline reading from a crown one. Also deviceOnly.
 */
export const SYMMETRY_POINTS = 5;

/** The most places the report will name as worth a second look. */
export const WATCH_MAX = 3;

/* -------------------------------- helpers -------------------------------- */

function byAngle(session: Pick<PhotoSession, 'photos'>, angle: Angle): Photo | undefined {
  return session.photos.find((p) => p.angle === angle);
}

/** "5 May at 2:59 PM", in the device's own locale. */
export function heroDateLabel(iso: string): string {
  const time = new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return COPY.hero.dateChip(formatDateShort(iso), time);
}

function readingWords(q: Photo['quality']): string | null {
  return q ? `${lightWord(q)}, ${focusWord(q)}` : null;
}

/**
 * The photograph that reaches a region: its own angle, or the top frame
 * for the crown, which a face-on scan only ever sees from above. This is
 * what "reached" means in the focus block.
 */
function frameForRegion(session: PhotoSession, region: ReportRegion): Photo | undefined {
  const own = byAngle(session, REGION_ANGLE[region]);
  if (own) return own;
  if (region === 'crown') return byAngle(session, 'top');
  return undefined;
}

/** The photograph a region is cropped from: the frame that reached it, or the front for a temple the turn did not keep. */
function photoForRegion(session: PhotoSession, region: ReportRegion): Photo | undefined {
  const reached = frameForRegion(session, region);
  if (reached) return reached;
  if (region === 'leftTemple' || region === 'rightTemple') return byAngle(session, 'front');
  return undefined;
}

/** Whether the segmenter answered on a photograph at all — an empty mask is an answer, an absent block is not. */
function segmenterRan(photo: Pick<Photo, 'coverage'> | undefined): boolean {
  return photo?.coverage !== undefined;
}

/* ------------------------------- the rows -------------------------------- */

function hairlineRow(session: PhotoSession): Omit<AnalysisRow, 'locked'> {
  const front = byAngle(session, 'front');
  const base = { id: 'hairline', region: 'hairline' as const, regionLabel: COPY.regions.hairline, icon: 'hairline' as const, tab: 'hairline' as const };

  if (!front) return { ...base, headline: COPY.hairline.none, body: COPY.hairline.noneBody, crop: null, measured: false };

  const crop = cropFor(front, 'hairline');
  const area = areaReading(front);
  if (area) {
    const upper = pct(area.upperFraction);
    let balance = COPY.hairline.balanceEven;
    if (typeof area.horizontalBalance === 'number' && Number.isFinite(area.horizontalBalance)) {
      const left = pct(area.horizontalBalance);
      const off = Math.abs(left - 50);
      if (off > BALANCE_NOTE_POINTS) balance = COPY.hairline.balanceSide(left > 50 ? 'left' : 'right', off * 2);
    }
    return {
      ...base,
      headline: COPY.hairline.measured(upper),
      body: `${COPY.hairline.measuredBody(upper)} ${balance}`,
      crop,
      measured: true,
    };
  }

  if (front.quality) {
    return {
      ...base,
      headline: COPY.hairline.kept(lightWord(front.quality), focusWord(front.quality)),
      body: segmenterRan(front) ? COPY.hairline.keptEmptyBody : COPY.hairline.keptBody,
      crop,
      measured: false,
    };
  }

  return { ...base, headline: COPY.hairline.bare, body: COPY.hairline.bareBody, crop, measured: false };
}

function templesRow(session: PhotoSession): Omit<AnalysisRow, 'locked'> {
  const left = byAngle(session, 'leftTemple');
  const right = byAngle(session, 'rightTemple');
  const base = {
    id: 'temples',
    region: (left ? 'leftTemple' : 'rightTemple') as ReportRegion,
    regionLabel: left && right ? COPY.regions.temples : left ? COPY.regions.leftTemple : COPY.regions.rightTemple,
    icon: 'temple' as const,
    tab: 'temples' as const,
  };

  if (!left && !right) {
    return { ...base, regionLabel: COPY.regions.temples, headline: COPY.temples.none, body: COPY.temples.noneBody, crop: null, measured: false };
  }

  const lead = left ?? (right as Photo);
  const crop = cropFor(lead, left ? 'leftTemple' : 'rightTemple');
  // When both were taken, both are shown. `crop` is the left one and
  // `crop2` the right, in that order, so the pair reads the way the row
  // is captioned.
  const crop2 = left && right ? cropFor(right, 'rightTemple') : null;

  const turnL = left?.pose && Number.isFinite(left.pose.yaw) ? deg(left.pose.yaw) : null;
  const turnR = right?.pose && Number.isFinite(right.pose.yaw) ? deg(right.pose.yaw) : null;
  const turns = turnL !== null && turnR !== null ? COPY.temples.turns(turnL, turnR) : null;

  if (!left || !right) {
    const only = lead;
    const side = only.angle === 'leftTemple' ? 'left' : 'right';
    const area = areaReading(only);
    return {
      ...base,
      headline: area ? COPY.temples.one(side, pct(area.fraction)) : COPY.temples.oneUnmeasured(side),
      body: COPY.temples.oneBody,
      crop,
      measured: area !== null,
    };
  }

  const areaL = areaReading(left);
  const areaR = areaReading(right);
  if (areaL && areaR) {
    const l = pct(areaL.fraction);
    const r = pct(areaR.fraction);
    const diffPoints = Math.abs(areaL.fraction - areaR.fraction) * 100;
    const balance =
      diffPoints < SCAN_THRESHOLDS.NOISE_POINTS
        ? COPY.temples.close(Math.max(1, Math.ceil(Math.round(diffPoints * 1e6) / 1e6)))
        : COPY.temples.apart(areaL.fraction > areaR.fraction ? 'left' : 'right', Math.round(diffPoints));
    return {
      ...base,
      headline: COPY.temples.both(l, r),
      body: [balance, turns].filter((s): s is string => s !== null).join(' '),
      crop,
      crop2,
      measured: true,
    };
  }

  const wordsL = readingWords(left.quality);
  const wordsR = readingWords(right.quality);
  const rest = segmenterRan(left) || segmenterRan(right) ? COPY.temples.keptRestEmpty : COPY.temples.keptRest;
  const body = wordsL && wordsR ? [COPY.temples.keptBody(wordsL, wordsR), turns, rest] : [COPY.temples.bareBody, turns];
  return {
    ...base,
    headline: COPY.temples.kept,
    body: body.filter((s): s is string => s !== null).join(' '),
    crop,
    crop2,
    measured: false,
  };
}

function crownRow(session: PhotoSession): Omit<AnalysisRow, 'locked'> {
  const top = byAngle(session, 'top');
  const crown = byAngle(session, 'crown');
  const lead = top ?? crown;
  const region: ReportRegion = lead?.angle === 'crown' ? 'crown' : 'top';
  const base = { id: 'crown', region, regionLabel: COPY.regions.crown, icon: 'crown' as const, tab: 'crown' as const };

  if (!lead) return { ...base, headline: COPY.crown.none, body: COPY.crown.noneBody, crop: null, measured: false };

  const word = lead.angle === 'crown' ? 'back' : 'top';
  const crop = cropFor(lead, region);
  const area = areaReading(lead);
  if (area) {
    return {
      ...base,
      headline: COPY.crown.measured(word, 100 - pct(area.fraction)),
      body: COPY.crown.measuredBody,
      crop,
      measured: true,
    };
  }
  if (lead.quality) {
    return {
      ...base,
      headline: COPY.crown.kept(word, lightWord(lead.quality), focusWord(lead.quality)),
      body: segmenterRan(lead) ? COPY.crown.keptEmptyBody : COPY.crown.keptBody,
      crop,
      measured: false,
    };
  }
  return { ...base, headline: COPY.crown.bare(word), body: COPY.crown.bareBody, crop, measured: false };
}

/**
 * The light-and-framing row, or null when no frame carries a reading: a
 * tab with nothing to say is not shown. Its figures are brightness
 * readings, not the mask's, so it is never `measured`; its crop is the
 * hero's hairline band, which is the place its `region` names.
 */
function lightRow(session: PhotoSession): Omit<AnalysisRow, 'locked'> | null {
  const read = session.photos.filter((p): p is Photo & { quality: NonNullable<Photo['quality']> } => p.quality !== undefined);
  if (read.length === 0) return null;
  const hero = byAngle(session, 'front') ?? session.photos[0];
  const base = { id: 'light', region: 'hairline' as const, regionLabel: COPY.regions.light, icon: 'light' as const, tab: 'light' as const, measured: false };
  const crop = hero ? cropFor(hero, 'hairline') : null;
  /*
    Only when the scan actually held more than one region: a one-region
    scan has nothing to say about a turn, and saying it anyway would be
    flattery dressed as a reading.
  */
  const heldRegions = new Set(session.photos.map((p) => p.angle)).size;
  const turn = session.scan && heldRegions > 1 ? COPY.light.turn(heldRegions) : null;

  if (read.length === 1) {
    const q = read[0].quality;
    return {
      ...base,
      headline: COPY.light.one(lightWord(q), focusWord(q)),
      body: [COPY.light.oneBody, turn].filter((s): s is string => s !== null).join(' '),
      crop,
    };
  }

  const readings = read.map((p) => p.quality.brightness);
  const spread = Math.round(Math.max(...readings) - Math.min(...readings));
  const mixed = spread > SCAN_THRESHOLDS.EXPOSURE_SHIFT;
  return {
    ...base,
    headline: mixed ? COPY.light.mixed(spread) : COPY.light.even(spread),
    body: [mixed ? COPY.light.mixedBody(read.length) : COPY.light.evenBody(read.length), turn]
      .filter((s): s is string => s !== null)
      .join(' '),
    crop,
  };
}

function analysisRows(session: PhotoSession, premium: boolean): AnalysisRow[] {
  const rows = [hairlineRow(session), templesRow(session), crownRow(session), lightRow(session)];
  return rows
    .filter((r): r is Omit<AnalysisRow, 'locked'> => r !== null)
    .map((r) => ({ ...r, locked: !premium }));
}

/* ----------------------------- the strengths ----------------------------- */

/**
 * In the order they are worth reading: how the frames were lit and
 * framed, then what the record shows — a routine kept, a run of days,
 * scans on file — and then the turn itself. The cap falls on the turn
 * first, because a mature record has more to say than "the ring closed".
 */
function strengthCards(data: AppData, session: PhotoSession): StrengthCard[] {
  const cards: StrengthCard[] = [];
  const photos = session.photos;

  const readings = photos.map((p) => p.quality?.brightness).filter((b): b is number => typeof b === 'number');
  if (readings.length > 0 && lightingBand(photos) === 'even') {
    const spread = Math.round(Math.max(...readings) - Math.min(...readings));
    cards.push({
      id: 'light',
      icon: 'light',
      title: COPY.strengths.light.title,
      body: readings.length > 1 ? COPY.strengths.light.body(spread) : COPY.strengths.light.bodyOne,
    });
  }

  const front = byAngle(session, 'front');
  const pose = front?.pose;
  if (pose && Number.isFinite(pose.yaw) && Number.isFinite(pose.pitch) && Math.abs(pose.yaw) <= FRONT_LOCK_DEG && Math.abs(pose.pitch) <= FRONT_LOCK_DEG) {
    cards.push({
      id: 'framing',
      icon: 'framing',
      title: COPY.strengths.framing.title,
      body: COPY.strengths.framing.body(deg(pose.yaw), deg(pose.pitch)),
    });
  }

  const adherence = adherencePercent(data, 30);
  if (adherence !== null && adherence >= ROUTINE_CARD_AT) {
    cards.push({ id: 'routine', icon: 'routine', title: COPY.strengths.routine.title(adherence), body: COPY.strengths.routine.body });
  }

  const streak = currentStreak(data);
  if (streak >= STREAK_CARD_AT) {
    cards.push({ id: 'streak', icon: 'streak', title: COPY.strengths.streak.title(streak), body: COPY.strengths.streak.body });
  }

  // Only sessions the scanner saved: the card's body says they were
  // taken by the same scanner, and on an upgraded install the record
  // can still hold sets from the retired one-angle-at-a-time flow.
  const scans = data.sessions.filter(isScanSession).length;
  if (scans >= 2) {
    cards.push({ id: 'record', icon: 'record', title: COPY.strengths.record.title(scans), body: COPY.strengths.record.body });
  }

  const completion = session.scan?.completion;
  /*
    The figure alone is not enough to say the turn reached everything.
    Three of the four regions are worth 0.75 on their own and the
    approach to the fourth is worth up to another 0.1875, so a scan that
    never photographed the crown can read 0.8 — and this card would then
    say the turn "reached the parts of the head the scan asks for" about
    a part it never saw. So the pictures have to be there as well as the
    number.
  */
  const everyRegion =
    front !== undefined &&
    byAngle(session, 'leftTemple') !== undefined &&
    byAngle(session, 'rightTemple') !== undefined &&
    (byAngle(session, 'top') ?? byAngle(session, 'crown')) !== undefined;
  if (typeof completion === 'number' && completion >= FULL_TURN_AT && everyRegion) {
    // Four regions is what `everyRegion` just proved; the card names what
    // the scan held rather than how far a ring that no longer exists went.
    cards.push({ id: 'coverage', icon: 'coverage', title: COPY.strengths.coverage.title, body: COPY.strengths.coverage.body(4) });
  } else if (front && byAngle(session, 'leftTemple') && byAngle(session, 'rightTemple')) {
    cards.push({ id: 'coverage', icon: 'coverage', title: COPY.strengths.coverage.sidesTitle, body: COPY.strengths.coverage.sidesBody });
  }

  // A first scan with nothing else true about it is still a first scan,
  // read on this device: both are facts, and two cards is the floor.
  if (cards.length < STRENGTHS_MIN && scans < 2) {
    cards.push({ id: 'first', icon: 'record', title: COPY.strengths.record.firstTitle, body: COPY.strengths.record.firstBody });
  }
  if (cards.length < STRENGTHS_MIN) {
    cards.push({ id: 'device', icon: 'record', title: COPY.strengths.record.deviceTitle, body: COPY.strengths.record.deviceBody });
  }

  return cards.slice(0, STRENGTHS_MAX);
}

/* ------------------------------ the profile ------------------------------ */

/**
 * Four tiles: the goal, then how they described their hair, their scalp
 * and its sensitivity — the answers the care notes lean on. A journey
 * from before those questions existed has none of the three, and shows
 * the older answers in their place — when they noticed, what they
 * watch (or why it matters), what they were doing — rather than three
 * tiles reading "Not answered" about questions it was never asked.
 */
function profileTiles(journey: Journey | null): ProfileTile[] {
  const goal = journey ? journeyGoals(journey)[0] : undefined;
  const hairType = journey ? journeyHairType(journey) : undefined;
  const scalpType = journey ? journeyScalpType(journey) : undefined;
  const sensitivity = journey ? journeyScalpSensitivity(journey) : undefined;
  const watching = journey?.trackingAreas.find((a) => a in TRACKING_AREA_LABELS);
  const motivation = journey?.motivations.find((m) => m in MOTIVATION_LABELS);
  const approach = journey?.approaches.find((a) => a in APPROACH_LABELS);
  const noticed = journey?.noticed && journey.noticed in ONSET_LABELS ? journey.noticed : undefined;
  const none = COPY.profile.unanswered;

  const second: ProfileTile = hairType
    ? { id: 'hairType', icon: 'follicle', value: HAIR_TYPE_LABELS[hairType], label: COPY.profile.hairType }
    : noticed
      ? { id: 'noticed', icon: 'calendar', value: ONSET_LABELS[noticed], label: COPY.profile.noticed }
      : { id: 'hairType', icon: 'follicle', value: none, label: COPY.profile.hairType };

  const third: ProfileTile = scalpType
    ? { id: 'scalpType', icon: 'drop', value: SCALP_TYPE_LABELS[scalpType], label: COPY.profile.scalpType }
    : watching
      ? { id: 'watching', icon: 'search', value: TRACKING_AREA_LABELS[watching], label: COPY.profile.watching }
      : motivation
        ? { id: 'motivation', icon: 'heart', value: MOTIVATION_LABELS[motivation], label: COPY.profile.motivation }
        : { id: 'scalpType', icon: 'drop', value: none, label: COPY.profile.scalpType };

  const fourth: ProfileTile = sensitivity
    ? { id: 'sensitivity', icon: 'shield', value: SCALP_SENSITIVITY_LABELS[sensitivity], label: COPY.profile.sensitivity }
    : approach
      ? { id: 'approach', icon: 'leaf', value: APPROACH_LABELS[approach], label: COPY.profile.approach }
      : { id: 'sensitivity', icon: 'shield', value: none, label: COPY.profile.sensitivity };

  return [
    { id: 'goal', icon: 'target', value: goal ? HAIR_GOAL_LABELS[goal] : none, label: COPY.profile.goal },
    second,
    third,
    fourth,
  ];
}

/* ------------------------------- the focus ------------------------------- */

function regionWord(region: ReportRegion): string {
  return COPY.regions[region].toLowerCase();
}

/**
 * The region the goal block is built around: the first measured region
 * the person's own answers point at.
 *
 * Null for a goal no photograph can count — shedding, breakage, whether
 * a routine is working. Those blocks say what they have always said, and
 * hanging a coverage figure off one of them would be answering a
 * question nobody asked with a number about somewhere else.
 */
function goalLead(goal: HairGoal, read: readonly ReadRegion[]): ReadRegion | null {
  if (FOCUS_REGIONS[goal] === null) return null;
  const byRegion = new Map(read.map((r) => [r.region, r]));
  for (const region of GOAL_SCAN_REGIONS[goal]) {
    const entry = byRegion.get(region);
    if (entry) return entry;
  }
  /*
    No fallback. A section headed "Your goal" that opened with a figure
    from somewhere else — the temple a tracking answer points at, say,
    when the goal is the crown — would be answering a question nobody
    asked, and would silence the one sentence written for this case:
    that the scan could not read the place they said they are watching.
  */
  return null;
}

function focusBlock(
  journey: Journey | null,
  session: PhotoSession,
  read: readonly ReadRegion[],
  availability: Availability,
  premium: boolean,
): FocusBlock {
  const goal = journey ? journeyGoals(journey)[0] : undefined;
  if (goal === undefined) return null;
  const goalLabel = HAIR_GOAL_LABELS[goal];
  const regions = FOCUS_REGIONS[goal];
  const locked = !premium;

  const leadEntry = goalLead(goal, read);
  const lead = leadEntry
    ? {
        region: leadEntry.region,
        label: regionLabel(leadEntry.region),
        grade: leadEntry.grade,
        visibleScalp: leadEntry.visibleScalp,
      }
    : null;
  /*
    The reading at the goal's own region, in words.

    Where the scan read the region, both figures it holds; where the scan
    read SOMETHING but not this place, the absence, named — a person
    watching their crown is owed "this scan could not read it" rather
    than silence. Where the scan read nothing at all the assessment
    already says so once, and saying it again here would be the report
    apologising twice for the same thing.
  */
  const goalRegion = regions === null ? undefined : GOAL_SCAN_REGIONS[goal][0];
  const reading = leadEntry
    ? [
        COPY.focus.reading(scanRegionWord(leadEntry.region), leadEntry.grade.score),
        ...(leadEntry.visibleScalp !== null
          ? [COPY.focus.readingScalp(scanRegionWord(leadEntry.region), leadEntry.visibleScalp)]
          : []),
      ].join(' ')
    : availability === 'measured' && goalRegion !== undefined
      ? COPY.focus.readingUnread(scanRegionWord(goalRegion))
      : null;

  if (regions === null) {
    const body = goal === 'shedding' ? COPY.focus.shedding : goal === 'lessBreakage' ? COPY.focus.breakage : COPY.focus.routine;
    return {
      heading: COPY.focus.heading,
      goalLabel,
      regions: [],
      regionsLabel: COPY.focus.recordLabel,
      crops: [],
      framesCaptured: 0,
      coverage: 0,
      status: 'notVisible',
      statusLabel: COPY.focus.notVisible,
      body,
      lead: null,
      readingHeading: COPY.focus.readingHeading,
      reading: null,
      locked,
    };
  }

  // A region is reached by the frame that shows it: the crown by the top
  // frame, since the scan faces the camera. One frame can reach two
  // regions, so the frames are counted apart from the regions.
  const reachedBy = regions.map((r) => ({ region: r, photo: frameForRegion(session, r) }));
  const reached = reachedBy.filter((x): x is { region: ReportRegion; photo: Photo } => x.photo !== undefined).map((x) => x.region);
  const missing = regions.filter((r) => !reached.includes(r));
  const coverage = regions.length === 0 ? 0 : reached.length / regions.length;
  const framesCaptured = new Set(reachedBy.map((x) => x.photo?.uri).filter((u): u is string => u !== undefined)).size;

  // One crop per picture-and-rectangle: the crown and the top share a
  // band on the same frame, and showing it twice would look like two.
  const crops: ReportCrop[] = [];
  const seen = new Set<string>();
  for (const r of reached) {
    const photo = photoForRegion(session, r);
    if (!photo) continue;
    const crop = cropFor(photo, r);
    const key = `${crop.uri}:${crop.rect.x}:${crop.rect.y}:${crop.rect.w}:${crop.rect.h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    crops.push(crop);
    if (crops.length === 3) break;
  }

  const regionsLabel = joinPhrases(regions.map((r) => COPY.regions[r]));
  // The crown is named where the goal names it, and counted from the top
  // frame; whichever way that went, the block says how the crown was read.
  const crownNote = !regions.includes('crown')
    ? ''
    : reached.includes('crown')
      ? ` ${COPY.focus.crownNote}`
      : ` ${COPY.focus.crownMissingNote}`;

  let status: Exclude<FocusStatus, 'notVisible'>;
  let statusLabel: string;
  let body: string;
  if (reached.length === regions.length) {
    status = 'captured';
    statusLabel = COPY.focus.captured;
    body = COPY.focus.capturedBody(joinPhrases(regions.map(regionWord)), framesCaptured) + crownNote;
  } else if (reached.length > 0) {
    status = 'partly';
    statusLabel = COPY.focus.partly;
    body = COPY.focus.partlyBody(joinPhrases(reached.map(regionWord)), joinPhrases(missing.map(regionWord)), missing.length) + crownNote;
  } else {
    status = 'missed';
    statusLabel = COPY.focus.missed;
    body = COPY.focus.missedBody + crownNote;
  }

  return {
    heading: COPY.focus.heading,
    goalLabel,
    regions: [...regions],
    regionsLabel,
    crops,
    framesCaptured,
    coverage,
    status,
    statusLabel,
    /*
      The finding first, the turn second.

      "Your goal" is a section about the place somebody said they are
      watching, and the sentence that belongs at the top of it is what
      the scan READ there — not whether the turn managed to photograph
      it. The reading is also carried apart, on `lead` and `reading`, for
      a screen that wants to set it out under its own heading; until one
      does, the paragraph is where it reaches a person, and a payload the
      product never shows is a payload that is not delivered.
    */
    body: reading === null ? body : `${reading} ${body}`,
    lead,
    readingHeading: COPY.focus.readingHeading,
    reading,
    locked,
  };
}

/* ------------------------------ the routine ------------------------------ */

function routineBlock(data: AppData, premium: boolean): RoutineBlock {
  const shelf = buildShelf(data);
  const all = shelf.sections.flatMap((s) => s.products);
  const products = all.slice(0, ROUTINE_TILES).map((p) => ({
    id: p.barcode,
    imageUri: p.thumbnailUrl ?? null,
    name: p.name,
  }));
  return {
    heading: COPY.routine.heading,
    body: all.length === 0 ? COPY.routine.empty : COPY.routine.filled(all.length),
    products,
    moreCount: Math.max(0, all.length - products.length),
    cta: COPY.routine.cta,
    locked: !premium,
  };
}

/* ----------------------------- the hairstyles ---------------------------- */

/**
 * The catalogue's first three picks for the record. Without Premium the
 * block is locked: the screen shows the first drawing clear and holds
 * the others, and the one button goes to /hairstyles, which holds the
 * full list behind the entitlement. The picks themselves are the same
 * either way — a free reading is never a different reading.
 */
function hairstylesBlock(data: AppData, premium: boolean): HairstylesBlock {
  const journey = data.journey;
  const hairType = journey ? journeyHairType(journey) : undefined;
  const tiles = hairstylesFor(data)
    .slice(0, HAIRSTYLE_TILES)
    .map((s) => ({ id: s.id, name: s.name, image: s.image }));
  return {
    heading: HAIRSTYLE_COPY.report.heading,
    subheading: HAIRSTYLE_COPY.report.subheading,
    hairTypeLabel: hairType ? HAIR_TYPE_LABELS[hairType] : null,
    tiles,
    cta: HAIRSTYLE_COPY.report.cta,
    locked: !premium,
  };
}

/* ========================= the measured half ============================== */

/**
 * Everything below reads the measurement the scan already took and
 * stored, and computes no finding of its own. The two rules it works
 * under:
 *
 *   • A figure on the screen is a figure the engine produced. Coverage
 *     becomes a score out of a hundred in `grade.ts` and nowhere else;
 *     visible scalp is the engine's own count, not `100 − coverage`; a
 *     change verdict comes from `compareScans` and is never recomputed,
 *     softened or re-ranked here.
 *   • A region the engine refused has no figure. Null, absent, "Not
 *     read" — never zero, and never a sentence written as though a
 *     reading had been taken.
 */

/** The engine's measurement, read back off the record, or null when the scan carries none. */
function measurementOf(session: PhotoSession): ScanMeasurement | null {
  return session.scan?.measurement ?? null;
}

function regionLabel(region: ScanRegion): string {
  return COPY.regions[region];
}

/** The region's name in the possessive, for a sentence that names two of them. */
function scanRegionWord(region: ScanRegion): string {
  return COPY.regionWords[region];
}

/** One region the scan actually read: the measurement, its score, and its scalp figure. */
type ReadRegion = {
  region: ScanRegion;
  measurement: RegionMeasurement;
  grade: Grade;
  visibleScalp: number | null;
};

/**
 * The regions this scan read, in the engine's own order.
 *
 * A region in `measurement.regions` that `gradeOf` refuses — a coverage
 * that is not a finite number — is dropped here rather than carried with
 * a null grade, because everything downstream of this function exists to
 * say something about a figure, and there is no figure.
 */
function readRegions(measurement: ScanMeasurement | null): ReadRegion[] {
  if (!measurement) return [];
  const out: ReadRegion[] = [];
  for (const region of SCAN_REGIONS) {
    const m = measurement.regions[region];
    const grade = gradeOf(m);
    if (!m || !grade) continue;
    out.push({ region, measurement: m, grade, visibleScalp: visibleScalpPointsOf(m) });
  }
  return out;
}

/** The crop that shows where a measured region was read. A place, never a finding. */
function cropForScanRegion(session: PhotoSession, region: ScanRegion): ReportCrop | null {
  const reportRegion = CROP_REGION_OF[region];
  const photo = photoForRegion(session, reportRegion);
  return photo ? cropFor(photo, reportRegion) : null;
}

/**
 * Which regions lead, for this person, on this scan.
 *
 * Three inputs, in order of how directly the person stated them: what
 * they said they want, what they said they watch, and how they said they
 * wear their hair. Filtered by what the scan actually read, because a
 * region nobody could measure cannot lead a report about measurements.
 *
 * There is exactly one report. Nothing here branches on anything but the
 * person's own answers and the scan's own reach.
 */
function leadRegions(journey: Journey | null, read: readonly ReadRegion[]): ScanRegion[] {
  const available = new Set(read.map((r) => r.region));
  const wanted: ScanRegion[] = [];
  const push = (list: readonly ScanRegion[] | undefined): void => {
    for (const region of list ?? []) {
      if (available.has(region) && !wanted.includes(region)) wanted.push(region);
    }
  };
  if (journey) {
    for (const goal of journeyGoals(journey)) push(GOAL_SCAN_REGIONS[goal]);
    for (const area of journey.trackingAreas) push(TRACKING_SCAN_REGIONS[area]);
    const wearing = journeyHairWearing(journey);
    if (wearing) push(WEARING_SCAN_REGIONS[wearing]);
  }
  return wanted;
}

/* ----------------------------- the assessment ---------------------------- */

function confidenceLine(grade: Grade): string {
  return COPY.assessment.confidence(
    COPY.assessment.bands[confidenceBand(grade.confidence)],
    confidencePercent(grade.confidence),
  );
}

/**
 * The coverage map: every region the scan looks for, in the engine's
 * front-to-back order, whether or not this scan reached it. A map with
 * rows missing would hide the thing most worth knowing — that a place
 * was not read.
 */
function coverageMap(read: readonly ReadRegion[]): CoverageMapRegion[] {
  const byRegion = new Map(read.map((r) => [r.region, r]));
  return SCAN_REGIONS.map((region) => {
    const entry = byRegion.get(region);
    return {
      region,
      label: regionLabel(region),
      score: entry ? entry.grade.score : null,
      confidence: entry ? entry.grade.confidence : 0,
      confidenceLabel: entry
        ? `${COPY.assessment.confidenceLabel} ${confidencePercent(entry.grade.confidence)}%`
        : null,
    };
  });
}

function assessmentBlock(read: readonly ReadRegion[], availability: Availability): AssessmentBlock {
  const base = {
    heading: COPY.assessment.heading,
    subheading: COPY.assessment.subheading,
    scoreLabel: COPY.assessment.scoreLabel,
    scoreScale: COPY.assessment.scoreScale,
    pointsLabel: COPY.assessment.pointsLabel,
    scoreNote: COPY.assessment.scoreNote,
    confidenceLabel: COPY.assessment.confidenceLabel,
    mapHeading: COPY.assessment.mapHeading,
    mapSubheading: COPY.assessment.mapSubheading,
    unreadLabel: COPY.assessment.unread,
    /*
      The whole head of the report is free. The rule the gate has always
      worked to is that a free reading is never LESS qualified than the
      paid one about the same pictures; holding the one figure that says
      what the scan found would leave a free reader with a page of
      captions about a number they cannot see.
    */
    locked: false,
  };

  if (availability === 'unavailable') {
    return {
      ...base,
      overall: null,
      overallConfidence: null,
      summary: null,
      regions: [],
      unreadNote: null,
      unavailable: {
        title: COPY.assessment.unavailableTitle,
        body: COPY.assessment.unavailableBody,
        cta: COPY.assessment.unavailableCta,
      },
    };
  }

  const overall = overallGrade(read.map((r) => r.measurement));
  const regions = coverageMap(read);
  const unread = regions.filter((r) => r.score === null).length;
  return {
    ...base,
    overall,
    overallConfidence: overall ? confidenceLine(overall) : null,
    summary: overall ? COPY.assessment.overall(overall.score, read.length) : null,
    regions,
    unreadNote: unread > 0 ? COPY.assessment.unreadNote(unread) : null,
    unavailable: null,
  };
}

/* ------------------------------- the cards ------------------------------- */

/**
 * The observation on a card: at most three sentences, each of which can
 * be pointed at a figure this model is already holding.
 *
 * The first says what was read here. The second sets it beside another
 * region of the SAME scan — the honest kind of comparison, because both
 * figures came off the same frames in the same light — and is emitted
 * only where both readings are sure enough of themselves to be compared
 * and the gap is wide enough to survive rounding. The third is the
 * caveat a shaky reading carries with it.
 */
function observationFor(entry: ReadRegion, read: readonly ReadRegion[]): string {
  const parts: string[] = [
    entry.visibleScalp !== null
      ? COPY.cards.reading(entry.grade.score, entry.visibleScalp)
      : COPY.cards.readingNoScalp(entry.grade.score),
  ];

  const others = read.filter((r) => r.region !== entry.region && comparable(entry.grade, r.grade));

  let widest: ReadRegion | null = null;
  for (const other of others) {
    const gap = Math.abs(entry.grade.score - other.grade.score);
    const best = widest ? Math.abs(entry.grade.score - widest.grade.score) : -1;
    if (gap > best) widest = other;
  }
  const coverageGap = widest ? Math.abs(entry.grade.score - widest.grade.score) : 0;

  if (widest && coverageGap >= CONTRAST_POINTS) {
    parts.push(
      entry.grade.score > widest.grade.score
        ? COPY.cards.contrastAbove(scanRegionWord(widest.region), coverageGap)
        : COPY.cards.contrastBelow(scanRegionWord(widest.region), coverageGap),
    );
  } else if (entry.visibleScalp !== null) {
    /*
      No coverage gap worth naming, so the other figure on the card gets
      its turn: the place in this scan with the least visible scalp, set
      against this one. Same rule — both readings comparable, gap wide
      enough to mean something next month too.
    */
    const scalps = others.filter(
      (r): r is ReadRegion & { visibleScalp: number } => r.visibleScalp !== null,
    );
    let lightest: (ReadRegion & { visibleScalp: number }) | null = null;
    for (const other of scalps) {
      if (lightest === null || other.visibleScalp < lightest.visibleScalp) lightest = other;
    }
    if (lightest && entry.visibleScalp - lightest.visibleScalp >= CONTRAST_POINTS) {
      parts.push(
        COPY.cards.scalpMore(scanRegionWord(lightest.region), entry.visibleScalp - lightest.visibleScalp),
      );
    }
  }

  if (entry.grade.confidence < COMPARABLE_CONFIDENCE) parts.push(COPY.cards.lowConfidence);
  return parts.join(' ');
}

function cardsBlock(
  session: PhotoSession,
  journey: Journey | null,
  read: readonly ReadRegion[],
  baselineChanges: readonly RegionChange[],
  premium: boolean,
): CardsBlock {
  const lead = leadRegions(journey, read);
  const byRegion = new Map(read.map((r) => [r.region, r]));
  /*
    The person's own regions first, then the rest down the head. Sorting
    rather than filtering: a region that does not lead is still read, and
    still shown, because hiding a measured place would be the report
    choosing what somebody is allowed to know about their own scan.
  */
  const ordered = [...lead, ...CARD_ORDER.filter((r) => !lead.includes(r))].filter((r) =>
    byRegion.has(r),
  );

  const left = byRegion.get('leftTemple');
  const right = byRegion.get('rightTemple');
  const temples = left && right && comparable(left.grade, right.grade)
    ? Math.abs(left.grade.score - right.grade.score)
    : null;

  const cards: RegionCard[] = ordered.map((region) => {
    const entry = byRegion.get(region) as ReadRegion;
    const change = baselineChanges.find((c) => c.region === region);
    return {
      region,
      label: regionLabel(region),
      grade: entry.grade,
      visibleScalp: entry.visibleScalp,
      ...(temples !== null && (region === 'leftTemple' || region === 'rightTemple')
        ? { symmetry: temples }
        : {}),
      ...(change ? { changeFromBaseline: change } : {}),
      changePoints: changePointsOf(change),
      crop: cropForScanRegion(session, region),
      observation: observationFor(entry, read),
      tab: TAB_OF_REGION[region],
    };
  });

  return {
    heading: COPY.cards.heading,
    subheading: COPY.cards.subheading,
    coverageLabel: COPY.cards.coverageLabel,
    scalpLabel: COPY.cards.scalpLabel,
    differenceLabel: COPY.cards.differenceLabel,
    changeLabel: COPY.cards.changeLabel,
    cards,
    locked: !premium,
  };
}

/* -------------------------- the scalp visibility ------------------------- */

function scalpVisibilityBlock(read: readonly ReadRegion[], premium: boolean): ScalpVisibilityBlock {
  const rows = read
    .filter((r): r is ReadRegion & { visibleScalp: number } => r.visibleScalp !== null)
    .map((r) => ({
      region: r.region,
      label: regionLabel(r.region),
      visibleScalp: r.visibleScalp,
      confidence: r.grade.confidence,
    }))
    .sort((a, b) => b.visibleScalp - a.visibleScalp);
  if (rows.length === 0) return null;

  // "The most" is only worth saying when the top of the list is clear of
  // the next one by more than rounding; otherwise the honest line is
  // that nothing stands out.
  const clear = rows.length >= 2 && rows[0].visibleScalp - rows[1].visibleScalp >= CONTRAST_POINTS;
  return {
    heading: COPY.scalp.heading,
    subheading: COPY.scalp.subheading,
    label: COPY.scalp.label,
    rows,
    body: clear
      ? COPY.scalp.most(scanRegionWord(rows[0].region), rows[0].visibleScalp)
      : COPY.scalp.even,
    note: COPY.scalp.note,
    locked: !premium,
  };
}

/* ------------------------------ the symmetry ----------------------------- */

function symmetryBlock(read: readonly ReadRegion[], premium: boolean): SymmetryBlock {
  const left = read.find((r) => r.region === 'leftTemple');
  const right = read.find((r) => r.region === 'rightTemple');
  // One side is not a pair, and two readings too shaky to compare are
  // not a pair either. Both refusals leave the section out entirely
  // rather than drawing it with a figure nobody can stand behind.
  if (!left || !right || !comparable(left.grade, right.grade)) return null;

  const differencePoints = Math.abs(left.grade.score - right.grade.score);
  const balanced = differencePoints < SYMMETRY_POINTS;
  const higher = left.grade.score >= right.grade.score ? 'left' : 'right';
  return {
    heading: COPY.symmetry.heading,
    subheading: COPY.symmetry.subheading,
    label: COPY.symmetry.label,
    left: left.grade,
    right: right.grade,
    leftLabel: regionLabel('leftTemple'),
    rightLabel: regionLabel('rightTemple'),
    differencePoints,
    balanced,
    body: balanced
      ? COPY.symmetry.balanced(differencePoints)
      : COPY.symmetry.apart(higher, differencePoints),
    note: COPY.symmetry.note,
    locked: !premium,
  };
}

/* ------------------------------ what changed ----------------------------- */

/**
 * One comparison row. The verdict is the engine's; this only puts it
 * into words.
 *
 * The delta is rounded to whole points and floored at one: a difference
 * the engine reported has, by definition, cleared the two scans' own
 * margin of error, and printing "0 points higher" beside a reported
 * difference would be the report contradicting itself over a rounding.
 * The delta of an `insufficient` row is never printed at all — it is a
 * placeholder zero, and the engine says so.
 */
function changeRowOf(change: RegionChange): ChangeRow {
  const label = regionLabel(change.region);
  if (change.verdict === 'insufficient') {
    return { region: change.region, label, verdict: change.verdict, detail: COPY.changed.insufficient };
  }
  if (change.verdict === 'unchanged') {
    return { region: change.region, label, verdict: change.verdict, detail: COPY.changed.unchanged };
  }
  const points = Math.max(1, Math.round(Math.abs(change.delta) * 100));
  const word = COPY.changed.verdicts[change.verdict];
  return {
    region: change.region,
    label,
    verdict: change.verdict,
    detail: change.delta > 0 ? COPY.changed.higher(points, word) : COPY.changed.lower(points, word),
  };
}

/**
 * A reported difference in whole points, signed, or null where there is
 * none to report.
 *
 * The same rounding as `changeRowOf` — away from zero, floored at one —
 * so the figure on a region's card and the sentence in the comparison
 * below it are one number said twice rather than two numbers.
 */
function changePointsOf(change: RegionChange | undefined): number | null {
  if (!change) return null;
  if (change.verdict === 'unchanged' || change.verdict === 'insufficient') return null;
  const points = Math.max(1, Math.round(Math.abs(change.delta) * COVERAGE_SCORE_MAX));
  return change.delta > 0 ? points : -points;
}

/** Only the verdicts that cleared the floor. An `unchanged` row is the absence of news, not news. */
function reportedChanges(changes: readonly RegionChange[]): ChangeRow[] {
  return changes
    .filter((c) => c.verdict !== 'unchanged' && c.verdict !== 'insufficient')
    .map(changeRowOf);
}

/**
 * How far a stored delta may sit from the difference of the two
 * coverages before the pair is not the pair it was computed from.
 *
 * Half a point of coverage. The two sides are stored to full precision,
 * so an honest pair reproduces its delta to floating-point error and
 * anything this wide apart is a different scan.
 */
const DELTA_TOLERANCE = 0.005;

/**
 * Whether `candidate` is provably the scan the stored comparison was
 * made against.
 *
 * `PhotoSessionRegionChange` records no identity for the other side, and
 * `deleteSession` can remove the scan a comparison was made against
 * long after the comparison was stored. Picking "the most recent earlier
 * measured session as the record stands now" and dating the rows from it
 * would then print a date and a day count for a comparison that was made
 * against something else.
 *
 * The record does, though, carry enough to CHECK a candidate: `delta` is
 * this scan's coverage minus that scan's, so a candidate that is the
 * right one reproduces every delta the record holds. This verifies that
 * identity and nothing else — the verdicts stay exactly as the engine
 * decided them, and a candidate that fails only loses its date.
 *
 * `insufficient` rows are skipped: their delta is a placeholder and the
 * schema says so. A comparison with nothing but those rows cannot be
 * checked, and takes the undated sentence.
 */
function reproducesChanges(
  measurement: ScanMeasurement | null,
  candidate: PhotoSession,
  changes: readonly RegionChange[],
): boolean {
  const before = candidate.scan?.measurement;
  if (!measurement || !before) return false;
  let checked = 0;
  for (const change of changes) {
    if (change.verdict === 'insufficient') continue;
    const now = measurement.regions[change.region];
    const then = before.regions[change.region];
    if (!now || !then) return false;
    if (!Number.isFinite(now.coverage) || !Number.isFinite(then.coverage)) return false;
    if (Math.abs(now.coverage - then.coverage - change.delta) > DELTA_TOLERANCE) return false;
    checked += 1;
  }
  return checked > 0;
}

/** The most recent earlier session carrying a measurement: the candidate for what the stored comparison was made against. */
function previousMeasured(data: AppData, session: PhotoSession): PhotoSession | null {
  for (const earlier of data.sessions) {
    if (earlier.id === session.id) continue;
    if (!earlier.scan?.measurement) continue;
    if (earlier.capturedAt > session.capturedAt) continue;
    return earlier;
  }
  return null;
}

function baselineMeasured(data: AppData, session: PhotoSession): PhotoSession | null {
  return (
    data.sessions.find(
      (s) => s.isBaseline && s.id !== session.id && s.scan?.measurement !== undefined,
    ) ?? null
  );
}

/**
 * Whether the scan before this one and the baseline are provably the
 * same scan: the ordinary shape of a second scan, and the one place two
 * comparison blocks would be one comparison drawn twice.
 *
 * Provably. The stored rows have to reproduce against that session (see
 * `reproducesChanges`); where they do not, the stored comparison was
 * made against something that is no longer on record, and the two
 * comparisons really are two.
 */
function baselineIsPreviousMeasured(data: AppData, session: PhotoSession): boolean {
  const previous = previousMeasured(data, session);
  const baseline = baselineMeasured(data, session);
  if (!previous || !baseline || previous.id !== baseline.id) return false;
  return reproducesChanges(measurementOf(session), previous, session.scan?.changes ?? []);
}

function changedBlock(
  data: AppData,
  session: PhotoSession,
  baselineChanges: readonly RegionChange[],
  availability: Availability,
  premium: boolean,
): ChangedBlock {
  /*
    A comparison is a measured block like any other. An unavailable
    report has no reading of its own, so it has nothing to set beside
    anything: a record whose measurement is absent or corrupt while its
    stored changes survive would otherwise put "9 points of visual
    coverage lower" under the words "we could not reliably analyse this
    scan". The section is left off the sheet in that case too, but the
    contract is held here rather than left to depend on that.
  */
  if (availability !== 'measured') {
    return {
      heading: COPY.changed.heading,
      subheading: COPY.changed.subheading,
      baselineHeading: COPY.changed.baselineHeading,
      span: '',
      baselineSpan: '',
      sinceLast: [],
      sinceBaseline: [],
      body: '',
      baselineBody: '',
      locked: !premium,
    };
  }

  /*
    The since-last rows are the comparison the scanner already made and
    stored. They are not recomputed here — the record is what the engine
    decided at the time, on the two measurements as they were, and a
    second opinion taken months later off the same numbers would be this
    file pretending to be the engine.
  */
  const stored: readonly RegionChange[] = session.scan?.changes ?? [];
  const sinceLast = reportedChanges(stored);

  /*
    The date on the span has to belong to the rows above it. The rows are
    the stored comparison; the candidate for its other side is the most
    recent earlier measured session AS THE RECORD STANDS NOW, and that is
    not the same thing — the scan the comparison was actually made
    against can have been deleted since. So the candidate is checked
    against the deltas it would have produced, and a candidate that does
    not reproduce them is not dated: the same rows go out under the
    undated sentence rather than under somebody else's date.
  */
  const previous = previousMeasured(data, session);
  const provable =
    previous !== null && reproducesChanges(measurementOf(session), previous, stored)
      ? previous
      : null;

  // The baseline is the one comparison the record does not store, so it
  // is made by the engine through its own front door in
  // `buildHairScanReport` and handed in here already decided.
  const baseline = baselineMeasured(data, session);
  const sinceBaseline = reportedChanges(baselineChanges);

  /*
    The second scan is the commonest report there is, and on it the scan
    before this one IS the baseline. Drawn as two blocks that is the same
    region, the same figure and the same date under two headings — and
    worse, under two words for it, since one side is the verdict the
    engine stored at the time and the other a comparison made just now.
    So where the two sides are provably one scan the comparison is stated
    once, in the block that is about the scan before this one, and the
    span says that it is also the baseline.

    Provably: the stored rows have to reproduce against that session (see
    `reproducesChanges`). Where they do not, the stored comparison was
    made against something else and the two blocks are two comparisons.
  */
  const folded = baselineIsPreviousMeasured(data, session);

  const span =
    stored.length === 0
      ? ''
      : provable
        ? (folded ? COPY.changed.spanBoth : COPY.changed.span)(
            formatDateShort(provable.capturedAt),
            Math.max(0, daysBetween(provable.capturedAt, session.capturedAt)),
          )
        : COPY.changed.spanUndated;

  /*
    One line per block, each about its own comparison. A single line for
    both was what made "Baseline comparison" a heading over nothing: the
    quiet side fell silent because the other side had a row.
  */
  const nothingToCompare = previous === null && baselineChanges.length === 0;
  const body =
    sinceLast.length > 0 ? '' : nothingToCompare ? COPY.changed.firstScan : COPY.changed.none;

  const showBaseline = !folded && baseline !== null && baselineChanges.length > 0;
  const baselineBody = showBaseline && sinceBaseline.length === 0 ? COPY.changed.noneBaseline : '';

  return {
    heading: COPY.changed.heading,
    subheading: COPY.changed.subheading,
    baselineHeading: COPY.changed.baselineHeading,
    span,
    baselineSpan: showBaseline && baseline ? COPY.changed.spanBaseline(formatDateShort(baseline.capturedAt)) : '',
    sinceLast,
    sinceBaseline: showBaseline ? sinceBaseline : [],
    body,
    baselineBody,
    locked: !premium,
  };
}

/* ---------------------------- the areas to watch -------------------------- */

/**
 * Three derivations, and nothing else may be added without a figure
 * behind it: the place with the most visible scalp, the weaker half of
 * an uneven pair, and any region the engine said actually changed.
 *
 * Each carries the figure that put it on the list, so the reason is
 * always checkable against the card above it. This is not a finding
 * about somebody's hair and the copy says so: it is where the next scan
 * is worth aiming.
 */
function watchItems(
  read: readonly ReadRegion[],
  changes: readonly RegionChange[],
): WatchItem[] {
  const items: WatchItem[] = [];
  const seen = new Set<ScanRegion>();
  const add = (region: ScanRegion, reason: string): void => {
    if (seen.has(region)) return;
    seen.add(region);
    items.push({ region, label: regionLabel(region), reason });
  };

  const withScalp = read
    .filter((r): r is ReadRegion & { visibleScalp: number } => r.visibleScalp !== null)
    .sort((a, b) => b.visibleScalp - a.visibleScalp);
  if (withScalp.length >= 2 && withScalp[0].visibleScalp - withScalp[1].visibleScalp >= CONTRAST_POINTS) {
    add(withScalp[0].region, COPY.watch.scalp(withScalp[0].visibleScalp));
  }

  const left = read.find((r) => r.region === 'leftTemple');
  const right = read.find((r) => r.region === 'rightTemple');
  if (left && right && comparable(left.grade, right.grade)) {
    const gap = Math.abs(left.grade.score - right.grade.score);
    if (gap >= SYMMETRY_POINTS) {
      const lower = left.grade.score < right.grade.score ? left : right;
      add(lower.region, COPY.watch.asymmetry(gap));
    }
  }

  for (const change of changes) {
    if (change.verdict === 'unchanged' || change.verdict === 'insufficient') continue;
    add(change.region, COPY.watch.changed);
  }

  return items.slice(0, WATCH_MAX);
}

/*
  The list is a measured block, and an unavailable report has none.

  Two of the three derivations already fall silent on their own when no
  region was read — there is no visible scalp to rank and no pair to set
  side by side — but the third reads the comparison the record stored,
  and a record whose measurement is absent or corrupt while its stored
  changes survive would put a row under the words "we could not
  reliably analyse this scan". Today's engine cannot produce that pair;
  the contract that every measured block is empty when the analysis did
  not run is enforced here rather than left to depend on that.
*/
function watchBlock(items: WatchItem[], availability: Availability, premium: boolean): WatchBlock {
  return {
    heading: COPY.watch.heading,
    subheading: COPY.watch.subheading,
    items: availability === 'measured' ? items : [],
    body: items.length === 0 && availability === 'measured' ? COPY.watch.none : null,
    locked: !premium,
  };
}

/* ------------------------------ the quality ------------------------------ */

function qualityBlock(session: PhotoSession, premium: boolean): QualityBlock {
  const frames = session.photos.length;
  const regions = new Set(session.photos.map((p) => p.angle)).size;
  return {
    heading: COPY.quality.heading,
    subheading: COPY.quality.subheading,
    summary: frames === 0 ? COPY.quality.summaryNone : COPY.quality.summary(frames, regions),
    rows: analysisRows(session, premium),
    marks: { measured: COPY.marks.measured, kept: COPY.marks.kept },
  };
}

/* ------------------------------- the model ------------------------------- */

export function buildHairScanReport(
  data: AppData,
  session: PhotoSession,
  opts: { premium: boolean; now?: Date },
): HairScanReportModel {
  const premium = opts.premium;
  const now = opts.now ?? new Date();
  const hero = byAngle(session, 'front') ?? session.photos[0];

  /*
    The measurement first: everything above the scan-quality section is
    built from it, and whether it exists at all decides what kind of
    report this is. A measurement that read no region is as unavailable
    as no measurement — there is nothing to show either way, and a page
    of "Not read" rows under an empty headline figure would be the
    report insisting it had something to say.
  */
  const measurement = measurementOf(session);
  const read = readRegions(measurement);
  const availability: Availability = read.length > 0 ? 'measured' : 'unavailable';

  const quality = qualityBlock(session, premium);
  const assessment = assessmentBlock(read, availability);
  const baselineMeasurement = baselineMeasured(data, session)?.scan?.measurement ?? null;
  const baselineChanges: RegionChange[] =
    measurement && baselineMeasurement ? compareScans(measurement, baselineMeasurement) : [];
  const changed = changedBlock(data, session, baselineChanges, availability, premium);
  const cards = cardsBlock(session, data.journey, read, baselineChanges, premium);
  const scalpVisibility = scalpVisibilityBlock(read, premium);
  const symmetry = symmetryBlock(read, premium);
  const watch = watchBlock(
    watchItems(read, session.scan?.changes ?? []),
    availability,
    premium,
  );

  /*
    The tab row is the union of what the cards hold and what the quality
    rows hold, in reading order. Built from both so that a scan with no
    measurement still gets the tabs its frames earn, and a measured scan
    gets the two — mid-scalp and part line — that no frame is named
    after.
  */
  const tabsHeld = new Set<ReportTab>([
    ...cards.cards.map((c) => c.tab),
    ...quality.rows.map((r) => r.tab),
  ]);
  const tabs: { id: ReportTab; label: string }[] = [{ id: 'all', label: COPY.tabs.all }];
  for (const id of ['hairline', 'temples', 'crown', 'midScalp', 'partLine', 'light'] as const) {
    if (tabsHeld.has(id)) tabs.push({ id, label: COPY.tabs[id] });
  }

  const goal = focusBlock(data.journey, session, read, availability, premium);
  const tips = tipsForProfile(tipProfileOf(data.journey));
  const shapedBySentence = profileSentence(tips.shapedBy);

  /*
    The coach's paragraph reads the same findings this model holds rather
    than working them out again: the measurement, the stored comparison,
    and the baseline comparison made once above. `formatDuration` under a
    week reads "Day 4", which is not a span anybody says "back" after, so
    a baseline that recent is handed over without one.
  */
  const baselineFrom = baselineMeasured(data, session);
  const baselineDays = baselineFrom
    ? Math.max(0, daysBetween(baselineFrom.capturedAt, session.capturedAt))
    : 0;
  const saysBody =
    tressSays(data, session, data.profile?.displayName, now, {
      measurement: session.scan?.measurement ?? null,
      sinceLast: session.scan?.changes,
      sinceBaseline: baselineChanges,
      baselineSpan:
        baselineFrom && baselineDays >= 7
          ? formatDuration(baselineFrom.capturedAt, session.capturedAt)
          : null,
      /*
        Stated rather than inferred. The paragraph can work out that the
        two comparisons are one from the rows being identical, but that
        holds only while both sides come from the same pure call; the
        model knows which sessions they were and says so. `changed` folds
        the same pair on the same test.
      */
      baselineIsPrevious: baselineIsPreviousMeasured(data, session),
    }) ?? '';

  // The owner's order, and the one the Next pill walks: what the scan
  // found, then what it is set against, then how the scan itself went,
  // then the things to do about none of it in particular.
  const sections: { id: string; label: string }[] = [
    { id: 'assessment', label: COPY.sections.assessment },
    ...(cards.cards.length > 0 ? [{ id: 'cards', label: COPY.sections.cards }] : []),
    ...(scalpVisibility ? [{ id: 'scalp', label: COPY.sections.scalp }] : []),
    ...(symmetry ? [{ id: 'symmetry', label: COPY.sections.symmetry }] : []),
    ...(availability === 'measured' ? [{ id: 'changed', label: COPY.sections.changed }] : []),
    ...(watch.items.length > 0 ? [{ id: 'watch', label: COPY.sections.watch }] : []),
    ...(goal ? [{ id: 'focus', label: COPY.sections.focus }] : []),
    { id: 'quality', label: COPY.sections.quality },
    /*
      No measurement, no paragraph, and no section for it. The coach
      returns nothing rather than an apology, and the one place in the
      report that says the analysis did not run is the assessment's own
      unavailable block.
    */
    ...(saysBody.length > 0 ? [{ id: 'says', label: COPY.sections.says }] : []),
    { id: 'tips', label: COPY.sections.tips },
    { id: 'routine', label: COPY.sections.routine },
    { id: 'hairstyles', label: HAIRSTYLE_COPY.report.sectionLabel },
  ];

  return {
    hero: {
      uri: hero?.uri ?? '',
      width: hero?.width ?? 0,
      height: hero?.height ?? 0,
      dateLabel: heroDateLabel(session.capturedAt),
    },
    tabs,
    availability,
    assessment,
    cards,
    scalpVisibility,
    symmetry,
    changed,
    watch,
    goal,
    quality,
    says: { heading: COPY.says.heading, speaker: 'Tress', body: saysBody },
    tips: {
      heading: COPY.tips.heading,
      /*
        The tracking notes lead. They are the only notes in the report
        that change what the next one can say: a comparison engine that
        refuses to report a difference inside two scans' error bars is
        worth exactly what the conditions it was handed are worth, and
        the same light, the same parting and an even interval are how
        somebody hands it better ones.
      */
      trackingHeading: COPY.tips.trackingHeading,
      trackingSubheading: COPY.tips.trackingSubheading,
      tracking: tips.tracking,
      /*
        The sentence that names their own answer rides the subheading,
        which is what the section actually draws above the notes. It is
        also carried apart on `shapedBy` for a screen that wants to set
        it out on its own; until one does, this is where it reaches a
        person. Losing it altogether — which is what happened when it
        moved out of the coach's paragraph into a field nothing read —
        takes away a line the person wrote themselves.
      */
      subheading: shapedBySentence === null
        ? COPY.tips.subheading
        : `${COPY.tips.subheading} ${shapedBySentence}`,
      shapedBy: shapedBySentence,
      items: tips.items,
      locked: !premium,
    },
    routine: routineBlock(data, premium),
    hairstyles: hairstylesBlock(data, premium),
    analysis: quality,
    focus: goal,
    strengths: { heading: COPY.strengths.heading, cards: strengthCards(data, session) },
    profile: { heading: COPY.profile.heading, tiles: profileTiles(data.journey) },
    sections,
  };
}

/* -------------------------------- the sweep ------------------------------ */

/**
 * Every sentence the app authored for a built report, with the person's
 * own answers lifted out: the profile values, the focus goal, the
 * product names and the quoted spans of the coach's paragraph are theirs
 * (see `reportModelQuotes`), and the sweep checks them separately.
 */
export function reportModelSentences(model: HairScanReportModel): string[] {
  const assessment = model.assessment;
  const scalp = model.scalpVisibility;
  const symmetry = model.symmetry;
  return [
    model.hero.dateLabel,
    ...model.tabs.map((t) => t.label),

    // The measured half, every string of it.
    assessment.heading,
    assessment.subheading,
    assessment.scoreLabel,
    assessment.scoreScale,
    assessment.pointsLabel,
    assessment.scoreNote,
    assessment.confidenceLabel,
    assessment.overallConfidence ?? '',
    assessment.summary ?? '',
    assessment.mapHeading,
    assessment.mapSubheading,
    assessment.unreadLabel,
    assessment.unreadNote ?? '',
    ...(assessment.unavailable
      ? [assessment.unavailable.title, assessment.unavailable.body, assessment.unavailable.cta]
      : []),
    ...assessment.regions.flatMap((r) => [r.label, r.confidenceLabel ?? '']),
    model.cards.heading,
    model.cards.subheading,
    model.cards.coverageLabel,
    model.cards.scalpLabel,
    model.cards.differenceLabel,
    model.cards.changeLabel,
    ...model.cards.cards.flatMap((c) => [c.label, c.observation]),
    ...(scalp
      ? [scalp.heading, scalp.subheading, scalp.label, scalp.body, scalp.note, ...scalp.rows.map((r) => r.label)]
      : []),
    ...(symmetry
      ? [
          symmetry.heading,
          symmetry.subheading,
          symmetry.label,
          symmetry.leftLabel,
          symmetry.rightLabel,
          symmetry.body,
          symmetry.note,
        ]
      : []),
    model.changed.heading,
    model.changed.subheading,
    model.changed.baselineHeading,
    model.changed.span,
    model.changed.baselineSpan,
    model.changed.body,
    model.changed.baselineBody,
    ...[...model.changed.sinceLast, ...model.changed.sinceBaseline].flatMap((r) => [r.label, r.detail]),
    model.watch.heading,
    model.watch.subheading,
    model.watch.body ?? '',
    ...model.watch.items.flatMap((i) => [i.label, i.reason]),

    model.quality.heading,
    model.quality.subheading,
    model.quality.summary,
    model.quality.marks.measured,
    model.quality.marks.kept,
    ...model.quality.rows.flatMap((r) => [r.regionLabel, r.headline, r.body]),
    model.strengths.heading,
    ...model.strengths.cards.flatMap((c) => [c.title, c.body]),
    model.profile.heading,
    ...model.profile.tiles.map((t) => t.label),
    ...(model.goal
      ? [
          model.goal.heading,
          model.goal.regionsLabel,
          model.goal.statusLabel,
          model.goal.body,
          model.goal.readingHeading,
          model.goal.reading ?? '',
          ...(model.goal.lead ? [model.goal.lead.label] : []),
        ]
      : []),
    model.tips.heading,
    // The subheading carries the quoted answer now, so it is swept the
    // same way the sentence itself was: our words checked, their words
    // lifted out and checked as a quotation in `reportModelQuotes`.
    stripQuotes(model.tips.subheading),
    model.tips.shapedBy === null ? '' : stripQuotes(model.tips.shapedBy),
    model.tips.trackingHeading,
    model.tips.trackingSubheading,
    ...model.tips.tracking.flatMap((t) => [t.kicker, t.body]),
    ...model.tips.items.flatMap((t) => [t.kicker, t.body]),
    model.hairstyles.heading,
    model.hairstyles.subheading,
    model.hairstyles.cta,
    ...model.hairstyles.tiles.map((t) => t.name),
    model.routine.heading,
    model.routine.body,
    model.routine.cta,
    model.says.heading,
    stripQuotes(model.says.body),
    ...model.sections.map((s) => s.label),
  ].filter((s) => s.length > 0);
}

/**
 * Every span a built report reads back verbatim from the record — a
 * label somebody chose, a product name as scanned or typed, a quotation
 * in the coach's paragraph. Each has to be traceable to the record; the
 * test holds the model to that so no authored phrase can hide as one.
 */
export function reportModelQuotes(model: HairScanReportModel): string[] {
  return [
    ...model.profile.tiles.map((t) => t.value),
    ...(model.goal ? [model.goal.goalLabel] : []),
    ...(model.hairstyles.hairTypeLabel !== null ? [model.hairstyles.hairTypeLabel] : []),
    ...model.routine.products.map((p) => p.name),
    ...quotedSpans(model.tips.subheading),
    ...(model.tips.shapedBy === null ? [] : quotedSpans(model.tips.shapedBy)),
    ...quotedSpans(model.says.body),
  ];
}
