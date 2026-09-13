/**
 * Theme provider.
 *
 * Owns the resolved colour scheme for the whole app.
 *
 * Light unless somebody chooses otherwise — the app does not follow the
 * device. Everything here is built on warm paper and photographs judged
 * against it, and a phone set to dark at sunset would hand a first-time
 * user a version of the app nobody chose for them, with their own photos
 * looking different from the ones they took last week.
 *
 * The choice is persisted, so the app opens in the appearance it was left
 * in. Anyone whose stored preference predates this reads as light.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  darkColors,
  lightColors,
  metrics,
  motion,
  radius,
  shadow,
  spacing,
  typography,
  type ColorTokens,
} from './tokens';

export * from './tokens';

export type AppearancePreference = 'light' | 'dark';
export type ResolvedScheme = 'light' | 'dark';

export type Theme = {
  scheme: ResolvedScheme;
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadow: typeof shadow;
  motion: typeof motion;
  metrics: typeof metrics;
};

type ThemeContextValue = Theme & {
  preference: AppearancePreference;
  setPreference: (next: AppearancePreference) => void;
  /** False until the stored preference has been read, so we don't flash. */
  isReady: boolean;
};

const STORAGE_KEY = 'hj.appearance';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function buildTheme(scheme: ResolvedScheme): Theme {
  return {
    scheme,
    colors: scheme === 'dark' ? darkColors : lightColors,
    spacing,
    radius,
    typography,
    shadow,
    motion,
    metrics,
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] =
    useState<AppearancePreference>('light');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        // 'system' was a third option once; anything unrecognised, that
        // included, falls through to the light default.
        if (stored === 'light' || stored === 'dark') {
          setPreferenceState(stored);
        }
      })
      // A failed read is not worth surfacing — light is the default.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: AppearancePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const scheme: ResolvedScheme = preference;

  /*
   * Tell the OS as well, so the parts of the interface this app does not
   * draw come along. Alerts, action sheets and the keyboard take their
   * appearance from the system, and without this they would follow the
   * device while everything around them followed the setting — a dark
   * "Discard this update?" over a light app, on a phone set to dark at
   * dusk.
   */
  useEffect(() => {
    Appearance.setColorScheme(scheme);
  }, [scheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...buildTheme(scheme),
      preference,
      setPreference,
      isReady,
    }),
    [scheme, preference, setPreference, isReady],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>.');
  }
  return ctx;
}

/** Convenience for the common case of only needing colours. */
export function useColors(): ColorTokens {
  return useTheme().colors;
}
