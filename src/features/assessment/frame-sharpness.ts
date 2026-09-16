/**
 * How sharp a photograph is, measured at a size where the answer means
 * something.
 *
 * The analysis the report runs shrinks every photograph to 64 pixels on
 * its long edge before it measures anything (`analyse-photo.ts`), and
 * `image-quality.ts` calls a frame soft when the mean absolute Laplacian
 * of that small grid falls under 6. Its own header calls those thresholds
 * advice rather than a gate, and generous on purpose: they are there to
 * catch a frame nobody could use at all.
 *
 * A head turning during the exposure is not that frame, and the reason it
 * slips through is worth stating precisely, because it is easy to state
 * wrongly. It is **not** that the downsample hides the smear. The number
 * a mean Laplacian returns depends on the width it was taken at as much
 * as on the blur, and it does not move in a predictable direction when
 * the width changes — in the fixture in `frame-sharpness.test.ts` the
 * smear measures *higher* at 64 pixels than a sharp frame does at 512.
 * What lets it through is that nothing at 64 pixels is calibrated to
 * notice a smear: a threshold of 6 sits far below where either frame
 * lands, so both are waved past.
 *
 * That is acceptable for a note attached to a photograph after the fact.
 * It is not enough for a sweep, which photographs a turning head and gets
 * one pass at each angle. So the sweep re-measures at its own width and
 * compares against a threshold calibrated for that width, and re-opens
 * the angle when the number comes back low.
 *
 * **The two numbers are not comparable, in either direction.** `SOFT = 6`
 * in `image-quality.ts` and `SWEEP_SOFT` share the word Laplacian and
 * nothing else. Neither threshold may be carried across to the other
 * size, and neither tells you anything about the other's measurement.
 *
 * What this measures is the photograph: whether its edges are crisp. It
 * says nothing about the head in it. A soft photograph is a soft
 * photograph, and the only thing the app does with that is offer to take
 * another one.
 *
 * Nothing leaves the device: the file is read from local storage, decoded
 * in process, reduced to a grid of luminance bytes and thrown away.
 */

import { decode } from 'jpeg-js';

import { SWEEP_SOFT } from '@/features/capture/sweep';

import { assessQuality, toGrey, type GreyImage } from './image-quality';

/**
 * The threshold, re-exported rather than redefined.
 *
 * It lives in `sweep.ts`, beside the cooldown, the shot budget and the
 * re-open pose cost, because those are the numbers that get recalibrated
 * together when the sweep is tuned on a device. Defining a second copy
 * here — which this module did until it was caught — meant `isSoft`
 * compared against one number while everything importing the sweep's
 * budget reasoned about another, and a recalibration would have moved
 * one and left the other behind with no test to notice. There is one
 * number, and this is the module that applies it.
 */
export { SWEEP_SOFT };

/**
 * The width the sweep re-measures at. Large enough that a 1440-pixel
 * photograph is reduced under 3×, so per-pixel motion blur survives the
 * resize; small enough that decoding it in JavaScript costs tens of
 * milliseconds rather than a second.
 */
export const SHARPNESS_WIDTH = 512;

/** The smallest grid a 4-neighbour Laplacian can be taken over. */
const MIN_WIDTH = 3;

/**
 * Mean absolute Laplacian of a grey grid.
 *
 * This delegates to `assessQuality` rather than repeating the kernel, so
 * there is exactly one definition of sharpness in the app and it is the
 * one `image-quality.test.ts` already pins. The rest of the assessment —
 * brightness, contrast, clipping — is computed and discarded here; four
 * passes over a third of a megapixel is a rounding error beside the JPEG
 * decode that produced the grid.
 */
export function sharpnessOf(image: GreyImage): number {
  return assessQuality(image).sharpness;
}

/**
 * Whether a measurement is soft enough to be worth another shot.
 *
 * The measurement must have been taken at `SHARPNESS_WIDTH`. A number
 * from any other width is not a number this function can read, for the
 * reason in the header.
 *
 * An absent or unusable measurement is **not** soft. Failing to measure a
 * photograph is not evidence against it, and a frame thrown away on a
 * number that was never taken is an angle lost for nothing.
 */
export function isSoft(sharpness: number | null): boolean {
  if (sharpness === null || !Number.isFinite(sharpness)) return false;
  return sharpness < SWEEP_SOFT;
}

/**
 * Decodes one photograph to a grey grid of the given width, or null if it
 * cannot be read at all.
 *
 * The image manipulator and the filesystem are loaded when they are first
 * needed rather than when this module is imported. That buys one thing
 * and one thing only: the maths above stays importable by a test that has
 * no native modules at all, which is how every threshold here is checked.
 * It is not a claim about degradation — `analyse-photo.ts` imports both
 * modules statically at the top of the report path, so a build missing
 * either has lost far more than this re-check.
 */
export async function greyAt(uri: string, width: number): Promise<GreyImage | null> {
  if (!uri || !Number.isFinite(width) || width < MIN_WIDTH) return null;

  try {
    const [{ ImageManipulator, SaveFormat }, { File }] = await Promise.all([
      import('expo-image-manipulator'),
      import('expo-file-system'),
    ]);

    const context = ImageManipulator.manipulate(uri).resize({ width: Math.round(width) });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });

    // `bytes()` rather than a base64 read and an `atob` round trip: the
    // decoder wants a `Uint8Array`, and going through a string costs a
    // third more memory than the file for no gain. The legacy
    // `readAsStringAsync` is not an option — expo-file-system 57 still
    // exports the name from its main entry but the export throws when
    // called, which is a failure that would have been swallowed by the
    // catch below and left this whole check silently returning null.
    const working = new File(saved.uri);
    const raw = decode(await working.bytes(), { useTArray: true });

    // The working file is ours, not the person's photograph. Leaving one
    // behind per shot would quietly fill their device a sweep at a time.
    try {
      working.delete();
    } catch {
      // A file that is already gone is the outcome we wanted anyway.
    }

    return toGrey(raw.data as unknown as Uint8Array, raw.width, raw.height);
  } catch {
    // An unreadable file, or a build without the manipulator, is a
    // photograph we say nothing about — never a crash, and never an
    // invented number.
    return null;
  }
}

/**
 * Sharpness of the photograph at `uri`, measured at `width` pixels, or
 * null when it could not be measured.
 *
 * Paid during the cooldown after a shot, while the person is already
 * turning towards the next angle, so the cost lands in time that is
 * otherwise spent waiting.
 */
export async function sharpnessAt(
  uri: string,
  width: number = SHARPNESS_WIDTH,
): Promise<number | null> {
  const grey = await greyAt(uri, width);
  return grey === null ? null : sharpnessOf(grey);
}
