/**
 * The face-anchored frame, the head it is hung on, and the six places a
 * scan reads.
 *
 * ── Why a frame at all ────────────────────────────────────────────────
 * A photograph is a terrible place to keep a measurement. The same head
 * photographed a month apart is a different number of pixels across, at
 * a different angle, in a different part of the picture; a rectangle in
 * image pixels therefore names a different piece of head every time, and
 * two readings taken from two such rectangles cannot be subtracted from
 * one another and mean anything at all.
 *
 * So nothing here works in pixels. Everything works in a coordinate
 * frame built out of the face's own anatomy, and a region is a fixed
 * rectangle in THAT frame:
 *
 *   origin   the brow centre — measured from the eyebrow line when the
 *            tracker reports one, from the eye corners when it does not,
 *            from the face box as a last resort.
 *   u axis   along the brow line towards image-right. u = ±1 at the
 *            temples, i.e. one half of the face's width.
 *   v axis   perpendicular, down the face. Same unit as u, so a region
 *            keeps its shape. v = 0 at the brow, positive downwards.
 *
 * Both axes are measured from landmarks rather than assumed, so the
 * frame is scale-free: hold the phone at arm's length or at a hand's
 * length and `u = 0.8, v = −0.7` is the same square centimetre of
 * forehead. And because the projected span between two landmarks is
 * already foreshortened by the turn of the head, using the PROJECTED
 * span as the unit undoes the foreshortening for free — a head turned
 * 35° reads a narrower face, so a narrower unit, so the same u.
 *
 * ── Why a head as well ────────────────────────────────────────────────
 * The frame is flat and a head is not, and that gap is where the worst
 * number this product could print comes from. A rectangle drawn in a
 * flat frame does not stop at the edge of the skull; drawn above the
 * head, or out past the temple, it covers the wall behind the person,
 * and a hair mask calls a wall "not hair" with total confidence. Nothing
 * downstream could tell that reading from a bald patch.
 *
 * So every sample is cast against a head before it is counted.
 * `HEAD_SHAPE` is an ellipsoid hung on the same proportions the head cap
 * is hung on; `sampleFacing` turns the sample back into the camera ray
 * it came from, intersects that ray with the ellipsoid, and returns how
 * squarely the surface it hit pointed at the lens — or zero when the ray
 * missed the head entirely. A sample that misses is not counted as
 * anything. That single rule is what stops a crown reading from being a
 * reading of the ceiling.
 *
 * It also means the region rectangles no longer carry hand-written
 * "which way does this face" angles. Which way a patch faces is a fact
 * about a head at a pose, and the head model has it.
 *
 * ── What the frame is actually worth ──────────────────────────────────
 * Measured, in `scripts/test/hair-scan-measure.test.ts`, by photographing
 * a head with real depth through a pinhole camera this file knows
 * nothing about and asking where the frame put it. In face half-widths,
 * one of which is about seven centimetres of adult head:
 *
 *   square on, at any distance   under 0.05. The frame is doing its job.
 *   turned or tilted             under 0.25. Most of that is not the
 *     projection: it is that the outer eye corners are set back from the
 *     brow, so a lens nearer one than the other puts their midpoint off
 *     the face's mid-line, and the origin goes with it.
 *   turned AND tilted            under 0.45, the worst the frame does.
 *
 * Separately, five degrees of pose — about as well as anybody holds a
 * pose — slides the piece of skull a region covers by a centimetre or so
 * (twice that for the crown). None of this is small enough to ignore and
 * all of it is why the rest of the module behaves as it does: regions
 * are tenths of a face across rather than hundredths, two scans are shot
 * at the same choreographed poses so most of the error is common to both
 * and cancels in the subtraction, and whatever does not cancel arrives
 * as spread and pushes the noise floor up. A frame that modelled the
 * lens would do better; see this build's openIssues.
 *
 * ── What is well anchored and what is not ─────────────────────────────
 * This is the part to be plain about, because the arithmetic below is
 * equally confident everywhere and the anatomy is not.
 *
 *   hairline, leftTemple, rightTemple   WELL ANCHORED. They sit within
 *     one face-width of the brow line, between landmarks the tracker
 *     actually reports. Whatever pose error there is has not had far to
 *     accumulate by the time it reaches them.
 *
 *   midScalp, crown   WEAK. They sit ABOVE the face, and no face tracker
 *     covers the skull. `modules/hair-face-tracking/src/points.ts` says
 *     so in one line — `COVERS_CROWN = false`; ARKit's face geometry is a
 *     mask that stops at the upper forehead, and ML Kit's box stops at
 *     the brow. Everything above v ≈ −1 here is extrapolated from head
 *     proportions, and an ellipsoid is a coarse stand-in for a skull.
 *     `crown` is the worst of the two: it is over the top of the head,
 *     so it is only in the picture at all with the chin well down.
 *
 *   partLine   WEAK, and weak for a different reason. The strip below is
 *     the mid-sagittal line, because nothing in this app detects where a
 *     person actually parts their hair. Somebody who parts to the side
 *     has hair over this strip and will read as hair — correctly, as a
 *     statement about that strip, and uselessly as a statement about
 *     their parting. Until a part detector exists, treat a partLine
 *     reading as a reading of the centre line and nothing more.
 *
 * `REGION_ANCHORING` states each of these in code so the report cannot
 * quietly present a crown reading with the same weight as a hairline
 * one.
 *
 * ── What this file is not ─────────────────────────────────────────────
 * It knows nothing about hair. It places rectangles on a head. Pure
 * arithmetic: no React, nothing native, loads under `node --test`.
 */

