/**
 * Where on a photograph the report's region crops sit.
 *
 * A crop is a place, not a finding. The hairline crop is the band above
 * the face box; the temple crops are the corners beside it; the top and
 * crown crops are the upper part of a frame taken with the head tipped
 * down. Nothing here reads a pixel — the rectangles are built from the
 * face box and contours the detector held on the live preview at the
 * shutter, and from nothing else.
 *
 * ── Preview → still ───────────────────────────────────────────────────
 * The detector's mesh is in fractions of the preview view, which showed
 * an aspect-fill crop of the whole camera frame; the still is that whole
 * frame. `meshInBox` in engine.ts undoes the crop for the processing
 * screen, and the same call — with the still itself as the box — lands
 * the face in the still's own pixels here, so a crop drawn on the report
 * and the wireframe drawn during processing agree about where the face
 * was. Divided by the still's size the result is fractions of the image,
 * which is how `Photo.regions` stores them and how the report's crop
 * component reads them back.
 *
 * ── Mirroring ─────────────────────────────────────────────────────────
 * Which side of the image a person's own left temple lands on is decided
 * in one place, `handedness.ts`, and read here as `OWN_LEFT_SIDE`. It
 * holds in a front frame and in a turned one alike. Do not write the
 * sign out again below: the whole point of the constant is that the
 * preview, the mesh, the still and these crops move together or not at
 * all, and a temple cut from the wrong side is a mistake a symmetric
 * head hides completely.
 *
 * ── Two detectors, two boxes ──────────────────────────────────────────
 * This is the one place where the platforms are NOT the same, and an
 * earlier draft of this comment claimed they were. They are not.
 *
 * On Android the face box and the eyebrow contours both come from ML
 * Kit, and the box runs from about the brow to the chin. On an iPhone
 * the box is the extent of ARKit's face rim, and `modules/hair-face-
 * tracking/src/points.ts` is explicit about where that rim starts: ARKit's
 * face geometry is a mask reaching up to the UPPER FOREHEAD, so slot 0
 * of the rim is the top of the forehead, not the brow and not the top of
 * the head. The ARKit box top therefore sits higher on a head than the
 * ML Kit one — by roughly the height of a forehead. There are no ML Kit
 * contours on that path either, so `browLine` finds none and the
 * hairline band closes on the proportional brow below.
 *
 * Every rectangle here is measured from the box top, so every rectangle
 * sits a little higher on an iPhone than on an Android phone: the
 * hairline band reaches further into the hair, and the temple boxes sit
 * nearer the temples' upper end. Both are still the place they are
 * named — a hairline band that starts above the hairline still contains
 * it — and one record is still written either way, which is what keeps
 * the report platform-blind. What cannot be claimed is that the numbers
 * below were fitted to both: `CROP_GEOMETRY.hairline.above` was chosen
 * against an ML Kit box, and nobody has yet held an iPhone up and looked
 * at where the band lands. That check is in this build's deviceOnly list,
 * and this comment is not to be softened until somebody has done it.
 *
 * ── The fallback ──────────────────────────────────────────────────────
 * A photograph with no stored regions — a frame the tracker had no face
 * for, a build without the detector, a photograph from before regions
 * were kept — is cropped to a centred upper third and the crop is marked
 * `approximate`, so the report can say it is showing the top of the
 * picture rather than the place it names.
 *
 * Pure: no React, nothing native. Loaded by `node --test`.
 */

import type { Photo, PhotoRegion, PhotoRegionRect } from '@/types/domain';

import { REQUIRED_REGIONS, meshInBox } from './engine';
import type { FrameMesh, MeshFace, ScanTarget, Size } from './types';
import { OWN_LEFT_SIDE, OWN_RIGHT_SIDE } from '@/features/hair-scan/handedness';

/** A rectangle in fractions of the image; `PhotoRegionRect` under its report name. */
export type RegionRect = PhotoRegionRect;

/**
 * The four places the scan itself sets out to photograph, in the order
 * the choreography reaches them: the front hairline and both temples
 * while the head turns, then the crown once it is lowered.
 *
 * It is the engine's own list of wanted regions rather than a second
 * copy of it — every `ScanTarget` is also a `PhotoRegion`, and the day
 * that stops being true this assignment is a compile error rather than a
 * report quietly cropping a place the scan never went to.
 */
