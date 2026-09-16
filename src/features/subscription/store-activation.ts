/**
 * The moment the app is allowed to talk to the store.
 *
 * Configuring RevenueCat is not a free action: the SDK mints an
 * identifier for the install the first time it happens, and from then on
 * that install has a customer record. Doing it at launch did it to
 * everybody, including people who never looked at a price.
 *
 * The paywall is the screen that needs a store — it shows what the
 * storefront charges, and it carries the two buttons that spend money —
 * so its being on screen is the signal this hook reports. `purchase` and
 * `restore` configure the SDK themselves, on their own way in
 * (revenuecat.ts), so nothing here has to guess about those.
 *
 * The route is the signal rather than a call inside paywall.tsx because
 * the provider is the thing that owns the store connection, and a screen
 * that has to remember to announce itself is a screen that will one day
 * forget. If the paywall ever moves off this path, this constant moves
 * with it.
 */

import { usePathname } from 'expo-router';

/** Where the paywall lives; pushed by the gate (gate.ts) and by the funnel. */
export const PAYWALL_ROUTE = '/paywall';

/** True while the paywall is the screen being shown. */
export function usePaywallOnScreen(): boolean {
  return usePathname() === PAYWALL_ROUTE;
}
