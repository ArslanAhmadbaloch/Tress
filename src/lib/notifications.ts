/**
 * Local reminders.
 *
 * Two kinds, both scheduled on-device: a daily routine nudge and a
 * photo-update reminder on the user's chosen interval. Nothing is
 * scheduled until the user turns it on and the OS grants permission.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const ROUTINE_HOUR = 20;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      // Android 8+ requires a channel before anything will surface.
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

export async function scheduleRoutineReminder(): Promise<void> {
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
  } catch {
    // A failed schedule should never break the settings toggle.
  }
}

export async function scheduleUpdateReminder(intervalDays: number): Promise<void> {
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
  } catch {
    // As above — best effort.
  }
}

export async function cancelAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Nothing to do.
  }
}
