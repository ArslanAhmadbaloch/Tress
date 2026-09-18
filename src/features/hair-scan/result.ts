/**
 * The hair scan's result: how a turn becomes photographs, and what they say.
 *
 * ── One data system, not two ──────────────────────────────────────────
 * The scanner keeps frames the person never sees as photographs. Here
 * those frames are curated down to at most one per angle and tagged with
 * the closest of the five angles the rest of the app already knows —
 * `front`, `leftTemple`, `rightTemple`, `top`, `crown` — so a scan
 * persists as an ordinary `PhotoSession` of ordinary `Photo`s. Journey,
 * Timeline, Compare and the coach keep working without knowing a scan
 * ever happened. The only addition is the optional `PhotoSession.scan`
 * block for the scan's own facts about its run, and it is additive: see
 * the note on `SCHEMA_VERSION` in types/domain.ts for why nothing here
 * may bump the version.
 *
 * `HairScanResult` is then *read back* from that session, never stored
 * beside it. A second copy of the same numbers would be a second place
 * for them to be wrong.
 *
 * ── What the analysis is ──────────────────────────────────────────────
 * Four observations — hairline, temples, coverage, scalp — each a fact
 * about the captured images built from what was measured on this device:
 * the quality reading per still, the hair-area fractions and left/right
 * balance from the segmenter when it ran, which frames exist, and how
 * consistently they were framed and lit. Where nothing was measured the
 * card says what was captured and what a second scan lets it compare. No
 * figure is printed that was not computed, and nothing here is a verdict
 * about a person: the sweep in scripts/test/hair-scan-result.test.ts
 * fails the module the day it starts to be.
 *
 * ── What Premium adds ─────────────────────────────────────────────────
 * Depth, and only depth. The Overview is free in full; each card's own
 * tab holds the images at full size, the ring, the figures and the
 * working, and for a reader without Premium `gateObservation` holds
 * those back while leaving the headline, the caveat under it and the
 * closing paragraph exactly where they were. A card that says nothing
 * was kept has no depth and is never locked: an absence is an honesty
 * statement, not a feature.
 *
 * Pure throughout, so the tests need no device and the screen has
 * nothing to decide.
 */

import {
  ANGLES,
  ANGLE_LABELS,
  type Angle,
  type Photo,
  type PhotoCoverage,
  type PhotoMaskTrace,
  type PhotoQuality,
  type PhotoSession,
  type PhotoSessionScan,
} from '@/types/domain';

import { regionRectsFor } from './region-crops';
import { HAIR_SCAN_REPORT_COPY as COPY, deg, pct } from './report-copy';
import type { FrameMesh, ScanTarget } from './types';

/* ------------------------------- the frames ------------------------------ */

/**
 * Which of the journal's five angles each of the scan's four wanted
 * regions is filed under.
 *
 * The scan sets out to photograph the front hairline, both temples and
 * the crown; the journal has known five angles since long before the
 * scanner existed, and Journey, Timeline and Compare all read those. So
 * the four land on four of the five, and the fifth — `crown`, which the
 * journal means as *the back of the head* and labels "Back" — is left to
 * the guided capture that can actually walk behind somebody.
 *
 * The crown frame is the one that needs saying out loud. It is taken
 * with the chin down and the phone in front, so what is in the picture
 * is the TOP of the head: `top` is the angle that describes it, and the
 * report's crown row already reads the top frame for exactly that reason
 * (`frameForRegion` in report-model.ts). Filing it under the journal's
 * `crown` would claim a photograph of the back of somebody's head that
 * nobody took.
 *
 * This is also the fix for a record bug: the screen used to derive a
 * frame's angle from the ring bin the head happened to be in, so a
 * hairline taken with the phone below eye level was written into the
 * journal as a left temple. The angle now comes from what the engine
 * asked the frame for.
 */
export const ANGLE_OF_TARGET: Record<ScanTarget, Angle> = {
  hairline: 'front',
  leftTemple: 'leftTemple',
  rightTemple: 'rightTemple',
  crown: 'top',
};

/** The head's angles when a frame was kept, in degrees. */
export type ScanPose = { yaw: number; pitch: number; roll: number };

/**
 * One frame the scanner kept, before curation.
 *
 * `angle` is set when the capture lane knows which part of the ring the
 * frame closed; otherwise the pose decides through `closestAngle`, and a
 * frame with neither is dropped rather than guessed at. Every reading is
 * optional for the same reason it is optional on `Photo`: absent means
 * "not measured", and the report has to say so rather than fill it in.
 */
