/**
 * The coverage number is the one most likely to be believed, so it is the
 * one most worth attacking.
 *
 * A segmentation mask produces a confident-looking percentage from any
 * photograph at all, and a person tracking hair loss will read a rise as
 * regrowth whatever the caption says. These cases sit on the places where
 * that reading would be wrong: framing that moved, differences inside the
 * noise band, and an empty mask.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  MAX_TRACE_BYTES,
  cellShares,
  cellsOnlyTrace,
  compareCoverage,
  coverageOf,
  describeTrend,
  hairChannel,
  parseCells,
  parsePoints,
  serialiseTrace,
  traceMask,
  tracedArea,
  type MaskImage,
  type MaskTrace,
} from '@/features/assessment/hair-mask';

/** A mask where the top `rows` rows are hair and the rest is not. */
function topRows(rows: number, size = 12): MaskImage {
  const data = new Float32Array(size * size);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < size; x += 1) data[y * size + x] = 0.9;
  }
  return { width: size, height: size, data };
}

test('channel: the hair class is lifted out at the right stride', () => {
  // Two classes interleaved per pixel: background first, hair second.
  // Reading the wrong one produces a full mask instead of an empty one,
  // which still renders a confident percentage — so it is worth pinning.
  const side = 2;
  const classes = 2;
  const out = new Float32Array(side * side * classes);
  for (let p = 0; p < side * side; p += 1) {
    out[p * classes] = 0.9;       // background: confident
    out[p * classes + 1] = 0.1;   // hair: not
  }
  const mask = hairChannel(out, side, classes);
  assert.equal(mask.width, side);
  for (let i = 0; i < mask.data.length; i += 1) {
    assert.ok(Math.abs(mask.data[i] - 0.1) < 1e-6, 'must read the hair channel, not background');
  }
  assert.equal(coverageOf(mask).pixels, 0);
});

test('coverage: an empty mask is zero everywhere, not NaN', () => {
  const c = coverageOf({ width: 8, height: 8, data: new Float32Array(64) });
  assert.equal(c.fraction, 0);
  assert.equal(c.verticalBalance, 0);
  assert.equal(c.pixels, 0);
});

test('coverage: a zero-sized mask does not divide by zero', () => {
  const c = coverageOf({ width: 0, height: 0, data: new Float32Array(0) });
  assert.equal(c.fraction, 0);
});

test('coverage: half a frame of hair reads as half', () => {
  const c = coverageOf(topRows(6));
  assert.ok(Math.abs(c.fraction - 0.5) < 1e-6);
  assert.equal(c.verticalBalance, 1, 'all of it is above the midline');
});

test('coverage: low-confidence pixels are not counted as hair', () => {
  const size = 8;
  const data = new Float32Array(size * size).fill(0.49);
  assert.equal(coverageOf({ width: size, height: size, data }).pixels, 0);
});

test('trend: a small difference is noise, not a result', () => {
  // One row in twelve is about 8 points, so compare two masks that differ
  // by well under the noise band.
  const now = { fraction: 0.510, upperFraction: 0.5, verticalBalance: 0.5, pixels: 100 };
  const before = { fraction: 0.500, upperFraction: 0.5, verticalBalance: 0.5, pixels: 100 };
  const t = compareCoverage(now, before);
  assert.equal(t.meaningful, false, 'a one-point rise must not be reported as change');
  assert.match(describeTrend(t)!, /No measurable change/);
});

test('trend: framing that moved is refused, however big the difference', () => {
  const now = { fraction: 0.70, upperFraction: 0.8, verticalBalance: 0.80, pixels: 100 };
  const before = { fraction: 0.40, upperFraction: 0.4, verticalBalance: 0.50, pixels: 100 };
  const t = compareCoverage(now, before);
  assert.equal(t.framingSuspect, true);
  assert.equal(t.meaningful, false, 'a 30-point jump from a moved camera is not a result');
  assert.match(describeTrend(t)!, /measure the camera/);
});

