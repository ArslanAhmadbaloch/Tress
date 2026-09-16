/**
 * The onboarding funnel.
 *
 * One screen holding a step machine, rather than a route per step. Every
 * answer lives here until the card is revealed, which is the moment the
 * journey is actually created — so someone can go back and change anything
 * they said, and nothing is written until they have seen what it makes.
 *
 * The order is the argument. Who this is for; what better hair would mean
 * to them, before anything about hair; somebody's pair in return before
 * the next block of questions; their card; a report built from what they
 * said; and then the scan. The report is the thing the funnel has been
 * promising, and the camera is one tap after it — everything that used to
 * sit between the two was the report repeated.
 *
 * The last step opens the scan itself, so the reading the person is shown
 * next is a reading of photographs they just took. On a build that cannot
 * follow a head it opens the single front photograph instead, unchanged:
 * see `startBaseline`.
 */

import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Alert, TextInput, View, useWindowDimensions } from 'react-native';

import { headTrackingAvailable, sampleCameraActive } from '@/components/capture';
import {
  ChoiceRow,
  FunnelShell,
  Rise,
  Scale,
  StepTitle,
  SubHeading,
  Wash,
} from '@/components/funnel';
import { BrandLockup } from '@/components/brand-lockup';
import { CaseStudyCard } from '@/components/case-study-card';
import { CardFloat, MemberCard } from '@/components/member-card';
import { Icon, type IconName } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { ProductRow } from '@/components/product-row';
import {
  ANALYSING_STEPS,
  ANALYSING_TITLE,
  welcomeTitle,
} from '@/features/content/belonging';
import { hairContent } from '@/features/content/hair-content';
import { Analysing } from '@/components/onboarding/analysing';
import { ProfileReportScreen } from '@/components/onboarding/profile-report-screen';
import { HowItWorks } from '@/components/onboarding/how-it-works';
import { caseStudies, type CaseStudy } from '@/features/onboarding/case-studies';
import { buildProfileReport } from '@/features/onboarding/profile-report';
import {
  HELP_FIGURES,
  HELP_TITLE,
} from '@/features/onboarding/how-it-helps';
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
  goalSummary,
  PREOCCUPATION_STEPS,
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
  /** Several: people rarely want one thing, and the step takes them all. */
  goals: HairGoal[];
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
  goals: [],
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

/** Ticking this clears the rest, and the rest clear it. */
const GOAL_EXCLUSIVE: HairGoal = 'unsure';

/**
 * As above, but "I'm not sure yet" cannot stand beside something they
 * are sure about: an answer that says both is not an answer, and the
 * report would read it back to them as one.
 */
