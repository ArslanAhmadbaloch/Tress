/**
 * The hair scan, as a reducer with nothing in it that needs a phone.
 *
 * The screen owns the camera, the tracker and the haptics; this owns the
 * question they are all asking — what is happening right now, and what
 * should happen next. It takes one action at a time (a tracker tick, a
 * frame landing, a button) and returns the next state plus the list of
 * things the outside world should now do. It takes no photographs and
 * fires no haptics, so every rule below can be read and checked under
 * `node --test`.
 *
 * ── The choreography ─────────────────────────────────────────────────
 * Build 17 asked for a full rotation, like a skincare scanner, behind a
 * ready gate that wanted square-on, a size window, stillness and light
 * all at once. On a real face that gate flickered and Start never armed,
 * and nobody rotates their whole head for a phone anyway. So:
 *
 *   Start is live the moment a head is followed — any distance, any
 *   angle, any light. Tracking begins when it is pressed.
 *   Stage one, `sweep`: turn the head slowly left and right. That is
 *   where the FRONT HAIRLINE and BOTH TEMPLES are seen.
 *   Stage two, `crown`: lower the head, then turn again. That is the
 *   only way a phone held in front of somebody sees the CROWN.
 *
 * Those four frames are the report, so they are what the engine asks
 * for: `REQUIRED_REGIONS`, one kept frame each, better ones replacing
 * worse ones as the head passes again. Nothing else ends the scan, and
 * nothing at all is ever said about how far away to stand.
 *
 * ── The ring ─────────────────────────────────────────────────────────
 * Twenty-four sectors run clockwise from the top, and they are the
 * JOURNEY rather than the pose — `ringDirection`, not `headDirection`.
 * Stage one walks the top half: the turn to the person's own left at
 * nine o'clock, square on at twelve, the turn to their own right at
 * three. Stage two walks the bottom half with the chin down: nine, six,
 * three again. The fill only ever rises, so stage two adds to stage one
 * rather than restarting it, and between them the whole circle is walked
 * once. The ring closes once, gradually, over the two stages.
 *
 * It was a compass before, read straight off the pose — and on that dial
 * the top meant the chin LIFTED, which this choreography never asks for.
 * A third of the ring could not light at the end of a perfect scan while
 * the report said it had closed. The picture is the thing the person
 * trusts, so the picture is what was changed.
 *
 * Frames. One is kept per wanted region — four in all — filed under the
 * region it was asked for and never under the ring bin it happened to
 * land in. Those are two different things and treating them as one was
 * a bug with teeth: a hairline taken with the phone below eye level
 * shares a bin with every crown frame, and each crown in turn was thrown
 * away for losing to it, so the scan could not finish. A request is only
 * raised when the head is steady and in a pose one of the four regions
 * still wants, never more than one every 700 ms. Every image the engine
 * lets go of — outscored, replaced, answered late, or abandoned by a
 * cancel — is named in a `discard` event, so the screen can delete the
 * file. The frames stop being the engine's at the report, when they
 * belong to the journal.
 *
 * Everything the engine knows is where a head is and how still it was.
 * It cannot see hair, and it never claims to.
 */

import { CONTOUR_NAMES, type Contours, type TrackedFace, type ViewSize } from './tracking';
import type {
  CaptureRequest,
  CapturedImage,
  DiscardReason,
  FaceReading,
  FrameMesh,
  MeshPose,
  GuidanceCue,
  MeshFace,
  RegionScores,
  ScanAction,
  ScanEvent,
  ScanFrame,
  ScanMilestone,
  ScanRegion,
  ScanStage,
  ScanState,
  ScanStep,
  ScanTarget,
  ScannerState,
  Size,
  TargetProgress,
} from './types';

/* ------------------------------ tuning ------------------------------- */

/**
 * The four frames the scan exists to take, and the only thing that ends
 * it. The report shows these images; the plan and the hairstyles read
 * the same record on both platforms.
 */
export const REQUIRED_REGIONS = ['hairline', 'leftTemple', 'rightTemple', 'crown'] as const;

/**
 * Angles, in degrees, with the sign convention both detectors share:
 * positive `yaw` is the head turned towards its own right — which is the
 * viewer's right in the mirrored front-camera preview — and positive
 * `pitch` is the face tilted up, so a lowered chin is NEGATIVE pitch.
 *
 * The thresholds are deliberately generous. They are where a comfortable
 * turn lands after the tracker's smoothing, not where the detector stops
 * reading: the person is never asked to reach.
 */
/** Inside this much turn, the frame shows the front hairline. */
export const HAIRLINE_YAW_DEG = 12;
/** From this much turn, the frame shows that temple. */
export const TEMPLE_YAW_DEG = 18;
/** At this much turn the temple is as well seen as the scan asks for. */
export const TEMPLE_FULL_DEG = 32;
/** Chin down this far (pitch ≤ −this) and the top of the head comes into view. */
export const CROWN_PITCH_DEG = 15;
/** Chin down this far, the crown is as well seen as the scan asks for. */
export const CROWN_FULL_DEG = 30;

/**
 * How far the chin may be off level before a stage-one frame stops being
 * what it says it is.
 *
 * The hairline and the temples are read off the front of the head, and
 * the front of the head is only in the picture while the chin is near
 * level. Inside `LEVEL_PITCH_DEG` nothing is deducted at all: almost
 * everybody holds a phone below eye level, and that is not a mistake to
 * be corrected. Past it the score tapers, and at `SWEEP_PITCH_LIMIT_DEG`
 * there is no frame worth taking — chin up, the forehead has left the
 * picture and the camera is looking at nostrils; chin down, the head is
 * already in the crown pose and the face is a scalp.
 *
 * The limit is deliberately much deeper than `CROWN_PITCH_DEG`. Stage
 * one used to refuse anything past the crown threshold, which meant a
 * phone held at chest height could spend the whole sweep with nothing
 * eligible to photograph.
 */
export const LEVEL_PITCH_DEG = 12;
export const SWEEP_PITCH_LIMIT_DEG = 30;

export const RING_SECTORS = 24;
export const SECTOR_DEG = 360 / RING_SECTORS;

/** The front plus twelve slices of the ring. Bin 0 is the front. */
export const RING_BINS = 12;
/**
 * How many frames the scan ever holds: one for each wanted region.
 *
 * Arithmetic, not a policy. The store is keyed by region, there are four
 * regions, so there is no cap to enforce and nothing is ever evicted.
 */
export const MAX_FRAMES = REQUIRED_REGIONS.length;

/**
 * Degrees of turn that count as the side fully seen.
 *
 * The tracker smooths yaw and the reading lags the turn, so this is set
 * where a comfortable turn lands, not where ML Kit stops reading. With
 * `REGION_NEEDED` below, a side is done from about 23° of smoothed yaw.
 * Device-tune upwards only if real scans finish too easily.
 */
export const YAW_FULL_DEG = 26;
/** Degrees of chin-down that count as the chin band fully seen. */
export const PITCH_DOWN_FULL_DEG = 18;
/** Below this normalised deviation the head is "front"; above it, on the ring. */
export const FRONT_DEVIATION = 0.3;

/** Sectors this close to the head's direction fill fully; further, they taper to nothing. */
export const SPREAD_FULL_DEG = 30;
export const SPREAD_ZERO_DEG = 55;

/** Sufficiency: how full each region must be. The chin only needs "some". */
export const REGION_NEEDED: RegionScores = { front: 1, right: 0.8, left: 0.8, chin: 0.5 };
export const REGION_WEIGHT: RegionScores = { front: 0.1, right: 0.3, left: 0.3, chin: 0.3 };

