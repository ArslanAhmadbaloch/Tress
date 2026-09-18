/**
 * The step between a mask and a cap that sits on the hair.
 *
 * `hair-fit.ts` is the only part of the live road a laptop can judge:
 * the Swift cannot be compiled here and the model cannot be run, but the
 * arithmetic between them is plain JavaScript over plain arrays, and it
 * is the part that decides whether the wireframe lands on somebody's
 * head or a hand's breadth beside it.
 *
 * Three things are held here.
 *
 *   • The projection. A point in the mask has to arrive in the preview's
 *     own points, through the picture the mask was squashed out of. Get
 *     this wrong and every silhouette is a shape in the wrong place,
 *     with no error anywhere to say so.
 *   • The refusals. A mask of nothing, a mask of everything, and a mask
 *     that shattered are each a reading with no honest answer in it, and
 *     each must come back null so the cap holds rather than easing onto
 *     nonsense.
 *   • The handover. What this produces is fed to `fitHairCap`, so the
 *     last test runs the real one over a real silhouette and asserts the
 *     dome grows towards the hair rather than away from it.
 *
 * And one thing that is not arithmetic at all: that the screen actually
 * calls this. The lane before this one shipped `setHair` with nothing
 * calling it, so the chain from the scan screen to the mesh is read off
 * the source here rather than trusted.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  FIT_CLOCK_START,
  FIT_INTERVAL_MS,
  FIT_TICK_MS,
  HAIR_FIT,
  aspectFill,
  dueForFit,
  hairSilhouette,
  type FitClock,
  type FitMask,
} from '@/features/hair-scan/hair-fit';
import {
  CAP_FIT_DEFAULT,
  fitHairCap,
  type CapSource,
  type HairSilhouette,
} from '@/features/hair-scan/head-cap';
import { syntheticContours } from '@/features/hair-scan/tracking';

/* ------------------------------ fixtures ------------------------------ */

/** The preview, in the app's own points: an iPhone held upright. */
const VIEW = { width: 390, height: 844 };

/** The camera's picture behind it, turned upright and mirrored. */
const SOURCE = { width: 720, height: 1280 };

const GEOMETRY = { source: SOURCE, view: VIEW };

type Ellipse = {
  /** Centre and radii, as fractions of the mask's side. */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

/** A mask with one filled ellipse in it, at full confidence. */
function ellipseMask(side: number, shape: Ellipse, level = 0.92): FitMask {
  const data = new Float32Array(side * side);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const nx = (x + 0.5) / side - shape.cx;
      const ny = (y + 0.5) / side - shape.cy;
      const inside = (nx / shape.rx) ** 2 + (ny / shape.ry) ** 2 <= 1;
      data[y * side + x] = inside ? level : 0.02;
    }
  }
  return { width: side, height: side, data };
}

/** Everything the mask holds, as a bounding box in the preview's points. */
function extent(hair: HairSilhouette): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 1 < hair.points.length; i += 2) {
    minX = Math.min(minX, hair.points[i]);
    maxX = Math.max(maxX, hair.points[i]);
    minY = Math.min(minY, hair.points[i + 1]);
    maxY = Math.max(maxY, hair.points[i + 1]);
  }
  return { minX, maxX, minY, maxY };
}

/* ----------------------------- projection ----------------------------- */

test('the picture fills the preview: the short axis covers and the long one overflows', () => {
  const p = aspectFill(SOURCE, VIEW);
  assert.ok(p);
  // 844/1280 is the larger of the two ratios, so height covers exactly.
  assert.equal(p.scale, 844 / 1280);
  assert.equal(p.dy, 0);
  // And the width overflows equally at both ends, which is a negative
  // offset: the picture starts left of the view.
  assert.ok(p.dx < 0);
  assert.equal(p.dx, (390 - 720 * (844 / 1280)) / 2);
});

