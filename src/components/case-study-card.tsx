/**
 * One person's pair, in one floating card, with the months between them drawn.
 *
 * The dotted line is the point of the card. Two photographs side by side
 * is a comparison; two photographs joined by a line that visibly takes
 * time to travel is a journey, which is what the app is asking somebody
 * to start. It arcs rather than running straight because a straight rule
 * between two faces reads as a divider — the thing that separates them —
 * and the curve reads as the thing that connects them.
 *
 * So the trail is laid one dot at a time and the second photograph only
 * arrives once it gets there. The card is telling a story about months of
 * turning up, and that is worth the second and a half it takes to tell.
 * All of it is off under reduced motion, where the card simply appears.
 *
 * The card is labelled EXAMPLE JOURNEY, in the card, above the faces.
 * That label is the honest part of this screen and is not decoration —
 * see src/features/onboarding/case-studies.ts.
 */

import { Image } from 'expo-image';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { CardFloat } from '@/components/member-card';
import { Text } from '@/components/ui/text';
import { type CaseStudy } from '@/features/onboarding/case-studies';
import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Width of the column the line lives in, between the two tiles. */
const LINK = 52;
/** Headroom for the arc. It rises across the gap rather than crossing flat. */
const LINK_HEIGHT = 44;
/** Caption height under each tile, so the line centres on the photographs. */
const CAPTION = 26;

/** How many dots the trail is laid in, and how far apart they land. */
const DOTS = 7;
const DOT_GAP = 70;
const TRAIL_START = 320;
/** When the second photograph arrives: as the last dot lands. */
const ARRIVAL = TRAIL_START + DOTS * DOT_GAP;

/** A point on the quadratic the trail follows. */
function along(t: number, w: number, y: number) {
  const u = 1 - t;
  return {
    x: u * u * 8 + 2 * u * t * (w / 2) + t * t * (w - 8),
    y: u * u * y + 2 * u * t * 3 + t * t * y,
  };
}

/** One step of the trail, landing in its turn. */
function TrailDot({ cx, cy, delay }: { cx: number; cy: number; delay: number }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      t.set(1);
      return;
    }
    t.set(withDelay(delay, withSpring(1, { damping: 13, stiffness: 180 })));
  }, [reduceMotion, delay, t]);

  const props = useAnimatedProps(() => ({
    r: 1.5 * t.get(),
    opacity: 0.55 * t.get(),
  }));

  return <AnimatedCircle cx={cx} cy={cy} fill={colors.accent} animatedProps={props} />;
}

/**
 * The dotted arc.
 *
 * Drawn in its own small canvas rather than across the card, so it stays
 * put whatever the tiles do at other widths. The hairline underneath is
 * the route; the dots landing along it are the months.
 */
function DottedLink() {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const w = LINK;
  const h = LINK_HEIGHT;
  /** Where both ends sit. The arc rises from here and comes back down. */
  const y = h - 9;

  const arrived = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      arrived.set(1);
      return;
    }
    arrived.set(withDelay(ARRIVAL, withSpring(1, { damping: 11, stiffness: 150 })));
  }, [reduceMotion, arrived]);

  const endProps = useAnimatedProps(() => ({ r: 4.2 * arrived.get(), opacity: arrived.get() }));
  const haloProps = useAnimatedProps(() => ({ r: 8 * arrived.get(), opacity: arrived.get() }));

  return (
    <Svg width={w} height={h} accessibilityRole="image" accessibilityLabel="becomes">
      <Path
        d={`M 8 ${y} Q ${w / 2} 3 ${w - 8} ${y}`}
        stroke={colors.accentBorder}
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
        opacity={0.7}
      />

      {/* Where it starts: open, unfilled, the month nothing had happened. */}
      <Circle
        cx={6}
        cy={y}
        r={4}
        fill="none"
        stroke={colors.accent}
        strokeWidth={1.6}
        opacity={0.5}
      />

      {Array.from({ length: DOTS }, (_, i) => {
        const point = along((i + 1) / (DOTS + 1), w, y);
        return (
          <TrailDot key={i} cx={point.x} cy={point.y} delay={TRAIL_START + i * DOT_GAP} />
        );
      })}

      {/* Where it arrives: solid, with a little air around it. */}
      <AnimatedCircle cx={w - 6} cy={y} fill={colors.accentSoft} animatedProps={haloProps} />
      <AnimatedCircle cx={w - 6} cy={y} fill={colors.accent} animatedProps={endProps} />
    </Svg>
  );
}

