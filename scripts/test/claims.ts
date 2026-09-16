/**
 * Words that would mean a screen had stopped describing a record — a
 * photograph, a tick, a date — and started describing a head.
 *
 * Mirrors the private `HAIR_CLAIMS` const in `scripts/test/assessment.test.ts`
 * (its own copy is left alone this week: another sweep owns that file, and
 * the list is short enough that two copies are cheaper than a merge
 * conflict). `scripts/test/honesty-words.ts` holds a wider list that adds
 * flattery and advice; this one is exactly the assessment sweep's, so a
 * sentence that would fail there fails here too.
 *
 * Add a word before adding a sentence, not after.
 */

export const HAIR_CLAIMS = [
  'thicker',
  'thinner',
  'fuller',
  'regrow',
  'restore',
  'improved',
  'norwood',
  'diagnos',
  'severe',
  'advanced',
  'thinning',
  'density',
  'stage',
  'balding',
  'hair loss',
  'progress',
  'limited time',
  'last chance',
  'spots left',
];

export function assertNoHairClaims(
  assert: typeof import('node:assert/strict'),
  sentences: string[],
  context: string,
): void {
  const text = sentences.join(' ').toLowerCase();
  for (const claim of HAIR_CLAIMS) {
    assert.ok(!text.includes(claim), `${context} must not say "${claim}"`);
  }
}
