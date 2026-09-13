/**
 * The one way a screen asks for a Premium feature.
 *
 * `const gate = usePremiumGate(); ... gate('capturePhotos', () => router.push(...))`
 *
 * Entitled people get the action. Everybody else gets the paywall, opened
 * from the thing they were reaching for — which is the only moment it has
 * earned the right to appear.
 *
 * Screens never read the entitlement themselves. That keeps the count of
 * places that can be wrong about somebody's access at one, and it means a
 * later change — a trial, a plan that unlocks less — is made here rather
 * than hunted for.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import type { PremiumFeature } from './entitlement';
import { usePremium } from './provider';

export function usePremiumGate() {
  const router = useRouter();
  const { has } = usePremium();

  return useCallback(
    (feature: PremiumFeature, run: () => void) => {
      if (has(feature)) {
        run();
        return;
      }
      router.push('/paywall');
    },
    [has, router],
  );
}
