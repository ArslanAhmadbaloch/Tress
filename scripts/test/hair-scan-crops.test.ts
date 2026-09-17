/**
 * The report's region crops have to land where they say they do.
 *
 * A crop labelled "Hairline" that showed the chin, or a temple crop on
 * the wrong side of the face, would be a caption on the wrong picture —
 * which reads as a finding about the wrong place. So the geometry is
 * checked against a drawn face with known proportions, through the same
 * preview→still mapping the processing screen draws the mesh by, and
 * the fallback is checked to be marked as what it is.
 *
 * Nothing here asserts anything about hair. It asserts rectangles.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { meshInBox } from '@/features/hair-scan/engine';
import {
  CROP_GEOMETRY,
  FALLBACK_RECT,
  REPORT_REGIONS,
  clampRect,
  cropFor,
  faceRegionRects,
  regionRectsFor,
  type RegionRect,
} from '@/features/hair-scan/region-crops';
import { syntheticContours } from '@/features/hair-scan/tracking';
import type { FrameMesh, MeshFace } from '@/features/hair-scan/types';
import type { PhotoRegion } from '@/types/domain';

/* ------------------------------ fixtures ------------------------------- */

const BOX = { width: 1000, height: 1000 };

/** A drawn face in the upper middle of a square box, in the box's own pixels. */
function drawnFace(overrides: Partial<MeshFace> = {}): MeshFace {
  const cx = 500;
  const cy = 450;
  const width = 400;
  const height = 520;
  return { cx, cy, width, height, contours: syntheticContours(cx, cy, width, height), ...overrides };
}

const inUnit = (r: RegionRect): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9 && r.w > 0 && r.h > 0;

/* ----------------------------- the geometry ---------------------------- */

test('crops: every region is placed for a drawn face, inside the image', () => {
  const rects = faceRegionRects(drawnFace(), BOX);
  for (const region of REPORT_REGIONS) {
    const r = rects[region];
    assert.ok(r, `${region} was not placed`);
    assert.ok(inUnit(r), `${region} runs outside the image: ${JSON.stringify(r)}`);
  }
});

test('crops: the hairline band sits above the eyebrows and reaches above the top of the oval', () => {
  const face = drawnFace();
  const { hairline } = faceRegionRects(face, BOX);
  assert.ok(hairline);
  const top = face.cy - face.height / 2;
  const brow = Math.min(...(face.contours.LEFT_EYEBROW_TOP ?? []).map((p) => p.y));

  const bottom = (hairline.y + hairline.h) * BOX.height;
  assert.ok(Math.abs(bottom - brow) < 1, `the band closes at the eyebrow line (${bottom} vs ${brow})`);
  assert.ok(Math.abs(hairline.y * BOX.height - (top - CROP_GEOMETRY.hairline.above * face.height)) < 1, 'the band opens above the oval');
  assert.ok(Math.abs(hairline.w * BOX.width - CROP_GEOMETRY.hairline.widthScale * face.width) < 1, 'nine tenths of the face wide');
  assert.ok(Math.abs((hairline.x + hairline.w / 2) * BOX.width - face.cx) < 1, 'centred on the face');
});

test('crops: without eyebrow contours the band closes at the proportion, never at the chin', () => {
  const face = drawnFace({ contours: {} });
  const { hairline } = faceRegionRects(face, BOX);
  assert.ok(hairline);
  const expected = face.cy - CROP_GEOMETRY.hairline.browFallback * face.height;
  assert.ok(Math.abs((hairline.y + hairline.h) * BOX.height - expected) < 1);
  assert.ok((hairline.y + hairline.h) * BOX.height < face.cy, 'the band ends above the centre of the face');
});

test('crops: eyebrow contours that sit above the oval are ignored as out of step with the box', () => {
  const face = drawnFace({ contours: { LEFT_EYEBROW_TOP: [{ x: 400, y: 10 }], RIGHT_EYEBROW_TOP: [{ x: 600, y: 12 }] } });
  const { hairline } = faceRegionRects(face, BOX);
  assert.ok(hairline);
  const expected = face.cy - CROP_GEOMETRY.hairline.browFallback * face.height;
  assert.ok(Math.abs((hairline.y + hairline.h) * BOX.height - expected) < 1);
});

