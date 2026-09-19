/**
 * The hero figure: one Visual Coverage score, and how much it is worth.
 *
 * An open arc rather than a gauge. There is no needle, no red zone and
 * no track marked out in steps, because a dial with a needle says "you
 * are HERE on a scale somebody drew", and this is not that. It is one
 * number with an arc drawn to it, the way the rest of the report draws a
 * fraction: the arc fills from its start to the score and stops.
 *
 * ── The two arcs ──────────────────────────────────────────────────────
 * The outer arc is the score, 0–100. Inside it, thinner and quieter, is
 * the confidence the scan measured on itself — beside the number, in the
 * same picture, so a strong-looking score with a short confidence arc
 * cannot be read without the second fact. The two never share a channel:
 * confidence does not fade, shorten or recolour the score's arc.
 *
 * ── No reading ────────────────────────────────────────────────────────
 * When the analysis did not run there is no score, and this draws none.
 * The arc stays a bare track and the middle of it carries the sentence
 * the caller handed over instead of a figure. It never renders a zero: a
 * zero is a measurement, and no measurement was made. That is structural
 * rather than careful — the arc and the counting figure are each their
 * own component, taking a number that exists, and a missing reading is
 * not rendered at all rather than rendered as nought.
 *
 * ── What the number is ────────────────────────────────────────────────
 * A reading of the hair and scalp visible in a photograph. It is not a
 * count of anything growing and not a width of anything. This file chooses no
 * words at all — every label arrives as a prop — so it cannot be the
 * place that claim gets made.
 *
 * Pure presentation. The arithmetic below is the whole of it, and
 * scripts/test/coverage-map.test.ts extracts and exercises it.
 */

import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useCountUp } from '@/components/report/use-count-up';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/* ---------- pure geometry: extracted by scripts/test/coverage-map.test.ts ---------- */

/** Where the arc starts, in degrees clockwise from three o'clock. */
export const DIAL_START_DEG = 140;
/** How far it runs. The remaining 100° sit symmetrically at the bottom. */
export const DIAL_SWEEP_DEG = 260;
/** The score the arc is a share of. */
export const DIAL_MAX = 100;

/** A point on a circle, in degrees clockwise from three o'clock (y runs down). */
export function dialPoint(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** The arc itself, as one SVG path. */
export function dialArcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  const from = dialPoint(cx, cy, r, startDeg);
  const to = dialPoint(cx, cy, r, startDeg + sweepDeg);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

/** How long that path is, so a dash can be cut to it. */
export function dialArcLength(r: number, sweepDeg: number): number {
  return (2 * Math.PI * r * sweepDeg) / 360;
}

/**
 * A value as a share of the arc, or null when there is no value.
 *
 * Null in, null out. Nothing here substitutes a zero for a missing
 * reading, and nothing downstream may either.
 */
export function dialFraction(value: number | null | undefined, max: number): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (!Number.isFinite(max) || max <= 0) return null;
  return Math.max(0, Math.min(1, value / max));
}

/* ---------- end pure geometry ---------- */

