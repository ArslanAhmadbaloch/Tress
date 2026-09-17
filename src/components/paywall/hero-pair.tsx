/**
 * The two cards at the top of the paywall.
 *
 * The reference opens with the person's own photograph twice, tilted
 * towards each other and labelled "before" and "after". This keeps the
 * shape — two cards, a slight tilt each way, the right one a little
 * higher and in front — and changes what the right one is. It is a
 * dashed frame carrying the date the record says the next scan is due.
 * Not a second copy of the photograph and not a generated after: the app
 * has no idea what anybody's hair will do, and a picture that suggested
 * otherwise would be a promise made with their own face.
 *
 * Behind the dashes sits the app's own gender-matched example — the
 * bundled CROWN view, the back of a head, which is the one of the five
 * that is a full head of hair and nothing else — blurred hard and laid
 * under a cream scrim, so what shows through is a head of hair as a
 * shape and no more. It is there because a hole in the layout reads as
 * something missing, while a photograph waiting to be taken reads as the
 * thing the subscription is for. Three rules hold it honest: it is never
 * the person's own photograph (their picture is the card on the left,
 * once), it is never labelled "after" or given a date, and what a screen
 * reader hears calls it an example (HERO_COPY.waiting).
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
import { hairContent } from '@/features/content/hair-content';
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
 * scanner's guides use — chosen by who is holding the phone. Shown on
 * the left card only when there is no photograph of their own, and
 * labelled as an example when it is.
 *
 * With no gender recorded the left card falls back to the portrait,
 * which is a face rather than a hairline and says less about somebody
 * the app has not met.
 */
const PORTRAIT = require('@/assets/images/angle-portrait.jpg');

function exampleSource(gender: Gender | undefined): number {
  if (gender === undefined) return PORTRAIT;
  return hairContent(gender).angles.front.example;
}

/**
 * The blurred backdrop of the dashed frame.
 *
 * The CROWN example, not the front one. H.9 asks for "a blurred full head
 * of hair", and the crown shot is the only one of the five that is that
 * and nothing else: the back of a head, all hair, no face, no hairline,
 * no parting. The front example is a hairline and eyes for a man and a
 * scalp-part close-up for a woman — the most loaded crop in this
 * category — and a blurred one of those sitting beside somebody's own
 * photograph on a paywall reads as a comment on them however hard the
 * scrim works. The crown reads as hair.
 *
 * Always the bundled example, never theirs; hairContent reads an absent
 * gender as the male set, which is the set the app shipped with.
 */
function backdropSource(gender: Gender | undefined): number {
  return hairContent(gender).angles.crown.example;
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
/** The dashed edge of the frame: a touch over a hairline, so the
    dashes read as a drawn frame rather than a rendering artefact. */
const DASH = 1.5;
/** The disc holding the camera glyph in the dashed frame. */
const DISC = 48;
/** How hard the example behind the dashes is blurred. Far past the point
    where a face could be read: what is left is hair as a shape. */
const BACKDROP_BLUR = 18;
/** The cream scrim over it, so the dashes, the glyph and the date stay
    the things being read. Enough to hold the chrome legible in both
    themes, and not so much that the hair behind it disappears — the
    point of the picture is that the card reads as a photograph waiting
    to be taken. */
const SCRIM_OPACITY = 0.6;

/* ------------------------------ component ------------------------------- */

export function PaywallHeroPair({
  hero,
  gender,
  nextLabel,
}: {
  hero: PaywallHero | null;
  /** Chooses the example photograph when there is no photograph of theirs. */
  gender: Gender | undefined;
  /** "Next scan · 17 Oct" — the dashed frame's pill. */
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

      {/* The dashed frame, tilted to the right and in front. */}
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
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {/* The bundled example, blurred to a shape, under a cream
              scrim. Never their photograph, never dated, never after. */}
          <Image
            source={backdropSource(gender)}
            contentFit="cover"
            blurRadius={BACKDROP_BLUR}
            transition={220}
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.surface, opacity: SCRIM_OPACITY },
            ]}
          />
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
