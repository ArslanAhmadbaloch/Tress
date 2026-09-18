/**
 * Attacking the part-line search.
 *
 * The detector's job is to find a narrow, straight, elongated run of
 * scalp with hair on both sides of it. The cases below are the four
 * shapes it is supposed to find — a centre part, a side part, an angled
 * part, a part that closes half way down — and, far more importantly,
 * the five it must refuse: no part at all, scattered noise at three
 * densities, a bare patch, a short streak, and scalp open at the edge of
 * the window.
 *
 * THE FALSE POSITIVE IS THE TEST THAT MATTERS. Finding a parting that is
 * there is a nice-to-have; a report that draws a parting on a head that
 * has none is a lie the app told, and everything else in this codebase
 * is built to stop that happening. So the noise cases carry the
 * measured numbers, not just a pass: a margin is only worth something if
 * somebody can see how wide it is.
 *
 * `part line: the confidence floor, measured` is the widest of them —
 * 480 noise masks across eight densities — and it is the reason
 * `minContrast` exists: at ten seeds and three densities the detector
 * looked safe, and at sixty seeds and eight it drew a parting on pure
 * noise. Any claim the source makes about where the thresholds sit is
 * asserted there, so the numbers in the comments cannot drift away from
 * the numbers the code produces.
 *
 * Every mask here is synthetic, which is the honest limit of this file.
 * A synthetic stripe is perfectly labelled; a real mask over dark hair
 * on a dark scalp is not. Nothing here should be read as evidence about
 * a real head — only as evidence that the arithmetic does what it says.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HAIR, type MaskImage } from '@/features/assessment/hair-mask';
import {
  MASK_PIXELS,
  PART_LIMITS,
  PART_WINDOW_REGIONS,
  findPartLine,
  partWindowBox,
  readPartLine,
  rectifyPartWindow,
  searchPartLine,
  type MaskWindow,
  type PartFrame,
} from '@/features/hair-scan/measure/part-line';
import { readRegion } from '@/features/hair-scan/measure/coverage';
import {
  faceFrameOf,
  regionBox,
  toFace,
  type FaceFrame,
  type FaceObservation,
} from '@/features/hair-scan/measure/regions';

/* -------------------------------- fixtures ------------------------------- */

const SIZE = 48;
const WHOLE: MaskWindow = { x: 0, y: 0, width: SIZE, height: SIZE };

/** Hair everywhere, confidently. The starting point for every mask below. */
function allHair(size = SIZE): MaskImage {
  const data = new Float32Array(size * size);
  data.fill(0.92);
  return { width: size, height: size, data };
}

/** Marks one pixel as scalp — well under the hair threshold, as a real mask would. */
function scalpAt(mask: MaskImage, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return;
  mask.data[y * mask.width + x] = 0.06;
}

/**
 * A straight parting.
 *
 * `centreAt(y)` gives the stripe's left-hand pixel on that row, so a
 * slope is just a function of y. `rows` is how far down the window it
 * runs, which is how a parting that closes half way is drawn.
 */
function partedMask(options: {
  centreAt: (y: number) => number;
  width: number;
  rows: number;
}): MaskImage {
  const mask = allHair();
  for (let y = 0; y < options.rows; y += 1) {
    const start = Math.round(options.centreAt(y));
    for (let i = 0; i < options.width; i += 1) scalpAt(mask, start + i, y);
  }
  return mask;
}

/** Deterministic noise: the same seed gives the same mask on every machine and every run. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hair with a share of its pixels misclassified as scalp, scattered. */
function noisyMask(share: number, seed: number): MaskImage {
  const mask = allHair();
  const random = seeded(seed);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (random() < share) scalpAt(mask, x, y);
    }
  }
  return mask;
}

/* --------------------------- the shapes it finds -------------------------- */

test('part line: a clear centre part is found, in the right place, pointing straight down', () => {
  const mask = partedMask({ centreAt: () => 22, width: 3, rows: SIZE });
  const found = findPartLine(mask, WHOLE, MASK_PIXELS);
  assert.ok(found, 'a stripe of scalp down the middle with hair either side is a parting');
  // Pixels 22, 23 and 24 are scalp, so the stripe's centre is 23.5.
  assert.ok(Math.abs(found.position - 23.5) < 0.6, `position ${found.position}`);
  assert.ok(Math.abs(found.angle) < 2, `angle ${found.angle}`);
  assert.ok(Math.abs(found.width - 3) < 0.6, `width ${found.width}`);
  assert.ok(found.scalpShare > 0.95, `the stripe is open the whole way: ${found.scalpShare}`);
  assert.equal(found.extent, 1);
  assert.equal(found.span, 1);
  assert.equal(found.rows, SIZE);
  assert.ok(found.confidence > 0.8, `a clean synthetic part deserves high confidence: ${found.confidence}`);
});

