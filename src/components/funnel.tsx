/**
 * The onboarding funnel's furniture.
 *
 * One frame, one transition and one set of controls, used by every step, so
 * a dozen and a half screens feel like one continuous conversation rather
 * than a stack of forms. Content is keyed by step id, which is what makes
 * the entering animations re-run on every move without a route change.
 *
 * The standard every piece here is held to is the one the best apps in
 * this category set: a question screen is the question and its answers,
 * centred, with more air than feels necessary, and nothing else. No
 * helper line under the heading, no outline around every option, no
 * texture behind any of it. The eye should land on the question, drop to
 * the answers, and have nowhere else to go.
 *
 * Motion here is doing a job: each screen settles rather than snapping, and
 * answers arrive in a short stagger so the eye has somewhere to start. With
 * Reduce Motion on, everything cross-fades in place instead.
 */

import { LinearGradient } from 'expo-linear-gradient';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import {
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './ui/button';
import { GlassOrb } from './ui/glass-orb';
import { Icon, type IconName } from './ui/icon';
import { FunnelAmbience } from './funnel-ambience';
import { PressableScale } from './ui/pressable-scale';
import { Text } from './ui/text';
import { fontFamily, motion, useTheme, withZeroAlpha } from '@/theme';

/** How far apart the staggered pieces of a screen arrive. */
const STAGGER = 55;
const RISE = 14;

/** A piece of a screen, arriving in order. */
export function Rise({
  index = 0,
  children,
  style,
  onLayout,
}: {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      entering={
        reduceMotion
          ? FadeIn.duration(220).delay(index * 40)
          : FadeInDown.springify()
              .damping(22)
              .mass(0.9)
              .delay(index * STAGGER)
              .withInitialValues({ transform: [{ translateY: RISE }] })
      }
      onLayout={onLayout}
      style={style}>
      {children}
    </Animated.View>
  );
}

/* -------------------------------- shell -------------------------------- */

export function FunnelShell({
  /** Re-keys the content so every move replays the entrance. */
  stepKey,
  progress,
  onBack,
  children,
  cta,
  onCta,
  ctaDisabled,
  secondary,
  onSecondary,
  /** Centres the content, for the reflective screens between questions. */
  centred = false,
  /**
   * Replaces the ground plate and hides the chrome. Used by the first
   * screen, which is the brand lockup and should carry nothing else.
   */
  backdrop,
}: {
  stepKey: string;
  /** 0-1, or null on screens that are not asking anything. */
  progress: number | null;
  onBack?: () => void;
  children: ReactNode;
  /** Omitted on screens that advance themselves. */
  cta?: string;
  onCta?: () => void;
  ctaDisabled?: boolean;
  secondary?: string;
  onSecondary?: () => void;
  centred?: boolean;
  backdrop?: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const scroller = useRef<ScrollView>(null);
  const viewport = useRef(0);

  /**
   * Brings a newly revealed question into view, and only then.
   *
   * `y` is the heading's offset inside the scroll content, so the target
   * is the heading plus a little of what follows it — enough that the
   * first option under the question is visible too, since a heading alone
   * at the bottom edge still looks like nothing happened.
   */
  const reveal = useCallback((y: number, height: number) => {
    const view = viewport.current;
    // Before the first layout there is nothing to compare against, and a
    // blind scroll would be a guess.
    if (view <= 0) return;

    const target = y - view * 0.32;
    if (target <= 0) return; // Already comfortably on screen.

    // A beat, so the reveal animation has started before the page moves
    // and the two read as one gesture rather than a jump.
    const timer = setTimeout(() => {
      scroller.current?.scrollTo({ y: target + height * 0.5, animated: true });
    }, 220);
    return () => clearTimeout(timer);
  }, []);

  const body = (
      <View style={{ flex: 1, paddingTop: insets.top + spacing.sm }}>
        {/* The ground the questions sit in. Behind everything, and only
            where the funnel draws its own chrome — the first screen is
            the brand lockup and carries its own backdrop. */}
        {backdrop ? null : <FunnelAmbience />}

        {backdrop ? null : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.lg,
            paddingHorizontal: spacing.lg,
            height: 36,
          }}>
          {onBack ? (
            <PressableScale
              hitSlop={4}
              onPress={onBack}
              haptic="none"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.fill,
              }}>
              <Icon name="chevronLeft" size={18} color={colors.text} />
            </PressableScale>
          ) : (
            <View style={{ width: 36, height: 36 }} />
          )}

          {progress === null ? <View style={{ flex: 1 }} /> : <ProgressBar value={progress} />}
        </View>
        )}

        {/*
          The margins are wider than the rest of the app's sixteen. A
          question screen has one column of text and one column of cards
          and nothing to fill the width with, and at sixteen the cards ran
          nearly edge to edge and the screen read as dense. Twenty gives
          the column a visible left and right, which is most of what
          "generous" means on a phone.

          The top padding is the gap between the chrome and the heading,
          and it is deliberately more than a section gap: the heading is
          the first thing on the screen and it should sit in air, not be
          shouldered up against the progress bar.
        */}
        <ScrollView
          ref={scroller}
          key={stepKey}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onLayout={(e) => {
            viewport.current = e.nativeEvent.layout.height;
          }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.xxxl,
            paddingBottom: spacing.xl,
            justifyContent: centred ? 'center' : 'flex-start',
          }}>
          <RevealContext.Provider value={reveal}>{children}</RevealContext.Provider>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: spacing.xl,
            paddingBottom: insets.bottom + spacing.lg,
            paddingTop: spacing.sm,
            gap: spacing.xs,
          }}>
          {/*
            A screen that hands over on its own gets no button. A disabled
            Continue would be a dead control, and an enabled one would let
            somebody skip the beat the screen exists for.
          */}
          {cta && onCta ? (
            <Button label={cta} onPress={onCta} disabled={ctaDisabled} />
          ) : null}

          {secondary && onSecondary ? (
            <Pressable
              onPress={onSecondary}
              accessibilityRole="button"
              accessibilityLabel={secondary}
              style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
              <Text variant="subhead" color="textSecondary">
                {secondary}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
  );

  if (backdrop) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {backdrop}
        {body}
      </View>
    );
  }

  /*
    Flat, not a photographic plate.

    Ground paints a stone texture behind every screen, and on a question
    screen it was the loudest thing there — options sitting on a
    photograph of a wall. The apps that run funnels well all put questions
    on flat colour, because the only things competing for attention should
    be the question and the answers. The texture stays everywhere else in
    the app; it is the funnel it was wrong for.
  */
  return <View style={{ flex: 1, backgroundColor: colors.background }}>{body}</View>;
}

