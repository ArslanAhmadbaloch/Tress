/**
 * The onboarding funnel.
 *
 * One screen holding a step machine, rather than seventeen routes. Every
 * answer lives here until the card is revealed, which is the moment the
 * journey is actually created — so someone can go back and change anything
 * they said, and nothing is written until they have seen what it makes.
 *
 * The order is the argument. Three questions about what this means to them
 * before anything about hair; a fact card in return before a fourth
 * question; their name asked last, once the journey is already theirs.
 */

import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, TextInput, View, useWindowDimensions } from 'react-native';

import {
  Breathe,
  ChoiceRow,
  FactBody,
  FunnelShell,
  PlanFact,
  PlanLine,
  Rise,
  Scale,
  StepTitle,
  SubHeading,
  Wash,
} from '@/components/funnel';
import { BrandLockup } from '@/components/brand-lockup';
import { CardFloat, MemberCard } from '@/components/member-card';
import { Icon, type IconName } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { ProductRow } from '@/components/product-row';
import { FACTS, type Fact } from '@/features/onboarding/facts';
import { productOptions, type CustomProduct } from '@/features/onboarding/products';
import {
  APPROACH_CHOICES,
  ASKS_MEDICATION,
  CADENCE_CHOICES,
  CONSISTENCY_CHOICES,
  COPY,
  funnelContent,
  GENDER_CHOICES,
  MEANING_CHOICES,
  MEDICATION_EXCLUSIVE,
  NEEDS_SYSTEM,
  ONSET_CHOICES,
  routineSeedsFor,
  withName,
  STEPS,
  UNCOUNTED,
  type Choice,
} from '@/features/onboarding/script';
import { inferRoutineIcon } from '@/features/routine/icons';
import { persistProfilePhoto } from '@/lib/photo-storage';
import { useAppStore } from '@/store/app-store';
import { MIN_TOUCH_TARGET, useTheme, typography } from '@/theme';
import {
  HAIR_GOAL_LABELS,
  PREOCCUPATION_STEPS,
  TRACKING_AREA_LABELS,
  type Approach,
  type Gender,
  type HairGoal,
  type Medication,
  type Motivation,
  type Onset,
  type SelfConsistency,
  type TrackingArea,
  type Trigger,
} from '@/types/domain';

type Answers = {
  motivations: Motivation[];
  goal: HairGoal | null;
  noticed: Onset | null;
  areas: TrackingArea[];
  preoccupation: number | null;
  triggers: Trigger[];
  approaches: Approach[];
  medications: Medication[];
  medicationNote: string;
  /** Ticked products, mapped to how often each happens. */
  products: Record<string, number>;
  /**
   * The frequency last chosen for a product, kept even after it is
   * unticked. Without it, unticking threw the choice away and ticking
   * again silently restored the catalogue default — so somebody who set
   * shampoo to four times a week, tapped the row again, and tapped back
   * got two, with nothing on screen saying it had changed.
   */
  productFrequency: Record<string, number>;
  customProducts: CustomProduct[];
  productDraft: string;
  consistency: SelfConsistency | null;
  intervalDays: number;
  avatarUri?: string;
  name: string;
  age: string;
  gender: Gender;
};

const EMPTY: Answers = {
  motivations: [],
  goal: null,
  noticed: null,
  areas: [],
  preoccupation: null,
  triggers: [],
  approaches: [],
  medications: [],
  medicationNote: '',
  products: {},
  productFrequency: {},
  customProducts: [],
  productDraft: '',
  consistency: null,
  intervalDays: 30,
  name: '',
  age: '',
  // The set the app shipped with, so skipping the question changes nothing.
  gender: 'male',
};

/** Toggle membership of a multi-select answer. */
function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * As above, but "Nothing right now" cannot be true alongside a treatment.
 * Letting both stand would put an item in the stack for someone who just
 * said they take nothing.
 */
function toggleMedication(list: Medication[], value: Medication): Medication[] {
  if (value === MEDICATION_EXCLUSIVE) {
    return list.includes(value) ? [] : [value];
  }
  return toggle(list.filter((m) => m !== MEDICATION_EXCLUSIVE), value);
}

