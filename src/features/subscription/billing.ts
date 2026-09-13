/**
 * The boundary between this app and a payment processor.
 *
 * Nothing here charges anybody, and nothing here pretends to. There is no
 * billing SDK in this project yet: no RevenueCat key, no App Store
 * products, no Play Console products. This file exists so that when those
 * arrive, one implementation of `BillingProvider` is written and the
 * interface, the paywall and the entitlement layer are all unchanged.
 *
 * ── Connecting RevenueCat ──────────────────────────────────────────────
 * Add `react-native-purchases`, then write a provider against this same
 * interface:
 *
 *   products()  → Purchases.getOfferings(), mapping each package's
 *                 `product.priceString` onto PlanConfig.formattedPrice so
 *                 the paywall shows the customer's own currency
 *   purchase()  → Purchases.purchasePackage(pkg)
 *   restore()   → Purchases.restorePurchases()
 *   entitlement() → Purchases.getCustomerInfo(), reading the "premium"
 *                 entitlement named in config.ts
 *
 * Swap it in at `createBilling()` at the bottom. Nothing else changes.
 */

import { PLANS, type PlanConfig, type PlanId } from './config';

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

export type BillingProvider = {
  /** Whether real purchases can be made at all in this build. */
  readonly isConfigured: boolean;
  /** Store-formatted product information, or the defaults if unavailable. */
  products(): Promise<Record<PlanId, PlanConfig>>;
  purchase(plan: PlanId): Promise<PurchaseResult>;
  restore(): Promise<PurchaseResult>;
};

/**
 * The provider used while no store is connected.
 *
 * It reports prices — the design-time ones, so the paywall can be built
 * and reviewed — and refuses to sell anything, because there is nothing
 * behind it to take a payment. `notConfigured` is surfaced to the user as
 * an honest "not available yet" rather than a failure they could fix by
 * trying again, and never as a success.
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
 * Replace the return value with the RevenueCat provider once products
 * exist in App Store Connect and the Play Console. Until then this is the
 * only implementation, in every build, debug and release alike — there is
 * deliberately no branch here that behaves differently in development,
 * because a purchase path that only works on a developer's machine is a
 * purchase path nobody has tested.
 */
export function createBilling(): BillingProvider {
  return unconfiguredBilling;
}
