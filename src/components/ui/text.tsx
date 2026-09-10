import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type ColorTokens, type TypographyVariant } from '@/theme';

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  /** Any colour token, so callers never pass a raw hex. */
  color?: keyof ColorTokens;
  center?: boolean;
};

/**
 * Typed text. Every string in the app should go through this so the
 * type scale stays consistent and Dynamic Type keeps working.
 */
export function Text({
  variant = 'body',
  color = 'text',
  center,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  return (
    <RNText
      {...rest}
      style={[
        theme.typography[variant],
        { color: theme.colors[color] },
        center && { textAlign: 'center' },
        style,
      ]}
    />
  );
}
