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
 * button for four seconds. The price is on the card that is chosen and in
 * the terms under the button that charges it, and the close control is
 * there from the first frame.
 *
 * ── The page, top to bottom ────────────────────────────────────────────
 * The reference's paywall, in this palette. Two tilted cards: their
 * latest scan on the left, and on the right a DASHED frame carrying
 * the date the record says the next scan is due, over the app's own
 * bundled example blurred to a shape — never a second copy of
 * the photograph, never a generated after. The headline, alone. Four
 * icon benefits directly under it, in two rows of two (H.9), each a
 * thing the entitlement really decides. Two plan cards, the month first and the year second
 * with the tick already in it. A promo-code link (iOS, where the store
 * has a sheet for it) and Restore. Then, pinned, the button, the renewal
 * terms, and one row of small print: where the photographs are kept,
 * and the two legal links.
 *
 * Nothing between the cards and the plans but the headline and the
 * four benefits — no caption under the cards, no framing paragraph
 * under the title. The reference has neither, and each one pushed the
 * plans a text block further from the top. The one paragraph this
 * screen ever draws is the second ask's, on the single visit that is.
 *
 * There is no free trial on this screen, no trial toggle, and no code
 * path that could draw one. The offer is a straight subscription: one
 * price, on the card, charged when they tap.
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
import { PaywallHeroPair, PaywallHighlights, PaywallPlanCard } from '@/components/paywall';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ScrollEdgeEffect } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { DEFAULT_PLAN, type PlanId } from '@/features/subscription/config';
import { failureMessage } from '@/features/subscription/entitlement';
import {
  CTA_COPY,
  HERO_COPY,
  PLAN_BADGE,
  PLAN_DISPLAY_ORDER,
  ctaLabel,
  heroFor,
  nextScanLabel,
  paywallCopy,
  renewalTerms,
  variantFor,
} from '@/features/subscription/paywall-variants';
import { useSubscription } from '@/features/subscription/provider';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';

/** The headline and body hold a narrower measure than the cards, so a
    centred line breaks where a sentence would rather than at the edge. */
const COPY_MEASURE = 320;
/** The round close control, top right, over the cards. */
const CLOSE = 44;

