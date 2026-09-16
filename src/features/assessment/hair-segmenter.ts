/**
 * Runs MediaPipe's hair segmenter on the device.
 *
 * The model is bundled, not fetched: it is 763 KB, it has to work in a
 * bathroom with no signal, and downloading it would mean the app phones
 * home the first time somebody scans — which is exactly the thing the
 * store listing, the website and the Play data-safety form all promise it
 * does not do.
 *
 * Shapes are read from the model rather than hardcoded. MediaPipe has
 * published this segmenter at more than one input size, and a constant
 * that silently disagrees with the file produces a mask full of noise
 * rather than an error — the worst kind of wrong, because it still
 * renders a confident percentage.
 */

import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';
import { loadTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';

import MODEL from '../../../assets/models/hair_segmenter.tflite';
import type { PhotoMaskTrace } from '@/types/domain';

import {
  cellsOnlyTrace,
  coverageOf,
  hairChannel,
  serialiseTrace,
  traceMask,
  type Coverage,
} from './hair-mask';

let cached: TensorflowModel | null = null;
let loading: Promise<TensorflowModel> | null = null;

/**
 * Loads the model once and keeps it.
 *
 * Reloading per scan would re-parse 763 KB and rebuild the delegate for
 * every angle — five times per session, for no benefit.
 */
export async function segmenter(): Promise<TensorflowModel> {
  if (cached) return cached;
  if (!loading) {
    /*
      CPU delegate. The GPU delegates are faster, but they fall back
      silently on devices that cannot compile the graph, and a scan that
      is occasionally wrong is worse than one that is uniformly a beat
      slower. Five 512px frames on CPU is well under a second.
    */
    loading = loadTensorflowModel(MODEL, []).then((m) => {
      cached = m;
      return m;
    });
  }
  return loading;
}

/** Input side length the loaded model expects, from its own tensor shape. */
function inputSide(model: TensorflowModel): number {
  // [batch, height, width, channels]
  const shape = model.inputs[0]?.shape ?? [];
  return shape.length >= 3 ? shape[1] : 512;
}

/**
 * Channels per pixel the loaded model expects, from its own tensor shape.
 *
 * Read rather than assumed, for the same reason the side is: swapping the
 * model file should not silently change what the interpreter is fed. This
 * one matters more than the side, because a wrong side throws and a wrong
 * channel count does not — see the note on `inputTensor`.
 */
function inputChannels(model: TensorflowModel): number {
  const shape = model.inputs[0]?.shape ?? [];
  return shape.length >= 4 ? shape[3] : 4;
}

/**
 * Decodes a photo to the model's input tensor: RGBA, 0–1, square.
 *
 * The fourth channel is not padding and not alpha. MediaPipe's hair
 * segmenter is a video model: its fourth input plane is the mask it
 * produced for the previous frame, which is how it stays steady from one
 * frame to the next. A still photograph has no previous frame, so the
 * plane is zeroed — the documented way to run it on a single image.
 *
 * It has to be there at all because the interpreter checks the byte
 * count and nothing else. An earlier version of this function wrote only
 * three channels; TfLiteTensorCopyFromBuffer then returned an error,
 * copied nothing, and react-native-fast-tflite discarded that status
 * (node_modules/react-native-fast-tflite/cpp/HybridTfliteModel.cpp:98).
 * The model ran anyway — on whatever was left in the input tensor, which
 * is zeros on the first call of a process and the PREVIOUS PHOTOGRAPH on
 * the second through fifth of a five-angle session. Nothing threw, and
 * the coverage figure that came back looked entirely reasonable. Keep
 * the length in step with the model or the readings are fiction.
 */
async function inputTensor(
  uri: string,
  side: number,
  channels: number,
): Promise<Float32Array | null> {
  try {
    /*
      ── THE ALIGNMENT INVARIANT ──────────────────────────────────────
      Both dimensions are given, so this resize is non-uniform: a tall
      photograph is squashed into a square. That is deliberate and it is
      load-bearing. Squashing is a pure axis-wise scale — no crop, no
      offset, no rotation — so a point in the mask maps back onto the
      photograph by `x / side` and `y / side` and nothing else, and the
      outline this produces lands where the hair is.

      Crop-to-square would be the obvious optimisation here, and it would
      be silent: the figures would still look reasonable, and the outline
      would sit a few centimetres off the head with nothing to say so.
      Whatever is fed in has to be the whole frame that gets stored. The
      other half of this invariant lives at the call site, where the
      measurement is taken from the shrunk capture rather than the raw
      camera frame for exactly the same reason.
    */
    const context = ImageManipulator.manipulate(uri).resize({ width: side, height: side });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });

    /*
      `File.bytes()` rather than `FileSystem.readAsStringAsync`. In
      expo-file-system 57 the package root still exports the legacy names
      and every one of them throws when called, so this read failed on
      every device, the catch below swallowed it, and the mask was
      silently absent from every photograph while the tests passed.
    */
    const working = new File(saved.uri);
    let raw;
    try {
      raw = decode(await working.bytes(), { useTArray: true });
    } finally {
      /*
        In a finally, because a decode that throws used to leave the
        temporary JPEG behind — five per session, growing for as long as
        the failure lasted, counted against the person's storage figure
        with nothing on screen to say where it came from.
      */
      try {
        working.delete();
      } catch {
        // A file that is already gone is the outcome we wanted anyway.
      }
    }

    const pixels = side * side;
    const tensor = new Float32Array(pixels * channels);
    for (let p = 0, i = 0, o = 0; p < pixels; p += 1, i += 4, o += channels) {
      tensor[o] = raw.data[i] / 255;
      tensor[o + 1] = raw.data[i + 1] / 255;
      tensor[o + 2] = raw.data[i + 2] / 255;
      // Any plane beyond RGB is left at zero: for this model that is the
      // previous frame's mask, which a still photograph does not have.
    }
    return tensor;
  } catch {
    return null;
  }
}

