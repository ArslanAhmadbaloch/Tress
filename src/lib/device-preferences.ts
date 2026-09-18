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

import { cancelAllReminders, syncReminders } from './notifications';

const TIMER_KEY = 'hj.captureTimer';
const HAPTICS_KEY = 'hj.haptics';
const REMINDER_HOUR_KEY = 'hj.reminderHour';
const REMINDER_PROMPT_KEY = 'hj.remindersOffered';
const PAYWALL_ASK_KEY = 'hj.paywallAsk';
const ROUTINE_REMINDER_KEY = 'hj.reminderRoutine';
const UPDATE_REMINDER_KEY = 'hj.reminderUpdate';
const REMINDER_INTERVAL_KEY = 'hj.reminderIntervalDays';
const REMINDER_IDS_KEY = 'hj.reminderIdsAdopted';
const SCAN_DIAGNOSTICS_KEY = 'hj.scanDiagnostics';

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

/* --------------------------- scan diagnostics --------------------------- */

/*
  Off for everybody, and meant for one person.

  The scanner's cap is fitted to the hair only when a long chain holds:
  ARKit running, the camera live, the app in front, the native sampler in
  the binary, Nitro present, the segmenter imported, and a mask the fit
  did not refuse. When it does not hold, the standing dome is drawn — and
  the two are indistinguishable on screen, which has already cost two
  rounds of "it still looks like a dome" with no way to tell whether the
  shape was too subtle or the segmenter never ran at all. With this on,
  the scanner says which it is.
*/
let scanDiagnostics = false;

export function scanDiagnosticsOn(): boolean {
  return scanDiagnostics;
}

