/**
 * The pause between the card and the report.
 *
 * A summary that appears the instant somebody taps Continue reads as a
 * form echoing itself back. The same summary after a few seconds of
 * visible work reads as something that was put together for them — and
 * the only difference is that the second one shows what it is doing.
 *
 * ── The line this screen does not cross ───────────────────────────────
 * It says it is reading their answers, because that is what it has. No
 * photograph has been taken at this point in the funnel, so a progress
 * bar labelled "analysing your hair" would be describing work that is
 * not happening on data that does not exist. Every line below names
 * something they actually told us a moment ago.
 *
 * The timing is honest in the other direction too: these steps are not
 * pretending to be slow computation. They are a paced reveal, and paced
 * deliberately — slow enough to read, short enough that nobody taps away.
 *
 * ── Layout ────────────────────────────────────────────────────────────
 * One object, one line, a short list, and air. The ring is the hero and
 * sits alone in the top half; the title is set at the same size as a
 * question so this screen is visibly part of the same conversation; the
 * ticks are a narrow column under it rather than a full-width list, so
 * they read as a note being written rather than as a form being filled.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/*
  Larger and thinner than it was. At 132 with a 7pt stroke the ring read
  as a loading spinner; at 148 with a 6pt stroke it reads as the one
  object on the screen, which is what it is.
*/
const RING = 148;
const STROKE = 6;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** How long the whole reveal takes, and the gap between ticks. */
const TOTAL_MS = 3200;

/** The tick column's width. Narrow enough to read as a note. */
const COLUMN_WIDTH = 292;

export type AnalysingStep = { label: string };

function Tick({
  step,
  index,
  progress,
  count,
}: {
  step: AnalysingStep;
  index: number;
  progress: { get(): number };
  count: number;
}) {
  const { colors, spacing } = useTheme();

  // Each line owns its slice of the run and lands at the end of it.
  const style = useAnimatedStyle(() => {
    const local = Math.min(1, Math.max(0, progress.get() * count - index));
    return {
      opacity: 0.35 + local * 0.65,
      transform: [{ translateY: (1 - local) * 8 }],
    };
  });

  const mark = useAnimatedStyle(() => {
    const done = progress.get() * count - index >= 1 ? 1 : 0;
    return { opacity: withTiming(done, { duration: 220 }) };
  });

  return (
    <Animated.View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        style,
      ]}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 1.5,
          borderColor: colors.accentBorder,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Animated.View style={mark}>
          <Icon name="check" size={13} color={colors.accent} />
        </Animated.View>
      </View>
      <Text variant="callout" style={{ flex: 1 }}>
        {step.label}
      </Text>
    </Animated.View>
  );
}

export function Analysing({
  steps,
  title,
  onDone,
}: {
  steps: AnalysingStep[];
  title: string;
  onDone: () => void;
}) {
  const { colors, spacing } = useTheme();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const pop = useSharedValue(0.9);

  useEffect(() => {
    if (reduced) {
      // Somebody who has asked for less movement still gets the plan;
      // they just get it without watching a ring fill.
      progress.set(1);
      const timer = setTimeout(onDone, 600);
      return () => clearTimeout(timer);
    }

    pop.set(withSpring(1, { damping: 12, stiffness: 140 }));
    progress.set(withTiming(1, { duration: TOTAL_MS, easing: Easing.inOut(Easing.cubic) }));

    // Handing over slightly after the ring closes, so the last tick is
    // seen rather than glimpsed.
    const timer = setTimeout(onDone, TOTAL_MS + 420);
    return () => clearTimeout(timer);
  }, [reduced, onDone, progress, pop]);

  const ring = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.get()),
  }));

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  const percent = useAnimatedStyle(() => ({ opacity: 0.55 + progress.get() * 0.45 }));

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={ringStyle}>
        <Svg width={RING} height={RING}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke={colors.accentBorder}
            strokeWidth={STROKE}
            fill="none"
          />
          <AnimatedCircle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke={colors.accent}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            animatedProps={ring}
            // Start at the top rather than at three o'clock.
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </Svg>
        <Animated.View
          style={[
            { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
              alignItems: 'center', justifyContent: 'center' },
            percent,
          ]}>
          <Icon name="leaf" size={34} color={colors.accent} />
        </Animated.View>
      </Animated.View>

      <Text
        variant="question"
        center
        accessibilityRole="header"
        style={{ marginTop: spacing.xxxl }}>
        {title}
      </Text>

      <View
        style={{
          gap: spacing.lg,
          width: '100%',
          maxWidth: COLUMN_WIDTH,
          marginTop: spacing.xxxl,
        }}>
        {steps.map((s, i) => (
          <Tick key={s.label} step={s} index={i} progress={progress} count={steps.length} />
        ))}
      </View>
    </View>
  );
}
