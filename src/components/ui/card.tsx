import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from './pressable-scale';
import { useTheme } from '@/theme';

export type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Opaque surface (default) or a raised one for nested content. */
  tone?: 'surface' | 'elevated' | 'subtle';
  padded?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

/**
 * The default content container. Opaque by design — glass is reserved
 * for chrome, so that long scrolling lists stay readable and cheap.
 *
 * No outline. A card is white paper resting on the warm ground, and it is
 * the shadow beneath it, not a line around it, that says so. An outlined
 * card reads as a form field; a floating one reads as a thing.
 *
 * Two views rather than one. The card has to clip its children to its
 * corners — a full-bleed photo, a row that highlights on press — and on
 * iOS a view that clips (`overflow: 'hidden'`) also clips its own shadow,
 * so a single view can have the corners or the shadow but never both.
 * That is why these cards sat flat on iOS for as long as they did: the
 * shadow was declared and then cut off. The outer view now carries the
 * shadow and the caller's layout style; the inner one clips. Both are
 * painted, because iOS derives the shadow's shape from the outer view's
 * background and Android will not draw an elevation for a view without
 * one.
 */
export function Card({
  children,
  style,
  tone = 'surface',
  padded = true,
  onPress,
  accessibilityLabel,
}: CardProps) {
  const { colors, radius, spacing, shadow } = useTheme();

  const background =
    tone === 'elevated'
      ? colors.surfaceElevated
      : tone === 'subtle'
        ? colors.backgroundSubtle
        : colors.surface;

  const outer: StyleProp<ViewStyle> = [
    {
      backgroundColor: background,
      borderRadius: radius.card,
    },
    /* A subtle card is an inset panel inside another surface, and an inset
       panel that casts a shadow reads as a card stacked on a card. */
    tone !== 'subtle' && shadow.soft,
    style,
  ];

  /*
    Twenty points of padding, not sixteen. The reference's cards hold
    their content well clear of the edge, and that margin is most of
    what makes them read as composed rather than filled.
  */
  const inner: ViewStyle = {
    borderRadius: radius.card,
    overflow: 'hidden',
    padding: padded ? spacing.xl : 0,
  };

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        scaleTo={0.985}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={outer}>
        <View style={inner}>{children}</View>
      </PressableScale>
    );
  }

  return (
    <View style={outer}>
      <View style={inner}>{children}</View>
    </View>
  );
}
