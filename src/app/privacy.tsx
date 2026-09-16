/**
 * The privacy policy, in the app.
 *
 * App Store review expects a policy reachable from inside the app, not
 * only a URL pasted into App Store Connect. For most apps that means a
 * link out to a web page. This one can say the whole thing here, because
 * the honest version is short: nothing about you leaves the device.
 *
 * Every claim below is a fact about the code, not an intention. The app
 * makes exactly one kind of network request of its own: a product barcode
 * lookup to Open Beauty Facts (src/features/products/open-beauty-facts.ts),
 * which sends the barcode digits and nothing else. There is no analytics
 * SDK, no crash reporter, no advertising identifier. If any of that
 * changes, this screen is wrong and has to change with it — and so are
 * site/privacy.html and the four declaration files under store/.
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
    body: 'Nothing. Tress has no account, no sign-in and no server of its own. We cannot see your data because it is never sent to us. Apart from the product lookups described below, the one thing that leaves your phone is the anonymous purchase check the App Store or Google Play and our subscription provider use to confirm a membership — it carries no photograph, no name and nothing you record.',
  },
  {
    title: 'Where your data lives',
    body: 'Your photographs, routine, journal and answers are stored in the app’s private storage on this device, and are included in your device backup if you have one turned on. Deleting the app deletes them.',
  },
  {
    title: 'Your photographs',
    body: 'Photos you take in the app are written straight to that private storage. They are not uploaded and not shared with anyone. The reading the app gives you — light, focus, and how much of the frame the hair covers — is measured on this device, by this device, and the photograph never leaves it. Photos are not added to your camera roll unless you save one yourself.',
  },
  {
    title: 'Product lookups',
    body: 'When you scan a product barcode, the app sends that barcode number — and nothing else — to Open Beauty Facts (openbeautyfacts.org), a non-profit open database, and shows you what it lists: the product’s name, brand, photo and ingredients. No photograph, no identifier and nothing about you is sent. Like any web request, it reveals your device’s IP address to that service, and product photos are fetched from the same service. Looked-up products are kept on this device. Product data and photos are used under the Open Database License, with a link to the source on every product.',
  },
  {
    title: 'Artificial intelligence',
    body: 'Only on your phone. Tress runs a small hair-segmentation model on the device to measure how much of a photograph is hair. Nothing is sent to an AI service. It does not diagnose anything or generate advice — it measures the picture and shows you the numbers, and what your hair does is yours to find out.',
  },
  {
    title: 'Analytics and tracking',
    body: 'None. There is no analytics SDK, no crash reporting, no advertising identifier and no third-party tracker in this app.',
  },
  {
    title: 'Permissions we ask for',
    body: 'The camera, to take your progress photos and to read product barcodes. Your photo library, only if you choose a picture for your card. Face ID or your passcode, only if you turn on the app lock. Notifications, only if you turn on reminders. Each is asked for at the moment you first use it, and the app works without any of them.',
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
          subtitle="The short version: no account, no server of ours, and nothing about you is ever sent."
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
