/**
 * The mask overlay's transform, its reading of a stored trace, and its words.
 *
 * The transform is the part of this feature that breaks silently. A mask
 * projected through the wrong fit sits off the head, nothing throws, and
 * the standard 1440×1920 portrait has no crop at all — so it looks perfect
 * in every casual check and breaks on the tall photograph nobody tested.
 * The three fixtures below are the three shapes the frame can take, and
 * the tall one is the case the top edge lives in.
 *
 * The strings are swept here because a string that never reaches
 * `readingSentences` escapes the canonical sweep in assessment.test.ts.
 * This applies the identical `assertHonest`, so they are never unswept —
 * only swept somewhere else until the overlay's copy is routed through the
 * reading.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MASK_BOX,
  MASK_OVERLAY_COPY,
  frameAspect,
  hasVisibleEdge,
  maskPaths,
  maskTraceOf,
  projector,
} from '@/components/report/mask-overlay-model';

import { assertHonest } from './honesty-words';

/** The three photograph shapes, at the frame width a phone actually gives. */
const FRAME_W = 390;
const STANDARD = { width: 1440, height: 1920 };
const TALL = { width: 1440, height: 2200 };
const WIDE = { width: 1600, height: 1440 };

function frameFor(photo: { width: number; height: number }) {
  const aspect = frameAspect(photo);
  const height = Math.round(FRAME_W / aspect);
  return { height, project: projector(photo, FRAME_W, height) };
}

/** A square filling the whole box, as the store would hold it. */
const FULL_BOX = `0,0 ${MASK_BOX},0 ${MASK_BOX},${MASK_BOX} 0,${MASK_BOX}`;

describe('mask overlay — the cover fit', () => {
  it('leaves a standard portrait uncropped', () => {
    const { height, project } = frameFor(STANDARD);
    assert.equal(height, 520);
    assert.ok(Math.abs(project.x(0)) < 0.001, 'no horizontal crop');
    assert.ok(Math.abs(project.y(0)) < 0.001, 'no vertical crop');
    // The centre of the photograph is the centre of the frame.
    assert.ok(Math.abs(project.x(0.5) - 195) < 0.001);
    assert.ok(Math.abs(project.y(0.5) - 260) < 0.001);
  });

  it('crops the top and bottom of a tall photograph', () => {
    const { height, project } = frameFor(TALL);
    // Aspect is clamped to 0.74, so the frame is shorter than the picture.
    assert.equal(height, 527);
    assert.ok(Math.abs(project.y(0) - -34.4) < 0.1, `offY was ${project.y(0)}`);
    assert.ok(project.y(0) < 0, 'the top of the photograph sits above the frame');
    assert.ok(Math.abs(project.x(0)) < 0.001, 'nothing is cropped horizontally');
  });

  it('crops the sides of a wide photograph', () => {
    const { height, project } = frameFor(WIDE);
    assert.equal(height, 390);
    assert.ok(Math.abs(project.x(0) - -21.67) < 0.1, `offX was ${project.x(0)}`);
    assert.ok(Math.abs(project.y(0)) < 0.001, 'nothing is cropped vertically');
  });

  it('puts the mask and the upper-third rule in the same place', () => {
    // The box row at exactly one third is the row the band is drawn at. If
    // these ever disagree the projector changed under the overlay.
    const third = (MASK_BOX / 3) / MASK_BOX;
    for (const photo of [STANDARD, TALL, WIDE]) {
      const { project } = frameFor(photo);
      assert.ok(
        Math.abs(project.y(third) - project.y(1 / 3)) < 0.5,
        `mask and band disagree on ${photo.width}x${photo.height}`,
      );
    }
  });

  it('is invertible: the box corners are the photograph corners', () => {
    const { height, project } = frameFor(TALL);
    const drawnH = TALL.height * Math.max(FRAME_W / TALL.width, height / TALL.height);
    assert.ok(Math.abs(project.y(1) - project.y(0) - drawnH) < 0.001);
    assert.ok(Math.abs(project.x(1) - FRAME_W) < 0.001);
  });
});

describe('mask overlay — reading a stored trace', () => {
  const valid = { maskTrace: { contours: ['10,10 100,10 100,100 10,100'], topEdge: ['10,10 100,10'], tolerance: 2 } };

  it('reads a well-formed trace', () => {
    const trace = maskTraceOf(valid);
    assert.ok(trace);
    assert.equal(trace.contours.length, 1);
    assert.equal(trace.contours[0].length, 8);
    assert.equal(trace.topEdge.length, 1);
    assert.equal(trace.tolerance, 2);
  });

  it('is absent, not broken, when the photograph carries no trace', () => {
    assert.equal(maskTraceOf({ uri: 'file://a.jpg' }), null);
    assert.equal(maskTraceOf(undefined), null);
    assert.equal(maskTraceOf(null), null);
    assert.equal(maskTraceOf({ maskTrace: null }), null);
  });

  it('rejects a whole trace rather than reading part of one', () => {
    // A half-read contour would draw a shape that looks like a mask and is
    // not one, which is the failure this feature cannot afford.
    const bad = [
      { contours: ['10,10 100,10 nope,100'], topEdge: [] },
      { contours: ['10,10 100,10 100'], topEdge: [] },
      { contours: ['10,10 100,10 100,99999'], topEdge: [] },
      { contours: ['10,10 100,10 -5,100'], topEdge: [] },
      { contours: ['10,10 100,10'], topEdge: [] }, // a loop needs three points
      { contours: 'M10 10L100 10Z', topEdge: [] }, // not a path grammar
      { contours: [], topEdge: [] },
      { contours: ['10,10 100,10 100,100'], topEdge: ['10,10 bad'] },
    ];
    for (const maskTrace of bad) {
      assert.equal(maskTraceOf({ maskTrace }), null, `accepted ${JSON.stringify(maskTrace)}`);
    }
  });
});