test('a picture wider than the preview is scaled on the other axis instead', () => {
  const p = aspectFill({ width: 1280, height: 720 }, VIEW);
  assert.ok(p);
  assert.equal(p.scale, 844 / 720);
  assert.equal(p.dy, 0);
  assert.ok(p.dx < 0);
});

test('the projection covers the preview whichever way round the picture is', () => {
  for (const source of [
    { width: 720, height: 1280 },
    { width: 1280, height: 720 },
    { width: 1000, height: 1000 },
  ]) {
    const p = aspectFill(source, VIEW);
    assert.ok(p);
    // No gap at any edge: the feed reaches all four of them.
    assert.ok(p.dx <= 1e-9, JSON.stringify(source));
    assert.ok(p.dy <= 1e-9, JSON.stringify(source));
    assert.ok(source.width * p.scale + p.dx >= VIEW.width - 1e-9);
    assert.ok(source.height * p.scale + p.dy >= VIEW.height - 1e-9);
  }
});

test('a size of nothing is not a projection', () => {
  assert.equal(aspectFill({ width: 0, height: 1280 }, VIEW), null);
  assert.equal(aspectFill(SOURCE, { width: 390, height: 0 }), null);
  assert.equal(aspectFill({ width: Number.NaN, height: 1280 }, VIEW), null);
  assert.equal(aspectFill(SOURCE, { width: 390, height: Number.NaN }), null);
});

/* ---------------------------- the silhouette --------------------------- */

test('a head-shaped mask becomes an outline in the preview’s own points', () => {
  const mask = ellipseMask(128, { cx: 0.5, cy: 0.4, rx: 0.26, ry: 0.22 });
  const hair = hairSilhouette(mask, GEOMETRY);
  assert.ok(hair, 'a clean mask has an outline in it');
  assert.ok(hair.points.length >= HAIR_FIT.minPoints * 2);
  assert.equal(hair.points.length % 2, 0, 'x then y, per point');
  for (const n of hair.points) assert.ok(Number.isFinite(n));

  // Where the ellipse is, carried through both scales by hand.
  const p = aspectFill(SOURCE, VIEW);
  assert.ok(p);
  const box = extent(hair);
  const left = (0.5 - 0.26) * SOURCE.width * p.scale + p.dx;
  const right = (0.5 + 0.26) * SOURCE.width * p.scale + p.dx;
  const top = (0.4 - 0.22) * SOURCE.height * p.scale + p.dy;
  const bottom = (0.4 + 0.22) * SOURCE.height * p.scale + p.dy;
  // Within a mask pixel's worth of the preview, which is what a
  // boundary walked on a 128 grid can promise.
  const tolerance = (SOURCE.width / 128) * p.scale + 1;
  assert.ok(Math.abs(box.minX - left) < tolerance, `${box.minX} vs ${left}`);
  assert.ok(Math.abs(box.maxX - right) < tolerance, `${box.maxX} vs ${right}`);
  assert.ok(Math.abs(box.minY - top) < tolerance * 2, `${box.minY} vs ${top}`);
  assert.ok(Math.abs(box.maxY - bottom) < tolerance * 2, `${box.maxY} vs ${bottom}`);
});

test('the outline moves with the mask rather than staying where it was', () => {
  const low = hairSilhouette(ellipseMask(128, { cx: 0.5, cy: 0.6, rx: 0.2, ry: 0.2 }), GEOMETRY);
  const high = hairSilhouette(ellipseMask(128, { cx: 0.5, cy: 0.3, rx: 0.2, ry: 0.2 }), GEOMETRY);
  assert.ok(low);
  assert.ok(high);
  assert.ok(extent(high).minY < extent(low).minY, 'a mask higher in the frame reads higher');
});

test('the walk is thinned, so a big mask does not hand over a thousand points', () => {
  const hair = hairSilhouette(ellipseMask(256, { cx: 0.5, cy: 0.45, rx: 0.3, ry: 0.28 }), GEOMETRY);
  assert.ok(hair);
  assert.ok(
    hair.points.length / 2 <= HAIR_FIT.maxPoints,
    `${hair.points.length / 2} points came back`,
  );
});

