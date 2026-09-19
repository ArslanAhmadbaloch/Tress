/**
 * Which way round the camera frames are.
 *
 * ── What this is ──────────────────────────────────────────────────────
 * The scan reads pixels by IMAGE SIDE and reports them by PERSON SIDE
 * ("your left temple"). One bit decides how those two relate, and this
 * is it:
 *
 *   true   the frame is flipped left-for-right, the way a selfie preview
 *          usually is, so image-left is the person's OWN left.
 *   false  the frame is as another person would see them, so image-left
 *          is the person's own RIGHT.
 *
 * ── Why it is a constant and not an argument ──────────────────────────
 * Because getting it half-flipped is silent. A symmetric head looks
 * perfectly fine with both temples filed under each other's names, and
 * nothing in three languages raises an error. Every site that depends on
 * the bit reads it from here so that they cannot drift apart.
 *
 * ── The sites ─────────────────────────────────────────────────────────
 * TypeScript, all of which import this file:
 *   `measure/regions.ts`      the temples' u ranges
 *   `region-crops.ts`         which side each temple is cut from
 *   `scanner-camera.tsx`      the Android preview and stored still
 *
 * Swift, which cannot import it, so it carries the same bit by hand:
 *   `HairFaceTrackingView.swift` ▸ `mirrorPreview` — the ARKit preview's
 *   transform, the `x` of every mesh point, `captureOrientation` for the
 *   still, and the sign of `roll`.
 *
 * THE TWO ARE OPPOSITE, and `scripts/quality-gate.mjs` checks that they
 * stay opposite — see the note below. A build where that relationship
 * breaks is a build where the iPhone files temples under the wrong names
 * and says nothing about it.
 *
 * ── Why true, with the Swift flag false ───────────────────────────────
 * These two are NOT the same question, which cost a build to learn.
 *
 * `mirrorPreview` in Swift asks "do we apply a flip to ARKit's feed?".
 * This constant asks "is the picture the app ends up with flipped?".
 * They would be the same if ARKit handed over an un-flipped feed. It does
 * not: with the Swift transform OFF, the preview on a real iPhone shows
 * the person's own left on the image's LEFT.
 *
 * That was measured, not reasoned. Build 23 ships the transform off; the
 * scanner says "look left", the owner turns to his own left, and his nose
 * travels to the LEFT of the picture — and the capture fires, because the
 * engine reads yaw from the head and never from the picture. So the
 * picture is mirrored while the flip is off.
 *
 * Hence `FRAME_MIRRORED === !mirrorPreview`, which the quality gate
 * checks. Build 23 set them equal and the on-screen arrow pointed at the
 * wrong side of the head for a whole build.
 */
export const FRAME_MIRRORED = true;

/**
 * The person's own left, as an image side. `-1` is image-left.
 *
 * Read this instead of writing a sign: it is the one expression that
 * turns the bit above into geometry.
 */
export const OWN_LEFT_SIDE: 1 | -1 = FRAME_MIRRORED ? -1 : 1;

/** The person's own right, as an image side. */
export const OWN_RIGHT_SIDE: 1 | -1 = FRAME_MIRRORED ? 1 : -1;

/**
 * The temple NAMES, in image order.
 *
 * Most of the app asks for a temple by the side of the head it is on.
 * Geometry recovered from a picture — `faceFromRegions`, which reads a
 * face box back out of two stored rectangles — has to ask by the side of
 * the PICTURE instead, because that is the order the arithmetic runs in.
 * These two are that translation, so the arithmetic never has to know.
 */
export const IMAGE_LEFT_TEMPLE: 'leftTemple' | 'rightTemple' = FRAME_MIRRORED
  ? 'leftTemple'
  : 'rightTemple';

export const IMAGE_RIGHT_TEMPLE: 'leftTemple' | 'rightTemple' = FRAME_MIRRORED
  ? 'rightTemple'
  : 'leftTemple';