export const SCAN_REGIONS: readonly PhotoRegion[] = REQUIRED_REGIONS;

/**
 * A place a crop can be taken: every region the scan photographs, plus
 * the journal's own `top`, which is what a crown frame is filed under
 * (see `ANGLE_OF_TARGET` in result.ts).
 *
 * Written as the scan's own list plus one rather than as five strings,
 * so the report's places and the scan's places cannot drift apart: this
 * type is the return type of `faceRegionRects` below, and that function
 * builds a rectangle for every member, so adding a `ScanTarget` the
 * geometry has no rectangle for is a compile error in production code
 * rather than a row the report renders empty.
 */
export type ReportRegion = ScanTarget | 'top';

/** The five places the report crops, in the order the rows show them. */
export const REPORT_REGIONS: readonly ReportRegion[] = [...REQUIRED_REGIONS, 'top'];

/**
 * A crop the report draws: which image, how big it is, and the rectangle
 * on it. `approximate` is true when the rectangle is the fallback rather
 * than a place the detector located.
 */
export type ReportCrop = {
  uri: string;
  width: number;
  height: number;
  /** Fractions of the image. */
  rect: RegionRect;
  approximate?: boolean;
};

/* ------------------------------- geometry ------------------------------- */

/**
 * The proportions of each crop, relative to the face box.
 *
 * Hairline: a band about nine tenths of the face width, from the eyebrow
 * line up to a third of the face height above the top of the oval —
 * forehead and hairline, whatever sits there. Temples: a box beside each
 * upper corner of the oval, overlapping its edge a little so the temple
 * itself is inside it. Top and crown: a wide band above the oval, which
 * on a head tipped down is where the top of the head appears.
 */
export const CROP_GEOMETRY = Object.freeze({
  hairline: { widthScale: 0.9, above: 0.35, browFallback: 0.21 },
  temple: { width: 0.45, height: 0.45, inset: 0.3, above: 0.2 },
  top: { widthScale: 1.3, above: 0.6, height: 0.7 },
});

/** A centred upper third of the image: what stands in when no face was placed. */
export const FALLBACK_RECT: RegionRect = Object.freeze({ x: 0.2, y: 0, w: 0.6, h: 0.34 });

/** The smallest side a crop may have, as a fraction: below this a crop is a sliver, not a picture. */
const MIN_SIDE = 0.05;

const unit = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * The rectangle held inside the image. Both corners are clamped, so a
 * rectangle that ran off the top keeps its bottom edge where it was and
 * loses only the part that was outside. A rectangle left thinner than
 * `MIN_SIDE` by the clamp is widened back inward.
 */
export function clampRect(rect: RegionRect): RegionRect {
  const inside =
    rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= 1 && rect.y + rect.h <= 1 && rect.w >= MIN_SIDE && rect.h >= MIN_SIDE;
  if (inside) return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  const x0 = unit(rect.x);
  const y0 = unit(rect.y);
  let x1 = unit(rect.x + rect.w);
  let y1 = unit(rect.y + rect.h);
  if (x1 - x0 < MIN_SIDE) x1 = Math.min(1, x0 + MIN_SIDE);
  if (y1 - y0 < MIN_SIDE) y1 = Math.min(1, y0 + MIN_SIDE);
  const x = Math.min(x0, x1 - MIN_SIDE);
  const y = Math.min(y0, y1 - MIN_SIDE);
  return { x: unit(x), y: unit(y), w: x1 - unit(x), h: y1 - unit(y) };
}

/** The lowest point of the eyebrow contours, or null when none were reported. */
function browLine(face: MeshFace): number | null {
  const points = [...(face.contours.LEFT_EYEBROW_TOP ?? []), ...(face.contours.RIGHT_EYEBROW_TOP ?? [])];
  const ys = points.map((p) => p.y).filter((y) => Number.isFinite(y));
  return ys.length === 0 ? null : Math.min(...ys);
}

/**
 * The region rectangles for a face laid out in a box, as fractions of
 * that box. The box is the still itself when the caller has mapped the
 * mesh into it; the tests hand in a drawn face directly.
 *
 * Empty when the face has no size — a box of zero width places nothing.
 */
