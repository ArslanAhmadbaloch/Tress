/**
 * The onboarding kit, held to its contract without a phone.
 *
 * The kit is Reanimated and SVG through and through, which Node cannot
 * render, so what is checked here is read from the source: that every
 * piece the funnel composes is exported, that no piece carries a raw
 * colour or a font weight, that every piece which moves asks about
 * Reduce Motion, that nothing is switched off with an eslint comment,
 * and that no piece says anything of its own — every `<Text>` in the kit
 * renders an expression, never a literal, so the words stay with the
 * funnel's script where the honesty tests can read them.
 *
 * The pure helpers the kit and its neighbours export — the accent
 * split, the greeting, the question-to-expression table, and the
 * mascot's hair (its strands, the worklet that turns them into a path,
 * and the pout-and-blow cycle) — live in plain modules and are
 * exercised directly: the hair is measured, not grepped.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { greet, splitAccent } from '@/components/onboarding/kit/copy';
import {
  BLOW_MS,
  EARS,
  EAR_STROKE,
  HAIR_CENTRE,
  HAIR_SPHERE_R,
  HAIR_STROKE,
  LEFT_LOCK,
  POUT_MS,
  RELAX_MS,
  REST_MIN_MS,
  REST_RANGE_MS,
  STRANDS,
  blowCycle,
  cycleMs,
  hairPaths,
  num,
  strandTip,
  turned,
  turnedPoint,
} from '@/components/onboarding/kit/mascot-hair';
import { expressionFor } from '@/features/onboarding/expressions';
import { QUESTIONS } from '@/features/onboarding/questions';

const KIT = join('src', 'components', 'onboarding', 'kit');

const files = readdirSync(KIT)
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
  .map((f) => ({ name: f, text: readFileSync(join(KIT, f), 'utf8') }));

const index = files.find((f) => f.name === 'index.ts')?.text ?? '';
const mascot = files.find((f) => f.name === 'mascot.tsx')?.text ?? '';

/** The contract the flow lane composes against. */
const CONTRACT = [
  'Mascot',
  'SpeechBubble',
  'OptionPill',
  'OptionRow',
  'OptionCard',
  'CardGrid',
  'ContinueBar',
  'BackButton',
  'FunnelPage',
  'Welcome',
  'MascotIntro',
  'Interstitial',
  'NotificationsPage',
];

/** The faces the mascot lane promised the flow and report lanes. */
const EXPRESSIONS = ['smile', 'blow', 'clench', 'glance', 'calm', 'wink', 'think'] as const;

/** The quality gate's own definition of a raw colour. */
const RAW_COLOR = /(?<![\w-])#[0-9a-fA-F]{3,8}\b|rgba?\(/;

/** A `<Text …>` whose first child is a literal rather than `{…}`. */
const LITERAL_TEXT = /<Text\b[^>]*>\s*[^\s{<]/;

/* -------------------------------- exports -------------------------------- */

test('kit: every piece of the contract is exported from the index', () => {
  for (const name of CONTRACT) {
    assert.match(index, new RegExp(`\\b${name}\\b`), `${name} is not exported from kit/index.ts`);
  }
  for (const m of index.matchAll(/from '\.\/([^']+)'/g)) {
    assert.ok(
      files.some((f) => f.name === `${m[1]}.tsx` || f.name === `${m[1]}.ts`),
      `index re-exports ./${m[1]}, which does not exist`,
    );
  }
});

test('kit: each contract name is defined as an exported function somewhere in the kit', () => {
  for (const name of CONTRACT) {
    assert.ok(
      files.some((f) => new RegExp(`export function ${name}\\b`).test(f.text)),
      `${name} has no exported function`,
    );
  }
});

/* --------------------------------- tokens -------------------------------- */

test('kit: no raw colours, no font weights, no eslint-disable', () => {
  for (const f of files) {
    assert.ok(!RAW_COLOR.test(f.text), `${f.name} carries a raw colour`);
    assert.ok(!/fontWeight/.test(f.text), `${f.name} sets a fontWeight; the cut in the family name is the weight`);
    assert.ok(!/eslint-disable/.test(f.text), `${f.name} switches a lint rule off`);
  }
});

test('kit: every piece that moves asks about Reduce Motion', () => {
  const MOVES = /withRepeat|withTiming|withSpring|entering=|useAnimatedStyle|useAnimatedProps/;
  for (const f of files) {
    if (!MOVES.test(f.text)) continue;
    assert.ok(f.text.includes('useReducedMotion'), `${f.name} animates without checking useReducedMotion`);
  }
});

/* --------------------------------- mascot -------------------------------- */