export type HairScanFrame = {
  uri: string;
  thumbnailUri?: string;
  width: number;
  height: number;
  capturedAt: string;
  angle?: Angle;
  pose?: ScanPose;
  quality?: PhotoQuality;
  coverage?: PhotoCoverage;
  maskTrace?: PhotoMaskTrace;
  /**
   * The mesh the live camera had at this frame's shutter, when the
   * tracker had a face. Transient — it is never stored — but it is where
   * `Photo.regions` comes from: the report's crop rectangles are placed
   * from it here, once, and persist as fractions of the still.
   */
  mesh?: FrameMesh;
};

/** A photograph as the store takes it. */
export type ScanPhotoInput = Omit<Photo, 'id' | 'sessionId'>;

/** Inside this much turn, a frame is face-on. */
export const FRONT_YAW_MAX = 18;
/** Nodded this far down with the camera in front, the frame shows the top. */
export const TOP_PITCH = -28;
/**
 * Tipped further up than this, a face-on frame is looking at the ceiling
 * and stands for no angle the journey has: it is dropped, not filed as
 * the front and made the hero.
 */
export const FRONT_PITCH_MAX = 18;

/**
 * The angle a pose sits closest to.
 *
 * `leftSign` is the yaw sign the capture lane established for the left
 * side of the ring. The front camera's preview is mirrored and the
 * detector's yaw sign is not the same on every platform, which is why the
 * existing guided scan accepts either direction for the first temple and
 * then holds the person to it; this takes the same decision as an
 * argument rather than guessing. The default follows the guided scan's
 * own fixture, where the left side came in at a negative yaw.
 *
 * The back of the head is never reached from a pose — a detector that
 * can see a face is not looking at the crown — so `crown` only ever
 * arrives as an explicit `angle`.
 */
export function closestAngle(pose: ScanPose, leftSign: 1 | -1 = -1): Angle | null {
  if (!Number.isFinite(pose.yaw)) return null;
  const pitch = Number.isFinite(pose.pitch) ? pose.pitch : 0;
  if (Math.abs(pose.yaw) <= FRONT_YAW_MAX) {
    if (pitch <= TOP_PITCH) return 'top';
    return pitch <= FRONT_PITCH_MAX ? 'front' : null;
  }
  return Math.sign(pose.yaw) === leftSign ? 'leftTemple' : 'rightTemple';
}

/**
 * The pose each angle asks for — how far round, and how far down — so a
 * frame nearer it ranks higher. Yaw is unsigned: either side's ideal is
 * the same amount of turn, its way.
 */
const IDEAL_POSE: Record<Angle, { yaw: number; pitch: number }> = {
  front: { yaw: 0, pitch: 0 },
  leftTemple: { yaw: 35, pitch: 0 },
  rightTemple: { yaw: 35, pitch: 0 },
  top: { yaw: 0, pitch: TOP_PITCH },
  crown: { yaw: 0, pitch: 0 },
};

/**
 * How well a frame stands for its angle. Higher is better.
 *
 * A frame with an area reading beats one without: that is the figure
 * the report is built on. Then sharpness — the one quality the comparison
 * cannot recover later — then how close the head came to the angle's
 * own pose, in yaw and in pitch together, so a sharp frame tipped up at
 * the ceiling does not take the front slot from a level one. Ties fall to
 * the earlier frame, which keeps the choice stable.
 */
export function frameRank(frame: HairScanFrame, angle: Angle): number {
  const measured = frame.coverage ? 1000 : 0;
  const sharp = frame.quality ? Math.min(100, Math.max(0, frame.quality.sharpness)) : 0;
  const ideal = IDEAL_POSE[angle];
  const yaw = frame.pose && Number.isFinite(frame.pose.yaw) ? Math.abs(frame.pose.yaw) : null;
  const pitch = frame.pose && Number.isFinite(frame.pose.pitch) ? frame.pose.pitch : ideal.pitch;
  const off = yaw === null ? null : Math.abs(yaw - ideal.yaw) + Math.abs(pitch - ideal.pitch);
  const closeness = off === null ? 0 : Math.max(0, 50 - off);
  return measured + sharp + closeness / 100;
}

