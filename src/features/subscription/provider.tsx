/**
 * The subscription service, as the rest of the app sees it.
 *
 * Screens ask `usePremium()` whether somebody is entitled and get an
 * answer; the paywall asks `useSubscription()` for prices and the two
 * actions that change anything. Nothing outside this folder knows what a
 * billing provider is.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { PLANS, type PlanConfig, type PlanId } from './config';
import {
  NO_ENTITLEMENT,
  TESTER_BUILD,
  TESTER_ENTITLEMENT,
  type Entitlement,
  type PremiumFeature,
} from './entitlement';

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
  /** Clears a finished purchase/restore result. */
  acknowledge: () => void;

  /** Tester builds only; absent in production. */
  testerPremium: boolean;
  setTesterPremium: ((on: boolean) => void) | null;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const billing = useMemo(() => createBilling(), []);

  const [stored, setStored] = useState<Entitlement>(NO_ENTITLEMENT);
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
        if (cached) setStored(JSON.parse(cached) as Entitlement);
        if (testerFlag === '1') setTester(true);
      } catch {
        // An unreadable cache means no entitlement, not a crash. The store
        // is the authority; this was only ever an offline convenience.
      } finally {
        if (alive.current) setIsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    billing.products().then((p) => { if (alive.current) setPlans(p); }).catch(() => undefined);
  }, [billing]);

  const remember = useCallback(async (next: Entitlement) => {
    setStored(next);
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
    } catch {
      // Losing the cache costs a re-check against the store, nothing more.
    }
  }, []);

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
      acknowledge,
      testerPremium: tester,
      setTesterPremium: TESTER_BUILD ? setTesterPremium : null,
    }),
    [
      entitlement, isLoaded, plans, billing.isConfigured, purchaseState,
      restoreState, purchase, restore, acknowledge, tester, setTesterPremium,
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