export default function OnboardingFunnel() {
  const { colors, spacing, radius } = useTheme();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { createJourney } = useAppStore();

  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [cursor, setCursor] = useState(0);

  const set = (patch: Partial<Answers>) => setAnswers((prev) => ({ ...prev, ...patch }));

  /**
   * The willpower screen only appears for the people it is about. Telling
   * someone who is already consistent that they need a system is a small
   * insult, and it costs a screen.
   */
  const steps = useMemo(() => {
    const needsSystem =
      answers.consistency !== null && NEEDS_SYSTEM.includes(answers.consistency);
    const asksMedication = answers.approaches.some((a) => ASKS_MEDICATION.includes(a));

    return STEPS.filter((s) => {
      if (s === 'system') return needsSystem;
      if (s === 'medication') return asksMedication;
      return true;
    });
  }, [answers.consistency, answers.approaches]);

  const step = steps[Math.min(cursor, steps.length - 1)];

  const progress = useMemo(() => {
    const counted = steps.filter((s) => !UNCOUNTED.includes(s));
    const done = steps.slice(0, cursor).filter((s) => !UNCOUNTED.includes(s)).length;
    return counted.length === 0 ? null : done / counted.length;
  }, [steps, cursor]);

  const next = () => setCursor((c) => Math.min(c + 1, steps.length - 1));
  const back = () => setCursor((c) => Math.max(0, c - 1));

  /* ------------------------ committing the journey ---------------------- */

  /** The ticked products and anything typed in, as routine seeds. */
  const productSeeds = () => {
    const options = productOptions(answers.gender);
    const chosen = options
      .filter((option) => answers.products[option.id] !== undefined)
      .map((option) => ({
        label: option.label,
        icon: option.icon,
        timeOfDay: 'anytime' as const,
        timesPerWeek: answers.products[option.id],
      }));

    const typed = answers.customProducts.map((product) => ({
      label: product.label,
      icon: inferRoutineIcon(product.label),
      timeOfDay: 'anytime' as const,
      timesPerWeek: product.timesPerWeek,
    }));

    return [...chosen, ...typed];
  };

  /**
   * The stack these answers build.
   *
   * Both the plan screen's preview and the commit read this, because they
   * had drifted: the preview was built from a second call that had not
   * been given the products, so it told somebody their routine was empty
   * on the screen right before it was created with four things on it.
   */
  const seeds = () =>
    routineSeedsFor({
      approaches: answers.approaches,
      medications: answers.medications,
      medicationNote: answers.medicationNote.trim(),
      products: productSeeds(),
    });

  const commit = () => {
    const age = Number.parseInt(answers.age, 10);

    const note = answers.medicationNote.trim();

    createJourney({
      displayName: answers.name,
      age: Number.isFinite(age) && age > 0 && age < 120 ? age : undefined,
      gender: answers.gender,
      avatarUri: answers.avatarUri,
      journey: {
        // Today is the baseline, whatever they have been doing until now.
        startedAt: new Date().toISOString(),
        trackingAreas: answers.areas,
        motivations: answers.motivations,
        goal: answers.goal ?? 'unsure',
        noticed: answers.noticed ?? undefined,
        preoccupation: answers.preoccupation ?? undefined,
        triggers: answers.triggers,
        approaches: answers.approaches,
        medications: answers.medications.length > 0 ? answers.medications : undefined,
        medicationNote: note || undefined,
        selfConsistency: answers.consistency ?? undefined,
        updateIntervalDays: answers.intervalDays,
      },
      routineSeeds: seeds(),
    });
  };

  // Created on arrival at the card, not on the last tap: the card is the
  // first thing that reads from the store, and it should read the truth.
  useEffect(() => {
    if (step === 'card') commit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /* ------------------------------ the photo ----------------------------- */

  const addPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photos are not available',
        'Hair Journey needs permission to open your photo library. You can turn it on in your device Settings, or skip this for now.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled) return;

    try {
      // The picker hands back a cache file the OS may clear; keep our own.
      // Passing the current one lets "choose a different photo" replace it
      // rather than leave the first behind.
      set({ avatarUri: await persistProfilePhoto(result.assets[0].uri, answers.avatarUri) });
      next();
    } catch {
      Alert.alert('That photo could not be saved', 'Try another, or skip for now.');
    }
  };

  /* -------------------------------- render ------------------------------ */

  const shell = (props: Omit<Parameters<typeof FunnelShell>[0], 'stepKey' | 'progress'>) => (
    <FunnelShell
      {...props}
      stepKey={step}
      progress={progress}
      onBack={cursor > 0 ? back : undefined}
    />
  );

  /* The question set follows the answer given on the first screen. */
  const content = funnelContent(answers.gender);
  /** Puts their name into the headings written with a slot for it. */
  const named = (line: string) => withName(line, answers.name);

  const goalLabel = answers.goal ? HAIR_GOAL_LABELS[answers.goal] : undefined;
  const cardWidth = Math.min(320, width - spacing.lg * 2 - spacing.xl);

  switch (step) {
    /* ----------------------------- welcome ---------------------------- */
    case 'welcome':
      /*
       * The lockup and nothing else — the same artwork the launch
       * animation just finished assembling, standing still. A person who
       * has watched it resolve should find it exactly where it settled
       * rather than meeting a second, differently drawn version of it.
       */
      return shell({
        backdrop: <BrandLockup />,
        cta: COPY.welcome.cta,
        onCta: next,
        footnote: COPY.welcome.footnote,
        children: <View style={{ flex: 1 }} />,
      });

    /* ---------------------------- what it means ----------------------- */
    case 'meaning':
      return shell({
        cta: COPY.meaning.cta,
        onCta: next,
        ctaDisabled: answers.motivations.length === 0,
        children: (
          <>
            <StepTitle title={named(COPY.meaning.title)} subtitle={COPY.meaning.subtitle} />
            <Choices
              choices={MEANING_CHOICES}
              multi
              selected={answers.motivations}
              onToggle={(v) => set({ motivations: toggle(answers.motivations, v) })}
              from={2}
            />
          </>
        ),
      });

    /* -------------------------------- goal ---------------------------- */
    case 'goal':
      return shell({
        cta: COPY.goal.cta,
        onCta: next,
        ctaDisabled: answers.goal === null,
        footnote: answers.goal ? COPY.goal.settle : undefined,
        children: (
          <>
            <StepTitle title={named(COPY.goal.title)} subtitle={COPY.goal.subtitle} />
            <Choices
              choices={content.goals}
              multi={false}
              selected={answers.goal ? [answers.goal] : []}
              onToggle={(v) => set({ goal: v })}
              from={2}
            />
          </>
        ),
      });

    /* ------------------------------- facts ---------------------------- */
    case 'factGradual':
      return shell({
        cta: FACTS.gradual.cta,
        onCta: next,
        children: <FactScreen fact={FACTS.gradual} illustration={<Timeline />} />,
      });

    case 'factFeelings':
      return shell({
        cta: FACTS.feelings.cta,
        onCta: next,
        children: <FactScreen fact={FACTS.feelings} illustration={<Arc />} />,
      });

    case 'factCause':
      return shell({
        cta: FACTS.cause.cta,
        onCta: next,
        children: <FactScreen fact={FACTS.cause} illustration={<Strands />} />,
      });

    /* ------------------------------- story ---------------------------- */
    case 'story':
      return shell({
        cta: COPY.story.cta,
        onCta: next,
        ctaDisabled: answers.noticed === null || answers.areas.length === 0,
        children: (
          <>
            <StepTitle title={content.story.title} />
            <Choices
              choices={ONSET_CHOICES}
              multi={false}
              selected={answers.noticed ? [answers.noticed] : []}
              onToggle={(v) => set({ noticed: v })}
              from={1}
            />

            {answers.noticed ? (
              <>
                <SubHeading text={content.story.second} />
                <Choices
                  choices={content.areas}
                  multi
                  selected={answers.areas}
                  onToggle={(v) => set({ areas: toggle(answers.areas, v) })}
                />
              </>
            ) : null}
          </>
        ),
      });

    /* ------------------------------- impact --------------------------- */
    case 'impact':
      return shell({
        cta: COPY.impact.cta,
        onCta: next,
        ctaDisabled: answers.preoccupation === null,
        children: (
          <>
            <StepTitle title={named(COPY.impact.title)} />
            <Scale
              steps={PREOCCUPATION_STEPS}
              value={answers.preoccupation}
              low={COPY.impact.scaleLow}
              high={COPY.impact.scaleHigh}
              onChange={(v) => set({ preoccupation: v })}
              index={1}
            />

            {answers.preoccupation !== null ? (
              <>
                <SubHeading text={COPY.impact.second} />
                <Choices
                  choices={content.triggers}
                  multi
                  selected={answers.triggers}
                  onToggle={(v) => set({ triggers: toggle(answers.triggers, v) })}
                />
              </>
            ) : null}
          </>
        ),
      });

    /* ------------------------------ approach -------------------------- */
    case 'approach':
      return shell({
        cta: COPY.approach.cta,
        onCta: next,
        ctaDisabled: answers.approaches.length === 0 || answers.consistency === null,
        children: (
          <>
            <StepTitle title={COPY.approach.title} subtitle={COPY.approach.subtitle} />
            <Choices
              choices={APPROACH_CHOICES}
              multi
              selected={answers.approaches}
              onToggle={(v) => set({ approaches: toggle(answers.approaches, v) })}
              from={2}
            />

            {answers.approaches.length > 0 ? (
              <>
                <SubHeading text={COPY.approach.second} />
                <Choices
                  choices={CONSISTENCY_CHOICES}
                  multi={false}
                  selected={answers.consistency ? [answers.consistency] : []}
                  onToggle={(v) => set({ consistency: v })}
                />
              </>
            ) : null}
          </>
        ),
      });

    /* ----------------------------- medication ------------------------- */
    case 'medication':
      return shell({
        cta: COPY.medication.cta,
        onCta: next,
        // Never disabled, and there is a way past without answering. This
        // is the one question in the funnel that asks for medical
        // information about a person, and it is theirs to withhold.
        secondary: answers.medications.length === 0 ? COPY.medication.skip : undefined,
        onSecondary: answers.medications.length === 0 ? next : undefined,
        footnote: COPY.medication.footnote,
        children: (
          <>
            <StepTitle
              title={COPY.medication.title}
              subtitle={COPY.medication.subtitle}
            />
            <Choices
              choices={content.medications}
              multi
              selected={answers.medications}
              onToggle={(v) => set({ medications: toggleMedication(answers.medications, v) })}
              from={2}
            />

            {answers.medications.includes('other') ? (
              <Rise index={2 + content.medications.length}>
                <View style={{ marginTop: spacing.lg }}>
                  <Field
                    value={answers.medicationNote}
                    onChange={(medicationNote) => set({ medicationNote })}
                    placeholder={COPY.medication.otherPlaceholder}
                    label={COPY.medication.otherLabel}
                    autoFocus
                  />
                </View>
              </Rise>
            ) : null}
          </>
        ),
      });

    /* ------------------------------ products -------------------------- */
    case 'products': {
      const options = productOptions(answers.gender);
      const chosen = Object.keys(answers.products).length + answers.customProducts.length;

      const toggleProduct = (id: string, fallback: number) => {
        const next = { ...answers.products };
        if (next[id] === undefined) {
          // Ticking again gives back what they chose last time, not the
          // default they had already overridden.
          next[id] = answers.productFrequency[id] ?? fallback;
        } else {
          delete next[id];
        }
        set({ products: next });
      };

      const chooseFrequency = (id: string, times: number) =>
        set({
          products: { ...answers.products, [id]: times },
          productFrequency: { ...answers.productFrequency, [id]: times },
        });

      const addTyped = () => {
        const label = answers.productDraft.trim();
        if (!label) return;
        set({
          customProducts: [
            ...answers.customProducts,
            { id: `${Date.now()}`, label, timesPerWeek: 7 },
          ],
          productDraft: '',
        });
      };

      return shell({
        cta: COPY.products.cta,
        onCta: next,
        // Never required. A stack somebody was pushed into is a stack they
        // abandon in a fortnight.
        secondary: chosen === 0 ? COPY.products.skip : undefined,
        onSecondary: chosen === 0 ? next : undefined,
        children: (
          <>
            <StepTitle title={COPY.products.title} subtitle={COPY.products.subtitle} />

            <View style={{ gap: spacing.sm }}>
              {options.map((option, i) => (
                <Rise key={option.id} index={2 + i}>
                  <ProductRow
                    label={option.label}
                    icon={option.icon}
                    selected={answers.products[option.id] !== undefined}
                    timesPerWeek={
                      answers.products[option.id] ?? option.defaultTimesPerWeek
                    }
                    onToggle={() => toggleProduct(option.id, option.defaultTimesPerWeek)}
                    onFrequency={(times) => chooseFrequency(option.id, times)}
                  />
                </Rise>
              ))}

              {answers.customProducts.map((product) => (
                <ProductRow
                  key={product.id}
                  label={product.label}
                  icon={inferRoutineIcon(product.label)}
                  selected
                  timesPerWeek={product.timesPerWeek}
                  onToggle={() =>
                    set({
                      customProducts: answers.customProducts.filter(
                        (p) => p.id !== product.id,
                      ),
                    })
                  }
                  onRemove={() =>
                    set({
                      customProducts: answers.customProducts.filter(
                        (p) => p.id !== product.id,
                      ),
                    })
                  }
                  onFrequency={(times) =>
                    set({
                      customProducts: answers.customProducts.map((p) =>
                        p.id === product.id ? { ...p, timesPerWeek: times } : p,
                      ),
                    })
                  }
                />
              ))}
            </View>

            {/* Whatever the list missed. Most routines have something on
                them that no catalogue would guess. */}
            <SubHeading text={COPY.products.second} index={2 + options.length} />
            <Rise index={3 + options.length}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Field
                    value={answers.productDraft}
                    onChange={(productDraft) => set({ productDraft })}
                    placeholder={COPY.products.addPlaceholder}
                    label={COPY.products.addLabel}
                    onSubmit={addTyped}
                  />
                </View>
                <PressableScale
                  onPress={addTyped}
                  disabled={answers.productDraft.trim().length === 0}
                  accessibilityRole="button"
                  accessibilityLabel={COPY.products.addCta}
                  style={{
                    width: MIN_TOUCH_TARGET + 12,
                    height: MIN_TOUCH_TARGET + 12,
                    borderRadius: radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor:
                      answers.productDraft.trim().length === 0
                        ? colors.fill
                        : colors.accent,
                  }}>
                  <Icon
                    name="plus"
                    size={18}
                    color={
                      answers.productDraft.trim().length === 0
                        ? colors.textTertiary
                        : colors.textOnAccent
                    }
                  />
                </PressableScale>
              </View>
            </Rise>
          </>
        ),
      });
    }

    /* ------------------------------- system --------------------------- */
    case 'system':
      return shell({
        centred: true,
        cta: COPY.system.cta,
        onCta: next,
        children: (
          <>
            <Wash />
            <Rise index={0}>
              <Text variant="title1" center>
                {COPY.system.title}
              </Text>
              <Text variant="title1" color="textTertiary" center>
                {COPY.system.titleMuted}
              </Text>
            </Rise>

            <Rise index={1}>
              <Text
                variant="callout"
                color="textSecondary"
                center
                style={{ marginTop: spacing.lg, marginBottom: spacing.xxxl }}>
                {COPY.system.body}
              </Text>
            </Rise>

            {['Morning', 'Evening', 'Photo day'].map((label, i) => (
              <Rise key={label} index={2 + i}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    padding: spacing.lg,
                    marginBottom: spacing.sm,
                    borderRadius: radius.md,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}>
                  <Text variant="headline" style={{ flex: 1 }}>
                    {label}
                  </Text>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.accent,
                    }}>
                    <Icon name="check" size={12} color={colors.textOnAccent} />
                  </View>
                </View>
              </Rise>
            ))}
          </>
        ),
      });

    /* ------------------------------ cadence --------------------------- */
    case 'cadence':
      return shell({
        cta: COPY.cadence.cta,
        onCta: next,
        children: (
          <>
            <StepTitle title={COPY.cadence.title} subtitle={COPY.cadence.subtitle} />
            <Choices
              choices={CADENCE_CHOICES}
              multi={false}
              selected={[String(answers.intervalDays)]}
              onToggle={(v) => set({ intervalDays: Number(v) })}
              from={2}
            />
          </>
        ),
      });

    /* ------------------------------- photo ---------------------------- */
    case 'photo':
      return shell({
        centred: true,
        cta: answers.avatarUri ? 'Continue' : COPY.photo.cta,
        onCta: answers.avatarUri ? next : addPhoto,
        secondary: answers.avatarUri ? 'Choose a different photo' : COPY.photo.skip,
        onSecondary: answers.avatarUri ? addPhoto : next,
        children: (
          <>
            <Wash />
            <Rise index={0} style={{ alignItems: 'center', marginBottom: spacing.xxl }}>
              <View
                style={{
                  width: 148,
                  height: 148,
                  borderRadius: 74,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.accentSoft,
                  borderWidth: 1,
                  borderColor: colors.accentBorder,
                }}>
                {answers.avatarUri ? (
                  <Image
                    source={{ uri: answers.avatarUri }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    accessibilityLabel="Your photo"
                  />
                ) : (
                  <Icon name="profile" size={54} color={colors.accent} />
                )}
              </View>
            </Rise>

            <Rise index={1}>
              <Text variant="title1" center>
                {COPY.photo.title}
              </Text>
              <Text
                variant="callout"
                color="textSecondary"
                center
                style={{ marginTop: spacing.md }}>
                {COPY.photo.subtitle}
              </Text>
            </Rise>
          </>
        ),
      });

    /* --------------------------------- you ---------------------------- */
    case 'you':
      return shell({
        cta: COPY.you.cta,
        onCta: next,
        ctaDisabled: answers.name.trim().length === 0,
        children: (
          <>
            <StepTitle title={COPY.you.title} />

            {/*
              Gender leads, because everything after this screen is drawn
              from it: which reference photographs are shown, and which
              questions the funnel asks. Asked plainly — it decides what
              the app shows, not what it thinks of anybody.
            */}
            <SubHeading text={COPY.you.genderPrompt} index={1} />
            <Rise index={2}>
              <Choices
                choices={GENDER_CHOICES}
                multi={false}
                selected={[answers.gender]}
                onToggle={(gender) => set({ gender })}
                from={2}
              />
              <Text variant="caption" color="textTertiary" style={{ marginTop: spacing.sm }}>
                {COPY.you.genderHint}
              </Text>
            </Rise>

            <SubHeading text={COPY.you.nameLabel} index={4} />
            <Rise index={5}>
              <Field
                value={answers.name}
                onChange={(name) => set({ name })}
                placeholder="Your name"
                label="Your name"
              />
            </Rise>

            <SubHeading text={COPY.you.second} index={6} />
            <Rise index={7}>
              <Field
                value={answers.age}
                onChange={(age) => set({ age: age.replace(/[^0-9]/g, '').slice(0, 3) })}
                placeholder="Age"
                label="Your age"
                keyboardType="number-pad"
              />
              <Text variant="caption" color="textTertiary" style={{ marginTop: spacing.sm }}>
                {COPY.you.ageHint}
              </Text>
            </Rise>
          </>
        ),
      });

    /* -------------------------------- card ---------------------------- */
    case 'card':
      return shell({
        centred: true,
        cta: COPY.card.cta,
        onCta: next,
        children: (
          <>
            <Wash />
            <Rise index={0}>
              <Text variant="title2" center>
                {COPY.card.title}
              </Text>
              <Text
                variant="callout"
                color="textSecondary"
                center
                style={{ marginTop: spacing.xs, marginBottom: spacing.xl }}>
                {COPY.card.subtitle}
              </Text>
            </Rise>

            <Rise index={2} style={{ alignItems: 'center' }}>
              <CardFloat>
                <MemberCard
                  name={answers.name.trim() || 'You'}
                  age={answers.age ? Number(answers.age) : undefined}
                  goalLabel={goalLabel}
                  portraitUri={answers.avatarUri}
                  startedAt={new Date().toISOString()}
                  consistency={0}
                  width={cardWidth}
                />
              </CardFloat>
            </Rise>
          </>
        ),
      });

    /* -------------------------------- plan ---------------------------- */
    case 'plan':
      return shell({
        cta: COPY.plan.cta,
        onCta: next,
        children: (
          <>
            <StepTitle
              title={`Your journey is ready,`}
              muted={`${answers.name.trim() || 'You'}.`}
            />

            <View style={{ gap: spacing.sm }}>
              <PlanFact label="Your goal" value={goalLabel ?? 'Still deciding'} index={2} />
              <PlanFact
                label="What you're focusing on"
                value={
                  answers.areas.length
                    ? answers.areas.map((a) => TRACKING_AREA_LABELS[a]).join(' · ')
                    : 'Everything, for now'
                }
                index={3}
              />
              <PlanFact
                label="Your check-in"
                value={
                  CADENCE_CHOICES.find((c) => c.value === String(answers.intervalDays))?.label ??
                  'Once a month'
                }
                index={4}
              />
              <PlanFact
                label="Your routine"
                // The real stack, not a paraphrase of it: this line is the
                // last thing they see before the app builds it.
                value={
                  seeds()
                    .map((seed) => seed.label)
                    .join(' · ') || 'Add one whenever you like'
                }
                index={5}
              />
            </View>

            <Rise index={6} style={{ marginTop: spacing.xxl, marginBottom: spacing.sm }}>
              <Text variant="title3">We’ll help you</Text>
            </Rise>
            {COPY.plan.promises.map((promise, i) => (
              <PlanLine key={promise} text={promise} index={7 + i} />
            ))}
          </>
        ),
      });

    /* ------------------------------- future --------------------------- */
    case 'future':
      return shell({
        centred: true,
        cta: COPY.future.cta,
        onCta: next,
        children: (
          <>
            <Wash />
            <Rise index={0}>
              <Text variant="title1" center>
                {COPY.future.title}
              </Text>
              <Text variant="title1" color="textTertiary" center>
                {COPY.future.titleMuted}
              </Text>
            </Rise>

            <View style={{ marginVertical: spacing.xxxl }}>
              {['Today', 'Month 1', 'Month 3', 'Month 6'].map((label, i) => (
                <Rise key={label} index={1 + i}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
                    <View style={{ alignItems: 'center', width: 22 }}>
                      <View
                        style={{
                          width: i === 0 ? 14 : 9,
                          height: i === 0 ? 14 : 9,
                          borderRadius: 7,
                          backgroundColor: i === 0 ? colors.accent : colors.accentBorder,
                        }}
                      />
                      {i < 3 ? (
                        <View
                          style={{
                            width: 2,
                            height: 34,
                            backgroundColor: colors.accentBorder,
                          }}
                        />
                      ) : null}
                    </View>
                    <Text
                      variant={i === 0 ? 'headline' : 'callout'}
                      color={i === 0 ? 'text' : 'textSecondary'}
                      style={{ marginBottom: i < 3 ? 34 : 0 }}>
                      {label}
                    </Text>
                  </View>
                </Rise>
              ))}
            </View>

            <Rise index={5}>
              <Text variant="callout" color="textSecondary" center>
                {COPY.future.body}
              </Text>
            </Rise>
          </>
        ),
      });

    /* ------------------------------ baseline -------------------------- */
    case 'baseline':
    default:
      return shell({
        cta: COPY.baseline.cta,
        onCta: () => router.replace('/capture-intro'),
        secondary: COPY.baseline.skip,
        onSecondary: () => router.replace('/'),
        children: (
          <>
            <StepTitle title={COPY.baseline.title} subtitle={COPY.baseline.subtitle} />
            {['Top', 'Left Side', 'Right Side', 'Back', 'Hairline'].map((angle, i) => (
              <Rise key={angle} index={2 + i}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    padding: spacing.lg,
                    marginBottom: spacing.sm,
                    borderRadius: radius.md,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}>
                  <Text variant="caption" color="textTertiary" style={{ width: 22 }}>
                    {String(i + 1).padStart(2, '0')}
                  </Text>
                  <Text variant="headline" style={{ flex: 1 }}>
                    {angle}
                  </Text>
                  <Icon name="camera" size={18} color={colors.textTertiary} />
                </View>
              </Rise>
            ))}
          </>
        ),
      });
  }
}

