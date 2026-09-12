/**
 * Going back when there may be nothing behind you.
 *
 * Most of the app is reached by pushing, so `router.back()` is right. Two
 * routes are not: onboarding *replaces* itself with the capture flow, which
 * then replaces itself again, so by the time the camera is open the stack
 * below it is empty. A deep link lands the same way. In both cases
 * `router.back()` silently does nothing — and on the update screen that is
 * worse than nothing, because the session has just been deleted and the
 * screen it strands you on reads "Update not found".
 *
 * A back button that can do nothing is a trap, so this one always leads
 * somewhere: back if there is a back, and otherwise home.
 */

import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

export function useBackOrHome(fallback: Href = '/') {
  const router = useRouter();

  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