export default function PaywallScreen() {
  const { colors, spacing, radius, shadow } = useTheme();
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
    purchaseState, restoreState, purchase, restore, redeemCode, acknowledge,
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
  const nextLabel = useMemo(() => nextScanLabel(data), [data]);
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

  const closeTop = insets.top + spacing.sm;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        ref={scroller}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          // The cards start under the close control, not beside it.
          paddingTop: closeTop + CLOSE + spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xxxl,
        }}>
        <Rise index={0}>
          <PaywallHeroPair hero={hero} gender={data.profile?.gender} nextLabel={nextLabel} />
        </Rise>

        {/*
          The title, and under it the four benefits — nothing in between,
          as the reference draws it. The one visit that carries a body is
          the second ask, which swaps the headline and adds its paragraph
          and nothing else; see paywall-variants.ts.
        */}
        <Rise index={1} style={{ alignItems: 'center', marginTop: spacing.xxl }}>
          <Text
            variant="title1"
            center
            accessibilityRole="header"
            style={{ maxWidth: COPY_MEASURE }}>
            {copy.headline}
          </Text>
          {copy.body ? (
            <Text
              variant="callout"
              color="textSecondary"
              center
              style={{ marginTop: spacing.md, maxWidth: COPY_MEASURE }}>
              {copy.body}
            </Text>
          ) : null}
        </Rise>

        {/* Four cells, so they take Rise indices 2 through 5 and the
            plans follow at 6 — the stagger is one sequence down the page,
            and two things sharing an index would land together. */}
        <View style={{ marginTop: spacing.xl }}>
          <PaywallHighlights firstIndex={2} />
        </View>

        <Rise index={6} style={{ marginTop: spacing.xxxl }}>
          <View accessibilityRole="radiogroup" style={{ gap: spacing.md }}>
            {PLAN_DISPLAY_ORDER.map((id) => (
              <PaywallPlanCard
                key={id}
                plan={plans[id]}
                selected={selected === id}
                onSelect={() => setSelected(id)}
                badge={id === 'yearly' ? PLAN_BADGE : undefined}
              />
            ))}
          </View>
        </Rise>

        {/*
          The promo-code link appears only where the store has a sheet to
          open — provider.tsx hands back null everywhere else — and Restore
          is always there. Both read as controls rather than small print
          through the type scale's emphasised small step, not a weight
          written here.
        */}
        <Rise
          index={7}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.xxl,
            marginTop: spacing.xl,
            minHeight: 40,
          }}>
          {restoreState.kind === 'working' ? (
            <>
              <ActivityIndicator color={colors.textSecondary} />
              <Text variant="footnote" color="textSecondary" accessibilityLiveRegion="polite">
                {CTA_COPY.restoring}
              </Text>
            </>
          ) : (
            <>
              {redeemCode ? (
                <PressableScale
                  onPress={() => { void redeemCode(); }}
                  disabled={busy}
                  hitSlop={10}
                  haptic="none"
                  accessibilityRole="button"
                  accessibilityLabel={CTA_COPY.promoCode}
                  accessibilityHint="Opens the App Store's code redemption sheet"
                  style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.sm }}>
                  <Text variant="subhead" color="textSecondary">
                    {CTA_COPY.promoCode}
                  </Text>
                </PressableScale>
              ) : null}
              <PressableScale
                onPress={restore}
                disabled={busy}
                hitSlop={10}
                haptic="none"
                accessibilityRole="button"
                accessibilityLabel={CTA_COPY.restore}
                accessibilityHint="Looks for a Premium subscription already bought with this store account"
                style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.sm }}>
                <Text variant="subhead" color="textSecondary">
                  {CTA_COPY.restore}
                </Text>
              </PressableScale>
            </>
          )}
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
              color="success"
              center
              accessibilityLiveRegion="polite"
              style={{ marginTop: spacing.lg }}>
              {restoreState.message}
            </Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      {/* The close control, there from the first frame and never
          scrolled away: a white disc over the cards, as in the reference. */}
      <PressableScale
        hitSlop={6}
        onPress={leave}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={[
          {
            position: 'absolute',
            top: closeTop,
            right: spacing.xl,
            width: CLOSE,
            height: CLOSE,
            borderRadius: CLOSE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
          },
          shadow.soft,
        ]}>
        <Icon name="close" size={16} color={colors.text} />
      </PressableScale>

      {/*
        The footer is pinned, and content scrolls beneath it. No rule
        between the two: the scroll edge effect dissolves the cards before
        they reach the button, which is what makes them read as passing
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
        <Button
          label={ctaLabel(succeeded)}
          onPress={() => purchase(selected)}
          loading={purchaseState.kind === 'working'}
          succeeded={succeeded}
          disabled={busy || succeeded}
          accessibilityHint={
            canPurchase
              ? `Subscribes to the ${selected} plan and unlocks your journey`
              : 'Premium is not open for purchase in this version'
          }
        />

        {/* The terms name the price and the period, directly under the
            button that charges it, so there is never a tap whose cost is
            off screen. */}
        <Text variant="caption" color="textTertiary" center style={{ marginTop: spacing.sm }}>
          {renewalTerms(plan)}
        </Text>

        {/* One row of small print: where the photographs are kept —
            the one ungated line on the Premium ledger, said once, here,
            where somebody about to pay for a year of photo storage will
            read it — and the two legal links. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.xl,
            marginTop: spacing.xs,
          }}>
          <View
            accessible
            accessibilityLabel={HERO_COPY.onDevice}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon name="lock" size={11} color={colors.textTertiary} />
            <Text variant="caption" color="textTertiary">
              {HERO_COPY.onDevice}
            </Text>
          </View>
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