/* ------------------------------- fragments ------------------------------ */

function Choices<T extends string>({
  choices,
  multi,
  selected,
  onToggle,
  from = 0,
}: {
  choices: Choice<T>[];
  multi: boolean;
  selected: T[];
  onToggle: (value: T) => void;
  /** Where this list sits in the screen's stagger. */
  from?: number;
}) {
  const { spacing } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      {choices.map((choice, i) => (
        <ChoiceRow
          key={choice.value}
          label={choice.label}
          detail={choice.detail}
          icon={choice.icon as IconName | undefined}
          multi={multi}
          selected={selected.includes(choice.value)}
          onPress={() => onToggle(choice.value)}
          index={from + i}
        />
      ))}
    </View>
  );
}

function FactScreen({ fact, illustration }: { fact: Fact; illustration: ReactNode }) {
  const router = useRouter();
  const { colors, spacing } = useTheme();

  return (
    <>
      <Wash />
      <FactBody
        eyebrow={fact.eyebrow}
        headline={fact.headline}
        body={[...fact.body]}
        footnote={fact.footnote}>
        {illustration}
      </FactBody>

      <Rise index={6} style={{ marginTop: spacing.lg }}>
        <PressableScale
          onPress={() => router.push({ pathname: '/learn/[slug]', params: { slug: fact.slug } })}
          haptic="none"
          accessibilityRole="button"
          accessibilityLabel="Read the full guide"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text variant="subhead" color="accent" style={{ flexShrink: 1 }}>
            {fact.source}
          </Text>
          <Icon name="arrowRight" size={12} color={colors.accent} />
        </PressableScale>
      </Rise>
    </>
  );
}