/** Sectors whose centres sit within 30° of three, six and nine o'clock. */
export const RIGHT_SECTORS = [4, 5, 6, 7];
export const CHIN_SECTORS = [10, 11, 12, 13];
export const LEFT_SECTORS = [16, 17, 18, 19];
export const REQUIRED_SECTORS = [...RIGHT_SECTORS, ...CHIN_SECTORS, ...LEFT_SECTORS];

/**
 * Framing, as fractions of the guidance frame.
 *
 * None of these gate anything any more. `SIZE_MIN`/`SIZE_MAX`/`SIZE_IDEAL`
 * survive only inside `frameQuality`, where they say which of two frames
 * of the same pose is the better picture; no cue and no gate reads them,
 * and the scan never asks anybody to move closer or further away.
 */
export const SIZE_MIN = 0.3;
export const SIZE_MAX = 0.68;
export const SIZE_IDEAL = 0.46;

/**
 * Past this far from the middle of the guidance frame the head is
 * leaving the picture, and is asked back. A cue, never a gate: the ring
 * keeps filling and the shutter keeps working while it is said.
 */
export const OFF_FRAME_TOLERANCE = 0.34;

/** Front lock: within this of square on and steady. */
export const FRONT_LOCK_DEG = 8;

export const STABLE_MIN = 0.55;
/**
 * Lighting below this is dark enough to be worth mentioning. It gates
 * nothing: Start arms in the dark, and a dark frame is still a frame —
 * `frameQuality` simply scores it low, so a better-lit pass replaces it.
 */
export const LIGHT_MIN = 0.3;
/** The neutral lighting score used for quality when lighting is unmeasured. */
export const LIGHT_UNKNOWN = 0.7;

export const CAPTURE_INTERVAL_MS = 700;
export const MAX_PENDING = 2;
/** A bin at or above this quality is not asked for again. */
export const GOOD_QUALITY = 0.8;
/** A replacement must beat the frame it replaces by this much to be worth a shutter. */
export const REPLACE_MARGIN = 0.1;

/** Head speed, in degrees per second, above which frames are refused. */
export const TOO_FAST_DEG_PER_S = 90;
export const TOO_FAST_EVENT_GAP_MS = 1500;
export const SLOW_DOWN_HOLD_MS = 1000;
export const KEEP_GOING_MS = 1200;
/** In a bin that wants a frame but not steady for this long: ask for stillness. */
export const HOLD_HINT_MS = 500;

export const LOST_MS = 600;
export const STALL_MS = 3500;
/**
 * Two stages take longer than one turn did, so the escape hatch is
 * longer too: at seventy-five seconds the scan ends with whatever it
 * has rather than holding anybody there.
 */
export const FORCED_FINISH_MS = 75_000;
/**
 * If stage one has not closed by this point the scan moves on anyway, so
 * somebody whose temples never quite register still gets the crown asked
 * for — and still gets a report — instead of sweeping until the timeout.
 */
export const STAGE_ONE_MAX_MS = 40_000;
/**
 * How long a crown that is not yet a good picture may keep the finished
 * scan open, so a deeper nod can replace the first shallow one.
 */
export const CROWN_POLISH_MS = 1500;
/** How long completion waits for in-flight frames before going on without them. */
export const SETTLE_MS = 1500;

/* ------------------------------ state -------------------------------- */

function freshTarget(): TargetProgress {
  return { captured: false, quality: 0, frameId: null, reach: 0 };
}

export function createTargets(): Record<ScanTarget, TargetProgress> {
  return {
    hairline: freshTarget(),
    leftTemple: freshTarget(),
    rightTemple: freshTarget(),
    crown: freshTarget(),
  };
}

export function createScanState(): ScanState {
  return {
    scanner: 'instructions',
    status: 'initializing',
    stage: 'sweep',
    targets: createTargets(),
    stageStartedAt: null,
    cue: null,
    permission: 'unknown',
    error: null,
    sectors: new Array<number>(RING_SECTORS).fill(0),
    completion: 0,
    regions: { front: 0, right: 0, left: 0, chin: 0 },
    frontLocked: false,
    frames: [],
    pending: [],
    abandoned: [],
    startedAt: null,
    completedAt: null,
    completeReason: null,
    lastTickAt: null,
    lastFaceAt: null,
    lastReading: null,
    lost: false,
    lastRequestAt: null,
    lastGainAt: null,
    stalled: false,
    lastTooFastAt: null,
    slowDownUntil: 0,
    keepGoingUntil: 0,
    hold: null,
    milestones: [],
    requestCount: 0,
  };
}

/* ---------------------------- geometry ------------------------------- */

/** The centre of a sector, in degrees clockwise from the top. */
export function sectorAngle(index: number): number {
  return index * SECTOR_DEG + SECTOR_DEG / 2;
}

/** Shortest angular distance between two ring angles, in degrees. */
export function angularGap(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
}

export type HeadDirection = {
  /** Degrees clockwise from the top: right turn → 90, chin down → 180, left turn → 270. */
  angle: number;
  /** Normalised deviation from square on; 1 is a full turn or a full chin-down. */
  magnitude: number;
};

/**
 * Where the head is pointing, as a direction on the ring.
 *
 * Yaw and chin-down are each normalised by the amount that counts as
 * "fully seen", so a full turn and a full nod are the same distance from
 * the centre and the ring is round rather than a lozenge.
 */
export function headDirection(face: Pick<FaceReading, 'yaw' | 'pitch'>): HeadDirection {
  const x = face.yaw / YAW_FULL_DEG;
  const down = -face.pitch / PITCH_DOWN_FULL_DEG;
  const magnitude = Math.hypot(x, down);
  const raw = (Math.atan2(x, -down) * 180) / Math.PI;
  return { angle: ((raw % 360) + 360) % 360, magnitude };
}

/**
 * Where the JOURNEY stands on the dial, which is not the same thing as
 * where the head is pointing.
 *
 * `headDirection` reads a pose as a compass bearing, and on that dial the
 * top is the chin lifted. Nothing in this choreography ever asks anybody
 * to lift their chin, so the top third of the ring could never light: a
 * perfect scan ended with eight of the twenty-four sectors dark while the
 * report said the ring had closed. The picture is the thing the person
 * trusts, so the dial is now the journey rather than the pose.
 *
 * The journey is a turn made twice. Stage one walks the TOP half — the
 * turn to the person's own left at nine o'clock, square on at twelve, the
 * turn to their own right at three. Stage two walks the BOTTOM half with
 * the chin down: nine o'clock, six, three. Between them the turn is made
 * once each way and the whole circle is walked once, which is what the
 * ring has claimed all along.
 *
 * Null when this pose is not part of this stage's walk — a head bowed out
 * of stage one, or a chin not yet down in stage two. Nothing fills then,
 * and nothing is taken away either: the sectors only ever rise.
 */
export function ringDirection(
  face: Pick<FaceReading, 'yaw' | 'pitch'>,
  stage: ScanStage,
): HeadDirection | null {
  if (!Number.isFinite(face.yaw) || !Number.isFinite(face.pitch)) return null;
  const turn = Math.max(-1, Math.min(1, face.yaw / YAW_FULL_DEG));
  if (stage === 'sweep') {
    if (Math.abs(face.pitch) >= SWEEP_PITCH_LIMIT_DEG) return null;
    return { angle: ((turn * 90) % 360 + 360) % 360, magnitude: 1 };
  }
  if (!(face.pitch <= -CROWN_PITCH_DEG)) return null;
  return { angle: 180 - turn * 90, magnitude: 1 };
}

