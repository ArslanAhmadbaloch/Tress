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
 * The still is written mirrored, as the preview is, so the person's left
 * temple is on the viewer's left in the image, in a front frame and in a
 * turned one alike. `leftTemple` is therefore always the image-left
 * corner beside the face box, and `rightTemple` the image-right one.
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

import { meshInBox } from './engine';
import type { FrameMesh, MeshFace, Size } from './types';

/** A rectangle in fractions of the image; `PhotoRegionRect` under its report name. */
export type RegionRect = PhotoRegionRect;

/** The five places the report crops, in the order the rows show them. */
export const REPORT_REGIONS: readonly PhotoRegion[] = ['hairline', 'leftTemple', 'rightTemple', 'crown', 'top'];

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
export function faceRegionRects(face: MeshFace, box: Size): Partial<Record<PhotoRegion, RegionRect>> {
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
  const leftTemple = px({ x: cx - g.temple.inset * width - templeW, y: templeY, w: templeW, h: templeH });
  const rightTemple = px({ x: cx + g.temple.inset * width, y: templeY, w: templeW, h: templeH });

  const topBand = px({
    x: cx - (g.top.widthScale / 2) * width,
    y: top - g.top.above * height,
    w: g.top.widthScale * width,
    h: g.top.height * height,
  });

  return { hairline, leftTemple, rightTemple, top: topBand, crown: topBand };
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
export function regionRectsFor(mesh: FrameMesh, still: Size): Partial<Record<PhotoRegion, RegionRect>> {
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
