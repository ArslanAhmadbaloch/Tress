/**
 * The RevenueCat implementation of `BillingProvider`.
 *
 * RevenueCat sits between this app and StoreKit: the app asks for an
 * *offering* (a named set of packages configured in their dashboard)
 * rather than for product identifiers, and asks for an *entitlement*
 * ("premium") rather than for a list of purchased SKUs. That indirection
 * is the point — the prices, the trial and the product identifiers can
 * change in a dashboard without a new binary and without an app review.
 *
 * Two rules this file follows, both of them about honesty:
 *
 *  1. Prices come from the store, never from `config.ts`. A person in
 *     Karachi sees the rupee price Apple quotes them, and the yearly
 *     saving is recomputed from *those two numbers* rather than from the
 *     dollar defaults. `comparePlans` exists for exactly this.
 *
 *  2. A failure is reported as a failure. Nothing here ever resolves
 *     `{ ok: true }` on a path where money did not change hands, and a
 *     cancelled purchase is `cancelled` rather than an error the person
 *     is asked to retry.
 */

import { NativeModules, Platform } from 'react-native';
import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

import type {
  BillingFailure,
  BillingProvider,
  EntitlementSnapshot,
  PurchaseResult,
} from './billing';
import {
  comparePlans,
  PLANS,
  PREMIUM_ENTITLEMENT,
  REVENUECAT_KEYS,
  type PlanConfig,
  type PlanId,
  type TrialTerms,
} from './config';

/** The offering identifier configured in RevenueCat. */
const OFFERING = 'default';

/**
 * Which RevenueCat package each of our plans maps to.
 *
 * These are RevenueCat's own standard package identifiers. Using them
 * rather than our product ids means the dashboard can point `$rc_annual`
 * at a different product — a promotional price, an experiment variant —
 * and this file does not change.
 */
const PACKAGE_ID: Record<PlanId, string> = {
  yearly: '$rc_annual',
  monthly: '$rc_monthly',
};

/** Translates a RevenueCat error into something the paywall can say. */
function failureOf(error: unknown): BillingFailure {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR:
      return 'cancelled';
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
    case PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR:
      return 'network';
    case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
    case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
      return 'storeUnavailable';
    case PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR:
      return 'accountMismatch';
    default:
      return 'unknown';
  }
}

/**
 * Reads the "premium" entitlement out of a CustomerInfo.
 *
 * `isActive` and `willRenew` are separate questions, and conflating them
 * is how an app tells somebody who cancelled yesterday that they have
 * already lost the month they paid for. They have not.
 */
function snapshotOf(info: CustomerInfo): EntitlementSnapshot {
  const active = info.entitlements.active[PREMIUM_ENTITLEMENT];
  if (active) {
    return {
      isPremium: true,
      status: active.willRenew ? 'active' : 'cancelledButActive',
      expiresAt: active.expirationDate,
    };
  }

  // Present but not active: it ran out. Distinguished from "never bought"
  // so the paywall can greet a lapsed subscriber differently one day.
  const known = info.entitlements.all[PREMIUM_ENTITLEMENT];
  return {
    isPremium: false,
    status: known ? 'expired' : 'none',
    expiresAt: known?.expirationDate ?? null,
  };
}

/** Finds the package backing one of our plans in the current offering. */
async function packageFor(plan: PlanId): Promise<PurchasesPackage | null> {
  const offerings = await Purchases.getOfferings();
  const offering = offerings.all[OFFERING] ?? offerings.current;
  if (!offering) return null;

  const wanted = PACKAGE_ID[plan];
  return (
    offering.availablePackages.find((p) => p.identifier === wanted) ??
    // Falling back to the product identifier keeps a build working if the
    // package is ever renamed in the dashboard.
    offering.availablePackages.find(
      (p) => p.product.identifier === PLANS[plan].productId,
    ) ??
    null
  );
}

