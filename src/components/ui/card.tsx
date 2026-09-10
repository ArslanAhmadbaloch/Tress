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

  const base: StyleProp<ViewStyle> = [
    {
      backgroundColor: background,
      borderRadius: radius.card,
      padding: padded ? spacing.lg : 0,
      overflow: 'hidden',
    },
    tone !== 'subtle' && shadow.soft,
    style,
  ];

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        scaleTo={0.985}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={base}>
        {children}
      </PressableScale>
    );
  }

  return <View style={base}>{children}</View>;
}