import { CAP, HEAD_LINES } from '@/features/hair-scan/head-cap';
import { FRAME_MIRRORED, OWN_LEFT_SIDE, OWN_RIGHT_SIDE } from '@/features/hair-scan/handedness';

/* ------------------------------ the places ------------------------------ */

/**
 * The six places a scan reads. Named for the part of the head, never for
 * anything about what grows on it.
 *
 * Note for anyone grepping: `src/features/hair-scan/types.ts` also has a
 * type called `ScanRegion`, and it is a different thing — the direction
 * the head was pointing when a frame was taken. This one is a place on a
 * head. The two never meet; nothing imports both.
 */
export type ScanRegion =
  | 'hairline'
  | 'leftTemple'
  | 'rightTemple'
  | 'midScalp'
  | 'crown'
  | 'partLine';

/** The canonical order: front to back, so a list of regions always reads the same way. */
export const SCAN_REGIONS: readonly ScanRegion[] = [
  'hairline',
  'leftTemple',
  'rightTemple',
  'midScalp',
  'crown',
  'partLine',
];

/**
 * How much weight a region's own placement deserves.
 *
 * - `anchored`: bounded by landmarks the tracker reports.
 * - `extrapolated`: placed above the face by head proportions, because
 *   no face tracker sees the skull.
 * - `assumed`: the region's very definition is a guess about this person
 *   (today, only where they part their hair).
 */
export type RegionAnchoring = 'anchored' | 'extrapolated' | 'assumed';

export const REGION_ANCHORING: Readonly<Record<ScanRegion, RegionAnchoring>> = Object.freeze({
  hairline: 'anchored',
  leftTemple: 'anchored',
  rightTemple: 'anchored',
  midScalp: 'extrapolated',
  crown: 'extrapolated',
  partLine: 'assumed',
});

/* ---------------------------- head proportions --------------------------- */

/**
 * How tall a head is, in face half-widths.
 *
 * The one figure here that is stated rather than derived. A head is
 * about one and a half face widths tall; with `CAP.widen` — the head's
 * half-width over the face oval's, 1.15 — that is a head about 1.3 times
 * as tall as it is wide, which is the life-drawing figure and the one
 * the head cap is already drawn to.
 */
export const HEAD_HEIGHT = 3.0;

/**
 * The head, in face half-widths, measured down from the brow line.
 *
 * Derived, not typed in. `HEAD_LINES` in `head-cap.ts` places the ear
 * line, the brow and the crown on a head measured chin (0) to crown (1);
 * every figure below is that table times `HEAD_HEIGHT`, so the two
 * cannot drift apart — they are the same table.
 *
 * The hairline is the one line `HEAD_LINES` does not carry, and it comes
 * from the canon those proportions belong to: the face divides into
 * three equal parts, hairline to brow, brow to nose, nose to chin. So
 * brow-to-hairline is half of brow-to-chin. (That it lands on the 0.78
 * this file used before `HEAD.chin` was corrected is the corroboration:
 * the two derivations only agree at a chin of 1.56.)
 *
 * Negative is above the brow.
 */
export const HEAD = Object.freeze({
  /** The top of the skull. */
  crown: -(HEAD_LINES.crown - HEAD_LINES.brow) * HEAD_HEIGHT,
  /** Where the frontal hairline sits on a head that has not moved. */
  hairline: -(HEAD_LINES.brow * HEAD_HEIGHT) / 2,
  /** The brow line: the origin. */
  brow: 0,
  /** The ear canal line, below the brow. */
  ear: (HEAD_LINES.brow - HEAD_LINES.ear) * HEAD_HEIGHT,
  /** The chin. */
  chin: HEAD_LINES.brow * HEAD_HEIGHT,
});

/** Outer eye corner to outer eye corner, as a share of the face's full width. */
export const OUTER_CANTHAL_SHARE = 0.64;

/** The brow line above the eye corners, in face half-widths. */
export const BROW_ABOVE_EYES = 0.28;

/**
 * The brow above the face box's centre, in face-box heights: the same
 * proportion `region-crops.ts` falls back on, kept in step on purpose.
 */
export const BROW_ABOVE_BOX_CENTRE = 0.21;

/* -------------------------------- the head ------------------------------- */

