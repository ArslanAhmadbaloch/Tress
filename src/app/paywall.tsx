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
 *
 * ── The page, top to bottom ────────────────────────────────────────────
 * One headline, centred, in the display face. The person's own first
 * photograph in a white frame, because the thing being sold is a record
 * and the record is of them. Four lines on what Premium keeps. Two plans.
 * Then, pinned, the price and the button that charges it.
 *
 * Every sentence on it lives in paywall-variants.ts, where the tests can
 * read it. This file is layout.
 */

import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';

import { currentPaywallAsk, setPaywallAsk } from '@/lib/device-preferences';
import { useBackOrHome } from '@/lib/navigation';
import { Rise } from '@/components/funnel';
import { PremiumFeatureList } from '@/components/subscription/feature-list';
import { PaywallHeroCard } from '@/components/subscription/hero';
import { SubscriptionPlanCard } from '@/components/subscription/plan-card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ScrollEdgeEffect } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { DEFAULT_PLAN, PLAN_ORDER, type PlanId } from '@/features/subscription/config';
import { failureMessage } from '@/features/subscription/entitlement';
import {
  CTA_COPY,
  ctaLabel,
  heroFor,
  paywallCopy,
  priceLine,
  renewalTerms,
  variantFor,
} from '@/features/subscription/paywall-variants';
import { useSubscription } from '@/features/subscription/provider';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';

/** The headline and body hold a narrower measure than the cards, so a
    centred line breaks where a sentence would rather than at the edge. */
const COPY_MEASURE = 320;