/** Which of the 24 sectors an angle falls in. */
export function sectorOf(angle: number): number {
  const a = ((angle % 360) + 360) % 360;
  return Math.min(RING_SECTORS - 1, Math.floor(a / SECTOR_DEG));
}

/** Which frame bin the head is in: 0 for the front, 1–12 clockwise from the top. */
export function binOf(direction: HeadDirection): number {
  if (direction.magnitude < FRONT_DEVIATION) return 0;
  const slice = 360 / RING_BINS;
  return 1 + (Math.round(direction.angle / slice) % RING_BINS);
}

const RING_REGIONS: ScanRegion[] = [
  'up', 'rightUp', 'rightUp', 'right', 'rightDown', 'rightDown',
  'chin', 'leftDown', 'leftDown', 'left', 'leftUp', 'leftUp',
];

export function regionOfBin(bin: number): ScanRegion {
  if (bin <= 0) return 'front';
  return RING_REGIONS[(bin - 1) % RING_BINS] ?? 'front';
}

/**
 * How much each sector is filled by a head seen in this direction.
 *
 * Magnitude sets the ceiling: a small turn is a small fill, and only a
 * full turn fills anything to the top. Angular distance tapers it, so a
 * head pointing at three o'clock fills the sectors around three o'clock
 * and nothing at nine.
 */
export function fillFor(direction: HeadDirection): number[] {
  const reach = clamp01((direction.magnitude - FRONT_DEVIATION) / (1 - FRONT_DEVIATION));
  const out = new Array<number>(RING_SECTORS).fill(0);
  if (reach <= 0) return out;
  for (let i = 0; i < RING_SECTORS; i += 1) {
    const gap = angularGap(sectorAngle(i), direction.angle);
    const angular =
      gap <= SPREAD_FULL_DEG
        ? 1
        : clamp01(1 - (gap - SPREAD_FULL_DEG) / (SPREAD_ZERO_DEG - SPREAD_FULL_DEG));
    out[i] = reach * angular;
  }
  return out;
}

/** Nothing gained this frame. Shared because it is never written to. */
const EMPTY_FILL: readonly number[] = new Array<number>(RING_SECTORS).fill(0);

function mean(values: readonly number[], indices: readonly number[]): number {
  if (indices.length === 0) return 0;
  let sum = 0;
  for (const i of indices) sum += values[i] ?? 0;
  return sum / indices.length;
}

export function regionScores(sectors: readonly number[], frontLocked: boolean): RegionScores {
  return {
    front: frontLocked ? 1 : 0,
    right: mean(sectors, RIGHT_SECTORS),
    left: mean(sectors, LEFT_SECTORS),
    chin: mean(sectors, CHIN_SECTORS),
  };
}

/** 0–1, exactly 1 when every region has what sufficiency asks of it. */
export function completionOf(regions: RegionScores): number {
  let total = 0;
  for (const key of ['front', 'right', 'left', 'chin'] as const) {
    total += REGION_WEIGHT[key] * clamp01(regions[key] / REGION_NEEDED[key]);
  }
  return Math.min(1, total);
}

/* ------------------------- the wanted regions ------------------------ */

/**
 * Which of the four regions the head is showing right now, or null when
 * it is between two of them.
 *
 * Stage one reads the turn with the chin somewhere near level; stage two
 * reads the same turn with the chin down. Stage one asks only that the
 * front of the head is in the picture at all (`SWEEP_PITCH_LIMIT_DEG`,
 * either way) — a head bowed that far shows no hairline and no temple,
 * and a head tipped that far back shows nostrils. Anything gentler than
 * that is somebody holding a phone, and it is photographed.
 */
export function targetFor(face: Pick<FaceReading, 'yaw' | 'pitch'>, stage: ScanStage): ScanTarget | null {
  if (!Number.isFinite(face.yaw) || !Number.isFinite(face.pitch)) return null;
  if (stage === 'crown') return face.pitch <= -CROWN_PITCH_DEG ? 'crown' : null;
  if (Math.abs(face.pitch) >= SWEEP_PITCH_LIMIT_DEG) return null;
  /*
    Which temple a turn shows, and it is the opposite of the way the head
    went. Positive yaw is the head turned towards its OWN right (the sign
    convention above), and a head turned to its own right presents its
    LEFT side to a camera in front of it — which is what this app has
    said everywhere else since long before this scan existed
    (`src/types/domain.ts`: "leftTemple: Turn your head to the right to
    show your left side"). The still is written mirrored, so that left
    temple lands on the image's left, which is exactly where
    `region-crops.ts` cuts the `leftTemple` rectangle.

    Read the other way round, every one of those three agreed with the
    other two and disagreed with this line: the photograph of a left
    temple was filed under the right temple's angle and the report cropped
    the corner of the picture in front of the face. The sign itself is the
    one thing here that no amount of reading settles — it is device check
    one, and if a phone shows it inverted this pair of lines is the only
    place it is decided.
  */
  if (face.yaw >= TEMPLE_YAW_DEG) return 'leftTemple';
  if (face.yaw <= -TEMPLE_YAW_DEG) return 'rightTemple';
  return Math.abs(face.yaw) <= HAIRLINE_YAW_DEG ? 'hairline' : null;
}

/**
 * 0–1: how much of the front of the head a chin angle leaves in view.
 *
 * Level is a whole frame; past `SWEEP_PITCH_LIMIT_DEG` there is nothing
 * of the hairline left to photograph. It cuts both ways, and the chin-up
 * side is the one that matters: a phone held above eye level used to
 * score a perfect hairline for a picture of two nostrils, and because it
 * scored perfectly, the square-on frame that followed could not replace
 * it.
 */
function levelFit(pitch: number): number {
  const off = Math.abs(pitch);
  if (off <= LEVEL_PITCH_DEG) return 1;
  return clamp01(1 - (off - LEVEL_PITCH_DEG) / (SWEEP_PITCH_LIMIT_DEG - LEVEL_PITCH_DEG));
}

/**
 * 0–1: how well this pose shows that region.
 *
 * Square on is a perfect hairline and a hopeless temple; the temples
 * earn their score with the turn, the crown with the depth of the nod.
 * Stage one's two also earn it with the chin: both are pictures of the
 * front of the head, so both are scaled by `levelFit`. `frameQuality`
 * scales by all of this, so the first frame to scrape into a region
 * never counts as good and the better pass replaces it — the picture
 * the report calls the left temple is the left temple, and the one it
 * calls the hairline has a hairline in it.
 */
export function targetFit(face: Pick<FaceReading, 'yaw' | 'pitch'>, target: ScanTarget): number {
  if (!Number.isFinite(face.yaw) || !Number.isFinite(face.pitch)) return 0;
  switch (target) {
    case 'hairline':
      return clamp01(1 - Math.abs(face.yaw) / (HAIRLINE_YAW_DEG * 2)) * levelFit(face.pitch);
    case 'leftTemple':
    case 'rightTemple': {
      const turn = Math.abs(face.yaw);
      const fit = clamp01((turn - TEMPLE_YAW_DEG) / (TEMPLE_FULL_DEG - TEMPLE_YAW_DEG));
      return fit * levelFit(face.pitch);
    }
    case 'crown':
      return clamp01((-face.pitch - CROWN_PITCH_DEG) / (CROWN_FULL_DEG - CROWN_PITCH_DEG));
    default:
      return 0;
  }
}

/**
 * How near the head has come to a region, counting the approach as well
 * as the arrival, so the progress figure moves while somebody is still
 * turning rather than jumping in quarters.
 */
