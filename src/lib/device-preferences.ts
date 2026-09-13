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

const HAPTICS_KEY = 'hj.haptics';
const REMINDER_HOUR_KEY = 'hj.reminderHour';

/* ----------------------------- capture timer ---------------------------- */

/** Seconds of countdown before the shutter fires. Zero is off. */

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

/* --------------------------------- boot --------------------------------- */

/**
 * Reads the cached preferences from disk. Called once while the launch
 * screen is still up, so nothing has had a chance to read a default yet.
 */
export async function loadDevicePreferences(): Promise<void> {
  try {
    const [haptics, hour] = await AsyncStorage.multiGet([
      HAPTICS_KEY,
      REMINDER_HOUR_KEY,
    ]);
    // Absent means never set, which is on: the app has always buzzed.
    hapticsEnabled = haptics[1] !== '0';
    const stored = Number(hour[1]);
    if (REMINDER_HOURS.includes(stored as ReminderHour)) {
      reminderHour = stored as ReminderHour;
    }
  } catch {
    // Defaults are already in place; an unreadable store is not an error.
  }
}