test('a patch far smaller than the head cannot pull the outline down to it', () => {
  const side = 128;
  const mask = ellipseMask(side, { cx: 0.5, cy: 0.4, rx: 0.24, ry: 0.22 });
  const data = mask.data as Float32Array;
  // A small bright square in the bottom-left: a shadow, a sleeve, a
  // doorway. It is real in the mask and it is not the head.
  for (let y = side - 14; y < side - 4; y += 1) {
    for (let x = 4; x < 14; x += 1) data[y * side + x] = 0.95;
  }
  const hair = hairSilhouette(mask, GEOMETRY);
  assert.ok(hair);
  const p = aspectFill(SOURCE, VIEW);
  assert.ok(p);
  const patchBottom = ((side - 4) / side) * SOURCE.height * p.scale + p.dy;
  assert.ok(
    extent(hair).maxY < patchBottom - 20,
    'the outline stops at the head, not at the patch below it',
  );
});

test('hair either side of a face is one silhouette, not the larger half of one', () => {
  const side = 128;
  const data = new Float32Array(side * side).fill(0.02);
  // Two vertical bands with a gap between them: the mask a head of hair
  // falling either side of a face produces from the front.
  const fill = (x0: number, x1: number): void => {
    for (let y = 24; y < 96; y += 1) {
      for (let x = x0; x < x1; x += 1) data[y * side + x] = 0.9;
    }
  };
  fill(24, 48);
  fill(80, 104);
  const hair = hairSilhouette({ width: side, height: side, data }, GEOMETRY);
  assert.ok(hair, 'two comparable pieces are one head of hair');

  const p = aspectFill(SOURCE, VIEW);
  assert.ok(p);
  const box = extent(hair);
  const left = (24 / side) * SOURCE.width * p.scale + p.dx;
  const right = (104 / side) * SOURCE.width * p.scale + p.dx;
  const tolerance = (SOURCE.width / side) * p.scale + 1;
  assert.ok(Math.abs(box.minX - left) < tolerance, `${box.minX} vs ${left}`);
  assert.ok(
    Math.abs(box.maxX - right) < tolerance,
    `the far side has to be in the outline too: ${box.maxX} vs ${right}`,
  );
});

test('the boundary walk cannot be stuck on one loop for eight thousand steps', () => {
  // Jacob's stopping rule closes an ordinary loop the first time the
  // walk leaves the start pixel the way it first left it. A ragged
  // region can put the walk back on the start leaving it some other way,
  // and the rule says nothing about that — so a second cap counts those
  // returns, and it is small. `maxSteps` behind it is a last resort, not
  // the working stopping rule.
  assert.ok(HAIR_FIT.maxStartVisits >= 2, 'a loop has to be allowed to close normally');
  assert.ok(
    HAIR_FIT.maxStartVisits <= 8,
    'and a walk round the same loop eight times has learnt nothing new',
  );
  assert.ok(HAIR_FIT.maxStartVisits * 4 < HAIR_FIT.maxSteps, 'the cheap cap comes first');

  // A ragged mask — a comb of one-pixel teeth on a bar — is the shape
  // this is defensive about. It still produces an outline, and a bounded
  // one.
  const side = 96;
  const data = new Float32Array(side * side).fill(0.01);
  for (let y = 30; y < 50; y += 1) {
    for (let x = 20; x < 76; x += 1) data[y * side + x] = 0.9;
  }
  for (let x = 20; x < 76; x += 2) {
    for (let y = 22; y < 30; y += 1) data[y * side + x] = 0.9;
  }
  const hair = hairSilhouette({ width: side, height: side, data }, GEOMETRY);
  assert.ok(hair, 'a comb is still a subject');
  assert.ok(hair.points.length / 2 <= HAIR_FIT.maxPoints);
});