export function targetReach(face: Pick<FaceReading, 'yaw' | 'pitch'>, target: ScanTarget): number {
  if (!Number.isFinite(face.yaw) || !Number.isFinite(face.pitch)) return 0;
  switch (target) {
    case 'hairline':
      return targetFit(face, target);
    // Same pairing as `targetFor`: the left temple comes into view as
    // the head turns towards its own right, which is positive yaw.
    case 'leftTemple':
      return clamp01(face.yaw / TEMPLE_YAW_DEG);
    case 'rightTemple':
      return clamp01(-face.yaw / TEMPLE_YAW_DEG);
    case 'crown':
      return clamp01(-face.pitch / CROWN_PITCH_DEG);
    default:
      return 0;
  }
}

/** Every wanted region captured: the one thing that completes a scan. */
export function isSufficient(targets: Record<ScanTarget, TargetProgress>): boolean {
  return REQUIRED_REGIONS.every((region) => targets[region].captured);
}

/** Stage one is done when the hairline and both temples are in. */
export function sweepDone(targets: Record<ScanTarget, TargetProgress>): boolean {
  return targets.hairline.captured && targets.leftTemple.captured && targets.rightTemple.captured;
}

/**
 * The most of its quarter of the journey a region may be worth while
 * nobody has actually photographed it.
 *
 * `reach` is pose alone — how near the head has come — so without a
 * ceiling the figure reaches 1 on head movement, and a scan that never
 * saw the crown and ran out of time is written into the journal and read
 * out in the report as complete. The approach is worth showing, because
 * a figure that only moved four times would be no use to anybody; the
 * photograph is worth the rest.
 */
export const REACH_CEILING = 0.75;

/**
 * 0–1 across the whole journey, and 1 exactly when all four regions have
 * been captured. Approaching a region moves it; only the frame finishes
 * it. Whatever reads this figure — the ring, the record, the report —
 * can therefore treat 1 as "the scan got everything it went for".
 */
export function journeyProgress(targets: Record<ScanTarget, TargetProgress>): number {
  let total = 0;
  for (const region of REQUIRED_REGIONS) {
    const held = targets[region];
    total += held.captured ? 1 : Math.min(REACH_CEILING, clamp01(held.reach));
  }
  return clamp01(total / REQUIRED_REGIONS.length);
}

/** Whether a frame of this quality would be worth taking for a region. */
export function targetWants(state: ScanState, target: ScanTarget, quality: number): boolean {
  if (state.pending.some((p) => p.target === target)) return false;
  const held = state.targets[target];
  if (!held.captured) return true;
  if (held.quality >= GOOD_QUALITY) return false;
  return quality >= held.quality + REPLACE_MARGIN;
}

/* ----------------------------- framing ------------------------------- */

/**
 * What can be said about where the head is in the picture.
 *
 * There is no size in it, and no "framed". A head is either readable or
 * it is not, and it is either on its way out of the picture or it is
 * not; neither of those ever stops the scan, and nothing here is
 * allowed to become a gate again.
 */
export type Framing = {
  readable: boolean;
  /** Far enough from the middle to be leaving the picture. */
  offFrame: boolean;
};

export function readable(face: FaceReading): boolean {
  return (
    Number.isFinite(face.yaw) &&
    Number.isFinite(face.pitch) &&
    Number.isFinite(face.roll) &&
    Number.isFinite(face.stability) &&
    Number.isFinite(face.size) &&
    Number.isFinite(face.bounds.x) &&
    Number.isFinite(face.bounds.y) &&
    Number.isFinite(face.bounds.width) &&
    Number.isFinite(face.bounds.height)
  );
}

export function framingOf(face: FaceReading): Framing {
  if (!readable(face)) return { readable: false, offFrame: false };
  const cx = face.bounds.x + face.bounds.width / 2;
  const cy = face.bounds.y + face.bounds.height / 2;
  const offFrame =
    Math.abs(cx - 0.5) > OFF_FRAME_TOLERANCE || Math.abs(cy - 0.5) > OFF_FRAME_TOLERANCE;
  return { readable: true, offFrame };
}

export function litEnough(lighting: number | null): boolean {
  return lighting === null || !Number.isFinite(lighting) || lighting >= LIGHT_MIN;
}

/** Within `FRONT_LOCK_DEG` of square on, in both yaw and pitch. */
export function squareOn(face: Pick<FaceReading, 'yaw' | 'pitch'>): boolean {
  return Math.abs(face.yaw) <= FRONT_LOCK_DEG && Math.abs(face.pitch) <= FRONT_LOCK_DEG;
}

/** The ring region a bin's frame counts towards, for `poseFit`; `up` counts towards none. */
function neededFor(region: ScanRegion): number {
  switch (region) {
    case 'front':
      return REGION_NEEDED.front;
    case 'right':
    case 'rightUp':
    case 'rightDown':
      return REGION_NEEDED.right;
    case 'left':
    case 'leftUp':
    case 'leftDown':
      return REGION_NEEDED.left;
    case 'chin':
      return REGION_NEEDED.chin;
    default:
      return 1;
  }
}

/**
 * 0–1: how far into its bin the head has turned.
 *
 * A ring bin begins at `FRONT_DEVIATION`, where a frame is still a
 * near-frontal picture with a side label; it is fully turned where its
 * region counts as seen (`REGION_NEEDED`, so a side at about 22° of yaw
 * and the chin at about 12° of nod). The front bin is the reverse: 1
 * square on, 0 at its edge. `frameQuality` scales by this so the first
 * frame into a bin never counts as good, and the fuller turn replaces
 * it — the frame the report calls the right side is the right side.
 */
export function poseFit(direction: HeadDirection): number {
  if (direction.magnitude < FRONT_DEVIATION) {
    return clamp01(1 - direction.magnitude / FRONT_DEVIATION);
  }
  const need = neededFor(regionOfBin(binOf(direction)));
  const full = FRONT_DEVIATION + (1 - FRONT_DEVIATION) * need;
  return clamp01((direction.magnitude - FRONT_DEVIATION) / (full - FRONT_DEVIATION));
}

/** How much of a frame's quality survives at a region's edge; the rest is earned by the turn. */
export const POSE_FLOOR = 0.4;

/**
 * 0–1: how good a frame taken right now would be.
 *
 * Steadiness, light and how much of the picture the head fills decide
 * how good a photograph it is; the pose decides how well it stands for
 * the region it is being taken for. Size and light are read here and
 * only here — they say which of two frames to keep, and they have no
 * say at all in whether the scan may start or go on.
 *
 * With no `target` the pose term falls back to the ring bin the head is
 * in, which is what the ring's own frames are scored against.
 */
export function frameQuality(
  face: FaceReading,
  lighting: number | null,
  target: ScanTarget | null = null,
): number {
  const light = lighting === null || !Number.isFinite(lighting) ? LIGHT_UNKNOWN : clamp01(lighting);
  const halfRange = Math.max(SIZE_IDEAL - SIZE_MIN, SIZE_MAX - SIZE_IDEAL);
  const size = clamp01(1 - Math.abs(face.size - SIZE_IDEAL) / halfRange);
  const base = clamp01(0.45 * clamp01(face.stability) + 0.3 * light + 0.25 * size);
  const fit = target === null ? poseFit(headDirection(face)) : targetFit(face, target);
  const pose = POSE_FLOOR + (1 - POSE_FLOOR) * fit;
  return clamp01(base * pose);
}

/* ---------------------------- the reducer ---------------------------- */

