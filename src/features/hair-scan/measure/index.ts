/**
 * The measurement contract, and the two doors into it.
 *
 * What leaves this file is the vocabulary every other lane and every
 * later phase codes against — the measurement types, the comparison
 * types, the list of regions and how well each one is anchored — plus
 * the two functions that produce them: `measureScan`, which turns
 * photographs into a record, and `compareScans`, which is the only thing
 * allowed to subtract two records from one another.
 *
 * What stays behind the door is every number that might move: the
 * thresholds, the confidence weights, the head model, the region
 * rectangles, the sampling. Something that reaches past this file into
 * `coverage.ts` for `SCALP`, or into `noise.ts` for `WIDE_SPREAD`, is
 * something that will break the day one of those is tuned against a real
 * head — and they will be. (`part-line.ts` does import from the modules
 * directly. It lives in this folder, it is part of the engine rather
 * than a consumer of it, and it is the exception that shows where the
 * line is.)
 *
 * ── What the engine is for ────────────────────────────────────────────
 * A photograph of a head is not a record. It is a record of a room, a
 * distance, a lens and a light, with a head somewhere in it. Two of them
 * taken months apart cannot be subtracted from one another.
 *
 * What this turns them into is a record that CAN be: a share of hair in
 * each of six named places on the head, measured in a coordinate frame
 * built from that person's own face so the places mean the same thing
 * at any distance and any angle — and, beside every one of those shares,
 * the error bar the scan measured on itself. The error bar is not
 * decoration. It is what `compareScans` uses to refuse to report a
 * change that is indistinguishable from the phone having been held
 * slightly differently.
 *
 * ── What it never does ────────────────────────────────────────────────
 * It does not diagnose, classify, forecast, or grade. There is no score
 * out of anything. Every number that leaves here is a share between 0
 * and 1 that some loop in this module actually counted, or a confidence
 * saying how much that share deserves to be believed. Nothing here
 * leaves the device; nothing here knows what a person looks like.
 *
 * Pure TypeScript throughout: no React, no native imports, loads under
 * `node --test` with the project loader.
 */

export type {
  FaceObservation,
  FrameAnchorGrade,
  RegionAnchoring,
  ScanRegion,
} from './regions';
export { REGION_ANCHORING, SCAN_REGIONS } from './regions';

export type { ScanFrameInput } from './coverage';
export { measureScan } from './coverage';

export type { RegionMeasurement, ScanMeasurement } from './noise';

export type { ChangeAnchoring, ChangeVerdict, RegionChange } from './compare';
export { compareScans } from './compare';