/** Where the round eyes sit, as the mascot draws them. */
const EYE_Y = 42;
const EYE_DX = 15;
const EYE_R = 3.4;
/** The outer corner of a drawn eye, and the highest mouth in the face table. */
const EYE_OUTER = 27;
const MOUTH_TOP = 54;
/** The face is drawn at these sizes across the app: says, bubble, knob, intro. */
const DRAWN_AT_PX = [56, 60, 72, 150];

type Point = { x: number; y: number };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const centre: Point = { x: HAIR_CENTRE, y: HAIR_CENTRE };
const lerp2 = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const quad = (p0: Point, c: Point, p1: Point, t: number): Point => lerp2(lerp2(p0, c, t), lerp2(c, p1, t), t);
const cubic = (p0: Point, a: Point, b: Point, p1: Point, t: number): Point =>
  lerp2(quad(p0, a, b, t), quad(a, b, p1, t), t);

/** Is a point inside a closed outline? A ray cast to the right. */
function inside(p: Point, outline: readonly Point[]): boolean {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const a = outline[i];
    const b = outline[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Every point along strand `i` at rest, sampled finely. */
function sampled(i: number): Point[] {
  const s = STRANDS[i];
  const at = (k: number): Point => ({ x: s[k], y: s[k + 1] });
  const out: Point[] = [];
  for (let t = 0; t <= 1.0001; t += 0.02) {
    if (s[0] === 0) out.push(quad(at(1), at(3), at(5), t));
    else {
      out.push(cubic(at(1), at(3), at(5), at(7), t));
      out.push(quad(at(7), at(9), at(11), t));
    }
  }
  return out;
}

test('mascot: the orb is drawn in SVG, breathes, and still blinks now and then', () => {
  assert.match(mascot, /from 'react-native-svg'/, 'the orb is drawn with react-native-svg');
  assert.match(mascot, /from '\.\/mascot-hair'/, 'its hair comes from the pure module the tests measure');
  assert.match(mascot, /BREATH_SCALE = 1\.03/, 'the breath is a three percent swell');
  assert.match(mascot, /BLINK_GAP_MIN_MS = 4000/, 'a blink waits at least four seconds');
  assert.match(mascot, /BLINK_GAP_RANGE_MS = 2000/, 'and at most six');
  assert.match(mascot, /\.get\(\)/, 'shared values are read with .get()');
  assert.match(mascot, /\.set\(/, 'and written with .set()');
  assert.ok(!/\.value\b/.test(mascot), 'no .value access on a shared value');
  assert.equal((mascot.match(/<Svg\b/g) ?? []).length, 2, 'two SVG surfaces: the glow, and the orb with its face and hair');
});

test('mascot: it has every promised expression, and writing is only an alias of think', () => {
  const union = /export type MascotExpression = ([^;]+);/.exec(mascot)?.[1] ?? '';
  for (const expression of EXPRESSIONS) {
    assert.match(union, new RegExp(`'${expression}'`), `the orb has no ${expression} expression`);
    assert.match(mascot, new RegExp(`\\n\\s+${expression}: \\{`), `${expression} has no face in the table`);
  }
  assert.match(union, /'writing'/, 'writing is still accepted, so old scripts compile');
  assert.match(mascot, /expression === 'writing' \? 'think' : expression/, 'and it draws as think');
  assert.match(mascot, /Exclude<MascotExpression, 'writing'>/, 'the face table has no writing entry of its own');
  assert.match(mascot, /gaze\?: MascotGaze/, 'the gaze is a prop');
  assert.match(mascot, /idle\?: boolean/, 'and so is idling');
  assert.match(mascot, /accessible\?: boolean/, 'and a row that names the speaker can hide the picture');
  assert.match(mascot, /importantForAccessibility: 'no-hide-descendants'/, 'hidden means hidden from the tree');
  assert.ok(!/Pencil|SQUIGGLE|squiggle/.test(mascot), 'no pencil, no line being written');
});

test('mascot: every mouth sits on the centre line, and clench shows a small grid of teeth', () => {
  const table = /const FACE[^=]*= \{([\s\S]*?)\n\};/.exec(mascot)?.[1] ?? '';
  for (const m of table.matchAll(/mouth: '(M[^']+)'/g)) {
    const xs = [...m[1].matchAll(/(-?\d+(?:\.\d+)?)\s+-?\d+(?:\.\d+)?/g)].map((p) => Number(p[1]));
    const h = /H(\d+(?:\.\d+)?)/.exec(m[1]);
    if (h) xs.push(Number(h[1]));
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    assert.equal(left + right, 2 * HAIR_CENTRE, `${m[1]} is not centred on ${HAIR_CENTRE}`);
  }
  assert.match(mascot, /teeth: true/, 'clench has teeth');
  assert.match(mascot, /\[43, 50, 57\]\.map/, 'in a small grid');
});

test('hair: a parting down the middle, every strand on the head, none of them past the silhouette', () => {
  assert.ok(STRANDS.length >= 8, `at least eight strands, found ${STRANDS.length}`);
  // Two fringe pieces, each drawn with two strands — its back edge and its
  // front edge — so a piece reads as a lock with width, not as a wire.
  const locks = STRANDS.filter((s) => s[0] === 1);
  assert.equal(locks.length, 4, 'two fringe pieces, two strands each');
  const left = STRANDS.filter((s) => s[1] < HAIR_CENTRE);
  const right = STRANDS.filter((s) => s[1] > HAIR_CENTRE);
  assert.equal(left.length, right.length, 'as many strands on each side of the parting');
  for (const s of STRANDS) {
    const gap = Math.abs(s[1] - HAIR_CENTRE);
    assert.ok(gap >= HAIR_STROKE / 2 && gap < 4, `a root ${gap} from the centre line: the parting is a seam, not a bald patch`);
    assert.ok(s[2] < HAIR_CENTRE - HAIR_SPHERE_R + 20, 'every root is near the crown');
  }
  // The right side is the left side in a mirror.
  for (const l of left) {
    const twin = right.find((r) => r[0] === l[0] && Math.abs(r[2] - l[2]) < 0.01 && Math.abs(r[1] - (2 * HAIR_CENTRE - l[1])) < 0.01);
    assert.ok(twin, `the strand rooted at (${l[1]}, ${l[2]}) has no mirror`);
    for (let k = 3; k < l.length - 1; k += 2) {
      assert.ok(Math.abs(twin[k] - (2 * HAIR_CENTRE - l[k])) < 0.01, 'mirrored in x');
      assert.ok(Math.abs(twin[k + 1] - l[k + 1]) < 0.01, 'level in y');
    }
    assert.ok(Math.abs(twin[twin.length - 1] + l[l.length - 1]) < 1e-9, 'and bending the other way');
  }
  // At rest the whole of every strand, stroke included, lies inside the sphere.
  const limit = HAIR_SPHERE_R - HAIR_STROKE / 2;
  STRANDS.forEach((_, i) => {
    const far = Math.max(...sampled(i).map((p) => dist(p, centre)));
    assert.ok(far <= limit + 0.05, `strand ${i} reaches ${far.toFixed(2)} from the centre; the head ends at ${limit}`);
  });
  // The sweep is one mass, not a rake: at every point along them the six
  // strands of a side run closer together than the stroke they are drawn
  // with, so the ink closes into a cap of hair with no bare scalp between.
  const sweep = STRANDS.map((s, i) => (s[0] === 0 && s[1] < HAIR_CENTRE ? i : -1)).filter((i) => i >= 0);
  assert.equal(sweep.length, 6, 'six strands sweep back on a side');
  for (const t of [0.2, 0.4, 0.6, 0.8, 1]) {
    const along = sweep.map((i) => {
      const s = STRANDS[i];
      return quad({ x: s[1], y: s[2] }, { x: s[3], y: s[4] }, { x: s[5], y: s[6] }, t);
    });
    for (let i = 1; i < along.length; i += 1) {
      const gap = dist(along[i - 1], along[i]);
      assert.ok(gap < HAIR_STROKE, `at t=${t} two sweeps are ${gap.toFixed(2)} apart, wider than the ${HAIR_STROKE} stroke`);
    }
  }
  // Nothing crosses the face. The fringe stops above the brow; the side
  // sweeps go back and down to the ears, and pass outside the eyes on
  // the way, clear by a stroke's width.
  const brow = EYE_Y - EYE_R - 3;
  const clear = HAIR_CENTRE - EYE_OUTER + HAIR_STROKE;
  STRANDS.forEach((s, i) => {
    const points = sampled(i);
    const low = Math.max(...points.map((p) => p.y));
    assert.ok(low < MOUTH_TOP, `strand ${i} hangs to y=${low.toFixed(1)}, onto the mouth`);
    if (s[0] === 1) {
      assert.ok(low < brow, `the fringe piece at ${i} hangs to y=${low.toFixed(1)}, into the eyes`);
      return;
    }
    for (const p of points) {
      if (p.y <= brow) continue;
      const gap = Math.abs(p.x - HAIR_CENTRE);
      assert.ok(gap >= clear, `sweep ${i} passes (${p.x.toFixed(1)}, ${p.y.toFixed(1)}), over the eye`);
    }
  });
});

test('hair: an ear a side, its own shape, with the swept ends finishing under it', () => {
  // Each subpath is "M x y" followed by cubics, so every pair of numbers
  // after the first is a control point or an end point; sampling the
  // cubics gives the outline the eye actually sees.
  const outline = (arc: string): Point[] => {
    const n = [...arc.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    assert.equal(n.length % 2, 0, 'an ear is drawn in whole points');
    const at = (k: number): Point => ({ x: n[k * 2], y: n[k * 2 + 1] });
    const out: Point[] = [];
    for (let k = 0; k + 3 < n.length / 2; k += 3) {
      for (let t = 0; t <= 1.0001; t += 0.02) out.push(cubic(at(k), at(k + 1), at(k + 2), at(k + 3), t));
    }
    return out;
  };
  const arcs = EARS.split('M').filter(Boolean).map(outline);
  assert.equal(arcs.length, 4, 'a lobe and a fold a side');
  const [left, leftFold, right, rightFold] = arcs;
  assert.equal(EARS.split('Z').length - 1, 2, 'each lobe is a closed shape, so it can be filled');
  assert.ok(EAR_STROKE < HAIR_STROKE, 'and outlined more lightly than the hair, so it is not read as hair');

  const clear = HAIR_CENTRE - EYE_OUTER + HAIR_STROKE;
  for (const ear of arcs) {
    for (const p of ear) {
      assert.ok(Math.abs(p.x - HAIR_CENTRE) >= clear, `the ear reaches (${p.x.toFixed(1)}, ${p.y.toFixed(1)}), over the eye`);
      assert.ok(dist(p, centre) <= HAIR_SPHERE_R - HAIR_STROKE / 2, 'and stays on the head');
      assert.ok(p.y < MOUTH_TOP, 'and above the mouth');
    }
  }
  // One is the other in a mirror.
  left.forEach((p, i) => {
    assert.ok(Math.abs(p.x - (2 * HAIR_CENTRE - right[i].x)) < 0.05, 'the lobes are mirrored in x');
    assert.ok(Math.abs(p.y - right[i].y) < 0.05, 'and level in y');
  });
  leftFold.forEach((p, i) => {
    assert.ok(Math.abs(p.x - (2 * HAIR_CENTRE - rightFold[i].x)) < 0.05, 'and so are the folds');
  });
  // The fold is inside its lobe, so an ear reads as an ear and not as a ring.
  for (const p of leftFold) assert.ok(inside(p, left), `the fold leaves the lobe at (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);

  // The tuck: the lowest swept ends on a side finish inside the lobe, so the
  // ear — drawn after the hair, and filled — covers where the hair stops.
  const tucked = STRANDS.map((s, i) => (s[0] === 0 && s[1] < HAIR_CENTRE ? strandTip(i, 0, 0) : null))
    .filter((p): p is Point => p !== null)
    .filter((p) => inside(p, left));
  assert.ok(tucked.length >= 2, `only ${tucked.length} swept ends finish inside the ear; the sweep stops in mid-air`);

  // The ears are not strands: they are no part of the hair path, in any pose.
  for (const d of [hairPaths(0, 0), hairPaths(1, 0), hairPaths(0, 1)]) {
    assert.ok(!d.includes('Z'), 'the hair path has no closed shape in it');
    assert.ok(!d.includes(EARS.slice(0, 12)), 'and no ear');
  }
  // And they are drawn last, over the hair, filled with the orb's own tone.
  assert.match(mascot, /<Path d=\{EARS\} \{\.\.\.ear\} \/>/, 'the ears are drawn as their own path');
  assert.match(mascot, /const ear = \{ \.\.\.strand, fill: colors\.orbNeutralMid, strokeWidth: EAR_STROKE \}/, 'filled, not a line');
  assert.ok(mascot.indexOf('d={EARS}') > mascot.lastIndexOf('animatedProps={hairSheen}'), 'and after the hair, so the hair is behind them');
});

test('hair: the fringe pieces fall over the brow, turn outward, and end in a flick', () => {
  const locks = STRANDS.map((s, i) => (s[0] === 1 ? i : -1)).filter((i) => i >= 0);
  assert.equal(STRANDS[LEFT_LOCK][0], 1, 'LEFT_LOCK names a lock');
  assert.equal(STRANDS[LEFT_LOCK + 1][0], 1, 'and the row after it is the rest of that piece');
  for (const i of locks) {
    const s = STRANDS[i];
    const outward = Math.sign(s[1] - HAIR_CENTRE);
    const eyeX = HAIR_CENTRE + outward * EYE_DX;
    const tip = strandTip(i, 0, 0);
    const brow = { x: s[7], y: s[8] };
    const hook = { x: s[9], y: s[10] };
    assert.ok(Math.abs(tip.x - eyeX) <= 4, `the piece at ${i} ends at x=${tip.x}, off the eye at x=${eyeX}`);
    assert.ok(tip.y < EYE_Y - EYE_R && tip.y > EYE_Y - EYE_R - 12, `the tip hangs just above the eye (y=${tip.y})`);
    // Outward the whole way: no point turns back toward the parting.
    for (let k = 1; k + 2 < s.length - 1; k += 2) {
      assert.ok((s[k + 2] - s[k]) * outward >= 0, `the piece at ${i} turns back toward the parting`);
    }
    assert.ok((hook.x - brow.x) * outward > 0 && (tip.x - hook.x) * outward > 0, 'the end turns outward');
    // A lock falling, not a hook closing on itself: the very end lifts, but
    // by less than half a stroke, so the piece never encircles bare skin.
    const low = Math.max(...sampled(i).map((p) => p.y));
    assert.ok(tip.y < hook.y, 'the very end flicks up');
    assert.ok(
      low - tip.y < HAIR_STROKE / 2,
      `the piece at ${i} turns back up ${(low - tip.y).toFixed(2)} at the end: a hook, not a fall`,
    );
    // The piece is the innermost layer: it roots below every cap on its side.
    const caps = STRANDS.filter((c) => c[0] === 0 && Math.sign(c[1] - HAIR_CENTRE) === outward);
    assert.ok(caps.every((c) => c[2] < s[2]), 'it roots below every cap strand on its side');
  }
  // The two strands of a piece stay within a stroke of each other, root and
  // tip, so the piece reads as one lock with width rather than two wires.
  for (const side of [-1, 1]) {
    const pair = locks.filter((i) => Math.sign(STRANDS[i][1] - HAIR_CENTRE) === side);
    assert.equal(pair.length, 2, 'two strands to a piece');
    const [a, b] = pair;
    assert.ok(Math.abs(STRANDS[a][2] - STRANDS[b][2]) <= HAIR_STROKE, 'they root together');
    assert.ok(dist(strandTip(a, 0, 0), strandTip(b, 0, 0)) <= HAIR_STROKE, 'and end together');
  }
});

test('hair: a blow moves every tip far enough to be seen at every size the orb is drawn', () => {
  const smallest = Math.min(...DRAWN_AT_PX);
  STRANDS.forEach((s, i) => {
    const rest = strandTip(i, 0, 0);
    const blown = strandTip(i, 1, 0);
    const travel = dist(rest, blown);
    const px = (travel * smallest) / 100;
    assert.ok(px >= 2.5, `strand ${i} moves ${travel.toFixed(2)} units, ${px.toFixed(2)}px at ${smallest}px`);
    // Up and out: a breath from below lifts the hair off the head.
    assert.ok(blown.y < rest.y, `strand ${i} lifts`);
    assert.ok((blown.x - rest.x) * Math.sign(s[1] - HAIR_CENTRE) >= 0, `strand ${i} moves away from the parting`);
    // The spring back dips below rest, gently.
    const back = strandTip(i, -0.3, 0);
    assert.ok(back.y > rest.y && dist(rest, back) < travel, `strand ${i} settles with a small dip`);
  });
});

test('hair: in thought the whole left fringe piece lifts away from the eye, not onto it', () => {
  const eye = { x: HAIR_CENTRE - EYE_DX, y: EYE_Y };
  const piece = [LEFT_LOCK, LEFT_LOCK + 1];
  for (const i of piece) {
    const rest = strandTip(i, 0, 0);
    const lifted = strandTip(i, 0, 1);
    assert.ok(dist(lifted, eye) > dist(rest, eye) + 1, `strand ${i} ends no further from the eye than it started`);
    assert.ok(lifted.y < rest.y, 'and higher');
    assert.ok(dist(lifted, centre) <= HAIR_SPHERE_R, 'still on the head');
  }
  // Only that piece moves, and it moves whole: a lock does not split in two.
  STRANDS.forEach((_, i) => {
    if (piece.includes(i)) return;
    assert.deepEqual(strandTip(i, 0, 1), strandTip(i, 0, 0), `strand ${i} holds still`);
  });
});

test('hair: the worklet turns points about the root and writes one decimal', () => {
  assert.equal(num(12.34), '12.3');
  assert.equal(num(12.35000001), '12.4');
  assert.equal(num(7), '7');
  assert.equal(turned(10, 20, 10, 20, 1.2), '10 20', 'the root does not move');
  assert.equal(turned(20, 20, 10, 20, Math.PI / 2), '10 30', 'a quarter turn, clockwise on screen');
  assert.equal(turned(20, 20, 10, 20, 0), '20 20', 'no turn at rest');
  const p = turnedPoint(20, 20, 10, 20, Math.PI / 2);
  assert.ok(Math.abs(p.x - 10) < 1e-9 && Math.abs(p.y - 30) < 1e-9, 'the numeric twin agrees');
  const d = hairPaths(0, 0);
  assert.equal((d.match(/M/g) ?? []).length, STRANDS.length, 'one subpath per strand, and nothing else');
  assert.equal((d.match(/C/g) ?? []).length, 4, 'the four fringe strands are cubics');
  assert.ok(!/NaN|undefined|\d\.\d\d/.test(d), 'clean numbers, one decimal at most');
  assert.notEqual(hairPaths(1, 0), d, 'the path changes with the sway');
  assert.notEqual(hairPaths(0, 1), d, 'and with the lift');
  // The worklet directive is on every function the UI thread reaches, and none has a default parameter.
  const hairSource = readFileSync(join(KIT, 'mascot-hair.ts'), 'utf8');
  for (const name of ['num', 'turned', 'tipAngle', 'hairPaths']) {
    const fn = new RegExp(`function ${name}\\(([^)]*)\\)[^{]*\\{\\s*'worklet';`).exec(hairSource);
    assert.ok(fn, `${name} carries the 'worklet' directive`);
    assert.ok(!fn[1].includes('='), `${name} has no default parameter`);
  }
  assert.ok(!/from 'react|from '@\//.test(hairSource), 'the hair module imports nothing: pure numbers');
});

test('mascot: the hair path is built once per frame and read by the ink and the sheen', () => {
  assert.equal((mascot.match(/hairPaths\(sway\.get\(\), lift\.get\(\)\)/g) ?? []).length, 1, 'one build per frame');
  assert.match(mascot, /useDerivedValue\(\(\) => hairPaths\(sway\.get\(\), lift\.get\(\)\)\)/, 'held in a derived value');
  assert.equal((mascot.match(/d: hairD\.get\(\)/g) ?? []).length, 2, 'read by two thin animated props');
  assert.match(mascot, /reduceMotion \? hairPaths\(0, thinking \? 1 : 0\) : null/, 'one still path under Reduce Motion');
});

test('mascot: the idle is a pout and a blow, on one cycle so the mouth and the hair never drift', () => {
  assert.equal(POUT_MS, 350, 'the pout gathers over 350 ms');
  assert.equal(BLOW_MS, 700, 'the blow lasts 700 ms');
  assert.equal(REST_MIN_MS, 2400, 'then it rests at least 2.4 s');
  assert.equal(REST_MIN_MS + REST_RANGE_MS, 4000, 'and at most 4 s');
  for (const rest of [REST_MIN_MS, 3000, REST_MIN_MS + REST_RANGE_MS]) {
    const { pout, sway } = blowCycle(rest);
    assert.equal(cycleMs(pout), cycleMs(sway), 'the two values share one cycle length');
    assert.equal(cycleMs(pout), rest + POUT_MS + BLOW_MS + RELAX_MS);
    // The lips finish pursing at the instant the hair begins to move.
    let pursedAt = 0;
    for (const f of pout) {
      pursedAt += f.ms;
      if (f.to === 1) break;
    }
    let hairMovesAt = 0;
    for (const f of sway) {
      if (f.to !== 0) break;
      hairMovesAt += f.ms;
    }
    assert.equal(pursedAt, hairMovesAt);
    assert.equal(pout[pout.length - 1].to, 0, 'the mouth comes back to rest');
    assert.equal(sway[sway.length - 1].to, 0, 'and so does the hair');
    assert.ok(sway.some((f) => f.ease === 'springBack'), 'with a spring back');
    assert.ok(sway.some((f) => f.to === 1), 'after a full bend');
  }
  assert.match(mascot, /withRepeat\(play\(cycle\.pout\), -1, false\)/, 'the mouth plays the cycle');
  assert.match(mascot, /withRepeat\(play\(cycle\.sway\), -1, false\)/, 'and the hair plays the same one');
  assert.match(mascot, /springBack: Easing\.out\(Easing\.back\(/, 'the spring back is an overshoot');
});

test('mascot: expressions cross-fade over 180 ms and the old face is let go afterwards', () => {
  assert.match(mascot, /FADE_MS = 180/, 'the cross-fade is 180 ms');
  assert.match(mascot, /opacity: 1 - fade\.get\(\)/, 'the old face fades out');
  assert.match(mascot, /opacity: fade\.get\(\)/, 'as the new one fades in');
  assert.match(mascot, /if \(shown\.current !== shape\) \{\s*setShown/, 'the previous face is derived during render');
  assert.match(mascot, /previous: reduceMotion \? null : shown\.current/, 'and never kept under Reduce Motion');
  assert.match(mascot, /setTimeout\(\(\) => \{\s*setShown\(\(s\) => \(s\.previous === null \? s : \{ current: s\.current, previous: null \}\)\);\s*\}, FADE_MS \+ 40\)/, 'the old face is released once the fade is over');
  assert.match(mascot, /return \(\) => clearTimeout\(release\)/, 'and the release is cancelled on unmount');
});

test('mascot: a glance moves the pupils, a blink crosses to closed lids, and Reduce Motion stills all of it', () => {
  assert.match(mascot, /LOOK_QUESTION = \{ x: 3\.4, y: -2\.6 \}/, 'the bubble is up and to the right');
  assert.match(mascot, /LOOK_THINK = \{ x: -3\.4, y: -3\.2 \}/, 'thinking looks up and to the left');
  assert.match(mascot, /const LIDS = \{/, 'closed lids are drawn for a blink');
  assert.match(mascot, /opacity: 1 - lids\.get\(\)/, 'and cross-faded in as the eyes fade out');
  assert.match(mascot, /if \(reduceMotion\) \{\s*pout\.set\(blowing \? 1 : 0\);\s*sway\.set\(0\)/, 'no blow cycle');
  assert.match(mascot, /if \(reduceMotion\) \{\s*lift\.set\(thinking \? 1 : 0\);\s*look\.set\(0\)/, 'no glance');
  assert.match(mascot, /if \(reduceMotion \|\| !idle \|\| !eyesOpen\) \{\s*lids\.set\(1\)/, 'no blink');
});

test('mascot: the hair is sage ink from tokens, and never the face colour in either theme', () => {
  assert.match(mascot, /stroke: dark \? colors\.accent : colors\.leafShadow/, 'the strand ink is the leaf in light and the sage accent in dark');
  assert.match(mascot, /stroke: dark \? colors\.text : colors\.accent,\s*strokeOpacity: dark \? 0\.5 : 1/, 'the sheen is one step lighter');
  assert.ok(!/stroke: colors\.text,\s*strokeWidth: HAIR_STROKE/.test(mascot), 'the hair is never drawn in the face ink');
});

/* ------------------------------ expressions ------------------------------ */

test('expressions: every funnel question has a face and a gaze, and none of them is writing', () => {
  const seen = new Set<string>();
  for (const q of QUESTIONS) {
    const { expression, gaze } = expressionFor(q.id);
    assert.ok((EXPRESSIONS as readonly string[]).includes(expression), `${q.id}: ${expression} is not a face`);
    assert.ok(gaze === 'user' || gaze === 'question', `${q.id}: ${gaze} is not a gaze`);
    seen.add(expression);
  }
  assert.ok(seen.size >= 6, `the faces vary across the funnel; only ${[...seen].join(', ')}`);
});

test('expressions: the table reads as the brief did, and an unknown id gets the plain smile', () => {
  assert.deepEqual(expressionFor('age'), { expression: 'smile', gaze: 'user' });
  assert.deepEqual(expressionFor('hairType'), { expression: 'glance', gaze: 'question' });
  assert.deepEqual(expressionFor('scalpSensitivity'), { expression: 'clench', gaze: 'user' });
  assert.deepEqual(expressionFor('budget'), { expression: 'wink', gaze: 'user' });
  assert.deepEqual(expressionFor('heatStyling'), { expression: 'blow', gaze: 'user' });
  assert.deepEqual(expressionFor('welcome'), { expression: 'smile', gaze: 'user' });
  assert.deepEqual(expressionFor('toString'), { expression: 'smile', gaze: 'user' }, 'a prototype name is not a question');
});

/* ---------------------------------- copy --------------------------------- */

test('kit: no piece says anything of its own', () => {
  for (const f of files) {
    const m = LITERAL_TEXT.exec(f.text);
    assert.equal(m, null, `${f.name} renders a literal inside <Text>: ${m?.[0].trim()}`);
  }
});

test('kit: the words the kit is not allowed to own live in props, not here', () => {
  // Either quote, and a template literal too: the kit is written with
  // single quotes, so a guard that only read double ones read nothing.
  const OWNED_BY_THE_SCRIPT = /['"`](Get Started|Continue|Next|Not now|Restore purchases|Let.s go|Allow)['"`]/;
  for (const f of files) {
    assert.ok(!OWNED_BY_THE_SCRIPT.test(f.text), `${f.name} hard-codes funnel copy`);
  }
  assert.match("x = 'Next'", OWNED_BY_THE_SCRIPT, 'the guard reads a single-quoted string');
  assert.match('x = "Not now"', OWNED_BY_THE_SCRIPT, 'and a double-quoted one');
});

/* -------------------------------- drawings ------------------------------- */

test('kit: the phone is cut off below the card, and its ink survives the dark theme', () => {
  const page = files.find((f) => f.name === 'notifications-page.tsx')?.text ?? '';
  assert.match(page, /PHONE_VISIBLE = 0\.86/, 'most of the phone shows');
  assert.match(
    page,
    /height: visible, overflow: 'hidden'/,
    'the box the phone sits in clips it, so the cut-off part does not paint over the headline',
  );
  assert.match(page, /useInk\(\)/, 'the frame takes its ink from the scheme-safe pair');
  assert.ok(
    !/backgroundColor: colors\.text\b/.test(page),
    'the frame is never `text`, which is pale in the dark theme',
  );
});

test('kit: ink is dark in both themes and built from tokens', () => {
  const ink = files.find((f) => f.name === 'ink.ts')?.text ?? '';
  assert.match(ink, /scheme === 'dark'/, 'the pair is picked by scheme');
  assert.match(ink, /ink: colors\.background, onInk: colors\.text/, 'dark: the ground is the ink');
  assert.match(ink, /ink: colors\.text, onInk: colors\.background/, 'light: the text is the ink');
});

test('kit: a row chooses the colour its icon is drawn in, so a dark disc never hides one', () => {
  const options = files.find((f) => f.name === 'options.tsx')?.text ?? '';
  assert.match(
    options,
    /OptionIcon = ReactNode \| \(\(color: string\) => ReactNode\)/,
    'an icon may be a function of colour',
  );
  assert.match(options, /tint === 'dark' \? onInk/, 'a dark disc draws its icon in the colour that reads on ink');
  assert.match(options, /check\?: boolean/, 'a row can carry a circle check for multiple choice');
  assert.match(options, /accessibilityRole=\{check \? 'checkbox' : 'radio'\}/, 'and says so to the screen reader');
  assert.match(options, /PILL_HEIGHT = 70/, 'a pill is as tall as the reference');
});

test('report: the "Tress says" face is the same Mascot the funnel shows, heard once', () => {
  const says = readFileSync(join('src', 'components', 'hair-scan', 'report-sections', 'says.tsx'), 'utf8');
  assert.match(says, /import \{ Mascot \} from '@\/components\/onboarding\/kit'/, 'it imports the kit orb');
  assert.match(says, /<Mascot size=\{ORB\} expression="smile" glow=\{false\} idle accessible=\{false\}/, 'smiling, idling, hidden from the reader');
  assert.match(says, /accessibilityLabel=\{`\$\{says\.speaker\}: \$\{says\.body\}`\}/, 'the bubble names the speaker once');
  assert.ok(!/TressOrb|RadialGradient/.test(says), 'the old separate drawing is gone');
  assert.ok(!RAW_COLOR.test(says), 'no raw colour');
});

test('plan: the slider knob blows while it is dragged, and the gesture is not rebuilt under the finger', () => {
  const slider = readFileSync(join('src', 'components', 'plan', 'commit-slider.tsx'), 'utf8');
  assert.match(slider, /expression=\{dragging \? 'blow' : 'smile'\}/, 'the knob blows under the finger');
  assert.match(slider, /\.onBegin\(\(\) => \{\s*runOnJS\(setDragging\)\(true\)/, 'from the first touch');
  assert.match(slider, /\.onFinalize\(\(\) => \{\s*runOnJS\(setDragging\)\(false\)/, 'until the gesture ends however it ends');
  assert.match(slider, /const pan = useMemo\(\s*\(\) =>\s*Gesture\.Pan\(\)/, 'the gesture is memoised');
  const deps = /Gesture\.Pan\(\)[\s\S]*?\}\),\s*\[([^\]]*)\],\s*\);/.exec(slider)?.[1] ?? '';
  assert.ok(!/\bdragging\b/.test(deps), 'and does not depend on the dragging state, so the first touch never rebuilds it');
  for (const dep of ['committed', 'trackWidth', 'max', 'reduceMotion', 'finish']) {
    assert.match(deps, new RegExp(`\\b${dep}\\b`), `${dep} is a dependency`);
  }
});

/* -------------------------------- helpers -------------------------------- */

test('kit: the accent split colours one whole word and leaves the rest alone', () => {
  assert.deepEqual(splitAccent('How old are you?', 'old'), { before: 'How ', word: 'old', after: ' are you?' });
  assert.deepEqual(splitAccent('What is your hair type?', 'hair'), {
    before: 'What is your ',
    word: 'hair',
    after: ' type?',
  });
  assert.equal(splitAccent('Your haircare, kept', 'hair'), null, 'a keyword inside a longer word is left alone');
  assert.equal(splitAccent('How old are you?', undefined), null);
  assert.equal(splitAccent('How old are you?', 'young'), null, 'a keyword that is not there does not throw');
  assert.equal(
    splitAccent('Hair, and hair again', 'hair')?.before,
    'Hair, and ',
    'case-sensitive, first whole-word match',
  );
  assert.deepEqual(splitAccent('Sulfate-free?', 'Sulfate-free'), { before: '', word: 'Sulfate-free', after: '?' });
});

test('kit: the greeting fills the name in and reads cleanly without one', () => {
  assert.equal(greet('Great start, {name}!', 'Sam'), 'Great start, Sam!');
  assert.equal(greet('Great start, {name}!', undefined), 'Great start!');
  assert.equal(greet('Great start, {name}!', '  '), 'Great start!');
  assert.equal(greet('{name}, welcome back', 'Sam'), 'Sam, welcome back');
  assert.equal(greet('No placeholder here', 'Sam'), 'No placeholder here');
});