test('part line: a side part is found where it is, not pulled towards the middle', () => {
  const mask = partedMask({ centreAt: () => 10, width: 3, rows: SIZE });
  const found = findPartLine(mask, WHOLE, MASK_PIXELS);
  assert.ok(found);
  assert.ok(Math.abs(found.position - 11.5) < 0.6, `position ${found.position}`);
  assert.ok(Math.abs(found.angle) < 2, `angle ${found.angle}`);
  assert.ok(found.confidence > 0.8, `confidence ${found.confidence}`);
});

test('part line: a part at an angle comes back with the angle it was drawn at', () => {
  // Half a pixel across per row down: 26.57° from the vertical.
  const mask = partedMask({ centreAt: (y) => 8 + 0.5 * y, width: 3, rows: SIZE });
  const found = findPartLine(mask, WHOLE, MASK_PIXELS);
  assert.ok(found, 'a parting does not have to be vertical');
  const expected = (Math.atan(0.5) * 180) / Math.PI;
  assert.ok(Math.abs(found.angle - expected) < 3, `angle ${found.angle}, drawn at ${expected}`);
  // It crosses the middle row at 8 + 0.5 × 23.5 + 1 = 20.75.
  assert.ok(Math.abs(found.position - 20.75) < 1.2, `position ${found.position}`);
  assert.ok(found.confidence > 0.7, `confidence ${found.confidence}`);
});

test('part line: a part that closes half way down says so rather than claiming the whole window', () => {
  const rows = Math.round(SIZE * 0.6);
  const mask = partedMask({ centreAt: () => 22, width: 3, rows });
  const found = findPartLine(mask, WHOLE, MASK_PIXELS);
  assert.ok(found, 'more than half the rows carry it, so it is still a line');
  assert.ok(Math.abs(found.extent - 0.6) < 0.03, `extent ${found.extent}`);
  assert.ok(Math.abs(found.span - 0.6) < 0.03, `span ${found.span}`);
  // The stripe swept down the WHOLE window is open for six rows in ten.
  assert.ok(Math.abs(found.scalpShare - 0.6) < 0.05, `scalpShare ${found.scalpShare}`);

  const whole = findPartLine(partedMask({ centreAt: () => 22, width: 3, rows: SIZE }), WHOLE, MASK_PIXELS);
  assert.ok(whole);
  assert.ok(
    found.confidence < whole.confidence,
    `half a parting must be less certain than a whole one: ${found.confidence} vs ${whole.confidence}`,
  );
});

/* ------------------------- the shapes it must refuse ---------------------- */

test('part line: hair with no parting in it produces no parting', () => {
  const search = searchPartLine(allHair(), WHOLE, MASK_PIXELS);
  assert.equal(search.line, null, 'short hair is the common case, and it has no parting');
  assert.equal(search.reason, 'noScalpRuns');
});

test('part line: SCATTERED NOISE DOES NOT PRODUCE A PHANTOM PARTING', () => {
  /*
    The test this whole file exists for.

    A mask with misclassified pixels sprinkled through it contains, by
    chance, plenty of little runs of scalp with hair either side. Some
    of them will fall near a straight line — with 121 tilts tried and 48
    rows to draw from, some always do. What they will not do is run ON:
    a real parting is a continuous stripe, and chance agreement is a
    dotted one.

    Three densities, ten seeds each, and the reason is asserted as well
    as the null, so a future change that starts rejecting these for the
    wrong reason shows up here rather than passing quietly.
  */
  const refusals = new Map<string, number>();
  for (const share of [0.03, 0.08, 0.15]) {
    for (let seed = 1; seed <= 10; seed += 1) {
      const search = searchPartLine(noisyMask(share, seed * 7919), WHOLE, MASK_PIXELS);
      assert.equal(
        search.line,
        null,
        `noise at ${share * 100}% (seed ${seed}) was read as a parting: ${JSON.stringify(search.line)}`,
      );
      const key = `${share}:${search.reason}`;
      refusals.set(key, (refusals.get(key) ?? 0) + 1);
    }
  }
  // Every refusal is one of the rules, not an accident of arithmetic.
  for (const key of refusals.keys()) {
    const reason = key.split(':')[1];
    assert.ok(
      ['tooShort', 'tooBroken', 'tooFaint', 'noScalpRuns'].includes(reason),
      `noise refused for an unexpected reason: ${reason}`,
    );
  }
});