/* ------------------------------ the refusals --------------------------- */

test('a mask with almost nothing in it is refused rather than outlined', () => {
  const mask = ellipseMask(128, { cx: 0.5, cy: 0.5, rx: 0.02, ry: 0.02 });
  assert.equal(hairSilhouette(mask, GEOMETRY), null);
});

test('a mask that called almost everything hair is refused', () => {
  const side = 64;
  const data = new Float32Array(side * side).fill(0.99);
  assert.equal(hairSilhouette({ width: side, height: side, data }, GEOMETRY), null);
});

test('an empty mask is refused', () => {
  const side = 64;
  const data = new Float32Array(side * side).fill(0.01);
  assert.equal(hairSilhouette({ width: side, height: side, data }, GEOMETRY), null);
});

test('confetti is refused: no one region is enough of what was called hair', () => {
  const side = 96;
  const data = new Float32Array(side * side).fill(0);
  // A scatter of two-pixel blocks over a tenth of the frame. Plenty of
  // hair by area; no subject anywhere in it.
  for (let y = 0; y < side; y += 6) {
    for (let x = 0; x < side; x += 4) {
      data[y * side + x] = 0.9;
      data[y * side + x + 1] = 0.9;
    }
  }
  assert.equal(hairSilhouette({ width: side, height: side, data }, GEOMETRY), null);
});

test('a mask whose data is short of its own size is refused', () => {
  assert.equal(
    hairSilhouette({ width: 64, height: 64, data: new Float32Array(100) }, GEOMETRY),
    null,
  );
});

test('a preview with no size yet is refused rather than outlined onto a point', () => {
  const mask = ellipseMask(128, { cx: 0.5, cy: 0.4, rx: 0.26, ry: 0.22 });
  assert.equal(hairSilhouette(mask, { source: SOURCE, view: { width: 0, height: 0 } }), null);
  assert.equal(hairSilhouette(mask, { source: { width: 0, height: 0 }, view: VIEW }), null);
});

test('a mask of no size at all is refused', () => {
  assert.equal(hairSilhouette({ width: 0, height: 0, data: new Float32Array(0) }, GEOMETRY), null);
  assert.equal(
    hairSilhouette({ width: 12.5, height: 12, data: new Float32Array(200) }, GEOMETRY),
    null,
  );
});

/* ------------------------------- the beat ------------------------------ */

test('a fit already running drops the beat rather than queueing behind it', () => {
  assert.equal(dueForFit({ busy: true, at: 0 }, 10_000), false);
});

test('the beat holds its interval', () => {
  assert.equal(dueForFit({ busy: false, at: 1000 }, 1000 + FIT_INTERVAL_MS - 1), false);
  assert.equal(dueForFit({ busy: false, at: 1000 }, 1000 + FIT_INTERVAL_MS), true);
});

test('nothing has been fitted yet, so the first beat runs', () => {
  assert.equal(dueForFit(FIT_CLOCK_START, Date.now()), true);
});

test('a clock that ran backwards does not stop the fit for ever', () => {
  assert.equal(dueForFit({ busy: false, at: 9_000_000 }, 1000), true);
  assert.equal(dueForFit({ busy: false, at: 0 }, Number.NaN), false);
});

test('the beat is slow on purpose — three a second, not thirty', () => {
  assert.ok(FIT_INTERVAL_MS >= 250, 'a faster beat would put the segmenter on the frame rate');
  assert.ok(FIT_INTERVAL_MS <= 500, 'a slower one would let the cap lag a head that moved');
});

test('the timer ticks inside the beat, so its own jitter cannot cost a whole one', () => {
  assert.ok(FIT_TICK_MS < FIT_INTERVAL_MS, 'a tick as long as the beat is a beat that can be missed');
  assert.ok(FIT_TICK_MS >= FIT_INTERVAL_MS / 4, 'and ticking far faster is wakeups for nothing');
});

