/**
 * Runs MediaPipe's hair segmenter on the device.
 *
 * The model is bundled, not fetched: it is 763 KB, it has to work in a
 * bathroom with no signal, and downloading it would mean the app phones
 * home the first time somebody scans — which is exactly the thing the
 * store listing, the website and the Play data-safety form all promise it
 * does not do.
 *
 * Two roads reach the same model. `measureMask` and `measureCoverage`
 * take a photograph's file, resize it through ImageManipulator and
 * measure what the scan kept — that is where every figure the app shows
 * comes from, and it is unchanged. `segmentFrame` takes bytes that are
 * already in memory at the size they were sampled, runs the same model,
 * and hands back the mask alone; its one caller is the live mesh, which
 * needs to know where hair is so a wireframe can be drawn on it. Nothing
 * on the second road is stored, compared or shown.
 *
 * One interpreter serves both, so both go through `runModel` and queue
 * rather than interleaving inside it — see the note there for the one
 * moment in a scan when they really do overlap.
 *
 * Neither road reaches the network, and neither has ever been given the
 * chance to: the model is a file in the binary.
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
  type MaskImage,
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

/**
 * One model run at a time, whichever road asked for it.
 *
 * There is exactly one interpreter — `cached` above is the whole point
 * of this file's first paragraph — and two callers that can reach it at
 * the same moment. The live mesh's beat runs for the length of the scan;
 * the analysis of the kept photographs starts the instant the scan
 * reaches `processing`. The screen stops the beat there, but stopping a
 * timer does not stop a `segmentFrame` that is already inside
 * `model.run`, so for one beat's width the two overlap.
 *
 * What that costs is not a crash but a reading. `model.run` copies the
 * caller's buffer into the interpreter's own input tensor and then runs
 * it; two calls interleaving inside one interpreter can have the second
 * copy land before the first has read, and the figures the app SHOWS
 * come out of the still road. A measurement taken from another road's
 * frame would look entirely reasonable and be fiction — the same failure
 * the long note on `inputTensor` describes, arriving by a different
 * door.
 *
 * So every run goes through here and they queue. The chain is kept alive
 * through failures (a rejected run must not wedge every later one), and
 * it costs a promise hop per call on a path that already awaits native
 * work. The live road is the one that waits, and waiting is what it is
 * built for: its caller drops a beat it cannot take on time.
 */
let modelQueue: Promise<void> = Promise.resolve();

/**
 * How long one run may take before the queue gives up on it.
 *
 * The interpreter is native and a run that never settles would wedge
 * every later one behind it — including the one that builds the report
 * somebody is waiting on. Six seconds is far longer than a 512-square
 * run has ever taken (6-16 ms in Node, and the file's own Hermes
 * multiplier does not reach a second), so this fires for a hang and
 * never for slowness.
 */
const RUN_TIMEOUT_MS = 6000;

async function runModel(model: TensorflowModel, input: Float32Array): Promise<Float32Array> {
  const mine = modelQueue.then(async () => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        model.run([input.buffer as ArrayBuffer]),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('segmenter run timed out')), RUN_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  });
  modelQueue = mine.then(
    () => undefined,
    () => undefined,
  );
  const [out] = await mine;
  return new Float32Array(out);
}

/** Input side length the loaded model expects, from its own tensor shape. */
function inputSide(model: TensorflowModel): number {
  // [batch, height, width, channels]
  const shape = model.inputs[0]?.shape ?? [];
  return shape.length >= 3 ? shape[1] : 224;
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
  return shape.length >= 4 ? shape[3] : 3;
}

/**
 * Decodes a photo to the model's input tensor: RGB, 0–1, square.
 *
 * The bundled model wants three channels and gets exactly three. The
 * count comes from the model, not from here, so a swap cannot silently
 * change what the interpreter is fed — and a fourth plane, where a video
 * model wants the previous frame's mask, is zeroed, because neither road
 * in this app keeps one.
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

    /*
      ── Resampled from what the decoder ACTUALLY returned ────────────
      Not read straight off the front of the buffer as though it were
      already `side` by `side`. It asks the manipulator for a square and
      it is entitled to one, but a resize that preserves aspect — which
      is what a resizer does when it will not distort — hands back an
      image the right width and the wrong height, and reading the first
      `side * side * 4` bytes of that is not a squash. It is a CROP of
      the top of the frame, silently: for a scan held at arm's length
      that is ceiling and wall, the model finds no hair in it, and every
      region reports zero coverage and a hundred visible scalp over a
      head full of hair. Which is exactly what it reported.

      `resampleTensor` reads the buffer's own width and height, so it is
      right whatever comes back, and the two roads now share one
      resampler rather than one of them carrying an assumption.
    */
    return resampleTensor(
      { data: raw.data, width: raw.width, height: raw.height },
      side,
      channels,
    );
  } catch {
    return null;
  }
}

