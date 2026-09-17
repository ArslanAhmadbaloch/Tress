/**
 * The arithmetic of the report screen, kept apart from its React.
 *
 * Three kinds of sums live here, and the tests in
 * scripts/test/hair-scan-report.test.ts pin every one of them:
 *
 * - Where a crop's picture sits inside its square. A crop is a rectangle
 *   in fractions of a photograph; the square shows exactly that rectangle,
 *   so the photograph is scaled until the rectangle fills the square and
 *   slid so the rectangle's corner meets the square's. Get this wrong and
 *   a row labelled "Hairline" shows a chin.
 * - Which section the Next pill goes to from where the reader is, and
 *   which rows a tab shows.
 * - Where the mesh sits on the hero. The record keeps no face — a photo
 *   is a photo, not a face reading — but it keeps the region rectangles,
 *   which were built from the face box by fixed proportions
 *   (features/hair-scan/region-crops.ts). The two temple boxes run
 *   backwards to the box that made them; the hairline band checks the
 *   answer when the clamp has not touched it. A record whose rectangles
 *   disagree draws no mesh, which is the honest fallback: a cap that does
 *   not sit on the head is worse than no cap.
 * - What the scroll does to the still: how far it slides under the sheet,
 *   when the chrome over it has gone, when the strip under the status bar
 *   is painted. These run on the UI thread, so they carry the `'worklet'`
 *   directive and take Reduce Motion as an argument — under it the still
 *   does not move and the chrome steps rather than fades.
 * - Where the marks on a crop go: a few points along the segmenter's top
 *   edge, in the crop's own window, spaced so they read as points.
 *
 * Pure: no React, nothing native. Loaded by `node --test`.
 */

import { MASK_BOX, type ParsedMaskTrace, type Projector } from '@/components/report/mask-overlay-model';
import { CROP_GEOMETRY, type RegionRect, type ReportCrop } from '@/features/hair-scan/region-crops';
import { syntheticContours } from '@/features/hair-scan/tracking';
import type { MeshFace, Size } from '@/features/hair-scan/types';
import type { AnalysisRow, ReportTab } from '@/features/hair-scan/report-model';
import type { PhotoRegion, PhotoRegionRect } from '@/types/domain';

/* --------------------------------- crops --------------------------------- */

/** How a crop's photograph is drawn inside its square, in points. */
export type CropLayout = {
  /** The photograph's drawn size. */
  imageWidth: number;
  imageHeight: number;
  /** Where the photograph's top-left corner sits, relative to the square. Zero or negative. */
  translateX: number;
  translateY: number;
};

/**
 * The photograph scaled so the crop rectangle covers the box and slid so
 * the rectangle's corner meets the box's corner; the box clips the rest.
 * The scale is the larger of the two the rectangle's sides ask for, so a
 * rectangle wider than the box is tall is centred vertically and clipped
 * at the sides, never letterboxed. A crop with no size, or a box with
 * none, draws the photograph filling the box the plain way.
 */
export function cropLayout(crop: Pick<ReportCrop, 'width' | 'height' | 'rect'>, box: Size): CropLayout {
  const { rect } = crop;
  const ok =
    crop.width > 0 && crop.height > 0 && box.width > 0 && box.height > 0 && rect.w > 0 && rect.h > 0;
  if (!ok) {
    return { imageWidth: box.width, imageHeight: box.height, translateX: 0, translateY: 0 };
  }
  const rectW = rect.w * crop.width;
  const rectH = rect.h * crop.height;
  const scale = Math.max(box.width / rectW, box.height / rectH);
  const imageWidth = crop.width * scale;
  const imageHeight = crop.height * scale;
  // The rectangle, drawn, is a little larger than the box on one axis; it
  // is centred on that axis so the crop shows the middle of the place.
  const drawnRectW = rectW * scale;
  const drawnRectH = rectH * scale;
  const translateX = -(rect.x * imageWidth) - (drawnRectW - box.width) / 2;
  const translateY = -(rect.y * imageHeight) - (drawnRectH - box.height) / 2;
  return { imageWidth, imageHeight, translateX, translateY };
}

/* ---------------------------------- tabs --------------------------------- */

