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
 * The ring. Twenty-four sectors run clockwise from the top. A sector is
 * a direction the head has been seen from: turning right walks the head
 * towards three o'clock, chin down towards six, turning left towards
 * nine. A sector fills by how far the head went that way, and the fill
 * only ever rises — a head that whips through leaves partial arcs, a
 * second pass tops them up, and nothing fills on a timer. The scan is
 * sufficient once the front, the two sides and some of the chin-down
 * band have been seen; after forty-five seconds it finishes with what it
 * has, so nobody is trapped.
 *
 * Frames. At most twelve are kept, one per bin (the front plus twelve
 * slices of the ring). A request is only raised when the head is steady,
 * lit and in a bin that still wants a frame, never more than one every
 * 700 ms, and a bin's frame is replaced when a better one lands. Every
 * image the engine lets go of — outscored, replaced, evicted, answered
 * late, or abandoned by a cancel — is named in a `discard` event, so the
 * screen can delete the file. The frames stop being the engine's at the
 * report, when they belong to the journal.
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
  GuidanceCue,
  MeshFace,
  RegionScores,
  ScanAction,
  ScanEvent,
  ScanFrame,
  ScanMilestone,
  ScanRegion,
  ScanState,
  ScanStep,
  ScannerState,
  Size,
} from './types';

/* ------------------------------ tuning ------------------------------- */

export const RING_SECTORS = 24;
export const SECTOR_DEG = 360 / RING_SECTORS;

/** The front plus twelve slices of the ring. Bin 0 is the front. */
export const RING_BINS = 12;
export const MAX_FRAMES = 12;

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

/** Framing, as fractions of the guidance frame. */
export const CENTRE_TOLERANCE = 0.13;
/** During the turn the box drifts with the head, so the ring is more forgiving. */
export const CENTRE_TOLERANCE_SCANNING = 0.2;
export const SIZE_MIN = 0.3;
export const SIZE_MAX = 0.68;
export const SIZE_IDEAL = 0.46;

/** Front lock: within this of square on, framed, and steady. */
export const FRONT_LOCK_DEG = 8;

export const STABLE_MIN = 0.55;
/** Lighting below this is too dark to fill or capture. Null lighting never gates. */
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
export const FORCED_FINISH_MS = 45_000;
/** How long completion waits for in-flight frames before going on without them. */
export const SETTLE_MS = 1500;

/* ------------------------------ state -------------------------------- */

