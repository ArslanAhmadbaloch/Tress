/**
 * What the files in the photo directory are called.
 *
 * Kept apart from photo-storage so the rules can be tested without pulling
 * in the filesystem and image-manipulator native modules. That is not a
 * technicality: the one rule in here decides whether a file gets deleted,
 * and a session frame is the single thing in that directory the user
 * cannot retake.
 */

/** Prefix on every card portrait we write, so ours are identifiable. */
export const PROFILE_PREFIX = 'profile_';

/** The name portraits used before they carried a timestamp. */
const LEGACY_PROFILE_NAME = 'profile.jpg';

/** A fresh, unique name for a card portrait. */
export function profilePhotoName(now = Date.now()): string {
  return `${PROFILE_PREFIX}${now}.jpg`;
}

/**
 * True for a card portrait this app wrote, false for everything else.
 *
 * A whitelist on purpose. This guards a delete, so the failure that matters
 * is answering true for something that is not ours — anything unrecognised
 * is left on disk, which costs a few kilobytes at worst.
 */
export function isProfilePhoto(uri: string): boolean {
  const name = uri.split('/').pop();
  if (!name) return false;
  return name === LEGACY_PROFILE_NAME || name.startsWith(PROFILE_PREFIX);
}