function toggleGoal(list: HairGoal[], value: HairGoal): HairGoal[] {
  if (value === GOAL_EXCLUSIVE) {
    return list.includes(value) ? [] : [value];
  }
  return toggle(list.filter((g) => g !== GOAL_EXCLUSIVE), value);
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
  const { colors, spacing, radius, shadow } = useTheme();
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

  /**
   * The ticked products and anything typed in, as routine seeds.
   *
   * Split, because the routine list now carries minoxidil and finasteride
   * and those are not hair care: they lead the stack, and either of them
   * may already have been named on the medication step. A bottle ticked
   * in both places is still one bottle, so the one here drops.
   */
  const productSeeds = () => {
    const options = productOptions(answers.gender);
    const ticked = options.filter((option) => answers.products[option.id] !== undefined);

    const asSeed = (option: (typeof options)[number]) => ({
      label: option.label,
      icon: option.icon,
      timeOfDay: 'anytime' as const,
      timesPerWeek: answers.products[option.id],
    });

    const alreadyNamed = (option: (typeof options)[number]) =>
      option.covers?.some((m) => answers.medications.includes(m)) ?? false;

    const treatments = ticked.filter((o) => o.treatment && !alreadyNamed(o)).map(asSeed);
    const care = ticked.filter((o) => !o.treatment).map(asSeed);

    const treatmentCovers = ticked
      .filter((o) => o.treatment)
      .flatMap((o) => o.coversApproach ?? []);

    const typed = answers.customProducts.map((product) => ({
      label: product.label,
      icon: inferRoutineIcon(product.label),
      timeOfDay: 'anytime' as const,
      timesPerWeek: product.timesPerWeek,
    }));

    return { treatments, treatmentCovers, products: [...care, ...typed] };
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
      ...productSeeds(),
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
        // Exactly what they ticked. The step will not let them past with
        // nothing, and standing "I'm not sure yet" in for silence would
        // be putting an answer in somebody's mouth.
        goals: answers.goals,
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
        'Tress needs permission to open your photo library. You can turn it on in your device Settings, or skip this for now.',
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

  /* ---------------------------- the last step --------------------------- */

  /*
    Whether this build can follow a head through a turn, which is what
    decides the whole shape of the last step.

    It is a property of the binary and not of the handset —
    `headTrackingAvailable()` is `loadVision() !== null`, resolved once,
    and it is false in Expo Go, on a simulator, and in any build without
    the native module. The sample camera rules a turn out on its own: it
    stands in for a camera the simulator does not have and reports no
    faces at all, so a development build there would otherwise promise a
    scan that nothing is watching. The same pair of tests the chooser at
    `new.tsx` uses, so the two doors cannot disagree about what this
    binary can do.
  */
  /*
    Asked only on the step that uses the answer. `headTrackingAvailable()`
    is `loadVision()`, and on a build with nitro that is a synchronous
    `require('./vision-camera')` — a module whose own header says it
    touches native code the moment it is imported, which is why nothing
    else imports it statically. Computed in the component body without
    this guard it ran on the first render of the first screen a new user
    ever sees, about a dozen steps before the answer is needed, inside a
    render phase, against the funnel's opening animation. The answer is
    cached inside `loadVision`, so asking late costs nothing.
  */
  const hasDetector = step === 'baseline' && headTrackingAvailable() && !sampleCameraActive();

  /*
    A continuous turn is a visual gesture with no honest non-visual
    analogue, so `capture-session.tsx` selects the walk on its own when a
    screen reader is running. This screen has to know that too, or the
    last thing read aloud to somebody before the camera opens would
    describe a mechanism they are not about to get.

    Unknown reads as no screen reader, which is what the capture screen
    also does, so the two cannot disagree about which route was chosen.
  */
  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    let alive = true;
    const answer = (on: boolean) => {
      if (alive) setScreenReader(on);
    };
    AccessibilityInfo.isScreenReaderEnabled().then(answer, () => answer(false));
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', answer);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  /**
   * Which camera the funnel ends at.
   *
   * `sweep` and `walk` are the two halves of the scan and both end in the
   * reading — they are the same two the chooser sends, and the parameter
   * name is read from `new.tsx` rather than invented here.
   *
   * `single` is the fallback, and it is not optional. Without the
   * detector there is no turn to offer, and this is the only path a new
   * user has into the app: it must end in a photograph on every build,
   * so it falls back to the one front shot that has always worked here.
   */
  const ending: 'sweep' | 'walk' | 'single' = !hasDetector
    ? 'single'
    : screenReader
      ? 'walk'
      : 'sweep';

  /** The words for that camera. They are chosen by the same value. */
  const baselineCopy = ending === 'single' ? COPY.baseline : COPY.baseline[ending];

  /*
    Replace, not push: the funnel is walked through once, and it should
    not be sitting behind the camera waiting to be returned to.
  */
  const startBaseline = () => {
    if (ending === 'single') {
      router.replace('/capture-intro?single=1');
      return;
    }
    router.replace({ pathname: '/capture-session', params: { mode: ending } });
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

  // Two goals and a count, which is what the line under the name holds.
  const goalLabel = goalSummary(answers.goals);
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
            <StepTitle title={named(COPY.meaning.title)} />
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
        // One at least: the report and the card are built from this, and
        // there is nothing to say back to somebody who ticked nothing.
        ctaDisabled: answers.goals.length === 0,
        children: (
          <>
            <StepTitle title={named(COPY.goal.title)} />
            {/*
              Several, like the question above it. The square boxes and
              the checkbox role are what say so — a line of copy telling
              people they may pick more than one is a line explaining a
              control that already explains itself.
            */}
            <Choices
              choices={content.goals}
              multi
              selected={answers.goals}
              onToggle={(v) => set({ goals: toggleGoal(answers.goals, v) })}
              from={2}
            />
          </>
        ),
      });

    /* ---------------------------- case studies ------------------------ */
    /*
      The breaks between question blocks. They were explainers; they are
      now somebody's pair, because a person halfway through a form about
      their hair would rather see where this goes than read a page about
      follicle counts. Both cards carry their own disclosure — these are
      illustrations, and the app records change rather than causing it.
    */
    case 'caseOne':
      return shell({
        cta: 'Continue',
        onCta: next,
        children: <CaseStudyScreen study={caseStudies(answers.gender)[0]} />,
      });

    case 'caseTwo':
      return shell({
        cta: 'Continue',
        onCta: next,
        children: <CaseStudyScreen study={caseStudies(answers.gender)[1]} />,
      });

    /* ---------------------------- what it does ------------------------ */
    case 'howItHelps':
      return shell({
        cta: 'Continue',
        onCta: next,
        children: <HowItHelpsScreen />,
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
            <StepTitle title={COPY.approach.title} />
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
        children: (
          <>
            <StepTitle
              title={COPY.medication.title}
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
            <StepTitle title={COPY.products.title} />

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
            <StepTitle title={COPY.cadence.title} />
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
            <Rise index={0} style={{ alignItems: 'center', marginBottom: spacing.xxxl }}>
              <View
                style={{
                  width: 160,
                  height: 160,
                  borderRadius: 80,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: answers.avatarUri ? colors.surface : colors.accentSoft,
                }}>
                {answers.avatarUri ? (
                  <Image
                    source={{ uri: answers.avatarUri }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    accessibilityLabel="Your photo"
                  />
                ) : (
                  <Icon name="profile" size={56} color={colors.accent} />
                )}
              </View>
            </Rise>

            <Rise index={1}>
              <Text variant="question" center accessibilityRole="header">
                {COPY.photo.title}
              </Text>
              <Text
                variant="callout"
                color="textSecondary"
                center
                style={{ marginTop: spacing.lg }}>
                {COPY.photo.body}
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
            <Choices
              choices={GENDER_CHOICES}
              multi={false}
              selected={[answers.gender]}
              onToggle={(gender) => set({ gender })}
              from={2}
            />

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
              {/* The only optional answer in the funnel, and the field
                  says so itself now that there is no line under the
                  heading to say it. */}
              <Field
                value={answers.age}
                onChange={(age) => set({ age: age.replace(/[^0-9]/g, '').slice(0, 3) })}
                placeholder="Age (optional)"
                label="Your age, optional"
                keyboardType="number-pad"
              />
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
            {/* The moment somebody joins. The line and the card, nothing
                explaining either: the card says what it is by being one. */}
            <StepTitle title={welcomeTitle(answers.name)} />

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

    /* ------------------------------ analysing ------------------------------ */
    case 'analysing':
      return shell({
        centred: true,
        /*
          No button. The screen is a few seconds of visible work and then
          it hands over on its own — a Continue here would either sit
          disabled, which is a dead control, or let somebody skip the one
          beat that makes the plan feel assembled rather than echoed.
        */
        cta: undefined,
        onCta: undefined,
        children: (
          <Analysing
            title={ANALYSING_TITLE}
            steps={ANALYSING_STEPS}
            onDone={next}
          />
        ),
      });

    /* ------------------------------- profile ------------------------------- */
    case 'profile':
      return shell({
        cta: COPY.profile.cta,
        onCta: next,
        children: (
          <ProfileReportScreen
            report={buildProfileReport({
              name: answers.name,
              noticed: answers.noticed,
              areas: answers.areas,
              preoccupation: answers.preoccupation,
              approaches: answers.approaches,
              medications: answers.medications,
              consistency: answers.consistency,
              goals: answers.goals,
              intervalDays: answers.intervalDays,
            })}
          />
        ),
      });

    /* ------------------------------ baseline -------------------------- */
    case 'baseline':
    default:
      return shell({
        centred: true,
        cta: baselineCopy.cta,
        /*
          The scan, on any build that can run it: the turn, then the
          reading of what it photographed, then the paywall. `mode` is
          what the capture screen reads to know a scan was asked for
          rather than a set of photographs — its presence is what sends
          the session to the report instead of to the journal.

          Without the detector it is `single=1` instead: the front angle
          only, straight to the same report. That is the path this step
          has always taken and it is the one that has to keep working,
          because a new user on a build with no detector has no other way
          in. See `startBaseline`.
        */
        onCta: startBaseline,
        /*
          No skip. The baseline is not a feature of this app, it is the
          thing every other feature is measured against — a journey that
          starts without one has nothing for month three to be compared
          with, and the person finds that out in month three.

          It is a real trade: somebody who cannot photograph themselves
          right now cannot get in. That is the cost of the app being worth
          opening later, and it is the same call the apps that work in
          this category have all made. What keeps the trade a fair one is
          that the camera on the other side of the button is the shortest
          one the build can offer — a turn where there is a detector to
          follow it, and one photograph where there is not.
        */
        children: (
          <>
            <Wash />
            {/*
              Where it starts, as the hero. The reference photograph for
              the front angle — the same framing example the capture
              screen shows — and the front is the first frame of all
              three endings, so it is what is being asked for whichever
              camera opens. Labelled as an example, because it is one,
              and because a face the app did not name would read as
              somebody's result.
            */}
            <Rise index={0} style={{ alignItems: 'center', marginBottom: spacing.xxxl }}>
              <View
                style={[
                  {
                    width: Math.min(220, width - spacing.xl * 2 - spacing.giant),
                    aspectRatio: 4 / 5,
                    borderRadius: radius.xl,
                    backgroundColor: colors.surface,
                  },
                  shadow.lifted,
                ]}>
                <Image
                  source={hairContent(answers.gender).angles.front.example}
                  style={{ width: '100%', height: '100%', borderRadius: radius.xl }}
                  contentFit="cover"
                  accessibilityLabel="Example of the framing: a face, straight on, hair off the forehead"
                />
              </View>
              <Text
                variant="caption"
                color="textTertiary"
                center
                style={{ marginTop: spacing.md }}>
                Example framing
              </Text>
            </Rise>

            <Rise index={1}>
              <Text variant="question" center accessibilityRole="header">
                {baselineCopy.title}
              </Text>
              <Text
                variant="callout"
                color="textSecondary"
                center
                style={{ marginTop: spacing.lg }}>
                {baselineCopy.body}
              </Text>
            </Rise>
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

  /*
    Twelve between rows, not eight. Borderless cards on a soft shadow
    need a little more air than outlined ones did, or the shadows merge
    and the list reads as one tall panel with lines across it.
  */
  return (
    <View style={{ gap: spacing.md }}>
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

/**
 * One person's pair, between two blocks of questions.
 *
 * The headline is about the habit rather than the hair, because the habit
 * is the only half of this the app has anything to do with.
 */
function CaseStudyScreen({ study }: { study: CaseStudy }) {
  return (
    <>
      <Wash />
      <StepTitle title={study.headline} />

      <Rise index={1}>
        <CaseStudyCard study={study} />
      </Rise>
    </>
  );
}

/**
 * What the app does, in the last break before the camera.
 *
 * Four things it does and three figures about itself. No outcome numbers:
 * there is no cohort to count, and a made-up percentage on this screen
 * would be a claim about somebody's hair — see how-it-helps.ts.
 */
function HowItHelpsScreen() {
  const { colors, spacing, radius } = useTheme();

  return (
    <>
      <Wash />
      <StepTitle title={HELP_TITLE} />

      {/*
        The four beats, performed rather than listed. Reading "drag
        between an old set and a new one" teaches less than watching a
        divider wipe, so the carousel demonstrates each action and the
        copy underneath is unchanged.
      */}
      <Rise index={1} style={{ marginTop: spacing.xl }}>
        <HowItWorks />
      </Rise>

      {/* Three things about the product, each checkable by opening it. */}
      <Rise index={2} style={{ marginTop: spacing.xl }}>
        <View
          style={{
            flexDirection: 'row',
            padding: spacing.lg,
            borderRadius: radius.md,
            backgroundColor: colors.accentSoft,
            borderWidth: 1,
            borderColor: colors.accentBorder,
          }}>
          {HELP_FIGURES.map((figure) => (
            <View key={figure.label} style={{ flex: 1, gap: 2, alignItems: 'center' }}>
              <Text variant="title3" color="accent" center>
                {figure.value}
              </Text>
              <Text variant="caption" color="textSecondary" center>
                {figure.label}
              </Text>
            </View>
          ))}
        </View>
      </Rise>
    </>
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
