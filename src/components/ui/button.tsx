import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from './pressable-scale';
import { Text } from './text';
import { useTheme, MIN_TOUCH_TARGET } from '@/theme';
import { Icon, type IconName } from './icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  /** Stretch to the container width — the default for primary CTAs. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  disabled,
  loading,
  block = true,
  style,
  accessibilityHint,
}: ButtonProps) {
  const { colors, radius, spacing } = useTheme();

  const height = size === 'lg' ? 54 : MIN_TOUCH_TARGET;

  const surface: Record<Variant, ViewStyle> = {
    primary: { backgroundColor: colors.accent },
    secondary: { backgroundColor: colors.fill },
    ghost: { backgroundColor: 'transparent' },
    destructive: { backgroundColor: colors.danger },
  };

  const labelColor =
    variant === 'primary' || variant === 'destructive'
      ? 'textOnAccent'
      : variant === 'ghost'
        ? 'accent'
        : 'text';

  const isBusy = Boolean(loading);

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || isBusy}
      haptic={variant === 'destructive' ? 'medium' : 'light'}
      scaleTo={0.975}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || isBusy, busy: isBusy }}
      style={[
        {
          height,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing.sm,
          paddingHorizontal: spacing.xxl,
          alignSelf: block ? 'stretch' : 'flex-start',
        },
        surface[variant],
        style,
      ]}>
      {isBusy ? (
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'destructive'
              ? colors.textOnAccent
              : colors.text
          }
        />
      ) : (
        <>
          {icon ? (
            <Icon name={icon} size={18} color={colors[labelColor]} />
          ) : null}
          <Text variant="headline" color={labelColor}>
            {label}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

/** A row of buttons pinned to the bottom of a screen. */
export function ButtonRow({ children }: { children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>{children}</View>
  );
}
