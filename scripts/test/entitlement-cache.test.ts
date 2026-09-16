/**
 * The cached entitlement, and what launch is allowed to do with it.
 *
 * Two properties are being pinned here, and they pull against each other.
 *
 * The privacy one: a launch must not reach RevenueCat for somebody who
 * has never bought anything, because configuring the SDK is what mints an
 * identifier for the install. In this module that reads as
 * `needsRefresh === false` for every snapshot that does not grant Premium
 * — including the absent one, which is what a fresh install has.
 *
 * The paid-for one: somebody who has bought must not lose their record
 * because a request failed. So an unexpired snapshot is trusted without
 * asking anyone, and a lapsed one keeps granting access for a bounded
 * while, rather than the app deciding on its own that the subscription is
 * over the moment a date passes.
 *
 * The provider itself is React and AsyncStorage; this is the decision it
 * makes, lifted out so it can be asked directly.
 */

// First, and on its own line: the module under test reaches
// entitlement.ts, which reads a global Metro defines and Node does not.
import './expo-globals';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GRACE_MS,
  judgeCache,
  parseCache,
  snapshotToStore,
  UNDATED_RECHECK_MS,
  type CachedEntitlement,
} from '@/features/subscription/entitlement-cache';
import type { Entitlement } from '@/features/subscription/entitlement';

/* ------------------------------ helpers -------------------------------- */