/** A point in the head's own three dimensions: `u` right, `v` down, `w` out towards the camera. */
export type HeadPoint = { u: number; v: number; w: number };

/**
 * The head as an ellipsoid, in face half-widths, in the head's own
 * coordinates: `u` towards the person's right, `v` down from the brow,
 * `w` forward out of the face.
 *
 * Every figure is read off the proportions above:
 *
 *   halfWidth   `CAP.widen` — the head is wider than the face oval.
 *   halfHeight  the ear line to the crown. The head cap hangs its
 *               ellipsoid's equator on the ear line and its pole on the
 *               crown; this is the same ellipsoid, seen from the side.
 *   halfDepth   `CAP.depth` of the half-width, again the cap's figure.
 *   centre      on the mid-line, at the ear line, and set back far
 *               enough that the front of the head passes through the
 *               brow — which is where the frame's origin is, so the two
 *               agree about where the face is by construction.
 *
 * It is a head-shaped approximation of a head, and it is worth saying
 * what it is not: it has no nose, no jaw, no occipital bulge, and every
 * person's skull differs from it. It is used for two jobs only — is this
 * sample on the head at all, and which way does the head face there —
 * and for both of those a smooth ellipsoid errs the safe way: it is
 * narrower than a real head at the temples and shallower at the back, so
 * it refuses samples a real skull might have carried rather than
 * accepting samples that are really the wall.
 */
export const HEAD_SHAPE = Object.freeze({
  halfWidth: CAP.widen,
  halfHeight: HEAD.ear - HEAD.crown,
  halfDepth: CAP.depth * CAP.widen,
  centreV: HEAD.ear,
  /** Set so the surface passes through `(0, 0, 0)`: the brow, the frame's own origin. */
  centreW: -CAP.depth * CAP.widen * Math.sqrt(1 - (HEAD.ear / (HEAD.ear - HEAD.crown)) ** 2),
});

/**
 * How far the chin sits behind the plane of the brow, in face
 * half-widths. Negative is behind.
 *
 * Read off the head model rather than invented, and it earns its place
 * by fixing a real bias. The frame's vertical unit is the brow-to-chin
 * span as the photograph shows it — and when the head tilts, that span
 * does not simply shorten by the cosine of the tilt, because the chin is
 * not on the same plane as the brow. Lower the chin thirty degrees and a
 * span that ought to read 87% of its full length reads 77% of it, so
 * every v coordinate comes out an eighth too large and the crown box
 * lands an eighth of a face too high — on the frames taken with the chin
 * down, which are exactly the frames the crown is read from.
 *
 * A real jaw stands a little forward of the skull this is read from, so
 * the correction is a shade short rather than a shade long. Erring short
 * is the right way round: it leaves a little of the bias rather than
 * inventing the opposite one. The figure to measure on a device.
 */
export const CHIN_DEPTH =
  HEAD_SHAPE.centreW +
  HEAD_SHAPE.halfDepth *
    Math.sqrt(1 - ((HEAD.chin - HEAD_SHAPE.centreV) / HEAD_SHAPE.halfHeight) ** 2);

/* ------------------------------ the regions ------------------------------ */

/** A rectangle in face coordinates. `v0` is the top edge, so `v0 < v1`. */
export type FaceBox = { u0: number; u1: number; v0: number; v1: number };

/**
 * Where each region sits, in face half-widths from the brow centre.
 * Image-left is negative u, and which person-side that is depends on
 * whether the frame is flipped — so the two temples take their sides
 * from `FRAME_MIRRORED` rather than from a sign written here. See
 * `handedness.ts`; it is the only place that bit is decided.
 *
 * The three that sit on the face are drawn to tile it without gaps: the
 * hairline band takes the middle of the brow out to ±0.55 and the
 * temples take the corners from there out to 0.9. A rectangle laid on a
 * round head still hangs off it at the corners — the skull is under
 * 0.85 half-widths wide by the top of the temple box — and those samples
 * are simply not counted; better than nineteen in twenty of each box is
 * on the head head-on, which the tests hold it to. Nothing here relies
 * on the drafting — `sampleFacing` bounds every sample by the head
 * whatever the box says — but a box drawn outside the head would spend
 * its samples on refusals and report a visibility that is really a
 * drafting error.
 *
 * `crown` is the exception, and it is deliberate. Its box lies above the
 * top of the head-on skull, because the crown IS above the head-on
 * skull: it is the back of the dome, and it only swings into the picture
 * when the chin comes down. At every pose where it has not, its samples
 * miss the head, its facing collapses, and the region is refused rather
 * than read off whatever was behind the person's head.
 */
/**
 * A temple box on one side of the face. The outer edge is 0.9 half-widths
 * out and the inner edge meets the hairline band at 0.55, so the three
 * front regions tile the brow without gaps whichever way round the frame
 * is; only which side each NAME lands on moves with `FRAME_MIRRORED`.
 */
