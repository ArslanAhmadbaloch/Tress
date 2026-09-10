/**
 * Theme provider.
 *
 * Owns the resolved colour scheme for the whole app. The user can pin
 * light or dark, or follow the system; the choice is persisted so the
 * app opens in the appearance they left it in.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import {
  darkColors,
  lightColors,
  motion,
  radius,
  shadow,
  spacing,
  typography,
  type ColorTokens,
} from './tokens';

export * from './tokens';

export type AppearancePreference = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

export type Theme = {
  scheme: ResolvedScheme;
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadow: typeof shadow;
  motion: typeof motion;
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
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] =
    useState<AppearancePreference>('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
        }
      })
      // A failed read is not worth surfacing — we simply follow the system.
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

  const scheme: ResolvedScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

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
