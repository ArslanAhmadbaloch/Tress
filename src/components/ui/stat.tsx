import { useEffect } from 'react';
import { TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from './icon';
import { Text } from './text';
import { useTheme } from '@/theme';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * A number that counts up when it appears.
 *
 * Driven through an uneditable TextInput because its `text` prop can be
 * set from the UI thread — a plain <Text> would need a JS round-trip per
 * frame and would stutter.
 */
export function AnimatedNumber({
  value,
  suffix = '',
  variant = 'stat',
  color = 'text',
}: {
  value: number;
  suffix?: string;
  variant?: 'stat' | 'display' | 'title2';
  color?: 'text' | 'accent' | 'textOnAccent';
}) {
  const theme = useTheme();
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      progress.set(value);
      return;
    }
    progress.set(withTiming(value, { duration: 700 }));
  }, [value, progress, reduceMotion]);

  const animatedProps = useAnimatedProps(() => ({
    text: `${Math.round(progress.get())}${suffix}`,
    defaultValue: `${Math.round(progress.get())}${suffix}`,
  }));

  return (
    <AnimatedTextInput
      editable={false}
      // The value is decorative; the parent supplies the real label.
      accessible={false}
      importantForAccessibility="no"
      underlineColorAndroid="transparent"
      animatedProps={animatedProps as never}
      style={[
        theme.typography[variant],
        {
          color: theme.colors[color],
          padding: 0,
          margin: 0,
          // TextInput reserves descender space that <Text> does not.
          includeFontPadding: false,
        },
      ]}
    />
  );
}

/** Compact metric tile used on the dashboard. */
export function StatTile({
  icon,
  label,
  value,
  suffix,
  caption,
  tone = 'default',
  style,
}: {
  icon: IconName;
  label: string;
  value: number | string;
  suffix?: string;
  caption?: string;
  tone?: 'default' | 'accent';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, spacing } = useTheme();
  const isAccent = tone === 'accent';

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${suffix ?? ''}${caption ? `, ${caption}` : ''}`}
      style={[
        {
          flex: 1,
          padding: spacing.lg,
          borderRadius: radius.card,
          backgroundColor: isAccent ? colors.accentSoft : colors.surface,
          borderWidth: 1,
          borderColor: isAccent ? colors.accentBorder : colors.border,
          gap: spacing.sm,
        },
        style,
      ]}>
      <Icon name={icon} size={18} color={isAccent ? colors.accent : colors.textTertiary} />

      <View>
        {typeof value === 'number' ? (
          <AnimatedNumber
            value={value}
            suffix={suffix}
            color={isAccent ? 'accent' : 'text'}
          />
        ) : (
          <Text
            variant="stat"
            color={isAccent ? 'accent' : 'text'}
            // Tiles are a third of the screen; a long string must shrink
            // rather than wrap mid-word.
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}>
            {value}
            {suffix}
          </Text>
        )}
        <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
          {label}
        </Text>
        {caption ? (
          <Text variant="caption" color="textTertiary" style={{ marginTop: 2 }}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Horizontal progress track, used for adherence and capture progress. */
export function ProgressBar({
  progress,
  tone = 'accent',
  height = 8,
}: {
  /** 0 to 1. */
  progress: number;
  tone?: 'accent' | 'neutral';
  height?: number;
}) {
  const { colors, radius } = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{
        height,
        borderRadius: radius.pill,
        backgroundColor: colors.fill,
        overflow: 'hidden',
      }}>
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: radius.pill,
          backgroundColor: tone === 'accent' ? colors.accent : colors.textTertiary,
        }}
      />
    </View>
  );
}
