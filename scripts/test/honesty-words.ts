/**
 * The words the product is not allowed to say, shared by every sweep.
 *
 * A sentence that fails here has stopped describing a record — a tick, a
 * photograph, a date — and started describing a head, cheering somebody
 * on, or telling them what to do. The lists are the tuning surface: add a
 * word before adding a sentence, not after.
 *
 * `assessment.test.ts` keeps its own private copy this week; unifying the
 * two is a follow-up, not a reason to widen or narrow either.
 */

/** Words that would mean the app had started describing a head rather than a record. */
export const HAIR_CLAIMS = [
  'thicker', 'thinner', 'fuller', 'regrow', 'restore', 'reverse', 'improve', 'improved',
  'norwood', 'diagnos', 'severe', 'advanced', 'thinning', 'density', 'stage', 'balding',
  'hair loss', 'progress', 'guarantee', 'will grow',
  'limited time', 'last chance', 'spots left',
];
export const FLATTERY = [
  'amazing', 'great job', 'well done', 'proud', 'awesome', 'crushing', 'keep it up',
  'you got this', 'nice work', 'good job', 'congrat', 'brilliant', 'fantastic', 'impressive', 'perfect',
];
export const ADVICE = [
  'you should', 'we recommend', 'start taking', 'stop taking', 'take more', 'take less',
  'expect to', 'likely to', 'should see', 'try taking', 'consider taking',
];
/** Copied from scripts/test/profile-report.test.ts (a local const there, not an export). */
export const URGENCY =
  /\b(too late|limited time|spots? left|last chance|hurry|act now|only today|don.t miss|expires?|right now)\b/i;
/** Applied to the raw (not lower-cased) sentence: a first-person mind, or the word AI. */
export const PERSONA = /\b(AI|assistant|bot)\b|\bI (think|believe|can|cannot|would|read|am|will|know)\b|\bI'm\b/;

export function assertHonest(assert: typeof import('node:assert/strict'), sentences: string[], context: string): void {
  const text = sentences.join(' ');
  const lower = text.toLowerCase();
  for (const w of [...HAIR_CLAIMS, ...FLATTERY, ...ADVICE]) {
    assert.ok(!lower.includes(w), `${context} must not say "${w}"`);
  }
  assert.ok(!URGENCY.test(text), `${context} hurries somebody: ${text}`);
  assert.ok(!PERSONA.test(text), `${context} speaks as a person: ${text}`);
  assert.ok(!text.includes('!'), `${context} must not exclaim`);
}
