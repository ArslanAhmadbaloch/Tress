/**
 * The mineral ground.
 *
 * Every screen sits on this rather than on a flat fill, so white cards read
 * as resting *on* a surface rather than being cut out of one.
 *
 * Light mode uses the photographic plates. Dark mode keeps the procedural
 * texture: these plates are all bright plaster, and darkening a photograph
 * of white stone produces grey mud rather than a night version of itself.
 *
 * Two rules keep the imagery from fighting the interface:
 *
 *   1. A veil sits over every plate — a wash of the background colour, at a
 *      strength tuned per plate. The leaves plate has genuinely dark shapes
 *      in it and needs more than the stone does.
 *   2. A gradient at the top fades the plate out behind the header, so the
 *      page title always has a clean field to sit on whichever plate is
 *      showing. Below that the imagery comes through at full strength,
 *      where the content is cards rather than type.
 *
 * The whole thing is decorative: hidden from assistive technology, and
 * dropped entirely under Reduce Transparency, where flat maximal contrast
 * behind text matters more than atmosphere.
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useDisplayPreferences } from '@/hooks/use-accessibility-display';
import { useTheme, withZeroAlpha } from '@/theme';

/** Which plate a screen sits on. */
export type GroundVariant = 'stone' | 'arch' | 'leaves';

const PLATES: Record<
  GroundVariant,
  { source: number; veil: number; headerFade: number }
> = {
  /** Limestone form, top-right. The default, and what the mock shows. */
  stone: {
    source: require('@/assets/images/ground-stone.jpg'),
    veil: 0.1,
    headerFade: 0.3,
  },
  /** Soft arch with a frond shadow. The quietest of the three. */
  arch: {
    source: require('@/assets/images/ground-arch.jpg'),
    veil: 0.12,
    headerFade: 0.32,
  },
  /** Foliage shadow, top-left — directly behind a page title, so it
   *  carries the heaviest veil and the deepest header fade. */
  leaves: {
    source: require('@/assets/images/ground-leaves.jpg'),
    veil: 0.26,
    headerFade: 0.46,
  },
};

const DARK = require('@/assets/images/ground-dark.png');

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

  const plate = PLATES[variant];
  const isDark = scheme === 'dark';

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      {!reduceTransparency ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Image
            source={isDark ? DARK : plate.source}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            // The plate is a fixed backdrop, so it should not re-decode or
            // cross-fade when a screen re-renders.
            cachePolicy="memory-disk"
            transition={0}
            accessible={false}
          />

          {!isDark ? (
            <>
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
            </>
          ) : null}
        </View>
      ) : null}

      {children}
    </View>
  );
}
