/**
 * The subscription service, as the rest of the app sees it.
 *
 * Screens ask `usePremium()` whether somebody is entitled and get an
 * answer; the paywall asks `useSubscription()` for prices and the two
 * actions that change anything. Nothing outside this folder knows what a
 * billing provider is.
 *
 * ── Launch does not talk to the store ──────────────────────────────────
 * This provider used to ask RevenueCat for prices and for the customer's
 * entitlement as soon as it mounted, which is to say on every cold start
 * of every install. Configuring the SDK mints an identifier for the
 * install, so that gave a customer record to people who had never opened
 * the paywall, let alone bought anything.
 *
 * Launch now reads the cached snapshot from disk and acts on it
 * (entitlement-cache.ts decides what it is still worth). The store is
 * asked when the paywall is on screen, when somebody buys, when somebody
 * restores, and when the cached snapshot grants Premium but can no longer
 * vouch for itself — it has passed the date it was good until, or it
 * carries none. A snapshot that grants Premium is written by a purchase
 * or a restore, so on an install where neither has happened there is
 * nothing here that reaches the store.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Purchases, { type CustomerInfo } from 'react-native-purchases';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { createBilling, type BillingFailure } from './billing';
import { PLANS, PREMIUM_ENTITLEMENT, type PlanConfig, type PlanId } from './config';
import {
  NO_ENTITLEMENT,
  TESTER_BUILD,
  TESTER_ENTITLEMENT,
  type Entitlement,
  type PremiumFeature,
} from './entitlement';
import {
  judgeCache,
  parseCache,
  snapshotToStore,
  type CacheVerdict,
} from './entitlement-cache';
import { usePaywallOnScreen } from './store-activation';

/** Last known entitlement, so a launch without a network is not a lockout. */
const CACHE_KEY = 'hair-journey.entitlement.v1';
/** Set only by the tester control, and only read in a tester build. */
const TESTER_KEY = 'hair-journey.tester-premium.v1';

export type TransactionState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'success'; message: string }
  | { kind: 'failed'; reason: BillingFailure };