export function reduce(state: ScanState, action: ScanAction): ScanStep {
  switch (action.type) {
    case 'continue':
      if (state.scanner !== 'instructions') return { state, events: [] };
      return move(state, state.permission === 'granted' ? 'ready' : 'permission');

    case 'permission': {
      const permission = action.granted ? 'granted' : 'denied';
      if (state.scanner !== 'permission') return { state: { ...state, permission }, events: [] };
      if (action.granted) return move({ ...state, permission, error: null }, 'ready');
      return move({ ...state, permission, error: 'cameraDenied' }, 'error');
    }

    case 'start': {
      if (state.scanner !== 'ready') return { state, events: [] };
      // Tracking begins here, on the press, wherever the head happens to
      // be. The front lock earned on the ready screen carries over so
      // `faceLocked` is not fired twice.
      const fresh = resetScan(state);
      const regions = regionScores(fresh.sectors, state.frontLocked);
      return move(
        {
          ...fresh,
          status: 'capturing',
          stage: 'sweep',
          stageStartedAt: action.at,
          cue: 'turnLeftRight',
          frontLocked: state.frontLocked,
          milestones: state.milestones.slice(),
          regions,
          startedAt: action.at,
          lastGainAt: action.at,
        },
        'scanning',
        [{ type: 'cue', cue: 'turnLeftRight' }],
      );
    }

    case 'tick':
      if (state.scanner === 'ready') return tickReady(state, action);
      if (state.scanner === 'scanning') return tickScanning(state, action);
      return { state, events: [] };

    case 'captured': {
      if (state.abandoned.includes(action.requestId)) {
        return {
          state: { ...state, abandoned: state.abandoned.filter((id) => id !== action.requestId) },
          events: [{ type: 'discard', images: [action.image], reason: 'late' }],
        };
      }
      return landFrame(state, action.requestId, action.image, action.mesh, action.at);
    }

    case 'captureFailed': {
      if (state.abandoned.includes(action.requestId)) {
        return {
          state: { ...state, abandoned: state.abandoned.filter((id) => id !== action.requestId) },
          events: [],
        };
      }
      if (!state.pending.some((p) => p.id === action.requestId)) return { state, events: [] };
      const next = { ...state, pending: state.pending.filter((p) => p.id !== action.requestId) };
      return settle(next, action.at);
    }

    case 'process':
      if (state.scanner !== 'complete') return { state, events: [] };
      return move(state, 'processing');

    case 'processed':
      if (state.scanner !== 'processing') return { state, events: [] };
      return move(state, 'report');

    case 'fail':
      if (state.scanner === 'error') return { state, events: [] };
      // The frames stay for the error screen; retry or cancel lets go of them.
      return move({ ...abandonPending(state), error: action.reason }, 'error');

    case 'retry': {
      if (state.scanner !== 'error') return { state, events: [] };
      const cleared = { ...resetScan(abandonPending(state)), error: null };
      return move(
        cleared,
        state.permission === 'granted' ? 'ready' : 'permission',
        discardAll(state),
      );
    }

    case 'cancel': {
      const fresh: ScanState = {
        ...createScanState(),
        permission: state.permission,
        abandoned: abandonPending(state).abandoned,
      };
      if (state.scanner === 'instructions') return { state: fresh, events: [] };
      return move(fresh, 'instructions', discardAll(state));
    }

    default:
      return { state, events: [] };
  }
}

function move(state: ScanState, to: ScannerState, extra: ScanEvent[] = []): ScanStep {
  const from = state.scanner;
  if (from === to) return { state, events: extra };
  return { state: { ...state, scanner: to }, events: [{ type: 'state', from, to }, ...extra] };
}

/**
 * Everything the ring and the shutter learned, back to zero. Permission,
 * the screen, and the ids of requests still owed by the camera are kept.
 */
function resetScan(state: ScanState): ScanState {
  const fresh = createScanState();
  return {
    ...fresh,
    scanner: state.scanner,
    permission: state.permission,
    error: state.error,
    status: state.status,
    cue: state.cue,
    lastTickAt: state.lastTickAt,
    abandoned: state.abandoned,
  };
}

/** Stop waiting for in-flight requests; a late answer will be discarded. */
function abandonPending(state: ScanState): ScanState {
  if (state.pending.length === 0) return state;
  return { ...state, pending: [], abandoned: [...state.abandoned, ...state.pending.map((p) => p.id)] };
}

/**
 * The discard for letting go of every kept frame, or nothing when there
 * are none — or when the frames are no longer the engine's to let go of:
 * from the report on, they belong to the journal.
 */
function discardAll(state: ScanState): ScanEvent[] {
  if (state.scanner === 'report' || state.frames.length === 0) return [];
  return [{ type: 'discard', images: state.frames, reason: 'abandoned' }];
}

/* --------------------------- before start ---------------------------- */

/**
 * Before Start.
 *
 * One rule: a head that can be read at all is a head the scan can work
 * with, so Start arms. Distance, angle, stillness and light have no vote
 * — every one of them was a reason build 17 refused to begin. What is
 * left is a head leaving the picture, which is worth saying, and a dark
 * room, which is worth mentioning; neither holds the button down.
 */
function tickReady(state: ScanState, action: Extract<ScanAction, { type: 'tick' }>): ScanStep {
  const { at, face, lighting } = action;
  let status: ScanState['status'] = 'detecting';
  let cue: GuidanceCue = 'centreFace';
  let frontLocked = state.frontLocked;
  const milestones = state.milestones.slice();
  const events: ScanEvent[] = [];

  if (face !== null) {
    const framing = framingOf(face);
    if (framing.readable) {
      status = 'ready';
      cue = framing.offFrame ? 'centreFace' : litEnough(lighting) ? 'perfect' : 'brighter';
      // A head held square and still is worth one buzz — the scan knows
      // where the front is before it starts. It gates nothing.
      if (!frontLocked && face.stability >= STABLE_MIN && squareOn(face)) {
        frontLocked = true;
        pushMilestone({ ...state, milestones }, events, 'faceLocked');
      }
    }
  }

  if (cue !== state.cue) events.push({ type: 'cue', cue });
  return {
    state: {
      ...state,
      status,
      cue,
      frontLocked,
      milestones,
      lastTickAt: at,
      lastFaceAt: face === null ? state.lastFaceAt : at,
      lastReading: face === null ? state.lastReading : { yaw: face.yaw, pitch: face.pitch, at },
    },
    events,
  };
}

/* ----------------------------- scanning ------------------------------ */

/**
 * The ring region a frame is labelled with.
 *
 * The region a frame stands for, never the bin the head happened to be
 * in when the shutter fired. This label is not decoration: the screen
 * turns it into the journal's angle, so a hairline taken with the phone
 * below eye level — a chin-down bin, over on the left of the ring —
 * used to be filed in the record as a left temple, and the report drew
 * its temple crop from a picture of somebody's forehead.
 */
const REGION_OF_TARGET: Record<ScanTarget, ScanRegion> = {
  hairline: 'front',
  leftTemple: 'left',
  rightTemple: 'right',
  crown: 'chin',
};

/** The milestone each region fires when its frame is in. */
const MILESTONE_OF_TARGET: Record<ScanTarget, ScanMilestone> = {
  hairline: 'hairlineDone',
  leftTemple: 'leftTempleDone',
  rightTemple: 'rightTempleDone',
  crown: 'crownDone',
};

/** The cue that belongs to a stage when nothing more urgent is being said. */
function stageCue(stage: ScanStage, down: boolean): GuidanceCue {
  if (stage === 'sweep') return 'turnLeftRight';
  return down ? 'turnAgain' : 'lowerHead';
}

