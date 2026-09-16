/**
 * What the centre button opens.
 *
 * The Plus used to be one door: it went straight to the five-angle intro.
 * There are two things behind it now, and they are not variations of each
 * other — they differ in what you are left holding.
 *
 *   Scan    a turn of the head, and a reading of the photographs it
 *           takes. What it produces is an assessment you read.
 *   Photos  the five angles, taken when you want them and kept, so this
 *           month can sit beside last month. What it produces is a record.
 *
 * So the two options are given equal weight and each carries a line saying
 * what it is *for* rather than what it does. A person choosing between two
 * cameras needs to know which one leaves them with the thing they came
 * for.
 *
 * The outcome lives on the `purpose` line and nowhere else. It is written
 * as what the door is for — "a reading of what the camera can measure
 * today" — rather than as a promise about a screen that appears at the
 * end, because the screen that appears at the end is decided by
 * `capture-session.tsx` and not by this one. Nothing here claims the scan
 * decides anything about a head.
 *
 * Both scan routes carry an explicit `mode`, which is also the signal
 * that this was the scan door rather than the record door:
 *
 *   mode: 'sweep'   a build that can follow a head — one continuous turn
 *   mode: 'walk'    everything else — the same angles, one at a time
 *
 * The walk is the fallback and it is also the standing alternative: the
 * turn is a visual gesture, and somebody who cannot make it, or does not
 * want to, is offered the other route at the point of choosing rather
 * than having it inferred for them. Where the detector is missing — the
 * simulator stand-in, or a binary without it — the option stays exactly
 * where it is and says plainly what will happen instead. An option that
 * vanished would make the screen a different screen on different builds,
 * and one that failed on tap would be worse.
 */

import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { headTrackingAvailable, sampleCameraActive } from '@/components/capture';
import { GlassOrb } from '@/components/ui/glass-orb';
import { Icon, type IconName } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { SCAN_COPY } from '@/features/capture/scan-copy';
import { usePremium } from '@/features/subscription/provider';
import { useBackOrHome } from '@/lib/navigation';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';
import { sessionToExtend } from '@/types/domain';

