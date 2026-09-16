/**
 * Local reminders.
 *
 * Two kinds, both scheduled on-device: a daily routine nudge and a
 * photo-update reminder on the user's chosen interval. Both switches are
 * on from the first launch (see `device-preferences`), but a switch is not
 * permission: nothing reaches the lock screen until the operating system
 * has granted it, and this module never schedules without checking.
 *
 * Loading is deliberately lazy. `expo-notifications` throws from its own
 * module body on Android inside Expo Go — remote-notification support was
 * pulled from Expo Go in SDK 53 — so a top-level import would crash any
 * route that touches this file. Requiring it behind a guard keeps the app
 * usable in Expo Go and gives the UI something honest to display.
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** Expo Go on Android cannot load the notifications module at all. */
const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const remindersSupported = !(IS_EXPO_GO && Platform.OS === 'android');

export const remindersUnavailableReason = remindersSupported
  ? null
  : 'Reminders need a development build. They will work in the installed app.';

/**
 * Stable identifiers, so the schedule can be read back and compared.
 *
 * Without them every sync would have to cancel everything and schedule it
 * again, which restarts the photo reminder's countdown — an interval
 * reminder rebuilt on every launch fires the day the phone is left alone,
 * which is the one day it is not needed.
 *
 * Builds before these identifiers existed scheduled the same two reminders
 * under generated UUIDs, which `syncReminders` cannot see. That is what the
 * one-time sweep in `device-preferences` is for: without it those installs
 * would quietly collect a second copy of each reminder.
 */
const ROUTINE_ID = 'tress.reminder.routine';
const UPDATE_ID = 'tress.reminder.update';

/** What the two switches would like scheduled, if permission allows it. */
export type ReminderPlan = {
  routine: boolean;
  update: boolean;
  hour: number;
  intervalDays: number;
};

/**
 * `undetermined` is a prompt that has never been shown; `denied` is one
 * that has been answered no, or notifications switched off for the app in
 * the system settings. Only the system settings can undo `denied`.
 */
export type NotificationPermission =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

/** Returns the module, or null if it cannot be loaded in this runtime. */
function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;

  if (!remindersSupported) {
    cached = null;
    return cached;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    cached = mod;
  } catch {
    cached = null;
  }

  return cached;
}

/** Reads the current permission without ever raising the system prompt. */
export async function notificationPermissionStatus(): Promise<NotificationPermission> {
  const Notifications = getNotifications();
  if (!Notifications) return 'unsupported';

  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return 'granted';
    return existing.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;

  try {
    if (Platform.OS === 'android') {
      // Android 8+ needs a channel before anything will surface.
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/** Fires daily at the hour the user picked in settings. */
export async function scheduleRoutineReminder(hour: number): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: ROUTINE_ID,
      content: {
        title: 'Routine reminder',
        /*
         * The scheduler cannot read the store, so it does not know whether
         * there is anything in the stack — a routine can legitimately be
         * empty. So this says what it knows for certain: the hour they
         * chose has come round. It never asserts that something is waiting.
         */
        body: 'This is the time you asked to be reminded.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * The photo reminder, on a repeating interval.
 *
 * The copy says nothing about when the next set is *due*, because this
 * trigger cannot know: it counts from the moment it was scheduled, which
 * is whenever permission was granted, not from the last capture. Only
 * re-anchoring it on a saved session — `reanchorUpdateReminder` — lines
 * the two up, so until every capture does that the wording has to stay a
 * nudge rather than a statement of fact.
 */
export async function scheduleUpdateReminder(
  intervalDays: number,
): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: UPDATE_ID,
      content: {
        title: 'Photo day',
        body: 'Time for your next set of five angles.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: intervalDays * 86_400,
        repeats: true,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelAllReminders(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Nothing scheduled, or the module is unavailable — either is fine.
  }
}

/** Cancels one reminder by identifier; a missing one is not an error. */
async function cancelReminder(
  Notifications: NotificationsModule,
  id: string,
): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Nothing was scheduled under that identifier.
  }
}

/**
 * Makes the schedule match the plan, and never raises the system prompt.
 *
 * Additive on purpose: it schedules what is missing and cancels what is no
 * longer wanted, leaving anything already correct exactly where it is. Use
 * `rescheduleReminders` when the hour or the interval itself has changed.
 *
 * Returns whether the plan is actually running. `false` means the phone is
 * refusing — the switches stay where the person put them, and the screen
 * that asked is expected to say so rather than pretend.
 */
export async function syncReminders(plan: ReminderPlan): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;

  let scheduled: Set<string>;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    scheduled = new Set(all.map((n) => n.identifier));
  } catch {
    scheduled = new Set();
  }

  /*
   * Turning a reminder off is honoured before the permission is checked,
   * and deliberately so. Revoking notifications in the system settings
   * does not cancel what is already pending — it only stops delivery — so
   * somebody who revokes, then comes here and switches a reminder off,
   * then allows notifications again would otherwise be buzzed by the
   * reminder they had just turned off. Cancelling needs no permission.
   */
  if (!plan.routine && scheduled.has(ROUTINE_ID)) {
    await cancelReminder(Notifications, ROUTINE_ID);
  }
  if (!plan.update && scheduled.has(UPDATE_ID)) {
    await cancelReminder(Notifications, UPDATE_ID);
  }

  if ((await notificationPermissionStatus()) !== 'granted') return false;

  if (plan.routine && !scheduled.has(ROUTINE_ID)) {
    await scheduleRoutineReminder(plan.hour);
  }
  if (plan.update && !scheduled.has(UPDATE_ID)) {
    await scheduleUpdateReminder(plan.intervalDays);
  }

  return true;
}

