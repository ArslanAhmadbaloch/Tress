/**
 * The scanner's chrome, checked without a phone.
 *
 * The haptic table is the part of the chrome that runs as logic rather
 * than as pixels: which event makes which touch, how close two of the
 * same event may fall, that the device preference is a hard gate, and
 * which sector counts are milestones. The components themselves import
 * Reanimated and SVG and can only be watched on a device; what can be
 * held to here is the contract they expose to the screen lane, read from
 * their source.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  SCAN_HAPTIC_FLOOR_MS,
  SCAN_HAPTIC_STYLE,
  SCAN_MILESTONE_SECTORS,
  createScanHaptics,
  isScanMilestone,
  type ScanHapticEvent,
} from '@/features/hair-scan/haptics';

const EVENTS: ScanHapticEvent[] = [
  'start',
  'trackingLock',
  'sectorCaptured',
  'milestone',
  'complete',
];

function recorder() {
  const played: ScanHapticEvent[] = [];
  const trigger = (event: ScanHapticEvent) => {
    played.push(event);
    return Promise.resolve();
  };
  return { played, trigger };
}

/* --------------------------------- table --------------------------------- */

test('haptics: every engine event has a touch, a floor, and a strength', () => {
  for (const event of EVENTS) {
    assert.ok(SCAN_HAPTIC_FLOOR_MS[event] > 0, `${event} has no floor`);
    assert.ok(SCAN_HAPTIC_STYLE[event], `${event} has no touch`);
  }
});

test('haptics: the map is the one the brief asks for', () => {
  assert.deepEqual(SCAN_HAPTIC_STYLE.start, { kind: 'impact', style: 'Light' });
  assert.deepEqual(SCAN_HAPTIC_STYLE.trackingLock, { kind: 'selection' });
  assert.deepEqual(SCAN_HAPTIC_STYLE.sectorCaptured, { kind: 'impact', style: 'Soft' });
  assert.deepEqual(SCAN_HAPTIC_STYLE.milestone, { kind: 'impact', style: 'Medium' });
  assert.deepEqual(SCAN_HAPTIC_STYLE.complete, { kind: 'success' });
});

test('haptics: sector ticks are the closest-spaced event, and still not a rattle', () => {
  const floors = EVENTS.map((event) => SCAN_HAPTIC_FLOOR_MS[event]);
  assert.equal(Math.min(...floors), SCAN_HAPTIC_FLOOR_MS.sectorCaptured);
  assert.ok(SCAN_HAPTIC_FLOOR_MS.sectorCaptured >= 60, 'two taps under 60ms feel like one');
  assert.ok(SCAN_HAPTIC_FLOOR_MS.start > SCAN_HAPTIC_FLOOR_MS.sectorCaptured);
  assert.ok(SCAN_HAPTIC_FLOOR_MS.complete > SCAN_HAPTIC_FLOOR_MS.milestone);
});

/* --------------------------------- floor --------------------------------- */

test('haptics: the same event inside its floor is swallowed, outside it plays', () => {
  const { played, trigger } = recorder();
  const haptics = createScanHaptics(() => true, trigger);

  assert.equal(haptics.play('sectorCaptured', 1000), true);
  assert.equal(haptics.play('sectorCaptured', 1000 + SCAN_HAPTIC_FLOOR_MS.sectorCaptured - 1), false);
  assert.equal(haptics.play('sectorCaptured', 1000 + SCAN_HAPTIC_FLOOR_MS.sectorCaptured), true);
  assert.deepEqual(played, ['sectorCaptured', 'sectorCaptured']);
});

test('haptics: a fast turn that captures three sectors in one beat is one tick', () => {
  const { played, trigger } = recorder();
  const haptics = createScanHaptics(() => true, trigger);
  haptics.play('sectorCaptured', 0);
  haptics.play('sectorCaptured', 16);
  haptics.play('sectorCaptured', 33);
  assert.equal(played.length, 1);
});