function templeBox(side: 1 | -1): FaceBox {
  return side < 0
    ? { u0: -0.9, u1: -0.55, v0: -0.88, v1: -0.32 }
    : { u0: 0.55, u1: 0.9, v0: -0.88, v1: -0.32 };
}

export const REGION_BOXES: Readonly<Record<ScanRegion, FaceBox>> = Object.freeze({
  /* A band across the front hairline, the middle of the brow's width. */
  hairline: { u0: -0.55, u1: 0.55, v0: -1.0, v1: -0.55 },
  /* The upper outer corners of the forehead, one per side of the face. */
  leftTemple: templeBox(OWN_LEFT_SIDE),
  rightTemple: templeBox(OWN_RIGHT_SIDE),
  /* Above the hairline, short of the top of the skull. */
  midScalp: { u0: -0.48, u1: 0.48, v0: -1.35, v1: -1.05 },
  /* Over the top of the skull and a little behind it: only there with the chin down. */
  crown: { u0: -0.5, u1: 0.5, v0: -1.85, v1: -1.35 },
  /* The mid-sagittal strip, from the hairline back over the skull. */
  partLine: { u0: -0.16, u1: 0.16, v0: -1.3, v1: -0.6 },
});

/**
 * How far off square a patch of head may be and still count as squarely
 * photographed, in degrees.
 *
 * A strict cosine is too harsh for a curved head: a patch forty degrees
 * off is still plainly in the picture, and its share of hair is still
 * readable. So the reading saturates at 1 inside this cone and falls to
 * 0 at ninety degrees, where the patch is edge-on and there is genuinely
 * nothing to read.
 *
 * Fitted to nothing. It is a shape chosen to be forgiving in the middle
 * and absolute at the edge, and it is the first number to check against
 * a real head — see this build's deviceOnly list.
 */
export const GRAZE_DEG = 55;

/** Samples across a region, per side: 24² = 576 per region per frame. */
export const SAMPLE_STEPS = 24;

const RAD = Math.PI / 180;
const GRAZE_COS = Math.cos(GRAZE_DEG * RAD);

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Floor under the foreshortening cosines.
 *
 * Mirrors `CAP_MESH.minCos` in `head-cap.ts` for the same reason: past
 * about sixty degrees the projected span is so short that dividing by
 * its cosine amplifies the tracker's own jitter faster than it recovers
 * any real width. A pose past the floor is not corrected further — it is
 * a pose whose regions will fail the visibility bar anyway.
 */
const MIN_COS = 0.5;

/** The pose beyond which the frame stops correcting, so the head model stops too. */
export const MAX_MODEL_POSE = Math.round(Math.acos(MIN_COS) / RAD);

const clampPose = (deg: number): number =>
  !Number.isFinite(deg) ? 0 : Math.max(-MAX_MODEL_POSE, Math.min(MAX_MODEL_POSE, deg));

/**
 * A pose's yaw as the IMAGE sees it.
 *
 * Everything below works in the face frame's `u`, which is an image axis:
 * negative is image-left. A pose's `yaw`, by contrast, is a fact about the
 * head — positive is the head's own right, on both detectors — so the two
 * only line up when the picture is flipped. A mirror reverses the picture
 * and the sense of rotation together, which is why this was invisible
 * while `FRAME_MIRRORED` was true and why it is a sign and not a rewrite.
 *
 * Applied at the two places a caller's pose enters this file: `headHitAt`,
 * which every facing number goes through, and the frame builder. Convert
 * anywhere else and a region ends up facing the camera at the pose that
 * turns it away.
 */
const imageYaw = (yaw: number): number => (FRAME_MIRRORED ? yaw : -yaw);

/** Where the camera is, in the head's own coordinates: a unit vector from the head towards the lens. */
function viewDirection(yaw: number, pitch: number): HeadPoint {
  const psi = clampPose(yaw) * RAD;
  const th = clampPose(pitch) * RAD;
  return { u: -Math.cos(th) * Math.sin(psi), v: Math.sin(th), w: Math.cos(th) * Math.cos(psi) };
}

/** The outward normal of the ellipsoid at a point on it. Not normalised. */
function surfaceNormal(p: HeadPoint): HeadPoint {
  const s = HEAD_SHAPE;
  return {
    u: p.u / (s.halfWidth * s.halfWidth),
    v: (p.v - s.centreV) / (s.halfHeight * s.halfHeight),
    w: (p.w - s.centreW) / (s.halfDepth * s.halfDepth),
  };
}

/** Where a face-frame point's camera ray meets the head, and which way that surface faces. */
export type HeadHit = { point: HeadPoint; facing: number };

