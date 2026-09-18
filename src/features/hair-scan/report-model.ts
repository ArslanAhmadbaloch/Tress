/**
 * The hair scan report's view-model: everything the report screen draws,
 * built once, in one place, from the record.
 *
 * ── One long sheet ────────────────────────────────────────────────────
 * The report is a hero still with a sheet of sections over it — the
 * analysis rows with their region crops, what is working, the profile
 * tiles, whether the turn covered the person's own focus, four care
 * notes, the routine shelf and the coach's paragraph — with a tab row
 * that filters the rows and a floating Next pill that walks the
 * sections. Every string, crop, count and lock is decided here; the
 * components render the model and compute nothing, so the honesty
 * sweep in scripts/test/hair-scan-report-model.test.ts reads the whole
 * report by building it.
 *
 * ── What each section may say ─────────────────────────────────────────
 * A row is an observation about the frames: what the mask counted, how
 * a still was lit and focused, which frames exist. Where the segmenter
 * did not run the row says what was kept and what a second scan lets it
 * compare, in words, with no placeholder digit. A strength is a true
 * positive about the images or the record. A profile tile is the label
 * of a choice, never a finding. The focus block says whether the turn
 * *reached* the region somebody said they are watching, and never what
 * the region shows. The tips are general care practice. The routine
 * block is the shelf. The coach's paragraph is the coach's.
 *
 * ── First scan, mature record ─────────────────────────────────────────
 * A first scan on a fresh install — one session, no routine, no products,
 * perhaps no segmenter — has to render a full report with real content
 * in every section, and it does: light, framing and the turn are almost
 * always true positives, the profile is the funnel's answers, the focus
 * block is about coverage, the tips need only a goal (and lean on the
 * self-knowledge answers where a journey has them), the shelf says it
 * is empty, and the coach says what was kept. A record with a routine,
 * a streak, several scans and scanned products fills the same sections
 * more richly. Nothing is invented for either.
 *
 * ── Locking ───────────────────────────────────────────────────────────
 * Without Premium every row, the focus block, the tips and the routine
 * block are locked; the hero, the strengths, the profile and the coach's
 * paragraph are free. A locked row still carries its real headline —
 * the screen shows the first row's and blurs the bodies — so the free
 * reading is never more confident than the paid one about the same
 * pictures. Premium locks nothing.
 *
 * ── "Measured" ────────────────────────────────────────────────────────
 * A row is `measured` only when the segmenter's hair-area reading is
 * behind a figure on it. Light and focus are read off the pixels too,
 * but they do not earn the mark: the screen draws "Measured" beside a
 * row to say the mask counted this, and a weaker meaning would let the
 * mark sit beside a row with no figure at all. The light row's figures
 * are brightness readings and it is never marked.
 *
 * Pure: no React, nothing native. Loaded by `node --test`.
 */

import { reportSummary } from '@/features/coach/report-summary';
import { buildShelf } from '@/features/products/shelf';
import { formatDateShort } from '@/lib/date';
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
  journeyScalpSensitivity,
  journeyScalpType,
  type Angle,
  type AppData,
  type HairGoal,
  type Journey,
  type Photo,
  type PhotoRegion,
  type PhotoSession,
} from '@/types/domain';

import { HAIRSTYLE_COPY, hairstylesFor } from '@/features/hairstyles';

import { FRONT_LOCK_DEG } from './engine';
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

export type ReportTab = 'all' | 'hairline' | 'temples' | 'crown' | 'light';

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