test('part line: the confidence floor, measured', () => {
  /*
    The sweep the thresholds are set from, run rather than remembered.

    The comment on `minConfidence` used to state measured counts from a
    sweep that lived nowhere: a verifier rebuilt it against the shipped
    module and got different numbers, and nothing in the repo could
    settle it. This is that sweep, in the test file, asserted on every
    run. Anything the source comment claims about the floor is a claim
    this test either reproduces or fails on.

    Widening it to 480 masks also found a real false positive that the
    ten-seed test above never reached: noise at 35 per cent, seed 46,
    scored 0.5024 and came back as a LINE on a mask with no parting
    anywhere in it. `minContrast` was added for that — a parting is the
    DIFFERENCE between the stripe and its flanks, and a mask that is
    noise everywhere has no difference to show, however much hair its
    flanks read in isolation. That mask is asserted by name below.
  */
  const DENSITIES = [0.03, 0.08, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];
  const SEEDS = 60;

  let masks = 0;
  let reachedContrast = 0;
  let reachedConfidence = 0;
  let worstContrast = 0;
  let worstConfidence = 0;
  const reasons = new Set<string>();

  for (const share of DENSITIES) {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const search = searchPartLine(noisyMask(share, seed * 7919), WHOLE, MASK_PIXELS);
      masks += 1;
      assert.equal(
        search.line,
        null,
        `noise at ${share * 100}% (seed ${seed}) was read as a parting: ${JSON.stringify(search.line)}`,
      );
      reasons.add(search.reason);
      if (search.reason === 'noContrast') {
        reachedContrast += 1;
        worstContrast = Math.max(worstContrast, search.contrast ?? 0);
      }
      if (search.reason === 'tooFaint') {
        reachedConfidence += 1;
        worstConfidence = Math.max(worstConfidence, search.confidence ?? 0);
      }
    }
  }

  assert.equal(masks, DENSITIES.length * SEEDS, '480 masks with no parting in any of them');
  for (const reason of reasons) {
    assert.ok(
      ['noScalpRuns', 'tooShort', 'tooBroken', 'flanksNotHair', 'noContrast', 'tooFaint'].includes(reason),
      `noise refused for an unexpected reason: ${reason}`,
    );
  }

  /*
    The phantom side. The counts are exact — 480 masks, no partings — but
    the margin is asserted as a BOUND rather than as the float it
    measures to. The band search tie-breaks on `Math.cos`, which the
    language does not pin to the last bit across platforms, so an exact
    float here would be a number this test could not honestly promise.
    It measured 0.216 against a bar of 0.35 when this was written.
  */
  assert.ok(reachedContrast > 100, `the contrast rule is the one doing the work: ${reachedContrast} of ${masks}`);
  assert.ok(
    worstContrast < PART_LIMITS.minContrast - 0.1,
    `the strongest phantom contrast leaves real headroom: ${worstContrast} against ${PART_LIMITS.minContrast}`,
  );
  assert.equal(
    reachedConfidence,
    0,
    `nothing in 480 noise masks now reaches the confidence floor at all (worst ${worstConfidence})`,
  );

  /*
    The legitimate side, and the honest shape of the floor. `minExtent`
    admits a parting on 22 of 48 rows (0.458 against 0.45); the
    confidence floor then refuses it at 0.4998, and keeps 23 rows at
    0.5316. So 0.5 is a slightly stricter restatement of `minExtent`
    rather than a gap measured between two populations — and a round
    number landing two ten-thousandths above a real reading is a
    coincidence. It is asserted here so that nobody can describe it as a
    margin.
  */
  const partedRows = (rows: number): MaskImage => partedMask({ centreAt: () => 22, width: 3, rows });

  const justUnder = searchPartLine(partedRows(22), WHOLE, MASK_PIXELS);
  assert.equal(justUnder.line, null, '22 rows clears minExtent and is still refused');
  assert.equal(justUnder.reason, 'tooFaint', 'and it is the confidence floor that refuses it');
  const under = justUnder.line === null ? (justUnder.confidence ?? 0) : 1;
  assert.ok(
    under > 0.49 && under < PART_LIMITS.minConfidence,
    `the weakest structurally admissible parting sits just under the floor: ${under}`,
  );

  const justOver = findPartLine(partedRows(23), WHOLE, MASK_PIXELS);
  assert.ok(justOver, '23 rows is kept');
  assert.ok(
    justOver.confidence > PART_LIMITS.minConfidence && justOver.confidence < 0.56,
    `and it is kept by a whisker, not by a margin: ${justOver.confidence}`,
  );
  assert.ok(
    justOver.confidence - under < 0.05,
    `the step across the floor is one row wide: ${under} to ${justOver.confidence}`,
  );

  // The contrast a real parting shows, recoverable from the reading itself.
  assert.ok(
    justOver.flankShare + justOver.scalpShare - 1 >= PART_LIMITS.minContrast,
    `a real parting carries its own contrast: ${justOver.flankShare} + ${justOver.scalpShare}`,
  );

  // The mask that got through before `minContrast` existed, by name.
  const wasPhantom = searchPartLine(noisyMask(0.35, 46 * 7919), WHOLE, MASK_PIXELS);
  assert.equal(wasPhantom.line, null, 'the mask that used to score 0.5024 is refused');
  assert.equal(wasPhantom.reason, 'noContrast', 'and refused for being noise rather than for being faint');
});

