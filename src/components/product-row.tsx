/**
 * One hair-care product being set up, with how often it happens.
 *
 * The frequency sits inside the row and only appears once the row is
 * ticked: an unchosen product does not need a schedule, and seven pills
 * under every line of a nine-line list is a wall rather than a choice.
 */

import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from './ui/icon';
import { PressableScale } from './ui/pressable-scale';
import { RoutineGlyph } from './ui/routine-glyphs';
import { Text } from './ui/text';
import { useTheme } from '@/theme';
import { FREQUENCY_LABELS, FREQUENCY_OPTIONS, type RoutineIcon } from '@/types/domain';

export function ProductRow({
  label,
  icon,
  selected,
  timesPerWeek,
  onToggle,
  onFrequency,
  onRemove,
}: {
  label: string;
  icon: RoutineIcon;
  selected: boolean;
  timesPerWeek: number;
  onToggle: () => void;
  onFrequency: (times: number) => void;
  /** Present on things the user typed in, absent on the offered list. */
  onRemove?: () => void;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View
      style={{
        borderRadius: radius.md,
        backgroundColor: selected ? colors.accentSoft : colors.surface,
        borderWidth: 1,
        borderColor: selected ? colors.accentBorder : colors.border,
        overflow: 'hidden',
      }}>
      <PressableScale
        onPress={onToggle}
        scaleTo={0.995}
        haptic="light"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={label}
        accessibilityHint={
          selected ? `${FREQUENCY_LABELS[timesPerWeek]}` : 'Adds this to your routine'
        }
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.lg,
        }}>
        <RoutineGlyph icon={icon} size={20} />
        <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {label}
        </Text>

        {onRemove ? (
          <PressableScale
            onPress={onRemove}
            hitSlop={10}
            haptic="none"
            accessibilityRole="button"
            accessibilityLabel={`Remove ${label}`}
            style={{ padding: spacing.xs }}>
            <Icon name="close" size={14} color={colors.textTertiary} />
          </PressableScale>
        ) : null}

        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? colors.accent : 'transparent',
            borderWidth: selected ? 0 : 1.5,
            borderColor: colors.border,
          }}>
          {selected ? <Icon name="check" size={12} color={colors.textOnAccent} /> : null}
        </View>
      </PressableScale>

      {selected ? (
        <Animated.View entering={FadeIn.duration(180)}>
          <View
            accessibilityRole="radiogroup"
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing.xs,
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.lg,
            }}>
            {FREQUENCY_OPTIONS.map((times) => {
              const active = times === timesPerWeek;
              return (
                <PressableScale
                  key={times}
                  onPress={() => onFrequency(times)}
                  haptic="light"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${label}: ${FREQUENCY_LABELS[times]}`}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.border,
                  }}>
                  <Text
                    variant="caption"
                    color={active ? 'textOnAccent' : 'textSecondary'}
                    style={{ fontWeight: active ? '600' : '400' }}>
                    {times === 7 ? 'Daily' : `${times}× a week`}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
