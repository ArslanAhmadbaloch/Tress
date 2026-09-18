/**
 * The hair scan talks the whole way through — an instructions sheet, a
 * permission screen, a cue every frame, processing stages, a report — and
 * none of it may describe a head. Every string, functions included, goes
 * through the same sweep the assessment does: the `HAIR_CLAIMS` list in
 * `assessment.test.ts` (read from that file's source, so the two cannot
 * drift apart) plus `density`, and nothing may exclaim.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { HAIR_SCAN_COPY, copySentences } from '@/features/hair-scan/copy';

import { HAIR_CLAIMS } from './claims';

/** The assessment sweep's own list, parsed out of its source. */
function assessmentClaims(): string[] {
  const source = readFileSync('scripts/test/assessment.test.ts', 'utf8');
  const block = /const HAIR_CLAIMS = \[([\s\S]*?)\];/.exec(source);
  assert.ok(block, 'assessment.test.ts no longer declares HAIR_CLAIMS');
  const words = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
  assert.ok(words.length > 10, `parsed only ${words.length} claims from assessment.test.ts`);
  return words;
}

const BANNED = [...new Set([...assessmentClaims(), ...HAIR_CLAIMS, 'density'])];
const sentences = copySentences();

test('hair scan copy: the whole vocabulary reaches the sweep, functions included', () => {
  assert.ok(sentences.length > 50, `only ${sentences.length} sentences reached the sweep`);
  assert.ok(sentences.every((s) => typeof s === 'string' && s.length > 0));
  assert.ok(sentences.includes(HAIR_SCAN_COPY.instructions.title), 'a fixed string');
  assert.ok(sentences.includes(HAIR_SCAN_COPY.complete.frames(1)), 'a counted line, singular');
  assert.ok(sentences.includes(HAIR_SCAN_COPY.complete.frames(12)), 'a counted line, plural');
  for (const stage of HAIR_SCAN_COPY.processing.stages) assert.ok(sentences.includes(stage));
  for (const step of HAIR_SCAN_COPY.instructions.steps) {
    assert.ok(sentences.includes(step.title) && sentences.includes(step.body));
  }
});

test('hair scan copy: nothing describes hair, forecasts, or diagnoses', () => {
  const text = sentences.join(' ').toLowerCase();
  for (const claim of BANNED) {
    assert.ok(!text.includes(claim), `the scan must not say "${claim}"`);
  }
  assert.ok(BANNED.includes('density') && BANNED.includes('progress') && BANNED.includes('stage'));
});

test('hair scan copy: nothing exclaims', () => {
  for (const sentence of sentences) {
    assert.ok(!sentence.includes('!'), `"${sentence}" exclaims`);
  }
});

