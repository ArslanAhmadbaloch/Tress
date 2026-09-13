/**
 * The way back, drawn the way this app draws things.
 *
 * A circle of the same glass as every other floating control, holding a
 * chevron and nothing else. No label: the native one is captioned with
 * the name of the route it returns to, which for anything opened from a
 * tab reads "(tabs)" — the router's own vocabulary leaking onto a screen
 * somebody is trying to read.
 */

import { View } from 'react-native';

import { Icon } from './icon';
import { PressableScale } from './pressable-scale';
import { useTheme } from '@/theme';

const SIZE = 36;

export function BackButton({
  onPress,
  label = 'Back',
  /** Wraps the control in the standard screen padding. */
  padded = false,
}: {
  onPress: () => void;
  label?: string;
  padded?: boolean;
}) {
  const { colors, spacing } = useTheme();

  const button = (
    <PressableScale
      hitSlop={4}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}>
      <Icon name="chevronLeft" size={15} color={colors.text} />
    </PressableScale>
  );

  if (!padded) return button;
  return <View style={{ padding: spacing.lg }}>{button}</View>;
}
