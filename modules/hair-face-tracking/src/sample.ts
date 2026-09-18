/**
 * The frame sample, and the one rule about reading it.
 *
 * `sampleFrame` on the native side renders a small square out of the AR
 * frame that is on screen and hands back its raw RGBA bytes with the size
 * of the picture they were squashed out of. Everything about that
 * handover that can be checked without a camera is checked here, in a
 * file with no React, no React Native and no native module in it, so a
 * Node test can hold it.
 *
 * ── Why this is not just a cast ───────────────────────────────────────
 * Two reasons, and neither is tidiness.
 *
 * The first is the bridge. Expo converts a Swift `Data` into a
 * `Uint8Array`, which is what this expects — but a build whose runtime
 * hands back an `ArrayBuffer`, or a plain array, would otherwise reach
 * the reader as something with no `length` where one was assumed, and the
 * square would be read as noise rather than refused. So the shape is
 * asked rather than assumed, and anything unreadable comes back null.
 *
 * The second is the arithmetic. A square of `size` RGBA pixels is exactly
 * `size * size * 4` bytes; a buffer that is any other length is not the
 * picture it says it is, whatever produced it. Reading it anyway would
 * put a silhouette somewhere the head is not, with nothing on screen to
 * say so — and a wireframe sitting beside somebody's head is the single
 * complaint this whole road exists to answer.
 *
 * Nothing here is a measurement. The bytes are a picture, read to decide
 * where to draw a wireframe; no number this file produces is shown,
 * stored or compared with anything.
 */

/** One square of the live frame, with the picture it came from. */
export type FrameSample = {
  /** RGBA, row-major, `size` rows of `size` pixels. */
  data: Uint8Array;
  /** The square's side, in pixels. */
  size: number;
  /**
   * The width of the picture the square was squashed out of, in its own
   * pixels — turned and mirrored to match what the person is looking at.
   *
   * It travels with the bytes rather than being assumed because the
   * squash is a scale on each axis: without the original shape there is
   * no way back from a point in the square to a point on the screen, and
   * a guess at it is a silhouette drawn a few centimetres off the head.
   */
  sourceWidth: number;
  /** The same for its height. */
  sourceHeight: number;
};

/**
 * The square asked for by default.
 *
 * 256 is a compromise and worth naming as one. The segmenter's own input
 * is larger, so this is resampled up before the model sees it and some
 * detail is lost on the way — but the bytes crossing the bridge are a
 * quarter of what the model's own side would cost, three or four times a
 * second, for the whole length of a scan. The cap is a wireframe being
 * sat on a head of hair, not a measurement: a little softness in the
 * outline moves it by less than a line's width.
 */
export const SAMPLE_SIZE = 256;

/** The smallest and largest square the native side will render. */
export const SAMPLE_MIN = 64;
export const SAMPLE_MAX = 512;

/** Bytes per pixel in what comes back: R, G, B, A. */
export const SAMPLE_CHANNELS = 4;

/**
 * The side actually asked for, held inside what the native side accepts.
 *
 * Clamped on both sides rather than trusted: the same limits are written
 * in the Swift, and a caller asking for a thousand would otherwise
 * silently get 512 back and read it as a thousand.
 */
export function clampSampleSize(size: number): number {
  if (!Number.isFinite(size)) return SAMPLE_SIZE;
  return Math.min(SAMPLE_MAX, Math.max(SAMPLE_MIN, Math.round(size)));
}

/** A whole number above zero, and nothing else. */
function count(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const whole = Math.round(value);
  return whole > 0 ? whole : null;
}

/**
 * The bytes, whatever container they arrived in.
 *
 * `Uint8Array` is what the bridge produces today. The other two are not
 * speculation about a future: a runtime that hands back the raw
 * `ArrayBuffer`, and a test or a fallback that hands back a plain array,
 * are both readable without copying anything that does not need copying.
 */
function bytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value) && value.every((n) => typeof n === 'number')) {
    return Uint8Array.from(value);
  }
  return null;
}

/**
 * What the native side sent, or null when it is not a square of pixels.
 *
 * Null is a refusal and callers must treat it as one: the cap holds the
 * shape it is already wearing rather than collapsing onto the skull. It
 * is never an assertion that there is no hair.
 */
export function normaliseSample(raw: unknown): FrameSample | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const size = count(record.size);
  const sourceWidth = count(record.sourceWidth);
  const sourceHeight = count(record.sourceHeight);
  if (size === null || sourceWidth === null || sourceHeight === null) return null;
  if (size < SAMPLE_MIN || size > SAMPLE_MAX) return null;

  const data = bytes(record.data);
  if (data === null) return null;
  if (data.length !== size * size * SAMPLE_CHANNELS) return null;

  return { data, size, sourceWidth, sourceHeight };
}
