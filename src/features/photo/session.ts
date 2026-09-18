/**
 * How a plain photograph becomes a journal record.
 *
 * Pure, so the shape a plain camera writes can be held to without a
 * phone — `scripts/test/photo-capture.test.ts` asserts on exactly this.
 * The screen does the camera work and the file work; what a photograph
 * *is* once it lands is decided here, in one place, and it is decided
 * conservatively.
 *
 * ── One data system, not two ──────────────────────────────────────────
 * The scan's result module makes the same promise (`features/hair-scan/
 * result.ts`): a scan persists as an ordinary `PhotoSession` of ordinary
 * `Photo`s, so Journey, Timeline, Compare and the coach keep working
 * without knowing it happened. A plain photograph is the same bargain
 * from the other end — it is the ordinary thing, and it is written with
 * nothing added. `capture: 'manual'` is the only mark it carries, and
 * that field has existed since long before this screen did, so no schema
 * version is touched.
 *
 * ── What is deliberately absent ───────────────────────────────────────
 * No `quality`, no `coverage`, no `maskTrace`, no `regions`, no `pose`,
 * and no session-level `scan` block. Every one of those means "this was
 * measured", and nothing here measures anything: this camera has no
 * segmenter, no tracker and no analysis pass behind it. Absent is the
 * honest value, and every reader in the app already draws a photograph
 * that has none of them.
 */

import type { Angle, Photo } from '@/types/domain';

/** Which lens took the picture. Mirrors expo-camera's `CameraType`. */
export type PlainPhotoLens = 'front' | 'back';

/**
 * The journal slot a plain photograph is filed under, by lens.
 *
 * `Photo.angle` is not optional — the journal has known its five angles
 * since long before this screen existed, and Journey, Compare and the
 * session screen all read them, captioning each slot through
 * `ANGLE_LABELS`. A plain photograph therefore has to name a slot, and
 * whichever it names becomes a caption somebody reads later.
 *
 * The first draft filed every plain photograph under `front`, which the
 * journal captions "Hairline". That is right for the selfie lens and
 * wrong the moment somebody uses the flip control this screen ships and
 * photographs the back of their head: the journal would then caption the
 * back of their head "Hairline", and Compare would offer it as the
 * hairline side of a side-by-side. No number and no claim about hair,
 * but a caption the picture contradicts is still the app saying
 * something untrue.
 *
 * So the slot follows the lens, which is the one thing the code actually
 * knows: the selfie lens is somebody facing the camera — `front`,
 * "Hairline" — and the rear lens, on a screen whose only subject is the
 * top and back of a head somebody cannot see, is `crown`, which the
 * journal captions "Back". No sixth slot is invented; inventing one
 * would change the shape of every stored session.
 *
 * It is still an inference about framing rather than a fact about the
 * pixels, so the screen says out loud which slot the shutter will file
 * into and the flip control changes it. Nothing is decided behind
 * anyone's back.
 */
export const PLAIN_PHOTO_ANGLES: Record<PlainPhotoLens, Angle> = {
  front: 'front',
  back: 'crown',
};

/** The slot a picture from this lens is filed under. */
export function plainPhotoAngle(lens: PlainPhotoLens): Angle {
  return PLAIN_PHOTO_ANGLES[lens];
}

/** The slot the camera opens on, before anybody flips it. */
export const PLAIN_PHOTO_ANGLE: Angle = PLAIN_PHOTO_ANGLES.front;

/** A photograph already copied into permanent storage, with its thumbnail. */
export type PlainPhotoFile = {
  uri: string;
  thumbnailUri: string;
  width: number;
  height: number;
};

/**
 * The journal record for one plain photograph.
 *
 * `capturedAt` is passed in rather than read from the clock so the
 * function stays pure and the test can pin it.
 */
export function plainPhotoRecord(
  file: PlainPhotoFile,
  capturedAt: string,
  angle: Angle = PLAIN_PHOTO_ANGLE,
): Omit<Photo, 'id' | 'sessionId'> {
  return {
    angle,
    uri: file.uri,
    thumbnailUri: file.thumbnailUri,
    width: file.width,
    height: file.height,
    capturedAt,
    // The shutter was pressed by a person, with nothing guiding the
    // frame and nothing reading it afterwards.
    capture: 'manual',
  };
}

/**
 * The filename stem a plain photograph's files are written under.
 *
 * `persistCapture` namespaces by session key and angle, so this only has
 * to be unique per shot; the scan uses the same base-36 clock stamp.
 */
export function plainPhotoKey(at: number): string {
  return `p${at.toString(36)}`;
}