test('part line: noise with a real parting buried in it still finds the parting, not the noise', () => {
  /*
    The other half of the false-positive question. A detector that
    refuses everything is trivially safe and useless, so the same noise
    that must not produce a line must not swallow one either.
  */
  const mask = noisyMask(0.05, 424242);
  for (let y = 0; y < SIZE; y += 1) {
    for (let i = 0; i < 3; i += 1) scalpAt(mask, 22 + i, y);
    // The stripe's own flanks are cleaned, as a real parting's edges are:
    // the hair beside a parting is hair, whatever the rest of the mask does.
    for (const x of [20, 21, 25, 26]) mask.data[y * SIZE + x] = 0.92;
  }
  const found = findPartLine(mask, WHOLE, MASK_PIXELS);
  assert.ok(found, 'the parting survives a noisy mask');
  assert.ok(Math.abs(found.position - 23.5) < 1, `position ${found.position}`);
  assert.ok(Math.abs(found.angle) < 4, `angle ${found.angle}`);
});

test('part line: a bare patch is not a parting', () => {
  // A wide open area of scalp is a different thing entirely, and this
  // function has no words for it. It says nothing rather than calling it
  // a very wide part.
  const mask = allHair();
  for (let y = 8; y < 40; y += 1) {
    for (let x = 14; x < 34; x += 1) scalpAt(mask, x, y);
  }
  const search = searchPartLine(mask, WHOLE, MASK_PIXELS);
  assert.equal(search.line, null, 'twenty pixels across is not a parting');
  assert.ok(search.reason === 'noScalpRuns' || search.reason === 'tooShort', search.reason ?? '');
});

test('part line: a short streak is not a parting', () => {
  const mask = partedMask({ centreAt: () => 22, width: 3, rows: 12 });
  const search = searchPartLine(mask, WHOLE, MASK_PIXELS);
  assert.equal(search.line, null, 'a quarter of the window is a mark, not a line');
  assert.equal(search.reason, 'tooShort');
});

test('part line: a broken line of the right length is still refused', () => {
  // Every third row, all the way down: the extent rule passes and the
  // span rule is the one doing the work.
  const mask = allHair();
  for (let y = 0; y < SIZE; y += 1) {
    if (y % 3 !== 0) continue;
    for (let i = 0; i < 3; i += 1) scalpAt(mask, 22 + i, y);
  }
  const search = searchPartLine(mask, WHOLE, MASK_PIXELS);
  assert.equal(search.line, null, 'a dotted line is not a parting');
  assert.ok(search.reason === 'tooShort' || search.reason === 'tooBroken', search.reason ?? '');
});

test('part line: scalp open at the edge of the window is never a parting', () => {
  // What a receded hairline or the background beside a head looks like:
  // scalp that is not enclosed by hair. A parting always is.
  const mask = allHair();
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < 14; x += 1) scalpAt(mask, x, y);
  }
  const search = searchPartLine(mask, WHOLE, MASK_PIXELS);
  assert.equal(search.line, null, 'open scalp is not a stripe');
  assert.equal(search.reason, 'noScalpRuns');
});

/* -------------------------------- the frame ------------------------------- */

test('part line: the reading comes back in the frame the caller anchored, not in mask pixels', () => {
  const mask = partedMask({ centreAt: () => 22, width: 3, rows: SIZE });
  // A face-anchored frame running 0–1 across the window and 0–1 down it.
  const frame: PartFrame = { originX: 0, originY: 0, perPixelX: 1 / SIZE, perPixelY: 1 / SIZE };
  const found = findPartLine(mask, WHOLE, frame);
  assert.ok(found);
  assert.ok(Math.abs(found.position - 23.5 / SIZE) < 0.02, `position ${found.position}`);
  assert.ok(Math.abs(found.width - 3 / SIZE) < 0.02, `width ${found.width}`);
  // Shares are in no units, so the frame does not touch them.
  assert.equal(found.extent, 1);
  assert.ok(found.scalpShare > 0.95);
});

test('part line: an anisotropic frame changes the angle, because the angle is in that frame', () => {
  // A mask stretched twice as wide as it is tall: a stripe leaning one
  // pixel across per row is a steeper lean once the frame is square again.
  const mask = partedMask({ centreAt: (y) => 4 + 0.5 * y, width: 3, rows: SIZE });
  const square = findPartLine(mask, WHOLE, MASK_PIXELS);
  const stretched = findPartLine(mask, WHOLE, { originX: 0, originY: 0, perPixelX: 2, perPixelY: 1 });
  assert.ok(square && stretched);
  assert.ok(
    stretched.angle > square.angle + 5,
    `${stretched.angle} should lean further than ${square.angle}`,
  );
});

/* ------------------------------ the contract ------------------------------ */

test('part line: the same mask gives the same reading every time', () => {
  // There is no RANSAC and no sampling in here: a report that redraws a
  // parting in a different place on a second look is not a measurement.
  const mask = partedMask({ centreAt: (y) => 9 + 0.3 * y, width: 4, rows: 40 });
  const first = findPartLine(mask, WHOLE, MASK_PIXELS);
  const second = findPartLine(mask, WHOLE, MASK_PIXELS);
  assert.deepEqual(first, second);
});

