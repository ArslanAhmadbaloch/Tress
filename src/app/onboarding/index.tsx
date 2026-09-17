/**
 * The onboarding funnel.
 *
 * One screen holding one state machine over the steps in
 * features/onboarding/questions.ts: a page index and the record. Every
 * answer is saved through the store the moment it is given, so there is
 * no local copy of anything the person has said — the page reads its
 * selection back from the record, and a killed app resumes one step past
 * the furthest answer on it (`resumeIndex`).
 *
 * The rhythm is the reference app's. No progress bar; a round back
 * button on every page after the first; a single-choice page moves on by
 * itself a beat after the chosen row shows as chosen; a multi-choice
 * page waits for Continue, greyed until something is ticked. The pages
 * are composed from the onboarding kit (components/onboarding/kit) and
 * the words come from script.ts and questions.ts, so this file is the
 * wiring and nothing else.
 *
 * The last page is the invitation into the Hair Scan. The funnel is
 * stamped complete there — on either button — so the app on the other
 * side of the camera finds a finished journey. "Not now" finishes the
 * funnel without a baseline and lands on Home, where the first-scan card
 * carries the same invitation. See `startBaseline` and `skipBaseline`.
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { ScanInvite } from '@/components/onboarding';
import {
  CardGrid,
  ContinueBar,
  FunnelPage,
  Interstitial,
  MascotIntro,
  NotificationsPage,
  OptionCard,
  OptionPill,
  OptionRow,
  SpeechBubble,
  Welcome,
} from '@/components/onboarding/kit';
import { Icon, type IconName } from '@/components/ui/icon';
import {
  answerOf,
  answerPatch,
  funnelSteps,
  isCustomGlyph,
  optionsOf,
  profileName,
  resumeIndex,
  SELECT_SETTLE_MS,
  toggleChoice,
  type CustomGlyph,
  type FunnelGlyph,
  type Question,
} from '@/features/onboarding/questions';
import {
  COPY,
  inviteCallouts,
  inviteHeadline,
  routineSeedsFor,
} from '@/features/onboarding/script';
import { failureMessage } from '@/features/subscription/entitlement';
import { useSubscription } from '@/features/subscription/provider';
import {
  currentReminderHour,
  markRemindersOffered,
  remindersAlreadyOffered,
  routineReminderIsEnabled,
  updateReminderIsEnabled,
} from '@/lib/device-preferences';
import { enableRemindersWithPrompt } from '@/lib/notifications';
import { useAppStore } from '@/store/app-store';
import { MIN_TOUCH_TARGET, useTheme, typography } from '@/theme';
import { DEFAULT_UPDATE_INTERVAL_DAYS, journeyGoals, type Gender } from '@/types/domain';

export default function OnboardingFunnel() {
  const router = useRouter();
  const { data, saveAnswer, finishOnboarding } = useAppStore();
  const { restore, restoreState, acknowledge } = useSubscription();

  /*
    Whether to ask about reminders is decided once, on arrival. The flag
    is set the moment the page is answered, and a page that vanished
    from under the cursor at that moment would skip the page after it.
  */
  const [askReminders] = useState(() => !remindersAlreadyOffered());
  const steps = funnelSteps(data.journey, { askReminders });
  const [cursor, setCursor] = useState(() => resumeIndex(steps, data));

  const step = steps[Math.min(cursor, steps.length - 1)];
  const gender: Gender = data.profile?.gender ?? 'male';
  const name = profileName(data.profile);

  const next = useCallback(() => setCursor((c) => c + 1), []);
  const back = useCallback(() => setCursor((c) => Math.max(0, c - 1)), []);

  /* --------------------------- restore purchases -------------------------- */

  /*
    The welcome page's quiet link. There are no accounts, so the only
    thing a returning person can bring back is a subscription, and the
    result is told to them in a sentence rather than shown in a state
    the page has no room for.
  */
  useEffect(() => {
    if (restoreState.kind === 'success') {
      Alert.alert('Restored', restoreState.message, [{ text: 'OK', onPress: acknowledge }]);
    } else if (restoreState.kind === 'failed') {
      const message = failureMessage(restoreState.reason, 'restore');
      Alert.alert(message.title, message.body, [{ text: 'OK', onPress: acknowledge }]);
    }
  }, [restoreState, acknowledge]);

  /* ------------------------------ reminders ------------------------------ */

  /*
    The system prompt, asked once per install. The report's own offer
    reads the same flag (`remindersAlreadyOffered`), so somebody asked
    here is not asked again after their first scan. A refusal is final
    and silent: the switches stay on, nothing is scheduled, and Settings
    is where the system prompt is explained.
  */
  const allowReminders = () => {
    void (async () => {
      await enableRemindersWithPrompt({
        routine: routineReminderIsEnabled(),
        update: updateReminderIsEnabled(),
        hour: currentReminderHour(),
        intervalDays: data.journey?.updateIntervalDays ?? DEFAULT_UPDATE_INTERVAL_DAYS,
      });
      await markRemindersOffered();
    })();
    next();
  };

  const declineReminders = () => {
    void markRemindersOffered();
    next();
  };

  /* ---------------------------- the last step --------------------------- */

  /**
   * Stamps the funnel complete over the answers saved page by page, and
   * seeds the routine from what they said they use. Once: both buttons
   * on the invitation lead through here, and a second stamp would seed
   * the routine twice.
   */
  const complete = () => {
    if (data.onboardingCompletedAt !== null) return;
    finishOnboarding(
      routineSeedsFor({
        approaches: data.journey?.approaches ?? [],
        medications: data.journey?.medications,
        medicationNote: data.journey?.medicationNote,
      }),
    );
  };

  /*
    Replace, not push: the funnel is walked through once, and it should
    not be sitting behind the camera waiting to be returned to. `origin`
    is how the scan knows this is the funnel, so its report ends in
    Continue and the paywall rather than in Done. The first scan is the
    free baseline — the scanner reads the empty record and lets it
    through without the entitlement — so nothing here has to know about
    the paywall at all.
  */
  const startBaseline = () => {
    complete();
    router.replace({ pathname: '/hair-scan', params: { origin: 'onboarding' } });
  };

  /*
    Declining the scan. The journey is complete either way, so Home opens
    on the card that offers the first scan and keeps offering it.
  */
  const skipBaseline = () => {
    complete();
    router.replace('/');
  };

  /* -------------------------------- render ------------------------------ */

  switch (step.kind) {
    case 'welcome':
      return (
        <Welcome
          tagline={COPY.welcome.tagline}
          startLabel={COPY.welcome.cta}
          restoreLabel={COPY.welcome.restore}
          legal={COPY.welcome.legal}
          onStart={next}
          onRestore={() => {
            void restore();
          }}
          onTerms={() => router.push('/terms')}
          onPrivacy={() => router.push('/privacy')}
        />
      );

    case 'intro':
      return <MascotIntro title={COPY.intro.title} cta={COPY.intro.cta} onNext={next} />;

    case 'name':
      return (
        <NamePage
          key="name"
          initial={name}
          onBack={back}
          onSave={(displayName) => {
            saveAnswer({ profile: { displayName } });
            next();
          }}
        />
      );

    case 'interstitial':
      return (
        <Interstitial
          name={name}
          title={COPY.interstitial.title}
          body={COPY.interstitial.body}
          cta={COPY.interstitial.cta}
          onNext={next}
          onBack={back}
        />
      );

    case 'notifications':
      return (
        <NotificationsPage
          title={COPY.notifications.title}
          body={COPY.notifications.body}
          allowLabel={COPY.notifications.allow}
          notNowLabel={COPY.notifications.notNow}
          mock={{
            date: COPY.notifications.preview.date,
            clock: COPY.notifications.preview.clock,
            app: COPY.notifications.preview.app,
            message: COPY.notifications.preview.line,
            time: COPY.notifications.preview.time,
          }}
          onAllow={allowReminders}
          onNotNow={declineReminders}
          onBack={back}
        />
      );

    case 'question':
      return (
        <QuestionPage
          key={step.id}
          question={step.question}
          gender={gender}
          selected={answerOf(step.question, data) ?? []}
          note={data.journey?.medicationNote ?? ''}
          onSelect={(values) => saveAnswer(answerPatch(step.question, values))}
          onNote={(medicationNote) => saveAnswer({ journey: { medicationNote } })}
          onNext={next}
          onBack={back}
        />
      );

    case 'invite':
    default: {
      const journey = data.journey;
      const copy = COPY.baseline.scan;
      /*
        The invitation: their name, the reference photograph with three
        of their own answers pinned to it, and one line about the
        record. The cards are labels of what they chose in the funnel,
        placed where the scan is about to look — never findings, since
        nothing has been photographed yet.
      */
      return (
        <FunnelPage
          back={back}
          bottom={
            <ContinueBar
              label={copy.cta}
              enabled
              onPress={startBaseline}
              secondary={{ label: copy.notNow, onPress: skipBaseline }}
            />
          }>
          <ScanInvite
            gender={data.profile?.gender}
            headline={inviteHeadline(name)}
            body={copy.body}
            callouts={inviteCallouts({
              gender,
              goals: journey ? journeyGoals(journey) : [],
              areas: journey?.trackingAreas ?? [],
              noticed: journey?.noticed ?? null,
              approaches: journey?.approaches ?? [],
            })}
          />
        </FunnelPage>
      );
    }
  }
}