/**
 * The frames curated to at most one photograph per angle, in capture
 * order, as the store takes them.
 *
 * A frame is dropped when it cannot be tagged — no angle and no readable
 * pose — rather than filed under a guess. Every photograph is marked
 * `capture: 'scan'` so the record says how it was taken.
 */
export function scanPhotos(frames: HairScanFrame[], leftSign: 1 | -1 = -1): ScanPhotoInput[] {
  const best = new Map<Angle, { frame: HairScanFrame; rank: number }>();

  for (const frame of frames) {
    if (!frame.uri || !(frame.width > 0) || !(frame.height > 0)) continue;
    const angle = frame.angle ?? (frame.pose ? closestAngle(frame.pose, leftSign) : null);
    if (!angle) continue;
    const rank = frameRank(frame, angle);
    const held = best.get(angle);
    if (!held || rank > held.rank) best.set(angle, { frame, rank });
  }

  const out: ScanPhotoInput[] = [];
  for (const angle of ANGLES) {
    const pick = best.get(angle);
    if (!pick) continue;
    const { frame } = pick;
    const regions = frame.mesh ? regionRectsFor(frame.mesh, { width: frame.width, height: frame.height }) : {};
    out.push({
      angle,
      uri: frame.uri,
      thumbnailUri: frame.thumbnailUri,
      width: frame.width,
      height: frame.height,
      capturedAt: frame.capturedAt,
      quality: frame.quality,
      coverage: frame.coverage,
      maskTrace: frame.maskTrace,
      pose: frame.pose,
      capture: 'scan',
      // Additive and absent when nothing placed them: see `Photo.regions`.
      ...(Object.keys(regions).length > 0 ? { regions } : {}),
    });
  }
  return out;
}

/* ------------------------------- the block ------------------------------- */

export type ScanBlockInput = {
  /** Milliseconds, from the same clock. */
  startedAt: number;
  endedAt: number;
  /** The ring's fill when the scan ended, 0–1. */
  completion: number;
  frameCount: number;
  lighting?: number | null;
  tracked?: number;
};

function unit(n: number | null | undefined): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

/** The scan's record of its own run, clamped into shape for the store. */
export function scanBlock(input: ScanBlockInput): PhotoSessionScan {
  const tracked = unit(input.tracked);
  return {
    durationMs: Math.max(0, Math.round(input.endedAt - input.startedAt)) || 0,
    completion: unit(input.completion) ?? 0,
    frameCount: Math.max(0, Math.round(input.frameCount)) || 0,
    lighting: unit(input.lighting),
    ...(tracked === null ? {} : { tracked }),
    version: 1,
  };
}

/* ------------------------------- the result ------------------------------ */

export type ScanObservationId = 'hairline' | 'temples' | 'coverage' | 'scalp';

export type ObservationTone = 'good' | 'neutral' | 'attention';

/**
 * One card of the report: a visual observation about the captured
 * images, with its working and what a second scan lets it compare.
 */
export type ScanObservation = {
  id: ScanObservationId;
  title: string;
  /** Which images the card is about: "Front image", "Side images". */
  region: string;
  /** One sentence stating what the images show, or what was kept. */
  headline: string;
  /** The measurement behind it, and what it is not. */
  detail: string;
  /** What the next scan gives this card to set beside itself. */
  compare: string;
  tone: ObservationTone;
  /** True when a figure on this card came off the pixels. */
  measured: boolean;
  /** A fraction the card draws as a ring, or null when nothing was counted. */
  ring: { value: number; label: string } | null;
  /** Small "label · value" pairs, each a number that was computed. */
  figures: { label: string; value: string }[];
  /** The photographs the card is about, in capture order. */
  photos: Photo[];
};

export type LightingBand = 'even' | 'dim' | 'bright' | 'mixed' | 'unmeasured';
export type CompletionBand = 'complete' | 'partial';

export type HairScanResultFrame = {
  uri: string;
  thumbnailUri?: string;
  angle: Angle;
  quality?: PhotoQuality;
  /** True when the segmenter's area reading is on this frame. */
  measured: boolean;
};

