/**
 * The ask for notifications.
 *
 * A phone, drawn: a dark frame with the island at the top, a sage sky
 * for a wallpaper, the date and the time, and one lock-screen card from
 * the app — the mark, the name, a line, a time. The phone is cut off
 * below the card, as in the reference, so the card is the last thing in
 * it. A soft light sits behind the frame on either side.
 *
 * Beneath it the headline, the one-line reassurance, and two pills:
 * the accent to ask the system, a white one to decline for now. Both
 * lead onward; which one was pressed is the caller's business.
 *
 * The frame and its island are ink in both themes: `text` flips to
 * near-white in the dark theme, so the ink is taken from whichever token
 * is dark under the current scheme. A pale phone with a pale island was
 * not the drawing.
 *
 * Every word — the card's included — arrives through props.
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { concentricRadius, fontFamily, splitAlpha, useTheme } from '@/theme';

import { ContinueBar, FunnelPage } from './chrome';
import { useInk } from './ink';

const MARK = require('@/assets/images/app-mark.jpg');

/** The widest the drawn phone gets. */
const PHONE_MAX = 300;
/** How much of the phone shows before it is cut off. */
const PHONE_VISIBLE = 0.86;
/** The frame's bezel. */
const BEZEL = 6;
/** The island. */
const ISLAND = { width: 0.36, height: 26 };
/** The app mark on the lock-screen card. */
const CARD_MARK = 36;

export type NotificationMock = {
  /** The lock screen's date line. */
  date: string;
  /** The lock screen's clock. */
  clock: string;
  /** The app's name on the card. */
  app: string;
  /** The card's line. */
  message: string;
  /** The card's time, top right. */
  time: string;
};

/* -------------------------------- the phone ------------------------------ */

function PhoneMock({ mock }: { mock: NotificationMock }) {
  const { colors, spacing, radius } = useTheme();
  const { ink } = useInk();
  const { width: screenWidth } = useWindowDimensions();

  const width = Math.min(PHONE_MAX, screenWidth - spacing.huge * 2);
  const height = width * 1.1;
  const visible = height * PHONE_VISIBLE;
  const frameRadius = width * 0.16;
  const left = splitAlpha(colors.tabGlow);
  const right = splitAlpha(colors.cardRay);

  return (
    <View style={{ width, height: visible, alignSelf: 'center' }}>
      {/*
        The light behind the phone, spilling out either side. A sibling
        of the clip below rather than a child of it, so the spill is not
        cut off with the phone.
      */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: -width * 0.3,
          right: -width * 0.3,
          top: 0,
          bottom: 0,
        }}>
        <Svg width="100%" height="100%" viewBox="0 0 160 110" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="phoneGlowL" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={left.color} stopOpacity={0.9 * left.opacity} />
              <Stop offset="1" stopColor={left.color} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="phoneGlowR" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={right.color} stopOpacity={0.8 * right.opacity} />
              <Stop offset="1" stopColor={right.color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={22} cy={62} r={34} fill="url(#phoneGlowL)" />
          <Circle cx={140} cy={40} r={36} fill="url(#phoneGlowR)" />
        </Svg>
      </View>

      {/* The clip: the phone is taller than this box and the rest is cut off. */}
      <View style={{ width, height: visible, overflow: 'hidden' }}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${mock.app}: ${mock.message}`}
          style={{
            width,
            height,
            borderTopLeftRadius: frameRadius,
            borderTopRightRadius: frameRadius,
            backgroundColor: ink,
            padding: BEZEL,
            overflow: 'hidden',
          }}>
          <View
            style={{
              flex: 1,
              borderTopLeftRadius: concentricRadius(frameRadius, BEZEL),
              borderTopRightRadius: concentricRadius(frameRadius, BEZEL),
              overflow: 'hidden',
            }}>
            {/* The wallpaper: a sage sky, lit from the top-left. */}
            <LinearGradient
              colors={[colors.accent, colors.cardRay, colors.accentSoft]}
              locations={[0, 0.62, 1]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />

            <View
              style={{
                alignSelf: 'center',
                marginTop: spacing.md,
                width: width * ISLAND.width,
                height: ISLAND.height,
                borderRadius: radius.pill,
                backgroundColor: ink,
              }}
            />

            <View
              style={{
                alignItems: 'center',
                marginTop: spacing.xl,
                gap: spacing.xxs,
              }}>
              <Text variant="subhead" color="textOnPhoto">
                {mock.date}
              </Text>
              <Text
                variant="display"
                color="textOnPhoto"
                style={{
                  fontFamily: fontFamily.displayMedium,
                  fontSize: width * 0.26,
                  lineHeight: width * 0.3,
                }}>
                {mock.clock}
              </Text>
            </View>

            <View
              style={{
                alignSelf: 'center',
                marginTop: spacing.md,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: colors.textOnPhoto,
              }}
            />

            {/* The lock-screen card. */}
            <View
              style={{
                marginTop: spacing.lg,
                marginHorizontal: spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                padding: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.glassTint,
                borderWidth: 1,
                borderColor: colors.glassBorder,
              }}>
              <Image
                source={MARK}
                contentFit="cover"
                style={{
                  width: CARD_MARK,
                  height: CARD_MARK,
                  borderRadius: concentricRadius(radius.md, spacing.sm),
                }}
              />
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    gap: spacing.sm,
                  }}>
                  <Text variant="footnote" style={{ flex: 1, fontFamily: fontFamily.displayBold }} numberOfLines={1}>
                    {mock.app}
                  </Text>
                  <Text variant="caption" color="textTertiary">
                    {mock.time}
                  </Text>
                </View>
                <Text variant="footnote" numberOfLines={2}>
                  {mock.message}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/* --------------------------------- page ---------------------------------- */

export function NotificationsPage({
  title,
  body,
  allowLabel,
  notNowLabel,
  mock,
  onAllow,
  onNotNow,
  onBack,
}: {
  title: string;
  body: string;
  allowLabel: string;
  notNowLabel: string;
  mock: NotificationMock;
  onAllow: () => void;
  onNotNow: () => void;
  onBack?: () => void;
}) {
  const { spacing } = useTheme();
  const reduceMotion = useReducedMotion();

  const arrive = (delay: number) =>
    reduceMotion
      ? FadeIn.duration(220).delay(delay)
      : FadeInDown.springify()
          .damping(22)
          .mass(0.9)
          .delay(delay)
          .withInitialValues({ transform: [{ translateY: 14 }] });

  return (
    <FunnelPage
      back={onBack}
      bottom={
        <ContinueBar
          label={allowLabel}
          enabled
          onPress={onAllow}
          secondary={{ label: notNowLabel, onPress: onNotNow }}
        />
      }>
      <View style={{ alignItems: 'stretch', gap: spacing.lg }}>
        <Animated.View entering={arrive(0)} style={{ marginBottom: spacing.xl }}>
          <PhoneMock mock={mock} />
        </Animated.View>
        <Animated.View entering={arrive(120)} style={{ paddingHorizontal: spacing.md }}>
          <Text variant="title1" center accessibilityRole="header">
            {title}
          </Text>
        </Animated.View>
        <Animated.View entering={arrive(200)} style={{ paddingHorizontal: spacing.md }}>
          <Text variant="body" color="textSecondary" center>
            {body}
          </Text>
        </Animated.View>
      </View>
    </FunnelPage>
  );
}