test('haptics: floors are per event, so a milestone lands between sector ticks', () => {
  const { played, trigger } = recorder();
  const haptics = createScanHaptics(() => true, trigger);
  assert.equal(haptics.play('sectorCaptured', 0), true);
  assert.equal(haptics.play('milestone', 10), true);
  assert.equal(haptics.play('complete', 20), true);
  assert.deepEqual(played, ['sectorCaptured', 'milestone', 'complete']);
});

test('haptics: start cannot double-fire inside its floor', () => {
  const { played, trigger } = recorder();
  const haptics = createScanHaptics(() => true, trigger);
  assert.equal(haptics.play('start', 0), true);
  assert.equal(haptics.play('start', 100), false);
  assert.equal(played.length, 1);
});

test('haptics: reset forgets the floors, so a restarted scan begins from silence', () => {
  const { played, trigger } = recorder();
  const haptics = createScanHaptics(() => true, trigger);
  haptics.play('start', 0);
  assert.equal(haptics.play('start', 1), false);
  haptics.reset();
  assert.equal(haptics.play('start', 2), true);
  assert.equal(played.length, 2);
});

test('haptics: each player has its own memory', () => {
  const a = recorder();
  const b = recorder();
  createScanHaptics(() => true, a.trigger).play('complete', 0);
  assert.equal(createScanHaptics(() => true, b.trigger).play('complete', 0), true);
  assert.equal(a.played.length, 1);
  assert.equal(b.played.length, 1);
});

/* ---------------------------------- gate ---------------------------------- */

test('haptics: the device preference is a hard gate and does not touch the floor', () => {
  const { played, trigger } = recorder();
  let enabled = false;
  const haptics = createScanHaptics(() => enabled, trigger);

  assert.equal(haptics.play('start', 0), false);
  assert.equal(haptics.play('complete', 0), false);
  assert.equal(played.length, 0);

  enabled = true;
  assert.equal(haptics.play('start', 1), true, 'a swallowed play must not have set the floor');
  assert.deepEqual(played, ['start']);
});

test('haptics: a failing native call never reaches the caller', () => {
  const haptics = createScanHaptics(
    () => true,
    () => Promise.reject(new Error('no haptic engine')),
  );
  assert.doesNotThrow(() => haptics.play('start', 0));
});

/* ------------------------------- milestones ------------------------------- */

test('haptics: the milestones are a quarter, a half and three quarters of 24', () => {
  assert.deepEqual([...SCAN_MILESTONE_SECTORS], [6, 12, 18]);
  for (let n = 0; n <= 24; n += 1) {
    assert.equal(isScanMilestone(n), n === 6 || n === 12 || n === 18, `sector count ${n}`);
  }
  assert.equal(isScanMilestone(24), false, 'the full ring is `complete`, not a milestone');
});

/* -------------------------------- contract -------------------------------- */

const CHROME = 'src/components/hair-scan/';
const read = (file: string) => readFileSync(CHROME + file, 'utf8');

/**
 * A file with its prose taken out.
 *
 * These components explain themselves at length, and a rule about what
 * the scanner may *say* has to be applied to what it renders rather than
 * to a comment describing the rule itself.
 */
const codeOf = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** Every chrome file this lane owns. */
const OWNED = [
  'guidance.tsx',
  'instruction-sheet.tsx',
  'instruction-thumbs.tsx',
  'scan-ring.tsx',
  'start-button.tsx',
  'status-pill.tsx',
];

test('chrome: the index exports what the screen lane codes against', () => {
  const index = read('index.ts');
  for (const name of [
    'Guidance',
    'InstructionSheet',
    'PermissionView',
    'ScanRing',
    'emptyCoverage',
    'scanRingBoxFor',
    'scanRingMargin',
    'SCAN_SECTORS',
    'StartButton',
    'START_BUTTON_ACTIVATE_MS',
    'StatusPill',
    'statusPillLayout',
    'TopBar',
  ]) {
    assert.ok(index.includes(name), `index.ts does not export ${name}`);
  }
});

/* ------------------------------- heartbeat -------------------------------- */