export type HairScanResult = {
  id: string;
  createdAt: string;
  frames: HairScanResultFrame[];
  metadata: {
    /** Milliseconds, or null when the session did not come from a scan. */
    scanDuration: number | null;
    /** How the kept images were lit, from the per-still readings. */
    lightingQuality: LightingBand;
    completionQuality: CompletionBand;
    /** The ring's fill when the scan ended, 0–1, or null without a block. */
    completion: number | null;
    /** Frames the scanner kept before curation, or null without a block. */
    frameCount: number | null;
    /** Mean of the live lighting reading, 0–1, or null when not reported. */
    lighting: number | null;
  };
  analysis: {
    hairline: ScanObservation;
    temples: ScanObservation;
    coverage: ScanObservation;
    scalpVisibility: ScanObservation;
  };
  /** True when at least one kept image carries an area reading. */
  hasArea: boolean;
  /** The closing paragraph. */
  scope: string;
};

/* ------------------------------ thresholds ------------------------------- */

/*
  Mirrors features/assessment/scan-reading.ts rather than importing its
  private constants: the bands are the same ones the funnel report uses,
  so a photograph called "a little dark" there is called that here.
*/
const DARK = 60;
const DIM = 85;
const BRIGHT = 205;
const SOFT = 6;
const CRISP = 12;

/** Below this the mask found so little that no area figure is honest. */
const EMPTY_MASK = 0.02;
/** Brightness gap between two stills that makes the light a suspect. */
const EXPOSURE_SHIFT = 38;
/** Degrees of extra turn between two sides before they stop mirroring. */
const YAW_SHIFT = 12;
/** Points of area two stills of the same head differ by from framing alone. */
const NOISE_POINTS = 2.5;
/** A ring that closed this far counts as a complete turn. */
const COMPLETE_AT = 0.97;

/**
 * The bands above, for the report model, which describes the same
 * stills with the same words and must not keep a second copy of the
 * numbers that could drift from these.
 */
export const SCAN_THRESHOLDS = Object.freeze({
  DARK,
  DIM,
  BRIGHT,
  SOFT,
  CRISP,
  EMPTY_MASK,
  EXPOSURE_SHIFT,
  YAW_SHIFT,
  NOISE_POINTS,
  COMPLETE_AT,
});

/* -------------------------------- readers -------------------------------- */

/** The one-word light reading of a still: "dark", "a little dark", "very bright" or "evenly lit". */
export function lightWord(q: PhotoQuality): string {
  if (q.brightness < DARK) return COPY.light.dark;
  if (q.brightness < DIM) return COPY.light.low;
  if (q.brightness > BRIGHT) return COPY.light.bright;
  return COPY.light.even;
}

/** The one-word focus reading of a still: "soft", "in focus" or "sharp". */
export function focusWord(q: PhotoQuality): string {
  if (q.sharpness < SOFT) return COPY.focus.soft;
  if (q.sharpness < CRISP) return COPY.focus.clear;
  return COPY.focus.sharp;
}

/** Whether a photograph's quality reading is comfortably in range. */
export function qualityTone(q: PhotoQuality): ObservationTone {
  if (q.brightness < DARK || q.brightness > BRIGHT || q.sharpness < SOFT) return 'attention';
  if (q.brightness < DIM) return 'neutral';
  return 'good';
}

/**
 * The area reading on a photograph, when it is one worth printing.
 *
 * Null for a photograph never measured and for a mask that found almost
 * nothing — the funnel report draws no ring from that either, and a
 * card that printed "2% hair" off an empty mask would be printing noise
 * with a percent sign on it. Exported so the cards mark "Measured" on
 * exactly the images a figure came from.
 */
export function areaReading(photo: Pick<Photo, 'coverage'> | undefined): PhotoCoverage | null {
  const c = photo?.coverage;
  if (!c || !Number.isFinite(c.fraction) || c.fraction < EMPTY_MASK) return null;
  return c;
}

function byAngle(session: Pick<PhotoSession, 'photos'>, angle: Angle): Photo | undefined {
  return session.photos.find((p) => p.angle === angle);
}

/**
 * Whether the stored trace holds a top edge the overlay would draw. Read
 * structurally, as the overlay does — it draws nothing without contours,
 * however many edge runs are stored — so a malformed or contour-less blob
 * is silence rather than a sentence about a line that is not there.
 * Whether the drawn line then survives the crop is the overlay's to
 * know, which is why the sentence itself is worded for "where drawn".
 */
function hasTopEdge(photo: Photo | undefined): boolean {
  const trace = photo?.maskTrace;
  const contours = trace?.contours;
  const edge = trace?.topEdge;
  const runs = (value: unknown): boolean =>
    Array.isArray(value) && value.some((run) => typeof run === 'string' && run.trim().length > 0);
  return runs(contours) && runs(edge);
}

