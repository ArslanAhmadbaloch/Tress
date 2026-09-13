/**
 * Who has Premium, and why.
 *
 * One question — "is this person entitled?" — answered in one place, so
 * that a screen needing to gate something asks rather than decides. The
 * alternative, an `isPremium` boolean threaded through a dozen files, is
 * how an app ends up with one screen that has quietly disagreed with the
 * rest since a refactor eight months ago.
 *
 * ── The tester door, and why it cannot be opened from outside ──────────
 * Testers need the whole Premium experience without paying. The obvious
 * implementations of that are all dangerous: a hidden gesture, a magic
 * code, a flag in storage. Every one of them ships to production and
 * waits to be found.
 *
 * So the door is not locked at runtime — it is not built into production
 * at all. `TESTER_BUILD` is resolved from `__DEV__` and a build-time
 * environment variable that only the internal EAS profile sets. In a
 * release build both are false, this module never reads the stored
 * override, and the control that sets it is never rendered. There is no
 * value a production user could write into storage, and no sequence they
 * could tap, that reaches `source: 'tester'`.
 */

import type { BillingFailure } from './billing';

/**
 * True only in development, or in a build made with the internal profile.
 *
 * `EXPO_PUBLIC_` variables are inlined into the bundle at build time, so
 * this is a constant by the time it ships — a release build compiles the
 * tester path out rather than guarding it.
 */
export const TESTER_BUILD: boolean =
  __DEV__ || process.env.EXPO_PUBLIC_HJ_TESTER_BUILD === '1';

/** Where a person's Premium access comes from. */
export type EntitlementSource = 'subscription' | 'tester' | 'none';

/**
 * The subscription's standing, separately from whether it currently grants
 * access. A cancelled subscription still entitles somebody until the paid
 * period ends, and saying so is the difference between a renewal notice
 * and an accusation.
 */
export type SubscriptionStatus =
  | 'none'
  | 'active'
  | 'cancelledButActive'
  | 'expired';

export type Entitlement = {
  isPremium: boolean;
  source: EntitlementSource;
  status: SubscriptionStatus;
  /** ISO date the current period ends, when the store tells us. */
  expiresAt: string | null;
};

export const NO_ENTITLEMENT: Entitlement = {
  isPremium: false,
  source: 'none',
  status: 'none',
  expiresAt: null,
};

export const TESTER_ENTITLEMENT: Entitlement = {
  isPremium: true,
  source: 'tester',
  status: 'active',
  expiresAt: null,
};

/** Everything Premium covers. Named so a gate reads as a sentence. */
export type PremiumFeature =
  | 'startJourney'
  | 'capturePhotos'
  | 'buildStack'
  | 'compare'
  | 'history'
  | 'adherence';

/**
 * What to tell somebody when a purchase or restore does not go through.
 *
 * Written for a person rather than a log: no error codes, no mention of
 * the billing vendor, and nothing that blames them for a failure of ours.
 */
export function failureMessage(
  reason: BillingFailure,
  action: 'purchase' | 'restore',
): { title: string; body: string } {
  switch (reason) {
    case 'cancelled':
      return { title: '', body: '' }; // Silent: they chose to stop.
    case 'network':
      return {
        title: 'Connection lost',
        body: 'Please check your internet connection and try again.',
      };
    case 'storeUnavailable':
      return {
        title: 'The store is not responding',
        body: 'This is usually temporary. Please try again in a moment.',
      };
    case 'notConfigured':
      return {
        title: 'Not available yet',
        body: 'Premium is not open for purchase in this version of the app.',
      };
    case 'noSubscription':
      return {
        title: 'Nothing to restore',
        body: "We couldn't find an active Premium subscription for this account.",
      };
    case 'accountMismatch':
      return {
        title: 'Signed in elsewhere',
        body: 'This subscription belongs to a different store account. Sign in with the account that bought it, then try again.',
      };
    default:
      return {
        title: action === 'restore' ? "Couldn't restore" : "Couldn't complete that",
        body: 'Something went wrong on our side. Please try again.',
      };
  }
}