export default function NewScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // A deep link can land here with nothing underneath, and a close button
  // that does nothing is a trap.
  const leave = useBackOrHome();
  const reduceMotion = useReducedMotion();
  const { data } = useAppStore();
  const { isPremium } = usePremium();

  /*
    Whether this build can follow a head through a turn. The sample camera
    rules it out on its own: it stands in for a camera the simulator does
    not have and reports no faces at all, so a development build there
    would otherwise offer a turn that nothing is watching.

    It is a property of the binary, not of the handset —
    `headTrackingAvailable()` is `loadVision() !== null`, and that file's
    own comment says the answer depends on the build, not on the moment.
    The copy below says "build" for that reason.
  */
  const canFollowHead = headTrackingAvailable() && !sampleCameraActive();

  /*
    The entitlement gate, moved up one screen.

    Until now every route into the camera went through capture-intro, and
    that screen's own comment says so — it is the only place capture has
    to be gated. The Plus now opens this screen instead, and both of its
    scan routes lead past capture-intro straight to the camera, so the
    same rule is applied here to the same test. capture-intro keeps its
    copy of it: it is still reachable from elsewhere, and a gate that
    exists twice on the same rule costs nothing.

    The baseline is the exception, deliberately. Asking for money before a
    single photograph exists is asking somebody to buy a comparison against
    nothing. A one-photo baseline that still lacks angles is still the
    baseline, which is what `sessionToExtend` decides.
  */
  const isBaseline = data.sessions.length === 0 || sessionToExtend(data.sessions) !== null;

  useEffect(() => {
    if (!isPremium && !isBaseline) router.replace('/paywall');
  }, [isPremium, isBaseline, router]);

  /*
    Replace, not push. This screen is a doorway: once it has been walked
    through it should not be behind the camera waiting to be returned to.
    capture-intro already replaces itself with the capture screen for the
    same reason.
  */
  const openWalkScan = () =>
    router.replace({ pathname: '/capture-session', params: { mode: 'walk' } });

  const openScan = () => {
    if (!canFollowHead) {
      openWalkScan();
      return;
    }
    router.replace({ pathname: '/capture-session', params: { mode: 'sweep' } });
  };

  const openPhotos = () => router.replace('/capture-intro');

  return (
    // A page sheet on iOS already clears the status bar; Android is full
    // screen. The header is fixed and the body scrolls, which is the
    // shape the app's other sheets use (journal.tsx, routine.tsx) — and
    // what keeps the second card and the footer reachable at AX5.
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: Platform.OS === 'ios' ? spacing.md : insets.top,
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.lg,
        }}>
        <View style={{ flex: 1, paddingRight: spacing.lg }}>
          <Text variant="title2" accessibilityRole="header">
            What are you here for?
          </Text>
          <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.xs }}>
            One ends in a reading. The other adds to the record you keep.
          </Text>
        </View>
        <PressableScale
          hitSlop={5}
          onPress={leave}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.fill,
          }}>
          <Icon name="close" size={15} color={colors.text} />
        </PressableScale>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxxl,
          gap: spacing.md,
        }}>
        {/*
          Two cards, the same size and the same treatment. Making one of
          them the primary would be the interface answering a question it
          was built to ask.
        */}
        <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(300)}>
          <Choice
            icon="target"
            title="Scan my hair"
            purpose="For a reading of what the camera can measure today."
            mechanism={
              canFollowHead
                ? 'One turn of your head, and it photographs as you go.'
                : 'This build cannot follow a head, so the angles are taken one at a time.'
            }
            /*
              The sentence that stops the turn ever being sold as five
              angles, read where somebody is about to choose it rather
              than after they have. It belongs to the turn, so it is not
              shown on a build that has no turn to describe.
            */
            scope={canFollowHead ? SCAN_COPY.sweep.scope : undefined}
            onPress={openScan}
          />

          {/*
            The standing alternative to the turn, offered to everybody
            rather than inferred, and kept inside the scan block because
            it is a second way through the same door rather than a third
            option. A screen reader running selects the walk on its own
            further in; this is the control that makes that a default
            instead of a decision taken for somebody. Hidden only where
            there is no turn to decline, because then the card above
            already opens this exact route.
          */}
          {canFollowHead ? (
            <PressableScale
              onPress={openWalkScan}
              haptic="light"
              scaleTo={0.99}
              accessibilityRole="button"
              accessibilityLabel={SCAN_COPY.sweep.altLink}
              accessibilityHint="Takes the same angles one at a time, with no turn."
              // A link, but a 44pt target: it is one of the two ways into
              // the scan, not a footnote.
              hitSlop={8}
              style={{
                alignSelf: 'flex-start',
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: spacing.xs,
              }}>
              <Text variant="subhead" color="accent">
                {SCAN_COPY.sweep.altLink}
              </Text>
            </PressableScale>
          ) : null}
        </Animated.View>

        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(300).delay(70)}>
          <Choice
            icon="photo"
            title="Take photos"
            purpose="For a record you keep, so this month can sit beside last month."
            mechanism="The five angles, taken whenever you want them."
            onPress={openPhotos}
          />
        </Animated.View>

        <Text
          variant="caption"
          color="textTertiary"
          center
          style={{
            marginTop: spacing.lg,
            paddingHorizontal: spacing.xl,
          }}>
          Photos are saved to this device only.
        </Text>
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One of the two doors.
 *
 * `purpose` is the line under the rule: what somebody is left holding. It
 * is set apart from `mechanism` on purpose — a person deciding between
 * these two is choosing an outcome, and the two sentences were reading as
 * one paragraph when they sat together.
 *
 * `scope` is the optional third line: what the mechanism does not reach.
 */
function Choice({
  icon,
  title,
  purpose,
  mechanism,
  scope,
  onPress,
}: {
  icon: IconName;
  title: string;
  purpose: string;
  mechanism: string;
  scope?: string;
  onPress: () => void;
}) {
  const { colors, spacing, radius, shadow } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={[purpose, mechanism, scope].filter(Boolean).join(' ')}
      style={[
        {
          padding: spacing.lg,
          borderRadius: radius.section,
          backgroundColor: colors.surface,
        },
        shadow.soft,
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <GlassOrb size={46} ring={false} tone="green">
          <Icon name={icon} size={20} color={colors.text} />
        </GlassOrb>
        <View style={{ flex: 1 }}>
          <Text variant="title3">{title}</Text>
          <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
            {mechanism}
          </Text>
        </View>
        <Icon name="chevronRight" size={12} color={colors.textTertiary} />
      </View>

      <View
        style={{
          marginTop: spacing.md,
          paddingTop: spacing.md,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.separator,
        }}>
        <Text variant="subhead" color="textSecondary">
          {purpose}
        </Text>
        {scope ? (
          <Text variant="caption" color="textTertiary" style={{ marginTop: spacing.xs }}>
            {scope}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}