type SubscriptionContextValue = {
  entitlement: Entitlement;
  /** False until the cached entitlement has been read from disk. */
  isLoaded: boolean;
  /** Store-formatted prices; the design-time defaults until a store exists. */
  plans: Record<PlanId, PlanConfig>;
  /** Whether a real purchase is possible in this build at all. */
  canPurchase: boolean;

  purchaseState: TransactionState;
  restoreState: TransactionState;

  purchase: (plan: PlanId) => Promise<void>;
  restore: () => Promise<void>;
  /**
   * Opens the store's own offer-code sheet. Null where there is no sheet
   * to open — Android, Expo Go, a build with no store key — so the
   * paywall hides the link rather than showing one that cannot work.
   */
  redeemCode: (() => Promise<void>) | null;
  /** Clears a finished purchase/restore result. */
  acknowledge: () => void;

  /** Tester builds only; absent in production. */
  testerPremium: boolean;
  setTesterPremium: ((on: boolean) => void) | null;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const billing = useMemo(() => createBilling(), []);

  /*
    What the cached snapshot is worth, recomputed whenever the snapshot
    changes rather than on a timer. A session that runs long enough to
    cross an expiry keeps the answer it started with; the next launch
    reads the clock again.
  */
  const [verdict, setVerdict] = useState<CacheVerdict>({
    entitlement: NO_ENTITLEMENT,
    needsRefresh: false,
  });
  const stored = verdict.entitlement;
  const [tester, setTester] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [plans, setPlans] = useState<Record<PlanId, PlanConfig>>(PLANS);

  const [purchaseState, setPurchaseState] = useState<TransactionState>({ kind: 'idle' });
  const [restoreState, setRestoreState] = useState<TransactionState>({ kind: 'idle' });

  /*
    Set on the way in as well as cleared on the way out. A ref that is
    only ever set to false stays false after the first unmount, so a
    provider that remounts — a fast refresh, a navigator dropping and
    rebuilding the tree — would silently discard the cached entitlement
    and the tester flag it had just read.
  */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /*
    Whether the store has answered yet. The launch ask waits on the disk
    read, but the paywall's does not — a link that opens straight onto the
    paywall can have the store answering while the disk read is still in
    flight, and the disk read must not then overwrite the fresher answer
    with what we happened to believe last time.
  */
  const storeAnswered = useRef(false);

  const remember = useCallback(async (next: Entitlement) => {
    const now = Date.now();
    const snapshot = snapshotToStore(next, now);
    setVerdict(judgeCache(snapshot, now));
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
    } catch {
      // Losing the cache costs a re-check against the store, nothing more.
    }
  }, []);

  /*
    Asking the store, which is also what configures the SDK and mints the
    identifier this install is known by. The two effects below decide when
    this runs; `purchase` and `restore` reach the SDK by their own route,
    inside revenuecat.ts.

    A null answer means we could not ask — offline, or a store that did
    not respond — and the cached entitlement then stands, because nobody
    should lose access they have paid for because a request timed out. A
    failed ask does not hold the guard, so the next trigger gets to try
    again; a successful one holds it, so a single run of the app asks
    once.
  */
  const asking = useRef(false);
  const refresh = useCallback(async () => {
    const ask = billing.entitlement;
    if (!ask || asking.current) return;
    asking.current = true;
    try {
      const snapshot = await ask.call(billing);
      if (!snapshot) {
        asking.current = false;
        return;
      }
      if (!alive.current) return;
      storeAnswered.current = true;
      await remember({
        isPremium: snapshot.isPremium,
        source: snapshot.isPremium ? 'subscription' : 'none',
        status: snapshot.status,
        expiresAt: snapshot.expiresAt,
      });
    } catch {
      asking.current = false;
    }
  }, [billing, remember]);

  /*
    Launch: the cached snapshot off the disk, and the store asked in the
    one case where that snapshot can no longer vouch for itself.

    That second half is the one ask that can happen at launch, and it is
    deliberately not the thing this change set out to remove.
    `needsRefresh` is true for a snapshot that grants Premium and has gone
    past the date it was good until, or that grants Premium with no date
    on it and has sat unchecked for a day. A snapshot like that is written
    by a purchase, by a restore, or by a store answer that followed one of
    those — so the person being asked about has bought something, and the
    answer either renews their access or ends it. Once the store says the
    subscription is over, that answer goes to disk and launches stop
    asking.
  */
  useEffect(() => {
    (async () => {
      try {
        const [cached, testerFlag] = await Promise.all([
          AsyncStorage.getItem(CACHE_KEY),
          // Not even read outside a tester build, so a value written into
          // storage on a production device can never grant access.
          TESTER_BUILD ? AsyncStorage.getItem(TESTER_KEY) : Promise.resolve(null),
        ]);
        if (!alive.current) return;
        const decided = judgeCache(parseCache(cached), Date.now());
        if (!storeAnswered.current) setVerdict(decided);
        if (testerFlag === '1') setTester(true);
        if (decided.needsRefresh) void refresh();
      } catch {
        // An unreadable cache means no entitlement, not a crash — and the
        // paywall's Restore is the way back for somebody who has paid.
      } finally {
        if (alive.current) setIsLoaded(true);
      }
    })();
  }, [refresh]);

  /*
    The paywall: prices, and a fresh reading of the entitlement, fetched
    when it is on screen rather than at launch — see store-activation.ts
    for why the route is the signal. Once per run of the app, so a second
    visit shows what the first one fetched.
  */
  const paywallOnScreen = usePaywallOnScreen();
  const storeOpened = useRef(false);
  useEffect(() => {
    if (!paywallOnScreen || storeOpened.current) return;
    storeOpened.current = true;
    billing.products().then((p) => { if (alive.current) setPlans(p); }).catch(() => undefined);
    void refresh();
  }, [paywallOnScreen, billing, refresh]);

  const purchase = useCallback(
    async (plan: PlanId) => {
      setPurchaseState({ kind: 'working' });
      const result = await billing.purchase(plan);
      if (!alive.current) return;

      if (result.ok) {
        await remember({
          isPremium: true,
          source: 'subscription',
          status: 'active',
          expiresAt: result.entitledUntil,
        });
        setPurchaseState({ kind: 'success', message: 'Your journey is ready.' });
        return;
      }
      setPurchaseState({ kind: 'failed', reason: result.reason });
    },
    [billing, remember],
  );

  const restore = useCallback(async () => {
    setRestoreState({ kind: 'working' });
    const result = await billing.restore();
    if (!alive.current) return;

    if (result.ok) {
      await remember({
        isPremium: true,
        source: 'subscription',
        status: 'active',
        expiresAt: result.entitledUntil,
      });
      setRestoreState({
        kind: 'success',
        message: 'Your Premium access has been restored.',
      });
      return;
    }
    setRestoreState({ kind: 'failed', reason: result.reason });
  }, [billing, remember]);

  /*
    A promotional or offer code, redeemed through the store's own sheet.

    iOS only: the sheet is StoreKit's, and Google Play has no equivalent
    that RevenueCat presents. The SDK is already configured by the time
    anyone can tap the link — the paywall is on screen, so the effect
    above has asked for products — and a sheet that cannot be shown is
    caught and changes nothing.

    The sheet does not say when it closes or whether a code went through,
    so the answer arrives the way RevenueCat delivers every change to a
    customer: through its listener, which is registered on the first tap
    and not before (a listener registered at launch would be one more
    thing touching the store on an install that never opened the
    paywall). Only a grant is acted on. A code that fails leaves the
    cached entitlement exactly as it was, and Restore remains the way to
    pick up a code redeemed outside the app.
  */
  const [listeningForCode, setListeningForCode] = useState(false);
  useEffect(() => {
    if (!listeningForCode) return;
    const listener = (info: CustomerInfo) => {
      const active = info.entitlements.active[PREMIUM_ENTITLEMENT];
      if (!active || !alive.current) return;
      void remember({
        isPremium: true,
        source: 'subscription',
        status: active.willRenew ? 'active' : 'cancelledButActive',
        expiresAt: active.expirationDate,
      });
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [listeningForCode, remember]);

  const redeemCode = useMemo(() => {
    if (Platform.OS !== 'ios' || !billing.isConfigured) return null;
    return async () => {
      setListeningForCode(true);
      try {
        await Purchases.presentCodeRedemptionSheet();
      } catch {
        // No sheet, no code, nothing changed.
      }
    };
  }, [billing.isConfigured]);

  const acknowledge = useCallback(() => {
    setPurchaseState({ kind: 'idle' });
    setRestoreState({ kind: 'idle' });
  }, []);

  const setTesterPremium = useCallback((on: boolean) => {
    if (!TESTER_BUILD) return;
    setTester(on);
    AsyncStorage.setItem(TESTER_KEY, on ? '1' : '0').catch(() => undefined);
  }, []);

  const entitlement: Entitlement = useMemo(() => {
    if (stored.isPremium) return stored;
    if (TESTER_BUILD && tester) return TESTER_ENTITLEMENT;
    return stored;
  }, [stored, tester]);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      entitlement,
      isLoaded,
      plans,
      canPurchase: billing.isConfigured,
      purchaseState,
      restoreState,
      purchase,
      restore,
      redeemCode,
      acknowledge,
      testerPremium: tester,
      setTesterPremium: TESTER_BUILD ? setTesterPremium : null,
    }),
    [
      entitlement, isLoaded, plans, billing.isConfigured, purchaseState,
      restoreState, purchase, restore, redeemCode, acknowledge, tester, setTesterPremium,
    ],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used inside SubscriptionProvider');
  return ctx;
}

/**
 * The question most screens actually want to ask.
 *
 * `has(feature)` takes the feature rather than a boolean so the call site
 * says what it is gating, and so a future plan with a narrower entitlement
 * changes this function instead of every caller.
 */
export function usePremium(): {
  isPremium: boolean;
  entitlement: Entitlement;
  has: (feature: PremiumFeature) => boolean;
} {
  const { entitlement } = useSubscription();
  return {
    isPremium: entitlement.isPremium,
    entitlement,
    has: () => entitlement.isPremium,
  };
}