const NOW = Date.parse('2026-09-16T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetMs: number): string => new Date(NOW + offsetMs).toISOString();

const premium = (over: Partial<CachedEntitlement> = {}): CachedEntitlement => ({
  isPremium: true,
  source: 'subscription',
  status: 'active',
  expiresAt: iso(30 * DAY),
  checkedAt: iso(-DAY),
  ...over,
});

/* --------------------- nobody who has not bought ----------------------- */

test('a device with no snapshot grants nothing and asks nobody', () => {
  const verdict = judgeCache(null, NOW);
  assert.equal(verdict.entitlement.isPremium, false);
  assert.equal(verdict.needsRefresh, false);
});

test('an unreadable snapshot is the same as none', () => {
  assert.equal(parseCache(null), null);
  assert.equal(parseCache(''), null);
  assert.equal(parseCache('not json'), null);
  assert.equal(parseCache('[1,2,3]'), null);
  assert.equal(parseCache('{"isPremium":"yes"}'), null);
  assert.equal(judgeCache(parseCache('not json'), NOW).needsRefresh, false);
});

test('a snapshot that says "not premium" is not a reason to ask again', () => {
  const lapsed = premium({ isPremium: false, status: 'expired', checkedAt: iso(-400 * DAY) });
  const verdict = judgeCache(lapsed, NOW);
  assert.equal(verdict.entitlement.isPremium, false);
  assert.equal(verdict.entitlement.status, 'expired');
  // The way back for somebody who has paid is Restore, on the paywall,
  // which configures the SDK for a person who went looking for it.
  assert.equal(verdict.needsRefresh, false);
});

/* ------------------------ somebody who has paid ------------------------ */

test('an unexpired subscription is trusted without asking the store', () => {
  const verdict = judgeCache(premium(), NOW);
  assert.equal(verdict.entitlement.isPremium, true);
  assert.equal(verdict.needsRefresh, false);
});

test('a cancelled subscription keeps access until the date it was paid to', () => {
  const verdict = judgeCache(
    premium({ status: 'cancelledButActive', expiresAt: iso(2 * DAY) }),
    NOW,
  );
  assert.equal(verdict.entitlement.isPremium, true);
  assert.equal(verdict.entitlement.status, 'cancelledButActive');
  assert.equal(verdict.needsRefresh, false);
});

test('access survives the expiry for the grace window, and the store is asked', () => {
  const justPast = judgeCache(premium({ expiresAt: iso(-60 * 1000) }), NOW);
  assert.equal(justPast.entitlement.isPremium, true, 'renewal day is not a lockout');
  assert.equal(justPast.needsRefresh, true);

  const nearlyOut = judgeCache(premium({ expiresAt: iso(-GRACE_MS + 60 * 1000) }), NOW);
  assert.equal(nearlyOut.entitlement.isPremium, true);
  assert.equal(nearlyOut.needsRefresh, true);
});

test('past the grace window access ends, and the store is still asked', () => {
  const verdict = judgeCache(premium({ expiresAt: iso(-GRACE_MS - 60 * 1000) }), NOW);
  assert.equal(verdict.entitlement.isPremium, false);
  assert.equal(verdict.entitlement.status, 'expired');
  // Asked because a renewal we never heard about would come back here,
  // and because the answer ends the asking either way.
  assert.equal(verdict.needsRefresh, true);
});

test('the grace window is bounded — a lapse cannot be waited out offline', () => {
  const abandoned = judgeCache(premium({ expiresAt: iso(-365 * DAY) }), NOW);
  assert.equal(abandoned.entitlement.isPremium, false);
});

/* --------------------- a snapshot with no end date --------------------- */

test('premium with no usable date keeps access rather than inventing an end', () => {
  for (const expiresAt of [null, 'sometime', '']) {
    const verdict = judgeCache(premium({ expiresAt, checkedAt: iso(-60 * 1000) }), NOW);
    assert.equal(verdict.entitlement.isPremium, true, `expiresAt: ${String(expiresAt)}`);
    assert.equal(verdict.needsRefresh, false);
  }
});

test('an undated snapshot is re-asked once it is old, and when its age is unknown', () => {
  const old = judgeCache(
    premium({ expiresAt: null, checkedAt: iso(-UNDATED_RECHECK_MS - 60 * 1000) }),
    NOW,
  );
  assert.equal(old.entitlement.isPremium, true);
  assert.equal(old.needsRefresh, true);

  // Snapshots written before `checkedAt` existed carry no age at all.
  const ageless = judgeCache(premium({ expiresAt: null, checkedAt: null }), NOW);
  assert.equal(ageless.entitlement.isPremium, true);
  assert.equal(ageless.needsRefresh, true);
});

/* ------------------------- reading what is there ----------------------- */

test('a snapshot written by an older build still reads', () => {
  const legacy = JSON.stringify({
    isPremium: true,
    source: 'subscription',
    status: 'active',
    expiresAt: iso(10 * DAY),
  });
  const parsed = parseCache(legacy);
  assert.ok(parsed);
  assert.equal(parsed.checkedAt, null);
  assert.equal(judgeCache(parsed, NOW).entitlement.isPremium, true);
});

test('storage cannot hand back a tester entitlement', () => {
  const parsed = parseCache(
    JSON.stringify({ isPremium: true, source: 'tester', status: 'active', expiresAt: null }),
  );
  assert.ok(parsed);
  assert.equal(parsed.source, 'subscription');
});

test('a snapshot that contradicts itself is read for the grant it makes', () => {
  const granting = parseCache(JSON.stringify({ isPremium: true, status: 'none' }));
  assert.equal(granting?.status, 'active');
  assert.equal(granting?.expiresAt, null);

  const withholding = parseCache(JSON.stringify({ isPremium: false, status: 'active' }));
  assert.equal(withholding?.status, 'none');
  assert.equal(withholding?.source, 'none');
});

test('what gets written carries the moment the store answered', () => {
  const answer: Entitlement = {
    isPremium: true,
    source: 'subscription',
    status: 'active',
    expiresAt: iso(30 * DAY),
  };
  const snapshot = snapshotToStore(answer, NOW);
  assert.equal(snapshot.checkedAt, new Date(NOW).toISOString());

  // And it survives the round trip through storage as what it was.
  const returned = parseCache(JSON.stringify(snapshot));
  assert.deepEqual(returned, snapshot);
  assert.equal(judgeCache(returned, NOW).needsRefresh, false);
});

/* ---- the property the whole change rests on, stated as one sweep ------ */

test('no snapshot that withholds Premium ever asks the store', () => {
  const withholding: (CachedEntitlement | null)[] = [
    null,
    parseCache('rubbish'),
    premium({ isPremium: false, status: 'none', expiresAt: null, checkedAt: null }),
    premium({ isPremium: false, status: 'expired', expiresAt: iso(-90 * DAY) }),
    premium({ isPremium: false, status: 'none', checkedAt: iso(-900 * DAY) }),
  ];
  for (const snapshot of withholding) {
    const verdict = judgeCache(snapshot, NOW);
    assert.equal(verdict.entitlement.isPremium, false);
    assert.equal(verdict.needsRefresh, false, JSON.stringify(snapshot));
  }
});
