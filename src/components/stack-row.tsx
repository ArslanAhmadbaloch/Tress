/**
 * One row of the routine stack, cloned from the reference.
 *
 * Glass orb with the item's glyph, the name over a quiet "amount — time"
 * line, and a glass check on the right. The whole row is the tap target,
 * because a 40pt check at the far edge is a long reach one-handed; the
 * check is where the state shows, not the only place to change it.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';

import { GlassOrb } from './ui/glass-orb';
import { PressableScale } from './ui/pressable-scale';
import { CheckGlyph, RoutineGlyph } from './ui/routine-glyphs';
import { Text } from './ui/text';
import { routineIconFor } from '@/features/routine/icons';
import { spacing, useTheme } from '@/theme';
import { TIME_OF_DAY_LABELS, type RoutineItem } from '@/types/domain';

const ORB = 38;
const CHECK = 30;

/** Where a row's text begins, so separators can start under it. */
export const STACK_TEXT_INSET = spacing.lg + ORB + spacing.md;

/** "5% — Morning", "Morning", or just the note — whichever exists. */
export function stackSubtitle(
  item: Pick<RoutineItem, 'detail' | 'timeOfDay'>,
): string | undefined {
  const time =
    item.timeOfDay && item.timeOfDay !== 'anytime'
      ? TIME_OF_DAY_LABELS[item.timeOfDay]
      : undefined;
  const detail = item.detail?.trim();
  if (detail && time) return `${detail} — ${time}`;
  return detail || time;
}

export function StackRow({
  item,
  done,
  onToggle,
  accessory,
}: {
  item: RoutineItem;
  done: boolean;
  onToggle: () => void;
  /** Extra control before the check, e.g. remove on the routine screen. */
  accessory?: ReactNode;
}) {
  const { colors } = useTheme();
  const subtitle = stackSubtitle(item);

  return (
    <PressableScale
      onPress={onToggle}
      haptic={done ? 'light' : 'success'}
      scaleTo={0.995}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={item.label}
      accessibilityHint={subtitle}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm + spacing.xxs,
      }}>
      <GlassOrb size={ORB} ring={false}>
        <RoutineGlyph icon={routineIconFor(item)} size={19} />
      </GlassOrb>

      <View style={{ flex: 1 }}>
        <Text variant="callout" numberOfLines={1} style={{ fontWeight: '500' }}>
          {item.label}
        </Text>
        {subtitle ? (
          <Text
            variant="footnote"
            color="textTertiary"
            numberOfLines={1}
            style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {accessory}

      {done ? (
        <GlassOrb size={CHECK} ring={false}>
          <CheckGlyph size={15} />
        </GlassOrb>
      ) : (
        <View
          style={{
            width: CHECK,
            height: CHECK,
            borderRadius: CHECK / 2,
            borderWidth: 1.5,
            borderColor: colors.fillSelected,
            backgroundColor: colors.surface,
          }}
        />
      )}
    </PressableScale>
  );
}