describe('mask overlay — the paths it draws', () => {
  const { height, project } = frameFor(STANDARD);

  it('fills the frame when the mask filled the photograph', () => {
    const trace = maskTraceOf({ maskTrace: { contours: [FULL_BOX], topEdge: [] } });
    assert.ok(trace);
    const paths = maskPaths(trace, project, FRAME_W, height);
    assert.equal(paths.region, `M0 0 L390 0 L390 520 L0 520Z`);
    // The scrim is the frame first, then the region: even-odd makes it the outside.
    assert.ok(paths.outside.startsWith('M0 0L390 0L390 520L0 520Z '));
    assert.ok(paths.outside.endsWith(paths.region));
  });

  it('breaks the top edge where it leaves the frame, and never clamps it', () => {
    // A tall photograph crops the top, so a run along the top of the box is
    // partly above the frame. Clamping would draw a horizontal line the
    // model never produced.
    const tall = frameFor(TALL);
    const trace = maskTraceOf({
      maskTrace: { contours: [FULL_BOX], topEdge: [`0,0 ${MASK_BOX / 2},0 ${MASK_BOX},600`] },
    });
    assert.ok(trace);
    const paths = maskPaths(trace, tall.project, FRAME_W, tall.height);
    for (const edge of paths.edges) {
      for (const point of edge.d.split(/[ML]/).filter(Boolean)) {
        const [x, y] = point.trim().split(/\s+/).map(Number);
        assert.ok(y > -1 && y < tall.height + 1, `edge point at y=${y} is outside the frame`);
        assert.ok(x > -1 && x < FRAME_W + 1, `edge point at x=${x} is outside the frame`);
      }
    }
    assert.ok(paths.edges.length > 0, 'the part inside the frame is still drawn');
    assert.ok(
      paths.edges.some((e) => e.faded),
      'the run fades where it ran off the frame',
    );
  });

  it('only reports an edge the frame actually shows', () => {
    /*
      The hero prints a heading and a paragraph naming the pale line. It
      used to decide that on `trace.topEdge.length` — whether a run was
      stored — which is not the same question. A tall photograph is
      cropped top and bottom, and the top edge is exactly the part that
      lives up there, so a run entirely above the frame printed a label
      for a mark nowhere on the picture.
    */
    const tall = frameFor(TALL);
    const above = maskTraceOf({
      maskTrace: { contours: [FULL_BOX], topEdge: ['0,0 1024,0'] },
    });
    assert.ok(above);
    assert.equal(
      maskPaths(above, tall.project, FRAME_W, tall.height).edges.length,
      0,
      'the fixture has to be a run the frame really does crop away',
    );
    assert.equal(hasVisibleEdge(above, tall.project, FRAME_W, tall.height), false);

    // And a run through the middle of the same photograph is reported.
    const inside = maskTraceOf({
      maskTrace: { contours: [FULL_BOX], topEdge: ['0,500 1024,500'] },
    });
    assert.ok(inside);
    assert.equal(hasVisibleEdge(inside, tall.project, FRAME_W, tall.height), true);

    // A trace with no run at all has nothing to name either.
    const none = maskTraceOf({ maskTrace: { contours: [FULL_BOX], topEdge: [] } });
    assert.ok(none);
    assert.equal(hasVisibleEdge(none, project, FRAME_W, height), false);
  });

  it('keeps two separated runs separate', () => {
    const trace = maskTraceOf({
      maskTrace: { contours: [FULL_BOX], topEdge: ['0,500 300,500', '700,500 1024,500'] },
    });
    assert.ok(trace);
    const paths = maskPaths(trace, project, FRAME_W, height);
    assert.equal(paths.edges.length, 2);
    assert.ok(paths.edges.every((e) => !e.faded));
    for (const edge of paths.edges) assert.ok(edge.length > 0, 'a run has a length to draw with');
  });
});

describe('mask overlay — what it says', () => {
  const said = Object.values(MASK_OVERLAY_COPY);

  it('says nothing the product is not allowed to say', () => {
    assertHonest(assert, said, 'mask overlay');
  });

  it('has no empty string, so a renamed key cannot render as nothing', () => {
    for (const [key, value] of Object.entries(MASK_OVERLAY_COPY)) {
      assert.equal(typeof value, 'string', `${key} is not a string`);
      assert.ok(value.trim().length > 0, `${key} is empty`);
    }
  });

  it('never calls the traced line a hairline', () => {
    // The geometry is the highest row the mask held for a short run per
    // column. It
    // coincides with a hairline on a front shot and is the outline of the
    // head on a top-down one; calling it "your hairline" would be an
    // anatomical claim the model never made. Nothing else catches this.
    for (const [key, value] of Object.entries(MASK_OVERLAY_COPY)) {
      assert.ok(!/\bhairline\b/i.test(value), `${key} calls it a hairline`);
    }
  });
});
