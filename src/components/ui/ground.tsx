/**
 * The mineral ground.
 *
 * Every screen sits on this rather than on a flat fill. It is a tiled
 * procedural texture at very low contrast — enough that white cards read
 * as resting *on* a surface rather than being cut out of one, and not so
 * much that it competes with the photographs, which are the content.
 *
 * The texture is decorative, so it is hidden from assistive technology and
 * dropped entirely when Reduce Transparency is on, where the priority is
 * flat, maximal contrast behind text.
 */

import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useDisplayPreferences } from '@/hooks/use-accessibility-display';
import { useTheme } from '@/theme';

const LIGHT = require('@/assets/images/ground-light.png');
const DARK = require('@/assets/images/ground-dark.png');

export function Ground({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, scheme } = useTheme();
  const { reduceTransparency } = useDisplayPreferences();

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      {!reduceTransparency ? (
        <Image
          source={scheme === 'dark' ? DARK : LIGHT}
          style={StyleSheet.absoluteFill}
          // Tiling a 512px source keeps the asset small on any screen size.
          contentFit="cover"
          accessible={false}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </View>
  );
}
