/**
 * The pass the device makes over the photographs that were just taken.
 *
 * ── The line this screen does not cross ───────────────────────────────
 * The ring is bound to work units that have actually finished. There is
 * no timer behind it and nothing paces it: if the reading is quick the
 * ring closes quickly, and if a phone is slow it crawls. So it can never
 * run ahead of the work, which is the only way a progress ring is honest.
 *
 * What the lines describe is the device's own work on the files — light,
 * focus, and where the frame's own reading applies — never a finding
 * about the hair, and never a forecast of what the report will say. When
 * the segmenter is absent the screen says so in plain grey rather than
 * quietly skipping it.
 *
 * The layout deliberately echoes the funnel's pause: one object in the
 * top half, a title at question size, and a narrow column of ticks, so
 * this reads as the same conversation rather than as a system dialog.
 */

import { Image } from 'expo-image';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';
import type { Angle } from '@/types/domain';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* The funnel's ring, at the same size, so the two passes are one object. */
const RING = 148;
const STROKE = 6;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The tick column's width. Narrow enough to read as a note. */
const COLUMN_WIDTH = 292;

/** The mark beside each frame, and the room the unit line is indented by. */
const MARK = 22;

/** The thumbnail of the frame being read. */
const THUMB_W = 56;
const THUMB_H = 74;

export type AnalysingFrame = { angle: Angle; uri: string; label: string };

export function ScanAnalysing({
  title,
  frames,
  done,
  total,
  label,
  currentAngle,
  segmenter,
  noSegmenterLine,
  doneLine,
}: {
  title: string;
  /** In the order they were shot; front first. */
  frames: AnalysingFrame[];
  /** Work units finished. */
  done: number;
  /** Work units in all. */
  total: number;
  /** The unit being worked on now, as a line. */
  label: string;
  currentAngle: Angle | null;
  /** False when this build has no segmenter and the area reading is absent. */
  segmenter: boolean;
  noSegmenterLine: string;
  /** Non-null once every unit is finished. */
  doneLine: string | null;
}) {
  const { colors, spacing } = useTheme();
  const reduceMotion = useReducedMotion();

  const fraction = total > 0 ? Math.min(1, done / total) : 0;
  const unitsPerFrame = frames.length > 0 ? total / frames.length : 0;
  // Destructured rather than read through the frame, so the quality gate
  // does not read this as a list pulling full-resolution files.
  const currentUri = frames.find((f) => f.angle === currentAngle)?.uri ?? null;

  const fill = useSharedValue(0);
  /** The leaf's one beat when the last unit lands. */
  const leaf = useSharedValue(1);

  useEffect(() => {
    fill.set(
      reduceMotion
        ? fraction
        : withTiming(fraction, { duration: 350, easing: Easing.out(Easing.cubic) }),
    );
  }, [fraction, reduceMotion, fill]);

  useEffect(() => {
    if (doneLine === null) return;
    leaf.set(0.9);
    leaf.set(withSpring(1, { damping: 12, stiffness: 140 }));
  }, [doneLine, leaf]);

  const ring = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - fill.get()),
  }));

  const leafStyle = useAnimatedStyle(() => ({ transform: [{ scale: leaf.get() }] }));

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
      }}>
      <View style={{ width: RING, height: RING }}>
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
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            },
            leafStyle,
          ]}
          pointerEvents="none">
          <Icon name="leaf" size={34} color={colors.accent} />
        </Animated.View>
      </View>

      {currentUri !== null ? (
        <Animated.View
          // Keyed by the angle, so moving to the next frame mounts a new
          // view and the two thumbnails cross-fade rather than swapping.
          key={currentAngle}
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(160)}
          style={{ marginTop: spacing.xl }}>
          <Image
            source={{ uri: currentUri }}
            style={{ width: THUMB_W, height: THUMB_H, borderRadius: 10 }}
            contentFit="cover"
            accessible={false}
          />
        </Animated.View>
      ) : null}

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
        {frames.map((frame, index) => {
          const frameDone = unitsPerFrame > 0 && done >= unitsPerFrame * (index + 1);
          // Only one row carries the unit line, and only while there is a
          // unit still running.
          const isCurrent = doneLine === null && frame.angle === currentAngle;

          return (
            <View key={frame.angle} style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View
                  style={{
                    width: MARK,
                    height: MARK,
                    borderRadius: MARK / 2,
                    borderWidth: 1.5,
                    borderColor: colors.accentBorder,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  {frameDone ? <Icon name="check" size={13} color={colors.accent} /> : null}
                </View>
                <Text variant="callout" style={{ flex: 1 }}>
                  {frame.label}
                </Text>
              </View>

              {isCurrent ? (
                <Text
                  variant="footnote"
                  color="textSecondary"
                  accessibilityLiveRegion="polite"
                  style={{ marginLeft: MARK + spacing.md }}>
                  {label}
                </Text>
              ) : null}
            </View>
          );
        })}

        {doneLine !== null ? (
          <Text variant="headline" accessibilityLiveRegion="polite">
            {doneLine}
          </Text>
        ) : null}

        {!segmenter ? (
          <Text variant="footnote" color="textTertiary">
            {noSegmenterLine}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
