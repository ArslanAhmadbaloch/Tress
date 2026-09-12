import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  InfoRow,
  RowDivider,
  SettingsField,
  SettingsGroup,
  SettingsNote,
  ToggleRow,
} from '@/components/settings-rows';
import { Button } from '@/components/ui/button';
import {
  Screen,
  ScreenScroll,
  ScreenTitle,
  ScrollEdgeEffect,
  SectionHeader,
} from '@/components/ui/layout';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { Text } from '@/components/ui/text';
import {
  CAPTURE_TIMERS,
  REMINDER_HOURS,
  REMINDER_HOUR_LABELS,
  REMINDER_HOUR_TIMES,
  currentReminderHour,
  hapticsAreEnabled,
  loadCaptureTimer,
  saveCaptureTimer,
  setHapticsEnabled,
  setReminderHour,
  type CaptureTimer,
  type ReminderHour,
} from '@/lib/device-preferences';
import { clearAllPhotos, formatBytes, photoStorageBytes } from '@/lib/photo-storage';
import {
  cancelAllReminders,
  remindersSupported,
  remindersUnavailableReason,
  requestNotificationPermission,
  scheduleRoutineReminder,
  scheduleUpdateReminder,
} from '@/lib/notifications';
import {
  BIOMETRIC_LABELS,
  GRACE_DETAIL,
  GRACE_LABELS,
  GRACE_PERIODS,
  clearPasscode,
  setBiometricsEnabled,
  setGracePeriod,
  type GracePeriod,
} from '@/lib/app-lock';
import { useAppStore } from '@/store/app-store';
import { useAppLock } from '@/store/lock-provider';
import { useTheme, type AppearancePreference } from '@/theme';