export function faceRegionRects(face: MeshFace, box: Size): Partial<Record<ReportRegion, RegionRect>> {
  if (!(face.width > 0) || !(face.height > 0) || !(box.width > 0) || !(box.height > 0)) return {};

  const { cx, cy, width, height } = face;
  const top = cy - height / 2;
  const g = CROP_GEOMETRY;

  // The eyebrow line closes the hairline band; a reported one is used
  // only when it sits below the top of the oval, which is where eyebrows
  // are. Anything else is the detector's contours out of step with its
  // box, and the proportion stands in.
  const reported = browLine(face);
  const brow = reported !== null && reported > top + 0.05 * height ? reported : cy - g.hairline.browFallback * height;

  const px = (rect: { x: number; y: number; w: number; h: number }): RegionRect =>
    clampRect({ x: rect.x / box.width, y: rect.y / box.height, w: rect.w / box.width, h: rect.h / box.height });

  const hairlineTop = top - g.hairline.above * height;
  const hairline = px({
    x: cx - (g.hairline.widthScale / 2) * width,
    y: hairlineTop,
    w: g.hairline.widthScale * width,
    h: brow - hairlineTop,
  });

  const templeY = top - g.temple.above * height;
  const templeW = g.temple.width * width;
  const templeH = g.temple.height * height;
  /* The corner beside the face box on one side: image-left when `side`
     is -1, image-right when it is +1. */
  const templeAt = (side: 1 | -1) =>
    px({
      x: side < 0 ? cx - g.temple.inset * width - templeW : cx + g.temple.inset * width,
      y: templeY,
      w: templeW,
      h: templeH,
    });
  const leftTemple = templeAt(OWN_LEFT_SIDE);
  const rightTemple = templeAt(OWN_RIGHT_SIDE);

  const topBand = px({
    x: cx - (g.top.widthScale / 2) * width,
    y: top - g.top.above * height,
    w: g.top.widthScale * width,
    h: g.top.height * height,
  });

  /*
    Every place the report can crop, named one by one and typed as a
    whole record rather than a partial one: a region added to the scan
    with no rectangle here stops the build, which is the only way a list
    in one file and a geometry in another stay the same list.

    `crown` and `top` are deliberately the same band. A crown frame is
    the head tipped down and photographed from the front, so the top of
    the head IS what is in the upper part of the picture; the journal
    keeps two names for it because `crown` there means the back of a
    head, which this scan never sees.
  */
  const rects: Record<ReportRegion, RegionRect> = {
    hairline,
    leftTemple,
    rightTemple,
    crown: topBand,
    top: topBand,
  };
  return rects;
}

/**
 * The region rectangles for a kept frame, from the mesh the live camera
 * had at its shutter, as fractions of the still.
 *
 * The mesh is mapped into the still through `meshInBox` with the still
 * as the box — the same cover-fit rule the processing screen draws the
 * wireframe by — so the report's crops and the mesh on the still agree.
 * Empty when the mesh or the still has no size.
 */
export function regionRectsFor(mesh: FrameMesh, still: Size): Partial<Record<ReportRegion, RegionRect>> {
  if (!(mesh.bounds.width > 0) || !(mesh.bounds.height > 0)) return {};
  if (!(still.width > 0) || !(still.height > 0)) return {};
  if (!(mesh.viewAspect > 0) || !Number.isFinite(mesh.viewAspect)) return {};
  const face = meshInBox(mesh, still, still);
  return faceRegionRects(face, still);
}

/* -------------------------------- crops --------------------------------- */

/**
 * The crop of one region on one photograph: the stored rectangle when
 * the frame carries it, the fallback — marked approximate — when it does
 * not. A photograph is always croppable, so the report never has a row
 * with an image and no picture on it.
 */
export function cropFor(
  photo: Pick<Photo, 'uri' | 'width' | 'height' | 'regions'>,
  region: PhotoRegion,
): ReportCrop {
  const stored = photo.regions?.[region];
  const rect = stored && isRect(stored) ? clampRect(stored) : null;
  return {
    uri: photo.uri,
    width: photo.width,
    height: photo.height,
    rect: rect ?? { ...FALLBACK_RECT },
    approximate: rect === null,
  };
}

/** Whether a stored value is a rectangle at all: everything on disk is checked before it is drawn. */
function isRect(value: unknown): value is RegionRect {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return ['x', 'y', 'w', 'h'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number));
}
