/**
 * The privacy policy, in the app.
 *
 * App Store review expects a policy reachable from inside the app, not
 * only a URL pasted into App Store Connect. For most apps that means a
 * link out to a web page. This one can say the whole thing here, because
 * the honest version is short: nothing leaves the device.
 *
 * Every claim below is a fact about the code, not an intention. There is
 * no network layer in this app at all — no fetch, no analytics SDK, no
 * crash reporter, no advertising identifier. If any of that changes, this
 * screen is wrong and has to change with it.
 */

import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Screen, ScreenScroll, ScreenTitle } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What we collect',
    body: 'Nothing. Tress has no account, no sign-in and no server. We cannot see your data because it is never sent to us.',
  },
  {
    title: 'Where your data lives',
    body: 'Your photographs, routine, journal and answers are stored in the app’s private storage on this device, and are included in your device backup if you have one turned on. Deleting the app deletes them.',
  },
  {
    title: 'Your photographs',
    body: 'Photos you take in the app are written straight to that private storage. They are not uploaded, not analysed, and not shared with anyone. They are not added to your camera roll unless you save one yourself.',
  },
  {
    title: 'Artificial intelligence',
    body: 'None. Tress does not send your photographs or anything else to an AI service. It does not assess your hair, diagnose anything, or generate advice — it stores what you record and shows it back to you.',
  },
  {
    title: 'Analytics and tracking',
    body: 'None. There is no analytics SDK, no crash reporting, no advertising identifier and no third-party tracker in this app.',
  },
  {
    title: 'Permissions we ask for',
    body: 'The camera, to take your progress photos. Your photo library, only if you choose a picture for your card. Face ID or your passcode, only if you turn on the app lock. Notifications, only if you turn on reminders. Each is asked for at the moment you first use it, and the app works without any of them.',
  },
  {
    title: 'Sharing',
    body: 'Only when you ask. Saving or sharing your card hands that one image to the iOS share sheet, and where it goes from there is your choice.',
  },
  {
    title: 'Deleting your data',
    body: 'Settings has "Delete all my data", which permanently removes every photograph, entry and setting from this device. There is no copy anywhere else for us to delete.',
  },
  {
    title: 'Children',
    body: 'Tress is not directed at children under 13.',
  },
];

export default function PrivacyScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <ScreenScroll>
        <ScreenTitle
          eyebrow="Privacy"
          title="Everything stays"
          titleMuted="on this device"
          subtitle="The short version: there is no server, so there is nothing to send."
          trailing={
            <PressableScale
              hitSlop={4}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}>
              <Icon name="close" size={15} color={colors.text} />
            </PressableScale>
          }
        />

        <View style={{ gap: spacing.xl, marginTop: spacing.lg }}>
          {SECTIONS.map((section) => (
            <View key={section.title}>
              <Text variant="headline" accessibilityRole="header">
                {section.title}
              </Text>
              <Text
                variant="callout"
                color="textSecondary"
                style={{ marginTop: spacing.xs }}>
                {section.body}
              </Text>
            </View>
          ))}
        </View>

        <Text
          variant="footnote"
          color="textTertiary"
          style={{ marginTop: spacing.xxl, marginBottom: spacing.lg }}>
          Tress is a tracking and documentation tool. It is not a
          medical device and does not provide medical advice.
        </Text>
      </ScreenScroll>
    </Screen>
  );
}
