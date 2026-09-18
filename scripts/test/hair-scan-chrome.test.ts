/**
 * The scanner's chrome, checked without a phone.
 *
 * The scan is now four steps in one continuous movement — look straight,
 * turn right, turn left, look down — and the chrome that guides it is
 * built the way a KYC check builds it: a thin bar and a big title at the
 * top, corner brackets around the head, one large arrow for each turn,
 * and a list at the end of what was actually captured.
 *
 * Three kinds of check live here. The haptic table runs as logic and is
 * imported and exercised. So is the chrome's arithmetic: every number
 * the bar, the arrow and the checklist draw themselves with lives in
 * `steps/geometry.ts`, a plain module with no JSX in it, so this file
 * imports those functions and calls them with real numbers — what the
 * arrow looks like at a given urgency is measured here rather than
 * described. The components themselves import Reanimated and SVG and
 * can only be watched on a device; what can be held to is the contract
 * they expose and the decisions written into them, read from their
 * source. Those source checks are deliberately about *rules* — that no
 * component writes its own words, that nothing asks anybody to move
 * closer, that every animation stops under Reduce Motion — rather than
 * about pixels, which only a device can judge.
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

import {
  CHECKLIST_STAGGER_MS,
  CHEVRON_COUNT,
  CHEVRON_HEIGHT,
  CHEVRON_WIDTH,
  DRIFT,
  FLOOR_CALM,
  FLOOR_URGENT,
  INSIST_SCALE,
  SWEEP_CALM_MS,
  SWEEP_GEARS,
  SWEEP_URGENT_MS,
  chevronFloor,
  chevronLit,
  chevronOpacity,
  driftFor,
  gearDuration,
  rotationFor,
  rowDelay,
  segmentFill,
  sweepDuration,
  sweepGear,
  unit,
} from '@/components/hair-scan/steps/geometry';

/** Every event the table declares, so an added one is covered by default. */
const EVENTS = Object.keys(SCAN_HAPTIC_STYLE) as ScanHapticEvent[];

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
  assert.ok(EVENTS.length > 0, 'the table declares no events at all');
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

