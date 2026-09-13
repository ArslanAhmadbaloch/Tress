/**
 * Where somebody stands with Premium, shown in Settings.
 *
 * Three states worth distinguishing, because they call for different
 * things: not subscribed (an offer), subscribed (a receipt and a way to
 * manage it), and a tester build (a switch, and a plain label saying that
 * is what it is, so nobody mistakes it for having bought something).
 */

import { useRouter } from 'expo-router';
import { Linking, Platform, Switch, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { TESTER_BUILD } from '@/features/subscription/entitlement';
import { useSubscription } from '@/features/subscription/provider';
import { useTheme } from '@/theme';

/** Where the OS lets somebody manage what they are paying for. */
const MANAGE_URL = Platform.select({
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
  default: '',
});

export function SubscriptionStatus() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { entitlement, testerPremium, setTesterPremium } = useSubscription();

  const isTester = entitlement.source === 'tester';

  return (
    <View
      style={{
        padding: spacing.lg,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: entitlement.isPremium ? colors.accentBorder : colors.border,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Icon
          name={entitlement.isPremium ? 'checkCircle' : 'sparkle'}
          size={20}
          color={entitlement.isPremium ? colors.accent : colors.textSecondary}
        />
        <View style={{ flex: 1 }}>
          <Text variant="headline">
            {entitlement.isPremium ? 'Premium' : 'Hair Journey Premium'}
          </Text>
          <Text variant="footnote" color="textSecondary" style={{ marginTop: 1 }}>
            {isTester
              ? 'Unlocked for testing on this build. Not a purchase.'
              : entitlement.status === 'cancelledButActive'
                ? 'Cancelled — your access continues until the period ends.'
                : entitlement.isPremium
                  ? 'Your journey tracking is unlocked.'
                  : 'Track your journey, your stack and your progress over time.'}
          </Text>
        </View>
      </View>

      {!entitlement.isPremium ? (
        <PressableScale
          onPress={() => router.push('/paywall')}
          scaleTo={0.99}
          accessibilityRole="button"
          accessibilityLabel="See Premium"
          style={{
            marginTop: spacing.lg,
            paddingVertical: spacing.md,
            borderRadius: radius.pill,
            alignItems: 'center',
            backgroundColor: colors.accent,
          }}>
          <Text variant="subhead" color="textOnAccent" style={{ fontWeight: '600' }}>
            See Premium
          </Text>
        </PressableScale>
      ) : entitlement.source === 'subscription' ? (
        <PressableScale
          onPress={() => Linking.openURL(MANAGE_URL)}
          scaleTo={0.99}
          accessibilityRole="button"
          accessibilityLabel="Manage subscription"
          accessibilityHint="Opens your store account settings"
          style={{
            marginTop: spacing.lg,
            paddingVertical: spacing.md,
            borderRadius: radius.pill,
            alignItems: 'center',
            backgroundColor: colors.fill,
          }}>
          <Text variant="subhead" color="accent" style={{ fontWeight: '600' }}>
            Manage subscription
          </Text>
        </PressableScale>
      ) : null}

      {/*
        Compiled out of production. `setTesterPremium` is null unless the
        build set the tester flag, so this block cannot render for an
        ordinary user even if the state behind it were somehow written.
      */}
      {TESTER_BUILD && setTesterPremium ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginTop: spacing.lg,
            paddingTop: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.separator,
          }}>
          <Icon name="warning" size={16} color={colors.textTertiary} />
          <View style={{ flex: 1 }}>
            <Text variant="subhead">Tester access</Text>
            <Text variant="caption" color="textTertiary" style={{ marginTop: 1 }}>
              Development builds only. Never present in a release build.
            </Text>
          </View>
          <Switch
            value={testerPremium}
            onValueChange={setTesterPremium}
            trackColor={{ true: colors.accent, false: colors.fill }}
            accessibilityLabel="Tester Premium access"
          />
        </View>
      ) : null}
    </View>
  );
}
