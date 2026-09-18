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
  // The sheet, in the owner's order: glasses and light, press Start and
  // look straight then turn each way, then look down. Nothing about
  // where to stand, and no chin up anywhere.
  assert.deepEqual(
    c.instructions.steps.map((s) => `${s.title} — ${s.body}`),
    [
      'Take glasses off — And find a well-lit spot',
      'Press Start and look straight — Then turn your head right, then left',
      'Last, look down — That is how the top of your head is seen',
    ],
  );
  assert.equal(c.instructions.cta, 'Continue');
  assert.equal(c.permission.title, 'Camera access');
  assert.equal(
    c.permission.body,
    'Tress uses your camera to capture your hair and scalp during your scan.',
  );
  /*
    The five corrections and the three nudges, and only those. What to DO
    is the step's own instruction, held above for as long as the step
    runs; the nudges are the one thing the plate says about the
    choreography, and all they say is MORE of what the title already
    asked for, in the direction it asked for it.
  */
  assert.deepEqual(c.cue, {
    faceCamera: 'Center your face',
    holdStill: 'Hold still',
    tooFast: 'Slow down',
    lost: 'Let’s get you back in frame',
    brighter: 'Find a brighter spot',
    turnFurtherRight: 'Keep turning to your right',
    turnFurtherLeft: 'Keep turning to your left',
    turnFurtherDown: 'A little further down',
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

test('hair scan copy: the four steps are the owner’s words, in his order', () => {
  const step = HAIR_SCAN_COPY.step;
  assert.deepEqual(
    (['front', 'right', 'left', 'down'] as const).map((k) => `${step[k].title} / ${step[k].instruction}`),
    [
      'Look straight / Keep your face in the frame',
      'Look right / Slowly turn your head to the right',
      'Look left / Slowly turn your head to the left',
      'Look down / Slowly tilt your head downward',
    ],
  );
  // Each names the direction the HEAD moves, never a part of the head:
  // which side of a head a turn shows is the engine's business.
  for (const key of ['front', 'right', 'left', 'down'] as const) {
    const both = `${step[key].title} ${step[key].instruction}`;
    assert.ok(!/temple|crown|hairline|scalp|hair\b/i.test(both), both);
    assert.ok(!/your hair|density|thinning/i.test(both), both);
    assert.ok(step[key].title.length <= 16, `${step[key].title} has to be read at arm's length`);
    assert.ok(sentences.includes(step[key].title) && sentences.includes(step[key].instruction));
  }
  /*
    Nothing the scan ASKS anybody to do is a lifted chin or the back of
    the head: neither is something a person can do holding their own
    phone, and the choreography no longer contains either. (The ring
    region table still has a `Chin up` label — that names a direction a
    frame could be labelled with, not an instruction to anyone, which is
    why the sweep here is over what the scan says and not over every
    noun it knows.)
  */
  const instructions = [
    ...Object.values(step).flatMap((v) => [v.title, v.instruction]),
    ...Object.values(HAIR_SCAN_COPY.cue),
    ...HAIR_SCAN_COPY.instructions.steps.flatMap((v) => [v.title, v.body]),
    HAIR_SCAN_COPY.scanning.hint,
    HAIR_SCAN_COPY.ready.hint,
  ]
    .join(' ')
    .toLowerCase();
  for (const phrase of ['chin up', 'lift your chin', 'back of your head', 'raise your head']) {
    assert.ok(!instructions.includes(phrase), `the scan must not ask for "${phrase}"`);
  }
  // The bar across the top counts the steps and says nothing else.
  assert.equal(HAIR_SCAN_COPY.stepCounter(2, 4), 'Step 2 of 4');
  assert.ok(sentences.includes('Step 1 of 4'), 'the counter reaches the sweep');
  // What the Scan Complete screen lists, in the order it was captured.
  assert.deepEqual(HAIR_SCAN_COPY.checklist, {
    hairline: 'Hairline',
    temples: 'Temples',
    crown: 'Crown',
  });
  for (const label of Object.values(HAIR_SCAN_COPY.checklist)) {
    assert.ok(sentences.includes(label), `${label} reaches the sweep`);
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

test('hair scan copy: the shallow turn is asked for more, never told it fell short', () => {
  /*
    The failure this wording exists for: somebody turns a little less than
    the step hands over at, both turn steps run their whole timers, and
    twenty-two seconds later the scan has the hairline and nothing else,
    with nothing said. The owner's instruction was to ask for more turn
    rather than lower the bar and keep the poor frame — so these three
    lines ask, in the direction the step already named, and they are the
    whole of what the scan says about it.
  */
  const nudges = [
    HAIR_SCAN_COPY.cue.turnFurtherRight,
    HAIR_SCAN_COPY.cue.turnFurtherLeft,
    HAIR_SCAN_COPY.cue.turnFurtherDown,
  ];
  for (const line of nudges) {
    assert.ok(sentences.includes(line), `${line} reaches the sweep`);
    // Read peripherally, mid-turn, with the phone at the edge of the eye.
    assert.ok(line.length <= 28, `"${line}" is too long to catch mid-turn`);
    assert.ok(line.split(' ').length <= 5, `"${line}" is too many words to catch mid-turn`);
    // No number the code did not compute, and no number it did: the scan
    // cannot see how far a neck turns, so it never says how far.
    assert.ok(!/\d|°|percent|%|degree/i.test(line), `"${line}" counts something`);
    // Not a verdict, not a scold, not a failure.
    assert.ok(
      !/not far enough|too (little|shallow|short)|fail|try harder|wrong|again/i.test(line),
      `"${line}" tells somebody off`,
    );
    assert.ok(!line.includes('!'), `"${line}" exclaims`);
  }
  // Each names the way the HEAD goes, which is the step's own direction.
  assert.ok(/right/i.test(HAIR_SCAN_COPY.cue.turnFurtherRight));
  assert.ok(/left/i.test(HAIR_SCAN_COPY.cue.turnFurtherLeft));
  assert.ok(/down/i.test(HAIR_SCAN_COPY.cue.turnFurtherDown));
  // And the chin's is worded for a chin: nothing about turning sideways.
  assert.ok(!/turn|right|left/i.test(HAIR_SCAN_COPY.cue.turnFurtherDown));
  // Still nothing about where to stand, on the one line most tempted to.
  const text = nudges.join(' ').toLowerCase();
  for (const phrase of ['further away', 'move back', 'closer', 'step back']) {
    assert.ok(!text.includes(phrase), `the nudge must not say "${phrase}"`);
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

test('hair scan copy: the pill says one thing, and the step’s own title says the rest', () => {
  /*
    The pill used to carry the choreography: "Turning" while the head
    turned, "Head down" while it was lowered. The step's own title does
    that now — "Look right", in type big enough to read with the head
    turned away from the phone — and a pill repeating it underneath was
    two voices saying one thing. Both lines went out with their last
    reader, in the same pass that took the reader away; a line of copy
    nothing renders is a line nobody is checking.

    What is left is the one beat the title cannot say, because it is
    about the machine and not the head.
  */
  assert.deepEqual(HAIR_SCAN_COPY.phase, { almost: 'Almost there' });
  assert.ok(sentences.includes(HAIR_SCAN_COPY.phase.almost), 'and it reaches the sweep');
  assert.ok(HAIR_SCAN_COPY.phase.almost.length <= 16, 'it has to fit a pill');
  const text = sentences.join(' ');
  assert.ok(!text.includes('Head down'), 'the two-beat wording is gone, not hidden');
});