/**
 * How consistently the images were lit, as a sentence and as the fact
 * behind it. Null with fewer than two readings: one image is lit however
 * it is lit, and there is nothing to be consistent with.
 */
function lightingLine(photos: Photo[]): { line: string; mixed: boolean } | null {
  const readings = photos.map((p) => p.quality?.brightness).filter((b): b is number => typeof b === 'number');
  if (readings.length < 2) return null;
  const spread = Math.round(Math.max(...readings) - Math.min(...readings));
  const mixed = spread > EXPOSURE_SHIFT;
  return { line: mixed ? COPY.lighting.mixed(spread) : COPY.lighting.even(spread), mixed };
}

/* ------------------------------- the cards ------------------------------- */

function hairlineCard(session: PhotoSession): ScanObservation {
  const front = byAngle(session, 'front');
  const base = {
    id: 'hairline' as const,
    title: COPY.hairline.title,
    region: COPY.hairline.region,
    compare: COPY.hairline.compare,
    photos: front ? [front] : [],
  };

  if (!front) {
    return {
      ...base,
      headline: COPY.hairline.none,
      detail: COPY.hairline.noneDetail,
      tone: 'attention',
      measured: false,
      ring: null,
      figures: [],
    };
  }

  const area = areaReading(front);
  if (area) {
    const upper = pct(area.upperFraction);
    const figures = [
      { label: 'Upper frame', value: `${upper}% hair` },
      { label: 'Whole frame', value: `${pct(area.fraction)}% hair` },
    ];
    if (front.quality) figures.push({ label: 'Light', value: lightWord(front.quality) });
    return {
      ...base,
      headline: COPY.hairline.measured(upper),
      detail: hasTopEdge(front)
        ? `${COPY.hairline.measuredDetail(upper)} ${COPY.hairline.edge}`
        : COPY.hairline.measuredDetail(upper),
      tone: front.quality ? qualityTone(front.quality) : 'good',
      measured: true,
      ring: { value: area.upperFraction, label: COPY.hairline.ringLabel },
      figures,
    };
  }

  if (front.quality) {
    return {
      ...base,
      headline: COPY.hairline.kept(lightWord(front.quality), focusWord(front.quality)),
      detail: COPY.hairline.keptDetail,
      tone: qualityTone(front.quality),
      measured: true,
      ring: null,
      figures: [
        { label: 'Light', value: lightWord(front.quality) },
        { label: 'Focus', value: focusWord(front.quality) },
      ],
    };
  }

  return {
    ...base,
    headline: COPY.hairline.keptBare,
    detail: COPY.hairline.keptBareDetail,
    tone: 'neutral',
    measured: false,
    ring: null,
    figures: [],
  };
}