/**
 * The piece of head a face-frame point came from, or null when the ray
 * that made that point never touched the head.
 *
 * The frame is a projection: a face coordinate is not a place on a head
 * until a pose is named, because everything the camera saw along one ray
 * landed on the same (u, v). Running that backwards is what this does.
 *
 * With the head turned by `yaw` and tilted by `pitch`, a head point
 * `(u, v, w)` lands in the frame at
 *
 *   uFrame = u + w·tan(yaw)
 *   vFrame = v + u·sin(yaw)·tan(pitch) − w·cos(yaw)·tan(pitch)
 *
 * — the projection foreshortened by the pose, then divided by the units
 * the frame measured off the same foreshortened face, which is why the
 * cosines cancel and only tangents are left. Inverting that at fixed
 * `(uFrame, vFrame)` gives a straight line through the head, one point
 * of it per depth `w`; intersecting the line with `HEAD_SHAPE` gives the
 * two places it enters and leaves, and the camera sees the nearer one.
 *
 * The answer is `facing`: the cosine between that surface's normal and
 * the camera, through the graze cone, so 1 is square on and 0 is edge-on
 * or behind. A miss is null, which every caller must treat as "this
 * sample is not on the head" rather than as a zero reading.
 */
export function headHitAt(pose: { yaw: number; pitch: number }, p: FacePoint): HeadHit | null {
  if (!Number.isFinite(p.u) || !Number.isFinite(p.v)) return null;
  const yaw = imageYaw(pose.yaw);
  const psi = clampPose(yaw) * RAD;
  const th = clampPose(pose.pitch) * RAD;
  const tanPsi = Math.tan(psi);
  const tanTh = Math.tan(th);

  /* The ray, as a point and a direction in the head's coordinates, walked by depth. */
  const origin: HeadPoint = { u: p.u, v: p.v - p.u * Math.sin(psi) * tanTh, w: 0 };
  const step: HeadPoint = { u: -tanPsi, v: tanTh / Math.cos(psi), w: 1 };

  const s = HEAD_SHAPE;
  const au = step.u / s.halfWidth;
  const bu = origin.u / s.halfWidth;
  const av = step.v / s.halfHeight;
  const bv = (origin.v - s.centreV) / s.halfHeight;
  const aw = step.w / s.halfDepth;
  const bw = (origin.w - s.centreW) / s.halfDepth;

  const qa = au * au + av * av + aw * aw;
  const qb = 2 * (au * bu + av * bv + aw * bw);
  const qc = bu * bu + bv * bv + bw * bw - 1;
  const disc = qb * qb - 4 * qa * qc;
  if (!(qa > 0) || disc < 0) return null;

  const root = Math.sqrt(disc);
  const view = viewDirection(yaw, pose.pitch);
  let hit: HeadPoint | null = null;
  let nearest = -Infinity;
  for (const t of [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)]) {
    const point: HeadPoint = {
      u: origin.u + step.u * t,
      v: origin.v + step.v * t,
      w: origin.w + step.w * t,
    };
    const towards = point.u * view.u + point.v * view.v + point.w * view.w;
    if (towards > nearest) {
      nearest = towards;
      hit = point;
    }
  }
  if (!hit) return null;

  const n = surfaceNormal(hit);
  const length = Math.hypot(n.u, n.v, n.w);
  if (!(length > 0)) return null;
  const cos = (n.u * view.u + n.v * view.v + n.w * view.w) / length;
  return { point: hit, facing: clamp01(cos / GRAZE_COS) };
}

/**
 * How squarely one face-frame point faced the camera, 0–1. Zero when the
 * point is not on the head at this pose at all.
 */
export function sampleFacing(pose: { yaw: number; pitch: number }, p: FacePoint): number {
  return headHitAt(pose, p)?.facing ?? 0;
}

/**
 * How squarely a whole region faced the camera at this pose, 0–1: the
 * mean of its samples, counting a sample that missed the head as 0.
 *
 * So one number carries both refusals a region can earn — turned away,
 * and not on the head — and it moves smoothly as the head moves rather
 * than flipping when one hand-written angle crosses a threshold.
 */
export function regionFacing(region: ScanRegion, pose: { yaw: number; pitch: number }): number {
  if (!Number.isFinite(pose.yaw) || !Number.isFinite(pose.pitch)) return 0;
  const samples = regionSamples(region, SAMPLE_STEPS);
  if (samples.length === 0) return 0;
  let total = 0;
  for (const s of samples) total += sampleFacing(pose, s);
  return clamp01(total / samples.length);
}

/* -------------------------------- the frame ------------------------------- */

/** A point in fractions of the image: 0–1 across and down. */
export type Point = { x: number; y: number };

/** A point in face coordinates: `u` across in face half-widths, `v` down from the brow. */
export type FacePoint = { u: number; v: number };

/**
 * One frame's face, as whatever tracker took it reported it.
 *
 * Everything spatial is in fractions of the image the mask was computed
 * from — which is the whole still, because the mask is a non-uniform
 * squash of the whole still and nothing else (see the alignment
 * invariant in `hair-segmenter.ts`). So a mask coordinate and an image
 * fraction are the same coordinate, and this module never sees a pixel.
 *
 * `eyes`, `brow` and `chin` are optional because the two trackers report
 * different things; the frame is built from the best of what arrived and
 * says so in `anchoredBy`.
 */