/** One photograph with its month underneath. */
function Frame({
  label,
  source,
  /** Held back until the trail reaches it. The first photograph is not. */
  delay,
}: {
  label: string;
  source: number;
  delay?: number;
}) {
  const { colors, radius, spacing } = useTheme();
  const reduceMotion = useReducedMotion();
  const held = delay !== undefined && !reduceMotion;
  const shown = useSharedValue(held ? 0 : 1);

  useEffect(() => {
    if (!held) {
      shown.set(1);
      return;
    }
    shown.set(withDelay(delay ?? 0, withTiming(1, { duration: 520 })));
  }, [held, delay, shown]);

  const animated = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ scale: 0.94 + 0.06 * shown.get() }],
  }));

  return (
    <View style={{ flex: 1, gap: spacing.sm }}>
      <Animated.View
        style={[
          {
            width: '100%',
            aspectRatio: 0.86,
            borderRadius: radius.md,
            overflow: 'hidden',
            backgroundColor: colors.fill,
            borderWidth: 1,
            borderColor: colors.border,
          },
          animated,
        ]}>
        <Image
          source={source}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={220}
          accessibilityLabel={`Example photograph, ${label}`}
        />
      </Animated.View>
      <Text variant="caption" color="textTertiary" center>
        {label}
      </Text>
    </View>
  );
}

export function CaseStudyCard({ study }: { study: CaseStudy }) {
  const { colors, radius, spacing, shadow } = useTheme();

  return (
    <CardFloat>
      <View
        style={[
          {
            padding: spacing.lg,
            borderRadius: radius.card,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            gap: spacing.lg,
          },
          shadow.lifted,
        ]}>
        {/* ------------------------------ header --------------------------- */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          <Text variant="caption" color="accent" style={{ letterSpacing: 1.6 }}>
            EXAMPLE JOURNEY
          </Text>
          <View
            style={{
              paddingHorizontal: spacing.sm,
              paddingVertical: 3,
              borderRadius: radius.pill,
              backgroundColor: colors.accentSoft,
              borderWidth: 1,
              borderColor: colors.accentBorder,
            }}>
            <Text variant="caption" color="accent">
              {study.span}
            </Text>
          </View>
        </View>

        {/* ------------------------------ the pair ------------------------- */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Frame source={study.before} label={study.beforeLabel} />
          <View
            style={{
              width: LINK,
              alignSelf: 'stretch',
              alignItems: 'center',
              justifyContent: 'center',
              // The row is as tall as tile plus caption; taking the caption
              // back off centres the line on the photographs themselves.
              marginBottom: CAPTION,
            }}>
            <DottedLink />
          </View>
          <Frame source={study.after} label={study.afterLabel} delay={ARRIVAL} />
        </View>

        {/* ------------------------------ the story ------------------------ */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="headline">
            {study.name}, {study.age}
          </Text>
          <Text variant="callout" color="textSecondary">
            {study.story}
          </Text>
        </View>

        {/* ------------------------------ what they did -------------------- */}
        <View
          style={{
            flexDirection: 'row',
            paddingTop: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.separator,
          }}>
          {study.stats.map((stat) => (
            <View key={stat.label} style={{ flex: 1, gap: 2 }}>
              <Text variant="title3">{stat.value}</Text>
              <Text variant="caption" color="textTertiary">
                {stat.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </CardFloat>
  );
}
