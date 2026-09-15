/**
 * Preferences that belong to this device rather than to the journey.
 *
 * They sit outside the app store on purpose: the store mirrors what will
 * one day be rows in a database, and none of these should follow a person
 * onto a second device. How long the camera counts down, whether the phone
 * buzzes, and what time an evening reminder fires are all properties of
 * the handset in your hand.
 *
 * Each value is read once at launch and cached, so the places that need it
 * on a hot path — every press, for haptics — can read it synchronously.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const TIMER_KEY = 'hj.captureTimer';
const HAPTICS_KEY = 'hj.haptics';
const REMINDER_HOUR_KEY = 'hj.reminderHour';
const PAYWALL_ASK_KEY = 'hj.paywallAsk';

/* ----------------------------- capture timer ---------------------------- */

/** Seconds of countdown before the shutter fires. Zero is off. */
export const CAPTURE_TIMERS = [0, 3, 5] as const;
export type CaptureTimer = (typeof CAPTURE_TIMERS)[number];

export async function loadCaptureTimer(): Promise<CaptureTimer> {
  try {
    const stored = Number(await AsyncStorage.getItem(TIMER_KEY));
    return CAPTURE_TIMERS.includes(stored as CaptureTimer)
      ? (stored as CaptureTimer)
      : 0;
  } catch {
    return 0;
  }
}

export function saveCaptureTimer(seconds: CaptureTimer): void {
  AsyncStorage.setItem(TIMER_KEY, String(seconds)).catch(() => undefined);
}

/* -------------------------------- haptics ------------------------------- */

/**
 * Cached rather than read per press: every tappable surface in the app
 * asks this question, and an await on the way to a 10ms vibration would
 * arrive after the press already felt unanswered.
 */
let hapticsEnabled = true;

export function hapticsAreEnabled(): boolean {
  return hapticsEnabled;
}

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
  AsyncStorage.setItem(HAPTICS_KEY, enabled ? '1' : '0').catch(() => undefined);
}

/* ---------------------------- reminder time ----------------------------- */

/** When the daily routine nudge fires, as an hour of the local day. */
export const REMINDER_HOURS = [8, 13, 20] as const;
export type ReminderHour = (typeof REMINDER_HOURS)[number];

export const REMINDER_HOUR_LABELS: Record<ReminderHour, string> = {
  8: 'Morning',
  13: 'Midday',
  20: 'Evening',
};

/** Spelled out for the line beneath the control. */
export const REMINDER_HOUR_TIMES: Record<ReminderHour, string> = {
  8: '8:00 in the morning',
  13: '1:00 in the afternoon',
  20: '8:00 in the evening',
};

let reminderHour: ReminderHour = 20;

export function currentReminderHour(): ReminderHour {
  return reminderHour;
}

export function setReminderHour(hour: ReminderHour): void {
  reminderHour = hour;
  AsyncStorage.setItem(REMINDER_HOUR_KEY, String(hour)).catch(() => undefined);
}

/* ------------------------------ paywall ask ----------------------------- */

/**
 * How far along the paywall's one second ask this install is.
 *
 * `first` until the paywall has been closed without a purchase; `second`
 * once it has, which is the single open that gets the second-ask framing;
 * `settled` the moment that framing has been shown, whether or not it was
 * accepted. Kept on the device rather than in the store because it is a
 * fact about this handset's history with the sheet, not about the journey.
 */
export type PaywallAskStage = 'first' | 'second' | 'settled';

let paywallAsk: PaywallAskStage = 'first';

export function currentPaywallAsk(): PaywallAskStage {
  return paywallAsk;
}

export function setPaywallAsk(stage: PaywallAskStage): void {
  paywallAsk = stage;
  AsyncStorage.setItem(PAYWALL_ASK_KEY, stage).catch(() => undefined);
}

/* --------------------------------- boot --------------------------------- */

/**
 * Reads the cached preferences from disk. Called once while the launch
 * screen is still up, so nothing has had a chance to read a default yet.
 */
export async function loadDevicePreferences(): Promise<void> {
  try {
    const [haptics, hour, ask] = await AsyncStorage.multiGet([
      HAPTICS_KEY,
      REMINDER_HOUR_KEY,
      PAYWALL_ASK_KEY,
    ]);
    // Absent means never set, which is on: the app has always buzzed.
    hapticsEnabled = haptics[1] !== '0';
    const stored = Number(hour[1]);
    if (REMINDER_HOURS.includes(stored as ReminderHour)) {
      reminderHour = stored as ReminderHour;
    }
    if (ask[1] === 'second' || ask[1] === 'settled') {
      paywallAsk = ask[1];
    }
  } catch {
    // Defaults are already in place; an unreadable store is not an error.
  }
}
