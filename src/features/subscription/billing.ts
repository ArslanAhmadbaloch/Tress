/**
 * The boundary between this app and a payment processor.
 *
 * Behind it, on iOS, is RevenueCat and through it the App Store. On
 * Android there is nothing yet — no Play Console product exists — and
 * this file is deliberate about saying so rather than pretending: the
 * unconfigured provider below reports prices so the paywall can still be
 * read, and refuses to sell, which surfaces as an honest "not available
 * yet" instead of a button that fails when tapped.
 *
 * The interface is the point. `provider.tsx`, the paywall and every gate
 * in the app were written against `BillingProvider` months before a
 * RevenueCat key existed, and none of them changed when one arrived.
 * Adding Google Play later means writing one more provider, not touching
 * any screen.
 */

import type { SubscriptionStatus } from './entitlement';
import { PLANS, type PlanConfig, type PlanId } from './config';
import { createRevenueCatBilling } from './revenuecat';

/** Why a purchase or restore did not result in Premium. */
export type BillingFailure =
  | 'cancelled'
  | 'network'
  | 'storeUnavailable'
  | 'notConfigured'
  | 'noSubscription'
  | 'accountMismatch'
  | 'unknown';

export type PurchaseResult =
  | { ok: true; entitledUntil: string | null }
  | { ok: false; reason: BillingFailure };

/**
 * What the store currently says about somebody's access.
 *
 * Deliberately not an `Entitlement`: that type also carries *where* the
 * access came from, which is the app's business rather than the store's.
 */
export type EntitlementSnapshot = {
  isPremium: boolean;
  status: SubscriptionStatus;
  expiresAt: string | null;
};

export type BillingProvider = {
  /** Whether real purchases can be made at all in this build. */
  readonly isConfigured: boolean;
  /** Store-formatted product information, or the defaults if unavailable. */
  products(): Promise<Record<PlanId, PlanConfig>>;
  purchase(plan: PlanId): Promise<PurchaseResult>;
  restore(): Promise<PurchaseResult>;
  /**
   * The store's current answer, or null if it could not be asked.
   *
   * Null rather than "not entitled", because a device that is offline at
   * launch must not lock somebody out of what they have paid for.
   */
  entitlement?(): Promise<EntitlementSnapshot | null>;
};

/**
 * The provider used where no store is connected — Android today, and
 * Expo Go on any platform, where the native purchase module is absent.
 *
 * It reports the design-time prices, so the paywall can be built and
 * reviewed, and refuses to sell anything, because there is nothing
 * behind it to take a payment. `notConfigured` is surfaced to the user
 * as an honest "not available yet" rather than a failure they could fix
 * by trying again, and never as a success.
 */
const unconfiguredBilling: BillingProvider = {
  isConfigured: false,

  async products() {
    return PLANS;
  },

  async purchase() {
    return { ok: false, reason: 'notConfigured' };
  },

  async restore() {
    return { ok: false, reason: 'notConfigured' };
  },
};

/**
 * The provider the app runs against.
 *
 * There is deliberately no branch here that behaves differently in
 * development: a purchase path that only works on a developer's machine
 * is a purchase path nobody has tested. Debug and release builds get the
 * same provider, and the sandbox/production distinction is the store's
 * to make, based on which account is signed in.
 */
export function createBilling(): BillingProvider {
  return createRevenueCatBilling() ?? unconfiguredBilling;
}
