import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';
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
  REMINDER_HOURS,
  REMINDER_HOUR_LABELS,
  REMINDER_HOUR_TIMES,
  currentReminderHour,
  currentReminderIntervalDays,
  hapticsAreEnabled,
  routineReminderIsEnabled,
  setHapticsEnabled,
  setReminderHour,
  setReminderIntervalDays,
  setRoutineReminderEnabled,
  setUpdateReminderEnabled,
  updateReminderIsEnabled,
  type ReminderHour,
  scanDiagnosticsOn,
  setScanDiagnostics,
} from '@/lib/device-preferences';
import { clearAllPhotos, formatBytes, photoStorageBytes } from '@/lib/photo-storage';
import {
  cancelAllReminders,
  enableRemindersWithPrompt,
  notificationPermissionStatus,
  remindersSupported,
  remindersUnavailableReason,
  rescheduleReminders,
  rescheduleRoutineReminder,
  syncReminders,
  type NotificationPermission,
  type ReminderPlan,
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
import { SubscriptionStatus } from '@/components/subscription/subscription-status';
import { useAppStore } from '@/store/app-store';
import { useAppLock } from '@/store/lock-provider';
import { useTheme, type AppearancePreference } from '@/theme';
import { GENDER_LABELS, type Gender } from '@/types/domain';

const APPEARANCE: { value: AppearancePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Days between photo-update reminders. */
const INTERVALS = [14, 30, 60, 90];

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: GENDER_LABELS.male },
  { value: 'female', label: GENDER_LABELS.female },
];

