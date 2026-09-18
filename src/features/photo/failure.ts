/**
 * Why a plain photograph did not land.
 *
 * ── Why this is a type and not a string ───────────────────────────────
 * The screen has to tell somebody which of three quite different things
 * went wrong: the camera never gave up a frame, the frame was never
 * written, or there is no journey to write it into. The first draft of
 * this screen decided that by comparing `error.message` to `'capture'`,
 * which is only ever correct for errors this code threw itself. A
 * rejection from `takePictureAsync` — the camera not ready, the OS
 * pulling the sensor away mid-session, the simulator's stand-in without
 * its frame loaded ("Sample frame not loaded") — carries some other
 * message entirely, so the screen fell through to "That photo could not
 * be saved" and told a person their photograph had failed to save when
 * no photograph had ever been taken. A wrong sentence in a failure state
 * is worse than a vague one: it sends them to look in the wrong place.
 *
 * So the kind travels on the error itself, and anything untagged is
 * treated as what it almost always is — a failure of the file work.
 */

/** The three things that can go wrong, each with its own sentence. */
export type PhotoFailureKind = 'capture' | 'save' | 'noJourney';

const KINDS: readonly string[] = ['capture', 'save', 'noJourney'];

/** An error that knows which of the three it is. */
export class PhotoFailure extends Error {
  readonly kind: PhotoFailureKind;

  constructor(kind: PhotoFailureKind) {
    super(kind);
    this.name = 'PhotoFailure';
    this.kind = kind;
  }
}

/**
 * Whether something thrown carries a kind.
 *
 * Reads the field rather than asking `instanceof`: a subclass of a
 * built-in survives every engine this app runs on, but an identity check
 * across a module boundary is the kind of thing a bundler can quietly
 * break, and the field cannot be broken by anything.
 */
export function isPhotoFailure(error: unknown): error is PhotoFailure {
  const kind = (error as { kind?: unknown } | null | undefined)?.kind;
  return typeof kind === 'string' && KINDS.includes(kind);
}

/**
 * The kind to report for anything thrown on the way to a saved picture.
 *
 * Untagged means it came out of the file work or the store — `save` is
 * the honest reading of those — because every camera path tags its own
 * failure at the point it knows it was the camera that failed.
 */
export function photoFailureKind(error: unknown): PhotoFailureKind {
  return isPhotoFailure(error) ? error.kind : 'save';
}

/**
 * Anything a camera threw, as a capture failure.
 *
 * Wrapped at the boundary rather than at the top, so the distinction is
 * drawn by the code that knows what it was doing when it failed.
 */
export function asCaptureFailure(error: unknown): PhotoFailure {
  return isPhotoFailure(error) ? error : new PhotoFailure('capture');
}