/** The rows a tab shows: every row for `all`, otherwise the rows that name it. */
export function rowsForTab<T extends Pick<AnalysisRow, 'tab'>>(rows: T[], tab: ReportTab): T[] {
  if (tab === 'all') return rows;
  return rows.filter((r) => r.tab === tab);
}

/* -------------------------------- sections ------------------------------- */

/**
 * A section counts as reached once the reader has scrolled to within this
 * many points of its top: a pill that sent somebody to a section they
 * were already looking at would appear to do nothing.
 */
export const SECTION_REACHED_WITHIN = 24;

/**
 * The index of the section the Next pill goes to from `scrollY`: the
 * first section whose top is still below the reader by more than the
 * tolerance. Null when the reader is at or past the last section, which
 * is when the pill turns into the way out. Sections whose offsets are
 * not yet measured (null) are skipped.
 */
export function nextSectionIndex(
  offsets: readonly (number | null)[],
  scrollY: number,
  reachedWithin = SECTION_REACHED_WITHIN,
): number | null {
  for (let i = 0; i < offsets.length; i += 1) {
    const y = offsets[i];
    if (y === null) continue;
    if (y - scrollY > reachedWithin) return i;
  }
  return null;
}

/**
 * Which sections have come into view, given where the reader is and how
 * tall the viewport is. A section is in view once its top is above the
 * bottom of the viewport by at least `lead` points, so it starts landing
 * a moment before it is fully there. Sections with no measured offset
 * are not in view. Indices, in order.
 */
export function sectionsInView(
  offsets: readonly (number | null)[],
  scrollY: number,
  viewportHeight: number,
  lead = 48,
): number[] {
  const bottom = scrollY + viewportHeight;
  const out: number[] = [];
  for (let i = 0; i < offsets.length; i += 1) {
    const y = offsets[i];
    if (y === null) continue;
    if (y + lead <= bottom) out.push(i);
  }
  return out;
}

/* ---------------------------------- hero --------------------------------- */

/** The hero fills this share of the screen's height at most; the sheet begins at its foot. */
export const HERO_HEIGHT_SHARE = 0.72;
/** How far the sheet's top rises over the hero's foot. */
export const SHEET_OVERLAP = 28;

/**
 * The hero's height for a screen and a photograph: the photograph's own
 * aspect at the screen's width, held under the share of the screen the
 * sheet leaves it. A photograph with no size takes the share outright.
 */
export function heroHeight(photo: Size, screen: Size): number {
  const cap = Math.round(screen.height * HERO_HEIGHT_SHARE);
  if (!(photo.width > 0) || !(photo.height > 0) || !(screen.width > 0)) return cap;
  return Math.min(cap, Math.round((screen.width * photo.height) / photo.width));
}

/** How near two fractions must be, as fractions of the image, for a rectangle to count as unclamped. */
const REGION_TOLERANCE = 0.012;

/**
 * The face box the stored region rectangles were built from, in fractions
 * of the photograph, or null when the rectangles do not agree with each
 * other — which is what a clamped rectangle looks like from here.
 *
 * `faceRegionRects` builds the temple boxes `temple.width` face-widths
 * wide and `temple.height` face-heights tall, `inset` face-widths out
 * from the centre on each side, with their tops `temple.above` above the
 * oval. Those fixed proportions run backwards from the two temples alone:
 * the centre is the midpoint of the gap between them, the width is the
 * gap over twice the inset, the height is a temple's own height. Each
 * temple then has to be the size the proportions give it, or a clamp has
 * touched one and nothing is placed.
 *
 * The hairline band is the check, not the source. It is the highest of
 * the rectangles, so it is the first the clamp touches — a face-on frame
 * with hair filling the top of the picture clamps the band at the top
 * edge and leaves the temples whole — and a hero that drew no mesh for
 * every such frame would be a bare photograph most of the time. A band
 * that agrees with the temples confirms them; one the clamp has touched
 * (it sits on an edge of the picture) is ignored; one that touches no
 * edge and still disagrees means the record is not one `faceRegionRects`
 * wrote, and nothing is placed.
 */
