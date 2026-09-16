/**
 * Whether what the store last said is still worth acting on.
 *
 * The app keeps one snapshot of the store's answer about somebody's
 * Premium access. Launch reads that snapshot instead of asking the store
 * again, because asking is what mints a RevenueCat identifier, and doing
 * it at launch does that to people who have never bought anything.
 *
 * The decision therefore lives here, where it is a function of two values
 * — the snapshot and the clock — and can be tested without a React tree
 * or a network. `judgeCache` answers two questions at once: what access to
 * grant right now, and whether the store is worth asking.
 *
 * ── The trade, case by case ────────────────────────────────────────────
 *
 *  - No snapshot, or a snapshot that says "not Premium": that is the end
 *    of it. Nothing is asked, so an install that has never bought
 *    anything does not reach the SDK at all. Somebody who bought on
 *    another device, or before a reinstall, gets their access back
 *    through the paywall's Restore, which is the path that exists for
 *    exactly that.
 *
 *  - Premium, and the expiry has not arrived: trusted as it stands. A
 *    renewal moves that date later and a cancellation does not move it at
 *    all, so there is nothing the store could say before the date arrives
 *    that would take access away.
 *
 *  - Premium, and the expiry has passed: access is held for GRACE_MS and
 *    the store is asked. A renewal that has already happened comes back
 *    as a later date. A subscription that really ended comes back as "not
 *    Premium" and is written over the snapshot, after which launches stop
 *    asking. The grace is there because the renewal usually did happen
 *    and we have simply not heard yet — locking a subscriber out of their
 *    own record on the morning their card was charged is the worse
 *    failure. It is finite because "we could not reach the store" must
 *    not quietly become a subscription nobody pays for.
 *
 *  - Premium with no usable expiry date: access stands, because there is
 *    no date here that has passed and inventing an end would be us
 *    deciding something the store never said. The store is asked again
 *    once the snapshot is older than UNDATED_RECHECK_MS, which replaces
 *    it with a dated answer.
 *
 * All of this reads the device clock, which the person on the device can
 * set. That is a property of any offline cache and not something this
 * function can see through; the store's answer is what corrects it.
 */

import {
  NO_ENTITLEMENT,
  type Entitlement,
  type EntitlementSource,
  type SubscriptionStatus,
} from './entitlement';

/**
 * How long a lapsed snapshot keeps granting access while the store has
 * not answered. Three days covers a renewal we have not heard about, a
 * weekend in airplane mode and a store outage, without being long enough
 * to be worth waiting out.
 */
export const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/** How long a Premium snapshot with no expiry date is trusted before the store is asked again. */
export const UNDATED_RECHECK_MS = 24 * 60 * 60 * 1000;

/**
 * The snapshot as it sits on disk.
 *
 * `checkedAt` is when the store answered. Snapshots written before this
 * field existed do not carry one, which reads the same as "we do not know
 * how old this is" and is handled as such.
 */
export type CachedEntitlement = Entitlement & { checkedAt?: string | null };

export type CacheVerdict = {
  /** The access to grant while the app runs on this answer. */
  entitlement: Entitlement;
  /** Whether the store should be asked. False for anyone who has not bought. */
  needsRefresh: boolean;
};

const STATUSES: SubscriptionStatus[] = ['none', 'active', 'cancelledButActive', 'expired'];

/** Milliseconds for an ISO date, or null when there is nothing usable there. */
function millisOf(date: string | null | undefined): number | null {
  if (typeof date !== 'string') return null;
  const parsed = Date.parse(date);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Reads a stored snapshot, or null if there is nothing readable.
 *
 * Every field is checked rather than trusted, because this is the one
 * value in the subscription path that comes from outside the running
 * program. `source: 'tester'` is deliberately not accepted: entitlement.ts
 * keeps the tester door out of production builds entirely, and a value
 * parsed from storage must not be able to open one.
 */
export function parseCache(raw: string | null): CachedEntitlement | null {
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const record = value as Record<string, unknown>;
  if (typeof record.isPremium !== 'boolean') return null;

  const stored = STATUSES.includes(record.status as SubscriptionStatus)
    ? (record.status as SubscriptionStatus)
    : null;
  /*
    A snapshot can disagree with itself — a grant whose standing says
    'none', a lapse whose standing says 'active'. The grant is the part
    that decides access, so the standing is brought into line with it
    rather than the whole snapshot being thrown away.
  */
  const status: SubscriptionStatus = record.isPremium
    ? stored === 'cancelledButActive'
      ? stored
      : 'active'
    : stored === 'expired'
      ? 'expired'
      : 'none';
  const source: EntitlementSource = record.isPremium ? 'subscription' : 'none';

  return {
    isPremium: record.isPremium,
    source,
    status,
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : null,
    checkedAt: typeof record.checkedAt === 'string' ? record.checkedAt : null,
  };
}

/** The snapshot as an `Entitlement`, without the bookkeeping field. */
function granted(cached: CachedEntitlement, isPremium: boolean): Entitlement {
  if (isPremium) {
    return {
      isPremium: true,
      source: cached.source,
      status: cached.status,
      expiresAt: cached.expiresAt,
    };
  }
  return {
    isPremium: false,
    source: 'none',
    // Dropped by the clock rather than never held: 'expired' is the
    // standing for a snapshot that did grant access, and for one that
    // never did, whatever it already said stands.
    status: cached.isPremium ? 'expired' : cached.status,
    expiresAt: cached.expiresAt,
  };
}

/** What to grant, and whether to ask the store. See the file comment for why. */
export function judgeCache(cached: CachedEntitlement | null, nowMs: number): CacheVerdict {
  if (!cached) return { entitlement: NO_ENTITLEMENT, needsRefresh: false };
  if (!cached.isPremium) return { entitlement: granted(cached, false), needsRefresh: false };

  const expiry = millisOf(cached.expiresAt);

  if (expiry === null) {
    const checked = millisOf(cached.checkedAt);
    const stale = checked === null || nowMs - checked >= UNDATED_RECHECK_MS;
    return { entitlement: granted(cached, true), needsRefresh: stale };
  }

  if (nowMs < expiry) return { entitlement: granted(cached, true), needsRefresh: false };
  if (nowMs < expiry + GRACE_MS) return { entitlement: granted(cached, true), needsRefresh: true };
  return { entitlement: granted(cached, false), needsRefresh: true };
}

/** The snapshot to write after the store, a purchase or a restore answers. */
export function snapshotToStore(entitlement: Entitlement, nowMs: number): CachedEntitlement {
  return { ...entitlement, checkedAt: new Date(nowMs).toISOString() };
}
