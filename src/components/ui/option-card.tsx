import { View } from 'react-native';

import { Icon } from './icon';
import { PressableScale } from './pressable-scale';
import { Text } from './text';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

/**
 * A selectable option used throughout onboarding and settings.
 * Multi-select shows a check; single-select behaves like a radio.
 */
export function OptionCard({
  label,
  description,
  selected,
  onPress,
  multi = true,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  multi?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.985}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      accessibilityHint={description}
      style={{
        minHeight: MIN_TOUCH_TARGET + 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        backgroundColor: selected ? colors.accentSoft : colors.surface,
        borderWidth: 1,
        borderColor: selected ? colors.accentBorder : colors.border,
      }}>
      <View style={{ flex: 1 }}>
        <Text variant="headline" color={selected ? 'accent' : 'text'}>
          {label}
        </Text>
        {description ? (
          <Text variant="footnote" color="textSecondary" style={{ marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? colors.accent : 'transparent',
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.border,
        }}>
        {selected ? <Icon name="check" size={14} color={colors.textOnAccent} /> : null}
      </View>
    </PressableScale>
  );
}

/** Step progress for onboarding — quiet, not a loading bar. */
export function ProgressDots({ total, index }: { total: number; index: number }) {
  const { colors, spacing } = useTheme();

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: index + 1 }}
      style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 4,
            width: i === index ? 20 : 6,
            borderRadius: 2,
            backgroundColor: i <= index ? colors.accent : colors.fill,
          }}
        />
      ))}
    </View>
  );
}