type Span = { to: number; ms: number; shape: string };

/**
 * The beat, read out of the button's own source.
 *
 * The components import Reanimated and cannot be loaded here, so the
 * shape of the heartbeat is held to where it is written: one span per
 * line, in the order the beat runs.
 */
function heartbeat(): Span[] {
  const source = read('start-button.tsx');
  const body = /export const HEARTBEAT: readonly HeartbeatSpan\[\] = \[([\s\S]*?)\];/.exec(source);
  assert.ok(body, 'start-button.tsx no longer declares HEARTBEAT as a list of spans');
  const spans = [...body[1].matchAll(/\{\s*to:\s*([\d.]+),\s*ms:\s*(\d+),\s*shape:\s*'(\w+)'\s*\}/g)];
  return spans.map((m) => ({ to: Number(m[1]), ms: Number(m[2]), shape: m[3] }));
}

test('chrome: the Start rings beat twice and rest, the way a heart does', () => {
  const spans = heartbeat();
  assert.ok(spans.length >= 4, 'a heartbeat needs at least a kick, a fall, a second and a rest');

  const peaks = spans.filter((s) => s.to > 0);
  assert.equal(peaks.length, 2, 'lub-dub is two beats, not one and not three');
  assert.equal(peaks[0].to, 1, 'the first beat is the full swell');
  assert.ok(peaks[1].to < peaks[0].to, 'the second beat is the softer one');
  assert.ok(peaks[1].to > 0.25, 'a second beat nobody can see is not a second beat');
});

test('chrome: a short gap separates the two beats, and a rest of about a second follows', () => {
  const spans = heartbeat();
  const firstPeak = spans.findIndex((s) => s.to > 0);
  const secondPeak = spans.findIndex((s, i) => i > firstPeak && s.to > 0);

  const between = spans.slice(firstPeak + 1, secondPeak);
  const gap = between.filter((s) => s.shape === 'hold');
  assert.equal(gap.length, 1, 'exactly one held gap sits between the two beats');
  assert.ok(gap[0].ms > 0 && gap[0].ms < 200, `the gap is short, not a pause (${gap[0].ms}ms)`);

  const rest = spans[spans.length - 1];
  assert.equal(rest.shape, 'hold', 'the beat ends on a rest');
  assert.equal(rest.to, 0, 'the rings are at rest during the rest');
  assert.ok(rest.ms >= 900 && rest.ms <= 1200, `the rest is about a second (${rest.ms}ms)`);
  assert.ok(rest.ms > gap[0].ms * 3, 'the rest must not be mistakable for the gap');
});

test('chrome: one whole beat lands where a resting pulse does', () => {
  const total = heartbeat().reduce((sum, span) => sum + span.ms, 0);
  assert.ok(total >= 1400 && total <= 2200, `${total}ms is not a resting heart rate`);
});

test('chrome: the beat runs on the rings only, so the word on the disc stays readable', () => {
  const source = read('start-button.tsx');
  assert.ok(source.includes('const outerRing = useAnimatedStyle'), 'the outer ring is animated');
  assert.ok(source.includes('const innerRing = useAnimatedStyle'), 'the inner ring is animated');

  // The disc's own style reads the activation and nothing else: no beat.
  const disc = /const disc = useAnimatedStyle\(\(\) => \{([\s\S]*?)\}\);/.exec(source);
  assert.ok(disc, 'the disc no longer has a style of its own');
  assert.ok(!disc[1].includes('beat.get()'), 'the disc must not pulse under its own label');
});

