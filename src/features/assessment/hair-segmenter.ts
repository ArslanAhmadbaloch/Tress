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

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Decodes a photo to the model's input tensor: RGB, 0–1, square. */
async function inputTensor(uri: string, side: number): Promise<Float32Array | null> {
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
    const tensor = new Float32Array(pixels * 3);
    for (let p = 0, i = 0, o = 0; p < pixels; p += 1, i += 4, o += 3) {
      tensor[o] = raw.data[i] / 255;
      tensor[o + 1] = raw.data[i + 1] / 255;
      tensor[o + 2] = raw.data[i + 2] / 255;
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

    const input = await inputTensor(uri, side);
    if (!input) return null;

    const [out] = await model.run([input.buffer as ArrayBuffer]);
    const output = new Float32Array(out);

    // Classes per pixel, from the output tensor rather than assumed.
    const classes = Math.max(1, Math.round(output.length / (side * side)));
    return coverageOf(hairChannel(output, side, classes));
  } catch {
    return null;
  }
}