/* ------------------------- the live-frame road ------------------------- */

/**
 * A square of RGBA pixels already in memory — no file, no decode.
 *
 * `width` and `height` are the buffer's own, which the AR sampler makes
 * square; the resample below does not require that, so a non-square
 * buffer is handled rather than refused.
 */
export type RawFrame = {
  /** RGBA, row-major, four bytes per pixel. */
  data: Uint8Array;
  width: number;
  height: number;
};

/**
 * The model's input tensor, sampled out of a buffer already in memory.
 *
 * ── The same invariant, kept the same way ─────────────────────────────
 * `inputTensor` above squashes a photograph into the model's square with
 * a scale on each axis and no crop, so a point in the mask maps back
 * onto the picture by a ratio and nothing else. This does exactly that,
 * with nearest-neighbour sampling instead of ImageManipulator: the
 * sampler upstream has already squashed the camera frame into a square,
 * and this squashes that square into the model's. Two scales composed
 * are still a scale. No crop, no offset, no rotation, at either step.
 *
 * ── Why nearest neighbour ─────────────────────────────────────────────
 * The buffer is smaller than the model's side, so this is an upsample,
 * and an upsample invents nothing whichever filter is used. Bilinear
 * would spend three or four times the arithmetic making the invented
 * pixels smoother, three times a second, on the thread the scan's own
 * React updates run on. The mask it produces is a wireframe's shape, not
 * a figure; smoothness there buys nothing anybody can see.
 *
 * ── Channels beyond RGB ───────────────────────────────────────────────
 * The bundled model takes three, so the loop below fills it exactly. The
 * count is still read from the model rather than written here, and any
 * plane past the third is left at zero: a video model's fourth plane is
 * the mask it made for the previous frame, and nothing on this road keeps
 * one. The length has to match the tensor exactly whatever the count —
 * see the long note on `inputTensor` for what happens when it does not,
 * which is not an error but a reading of whatever was left in the
 * interpreter's memory.
 */
function resampleTensor(
  frame: RawFrame,
  side: number,
  channels: number,
): Float32Array | null {
  const { data, width, height } = frame;
  if (!(width > 0) || !(height > 0) || !(side > 0)) return null;
  if (data.length < width * height * 4) return null;

  const tensor = new Float32Array(side * side * channels);
  for (let y = 0; y < side; y += 1) {
    const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / side));
    const row = sy * width * 4;
    for (let x = 0; x < side; x += 1) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / side));
      const i = row + sx * 4;
      const o = (y * side + x) * channels;
      tensor[o] = data[i] / 255;
      tensor[o + 1] = data[i + 1] / 255;
      tensor[o + 2] = data[i + 2] / 255;
    }
  }
  return tensor;
}

/**
 * The hair mask for one live frame, from bytes that never touched the
 * filesystem.
 *
 * ── What this is for, and what it is not ──────────────────────────────
 * One caller: the hair scan's mesh, which needs to know where the hair
 * is so the wireframe cap can be sat on it rather than on the skull. It
 * returns the mask and nothing else — no coverage figure, no outline, no
 * stored trace — because nothing on this road is a measurement of
 * anybody. The measured figures come from `measureMask` on a kept
 * photograph, and that road is untouched: same resize, same decode, same
 * trace, same numbers.
 *
 * ── What it costs ─────────────────────────────────────────────────────
 * `model.run` is native and asynchronous. Everything either side of it
 * is plain JavaScript on the thread that called it: the resample above
 * walks the model's whole square once, and `hairChannel` walks it again.
 * At the model's 512 that is 262,144 pixels twice. Measured in Node on
 * this Mac at about 2 ms for the resample and 1 ms for the channel pick,
 * which the rest of this file's notes put at 5-15x in Hermes on the
 * oldest hardware the app supports. It is called a few times a second,
 * never per frame, and the caller is expected to drop a call that
 * arrives while the last one is still running.
 *
 * Null whenever the model cannot run or the buffer is not a picture:
 * callers hold the shape their cap already has rather than collapsing
 * it, because "we could not look" is not "there is no hair".
 */