test('trend: a real change is stated as area, never as thickness', () => {
  const now = { fraction: 0.56, upperFraction: 0.6, verticalBalance: 0.52, pixels: 100 };
  const before = { fraction: 0.50, upperFraction: 0.5, verticalBalance: 0.50, pixels: 100 };
  const t = compareCoverage(now, before);
  assert.equal(t.meaningful, true);

  const text = describeTrend(t)!.toLowerCase();
  assert.match(text, /area, not thickness/);
  for (const claim of ['thicker', 'fuller', 'regrow', 'density']) {
    assert.ok(!text.includes(claim), `coverage copy must not say "${claim}"`);
  }
});

/* ----------------------------- left and right ----------------------------- */

/** A mask where the left `cols` columns are hair and the rest is not. */
function leftCols(cols: number, size = 12): MaskImage {
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < cols; x += 1) data[y * size + x] = 0.9;
  }
  return { width: size, height: size, data };
}

test('balance: hair spread evenly across the frame reads as half left', () => {
  const c = coverageOf(topRows(6));
  assert.ok(Math.abs((c.horizontalBalance ?? -1) - 0.5) < 1e-6);
});

test('balance: hair only on the left of the frame reads as all left', () => {
  const c = coverageOf(leftCols(4));
  assert.equal(c.horizontalBalance, 1);
  assert.ok(Math.abs(c.fraction - 1 / 3) < 1e-6, 'and the area is still a third');
});

test('balance: an odd-width frame splits its middle column, not the reading', () => {
  // Nine columns of hair across an odd width: the centre column straddles
  // the midline and must fall wholly on one side or the other without
  // pushing the figure past the obvious half.
  const size = 9;
  const data = new Float32Array(size * size).fill(0.9);
  const c = coverageOf({ width: size, height: size, data });
  assert.ok(Math.abs((c.horizontalBalance ?? -1) - 4 / 9) < 1e-6, 'four of nine columns lie left of centre');
});

test('balance: an empty mask has no side, and is zero rather than NaN', () => {
  const c = coverageOf({ width: 8, height: 8, data: new Float32Array(64) });
  assert.equal(c.horizontalBalance, 0);
});

/* ------------------------------ the outline ------------------------------ */

/**
 * The outline is the more dangerous half of this file.
 *
 * A percentage that is wrong is invisible; an outline that is wrong is
 * drawn on somebody's face, and an outline that is *plausible* and wrong
 * is worse than either, because it looks like evidence. So these cases
 * sit on the two claims the drawing makes — that it encloses exactly the
 * pixels the figure counted, and that it lands where the hair is.
 */

/** The box the trace stores its coordinates in; 1024 across the photograph. */
const BOX = 1024;

/** A mask with a solid rectangle of hair in it, everything else empty. */
function rect(
  size: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value = 0.9,
): MaskImage {
  const data = new Float32Array(size * size);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) data[y * size + x] = value;
  }
  return { width: size, height: size, data };
}

/** The area the outline encloses, back in mask pixels. */
function enclosed(trace: MaskTrace, size: number): number {
  return (tracedArea(trace.contours) * size * size) / (BOX * BOX);
}

test('outline: it encloses exactly the pixels that were counted', () => {
  // The whole claim the drawing makes. The boundary is traced on the
  // lines between pixels rather than through their centres precisely so
  // that this is an equality and not an approximation — a shape that
  // merely looks about right is a shape nobody can check.
  const mask = rect(64, 12, 20, 40, 52);
  const trace = traceMask(mask);
  assert.ok(trace, 'a solid block must be traceable');
  assert.equal(enclosed(trace, 64), coverageOf(mask).pixels);
});

test('outline: the counted edge is the traced edge, at the same 0.5', () => {
  // A region the model was just under half sure about is outside the
  // outline because it is outside the count. If these two thresholds
  // ever drift apart, the drawing marks a region the figure does not
  // describe and nothing on screen says so.
  const mask = rect(64, 10, 10, 20, 20, 0.5);
  for (let y = 40; y < 50; y += 1) {
    for (let x = 40; x < 50; x += 1) mask.data[y * 64 + x] = 0.49;
  }
  const trace = traceMask(mask);
  assert.ok(trace);
  assert.equal(coverageOf(mask).pixels, 100, 'only the 0.5 block is counted');
  assert.equal(enclosed(trace, 64), 100, 'and only the 0.5 block is enclosed');
});