/** Whether the chin is far enough down for the top of the head to be in view. */
function chinDown(face: Pick<FaceReading, 'pitch'> | null): boolean {
  return face !== null && Number.isFinite(face.pitch) && face.pitch <= -CROWN_PITCH_DEG;
}

/**
 * Stage one closes when the hairline and both temples are in — or, for
 * somebody whose turn the detector never quite reads as a temple, when
 * stage one has simply gone on long enough. Either way the crown still
 * gets asked for, because a report without it is missing the picture
 * people most want to see.
 */
function advanceStage(state: ScanState, at: number, events: ScanEvent[]): ScanState {
  if (state.stage !== 'sweep') return state;
  const timeUp = state.stageStartedAt !== null && at - state.stageStartedAt >= STAGE_ONE_MAX_MS;
  if (!sweepDone(state.targets) && !timeUp) return state;
  events.push({ type: 'stage', from: 'sweep', to: 'crown' });
  return { ...state, stage: 'crown', stageStartedAt: at };
}

/**
 * Recomputes the journey figure from the four regions, never letting it
 * fall, and announces the quarter marks as they pass.
 */
function withProgress(state: ScanState, events: ScanEvent[]): ScanState {
  const completion = Math.max(state.completion, journeyProgress(state.targets));
  if (completion <= state.completion + 1e-12) return state;
  const next = { ...state, completion };
  for (const [mark, name] of [
    [0.25, 'quarter'],
    [0.5, 'half'],
    [0.75, 'threeQuarters'],
  ] as const) {
    if (state.completion < mark && completion >= mark) pushMilestone(next, events, name);
  }
  return next;
}

/**
 * Every region in: the scan is over, whatever else is still in flight.
 *
 * With one grace note. The crown arrives the moment the chin passes the
 * threshold, and that first frame is the shallowest nod of the lot; if
 * it is not yet a good picture the scan stays open a moment longer so a
 * deeper one can replace it. The picture of the top of somebody's head
 * is the one they most want to see, and it is worth a second and a half.
 */
function finishIfDone(state: ScanState, at: number, events: ScanEvent[]): ScanStep | null {
  if (state.scanner !== 'scanning' || state.status !== 'capturing') return null;
  const elapsed = state.startedAt === null ? 0 : at - state.startedAt;
  const done = isSufficient(state.targets);
  if (done && elapsed < FORCED_FINISH_MS && state.targets.crown.quality < GOOD_QUALITY) {
    const crown = state.frames.find((f) => f.id === state.targets.crown.frameId);
    if (crown !== undefined && at - crown.capturedAt < CROWN_POLISH_MS) return null;
  }
  if (!done && elapsed < FORCED_FINISH_MS) return null;
  const reason = done ? 'coverage' : 'timeout';
  const completing: ScanState = {
    ...state,
    status: 'completing',
    completedAt: at,
    completeReason: reason,
    cue: null,
    hold: null,
  };
  events.push({ type: 'scanComplete', reason });
  return settle(completing, at);
}

function tickScanning(state: ScanState, action: Extract<ScanAction, { type: 'tick' }>): ScanStep {
  const { at, face, lighting } = action;
  const events: ScanEvent[] = [];

  if (state.status === 'completing') {
    return settle({ ...state, lastTickAt: at }, at);
  }

  let next: ScanState = { ...state, lastTickAt: at, milestones: state.milestones.slice() };

  /* Lost and found. */
  if (face === null) {
    const since = next.lastFaceAt ?? next.startedAt ?? at;
    if (!next.lost && at - since >= LOST_MS) {
      next = { ...next, lost: true, hold: null };
      events.push({ type: 'lost' });
    }
  } else if (next.lost) {
    next = { ...next, lost: false };
    events.push({ type: 'found' });
  }

  const framing = face === null ? null : framingOf(face);

  /* Speed. */
  let tooFast = false;
  if (face !== null && framing?.readable && next.lastReading) {
    const dt = at - next.lastReading.at;
    if (dt >= 16) {
      const moved = Math.hypot(face.yaw - next.lastReading.yaw, face.pitch - next.lastReading.pitch);
      tooFast = (moved / dt) * 1000 > TOO_FAST_DEG_PER_S;
    }
  }
  if (tooFast) {
    next = { ...next, slowDownUntil: at + SLOW_DOWN_HOLD_MS };
    if (next.lastTooFastAt === null || at - next.lastTooFastAt >= TOO_FAST_EVENT_GAP_MS) {
      next = { ...next, lastTooFastAt: at };
      events.push({ type: 'tooFast' });
    }
  }

  /*
    A reading is usable if it can be read and the head is not being
    whipped about. Distance, light and centring are not conditions —
    they never were the person's fault, and they are not the scan's
    business.
  */
  const usable = face !== null && framing !== null && framing.readable && !tooFast;
  if (face !== null && framing?.readable) {
    next = { ...next, lastFaceAt: at, lastReading: { yaw: face.yaw, pitch: face.pitch, at } };
  }

  /*
    The ring. One journey across both stages: the sectors only ever rise,
    stage two does not clear them, and because the chin is down by then
    the same left-and-right turn lands in the lower half of the ring and
    fills the arc stage one could not reach.
  */
  let direction: HeadDirection | null = null;
  if (usable && face !== null) {
    direction = headDirection(face);
    // The dial walks the journey; the bin below still reads the pose.
    const walk = ringDirection(face, next.stage);
    const gained = walk === null ? EMPTY_FILL : fillFor(walk);
    let sectors = next.sectors;
    let changed = false;
    for (let i = 0; i < RING_SECTORS; i += 1) {
      const g = gained[i] ?? 0;
      if (g > (sectors[i] ?? 0) + 1e-6) {
        if (!changed) {
          sectors = sectors.slice();
          changed = true;
        }
        sectors[i] = g;
      }
    }
    let frontLocked = next.frontLocked;
    if (!frontLocked && face.stability >= STABLE_MIN && squareOn(face)) {
      frontLocked = true;
      pushMilestone(next, events, 'faceLocked');
    }
    if (changed || frontLocked !== next.frontLocked) {
      next = { ...next, sectors, frontLocked, regions: regionScores(sectors, frontLocked) };
    }

    // How near the head has come to each wanted region. Monotonic, so
    // turning back through the middle costs nothing.
    let targets = next.targets;
    let moved = false;
    for (const region of REQUIRED_REGIONS) {
      const held = targets[region];
      const reach = targetReach(face, region);
      if (reach > held.reach + 1e-6) {
        if (!moved) {
          targets = { ...targets };
          moved = true;
        }
        targets[region] = { ...held, reach };
      }
    }
    if (moved) {
      const before = next.completion;
      next = withProgress({ ...next, targets }, events);
      // A stall clears only when the journey actually gains: a head that
      // wanders without coming nearer to anything is still stalled.
      if (next.completion > before + 1e-12) next = { ...next, lastGainAt: at, stalled: false };
    }
  }

  /* The stage, which a long stage one moves on by itself. */
  next = advanceStage(next, at, events);

  /* Capture: only ever for one of the four regions, and only when still. */
  let holdWanted = false;
  const target = usable && face !== null ? targetFor(face, next.stage) : null;
  if (usable && face !== null && direction !== null && target !== null) {
    const bin = binOf(direction);
    const quality = frameQuality(face, lighting, target);
    const wants = targetWants(next, target, quality);
    if (wants && face.stability < STABLE_MIN) {
      holdWanted = true;
      if (next.hold === null || next.hold.bin !== bin) next = { ...next, hold: { bin, since: at } };
    } else {
      next = { ...next, hold: null };
    }
    const throttled = next.lastRequestAt !== null && at - next.lastRequestAt < CAPTURE_INTERVAL_MS;
    if (wants && !throttled && face.stability >= STABLE_MIN && next.pending.length < MAX_PENDING) {
      const request: CaptureRequest = {
        id: `c${next.requestCount + 1}`,
        bin,
        region: REGION_OF_TARGET[target],
        target,
        sector: bin === 0 ? null : sectorOf(direction.angle),
        yaw: face.yaw,
        pitch: face.pitch,
        quality,
        at,
      };
      next = {
        ...next,
        pending: [...next.pending, request],
        lastRequestAt: at,
        requestCount: next.requestCount + 1,
        keepGoingUntil: at + KEEP_GOING_MS,
      };
      events.push({ type: 'capture', request });
    }
  } else if (next.hold !== null) {
    next = { ...next, hold: null };
  }

  /* Stall. */
  const readingNow = framing?.readable ?? false;
  if (readingNow && !next.stalled && next.lastGainAt !== null && at - next.lastGainAt >= STALL_MS) {
    next = { ...next, stalled: true };
    events.push({ type: 'stall' });
  }

  /* Cue. */
  const cue = scanningCue(next, face, framing, holdWanted, at);
  if (cue !== next.cue) {
    next = { ...next, cue };
    events.push({ type: 'cue', cue });
  }

  /* Completion. */
  const finished = finishIfDone(next, at, events);
  if (finished !== null) return { state: finished.state, events: [...events, ...finished.events] };

  return { state: next, events };
}