export default function PaywallScreen() {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  /*
    The funnel arrives here by a chain of replaces — capture, report,
    paywall — so there is nothing behind this screen to go back to. Home
    is where "close" should land in that case; a dismiss that does nothing
    is a paywall that cannot be closed.
  */
  const leave = useBackOrHome();

  const { data } = useAppStore();
  const {
    entitlement, plans, canPurchase,
    purchaseState, restoreState, purchase, restore, acknowledge,
  } = useSubscription();

  const [selected, setSelected] = useState<PlanId>(DEFAULT_PLAN);

  /*
    The profile id is created at onboarding, stays on the device and is
    never sent anywhere — which makes it the right thing to hash for a
    stable arm, and the wrong thing to ever report alongside one.
  */
  const variant = useMemo(() => variantFor(data.profile?.id ?? ''), [data.profile?.id]);
  /*
    Fixed for the life of this visit: the stage is read once and then
    advanced, so the copy cannot flip mid-screen. Recorded as shown, not
    as accepted — the second ask is a single open, whatever they do on it.
  */
  const [secondAsk] = useState(() => currentPaywallAsk() === 'second');
  const copy = paywallCopy(variant, secondAsk);
  useEffect(() => {
    if (secondAsk) setPaywallAsk('settled');
  }, [secondAsk]);
  /*
    Closing without buying earns the one second ask on the next open.
    The close control is only one of the ways out — this is a page sheet,
    so the swipe-down and the hardware back button close it just as often
    and never touch a button handler. beforeRemove fires for all three, so
    the dismissal is recorded there, and the X simply leaves. A purchase or
    an existing entitlement also removes this screen, and neither is a
    dismissal: they flag the exit before leaving so the listener lets it go.
  */
  const navigation = useNavigation();
  const paidExit = useRef(false);
  useEffect(() => {
    return navigation.addListener('beforeRemove', () => {
      if (paidExit.current) return;
      if (currentPaywallAsk() === 'first') setPaywallAsk('second');
    });
  }, [navigation]);
  const hero = useMemo(() => heroFor(data), [data]);
  const plan = plans[selected];
  const scroller = useRef<ScrollView>(null);

  const busy = purchaseState.kind === 'working' || restoreState.kind === 'working';
  const succeeded = purchaseState.kind === 'success';

  // Already entitled — by subscription or as a tester — so there is
  // nothing to sell. Leaving rather than showing a price they have
  // already paid.
  useEffect(() => {
    if (entitlement.isPremium && purchaseState.kind !== 'success') {
      paidExit.current = true;
      leave();
    }
  }, [entitlement.isPremium, purchaseState.kind, leave]);

  // A completed purchase closes the sheet, landing them back on the thing
  // they were trying to do.
  useEffect(() => {
    if (purchaseState.kind !== 'success') return;
    const t = setTimeout(() => { paidExit.current = true; acknowledge(); leave(); }, 1200);
    return () => clearTimeout(t);
  }, [purchaseState.kind, acknowledge, leave]);

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
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xxxl,
        }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <PressableScale
            hitSlop={6}
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{
              width: 36, height: 36, borderRadius: 18,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.fill,
            }}>
            <Icon name="close" size={15} color={colors.text} />
          </PressableScale>
        </View>

        {/*
          Centred, like the funnel's questions. Which framing somebody sees
          is fixed for the life of their install — see paywall-variants.ts.
          All three name the same price, the same trial and the same
          features; only the door in is different. The one exception is
          the visit after a dismissal, which swaps these two lines for the
          second ask and nothing else.
        */}
        <Rise index={0} style={{ alignItems: 'center', marginTop: spacing.lg }}>
          <Text variant="overline" color="textSecondary" center>
            Tress Premium
          </Text>
          <Text
            variant="title1"
            center
            accessibilityRole="header"
            style={{ marginTop: spacing.sm, maxWidth: COPY_MEASURE }}>
            {copy.headline}
          </Text>
          <Text
            variant="callout"
            color="textSecondary"
            center
            style={{ marginTop: spacing.md, maxWidth: COPY_MEASURE }}>
            {copy.body}
          </Text>
        </Rise>

        <Rise index={1} style={{ marginTop: spacing.xxxl }}>
          <PaywallHeroCard hero={hero} />
        </Rise>

        <Rise index={2} style={{ marginTop: spacing.xxxl, paddingHorizontal: spacing.xs }}>
          <PremiumFeatureList />
        </Rise>

        <Rise index={3} style={{ marginTop: spacing.xxxl }}>
          <View accessibilityRole="radiogroup" style={{ gap: spacing.md }}>
            {PLAN_ORDER.map((id) => (
              <SubscriptionPlanCard
                key={id}
                plan={plans[id]}
                selected={selected === id}
                onSelect={() => setSelected(id)}
                badge={id === 'yearly' ? 'Best value' : undefined}
              />
            ))}
          </View>
        </Rise>

        {showFailure && failure ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <View
              accessible
              accessibilityLiveRegion="polite"
              accessibilityLabel={`${failure.title}. ${failure.body}`}
              style={{
                flexDirection: 'row',
                gap: spacing.md,
                marginTop: spacing.xl,
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
              color="success"
              center
              accessibilityLiveRegion="polite"
              style={{ marginTop: spacing.xl }}>
              {restoreState.message}
            </Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      {/*
        The footer is pinned, and content scrolls beneath it. No rule
        between the two: the scroll edge effect dissolves the cards before
        they reach the price, which is what makes them read as passing
        under the footer rather than being cut off by it.
      */}
      <View pointerEvents="none" style={{ height: 0 }}>
        <ScrollEdgeEffect edge="bottom" />
      </View>
      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + spacing.md,
          paddingTop: spacing.sm,
          backgroundColor: colors.background,
        }}>
        {/* The price sits directly above the button that charges it, so
            there is never a tap whose cost is off screen. */}
        <Text variant="footnote" color="textSecondary" center>
          {priceLine(plan)}
        </Text>

        <Button
          label={ctaLabel(plan, succeeded)}
          onPress={() => purchase(selected)}
          loading={purchaseState.kind === 'working'}
          succeeded={succeeded}
          disabled={busy || succeeded}
          style={{ marginTop: spacing.md }}
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
            minHeight: 32,
          }}>
          {restoreState.kind === 'working' ? (
            <>
              <ActivityIndicator color={colors.textSecondary} />
              <Text variant="footnote" color="textSecondary" accessibilityLiveRegion="polite">
                {CTA_COPY.restoring}
              </Text>
            </>
          ) : (
            <PressableScale
              onPress={restore}
              disabled={busy}
              hitSlop={10}
              haptic="none"
              accessibilityRole="button"
              accessibilityLabel={CTA_COPY.restore}
              accessibilityHint="Looks for a Premium subscription already bought with this store account"
              style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.sm }}>
              <Text variant="footnote" color="textSecondary" style={{ fontWeight: '600' }}>
                {CTA_COPY.restore}
              </Text>
            </PressableScale>
          )}
        </View>

        <Text variant="caption" color="textTertiary" center style={{ marginTop: spacing.xs }}>
          {renewalTerms(plan)}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: spacing.xl,
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