test('outline: a hole is traced as its own loop rather than filled in', () => {
  // A gap inside the hair is a gap the count already excluded. Filling
  // it in on the way to the screen would be the drawing inventing hair.
  const mask = rect(64, 20, 20, 40, 40);
  for (let y = 28; y < 36; y += 1) {
    for (let x = 28; x < 36; x += 1) mask.data[y * 64 + x] = 0;
  }
  const trace = traceMask(mask);
  assert.ok(trace);
  assert.equal(trace.contours.length, 2, 'the outer boundary and the hole');
  assert.equal(coverageOf(mask).pixels, 400 - 64);
  assert.equal(enclosed(trace, 64), 400 - 64, 'the hole subtracts, as it does in the count');
});

test('outline: specks are kept, because they are inside the figure', () => {
  // Six flecks — an eyebrow, a shadow on a collar — are in the counted
  // percentage whether or not they are drawn. Dropping them as "dirt on
  // the lens" would tidy the picture into disagreeing with its own
  // number, and would let a mask that has gone wrong pose as a clean
  // hairline instead of showing itself as scatter.
  const mask = rect(64, 20, 20, 40, 40);
  const specks = [
    [2, 2],
    [58, 2],
    [2, 58],
    [58, 58],
    [2, 30],
    [58, 30],
  ];
  for (const [sx, sy] of specks) {
    for (let y = sy; y < sy + 3; y += 1) {
      for (let x = sx; x < sx + 3; x += 1) mask.data[y * 64 + x] = 0.9;
    }
  }
  const trace = traceMask(mask);
  assert.ok(trace);
  assert.equal(trace.contours.length, 7, 'the block and all six specks');
  assert.equal(enclosed(trace, 64), coverageOf(mask).pixels);
});

test('outline: two pixels touching at a corner are one shape, not two', () => {
  // The one genuinely ambiguous vertex in the trace. Either reading
  // encloses the same area, so the figure is safe whichever is chosen —
  // but two loops meeting at a point render as a pinch with a seam
  // through it, and the hair does not look like that.
  const data = new Float32Array(64 * 64);
  data[10 * 64 + 10] = 0.9;
  data[11 * 64 + 11] = 0.9;
  const trace = traceMask({ width: 64, height: 64, data });
  assert.ok(trace);
  assert.equal(trace.contours.length, 1);
  assert.equal(enclosed(trace, 64), 2);
});

test('outline: an empty mask has no outline and does not throw', () => {
  const trace = traceMask({ width: 64, height: 64, data: new Float32Array(64 * 64) });
  assert.ok(trace);
  assert.equal(trace.contours.length, 0);
  assert.equal(trace.topEdge.length, 0);
  assert.equal(trace.cells.length, 256);
  assert.ok(
    trace.cells.every((c) => c === 0),
    'and every square reads as none of it',
  );
});

test('outline: a zero-sized mask is refused rather than traced', () => {
  assert.equal(traceMask({ width: 0, height: 0, data: new Float32Array(0) }), null);
});

/* ------------------------------ the top edge ----------------------------- */

test('top edge: it breaks where the mask breaks, and is never joined', () => {
  // A line drawn across the gap would be an edge in a place the model
  // found none — which is the one thing this whole drawing exists not
  // to do.
  const size = 512;
  const data = new Float32Array(size * size);
  const band = (from: number, to: number) => {
    for (let y = 100; y < 200; y += 1) {
      for (let x = from; x < to; x += 1) data[y * size + x] = 0.9;
    }
  };
  band(0, 128);
  band(256, 384);

  const trace = traceMask({ width: size, height: size, data });
  assert.ok(trace);
  assert.equal(trace.topEdge.length, 2, 'two runs of columns, two polylines');
});

