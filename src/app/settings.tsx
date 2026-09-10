import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { SectionHeader, Separator } from '@/components/ui/layout';
import { OptionCard } from '@/components/ui/option-card';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { clearAllPhotos, formatBytes, photoStorageBytes } from '@/lib/photo-storage';
import {
  cancelAllReminders,
  requestNotificationPermission,
  scheduleRoutineReminder,
  scheduleUpdateReminder,
} from '@/lib/notifications';
import { useAppStore } from '@/store/app-store';
import { useTheme, type AppearancePreference } from '@/theme';
import type { Visibility } from '@/types/domain';

const APPEARANCE: { value: AppearancePreference; label: string }[] = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const VISIBILITY: { value: Visibility; label: string; description: string }[] = [
  {
    value: 'private',
    label: 'Private',
    description: 'Only you can see your journey. Nothing is shared.',
  },
  {
    value: 'followers',
    label: 'Followers',
    description: 'People you approve can see your journey.',
  },
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone in the community can find your journey.',
  },
];

const INTERVALS = [14, 30, 60, 90];

export default function SettingsScreen() {
  const { colors, spacing, radius, preference, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, updateJourney, setVisibility, resetAll } = useAppStore();

  const [routineReminder, setRoutineReminder] = useState(false);
  const [updateReminder, setUpdateReminder] = useState(false);
  const [storage, setStorage] = useState(0);

  useEffect(() => {
    setStorage(photoStorageBytes());
  }, [data.sessions]);

  const journey = data.journey;
  if (!journey) return null;

  const toggleRoutineReminder = async (next: boolean) => {
    if (!next) {
      setRoutineReminder(false);
      await cancelAllReminders();
      if (updateReminder) await scheduleUpdateReminder(journey.updateIntervalDays);
      return;
    }

    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert(
        'Notifications are off',
        'Turn on notifications for Hair Journey in your device Settings to get reminders.',
      );
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
      Alert.alert(
        'Notifications are off',
        'Turn on notifications for Hair Journey in your device Settings to get reminders.',
      );
      return;
    }
    await scheduleUpdateReminder(journey.updateIntervalDays);
    setUpdateReminder(true);
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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxxl,
        }}>
        <SectionHeader title="Appearance" />
        <View style={{ gap: spacing.sm }}>
          {APPEARANCE.map((option) => (
            <OptionCard
              key={option.value}
              label={option.label}
              multi={false}
              selected={preference === option.value}
              onPress={() => setPreference(option.value)}
            />
          ))}
        </View>

        <SectionHeader title="Reminders" />
        <Card padded={false}>
          <ToggleRow
            icon="checkCircle"
            label="Daily routine reminder"
            detail="A nudge each evening at 8pm"
            value={routineReminder}
            onChange={toggleRoutineReminder}
          />
          <Separator inset={56} />
          <ToggleRow
            icon="camera"
            label="Photo update reminder"
            detail={`Every ${journey.updateIntervalDays} days`}
            value={updateReminder}
            onChange={toggleUpdateReminder}
          />
        </Card>

        <SectionHeader title="Update interval" />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {INTERVALS.map((days) => {
            const active = journey.updateIntervalDays === days;
            return (
              <PressableScale
                key={days}
                onPress={() => updateJourney({ updateIntervalDays: days })}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Every ${days} days`}
                style={{
                  flex: 1,
                  paddingVertical: spacing.md,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  backgroundColor: active ? colors.accent : colors.fill,
                }}>
                <Text variant="subhead" color={active ? 'textOnAccent' : 'textSecondary'}>
                  {days}d
                </Text>
              </PressableScale>
            );
          })}
        </View>

        <SectionHeader title="Privacy" />
        <View style={{ gap: spacing.sm }}>
          {VISIBILITY.map((option) => (
            <OptionCard
              key={option.value}
              label={option.label}
              description={option.description}
              multi={false}
              selected={journey.visibility === option.value}
              onPress={() => setVisibility(option.value)}
            />
          ))}
        </View>

        <SectionHeader title="Data" />
        <Card>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Icon name="photo" size={19} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text variant="body">Photos on this device</Text>
              <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
                {data.sessions.length} sessions · {formatBytes(storage)}
              </Text>
            </View>
          </View>
          <Text variant="footnote" color="textTertiary" style={{ marginTop: spacing.md }}>
            Your photos never leave this device. There is no account and no
            upload in this version.
          </Text>
        </Card>

        <Button
          label="Delete all my data"
          variant="destructive"
          style={{ marginTop: spacing.xl }}
          onPress={confirmDeleteAll}
        />

        <View
          style={{
            marginTop: spacing.xxl,
            padding: spacing.lg,
            borderRadius: radius.md,
            backgroundColor: colors.backgroundSubtle,
            flexDirection: 'row',
            gap: spacing.md,
          }}>
          <Icon name="info" size={17} color={colors.textTertiary} />
          <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
            Hair Journey is a tracking and documentation tool. It does not
            diagnose conditions, recommend treatments or provide medical
            advice. Always consult a qualified healthcare professional.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function ToggleRow({
  icon,
  label,
  detail,
  value,
  onChange,
}: {
  icon: 'checkCircle' | 'camera';
  label: string;
  detail: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
      }}>
      <Icon name={icon} size={19} color={colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
          {detail}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.fill }}
        accessibilityLabel={label}
      />
    </View>
  );
}
