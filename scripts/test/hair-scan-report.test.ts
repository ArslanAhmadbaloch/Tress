/**
 * The hair scan report screen, checked without a phone.
 *
 * The screen computes no sentence — every word is the model's, swept in
 * hair-scan-report-model.test.ts — so what is held to here is the
 * arithmetic it does do (where a crop's picture sits in its square,
 * which section the Next pill goes to, where the mesh lands on the
 * hero, what the scroll does to the still and the chrome, where the
 * marks on a crop go), the few chrome labels it owns, and a short list
 * of product rules read off its source. The source rules are kept to
 * what a refactor must not lose — the one ask, the one button to the
 * paywall, the scroll on the UI thread, Reduce Motion reaching every
 * scroll-linked sum — and never to the shape of a line of JSX.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  DOTS_MAX,
  DOT_SPACING,
  HERO_HEIGHT_SHARE,
  HERO_PARALLAX,
  SECTION_REACHED_WITHIN,
  SETTLE_EVERY,
  chromeOpacity,
  cropLayout,
  edgeDots,
  faceFromRegions,
  faceInBox,
  heroHeight,
  heroShift,
  nextSectionIndex,
  pillReturnsAfterDrag,
  rowsForTab,
  sectionsInView,
  shouldSettle,
  statusFlipAt,
  stripOpacity,
} from '@/components/hair-scan/report-sections/layout';
import { MASK_BOX, projector, type ParsedMaskTrace } from '@/components/report/mask-overlay-model';
import {
  HAIR_SCAN_SECTION_COPY as SECTION_COPY,
  sectionCopySentences,
} from '@/components/hair-scan/report-sections';
import {
  HAIR_SCAN_REPORT_UI_COPY as UI,
  reportUiCopySentences,
} from '@/components/hair-scan/report-sections/ui-copy';
import { FALLBACK_RECT, REPORT_REGIONS, faceRegionRects } from '@/features/hair-scan/region-crops';
import { syntheticContours } from '@/features/hair-scan/tracking';
import type { MeshFace } from '@/features/hair-scan/types';

import { HAIR_CLAIMS } from './claims';
import { assertHonest } from './honesty-words';
import { IMAGE_LEFT_TEMPLE } from '@/features/hair-scan/handedness';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

/* --------------------------------- crops --------------------------------- */

test('crop layout: the rectangle fills the square and its corner meets the corner', () => {
  const crop = { width: 1000, height: 1000, rect: { x: 0.2, y: 0.1, w: 0.4, h: 0.4 } };
  const l = cropLayout(crop, { width: 100, height: 100 });
  assert.equal(l.imageWidth, 250);
  assert.equal(l.imageHeight, 250);
  assert.equal(l.translateX, -50);
  assert.equal(l.translateY, -25);
});

test('crop layout: a rectangle wider than the square is centred on it, never letterboxed', () => {
  const crop = { width: 1000, height: 1000, rect: { x: 0.2, y: 0.1, w: 0.6, h: 0.3 } };
  const box = { width: 100, height: 100 };
  const l = cropLayout(crop, box);
  // The short side sets the scale: 0.3 of the picture fills 100 points.
  assert.ok(near(l.imageHeight, 1000 / 3, 1e-9));
  // The rectangle's centre lands on the square's centre on both axes.
  const centreX = l.translateX + (crop.rect.x + crop.rect.w / 2) * l.imageWidth;
  const centreY = l.translateY + (crop.rect.y + crop.rect.h / 2) * l.imageHeight;
  assert.ok(near(centreX, 50, 1e-9), `centre x ${centreX}`);
  assert.ok(near(centreY, 50, 1e-9), `centre y ${centreY}`);
  // Nothing outside the rectangle's short side shows: the drawn rectangle is at least the square.
  assert.ok(crop.rect.w * l.imageWidth >= box.width - 1e-9);
  assert.ok(crop.rect.h * l.imageHeight >= box.height - 1e-9);
});

test('crop layout: a photograph taller than wide, in a square, through the fallback rectangle', () => {
  const crop = { width: 1080, height: 1440, rect: FALLBACK_RECT };
  const l = cropLayout(crop, { width: 88, height: 88 });
  // The fallback is 0.6 wide by 0.34 tall on a 3:4 picture: the height sets the scale.
  assert.ok(near(l.imageHeight, (88 / (0.34 * 1440)) * 1440, 1e-9));
  assert.ok(near(l.translateY, -(FALLBACK_RECT.y * l.imageHeight), 1e-9));
  const left = l.translateX + FALLBACK_RECT.x * l.imageWidth;
  const right = l.translateX + (FALLBACK_RECT.x + FALLBACK_RECT.w) * l.imageWidth;
  assert.ok(left <= 0 && right >= 88, 'the rectangle spans the square');
});

test('crop layout: a crop or a box with no size draws the picture filling the box', () => {
  assert.deepEqual(cropLayout({ width: 0, height: 0, rect: FALLBACK_RECT }, { width: 88, height: 88 }), {
    imageWidth: 88,
    imageHeight: 88,
    translateX: 0,
    translateY: 0,
  });
  const l = cropLayout({ width: 1000, height: 1000, rect: { x: 0, y: 0, w: 0, h: 0.5 } }, { width: 88, height: 88 });
  assert.equal(l.imageWidth, 88);
});