function ProgressBar({ value }: { value: number }) {
  const { colors, spacing } = useTheme();
  const reduceMotion = useReducedMotion();
  const width = useSharedValue(value);

  useEffect(() => {
    width.set(reduceMotion ? value : withSpring(value, motion.spring.gentle));
  }, [value, reduceMotion, width]);

  const style = useAnimatedStyle(() => ({ width: `${width.get() * 100}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{
        flex: 1,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.fill,
        overflow: 'hidden',
        marginRight: spacing.xs,
      }}>
      <Animated.View
        style={[{ height: '100%', borderRadius: 2, backgroundColor: colors.accent }, style]}
      />
    </View>
  );
}

/* ------------------------------- headings ------------------------------ */

/**
 * The question. Just the question.
 *
 * It used to take a subtitle and a muted second line, and every screen
 * used at least one of them to explain the question it had just asked.
 * A question that needs explaining is the wrong question, so the props
 * went and the questions were rewritten until they stood on their own.
 */
export function StepTitle({ title, index = 0 }: { title: string; index?: number }) {
  const { spacing } = useTheme();

  return (
    <>
      {/*
        Centred, not left-aligned. A left-aligned question reads as a form
        field label with options beneath it; the same words centred read
        as the screen asking you something. It is the single biggest
        difference between how this funnel looked and how the ones in this
        category look, and it costs nothing.
      */}
      <Rise index={index}>
        <Text variant="question" center accessibilityRole="header">
          {title}
        </Text>
      </Rise>

      {/*
        The gap between a question and its answers is the one piece of
        spacing on the screen that is read rather than merely seen: too
        tight and the first option looks like part of the heading, too
        loose and they stop belonging to each other. Thirty-two is where a
        32pt heading and a row of white cards read as a pair.
      */}
      <View style={{ height: spacing.xxxl }} />
    </>
  );
}

/**
 * A quiet heading for the second question on a screen.
 *
 * Centred like the first, and set two steps smaller: it is the same voice
 * asking a follow-up, not a form starting a new section. Two steps rather
 * than one because the "about you" screen stacks three of these under
 * its heading, and at the next size up the follow-ups outweighed the
 * question. The space above is larger than the space below, so it reads
 * as belonging to the answers underneath rather than to the ones above.
 */
export function SubHeading({ text, index = 0 }: { text: string; index?: number }) {
  const { spacing } = useTheme();
  const reveal = useContext(RevealContext);
  const asked = useRef(false);

  return (
    <Rise
      index={index}
      style={{ marginTop: spacing.huge, marginBottom: spacing.xl }}
      onLayout={(e) => {
        if (asked.current || !reveal) return;
        asked.current = true;
        const { y, height } = e.nativeEvent.layout;
        reveal(y, height);
      }}>
      <Text variant="title3" center accessibilityRole="header">
        {text}
      </Text>
    </Rise>
  );
}


/* ------------------------------ auto-reveal ------------------------------ */

/**
 * Lets a follow-up question ask the funnel to scroll it into view.
 *
 * Several steps hide a second question until the first is answered — the
 * approach step asks how consistent you have been, the timeline step asks
 * what you notice most. Both appear *below the fold*, so before this the
 * screen simply looked stuck: you tapped an answer, nothing visibly
 * happened, and the Continue button stayed disabled for a reason you
 * could not see without scrolling.
 *
 * The rule is deliberately narrow. A heading reveals itself once, on its
 * first layout, and only when it is actually out of sight. Scrolling on
 * every layout pass would yank the page around whenever a row re-measured,
 * which is worse than the problem it solves.
 */
const RevealContext = createContext<((y: number, height: number) => void) | null>(null);

/* -------------------------------- choices ------------------------------- */

export function ChoiceRow({
  label,
  detail,
  icon,
  selected,
  multi,
  onPress,
  index = 0,
}: {
  label: string;
  detail?: string;
  icon?: IconName;
  selected: boolean;
  multi: boolean;
  onPress: () => void;
  index?: number;
}) {
  const { colors, spacing, radius, shadow } = useTheme();

  return (
    <Rise index={index}>
      <PressableScale
        onPress={onPress}
        scaleTo={0.985}
        accessibilityRole={multi ? 'checkbox' : 'radio'}
        accessibilityState={{ checked: selected }}
        accessibilityLabel={label}
        accessibilityHint={detail}
        /*
          Borderless, rounder, and lifted by a shadow instead of a
          hairline. The old row was a bordered rectangle — a form control.
          A 1px grey outline around every option is the single thing that
          made this read as a questionnaire rather than as an app asking
          somebody something, and removing it does more for the feel than
          any amount of new type did.

          Selecting a row tints it, outlines it in the accent and fills
          the mark — and that is all. The label stays ink. An earlier
          version also turned the label green, and with the tint and the
          border and the tick that was four signals for one fact; the
          screen flashed every time somebody tapped. Two would do, three
          is certain, and the label is the thing being read, so it is the
          one that stays still.

          The shadow stays on in both states. A selected row that lost its
          shadow sank into the page — the opposite of what picking
          something should feel like.
        */
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            minHeight: 64,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.xl,
            borderRadius: radius.card,
            backgroundColor: selected ? colors.accentSoft : colors.surface,
            borderWidth: 1.5,
            borderColor: selected ? colors.accent : 'transparent',
          },
          shadow.soft,
        ]}>
        {icon ? (
          <GlassOrb size={30} ring={false} tone={selected ? 'green' : 'neutral'}>
            <Icon
              name={icon}
              size={15}
              color={selected ? colors.accent : colors.textSecondary}
            />
          </GlassOrb>
        ) : null}

        <View style={{ flex: 1 }}>
          {/*
            Medium, not semibold. Seven rows of semibold Manrope is seven
            rows shouting the same volume, and the question above them —
            which is semibold — stopped standing out. One weight step down
            and the heading leads again while the options read as a list
            you scan rather than a list you are being told.
          */}
          <Text variant="headline" style={{ fontFamily: fontFamily.displayMedium }}>
            {label}
          </Text>
          {detail ? (
            <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
              {detail}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: multi ? 7 : 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? colors.accent : 'transparent',
            borderWidth: selected ? 0 : 1.5,
            borderColor: colors.border,
          }}>
          {selected ? <Icon name="check" size={12} color={colors.textOnAccent} /> : null}
        </View>
      </PressableScale>
    </Rise>
  );
}

/* --------------------------------- scale -------------------------------- */

/**
 * How often it crosses their mind.
 *
 * A row of steps rather than a dragged slider: the question is not
 * measuring anything to a decimal, and a tap is easier than a drag for
 * someone answering with one hand.
 */
export function Scale({
  steps,
  value,
  low,
  high,
  onChange,
  index = 0,
}: {
  steps: number;
  value: number | null;
  low: string;
  high: string;
  onChange: (next: number) => void;
  index?: number;
}) {
  const { colors, spacing } = useTheme();

  return (
    <Rise index={index}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {Array.from({ length: steps }, (_, i) => {
          const selected = value === i;
          // Reads as a rising scale even before anything is chosen.
          const height = 34 + i * 9;

          return (
            <PressableScale
              key={i}
              onPress={() => onChange(i)}
              scaleTo={0.94}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${i + 1} of ${steps}, ${
                i === 0 ? low : i === steps - 1 ? high : 'in between'
              }`}
              style={{ flex: 1, justifyContent: 'flex-end' }}>
              <View
                style={{
                  height,
                  borderRadius: 12,
                  // The surface white, not the warm fill: on the plate the
                  // fill reads as brown rather than as an empty step.
                  backgroundColor: selected ? colors.accent : colors.surface,
                  borderWidth: selected ? 0 : 1,
                  borderColor: colors.border,
                }}
              />
            </PressableScale>
          );
        })}
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: spacing.sm,
        }}>
        <Text variant="footnote" color="textSecondary">
          {low}
        </Text>
        <Text variant="footnote" color="textSecondary">
          {high}
        </Text>
      </View>
    </Rise>
  );
}

/* ------------------------------ decoration ------------------------------ */

/**
 * A soft wash behind a reflective screen, so it reads as a pause.
 *
 * It fades to its own colour at zero alpha rather than to the background:
 * fading to `transparent` interpolates through black on some renderers
 * and leaves a grey haze where the wash ends.
 */
export function Wash() {
  const { colors } = useTheme();

  return (
    <LinearGradient
      pointerEvents="none"
      colors={[colors.accentSoft, withZeroAlpha(colors.accentSoft)]}
      style={{ position: 'absolute', top: -200, left: -40, right: -40, height: '85%' }}
    />
  );
}