function templesCard(session: PhotoSession): ScanObservation {
  const left = byAngle(session, 'leftTemple');
  const right = byAngle(session, 'rightTemple');
  const front = byAngle(session, 'front');
  const photos = [left, right].filter((p): p is Photo => p !== undefined);
  const base = {
    id: 'temples' as const,
    title: COPY.temples.title,
    region: COPY.temples.region,
    compare: COPY.temples.compare,
    photos,
  };

  if (photos.length === 0) {
    return {
      ...base,
      headline: COPY.temples.none,
      detail: COPY.temples.noneDetail,
      tone: 'attention',
      measured: false,
      ring: null,
      figures: [],
    };
  }

  const figures: { label: string; value: string }[] = [];
  const working: string[] = [];

  /*
    The front image's left/right split is a framing fact the segmenter
    already reports, and it is the only left-versus-right figure the
    report has that comes from one picture rather than two. It goes on
    this card because this is the card about the two sides.
  */
  const frontArea = areaReading(front);
  if (frontArea && typeof frontArea.horizontalBalance === 'number') {
    const l = pct(frontArea.horizontalBalance);
    working.push(COPY.temples.frontBalance(l, 100 - l));
    figures.push({ label: 'Front, left · right', value: `${l}% · ${100 - l}%` });
  }

  const turnL = left?.pose && Number.isFinite(left.pose.yaw) ? deg(left.pose.yaw) : null;
  const turnR = right?.pose && Number.isFinite(right.pose.yaw) ? deg(right.pose.yaw) : null;
  let turnsMismatch = false;
  if (turnL !== null && turnR !== null) {
    working.push(COPY.temples.turns(turnL, turnR));
    figures.push({ label: 'Turn, left · right', value: `${turnL}° · ${turnR}°` });
    if (Math.abs(turnL - turnR) > YAW_SHIFT) {
      turnsMismatch = true;
      working.push(COPY.temples.turnsApart(Math.abs(turnL - turnR)));
    }
  }

  if (photos.length === 1) {
    const only = photos[0];
    const area = areaReading(only);
    return {
      ...base,
      headline: area
        ? COPY.temples.one(only.angle, pct(area.fraction))
        : COPY.temples.oneUnmeasured(only.angle),
      detail: [COPY.temples.oneDetail, ...working].join(' '),
      tone: 'attention',
      measured: area !== null || figures.length > 0,
      ring: area ? { value: area.fraction, label: COPY.temples.ringLabel } : null,
      figures: area
        ? [{ label: ANGLE_LABELS[only.angle], value: `${pct(area.fraction)}% hair` }, ...figures]
        : figures,
    };
  }

  const areaL = areaReading(left);
  const areaR = areaReading(right);
  if (areaL && areaR) {
    const l = pct(areaL.fraction);
    const r = pct(areaR.fraction);
    const diffPoints = Math.abs(areaL.fraction - areaR.fraction) * 100;
    const diff = Math.round(diffPoints);
    // "Within N" has to be true of the whole difference, so it rounds up —
    // past the float noise in a percentage, which is not a point.
    const balance =
      diffPoints < NOISE_POINTS
        ? COPY.temples.close(Math.max(1, Math.ceil(Math.round(diffPoints * 1e6) / 1e6)))
        : COPY.temples.apart(areaL.fraction > areaR.fraction ? 'left' : 'right', diff);
    return {
      ...base,
      headline: COPY.temples.both(l, r),
      detail: [balance, ...working].join(' '),
      tone: turnsMismatch ? 'neutral' : 'good',
      measured: true,
      ring: { value: (areaL.fraction + areaR.fraction) / 2, label: COPY.temples.ringLabel },
      figures: [
        { label: 'Left side', value: `${l}% hair` },
        { label: 'Right side', value: `${r}% hair` },
        ...figures,
      ],
    };
  }

  const qualities = photos.map((p) => p.quality).filter((q): q is PhotoQuality => q !== undefined);
  return {
    ...base,
    headline: COPY.temples.keptUnmeasured,
    detail: [qualities.length > 0 ? COPY.temples.keptDetail : COPY.hairline.keptBareDetail, ...working].join(' '),
    tone: qualities.length > 0 ? qualities.map(qualityTone).find((t) => t !== 'good') ?? 'good' : 'neutral',
    measured: qualities.length > 0 || figures.length > 0,
    ring: null,
    figures: [
      ...qualities.map((q, i) => ({ label: ANGLE_LABELS[photos[i].angle], value: `${lightWord(q)}, ${focusWord(q)}` })),
      ...figures,
    ],
  };
}

function coverageCard(session: PhotoSession): ScanObservation {
  const photos = ANGLES.map((a) => byAngle(session, a)).filter((p): p is Photo => p !== undefined);
  const measured = photos.filter((p) => areaReading(p) !== null);
  const withQuality = photos.filter((p) => p.quality !== undefined);
  const base = {
    id: 'coverage' as const,
    title: COPY.coverage.title,
    region: COPY.coverage.region,
    compare: COPY.coverage.compare,
    photos: measured.length > 0 ? measured : photos,
  };

  const lit = lightingLine(photos);

  if (measured.length > 0) {
    const fractions = measured.map((p) => areaReading(p)?.fraction ?? 0);
    const mean = fractions.reduce((s, f) => s + f, 0) / fractions.length;
    const parts = measured.map((p) => COPY.coverage.figure(p.angle, pct(areaReading(p)?.fraction ?? 0))).join(', ');
    return {
      ...base,
      headline: COPY.coverage.measured(pct(mean), measured.length),
      detail: [COPY.coverage.perImage(parts), lit?.line].filter((s): s is string => s !== undefined).join(' '),
      tone: lit?.mixed ? 'neutral' : 'good',
      measured: true,
      ring: { value: mean, label: COPY.coverage.ringLabel },
      figures: measured.map((p) => ({
        label: ANGLE_LABELS[p.angle],
        value: `${pct(areaReading(p)?.fraction ?? 0)}% hair`,
      })),
    };
  }

  if (withQuality.length > 0) {
    return {
      ...base,
      headline: COPY.coverage.unmeasured(photos.length),
      detail: [COPY.coverage.unmeasuredDetail(withQuality.length), lit?.line]
        .filter((s): s is string => s !== undefined)
        .join(' '),
      tone: 'neutral',
      measured: true,
      ring: null,
      figures: withQuality.map((p) => ({
        label: ANGLE_LABELS[p.angle],
        value: `${lightWord(p.quality as PhotoQuality)}, ${focusWord(p.quality as PhotoQuality)}`,
      })),
    };
  }

  return {
    ...base,
    headline: COPY.coverage.bare,
    detail: COPY.coverage.bareDetail,
    tone: 'neutral',
    measured: false,
    ring: null,
    figures: [],
  };
}

