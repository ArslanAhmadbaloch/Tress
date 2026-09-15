/**
 * What Premium costs, in one place.
 *
 * Every price in the interface comes from here, and every one of them is
 * a *formatted string* rather than a number the UI assembles. That is not
 * fussiness: once the store is connected, Apple and Google return the
 * price already formatted for the customer's own country and currency —
 * "£7.99", "¥1,400", "R$ 49,90" — and any component that builds a price
 * by writing a dollar sign in front of a number is a component that will
 * lie to most of the world.
 *
 * So the values below are the *design-time defaults*, standing in until
 * real products are fetched. They are the numbers we intend to charge,
 * not numbers anybody has been charged.
 */

export type PlanId = 'yearly' | 'monthly';

/**
 * An introductory free trial, when the store is offering this person one.
 *
 * Null is the important case. A trial is offered per *subscription group*
 * and only once: somebody who subscribed last year and came back is not
 * eligible, and telling them "7 days free" would be a promise the App
 * Store will not keep. So this is populated only when the store says this
 * particular customer is eligible, and every piece of copy that mentions
 * a trial is written to disappear when it is null.
 */
export type TrialTerms = {
  /** "7 days", "1 month" — as the sentence needs it. */
  duration: string;
};

export type PlanConfig = {
  id: PlanId;
  /** Product identifier to register with Apple, Google and RevenueCat. */
  productId: string;
  /** "year" / "month" — what one billing period buys. */
  period: 'year' | 'month';
  /** Price as the store would format it. Replaced by the real one. */
  formattedPrice: string;
  /**
   * The yearly plan's cost expressed per month, so the two plans can be
   * compared honestly. Null when the plan is already monthly.
   */
  formattedMonthlyEquivalent: string | null;
  /** What choosing this plan saves against a year of the monthly one. */
  formattedSaving: string | null;
  /** Raw amount, kept only to compute the comparisons above. */
  amount: number;
  currency: string;
  /** A free trial this person can actually have, or null. */
  trial: TrialTerms | null;
};

const MONTHLY_AMOUNT = 7.99;
const YEARLY_AMOUNT = 49.99;
const CURRENCY = 'USD';

/** Approximate formatter for the design-time defaults only. */
function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

const yearlyPerMonth = YEARLY_AMOUNT / 12;
const yearlySaving = MONTHLY_AMOUNT * 12 - YEARLY_AMOUNT;

export const PLANS: Record<PlanId, PlanConfig> = {
  yearly: {
    id: 'yearly',
    productId: 'tress_premium_yearly',
    period: 'year',
    formattedPrice: usd(YEARLY_AMOUNT),
    formattedMonthlyEquivalent: usd(yearlyPerMonth),
    formattedSaving: usd(yearlySaving),
    amount: YEARLY_AMOUNT,
    currency: CURRENCY,
    // Null in the defaults: eligibility is the store's answer, never ours.
    trial: null,
  },
  monthly: {
    id: 'monthly',
    productId: 'tress_premium_monthly',
    period: 'month',
    formattedPrice: usd(MONTHLY_AMOUNT),
    formattedMonthlyEquivalent: null,
    formattedSaving: null,
    amount: MONTHLY_AMOUNT,
    currency: CURRENCY,
    trial: null,
  },
};

/** Order the plans appear in. The better value leads. */
export const PLAN_ORDER: PlanId[] = ['yearly', 'monthly'];

/** Pre-selected when the paywall opens. */
export const DEFAULT_PLAN: PlanId = 'yearly';

/** The entitlement identifier to configure in RevenueCat. */
export const PREMIUM_ENTITLEMENT = 'premium';

/**
 * Recomputes the comparison lines from two prices.
 *
 * Kept as a function because once real products arrive the amounts come
 * from the store, and the saving has to be recomputed from *those* rather
 * than from the defaults above — a customer paying in rupees should not
 * be told they save sixty-five dollars.
 */
export function comparePlans(
  monthlyAmount: number,
  yearlyAmount: number,
  format: (amount: number) => string,
): { monthlyEquivalent: string; saving: string | null } {
  const saving = monthlyAmount * 12 - yearlyAmount;
  return {
    monthlyEquivalent: format(yearlyAmount / 12),
    saving: saving > 0 ? format(saving) : null,
  };
}

/**
 * RevenueCat's public SDK key, per store.
 *
 * Public is the operative word: this key identifies the app to
 * RevenueCat and is designed to ship inside the binary, the way a
 * Firebase or Stripe publishable key does. It can fetch offerings and
 * start purchases — both of which Apple has to approve anyway — and it
 * cannot read another customer's data or move money. The *secret* key,
 * which can, is not in this repository and never should be.
 *
 * Android is null because there is no Play Console product yet. That
 * makes `createBilling()` return the unconfigured provider on Android,
 * which shows "not available yet" instead of a purchase button that
 * would fail — see billing.ts.
 */
export const REVENUECAT_KEYS: { ios: string | null; android: string | null } = {
  ios: 'appl_kEQKncKEkIQMMivdNMFKjRNwnpH',
  android: null,
};
