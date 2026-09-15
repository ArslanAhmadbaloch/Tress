/**
 * Runs the quality maths over a real photograph, on the device.
 *
 * The photograph is shrunk to a thumbnail before anything looks at it.
 * Every measurement here — mean luminance, contrast, Laplacian response,
 * a 16-bucket histogram — survives that reduction intact, and decoding a
 * 12-megapixel JPEG in JavaScript to compute an average would take the
 * best part of a second per angle and allocate tens of megabytes.
 *
 * Nothing leaves the device. The file is read from local storage, decoded
 * in process, reduced to about four thousand numbers, and thrown away.
 * That is the whole point of doing it this way rather than posting the
 * image to a vision API: the privacy line in the store listing, on the
 * website and in the Play data-safety declaration stays true.
 */

import * as FileSystem from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';

import {
  assessQuality,
  compareShots,
  toGrey,
  type Comparability,
  type GreyImage,
  type Quality,
} from './image-quality';

/**
 * Analysis width. Small enough to decode in a few milliseconds, large
 * enough that the Laplacian still has something to bite on — below about
 * 48px every photograph starts to read as soft.
 */
const SIZE = 64;

function base64ToBytes(base64: string): Uint8Array {
  // `atob` exists in Hermes; Buffer does not without a polyfill.
  const binary = globalThis.atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Decodes one photo to a small grey grid, or null if it cannot be read. */
export async function loadGrey(uri: string): Promise<GreyImage | null> {
  try {
    const context = ImageManipulator.manipulate(uri).resize({ width: SIZE });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });

    const base64 = await FileSystem.readAsStringAsync(saved.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const raw = decode(base64ToBytes(base64), { useTArray: true });

    // The working file is ours, not the user's photograph. Leaving these
    // behind would quietly fill their device one scan at a time.
    FileSystem.deleteAsync(saved.uri, { idempotent: true }).catch(() => undefined);

    return toGrey(raw.data as unknown as Uint8Array, raw.width, raw.height);
  } catch {
    // An unreadable file is a photograph we say nothing about, rather
    // than a crash or an invented score.
    return null;
  }
}

export type PhotoAnalysis = {
  quality: Quality;
  /** Present only when there is a previous shot of the same angle. */
  comparability: Comparability | null;
};

export async function analysePhoto(
  uri: string,
  previousUri?: string,
): Promise<PhotoAnalysis | null> {
  const now = await loadGrey(uri);
  if (!now) return null;

  const before = previousUri ? await loadGrey(previousUri) : null;
  return {
    quality: assessQuality(now),
    comparability: before ? compareShots(now, before) : null,
  };
}