function scalpCard(session: PhotoSession): ScanObservation {
  const top = byAngle(session, 'top');
  const crown = byAngle(session, 'crown');
  const photos = [top, crown].filter((p): p is Photo => p !== undefined);
  const base = {
    id: 'scalp' as const,
    title: COPY.scalp.title,
    region: COPY.scalp.region,
    compare: COPY.scalp.compare,
    photos,
  };

  if (photos.length === 0) {
    return {
      ...base,
      headline: COPY.scalp.none,
      detail: COPY.scalp.noneDetail,
      tone: 'neutral',
      measured: false,
      ring: null,
      figures: [],
    };
  }

  // The top image first: it is the one a parting shows in.
  const lead = photos.find((p) => areaReading(p) !== null) ?? photos[0];
  const area = areaReading(lead);
  if (area) {
    const rest = 100 - pct(area.fraction);
    return {
      ...base,
      headline: COPY.scalp.measured(lead.angle, rest),
      detail: COPY.scalp.measuredDetail,
      tone: lead.quality ? qualityTone(lead.quality) : 'good',
      measured: true,
      ring: { value: 1 - area.fraction, label: COPY.scalp.ringLabel(lead.angle) },
      figures: photos
        .map((p) => ({ p, a: areaReading(p) }))
        .filter((x): x is { p: Photo; a: PhotoCoverage } => x.a !== null)
        .map(({ p, a }) => ({ label: ANGLE_LABELS[p.angle], value: `${100 - pct(a.fraction)}% not hair` })),
    };
  }

  if (lead.quality) {
    return {
      ...base,
      headline: COPY.scalp.kept(lead.angle, lightWord(lead.quality), focusWord(lead.quality)),
      detail: COPY.scalp.keptDetail,
      tone: qualityTone(lead.quality),
      measured: true,
      ring: null,
      figures: photos
        .filter((p) => p.quality !== undefined)
        .map((p) => ({
          label: ANGLE_LABELS[p.angle],
          value: `${lightWord(p.quality as PhotoQuality)}, ${focusWord(p.quality as PhotoQuality)}`,
        })),
    };
  }

  return {
    ...base,
    headline: COPY.scalp.keptBare(lead.angle),
    detail: COPY.scalp.keptBareDetail,
    tone: 'neutral',
    measured: false,
    ring: null,
    figures: [],
  };
}

/* ------------------------------- metadata -------------------------------- */

/** How the kept images were lit, from the per-still readings alone. */
export function lightingBand(photos: Pick<Photo, 'quality'>[]): LightingBand {
  const readings = photos.map((p) => p.quality?.brightness).filter((b): b is number => typeof b === 'number');
  if (readings.length === 0) return 'unmeasured';
  const mean = readings.reduce((s, b) => s + b, 0) / readings.length;
  const spread = Math.max(...readings) - Math.min(...readings);
  if (spread > EXPOSURE_SHIFT) return 'mixed';
  if (mean < DIM) return 'dim';
  if (mean > BRIGHT) return 'bright';
  return 'even';
}

/**
 * Whether the turn closed. From the block when there is one; from the
 * angles otherwise, so a session that predates the block still answers.
 */
export function completionBand(session: Pick<PhotoSession, 'photos' | 'scan'>): CompletionBand {
  if (session.scan) return session.scan.completion >= COMPLETE_AT ? 'complete' : 'partial';
  const held = new Set(session.photos.map((p) => p.angle));
  return ANGLES.every((a) => held.has(a)) ? 'complete' : 'partial';
}

/* ------------------------------- the result ------------------------------ */

