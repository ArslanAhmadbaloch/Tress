/**
 * The "here is what you'll actually do" beat of the funnel.
 *
 * It replaced a list of four icons and four paragraphs. The words were
 * fine; the problem was that reading about a comparison slider is a much
 * worse way to understand one than watching a divider slide. So each beat
 * now performs its own action in miniature — the angle markers land one
 * by one, the divider wipes, the note writes itself, the stack ticks off
 * — and the copy underneath says the same thing it always did.
 *
 * Three constraints it works under:
 *
 *  1. Nothing here depicts a result. The comparison beat wipes between
 *     two neutral panels, not a before and an after, because a hair-loss
 *     app that animates hair filling in has made a promise nobody can
 *     keep. Every beat animates the *action*, never the outcome.
 *  2. `useReducedMotion` gets the finished state of each beat, held
 *     still, and the sequence stops advancing on its own.
 *  3. It is skippable and tappable. Auto-advance is a courtesy, not a
 *     cage: tapping a dot jumps straight to that beat.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { HELP_BEATS } from '@/features/onboarding/how-it-helps';
import { useTheme } from '@/theme';

const STAGE = 168;
const BEAT_MS = 3400;

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);


/*
  Hooks live in components, not in helper closures. An earlier draft built
  these styles inside a `line(i)` function called three times per render,
  which works only by accident of call order and needs a lint suppression
  to say so — this says the same thing without lying to the linter.
*/
type Progress = { get(): number };

function GrowLine({
  t, index, full, colour,
}: { t: Progress; index: number; full: number; colour: string }) {
  const style = useAnimatedStyle(() => ({
    width: full * Math.min(1, Math.max(0, t.get() * 3 - index)),
  }));
  return <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: colour }, style]} />;
}

function Tick({ t, index, colour }: { t: Progress; index: number; colour: string }) {
  const style = useAnimatedStyle(() => {
    const local = Math.min(1, Math.max(0, t.get() * 3 - index));
    return { opacity: local, transform: [{ scale: 0.6 + local * 0.4 }] };
  });
  return (
    <Animated.View
      style={[{ width: 12, height: 12, borderRadius: 6, backgroundColor: colour }, style]}
    />
  );
}

/* ----------------------------- 1. five angles ---------------------------- */