/** Four frames of the same head, a month apart: the change you cannot see. */
function Timeline() {
  const { colors, spacing } = useTheme();

  return (
    <Breathe>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: spacing.xs }}>
            <View
              style={{
                width: '100%',
                aspectRatio: 0.82,
                borderRadius: 14,
                backgroundColor: colors.accentSoft,
                borderWidth: 1,
                borderColor: colors.accentBorder,
                alignItems: 'center',
                justifyContent: 'flex-end',
                overflow: 'hidden',
              }}>
              <View
                style={{
                  width: '62%',
                  height: `${46 + i * 9}%`,
                  borderTopLeftRadius: 40,
                  borderTopRightRadius: 40,
                  backgroundColor: colors.accent,
                  opacity: 0.22 + i * 0.14,
                }}
              />
            </View>
            <Text variant="caption" color="textTertiary">
              {i === 0 ? 'Now' : `+${i * 2}m`}
            </Text>
          </View>
        ))}
      </View>
    </Breathe>
  );
}

/** Concern → Clarity → Consistency → Progress, as a settling arc. */
function Arc() {
  const { colors, spacing } = useTheme();
  const stages = ['Concern', 'Clarity', 'Consistency', 'Progress'];

  return (
    <View style={{ gap: spacing.sm }}>
      {stages.map((stage, i) => (
        <View key={stage} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              height: 10,
              width: `${22 + i * 22}%`,
              borderRadius: 5,
              backgroundColor: colors.accent,
              opacity: 0.25 + i * 0.2,
            }}
          />
          <Text variant="footnote" color={i === stages.length - 1 ? 'accent' : 'textSecondary'}>
            {stage}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Many strands, all different: causes that look alike from outside. */
function Strands() {
  const { colors, spacing } = useTheme();

  return (
    <Breathe>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: spacing.xs,
          height: 96,
        }}>
        {Array.from({ length: 14 }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: `${42 + ((i * 37) % 58)}%`,
              borderRadius: 6,
              backgroundColor: colors.accent,
              opacity: 0.18 + ((i * 13) % 5) * 0.12,
            }}
          />
        ))}
      </View>
    </Breathe>
  );
}

/**
 * A text field that holds its own value.
 *
 * The funnel re-renders the whole step on every answer, and a controlled
 * input whose value round-trips through that drops characters when someone
 * types quickly — the name comes out as its first letter. Keeping the value
 * here and reporting it upward leaves nothing for a slow render to lose.
 */
function Field({
  value,
  onChange,
  placeholder,
  label,
  autoFocus,
  keyboardType,
  onSubmit,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  keyboardType?: 'number-pad';
  /** Return on the keyboard, for a field whose job is to add a row. */
  onSubmit?: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const [text, setText] = useState(value);

  const change = (next: string) => {
    setText(next);
    onChange(next);
  };

  return (
    <View
      style={{
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.lg,
        height: MIN_TOUCH_TARGET + 12,
        justifyContent: 'center',
      }}>
      <TextInput
        value={text}
        onChangeText={change}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize={keyboardType === 'number-pad' ? 'none' : 'words'}
        autoFocus={autoFocus}
        returnKeyType={onSubmit ? 'done' : undefined}
        onSubmitEditing={onSubmit}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        style={{ color: colors.text, fontSize: typography.body.fontSize }}
      />
    </View>
  );
}
