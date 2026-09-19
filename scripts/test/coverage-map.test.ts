/**
 * The coverage map and the grade dial: the two pictures that carry the
 * assessment.
 *
 * ── Why the arithmetic is extracted rather than imported ──────────────
 * Node strips TypeScript but does not compile JSX, so a `.tsx` cannot be
 * imported here at all. The alternative the repo already uses for its
 * component lanes is to read the file and assert on its text, which
 * catches a deleted line and nothing about what the file computes — and
 * what these two files compute is exactly what a wrong report is made
 * of: a tint that says 60 when the reading was 20, a dial that draws a
 * zero where there was no reading.
 *
 * So the pure block each file marks off — geometry and scale, no
 * imports, no JSX — is lifted out verbatim, written to a `.ts` beside
 * the test run and imported. What runs here is the shipped source, not a
 * copy of it: change the tint scale in the component and these tests
 * change with it. The extraction itself is asserted first, so a block
 * that grows an import or a tag fails loudly rather than silently
 * testing nothing.
 *
 * ── What is being held ────────────────────────────────────────────────
 * 1. No reading is never a number. Null in, null out, everywhere.
 * 2. An unread region is never drawn as the worst reading.
 * 3. The tint is a function of the score and nothing else.
 * 4. The regions tile the head without overlapping, so no square of head
 *    is tinted by two readings at once.
 * 5. Both files are presentation: no words of their own, no thresholds,
 *    no opinions, tokens only, and motion that stands down.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

/* ------------------------------ the files ------------------------------- */

const DIR = 'src/components/hair-scan/report-sections';
const MAP_FILE = `${DIR}/coverage-map.tsx`;
const DIAL_FILE = `${DIR}/grade-dial.tsx`;

const read = (file: string) => readFileSync(file, 'utf8');

/** A file with its prose taken out: a rule about what a file DOES is not a rule about what it says it does. */
const codeOf = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const START = '/* ---------- pure geometry: extracted by scripts/test/coverage-map.test.ts ---------- */';
const END = '/* ---------- end pure geometry ---------- */';

/** The pure block of a component file, lifted verbatim. */
function pureBlock(file: string): string {
  const source = read(file);
  const from = source.indexOf(START);
  const to = source.indexOf(END);
  assert.ok(from !== -1, `${file} no longer marks the start of its pure block`);
  assert.ok(to > from, `${file} no longer marks the end of its pure block`);
  return source.slice(from + START.length, to);
}

const tempDir = mkdtempSync(join(tmpdir(), 'tress-coverage-map-'));

/** The block, written out and imported. Types referring to the component's imports simply erase. */
async function loadPure(file: string, name: string): Promise<Record<string, unknown>> {
  const block = pureBlock(file);
  assert.ok(!/^\s*import\s/m.test(block), `${file}'s pure block imports something; it must stand alone`);
  const bare = block.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\/>|<\/[A-Za-z]/.test(bare), `${file}'s pure block draws something`);
  const path = join(tempDir, `${name}.ts`);
  writeFileSync(path, block);
  return (await import(pathToFileURL(path).href)) as Record<string, unknown>;
}

type MapRect = { x: number; y: number; width: number; height: number };
type MapPure = {
  MAP_BOX: { width: number; height: number };
  HEAD_PATH: string;
  NOSE_PATH: string;
  EAR_MARKS: readonly { cx: number; cy: number; rx: number; ry: number }[];
  MAP_REGION_RECTS: Record<string, MapRect>;
  MAP_DRAW_ORDER: readonly string[];
  MAP_OVERLAID: readonly string[];
  TINT_MIN: number;
  TINT_MAX: number;
  SCORE_MAX: number;
  regionTint: (score: number | null | undefined) => number | null;
  confidenceShare: (confidence: number | null | undefined) => number | null;
  mapHeightFor: (width: number) => number;
};
type DialPure = {
  DIAL_START_DEG: number;
  DIAL_SWEEP_DEG: number;
  DIAL_MAX: number;
  dialPoint: (cx: number, cy: number, r: number, deg: number) => { x: number; y: number };
  dialArcPath: (cx: number, cy: number, r: number, startDeg: number, sweepDeg: number) => string;
  dialArcLength: (r: number, sweepDeg: number) => number;
  dialFraction: (value: number | null | undefined, max: number) => number | null;
};