test('haptics: frame ticks are the closest-spaced event, and still not a rattle', () => {
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

test('haptics: a fast turn that lands three frames in one beat is one tick', () => {
  const { played, trigger } = recorder();
  const haptics = createScanHaptics(() => true, trigger);
  haptics.play('sectorCaptured', 0);
  haptics.play('sectorCaptured', 16);
  haptics.play('sectorCaptured', 33);
  assert.equal(played.length, 1);
});

test('haptics: floors are per event, so a milestone lands between frame ticks', () => {
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

test('haptics: the milestones rise, never repeat, and agree with the test for one', () => {
  const milestones = [...SCAN_MILESTONE_SECTORS];
  assert.ok(milestones.length > 0, 'a scan with no milestone has nothing to mark');
  assert.deepEqual(milestones, [...new Set(milestones)].sort((a, b) => a - b));
  for (const n of milestones) assert.ok(n > 0, 'nothing captured is not a milestone');
  for (let n = 0; n <= 30; n += 1) {
    assert.equal(isScanMilestone(n), milestones.includes(n), `count ${n}`);
  }
});

/* ----------------------------- the arithmetic ----------------------------- */

/*
 * Every number the chrome draws itself with, called with real numbers.
 *
 * The components themselves cannot be imported here — Node strips types
 * but not JSX — so for a while these checks read the components' source
 * as text and asserted that a line of code was present. That is a test
 * of the spelling, not of the behaviour: it passes on a component that
 * never renders and it fails on a harmless rename. The arithmetic now
 * lives in `steps/geometry.ts`, which is plain TypeScript, so what the
 * arrow actually looks like at a given urgency is a thing this file can
 * measure rather than describe.
 */

test('chrome: a finished segment is full, a later one empty, the current one part-way', () => {
  assert.equal(segmentFill(1, 0.5, 0), 1, 'a step already walked reads as full');
  assert.equal(segmentFill(1, 0.5, 2), 0, 'a step not yet reached reads as empty');
  assert.equal(segmentFill(1, 0.5, 1), 0.5, 'the current segment carries the step’s own progress');
  assert.equal(segmentFill(0, -3, 0), 0, 'progress below zero cannot empty a bar past empty');
  assert.equal(segmentFill(0, 4, 0), 1, 'progress above one cannot overfill a segment');
});

test('chrome: the bar only ever moves forward across the four steps', () => {
  const total = (index: number, progress: number) =>
    [0, 1, 2, 3].reduce((sum, segment) => sum + segmentFill(index, progress, segment), 0);
  let last = -1;
  for (const index of [0, 1, 2, 3]) {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const now = total(index, progress);
      assert.ok(now >= last, `the bar went backwards at step ${index}, ${progress}`);
      last = now;
    }
  }
  assert.equal(total(3, 1), 4, 'the last step finished fills every segment');
});

test('chrome: the run lights each chevron in turn, and only its own', () => {
  const floor = FLOOR_CALM;
  const span = 1 / (CHEVRON_COUNT + 1);
  for (let index = 0; index < CHEVRON_COUNT; index += 1) {
    const peak = (index + 1) * span;
    assert.equal(chevronOpacity(peak, index, CHEVRON_COUNT, floor), 1, `chevron ${index} never lights`);
    for (let other = 0; other < CHEVRON_COUNT; other += 1) {
      if (other === index) continue;
      assert.ok(
        chevronOpacity(peak, other, CHEVRON_COUNT, floor) < 1,
        'two chevrons lit at once is a flash, not a run',
      );
    }
  }
});

test('chrome: between runs every chevron sits at the floor, and the floor is the only resting value', () => {
  for (let index = 0; index < CHEVRON_COUNT; index += 1) {
    assert.equal(
      chevronOpacity(0, index, CHEVRON_COUNT, FLOOR_CALM),
      FLOOR_CALM,
      'a phase of zero is between runs: nothing is lit',
    );
  }
  assert.ok(FLOOR_CALM > 0, 'an invisible chevron is not an arrow');
  assert.ok(FLOOR_CALM < 1, 'a chevron that rests at full strength has nothing to light up from');
});

test('chrome: a still arrow is drawn whole, not left at its resting floor', () => {
  // This is the Reduce Motion path. With no run coming back, the floor
  // is not a rest between passes of a light — it is a fifth of the
  // contrast, on the one element that has to read from two feet away.
  for (let index = 0; index < CHEVRON_COUNT; index += 1) {
    assert.equal(
      chevronLit(true, 0, index, CHEVRON_COUNT, FLOOR_CALM),
      1,
      `chevron ${index} is dimmed under Reduce Motion`,
    );
    assert.equal(
      chevronLit(true, 0, index, CHEVRON_COUNT, FLOOR_URGENT),
      1,
      'a still arrow is full strength at every insistence',
    );
  }
  // And with the run going it is the run that decides.
  assert.equal(
    chevronLit(false, 0.25, 0, CHEVRON_COUNT, FLOOR_CALM),
    chevronOpacity(0.25, 0, CHEVRON_COUNT, FLOOR_CALM),
  );
});

test('chrome: insistence raises the floor and shortens the run, and both clamp', () => {
  assert.equal(chevronFloor(0), FLOOR_CALM);
  assert.equal(chevronFloor(1), FLOOR_URGENT);
  assert.ok(chevronFloor(0.5) > chevronFloor(0) && chevronFloor(0.5) < chevronFloor(1));
  assert.equal(chevronFloor(-2), FLOOR_CALM, 'urgency below zero is calm');
  assert.equal(chevronFloor(9), FLOOR_URGENT, 'urgency above one is not more than urgent');

  assert.equal(sweepDuration(0), SWEEP_CALM_MS);
  assert.equal(sweepDuration(1), SWEEP_URGENT_MS);
  assert.ok(sweepDuration(0.5) < SWEEP_CALM_MS && sweepDuration(0.5) > SWEEP_URGENT_MS);
  assert.equal(sweepDuration(-1), SWEEP_CALM_MS);
  assert.equal(sweepDuration(4), SWEEP_URGENT_MS);
  assert.ok(SWEEP_URGENT_MS > 300, 'a run this fast is a strobe rather than an arrow');
});

test('chrome: a tracker-rate urgency changes the run’s speed a handful of times, not every frame', () => {
  /*
   * The defect this test exists for: `urgency` is the step's own
   * progress, which moves on every tracker frame. A repeating animation
   * has to be cancelled and restarted to change its duration, so a run
   * whose duration was read straight off that number would restart
   * thirty times a second and never travel far enough to light a single
   * chevron — the arrow would sit dark and still. Geared, the speed
   * changes at most twice in a whole step.
   */
  const frames: number[] = [];
  for (let i = 0; i <= 120; i += 1) frames.push(i / 120);

  const gears = frames.map(sweepGear);
  let changes = 0;
  for (let i = 1; i < gears.length; i += 1) if (gears[i] !== gears[i - 1]) changes += 1;

  assert.ok(frames.length > 50, 'a walk this short proves nothing about a per-frame restart');
  assert.ok(
    changes <= SWEEP_GEARS - 1,
    `the run restarted ${changes} times across one step; a restarted run never lights a chevron`,
  );
  for (const gear of gears) {
    assert.ok(Number.isInteger(gear), 'a gear is a whole number or it is not a gear');
    assert.ok(gear >= 0 && gear <= SWEEP_GEARS - 1, `gear ${gear} is outside the gearbox`);
  }
  assert.equal(gearDuration(0), SWEEP_CALM_MS, 'the calm gear runs at the calm speed');
  assert.equal(gearDuration(SWEEP_GEARS - 1), SWEEP_URGENT_MS, 'the top gear runs at the urgent speed');
  assert.ok(SWEEP_GEARS >= 2, 'one gear is not a gearbox');
});

test('chrome: one geometry, three directions, and no two alike', () => {
  assert.equal(rotationFor('right'), 0, 'the chevrons are drawn pointing right');
  assert.equal(rotationFor('left'), 180, 'left is the same arrow turned round');
  assert.equal(rotationFor('down'), 90, 'down is the same arrow turned a quarter');
  assert.equal(new Set([rotationFor('right'), rotationFor('left'), rotationFor('down')]).size, 3);
});

test('chrome: the drift leaves and returns to zero, so the loop has no seam', () => {
  assert.equal(driftFor(0, 1), 0, 'the run starts where the last one ended');
  assert.ok(Math.abs(driftFor(1, 1)) < 1e-9, 'a drift that ends off-centre snaps back every cycle');
  assert.ok(driftFor(0.5, 1) > 0, 'the arrow leans the way it points');
  assert.equal(driftFor(0.5, 1), DRIFT, 'the lean is the declared one at full insistence');
  assert.equal(driftFor(0.5, 0), 0, 'a calm arrow does not wander');
  assert.ok(driftFor(0.5, 0.5) < driftFor(0.5, 1), 'the lean grows with insistence');
  assert.equal(driftFor(0.5, 3), DRIFT, 'urgency above one is not more than urgent');
  assert.ok(DRIFT <= 12, 'a lean this far is a lunge');
});

test('chrome: the checklist rows arrive in order, one beat apart', () => {
  assert.equal(rowDelay(0), 0, 'the first row arrives with the list');
  assert.equal(rowDelay(1), CHECKLIST_STAGGER_MS);
  assert.equal(rowDelay(2), 2 * CHECKLIST_STAGGER_MS);
  for (let i = 1; i < 6; i += 1) assert.ok(rowDelay(i) > rowDelay(i - 1), 'the rows must not overlap');
  assert.ok(CHECKLIST_STAGGER_MS >= 60, `${CHECKLIST_STAGGER_MS}ms apart is a flash, not a sequence`);
  assert.ok(
    CHECKLIST_STAGGER_MS <= 250,
    `${CHECKLIST_STAGGER_MS}ms apart keeps somebody waiting to read three lines`,
  );
  assert.ok(rowDelay(2) < 600, 'the whole list has to be up before anybody looks away');
});

test('chrome: everything clamps, because the caller’s progress is a measurement', () => {
  assert.equal(unit(-0.4), 0);
  assert.equal(unit(0.4), 0.4);
  assert.equal(unit(1.4), 1);
});

/* -------------------------------- the files ------------------------------- */

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

/** The step chrome built for the four-step scan. */
const STEP_FILES = [
  'steps/step-header.tsx',
  'steps/turn-arrow.tsx',
  'steps/frame-brackets.tsx',
  'steps/capture-checklist.tsx',
];

/** Every chrome file this lane owns. */
const OWNED = [...STEP_FILES, 'guidance.tsx', 'instruction-sheet.tsx', 'status-pill.tsx'];

/* ------------------------------- the contract ----------------------------- */

test('chrome: the step index exports what the screen lane codes against', () => {
  const index = read('steps/index.ts');
  for (const name of [
    'StepHeader',
    'TurnArrow',
    'FrameBrackets',
    'CaptureChecklist',
    'CaptureChecklistItem',
    'TurnDirection',
    'BracketTone',
    'segmentFill',
  ]) {
    assert.ok(index.includes(name), `steps/index.ts does not export ${name}`);
  }
});

test('chrome: the scanner’s own barrel carries the step chrome, so a screen can reach it', () => {
  const barrel = read('index.ts');
  assert.ok(barrel.includes("from './steps'"), 'the step chrome is unreachable from the barrel');
  for (const name of ['StepHeader', 'TurnArrow', 'FrameBrackets', 'CaptureChecklist']) {
    assert.ok(barrel.includes(name), `the scanner barrel does not re-export ${name}`);
  }
});

test('chrome: the pill still exports the readout the screen lane codes against', () => {
  const source = read('status-pill.tsx');
  for (const name of ['scanPhaseFor', 'scanPhaseIcon', 'scanPhaseTone', 'statusPillLayout']) {
    assert.ok(source.includes(`export function ${name}`), `status-pill.tsx no longer exports ${name}`);
  }
});

test('chrome: the screen compiles against this lane — every call site agrees with the exports', () => {
  const screen = readFileSync('src/app/hair-scan.tsx', 'utf8');
  assert.ok(
    screen.includes('scanPhaseFor(view.status)'),
    'the readout takes one status; a screen passing a beat would not compile',
  );
  assert.ok(!/<Guidance[\s\S]{0,200}scanning=/.test(screen), 'the plate no longer takes a scanning flag');
  assert.ok(!/<Guidance[\s\S]{0,200}stage=/.test(screen), 'the plate no longer takes a beat');
  assert.ok(
    !screen.includes("'turning'") && !screen.includes("'headDown'"),
    'the pill has no per-step readout any more; the header says the step in words',
  );
  /*
    Updated when the screen was actually wired to this lane. The line
    this used to pin was the stop-gap this lane left in the screen while
    nothing rendered the step chrome: a running hint under the oval,
    standing in for a step instruction that had nowhere to go. The header
    now carries the instruction, so the plate is handed the corrective
    line and nothing else — which is what this file always said it was
    for, and is now literally true.
  */
  assert.ok(
    /<Guidance cue=\{cueLine\} \/>/.test(screen),
    'the plate is handed one finished corrective sentence, or null',
  );
  assert.ok(
    /<StepHeader[\s\S]{0,400}instruction=\{stepCopy\.instruction\}/.test(screen),
    'the step instruction is the header\u2019s, in type big enough to read mid-turn',
  );
  assert.ok(
    /<TurnArrow[\s\S]{0,300}urgency=\{view\.urgency\}/.test(screen),
    'the arrow takes its urgency from the step, not from a timer',
  );
  /*
    And the figure is what the step has LEFT, not what it has done.
    `stepProgress` rises as somebody succeeds, so feeding it straight
    through made the arrow dimmest, slowest and driftless at zero degrees
    of turn — the one moment it is the only thing telling anybody which
    way to move — and keenest in the instant before `settled` stopped it.
    The inversion is the whole behaviour of the piece; it is one
    character wide and nothing else in the tree would notice it going.
  */
  assert.ok(
    /urgency:\s*Math\.round\(\(1 - stepProgress\(state\)\) \* URGENCY_STEPS\) \/ URGENCY_STEPS/.test(
      screen,
    ),
    'the arrow insists on what is left of the step, and calms as the head comes round',
  );
  assert.ok(
    /<CaptureChecklist items=\{captured\}/.test(screen),
    'the completion beat lists what was captured',
  );
  assert.ok(!screen.includes('<ScanRing'), 'the two-beat dial is gone from the screen');
});

/* ----------------------------- the worklet rule --------------------------- */

test('chrome: every function the UI thread calls carries its own worklet directive', () => {
  const source = readFileSync(CHROME + 'steps/geometry.ts', 'utf8');
  const declared = [...source.matchAll(/export function (\w+)\(/g)].map((m) => m[1]);
  assert.ok(declared.length >= 10, 'the arithmetic module has lost its functions');
  for (const name of declared) {
    assert.ok(
      new RegExp(`function ${name}\\([\\s\\S]*?\\): \\w+ \\{\\n\\s*'worklet';`).test(source),
      `${name} is reachable from a worklet and must carry its own directive`,
    );
  }
  assert.ok(
    !/function \w+\([^)]*=\s*[A-Z_]/.test(source),
    'no worklet default may reach a module constant',
  );
});

/* ------------------------------- the header ------------------------------- */

test('chrome: the bar is one segment per step, and the current one fills', () => {
  const source = read('steps/step-header.tsx');
  assert.ok(
    source.includes('Array.from({ length: Math.max(1, total) }'),
    'the bar draws a segment per step, however many there are',
  );
  assert.ok(source.includes('<Segment'), 'the segments are rendered');
  assert.ok(
    source.includes('scaleX: segmentFill(index, progress.get(), segment)'),
    'each segment reads the live progress on the UI thread',
  );
  assert.ok(
    source.includes("transformOrigin: 'left center'"),
    'a bar that fills from its middle is not a progress bar',
  );
  assert.ok(!/width: `\$\{/.test(source), 'an animated width lays out every frame; a scale does not');
});

test('chrome: the title is set to be caught mid-turn, and its change is news', () => {
  const source = read('steps/step-header.tsx');
  assert.ok(source.includes('variant="title1"'), 'a title read at arm’s length is not a caption');
  assert.ok(source.includes('key={title}'), 'a change of step remounts the title block');
  assert.ok(source.includes('FadeInDown'), 'the new title drops into place rather than cross-fading');
  assert.ok(
    source.includes('FadeOut.duration(motion.duration.fast)'),
    'every departure is the same quiet fade; the arrival carries the news',
  );
  assert.ok(source.includes('useReducedMotion'), 'the transition stops under Reduce Motion');
});

test('chrome: a step that changes is announced on both platforms, and only once on each', () => {
  const source = read('steps/step-header.tsx');
  assert.ok(
    source.includes('accessibilityLiveRegion="polite"'),
    'TalkBack hears the change from the live region',
  );
  assert.ok(
    source.includes('AccessibilityInfo.announceForAccessibility(spoken)'),
    'a live region is Android’s alone: VoiceOver is told outright or not at all',
  );
  assert.ok(
    source.includes("if (Platform.OS !== 'ios') return;"),
    'announcing on Android as well would have TalkBack say every step twice',
  );
  assert.ok(source.includes('accessibilityRole="header"'), 'the header is a header');
});

test('chrome: the header takes a number as readily as a shared value', () => {
  const source = read('steps/step-header.tsx');
  assert.ok(
    source.includes("if (typeof progress !== 'number') return;"),
    'a caller that re-renders per tick can pass a plain number',
  );
  assert.ok(
    source.includes("const filled = typeof progress === 'object' ? progress : held;"),
    'a caller with a shared value drives the bar without a re-render',
  );
});

test('chrome: with no counter handed over, the header draws none and invents none', () => {
  const source = read('steps/step-header.tsx');
  assert.ok(
    !/\$\{Math\.min\(index \+ 1, total\)\}/.test(source),
    'a counter the component assembles out of its props is a string the copy does not own',
  );
  assert.ok(source.includes('{counter ? ('), 'no counter, no counter line');
  assert.ok(
    source.includes('const spoken = counter ? `${counter}. ${title}. ${instruction}`'),
    'the spoken label is the caller’s lines joined, and nothing else',
  );
});

/* -------------------------------- the arrow ------------------------------- */

test('chrome: the arrow is three chevrons, big enough to read across a room', () => {
  assert.equal(CHEVRON_COUNT, 3, 'three chevrons read as one arrow');
  assert.ok(CHEVRON_WIDTH >= 32, 'this must read from two feet away');
  assert.ok(CHEVRON_HEIGHT >= 48, 'this must read from two feet away');
});

test('chrome: insistence makes the arrow keener, never louder', () => {
  assert.ok(SWEEP_URGENT_MS < SWEEP_CALM_MS, 'a stalled step runs the light faster');
  assert.ok(FLOOR_URGENT > FLOOR_CALM, 'a stalled step sits the chevrons brighter');
  assert.ok(INSIST_SCALE <= 0.15, 'insistence is a lean, not a lunge');
  const source = read('steps/turn-arrow.tsx');
  assert.ok(!source.includes('danger'), 'no red on a screen pointed at a person’s head');
  assert.ok(!/withRepeat\([\s\S]{0,120}opacity/.test(source), 'nothing here flashes');
});

test('chrome: the run stops on the spot, is never left running, and never starts still', () => {
  const source = read('steps/turn-arrow.tsx');
  assert.ok(source.includes('cancelAnimation(phase)'), 'the run has to be stoppable on the spot');
  assert.ok(
    source.includes('const still = reduceMotion || settled === true;'),
    'a reached target and Reduce Motion are the same thing to the run: it does not go',
  );
  assert.ok(
    source.includes('return () => cancelAnimation(phase);'),
    'an infinite repeat left behind drives a shared value belonging to a screen that has gone',
  );
  assert.ok(
    /\}, \[still, gear, phase\]\);/.test(source),
    'the run must depend on the gear, never on the raw per-frame urgency',
  );
  assert.ok(
    source.includes('interpolateColor(rest, [0, 1], [darkColors.textOnPhoto, darkColors.accent])'),
    'the settled arrow takes the accent, the same green the brackets take',
  );
  assert.ok(
    source.includes('reduceMotion ? 0 : driftFor(phase.get(), insist.get())'),
    'the drift stops under Reduce Motion',
  );
});

test('chrome: the arrow is decorative — the header says it in words', () => {
  const source = read('steps/turn-arrow.tsx');
  assert.ok(source.includes('accessibilityElementsHidden'), 'an arrow must not be read aloud');
  assert.ok(source.includes('pointerEvents="none"'), 'nothing in the guidance layer is touchable');
});

/* ------------------------------ the brackets ------------------------------ */

test('chrome: four corners frame the head, and each draws two sides', () => {
  const source = read('steps/frame-brackets.tsx');
  const corners = /const CORNERS = \[([\s\S]*?)\] as const;/.exec(source);
  assert.ok(corners, 'the corners are no longer declared as a list');
  assert.equal(corners[1].match(/'/g)?.length, 8, 'four corners, no more and no fewer');
  for (const side of ['borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth']) {
    assert.ok(source.includes(side), `a bracket with no ${side} is not a right angle`);
  }
  assert.ok(source.includes('BRACKET_RADIUS'), 'the corner curves with the video mask behind it');
});

test('chrome: the brackets take the accent when the step is reached, and say nothing else', () => {
  const source = read('steps/frame-brackets.tsx');
  assert.ok(
    source.includes("export type BracketTone = 'neutral' | 'reached';"),
    'the brackets have exactly two things to say',
  );
  assert.ok(
    source.includes('interpolateColor(lit.get(), [0, 1], [darkColors.textOnPhoto, darkColors.accent])'),
    'quiet white while the step is worked, the accent once it is reached',
  );
  assert.ok(!source.includes('danger'), 'no red on a screen pointed at a person’s head');
  assert.ok(source.includes('useReducedMotion'), 'the colour change stops animating under Reduce Motion');
  assert.ok(source.includes('accessibilityElementsHidden'), 'a frame must not be read aloud');
});

/* ------------------------------ the checklist ----------------------------- */

test('chrome: the captured list arrives in sequence rather than all at once', () => {
  const source = read('steps/capture-checklist.tsx');
  assert.ok(source.includes('FadeInDown.delay(rowDelay(index))'), 'the stagger is the entrance');
  assert.ok(source.includes('useReducedMotion'), 'the sequence stops under Reduce Motion');
});

test('chrome: a tick that lands after its row is acknowledged; one that was already there is not', () => {
  const source = read('steps/capture-checklist.tsx');
  assert.ok(
    source.includes('const landed = item.captured && !was.current;'),
    'a row that was already ticked when the list appeared has had its entrance',
  );
  assert.ok(
    source.includes("name={item.captured ? 'checkCircle' : 'circle'}"),
    'an untaken row is an empty circle, not a warning',
  );
  assert.ok(!source.includes('danger'), 'a region the scan did not get is not an error');
  assert.ok(source.includes('key={item.id}'), 'a row keyed on its label would remount when reworded');
});

test('chrome: a captured row and an uncaptured one do not sound identical', () => {
  const source = read('steps/capture-checklist.tsx');
  assert.ok(
    source.includes('accessibilityRole="checkbox"'),
    '`checked` is dropped on role "text": every row would be read out the same way',
  );
  assert.ok(
    source.includes('accessibilityState={{ checked: item.captured }}'),
    'the tick has to reach a screen reader as state, not as a picture',
  );
  assert.ok(
    !/accessibilityLabel=\{`/.test(source),
    'the row must not assemble a sentence; the trait supplies the word for ticked',
  );
});

/* ------------------------------- the cue line ----------------------------- */

test('chrome: the cue line is corrective only, and shows nothing when there is nothing to correct', () => {
  const source = read('guidance.tsx');
  assert.ok(
    source.includes('export type CorrectiveCue = ScanCue;'),
    'the plate’s idea of the corrections is the engine’s own list, not a copy of it',
  );
  // And that list is corrective throughout: nothing in it is an
  // instruction for a step, and nothing in it is about distance.
  const cues = /export type ScanCue =([\s\S]*?);\n/.exec(
    readFileSync('src/features/hair-scan/types.ts', 'utf8'),
  );
  assert.ok(cues, 'the engine no longer declares its cues');
  assert.deepEqual(
    [...cues[1].matchAll(/'(\w+)'/g)].map((m) => m[1]).sort(),
    ['brighter', 'faceCamera', 'holdStill', 'lost', 'tooFast'],
    'a cue that is an instruction belongs in the step header, not on this plate',
  );
  assert.ok(source.includes('{cue ? ('), 'no correction, no plate');
  assert.ok(source.includes('variant="title3"'), 'a 17pt caption cannot be read from arm’s length');
  assert.ok(/maxWidth: 3[2-9]\d/.test(source), 'the plate is wide enough to hold two lines');
  assert.ok(source.includes('useReducedMotion'), 'the transition stops under Reduce Motion');

  // The instruction moved to the header. A plate that also carried it
  // would be on screen throughout, which is how it stopped being read.
  const props = /export type GuidanceProps = \{([\s\S]*?)\n\};/.exec(source);
  assert.ok(props, 'the plate no longer declares its props');
  const names = [...props[1].matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
  assert.deepEqual(names.sort(), ['cue', 'style']);
});

/* --------------------------------- the pill ------------------------------- */

test('chrome: the pill reads out the machine, and the header reads out the step', () => {
  const source = read('status-pill.tsx');
  const phases = /export type ScanPhase =([\s\S]*?);/.exec(source);
  assert.ok(phases, 'the readouts are no longer declared');
  assert.deepEqual(
    [...phases[1].matchAll(/'(\w+)'/g)].map((m) => m[1]),
    ['searching', 'tracking', 'capturing', 'almost'],
    'four readouts: looking for you, following you, scanning, nearly done',
  );

  const body = /export function scanPhaseFor\([\s\S]*?\n\}/.exec(source);
  assert.ok(body, 'the mapping from engine state to readout is gone');
  assert.ok(body[0].includes("if (status === 'capturing') return 'capturing';"), 'capturing is one readout');
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
    capturing: 'good',
    almost: 'good',
  });
});

test('chrome: while frames are being taken the pill wears the step’s own glyph', () => {
  const source = read('status-pill.tsx');
  const table = /SCAN_STEP_ICON: Record<ScanStep, IconName> = \{([\s\S]*?)\};/.exec(source);
  assert.ok(table, 'the step glyphs are no longer declared');
  const icons = Object.fromEntries(
    [...table[1].matchAll(/(\w+):\s*'(\w+)'/g)].map((m) => [m[1], m[2]]),
  );
  assert.deepEqual(Object.keys(icons), ['front', 'right', 'left', 'down'], 'four steps, four glyphs');
  assert.equal(new Set(Object.values(icons)).size, 4, 'two steps wearing one glyph tell nothing apart');
  assert.notEqual(icons.right, icons.left, 'the two turns must not look identical');
  assert.ok(
    source.includes("if (phase === 'capturing' && step) return SCAN_STEP_ICON[step];"),
    'the step’s glyph wins while frames are being taken',
  );
  assert.ok(
    source.includes('step: ScanStep | null = null'),
    'a screen with no step in hand still gets a glyph, rather than failing to compile',
  );
  assert.ok(!Object.values(icons).includes('warning'), 'no warning sign on any state of the scan');
});

test('chrome: nothing in the pill is alarming', () => {
  const source = read('status-pill.tsx');
  assert.ok(!source.includes('darkColors.danger'), 'no red on a screen pointed at a person’s head');
  assert.ok(source.includes('useReducedMotion'), 'the confirmation stops under Reduce Motion');
});

/* -------------------------------- the sheet ------------------------------- */

test('chrome: the sheet shows exactly the steps the copy declares, numbered from one', () => {
  const sheet = read('instruction-sheet.tsx');
  assert.ok(sheet.includes("from '@/features/hair-scan/copy'"), 'the sheet hardcodes copy');
  assert.ok(sheet.includes('copy.steps.map('), 'the rows are the copy’s, however many it declares');
  assert.ok(sheet.includes('{index + 1}'), 'rows are numbered from one');
  assert.ok(
    sheet.includes('accessibilityLabel={`${index + 1}. ${title}. ${body}`}'),
    'a row reaches a screen reader as one sentence',
  );
  assert.ok(sheet.includes('name="close"'), 'the X is there');
  assert.ok(sheet.includes('variant="secondary"'), 'Continue is the full-width grey pill');
  assert.ok(sheet.includes('useReducedMotion'), 'the sheet’s rise stops under Reduce Motion');
});

test('chrome: a row the drawings do not cover still renders, numbered, in the same column', () => {
  const sheet = read('instruction-sheet.tsx');
  assert.ok(
    sheet.includes('function thumbFor(index: number): InstructionStep | null'),
    'a row the tiles do not cover must still render',
  );
  assert.ok(sheet.includes('{step === null ? null : ('), 'a row with no tile draws no tile');
  assert.ok(
    /width: INSTRUCTION_THUMB_WIDTH,\n\s*height: INSTRUCTION_THUMB_HEIGHT,/.test(sheet),
    'the tile’s box is reserved whether or not there is a tile: otherwise the number hangs off a zero-width box',
  );
  assert.ok(sheet.includes('image={thumbnails?.[step]}'), 'each row passes its own still');
  assert.ok(sheet.includes('video={footage?.[step]}'), 'each row passes its own loop');
});

/* ------------------------------- the Start -------------------------------- */

/*
 * The Start button belongs to the screen lane now, but it is the door
 * into this whole choreography and nothing else holds it to its contract,
 * so the checks that kept build 17's un-pressable button from coming back
 * stay here until that lane carries them.
 */

type Span = { to: number; ms: number; shape: string };

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

  const total = spans.reduce((sum, span) => sum + span.ms, 0);
  assert.ok(total >= 1400 && total <= 2200, `${total}ms is not a resting heart rate`);
});

test('chrome: the Start button holds no opinion of its own about readiness', () => {
  const source = read('start-button.tsx');
  const code = codeOf('start-button.tsx');
  assert.ok(source.includes('const armed = live && !pressed;'), 'arming is the screen’s to decide');

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
  assert.ok(
    source.includes('if (ready) setGraced(true);'),
    'a ready frame must raise the floor in the render it arrives in, not a frame later',
  );
  const ms = /export const START_READY_GRACE_MS = (\d+);/.exec(source);
  assert.ok(ms, 'the grace has no declared length');
  const grace = Number(ms[1]);
  assert.ok(grace >= 500, `${grace}ms is shorter than a finger already on its way down`);
  assert.ok(grace <= 2000, `${grace}ms leaves a live target behind an abandoned scan`);
  assert.ok(
    source.includes("pointerEvents={armed ? 'auto' : 'none'}"),
    'the disc no longer switches hit-testing on the armed state',
  );
});

/* -------------------------------- the rules ------------------------------- */

test('chrome: no part of the chrome can ask anyone to move closer or further away', () => {
  for (const file of [...OWNED, 'steps/geometry.ts']) {
    const code = codeOf(file).toLowerCase();
    for (const phrase of ['move slightly', 'move closer', 'move back', 'step back', 'further away']) {
      assert.ok(!code.includes(phrase), `${file} still says "${phrase}"`);
    }
  }
});

test('chrome: the step chrome writes no words of its own — every sentence is a prop', () => {
  for (const file of STEP_FILES) {
    const code = codeOf(file);
    assert.ok(
      !code.includes('HAIR_SCAN_COPY'),
      `${file} reaches for the copy; the screen hands it finished words`,
    );
    // A <Text> whose child is a literal rather than an expression.
    const literal = /<Text[^>]*>\s*[^<{\s]/.exec(code);
    assert.ok(!literal, `${file} sets a sentence of its own: ${literal?.[0] ?? ''}`);
    // And no sentence assembled out of props behind a template literal
    // either: "2/4" is a string the copy does not own.
    assert.ok(
      !/<Text[^>]*>\s*\{`/.test(code),
      `${file} assembles a line of its own out of its props`,
    );
  }
  // The cue plate is handed a finished sentence too.
  assert.ok(
    !codeOf('guidance.tsx').includes('HAIR_SCAN_COPY'),
    'the cue plate is given a finished sentence by the screen',
  );
});

test('chrome: every animation in the step chrome stops under Reduce Motion', () => {
  for (const file of [...STEP_FILES, 'guidance.tsx', 'instruction-sheet.tsx', 'status-pill.tsx']) {
    assert.ok(read(file).includes('useReducedMotion'), `${file} ignores Reduce Motion`);
  }
});

test('chrome: the chrome uses colour tokens, and disables no lint rule', () => {
  for (const file of [...OWNED, 'steps/index.ts', 'steps/geometry.ts']) {
    const source = read(file);
    assert.ok(!source.includes('eslint-disable'), `${file} disables lint`);
    assert.ok(
      !/(?<![\w-])#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(codeOf(file)),
      `${file} writes a raw colour instead of a token`,
    );
  }
});
