/**
 * The scanner's touch, as one table.
 *
 * Every buzz the hair scan makes comes through here, so the whole gesture
 * has one vocabulary: a light tap when the machine starts, the small click
 * of a selection when the head is found, a barely-there tick as each
 * sector of the ring is captured, a firmer knock at a milestone, and the
 * system's own success note at the end. Nothing here is loud, and nothing
 * here is constant — a ring that buzzed at camera rate would stop being
 * feedback and start being noise.
 *
 * Two guards keep it honest:
 *
 *   - the device preference. Somebody who has switched haptics off in
 *     Settings feels nothing, exactly as every other press in the app.
 *   - a per-event floor. A sector can only tick once every so often, so
 *     a fast turn that captures three sectors in a frame reads as one
 *     tick rather than a rattle; a milestone can repeat, but not inside
 *     the same beat.
 *
 * The start tap is played here and nowhere else: the Start disc gives no
 * press haptic of its own, so the screen plays `start` on the press and
 * the person feels exactly one tap, not one on the press and another
 * when the activation animation ends.
 *
 * Haptics are unavailable on some devices and on web; a failure here must
 * never take the scan with it, so every call swallows its own rejection.
 * The native modules are loaded on first use rather than at import, which
 * keeps this table — the part worth testing — loadable where they are not.
 */

/** The engine events that have a touch. Anything else is silent. */
export type ScanHapticEvent =
  | 'start'
  | 'trackingLock'
  | 'sectorCaptured'
  | 'milestone'
  | 'complete';

/**
 * Shortest gap between two of the same event, in milliseconds.
 *
 * Sector ticks come closest together by design — they are the texture of
 * the turn — but even they sit above the ~60ms a phone needs to make two
 * taps feel like two. Start and complete happen once per scan; the floor
 * there is a guard against a double-fire, not a design choice.
 */
export const SCAN_HAPTIC_FLOOR_MS: Record<ScanHapticEvent, number> = {
  start: 400,
  trackingLock: 300,
  sectorCaptured: 90,
  milestone: 250,
  complete: 800,
};

/** The strength of each event, in expo-haptics' own vocabulary. */
export const SCAN_HAPTIC_STYLE: Record<
  ScanHapticEvent,
  { kind: 'impact'; style: 'Light' | 'Soft' | 'Medium' } | { kind: 'selection' } | { kind: 'success' }
> = {
  start: { kind: 'impact', style: 'Light' },
  trackingLock: { kind: 'selection' },
  sectorCaptured: { kind: 'impact', style: 'Soft' },
  milestone: { kind: 'impact', style: 'Medium' },
  complete: { kind: 'success' },
};

/** One expo-haptics call per event, bound on first use. */
async function fire(event: ScanHapticEvent): Promise<void> {
  const Haptics = await import('expo-haptics');
  const touch = SCAN_HAPTIC_STYLE[event];
  switch (touch.kind) {
    case 'impact':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle[touch.style]);
    case 'selection':
      return Haptics.selectionAsync();
    case 'success':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

/**
 * The device preference, read through the same cached switch every press
 * in the app reads. Bound on first use; until the binding resolves the
 * answer is "on", which is the preference's own default.
 */
let preference: (() => boolean) | null = null;
let preferenceLoading: Promise<void> | null = null;

function preferenceAllows(): boolean {
  if (preference) return preference();
  preferenceLoading ??= import('@/lib/device-preferences')
    .then((module) => {
      preference = module.hapticsAreEnabled;
    })
    .catch(() => undefined);
  return true;
}

export type ScanHaptics = {
  /** Play the touch for an event, if the floor and the preference allow. Returns whether it played. */
  play: (event: ScanHapticEvent, now?: number) => boolean;
  /** Forget the last-played times, for a fresh scan. */
  reset: () => void;
};

/**
 * A haptic player with its own memory of what it last played.
 *
 * One per scanner screen rather than a module singleton, so a scan that is
 * abandoned and restarted starts from silence rather than from the floor
 * timings of the previous attempt. `now` is injectable so the floor can be
 * checked without a clock; `enabled` and `trigger` so the table can be
 * exercised without a phone.
 */
export function createScanHaptics(
  enabled: () => boolean = preferenceAllows,
  trigger: (event: ScanHapticEvent) => Promise<void> = fire,
): ScanHaptics {
  const last = new Map<ScanHapticEvent, number>();

  /* Bind the preference now, so it is in hand long before the first press. */
  if (enabled === preferenceAllows) preferenceAllows();

  return {
    play(event, now = Date.now()) {
      if (!enabled()) return false;
      const previous = last.get(event);
      if (previous !== undefined && now - previous < SCAN_HAPTIC_FLOOR_MS[event]) {
        return false;
      }
      last.set(event, now);
      trigger(event).catch(() => undefined);
      return true;
    },
    reset() {
      last.clear();
    },
  };
}

/**
 * The milestones on a 24-sector ring: a quarter, a half, three quarters.
 *
 * The full ring is `complete`, which has its own note, so 24 is not here.
 * The screen calls this with the count of captured sectors each time it
 * changes and plays `milestone` when it answers true.
 */
export const SCAN_MILESTONE_SECTORS: readonly number[] = [6, 12, 18];

export function isScanMilestone(capturedSectors: number): boolean {
  return SCAN_MILESTONE_SECTORS.includes(capturedSectors);
}
