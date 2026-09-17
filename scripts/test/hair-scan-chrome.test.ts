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

test('chrome: the Start disc gives no press haptic, so start is one tap', () => {
  const source = read('start-button.tsx');
  assert.ok(source.includes('haptic="none"'), 'the disc must leave the start tap to the table');
  assert.ok(!source.includes("import * as Haptics"), 'the button must not play its own haptics');
});

test('chrome: every component takes its words from the scan copy and reads reduced motion', () => {
  for (const file of ['instruction-sheet.tsx', 'permission-view.tsx', 'top-bar.tsx', 'guidance.tsx']) {
    assert.ok(read(file).includes("from '@/features/hair-scan/copy'"), `${file} hardcodes copy`);
  }
  for (const file of ['scan-ring.tsx', 'start-button.tsx', 'status-pill.tsx', 'top-bar.tsx']) {
    assert.ok(read(file).includes('useReducedMotion'), `${file} ignores Reduce Motion`);
  }
});

test('chrome: nothing disables a lint rule', () => {
  for (const file of [
    'guidance.tsx',
    'index.ts',
    'instruction-sheet.tsx',
    'permission-view.tsx',
    'scan-ring.tsx',
    'start-button.tsx',
    'status-pill.tsx',
    'top-bar.tsx',
  ]) {
    assert.ok(!read(file).includes('eslint-disable'), `${file} disables lint`);
  }
});
