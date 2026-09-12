/**
 * The journey card.
 *
 * One tall card that stands for the person rather than for their data:
 * the answers they gave at onboarding, the date they set as their start,
 * and their own photograph in the middle. It is the first thing on the
 * Profile tab and the only thing that has to look like an object.
 *
 * Everything printed on it is either something the user typed or chose,
 * or something the app counted — photo sets, days, consistency. Nothing
 * here rates anybody's hair, so the ring around the portrait is tied to
 * consistency and the strip underneath names that number in full.
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useId } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

import { Icon } from './ui/icon';
import { LeafShadow } from './ui/leaf-shadow';
import { PressableScale } from './ui/pressable-scale';
import { Text } from './ui/text';
import { formatDate, formatDuration } from '@/lib/date';
import { splitAlpha, useTheme, withZeroAlpha } from '@/theme';
import { TRACKING_AREA_LABELS, type TrackingArea } from '@/types/domain';

/** Diameter of the photograph itself, excluding the ring around it. */
const PORTRAIT = 132;
/** Gap between the photograph's edge and the ring. */
const RING_GAP = 8;
const RING_THICKNESS = 4;
/** Paper mount around the photo, the way a print sits in a card. */
const COLLAR = 5;
/** The "change picture" badge on the mount's edge. */
const BADGE = 32;

/** The card is taller than it is wide, whatever the content inside it. */
const PORTRAIT_RATIO = 1.32;

/** Tracking chips shown before the rest collapse into a "+n". */
const MAX_CHIPS = 3;

/** Stop props with the colour's own alpha folded into stopOpacity. */
function stop(color: string) {
  const split = splitAlpha(color);
  return { stopColor: split.color, stopOpacity: split.opacity };
}

export type JourneyCardProps = {
  name: string;
  /** The user's chosen picture, from their own captured photos. */
  portraitUri?: string;
  startedAt: string;
  /** True when a passcode stands between the phone and this card. */
  locked: boolean;
  trackingAreas: TrackingArea[];
  /** The primary goal, shown as the card's one script line. */
  goalLabel?: string;
  sessionCount: number;
  daysTracked: number;
  /** 0-100. The same figure the Journey tab explains in full. */
  consistency: number;
  onPressPortrait: () => void;
};

