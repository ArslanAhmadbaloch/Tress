/**
 * The onboarding script's last step: the baseline is one continuous
 * Hair Scan, and the words before the camera must describe that scan.
 *
 * The old five-photograph capture is gone, and so are the endings that
 * went with it — the walk read aloud for a screen reader, the single
 * front photograph for a build with no face detector. The scan announces
 * its own cues and reports its own missing detector, so the step has one
 * ending, `COPY.baseline.scan`, and it is swept for the old flow's
 * language and for the claims no copy in the app may make.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COPY } from '@/features/onboarding/script';

import { assertHonest } from './honesty-words';

const OLD_FLOW = /\bfive\b|5[- ]angles?|photo sets?|set of photos|one at a time|hold still for each/i;

test('onboarding: the baseline scan copy describes one continuous scan', () => {
  const copy = COPY.baseline.scan;
  const text = `${copy.title} ${copy.body} ${copy.cta}`;
  assert.match(copy.title, /scan/i, 'the title names the scan');
  assert.equal(copy.cta, 'Start the scan', 'the button says what the tap does');
  assert.ok(!OLD_FLOW.test(text), `the baseline still describes the per-angle capture: "${text}"`);
  assert.match(copy.body, /stays? on your phone/i, 'the body says where the images stay');
  assert.match(copy.body, /captures the important angles automatically/);
  assertHonest(assert, [copy.title, copy.body, copy.cta], 'baseline.scan');
});

test('onboarding: the baseline has one ending, and it cannot be skipped', () => {
  // The walk and the one-photograph fallback were words for mechanisms the
  // button no longer opens. Copy nothing reads is copy nobody sweeps, so
  // the step keeps exactly the one description the funnel screen shows.
  assert.deepEqual(Object.keys(COPY.baseline), ['scan']);
  assert.ok(!('skip' in COPY.baseline.scan), 'a baseline with a skip is not a baseline');
});

test('onboarding: the scan copy says what one turn does not reach', () => {
  // The turn reaches the front, both sides and the top, and the last thing
  // said before the camera opens must not be more generous than that.
  assert.match(COPY.baseline.scan.body, /cannot see the back/i);
});