export function faceFromRegions(
  regions: Partial<Record<PhotoRegion, PhotoRegionRect>> | undefined,
): { cx: number; cy: number; width: number; height: number } | null {
  const left = regions?.leftTemple;
  const right = regions?.rightTemple;
  if (!left || !right) return null;
  if (!rectFinite(left) || !rectFinite(right)) return null;

  const g = CROP_GEOMETRY;
  const near = (a: number, b: number) => Math.abs(a - b) <= REGION_TOLERANCE;

  // temple gap = 2 * inset * width ; left ends at cx - inset*width, right starts at cx + inset*width
  const leftEnd = left.x + left.w;
  const gap = right.x - leftEnd;
  const width = gap / (2 * g.temple.inset);
  if (!(width > 0)) return null;
  const cx = (leftEnd + right.x) / 2;

  // The temples are whole only when each is the size the proportions give it.
  const templeW = g.temple.width * width;
  if (!near(left.w, templeW) || !near(right.w, templeW)) return null;
  if (!near(left.h, right.h) || !near(left.y, right.y)) return null;
  const height = left.h / g.temple.height;
  if (!(height > 0)) return null;
  // A temple sitting on the top edge is one the clamp has cut down, and its height is not a face's.
  if (left.y <= 0 || right.y <= 0) return null;

  // temple top = ovalTop - temple.above*h
  const ovalTop = left.y + g.temple.above * height;
  const cy = ovalTop + height / 2;

  // The band: confirms the temples when the clamp left it alone.
  const hairline = regions?.hairline;
  if (hairline && rectFinite(hairline)) {
    const bandW = g.hairline.widthScale * width;
    const bandX = cx - bandW / 2;
    const bandY = ovalTop - g.hairline.above * height;
    const agrees = near(hairline.x, bandX) && near(hairline.w, bandW) && near(hairline.y, bandY);
    const onEdge = hairline.y <= 0 || hairline.x <= 0 || hairline.x + hairline.w >= 1;
    if (!agrees && !onEdge) return null;
  }

  // Inside the picture, at least as a centre: a face whose centre is off the frame is nothing to draw on.
  if (cx < 0 || cx > 1 || cy < 0 || cy > 1) return null;
  return { cx, cy, width, height };
}

function rectFinite(r: RegionRect): boolean {
  return [r.x, r.y, r.w, r.h].every((n) => typeof n === 'number' && Number.isFinite(n));
}

/**
 * A face in fractions of the photograph laid into a box the photograph
 * is drawn in with cover fit — the rule `expo-image` draws the hero by —
 * as the points `StaticHairMesh` draws from, with the synthetic contours
 * the mesh builder needs where the record kept none.
 */
export function faceInBox(
  face: { cx: number; cy: number; width: number; height: number },
  photo: Size,
  box: Size,
): MeshFace | null {
  if (!(photo.width > 0) || !(photo.height > 0) || !(box.width > 0) || !(box.height > 0)) return null;
  const scale = Math.max(box.width / photo.width, box.height / photo.height);
  const drawnW = photo.width * scale;
  const drawnH = photo.height * scale;
  const offX = (box.width - drawnW) / 2;
  const offY = (box.height - drawnH) / 2;
  const cx = offX + face.cx * drawnW;
  const cy = offY + face.cy * drawnH;
  const width = face.width * drawnW;
  const height = face.height * drawnH;
  if (!(width > 0) || !(height > 0)) return null;
  return { cx, cy, width, height, contours: syntheticContours(cx, cy, width, height) };
}

/* -------------------------------- the scroll ------------------------------ */

/** How much of the scroll the still gives back as it slides under the sheet. */
export const HERO_PARALLAX = 0.35;

/**
 * Where the still sits for a scroll: it slides up by a share of the
 * sheet's travel so the sheet appears to rise over it. Under Reduce
 * Motion the still does not move — a picture that drifts against the
 * finger is the canonical thing that setting turns off.
 */
export function heroShift(scrollY: number, reduceMotion: boolean, share = HERO_PARALLAX): number {
  'worklet';
  if (reduceMotion || !(scrollY > 0)) return 0;
  return -scrollY * share;
}

/**
 * The chrome over the still — the date chip and the way back — for a
 * scroll: gone by `fadeBy`. It fades along the way, or, under Reduce
 * Motion, is simply there and then simply not.
 */
export function chromeOpacity(scrollY: number, fadeBy: number, reduceMotion: boolean): number {
  'worklet';
  const by = Math.max(1, fadeBy);
  if (reduceMotion) return scrollY >= by ? 0 : 1;
  const t = Math.max(0, Math.min(1, scrollY / by));
  return 1 - t;
}

