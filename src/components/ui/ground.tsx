/**
 * The mineral ground.
 *
 * Every screen sits on this rather than on a flat fill, so cards read as
 * resting *on* a surface rather than being cut out of one. Both themes use
 * photographic plates, paired so a screen keeps its identity when the
 * appearance changes: the stone screen stays the stone screen at night.
 *
 * Three controls keep the imagery from fighting the interface:
 *
 *   1. A veil, tuned per plate. These are not guesses — each plate's mean
 *      luminance was measured, and its veil is set to land the plate at
 *      roughly 28/255, just below the card surface, so cards stay lighter
 *      than the ground in both themes. The dark foliage plate arrives at
 *      67 and needs a much heavier veil than the dark stone at 42.
 *   2. A gradient behind the header, so a page title always has a clean
 *      field whichever plate is showing.
 *   3. Reduce Transparency drops the plate entirely, where flat maximal
 *      contrast behind text matters more than atmosphere.
 *
 * The plate is decorative and hidden from assistive technology.
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useDisplayPreferences } from '@/hooks/use-accessibility-display';
import { useTheme, withZeroAlpha } from '@/theme';

/**
 * Which plate a screen sits on.
 *
 * `plain` is the quietest — a bare plaster wall. It exists for screens
 * whose job is sustained reading, where any figure in the background is a
 * distraction. Light mode has no plain plate, so it borrows the arch.
 */
export type GroundVariant = 'stone' | 'arch' | 'leaves' | 'plain';

type Plate = {
  source: number;
  /** 0-1 wash of the background colour over the plate. */
  veil: number;
  /** Fraction of screen height the header gradient covers. */
  headerFade: number;
};

/** Every screen sits on flat colour. See the note in `Ground`. */
const FLAT_GROUND = true;

const LIGHT: Record<GroundVariant, Plate> = {
  stone: {
    source: require('@/assets/images/ground-stone.jpg'),
    veil: 0.1,
    headerFade: 0.3,
  },
  arch: {
    source: require('@/assets/images/ground-arch.jpg'),
    veil: 0.12,
    headerFade: 0.32,
  },
  leaves: {
    source: require('@/assets/images/ground-leaves.jpg'),
    veil: 0.26,
    headerFade: 0.46,
  },
  plain: {
    source: require('@/assets/images/ground-arch.jpg'),
    veil: 0.18,
    headerFade: 0.34,
  },
};

/**
 * Dark veils are much heavier than their light counterparts. The plates
 * photograph as lit grey walls — mean luminance 42 to 67 — while the dark
 * theme's ground sits at 14, so without correction the cards would be
 * darker than the surface they are supposed to be floating on.
 */
const DARK: Record<GroundVariant, Plate> = {
  /** Measured 43 (the updated plate, rock softened); lands near 28. */
  stone: {
    source: require('@/assets/images/ground-dark-stone.jpg'),
    veil: 0.5,
    headerFade: 0.32,
  },
  /** Measured 47. */
  arch: {
    source: require('@/assets/images/ground-dark-arch.jpg'),
    veil: 0.58,
    headerFade: 0.34,
  },
  /** Measured 67 — the lightest plate of the eight, and the busiest. */
  leaves: {
    source: require('@/assets/images/ground-dark-leaves.jpg'),
    veil: 0.74,
    headerFade: 0.46,
  },
  /** Measured 43. */
  plain: {
    source: require('@/assets/images/ground-dark-plain.jpg'),
    veil: 0.52,
    headerFade: 0.3,
  },
};

export function Ground({
  children,
  variant = 'stone',
  style,
}: {
  children?: ReactNode;
  variant?: GroundVariant;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, scheme } = useTheme();
  const { reduceTransparency } = useDisplayPreferences();

  const plate = scheme === 'dark' ? DARK[variant] : LIGHT[variant];

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      {/*
        The photographic plates are off. They were the app's signature
        and they made it feel dull — every screen sat on a picture of
        stone, and content on a photograph is content competing with a
        photograph. The category this app lives in runs on flat, airy
        ground with big type and white cards, and that is what the person
        who owns this app asked for, in those words.

        The plates and the variant API stay so this is one switch to
        flip back, and so a screen that genuinely wants a plate later can
        have one on purpose.
      */}
      {!FLAT_GROUND && !reduceTransparency ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Image
            source={plate.source}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            // A fixed backdrop: it should not re-decode or cross-fade when
            // a screen re-renders.
            cachePolicy="memory-disk"
            transition={0}
            accessible={false}
          />

          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.background, opacity: plate.veil },
            ]}
          />

          <LinearGradient
            colors={[colors.background, withZeroAlpha(colors.background)]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: `${plate.headerFade * 100}%`,
            }}
          />
        </View>
      ) : null}

      {children}
    </View>
  );
}
