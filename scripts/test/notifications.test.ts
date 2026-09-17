/**
 * The reminders say what the app now asks for.
 *
 * The scan reminder is the one notification the report's reminders prompt
 * schedules, and it fires days after anyone last saw the app — so a body
 * that still asked for "a set of five angles" would be sending somebody
 * back to a capture that no longer exists. The module cannot be imported
 * here (it loads expo-notifications lazily and reads expo-constants at
 * module level), so the copy is held to at the source, the way the
 * report's own screen tests read theirs.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { assertHonest } from './honesty-words';

const SOURCE = readFileSync('src/lib/notifications.ts', 'utf8');

/** Every `title:` and `body:` string literal scheduled by the module. */
function scheduledCopy(): string[] {
  return [...SOURCE.matchAll(/\b(?:title|body):\s*'([^']*)'/g)].map((m) => m[1]);
}

test('notifications: the scan reminder asks for a scan, not the old set of five', () => {
  assert.match(SOURCE, /title: 'Scan day',\s*body: 'Time for your next hair scan\.'/);
  const copy = scheduledCopy();
  assert.ok(copy.length >= 4, 'both reminders carry a title and a body');
  for (const line of copy) {
    assert.ok(!/\bfive\b|\bset of\b|\bangles?\b|\bphoto day\b/i.test(line), `"${line}" describes the old capture`);
  }
  assertHonest(assert, copy, 'reminder copy');
});

test('notifications: the routine reminder still asserts nothing about the stack', () => {
  assert.match(SOURCE, /body: 'This is the time you asked to be reminded\.'/);
});