/**
 * The strip under the status bar, which the still would otherwise show
 * through for the whole of the report: the sheet's scroll view starts
 * under the status bar, and the still slides up more slowly than the
 * sheet, so it stays under the clock for as long as anybody reads. The
 * strip is painted in the sheet's own colour as the sheet's top comes up
 * to meet it — it fades in over the last status-bar-height of the
 * approach and is solid the moment the tab row sticks — and the status
 * bar flips to the theme's own ink half-way through. Under Reduce Motion
 * there is no approach: strip, status bar and the row's squaring all
 * step together the moment the row sticks.
 */
export function stripOpacity(scrollY: number, spacerH: number, insetTop: number, reduceMotion: boolean): number {
  'worklet';
  if (reduceMotion || insetTop <= 0) return scrollY >= statusFlipAt(spacerH, insetTop, reduceMotion) ? 1 : 0;
  const from = spacerH - insetTop;
  return Math.max(0, Math.min(1, (scrollY - from) / insetTop));
}

/**
 * The scroll at which the status bar leaves the still and takes the
 * sheet's ink: half-way through the strip's fade, or, when there is no
 * fade, the moment the row sticks.
 */
export function statusFlipAt(spacerH: number, insetTop: number, reduceMotion: boolean): number {
  'worklet';
  if (reduceMotion || insetTop <= 0) return spacerH;
  return spacerH - insetTop / 2;
}

/**
 * Whether the pill comes back when a drag ends: only when the finger
 * left the sheet still, so the pill does not flash between a flick and
 * the glide that follows it. The glide's own end brings it back.
 */
export function pillReturnsAfterDrag(velocityY: number | undefined): boolean {
  'worklet';
  return velocityY === undefined || Math.abs(velocityY) < 0.05;
}

/**
 * How far the sheet must scroll between two readings on the JS side. The
 * still and the chrome follow every frame on the UI thread; what the JS
 * side keeps — which sections have entered, where the pill goes, whether
 * the sheet has reached the top — changes by the section, not the point.
 */
export const SETTLE_EVERY = 32;

/**
 * Whether a scroll reading is worth handing to the JS side: it has moved
 * far enough since the last one, or it has crossed one of the lines the
 * JS side switches on — the status bar's flip and the tab row's sticking.
 */
export function shouldSettle(previous: number, next: number, lines: readonly number[], every = SETTLE_EVERY): boolean {
  'worklet';
  if (Math.abs(next - previous) >= every) return true;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (previous < line !== next < line) return true;
  }
  return false;
}

/* ------------------------------- crop marks ------------------------------- */

/** A point on a crop, in the drawn photograph's points. */
export type EdgeDot = { x: number; y: number };

/** The least distance between two marks: closer and they read as a line. */
export const DOT_SPACING = 14;
/** The most marks one crop carries. */
export const DOTS_MAX = 16;

/**
 * Points along the segmenter's top edge that land inside a crop's window.
 *
 * The edge runs are the highest row the mask held per column, in the
 * 1024-box; they go through the same cover fit the photograph is drawn
 * with (`project`, over the drawn size), and only the points inside the
 * window the crop shows are kept — the window is `visible`, in the drawn
 * photograph's points, since the crop is a clipped view of the whole
 * picture. Points closer than `spacing` to the last one kept are dropped
 * so the marks are marks, and the count is capped. Nothing is smoothed
 * or interpolated: every point is a vertex the tracer stored.
 */
export function edgeDots(
  trace: ParsedMaskTrace,
  project: Projector,
  visible: { x: number; y: number; width: number; height: number },
  spacing = DOT_SPACING,
  max = DOTS_MAX,
): EdgeDot[] {
  const out: EdgeDot[] = [];
  const right = visible.x + visible.width;
  const bottom = visible.y + visible.height;
  for (const run of trace.topEdge) {
    for (let i = 0; i + 1 < run.length; i += 2) {
      const x = project.x(run[i] / MASK_BOX);
      const y = project.y(run[i + 1] / MASK_BOX);
      if (x < visible.x || x > right || y < visible.y || y > bottom) continue;
      const last = out[out.length - 1];
      if (last && Math.hypot(x - last.x, y - last.y) < spacing) continue;
      out.push({ x, y });
      if (out.length >= max) return out;
    }
  }
  return out;
}