test('crops: the temples sit either side of the oval, image-left for the left temple, and mirror each other', () => {
  const face = drawnFace();
  const { leftTemple, rightTemple } = faceRegionRects(face, BOX);
  assert.ok(leftTemple && rightTemple);
  const cx = face.cx / BOX.width;
  assert.ok(leftTemple.x + leftTemple.w <= cx, 'the left temple is left of centre');
  assert.ok(rightTemple.x >= cx, 'the right temple is right of centre');
  // Mirror images about the centre line.
  assert.ok(Math.abs(cx - (leftTemple.x + leftTemple.w) - (rightTemple.x - cx)) < 1e-9);
  assert.equal(leftTemple.y, rightTemple.y);
  assert.ok(Math.abs(leftTemple.w - rightTemple.w) < 1e-9);
  // Overlapping the oval's edge so the temple itself is inside the crop.
  const ovalLeft = (face.cx - face.width / 2) / BOX.width;
  assert.ok(leftTemple.x + leftTemple.w > ovalLeft, 'the crop reaches into the oval');
  // Above the centre of the face: temples are at the top of the sides.
  assert.ok(leftTemple.y + leftTemple.h < face.cy / BOX.height + 0.05);
});

test('crops: top and crown are one wide band above the oval', () => {
  const face = drawnFace();
  const { top, crown } = faceRegionRects(face, BOX);
  assert.ok(top && crown);
  assert.deepEqual(top, crown);
  assert.ok(top.w > face.width / BOX.width, 'wider than the face');
  assert.ok(top.y < (face.cy - face.height / 2) / BOX.height, 'starts above the oval');
});

test('crops: a face near the edge is clamped, not lost', () => {
  // A face hard against the top-left corner: the hairline band would run off the top.
  const face = drawnFace({ cx: 120, cy: 150 });
  const rects = faceRegionRects(face, BOX);
  for (const region of REPORT_REGIONS) {
    const r = rects[region];
    assert.ok(r && inUnit(r), `${region} is not inside the image: ${JSON.stringify(r)}`);
  }
  assert.equal(rects.hairline?.y, 0, 'the band is cut at the top edge');
  assert.equal(rects.leftTemple?.x, 0, 'the left temple is cut at the left edge');
});

test('crops: a face with no size places nothing', () => {
  assert.deepEqual(faceRegionRects(drawnFace({ width: 0 }), BOX), {});
  assert.deepEqual(faceRegionRects(drawnFace(), { width: 0, height: 1000 }), {});
});

test('clampRect: keeps a rectangle inside the unit square and never thinner than a sliver', () => {
  assert.deepEqual(clampRect({ x: 0.2, y: 0.1, w: 0.5, h: 0.3 }), { x: 0.2, y: 0.1, w: 0.5, h: 0.3 });
  const cut = clampRect({ x: -0.2, y: -0.1, w: 0.5, h: 0.3 });
  assert.equal(cut.x, 0);
  assert.equal(cut.y, 0);
  assert.ok(Math.abs(cut.w - 0.3) < 1e-9 && Math.abs(cut.h - 0.2) < 1e-9, 'the part outside is lost, the rest stays');
  const sliver = clampRect({ x: 0.99, y: 0.5, w: 0.5, h: 0 });
  assert.ok(sliver.w >= 0.05 - 1e-9 && sliver.h >= 0.05 - 1e-9);
  assert.ok(inUnit(sliver));
});

/* ------------------------------ the mapping ----------------------------- */