test('top edge: a stray pixel does not pull the line to the top of the frame', () => {
  // One bright pixel on a wall is enough to hoist an unguarded top edge
  // eighty rows above the hair, and the result looks like a reading.
  const size = 512;
  const data = new Float32Array(size * size).map((_, i) =>
    Math.floor(i / size) >= 100 && Math.floor(i / size) < 141 ? 0.9 : 0,
  );
  data[20 * size + 250] = 0.9;

  const trace = traceMask({ width: size, height: size, data });
  assert.ok(trace);
  const rows = new Set<number>();
  for (const line of trace.topEdge) {
    for (let i = 1; i < line.length; i += 2) rows.add(line[i]);
  }
  assert.deepEqual([...rows], [200], 'every column reads the band, not the stray');
});

test('top edge: a mark too narrow to be an edge is not drawn as one', () => {
  const size = 512;
  const data = new Float32Array(size * size);
  for (let y = 100; y < 200; y += 1) {
    for (let x = 0; x < 16; x += 1) data[y * size + x] = 0.9;
  }
  const trace = traceMask({ width: size, height: size, data });
  assert.ok(trace);
  assert.equal(trace.topEdge.length, 0, 'four columns of 128 is a mark, not an edge');
  assert.ok(trace.contours.length > 0, 'and it is still inside the outline');
});

test('top edge: it is the row the mask held, not the highest row it reached', () => {
  /*
    The difference matters for what anybody is allowed to say about this
    line. A wisp four rows tall, sixty rows above the head, is counted,
    is inside the outline, and is above the line — because the run
    filter that stops a single stray pixel hoisting the line also passes
    over anything thinner than the run. That is the safe direction to
    err in, and it is a weaker claim than "the highest row the mask
    reached". Copy that says the stronger thing is describing marks the
    drawing does not make.
  */
  const size = 512;
  const data = new Float32Array(size * size);
  for (let y = 200; y < 300; y += 1) {
    for (let x = 100; x < 400; x += 1) data[y * size + x] = 0.9;
  }
  for (let y = 140; y < 144; y += 1) {
    for (let x = 100; x < 400; x += 1) data[y * size + x] = 0.9;
  }

  const trace = traceMask({ width: size, height: size, data });
  assert.ok(trace);

  let highestDrawn = BOX;
  for (const loop of trace.contours) {
    for (let i = 1; i < loop.length; i += 2) highestDrawn = Math.min(highestDrawn, loop[i]);
  }
  let highestLine = BOX;
  for (const line of trace.topEdge) {
    for (let i = 1; i < line.length; i += 2) highestLine = Math.min(highestLine, line[i]);
  }

  assert.equal(highestDrawn, 280, 'the outline reaches the wisp, because the count did');
  assert.equal(highestLine, 400, 'and the line stays on the band the mask held');
  assert.ok(
    highestLine > highestDrawn,
    'so the marked area extends above the line, and nothing may claim otherwise',
  );
});

/* --------------------------- the area squares ---------------------------- */

test('squares: there are 256 of them and they average back to the printed figure', () => {
  // This is what makes the grid honest: it is not a second opinion, it
  // is the one printed number taken apart. The tolerance is the eight-bit
  // rounding of each square and nothing else.
  const mask = rect(512, 40, 60, 300, 400);
  const cells = cellShares(mask);
  assert.equal(cells.length, 256);
  const mean = cells.reduce((sum, c) => sum + c, 0) / cells.length / 255;
  assert.ok(
    Math.abs(mean - coverageOf(mask).fraction) < 0.002,
    `squares averaged ${mean}, figure was ${coverageOf(mask).fraction}`,
  );
});

/* ------------------------------ what is stored --------------------------- */

test('stored: model coordinates land on exact box integers, with no rounding', () => {
  // 1024 is twice the model's 512, so the conversion is a doubling. A
  // box of some other size would quietly add a fraction of a pixel of
  // error underneath the simplification, which is the sort of thing
  // nobody finds later.
  const mask = rect(512, 128, 256, 256, 384);
  const trace = traceMask(mask);
  assert.ok(trace);
  const stored = serialiseTrace(trace);
  assert.equal(stored.contours.length, 1);
  const corners = stored.contours[0].split(' ').sort();
  assert.deepEqual(corners, ['256,512', '256,768', '512,512', '512,768']);
});