/*
  The beat, run rather than reasoned about.

  This is the check that was missing when the loop shipped at half its
  documented rate. `dueForFit` is right on its own terms in both
  disciplines; what decides the cadence is WHICH END of a fit the clock
  is stamped at, and that is only visible when a tick train is actually
  run against it. So one is: a timer at `FIT_TICK_MS`, a fit that takes
  `work` milliseconds, the real rule, and the real clock discipline.
*/
type Discipline = 'start' | 'finish';

function beats(
  work: number,
  discipline: Discipline,
  tick: number = FIT_TICK_MS,
  span = 10_000,
): number[] {
  // An arbitrary wall-clock offset, so `FIT_CLOCK_START.at` of 0 is in
  // the past exactly as it is on a phone that has been on for a while.
  const T0 = 1_000_000;
  let clock: FitClock = { ...FIT_CLOCK_START };
  let busyUntil = -1;
  let startedAt = 0;
  const starts: number[] = [];

  for (let t = T0; t <= T0 + span; t += 1) {
    if (busyUntil >= 0 && t >= busyUntil) {
      // The fit finished — at `busyUntil`, which is when the work ended
      // rather than when this loop noticed. That distinction is the
      // whole of the finish discipline: a fit taking no time at all
      // stamps the same instant it started, which is why work of 0 ms
      // is the one duration that hides the fault.
      clock = { busy: false, at: discipline === 'start' ? startedAt : busyUntil };
      busyUntil = -1;
    }
    if ((t - T0) % tick !== 0) continue;
    if (!dueForFit(clock, t)) continue;
    starts.push(t - T0);
    startedAt = t;
    clock = { busy: true, at: t };
    busyUntil = t + work;
  }
  return starts;
}

function gaps(starts: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < starts.length; i += 1) out.push(starts[i] - starts[i - 1]);
  return out;
}

test('the beat really is about three a second, for every fit that fits inside it', () => {
  for (const work of [0, 5, 50, 120, 300]) {
    const starts = beats(work, 'start');
    const rate = (starts.length - 1) / 10;
    assert.ok(rate >= 2.8 && rate <= 3.2, `${work} ms of work gave ${rate} fits a second`);
    assert.ok(
      Math.max(...gaps(starts)) <= FIT_INTERVAL_MS + FIT_TICK_MS,
      `${work} ms of work left a gap of ${Math.max(...gaps(starts))} ms`,
    );
  }
});

test('a fit slower than the beat spreads it rather than stacking behind it', () => {
  const starts = beats(500, 'start');
  for (const gap of gaps(starts)) {
    assert.ok(gap >= 500, `a 500 ms fit cannot start again ${gap} ms later`);
    assert.ok(gap <= 500 + FIT_TICK_MS, `and it should not wait ${gap} ms either`);
  }
});

test('stamping the clock when a fit FINISHES is what halved the rate', () => {
  // Not a behaviour this file wants — a regression check, and the one
  // that was missing. The loop shipped stamping on completion and
  // ticking at the whole interval: `dueForFit` then measures from the
  // END of the last fit, every second tick lands inside the interval and
  // is refused, and the rate is half of what four comments claimed. If
  // this ever stops being true, the test above is measuring nothing.
  for (const work of [5, 50, 120, 300]) {
    const rate = (beats(work, 'finish', FIT_INTERVAL_MS).length - 1) / 10;
    assert.ok(rate < 2, `${work} ms of work would have given ${rate} fits a second`);
  }
  // And the one case that hid it: work that takes no time at all. On a
  // phone the fit cannot take no time, which is why the shipped cadence
  // was never the documented one.
  assert.ok(
    (beats(0, 'finish', FIT_INTERVAL_MS).length - 1) / 10 >= 2.8,
    'which is why 0 ms of work looked fine',
  );
  // The half tick alone does not fix it either: it recovers some of the
  // loss and still leaves the beat short of three a second. Both halves
  // of the fix are load-bearing.
  for (const work of [5, 50, 120, 300]) {
    const rate = (beats(work, 'finish').length - 1) / 10;
    assert.ok(rate < 2.5, `a half tick alone still gives only ${rate} fits a second`);
  }
});