/*
  Loaded in a hook rather than at the top of the file: a top-level await
  makes the module unparseable as CommonJS, and Node says so on stderr
  every time the suite runs. Every assertion below runs inside an `it`,
  which is after this.
*/
let map: MapPure;
let dial: DialPure;

before(async () => {
  map = (await loadPure(MAP_FILE, 'coverage-map-pure')) as unknown as MapPure;
  dial = (await loadPure(DIAL_FILE, 'grade-dial-pure')) as unknown as DialPure;
});

/** The six places the engine reads, in the order `measure/regions.ts` names them. */
const REGIONS = ['hairline', 'leftTemple', 'rightTemple', 'midScalp', 'crown', 'partLine'] as const;

/* ------------------------- the tint is the reading ----------------------- */

describe('coverage map — the tint carries the score and nothing else', () => {
  it('draws every region the engine reads, and nothing it does not', () => {
    assert.deepEqual(Object.keys(map.MAP_REGION_RECTS).sort(), [...REGIONS].sort());
    assert.deepEqual([...map.MAP_DRAW_ORDER].sort(), [...REGIONS].sort());
  });

  it('rises with the score, never falls, and stays inside its own scale', () => {
    let last = -1;
    for (let score = 0; score <= 100; score += 1) {
      const tint = map.regionTint(score);
      assert.ok(tint !== null, `${score} is a reading and must have a tint`);
      assert.ok(tint >= map.TINT_MIN - 1e-9, `${score} tints below the floor`);
      assert.ok(tint <= map.TINT_MAX + 1e-9, `${score} tints above the ceiling`);
      assert.ok(tint >= last, `${score} tints lighter than ${score - 1}`);
      last = tint;
    }
    assert.ok(Math.abs(map.regionTint(0)! - map.TINT_MIN) < 1e-9, 'a read zero sits at the floor');
    assert.ok(Math.abs(map.regionTint(100)! - map.TINT_MAX) < 1e-9, 'a read hundred sits at the ceiling');
  });

  it('is a straight share of the score: the same reading always gets the same tint', () => {
    // Two calls, and a midpoint that is the mean of its ends. A tint that
    // knew about anything but the score could not satisfy either.
    assert.equal(map.regionTint(37), map.regionTint(37));
    const mid = map.regionTint(50)!;
    assert.ok(Math.abs(mid - (map.regionTint(0)! + map.regionTint(100)!) / 2) < 1e-9);
  });

  it('clamps a score outside the scale rather than drawing outside it', () => {
    assert.equal(map.regionTint(-40), map.TINT_MIN);
    assert.equal(map.regionTint(140), map.TINT_MAX);
  });

  it('has no tint at all for a region with no reading', () => {
    for (const missing of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(map.regionTint(missing as number | null), null, `${String(missing)} became a tint`);
    }
  });

  it('never draws an unread region as the worst reading', () => {
    // The floor is a measurement of nothing-much; "unread" has to be
    // visibly neither. The component's contract is that null means no
    // fill and a dashed outline, so the two can never be confused.
    assert.equal(map.regionTint(null), null);
    assert.ok(map.TINT_MIN > 0, 'a read zero is still drawn, or it reads as unread');
    const code = codeOf(MAP_FILE);
    assert.ok(
      /tint === null[\s\S]{0,700}strokeDasharray/.test(code),
      'an unread region must be drawn as a dashed outline',
    );
    assert.ok(
      /tint === null[\s\S]{0,700}fill=\{overlaid \? colors\.surface : 'none'\}/.test(code),
      'an unread region must not be filled with a tint of any value',
    );
  });

  it('has no zero standing in for a missing reading, anywhere in either file', () => {
    // The guard the lane rests its "null in, null out" claim on, and it
    // has to be the whole file or it is decoration. `?? 0` is how a
    // missing reading quietly becomes a drawn nought — a 0%-wide bar, a
    // counter starting from a figure nobody measured — so neither file
    // may contain one at all. Both are written so it is never needed:
    // the arc, the counting figure and the confidence bar are each
    // rendered only where there is a number, and skipped where there is
    // not.
    for (const file of [MAP_FILE, DIAL_FILE]) {
      const code = codeOf(file);
      assert.ok(code.includes('regionTint') || code.includes('dialFraction'), `${file} is not the file we think`);
      const offenders = [...code.matchAll(/.*\?\?\s*0\b.*/g)].map((m) => m[0].trim());
      assert.deepEqual(offenders, [], `${file} substitutes a zero for a missing reading`);
    }
  });

  it('gives an unread region no confidence bar either', () => {
    // A region the scan never read has no reading to be confident about,
    // so it gets a dashed swatch and nothing beside it — not an empty
    // bar, which is a drawn nought by another name.
    const code = codeOf(MAP_FILE);
    assert.ok(
      /const share = item\.score === null \? null : confidenceShare\(item\.confidence\)/.test(code),
      'a region with no score still works out a confidence share',
    );
    assert.ok(
      /share === null \? null : \(\s*<View/.test(code),
      'the confidence track is drawn even when there is no share to fill it',
    );
  });
});

/* ------------------------ the head holds together ------------------------ */

describe('coverage map — the head', () => {
  const inBox = (x: number, y: number) =>
    x >= 0 && y >= 0 && x <= map.MAP_BOX.width && y <= map.MAP_BOX.height;

  it('keeps every region inside the box it is drawn in', () => {
    for (const region of REGIONS) {
      const r = map.MAP_REGION_RECTS[region];
      assert.ok(r.width > 0 && r.height > 0, `${region} has no area`);
      assert.ok(inBox(r.x, r.y) && inBox(r.x + r.width, r.y + r.height), `${region} leaves the box`);
    }
  });

  it('tiles the head without overlapping, so no square is tinted twice', () => {
    const laid = REGIONS.filter((r) => !map.MAP_OVERLAID.includes(r));
    for (let i = 0; i < laid.length; i += 1) {
      for (let j = i + 1; j < laid.length; j += 1) {
        const a = map.MAP_REGION_RECTS[laid[i]];
        const b = map.MAP_REGION_RECTS[laid[j]];
        const overlap =
          a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        assert.ok(!overlap, `${laid[i]} and ${laid[j]} overlap: one square of head, two readings`);
      }
    }
  });

  it('lays the one crossing strip last, over an opaque base of its own', () => {
    assert.deepEqual([...map.MAP_OVERLAID], ['partLine']);
    assert.equal(map.MAP_DRAW_ORDER[map.MAP_DRAW_ORDER.length - 1], 'partLine');
    const code = codeOf(MAP_FILE);
    assert.ok(
      /overlaid \?[\s\S]{0,200}fill=\{base\}/.test(code),
      'the crossing strip needs its own base, or its tint is two readings mixed',
    );
  });

  it('is a head seen from above and in front: crown at the top, hairline at the brow', () => {
    const r = map.MAP_REGION_RECTS;
    const mid = (x: MapRect) => x.y + x.height / 2;
    assert.ok(mid(r.crown) < mid(r.midScalp), 'the crown sits behind the mid-scalp');
    assert.ok(mid(r.midScalp) < mid(r.hairline), 'the mid-scalp sits behind the hairline');
    assert.ok(r.leftTemple.x < r.midScalp.x, 'the left temple is to the left of the centre');
    assert.ok(r.rightTemple.x > r.midScalp.x, 'the right temple is to the right of the centre');
    assert.ok(
      Math.abs(
        map.MAP_BOX.width - (r.leftTemple.x + r.rightTemple.x + r.rightTemple.width),
      ) < 1,
      'the two temples are not symmetric about the head',
    );
    // The two marks that fix the view, and the brow below the silhouette.
    assert.equal(map.EAR_MARKS.length, 2);
    assert.ok(map.NOSE_PATH.length > 0, 'nothing says which way the head is facing');
  });

  it('keeps its proportions at any drawn width', () => {
    const ratio = map.MAP_BOX.height / map.MAP_BOX.width;
    for (const width of [180, 260, 320]) {
      assert.ok(Math.abs(map.mapHeightFor(width) / width - ratio) < 1e-9, `${width} distorts the head`);
    }
  });

  it('reads confidence as a share, and as nothing at all when it is missing', () => {
    assert.equal(map.confidenceShare(0.4), 0.4);
    assert.equal(map.confidenceShare(-1), 0);
    assert.equal(map.confidenceShare(9), 1);
    assert.equal(map.confidenceShare(null), null);
    assert.equal(map.confidenceShare(Number.NaN), null);
  });
});

/* ----------------------------- the dial ---------------------------------- */

describe('grade dial — a score, or no score', () => {
  it('turns a reading into a share of the arc', () => {
    assert.equal(dial.dialFraction(0, dial.DIAL_MAX), 0);
    assert.equal(dial.dialFraction(50, dial.DIAL_MAX), 0.5);
    assert.equal(dial.dialFraction(100, dial.DIAL_MAX), 1);
    assert.equal(dial.dialFraction(180, dial.DIAL_MAX), 1, 'a share outside the arc is clamped, not drawn past it');
    assert.equal(dial.dialFraction(-4, dial.DIAL_MAX), 0);
  });

  it('has no share at all when there is no reading, and never invents a zero', () => {
    for (const missing of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(dial.dialFraction(missing as number | null, dial.DIAL_MAX), null);
    }
    assert.equal(dial.dialFraction(50, 0), null, 'a scale of nothing is not a scale');
    const code = codeOf(DIAL_FILE);
    assert.ok(
      /share === null \? null : \(\s*<DialArc/.test(code),
      'with no reading there must be no arc drawn at all',
    );
    assert.ok(
      /rounded === null \? \(\s*<Text[\s\S]{0,200}\{emptyLabel\}/.test(code),
      'with no reading the middle carries the caller’s words, not a figure',
    );
    assert.ok(
      /accessibilityValue=\{rounded === null \? undefined/.test(code),
      'with no reading there is no value to report to a screen reader either',
    );
  });

  it('draws the confidence as its own arc, which cannot move the score’s', () => {
    assert.equal(dial.dialFraction(0.25, 1), 0.25);
    assert.equal(dial.dialFraction(null, 1), null);
    const code = codeOf(DIAL_FILE);
    // Both arcs are the same component, handed a share each. The one
    // thing that must hold is that the score's arc is handed the score's
    // share and nothing else reaches it — so the component's own worklet
    // must not know the word, and the score's use of it must pass the
    // plain share.
    const arc = /function DialArc\(\{([\s\S]*?)\n\}\n/.exec(code);
    assert.ok(arc, 'could not read the arc component');
    assert.ok(
      !/confidence/i.test(arc[1]),
      'confidence reaches inside the arc component: one channel, two numbers',
    );
    assert.ok(
      /<DialArc\s+d=\{track\}\s+share=\{share\}/.test(code),
      'the score’s arc is drawn to something other than the score’s own share',
    );
    assert.ok(
      /<DialArc\s+d=\{inner\}\s+share=\{confidenceShare\}/.test(code),
      'the confidence arc is drawn to something other than the confidence',
    );
  });

  it('is an arc, not a gauge: one sweep, open at the bottom, no needle and no zones', () => {
    assert.ok(dial.DIAL_SWEEP_DEG > 180 && dial.DIAL_SWEEP_DEG < 360, 'the arc is open');
    // The gap left at the bottom is centred on six o'clock (90°, y down).
    const end = dial.DIAL_START_DEG + dial.DIAL_SWEEP_DEG - 360;
    assert.ok(Math.abs((dial.DIAL_START_DEG + end) / 2 - 90) < 1e-9, 'the gap is off-centre');
    const code = codeOf(DIAL_FILE);
    for (const forbidden of ['needle', 'danger', 'warning', 'zone']) {
      assert.ok(!code.toLowerCase().includes(forbidden), `the dial must not draw a ${forbidden}`);
    }
  });

  it('draws an arc a renderer can actually follow', () => {
    const path = dial.dialArcPath(88, 88, 80, dial.DIAL_START_DEG, dial.DIAL_SWEEP_DEG);
    assert.match(path, /^M -?[\d.]+ -?[\d.]+ A 80\.00 80\.00 0 1 1 -?[\d.]+ -?[\d.]+$/);
    // A sweep under a half-turn takes the small arc, or it draws the long way round.
    assert.match(dial.dialArcPath(0, 0, 10, 0, 90), / 0 0 1 /);
    // The start and end of a 260° sweep are the same height, either side of centre.
    const from = dial.dialPoint(88, 88, 80, dial.DIAL_START_DEG);
    const to = dial.dialPoint(88, 88, 80, dial.DIAL_START_DEG + dial.DIAL_SWEEP_DEG);
    assert.ok(Math.abs(from.y - to.y) < 1e-9, 'the arc does not start and end level');
    assert.ok(from.x < 88 && to.x > 88, 'the arc does not open symmetrically at the bottom');
  });

  it('cuts a dash to the arc it is drawn on', () => {
    const r = 80;
    const whole = dial.dialArcLength(r, 360);
    assert.ok(Math.abs(whole - 2 * Math.PI * r) < 1e-9);
    assert.ok(Math.abs(dial.dialArcLength(r, 180) - whole / 2) < 1e-9);
    assert.ok(dial.dialArcLength(r, dial.DIAL_SWEEP_DEG) < whole, 'an open arc is shorter than a ring');
  });
});

/* -------------------- presentation, and nothing else --------------------- */

describe('the map and the dial say nothing of their own', () => {
  const FILES = [MAP_FILE, DIAL_FILE];

  it('carries no sentence a person would read: every word arrives as a prop', () => {
    for (const file of FILES) {
      const code = codeOf(file);
      // Every drawn word has to be an expression the caller filled in. A
      // bare text node between <Text> and </Text> is this file deciding
      // what a person reads about their own head, which is not its job.
      const drawn = [...code.matchAll(/<Text[^>]*>([\s\S]*?)<\/Text>/g)].map((m) => m[1].trim());
      assert.ok(drawn.length > 0, `${file} draws no text at all; the regex has stopped matching`);
      for (const child of drawn) {
        assert.ok(child.startsWith('{'), `${file} sets a word of its own: ${child}`);
      }
      // And no label prop carries a default sentence to fall back on.
      const defaults = [...code.matchAll(/\n  (\w*[Ll]abel\w*)\s*=\s*'([^']*)'/g)].map((m) => m[2]);
      assert.deepEqual(defaults, [], `${file} defaults a label to words of its own`);
    }
  });

  it('never names the claim the score is not allowed to make', () => {
    // The guardrail, in the one place a picture could break it: a tint or
    // an arc is a reading of what a photograph shows, and no identifier,
    // comment or string here may call it anything else. Word boundaries,
    // so the platform's own `progressbar` role is left alone.
    const FORBIDDEN = [
      'density', 'densities', 'follicle', 'follicles', 'thinning', 'balding', 'norwood',
      'regrow', 'diagnos', 'shaft', 'progress', 'stage', 'severe',
    ];
    for (const file of FILES) {
      const text = read(file);
      for (const word of FORBIDDEN) {
        assert.ok(
          !new RegExp(`\\b${word}\\b`, 'i').test(text),
          `${file} says "${word}" — a picture of coverage is not a reading of hair itself`,
        );
      }
      assert.ok(!/\bhair loss\b/i.test(text), `${file} names a condition`);
    }
  });

  it('paints from tokens, never from a colour of its own', () => {
    for (const file of FILES) {
      const code = codeOf(file);
      assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(code), `${file} names a raw colour`);
      assert.ok(!/\brgba?\(/.test(code), `${file} names a raw colour`);
      assert.ok(code.includes('useTheme()'), `${file} does not read the theme`);
    }
  });

  it('decides nothing: no threshold, no ordering, no opinion about a number', () => {
    for (const file of FILES) {
      const code = codeOf(file);
      assert.ok(!/\bsort\(/.test(code), `${file} re-orders what it was handed`);
      assert.ok(!/\bfilter\(/.test(code), `${file} decides what to leave out`);
      for (const word of ['good', 'poor', 'strong', 'weak', 'normal', 'healthy']) {
        assert.ok(!new RegExp(`['"\`][^'"\`]*\\b${word}\\b`, 'i').test(code), `${file} grades a number as "${word}"`);
      }
    }
  });

  it('stands its motion down when the phone asks', () => {
    for (const file of FILES) {
      const code = codeOf(file);
      assert.ok(code.includes('useReducedMotion()'), `${file} does not ask`);
      assert.ok(
        /useSharedValue\(reduceMotion \? 1 : 0\)/.test(code),
        `${file} starts its fill somewhere Reduce Motion cannot fix`,
      );
      assert.ok(/reduceMotion\s*\n?\s*\?\s*1/.test(code), `${file} animates anyway under Reduce Motion`);
      assert.ok(!/withRepeat/.test(code), `${file} loops an animation on a report`);
    }
  });

  it('gives the map’s regions a target a finger can hit, and a name to speak', () => {
    const code = codeOf(MAP_FILE);
    assert.ok(code.includes('minHeight: MIN_TOUCH_TARGET'), 'a region chip is smaller than a finger');
    assert.ok(code.includes("accessibilityRole=\"button\""), 'a tappable region is not announced as one');
    assert.ok(
      /accessibilityLabel=\{spoken\}/.test(code) &&
        /const spoken = item\.score === null \? item\.label/.test(code),
      'a chip speaks no name',
    );
    assert.ok(/onSelect\(item\.region\)/.test(code), 'a tapped region does not report which one it is');
    /*
      And the figure never goes out bare. grade.ts: a score shown without
      its confidence is a claim this app does not make — so the chip
      speaks the scale it is on and the confidence beside it, both in the
      caller's words, neither composed here.
    */
    assert.ok(/\$\{scale\}\$\{saidConfidence\}/.test(code), 'a chip speaks a bare number');
    assert.ok(/item\.confidenceLabel \? `\. \$\{item\.confidenceLabel\}` : ''/.test(code), 'the chip invents a confidence');
    // And the drawing itself is never the touch target: the part line
    // strip is sixteen units wide, which no finger can be asked to find.
    assert.ok(!/<(Rect|Path|G)[^>]*onPress/.test(read(MAP_FILE)), 'a drawn shape is being used as a touch target');
  });

  it('the dial hands a screen reader the confidence with the figure, never the figure alone', () => {
    /*
      The root View is `accessible` with an explicit label, which on both
      platforms replaces everything under it — including the confidence
      line the caller passes in. So the label has to carry it, or a
      screen-reader user hears "Visual Coverage, 62" and nothing else,
      which is the one claim grade.ts says this app never makes.
    */
    const code = codeOf(DIAL_FILE);
    assert.match(code, /accessibilityLabel=\{\s*\n?\s*rounded === null \? `\$\{label\}\. \$\{emptyLabel\}` : `\$\{label\}, \$\{rounded\}\$\{saidConfidence\}`/);
    assert.match(code, /const saidConfidence = confidenceLabel \? `\. \$\{confidenceLabel\}` : ''/);
    // The word itself is still the caller's: nothing here writes one.
    assert.ok(!/confidence['"`]/i.test(code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'the dial writes a confidence of its own');
  });

  it('never dims the chips, which are the map’s only readable numbers', () => {
    // The drawing is hidden from the screen reader, so these six chips
    // are the whole of the map's legible and spoken content. A chip with
    // no handler behind it must be a plain readout — not a Pressable
    // marked `disabled`, which PressableScale paints at 0.4 and which a
    // screen reader announces as a disabled button over live figures.
    const code = codeOf(MAP_FILE);
    assert.ok(!/\bdisabled\b/.test(code), 'the map marks something disabled; its numbers would be dimmed');
    assert.ok(
      /if \(!onSelect\) \{[\s\S]{0,400}<View[\s\S]{0,200}accessibilityRole="text"/.test(code),
      'with no handler a chip must be a plain readout, not a button',
    );
    assert.ok(
      /return \(\s*<PressableScale\s+onPress=\{\(\) => onSelect\(item\.region\)\}/.test(code),
      'a chip is only a pressable when there is somewhere to send the press',
    );
    // The map's own drawing contributes nothing to a screen reader, so
    // the chips have to carry it.
    assert.ok(
      /accessibilityElementsHidden/.test(code) && /importantForAccessibility="no-hide-descendants"/.test(code),
      'the drawing is no longer hidden from the screen reader; this test’s premise has changed',
    );
  });

  it('draws nothing at all when it was handed nothing', () => {
    const code = codeOf(MAP_FILE);
    assert.ok(
      /regions\.length === 0\) return null/.test(code),
      'an empty map must not draw an empty head that looks like a reading',
    );
    // Every hook runs before that return, or React tears the tree down.
    const body = code.slice(code.indexOf('export function CoverageMap'));
    const guard = body.indexOf('regions.length === 0');
    const afterGuard = body.slice(guard);
    assert.ok(!/\buse[A-Z]\w*\(/.test(afterGuard.split('function RegionShape')[0]), 'a hook runs after the guard');
  });
});