/* --------------------------------- pages -------------------------------- */

/**
 * One question, in whichever of the four shapes it takes.
 *
 * The selection is the record's, handed in; a tap hands the new
 * selection straight back out to be saved. A single-choice page then
 * waits a beat — long enough for the chosen row to show as chosen — and
 * moves on by itself; a second tap in that beat is ignored rather than
 * moving on twice. Keyed by question in the funnel, so the beat's timer
 * and the field's draft belong to one question only.
 */
function QuestionPage({
  question,
  gender,
  selected,
  note,
  onSelect,
  onNote,
  onNext,
  onBack,
}: {
  question: Question;
  gender: Gender;
  selected: string[];
  /** Whatever they typed after ticking "Something else" on the medication question. */
  note: string;
  onSelect: (values: string[]) => void;
  onNote: (note: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { spacing } = useTheme();
  const options = optionsOf(question, gender);

  /*
    The one selection the record cannot hold: nothing ticked on a page
    whose "none of these" row is written as an empty list. Unticking the
    last real choice writes that same empty list, and this keeps the page
    showing nothing chosen — no row lit, Continue greyed — until the next
    tap, as the reference does, rather than lighting the "none" row on
    the person's behalf. Keyed by question, so it never outlives its page.
  */
  const [emptied, setEmptied] = useState(false);
  const shown = emptied ? [] : selected;

  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  const pick = (value: string) => {
    if (question.multi) {
      const toggled = toggleChoice(shown, value, question.exclusive);
      setEmptied(question.emptyAs !== undefined && toggled.length === 0);
      onSelect(toggled);
      return;
    }
    if (settle.current) return;
    onSelect([value]);
    settle.current = setTimeout(onNext, SELECT_SETTLE_MS);
  };

  const isOn = (value: string) => shown.includes(value);
  /*
    Handed over as a function of colour: the kit knows what its disc is
    filled with and draws the icon in the colour that reads on it — ink at
    rest, the accent once chosen, the ground's colour on the dark disc — so
    no row can end up with an ink glyph on an ink plate.
  */
  const glyph = (icon: FunnelGlyph | undefined) =>
    icon ? (color: string) => <Glyph name={icon} color={color} /> : undefined;

  const bubble = (
    <SpeechBubble
      title={question.title}
      accentWord={question.accent}
      subtitle={question.subtitle}
      expression={question.expression}
    />
  );

  let body: ReactNode;
  switch (question.kind) {
    case 'pill':
      body = (
        <View style={{ gap: spacing.md }}>
          {options.map((option) => (
            <OptionPill
              key={option.value}
              label={option.label}
              selected={isOn(option.value)}
              onPress={() => pick(option.value)}
            />
          ))}
        </View>
      );
      break;
    case 'row':
      body = (
        <View style={{ gap: spacing.md }}>
          {options.map((option) => (
            <OptionRow
              key={option.value}
              icon={glyph(option.icon)}
              title={option.label}
              description={option.description}
              selected={isOn(option.value)}
              onPress={() => pick(option.value)}
              tint={option.tint}
              check={question.multi}
            />
          ))}
        </View>
      );
      break;
    case 'checkRows':
      body = (
        <View style={{ gap: spacing.md }}>
          {options.map((option) => (
            <OptionRow
              key={option.value}
              icon={glyph(option.icon)}
              title={option.label}
              selected={isOn(option.value)}
              onPress={() => pick(option.value)}
              check
            />
          ))}
        </View>
      );
      break;
    case 'cards':
      body = (
        <CardGrid>
          {options.map((option) => (
            <OptionCard
              key={option.value}
              icon={glyph(option.icon)}
              label={option.label}
              selected={isOn(option.value)}
              onPress={() => pick(option.value)}
            />
          ))}
        </CardGrid>
      );
      break;
    case 'textCards':
    default:
      body = (
        <CardGrid>
          {options.map((option) => (
            <OptionCard
              key={option.value}
              label={option.label}
              sub={option.description}
              selected={isOn(option.value)}
              onPress={() => pick(option.value)}
            />
          ))}
        </CardGrid>
      );
      break;
  }

  /*
    The one free-text answer in the funnel: whatever "Something else"
    on the medication question stands for. It is the only question
    with a note, so the field is keyed to it rather than to a flag.
  */
  const askNote = question.id === 'medications' && isOn('other');

  /*
    A single-choice page hands over on its own, so it carries no bar. A
    multi page waits for Continue — greyed until a pick — and a "none of
    these" row, where the question has one, is the way past. The one
    question that may be withheld carries its way past beneath the bar:
    "Prefer not to say" writes the answer down as withheld (an empty
    list), so it is not asked again on every return.
  */
  const secondary =
    shown.length === 0 && question.skip
      ? {
          label: question.skip,
          onPress: () => {
            onSelect([]);
            onNext();
          },
        }
      : undefined;

  const bar = question.multi ? (
    <ContinueBar
      label={COPY.question.cta}
      enabled={shown.length > 0}
      onPress={onNext}
      secondary={secondary}
    />
  ) : undefined;

  return (
    <FunnelPage back={onBack} bottom={bar}>
      {bubble}
      <View style={{ height: spacing.lg }} />
      {body}
      {askNote ? (
        <View style={{ marginTop: spacing.md }}>
          <Field
            value={note}
            onChange={onNote}
            placeholder={COPY.medication.otherPlaceholder}
            label={COPY.medication.otherLabel}
            autoFocus
          />
        </View>
      ) : null}
    </FunnelPage>
  );
}

/** What should we call you? */
function NamePage({
  initial,
  onSave,
  onBack,
}: {
  initial: string;
  onSave: (name: string) => void;
  onBack: () => void;
}) {
  const { spacing } = useTheme();
  const [draft, setDraft] = useState(initial);
  const trimmed = draft.trim();

  return (
    <FunnelPage
      back={onBack}
      bottom={
        <ContinueBar
          label={COPY.name.cta}
          enabled={trimmed.length > 0}
          onPress={() => onSave(trimmed)}
        />
      }>
      <SpeechBubble title={COPY.name.title} accentWord={COPY.name.accent} expression="wink" />
      <View style={{ height: spacing.lg }} />
      <Field
        value={draft}
        onChange={setDraft}
        placeholder={COPY.name.placeholder}
        label={COPY.name.placeholder}
        autoFocus
      />
    </FunnelPage>
  );
}

/* ------------------------------- fragments ------------------------------ */

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
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  const [text, setText] = useState(value);

  const change = (next: string) => {
    setText(next);
    onChange(next);
  };

  return (
    <View
      style={[
        {
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.xxl,
          height: MIN_TOUCH_TARGET + 20,
          justifyContent: 'center',
        },
        shadow.soft,
      ]}>
      <TextInput
        value={text}
        onChangeText={change}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="words"
        autoFocus={autoFocus}
        accessibilityLabel={label}
        style={{ color: colors.text, fontSize: typography.body.fontSize }}
      />
    </View>
  );
}

/* -------------------------------- glyphs -------------------------------- */

/**
 * The icon beside an option: the app's icon set where it has the glyph,
 * and a small line drawing where it does not — the feather, the four
 * hair shapes, the two gender signs, and the scalp textures the
 * reference draws.
 */
function Glyph({ name, color, size = 24 }: { name: FunnelGlyph; color: string; size?: number }) {
  if (isCustomGlyph(name)) return <CustomGlyphView name={name} color={color} size={size} />;
  const iconName: IconName = name;
  return <Icon name={iconName} size={size - 2} color={color} />;
}

const STROKE = 1.7;

function CustomGlyphView({ name, color, size }: { name: CustomGlyph; color: string; size: number }) {
  const stroke = { stroke: color, strokeWidth: STROKE, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' as const };

  return (
    // Decorative: the row it sits in carries the label.
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'feather' ? (
        <>
          <Path d="M20 4c-6 0-11 4-13 10l-1 3 3-1c6-2 10-7 11-12z" {...stroke} />
          <Line x1={4} y1={20} x2={13} y2={11} {...stroke} />
        </>
      ) : null}
      {name === 'hairStraight' ? (
        <>
          <Line x1={7} y1={4} x2={7} y2={20} {...stroke} />
          <Line x1={12} y1={4} x2={12} y2={20} {...stroke} />
          <Line x1={17} y1={4} x2={17} y2={20} {...stroke} />
        </>
      ) : null}
      {name === 'hairWavy' ? (
        <>
          <Path d="M7 4c3 2.5-3 5.5 0 8s-3 5.5 0 8" {...stroke} />
          <Path d="M12 4c3 2.5-3 5.5 0 8s-3 5.5 0 8" {...stroke} />
          <Path d="M17 4c3 2.5-3 5.5 0 8s-3 5.5 0 8" {...stroke} />
        </>
      ) : null}
      {name === 'hairCurly' ? (
        <>
          <Path d="M8 4c5 0 5 4 0 4s-5 4 0 4-5 4 0 4-5 4 0 4" {...stroke} />
          <Path d="M16 4c5 0 5 4 0 4s-5 4 0 4-5 4 0 4-5 4 0 4" {...stroke} />
        </>
      ) : null}
      {name === 'hairCoily' ? (
        <>
          <Path d="M7 4l4 2.7-4 2.7 4 2.6-4 2.7 4 2.6-4 2.7" {...stroke} />
          <Path d="M13 4l4 2.7-4 2.7 4 2.6-4 2.7 4 2.6-4 2.7" {...stroke} />
        </>
      ) : null}
      {name === 'genderFemale' ? (
        <>
          <Circle cx={12} cy={9} r={5} {...stroke} />
          <Line x1={12} y1={14} x2={12} y2={21} {...stroke} />
          <Line x1={9} y1={18} x2={15} y2={18} {...stroke} />
        </>
      ) : null}
      {name === 'genderMale' ? (
        <>
          <Circle cx={10} cy={14} r={5} {...stroke} />
          <Line x1={13.5} y1={10.5} x2={19} y2={5} {...stroke} />
          <Path d="M14 5h5v5" {...stroke} />
        </>
      ) : null}
      {name === 'scalpDry' ? (
        <Path d="M6 5l3 4-2 4 4 3-1 4M14 4l-1 5 4 3-2 5M9 3l2 3" {...stroke} />
      ) : null}
      {name === 'scalpNormal' ? (
        <Path d="M5 8h5M12 8h6M7 12h6M15 12h3M5 16h4M11 16h7" {...stroke} />
      ) : null}
      {name === 'scalpCombination' ? (
        <>
          <Path d="M5 5l3 4-2 4 3 3M9 4l2 3" {...stroke} />
          <Path d="M17 11c-2 3-3 4.2-3 5.7a3 3 0 006 0c0-1.5-1-2.7-3-5.7z" {...stroke} />
        </>
      ) : null}
      {name === 'flakes' ? (
        <>
          <Circle cx={7} cy={7} r={1.6} {...stroke} />
          <Circle cx={14} cy={5} r={1.6} {...stroke} />
          <Circle cx={18} cy={11} r={1.6} {...stroke} />
          <Circle cx={9} cy={14} r={1.6} {...stroke} />
          <Circle cx={15} cy={17} r={1.6} {...stroke} />
          <Circle cx={6} cy={19} r={1.6} {...stroke} />
        </>
      ) : null}
      {name === 'strandBreak' ? (
        <Path d="M7 4c2 4 3 7 4 9M13 14l1 2M15 18l1 2M17 4c-2 4-3 7-4 9" {...stroke} />
      ) : null}
      {name === 'frizz' ? (
        <Path d="M4 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0M8 6l1 2M15 6l-1 2M9 18l1-2M16 18l-1-2" {...stroke} />
      ) : null}
    </Svg>
  );
}
