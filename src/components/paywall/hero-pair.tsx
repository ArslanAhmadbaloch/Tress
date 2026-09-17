/**
 * The two cards at the top of the paywall.
 *
 * The reference opens with the person's own photograph twice, tilted
 * towards each other and labelled "before" and "after". This keeps the
 * shape — two cards, a slight tilt each way, the right one a little
 * higher and in front — and changes what the right one is. It is an
 * empty frame, dashed, labelled with the date the record says the next
 * scan is due. Not a second copy of the photograph and not a generated
 * after: the app has no idea what anybody's hair will do, and a picture
 * that suggested otherwise would be a promise made with their own face.
 *
 * The left card is their latest scan, exactly as they took it, with the
 * day it was taken on its pill — "Today" only when that is true. With no
 * photograph yet it shows the app's example photograph and says so.
 *
 * Nothing is drawn under the pair. The reference has no caption there,
 * and the two lines that used to sit here — the angle and date, and the
 * lock — pushed the headline and the plans a text block lower for the
 * sake of facts the pills already carry. What a screen reader hears
 * still says all of it (heroAccessibilityLabel), and "On this device"
 * is said once, in the footer, where the price is.
 *
 * Resolution: this is one image on a screen, not a list, so it loads
 * the display-resolution file and shows the pre-scaled thumbnail while
 * that decodes. A 320-pixel thumbnail stretched across a 170-point card
 * on a 3× display would be the first blurry thing on the paywall, and
 * it would be a picture of them.
 *
 * ── Motion ────────────────────────────────────────────────────────────
 * The cards settle in one after the other: each rises a little, scales
 * up from just under size and takes on its tilt as it lands. Under
 * Reduce Motion both simply appear, tilted and finished.
 */

import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  HERO_COPY,
  heroAccessibilityLabel,
  heroPill,
  type PaywallHero,
} from '@/features/subscription/paywall-variants';
import { motion, useTheme } from '@/theme';
import type { Gender } from '@/types/domain';

/* ------------------------------ the example ----------------------------- */

/**
 * The app's own reference photographs — the same front views the
 * scanner's guides use — chosen by who is holding the phone. Shown only
 * when there is no photograph of their own, and labelled as an example.
 */
const EXAMPLE = {
  male: require('@/assets/images/angle-front.jpg'),
  female: require('@/assets/images/female-angle-front.jpg'),
  portrait: require('@/assets/images/angle-portrait.jpg'),
};

function exampleSource(gender: Gender | undefined): number {
  if (gender === 'female') return EXAMPLE.female;
  if (gender === 'male') return EXAMPLE.male;
  return EXAMPLE.portrait;
}

/* ------------------------------- geometry ------------------------------- */

/** Degrees each card leans, away from the centre. */
const TILT = 5;
/** Height as a multiple of width: a little taller than a portrait frame. */
const ASPECT = 1.3;
/** Each card's share of the stage; two of them overlap by the rest. */
const CARD_SHARE = 0.53;
/** How far the left card sits below the right one. */
const DROP = 18;
/** Where the cards start, below where they land. */
const RISE = 26;
/** The dashed edge of the empty frame: a touch over a hairline, so the
    dashes read as a drawn frame rather than a rendering artefact. */
const DASH = 1.5;
/** The disc holding the camera glyph in the empty frame. */
const DISC = 48;

/* ------------------------------ component ------------------------------- */

export function PaywallHeroPair({
  hero,
  gender,
  nextLabel,
}: {
  hero: PaywallHero | null;
  /** Chooses the example photograph when there is no photograph of theirs. */
  gender: Gender | undefined;
  /** "Next scan · 17 Oct" — the empty frame's pill. */
  nextLabel: string;
}) {
  const { colors, spacing, radius, shadow } = useTheme();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const stage = width - spacing.xl * 2;
  const cardWidth = Math.round(stage * CARD_SHARE);
  const cardHeight = Math.round(cardWidth * ASPECT);
  // Room for the tilt: a rotated corner reaches about sin(5°) of the
  // card's width past its box, and the left card sits DROP lower.
  const reach = Math.ceil(cardWidth * 0.09);
  const stageHeight = cardHeight + DROP + reach * 2;

  const left = useSharedValue(reduceMotion ? 1 : 0);
  const right = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      left.set(1);
      right.set(1);
      return;
    }
    left.set(withDelay(80, withSpring(1, motion.spring.gentle)));
    right.set(withDelay(260, withSpring(1, motion.spring.gentle)));
  }, [reduceMotion, left, right]);

  const leftStyle = useAnimatedStyle(() => {
    const t = left.get();
    return {
      opacity: t,
      transform: [
        { translateY: (1 - t) * RISE },
        { rotate: `${-TILT * t}deg` },
        { scale: 0.94 + 0.06 * t },
      ],
    };
  });

  const rightStyle = useAnimatedStyle(() => {
    const t = right.get();
    return {
      opacity: t,
      transform: [
        { translateY: (1 - t) * RISE },
        { rotate: `${TILT * t}deg` },
        { scale: 0.94 + 0.06 * t },
      ],
    };
  });

  const source = hero
    ? { uri: hero.uri }
    : exampleSource(gender);
  const placeholder = hero?.placeholderUri ? { uri: hero.placeholderUri } : undefined;
  const pill = hero ? heroPill(hero) : HERO_COPY.example;

  const cardRadius = radius.xl;
  const pillTop = spacing.md;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={heroAccessibilityLabel(hero, nextLabel)}
      style={{ width: stage, height: stageHeight }}>
      {/* Their photograph, tilted away to the left and a little lower. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            top: reach + DROP,
            width: cardWidth,
            height: cardHeight,
            borderRadius: cardRadius,
            backgroundColor: colors.surface,
          },
          shadow.lifted,
          leftStyle,
        ]}>
        {/* Two views: the outer carries the shadow, the inner clips the
            corners — on iOS one view cannot do both. */}
        <View
          style={{
            flex: 1,
            borderRadius: cardRadius,
            overflow: 'hidden',
            backgroundColor: colors.fill,
          }}>
          <Image
            source={source}
            placeholder={placeholder}
            placeholderContentFit="cover"
            contentFit="cover"
            transition={220}
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: pillTop,
              alignSelf: 'center',
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radius.pill,
              backgroundColor: colors.photoScrim,
            }}>
            <Text variant="caption" color="textOnPhoto">
              {pill}
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* The empty frame, tilted to the right and in front. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            right: 0,
            top: reach,
            width: cardWidth,
            height: cardHeight,
            borderRadius: cardRadius,
            backgroundColor: colors.surface,
          },
          shadow.lifted,
          rightStyle,
        ]}>
        <View
          style={{
            flex: 1,
            borderRadius: cardRadius,
            borderWidth: DASH,
            borderStyle: 'dashed',
            borderColor: colors.fillSelected,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <View
            style={{
              width: DISC,
              height: DISC,
              borderRadius: DISC / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.fill,
            }}>
            <Icon name="camera" size={20} color={colors.textSecondary} />
          </View>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: pillTop,
              alignSelf: 'center',
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radius.pill,
              backgroundColor: colors.fill,
            }}>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {nextLabel}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
