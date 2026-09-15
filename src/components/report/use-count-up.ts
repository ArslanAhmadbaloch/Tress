/**
 * A number that arrives with its ring.
 *
 * Driven from JS with a handful of setState calls, deliberately — the
 * same reasoning as the dashboard's AnimatedNumber. The UI-thread version
 * writes into a TextInput's `text`, which also carries `defaultValue`, and
 * React re-applies that on the next render and quietly reverts the figure.
 * A report whose numbers can drift from their data is not a report.
 *
 * `delay` lets the count start when its card lands rather than when the
 * screen mounts, so a reading that arrives fourth does not sit at its
 * final value for two seconds before anybody can see it.
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

export function useCountUp(
  target: number,
  { delay = 0, duration = 1100 }: { delay?: number; duration?: number } = {},
): number {
  const reduceMotion = useReducedMotion();
  const frame = useRef<number | null>(null);
  // Only the in-flight figure lives in state. Under Reduce Motion the
  // target is returned as it is, so there is no first render at zero and
  // no state to synchronise in the effect.
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;

    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      // Ease out, so the figure decelerates into its final value the way
      // the arc beside it does.
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(target * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };

    const timer = setTimeout(() => {
      frame.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(timer);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, delay, duration, reduceMotion]);

  return reduceMotion ? target : shown;
}
