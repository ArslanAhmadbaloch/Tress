/**
 * The point order both sides agree on, and the guards that check it.
 *
 * Pure: no React, no React Native, no native module. The tests run this
 * file on a laptop.
 *
 * ── What ARKit gives, and what it does not ────────────────────────────
 * ARFaceGeometry is a MASK, not a head: 1220 vertices covering the face
 * from the upper forehead to the jaw and chin, with no skull, no crown,
 * no back of the head and no ears in it. Slot 0 of the rim ring below is
 * the top of the FOREHEAD, not the top of the head.
 *
 * That matters more here than anywhere else in this module, because the
 * scan has to photograph the crown. The crown is never in this payload.
 * What the payload gives the drawing side is a rim that is glued to the
 * face through any turn and a pose that is accurate to a degree — enough
 * to loft a head ABOVE the rim and keep it there. `head-cap.ts` does that
 * lofting, and reads a payload of this shape as an open shell rather than
 * a closed head, which is the honest reading of it.
 *
 * ── The layout ────────────────────────────────────────────────────────
 * Sending all 1220 vertices 60 times a second would be wasteful, and the
 * mesh does not want eyelids and nostrils — it wants the parts of the
 * mask that belong to the shape of the head. So the native side picks a
 * fixed subset and sends it as two flat arrays, in this order and no
 * other:
 *
 *   index 0 … 35   RIM   the edge of the face mask, one point every 10°,
 *                        index 0 at twelve o'clock (the top of the
 *                        forehead), running CLOCKWISE as the user sees
 *                        themselves in the mirrored preview, down past
 *                        the temples and round the jaw.
 *   index 36 … 71  INNER a second, concentric ring at `INNER_RADIUS` of
 *                        each rim point's distance from the centre, at
 *                        the same 36 angles and in the same order. It is
 *                        what lets the cap bulge instead of lying flat:
 *                        as the head turns, this ring slides across the
 *                        rim in perspective, and the difference between
 *                        the two rings is the only depth cue the drawing
 *                        side needs.
 *
 * Both rings are picked only from vertices that an expression does not
 * move. ARKit's blend shapes drive the lips, the cheeks, the jaw, the
 * eyelids and the brow; a ring allowed to land on those would crawl
 * across the face every time the person spoke, which is the swimming
 * this module exists to end. The native side measures which vertices
 * those are rather than guessing — see `ios/HairFaceGeometry.swift`.
 *
 * The centre of the face is not sent. It is the mean of the inner ring,
 * which is cheaper to compute than to transmit.
 *
 * Why the order is the contract and the vertex indices are not: the
 * indices that land on the rim are resolved on the device, once, from the
 * geometry itself (see `ios/HairFaceTrackingView.swift`). A hardcoded
 * table of ARKit vertex indices cannot be checked without a TrueDepth
 * camera in hand, and a wrong table is a mesh that sits on the nose. The
 * angular order below can be checked, and is.
 */

import type { FaceFrame, FaceLost } from './types';

/** Points in each ring. */
export const RING_POINTS = 36;

/** Degrees between neighbouring points in a ring. */
export const RING_STEP_DEG = 360 / RING_POINTS;

/** First index of the rim ring — the edge of the face mask. */
export const RIM_START = 0;

/** First index of the inner ring. */
export const BROW_START = RING_POINTS;

/**
 * Whether the payload ever contains the top or back of the head. It does
 * not, and no version of ARFaceGeometry will: the cap above the rim is
 * lofted by the drawing side, never measured here.
 */
export const COVERS_CROWN = false;

/**
 * How long the native side repeats the last tracked pose once ARKit stops
 * seeing the face, in milliseconds. Mirrors `coastGrace` in
 * `ios/HairFaceTrackingView.swift` — change both together.
 */
export const COAST_MS = 1500;

/** Points in a complete frame. */
export const POINT_COUNT = RING_POINTS * 2;

/** Numbers in `points` for a complete frame: x and y per point. */
export const POINT_VALUES = POINT_COUNT * 2;

/**
 * Where the inner ring sits, as a share of the rim's distance from the
 * centre. Far enough in to read as depth, near enough out that the ring
 * stays on the brow, the temples and the outer cheek rather than dropping
 * into the middle of the face.
 */
export const INNER_RADIUS = 0.58;

/** The angle, in degrees clockwise from twelve o'clock, of ring slot `slot`. */
export function ringAngle(slot: number): number {
  return (((slot % RING_POINTS) + RING_POINTS) % RING_POINTS) * RING_STEP_DEG;
}

/** The x, y pair for point `index`, or null when the frame does not carry it. */
export function pointAt(frame: Pick<FaceFrame, 'points'>, index: number): { x: number; y: number } | null {
  const at = index * 2;
  if (!Number.isInteger(index) || index < 0 || at + 1 >= frame.points.length) return null;
  const x = frame.points[at];
  const y = frame.points[at + 1];
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  return { x, y };
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(finite);
}

/** True for the event the native side sends when the anchor disappears. */
export function isFaceLost(event: unknown): event is FaceLost {
  return typeof event === 'object' && event !== null && (event as { lost?: unknown }).lost === true;
}

/**
 * True for a frame that can be drawn.
 *
 * Every scalar has to be a real number and the two arrays have to agree:
 * two coordinates for every facing value. The point count itself is left
 * open on purpose — a frame that arrives without geometry is still a
 * usable pose, and `hasFullMesh` is the question the drawing side asks.
 */
export function isFaceFrame(event: unknown): event is FaceFrame {
  if (typeof event !== 'object' || event === null) return false;
  if (isFaceLost(event)) return false;
  const frame = event as Partial<FaceFrame>;
  const scalars: unknown[] = [
    frame.cx,
    frame.cy,
    frame.width,
    frame.height,
    frame.yaw,
    frame.pitch,
    frame.roll,
    frame.at,
  ];
  if (!scalars.every(finite)) return false;
  if (frame.tracking !== undefined && typeof frame.tracking !== 'boolean') return false;
  if (!finiteList(frame.points) || !finiteList(frame.facing)) return false;
  return frame.points.length === frame.facing.length * 2;
}

/**
 * Whether this frame was read from the camera rather than held over.
 *
 * A held frame is a real pose that has stopped being refreshed — the head
 * lowered past the point where ARKit can see a face, most often during the
 * crown stage. It is worth drawing and worth stepping the ring with; it is
 * not worth treating as evidence that the person moved. A frame with no
 * flag at all counts as tracked, so an older native side reads as it did.
 */
export function isTracking(frame: Pick<FaceFrame, 'tracking'>): boolean {
  return frame.tracking !== false;
}

/** True when the frame carries both complete rings. */
export function hasFullMesh(frame: Pick<FaceFrame, 'points' | 'facing'>): boolean {
  return frame.facing.length === POINT_COUNT && frame.points.length === POINT_VALUES;
}

/**
 * Whether ARKit face tracking can be used here.
 *
 * Split out from the module that reaches for the native side so it can be
 * tested: the answer is iOS, plus a native module that is actually in the
 * binary, plus that module saying the hardware supports it. Anything the
 * native side throws counts as a no.
 */
export function resolveAvailability(input: {
  os: string;
  nativeModule: { isAvailable?: () => boolean } | null | undefined;
}): boolean {
  if (input.os !== 'ios') return false;
  const native = input.nativeModule;
  if (!native || typeof native.isAvailable !== 'function') return false;
  try {
    return native.isAvailable() === true;
  } catch {
    return false;
  }
}
