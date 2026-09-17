/**
 * The plan: what happens between the funnel's report and the paywall.
 *
 * Four scenes, in one route. On a dark ground a field of particles
 * drifts while a large number rolls up for each thing the record
 * already holds — answers given, images kept, regions reached, notes
 * chosen — and a sage wash rises to say the plan is ready. Then, on the
 * cream, a slide to commit with the Tress orb as the knob; confetti and
 * a filled pill when it completes; and a short run of lines that
 * cross-fade on their own before Next hands over to the paywall.
 *
 * What it will not do. The reference product this is modelled on rolls
 * up the size of its catalogue and how many products "match", promises
 * a feeling by one date and that others will notice by another, and
 * counts the people who joined today. None of that is knowable here:
 * every number is a count of the record on this phone (plan-model.ts),
 * every date is one the record itself sets, and every sentence is in
 * plan-copy.ts where the sweep can read it.
 *
 * A tap during the counts moves to the next; under Reduce Motion the
 * numbers land, the field is still, the confetti is a still scatter and
 * every line waits for Next.
 */

import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { CommitSlider } from '@/components/plan/commit-slider';
import { Confetti } from '@/components/plan/confetti';
import { ReadyWash } from '@/components/plan/ready-wash';
import { RollingNumber } from '@/components/plan/rolling-number';
import { Starfield } from '@/components/plan/starfield';
import { TextSequence } from '@/components/plan/text-sequence';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { PLAN_COPY, countLine, sequenceLines, type AccentLine } from '@/features/onboarding/plan-copy';
import { buildPlanModel } from '@/features/onboarding/plan-model';
import { useAppStore } from '@/store/app-store';
import { darkColors, lightColors, splitAlpha, useTheme } from '@/theme';

type Phase = 'building' | 'ready' | 'commit' | 'sequence';

/** How long each count holds before the next rolls. */
const STEP_MS = 1_600;
/** The pause on the last count before the wash rises. */
const READY_AFTER_MS = 900;
/** How long the filled pill shows its word before the lines begin. */
const CELEBRATE_MS = 900;
/** The count lines hold a narrower measure than the screen. */
const MEASURE = 320;

/** One line with its accent word coloured, on either ground. */
function Accented({ line, dark }: { line: AccentLine; dark: boolean }) {
  const ink = dark ? darkColors.text : undefined;
  const accent = dark ? darkColors.accent : undefined;
  return (
    <Text variant="title2" center style={[{ maxWidth: MEASURE }, ink !== undefined && { color: ink }]}>
      {line.before}
      {line.accent.length > 0 ? (
        <Text variant="title2" color="accent" style={accent !== undefined && { color: accent }}>
          {line.accent}
        </Text>
      ) : null}
      {line.after}
    </Text>
  );
}

/** The soft light in the upper left of the cream scenes. */
function CreamGlow() {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const sage = splitAlpha(colors.accentSoft);
  const warm = splitAlpha(colors.warning);
  return (
    <Svg
      pointerEvents="none"
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0 }}>
      <Defs>
        <RadialGradient id="planGlowSage" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={sage.color} stopOpacity={sage.opacity} />
          <Stop offset="1" stopColor={sage.color} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="planGlowWarm" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={warm.color} stopOpacity={0.16 * warm.opacity} />
          <Stop offset="1" stopColor={warm.color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={width * 0.18} cy={height * 0.28} r={width * 0.62} fill="url(#planGlowSage)" />
      <Circle cx={width * 0.62} cy={height * 0.5} r={width * 0.4} fill="url(#planGlowWarm)" />
    </Svg>
  );
}