export function createScanState(): ScanState {
  return {
    scanner: 'instructions',
    status: 'initializing',
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

export function isSufficient(regions: RegionScores): boolean {
  return (
    regions.front >= REGION_NEEDED.front &&
    regions.right >= REGION_NEEDED.right &&
    regions.left >= REGION_NEEDED.left &&
    regions.chin >= REGION_NEEDED.chin
  );
}

/* ----------------------------- framing ------------------------------- */

export type Framing = {
  readable: boolean;
  centred: boolean;
  size: 'ok' | 'far' | 'near';
  /** Readable, centred and the right size. */
  framed: boolean;
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

export function framingOf(face: FaceReading, scanning: boolean): Framing {
  if (!readable(face)) return { readable: false, centred: false, size: 'ok', framed: false };
  const cx = face.bounds.x + face.bounds.width / 2;
  const cy = face.bounds.y + face.bounds.height / 2;
  const tolerance = scanning ? CENTRE_TOLERANCE_SCANNING : CENTRE_TOLERANCE;
  const centred = Math.abs(cx - 0.5) <= tolerance && Math.abs(cy - 0.5) <= tolerance;
  const size = face.size < SIZE_MIN ? 'far' : face.size > SIZE_MAX ? 'near' : 'ok';
  return { readable: true, centred, size, framed: centred && size === 'ok' };
}

export function litEnough(lighting: number | null): boolean {
  return lighting === null || !Number.isFinite(lighting) || lighting >= LIGHT_MIN;
}

/** Within `FRONT_LOCK_DEG` of square on, in both yaw and pitch. */
export function squareOn(face: Pick<FaceReading, 'yaw' | 'pitch'>): boolean {
  return Math.abs(face.yaw) <= FRONT_LOCK_DEG && Math.abs(face.pitch) <= FRONT_LOCK_DEG;
}

/** The region a ring bin's frame counts towards, for `poseFit`; `up` counts towards none. */
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

/** How much of a frame's quality survives at a bin's inner edge; the rest is earned by the turn. */
export const POSE_FLOOR = 0.4;

/** 0–1: how good a frame taken right now would be — steady, lit, sized and turned into its bin. */
export function frameQuality(face: FaceReading, lighting: number | null): number {
  const light = lighting === null || !Number.isFinite(lighting) ? LIGHT_UNKNOWN : clamp01(lighting);
  const halfRange = Math.max(SIZE_IDEAL - SIZE_MIN, SIZE_MAX - SIZE_IDEAL);
  const size = clamp01(1 - Math.abs(face.size - SIZE_IDEAL) / halfRange);
  const base = clamp01(0.45 * clamp01(face.stability) + 0.3 * light + 0.25 * size);
  const pose = POSE_FLOOR + (1 - POSE_FLOOR) * poseFit(headDirection(face));
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
      // The front lock earned on the ready screen carries over: the ring
      // starts with the front seen, and `faceLocked` is not fired twice.
      const fresh = resetScan(state);
      const regions = regionScores(fresh.sectors, state.frontLocked);
      return move(
        {
          ...fresh,
          status: 'capturing',
          cue: 'moveSlowly',
          frontLocked: state.frontLocked,
          milestones: state.milestones.slice(),
          regions,
          completion: completionOf(regions),
          startedAt: action.at,
          lastGainAt: action.at,
        },
        'scanning',
        [{ type: 'cue', cue: 'moveSlowly' }],
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

function tickReady(state: ScanState, action: Extract<ScanAction, { type: 'tick' }>): ScanStep {
  const { at, face, lighting } = action;
  let status: ScanState['status'] = 'detecting';
  let cue: GuidanceCue = 'centreFace';
  let frontLocked = state.frontLocked;
  const milestones = state.milestones.slice();
  const events: ScanEvent[] = [];

  if (face !== null) {
    const framing = framingOf(face, false);
    if (!framing.framed) {
      cue = framing.size === 'far' ? 'closer' : framing.size === 'near' ? 'back' : 'centreFace';
    } else if (!litEnough(lighting)) {
      cue = 'brighter';
    } else if (face.stability < STABLE_MIN) {
      cue = 'holdStill';
    } else if (!squareOn(face)) {
      // Framed, lit and steady, but turned: the scan must begin face-on,
      // so the head is asked back to the centre and Start stays off.
      cue = 'centreFace';
    } else {
      cue = 'perfect';
      status = 'ready';
      if (!frontLocked) {
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

  const framing = face === null ? null : framingOf(face, true);
  const lit = litEnough(lighting);

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

  /* Fill. */
  const usable = face !== null && framing !== null && framing.framed && lit && !tooFast;
  if (face !== null && framing?.readable) {
    next = { ...next, lastFaceAt: at, lastReading: { yaw: face.yaw, pitch: face.pitch, at } };
  }
  let direction: HeadDirection | null = null;
  if (usable && face !== null) {
    direction = headDirection(face);
    const gained = fillFor(direction);
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
      const regions = regionScores(sectors, frontLocked);
      const completion = Math.max(next.completion, completionOf(regions));
      const before = next.regions;
      next = { ...next, sectors, frontLocked, regions, completion };
      // A stall clears only when the ring actually gains. Sectors can grow
      // without that — a region already at its need, or the sectors above
      // the head that no region asks for — and a stall cleared on those
      // would re-arm and be said again on the very next tick.
      if (completion > state.completion + 1e-6) next = { ...next, lastGainAt: at, stalled: false };
      if (before.right < REGION_NEEDED.right && regions.right >= REGION_NEEDED.right) {
        pushMilestone(next, events, 'rightDone');
      }
      if (before.left < REGION_NEEDED.left && regions.left >= REGION_NEEDED.left) {
        pushMilestone(next, events, 'leftDone');
      }
      if (before.chin < REGION_NEEDED.chin && regions.chin >= REGION_NEEDED.chin) {
        pushMilestone(next, events, 'chinDone');
      }
      for (const [mark, name] of [
        [0.25, 'quarter'],
        [0.5, 'half'],
        [0.75, 'threeQuarters'],
      ] as const) {
        if (state.completion < mark && completion >= mark) pushMilestone(next, events, name);
      }
    }
  }

  /* Capture. */
  let holdWanted = false;
  if (usable && face !== null && direction !== null) {
    const bin = binOf(direction);
    const quality = frameQuality(face, lighting);
    const wants = binWants(next, bin, quality);
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
        region: regionOfBin(bin),
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
  const framedNow = framing?.framed ?? false;
  if (framedNow && !next.stalled && next.lastGainAt !== null && at - next.lastGainAt >= STALL_MS) {
    next = { ...next, stalled: true };
    events.push({ type: 'stall' });
  }

  /* Cue. */
  const cue = scanningCue(next, face, framing, lit, holdWanted, at);
  if (cue !== next.cue) {
    next = { ...next, cue };
    events.push({ type: 'cue', cue });
  }

  /* Completion. */
  const elapsed = next.startedAt === null ? 0 : at - next.startedAt;
  if (isSufficient(next.regions) || elapsed >= FORCED_FINISH_MS) {
    const reason = isSufficient(next.regions) ? 'coverage' : 'timeout';
    next = { ...next, status: 'completing', completedAt: at, completeReason: reason, hold: null };
    events.push({ type: 'scanComplete', reason });
    const settled = settle(next, at);
    return { state: settled.state, events: [...events, ...settled.events] };
  }

  return { state: next, events };
}

function pushMilestone(state: ScanState, events: ScanEvent[], milestone: ScanMilestone): void {
  if (state.milestones.includes(milestone)) return;
  state.milestones.push(milestone);
  events.push({ type: 'milestone', milestone });
}

function scanningCue(
  state: ScanState,
  face: FaceReading | null,
  framing: Framing | null,
  lit: boolean,
  holdWanted: boolean,
  at: number,
): GuidanceCue | null {
  if (state.lost) return 'backInFrame';
  if (face === null || framing === null) return state.cue;
  if (!framing.readable || !framing.centred) return 'centreFace';
  if (framing.size === 'far') return 'closer';
  if (framing.size === 'near') return 'back';
  if (!lit) return 'brighter';
  if (state.slowDownUntil > at) return 'slowDown';
  if (holdWanted && state.hold !== null && at - state.hold.since >= HOLD_HINT_MS) return 'holdStill';
  if (state.keepGoingUntil > at) return 'keepGoing';
  return 'moveSlowly';
}

/* ----------------------------- curation ------------------------------ */

/** Whether a frame of this quality would be worth taking for this bin. */
export function binWants(state: ScanState, bin: number, quality: number): boolean {
  if (state.pending.some((p) => p.bin === bin)) return false;
  const existing = state.frames.find((f) => f.bin === bin);
  if (!existing) return true;
  if (existing.quality >= GOOD_QUALITY) return false;
  return quality >= existing.quality + REPLACE_MARGIN;
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
  const existing = state.frames.find((f) => f.bin === frame.bin);
  let frames: ScanFrame[];
  if (existing) {
    if (existing.quality >= frame.quality) {
      discard([frame], 'outscored');
      const settled = settle({ ...state, pending }, at);
      return { state: settled.state, events: [...events, ...settled.events] };
    }
    frames = state.frames.map((f) => (f.bin === frame.bin ? frame : f));
    discard([existing], 'replaced');
  } else {
    frames = [...state.frames, frame];
  }
  const trimmed = evict(frames);
  const evicted = frames.filter((f) => !trimmed.includes(f));
  frames = trimmed;
  const kept = frames.some((f) => f.id === frame.id);
  let next: ScanState = { ...state, pending, frames, milestones: state.milestones.slice() };
  if (kept) {
    events.push({ type: 'frame', frame, replaced: existing !== undefined });
    pushMilestone(next, events, 'firstFrame');
  }
  discard(evicted, 'evicted');
  const settled = settle(next, at);
  next = settled.state;
  return { state: next, events: [...events, ...settled.events] };
}

/** Never more than MAX_FRAMES: the weakest ring frame goes, the front stays. */
export function evict(frames: ScanFrame[]): ScanFrame[] {
  if (frames.length <= MAX_FRAMES) return frames;
  let victim = -1;
  for (let i = 0; i < frames.length; i += 1) {
    const f = frames[i];
    if (f === undefined || f.bin === 0) continue;
    if (victim === -1 || f.quality < (frames[victim]?.quality ?? Infinity)) victim = i;
  }
  if (victim === -1) return frames.slice(0, MAX_FRAMES);
  return frames.filter((_, i) => i !== victim);
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

const BIN_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** The kept frames, front first, then clockwise round the ring. */
export function orderedFrames(state: ScanState): ScanFrame[] {
  return state.frames.slice().sort((a, b) => BIN_ORDER.indexOf(a.bin) - BIN_ORDER.indexOf(b.bin));
}

/** The frame to show large: the front if there is one, else the best. */
export function primaryFrame(state: ScanState): ScanFrame | null {
  const front = state.frames.find((f) => f.bin === 0);
  if (front) return front;
  let best: ScanFrame | null = null;
  for (const f of state.frames) if (best === null || f.quality > best.quality) best = f;
  return best;
}

/** Whether the Start button should be live: on the ready screen, framed, lit, steady and square on. */
export function canStart(state: ScanState): boolean {
  return state.scanner === 'ready' && state.status === 'ready';
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
 * has no size yet: a fraction of nothing is not a place.
 */
export function snapshotMesh(face: TrackedFace, view: ViewSize): FrameMesh | null {
  if (!(view.width > 0) || !(view.height > 0)) return null;
  const contours: Contours = {};
  for (const name of CONTOUR_NAMES) {
    const points = face.contours[name];
    if (!points || points.length === 0) continue;
    contours[name] = points.map((p) => ({ x: p.x / view.width, y: p.y / view.height }));
  }
  return {
    bounds: {
      x: (face.cx - face.width / 2) / view.width,
      y: (face.cy - face.height / 2) / view.height,
      width: face.width / view.width,
      height: face.height / view.height,
    },
    contours,
    viewAspect: view.width / view.height,
  };
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
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