test('stored: a realistic ragged mask fits the budget it was given', () => {
  // The app is one row of one key in AsyncStorage, serialised whole on
  // every write. This is the largest single thing anybody stores per
  // photograph, so the moment to catch a tolerance regression is here,
  // not after somebody's journal has quietly stopped loading.
  const mask = raggedMask();
  const trace = traceMask(mask);
  assert.ok(trace, 'a ragged but ordinary mask must still trace');
  const bytes = JSON.stringify(serialiseTrace(trace)).length;
  assert.ok(
    bytes < MAX_TRACE_BYTES,
    `a photograph's outline cost ${bytes} bytes of ${MAX_TRACE_BYTES}`,
  );
  assert.ok(
    Math.abs(coverageOf(mask).fraction - 0.121) < 0.01,
    'and the fixture is a plausible amount of hair, not a full frame',
  );
});

test('stored: the budget the device keeps is the budget this file asserts', () => {
  /*
    The guard that runs on a phone and the number asserted in CI have to
    be one number. They were two: a 1,200-point cap at write time against
    a 6,144-byte assertion here, which differ by about 1.7x because a
    stored point costs roughly nine bytes. A mask with a noisy boundary —
    which is what a real one has — traced to a little over 1,100 points,
    passed the cap, and serialised to around 10 KB into a store that is
    one row holding the entire app.

    So this fixture is deliberately the awkward one: noisy enough that a
    point count would wave it through. Whatever comes back, it is under
    budget or it is null.
  */
  const mask = noisyMask();
  const trace = traceMask(mask);
  assert.ok(trace, 'a noisy boundary is an ordinary photograph, not a failure');
  const bytes = JSON.stringify(serialiseTrace(trace)).length;
  assert.ok(bytes < MAX_TRACE_BYTES, `a noisy boundary cost ${bytes} bytes`);

  // The tolerance says the budget did something: this fixture is refused
  // at the fine tolerance and kept at the coarse one. It is refused on
  // its size, and it is nowhere near the old cap — a few hundred points
  // against 1,200 — so under that cap it would have been written whole.
  assert.equal(trace.tolerance, 4, 'the budget forced the coarser retry');
  const points = trace.contours.reduce((n, loop) => n + loop.length / 2, 0);
  assert.ok(points < 1200, `and a point cap would not have fired at ${points} points`);

  // And the guard on a device is this same expression, not a proxy for
  // it. A point count here is what let 10 KB through a 6 KB budget.
  const source = code('src/features/assessment/hair-mask.ts');
  assert.ok(
    source.includes('JSON.stringify(serialiseTrace(trace)).length'),
    'the write-time guard has to measure what is written',
  );
  assert.ok(
    !/MAX_POINTS/.test(source),
    'and must not go back to counting points, which is a different budget',
  );
});

test('stored: confetti is refused outright rather than stored as half an outline', () => {
  // A backlit frame can shatter the 0.5 field into hundreds of pieces.
  // Half an outline would still be drawn, and nobody could tell which
  // half was missing; nothing is the honest answer, and the figures are
  // unaffected either way.
  const size = 512;
  const data = new Float32Array(size * size);
  for (let y = 10; y < size - 10; y += 20) {
    for (let x = 10; x < size - 10; x += 20) data[y * size + x] = 0.9;
  }
  assert.equal(traceMask({ width: size, height: size, data }), null);
});

