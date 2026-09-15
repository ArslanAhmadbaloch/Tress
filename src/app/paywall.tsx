/**
 * The Premium paywall.
 *
 * It opens when somebody reaches for the part of the app that keeps their
 * record — not on launch, and not at random — so by the time it appears
 * they have already decided they want the thing it is asking them to pay
 * for. That is the whole design: earn the ask first, then make the ask
 * plainly, once.
 *
 * What that rules out is most of the genre. No countdown, no struck-through
 * "was" price, no "3 spots left", no interstitial that hides its close
 * button for four seconds. The price is visible above the button that
 * charges it, the renewal terms are on the screen rather than a tap away,
 * and the close control is there from the first frame.
 */

import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { PremiumFeatureList } from '@/components/subscription/feature-list';
import { SubscriptionPlanCard } from '@/components/subscription/plan-card';
import { DEFAULT_PLAN, PLAN_ORDER, type PlanId } from '@/features/subscription/config';
import { failureMessage } from '@/features/subscription/entitlement';
import { useSubscription } from '@/features/subscription/provider';
import { useTheme } from '@/theme';

export default function PaywallScreen() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const {
    entitlement, plans, canPurchase,
    purchaseState, restoreState, purchase, restore, acknowledge,
  } = useSubscription();

  const [selected, setSelected] = useState<PlanId>(DEFAULT_PLAN);
  const plan = plans[selected];

  /*
    The line directly above the button that charges them. When the store
    is offering this person a trial it has to lead with that and still
    name the price the trial turns into — a "7 days free" with no number
    after it is the pattern the App Store rejects, and deserves to.
  */
  const recurring =
    plan.period === 'year'
      ? `${plan.formattedPrice} a year · about ${plan.formattedMonthlyEquivalent} a month`
      : `${plan.formattedPrice} a month`;
  const price = plan.trial
    ? `${plan.trial.duration} free, then ${recurring}`
    : recurring;
  const scroller = useRef<ScrollView>(null);

  const busy = purchaseState.kind === 'working' || restoreState.kind === 'working';

  // Already entitled — by subscription or as a tester — so there is
  // nothing to sell. Leaving rather than showing a price they have
  // already paid.
  useEffect(() => {
    if (entitlement.isPremium && purchaseState.kind !== 'success') {
      router.back();
    }
  }, [entitlement.isPremium, purchaseState.kind, router]);

  // A completed purchase closes the sheet, landing them back on the thing
  // they were trying to do.
  useEffect(() => {
    if (purchaseState.kind !== 'success') return;
    const t = setTimeout(() => { acknowledge(); router.back(); }, 1200);
    return () => clearTimeout(t);
  }, [purchaseState.kind, acknowledge, router]);

  // A result appended below the fold is a result nobody reads: the tap
  // that produced it happened at the bottom of the screen, and the answer
  // renders above the pinned footer. Bring it into view.
  useEffect(() => {
    if (purchaseState.kind === 'failed' || restoreState.kind !== 'idle') {
      const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
      return () => clearTimeout(t);
    }
  }, [purchaseState.kind, restoreState.kind]);

  const failure =
    purchaseState.kind === 'failed'
      ? failureMessage(purchaseState.reason, 'purchase')
      : restoreState.kind === 'failed'
        ? failureMessage(restoreState.reason, 'restore')
        : null;
  // A cancelled purchase returns empty copy: they stopped on purpose and
  // do not need to be told what they just did.
  const showFailure = Boolean(failure && failure.title);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        ref={scroller}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xxl,
        }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <PressableScale
            hitSlop={5}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{
              width: 34, height: 34, borderRadius: 17,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.fill,
            }}>
            <Icon name="close" size={15} color={colors.text} />
          </PressableScale>
        </View>

        <Animated.View entering={FadeInDown.duration(360)}>
          <Text variant="title1" style={{ marginTop: spacing.sm }}>
            Your journey is ready.
          </Text>
          <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.sm }}>
            Start tracking your hair journey, stay consistent, and see your
            progress over time.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(360)}>
          <View style={{ marginTop: spacing.xxl }}>
            <PremiumFeatureList />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(360)}>
          <View
            accessibilityRole="radiogroup"
            style={{ gap: spacing.sm, marginTop: spacing.xxl }}>
            {PLAN_ORDER.map((id) => (
              <SubscriptionPlanCard
                key={id}
                plan={plans[id]}
                selected={selected === id}
                onSelect={() => setSelected(id)}
                badge={id === 'yearly' ? 'BEST VALUE' : undefined}
              />
            ))}
          </View>
        </Animated.View>

        {showFailure && failure ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <View
              accessible
              accessibilityLiveRegion="polite"
              accessibilityLabel={`${failure.title}. ${failure.body}`}
              style={{
                flexDirection: 'row',
                gap: spacing.md,
                marginTop: spacing.lg,
                padding: spacing.lg,
                borderRadius: radius.md,
                backgroundColor: colors.backgroundSubtle,
              }}>
              <Icon name="info" size={18} color={colors.textTertiary} />
              <View style={{ flex: 1 }}>
                <Text variant="subhead">{failure.title}</Text>
                <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
                  {failure.body}
                </Text>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {restoreState.kind === 'success' ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <Text
              variant="footnote"
              color="accent"
              center
              accessibilityLiveRegion="polite"
              style={{ marginTop: spacing.lg }}>
              {restoreState.message}
            </Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      {/* The price sits directly above the button that charges it, so
          there is never a tap whose cost is off screen. */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.md,
          paddingTop: spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.separator,
          backgroundColor: colors.background,
        }}>
        <Text variant="footnote" color="textSecondary" center>
          {price}
        </Text>

        <Button
          label={
            purchaseState.kind === 'success'
              ? 'Your journey is ready'
              : plan.trial
                ? 'Start My Free Trial'
                : 'Start My Journey'
          }
          onPress={() => purchase(selected)}
          loading={purchaseState.kind === 'working'}
          succeeded={purchaseState.kind === 'success'}
          disabled={busy || purchaseState.kind === 'success'}
          style={{ marginTop: spacing.sm }}
          accessibilityHint={
            canPurchase
              ? 'Subscribes and unlocks your journey'
              : 'Premium is not open for purchase in this version'
          }
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            marginTop: spacing.sm,
            minHeight: 28,
          }}>
          {restoreState.kind === 'working' ? (
            <>
              <ActivityIndicator color={colors.textSecondary} />
              <Text variant="footnote" color="textSecondary" accessibilityLiveRegion="polite">
                Checking your purchases…
              </Text>
            </>
          ) : (
            <PressableScale
              onPress={restore}
              disabled={busy}
              hitSlop={10}
              haptic="none"
              accessibilityRole="button"
              accessibilityLabel="Restore purchases"
              accessibilityHint="Looks for a Premium subscription already bought with this store account"
              style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.sm }}>
              <Text variant="footnote" color="accent" style={{ fontWeight: '600' }}>
                Restore Purchases
              </Text>
            </PressableScale>
          )}
        </View>

        <Text
          variant="caption"
          color="textTertiary"
          center
          style={{ marginTop: spacing.xs }}>
          {plan.trial
            ? `Your first ${plan.trial.duration} are free. After that the subscription renews automatically at ${plan.formattedPrice} unless cancelled at least 24 hours before the trial ends. `
            : 'Subscriptions renew automatically unless cancelled. '}
          Payment is charged to your App Store or Google Play account.
          Cancel anytime in your account settings.
        </Text>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: spacing.lg,
            marginTop: spacing.xs,
          }}>
          <PressableScale
            onPress={() => router.push('/privacy')}
            hitSlop={10}
            haptic="none"
            accessibilityRole="button"
            accessibilityLabel="Privacy Policy"
            style={{ paddingVertical: spacing.xs }}>
            <Text variant="caption" color="textSecondary">
              Privacy Policy
            </Text>
          </PressableScale>
          <PressableScale
            onPress={() => router.push('/terms')}
            hitSlop={10}
            haptic="none"
            accessibilityRole="button"
            accessibilityLabel="Terms of Use"
            style={{ paddingVertical: spacing.xs }}>
            <Text variant="caption" color="textSecondary">
              Terms of Use
            </Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}
