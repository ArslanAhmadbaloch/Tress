/**
 * Display accessibility preferences.
 *
 * Apple's Liquid Glass guidance is explicit that translucency has to adapt
 * to people's needs: someone can turn on Reduce Transparency or Increase
 * Contrast, and the material must respond rather than ignore them. System
 * components do this automatically; anything custom has to be told.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export type DisplayPreferences = {
  /** Blur and translucency should be replaced with an opaque surface. */
  reduceTransparency: boolean;
  /** Borders and separators should be strengthened. */
  increaseContrast: boolean;
};

export function useDisplayPreferences(): DisplayPreferences {
  const [prefs, setPrefs] = useState<DisplayPreferences>({
    reduceTransparency: false,
    increaseContrast: false,
  });

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      try {
        const [reduceTransparency, increaseContrast] = await Promise.all([
          AccessibilityInfo.isReduceTransparencyEnabled?.() ?? Promise.resolve(false),
          // Android has no equivalent public API; treat it as off there.
          Platform.OS === 'ios'
            ? (AccessibilityInfo.isHighTextContrastEnabled?.() ??
              Promise.resolve(false))
            : Promise.resolve(false),
        ]);
        if (!cancelled) setPrefs({ reduceTransparency, increaseContrast });
      } catch {
        // Defaults already describe "no preference expressed".
      }
    };

    read();

    const transparency = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (reduceTransparency) =>
        setPrefs((prev) => ({ ...prev, reduceTransparency })),
    );

    return () => {
      cancelled = true;
      transparency?.remove();
    };
  }, []);

  return prefs;
}
