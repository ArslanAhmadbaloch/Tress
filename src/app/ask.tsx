/**
 * Ask Tress.
 *
 * A sheet where somebody asks about their own record and the app reads
 * it back. Every answer is a template filled from AppData through the
 * selectors Home and Report already use, so a number here is the same
 * number there. Nothing is typed into a model, nothing is saved, nothing
 * leaves the phone: the thread is component state and is gone on close,
 * which is what makes the coach's own privacy answer true.
 *
 * The welcome and three chips are the empty state. Every "no scan yet"
 * or "no routine yet" case is an answer with an action, so the surface
 * keeps one shape whether the record is a day old or a year.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnswerCard, ChipRow, Composer, QuestionBubble } from '@/components/coach';
import { Reveal } from '@/components/report';
import { Icon } from '@/components/ui/icon';
import { ScrollEdgeEffect } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import {
  answerFor,
  matchIntent,
  suggestedQuestions,
  welcomeTitle,
  WELCOME_MUTED,
} from '@/features/coach';
import type { Chip, CoachIntent, CoachMessage } from '@/features/coach';
import { useAppStore } from '@/store/app-store';
import { activeRoutineItems } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { AppData } from '@/types/domain';

const makeId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** One turn: the question as asked, and the answer read from the record. */
type Exchange = [
  Extract<CoachMessage, { role: 'you' }>,
  Extract<CoachMessage, { role: 'tress' }>,
];

function exchange(
  text: string,
  data: AppData,
  itemLabels: { id: string; label: string }[],
): Exchange | null {
  const question = text.trim();
  if (!question) return null;

  const match = matchIntent(question, { itemLabels });
  const answer = answerFor(match, data);
  return [
    { id: makeId(), role: 'you', text: question },
    { id: makeId(), role: 'tress', answer },
  ];
}

const intentOf = (turn: Exchange | null) => turn?.[1].answer.intent;

/** Android hears the card through its live region; iOS needs telling. */
function announce(turn: Exchange | null) {
  if (turn && Platform.OS === 'ios') {
    AccessibilityInfo.announceForAccessibility(turn[1].answer.headline);
  }
}

export default function AskScreen() {
  const { colors, spacing, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const { data } = useAppStore();
  // A chip on the Report tab opens the sheet with its question ready to ask.
  const { q } = useLocalSearchParams<{ q?: string }>();

  // The matcher reads routine labels only to route a question to the item
  // it names; a label never enters an answer through this path.
  const itemLabels = useMemo(
    () => activeRoutineItems(data).map((i) => ({ id: i.id, label: i.label })),
    [data],
  );

  /*
    A question carried in on the route is answered as the sheet mounts,
    in the state initialisers rather than an effect: the answer is a pure
    read of the record, so there is nothing to wait for, and it spares a
    second render with an empty thread.
  */
  const [opening] = useState(() => {
    const first = typeof q === 'string' ? q.trim() : '';
    return first ? exchange(first, data, itemLabels) : null;
  });
  const [messages, setMessages] = useState<CoachMessage[]>(() => opening ?? []);
  const [lastIntent, setLastIntent] = useState<CoachIntent | undefined>(
    () => intentOf(opening),
  );

  const chips = useMemo(() => suggestedQuestions(data, lastIntent), [data, lastIntent]);

  const scrollRef = useRef<ScrollView>(null);

  const title = welcomeTitle(data.profile?.displayName);

  const ask = useCallback(
    (text: string) => {
      const turn = exchange(text, data, itemLabels);
      if (!turn) return;

      setMessages((m) => [...m, ...turn]);
      setLastIntent(intentOf(turn));
      announce(turn);
    },
    [data, itemLabels],
  );

  // The opening answer is announced once its card exists.
  useEffect(() => {
    announce(opening);
  }, [opening]);

  const pick = (chip: Chip) => {
    Keyboard.dismiss();
    ask(chip.label);
  };

  return (
    // A page sheet on iOS already clears the status bar; Android is full screen.
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: Platform.OS === 'ios' ? spacing.md : insets.top,
      }}>
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.sm,
          alignItems: 'flex-end',
        }}>
        <PressableScale
          hitSlop={5}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={[
            {
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
            },
            shadow.soft,
          ]}>
          <Icon name="close" size={15} color={colors.text} />
        </PressableScale>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: !reduceMotion })}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
              paddingBottom: spacing.xl,
              gap: spacing.md,
            }}>
            {/*
              ScreenTitle's two-tone title drawn by hand: the sheet wants
              the name and the muted line and none of the eyebrow or
              subtitle layout. The muted line is folded into the header's
              label so a screen reader hears one heading.
            */}
            <Animated.View
              entering={FadeInDown.duration(480).springify().damping(20)}
              style={{ paddingTop: spacing.md }}>
              <Text
                variant="title1"
                accessibilityRole="header"
                accessibilityLabel={`${title} ${WELCOME_MUTED}`}
                adjustsFontSizeToFit
                minimumFontScale={0.66}
                numberOfLines={1}>
                {title}
              </Text>
              <Text
                variant="title1"
                color="textTertiary"
                accessible={false}
                adjustsFontSizeToFit
                minimumFontScale={0.66}
                numberOfLines={1}>
                {WELCOME_MUTED}
              </Text>
            </Animated.View>

            {messages.map((message, i) =>
              message.role === 'you' ? (
                <QuestionBubble key={message.id} text={message.text} />
              ) : (
                <AnswerCard key={message.id} answer={message.answer} index={i} />
              ),
            )}

            {/*
              One chip row, always after the last answer. Keyed by the
              thread length so it remounts — and reveals again — after
              each answer, and fades out the moment a question is sent.
              The later reveal index gives the answer time to be read
              before the next question is offered.
            */}
            <Animated.View key={messages.length} exiting={FadeOut.duration(140)}>
              <Reveal index={messages.length === 0 ? 0 : 1}>
                <ChipRow chips={chips} onPick={pick} bleed={spacing.lg} />
              </Reveal>
            </Animated.View>
          </ScrollView>

          {/* The thread dissolves into the ground before it meets the composer. */}
          <ScrollEdgeEffect edge="bottom" />
        </View>

        <Composer onSend={ask} />
      </KeyboardAvoidingView>
    </View>
  );
}