export type FaceObservation = {
  /** The face box, in fractions of the image. */
  bounds: { x: number; y: number; width: number; height: number };
  /** The image's own shape, so a rotation in fraction space is a rotation on the head. */
  image: { width: number; height: number };
  /** Degrees, the tracker's signs. */
  yaw: number;
  pitch: number;
  roll: number;
  /** Outer eye corners, image-left and image-right, in image fractions. */
  eyes?: { left: Point; right: Point } | null;
  /** A point on the brow line, in image fractions. */
  brow?: Point | null;
  /** The chin, in image fractions: what lets the vertical scale be measured rather than assumed. */
  chin?: Point | null;
};

/** Which landmarks the frame below was actually built from. */
export type FrameAnchoring = {
  /** `eyes` when the eye corners set the scale and the roll, `box` when the face box did. */
  scale: 'eyes' | 'box';
  /** `brow` when a brow point set the origin, `eyes` or `box` when it was derived. */
  origin: 'brow' | 'eyes' | 'box';
  /** `chin` when the vertical unit was measured, `proportion` when it came from head proportions. */
  /**
   * Where the face's vertical unit came from.
   *
   * `chin` is a reported chin landmark, `box` the bottom of the
   * detector's own box, `proportion` neither — the horizontal unit
   * turned on its side. Only `chin` grades as landmarks: the box's
   * bottom is a real measured edge and places a region correctly, but it
   * is the extent of a face rather than a point on one, so a scan
   * anchored on it is not as repeatable as one that caught a chin and
   * `compareScans` must keep widening its floor for it.
   */
  vertical: 'chin' | 'box' | 'proportion';
};

/**
 * The same thing in one word, so it can be carried beside a measurement
 * and compared against the next scan's.
 *
 *   landmarks   both units measured: the eye corners across, the chin
 *               down. Two scans anchored this way are in the same units.
 *   partial     the eye corners across, head proportions down. The
 *               vertical unit is now a statement about heads in general.
 *   box         the detector's face box and nothing else. ARKit's box
 *               starts at the upper forehead and ML Kit's at the brow,
 *               so a box-anchored frame is only as comparable as the
 *               phone it was taken on.
 */
export type FrameAnchorGrade = 'landmarks' | 'partial' | 'box';

/** The three-part anchoring, graded. */
export function anchorGradeOf(anchoring: FrameAnchoring): FrameAnchorGrade {
  if (anchoring.scale === 'box') return 'box';
  return anchoring.vertical === 'chin' ? 'landmarks' : 'partial';
}