export default function SettingsScreen() {
  const { spacing, preference, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, updateJourney, updateProfile, resetAll } = useAppStore();
  const lock = useAppLock();

  // Both switches start from what is stored, and storage starts them on.
  // Because they already read on, nobody has a switch left to flip — so the
  // card below carries its own "Allow notifications" action, which is the
  // route to the system prompt for anyone who opens this screen.
  const [routineReminder, setRoutineReminder] = useState(routineReminderIsEnabled);
  const [updateReminder, setUpdateReminder] = useState(updateReminderIsEnabled);
  // Null until the first read comes back: showing "your phone is blocking
  // these" for a frame, before anything has been asked, would be a lie.
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [reminderAt, setReminderAt] = useState<ReminderHour>(currentReminderHour);
  const [haptics, setHaptics] = useState(hapticsAreEnabled);
  const [diagnostics, setDiagnostics] = useState(scanDiagnosticsOn);
  // The passcode sheet writes to the keychain and closes; this screen has
  // to re-read on the way back or its toggle would still say "off".
  const refreshLock = lock.refresh;
  const intervalDays = data.journey?.updateIntervalDays;
  useFocusEffect(
    useCallback(() => {
      refreshLock();

      // The launch sync runs before any screen exists and cannot read the
      // journey, so the interval it schedules on is mirrored from here.
      if (intervalDays) setReminderIntervalDays(intervalDays);

      // Notifications can be switched off for the app while this screen is
      // in the background, so the row cannot trust what it read last time.
      let alive = true;
      notificationPermissionStatus().then((status) => {
        if (alive) setPermission(status);
      });
      return () => {
        alive = false;
      };
    }, [refreshLock, intervalDays]),
  );

  /*
   * The return journey from the system Settings app.
   *
   * Sending somebody there is only half a route: backgrounding the app
   * does not blur a focused screen, so the effect above never re-runs when
   * they come back. Without this, a person who taps "Open device settings",
   * allows notifications and returns sees a card still telling them they
   * are blocked, with nothing scheduled, until the next cold launch.
   *
   * It re-reads the phone's answer and, if it has become yes, brings the
   * schedule in line with the switches. It never prompts — syncReminders
   * cannot — so returning from anywhere else is silent and free.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      notificationPermissionStatus()
        .then((status) => {
          setPermission(status);
          if (status !== 'granted') return undefined;
          return syncReminders({
            routine: routineReminderIsEnabled(),
            update: updateReminderIsEnabled(),
            hour: currentReminderHour(),
            intervalDays: intervalDays ?? currentReminderIntervalDays(),
          });
        })
        .catch(() => undefined);
    });
    return () => sub.remove();
  }, [intervalDays]);

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

  /**
   * The plan the two switches describe right now. Built from arguments
   * rather than read back out of state, so a toggle that has just flipped
   * schedules on its new value instead of the render it came from.
   */
  const plan = (over: Partial<ReminderPlan>): ReminderPlan => ({
    routine: routineReminder,
    update: updateReminder,
    hour: reminderAt,
    intervalDays: journey.updateIntervalDays,
    ...over,
  });

  const openSystemSettings = () => {
    Linking.openSettings().catch(() => undefined);
  };

  /**
   * The switch is the app's own preference and stays where it was put; the
   * alert exists because the phone, not the app, is the thing saying no.
   */
  const explainBlocked = (status: NotificationPermission) =>
    Alert.alert(
      status === 'denied'
        ? 'Your phone is blocking reminders'
        : 'Reminders are not allowed yet',
      status === 'denied'
        ? 'Notifications are turned off for Tress. The reminder is saved, but nothing can be delivered until you allow them in your device settings.'
        : 'The reminder is saved, but nothing can be delivered until notifications are allowed for Tress.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: openSystemSettings },
      ],
    );

  /**
   * Asks the OS only when a switch is being turned on, and only when the
   * prompt has never been answered. A refusal is reported, never retried.
   */
  const applyReminders = async (next: ReminderPlan, wantsOn: boolean) => {
    if (wantsOn) await enableRemindersWithPrompt(next);
    else await syncReminders(next);

    const status = await notificationPermissionStatus();
    setPermission(status);
    if (wantsOn && status !== 'granted' && status !== 'unsupported') {
      explainBlocked(status);
    }
  };

  /**
   * The route to the system prompt for the person who never touches a
   * switch — which, now that both start on, is nearly everybody who opens
   * this screen. It sits under an explanation of what it is for, so the
   * prompt arrives as the answer to a sentence somebody has just read.
   * A refusal needs no alert: the card rewrites itself to say so.
   */
  const allowNotifications = async () => {
    await enableRemindersWithPrompt(plan({}));
    setPermission(await notificationPermissionStatus());
  };

  const toggleRoutineReminder = async (next: boolean) => {
    setRoutineReminder(next);
    setRoutineReminderEnabled(next);
    await applyReminders(plan({ routine: next }), next);
  };

  const toggleUpdateReminder = async (next: boolean) => {
    setUpdateReminder(next);
    setUpdateReminderEnabled(next);
    await applyReminders(plan({ update: next }), next);
  };

  const chooseReminderHour = (hour: ReminderHour) => {
    setReminderAt(hour);
    setReminderHour(hour);
    // A new hour means the daily trigger has to be built again — and only
    // that one. Rebuilding the photo reminder too would restart its
    // interval from now, so trying all three hours would push photo day
    // out by three intervals.
    rescheduleRoutineReminder(plan({ hour })).catch(() => undefined);
  };

  const chooseInterval = (days: number) => {
    updateJourney({ updateIntervalDays: days });
    setReminderIntervalDays(days);
    rescheduleReminders(plan({ intervalDays: days })).catch(() => undefined);
  };

  const toggleHaptics = (next: boolean) => {
    setHaptics(next);
    setHapticsEnabled(next);
  };

  const toggleDiagnostics = (next: boolean) => {
    setDiagnostics(next);
    setScanDiagnostics(next);
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

        <SectionHeader title="Subscription" />
        <SubscriptionStatus />

        {/*
          The gender picks whose head the example photographs show — the
          labelled sample on Home before there is a comparison, and the
          example frame in the funnel. The Hair Scan reads nothing from it:
          the scanner follows whoever is in front of the camera.
        */}
        <SectionHeader title="Example photos" />
        <SettingsGroup>
          <SettingsField
            icon="camera"
            label="Examples"
            detail="Whose head the example photographs show.">
            <SegmentedTabs
              surface="fill"
              options={GENDERS}
              value={data.profile?.gender ?? 'male'}
              onChange={(next) => updateProfile({ gender: next as Gender })}
            />
          </SettingsField>
        </SettingsGroup>
        <SettingsNote icon="info">
          This only changes the example photographs. Your own scans are
          untouched, and the scan itself does not use it.
        </SettingsNote>

        <SectionHeader title="Appearance" />
        <SettingsGroup>
          <SettingsField
            icon="sun"
            label="Theme"
            detail="Light unless you choose otherwise. It stays where you put it.">
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
          {/*
            For working out why a scan looked the way it did. The cap is
            fitted to the hair only when a long chain holds, and a dome
            and a fitted cap are hard to tell apart on a photograph of a
            head; with this on the scanner says which one it drew.
          */}
          <ToggleRow
            icon="search"
            label="Scan diagnostics"
            detail="Shows what the scanner is reading while it runs."
            value={diagnostics}
            onChange={toggleDiagnostics}
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
            detail="How much time passes before your next scan is due.">
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
        {/*
          The switches above are the app's own preference, and permission is
          the phone's. Two different sentences, so two different cards: one
          asks, because nobody has been asked yet; the other explains, and
          points at the only place that can undo a refusal. Blaming the
          phone for a prompt the app never raised would be neither.
        */}
        {remindersSupported &&
        permission !== null &&
        permission !== 'granted' &&
        permission !== 'unsupported' &&
        (routineReminder || updateReminder) ? (
          <>
            <SettingsNote icon="info">
              {/*
                It says notifications are not allowed yet, not that the
                phone has never been asked. On Android 13+ a declined
                POST_NOTIFICATIONS prompt leaves `canAskAgain` true, so
                this branch is also reached straight after somebody has
                been asked and said no; telling them the app never asked
                would be false on that path.
              */}
              {permission === 'undetermined'
                ? 'These reminders are on, but notifications are not allowed for Tress yet. Nothing is delivered until they are.'
                : 'Your phone is not showing notifications for Tress, so these reminders are saved but nothing is being delivered.'}
            </SettingsNote>
            <Button
              label={
                permission === 'undetermined'
                  ? 'Allow notifications'
                  : 'Open device settings'
              }
              variant="secondary"
              style={{ marginTop: spacing.sm }}
              onPress={
                permission === 'undetermined'
                  ? allowNotifications
                  : openSystemSettings
              }
            />
          </>
        ) : null}

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
          <InfoRow
            icon="shield"
            label="Privacy"
            detail="What is stored, and where"
            onPress={() => router.push('/privacy')}
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
          Tress is a tracking and documentation tool. It does not
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
