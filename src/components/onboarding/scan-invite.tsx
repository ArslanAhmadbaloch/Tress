/**
 * The invitation into the Hair Scan: the funnel's last page.
 *
 * A photograph of hair on the cream ground, with three cards pinned to
 * it by thin lines and small ring-dots — one on the hairline, one on a
 * temple, one on the crown. Each card is a title and a pill, and the
 * title is a label the funnel already showed this person: the area they
 * said they notice most, when they first noticed it, what they have
 * tried. The pill names the question. Nothing on the photograph is a
 * finding, because nothing has been photographed yet — the cards are
 * their own answers, placed where the scan is about to look.
 *
 * The photograph is the app's reference for the front angle (the same
 * one the scanner's guides use), chosen by who is holding the phone,
 * and it is labelled as an example for the screen reader. A face the
 * app did not name would read as somebody's result.
 *
 * ── Geometry ──────────────────────────────────────────────────────────
 * Where the pins land and where the cards sit is the plan in
 * `INVITE_HERO_PLANS`, and the numbers come from `inviteGeometry`, both
 * in features/onboarding/script.ts so a test can check them without a
 * native runtime: every ring sits clear of every card, and every line
 * has a length worth drawing, at every width the app runs on. The cards
 * are laid out in three bands — top, middle, bottom — with the two on
 * the temple's side taking the top and bottom, which is what keeps a
 * mid-height ring at the edge of the head out from under a card.
 *
 * ── Lines on two grounds ──────────────────────────────────────────────
 * The lines, rings and sparkles are the surface white, as in the
 * reference, and white over dark hair reads. White over the pale ground
 * behind the head does not, and the crown's line runs across exactly
 * that, so every line and ring is drawn twice: a soft ink stroke first,
 * then the white on top of it. The halo is what keeps a white line
 * visible where the photograph is nearly white itself.
 *
 * ── Motion ────────────────────────────────────────────────────────────
 * The cards land one after another, and each one's line draws out to
 * its ring as it lands, so the screen reads as three things being
 * pointed at rather than a diagram that was already there. A few
 * sparkle points in the hair breathe slowly. Under Reduce Motion every
 * piece simply appears, finished, and nothing breathes.
 */

import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  View,
  useWindowDimensions,
  type LayoutRectangle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import {
  INVITE_CARD_PAD,
  INVITE_HERO_PLANS,
  inviteExitPoint,
  inviteGeometry,
  type InviteAnchor,
  type InviteCallout,
  type InviteHeroPlan,
  type InvitePoint,
} from '@/features/onboarding/script';
import { useTheme } from '@/theme';
import type { Gender } from '@/types/domain';

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/* -------------------------------- the hero ------------------------------- */

type Hero = InviteHeroPlan & {
  source: number;
  /** What the screen reader is told the photograph is. */
  label: string;
};

const MALE_HERO: Hero = {
  ...INVITE_HERO_PLANS.male,
  source: require('@/assets/images/angle-front.jpg'),
  label: 'Example photograph: a face straight on, hair off the forehead',
};

const FEMALE_HERO: Hero = {
  ...INVITE_HERO_PLANS.female,
  source: require('@/assets/images/female-angle-front.jpg'),
  label: 'Example photograph: the top of the head, hair parted down the middle',
};

/**
 * For a record with no gender on it: a whole face, with pins of its own.
 * The front view's pins would ring an eye and a cheek on this one.
 */
const PORTRAIT_HERO: Hero = {
  ...INVITE_HERO_PLANS.portrait,
  source: require('@/assets/images/angle-portrait.jpg'),
  label: 'Example photograph: a face straight on',
};

export function inviteHero(gender: Gender | undefined): Hero {
  if (gender === 'female') return FEMALE_HERO;
  if (gender === 'male') return MALE_HERO;
  return PORTRAIT_HERO;
}

/* ------------------------------- timing -------------------------------- */

/** When the first card lands, after the photograph has settled. */
const LEAD = 420;
/** Gap between cards. Long enough that each is read as its own point. */
const STAGGER = 380;
/** How long a line takes to draw out to its ring. */
const DRAW = 460;

/* ------------------------------- component ------------------------------ */

