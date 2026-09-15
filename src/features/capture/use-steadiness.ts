/**
 * Whether the phone is being moved, and whether it has gone still.
 *
 * The device's own motion, from accelerometer magnitude against gravity.
 * It is the one reading the capture screen has on every build and at
 * every angle: head tracking needs the VisionCamera binary and a face in
 * the frame, and the top and crown of the full set are shot with the
 * screen facing away. A photograph taken mid-movement is blurred and
 * framed differently from the last one, which is exactly the drift that
 * makes two months of photos incomparable, so this is worth having even
 * where nothing else is watching.
 *
 * It does not fire the shutter. It once did, and taking the photo out of
 * the person's hands was worse than the problem it solved; the self-timer
 * does that job when asked. `moving` flips the instant the phone is
 * disturbed, so the instruction can get out of the way of the shot.
 * `steady` waits, because a hand pausing between movements is not
 * somebody who has settled, and the guide should only turn green once
 * they have.
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