/** "7 days", "1 month" — the store's period, in words. */
function trialDuration(unit: string, count: number): string {
  const noun = unit.toLowerCase();
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/**
 * The trial this person can actually have on a package, or null.
 *
 * Two conditions, both required. The product must carry a *free*
 * introductory offer — a discounted one is not a trial and must not be
 * described as one — and this customer must be eligible for it, which
 * only the store knows. Anything short of a definite yes returns null,
 * so an unknown answer shows the plain price rather than a promise.
 */
function trialOf(
  pkg: PurchasesPackage,
  eligible: Record<string, { status: INTRO_ELIGIBILITY_STATUS }>,
): TrialTerms | null {
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;

  const status = eligible[pkg.product.identifier]?.status;
  if (status !== INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE) return null;

  return {
    duration: trialDuration(intro.periodUnit, intro.periodNumberOfUnits * intro.cycles),
  };
}

function createProvider(apiKey: string): BillingProvider {
  /*
    Configured once, lazily, on the first call that needs the SDK rather
    than at import time. Module side effects run before the app has
    decided anything, and a network-touching one that runs during a
    Metro fast-refresh or a test import is a hard thing to reason about.

    This call is also where RevenueCat mints the anonymous app user id
    for the install, which is why every method below configures on its
    own way in and nothing configures ahead of time. What reaches these
    methods, and when, is decided in provider.tsx: the paywall being on
    screen, a purchase, a restore, and a cached entitlement that has run
    past its date. A person who does none of those is never configured.
  */
  let configured = false;
  function configure(): void {
    if (configured) return;
    Purchases.configure({ apiKey });
    configured = true;
  }

  return {
    isConfigured: true,

    async products(): Promise<Record<PlanId, PlanConfig>> {
      try {
        configure();
        const offerings = await Purchases.getOfferings();
        const offering = offerings.all[OFFERING] ?? offerings.current;
        if (!offering) return PLANS;

        const found: Partial<Record<PlanId, PurchasesPackage>> = {};
        for (const plan of ['yearly', 'monthly'] as PlanId[]) {
          const match =
            offering.availablePackages.find((p) => p.identifier === PACKAGE_ID[plan]) ??
            offering.availablePackages.find(
              (p) => p.product.identifier === PLANS[plan].productId,
            );
          if (match) found[plan] = match;
        }

        const yearly = found.yearly;
        const monthly = found.monthly;
        // Without both, there is nothing honest to compare, so the
        // design-time defaults stand rather than a half-real paywall.
        if (!yearly || !monthly) return PLANS;

        /*
          Eligibility is asked once, for both products together. On
          Android this always answers "unknown", which `trialOf` reads as
          "say nothing about a trial" — the honest default, and moot
          until a Play product exists.
        */
        let eligible: Record<string, { status: INTRO_ELIGIBILITY_STATUS }> = {};
        try {
          eligible = await Purchases.checkTrialOrIntroductoryPriceEligibility([
            yearly.product.identifier,
            monthly.product.identifier,
          ]);
        } catch {
          // Leaving it empty means no trial is claimed anywhere.
        }

        /*
          The store hands back `priceString` already formatted for the
          customer's storefront. The per-month and saving lines have no
          such string, so they are formatted by substituting the number
          into the store's own formatting of the price — crude, but it
          keeps the currency symbol, separators and placement the store
          chose rather than inventing a dollar sign.
        */
        const format = (amount: number): string =>
          yearly.product.priceString.replace(
            /[\d.,]+/,
            amount.toFixed(2).replace('.', decimalSeparator(yearly.product.priceString)),
          );

        const compared = comparePlans(
          monthly.product.price,
          yearly.product.price,
          // `pricePerMonthString` is the store's own answer when it has
          // one, and it is always better than anything computed here.
          (amount) =>
            amount === yearly.product.price / 12 && yearly.product.pricePerMonthString
              ? yearly.product.pricePerMonthString
              : format(amount),
        );

        return {
          yearly: {
            ...PLANS.yearly,
            productId: yearly.product.identifier,
            formattedPrice: yearly.product.priceString,
            formattedMonthlyEquivalent: compared.monthlyEquivalent,
            formattedSaving: compared.saving,
            amount: yearly.product.price,
            currency: yearly.product.currencyCode,
            trial: trialOf(yearly, eligible),
          },
          monthly: {
            ...PLANS.monthly,
            productId: monthly.product.identifier,
            formattedPrice: monthly.product.priceString,
            formattedMonthlyEquivalent: null,
            formattedSaving: null,
            amount: monthly.product.price,
            currency: monthly.product.currencyCode,
            trial: trialOf(monthly, eligible),
          },
        };
      } catch {
        // An unreachable store is not a reason to show an empty paywall.
        return PLANS;
      }
    },

    async purchase(plan: PlanId): Promise<PurchaseResult> {
      try {
        configure();
        const pkg = await packageFor(plan);
        if (!pkg) return { ok: false, reason: 'storeUnavailable' };

        const { customerInfo } = await Purchases.purchasePackage(pkg);
        const snapshot = snapshotOf(customerInfo);
        /*
          Apple can report a completed transaction that has not yet
          granted the entitlement — a deferred purchase awaiting a
          parent's approval, most often. Reporting that as success would
          hand over Premium the store has not sold.
        */
        if (!snapshot.isPremium) return { ok: false, reason: 'unknown' };
        return { ok: true, entitledUntil: snapshot.expiresAt };
      } catch (error) {
        return { ok: false, reason: failureOf(error) };
      }
    },

    async restore(): Promise<PurchaseResult> {
      try {
        configure();
        const info = await Purchases.restorePurchases();
        const snapshot = snapshotOf(info);
        if (!snapshot.isPremium) return { ok: false, reason: 'noSubscription' };
        return { ok: true, entitledUntil: snapshot.expiresAt };
      } catch (error) {
        return { ok: false, reason: failureOf(error) };
      }
    },

    async entitlement(): Promise<EntitlementSnapshot | null> {
      try {
        configure();
        return snapshotOf(await Purchases.getCustomerInfo());
      } catch {
        // Null means "could not ask", which is different from "not
        // entitled" — the caller keeps whatever it had cached.
        return null;
      }
    },
  };
}

/** Whichever character the store's own formatting uses before the cents. */
function decimalSeparator(priceString: string): string {
  return /\d,\d{2}(?!\d)/.test(priceString) ? ',' : '.';
}

/**
 * The provider for this platform, or null when there is nothing to sell.
 *
 * Null on Android until a Play Console product exists, and null in Expo
 * Go, where the native module is absent — in both cases the caller falls
 * back to the unconfigured provider, so the paywall says "not available
 * yet" rather than crashing or offering a button that cannot work.
 */
export function createRevenueCatBilling(): BillingProvider | null {
  const apiKey = Platform.select({
    ios: REVENUECAT_KEYS.ios,
    android: REVENUECAT_KEYS.android,
    default: null,
  });
  if (!apiKey) return null;
  /*
    The JS half of the SDK loads anywhere — its statics exist even in Expo
    Go — so asking whether `Purchases.configure` is a function proves
    nothing. The native module is the real test: without it every call
    throws, and reporting `isConfigured: true` would put a live-looking
    purchase button in front of somebody it cannot serve.
  */
  if (!NativeModules.RNPurchases) return null;
  return createProvider(apiKey);
}