export function ScanInvite({
  gender,
  headline,
  body,
  callouts,
}: {
  gender: Gender | undefined;
  headline: string;
  body: string;
  callouts: InviteCallout[];
}) {
  const { colors, spacing, radius } = useTheme();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const hero = inviteHero(gender);
  const geometry = inviteGeometry(width - spacing.xl * 2);

  const [frames, setFrames] = useState<Partial<Record<InviteAnchor, LayoutRectangle>>>({});

  const summary = callouts.map((c) => `${c.title}, ${c.pill}`).join('. ');

  return (
    <View>
      <View
        accessible
        accessibilityLabel={
          summary ? `${hero.label}. Pinned to it: ${summary}.` : hero.label
        }
        style={{ width: geometry.width, height: geometry.height }}>
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(220) : FadeIn.duration(520)}
          style={{
            position: 'absolute',
            left: geometry.photo.x,
            top: geometry.photo.y,
            width: geometry.photo.width,
            height: geometry.photo.height,
            borderRadius: radius.xl,
            overflow: 'hidden',
            backgroundColor: colors.backgroundSubtle,
          }}>
          <Image
            source={hero.source}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            accessibilityLabel={hero.label}
          />
        </Animated.View>

        {/* Lines, rings and sparkles, over the photograph and under the cards. */}
        <Svg
          pointerEvents="none"
          width={geometry.width}
          height={geometry.height}
          style={{ position: 'absolute', left: 0, top: 0 }}>
          {hero.sparkles.map((s, i) => {
            const at = geometry.point(s);
            return (
              <Sparkle
                key={`${s.x}-${s.y}`}
                cx={at.x}
                cy={at.y}
                size={s.size}
                delay={i * 230}
                colour={colors.surface}
              />
            );
          })}

          {callouts.map((callout, i) => {
            const frame = frames[callout.anchor];
            if (!frame) return null;
            const to = geometry.point(hero.anchors[callout.anchor]);
            return (
              <Pin
                key={callout.id}
                from={inviteExitPoint(frame, to)}
                to={to}
                delay={LEAD + i * STAGGER}
                colour={colors.surface}
                halo={colors.text}
              />
            );
          })}
        </Svg>

        {callouts.map((callout, i) => {
          const slot = hero.slots[callout.anchor];
          /*
            The bottom band is bottom-aligned by the layout engine rather
            than placed by a measured height, so a title that wraps grows
            the card upward, away from the frame's edge, and the ring
            above it stays clear.
          */
          const vertical: ViewStyle =
            slot.band === 'bottom' ? { bottom: 0 } : { top: geometry.cardTop(slot.band, 0) };
          return (
            <Callout
              key={callout.id}
              callout={callout}
              delay={LEAD + i * STAGGER}
              width={geometry.cardWidth}
              style={{ position: 'absolute', [slot.side]: 0, ...vertical }}
              onLayout={(layout) =>
                setFrames((prev) => ({ ...prev, [callout.anchor]: layout }))
              }
            />
          );
        })}
      </View>

      <Animated.View
        entering={
          reduceMotion
            ? FadeIn.duration(220).delay(120)
            : FadeInDown.delay(LEAD + callouts.length * STAGGER)
                .duration(520)
                .springify()
                .damping(21)
        }
        style={{ marginTop: spacing.xxl }}>
        <Text variant="question" center accessibilityRole="header">
          {headline}
        </Text>
        <Text
          variant="callout"
          color="textSecondary"
          center
          style={{ marginTop: spacing.lg, paddingHorizontal: spacing.sm }}>
          {body}
        </Text>
      </Animated.View>
    </View>
  );
}

/* -------------------------------- a card -------------------------------- */

