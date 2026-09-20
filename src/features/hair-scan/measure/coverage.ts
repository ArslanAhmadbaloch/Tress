/**
 * Reading one region off one frame's mask.
 *
 * The segmenter hands back a hair-probability map: for every pixel of a
 * 512² squashed copy of the whole still, how confident it is that the
 * pixel is hair. `regions.ts` says where a region is on that still, and
 * which of its samples are on the head at all. This file puts the two
 * together and counts.
 *
 * ── What is counted ───────────────────────────────────────────────────
 * Three buckets, not two:
 *
 *   hair        the mask is at or above `HAIR` (0.5) — the same boundary
 *               `hair-mask.ts` counts its coverage at, imported rather
 *               than copied, because two thresholds would disagree
 *               silently and nothing on screen would say so.
 *   scalp       the mask is at or below `SCALP` (0.2): confidently not
 *               hair. Inside a region anchored on a head, that is skin.
 *   neither     between the two. The mask's own uncertainty, counted in
 *               neither figure — which is why `coverage + visibleScalp`
 *               is at most 1 rather than exactly 1, and why a region the
 *               model was unsure about does not get to inflate both.
 *
 * ── What is not counted at all ────────────────────────────────────────
 * A sample is only counted when it is on the head. This is the rule that
 * matters most in the whole file, and it is worth being blunt about why.
 * A mask calls the wall behind a person "not hair" with total
 * confidence. So a region rectangle that reaches past the skull — above
 * the top of the head, or out past the temple — would count the room as
 * bare scalp, and the number would look exactly like a real one. Every
 * sample is therefore cast back against the head model in `regions.ts`
 * before it is counted, and a sample whose ray missed the head, or hit
 * it so near the silhouette that the mask boundary there is really the
 * outline of the head, is left out of both buckets.
 *
 * ── What is refused ───────────────────────────────────────────────────
 * A region is only read when it was actually there to read. Three things
 * can stop it:
 *
 *   inFrame    the share of the region's samples that landed inside the
 *              image at all. A temple half out of frame is half a
 *              measurement, and half a measurement compared against a
 *              whole one next month is a change that never happened.
 *   onHead     the share whose ray met the head at this pose.
 *   facing     how squarely that patch of head pointed at the camera.
 *              A crown photographed with the chin level is not a low
 *              reading; it is not a reading.
 *
 * `visibility` is all three at once — the mean, over every sample of the
 * region, of how squarely it faced the camera, counting a sample off the
 * picture or off the head as nothing. Below `MIN_VISIBILITY` the answer
 * is null. Null, not zero: zero coverage and "we could not see it" are
 * different sentences, and only one of them is true.
 *
 * ── What this is not ──────────────────────────────────────────────────
 * A share of pixels a model called hair. Not a count of strands, not a
 * measure of how much hair is there — a mask cannot see between strands,
 * so a thin covering and a thick one over the same area read the same.
 * The value of the number is that the NEXT one is measured exactly the
 * same way, in the same frame, on the same head.
 *
 * Pure: no React, nothing native. Loads under `node --test`.
 */

import { HAIR, type MaskImage } from '@/features/assessment/hair-mask';

import {
  SAMPLE_STEPS,
  SCAN_REGIONS,
  anchorGradeOf,
  clamp01,
  faceFrameOf,
  regionSamples,
  sampleFacing,
  toImage,
  type FaceFrame,
  type FaceObservation,
  type ScanRegion,
} from './regions';
import { measureRegion, type FrameReading, type ScanMeasurement } from './noise';

/**
 * At or below this, the mask is confidently not hair.
 *
 * Not `HAIR` mirrored (0.5). Between 0.2 and 0.5 the model is hedging,
 * and counting a hedge as scalp would turn a soft edge — every hairline
 * has one — into visible scalp that nobody can see.
 */
export const SCALP = 0.2;

