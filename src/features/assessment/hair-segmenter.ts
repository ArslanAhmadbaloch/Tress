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

import * as FileSystem from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';
import { loadTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';

import MODEL from '../../../assets/models/hair_segmenter.tflite';
import { coverageOf, hairChannel, type Coverage } from './hair-mask';

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

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
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
    const context = ImageManipulator.manipulate(uri).resize({ width: side, height: side });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });

    const base64 = await FileSystem.readAsStringAsync(saved.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const raw = decode(base64ToBytes(base64), { useTArray: true });
    FileSystem.deleteAsync(saved.uri, { idempotent: true }).catch(() => undefined);

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
 * Measures hair coverage in one photograph.
 *
 * Null when the photo cannot be read or the model cannot run — callers
 * render nothing rather than a zero, because zero coverage and "we could
 * not look" are very different statements to make to somebody.
 */
export async function measureCoverage(uri: string): Promise<Coverage | null> {
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
    return coverageOf(hairChannel(output, side, classes));
  } catch {
    return null;
  }
}