/* --------------------------- into the real fit ------------------------- */

const CX = 195;
const CY = 340;
const WIDTH = 180;
const HEIGHT = 236;

function face(): CapSource {
  return {
    cx: CX,
    cy: CY,
    width: WIDTH,
    height: HEIGHT,
    contours: syntheticContours(CX, CY, WIDTH, HEIGHT, 0),
    yaw: 0,
    pitch: 0,
    roll: 0,
  };
}

test('what this produces is what `fitHairCap` takes', () => {
  // The assignment is half the test: if `HairSilhouette` ever changes,
  // this file stops compiling and `npx tsc --noEmit` says so.
  const hair = hairSilhouette(ellipseMask(128, { cx: 0.5, cy: 0.4, rx: 0.26, ry: 0.24 }), GEOMETRY);
  assert.ok(hair);
  const asSilhouette: HairSilhouette = hair;
  const fit = fitHairCap(face(), asSilhouette, CAP_FIT_DEFAULT);
  assert.ok(fit, 'a real silhouette gives the real fit a real answer');
  assert.ok(Number.isFinite(fit.lift) && Number.isFinite(fit.widen) && Number.isFinite(fit.shift));
});

test('a taller head of hair lifts the cap further than a shorter one', () => {
  const small = hairSilhouette(
    ellipseMask(128, { cx: 0.5, cy: 0.42, rx: 0.2, ry: 0.18 }),
    GEOMETRY,
  );
  const big = hairSilhouette(ellipseMask(128, { cx: 0.5, cy: 0.36, rx: 0.3, ry: 0.3 }), GEOMETRY);
  assert.ok(small);
  assert.ok(big);
  const tight = fitHairCap(face(), small, CAP_FIT_DEFAULT);
  const loose = fitHairCap(face(), big, CAP_FIT_DEFAULT);
  assert.ok(tight);
  assert.ok(loose);
  assert.ok(loose.lift > tight.lift, `${loose.lift} should clear ${tight.lift}`);
  assert.ok(loose.widen > tight.widen, `${loose.widen} should clear ${tight.widen}`);
});

/* ---------------------------- the call chain --------------------------- */

const repoFile = (relative: string): URL => new URL(`../../${relative}`, import.meta.url);

