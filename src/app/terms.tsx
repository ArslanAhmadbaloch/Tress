/**
 * Terms of use.
 *
 * Apple requires functional terms for an auto-renewing subscription, and
 * requires them reachable from the paywall rather than only from a store
 * listing. This is that page.
 *
 * It is deliberately short. Most of what a long one would cover — data
 * handling, retention, the rest of it — belongs in the privacy screen,
 * which describes it in plain words, and padding this out with clauses
 * about things that do not exist would make the parts that do matter
 * harder to find.
 *
 * Two facts these terms have to keep telling the truth about:
 *
 *  1. The third-party processor that holds anything is RevenueCat, on
 *     iOS, and what it holds is a purchase record against a random
 *     install identifier (src/features/subscription/revenuecat.ts). The
 *     SDK is no longer configured at launch: it is reached when the
 *     paywall is on screen, on a purchase, on a restore, and at launch
 *     only for an install whose cached Premium snapshot has run past its
 *     date (src/features/subscription/provider.tsx and
 *     entitlement-cache.ts). So that record exists for an install that
 *     opened the paywall, bought or restored — not for every install, as
 *     "Ending your use" used to say.
 *  2. The other copy that is not ours is the person's own device backup:
 *     the photograph files sit in Documents, nothing excludes them, so a
 *     backup can hold them under their Apple or Google account.
 *
 * The seller of record on the store listing is an individual developer,
 * Arslan Ahmad, and that is who these terms are with. No company is named
 * here, because none is the seller and naming one would contradict the
 * listing a reviewer reads these against.
 *
 * Do not write a completeness claim in this file — no "the whole of", no
 * "and nothing else". Say what is known and leave the list open.
 *
 * LAST_UPDATED is hand-set and shown in the app; the hosted page stamps
 * its own build date (scripts/build-site.mjs).
 */
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Screen, ScreenScroll, ScreenTitle } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** The date shown under the title. Move it whenever a section changes. */
const LAST_UPDATED = '16 September 2026';

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
    body: 'Your photographs and notes are yours. They stay on your device unless you hand one to a share sheet yourself — we never receive them, so we claim no rights over them and could not use them if we wanted to. If your phone backs itself up, the photograph files can go into that backup; it is held under your own Apple or Google account, on your terms with them, and not by us.',
  },
  {
    title: 'Ending your use',
    body: 'Delete the app and your photographs and records go with it. "Delete all my data" in Settings removes them too, and leaves a few device settings behind — the privacy screen lists which. We never receive them, so there is no copy of them here to delete; a backup you have turned on is your own copy, and you clear it in your phone’s backup settings. On iPhone, once the app has connected to our subscription provider — because you opened the paywall, bought, or tapped Restore — that provider holds a purchase record against a random identifier for the install. An install that did none of those never reached it, so there is nothing of it there. Email support@tresshaircare.com and we will have a record deleted. The privacy screen says what it contains and what stays on the phone afterwards.',
  },
  {
    title: 'Who these terms are with',
    body: 'Tress is made and published by Arslan Ahmad, an individual developer, who is the seller named on its App Store and Google Play listings. support@tresshaircare.com reaches him, and a person reads it. The purchase itself is a contract with Apple or Google; these terms are about the app.',
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

        <Text variant="footnote" color="textTertiary" style={{ marginTop: spacing.xs }}>
          Last updated {LAST_UPDATED}
        </Text>

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
