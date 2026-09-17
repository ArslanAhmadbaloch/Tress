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
  HAIR_SCAN_REPORT_UI_COPY as UI,
  reportUiCopySentences,
} from '@/components/hair-scan/report-sections/ui-copy';
import { FALLBACK_RECT, REPORT_REGIONS, faceRegionRects } from '@/features/hair-scan/region-crops';
import { syntheticContours } from '@/features/hair-scan/tracking';
import type { MeshFace } from '@/features/hair-scan/types';

import { HAIR_CLAIMS } from './claims';
import { assertHonest } from './honesty-words';

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
  assert.equal(wide.leftTemple?.x, 0, 'the left temple was clamped at the side');
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
  'focus',
  'hero',
  'locked',
  'next-pill',
  'profile',
  'region-crop',
  'routine',
  'says',
  'section',
  'strengths',
  'tabs',
  'tips',
].map((name) => [name, readFileSync(`${SECTIONS_DIR}${name}.tsx`, 'utf8')] as const);

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
});

test('report screen: depth is Premium — one button to the paywall under the rows, repeated in the routine block, and nowhere else', () => {
  assert.match(REPORT_SOURCE, /router\.push\('\/paywall'\)/);
  assert.match(REPORT_SOURCE, /router\.push\('\/routine'\)/);
  assert.equal(ROWS_SOURCE.match(/<LockCta/g)?.length, 1, 'once under the rows');
  assert.equal(ROUTINE_SOURCE.match(/<LockCta/g)?.length, 1, 'once in the routine block');
  const elsewhere = SECTION_SOURCES.filter(([name]) => !['analysis-rows', 'routine', 'locked'].includes(name));
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
