/**
 * Local reminders.
 *
 * Two kinds, both scheduled on-device: a daily routine nudge and a
 * photo-update reminder on the user's chosen interval. Nothing is
 * scheduled until the user turns it on and the OS grants permission.
 *
 * Loading is deliberately lazy. `expo-notifications` throws from its own
 * module body on Android inside Expo Go — remote-notification support was
 * pulled from Expo Go in SDK 53 — so a top-level import would crash any
 * route that touches this file. Requiring it behind a guard keeps the app
 * usable in Expo Go and gives the UI something honest to display.
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

const ROUTINE_HOUR = 20;

/** Expo Go on Android cannot load the notifications module at all. */
const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const remindersSupported = !(IS_EXPO_GO && Platform.OS === 'android');

export const remindersUnavailableReason = remindersSupported
  ? null
  : 'Reminders need a development build. They will work in the installed app.';

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

export async function scheduleRoutineReminder(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your hair routine',
        body: "Tick off today's routine to keep your streak going.",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: ROUTINE_HOUR,
        minute: 0,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function scheduleUpdateReminder(
  intervalDays: number,
): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time for a photo update',
        body: 'Capture your five angles to see how your hair has changed.',
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