/** Tears both reminders down and builds them again on the new terms. */
export async function rescheduleReminders(plan: ReminderPlan): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;

  await cancelReminder(Notifications, ROUTINE_ID);
  await cancelReminder(Notifications, UPDATE_ID);
  return syncReminders(plan);
}

/**
 * Rebuilds the daily routine reminder alone, on a new hour.
 *
 * The hour governs the daily trigger and nothing else, so rebuilding both
 * would re-anchor the photo reminder's interval to now — somebody trying
 * Morning, then Midday, then Evening would push photo day out by a full
 * interval on each tap. That is the exact failure the stable identifiers
 * exist to prevent, so the hour never touches UPDATE_ID.
 */
export async function rescheduleRoutineReminder(
  plan: ReminderPlan,
): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;

  await cancelReminder(Notifications, ROUTINE_ID);
  if ((await notificationPermissionStatus()) !== 'granted') return false;
  if (!plan.routine) return true;
  return scheduleRoutineReminder(plan.hour);
}

/**
 * Restarts the photo reminder's countdown from now.
 *
 * Called when a set of photographs has just been saved: that moment, and
 * only that moment, is what the interval is measured from. The routine
 * reminder is left alone — it is a daily clock and has nothing to do with
 * a capture.
 */
export async function reanchorUpdateReminder(
  plan: ReminderPlan,
): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  if ((await notificationPermissionStatus()) !== 'granted') return false;

  await cancelReminder(Notifications, UPDATE_ID);
  if (!plan.update) return true;
  return scheduleUpdateReminder(plan.intervalDays);
}

/**
 * The only path that raises the system prompt, and it is always somebody's
 * own deliberate action that gets here.
 *
 * Chosen moments, in the brief's own words, are "the screen that offers
 * the reminder" and "just after the first photograph is saved". The
 * Settings screen is wired to this today (the reminder card's "Allow
 * notifications" button, and switching a reminder on); the capture flow
 * wants the same call once a first session is saved, which is why this is
 * written to be callable from either.
 *
 * What it deliberately does not do is fire at launch. At first launch the
 * prompt arrives before anybody knows what the app does, which is an App
 * Store review risk and, worse, the surest way to a permanent "Don't
 * Allow" — iOS only ever asks once, and a no there can only be undone by a
 * trip into the system settings that almost nobody makes.
 *
 * Returns whether reminders are now actually running.
 */
export async function enableRemindersWithPrompt(
  plan: ReminderPlan,
): Promise<boolean> {
  if (!plan.routine && !plan.update) return false;

  const status = await notificationPermissionStatus();
  if (status === 'unsupported' || status === 'denied') return false;
  if (status === 'undetermined') {
    const granted = await requestNotificationPermission();
    if (!granted) return false;
  }

  return syncReminders(plan);
}