function AngleBeat({ play }: { play: boolean }) {
  const { colors } = useTheme();
  const t = useSharedValue(play ? 0 : 1);

  useEffect(() => {
    t.set(play ? withTiming(1, { duration: 1500, easing: Easing.out(Easing.cubic) }) : 1);
  }, [play, t]);

  // Five markers around a head, landing in turn.
  const spots = [
    { x: 84, y: 26 }, { x: 34, y: 62 }, { x: 134, y: 62 },
    { x: 54, y: 112 }, { x: 114, y: 112 },
  ];

  return (
    <View style={{ width: 168, height: STAGE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={168} height={150} viewBox="0 0 168 150">
        <Circle cx={84} cy={74} r={38} fill={colors.accentSoft} />
        <Path
          d="M84 40c14 0 24 10 24 24v18c0 12-10 22-24 22s-24-10-24-22V64c0-14 10-24 24-24z"
          fill={colors.accentBorder}
        />
        {spots.map((s, i) => (
          <AnimatedMarker key={i} x={s.x} y={s.y} index={i} t={t} colour={colors.accent} />
        ))}
      </Svg>
    </View>
  );
}

function AnimatedMarker({
  x, y, index, t, colour,
}: {
  x: number; y: number; index: number;
  t: { get(): number }; colour: string;
}) {
  const props = useAnimatedProps(() => {
    // Each marker owns a fifth of the run and eases in over it.
    const local = Math.min(1, Math.max(0, t.get() * 5 - index));
    return { opacity: local, r: 5 + (1 - local) * 6 };
  });
  return <AnimatedCircle cx={x} cy={y} fill={colour} animatedProps={props} />;
}

/* ---------------------------- 2. side by side ---------------------------- */

function CompareBeat({ play }: { play: boolean }) {
  const { colors } = useTheme();
  const x = useSharedValue(play ? 0 : 0.5);

  useEffect(() => {
    if (!play) { x.set(0.5); return; }
    x.set(
      withRepeat(
        withSequence(
          withTiming(0.82, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.20, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        ),
        -1, true,
      ),
    );
  }, [play, x]);

  const W = 168, H = 132;
  const clip = useAnimatedProps(() => ({ width: W * x.get() }));
  const handle = useAnimatedStyle(() => ({ left: W * x.get() - 12 }));

  return (
    <View style={{ width: W, height: STAGE, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: W, height: H }}>
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <Rect x={0} y={0} width={W} height={H} rx={14} fill={colors.fill} />
          <AnimatedRect x={0} y={0} height={H} rx={14} fill={colors.accentSoft} animatedProps={clip} />
          <Rect x={22} y={34} width={54} height={8} rx={4} fill={colors.accentBorder} />
          <Rect x={22} y={52} width={36} height={8} rx={4} fill={colors.accentBorder} />
          <Rect x={92} y={34} width={54} height={8} rx={4} fill={colors.separator} />
          <Rect x={92} y={52} width={36} height={8} rx={4} fill={colors.separator} />
        </Svg>
        <Animated.View
          style={[
            {
              position: 'absolute', top: H / 2 - 12, width: 24, height: 24,
              borderRadius: 12, backgroundColor: colors.background,
              borderWidth: 2, borderColor: colors.accent,
            },
            handle,
          ]}
        />
      </View>
    </View>
  );
}

/* ------------------------------- 3. a line ------------------------------- */

function NoteBeat({ play }: { play: boolean }) {
  const { colors } = useTheme();
  const t = useSharedValue(play ? 0 : 1);

  useEffect(() => {
    t.set(play ? withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }) : 1);
  }, [play, t]);

  return (
    <View style={{ width: 168, height: STAGE, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 152, paddingVertical: 20, paddingHorizontal: 16, gap: 12,
          borderRadius: 16, backgroundColor: colors.surface,
          borderWidth: 1, borderColor: colors.separator,
        }}>
        {[120, 96, 64].map((full, i) => (
          <GrowLine key={i} t={t} index={i} full={full} colour={colors.accentBorder} />
        ))}
      </View>
    </View>
  );
}

/* -------------------------------- 4. stack ------------------------------- */

function StackBeat({ play }: { play: boolean }) {
  const { colors } = useTheme();
  const t = useSharedValue(play ? 0 : 1);

  useEffect(() => {
    t.set(play ? withDelay(180, withTiming(1, { duration: 1700 })) : 1);
  }, [play, t]);

  return (
    <View style={{ width: 168, height: STAGE, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 152, gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingVertical: 10, paddingHorizontal: 12,
              borderRadius: 12, backgroundColor: colors.surface,
              borderWidth: 1, borderColor: colors.separator,
            }}>
            <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.accentBorder }} />
            <View
              style={{
                width: 20, height: 20, borderRadius: 10,
                borderWidth: 2, borderColor: colors.accentBorder,
                alignItems: 'center', justifyContent: 'center',
              }}>
              <Tick t={t} index={i} colour={colors.accent} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const STAGES = [AngleBeat, CompareBeat, NoteBeat, StackBeat];

/* ------------------------------- the screen ------------------------------ */

export function HowItWorks() {
  const { colors, spacing } = useTheme();
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState(0);
  const held = useRef(false);

  const go = useCallback((n: number) => {
    held.current = true;          // A tap stops the carousel taking over.
    setBeat(n);
  }, []);

  useEffect(() => {
    if (reduced || held.current) return;
    const timer = setTimeout(() => setBeat((b) => (b + 1) % STAGES.length), BEAT_MS);
    return () => clearTimeout(timer);
  }, [beat, reduced]);

  const Stage = STAGES[beat];
  const copy = HELP_BEATS[beat];

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ height: STAGE, justifyContent: 'center' }}>
        <Animated.View key={beat} entering={FadeIn.duration(320)} exiting={FadeOut.duration(160)}>
          <Stage play={!reduced} />
        </Animated.View>
      </View>

      <Animated.View
        key={`copy-${beat}`}
        entering={FadeIn.duration(320).delay(80)}
        style={{ marginTop: spacing.lg, minHeight: 132 }}>
        <Text variant="title3" center>{copy.title}</Text>
        <Text
          variant="callout"
          color="textSecondary"
          center
          style={{ marginTop: spacing.xs }}>
          {copy.body}
        </Text>
      </Animated.View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
        {STAGES.map((_, i) => (
          <PressableScale
            key={i}
            haptic="none"
            hitSlop={10}
            onPress={() => go(i)}
            accessibilityRole="button"
            accessibilityLabel={`Step ${i + 1} of ${STAGES.length}: ${HELP_BEATS[i].title}`}>
            <View
              style={{
                width: i === beat ? 22 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === beat ? colors.accent : colors.accentBorder,
              }}
            />
          </PressableScale>
        ))}
      </View>
    </View>
  );
}
