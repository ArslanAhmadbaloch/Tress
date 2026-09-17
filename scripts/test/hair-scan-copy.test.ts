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
  assert.deepEqual(
    c.instructions.steps.map((s) => `${s.title} — ${s.body}`),
    [
      'Take glasses off — And find a well-lit spot',
      'Keep your head straight — And press Start',
      'Turn slowly, all the way round — Tress captures the angles as the ring fills',
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
    closer: 'Move slightly closer',
    back: 'Move slightly back',
    perfect: 'Perfect',
    holdStill: 'Hold still',
    moveSlowly: 'Move your head slowly',
    slowDown: 'Slow down',
    backInFrame: 'Let’s get you back in frame',
    brighter: 'Find a brighter spot',
    keepGoing: 'Keep going',
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

test('hair scan copy: images are said to stay on the device only where that is true of the scan', () => {
  // Frames go through photo-storage, which writes private app storage and
  // never uploads; these lines describe that, and nothing else claims it.
  assert.ok(HAIR_SCAN_COPY.instructions.privacy.includes('stay on this device'));
  assert.ok(HAIR_SCAN_COPY.report.onDevice.includes('not uploaded'));
  const text = sentences.join(' ').toLowerCase();
  assert.ok(!text.includes('cloud') && !text.includes('server'), 'nothing names a remote');
});