test('part line: a window too small to hold a line is refused rather than searched', () => {
  const mask = partedMask({ centreAt: () => 22, width: 3, rows: SIZE });
  const tiny = searchPartLine(mask, { x: 20, y: 20, width: 6, height: 4 }, MASK_PIXELS);
  assert.equal(tiny.line, null);
  assert.equal(tiny.reason, 'windowTooSmall');

  // And a window off the mask entirely, or a nonsense one, does not throw.
  assert.equal(searchPartLine(mask, { x: 400, y: 400, width: 40, height: 40 }, MASK_PIXELS).line, null);
  assert.equal(searchPartLine(mask, { x: NaN, y: 0, width: 40, height: 40 }, MASK_PIXELS).line, null);
});

test('part line: the window is what is searched, so a parting outside it is not reported', () => {
  const mask = partedMask({ centreAt: () => 6, width: 3, rows: SIZE });
  const away: MaskWindow = { x: 20, y: 0, width: 28, height: SIZE };
  assert.equal(findPartLine(mask, away, MASK_PIXELS), null, 'nothing in this window is a parting');
  assert.ok(findPartLine(mask, WHOLE, MASK_PIXELS), 'and the same mask, searched where it is, has one');
});

test('part line: the limits are the shapes the header claims, and the ones it does not', () => {
  /*
    The test this replaced was named for a claim it did not check: it
    looped over PART_LIMITS asserting only that each value was finite,
    which every number passes. The header it was named after was wrong
    as well — six of the twelve limits are not shares of anything.

    So each group is asserted for the shape it actually has, and the
    three that are absolute counts are asserted to BE absolute counts,
    so that a future change turning one of them into a share fails here
    rather than quietly changing what the search accepts.
  */
  for (const name of ['maxWidth', 'tolerance', 'minExtent', 'minSpan'] as const) {
    const value = PART_LIMITS[name];
    assert.ok(value > 0 && value < 1, `${name} is a share of the search window: ${value}`);
  }
  for (const name of ['minFlank', 'minContrast', 'minConfidence'] as const) {
    const value = PART_LIMITS[name];
    assert.ok(value > 0 && value < 1, `${name} is a share of sampled pixels or a 0-1 score: ${value}`);
  }
  for (const name of ['minRows', 'minColumns', 'runsPerRow'] as const) {
    const value = PART_LIMITS[name];
    assert.ok(Number.isInteger(value) && value >= 1, `${name} is an absolute count, not a share: ${value}`);
  }
  assert.ok(PART_LIMITS.maxTilt > 0 && PART_LIMITS.maxTilt <= 90, 'maxTilt is degrees off the vertical');
  assert.ok(PART_LIMITS.tiltStep > 0 && PART_LIMITS.tiltStep <= PART_LIMITS.maxTilt, 'tiltStep is degrees');

  assert.ok(PART_LIMITS.minSpan <= PART_LIMITS.minExtent, 'a span cannot be longer than the extent it sits in');
  assert.ok(PART_LIMITS.maxWidth < 0.5, 'half a window is never a parting');
});

test('part line: the hair threshold really is the mask module’s, on the >= side of it', () => {
  /*
    A provenance test rather than a range test. The line this replaced —
    `assert.ok(HAIR > 0 && HAIR < 1, 'the hair threshold is the mask
    module’s, not a second copy')` — asserted a range and claimed a
    source in its message; a locally redeclared `const HAIR = 0.4` in
    part-line.ts would have passed it unchanged.

    This paints a stripe at the largest value the mask can hold BELOW
    `HAIR`. Every pixel of it is scalp by a hair's breadth, so a parting
    is found — and only if the search is cutting at the imported `HAIR`.
    A second copy at any other value calls the same stripe hair (if the
    copy is lower) or the surrounding 0.92 hair scalp (if it is higher),
    and either way this fails. The exactly-at-HAIR side is covered by
    the test below: `>=` means a pixel at HAIR is hair.
  */
  const largestBelow = (value: number): number => {
    const cell = new Float32Array(1);
    for (let step = 1e-7; step < 1; step *= 2) {
      cell[0] = value - step;
      if (cell[0] < value) return cell[0];
    }
    throw new Error('no float32 below the threshold');
  };

  const mask = allHair();
  const below = largestBelow(HAIR);
  assert.ok(below < HAIR, `${below} is under the hair line`);
  for (let y = 0; y < SIZE; y += 1) {
    for (let i = 0; i < 3; i += 1) mask.data[y * SIZE + 22 + i] = below;
  }
  const found = findPartLine(mask, WHOLE, MASK_PIXELS);
  assert.ok(found, 'a stripe one float below HAIR is scalp, so there is a parting');
  assert.ok(Math.abs(found.position - 23.5) < 0.6, `position ${found.position}`);
});