/**
 * How squarely a single sample must face the camera before its mask
 * value is counted at all.
 *
 * Not the same bar as the region's, and not tuning. The head model is an
 * ellipsoid and the person has a skull, so the two silhouettes differ by
 * a few degrees of arc — and right at the silhouette, what the mask is
 * drawing is the outline of the head against the room. A sample there is
 * as likely to be the room as the head, whatever the model says, so the
 * count keeps a margin inside the outline. Samples between this and the
 * edge still count towards `facing`, which is what makes a grazing
 * region read as poorly visible rather than as simply smaller.
 */
export const EDGE_FACING = 0.25;

/**
 * How much of a region has to be readable before a reading is taken at
 * all: in frame, on the head, and facing the camera. Below this the
 * region yields nothing rather than a number built on a fifth of itself.
 */
export const MIN_VISIBILITY = 0.6;

/** What one frame said about one region. */
export type RegionReading = {
  region: ScanRegion;
  /** Share of the region's counted samples the mask calls hair, 0–1. */
  coverage: number;
  /** Share of the region's counted samples the mask confidently calls skin, 0–1. */
  visibleScalp: number;
  /** Share of the region's samples that landed inside the image, 0–1. */
  inFrame: number;
  /** Share whose camera ray met the head at this pose, 0–1. */
  onHead: number;
  /** How squarely the region faced the camera at this pose, 0–1. */
  facing: number;
  /** In frame, on the head and facing the camera, all at once: what the bar is applied to. */
  visibility: number;
  /** How many of the region's samples were counted. */
  counted: number;
  /** The capture's own quality, as the scanner scored it. Carried, never invented. */
  quality: number;
};

/** The mask value at an image-fraction point, or null when the point is outside the image. */
function sampleMask(mask: MaskImage, p: { x: number; y: number }): number | null {
  if (!(p.x >= 0) || !(p.y >= 0) || p.x >= 1 || p.y >= 1) return null;
  /*
    A mask may cover a square around the head rather than the whole
    picture — see `MaskImage.source` for why it has to. The point arrives
    as a fraction of the PHOTOGRAPH, so it is moved into the mask's own
    fractions first, and a point outside the crop is no reading at all
    rather than the nearest edge pixel.
  */
  const src = mask.source;
  if (src) {
    if (!(src.w > 0) || !(src.h > 0)) return null;
    const mx = (p.x - src.x) / src.w;
    const my = (p.y - src.y) / src.h;
    if (!(mx >= 0) || !(my >= 0) || mx >= 1 || my >= 1) return null;
    const c = Math.min(mask.width - 1, Math.floor(mx * mask.width));
    const r = Math.min(mask.height - 1, Math.floor(my * mask.height));
    const v = mask.data[r * mask.width + c];
    return Number.isFinite(v) ? v : null;
  }
  const col = Math.min(mask.width - 1, Math.floor(p.x * mask.width));
  const row = Math.min(mask.height - 1, Math.floor(p.y * mask.height));
  const value = mask.data[row * mask.width + col];
  return Number.isFinite(value) ? value : null;
}

/**
 * What one frame says about one region, or null when it says nothing
 * usable.
 *
 * `quality` is the frame's own score from the scanner — stillness,
 * lighting, size at the shutter. It is carried through untouched and
 * never recomputed here: this file has a mask and a face, not a camera.
 */
export function readRegion(
  mask: MaskImage,
  frame: FaceFrame,
  region: ScanRegion,
  quality: number,
): RegionReading | null {
  if (!(mask.width > 0) || !(mask.height > 0)) return null;
  if (mask.data.length < mask.width * mask.height) return null;

  const samples = regionSamples(region, SAMPLE_STEPS);
  if (samples.length === 0) return null;

  const pose = { yaw: frame.yaw, pitch: frame.pitch };
  let inside = 0;
  let onHead = 0;
  let facingTotal = 0;
  let visibleTotal = 0;
  let counted = 0;
  let hair = 0;
  let scalp = 0;

  for (const s of samples) {
    const facing = sampleFacing(pose, s);
    if (facing > 0) onHead += 1;
    facingTotal += facing;

    const value = sampleMask(mask, toImage(frame, s));
    if (value === null) continue;
    inside += 1;
    visibleTotal += facing;
    if (facing < EDGE_FACING) continue;
    counted += 1;
    if (value >= HAIR) hair += 1;
    else if (value <= SCALP) scalp += 1;
  }

  const visibility = clamp01(visibleTotal / samples.length);
  if (counted === 0 || visibility < MIN_VISIBILITY) return null;

  return {
    region,
    coverage: hair / counted,
    visibleScalp: scalp / counted,
    inFrame: inside / samples.length,
    onHead: onHead / samples.length,
    facing: clamp01(facingTotal / samples.length),
    visibility,
    counted,
    quality: clamp01(quality),
  };
}