/** The result, read back from the persisted session. */
export function buildHairScanResult(session: PhotoSession): HairScanResult {
  const hairline = hairlineCard(session);
  const temples = templesCard(session);
  const coverage = coverageCard(session);
  const scalpVisibility = scalpCard(session);
  const hasArea = session.photos.some((p) => areaReading(p) !== null);
  const scan = session.scan;

  return {
    id: session.id,
    createdAt: session.capturedAt,
    frames: ANGLES.map((a) => byAngle(session, a))
      .filter((p): p is Photo => p !== undefined)
      .map((p) => ({
        uri: p.uri,
        thumbnailUri: p.thumbnailUri,
        angle: p.angle,
        quality: p.quality,
        measured: areaReading(p) !== null,
      })),
    metadata: {
      scanDuration: scan ? scan.durationMs : null,
      lightingQuality: lightingBand(session.photos),
      completionQuality: completionBand(session),
      completion: scan ? scan.completion : null,
      frameCount: scan ? scan.frameCount : null,
      lighting: scan ? scan.lighting : null,
    },
    analysis: { hairline, temples, coverage, scalpVisibility },
    hasArea,
    scope: hasArea ? COPY.scope.withArea : COPY.scope.withoutArea,
  };
}

/** The four cards in the order the report shows them. */
export function observationsOf(result: HairScanResult): ScanObservation[] {
  const { hairline, temples, coverage, scalpVisibility } = result.analysis;
  return [hairline, temples, coverage, scalpVisibility];
}

/** Every sentence a result can show, for the honesty sweep. */
export function resultSentences(result: HairScanResult): string[] {
  return [
    ...observationsOf(result).flatMap((o) => [
      o.title,
      o.region,
      o.headline,
      o.detail,
      o.compare,
      ...(o.ring ? [o.ring.label] : []),
      ...o.figures.flatMap((f) => [f.label, f.value]),
    ]),
    result.scope,
  ];
}

/* -------------------------------- the gate ------------------------------- */

/**
 * One card as a reader without Premium sees its tab.
 *
 * `locked` is true when the card has depth to hold back — an image, a
 * ring or a figure. The headline is never held: it is the one sentence
 * the card exists to say, and the Overview has already said it. Nor is
 * the working under it, which is where the card qualifies that sentence
 * ("area in the picture, not how close the strands sit"), nor the
 * caveat, for the same reason `NEVER_GATED` exists in the funnel's
 * reading: a qualifier behind the gate would leave the free reading
 * more confident than the paid one about the same pictures. What is
 * held is the images at full size, the ring, the figures and the
 * comparison line.
 */
export type GatedObservation = {
  observation: ScanObservation;
  locked: boolean;
  /** The sentences a locked card shows in place of its depth. */
  caveat: string;
  body: string;
  /** The accessible name of the block standing in for the held part. */
  placeholder: string;
  button: string;
};

/** Whether a card has anything behind the gate at all. */
export function observationHasDepth(observation: ScanObservation): boolean {
  return observation.photos.length > 0 || observation.ring !== null || observation.figures.length > 0;
}

export function gateObservation(observation: ScanObservation, unlocked: boolean): GatedObservation {
  return {
    observation,
    locked: !unlocked && observationHasDepth(observation),
    caveat: COPY.locked.caveat,
    body: COPY.locked.body,
    placeholder: COPY.locked.placeholder,
    button: COPY.locked.button,
  };
}

/** Every sentence a locked card shows, for the honesty sweep. */
export function lockedSentences(gated: GatedObservation): string[] {
  if (!gated.locked) return [];
  const { observation } = gated;
  return [
    observation.title,
    observation.region,
    observation.headline,
    observation.detail,
    gated.caveat,
    gated.body,
    gated.placeholder,
    gated.button,
  ];
}

/* ---------------------------- the reminder offer --------------------------- */

/**
 * Whether the report should offer reminders now, and on what interval.
 *
 * The system asks for notification permission once per install, so the
 * app spends that single ask on the first report — the moment the offer
 * explains itself, because a reading is on screen and only coming back
 * turns it into a comparison. Null means do not ask: it has been offered
 * on this install already, or there is no journey interval to schedule
 * against, which is the case on a report reached with no journey behind
 * it. The screen turns null into silence, never into a second ask.
 */
export function reminderOfferInterval(
  alreadyOffered: boolean,
  intervalDays: number | null | undefined,
): number | null {
  if (alreadyOffered) return null;
  if (typeof intervalDays !== 'number' || !Number.isFinite(intervalDays) || intervalDays <= 0) return null;
  return intervalDays;
}