test('part line: the same parting at three resolutions reads the same, in shares', () => {
  // The resolution claim, tested at three sizes rather than one. Same
  // geometry every time: the stripe is an eighth of the window across at
  // 48 cells and the same eighth at 144, so position, width, extent and
  // scalpShare all have to come back the same in window units.
  const readings = [48, 96, 144].map((size) => {
    const data = new Float32Array(size * size);
    data.fill(0.92);
    const from = Math.round(size * 0.45);
    const wide = Math.max(1, Math.round(size * 0.0625));
    for (let y = 0; y < size; y += 1) {
      for (let i = 0; i < wide; i += 1) data[y * size + from + i] = 0.06;
    }
    const frame: PartFrame = { originX: 0, originY: 0, perPixelX: 1 / size, perPixelY: 1 / size };
    const found = findPartLine({ width: size, height: size, data }, { x: 0, y: 0, width: size, height: size }, frame);
    assert.ok(found, `a parting at ${size} cells is found`);
    return { size, found, expected: (from + wide / 2) / size, wide: wide / size };
  });
  for (const { size, found, expected, wide } of readings) {
    assert.ok(Math.abs(found.position - expected) < 0.02, `${size}: position ${found.position} vs ${expected}`);
    assert.ok(Math.abs(found.width - wide) < 0.02, `${size}: width ${found.width} vs ${wide}`);
    assert.equal(found.extent, 1, `${size}: extent`);
    assert.ok(found.scalpShare > 0.95, `${size}: scalpShare ${found.scalpShare}`);
  }
  const confidences = readings.map((r) => r.found.confidence);
  assert.ok(
    Math.max(...confidences) - Math.min(...confidences) < 0.05,
    `the same parting is believed the same amount at every resolution: ${confidences.join(', ')}`,
  );
});

/* ------------------------ what it cannot see, stated ---------------------- */

test('part line: a parting the segmenter calls hair is invisible, and no threshold here changes that', () => {
  /*
    The whole search sits on top of one binary decision made somewhere
    else: `HAIR` in hair-mask.ts, at 0.5. A parting the model is only
    51% sure is not hair does not exist as far as this file is
    concerned — there is no faint version of it to find.

    That is the shape of the real-world failure. Dark hair over a dark
    scalp, a parting in shadow, wet hair lying flat: all of them push the
    model's confidence towards the middle, and this search does not
    degrade gracefully across that line, it stops. Saying nothing is the
    right behaviour; pretending the limit is not there would not be.
  */
  for (const confidence of [0.1, 0.3, 0.49]) {
    const mask = allHair();
    for (let y = 0; y < SIZE; y += 1) {
      for (let i = 0; i < 3; i += 1) mask.data[y * SIZE + 22 + i] = confidence;
    }
    assert.ok(findPartLine(mask, WHOLE, MASK_PIXELS), `a stripe at ${confidence} is below the hair line`);
  }
  for (const confidence of [HAIR, 0.51, 0.65]) {
    const mask = allHair();
    for (let y = 0; y < SIZE; y += 1) {
      for (let i = 0; i < 3; i += 1) mask.data[y * SIZE + 22 + i] = confidence;
    }
    const search = searchPartLine(mask, WHOLE, MASK_PIXELS);
    assert.equal(search.line, null, `a stripe at ${confidence} is hair, so there is nothing to find`);
    assert.equal(search.reason, 'noScalpRuns');
  }
});

test('part line: the WIDTH moves with the mask even when the parting does not, so it is not a measurement of a head', () => {
  /*
    The finding that decides how a report may use any of this.

    One soft-edged parting — the same stripe, seven pixels across,
    fading to the hair level at its edges — read at four different model
    confidences. Its POSITION does not move a pixel. Its WIDTH moves
    from five pixels to one, because width is the answer to "where did
    the 0.5 threshold cut this gradient", and that cut moves with
    lighting, focus and the model's mood.

    So: position and angle are worth reporting. Width is worth reporting
    as what the mask made of this photograph, and is NEVER to be
    compared across two scans as though a change in it were a change in
    somebody's hair. This test is here to fail the day anybody tries.
  */
  const widths: number[] = [];
  const positions: number[] = [];
  for (const depth of [0.05, 0.2, 0.35, 0.45]) {
    const mask = allHair();
    for (let y = 0; y < SIZE; y += 1) {
      for (let i = -3; i <= 3; i += 1) {
        const t = Math.abs(i) / 3;
        mask.data[y * SIZE + 23 + i] = depth + (0.92 - depth) * t * t;
      }
    }
    const found = findPartLine(mask, WHOLE, MASK_PIXELS);
    assert.ok(found, `the same parting is found at every depth (${depth})`);
    widths.push(found.width);
    positions.push(found.position);
  }
  const spread = Math.max(...positions) - Math.min(...positions);
  assert.ok(spread < 0.6, `the parting did not move: positions ${positions.join(', ')}`);
  assert.ok(
    Math.max(...widths) >= 3 * Math.min(...widths),
    `but the width did, by a factor of three or more: ${widths.join(', ')}`,
  );
});

