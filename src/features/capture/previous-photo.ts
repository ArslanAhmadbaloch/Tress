/**
 * The photograph the guide lines a new one up against.
 *
 * The most recent shot of the same angle, from any session but the one
 * being extended — a session in progress holds the photograph that was
 * just taken, and lining a retake up against itself would be a mirror
 * rather than a guide.
 *
 * Pure on purpose: the rule is small and every branch of it is worth
 * testing, which is impossible once it is tangled in a screen.
 */

import type { Angle, Photo, PhotoSession } from '@/types/domain';

export function previousPhotoForAngle(
  /** Newest first, the order the store keeps them in. */
  sessions: readonly PhotoSession[],
  angle: Angle,
  /** The session being extended, if any. */
  excludeSessionId?: string,
): Photo | null {
  for (const session of sessions) {
    if (session.id === excludeSessionId) continue;
    const photo = session.photos.find((p) => p.angle === angle);
    if (photo) return photo;
  }
  return null;
}