export function JourneyCard({
  name,
  portraitUri,
  startedAt,
  locked,
  trackingAreas,
  goalLabel,
  sessionCount,
  daysTracked,
  consistency,
  onPressPortrait,
}: JourneyCardProps) {
  const { colors, spacing, radius, shadow } = useTheme();
  const { width } = useWindowDimensions();

  // Screen padding is spacing.lg either side; the card fills what's left.
  const cardWidth = width - spacing.lg * 2;

  const chips = trackingAreas.slice(0, MAX_CHIPS);
  const overflow = trackingAreas.length - chips.length;

  return (
    <View
      style={[
        {
          minHeight: cardWidth * PORTRAIT_RATIO,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        },
        shadow.lifted,
      ]}>
      {/* Light gathering behind the portrait, fading out before the feet
          of the card so the stats strip sits on clean paper. */}
      <LinearGradient
        pointerEvents="none"
        colors={[colors.accentSoft, withZeroAlpha(colors.accentSoft)]}
        style={[StyleSheet.absoluteFill, { bottom: '38%' }]}
      />

      {/* The same drawn frond the guide covers use, as a watermark. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -spacing.xl,
          right: -spacing.xxxl,
          opacity: 0.07,
          transform: [{ rotate: '26deg' }],
        }}>
        <LeafShadow width={120} height={240} />
      </View>

      <View
        style={{
          flex: 1,
          paddingVertical: spacing.xl,
          paddingHorizontal: spacing.xl,
          justifyContent: 'space-between',
        }}>
        <Header locked={locked} />

        <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <Portrait uri={portraitUri} name={name} progress={consistency / 100} onPress={onPressPortrait} />

          <Text
            variant="title1"
            center
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}>
            {name}
          </Text>

          {goalLabel ? (
            <Text
              variant="script"
              color="accent"
              center
              numberOfLines={2}
              style={{ marginTop: spacing.xs, maxWidth: 260 }}>
              {goalLabel}
            </Text>
          ) : null}

          <Text variant="footnote" color="textTertiary" center style={{ marginTop: spacing.sm }}>
            {formatDuration(startedAt)} · since {formatDate(startedAt)}
          </Text>
        </View>

        <View style={{ gap: spacing.lg }}>
          <StatStrip
            sessionCount={sessionCount}
            daysTracked={daysTracked}
            consistency={consistency}
          />

          {trackingAreas.length > 0 ? (
            <View style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text variant="caption" color="textTertiary">
                Tracking
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: spacing.xs,
                }}>
                {chips.map((area) => (
                  <View
                    key={area}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: 5,
                      borderRadius: radius.pill,
                      backgroundColor: colors.accentSoft,
                      borderWidth: 1,
                      borderColor: colors.accentBorder,
                    }}>
                    <Text variant="caption" color="accent">
                      {TRACKING_AREA_LABELS[area]}
                    </Text>
                  </View>
                ))}
                {overflow > 0 ? (
                  <View
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: 5,
                      borderRadius: radius.pill,
                      backgroundColor: colors.fill,
                    }}>
                    <Text variant="caption" color="textSecondary">
                      +{overflow}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/* -------------------------------- header ------------------------------- */

function Header({ locked }: { locked: boolean }) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
      <Text variant="caption" color="textTertiary" style={{ letterSpacing: 1.6 }}>
        Hair Journey
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          paddingHorizontal: spacing.md,
          paddingVertical: 5,
          borderRadius: radius.pill,
          backgroundColor: colors.fill,
        }}>
        <Icon name="lock" size={11} color={colors.textSecondary} />
        <Text variant="caption" color="textSecondary">
          {locked ? 'Locked' : 'Private'}
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------- portrait ------------------------------ */

/**
 * The photograph, ringed by the consistency arc.
 *
 * Tapping opens the picker, so the picture is always one of the user's
 * own captured photos — the app never reaches into the camera roll.
 */
function Portrait({
  uri,
  name,
  progress,
  onPress,
}: {
  uri?: string;
  name: string;
  progress: number;
  onPress: () => void;
}) {
  const { colors, shadow } = useTheme();

  const uid = useId().replace(/[^A-Za-z0-9]/g, '');
  const arcId = `journeyArc${uid}`;

  /** The photo plus its paper mount. */
  const mount = PORTRAIT + COLLAR * 2;
  const box = mount + (RING_GAP + RING_THICKNESS) * 2;
  const c = box / 2;
  const r = mount / 2 + RING_GAP + RING_THICKNESS / 2;
  const p = Math.max(0, Math.min(1, progress));

  // The badge sits on the mount's edge at four-thirty, where it overlaps
  // the photo rather than floating in the gap between photo and ring.
  const badgeOffset = c + (mount / 2) * Math.SQRT1_2 - BADGE / 2;

  // An explicit path from 12 o'clock, so the gradient runs in screen space.
  const theta = p * Math.PI * 2;
  const arcPath = `M ${c} ${c - r} A ${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${
    c + r * Math.sin(theta)
  } ${c - r * Math.cos(theta)}`;

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={
        uri
          ? 'Your picture. Opens your photos so you can choose a different one.'
          : 'Add your picture, chosen from photos you have captured.'
      }
      style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={box} height={box} style={StyleSheet.absoluteFill} accessible={false}>
        <Defs>
          <SvgLinearGradient
            id={arcId}
            gradientUnits="userSpaceOnUse"
            x1={c}
            y1={c - r}
            x2={c + r}
            y2={c + r * 0.3}>
            <Stop offset="0" {...stop(colors.arcStart)} />
            <Stop offset="1" {...stop(colors.arcEnd)} />
          </SvgLinearGradient>
        </Defs>

        {/* A faint track, so an empty ring still reads as a dial. */}
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={colors.arcStart}
          strokeOpacity={0.2}
          strokeWidth={RING_THICKNESS}
          fill="none"
        />
        {p >= 0.999 ? (
          <Circle cx={c} cy={c} r={r} stroke={`url(#${arcId})`} strokeWidth={RING_THICKNESS} fill="none" />
        ) : p > 0 ? (
          <Path
            d={arcPath}
            stroke={`url(#${arcId})`}
            strokeWidth={RING_THICKNESS}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
      </Svg>

      {/* The mount, so the photo never touches the ring and the monogram
          reads as a disc on paper rather than a tint on the gradient. */}
      <View
        style={[
          {
            width: mount,
            height: mount,
            borderRadius: mount / 2,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          },
          shadow.soft,
        ]}>
        {uri ? (
          <Image
            source={{ uri }}
            style={{
              width: PORTRAIT,
              height: PORTRAIT,
              borderRadius: PORTRAIT / 2,
              backgroundColor: colors.fill,
            }}
            contentFit="cover"
            transition={220}
            accessibilityLabel="Your picture"
          />
        ) : (
          <View
            style={{
              width: PORTRAIT,
              height: PORTRAIT,
              borderRadius: PORTRAIT / 2,
              backgroundColor: colors.accentSoft,
              borderWidth: 1,
              borderColor: colors.accentBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text variant="display" color="accent">
              {name.trim().charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
        )}
      </View>

      {/* The affordance: without it the portrait reads as a printed photo. */}
      <View
        style={[
          {
            position: 'absolute',
            left: badgeOffset,
            top: badgeOffset,
            width: BADGE,
            height: BADGE,
            borderRadius: BADGE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          },
          shadow.soft,
        ]}>
        <Icon name={uri ? 'retake' : 'plus'} size={14} color={colors.text} />
      </View>
    </PressableScale>
  );
}

/* ------------------------------ stat strip ----------------------------- */

function StatStrip({
  sessionCount,
  daysTracked,
  consistency,
}: {
  sessionCount: number;
  daysTracked: number;
  consistency: number;
}) {
  const { colors, spacing, radius } = useTheme();

  const cells = [
    { value: String(sessionCount), label: 'Photo sets' },
    { value: String(daysTracked), label: 'Days' },
    { value: `${consistency}%`, label: 'Consistency' },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        borderRadius: radius.md,
        backgroundColor: colors.backgroundSubtle,
        paddingVertical: spacing.md,
      }}>
      {cells.map((cell, index) => (
        <View
          key={cell.label}
          accessible
          accessibilityLabel={`${cell.label}: ${cell.value}`}
          style={{
            flex: 1,
            alignItems: 'center',
            gap: 2,
            borderLeftWidth: index === 0 ? 0 : 1,
            borderLeftColor: colors.separator,
          }}>
          <Text variant="title3" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {cell.value}
          </Text>
          <Text variant="caption" color="textTertiary" numberOfLines={1}>
            {cell.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