/** How long the arc takes to reach its value. The figure counts on the same clock. */
const FILL_MS = 1100;
/** The score arc, and the quieter confidence arc inside it. */
const TRACK_WIDTH = 10;
const CONFIDENCE_WIDTH = 3;
/** The gap between the two arcs. */
const ARC_GAP = 7;
/** How faint the confidence arc sits against the score's. */
const CONFIDENCE_OPACITY = 0.5;

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function GradeDial({
  score,
  confidence,
  label,
  confidenceLabel,
  emptyLabel,
  size = 176,
  delay = 0,
  style,
}: {
  /** Visual Coverage, 0–100, or null when the analysis did not run. */
  score: number | null;
  /** 0–1, or null. Drawn as its own arc, never folded into the score's. */
  confidence: number | null;
  /** What the number is of. The caller's words. */
  label: string;
  /** What the confidence is, in the caller's words. Absent when there is nothing to say. */
  confidenceLabel?: string | null;
  /** What to say instead of a number when there is no reading. The caller's words. */
  emptyLabel: string;
  size?: number;
  /** Milliseconds before the arc begins, so it can wait for its section. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing } = useTheme();
  const reduceMotion = useReducedMotion();

  const share = dialFraction(score, DIAL_MAX);
  const confidenceShare = dialFraction(confidence, 1);

  const centre = size / 2;
  const scoreRadius = (size - TRACK_WIDTH) / 2;
  const confidenceRadius = scoreRadius - TRACK_WIDTH / 2 - ARC_GAP;

  const track = dialArcPath(centre, centre, scoreRadius, DIAL_START_DEG, DIAL_SWEEP_DEG);
  const inner = dialArcPath(centre, centre, confidenceRadius, DIAL_START_DEG, DIAL_SWEEP_DEG);
  const scoreLength = dialArcLength(scoreRadius, DIAL_SWEEP_DEG);
  const confidenceLength = dialArcLength(confidenceRadius, DIAL_SWEEP_DEG);

  const fill = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    fill.set(
      reduceMotion
        ? 1
        : withDelay(delay, withTiming(1, { duration: FILL_MS, easing: Easing.out(Easing.cubic) })),
    );
  }, [delay, reduceMotion, fill]);

  const rounded = share === null ? null : Math.round(share * DIAL_MAX);
  /* The caller's sentence about the confidence, said out loud with the figure it qualifies. */
  const saidConfidence = confidenceLabel ? `. ${confidenceLabel}` : '';

  return (
    <View
      accessible
      accessibilityRole={rounded === null ? 'text' : 'progressbar'}
      /*
        The confidence goes out with the figure. This View is
        `accessible`, so an explicit label on it replaces everything
        under it — including the confidence line the caller handed down —
        and grade.ts states the rule that breaks: a score shown without
        its confidence is a claim this app does not make. The words are
        the caller's; nothing is composed here.
      */
      accessibilityLabel={
        rounded === null ? `${label}. ${emptyLabel}` : `${label}, ${rounded}${saidConfidence}`
      }
      accessibilityValue={rounded === null ? undefined : { min: 0, max: DIAL_MAX, now: rounded }}
      style={[{ alignItems: 'center' }, style]}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} accessible={false}>
          <Path
            d={track}
            stroke={colors.fill}
            strokeWidth={TRACK_WIDTH}
            strokeLinecap="round"
            fill="none"
          />
          {share === null ? null : (
            <DialArc
              d={track}
              share={share}
              length={scoreLength}
              width={TRACK_WIDTH}
              colour={colors.accent}
              opacity={1}
              fill={fill}
            />
          )}
          {confidenceShare === null ? null : (
            <DialArc
              d={inner}
              share={confidenceShare}
              length={confidenceLength}
              width={CONFIDENCE_WIDTH}
              colour={colors.accent}
              opacity={CONFIDENCE_OPACITY}
              fill={fill}
            />
          )}
        </Svg>

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.xl,
          }}>
          {rounded === null ? (
            <Text variant="title3" color="textSecondary" center numberOfLines={2}>
              {emptyLabel}
            </Text>
          ) : (
            <DialFigure value={rounded} delay={delay} />
          )}
        </View>
      </View>

      <Text variant="headline" center numberOfLines={2} style={{ marginTop: spacing.md }}>
        {label}
      </Text>
      {confidenceLabel ? (
        <Text variant="footnote" color="textSecondary" center numberOfLines={2} style={{ marginTop: spacing.xs }}>
          {confidenceLabel}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One arc, drawn to one share of itself.
 *
 * Its own component because the share it is drawn to is a number that
 * exists — a hook cannot be skipped, so an arc with no reading behind it
 * is not rendered rather than being rendered at nought. Nothing in here
 * substitutes a zero for a missing figure, because a missing figure
 * never reaches it.
 */
function DialArc({
  d,
  share,
  length,
  width,
  colour,
  opacity,
  fill,
}: {
  d: string;
  /** 0–1. A real share; the caller does not render this at all without one. */
  share: number;
  length: number;
  width: number;
  colour: string;
  opacity: number;
  fill: SharedValue<number>;
}) {
  const animated = useAnimatedProps(() => {
    const drawn = share * fill.get();
    return {
      strokeDashoffset: length * (1 - drawn),
      // A zero-length arc with a round cap still draws a dot at its start.
      opacity: drawn < 0.002 ? 0 : opacity,
    };
  });

  return (
    <AnimatedPath
      d={d}
      stroke={colour}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={length}
      fill="none"
      animatedProps={animated}
    />
  );
}

/**
 * The figure in the middle, counting up to itself on the arc's clock.
 *
 * Rendered only when there is a reading, so the counter is handed a real
 * number and never a stand-in nought.
 */
function DialFigure({ value, delay }: { value: number; delay: number }) {
  const counted = useCountUp(value, { delay, duration: FILL_MS });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text variant="display" numberOfLines={1}>
        {counted}
      </Text>
      <Text variant="subhead" color="textTertiary" numberOfLines={1}>
        {`/${DIAL_MAX}`}
      </Text>
    </View>
  );
}
