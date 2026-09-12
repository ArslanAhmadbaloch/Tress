/**
 * Whether the app is locked, and everything that decides it.
 *
 * The lock is a property of the running app rather than of the journey, so
 * it lives here instead of in the app store: nothing about it should ever
 * reach a backend.
 *
 * Two things lock it — launching, and coming back from the background after
 * longer than the grace period. The timestamp is taken when the app leaves
 * rather than on a timer, because a suspended app gets no timers.
 */

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
import { AppState, type AppStateStatus } from 'react-native';

import { loadLockState, type LockState } from '@/lib/app-lock';

const EMPTY: LockState = {
  enabled: false,
  biometricsEnabled: false,
  grace: 0,
  biometric: 'none',
};

type AppLock = {
  state: LockState;
  /** False until the stored state has been read, so nothing flashes. */
  isReady: boolean;
  isLocked: boolean;
  unlock: () => void;
  /** Re-reads the stored state after settings change it. */
  refresh: () => Promise<LockState>;
};

const AppLockContext = createContext<AppLock | null>(null);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LockState>(EMPTY);
  const [isReady, setIsReady] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // Read inside the AppState listener, which is registered once and would
  // otherwise close over the first value of each. Mirrored in an effect
  // rather than during render, which is not a ref's to touch.
  const stateRef = useRef(state);
  const lockedRef = useRef(isLocked);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
    lockedRef.current = isLocked;
  }, [state, isLocked]);

  const refresh = useCallback(async () => {
    const next = await loadLockState();
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadLockState()
      .then((next) => {
        if (cancelled) return;
        setState(next);
        // A launch is always a locked state; there is nothing to forgive.
        setIsLocked(next.enabled);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      if (status === 'active') {
        const away = leftAt.current;
        leftAt.current = null;
        if (!stateRef.current.enabled || lockedRef.current) return;
        if (away === null) return;
        if (Date.now() - away >= stateRef.current.grace * 1000) setIsLocked(true);
        return;
      }

      // 'inactive' fires for a passing banner or the app switcher preview as
      // well as a real departure; either way the clock starts, and coming
      // straight back is inside every grace period but "immediately".
      if (leftAt.current === null) leftAt.current = Date.now();
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);

  const value = useMemo<AppLock>(
    () => ({
      state,
      isReady,
      isLocked,
      unlock: () => setIsLocked(false),
      refresh,
    }),
    [state, isReady, isLocked, refresh],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLock {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used inside <AppLockProvider>.');
  return ctx;
}