/** Source with its comments removed, so a chain cannot be satisfied by prose. */
function code(relative: string): string {
  return readFileSync(repoFile(relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

test('the scan screen really calls the chain that puts the mesh on the hair', () => {
  // The previous lane shipped `setHair` with nothing calling it and
  // reported the complaint fixed. This is the check that would have
  // caught that: every link, read off the screen's own source with the
  // comments stripped out.
  const screen = code('src/app/hair-scan.tsx');
  for (const link of [
    'sampleArFrame(',
    'segmentFrame',
    'hairSilhouette(',
    'setHair(',
    'dueForFit(',
  ]) {
    assert.ok(screen.includes(link), `src/app/hair-scan.tsx must reach ${link}`);
  }
  assert.ok(
    screen.includes("import('@/features/assessment/hair-segmenter')"),
    'the segmenter is reached lazily, behind the Nitro check',
  );
  assert.ok(
    screen.includes('nitroAvailable()'),
    'and the Nitro check is what stands in front of it',
  );
});

test('the live fit is gated on a build that can actually do it', () => {
  const screen = code('src/app/hair-scan.tsx');
  assert.ok(screen.includes('canSampleFrame()'), 'a binary without the sampler is asked first');
  assert.ok(
    /if \(!arkit \|\| !cameraLive \|\| !foreground\) return undefined;/.test(screen),
    'and the loop only runs on the AR path, while the camera is live and in front',
  );
});

test('the mesh no longer says nothing calls setHair, because something does', () => {
  const mesh = readFileSync(repoFile('src/components/hair-scan/hair-mesh.tsx'), 'utf8');
  assert.ok(
    !/Nothing calls `setHair` yet/.test(mesh),
    'the comment has to go when the caller arrives, or the next reader is misled',
  );
});

test('the screen stamps the beat where the rule expects it, and ticks inside it', () => {
  // The two lines that decide the real cadence, read off the screen. A
  // loop that stamps `Date.now()` in its `finally` is measuring the
  // interval from the end of a fit, which is the half-rate fault.
  const screen = code('src/app/hair-scan.tsx');
  assert.ok(
    screen.includes('fitClock.current = { busy: false, at: now }'),
    'the clock is stamped at the fit’s start, not at its finish',
  );
  assert.ok(
    !/busy: false, at: Date\.now\(\)/.test(screen),
    'a completion stamp halves the beat; see the simulation above',
  );
  assert.ok(screen.includes('}, FIT_TICK_MS)'), 'and the timer ticks inside the beat');
});

test('the beat is not spent before the preview has a size', () => {
  // Until the camera has delivered a frame the preview measures nothing,
  // `aspectFill` refuses, and every fit is a native render plus a model
  // run thrown away. The geometry is known before the sample is asked
  // for, so it is checked there.
  const screen = code('src/app/hair-scan.tsx');
  assert.ok(
    /if \(!\(view\.width > 0\) \|\| !\(view\.height > 0\)\) return;/.test(screen),
    'the screen checks the preview’s size before it asks for a frame',
  );
  const gate = screen.indexOf('view.width > 0');
  const sample = screen.indexOf('sampleArFrame(');
  assert.ok(gate > 0 && sample > gate, 'and it checks it BEFORE the sample, not after');
});

test('one interpreter, one run at a time, whichever road asked', () => {
  // The live beat and the analysis of the kept photographs both reach
  // the same cached model, and they overlap for one beat's width at the
  // handover into `processing`: stopping the timer does not stop a
  // `segmentFrame` already inside the interpreter. Two runs interleaving
  // there would put one road's frame into the other's reading, and the
  // still road's readings are the figures the app shows.
  const source = code('src/features/assessment/hair-segmenter.ts');
  const runs = source.match(/model\.run\(/g) ?? [];
  assert.equal(runs.length, 1, 'there is exactly one place the interpreter is run');
  assert.ok(source.includes('modelQueue'), 'and the runs are chained rather than racing');
  const calls = source.match(/await runModel\(/g) ?? [];
  assert.equal(calls.length, 2, 'both roads go through it: the live frame and the photograph');
});

test('the segmenter keeps its still road and gains a raw one', () => {
  const source = code('src/features/assessment/hair-segmenter.ts');
  assert.ok(
    source.includes('.resize({ width: side, height: side })'),
    'the photograph road still squashes rather than crops',
  );
  assert.ok(source.includes('export async function segmentFrame('), 'and there is a raw road');
  assert.ok(!source.includes('.crop('), 'neither road may crop');
});

test('nothing on the live road reaches the network', () => {
  for (const file of [
    'src/features/hair-scan/hair-fit.ts',
    'src/features/assessment/hair-segmenter.ts',
    'modules/hair-face-tracking/src/sample.ts',
    'modules/hair-face-tracking/src/native.ts',
  ]) {
    const text = readFileSync(repoFile(file), 'utf8');
    for (const reach of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'axios']) {
      assert.ok(!text.includes(reach), `${file} must not reach ${reach}`);
    }
  }
});

test('the fit file claims nothing about anybody’s hair', () => {
  const text = readFileSync(repoFile('src/features/hair-scan/hair-fit.ts'), 'utf8').toLowerCase();
  for (const claim of ['density', 'thinning', 'diagnos', 'regrow', 'hair loss', 'norwood']) {
    assert.ok(!text.includes(claim), `hair-fit.ts says "${claim}"`);
  }
});