/** The weaker of two grades, for gathering a scan's frames into one measurement. */
export function weakerGrade(a: FrameAnchorGrade, b: FrameAnchorGrade): FrameAnchorGrade {
  const order: FrameAnchorGrade[] = ['landmarks', 'partial', 'box'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/**
 * A face-anchored coordinate frame for one photograph.
 *
 * `origin`, `ex` and `ey` live in "plate" space — image fractions with
 * the x axis multiplied by the image's aspect ratio, so that one unit
 * across and one unit down are the same distance on the head. Without
 * that, a roll of ten degrees on a 3:4 photograph would tilt the frame
 * by the wrong angle, and every region would sit slightly off a head
 * that was merely tilted.
 */
export type FaceFrame = {
  /** Brow centre, in plate space. */
  origin: Point;
  /** Unit vector along the brow line towards image-right, in plate space. */
  ex: Point;
  /** Unit vector down the face, perpendicular to `ex`, in plate space. */
  ey: Point;
  /** Plate units per face unit across. Already foreshortened, because it was measured that way. */
  unitX: number;
  /** Plate units per face unit down. */
  unitY: number;
  /** The image's width over its height. */
  aspect: number;
  yaw: number;
  pitch: number;
  roll: number;
  anchoredBy: FrameAnchoring;
};

/** Below this, a projected span is noise rather than a measurement. */
const MIN_SPAN = 1e-4;

const cosOf = (deg: number): number =>
  Number.isFinite(deg) ? Math.max(MIN_COS, Math.cos(Math.min(Math.abs(deg), 90) * RAD)) : 1;

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const len = (a: Point): number => Math.hypot(a.x, a.y);

const finitePoint = (p: Point | null | undefined): p is Point =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

/**
 * Builds the frame for one observation, or null when the observation
 * carries nothing to anchor to.
 *
 * Null rather than a default frame, everywhere: a frame built on
 * guesses would place six regions with total confidence on a photograph
 * nobody located a face in, and every number downstream of it would look
 * exactly as trustworthy as a real one.
 */
export function faceFrameOf(face: FaceObservation): FaceFrame | null {
  const { bounds, image } = face;
  if (!(image.width > 0) || !(image.height > 0)) return null;
  if (!(bounds.width > 0) || !(bounds.height > 0)) return null;
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return null;

  const aspect = image.width / image.height;
  /** Image fractions into plate space. */
  const plate = (p: Point): Point => ({ x: p.x * aspect, y: p.y });

  /*
    A pose the tracker did not report is not a pose of zero.

    Substituting 0 here measured an unknown head as square-on, and every
    region then read at full confidence in units nothing had computed —
    the precise failure the head model exists to prevent. `regionFacing`
    refuses a non-finite pose, but that refusal was unreachable from
    `measureScan`, because the NaN had already become a 0 by the time it
    arrived. So the frame is refused instead: a scan is several frames,
    and one without a pose is one the rest can do without.

    Roll keeps its fallback, and that is not the same concession. Roll
    turns the frame's axes in the picture plane and nothing else; with
    eye corners it is not read at all, and without them 0 is the identity
    rather than a claim about where the head was.
  */
  if (!Number.isFinite(face.yaw) || !Number.isFinite(face.pitch)) return null;
  /* The tracker's own yaw, unconverted: the frame STORES this, and
     `coverage.ts` hands `frame.yaw` straight back to `sampleFacing`,
     which converts it itself. Convert here as well and it is converted
     twice, which is the same as not at all — and only at a turn, so the
     front of a scan looks perfectly healthy while the temples read the
     room. Nothing in the frame's own arithmetic needs the image's sense:
     yaw reaches it through `cos` alone, which does not care. */
  const yaw = face.yaw;
  const pitch = face.pitch;
  const roll = Number.isFinite(face.roll) ? face.roll : 0;

  const boxCentre = plate({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });

  /*
    Across the face: the outer eye corners when they arrived, because
    they are two landmarks the tracker actually located and the span
    between them is the same span on every head-on and every turned
    frame. The face box is the fallback and it is a worse one — the two
    detectors do not agree on where a box starts (ARKit's begins at the
    upper forehead, ML Kit's at the brow), so a box-anchored frame is
    only as comparable as the phone it was taken on, which is why
    `anchorGradeOf` grades it apart and `compare.ts` widens its floor.
  */
  let ex: Point;
  let unitX: number;
  let scaleFrom: FrameAnchoring['scale'];
  const eyes = face.eyes;
  const eyeSpan = eyes && finitePoint(eyes.left) && finitePoint(eyes.right)
    ? sub(plate(eyes.right), plate(eyes.left))
    : null;
  const haveEyes = eyeSpan !== null && len(eyeSpan) > MIN_SPAN;
  if (eyeSpan && haveEyes) {
    const span = len(eyeSpan);
    ex = { x: eyeSpan.x / span, y: eyeSpan.y / span };
    // Half the face's width, from the measured eye span and one stated proportion.
    unitX = span / 2 / OUTER_CANTHAL_SHARE;
    scaleFrom = 'eyes';
  } else {
    const r = roll * RAD;
    ex = { x: Math.cos(r), y: -Math.sin(r) };
    unitX = (bounds.width * aspect) / 2;
    scaleFrom = 'box';
  }
  if (!(unitX > MIN_SPAN)) return null;

  /* Perpendicular, pointing down the face: rotate `ex` a quarter turn the way the screen turns. */
  const ey: Point = { x: -ex.y, y: ex.x };

  /*
    The brow line is the origin, because it is the lowest landmark the
    hair regions are measured from and the highest one any tracker
    reports. A reported brow point is used as it is; the eye corners put
    it a stated distance above their midpoint; the box falls back on the
    same proportion `region-crops.ts` uses, so the two agree about where
    a brow is on a face nobody measured one on.
  */
  const eyeMid =
    haveEyes && eyes
      ? {
          x: (plate(eyes.left).x + plate(eyes.right).x) / 2,
          y: (plate(eyes.left).y + plate(eyes.right).y) / 2,
        }
      : null;

  /*
    Sideways, the mid-line comes from the eye corners when there are any
    and from the box otherwise. A brow point only ever sets the HEIGHT of
    the origin: a contour's lowest point is rarely dead centre, and
    letting it set the mid-line too would slide all six regions sideways
    by however far the left eyebrow happened to dip below the right.
  */
  const midline = eyeMid ?? boxCentre;

  let origin: Point;
  let originFrom: FrameAnchoring['origin'];
  if (finitePoint(face.brow)) {
    const drop = dot(sub(plate(face.brow), midline), ey);
    origin = { x: midline.x + ey.x * drop, y: midline.y + ey.y * drop };
    originFrom = 'brow';
  } else if (eyeMid) {
    const lift = BROW_ABOVE_EYES * unitX;
    origin = { x: eyeMid.x - ey.x * lift, y: eyeMid.y - ey.y * lift };
    originFrom = 'eyes';
  } else {
    const lift = BROW_ABOVE_BOX_CENTRE * bounds.height;
    origin = { x: boxCentre.x - ey.x * lift, y: boxCentre.y - ey.y * lift };
    originFrom = 'box';
  }

  /*
    Down the face: measured when a chin arrived, because brow-to-chin is
    a real span on a real head and it carries the pitch foreshortening in
    it already. Otherwise the horizontal unit is un-foreshortened by the
    yaw and re-foreshortened by the pitch — which is where the frame
    stops being measurement and starts being proportion, and is the
    reason everything far above the brow is marked weak.

    The two paths are only interchangeable because `HEAD.chin` is derived
    from the same proportions the fallback uses. When the chin span said
    1.4 and the proportions said 1.56, a frame that caught a chin and one
    that did not placed the same region a tenth of a face apart — and
    both happen inside one scan, because the chin leaves the shot exactly
    when the head goes down for the crown.
  */
  let unitY: number;
  let verticalFrom: FrameAnchoring['vertical'];
  const chin = finitePoint(face.chin) ? plate(face.chin) : null;
  const chinDrop = chin ? dot(sub(chin, origin), ey) : 0;
  /*
    How long the brow-to-chin span looks at this pose, in face units: the
    span itself, less however much of the chin's depth the tilt has
    swung into view. See `CHIN_DEPTH`. Without this term the two paths
    disagree by an eighth of a face at the chin-down beat, which is the
    same defect as a mistyped `HEAD.chin` wearing different clothes.
  */
  const chinSpan =
    HEAD.chin -
    CHIN_DEPTH * Math.cos(clampPose(yaw) * RAD) * Math.tan(clampPose(pitch) * RAD);
  if (chin && chinDrop > MIN_SPAN && chinSpan > MIN_SPAN) {
    unitY = chinDrop / chinSpan;
    verticalFrom = 'chin';
  } else {
    /*
      The bottom of the box, before proportion.

      The proportional path turns the horizontal unit on its side, and
      that is not a face: measured on a real head against a real mask the
      two came out 0.191 from a chin and 0.117 from proportion, so every
      region box stood at three fifths of its height and the hairline
      band sat on the FOREHEAD. The mask then said, correctly, that a
      forehead is not hair — coverage zero and visible scalp a hundred on
      every region, at high confidence, over a head full of it.

      The box's bottom is the chin: the box is the extent of the face the
      detector found, and on the ARKit path that face is a mesh the depth
      camera measured. It is read through the same span as a real chin so
      the two paths cannot drift, and it grades apart from one — see
      `FrameAnchoring.vertical` — because an extent is not a landmark.
    */
    const boxBottom = plate({
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height,
    });
    const boxDrop = dot(sub(boxBottom, origin), ey);
    if (boxDrop > MIN_SPAN && chinSpan > MIN_SPAN) {
      unitY = boxDrop / chinSpan;
      verticalFrom = 'box';
    } else {
      unitY = (unitX / cosOf(yaw)) * cosOf(pitch);
      verticalFrom = 'proportion';
    }
  }
  if (!(unitY > MIN_SPAN)) return null;

  return {
    origin,
    ex,
    ey,
    unitX,
    unitY,
    aspect,
    yaw,
    pitch,
    roll,
    anchoredBy: { scale: scaleFrom, origin: originFrom, vertical: verticalFrom },
  };
}

/** A face-coordinate point, in fractions of the image. */
export function toImage(frame: FaceFrame, p: FacePoint): Point {
  const x = frame.origin.x + frame.ex.x * (p.u * frame.unitX) + frame.ey.x * (p.v * frame.unitY);
  const y = frame.origin.y + frame.ex.y * (p.u * frame.unitX) + frame.ey.y * (p.v * frame.unitY);
  return { x: x / frame.aspect, y };
}

/** An image-fraction point, in face coordinates. The exact inverse of `toImage`. */
export function toFace(frame: FaceFrame, p: Point): FacePoint {
  const d = sub({ x: p.x * frame.aspect, y: p.y }, frame.origin);
  return { u: dot(d, frame.ex) / frame.unitX, v: dot(d, frame.ey) / frame.unitY };
}

/** The face-coordinate box of one region. */
export function regionBox(region: ScanRegion): FaceBox {
  return REGION_BOXES[region];
}

/**
 * A grid of sample points across a region, in face coordinates.
 *
 * Sampling rather than rasterising: the region is a rectangle in the
 * face's frame, which is a rotated, sheared quadrilateral on the image,
 * and walking its samples is both simpler and free of the off-by-one
 * edge cases a scan-line fill has. `steps` squared points, at cell
 * centres so no sample lands on an edge.
 */
export function regionSamples(region: ScanRegion, steps: number): FacePoint[] {
  const n = Math.max(2, Math.floor(steps));
  const box = regionBox(region);
  const out: FacePoint[] = [];
  for (let j = 0; j < n; j += 1) {
    const v = box.v0 + ((j + 0.5) / n) * (box.v1 - box.v0);
    for (let i = 0; i < n; i += 1) {
      out.push({ u: box.u0 + ((i + 0.5) / n) * (box.u1 - box.u0), v });
    }
  }
  return out;
}