/**
 * What one photograph measured: the figures, and the shape they came from.
 *
 * The mask itself is not in here and never leaves the call below. It is a
 * megabyte of `Float32Array` per photograph, and a five-angle session that
 * held on to all five would be carrying five of them on a phone with two
 * gigabytes of memory. What comes out instead is the outline, which is
 * kilobytes, and which is the only part of the mask anything draws.
 */
export type PhotoMeasurement = {
  coverage: Coverage;
  /**
   * The 0.5 boundary the coverage was counted at, and the 256 squares
   * that figure decomposes into.
   *
   * Always present when the model ran at all. A mask that came back in
   * too many pieces to trace as one shape carries an empty `contours`
   * and its squares, which is a different statement from the absent
   * field on a photograph taken before outlines were kept: one says the
   * mask shattered, the other says nobody looked. Collapsing the two
   * into "no outline" would lose the squares as well as the distinction,
   * and the squares are the half that survives fragmentation intact.
   */
  maskTrace: PhotoMaskTrace;
};

/**
 * Measures hair coverage in one photograph.
 *
 * Null when the photo cannot be read or the model cannot run — callers
 * render nothing rather than a zero, because zero coverage and "we could
 * not look" are very different statements to make to somebody.
 */
export async function measureCoverage(uri: string): Promise<PhotoMeasurement | null> {
  try {
    const model = await segmenter();
    const side = inputSide(model);
    const channels = inputChannels(model);

    const input = await inputTensor(uri, side, channels);
    if (!input) return null;

    /*
      The interpreter will not tell us if this is wrong. A buffer whose
      byte count does not match the tensor is refused by TFLite and the
      refusal is discarded upstream, so the model then runs on stale
      memory and returns a reading of nothing. Better to return null and
      show no figure than to show a confident wrong one.
    */
    const expected = side * side * channels;
    if (input.length !== expected) return null;

    const [out] = await model.run([input.buffer as ArrayBuffer]);
    const output = new Float32Array(out);

    // Classes per pixel, from the output tensor rather than assumed.
    const classes = Math.max(1, Math.round(output.length / (side * side)));

    /*
      The mask is reduced to its outline here, while it is in hand, and
      dies at the end of this call exactly as it always did. Tracing it
      later would mean carrying a megabyte per photograph up through the
      capture screen, and tracing it in the report would mean re-running
      the model on a file that storage may have recompressed since.

      ── WHAT THIS COSTS, HONESTLY ──────────────────────────────────────
      `model.run` above is native and asynchronous; everything from here
      down is plain JavaScript and blocks the thread it is on until it
      finishes. Measured at 6-16 ms per 512-square mask in Node on a
      desktop, which is 30-245 ms in Hermes on the oldest hardware this
      app supports. Nothing is waiting on the result — the capture beat
      floors at 2,200 ms — but React updates and touches on the capture
      screen are waiting on the thread, so this is a new stall at the
      shutter and not merely "no second model run". It has not been
      measured on a device. If the capture screen ever feels sticky at
      the shutter on an older phone, measure here first.
    */
    const mask = hairChannel(output, side, classes);
    const coverage = coverageOf(mask);
    /*
      A mask too fragmented to trace still keeps its squares. The
      outline is the part that shatters; the per-square shares are
      counted, not traced, and are as good on confetti as on a clean
      head. Storing nothing at all here would throw away a reading that
      was taken, and would make "the mask shattered" and "this
      photograph predates outlines" the same stored state.
    */
    const trace = traceMask(mask) ?? cellsOnlyTrace(mask);
    return { coverage, maskTrace: serialiseTrace(trace) };
  } catch {
    return null;
  }
}