test('stored: confetti is refused cheaply, before the work it cannot pay for', () => {
  /*
    The refusal above was the most expensive thing this file did. `at()`
    simplified and serialised every loop, the byte budget stringified the
    whole result, and on a refusal both ran again at the coarse
    tolerance — so the pathological mask spent the most JS-thread time at
    the shutter and returned nothing. Measured in Node on the machine
    this was written on, a 512-square checkerboard cost 278 ms and a
    backlit head about 47 ms; at the 5-15x Hermes multiplier used
    elsewhere in the module that is seconds of blocked thread.

    The pre-bail is the same budget read off a lower bound, not a second
    one: every loop survives `at()` with at least three points, so N
    loops cannot serialise to less than N * 14 bytes. This pins that the
    floor is a real floor — 400 minimum-size loops already cost nearly
    the whole budget — so the bail can never turn away a trace the byte
    budget would have kept.
  */
  const contours = Array.from({ length: 400 }, () => [0, 0, 0, 0, 0, 0]);
  const bytes = JSON.stringify(
    serialiseTrace({ contours, topEdge: [], cells: new Uint8Array(256), tolerance: 2 }),
  ).length;
  assert.ok(
    bytes / 400 >= 14,
    `a three-point loop costs ${(bytes / 400).toFixed(1)} bytes, below the floor the bail assumes`,
  );
  assert.ok(bytes < MAX_TRACE_BYTES, 'and 400 of them still has to be inside the budget');

  // The checkerboard is the extreme: every other pixel, so tens of
  // thousands of loops. It must be refused, and without the double pass.
  const size = 512;
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) data[y * size + x] = (x + y) % 2 === 0 ? 0.9 : 0.1;
  }
  assert.equal(traceMask({ width: size, height: size, data }), null);

  /*
    And the bail is in the source, ahead of the work. There is no way to
    observe it from the outside — with it or without it the answer is
    null, and the only difference is time, which is not a thing to assert
    on in a suite that runs four files at once. So this reads the file,
    the way the alignment invariant below does, and says so: it asserts
    the expression exists and that it sits before the first `at()` call
    rather than after it, which is the whole point of it.
  */
  const source = code('src/features/assessment/hair-mask.ts');
  const bail = source.indexOf('boxed.length * MIN_LOOP_BYTES >= MAX_TRACE_BYTES');
  assert.ok(bail > 0, 'the cheap refusal has to still be there');
  assert.ok(
    bail < source.indexOf('let trace = at(SIMPLIFY)'),
    'and it has to come before the simplifying, or it saves nothing',
  );
});

test('stored: what is written parses back to what was traced', () => {
  const trace = traceMask(raggedMask());
  assert.ok(trace);
  const stored = serialiseTrace(trace);
  assert.deepEqual(parsePoints(stored.contours[0]), trace.contours[0]);
  assert.deepEqual(parseCells(stored.cells), trace.cells);
  assert.equal(parseCells('not base64 at all'), null);
});

/* -------------------------- the alignment invariant ----------------------- */

/**
 * Model space maps onto the stored photograph by a scale on each axis,
 * with no crop and no offset — so a point in the outline maps back by
 * `x / 1024` and `y / 1024` and nothing else.
 *
 * That holds only because the mask is measured on the shrunk capture
 * that is then persisted, and because the resize into the model's square
 * gives both dimensions rather than cropping to one. Break either and
 * every outline slides off every face, with plausible figures, no thrown
 * error, and nothing in a test that only reads numbers to notice.
 *
 * The two geometry cases below state the invariant as an equality and
 * show what breaking it looks like. They cannot, on their own, stop
 * anybody breaking it: neither of them touches the two files where the
 * mistake would actually be made. The three source cases after them do
 * that, and they are the ones with teeth.
 */

test('alignment: resizing the frame before measuring changes nothing', () => {
  // The same rectangle, as a fraction of the frame, measured at two
  // model resolutions. If a scale is all that separates them, the stored
  // outline is identical — which is the invariant, stated as an equality.
  const small = traceMask(rect(64, 16, 16, 32, 32));
  const large = traceMask(rect(128, 32, 32, 64, 64));
  assert.ok(small && large);
  assert.deepEqual(serialiseTrace(small).contours, serialiseTrace(large).contours);
  assert.deepEqual(serialiseTrace(small).contours, ['256,256 512,256 512,512 256,512']);
});

test('alignment: cropping the frame before measuring moves the outline', () => {
  // The same hair, in a frame whose top quarter has been cut off. The
  // outline now describes a different picture, and nothing in the
  // arithmetic can tell. This says what the damage is; the two source
  // cases below are what stop it being done.
  const whole = traceMask(rect(64, 16, 16, 32, 32));

  const cropped = new Float32Array(64 * 48);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 16; x < 32; x += 1) cropped[y * 64 + x] = 0.9;
  }
  const after = traceMask({ width: 64, height: 48, data: cropped });

  assert.ok(whole && after);
  assert.deepEqual(serialiseTrace(whole).contours, ['256,256 512,256 512,512 256,512']);
  assert.deepEqual(
    serialiseTrace(after).contours,
    ['256,0 512,0 512,341 256,341'],
    'the same hair now reads as starting at the very top of the photograph',
  );
});