test('hair scan copy: nothing hurries anybody or speaks as a person', () => {
  const text = sentences.join(' ');
  assert.ok(!/\b(hurry|act now|right now|don.t miss|last chance|limited time)\b/i.test(text));
  assert.ok(!/\b(AI|assistant|bot)\b|\bI (think|believe|can|cannot|would|am|will|know)\b|\bI'm\b/.test(text), text);
});

test('hair scan copy: the owner’s wording is used verbatim', () => {
  const c = HAIR_SCAN_COPY;
  assert.equal(c.instructions.title, 'Scan Instructions');
  // The owner's three steps after build 17, in his order: glasses and
  // light, press Start and turn left and right, then lower the head and
  // turn again. Nothing about where to stand.
  assert.deepEqual(
    c.instructions.steps.map((s) => `${s.title} — ${s.body}`),
    [
      'Take glasses off — And find a well-lit spot',
      'Press Start, then turn your head — Slowly to the left, then to the right',
      'Lower your head and turn again — That is how the top of your head is seen',
    ],
  );
  assert.equal(c.instructions.cta, 'Continue');
  assert.equal(c.permission.title, 'Camera access');
  assert.equal(
    c.permission.body,
    'Tress uses your camera to capture your hair and scalp during your scan.',
  );
  assert.deepEqual(c.cue, {
    centreFace: 'Center your face',
    perfect: 'Ready when you are',
    holdStill: 'Hold still',
    moveSlowly: 'Move your head slowly',
    slowDown: 'Slow down',
    backInFrame: 'Let’s get you back in frame',
    brighter: 'Find a brighter spot',
    keepGoing: 'Keep going',
    turnLeftRight: 'Turn your head slowly left and right',
    lowerHead: 'Lower your head',
    turnAgain: 'Turn slowly, as you did before',
    almost: 'Nearly done',
  });
  assert.deepEqual(c.processing.stages, [
    'Analysing your scan…',
    'Mapping your hairline…',
    'Reviewing captured angles…',
    'Comparing visible coverage…',
    'Building your hair report…',
  ]);
  assert.equal(c.complete.title, 'Scan complete');
  assert.equal(c.status.complete, 'Scan complete');
});

test('hair scan copy: nothing anywhere asks anybody to move closer or further away', () => {
  // The owner on build 17: "move slightly back is bad — it is a hard
  // stretch of the hand until it says hold still". The scan works at
  // whatever distance a phone is comfortably held, so it says nothing.
  const text = sentences.join(' ').toLowerCase();
  for (const phrase of [
    'move closer',
    'move slightly closer',
    'move back',
    'move slightly back',
    'step back',
    'further away',
    'arm’s length',
    'closer to the camera',
  ]) {
    assert.ok(!text.includes(phrase), `the scan must not say "${phrase}"`);
  }
  assert.ok(!('closer' in HAIR_SCAN_COPY.cue), 'the closer cue is gone');
  assert.ok(!('back' in HAIR_SCAN_COPY.cue), 'and so is the back cue');
});

test('hair scan copy: the cues walk through the owner’s choreography', () => {
  const c = HAIR_SCAN_COPY.cue;
  // Stage one, stage two, and the line before the end.
  assert.equal(c.turnLeftRight, 'Turn your head slowly left and right');
  assert.equal(c.lowerHead, 'Lower your head');
  assert.equal(c.turnAgain, 'Turn slowly, as you did before');
  assert.equal(c.almost, 'Nearly done');
  // Each is an instruction to a person, and none of them is a verdict.
  for (const line of [c.turnLeftRight, c.lowerHead, c.turnAgain]) {
    assert.ok(!/your hair|scalp|density|thinning/i.test(line), line);
  }
  // The four regions the report is built from are named plainly.
  assert.deepEqual(HAIR_SCAN_COPY.target, {
    hairline: 'Front hairline',
    leftTemple: 'Left temple',
    rightTemple: 'Right temple',
    crown: 'Crown',
  });
  for (const label of Object.values(HAIR_SCAN_COPY.target)) {
    assert.ok(sentences.includes(label), `${label} reaches the sweep`);
  }
});

test('hair scan copy: a head that is followed but turned is asked to turn, not searched for', () => {
  // The owner walked build 17 holding the phone at his temple: the pill
  // read "Looking for your face" while the scanner was plainly following
  // his head. The searching line stays for the state it describes — no
  // reading at all — and a followed head that is turned away gets the
  // one instruction that moves the scan on.
  assert.equal(HAIR_SCAN_COPY.status.detecting, 'Looking for your face');
  assert.equal(HAIR_SCAN_COPY.facingAway, 'Face the camera');
  // It is an instruction to a person, not a verdict on what was seen.
  assert.ok(!/face (is|was|not)|can.t|cannot|lost/i.test(HAIR_SCAN_COPY.facingAway));
  assert.ok(sentences.includes(HAIR_SCAN_COPY.facingAway), 'it reaches the sweep');
});

test('hair scan copy: images are said to stay on the device only where that is true of the scan', () => {
  // Frames go through photo-storage, which writes private app storage and
  // never uploads; these lines describe that, and nothing else claims it.
  assert.ok(HAIR_SCAN_COPY.instructions.privacy.includes('stay on this device'));
  assert.ok(HAIR_SCAN_COPY.report.onDevice.includes('not uploaded'));
  const text = sentences.join(' ').toLowerCase();
  assert.ok(!text.includes('cloud') && !text.includes('server'), 'nothing names a remote');
});

test('hair scan copy: the two beats of the capture do not read as the same beat', () => {
  /*
    The engine has one status for the whole capture, so the pill said
    "Scanning" through both halves of the choreography: while the head
    turned left and right, and while it was lowered for the crown. A
    readout that cannot change is a readout that says nothing about where
    the person is in a scan they are being asked to follow.

    The words describe the head's position and nothing else. That is the
    only thing this pill is allowed to know.
  */
  const { turning, headDown, almost } = HAIR_SCAN_COPY.phase;
  assert.equal(turning, 'Turning');
  assert.equal(headDown, 'Head down');
  assert.notEqual(turning, headDown);
  for (const line of [turning, headDown, almost]) {
    assert.ok(sentences.includes(line), `${line} reaches the sweep`);
    assert.ok(line.length <= 16, `${line} has to fit a pill`);
  }
});
