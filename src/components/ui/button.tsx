import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

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
  /**
   * Briefly replaces the label with a tick, for a press that finished
   * something. Never set it for a press that only navigates: a check mark
   * that means "you went somewhere" is a check mark that means nothing.
   */
  succeeded?: boolean;
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
  succeeded,
  block = true,
  style,
  accessibilityHint,
}: ButtonProps) {
  const { colors, radius, spacing } = useTheme();

  /*
    Fifty-six points for a primary action, not the 44 a hit target needs.
    A pill that is only just tall enough to tap looks like a chip; one
    with room above and below its label looks like the thing the screen
    was leading to. The smaller size is for actions inside a row, where
    the row's own height would otherwise be set by the button.
  */
  const height = size === 'lg' ? 56 : MIN_TOUCH_TARGET + spacing.xs;

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
      ) : succeeded ? (
        <Animated.View
          entering={ZoomIn.springify().damping(12).stiffness(420)}
          exiting={FadeOut.duration(120)}>
          <Icon name="check" size={18} color={colors[labelColor]} />
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeIn.duration(160)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {icon ? <Icon name={icon} size={18} color={colors[labelColor]} /> : null}
          <Text variant="headline" color={labelColor}>
            {label}
          </Text>
        </Animated.View>
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