export default function PlanScreen() {
  const router = useRouter();
  const { colors, spacing, radius, shadow, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const { data } = useAppStore();

  const model = useMemo(() => buildPlanModel(data), [data]);
  const counts = model.counts;
  const lines = useMemo(() => sequenceLines(model), [model]);

  const [phase, setPhase] = useState<Phase>(counts.length > 0 ? 'building' : 'ready');
  const [step, setStep] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const [committed, setCommitted] = useState(false);

  const lastStep = counts.length - 1;

  const advanceCount = useCallback(() => {
    if (step < lastStep) {
      setStep((s) => s + 1);
      setBurstKey((k) => k + 1);
    } else {
      setPhase('ready');
    }
  }, [step, lastStep]);

  useEffect(() => {
    if (phase !== 'building') return;
    const hold = step < lastStep ? STEP_MS : STEP_MS + READY_AFTER_MS;
    const timer = setTimeout(advanceCount, hold);
    return () => clearTimeout(timer);
  }, [phase, step, lastStep, advanceCount]);

  useEffect(() => {
    if (!committed) return;
    const timer = setTimeout(() => setPhase('sequence'), CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [committed]);

  const showPlan = useCallback(() => setPhase('commit'), []);
  const commit = useCallback(() => setCommitted(true), []);
  const toPaywall = useCallback(() => router.replace('/paywall'), [router]);

  const dark = phase === 'building' || phase === 'ready';
  const count = counts[Math.min(step, Math.max(0, lastStep))];

  return (
    <View style={{ flex: 1, backgroundColor: dark ? darkColors.background : colors.background }}>
      <StatusBar style={dark || scheme === 'dark' ? 'light' : 'dark'} />

      {dark ? (
        <Animated.View key="night" exiting={FadeOut.duration(320)} style={{ flex: 1 }}>
          <Starfield burstKey={burstKey} gathered={phase === 'ready'} reduceMotion={reduceMotion} />
          <ReadyWash visible={phase === 'ready'} reduceMotion={reduceMotion} />

          {/*
            Tap-to-hurry for a sighted hand only. The wrapper is not an
            accessibility element, so a screen reader reaches the caption,
            the number and the line beneath it rather than one flattened
            button — and the counts advance on their own regardless.
          */}
          <Pressable
            onPress={phase === 'building' ? advanceCount : undefined}
            accessible={false}
            style={{ flex: 1, paddingTop: insets.top + spacing.lg }}>
            <Animated.View key={phase} entering={FadeIn.duration(360)} style={{ alignItems: 'center' }}>
              <Text variant="callout" center style={{ color: darkColors.text }}>
                {phase === 'ready' ? PLAN_COPY.ready.caption : PLAN_COPY.building.caption}
              </Text>
            </Animated.View>

            <View style={{ flex: 1 }} />

            {count ? (
              <View style={{ alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.md }}>
                <RollingNumber
                  key={count.id}
                  value={count.value}
                  color={darkColors.text}
                  reduceMotion={reduceMotion}
                />
                <Animated.View key={`line-${count.id}`} entering={FadeIn.duration(420).delay(200)}>
                  <Accented line={countLine(count)} dark />
                </Animated.View>
              </View>
            ) : null}

            <View
              style={{
                height: 56 + spacing.xxl,
                marginTop: spacing.xxxl,
                marginBottom: insets.bottom + spacing.lg,
                paddingHorizontal: spacing.xl,
                justifyContent: 'flex-end',
              }}>
              {phase === 'ready' ? (
                <Animated.View
                  entering={
                    reduceMotion
                      ? FadeIn.duration(220)
                      : FadeInDown.duration(480).delay(500).withInitialValues({ opacity: 0, transform: [{ translateY: 14 }] })
                  }>
                  <PressableScale
                    onPress={showPlan}
                    accessibilityRole="button"
                    accessibilityLabel={PLAN_COPY.ready.cta}
                    scaleTo={0.975}
                    style={{
                      height: 56,
                      borderRadius: radius.pill,
                      backgroundColor: lightColors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Text variant="headline" style={{ color: lightColors.text }}>
                      {PLAN_COPY.ready.cta}
                    </Text>
                  </PressableScale>
                </Animated.View>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
      ) : null}

      {phase === 'commit' ? (
        <Animated.View
          key="commit"
          entering={FadeIn.duration(420)}
          exiting={FadeOut.duration(300)}
          style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }}>
          <CreamGlow />
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.xxxl }}>
            <Text variant="title1" center style={{ maxWidth: MEASURE, alignSelf: 'center' }}>
              {PLAN_COPY.commit.title}
            </Text>
            <CommitSlider
              label={PLAN_COPY.commit.slide}
              doneLabel={PLAN_COPY.commit.done}
              accessibilityHint={PLAN_COPY.commit.accessibilityHint}
              committed={committed}
              onCommit={commit}
              reduceMotion={reduceMotion}
            />
            <View style={{ height: height * 0.12 }} />
          </View>

          <View
            accessible
            accessibilityRole="text"
            style={[
              {
                marginHorizontal: spacing.lg,
                padding: spacing.lg,
                borderRadius: radius.card,
                backgroundColor: colors.surface,
                gap: spacing.xs,
              },
              shadow.soft,
            ]}>
            <Text variant="footnote">{PLAN_COPY.commit.citation.title}</Text>
            <Text variant="caption" color="textSecondary">
              {PLAN_COPY.commit.citation.source}
            </Text>
          </View>

          <Confetti active={committed} reduceMotion={reduceMotion} width={width} height={height} />
        </Animated.View>
      ) : null}

      {phase === 'sequence' ? (
        <Animated.View key="sequence" entering={FadeIn.duration(420)} style={{ flex: 1, paddingTop: insets.top }}>
          <CreamGlow />
          <TextSequence
            lines={lines}
            autoAdvance={!reduceMotion}
            nextLabel={PLAN_COPY.sequence.next}
            onDone={toPaywall}
            reduceMotion={reduceMotion}
            bottomInset={insets.bottom}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
