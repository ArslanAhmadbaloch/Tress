/**
 * Photo persistence.
 *
 * The camera writes to the cache directory, which the OS may clear at
 * any time, so every kept photo is re-encoded and moved into the app's
 * document directory. Two files are produced per shot:
 *
 *   - a display-resolution image, capped so a year of sessions doesn't
 *     fill the device;
 *   - a small thumbnail, which is all any list or grid ever loads.
 *
 * Keeping the pair explicit is what lets the timeline scroll smoothly:
 * nothing outside the photo viewer touches a full-size file.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Angle } from '@/types/domain';

/** Long edge of the stored image. Plenty for full-screen comparison. */
const FULL_MAX_WIDTH = 1440;
/** Long edge of the thumbnail used in grids and timeline rows. */
const THUMB_MAX_WIDTH = 320;

const FULL_QUALITY = 0.82;
const THUMB_QUALITY = 0.7;

const PHOTO_DIR = 'photos';

export type StoredPhoto = {
  uri: string;
  thumbnailUri: string;
  width: number;
  height: number;
};

function photosDirectory(): Directory {
  const dir = new Directory(Paths.document, PHOTO_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Re-encode `sourceUri` at `maxWidth` and move the result into permanent
 * storage under `name`. Returns the final URI plus real dimensions.
 */
async function renderInto(
  sourceUri: string,
  name: string,
  maxWidth: number,
  compress: number,
): Promise<{ uri: string; width: number; height: number }> {
  const rendered = await ImageManipulator.manipulate(sourceUri)
    .resize({ width: maxWidth })
    .renderAsync();

  const saved = await rendered.saveAsync({
    compress,
    format: SaveFormat.JPEG,
  });

  const dir = photosDirectory();
  const destination = new File(dir, name);
  // A retake can reuse a name within the same session; overwrite rather
  // than accumulate orphans.
  if (destination.exists) destination.delete();

  const temp = new File(saved.uri);
  await temp.move(destination);

  return {
    uri: destination.uri,
    width: saved.width,
    height: saved.height,
  };
}

/**
 * Persist one captured frame. Safe to call concurrently for different
 * angles — filenames are namespaced by session and angle.
 */
export async function persistCapture(
  sourceUri: string,
  sessionKey: string,
  angle: Angle,
): Promise<StoredPhoto> {
  const base = `${sessionKey}_${angle}`;

  const full = await renderInto(
    sourceUri,
    `${base}.jpg`,
    FULL_MAX_WIDTH,
    FULL_QUALITY,
  );
  const thumb = await renderInto(
    full.uri,
    `${base}_thumb.jpg`,
    THUMB_MAX_WIDTH,
    THUMB_QUALITY,
  );

  return {
    uri: full.uri,
    thumbnailUri: thumb.uri,
    width: full.width,
    height: full.height,
  };
}

/** Remove a photo and its thumbnail. Missing files are not an error. */
export function deletePhotoFiles(uris: (string | undefined)[]): void {
  for (const uri of uris) {
    if (!uri) continue;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // A file we cannot delete is not worth failing the user's action.
    }
  }
}

/** Total bytes used by stored photos, for the settings screen. */
export function photoStorageBytes(): number {
  try {
    const dir = photosDirectory();
    return dir.size ?? 0;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / 1_048_576;
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** Delete every stored photo file. Used by "delete all data". */
export function clearAllPhotos(): void {
  try {
    const dir = new Directory(Paths.document, PHOTO_DIR);
    if (dir.exists) dir.delete();
  } catch {
    // Ignore — the records are cleared regardless.
  }
}