/* --------------------- the alignment invariant, at the sites -------------- */

/**
 * Reading the two files themselves, because nothing else can.
 *
 * `hair-segmenter.ts` imports the TFLite native module and a 763 KB
 * model asset, and `capture-session.tsx` is a screen; neither can be
 * imported into a Node test at all. So the invariant that lives in them
 * — measure the whole shrunk frame, squash it, never crop — is pinned
 * the way the quality gate pins its own rules, by reading the source.
 *
 * This is a coarse instrument and it is worth saying so: it holds the
 * exact spelling of two lines, and a rewrite that keeps the invariant
 * while changing the words will fail it and need updating by hand.
 * That is the trade. The alternative is what was here before — two
 * geometry cases that pass whatever those two files say, over an
 * invariant whose whole danger is that breaking it changes no number.
 */

const repoFile = (relative: string): URL => new URL(`../../${relative}`, import.meta.url);

/** Source with its comments removed, so a rule cannot be satisfied by prose. */
function code(relative: string): string {
  return readFileSync(repoFile(relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

test('alignment: the segmenter squashes the whole frame and never crops it', () => {
  // Crop-to-square is the obvious optimisation here and it is silent:
  // the figures stay plausible, the outline slides off the head, and
  // nothing throws. A commit that does it has to delete this to do it.
  const source = code('src/features/assessment/hair-segmenter.ts');
  assert.ok(
    source.includes('.resize({ width: side, height: side })'),
    'the resize must give both dimensions, which is a scale on each axis and not a crop',
  );
  assert.ok(
    !source.includes('.crop('),
    'a crop before the model puts the outline somewhere the photograph is not',
  );
  assert.ok(
    readFileSync(repoFile('src/features/assessment/hair-segmenter.ts'), 'utf8').includes(
      'ALIGNMENT INVARIANT',
    ),
    'and the reason has to be readable at the line, not only in a test',
  );
});

test('alignment: the capture screen measures the frame it stores, not the raw one', () => {
  // The other half. `small` is the shrunk capture that is then
  // persisted; `photo.uri` is the raw camera frame, which is a
  // different size and, on some devices, a different shape.
  const source = code('src/app/capture-session.tsx');
  assert.ok(
    source.includes('measureCoverageSafely(small.uri)'),
    'the mask must be measured on the shrunk capture that gets persisted',
  );
  assert.ok(
    !source.includes('measureCoverageSafely(photo.uri)'),
    'measuring the raw camera frame breaks every overlay with no error and no wrong number',
  );
  assert.ok(
    readFileSync(repoFile('src/app/capture-session.tsx'), 'utf8').includes('ALIGNMENT INVARIANT'),
    'and the reason has to be readable at the line, not only in a test',
  );
});

test('alignment: a shattered mask still stores its squares at the measurement site', () => {
  // `traceMask` returns null on confetti. Turning that null into a
  // stored nothing would throw away 256 counted values and would make
  // "the mask shattered" indistinguishable from "this photograph
  // predates outlines". Same reasoning, same unreachable file.
  const source = code('src/features/assessment/hair-segmenter.ts');
  assert.ok(
    source.includes('cellsOnlyTrace(mask)'),
    'a mask too fragmented to trace still has squares worth keeping',
  );
  assert.ok(
    code('src/app/capture-session.tsx').includes('maskTrace: reading.maskTrace'),
    'and the capture screen has to carry what came back rather than dropping it',
  );
});

/* ------------------------ the shattered mask ----------------------------- */

test('shattered: the squares survive an outline that could not be traced', () => {
  // The outline is what shatters. The squares are counted per cell and
  // never traced, so they are exactly as good on confetti as on a clean
  // head — and they are the half a reader can still show somebody.
  const size = 512;
  const data = new Float32Array(size * size);
  for (let y = 10; y < size - 10; y += 20) {
    for (let x = 10; x < size - 10; x += 20) data[y * size + x] = 0.9;
  }
  const mask = { width: size, height: size, data };
  assert.equal(traceMask(mask), null, 'the outline is still refused');

  const fallback = cellsOnlyTrace(mask);
  assert.deepEqual(fallback.contours, [], 'empty, and empty is the statement');
  assert.deepEqual(fallback.topEdge, []);
  assert.equal(fallback.tolerance, 0, 'nothing was simplified, so no tolerance is quoted');
  assert.deepEqual(fallback.cells, cellShares(mask), 'the squares are the ones that were counted');
  assert.ok(
    fallback.cells.some((c) => c > 0),
    'and they are not all zero, which is what makes them worth storing',
  );

  const stored = serialiseTrace(fallback);
  assert.deepEqual(stored.contours, []);
  assert.equal(parseCells(stored.cells)?.length, 256);
});

/* -------------------------------- fixture -------------------------------- */

/** Deterministic noise, so a failing case fails the same way twice. */
function jitter(seed: number): number {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * A mask the shape a real one is: a head-sized region with a ragged top
 * edge and a handful of specks somewhere else in the frame.
 *
 * A clean ellipse would simplify to sixty points and pass a budget test
 * that a real photograph would fail, which is the sort of fixture that
 * makes a suite look green and a phone look broken.
 */
function raggedMask(size = 512): MaskImage {
  const data = new Float32Array(size * size);
  const cx = 256;
  const cy = 210;
  const rx = 130;
  const ry = 77;
  for (let x = 0; x < size; x += 1) {
    const dx = (x - cx) / rx;
    if (Math.abs(dx) >= 1) continue;
    const half = ry * Math.sqrt(1 - dx * dx);
    const top = Math.round(cy - half) + Math.round((jitter(x) - 0.5) * 34);
    const bottom = Math.round(cy + half);
    for (let y = Math.max(0, top); y <= Math.min(size - 1, bottom); y += 1) {
      data[y * size + x] = 0.9;
    }
  }
  for (const [sx, sy] of [
    [60, 400],
    [430, 380],
    [100, 60],
    [400, 80],
    [250, 460],
    [470, 240],
  ]) {
    for (let y = sy; y < sy + 3; y += 1) {
      for (let x = sx; x < sx + 3; x += 1) data[y * size + x] = 0.9;
    }
  }
  return { width: size, height: size, data };
}

/**
 * A head whose whole boundary frays, plus a second frayed region below.
 *
 * The ragged fixture above frays only along the top. A real mask frays
 * everywhere, and often marks something else in the frame as well — a
 * beard, a collar, hair on a shoulder. That extra boundary length is
 * what makes a point count a poor budget: the outline stays far inside
 * any sane point cap while the string that has to be stored doubles.
 *
 * At 22% coverage this is an ordinary photograph, not a pathological
 * one, which is the point of it.
 */
function noisyMask(size = 512): MaskImage {
  const data = new Float32Array(size * size);
  const cx = size / 2;
  const cy = size * 0.34;
  const rx = size * 0.27;
  const ry = size * 0.18;
  for (let x = 0; x < size; x += 1) {
    const dx = (x - cx) / rx;
    if (Math.abs(dx) >= 1) continue;
    const half = ry * Math.sqrt(1 - dx * dx);
    const top = Math.round(cy - half + (jitter(x + 11) - 0.5) * 10);
    const bottom = Math.round(cy + half + (jitter(x + 97) - 0.5) * 10);
    for (let y = Math.max(0, top); y <= Math.min(size - 1, bottom); y += 1) {
      data[y * size + x] = 0.9;
    }
  }
  // Correlated noise on the second region: neighbouring columns wander
  // together, which is what a boundary does and what independent
  // per-pixel noise does not.
  const wander = (x: number, seed: number): number => {
    const i = Math.floor(x / 2);
    const f = (x / 2) % 1;
    return jitter(i + seed) * (1 - f) + jitter(i + 1 + seed) * f - 0.5;
  };
  for (let x = 40; x < size - 40; x += 1) {
    const top = Math.round(size * 0.75 + wander(x, 313) * 10);
    for (let y = Math.max(0, top); y < Math.min(size, top + 40); y += 1) {
      data[y * size + x] = 0.9;
    }
  }
  return { width: size, height: size, data };
}
