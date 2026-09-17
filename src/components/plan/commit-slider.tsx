/**
 * The slide that asks for a commitment.
 *
 * A wide white pill; the Tress orb is the knob, sitting at the left end,
 * and "Slide to commit" runs across the middle in a sage-to-warm
 * gradient that fades as the orb crosses it. The finger drags the orb;
 * a quarter, a half and three quarters of the way across there is a
 * light tick, and at the end the system's own success note, the pill
 * fills with the accent and says the person's word for what they just
 * did. Let go early and the orb springs back — a commitment is the
 * whole gesture, not most of it.
 *
 * A screen reader cannot slide, so the pill is a button to it: it reads
 * the label and the hint, and a double-tap commits.
 *
 * The knob is the onboarding kit's Mascot — the same cream orb the funnel
 * shows, smiling, without its glow, since a glow wider than the knob
 * would spill past the pill's edge. While the finger holds it, it blows
 * and its hair streams. The slider needs nothing from it but a drawing
 * of the given size.
 *
 * Under Reduce Motion the drag still follows the finger, since that is
 * the finger's own motion, but the spring back is a plain settle and
 * the spinner after the slide does not turn.
 */

import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

import { Mascot } from '@/components/onboarding/kit';
import { Text } from '@/components/ui/text';
import { hapticsAreEnabled } from '@/lib/device-preferences';
import { fontFamily, motion, useTheme } from '@/theme';

/** The pill and the orb. */
const TRACK_HEIGHT = 88;
const TRACK_PAD = 8;
const KNOB = TRACK_HEIGHT - TRACK_PAD * 2;
/** How far across the orb has to be let go for the slide to count. */
const COMMIT_AT = 0.92;
/** The label's width in the SVG that draws its gradient. */
const LABEL_WIDTH = 220;
const LABEL_SIZE = 22;
const SPIN_MS = 900;

function tick(): void {
  if (!hapticsAreEnabled()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

function success(): void {
  if (!hapticsAreEnabled()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

/** The eight-ray glyph that turns while the pill is filled. */
function Spinner({ color, reduceMotion }: { color: string; reduceMotion: boolean }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    turn.set(withRepeat(withTiming(360, { duration: SPIN_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(turn);
  }, [turn, reduceMotion]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <Animated.View style={style}>
      <Svg width={26} height={26} viewBox="0 0 26 26">
        {rays.map((deg, i) => (
          <Line
            key={deg}
            x1={13}
            y1={2}
            x2={13}
            y2={7}
            stroke={color}
            strokeWidth={2.4}
            strokeLinecap="round"
            opacity={0.35 + (i / rays.length) * 0.65}
            transform={`rotate(${deg} 13 13)`}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

export function CommitSlider({
  label,
  doneLabel,
  accessibilityHint,
  committed,
  onCommit,
  reduceMotion,
}: {
  label: string;
  /** What the filled pill says once the slide is complete. */
  doneLabel: string;
  accessibilityHint: string;
  committed: boolean;
  onCommit: () => void;
  reduceMotion: boolean;
}) {
  const { colors, radius, shadow, spacing } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const max = Math.max(1, trackWidth - TRACK_PAD * 2 - KNOB);

  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const lastTick = useSharedValue(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width), []);

  const finish = useCallback(() => {
    success();
    onCommit();
  }, [onCommit]);

  // While the finger holds the orb it blows, and its hair streams; let go
  // and it smiles again. One re-render at each end of the gesture.
  const [dragging, setDragging] = useState(false);

  // Built once per layout, not per render: the first touch re-renders
  // the slider (the orb starts to blow), and a gesture rebuilt in that
  // render would be handed to the detector mid-drag. Nothing in it reads
  // `dragging`; the shared values are stable for the life of the mount.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!committed && trackWidth > 0)
        .onBegin(() => {
          runOnJS(setDragging)(true);
        })
        .onStart(() => {
          start.set(x.get());
        })
        .onFinalize(() => {
          runOnJS(setDragging)(false);
        })
        .onUpdate((e) => {
          const raw = start.get() + e.translationX;
          const next = raw < 0 ? 0 : raw > max ? max : raw;
          x.set(next);
          const quarter = Math.floor((next / max) * 4);
          if (quarter > lastTick.get() && quarter < 4) {
            lastTick.set(quarter);
            runOnJS(tick)();
          }
        })
        .onEnd(() => {
          if (x.get() >= max * COMMIT_AT) {
            x.set(withTiming(max, { duration: 120 }));
            runOnJS(finish)();
          } else {
            lastTick.set(0);
            x.set(reduceMotion ? withTiming(0, { duration: 180 }) : withSpring(0, motion.spring.gentle));
          }
        }),
    [committed, trackWidth, max, reduceMotion, finish, x, start, lastTick],
  );

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const labelStyle = useAnimatedStyle(() => {
    const share = x.get() / max;
    const o = 1 - share * 1.6;
    return { opacity: o < 0 ? 0 : o };
  });

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="button"
      accessibilityLabel={committed ? doneLabel : label}
      accessibilityHint={committed ? undefined : accessibilityHint}
      accessibilityState={{ disabled: committed }}
      onAccessibilityTap={committed ? undefined : finish}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={committed ? undefined : finish}
      style={[
        {
          height: TRACK_HEIGHT,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          justifyContent: 'center',
        },
        shadow.soft,
      ]}>
      {committed ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: radius.pill,
            backgroundColor: colors.accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.xxl,
          }}>
          <Text variant="title3" color="textOnAccent">
            {doneLabel}
          </Text>
          <Spinner color={colors.textOnAccent} reduceMotion={reduceMotion} />
        </Animated.View>
      ) : (
        <>
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }, labelStyle]}>
            <Svg width={LABEL_WIDTH} height={LABEL_SIZE * 1.5}>
              <Defs>
                <LinearGradient id="commitLabel" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={colors.accent} />
                  <Stop offset="1" stopColor={colors.warning} />
                </LinearGradient>
              </Defs>
              <SvgText
                x={LABEL_WIDTH / 2}
                y={LABEL_SIZE * 1.05}
                textAnchor="middle"
                fontSize={LABEL_SIZE}
                fontFamily={fontFamily.display}
                letterSpacing={-0.4}
                fill="url(#commitLabel)">
                {label}
              </SvgText>
            </Svg>
          </Animated.View>
          <GestureDetector gesture={pan}>
            <Animated.View style={[{ position: 'absolute', left: TRACK_PAD, top: TRACK_PAD }, knobStyle]}>
              <Mascot size={KNOB} expression={dragging ? 'blow' : 'smile'} glow={false} />
            </Animated.View>
          </GestureDetector>
        </>
      )}
    </View>
  );
}
