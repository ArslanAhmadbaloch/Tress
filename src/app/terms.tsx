/**
 * Terms of use.
 *
 * Apple requires functional terms for an auto-renewing subscription, and
 * requires them reachable from the paywall rather than only from a store
 * listing. This is that page.
 *
 * It is deliberately short. Most of what a long one would cover — data
 * handling, retention, third-party processors — does not apply to an app
 * with no server, and padding it out with clauses about things that do not
 * exist would make the parts that do matter harder to find.
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
    title: 'What Tress is',
    body: 'A tool for photographing and recording your own hair over time. It stores what you give it and shows it back to you. It is not a medical device, it does not diagnose anything, and nothing in it is medical advice. For anything clinical, speak to a qualified healthcare professional.',
  },
  {
    title: 'What Premium buys',
    body: 'Access to the journey-tracking features: capturing your photo updates, keeping your routine, comparing points in time, and your full history. It does not buy a result. Whether anybody’s hair changes depends on why it is changing and what they do about it, and no app can promise otherwise.',
  },
  {
    title: 'Billing',
    body: 'Subscriptions are billed through your App Store or Google Play account, not by us. They renew automatically at the end of each period unless cancelled at least 24 hours before it ends, and your account is charged for renewal within 24 hours of the period ending.',
  },
  {
    title: 'Managing and cancelling',
    body: 'You can manage or cancel your subscription in your App Store or Google Play account settings at any time. Cancelling stops the next renewal; access continues until the period you have already paid for ends.',
  },
  {
    title: 'Refunds',
    body: 'Purchases are handled by Apple and Google, so refunds are theirs to grant. Requests go through the store you bought from, under that store’s policy.',
  },
  {
    title: 'Your content',
    body: 'Your photographs and notes are yours. They stay on your device — we never receive them, so we claim no rights over them and could not use them if we wanted to.',
  },
  {
    title: 'Ending your use',
    body: 'Delete the app, or use "Delete all my data" in Settings, and everything goes with it. There is no copy held anywhere else.',
  },
  {
    title: 'Changes',
    body: 'If these terms change in a way that affects what you have paid for, the change applies from your next renewal rather than retroactively.',
  },
];

export default function TermsScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <ScreenScroll>
        <ScreenTitle
          eyebrow="Terms"
          title="The short"
          titleMuted="version"
          subtitle="What this app is, what Premium buys, and how billing works."
          trailing={
            <PressableScale
              hitSlop={4}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{
                width: 36, height: 36, borderRadius: 18,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: colors.surface,
                borderWidth: 1, borderColor: colors.border,
              }}>
              <Icon name="close" size={15} color={colors.text} />
            </PressableScale>
          }
        />

        <View style={{ gap: spacing.xl, marginTop: spacing.lg, marginBottom: spacing.xxl }}>
          {SECTIONS.map((section) => (
            <View key={section.title}>
              <Text variant="headline" accessibilityRole="header">
                {section.title}
              </Text>
              <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.xs }}>
                {section.body}
              </Text>
            </View>
          ))}
        </View>
      </ScreenScroll>
    </Screen>
  );
}
