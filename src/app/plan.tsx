/**
 * The plan: what happens between the funnel's report and the paywall.
 *
 * Four scenes, in one route. On a dark ground a dense field of stars
 * keeps forming constellations — a comb, a strand, a cycle, a hairline,
 * a grid, a head — while a short figure rolls in beneath each one and a
 * line says what it is: how many hairstyles the catalogue holds for
 * their hair type, how fast hair grows, how long a strand lasts, how
 * many shed in a day, how long dermatologists wait before judging a
 * change, and what is on their record. A wave crosses the field
 * between figures. After the last, the field condenses into the seven
 * stars of the Big Dipper, each blinking on its own timing, and the
 * wash rises behind them to say the plan is ready.
 * Then, on the cream, a slide to commit with the Tress orb as the knob;
 * confetti and a filled pill when it completes; and a short run of
 * lines that cross-fade on their own before Next hands over to the
 * paywall.
 *
 * What it will not do. The reference product this is modelled on rolls
 * up the size of its catalogue and how many products "match", promises
 * a feeling by one date and that others will notice by another, and
 * counts the people who joined today. None of that is knowable here:
 * every figure is either a fact about hair with its source beside it or
 * a count of the record on this phone (plan-model.ts), every date is one
 * the record itself sets, and every sentence is in plan-copy.ts where
 * the sweep can read it.
 *
 * A tap during the facts moves to the next; under Reduce Motion the
 * figures are simply there, the field is still, the confetti is a still
 * scatter and every line waits for Next.
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
import { Constellation, figureForFact } from '@/components/plan/constellation';
import { FactCard } from '@/components/plan/fact-card';
import { ReadyWash } from '@/components/plan/ready-wash';
import { TextSequence } from '@/components/plan/text-sequence';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { PLAN_COPY, factLine, sequenceLines } from '@/features/onboarding/plan-copy';
import { buildPlanModel } from '@/features/onboarding/plan-model';
import { useAppStore } from '@/store/app-store';
import { darkColors, lightColors, splitAlpha, useTheme } from '@/theme';

type Phase = 'building' | 'ready' | 'commit' | 'sequence';

/** How long each fact holds before the next forms. */
const STEP_MS = 2_000;
/** The pause on the last fact before the field condenses into the Dipper. */
const READY_AFTER_MS = 900;
/** How long the Dipper has the dark to itself before the wash rises behind it. */
const CONDENSE_MS = 1_500;
/** How long the filled pill shows its word before the lines begin. */
const CELEBRATE_MS = 900;
/** The fact lines hold a narrower measure than the screen. */
const MEASURE = 320;

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
  const facts = model.facts;
  const lines = useMemo(() => sequenceLines(model), [model]);

  const [phase, setPhase] = useState<Phase>(facts.length > 0 ? 'building' : 'ready');
  const [step, setStep] = useState(0);
  const [committed, setCommitted] = useState(false);
  /** Set once the Dipper has had its moment; under Reduce Motion there is no moment to wait for. */
  const [condensed, setCondensed] = useState(false);

  const lastStep = facts.length - 1;

  const advanceFact = useCallback(() => {
    if (step < lastStep) {
      setStep((s) => s + 1);
    } else {
      setPhase('ready');
    }
  }, [step, lastStep]);

  useEffect(() => {
    if (phase !== 'building') return;
    const hold = step < lastStep ? STEP_MS : STEP_MS + READY_AFTER_MS;
    const timer = setTimeout(advanceFact, hold);
    return () => clearTimeout(timer);
  }, [phase, step, lastStep, advanceFact]);

  useEffect(() => {
    if (phase !== 'ready' || reduceMotion) return;
    const timer = setTimeout(() => setCondensed(true), CONDENSE_MS);
    return () => clearTimeout(timer);
  }, [phase, reduceMotion]);

  /** The wash, the ready caption and the button wait for the Dipper to form. */
  const washUp = phase === 'ready' && (reduceMotion || condensed);

  useEffect(() => {
    if (!committed) return;
    const timer = setTimeout(() => setPhase('sequence'), CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [committed]);

  const showPlan = useCallback(() => setPhase('commit'), []);
  const commit = useCallback(() => setCommitted(true), []);
  const toPaywall = useCallback(() => router.replace('/paywall'), [router]);

  const dark = phase === 'building' || phase === 'ready';
  const fact = facts[Math.min(step, Math.max(0, lastStep))];

  return (
    <View style={{ flex: 1, backgroundColor: dark ? darkColors.background : colors.background }}>
      <StatusBar style={dark || scheme === 'dark' ? 'light' : 'dark'} />

      {dark ? (
        <Animated.View key="night" exiting={FadeOut.duration(320)} style={{ flex: 1 }}>
          {/* The wash sits under the field, so the Dipper's seven keep blinking on it. */}
          <ReadyWash visible={washUp} reduceMotion={reduceMotion} />
          <Constellation
            figure={phase === 'ready' ? 'dipper' : fact ? figureForFact(fact.id) : null}
            reduceMotion={reduceMotion}
          />

          {/*
            Tap-to-hurry for a sighted hand only. The wrapper is not an
            accessibility element, so a screen reader reaches the caption,
            the headline and the line beneath it rather than one flattened
            button — and the facts advance on their own regardless.
          */}
          <Pressable
            onPress={phase === 'building' ? advanceFact : undefined}
            accessible={false}
            style={{ flex: 1, paddingTop: insets.top + spacing.lg }}>
            <Animated.View
              key={washUp ? 'ready' : 'building'}
              entering={FadeIn.duration(360)}
              style={{ alignItems: 'center' }}>
              <Text variant="callout" center style={{ color: darkColors.text }}>
                {washUp ? PLAN_COPY.ready.caption : PLAN_COPY.building.caption}
              </Text>
            </Animated.View>

            <View style={{ flex: 1 }} />

            {fact ? (
              <View style={{ paddingHorizontal: spacing.xl }}>
                <FactCard
                  fact={fact}
                  line={factLine(fact)}
                  reduceMotion={reduceMotion}
                  maxWidth={Math.min(MEASURE, width - spacing.xl * 2)}
                  gap={spacing.md}
                />
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
              {washUp ? (
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