/** A mesh as the camera adapter hands it: fractions of a portrait preview, with a drawn face. */
function previewMesh(viewAspect = 9 / 16): FrameMesh {
  // The preview is `viewAspect` wide at unit height; the face is drawn in those units, then divided out.
  const view = { width: viewAspect, height: 1 };
  const width = view.width * 0.46;
  const height = width * 1.32;
  const cx = view.width / 2;
  const cy = view.height * 0.42;
  const px = syntheticContours(cx, cy, width, height);
  const contours: FrameMesh['contours'] = {};
  for (const [name, points] of Object.entries(px)) {
    contours[name as keyof typeof px] = points.map((p) => ({ x: p.x / view.width, y: p.y / view.height }));
  }
  return {
    bounds: { x: (cx - width / 2) / view.width, y: (cy - height / 2) / view.height, width: width / view.width, height: height / view.height },
    contours,
    viewAspect,
  };
}

test('regionRectsFor: the rectangles are the face as meshInBox lays it in the still, divided by the still', () => {
  const mesh = previewMesh();
  const still = { width: 1080, height: 1440 };
  const rects = regionRectsFor(mesh, still);
  const face = meshInBox(mesh, still, still);
  const expected = faceRegionRects(face, still);
  assert.deepEqual(rects, expected);
  for (const region of REPORT_REGIONS) assert.ok(rects[region] && inUnit(rects[region] as RegionRect), region);
  // The still is wider than the preview's crop of it, so the face lands narrower in the still than in the preview.
  const hairline = rects.hairline as RegionRect;
  assert.ok(hairline.w < CROP_GEOMETRY.hairline.widthScale * mesh.bounds.width, 'the preview crop was undone');
  assert.ok(Math.abs(hairline.x + hairline.w / 2 - 0.5) < 1e-9, 'a centred face stays centred');
});

test('regionRectsFor: a mesh or still with no size places nothing', () => {
  const mesh = previewMesh();
  assert.deepEqual(regionRectsFor({ ...mesh, bounds: { ...mesh.bounds, width: 0 } }, { width: 1080, height: 1440 }), {});
  assert.deepEqual(regionRectsFor(mesh, { width: 0, height: 1440 }), {});
  assert.deepEqual(regionRectsFor({ ...mesh, viewAspect: 0 }, { width: 1080, height: 1440 }), {});
});

/* ------------------------------- the crop ------------------------------- */

test('cropFor: a stored rectangle is used as it is, and a missing one falls back and says so', () => {
  const photo = { uri: 'file:///front.jpg', width: 1080, height: 1440, regions: { hairline: { x: 0.1, y: 0.05, w: 0.8, h: 0.3 } } };
  const placed = cropFor(photo, 'hairline');
  assert.deepEqual(placed.rect, { x: 0.1, y: 0.05, w: 0.8, h: 0.3 });
  assert.equal(placed.approximate, false);
  assert.equal(placed.uri, photo.uri);
  assert.equal(placed.width, 1080);
  assert.equal(placed.height, 1440);

  const fallback = cropFor(photo, 'leftTemple');
  assert.deepEqual(fallback.rect, FALLBACK_RECT);
  assert.equal(fallback.approximate, true);

  const bare = cropFor({ uri: 'x', width: 10, height: 10 }, 'top');
  assert.equal(bare.approximate, true);
  assert.deepEqual(bare.rect, FALLBACK_RECT);
});

test('cropFor: a rectangle off disk is checked before it is drawn', () => {
  const regions = { hairline: { x: 'a', y: 0, w: 1, h: 1 } } as unknown as Partial<Record<PhotoRegion, RegionRect>>;
  const crop = cropFor({ uri: 'x', width: 10, height: 10, regions }, 'hairline');
  assert.equal(crop.approximate, true, 'a malformed rectangle is the fallback, not a crash');
  const outside = cropFor({ uri: 'x', width: 10, height: 10, regions: { top: { x: 0.9, y: -0.5, w: 0.5, h: 0.6 } } }, 'top');
  assert.ok(inUnit(outside.rect), 'a stored rectangle is clamped on the way out');
  assert.equal(outside.approximate, false);
});

test('the fallback is a centred upper third', () => {
  assert.ok(Math.abs(FALLBACK_RECT.x + FALLBACK_RECT.w / 2 - 0.5) < 1e-9);
  assert.equal(FALLBACK_RECT.y, 0);
  assert.ok(FALLBACK_RECT.h <= 0.34 + 1e-9);
});
