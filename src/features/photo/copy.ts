/**
 * Every word the Plus chooser and the plain camera say.
 *
 * It sits apart from the two screens for the same reason the scanner's
 * copy does: the honesty sweep reads the whole vocabulary in one pass
 * through `photoCopySentences()`, and the wording is settled in one
 * place rather than scattered through JSX.
 *
 * ── What these screens are allowed to say ─────────────────────────────
 * The chooser names two doors and says what is behind each. The camera
 * says what the controls do and where the picture goes. Neither one
 * describes hair, and the plain camera in particular must never imply a
 * reading: it has no segmenter, no tracker and no analysis behind it —
 * it takes a photograph and files it. A line here that suggested
 * otherwise would be a claim the code cannot back, so there is not one.
 */

export const PHOTO_COPY = {
  chooser: {
    title: 'Add to your journey',
    /** Why there are two doors, without selling either. */
    subtitle: 'Two ways to add a picture today.',
    scan: {
      label: 'Hair Scan',
      description: 'A guided scan that reads your hairline, temples and crown',
    },
    photo: {
      label: 'Photo',
      description: 'Just take a picture and keep it with the others',
    },
    cancel: 'Not now',
    close: 'Close',
  },
  camera: {
    /**
     * The one line over the shutter. It says what this camera is — a
     * camera — and nothing about what will be done with the picture,
     * because nothing will be: it is saved, and that is the whole of it.
     */
    hint: 'Frame it however you like. It is saved with your other pictures.',
    /**
     * Which slot the shutter will file into, named before it is pressed.
     *
     * The journal captions every photograph by the slot it sits in, so
     * filing is the one thing this screen cannot leave unsaid: a picture
     * of the back of somebody's head filed under "Hairline" is the app
     * saying something the picture contradicts. The slot follows the
     * lens (`features/photo/session.ts`), the line says which slot that
     * is, and the flip control changes both. It describes where the file
     * goes and nothing about what is in it.
     */
    filedFront: 'Saved as Hairline',
    filedBack: 'Saved as Back',
    shutter: 'Take photo',
    flip: 'Switch camera',
    close: 'Close camera',
    saving: 'Saving',
  },
  permission: {
    title: 'Camera access',
    body: 'Tress uses your camera to take the picture. It is kept on this device.',
    cta: 'Allow camera',
    denied: 'Camera access is off for Tress. Turn it on in Settings to take a picture.',
    openSettings: 'Open Settings',
    close: 'Not now',
  },
  /**
   * A failure is a state the screen draws, with a sentence somebody can
   * read and a way onward — never a swallowed promise.
   */
  error: {
    capture: 'That photo could not be taken. Try again.',
    save: 'That photo could not be saved. Try again.',
    noJourney: 'There is no journey to save a picture to yet.',
    retry: 'Try again',
    dismiss: 'Close',
  },
  privacy: 'Your pictures stay on this device.',
};

/**
 * Every sentence above, flattened, for the honesty sweep.
 *
 * Mirrors `copySentences()` in the scanner's copy: strings are taken as
 * they are, arrays and objects are walked, and nothing is skipped.
 */
export function photoCopySentences(): string[] {
  const out: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(PHOTO_COPY);
  return out;
}
