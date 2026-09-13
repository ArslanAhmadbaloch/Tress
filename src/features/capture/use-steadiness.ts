/**
 * Whether the phone is being moved, and whether it has gone still.
 *
 * This is the one thing about the moment of capture the app can actually
 * know. It cannot see a face — there is no face detection in this SDK —
 * so it cannot tell you your head is at the right angle, and it does not
 * claim to. What it can measure is the device: accelerometer magnitude
 * against gravity, which says plainly whether the phone is in motion.
 *
 * That is worth having on its own. Two of the five angles are shot blind,
 * with the screen facing away, and a photograph taken mid-movement is
 * blurred and framed differently from the last one — which is exactly the
 * kind of drift that makes two months of photos incomparable.
 *
 * `moving` flips the instant it is disturbed, so the interface can get out
 * of the way. `steady` waits, because a hand pausing between movements is
 * not somebody who has settled.
 */

import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';

/** Gravity is ~1g at rest; this is the wobble allowed on top of it. */
const MOVING_THRESHOLD = 0.045;

/** How long the phone must stay under that before it counts as settled. */
const SETTLE_MS = 700;

/** 20 Hz — enough to catch a hand, cheap enough to leave running. */
const INTERVAL_MS = 50;

export function useSteadiness(enabled: boolean): {
  moving: boolean;
  steady: boolean;
  /** True until the first reading arrives, or if no sensor is available. */
  unavailable: boolean;
} {
  const [moving, setMoving] = useState(false);
  const [steady, setSteady] = useState(false);
  const [unavailable, setUnavailable] = useState(true);

  const settledAt = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      settledAt.current = null;
      return;
    }

    let cancelled = false;
    let subscription: { remove: () => void } | null = null;

    (async () => {
      const available = await Accelerometer.isAvailableAsync().catch(() => false);
      if (cancelled) return;
      if (!available) {
        // No sensor — a simulator, or a device without one. Everything
        // driven by this falls back to being driven by the user.
        setUnavailable(true);
        return;
      }

      setUnavailable(false);
      Accelerometer.setUpdateInterval(INTERVAL_MS);

      subscription = Accelerometer.addListener(({ x, y, z }) => {
        // Distance from 1g in any direction: still means still, whichever
        // way up the phone is being held.
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const disturbance = Math.abs(magnitude - 1);

        if (disturbance > MOVING_THRESHOLD) {
          settledAt.current = null;
          setMoving(true);
          setSteady(false);
          return;
        }

        setMoving(false);
        const now = Date.now();
        if (settledAt.current === null) settledAt.current = now;
        else if (now - settledAt.current >= SETTLE_MS) setSteady(true);
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);

  // Masked rather than reset in the effect: disabling the hook should
  // read as "not moving, not settled" without a render just to say so.
  return { moving: enabled && moving, steady: enabled && steady, unavailable };
}