export async function segmentFrame(frame: RawFrame): Promise<MaskImage | null> {
  let model: Awaited<ReturnType<typeof segmenter>>;
  try {
    model = await segmenter();
  } catch (error) {
    // The model itself: missing from the bundle, or a runtime that could
    // not load it. Every later stage would fail too, and for a reason
    // that would read as the model's fault rather than the loader's.
    noteFailure('model', error);
    return null;
  }

  try {
    const side = inputSide(model);
    const channels = inputChannels(model);

    const input = resampleTensor(frame, side, channels);
    if (!input) {
      noteFailure('frame');
      return null;
    }

    // The interpreter will not tell us if this is wrong; see the note at
    // the same line on the still road.
    if (input.length !== side * side * channels) {
      noteFailure('shape');
      return null;
    }

    const output = await runModel(model, input);
    const classes = Math.max(1, Math.round(output.length / (side * side)));
    const mask = hairChannel(output, side, classes);
    noteFailure(mask ? null : 'output');
    return mask;
  } catch (error) {
    noteFailure('run', error);
    return null;
  }
}

/**
 * Why the last live frame produced no mask.
 *
 * Diagnostics only, and deliberately a module-level note rather than a
 * widened return type: every caller's answer to "no mask" is the same —
 * hold the cap — and none of them should start branching on the reason.
 * The scan screen reads it for the developer readout, which is the one
 * place it is ever shown.
 *
 * It exists because `segmentFrame` had a single `catch` returning null,
 * so a phone that produced no mask said only that. Five different
 * failures wore one word, and two builds were spent guessing which.
 */
export type SegmentFailure = 'model' | 'frame' | 'shape' | 'run' | 'output';

let lastFailure: SegmentFailure | null = null;
/** Kept for the readout: the throw behind a `model` or `run` failure. */
let lastFailureDetail: string | null = null;

function noteFailure(reason: SegmentFailure | null, error?: unknown): void {
  lastFailure = reason;
  lastFailureDetail =
    reason === null || error === undefined
      ? null
      : error instanceof Error
        ? error.message
        : String(error);
}

/** The last frame's failure, or null if the last frame produced a mask. */
export function lastSegmentFailure(): { reason: SegmentFailure; detail: string | null } | null {
  return lastFailure === null ? null : { reason: lastFailure, detail: lastFailureDetail };
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
 * The same measurement with the mask itself still attached.
 *
 * The note above stands: a mask is about a megabyte of `Float32Array`
 * and nothing may hold five of them. What changed is that there is now
 * one caller that needs the pixels rather than the outline — the hair
 * scan's measurement engine reads its six regions off the mask, and an
 * outline traced at the 0.5 boundary has already thrown away the hedge
 * between "probably hair" and "probably skin" that the engine counts as
 * neither. So the mask is offered, on a call whose name says what it is
 * handing over, and the caller is expected to drop it the moment it has
 * read what it wanted. `measureCoverage` below is unchanged in every way
 * that matters: same model run, same figures, and the mask still dies
 * inside the call.
 */
export type MaskMeasurement = PhotoMeasurement & { mask: MaskImage };

/**
 * Measures hair coverage in one photograph.
 *
 * Null when the photo cannot be read or the model cannot run — callers
 * render nothing rather than a zero, because zero coverage and "we could
 * not look" are very different statements to make to somebody.
 */
export async function measureCoverage(uri: string): Promise<PhotoMeasurement | null> {
  const measured = await measureMask(uri);
  if (!measured) return null;
  return { coverage: measured.coverage, maskTrace: measured.maskTrace };
}

/**
 * The same measurement, with the mask handed back rather than dropped.
 *
 * One model run, one decode, one trace: `measureCoverage` is this call
 * with the mask let go of, so the two can never disagree about what a
 * photograph measured.
 */
export async function measureMask(uri: string): Promise<MaskMeasurement | null> {
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

    const output = await runModel(model, input);

    // Classes per pixel, from the output tensor rather than assumed.
    const classes = Math.max(1, Math.round(output.length / (side * side)));

    /*
      The mask is reduced to its outline here, while it is in hand.
      Tracing it later would mean carrying a megabyte per photograph up
      through the capture screen, and tracing it in the report would mean
      re-running the model on a file that storage may have recompressed
      since. The mask itself dies at the end of `measureCoverage` as it
      always did; a caller that asked for `measureMask` has said out loud
      that it wants the pixels and owns letting go of them.

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
    return { coverage, maskTrace: serialiseTrace(trace), mask };
  } catch {
    return null;
  }
}