test('part line: a whorl and a lighting band are not partings', () => {
  // The two things on a crown most likely to be mistaken for one: a
  // curved arc of scalp, and a broad bright band running across.
  const arc = allHair();
  for (let step = 0; step < 200; step += 1) {
    const a = (step / 200) * Math.PI;
    const x = Math.round(24 + 16 * Math.cos(a));
    const y = Math.round(24 + 16 * Math.sin(a));
    for (let i = -1; i <= 1; i += 1) scalpAt(arc, x + i, y);
  }
  assert.equal(findPartLine(arc, WHOLE, MASK_PIXELS), null, 'an arc is not a straight line');

  const band = allHair();
  for (let y = 22; y < 25; y += 1) {
    for (let x = 2; x < 46; x += 1) scalpAt(band, x, y);
  }
  assert.equal(findPartLine(band, WHOLE, MASK_PIXELS), null, 'a band across is not a parting down');
});

test('part line: a parting that wanders further than the tolerance is refused, not straightened', () => {
  /*
    A real parting on a curved scalp does not sit on a ruler. This says
    where the search gives up: a wander of about ±2 pixels in a 48-pixel
    window (roughly four per cent of the head's width) is still read as
    one line, and beyond that the rows stop agreeing and nothing is
    returned. That is the right way round — a bent parting reported as a
    straight one would be a made-up number — but it does mean this finds
    fewer real partings than a person would.
  */
  const wandering = (wobble: number): MaskImage => {
    const mask = allHair();
    const random = seeded(7);
    for (let y = 0; y < SIZE; y += 1) {
      const offset = Math.round((random() - 0.5) * 2 * wobble);
      for (let i = 0; i < 3; i += 1) scalpAt(mask, 22 + i + offset, y);
    }
    return mask;
  };
  const gentle = findPartLine(wandering(2), WHOLE, MASK_PIXELS);
  assert.ok(gentle, 'a gently wandering parting is still one parting');
  assert.ok(gentle.confidence < 0.9, `and it is less certain than a ruled one: ${gentle.confidence}`);
  assert.equal(findPartLine(wandering(4), WHOLE, MASK_PIXELS), null, 'a wandering line is not straightened');
});

/* ---------------------- reading it on a face-anchored frame --------------- */

/*
  Everything above searches a rectangle of mask. This last group searches
  a HEAD: the part window is the union of the measurement lane's
  `midScalp` and `crown` boxes, resampled off the photograph and onto the
  face's own coordinates before a single row is scanned.

  That is what makes the reading worth writing down twice. `position`
  comes back as `u` — face half-widths from the brow centre — which is
  the same place on the same head whatever the distance, the turn or the
  tilt of the phone. The tests paint a parting in face coordinates and
  ask for it back in face coordinates, so what is being checked is the
  whole round trip rather than the arithmetic in isolation.
*/

const IMAGE = 256;

function observedFace(pitch: number, roll: number): FaceObservation {
  return {
    bounds: { x: 0.35, y: 0.45, width: 0.3, height: 0.3 },
    image: { width: IMAGE, height: IMAGE },
    yaw: 0,
    pitch,
    roll,
  };
}

/** Hair over the whole picture, with a parting painted at `u`, in face coordinates. */
function paintedHead(frame: FaceFrame, u: number, halfWidth: number): MaskImage {
  const data = new Float32Array(IMAGE * IMAGE);
  data.fill(0.92);
  const box = partWindowBox();
  for (let y = 0; y < IMAGE; y += 1) {
    for (let x = 0; x < IMAGE; x += 1) {
      const at = toFace(frame, { x: (x + 0.5) / IMAGE, y: (y + 0.5) / IMAGE });
      if (at.v < box.v0 || at.v > box.v1) continue;
      if (Math.abs(at.u - u) <= halfWidth) data[y * IMAGE + x] = 0.06;
    }
  }
  return { width: IMAGE, height: IMAGE, data };
}

test('part line: on a real face frame, the parting comes back where it was painted, in face units', () => {
  const frame = faceFrameOf(observedFace(-70, 0));
  assert.ok(frame, 'a head tipped forward has a frame');
  for (const u of [0, 0.25, -0.3]) {
    const found = readPartLine(paintedHead(frame, u, 0.05), frame).line;
    assert.ok(found, `a parting at u=${u} is found`);
    assert.ok(Math.abs(found.position - u) < 0.04, `u=${u} read back at ${found.position}`);
    assert.ok(Math.abs(found.angle) < 4, `u=${u} angle ${found.angle}`);
    assert.ok(found.confidence > 0.8, `u=${u} confidence ${found.confidence}`);
  }
});

test('part line: a head with no parting on it reads as no parting, on a real frame too', () => {
  const frame = faceFrameOf(observedFace(-70, 0));
  assert.ok(frame);
  const data = new Float32Array(IMAGE * IMAGE);
  data.fill(0.92);
  const search = readPartLine({ width: IMAGE, height: IMAGE, data }, frame);
  assert.equal(search.line, null);
  assert.equal(search.reason, 'noScalpRuns');
});