export type HairScanReportModel = {
  hero: { uri: string; width: number; height: number; dateLabel: string; contours?: unknown };
  tabs: { id: ReportTab; label: string }[];
  analysis: {
    heading: string;
    subheading: string;
    rows: AnalysisRow[];
    /** The two words a row is marked with, by `AnalysisRow.measured`. */
    marks: { measured: string; kept: string };
  };
  strengths: { heading: string; cards: StrengthCard[] };
  profile: { heading: string; tiles: ProfileTile[] };
  focus: FocusBlock;
  tips: { heading: string; subheading: string; items: Tip[]; locked: boolean };
  hairstyles: HairstylesBlock;
  routine: RoutineBlock;
  says: SaysBlock;
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

function focusBlock(journey: Journey | null, session: PhotoSession, premium: boolean): FocusBlock {
  const goal = journey ? journeyGoals(journey)[0] : undefined;
  if (goal === undefined) return null;
  const goalLabel = HAIR_GOAL_LABELS[goal];
  const regions = FOCUS_REGIONS[goal];
  const locked = !premium;

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
    body,
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

/* ------------------------------- the model ------------------------------- */

export function buildHairScanReport(
  data: AppData,
  session: PhotoSession,
  opts: { premium: boolean; now?: Date },
): HairScanReportModel {
  const premium = opts.premium;
  const now = opts.now ?? new Date();
  const hero = byAngle(session, 'front') ?? session.photos[0];

  const rows = analysisRows(session, premium);
  const tabsHeld = new Set(rows.map((r) => r.tab));
  const tabs: { id: ReportTab; label: string }[] = [{ id: 'all', label: COPY.tabs.all }];
  for (const id of ['hairline', 'temples', 'crown', 'light'] as const) {
    if (tabsHeld.has(id)) tabs.push({ id, label: COPY.tabs[id] });
  }

  const focus = focusBlock(data.journey, session, premium);
  const tips = tipsForProfile(tipProfileOf(data.journey));

  const sections: { id: string; label: string }[] = [
    { id: 'analysis', label: COPY.sections.analysis },
    { id: 'strengths', label: COPY.sections.strengths },
    { id: 'profile', label: COPY.sections.profile },
    ...(focus ? [{ id: 'focus', label: COPY.sections.focus }] : []),
    { id: 'tips', label: COPY.sections.tips },
    { id: 'hairstyles', label: HAIRSTYLE_COPY.report.sectionLabel },
    { id: 'routine', label: COPY.sections.routine },
    { id: 'says', label: COPY.sections.says },
  ];

  return {
    hero: {
      uri: hero?.uri ?? '',
      width: hero?.width ?? 0,
      height: hero?.height ?? 0,
      dateLabel: heroDateLabel(session.capturedAt),
    },
    tabs,
    analysis: {
      heading: COPY.analysis.heading,
      subheading: COPY.analysis.subheading,
      rows,
      marks: { measured: COPY.marks.measured, kept: COPY.marks.kept },
    },
    strengths: { heading: COPY.strengths.heading, cards: strengthCards(data, session) },
    profile: { heading: COPY.profile.heading, tiles: profileTiles(data.journey) },
    focus,
    tips: { heading: COPY.tips.heading, subheading: COPY.tips.subheading, items: tips.items, locked: !premium },
    hairstyles: hairstylesBlock(data, premium),
    routine: routineBlock(data, premium),
    says: { heading: COPY.says.heading, speaker: 'Tress', body: reportSummary(data, session, data.profile?.displayName, now) },
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
  return [
    model.hero.dateLabel,
    ...model.tabs.map((t) => t.label),
    model.analysis.heading,
    model.analysis.subheading,
    model.analysis.marks.measured,
    model.analysis.marks.kept,
    ...model.analysis.rows.flatMap((r) => [r.regionLabel, r.headline, r.body]),
    model.strengths.heading,
    ...model.strengths.cards.flatMap((c) => [c.title, c.body]),
    model.profile.heading,
    ...model.profile.tiles.map((t) => t.label),
    ...(model.focus ? [model.focus.heading, model.focus.regionsLabel, model.focus.statusLabel, model.focus.body] : []),
    model.tips.heading,
    model.tips.subheading,
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
    ...(model.focus ? [model.focus.goalLabel] : []),
    ...(model.hairstyles.hairTypeLabel !== null ? [model.hairstyles.hairTypeLabel] : []),
    ...model.routine.products.map((p) => p.name),
    ...quotedSpans(model.says.body),
  ];
}