function pushMilestone(state: ScanState, events: ScanEvent[], milestone: ScanMilestone): void {
  if (state.milestones.includes(milestone)) return;
  state.milestones.push(milestone);
  events.push({ type: 'milestone', milestone });
}

/**
 * The one line to show, in the order the person needs it.
 *
 * Nothing in here asks anybody to move closer or further away, and the
 * stage's own instruction is the floor: whatever else is true, somebody
 * mid-scan is always being told what to do with their head.
 *
 * Which is why lighting is not in here at all. It is the one condition
 * that can hold for a whole scan, so "Find a brighter spot" would be the
 * only line a person in a dim room ever read — and this line is the only
 * place the choreography is taught while the scan is running. Light
 * gates nothing now: a dark frame is still a frame, `frameQuality` scores
 * it low, and a better-lit pass replaces it. The pill above says the
 * room is dark; the line below says what to do with your head. The two
 * cues left in front of the instruction are about the head as well, and
 * both clear within a second: a head leaving the picture, which the
 * camera cannot read, and a head being whipped about, which blurs.
 */
function scanningCue(
  state: ScanState,
  face: FaceReading | null,
  framing: Framing | null,
  holdWanted: boolean,
  at: number,
): GuidanceCue | null {
  if (state.lost) return 'backInFrame';
  if (face === null || framing === null) return state.cue;
  if (!framing.readable) return 'centreFace';
  const down = chinDown(face);
  if (framing.offFrame) return 'centreFace';
  if (state.slowDownUntil > at) return 'slowDown';
  // Stage two with the head still up: nothing else is worth saying, and
  // a "keep going" left over from the last frame would be a lie.
  if (state.stage === 'crown' && !down) return 'lowerHead';
  // The last region is being taken: the shutter is out and the head is
  // where it needs to be.
  if (state.stage === 'crown' && down && state.pending.some((p) => p.target === 'crown')) {
    return 'almost';
  }
  if (holdWanted && state.hold !== null && at - state.hold.since >= HOLD_HINT_MS) return 'holdStill';
  if (state.keepGoingUntil > at) return 'keepGoing';
  return stageCue(state.stage, down);
}

/* ----------------------------- curation ------------------------------ */

/**
 * What the scan has of each region, read back off the frames it is
 * actually holding.
 *
 * Derived rather than remembered, so a region cannot be marked captured
 * by a picture that was later replaced or outscored: what the
 * report will show is what the state says it has.
 */
function recredit(state: ScanState, at: number, events: ScanEvent[]): ScanState {
  let targets = state.targets;
  let changed = false;
  for (const region of REQUIRED_REGIONS) {
    let best: ScanFrame | null = null;
    for (const frame of state.frames) {
      if (frame.target === region && (best === null || frame.quality > best.quality)) best = frame;
    }
    const held = targets[region];
    const captured = best !== null;
    const quality = best?.quality ?? 0;
    const frameId = best?.id ?? null;
    if (held.captured === captured && held.quality === quality && held.frameId === frameId) continue;
    if (!changed) {
      targets = { ...targets };
      changed = true;
    }
    targets[region] = { captured, quality, frameId, reach: captured ? 1 : held.reach };
  }
  if (!changed) return state;
  let next: ScanState = { ...state, targets };
  for (const region of REQUIRED_REGIONS) {
    if (next.targets[region].captured) pushMilestone(next, events, MILESTONE_OF_TARGET[region]);
  }
  next = withProgress(next, events);
  return advanceStage(next, at, events);
}

function landFrame(
  state: ScanState,
  requestId: string,
  image: CapturedImage,
  mesh: FrameMesh | undefined,
  at: number,
): ScanStep {
  const request = state.pending.find((p) => p.id === requestId);
  if (!request) return { state, events: [] };
  const pending = state.pending.filter((p) => p.id !== requestId);
  const frame: ScanFrame = {
    ...image,
    id: request.id,
    bin: request.bin,
    region: request.region,
    target: request.target,
    sector: request.sector,
    yaw: request.yaw,
    pitch: request.pitch,
    quality: request.quality,
    capturedAt: at,
    // The mesh belongs to its own frame: a replacement brings its own,
    // and the frame it replaces takes the old one away with it.
    ...(mesh !== undefined ? { mesh } : {}),
  };
  const events: ScanEvent[] = [];
  const discard = (images: CapturedImage[], reason: DiscardReason): void => {
    if (images.length > 0) events.push({ type: 'discard', images, reason });
  };
  /*
    A frame competes only with the frame for its own region.

    It used to compete with whatever shared its ring bin, and a bin is
    not a region: the hairline of anybody holding the phone below eye
    level sits in the same bin as every crown frame, so each crown in
    turn lost to it and was discarded, and the scan ran to the timeout
    with the one picture the owner most wanted missing. The requirements
    are keyed by region, so the store is too.
  */
  const existing = state.frames.find((f) => f.target === frame.target);
  let frames: ScanFrame[];
  if (existing) {
    if (existing.quality >= frame.quality) {
      discard([frame], 'outscored');
      const settled = settle({ ...state, pending }, at);
      return { state: settled.state, events: [...events, ...settled.events] };
    }
    frames = state.frames.map((f) => (f.target === frame.target ? frame : f));
    discard([existing], 'replaced');
  } else {
    frames = [...state.frames, frame];
  }
  let next: ScanState = { ...state, pending, frames, milestones: state.milestones.slice() };
  events.push({ type: 'frame', frame, replaced: existing !== undefined });
  pushMilestone(next, events, 'firstFrame');
  // The frame set has changed, so what the scan has of each region has
  // changed with it — and this may be the one that ends the scan.
  next = recredit(next, at, events);
  const finished = finishIfDone(next, at, events);
  if (finished !== null) return { state: finished.state, events: [...events, ...finished.events] };
  const settled = settle(next, at);
  next = settled.state;
  return { state: next, events: [...events, ...settled.events] };
}