test('part line: a tilted head reads the same parting in the same place, because the frame absorbs the tilt', () => {
  /*
    The point of working in face coordinates rather than image ones. The
    same parting, on the same head, photographed with the phone turned
    twenty-five degrees: an image-axis search would report it leaning
    twenty-five degrees and sitting somewhere else. Here it does not move.
  */
  const readings = [0, 10, 25].map((roll) => {
    const frame = faceFrameOf(observedFace(-70, roll));
    assert.ok(frame, `roll ${roll} has a frame`);
    const found = readPartLine(paintedHead(frame, 0.2, 0.05), frame).line;
    assert.ok(found, `roll ${roll} finds the parting`);
    return found;
  });
  for (const found of readings) {
    assert.ok(Math.abs(found.position - 0.2) < 0.04, `position ${found.position}`);
    assert.ok(Math.abs(found.angle) < 5, `angle ${found.angle}`);
  }
});

test('part line: a head that is not tipped forward has no top of skull to read', () => {
  // The crown is only in a photograph taken with the chin well down.
  // Facing the camera square, the window is over the forehead and past
  // the top of the head, and a reading of it would be a reading of the
  // room.
  const frame = faceFrameOf({ ...observedFace(0, 0), yaw: 85 });
  assert.ok(frame);
  const data = new Float32Array(IMAGE * IMAGE);
  data.fill(0.92);
  assert.equal(readPartLine({ width: IMAGE, height: IMAGE, data }, frame).reason, 'notVisible');
});

test('part line: the visibility bar is readRegion asked of BOTH regions, not the better of the two', () => {
  /*
    The bug this pins, found by a verifier and reproduced here.

    `readPartLine` used to gate the whole window on the BETTER facing of
    its two regions. `readRegion` gates each region on its own. At one
    degree of chin-down those two rules disagree: `midScalp` is readable
    and `crown` is not — `readRegion` returns null for it outright — yet
    the old rule opened the window and searched a crown box that is over
    half of it. A part search run on a region the measurement lane has
    already refused to read is a search of the room.

    The pose below is the disagreement itself, so this test is worth
    something in a way the yaw-85 test above is not: yaw 85 fails on yaw
    alone and would have been refused under either rule.
  */
  const data = new Float32Array(IMAGE * IMAGE);
  data.fill(0.92);
  const mask: MaskImage = { width: IMAGE, height: IMAGE, data };

  const shallow = faceFrameOf(observedFace(-1, 0));
  assert.ok(shallow, 'a head one degree off square still has a frame');
  assert.ok(readRegion(mask, shallow, 'midScalp', 1), 'midScalp is readable at this pose');
  assert.equal(readRegion(mask, shallow, 'crown', 1), null, 'and crown is not');
  assert.equal(
    readPartLine(mask, shallow).reason,
    'notVisible',
    'so the window is refused: half of it is a region the lane could not read',
  );

  // And where both regions are readable, the window opens — the bar is
  // the same one, not a stricter one invented here.
  const tipped = faceFrameOf(observedFace(-70, 0));
  assert.ok(tipped);
  for (const region of PART_WINDOW_REGIONS) {
    assert.ok(readRegion(mask, tipped, region, 1), `${region} is readable with the chin down`);
  }
  assert.notEqual(readPartLine(mask, tipped).reason, 'notVisible', 'so the search runs');
});

test('part line: the window is the two regions the measurement lane names, not a rectangle of its own', () => {
  // Written out here so a change to REGION_GEOMETRY that quietly moves
  // the crown fails this rather than silently moving the part search.
  assert.deepEqual([...PART_WINDOW_REGIONS], ['midScalp', 'crown']);
  const box = partWindowBox();
  for (const region of PART_WINDOW_REGIONS) {
    const own = regionBox(region);
    assert.ok(box.u0 <= own.u0 && box.u1 >= own.u1, `${region} sits inside the window across`);
    assert.ok(box.v0 <= own.v0 && box.v1 >= own.v1, `${region} sits inside the window down`);
  }
  // `partLine` — the mid-sagittal strip — is not one of them: a parting
  // filling it has no hair left either side to be enclosed by.
  assert.ok(!PART_WINDOW_REGIONS.includes('partLine'));

  // The rectified grid has square cells in FACE units, so a degree
  // across the window means the same as a degree down it.
  const frame = faceFrameOf(observedFace(-70, 0));
  assert.ok(frame);
  const rectified = rectifyPartWindow(paintedHead(frame, 0, 0.05), frame);
  assert.ok(rectified);
  const ratio = rectified.gridFrame.perPixelX / rectified.gridFrame.perPixelY;
  assert.ok(Math.abs(ratio - 1) < 0.05, `cells are square in face units: ratio ${ratio}`);
});