test('chrome: the Start button holds no opinion of its own about readiness', () => {
  const source = read('start-button.tsx');
  const code = codeOf('start-button.tsx');
  assert.ok(source.includes('const armed = live && !pressed;'), 'arming is the screen’s to decide');
  assert.ok(
    source.includes('const live = ready || graced;'),
    'the only thing between the screen’s word and the disc is the grace',
  );

  // Its whole input, so no measurement can arrive without being declared.
  const props = /export type StartButtonProps = \{([\s\S]*?)\n\};/.exec(source);
  assert.ok(props, 'the button no longer declares its props');
  const names = [...props[1].matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
  assert.deepEqual(names.sort(), ['hint', 'label', 'onActivate', 'onPress', 'ready', 'style']);

  for (const threshold of ['lighting', 'stability', 'yaw', 'pitch', 'bounds', 'face']) {
    assert.ok(
      !code.includes(threshold),
      `the button measures ${threshold}: build 17 could not be pressed for exactly this reason`,
    );
  }
  assert.ok(
    !source.includes("from '@/features/hair-scan/engine'"),
    'the button must not read the engine to decide whether it may be pressed',
  );
});

test('chrome: a dropped detector frame cannot swallow a press', () => {
  const source = read('start-button.tsx');

  // The grace only ever keeps the button live: `ready` true takes effect
  // in the same render, `ready` false only after the timer.
  assert.ok(
    source.includes('if (ready) setGraced(true);'),
    'a ready frame must raise the floor in the render it arrives in, not a frame later',
  );
  const effect = /useEffect\(\(\) => \{\n\s*if \(ready \|\| !graced\) return;([\s\S]*?)\n  \}, \[ready, graced\]\);/.exec(
    source,
  );
  assert.ok(effect, 'the grace no longer comes down on a timer');
  assert.ok(
    effect[1].includes('setTimeout(() => setGraced(false), START_READY_GRACE_MS)'),
    'a not-ready frame may only disarm the disc through the grace timer',
  );
  assert.ok(effect[1].includes('clearTimeout(timer)'), 'a returning frame cancels the timer');

  const ms = /export const START_READY_GRACE_MS = (\d+);/.exec(source);
  assert.ok(ms, 'the grace has no declared length');
  const grace = Number(ms[1]);
  assert.ok(grace >= 500, `${grace}ms is shorter than a finger already on its way down`);
  assert.ok(grace <= 2000, `${grace}ms leaves a live target behind an abandoned scan`);

  // The disc's hit-testing follows the grace, never the raw prop: that
  // gap is the one place a normal-looking button could eat a tap.
  assert.ok(
    read('start-button.tsx').includes("pointerEvents={armed ? 'auto' : 'none'}"),
    'the disc no longer switches hit-testing on the armed state',
  );
});

test('chrome: the Start disc gives no press haptic, so start is one tap', () => {
  const source = read('start-button.tsx');
  assert.ok(source.includes('haptic="none"'), 'the disc must leave the start tap to the table');
  assert.ok(!source.includes('import * as Haptics'), 'the button must not play its own haptics');
});

/* ------------------------------- the cue line ------------------------------ */

test('chrome: no part of the chrome can ask anyone to move closer or further away', () => {
  for (const file of OWNED) {
    const code = codeOf(file).toLowerCase();
    for (const phrase of ['move slightly', 'move closer', 'move back', 'step back', 'further away']) {
      assert.ok(!code.includes(phrase), `${file} still says "${phrase}"`);
    }
  }
});

test('chrome: the cue line is set to be read at arm’s length, mid-turn', () => {
  const source = read('guidance.tsx');
  assert.ok(source.includes('variant="title3"'), 'a 17pt caption cannot be read from arm’s length');
  assert.ok(/maxWidth: 3[2-9]\d/.test(source), 'the plate is wide enough to hold two lines');
});

test('chrome: a change of beat raises the line; a change of cue only fades it', () => {
  const source = read('guidance.tsx');
  assert.ok(source.includes('stage?: GuidanceStage'), 'the plate can be told which beat it is on');
  assert.ok(source.includes('FadeInDown'), 'a new beat rises into place');
  assert.ok(source.includes('FadeIn.duration'), 'a cue inside one beat still cross-fades');
  assert.ok(source.includes('useReducedMotion'), 'both transitions stop under Reduce Motion');

  // One exit, chosen once: an exit picked for "this is news" would run a
  // change late, because a leaving view exits with the props it last had.
  assert.ok(
    source.includes('const exiting = FadeOut.duration(motion.duration.fast);'),
    'every departure is the same quiet fade; the arrival carries the news',
  );
  assert.ok(!source.includes('FadeOutUp'), 'a beat-aware exit always runs one change late');

  // The key carries the beat, so a stage change remounts the line.
  assert.ok(source.includes('key={`${beat ?? '), 'the line is keyed on its beat as well as its text');
});

test('chrome: the plate finds the beat in the line, so it needs no new prop to work', () => {
  const source = read('guidance.tsx');
  assert.ok(
    source.includes('const beat = stage ?? beatOfLine(line) ?? shown.stage;'),
    'the screen’s stage wins, the line answers when there is none, and an aside changes nothing',
  );

  // The two beats are read out of the scan copy, so a re-worded cue
  // cannot quietly stop being recognised.
  for (const line of ['HAIR_SCAN_COPY.cue.lowerHead', 'HAIR_SCAN_COPY.cue.turnAgain']) {
    assert.ok(source.includes(line), `the second beat does not recognise ${line}`);
  }
  assert.ok(source.includes('HAIR_SCAN_COPY.cue.turnLeftRight'), 'the first beat is unrecognised');
  assert.ok(
    source.includes('HAIR_SCAN_COPY.scanning.chin'),
    'the stalled-on-the-chin line is the second beat talking',
  );

  // Every crown line the copy has is classified: a new one must be added here.
  const crown = /const CROWN_LINES: readonly string\[\] = \[([\s\S]*?)\];/.exec(source);
  assert.ok(crown, 'the crown lines are no longer declared as a list');
  assert.equal(crown[1].match(/HAIR_SCAN_COPY/g)?.length, 4, 'four lines belong to the second beat');
  assert.ok(
    crown[1].includes('HAIR_SCAN_COPY.cue.almost'),
    'a head already lowered when the stage turns over gets "Nearly done" on the boundary tick, '
      + 'and without it here that person never sees the beat change',
  );
});

/* ------------------------------- the pill --------------------------------- */

test('chrome: the pill reads out the five states of the new scan', () => {
  const source = read('status-pill.tsx');
  for (const phase of ['searching', 'tracking', 'turning', 'headDown', 'almost']) {
    assert.ok(source.includes(`${phase}:`), `the pill has no ${phase} state`);
  }
  assert.ok(source.includes('scanPhaseTone'), 'the screen needs the tone for a phase');
  assert.ok(source.includes('scanPhaseFor'), 'the screen needs the phase for a state');
});

test('chrome: the two halves of the capture read out differently', () => {
  const source = read('status-pill.tsx');
  const body = /export function scanPhaseFor\([\s\S]*?\n\}/.exec(source);
  assert.ok(body, 'the mapping from engine state to readout is gone');
  assert.ok(
    body[0].includes("stage === 'crown' ? 'headDown' : 'turning'"),
    'capturing is one status but two readouts, and the stage is what tells them apart',
  );
  assert.ok(body[0].includes("if (status === 'ready') return 'tracking';"), 'ready is tracking');
  assert.ok(body[0].includes("return 'searching';"), 'everything before a head is the search');
});

test('chrome: only the search is neutral; once a head is followed the pill stays calm', () => {
  const source = read('status-pill.tsx');
  const table = /SCAN_PHASE_TONE: Record<ScanPhase, StatusTone> = \{([\s\S]*?)\};/.exec(source);
  assert.ok(table, 'the tone table is no longer declared');
  const tones = Object.fromEntries(
    [...table[1].matchAll(/(\w+):\s*'(\w+)'/g)].map((m) => [m[1], m[2]]),
  );
  assert.deepEqual(tones, {
    searching: 'neutral',
    tracking: 'good',
    turning: 'good',
    headDown: 'good',
    almost: 'good',
  });
});

test('chrome: the two halves of the capture wear different glyphs, since they share a word', () => {
  const source = read('status-pill.tsx');
  const table = /SCAN_PHASE_ICON: Record<ScanPhase, IconName> = \{([\s\S]*?)\};/.exec(source);
  assert.ok(table, 'the glyph table is no longer declared');
  const icons = Object.fromEntries(
    [...table[1].matchAll(/(\w+):\s*'(\w+)'/g)].map((m) => [m[1], m[2]]),
  );
  for (const phase of ['searching', 'tracking', 'turning', 'headDown', 'almost']) {
    assert.ok(icons[phase], `${phase} has no glyph`);
  }
  assert.notEqual(icons.turning, icons.headDown, 'the two capture beats must not look identical');
  assert.equal(new Set(Object.values(icons)).size, 5, 'five readouts, five glyphs');
  assert.ok(!Object.values(icons).includes('warning'), 'no warning sign on any state of the scan');
  assert.ok(source.includes('scanPhaseIcon'), 'the screen needs the glyph for a phase');
});

test('chrome: nothing in the pill is alarming', () => {
  const source = read('status-pill.tsx');
  assert.ok(!source.includes('darkColors.danger'), 'no red on a screen pointed at a person’s head');
  assert.ok(source.includes('useReducedMotion'), 'the confirmation stops under Reduce Motion');
});

/* -------------------------------- the dial -------------------------------- */

test('chrome: the dial holds the first beat while the second fills it', () => {
  const source = read('scan-ring.tsx');
  assert.ok(source.includes("export type ScanRingStage = 'sweep' | 'crown';"), 'the ring has beats');
  assert.ok(source.includes('export function sectorLevel('), 'one place decides how lit a sector is');
  assert.ok(
    /export function sectorLevel\([^)]*\): number \{\n\s*'worklet';/.test(source),
    'sectorLevel is read on the UI thread and must carry its own worklet directive',
  );
  assert.ok(!/sectorLevel\([^)]*=\s*[A-Z_]/.test(source), 'no worklet default may reach a constant');
  assert.ok(
    source.includes("held.set(coverage.get().map("),
    'the first beat is latched when the second begins',
  );
  assert.ok(
    source.includes("if (stage !== 'crown') {"),
    'a ring back on the first beat is a scan starting over, and clears the latch',
  );
  assert.ok(
    source.includes('sectorLevel(coverage.get()[index] ?? 0, held.get()[index] ?? 0, settle.get())'),
    'every sector reads the live value, the latch and the settle',
  );
});

test('chrome: the second beat is something the eye can see, not only a latch', () => {
  const source = read('scan-ring.tsx');

  // The latch cannot be the whole answer: the engine's sectors are
  // already monotonic, so on its own it changes no pixel.
  assert.ok(source.includes('const BANK_SCALE ='), 'the dial does not acknowledge the second beat');
  assert.ok(
    /if \(stage !== 'crown' \|\| from === 'crown' \|\| complete \|\| reduceMotion\) return;/.test(source),
    'the swell belongs to the change into the second beat, and stops under Reduce Motion',
  );
  // A ring mounted on the second beat is a still tile in the instruction
  // sheet, and must not twitch as the sheet opens.
  assert.ok(source.includes('const beatWas = useRef(stage);'), 'the swell fires on a mount');
  assert.ok(source.includes('const REST_CROWN ='), 'the resting dial does not firm up on the second beat');

  const rest = /const REST_ACTIVE = ([\d.]+);\nconst REST_CROWN = ([\d.]+);/.exec(source);
  assert.ok(rest, 'the resting steps are no longer declared together');
  assert.ok(Number(rest[2]) > Number(rest[1]), 'the second beat reads as further along, not back');
});

/* -------------------------------- the sheet ------------------------------- */

test('chrome: every component takes its words from the scan copy and reads reduced motion', () => {
  for (const file of ['instruction-sheet.tsx', 'permission-view.tsx', 'top-bar.tsx', 'guidance.tsx']) {
    assert.ok(read(file).includes("from '@/features/hair-scan/copy'"), `${file} hardcodes copy`);
  }
  for (const file of [
    'guidance.tsx',
    'instruction-sheet.tsx',
    'scan-ring.tsx',
    'start-button.tsx',
    'status-pill.tsx',
    'top-bar.tsx',
  ]) {
    assert.ok(read(file).includes('useReducedMotion'), `${file} ignores Reduce Motion`);
  }
});

test('chrome: the instruction sheet shows the scanner beside each of its three steps', () => {
  const sheet = read('instruction-sheet.tsx');
  const thumbs = read('instruction-thumbs.tsx');

  // Three rows, numbered, each with a thumbnail of the state it describes.
  assert.ok(sheet.includes("from './instruction-thumbs'"), 'the sheet draws no tiles of its own');
  assert.ok(sheet.includes('<InstructionThumb'), 'each row carries its step thumbnail');
  assert.ok(sheet.includes('readonly InstructionStep[] = [0, 1, 2]'), 'three steps, in order');
  assert.ok(sheet.includes('{step + 1}'), 'rows are numbered from one');
  assert.ok(sheet.includes('name="close"'), 'the X is there');
  assert.ok(sheet.includes('variant="secondary"'), 'Continue is the full-width grey pill');
  assert.ok(sheet.includes('HAIR_SCAN_COPY.instructions'), 'the words come from the scan copy');

  // The tiles are the real scanner's parts, not pictures of a person.
  assert.ok(thumbs.includes("from './scan-ring'"), 'the ring tiles hold the real ScanRing');
  assert.ok(thumbs.includes('<ScanRing'), 'the ring is rendered, not redrawn');
  assert.ok(thumbs.includes('scanRingMargin(RING_TICK)'), 'the window oval tracks the ring');
  assert.ok(!/source=\{require\(/.test(thumbs), 'no photograph is bundled in place of a drawing');
  assert.ok(!/withTiming|withSpring|withRepeat|useAnimatedStyle/.test(thumbs), 'the tiles are still');

  // Real frames, and later real footage, can be dropped in without touching the sheet.
  assert.ok(thumbs.includes('image?: ImageSource | number'), 'the tile takes a real image');
  assert.ok(thumbs.includes("from 'expo-image'"), 'a real image renders through expo-image');
  assert.ok(thumbs.includes('video?: number'), 'the tile keeps the slot for real footage');
  assert.ok(sheet.includes('thumbnails?: InstructionThumbnails'), 'the sheet takes the three stills');
  assert.ok(sheet.includes('footage?: InstructionFootage'), 'the sheet takes the three loops');
  assert.ok(sheet.includes('image={thumbnails?.[step]}'), 'each row passes its own still');
  assert.ok(sheet.includes('video={footage?.[step]}'), 'each row passes its own loop');

  // The tiles are decorative: the row's label carries the words.
  assert.ok(thumbs.includes('accessibilityElementsHidden'), 'a tile must not be read aloud');
  assert.ok(sheet.includes('accessibilityLabel={`${step + 1}. ${title}. ${body}`}'));
});

test('chrome: the tiles show the two beats the scan now has', () => {
  const thumbs = read('instruction-thumbs.tsx');

  // Step two: a head with an arc swung through it, and Start still waiting.
  assert.ok(thumbs.includes('function TurnArc('), 'the turning tile draws an arc through the head');
  assert.ok(thumbs.includes('<TurnArc'), 'the arc is rendered');
  assert.ok(thumbs.includes('<RingThumb lit={false} pose="straight" />'), 'step two is the first beat');

  // Step three: the head tipped down, the ring lit, the crown marked.
  assert.ok(thumbs.includes('<RingThumb lit pose="down" />'), 'step three is the head tipped down');
  assert.ok(thumbs.includes("type HeadPose = 'straight' | 'down';"), 'a tile knows the two poses');
  assert.ok(thumbs.includes("pose === 'down' ? ("), 'the tipped head carries its crown mark');
});

test('chrome: nothing disables a lint rule', () => {
  for (const file of [...OWNED, 'index.ts', 'permission-view.tsx', 'top-bar.tsx']) {
    assert.ok(!read(file).includes('eslint-disable'), `${file} disables lint`);
  }
});