function Callout({
  callout,
  delay,
  width,
  style,
  onLayout,
}: {
  callout: InviteCallout;
  delay: number;
  width: number;
  style: StyleProp<ViewStyle>;
  onLayout: (layout: LayoutRectangle) => void;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  const reduceMotion = useReducedMotion();

  /*
    The focus pill takes the accent; the other two stay on the neutral
    fill. Three coloured pills read as three verdicts, and only one of
    these is the thing they asked the app to watch.
  */
  const accented = callout.id === 'focus';

  return (
    <Animated.View
      entering={
        reduceMotion
          ? FadeIn.duration(220).delay(Math.min(delay, 240))
          : FadeInDown.delay(delay).duration(480).springify().damping(20)
      }
      onLayout={(e) => onLayout(e.nativeEvent.layout)}
      style={[
        {
          width,
          paddingVertical: spacing.md,
          paddingHorizontal: INVITE_CARD_PAD,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
          gap: spacing.sm,
          alignItems: 'flex-start',
        },
        shadow.soft,
        style,
      ]}>
      <Text variant="headline">{callout.title}</Text>
      <View
        style={{
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          backgroundColor: accented ? colors.accentSoft : colors.fill,
        }}>
        <Text variant="caption" color={accented ? 'accent' : 'textSecondary'}>
          {callout.pill}
        </Text>
      </View>
    </Animated.View>
  );
}

/* --------------------------------- a pin -------------------------------- */

/** The ring-dot's radius on the photograph. */
const RING = 7;

/** How far the ink halo shows past the white stroke, each side. */
const HALO = 1.25;
/** The halo's strength: enough to lift white off a pale ground, not a second line. */
const HALO_OPACITY = 0.28;

/**
 * A thin line from a card's border to a ring on the photograph.
 *
 * The line draws from the card towards the point as the card lands, and
 * the ring opens once the line arrives. It stops at the ring's edge
 * rather than its centre, so the ring stays a ring. Each stroke is laid
 * over a soft `halo` stroke of the same shape, so it reads over the pale
 * ground as well as over the hair.
 */
function Pin({
  from,
  to,
  delay,
  colour,
  halo,
}: {
  from: InvitePoint;
  to: InvitePoint;
  delay: number;
  colour: string;
  halo: string;
}) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(reduceMotion ? 1 : 0);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const full = Math.hypot(dx, dy);
  // Shortened to the ring's edge.
  const length = Math.max(0, full - RING);
  const end = full > 0 ? { x: from.x + (dx / full) * length, y: from.y + (dy / full) * length } : from;

  useEffect(() => {
    if (reduceMotion) {
      t.set(1);
      return;
    }
    t.set(0);
    t.set(withDelay(delay, withTiming(1, { duration: DRAW, easing: Easing.out(Easing.cubic) })));
  }, [delay, reduceMotion, t]);

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - Math.min(1, t.get() * 1.25)),
  }));

  const ringProps = useAnimatedProps(() => {
    // The ring opens over the last quarter of the draw.
    const open = Math.max(0, (t.get() - 0.75) * 4);
    return { r: RING * open, opacity: open };
  });

  const line = { x1: from.x, y1: from.y, x2: end.x, y2: end.y };
  return (
    <>
      <AnimatedLine
        {...line}
        stroke={halo}
        strokeOpacity={HALO_OPACITY}
        strokeWidth={1.5 + HALO * 2}
        strokeLinecap="round"
        strokeDasharray={[length, length]}
        animatedProps={lineProps}
      />
      <AnimatedLine
        {...line}
        stroke={colour}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray={[length, length]}
        animatedProps={lineProps}
      />
      <AnimatedCircle
        cx={to.x}
        cy={to.y}
        r={RING}
        stroke={halo}
        strokeOpacity={HALO_OPACITY}
        strokeWidth={2 + HALO * 2}
        fill="none"
        animatedProps={ringProps}
      />
      <AnimatedCircle
        cx={to.x}
        cy={to.y}
        r={RING}
        stroke={colour}
        strokeWidth={2}
        fill="none"
        animatedProps={ringProps}
      />
    </>
  );
}

/* ------------------------------- a sparkle ------------------------------ */

/**
 * A small four-point star in the hair, breathing slowly.
 *
 * Quiet on purpose: the surface white at a little over half strength,
 * a few points and no more. It suggests where the scan will look
 * without pretending to show what it will find.
 */
function Sparkle({
  cx,
  cy,
  size,
  delay,
  colour,
}: {
  cx: number;
  cy: number;
  size: number;
  delay: number;
  colour: string;
}) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 0.6 : 0.3);

  useEffect(() => {
    if (reduceMotion) {
      opacity.set(0.6);
      return;
    }
    opacity.set(
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(0.85, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.3, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          true,
        ),
      ),
    );
  }, [delay, reduceMotion, opacity]);

  const props = useAnimatedProps(() => ({ opacity: opacity.get() }));

  const s = size;
  const d = [
    `M${cx} ${cy - s}`,
    `Q${cx} ${cy} ${cx + s} ${cy}`,
    `Q${cx} ${cy} ${cx} ${cy + s}`,
    `Q${cx} ${cy} ${cx - s} ${cy}`,
    `Q${cx} ${cy} ${cx} ${cy - s}`,
    'Z',
  ].join(' ');

  return <AnimatedPath d={d} fill={colour} animatedProps={props} />;
}
