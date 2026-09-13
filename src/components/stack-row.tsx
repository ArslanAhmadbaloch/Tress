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
import { Burst, Pop } from './ui/motion';
import { PressableScale } from './ui/pressable-scale';
import { CheckGlyph, RoutineGlyph } from './ui/routine-glyphs';
import { Text } from './ui/text';
import { routineIconFor } from '@/features/routine/icons';
import { spacing, useTheme } from '@/theme';
import { doseCount, TIME_OF_DAY_LABELS, type RoutineItem } from '@/types/domain';

const ORB = 38;

/**
 * One size for every dose box, whatever the count.
 *
 * They were scaled down as they multiplied, so a once-a-day item sat
 * beside a twice-a-day one wearing a visibly bigger circle — which reads
 * as the two meaning different things when they mean exactly the same.
 * Four at this size still clear the label on the narrowest row.
 */
const CHECK = 26;

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
  taken,
  onToggle,
  accessory,
}: {
  item: RoutineItem;
  /** Doses in for today. One tap adds one. */
  taken: number;
  onToggle: () => void;
  /** Extra control before the check, e.g. remove on the routine screen. */
  accessory?: ReactNode;
}) {
  const { colors } = useTheme();
  const subtitle = stackSubtitle(item);

  const total = doseCount(item);
  const filled = Math.min(total, Math.max(0, taken));
  const done = filled >= total;


  return (
    <PressableScale
      onPress={onToggle}
      haptic={done ? 'light' : 'success'}
      scaleTo={0.995}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={
        total === 1 ? item.label : `${item.label}, ${filled} of ${total} doses`
      }
      accessibilityHint={
        total === 1 ? subtitle : 'Tap to record a dose'
      }
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

      {/* Ticking something off is the one moment in the app worth
          celebrating, so it gets the pop and the burst — once the day is
          actually done, not on every dose along the way. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {Array.from({ length: total }, (_, i) => {
          const lit = i < filled;
          // The burst belongs to the pip that finishes the day.
          const last = i === total - 1;

          return (
            <View key={i} style={{ width: CHECK, height: CHECK }}>
              {last ? <Burst active={done} size={CHECK * 2.1} /> : null}
              <Pop active={lit}>
                {lit ? (
                  <GlassOrb size={CHECK} ring={false}>
                    <CheckGlyph size={13} />
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
              </Pop>
            </View>
          );
        })}
      </View>

    </PressableScale>
  );
}