const APPEARANCE: { value: AppearancePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Days between photo-update reminders. */
const INTERVALS = [14, 30, 60, 90];

const TIMER_LABELS: Record<CaptureTimer, string> = {
  0: 'Off',
  3: '3 seconds',
  5: '5 seconds',
};

export default function SettingsScreen() {
  const { spacing, preference, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, updateJourney, resetAll } = useAppStore();
  const lock = useAppLock();

  const [routineReminder, setRoutineReminder] = useState(false);
  const [updateReminder, setUpdateReminder] = useState(false);
  const [reminderAt, setReminderAt] = useState<ReminderHour>(currentReminderHour);
  const [haptics, setHaptics] = useState(hapticsAreEnabled);
  const [timer, setTimer] = useState<CaptureTimer>(0);

  useMemo(() => {
    loadCaptureTimer().then(setTimer);
  }, []);

  // The passcode sheet writes to the keychain and closes; this screen has
  // to re-read on the way back or its toggle would still say "off".
  const refreshLock = lock.refresh;
  useFocusEffect(
    useCallback(() => {
      refreshLock();
    }, [refreshLock]),
  );

  // Reading the directory size is synchronous and cheap; recompute it when
  // the session list changes rather than mirroring it into state.
  const storage = useMemo(
    () => photoStorageBytes(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.sessions.length],
  );

  const version = Constants.expoConfig?.version ?? '1.0.0';

  const journey = data.journey;
  if (!journey) return null;

  const permissionRefused = () =>
    Alert.alert(
      'Notifications are off',
      'Turn on notifications for Hair Journey in your device Settings to get reminders.',
    );

  const toggleRoutineReminder = async (next: boolean) => {
    if (!next) {
      setRoutineReminder(false);
      await cancelAllReminders();
      if (updateReminder) await scheduleUpdateReminder(journey.updateIntervalDays);
      return;
    }

    const granted = await requestNotificationPermission();
    if (!granted) {
      permissionRefused();
      return;
    }
    await scheduleRoutineReminder();
    setRoutineReminder(true);
  };

  const toggleUpdateReminder = async (next: boolean) => {
    if (!next) {
      setUpdateReminder(false);
      await cancelAllReminders();
      if (routineReminder) await scheduleRoutineReminder();
      return;
    }

    const granted = await requestNotificationPermission();
    if (!granted) {
      permissionRefused();
      return;
    }
    await scheduleUpdateReminder(journey.updateIntervalDays);
    setUpdateReminder(true);
  };

  /** Anything already scheduled has to be rebuilt on the new terms. */
  const reschedule = async () => {
    if (!routineReminder && !updateReminder) return;
    await cancelAllReminders();
    if (routineReminder) await scheduleRoutineReminder();
    if (updateReminder) await scheduleUpdateReminder(journey.updateIntervalDays);
  };

  const chooseReminderHour = (hour: ReminderHour) => {
    setReminderAt(hour);
    setReminderHour(hour);
    reschedule();
  };

  const chooseInterval = (days: number) => {
    updateJourney({ updateIntervalDays: days });
    if (updateReminder) {
      cancelAllReminders().then(() => {
        if (routineReminder) scheduleRoutineReminder();
        scheduleUpdateReminder(days);
      });
    }
  };

  const chooseTimer = (seconds: CaptureTimer) => {
    setTimer(seconds);
    saveCaptureTimer(seconds);
  };

  const toggleHaptics = (next: boolean) => {
    setHaptics(next);
    setHapticsEnabled(next);
  };

  const biometricLabel = BIOMETRIC_LABELS[lock.state.biometric];

  /**
   * Turning the lock on opens the setup sheet; the toggle only follows once
   * a passcode actually exists, so backing out of setup leaves it off
   * rather than claiming a lock that was never set.
   */
  const toggleLock = (next: boolean) => {
    if (next) {
      router.push('/passcode');
      return;
    }

    Alert.alert(
      'Turn off the passcode?',
      'Anyone who picks up your phone while it is unlocked will be able to open your journey.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off',
          style: 'destructive',
          onPress: async () => {
            await clearPasscode();
            await lock.refresh();
          },
        },
      ],
    );
  };

  const toggleBiometrics = async (next: boolean) => {
    setBiometricsEnabled(next);
    await lock.refresh();
  };

  const chooseGrace = async (seconds: GracePeriod) => {
    setGracePeriod(seconds);
    await lock.refresh();
  };

  const confirmDeleteAll = () => {
    Alert.alert(
      'Delete everything?',
      'Your journey, all photo sessions, routine history and notes will be permanently removed from this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            clearAllPhotos();
            await cancelAllReminders();
            await resetAll();
            router.replace('/onboarding');
          },
        },
      ],
    );
  };

  return (
    <Screen ground="plain">
      <ScreenScroll clearsTabBar={false} contentContainerStyle={{ paddingTop: spacing.giant }}>
        <ScreenTitle eyebrow="Profile" title="Your" titleMuted="settings" />

        <SectionHeader title="Appearance" />
        <SettingsGroup>
          <SettingsField
            icon="sun"
            label="Theme"
            detail="Follow your device, or pick one and stay there.">
            <SegmentedTabs
              surface="fill"
              options={APPEARANCE}
              value={preference}
              onChange={setPreference}
            />
          </SettingsField>
          <RowDivider />
          <ToggleRow
            icon="phone"
            label="Haptic feedback"
            detail="A small tap when something responds to you."
            value={haptics}
            onChange={toggleHaptics}
          />
        </SettingsGroup>

        <SectionHeader title="Reminders" />
        <SettingsGroup>
          <ToggleRow
            icon="checkCircle"
            label="Daily routine reminder"
            detail={remindersUnavailableReason ?? REMINDER_HOUR_TIMES[reminderAt]}
            value={routineReminder}
            disabled={!remindersSupported}
            onChange={toggleRoutineReminder}
          />
          <RowDivider />
          <SettingsField icon="clock" label="Time of day">
            <SegmentedTabs
              surface="fill"
              options={REMINDER_HOURS.map((hour) => ({
                value: String(hour),
                label: REMINDER_HOUR_LABELS[hour],
              }))}
              value={String(reminderAt)}
              onChange={(next) => chooseReminderHour(Number(next) as ReminderHour)}
            />
          </SettingsField>
          <RowDivider />
          <ToggleRow
            icon="camera"
            label="Photo update reminder"
            detail={
              remindersUnavailableReason ?? `Every ${journey.updateIntervalDays} days`
            }
            value={updateReminder}
            disabled={!remindersSupported}
            onChange={toggleUpdateReminder}
          />
          <RowDivider />
          <SettingsField
            icon="calendar"
            label="How often"
            detail="How much time passes before your next set of photos is due.">
            <SegmentedTabs
              surface="fill"
              options={INTERVALS.map((days) => ({
                value: String(days),
                label: `${days} days`,
              }))}
              value={String(journey.updateIntervalDays)}
              onChange={(next) => chooseInterval(Number(next))}
            />
          </SettingsField>
        </SettingsGroup>
        {remindersUnavailableReason ? (
          <SettingsNote icon="info">{remindersUnavailableReason}</SettingsNote>
        ) : null}

        <SectionHeader title="Capture" />
        <SettingsGroup>
          <SettingsField
            icon="retake"
            label="Self-timer"
            detail="A countdown before each shot, so you can get into position.">
            <SegmentedTabs
              surface="fill"
              options={CAPTURE_TIMERS.map((seconds) => ({
                value: String(seconds),
                label: TIMER_LABELS[seconds],
              }))}
              value={String(timer)}
              onChange={(next) => chooseTimer(Number(next) as CaptureTimer)}
            />
          </SettingsField>
        </SettingsGroup>
        <SettingsNote>
          The top and back angles are shot blind, so a few seconds to settle
          the phone makes them far easier to repeat.
        </SettingsNote>

        <SectionHeader title="Security" />
        <SettingsGroup>
          <ToggleRow
            icon="lock"
            label="Require a passcode"
            detail={
              lock.state.enabled
                ? 'Asked for when you open the app.'
                : 'Six digits, kept in this device’s keychain.'
            }
            value={lock.state.enabled}
            onChange={toggleLock}
          />
          {lock.state.enabled ? (
            <>
              <RowDivider />
              <ToggleRow
                icon="profile"
                label={`Unlock with ${biometricLabel}`}
                detail={
                  lock.state.biometric === 'none'
                    ? `${biometricLabel} is not set up on this device.`
                    : 'Your passcode still works whenever it fails.'
                }
                value={lock.state.biometricsEnabled}
                disabled={lock.state.biometric === 'none'}
                onChange={toggleBiometrics}
              />
              <RowDivider />
              <SettingsField
                icon="clock"
                label="Lock again"
                detail={GRACE_DETAIL[lock.state.grace]}>
                <SegmentedTabs
                  surface="fill"
                  options={GRACE_PERIODS.map((seconds) => ({
                    value: String(seconds),
                    label: GRACE_LABELS[seconds],
                  }))}
                  value={String(lock.state.grace)}
                  onChange={(next) => chooseGrace(Number(next) as GracePeriod)}
                />
              </SettingsField>
              <RowDivider />
              <InfoRow
                icon="pencil"
                label="Change passcode"
                onPress={() => router.push({ pathname: '/passcode', params: { mode: 'change' } })}
              />
            </>
          ) : null}
        </SettingsGroup>
        <SettingsNote icon="info">
          The passcode keeps other people out of the app. It is not
          encryption — your photos sit in this app’s own storage, protected
          by your device passcode, and nothing here can recover the code if
          you forget it.
        </SettingsNote>

        <SectionHeader title="Data" />
        <SettingsGroup>
          <InfoRow
            icon="photo"
            label="Photos on this device"
            detail={`${data.sessions.length} ${data.sessions.length === 1 ? 'session' : 'sessions'}`}
            value={formatBytes(storage)}
          />
          <RowDivider />
          <InfoRow icon="info" label="Version" value={version} />
        </SettingsGroup>

        <Button
          label="Delete all my data"
          variant="destructive"
          style={{ marginTop: spacing.lg }}
          onPress={confirmDeleteAll}
        />

        <Text
          variant="footnote"
          color="textSecondary"
          style={{ marginTop: spacing.xxl, paddingHorizontal: spacing.xs }}>
          Hair Journey is a tracking and documentation tool. It does not
          diagnose conditions, recommend treatments or provide medical advice.
          Always consult a qualified healthcare professional.
        </Text>
      </ScreenScroll>

      {/*
        The back control floats over the content on a transparent header,
        so the content has to dissolve before it reaches it — otherwise a
        card scrolls up behind the chevron and the two read as one shape.
      */}
      <ScrollEdgeEffect height={insets.top + spacing.huge} />
    </Screen>
  );
}