/* ---------------------------------- tabs --------------------------------- */

test('tabs: All shows every row and a tab shows only its own', () => {
  const rows = [{ tab: 'hairline' as const }, { tab: 'temples' as const }, { tab: 'crown' as const }, { tab: 'light' as const }];
  assert.equal(rowsForTab(rows, 'all').length, 4);
  assert.deepEqual(rowsForTab(rows, 'temples'), [{ tab: 'temples' }]);
  assert.deepEqual(rowsForTab(rows, 'light'), [{ tab: 'light' }]);
});

/* -------------------------------- sections ------------------------------- */

test('next pill: walks the sections in scroll order and turns into the way out on the last', () => {
  const offsets = [600, 1300, 1900, 2500, 3300, 4000, 4700];
  const visited: number[] = [];
  let scrollY = 0;
  for (let step = 0; step < 20; step += 1) {
    const next = nextSectionIndex(offsets, scrollY);
    if (next === null) break;
    visited.push(next);
    scrollY = offsets[next];
  }
  assert.deepEqual(visited, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(nextSectionIndex(offsets, 4700), null);
});

test('next pill: a section within reach counts as reached, and an unmeasured one is skipped', () => {
  const offsets = [600, 1300, null, 2500];
  assert.equal(nextSectionIndex(offsets, 600 - SECTION_REACHED_WITHIN - 1), 0);
  assert.equal(nextSectionIndex(offsets, 600 - SECTION_REACHED_WITHIN), 1);
  assert.equal(nextSectionIndex(offsets, 1300), 3);
  assert.equal(nextSectionIndex([], 0), null);
  assert.equal(nextSectionIndex([null, null], 0), null);
});

test('reveal: sections enter as their tops come into the viewport, in order', () => {
  const offsets = [600, 1300, 1900, null, 3300];
  assert.deepEqual(sectionsInView(offsets, 0, 800), [0]);
  assert.deepEqual(sectionsInView(offsets, 500, 800), [0]);
  assert.deepEqual(sectionsInView(offsets, 600, 800), [0, 1]);
  assert.deepEqual(sectionsInView(offsets, 2600, 800), [0, 1, 2, 4]);
});

/* ---------------------------------- hero --------------------------------- */

test('hero: the still keeps its own aspect at the screen width, under the sheet cap', () => {
  const screen = { width: 390, height: 844 };
  const cap = Math.round(844 * HERO_HEIGHT_SHARE);
  assert.equal(heroHeight({ width: 1080, height: 1440 }, screen), Math.min(cap, 520));
  assert.equal(heroHeight({ width: 1080, height: 1920 }, screen), cap);
  assert.equal(heroHeight({ width: 0, height: 0 }, screen), cap);
});

/** A drawn face in a 1000-box, in the box's own pixels. */
function drawnFace(cx = 500, cy = 450, width = 400, height = 520): MeshFace {
  return { cx, cy, width, height, contours: syntheticContours(cx, cy, width, height) };
}
const BOX = { width: 1000, height: 1000 };

test('hero: the face box runs back out of the regions the frame stored', () => {
  const face = drawnFace();
  const rects = faceRegionRects(face, BOX);
  for (const region of REPORT_REGIONS) assert.ok(rects[region], `${region} placed`);
  const back = faceFromRegions(rects);
  assert.ok(back, 'a face was recovered');
  assert.ok(near(back.cx, 0.5, 1e-6));
  assert.ok(near(back.width, 0.4, 1e-6));
  assert.ok(near(back.height, 0.52, 1e-6));
  assert.ok(near(back.cy, 0.45, 1e-6));
});

test('hero: a head high in the frame keeps its mesh — the temples place it when the hairline band is clamped', () => {
  // The band runs off the top and is clamped; the temple boxes, lower, are whole.
  const face = drawnFace(500, 400, 400, 520);
  const rects = faceRegionRects(face, BOX);
  assert.equal(rects.hairline?.y, 0, 'the band was clamped to the top');
  assert.ok(rects.leftTemple && rects.leftTemple.y > 0, 'the temples were not');
  const back = faceFromRegions(rects);
  assert.ok(back, 'a face was recovered from the temples alone');
  assert.ok(near(back.cx, 0.5, 1e-6));
  assert.ok(near(back.cy, 0.4, 1e-6));
  assert.ok(near(back.width, 0.4, 1e-6));
  assert.ok(near(back.height, 0.52, 1e-6));
  // The band alone places nothing: it is the check, not the source.
  assert.equal(faceFromRegions({ hairline: faceRegionRects(drawnFace(), BOX).hairline }), null);
});

test('hero: clamped temples, or a band that disagrees without a reason, place no face', () => {
  // A face so high that the temple boxes themselves run off the top: their height is not a face's.
  const high = drawnFace(500, 200, 400, 520);
  const rects = faceRegionRects(high, BOX);
  assert.equal(rects.leftTemple?.y, 0, 'the temples were clamped to the top');
  assert.equal(faceFromRegions(rects), null);
  assert.equal(faceFromRegions(undefined), null);
  // A band nowhere near an edge that does not agree with the temples is not a record `faceRegionRects` wrote.
  const whole = faceRegionRects(drawnFace(), BOX);
  const shifted = { ...whole, hairline: { ...whole.hairline!, x: whole.hairline!.x + 0.1 } };
  assert.equal(faceFromRegions(shifted), null);
  // A temple the clamp has narrowed at the side of the picture disagrees with the gap between them.
  const wide = faceRegionRects(drawnFace(500, 450, 900, 520), BOX);
  // Whichever temple the picture's left edge cuts — the NAME on that side
  // is `handedness.ts`'s to say, and the recovery must refuse either way.
  assert.equal(wide[IMAGE_LEFT_TEMPLE]?.x, 0, 'the image-left temple was clamped at the side');
  assert.equal(faceFromRegions(wide), null);
});

test('hero: the recovered face lands in the box through the same cover fit the still is drawn with', () => {
  const back = faceFromRegions(faceRegionRects(drawnFace(), BOX));
  assert.ok(back);
  // A 3:4 still drawn into a 390×520 box: scale is exactly 390/1080 on both axes, no offset.
  const placed = faceInBox(back, { width: 1080, height: 1440 }, { width: 390, height: 520 });
  assert.ok(placed);
  assert.ok(near(placed.cx, 195, 1e-6));
  assert.ok(near(placed.width, 0.4 * 390, 1e-6));
  assert.ok(near(placed.height, 0.52 * 520, 1e-6));
  assert.ok(placed.contours.FACE && placed.contours.FACE.length > 0, 'contours for the cap builder');
  // A wider box crops the still top and bottom: the face rises by the cropped half.
  const wide = faceInBox(back, { width: 1080, height: 1440 }, { width: 390, height: 400 });
  assert.ok(wide);
  assert.ok(wide.cy < placed.cy);
  assert.equal(faceInBox(back, { width: 0, height: 0 }, { width: 390, height: 400 }), null);
});

/* --------------------------------- words --------------------------------- */

const uiSentences = reportUiCopySentences();

test('ui copy: the chrome labels say nothing about hair and make no promise', () => {
  assert.ok(uiSentences.length > 12);
  const text = uiSentences.join(' ').toLowerCase();
  for (const claim of [...HAIR_CLAIMS, 'receding', 'recession', 'follicle']) {
    assert.ok(!text.includes(claim), `the report chrome must not say "${claim}"`);
  }
  assertHonest(assert, uiSentences, 'hair scan report chrome');
  for (const s of uiSentences) assert.ok(!/\b(before|after)\b/i.test(s), `"${s}" promises a comparison`);
});

test('ui copy: the locked words name what is held and carry no figure', () => {
  assert.equal(UI.locked.button, 'See the full report');
  assert.match(UI.locked.placeholder, /Nothing here is a figure/);
  assert.match(UI.locked.note, /no judgement about your hair/);
  for (const line of Object.values(UI.locked)) assert.ok(!/\d/.test(line), `"${line}" carries a number`);
  assert.equal(UI.actions.continue, 'Continue');
  assert.equal(UI.actions.next, 'Next');
  assert.match(UI.focus.barStart, /Not captured/);
  assert.equal(UI.focus.barEnd, 'Captured');
});

test('section copy: the sections\u2019 own words label a figure and never carry one', () => {
  const sentences = sectionCopySentences();
  assert.ok(sentences.length >= 4);
  assertHonest(assert, sentences, 'hair scan report sections');
  for (const line of sentences) {
    assert.ok(!/\d/.test(line), `"${line}" carries a figure the model did not compute`);
  }
  // The disclosure says what it opens, and nothing about a head.
  assert.equal(SECTION_COPY.quality.show, 'View scan details');
  assert.equal(SECTION_COPY.quality.hide, 'Hide scan details');
  // Everything else here is a pattern that joins the model's words to the
  // model's figures for a screen reader.
  assert.equal(SECTION_COPY.a11y.figure('Hairline', '62'), 'Hairline: 62.');
  assert.equal(SECTION_COPY.a11y.figure('Hairline', '62', 'Confidence 80%'), 'Hairline: 62. Confidence 80%.');
  assert.equal(SECTION_COPY.a11y.joined('Crown', null, 'Nothing changed'), 'Crown. Nothing changed');
});

/* -------------------------------- the scroll ------------------------------ */

test('scroll: the still slides under the sheet by its share, and not at all under Reduce Motion', () => {
  assert.equal(heroShift(0, false), 0);
  assert.ok(near(heroShift(200, false), -200 * HERO_PARALLAX));
  assert.equal(heroShift(-40, false), 0, 'an overscroll does not pull the still down');
  assert.equal(heroShift(200, true), 0, 'Reduce Motion holds the still');
  assert.equal(heroShift(2000, true), 0);
});

test('scroll: the chrome over the still fades to gone by the fade line, or steps under Reduce Motion', () => {
  assert.equal(chromeOpacity(0, 300, false), 1);
  assert.ok(near(chromeOpacity(150, 300, false), 0.5));
  assert.equal(chromeOpacity(300, 300, false), 0);
  assert.equal(chromeOpacity(900, 300, false), 0);
  assert.equal(chromeOpacity(299, 300, true), 1);
  assert.equal(chromeOpacity(300, 300, true), 0);
  assert.equal(chromeOpacity(0, 0, false), 1, 'a fade line of nothing is still a line');
});

test('scroll: the strip under the status bar is painted as the sheet comes up, solid the moment the tab row sticks', () => {
  const spacerH = 400;
  const inset = 50;
  assert.equal(stripOpacity(0, spacerH, inset, false), 0);
  assert.equal(stripOpacity(spacerH - inset, spacerH, inset, false), 0, 'the still is untouched until the last inset');
  assert.ok(near(stripOpacity(spacerH - inset / 2, spacerH, inset, false), 0.5));
  assert.equal(stripOpacity(spacerH, spacerH, inset, false), 1, 'solid when the row sticks');
  assert.equal(stripOpacity(spacerH + 500, spacerH, inset, false), 1);
  // The status bar flips half-way through the approach.
  assert.equal(statusFlipAt(spacerH, inset, false), spacerH - inset / 2);
  // Under Reduce Motion there is no approach: strip and flip step together the moment the row sticks.
  const flip = statusFlipAt(spacerH, inset, true);
  assert.equal(flip, spacerH);
  assert.equal(stripOpacity(flip - 1, spacerH, inset, true), 0);
  assert.equal(stripOpacity(flip, spacerH, inset, true), 1);
  // No status bar: the strip has no height to fade over and simply follows the row.
  assert.equal(statusFlipAt(spacerH, 0, false), spacerH);
  assert.equal(stripOpacity(spacerH - 1, spacerH, 0, false), 0);
  assert.equal(stripOpacity(spacerH, spacerH, 0, false), 1);
});

test('scroll: the pill comes back after a drag only when the sheet was left still', () => {
  assert.equal(pillReturnsAfterDrag(0), true);
  assert.equal(pillReturnsAfterDrag(undefined), true, 'a platform that reports no velocity gets the pill back');
  assert.equal(pillReturnsAfterDrag(0.04), true);
  assert.equal(pillReturnsAfterDrag(1.2), false, 'a flick leaves the glide to bring it back');
  assert.equal(pillReturnsAfterDrag(-1.2), false);
});

test('scroll: the JS side hears about the scroll every few dozen points and at every line it switches on', () => {
  const lines = [375, 400];
  assert.equal(shouldSettle(0, SETTLE_EVERY - 1, lines), false);
  assert.equal(shouldSettle(0, SETTLE_EVERY, lines), true);
  assert.equal(shouldSettle(370, 380, lines), true, 'crossing the status flip');
  assert.equal(shouldSettle(380, 399, lines), false, 'between the lines, not far enough');
  assert.equal(shouldSettle(399, 401, lines), true, 'crossing the tab row sticking');
  assert.equal(shouldSettle(401, 399, lines), true, 'back over it');
  assert.equal(shouldSettle(500, 490, []), false);
});

/* ------------------------------- crop marks ------------------------------- */

/** A trace whose top edge is one straight run across the box at a quarter of its height. */
function flatTrace(points = 64, atY = MASK_BOX / 4): ParsedMaskTrace {
  const run: number[] = [];
  for (let i = 0; i < points; i += 1) run.push((i / (points - 1)) * MASK_BOX, atY);
  return { contours: [], topEdge: [run], tolerance: null };
}

test('crop marks: the dots are the tracer’s own vertices, inside the window, spaced apart and capped', () => {
  // A square photograph drawn at 400 points: the projector is the identity over 0..400.
  const project = projector({ width: 1000, height: 1000 }, 400, 400);
  const whole = edgeDots(flatTrace(), project, { x: 0, y: 0, width: 400, height: 400 });
  assert.ok(whole.length > 0);
  assert.ok(whole.length <= DOTS_MAX, `${whole.length} dots exceed the cap`);
  for (const dot of whole) assert.ok(near(dot.y, 100), 'every dot sits on the edge');
  for (let i = 1; i < whole.length; i += 1) {
    assert.ok(Math.hypot(whole[i].x - whole[i - 1].x, whole[i].y - whole[i - 1].y) >= DOT_SPACING, 'dots read as dots');
  }
  // Only the window: a crop showing the right half of the picture gets dots from the right half.
  const half = edgeDots(flatTrace(), project, { x: 200, y: 0, width: 200, height: 400 });
  assert.ok(half.length > 0);
  for (const dot of half) assert.ok(dot.x >= 200 && dot.x <= 400);
  // A window the edge does not cross gets nothing: no dot is ever invented.
  assert.deepEqual(edgeDots(flatTrace(), project, { x: 0, y: 200, width: 400, height: 200 }), []);
  assert.deepEqual(edgeDots({ contours: [], topEdge: [], tolerance: null }, project, { x: 0, y: 0, width: 400, height: 400 }), []);
});

/* -------------------------------- the source ------------------------------ */

const REPORT_SOURCE = readFileSync('src/components/hair-scan/report.tsx', 'utf8');
const HERO_SOURCE = readFileSync('src/components/hair-scan/report-sections/hero.tsx', 'utf8');
const ROWS_SOURCE = readFileSync('src/components/hair-scan/report-sections/analysis-rows.tsx', 'utf8');
const LOCKED_SOURCE = readFileSync('src/components/hair-scan/report-sections/locked.tsx', 'utf8');
const ROUTINE_SOURCE = readFileSync('src/components/hair-scan/report-sections/routine.tsx', 'utf8');
const CROP_SOURCE = readFileSync('src/components/hair-scan/report-sections/region-crop.tsx', 'utf8');
const SECTIONS_DIR = 'src/components/hair-scan/report-sections/';
const SECTION_SOURCES = [
  'analysis-rows',
  'assessment',
  'changed',
  'coverage-map',
  'focus',
  'grade-dial',
  'hero',
  'locked',
  'next-pill',
  'profile',
  'quality',
  'region-card',
  'region-crop',
  'routine',
  'says',
  'scalp-visibility',
  'section',
  'strengths',
  'symmetry',
  'tabs',
  'tips',
  'unavailable',
  'watch',
].map((name) => [name, readFileSync(`${SECTIONS_DIR}${name}.tsx`, 'utf8')] as const);
const sectionSource = (name: string): string => {
  const found = SECTION_SOURCES.find(([n]) => n === name);
  assert.ok(found, `${name} is not in the section sources`);
  return found[1];
};
const CARD_SOURCE = sectionSource('region-card');
const UNAVAILABLE_SOURCE = sectionSource('unavailable');
const QUALITY_SOURCE = sectionSource('quality');
const CHANGED_SOURCE = sectionSource('changed');

test('report screen: the one ask for notifications lives here, once per install, and only on a scan’s own report', () => {
  assert.equal(REPORT_SOURCE.match(/enableRemindersWithPrompt\(/g)?.length, 1, 'one ask');
  assert.match(REPORT_SOURCE, /reminderOfferInterval\(remindersAlreadyOffered\(\)/, 'the once-per-install rule is the tested one');
  assert.match(REPORT_SOURCE, /if \(!cancelled\) await markRemindersOffered\(\)/, 'the guard is set after the ask, not before');
  assert.ok(!/setTimeout\(/.test(REPORT_SOURCE), 'the ask is not deferred behind a timer');
  // The ask is gated on the prop, and the reopened report turns it off.
  assert.match(REPORT_SOURCE, /if \(!ask\) return;[\s\S]*?enableRemindersWithPrompt\(/, 'the ask is gated on `ask`');
  assert.match(REPORT_SOURCE, /ask = true/, 'a scan’s own report asks by default');
  const route = readFileSync('src/app/hair-report.tsx', 'utf8');
  assert.match(route, /<HairScanReport[^>]*ask=\{false\}/, 'a reopened report never spends the ask');
});

test('report screen: the words are the model’s — the screen builds the report once and computes no sentence', () => {
  assert.match(REPORT_SOURCE, /buildHairScanReport\(data, session, \{ premium: isPremium \}\)/);
  assert.match(REPORT_SOURCE, /usePremium\(\)/);
  assert.ok(!REPORT_SOURCE.includes('HAIR_SCAN_REPORT_COPY'), 'the old card vocabulary is not drawn');
  assert.ok(!REPORT_SOURCE.includes('buildHairScanResult'), 'the old card builder is not drawn');
  for (const [name, source] of SECTION_SOURCES) {
    assert.ok(!source.includes('HAIR_SCAN_REPORT_COPY'), `${name} reaches for the old copy`);
    assert.ok(!source.includes('HAIR_SCAN_REPORT_MODEL_COPY'), `${name} reads the copy file directly rather than the model`);
  }
  // The tab row and the sections come from the model, never a fixed list.
  assert.match(REPORT_SOURCE, /tabs=\{model\.tabs\}/);
  assert.match(REPORT_SOURCE, /model\.sections\.map\(/);
  // Every measured section reads its own block off the model and nothing else.
  for (const field of [
    'model.assessment',
    'model.cards',
    'model.scalpVisibility',
    'model.symmetry',
    'model.changed',
    'model.watch',
    'model.goal',
    'model.quality',
  ]) {
    assert.ok(REPORT_SOURCE.includes(field), `the screen never reads ${field}`);
  }
});

/* ----------------------------- the assessment ---------------------------- */

test('report screen: the findings come first and the scan\u2019s own quality last, behind a disclosure', () => {
  const at = (id: string) => {
    const i = REPORT_SOURCE.indexOf(`case '${id}'`);
    assert.ok(i > 0, `the screen draws no ${id} section`);
    return i;
  };
  // The owner's order, as the switch reads it; the model's `sections` is
  // what actually orders them on the sheet, and this is the same order.
  const order = ['assessment', 'cards', 'scalp', 'symmetry', 'changed', 'watch', 'focus', 'quality', 'tips'];
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(at(order[i - 1]) < at(order[i]), `${order[i - 1]} must be drawn before ${order[i]}`);
  }
  // The scan's light, focus and framing rows are folded away, not the hero.
  assert.match(REPORT_SOURCE, /<QualityDisclosure[\s\S]*?<AnalysisRows/, 'the quality rows are behind the disclosure');
  assert.match(QUALITY_SOURCE, /accessibilityState=\{\{ expanded: open \}\}/, 'the disclosure says whether it is open');
  assert.ok(!/withTiming|withSpring|entering=/.test(QUALITY_SOURCE), 'the disclosure does not animate its height');
  // The assessment draws the figure and the map, in that order.
  assert.match(REPORT_SOURCE, /<AssessmentScore[\s\S]*?<CoverageMapSection/);
});

test('report screen: a scan the analysis could not read shows the model\u2019s line and a way to scan again', () => {
  assert.match(REPORT_SOURCE, /const unavailable = model\.assessment\.unavailable;/);
  assert.match(REPORT_SOURCE, /unavailable \? \([\s\S]*?<UnavailableBlock unavailable=\{unavailable\} onRescan=\{onRescan\} \/>/);
  // No figure, no observation, no coach's paragraph: the block draws the
  // model's three strings and a button, and nothing it wrote itself.
  // Every word on the block is one of the model's three strings: no
  // sentence of its own, and so no figure of its own either.
  const printed = [...UNAVAILABLE_SOURCE.matchAll(/<Text[^>]*>([\s\S]*?)<\/Text>/g)].map((m) => m[1].trim());
  assert.ok(printed.length > 0);
  for (const line of printed) {
    assert.match(line, /^\{unavailable\.\w+\}$/, `the honest state prints "${line}" of its own`);
  }
  const code = UNAVAILABLE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const forbidden of ['Bubble', 'CoverageBar', 'GradeDial', 'observation', 'SaysBlockView']) {
    assert.ok(!code.includes(forbidden), `the honest state draws ${forbidden}`);
  }
  assert.match(UNAVAILABLE_SOURCE, /unavailable\.title/);
  assert.match(UNAVAILABLE_SOURCE, /unavailable\.body/);
  assert.match(UNAVAILABLE_SOURCE, /label=\{unavailable\.cta\}/);
});

test('region card: a missing figure is absent, never a zero, and a change is drawn only once it clears the floor', () => {
  // Every figure on a card is drawn behind the model's own absence test.
  assert.match(CARD_SOURCE, /card\.grade \? \(/, 'the score line is drawn only where there is a grade');
  assert.match(CARD_SOURCE, /card\.visibleScalp !== null/);
  assert.match(CARD_SOURCE, /card\.symmetry !== undefined/);
  /*
    The comparison's own verdict decides whether a difference is shown,
    and the model decides it: `changePoints` is null unless the engine
    reported a difference clear of the two scans' own margin of error,
    and it is signed whole points by the same arithmetic as the sentence
    in the comparison below. The card used to round the raw delta itself
    against a verdict list of its own, which let one measurement read as
    two different figures on one screen.
  */
  assert.match(CARD_SOURCE, /const shift = card\.changePoints;/);
  assert.ok(!/REPORTABLE/.test(CARD_SOURCE), 'the card keeps a verdict list of its own');
  assert.ok(!/COVERAGE_SCORE_MAX/.test(CARD_SOURCE), 'the card scales a figure itself');
  assert.ok(!/change\.delta/.test(CARD_SOURCE), 'the card reads a raw delta');
  assert.ok(!/\?\? 0/.test(CARD_SOURCE), 'a missing figure falls back to zero');
  // The labels on the figures are the model's, never the card's.
  for (const label of ['labels.coverageLabel', 'labels.scalpLabel', 'labels.differenceLabel', 'labels.changeLabel']) {
    assert.ok(CARD_SOURCE.includes(label), `the card writes its own ${label}`);
  }
  // A held card keeps its figures and holds the working.
  assert.match(CARD_SOURCE, /locked \? \(\s*<HeldBlock/);
});

test('every score on the sheet carries the confidence it was read with, in the model\u2019s own words', () => {
  /*
    grade.ts states the rule the whole model layer is built on: "a score
    shown without its confidence is a claim this app does not make". So
    no section may draw a figure out of a hundred and stop there. The
    three that draw a region's own reading say it in a figure the reader
    can read, not as a tint.
  */
  for (const name of ['region-card', 'symmetry', 'scalp-visibility']) {
    const source = sectionSource(name);
    assert.match(source, /<ConfidenceNote/, `${name} draws a score with no confidence beside it`);
    assert.match(source, /confidenceLabel/, `${name} names the confidence itself`);
  }
  assert.match(CARD_SOURCE, /confidence=\{card\.grade\.confidence\}/, 'the card passes the engine\u2019s own confidence');
  assert.match(sectionSource('symmetry'), /confidence=\{grade\.confidence\}/, 'each temple carries its own');
  assert.match(sectionSource('scalp-visibility'), /confidence=\{row\.confidence\}/, 'each scalp row carries its own');
  // A screen reader hears the figure and its confidence as one sentence.
  for (const name of ['region-card', 'symmetry', 'scalp-visibility']) {
    assert.match(sectionSource(name), /confidenceFigure\(/, `${name} spells its confidence a way of its own`);
  }
  // And nothing anywhere draws a bare score with no mention of a confidence.
  for (const [name, source] of SECTION_SOURCES) {
    if (!/\.score\b/.test(source)) continue;
    assert.match(source, /confidence/, `${name} draws a score and never mentions a confidence`);
  }
});

test('the scale under a figure is the model\u2019s word, composed nowhere on the screen', () => {
  // "out of 100" is said once, by the model, and handed down.
  assert.match(REPORT_SOURCE, /scoreScale: model\.assessment\.scoreScale/);
  assert.match(REPORT_SOURCE, /confidenceLabel: model\.assessment\.confidenceLabel/);
  for (const section of ['<RegionCards', '<ScalpVisibility', '<SymmetryRows']) {
    const i = REPORT_SOURCE.indexOf(section);
    assert.ok(i > 0, `the screen draws no ${section}`);
    assert.match(REPORT_SOURCE.slice(i, i + 400), /figures=\{figures\}/, `${section} is handed no scale`);
  }
  assert.match(CARD_SOURCE, /\{labels\.scoreScale\}/, 'the card prints the model\u2019s scale');
  // No section writes a scale of its own, in any of the shapes one could take.
  for (const [name, source] of SECTION_SOURCES) {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\/\$\{COVERAGE_SCORE_MAX\}/.test(code), `${name} composes a scale out of the constant`);
    assert.ok(!/['"`]\s*\/\s*100\s*['"`]/.test(code), `${name} writes a scale of its own`);
    assert.ok(!/out of 100/.test(code), `${name} writes the scale in words of its own`);
  }
});

test('coverage map: a region on the head is a way into that region\u2019s card', () => {
  /*
    `onSelectRegion` was a prop with no caller for two phases: the map
    reported which region was touched and the screen threw it away, so
    the head was a picture rather than a way around the report. The
    handler opens that region's tab and puts the sheet at the detailed
    analysis, which is where the figure is read back in words.
  */
  assert.match(REPORT_SOURCE, /onSelectRegion=\{showRegion\}/, 'the map reports to nobody');
  const at = REPORT_SOURCE.indexOf('const showRegion =');
  assert.ok(at > 0, 'the screen has no handler for a tapped region');
  const handler = REPORT_SOURCE.slice(at, at + 700);
  assert.match(handler, /model\.cards\.cards\.find\(\(c\) => c\.region === region\)/);
  assert.match(handler, /if \(!card\) return;/, 'a region with no card scrolls somewhere anyway');
  assert.match(handler, /setTab\(card\.tab\)/);
  assert.match(handler, /offsetsRef\.current\.cards/);
  assert.match(handler, /scrollTo\(\{ y: Math\.max\(0, y - TAB_ROW_HEIGHT\), animated: !reduceMotion \}\)/);
});

test('what changed: a comparison with no rows and no line of its own is not drawn as a heading over nothing', () => {
  /*
    Each block is drawn only where it has a row or a line of its own.
    Each side now carries its own line — `body` for the scan before this
    one, `baselineBody` for the baseline — so a quiet comparison says so
    under its own heading rather than falling silent because the other
    side had a row. That silence is what left "Baseline comparison" as a
    heading, a date sentence and nothing else on the commonest report
    there is.

    The lock is not a reason to draw a block: held shapes stand in for
    rows that exist, and there are none here to stand in for.
  */
  const at = REPORT_SOURCE.indexOf("case 'changed'");
  assert.ok(at > 0);
  const changed = REPORT_SOURCE.slice(at, REPORT_SOURCE.indexOf("case 'watch'"));
  assert.match(
    changed,
    /model\.changed\.sinceLast\.length > 0 \|\| model\.changed\.body \?/,
    'the since-last block is drawn with no rows and no line',
  );
  assert.match(
    changed,
    /model\.changed\.sinceBaseline\.length > 0 \|\| model\.changed\.baselineBody \?/,
    'the baseline block is drawn with no rows and no line',
  );
  assert.match(
    changed,
    /empty=\{model\.changed\.baselineBody \|\| undefined\}/,
    'the baseline block is handed no line for a quiet comparison',
  );
  assert.match(
    changed,
    /sinceLast === null && sinceBaseline === null\s*\?\s*null/,
    'a section with neither block is still a section',
  );
});

test('what changed: the quiet verdicts are drawn as plainly as the rest, with no arrow', () => {
  assert.match(CHANGED_SOURCE, /unchanged: 'circle'/);
  assert.match(CHANGED_SOURCE, /insufficient: 'info'/);
  for (const arrow of ['arrowUpRight', 'arrowDownRight', 'flame', 'trophy']) {
    assert.ok(!CHANGED_SOURCE.includes(arrow), `a comparison row draws ${arrow}`);
  }
  // Every sentence on a row is the model's.
  assert.match(CHANGED_SOURCE, /\{row\.detail\}/);
  assert.ok(!/`[^`]*\b(points?|higher|lower)\b[^`]*`/.test(CHANGED_SOURCE), 'a row writes its own comparison');
});

test('report screen: depth is Premium — one button to the paywall under the rows, repeated in the routine block, and nowhere else', () => {
  assert.match(REPORT_SOURCE, /router\.push\('\/paywall'\)/);
  assert.match(REPORT_SOURCE, /router\.push\('\/routine'\)/);
  assert.equal(ROWS_SOURCE.match(/<LockCta/g)?.length, 1, 'once under the scan-quality rows');
  assert.equal(CARD_SOURCE.match(/<LockCta/g)?.length, 1, 'once under the region cards');
  assert.equal(ROUTINE_SOURCE.match(/<LockCta/g)?.length, 1, 'once in the routine block');
  const elsewhere = SECTION_SOURCES.filter(
    ([name]) => !['analysis-rows', 'region-card', 'routine', 'locked'].includes(name),
  );
  for (const [name, source] of elsewhere) assert.ok(!source.includes('<LockCta'), `${name} draws a lock button`);
  assert.equal(LOCKED_SOURCE.match(/label=\{UI\.locked\.button\}/g)?.length, 1);
  // A held row keeps its headline and never prints its body.
  assert.ok(!/row\.locked \? \([\s\S]*?\{row\.body\}[\s\S]*?\) : \(/.test(ROWS_SOURCE), 'a held row never prints its body');
  assert.match(ROWS_SOURCE, /row\.locked \? \([\s\S]*?<HeldBlock/);
  for (const [name, source] of SECTION_SOURCES) assert.ok(!/BlurView/.test(source), `${name}: a static translucent block, not a blur that Android cannot draw`);
});

test('report screen: in the funnel the pill and the footer end in Continue; otherwise in Done', () => {
  assert.match(REPORT_SOURCE, /funnel \? onContinue : onDone/);
  assert.match(REPORT_SOURCE, /funnel \? UI\.actions\.continue : UI\.actions\.done/);
});

test('report screen: the scroll-linked sums run on the UI thread, and every one of them takes Reduce Motion', () => {
  assert.match(REPORT_SOURCE, /useAnimatedScrollHandler\(/, 'the scroll is a worklet');
  assert.ok(!/NativeScrollEvent/.test(REPORT_SOURCE), 'no JS onScroll');
  assert.match(REPORT_SOURCE, /scrollEventThrottle=\{16\}/);
  // The still, the strip and the chrome all go through the tested helpers, and hand them the setting.
  assert.match(REPORT_SOURCE, /heroShift\(scrollY\.get\(\), reduceMotion\)/, 'the parallax is gated');
  assert.match(REPORT_SOURCE, /stripOpacity\(scrollY\.get\(\), spacerH, insets\.top, reduceMotion\)/, 'the strip is gated');
  assert.match(HERO_SOURCE, /chromeOpacity\(scrollY\.get\(\), fadeBy, reduceMotion\)/, 'the chrome fade is gated');
  assert.ok(!/interpolate\(/.test(HERO_SOURCE), 'no ungated interpolation in the hero');
  // The status bar follows the strip, and the still is never under a dark clock: light until the strip is painted.
  assert.match(REPORT_SOURCE, /<StatusBar style=\{pastHero \? 'auto' : 'light'\} \/>/);
  assert.match(REPORT_SOURCE, /setPastHero\(y >= flipAt\)/);
  assert.match(REPORT_SOURCE, /statusFlipAt\(spacerH, insets\.top, reduceMotion\)/);
  for (const [name, source] of [['report', REPORT_SOURCE] as const, ...SECTION_SOURCES]) {
    const animates = /useSharedValue|withSpring|withTiming|entering=|useAnimatedStyle/.test(source);
    if (animates) assert.match(source, /useReducedMotion\(\)/, `${name} animates without reading Reduce Motion`);
    assert.ok(!/ActivityIndicator/.test(source), `${name} draws a spinner`);
  }
});

test('report screen: the crop is a window on the actual frame, marked lightly, and a fallback crop says so', () => {
  assert.match(CROP_SOURCE, /cropLayout\(crop, box\)/);
  assert.match(CROP_SOURCE, /overflow: 'hidden'/);
  assert.match(CROP_SOURCE, /crop\.approximate \?[\s\S]*?UI\.crop\.approximate/);
  // The marks are the segmenter's own trace through the same cover fit, only where one was made, and static.
  assert.match(CROP_SOURCE, /maskTraceOf\(photo\)/);
  assert.match(CROP_SOURCE, /edgeDots\(trace, project/);
  assert.ok(!/MaskOverlay/.test(CROP_SOURCE), 'the hero’s full overlay is not mounted per crop');
  assert.ok(!/useSharedValue|withTiming|withDelay|entering=/.test(CROP_SOURCE), 'the marks do not animate');
});

test('report route: a saved scan reopens its report, registered and linked', () => {
  const route = readFileSync('src/app/hair-report.tsx', 'utf8');
  const layout = readFileSync('src/app/_layout.tsx', 'utf8');
  const session = readFileSync('src/app/session/[id].tsx', 'utf8');
  assert.match(route, /useLocalSearchParams<\{ id: string \}>\(\)/);
  assert.match(route, /<HairScanReport session=\{session\}/);
  assert.match(route, /onBack=\{leave\}/);
  assert.match(layout, /name="hair-report"/);
  assert.match(session, /capture === 'scan'/, 'only a scan’s update offers the report');
  assert.match(session, /hair-report\?id=/);
});


/*
  The subscription holds back the depth of a reading. It must never hold
  back the line that says to see a doctor: that is the one note in the
  report that could matter to somebody's health, and charging for it
  would be indefensible. The flag lives on the note in tips.ts so the
  rule travels with it; this reads the component that honours it.
*/
test('tips: a note that points at a doctor is never held behind the lock', () => {
  const list = readFileSync(
    new URL('../../src/components/hair-scan/report-sections/tips.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    list,
    /const held = locked && i > 0 && tip\.safety !== true;/,
    'the lock has to exempt a safety note',
  );

  const tips = readFileSync(new URL('../../src/features/hair-scan/tips.ts', import.meta.url), 'utf8');
  for (const line of tips.split('\n')) {
    if (!line.includes('dermatologist') || line.trimStart().startsWith('*')) continue;
    assert.match(line, /,\s*true\)/, `a doctor note must carry safety: ${line.trim().slice(0, 80)}`);
  }
});
