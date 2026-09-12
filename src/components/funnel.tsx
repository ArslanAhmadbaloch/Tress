/**
 * The onboarding funnel's furniture.
 *
 * One frame, one transition and one set of controls, used by every step, so
 * seventeen screens feel like one continuous conversation rather than a
 * stack of forms. Content is keyed by step id, which is what makes the
 * entering animations re-run on every move without a route change.
 *
 * Motion here is doing a job: each screen settles rather than snapping, and
 * answers arrive in a short stagger so the eye has somewhere to start. With
 * Reduce Motion on, everything cross-fades in place instead.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './ui/button';
import { GlassOrb } from './ui/glass-orb';
import { Icon, type IconName } from './ui/icon';
import { Ground } from './ui/ground';
import { PressableScale } from './ui/pressable-scale';
import { Text } from './ui/text';
import { motion, useTheme, withZeroAlpha } from '@/theme';

/** How far apart the staggered pieces of a screen arrive. */
const STAGGER = 55;
const RISE = 14;

/** A piece of a screen, arriving in order. */
export function Rise({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
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
  footnote,
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
  cta: string;
  onCta: () => void;
  ctaDisabled?: boolean;
  secondary?: string;
  onSecondary?: () => void;
  footnote?: string;
  centred?: boolean;
  backdrop?: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const body = (
      <View style={{ flex: 1, paddingTop: insets.top + spacing.sm }}>
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

        <ScrollView
          key={stepKey}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xl,
            paddingBottom: spacing.xl,
            justifyContent: centred ? 'center' : 'flex-start',
          }}>
          {children}
        </ScrollView>

        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
            paddingTop: spacing.sm,
            gap: spacing.sm,
          }}>
          <Button label={cta} onPress={onCta} disabled={ctaDisabled} />

          {secondary && onSecondary ? (
            <Pressable
              onPress={onSecondary}
              accessibilityRole="button"
              accessibilityLabel={secondary}
              style={{ paddingVertical: spacing.sm, alignItems: 'center' }}>
              <Text variant="subhead" color="textSecondary">
                {secondary}
              </Text>
            </Pressable>
          ) : null}

          {footnote ? (
            // Secondary rather than tertiary: on the first screen this line
            // sits over the plate's stone, where tertiary grey disappears.
            <Text variant="caption" color="textSecondary" center>
              {footnote}
            </Text>
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

  return <Ground variant="plain">{body}</Ground>;
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

export function StepTitle({
  title,
  muted,
  subtitle,
  index = 0,
}: {
  title: string;
  muted?: string;
  subtitle?: string;
  index?: number;
}) {
  const { spacing } = useTheme();

  return (
    <>
      <Rise index={index}>
        <Text variant="title1" accessibilityRole="header">
          {title}
        </Text>
        {muted ? (
          <Text variant="title1" color="textTertiary" accessible={false}>
            {muted}
          </Text>
        ) : null}
      </Rise>

      {subtitle ? (
        <Rise index={index + 1}>
          <Text
            variant="callout"
            color="textSecondary"
            style={{ marginTop: spacing.md, marginBottom: spacing.xl }}>
            {subtitle}
          </Text>
        </Rise>
      ) : (
        <View style={{ height: spacing.xl }} />
      )}
    </>
  );
}

/** A quiet heading for the second question on a screen. */
export function SubHeading({ text, index = 0 }: { text: string; index?: number }) {
  const { spacing } = useTheme();

  return (
    <Rise index={index} style={{ marginTop: spacing.xxl, marginBottom: spacing.lg }}>
      <Text variant="title3" accessibilityRole="header">
        {text}
      </Text>
    </Rise>
  );
}

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
  const { colors, spacing, radius } = useTheme();

  return (
    <Rise index={index}>
      <PressableScale
        onPress={onPress}
        scaleTo={0.985}
        accessibilityRole={multi ? 'checkbox' : 'radio'}
        accessibilityState={{ checked: selected }}
        accessibilityLabel={label}
        accessibilityHint={detail}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: 58,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: selected ? colors.accentSoft : colors.surface,
          borderWidth: 1,
          borderColor: selected ? colors.accentBorder : colors.border,
        }}>
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
          <Text variant="headline" color={selected ? 'accent' : 'text'}>
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
            width: 24,
            height: 24,
            borderRadius: multi ? 7 : 12,
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

/* --------------------------------- facts -------------------------------- */

/**
 * A fact card.
 *
 * Placed where a third question would otherwise go. The point is to hand
 * something over rather than take something: three screens in, the app has
 * asked a lot and given nothing, and this is where that turns around.
 */
export function FactBody({
  eyebrow,
  headline,
  body,
  footnote,
  source,
  children,
}: {
  eyebrow: string;
  headline: string;
  body: string[];
  footnote?: string;
  /** Where the claim comes from, as a line the reader can check. */
  source?: string;
  /** The illustration above the words. */
  children?: ReactNode;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <>
      {children ? <Rise index={0}>{children}</Rise> : null}

      <Rise index={1} style={{ marginTop: spacing.xl }}>
        <Text
          variant="caption"
          color="accent"
          style={{ letterSpacing: 1.6, marginBottom: spacing.sm }}>
          {eyebrow.toUpperCase()}
        </Text>
        <Text variant="title2">{headline}</Text>
      </Rise>

      {body.map((paragraph, i) => (
        <Rise key={paragraph} index={2 + i} style={{ marginTop: spacing.lg }}>
          <Text variant="body" color="textSecondary">
            {paragraph}
          </Text>
        </Rise>
      ))}

      {footnote ? (
        <Rise index={2 + body.length} style={{ marginTop: spacing.xl }}>
          <View
            style={{
              padding: spacing.lg,
              borderRadius: radius.md,
              backgroundColor: colors.accentSoft,
              borderWidth: 1,
              borderColor: colors.accentBorder,
            }}>
            <Text variant="subhead" color="accent">
              {footnote}
            </Text>
          </View>
        </Rise>
      ) : null}

      {source ? (
        <Rise index={3 + body.length} style={{ marginTop: spacing.lg }}>
          <Text variant="caption" color="textTertiary">
            {source}
          </Text>
        </Rise>
      ) : null}
    </>
  );
}

/* ------------------------------ decoration ------------------------------ */

/**
 * A soft wash behind a reflective screen, so it reads as a pause.
 *
 * It fades to its own colour at zero alpha rather than to the background:
 * the screen is sitting on a photographic plate, and fading to an opaque
 * background colour would cut a rectangle out of it.
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

/** A line of the personalised plan, ticked. */
export function PlanLine({ text, index }: { text: string; index: number }) {
  const { colors, spacing } = useTheme();

  return (
    <Rise index={index}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.sm,
        }}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accent,
          }}>
          <Icon name="check" size={12} color={colors.textOnAccent} />
        </View>
        <Text variant="callout" style={{ flex: 1 }}>
          {text}
        </Text>
      </View>
    </Rise>
  );
}

/** A labelled fact from their own answers, on the plan screen. */
export function PlanFact({
  label,
  value,
  index,
}: {
  label: string;
  value: string;
  index: number;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <Rise index={index}>
      <View
        style={{
          padding: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 2,
        }}>
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
        <Text variant="headline">{value}</Text>
      </View>
    </Rise>
  );
}

/** The pulse under a fact card's illustration, so the screen is not static. */
export function Breathe({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    t.set(withTiming(1, { duration: 2600 }));
  }, [reduceMotion, t]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.75 + 0.25 * t.get(),
    transform: [{ scale: 0.97 + 0.03 * t.get() }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