/** One captured frame, as this module wants it: a mask, the face in it, and the shutter's own score. */
export type ScanFrameInput = {
  /** The hair-probability map for the whole still. */
  mask: MaskImage;
  /** The face the tracker had at the shutter, in fractions of that same still. */
  face: FaceObservation;
  /** 0–1, the capture's own quality as the scanner scored it. */
  quality: number;
};

/** Every reading one frame yields, region by region. Regions it could not read are absent. */
export function readFrame(input: ScanFrameInput): Partial<Record<ScanRegion, RegionReading>> {
  const frame = faceFrameOf(input.face);
  if (frame === null) return {};
  const out: Partial<Record<ScanRegion, RegionReading>> = {};
  for (const region of SCAN_REGIONS) {
    const reading = readRegion(input.mask, frame, region, input.quality);
    if (reading) out[region] = reading;
  }
  return out;
}

/**
 * The whole scan: every frame read, every region's readings gathered,
 * and each region's own error bar taken across them.
 *
 * `capturedAt` is passed in rather than read off the clock, so the same
 * frames measured twice give the same answer and the tests can say so.
 *
 * Each reading carries the grade of the frame it came from — which
 * landmarks anchored that frame — so the measurement can say what units
 * it is in, and `compare.ts` can refuse to pretend that a scan anchored
 * on eye corners and a chin is in the same units as one anchored on a
 * detector's face box.
 *
 * A region ends up in `unread` when no frame produced a reading for it —
 * it was never in shot, or never facing the camera, or every frame that
 * should have had it was refused. That is a statement the report can
 * make out loud ("this scan did not get the crown") and is a great deal
 * more useful than a number nobody should believe.
 */
export function measureScan(
  frames: readonly ScanFrameInput[],
  capturedAt: string,
): ScanMeasurement {
  const gathered = new Map<ScanRegion, FrameReading[]>();
  for (const region of SCAN_REGIONS) gathered.set(region, []);

  /* See `MaskStats`: what the masks held, whatever the regions made of
     it. Walked here because this is the one place that has them all. */
  let statFrames = 0;
  let statSum = 0;
  let statPixels = 0;
  let statPeak = 0;
  let statHair = 0;

  for (const input of frames) {
    const data = input.mask.data;
    statFrames += 1;
    statPixels += data.length;
    for (let i = 0; i < data.length; i += 1) {
      const v = data[i];
      if (!Number.isFinite(v)) continue;
      statSum += v;
      if (v > statPeak) statPeak = v;
      if (v >= HAIR) statHair += 1;
    }
    const frame = faceFrameOf(input.face);
    if (frame === null) continue;
    const anchoring = anchorGradeOf(frame.anchoredBy);
    for (const region of SCAN_REGIONS) {
      const reading = readRegion(input.mask, frame, region, input.quality);
      if (reading) gathered.get(region)?.push({ ...reading, anchoring });
    }
  }

  const regions: ScanMeasurement['regions'] = {};
  const unread: ScanRegion[] = [];
  for (const region of SCAN_REGIONS) {
    const measured = measureRegion(region, gathered.get(region) ?? []);
    if (measured) regions[region] = measured;
    else unread.push(region);
  }

  return {
    regions,
    unread,
    capturedAt,
    maskStats: {
      frames: statFrames,
      mean: statPixels > 0 ? statSum / statPixels : 0,
      peak: statPeak,
      hairShare: statPixels > 0 ? statHair / statPixels : 0,
    },
  };
}