/* ---------------------------- completion ----------------------------- */

/** From `completing`, go to `complete` once in-flight frames have landed or the wait is up. */
function settle(state: ScanState, at: number): ScanStep {
  if (state.scanner !== 'scanning' || state.status !== 'completing') return { state, events: [] };
  const waited = state.completedAt === null ? Infinity : at - state.completedAt;
  if (state.pending.length > 0 && waited < SETTLE_MS) return { state, events: [] };
  // Anything still out is no longer waited for; a late answer is discarded.
  const settled = abandonPending(state);
  if (settled.frames.length === 0) {
    return move({ ...settled, status: 'complete', error: 'noFrames' }, 'error');
  }
  return move({ ...settled, status: 'complete', cue: null }, 'complete');
}

/* ----------------------------- selectors ----------------------------- */

/**
 * The kept frames in the order the scan asked for them: hairline, left
 * temple, right temple, crown. That is the order the report reads them
 * in and the order the processing screen flies them home in, and it no
 * longer depends on which ring bin a head happened to be in.
 */
export function orderedFrames(state: ScanState): ScanFrame[] {
  const rank = (frame: ScanFrame): number => REQUIRED_REGIONS.indexOf(frame.target);
  return state.frames.slice().sort((a, b) => rank(a) - rank(b) || a.capturedAt - b.capturedAt);
}

/**
 * The frame to show large: the front hairline, which is the one picture
 * of somebody that looks like them. Failing that — a scan that timed out
 * before it got one — the best of what there is.
 */
export function primaryFrame(state: ScanState): ScanFrame | null {
  const hairline = state.frames.find((f) => f.target === 'hairline');
  if (hairline) return hairline;
  let best: ScanFrame | null = null;
  for (const f of state.frames) if (best === null || f.quality > best.quality) best = f;
  return best;
}

/**
 * Whether the Start button should be live: on the ready screen, with a
 * head being followed. That is the whole condition.
 *
 * It used to want square-on, a size window, stillness and light all at
 * once, and on a real face those four flickered against each other and
 * the owner could not press Start at all. Any one of them coming back
 * here is the same bug again.
 */
export function canStart(state: ScanState): boolean {
  return state.scanner === 'ready' && state.status === 'ready';
}

/** The frames the report is built from, in the order the person took them. */
export function requiredFrames(state: ScanState): ScanFrame[] {
  const out: ScanFrame[] = [];
  for (const region of REQUIRED_REGIONS) {
    const id = state.targets[region].frameId;
    const frame = id === null ? undefined : state.frames.find((f) => f.id === id);
    if (frame) out.push(frame);
  }
  return out;
}

/** Milliseconds since the scan began, or 0. */
export function elapsedMs(state: ScanState, now: number): number {
  return state.startedAt === null ? 0 : Math.max(0, now - state.startedAt);
}

/* -------------------------- the mesh on the still ---------------------- */

/*
  Three coordinate spaces meet when the wireframe is held on a still.

  The tracker reports the face in *preview points*: the live view, which
  shows the camera frame aspect-filled — scaled to cover the screen and
  cropped at the sides (or, on a wide screen, top and bottom). The still
  the shutter writes is the *whole camera frame*, uncropped. And the
  processing screen draws that still inside a *box* of its own — a card,
  a disc, a thumbnail — aspect-filled again.

  So a point walks: preview fraction → camera-frame fraction (undoing the
  preview's cover crop) → box point (applying the box's cover crop). Both
  crops are the same rule, `coverFit`, applied in opposite directions.
  Mirroring never enters it: the preview, the detector's points and the
  still are all mirrored the same way (see scanner-camera.tsx).
*/

/**
 * How `content` is drawn to cover `box`: scaled uniformly by `scale` so
 * that it fills the box in both directions, then centred, so `x`/`y` is
 * where the content's origin lands — at or beyond the box's edge on the
 * axis that overflows.
 */
export type CoverFit = { scale: number; x: number; y: number };

export function coverFit(content: Size, box: Size): CoverFit {
  if (!(content.width > 0) || !(content.height > 0) || !(box.width > 0) || !(box.height > 0)) {
    return { scale: 1, x: 0, y: 0 };
  }
  const scale = Math.max(box.width / content.width, box.height / content.height);
  return {
    scale,
    x: (box.width - content.width * scale) / 2,
    y: (box.height - content.height * scale) / 2,
  };
}

/**
 * The tracked face as the live mesh had it, frozen as fractions of the
 * preview view for the frame about to be taken. Null when the preview
 * has no size yet: a fraction of nothing is not a place. The head's
 * angles ride along when the tracker had a finite reading, so the cap
 * drawn on the still can turn as the live one did.
 */
export function snapshotMesh(face: TrackedFace, view: ViewSize): FrameMesh | null {
  if (!(view.width > 0) || !(view.height > 0)) return null;
  const contours: Contours = {};
  for (const name of CONTOUR_NAMES) {
    const points = face.contours[name];
    if (!points || points.length === 0) continue;
    contours[name] = points.map((p) => ({ x: p.x / view.width, y: p.y / view.height }));
  }
  const pose = meshPose(face);
  return {
    bounds: {
      x: (face.cx - face.width / 2) / view.width,
      y: (face.cy - face.height / 2) / view.height,
      width: face.width / view.width,
      height: face.height / view.height,
    },
    contours,
    viewAspect: view.width / view.height,
    ...(pose === null ? {} : { pose }),
  };
}

/** The tracked head's angles, or null when any of them is not a number. */
function meshPose(face: Pick<TrackedFace, 'yaw' | 'pitch' | 'roll'>): MeshPose | null {
  if (!Number.isFinite(face.yaw) || !Number.isFinite(face.pitch) || !Number.isFinite(face.roll)) {
    return null;
  }
  return { yaw: face.yaw, pitch: face.pitch, roll: face.roll };
}

/**
 * Lays a frame's mesh over its still as drawn in `box`: the still, of
 * size `still`, is assumed to be aspect-filled into the box the way
 * `contentFit="cover"` draws it. The result is in the box's own points,
 * ready for the static mesh.
 */
export function meshInBox(mesh: FrameMesh, still: Size, box: Size): MeshFace {
  // A preview of the same aspect, at unit height, stands in for the real
  // one: only its proportions matter, and the fractions already carry them.
  const view: Size = { width: mesh.viewAspect, height: 1 };
  const onView = coverFit(still, view);
  const onBox = coverFit(still, box);
  const map = (fx: number, fy: number) => {
    // Preview fraction → preview point → camera-frame pixel → box point.
    const px = (fx * view.width - onView.x) / onView.scale;
    const py = (fy * view.height - onView.y) / onView.scale;
    return { x: px * onBox.scale + onBox.x, y: py * onBox.scale + onBox.y };
  };
  // Lengths scale without the offsets.
  const stretch = onBox.scale / onView.scale;
  const centre = map(mesh.bounds.x + mesh.bounds.width / 2, mesh.bounds.y + mesh.bounds.height / 2);
  const contours: Contours = {};
  for (const name of CONTOUR_NAMES) {
    const points = mesh.contours[name];
    if (!points || points.length === 0) continue;
    contours[name] = points.map((p) => map(p.x, p.y));
  }
  return {
    cx: centre.x,
    cy: centre.y,
    width: mesh.bounds.width * view.width * stretch,
    height: mesh.bounds.height * view.height * stretch,
    contours,
    // Angles are the head's, not the box's: they pass through untouched.
    ...(mesh.pose === undefined ? {} : { pose: mesh.pose }),
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