export function setScanDiagnostics(enabled: boolean): void {
  scanDiagnostics = enabled;
  AsyncStorage.setItem(SCAN_DIAGNOSTICS_KEY, enabled ? '1' : '0').catch(() => undefined);
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

/* --------------------------- reminder switches --------------------------- */

/**
 * The two reminder switches, and the interval the photo one runs on.
 *
 * Both are on from the first launch: somebody who never opens this screen
 * should still be told when the next set of photos is due and when their
 * routine is waiting. What they are NOT is permission — the operating
 * system owns that, and these flags only say what the app would schedule
 * if it had it.
 *
 * On disk each is tri-state on purpose. Absent means never chosen, which
 * is on; `'0'` is somebody reaching into Settings and switching it off,
 * and that has to survive every launch afterwards. Storing a bare boolean
 * would make "never asked" and "said no" the same byte, and the next
 * default change would quietly switch something back on under them.
 */
let routineReminderEnabled = true;
let updateReminderEnabled = true;

export function routineReminderIsEnabled(): boolean {
  return routineReminderEnabled;
}

export function updateReminderIsEnabled(): boolean {
  return updateReminderEnabled;
}

export function setRoutineReminderEnabled(enabled: boolean): void {
  routineReminderEnabled = enabled;
  AsyncStorage.setItem(ROUTINE_REMINDER_KEY, enabled ? '1' : '0').catch(
    () => undefined,
  );
}

export function setUpdateReminderEnabled(enabled: boolean): void {
  updateReminderEnabled = enabled;
  AsyncStorage.setItem(UPDATE_REMINDER_KEY, enabled ? '1' : '0').catch(
    () => undefined,
  );
}

/**
 * A device-side copy of the journey's photo interval.
 *
 * The interval itself belongs to the journey, but the launch sync runs
 * before any screen has mounted and cannot read a React store, so the
 * chosen number is mirrored here whenever Settings sees it. Thirty days
 * is the fallback for the first launch after an install, and is corrected
 * the moment a screen that knows the real answer appears.
 */
let reminderIntervalDays = 30;

export function currentReminderIntervalDays(): number {
  return reminderIntervalDays;
}

export function setReminderIntervalDays(days: number): void {
  if (!Number.isFinite(days) || days <= 0) return;
  if (days === reminderIntervalDays) return;
  reminderIntervalDays = days;
  AsyncStorage.setItem(REMINDER_INTERVAL_KEY, String(days)).catch(
    () => undefined,
  );
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
 * Whether this install's reminders already carry the stable identifiers.
 *
 * Earlier builds scheduled the same two reminders without an identifier,
 * so the operating system gave them generated UUIDs. `syncReminders` looks
 * the schedule up by identifier and would see none of them, so it would
 * schedule a second routine reminder and a second photo reminder on top of
 * the originals — every reminder twice, for good. One sweep, once per
 * install, clears whatever is there before the first identified sync.
 */
let reminderIdsAdopted = false;

/**
 * Brings the schedule in line with the switches, without ever raising the
 * system prompt: this runs moments after launch, where nobody has been
 * told what the prompt would be for. `syncReminders` only adds what is
 * missing, so a photo reminder already counting down is left alone rather
 * than restarted by every launch.
 */
async function bootstrapReminders(): Promise<void> {
  /*
   * The sweep is in a try of its own, and the flag is written before it
   * runs. Sharing one try with the sync below meant a failed setItem took
   * the sync down with it AND left the flag absent, so the sweep would run
   * again on the next launch — cancelling and rebuilding the photo
   * reminder every day, which is precisely the restarted countdown the
   * one-time guard exists to avoid.
   */
  if (!reminderIdsAdopted) {
    reminderIdsAdopted = true;
    try {
      await AsyncStorage.setItem(REMINDER_IDS_KEY, '1');
      await cancelAllReminders();
    } catch {
      // Nothing schedulable, or the store refused the flag. Either way the
      // sync below still runs; the worst case is one stale duplicate.
    }
  }

  try {
    await syncReminders({
      routine: routineReminderEnabled,
      update: updateReminderEnabled,
      hour: reminderHour,
      intervalDays: reminderIntervalDays,
    });
  } catch {
    // Nothing schedulable in this runtime; the switches still read true.
  }
}

/**
 * Reads the cached preferences from disk. Called once while the launch
 * screen is still up, so nothing has had a chance to read a default yet.
 */
export async function loadDevicePreferences(): Promise<void> {
  try {
    const [haptics, hour, ask, routine, update, interval, ids, offered, diagnostics] =
      await AsyncStorage.multiGet([
        HAPTICS_KEY,
        REMINDER_HOUR_KEY,
        PAYWALL_ASK_KEY,
        ROUTINE_REMINDER_KEY,
        UPDATE_REMINDER_KEY,
        REMINDER_INTERVAL_KEY,
        REMINDER_IDS_KEY,
        REMINDER_PROMPT_KEY,
        SCAN_DIAGNOSTICS_KEY,
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
    // Absent means never chosen, which is on; only an explicit '0' is off.
    routineReminderEnabled = routine[1] !== '0';
    updateReminderEnabled = update[1] !== '0';
    const days = Number(interval[1]);
    if (Number.isFinite(days) && days > 0) reminderIntervalDays = days;
    reminderIdsAdopted = ids[1] === '1';
    remindersOffered = offered[1] === '1';
    // Off unless somebody has deliberately turned it on.
    scanDiagnostics = diagnostics[1] === '1';
  } catch {
    // Defaults are already in place; an unreadable store is not an error.
  }

  /*
   * Deliberately after the current tick rather than inside it. The
   * notifications module is required synchronously on the first call into
   * it, and this function is awaited by the splash — so doing the work
   * here would put a native module load on the boot critical path of every
   * launch, including the launches of people who will never allow a
   * notification.
   */
  setTimeout(() => {
    void bootstrapReminders();
  }, 0);
}

/* ------------------------- the reminder prompt ------------------------- */

let remindersOffered = false;

/**
 * Whether the app has already offered to turn reminders on.
 *
 * The reminder switches default to on, but a default is not permission:
 * iOS and Android still have to ask, and the prompt can only be shown
 * once per install. Asking at launch, before anybody knows what the app
 * is for, is the reliable way to be told no for ever — so the ask comes
 * at the end of the funnel, once the person has said what they want to
 * keep a record of, and the first report asks instead if the funnel did
 * not. This flag is what stops it being asked a second time.
 */
export function remindersAlreadyOffered(): boolean {
  return remindersOffered;
}

export async function markRemindersOffered(): Promise<void> {
  remindersOffered = true;
  await AsyncStorage.setItem(REMINDER_PROMPT_KEY, '1').catch(() => undefined);
}
