import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Screen, ScreenScroll, ScreenTitle } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { AnimatedNumber } from '@/components/ui/stat';
import { Text } from '@/components/ui/text';
import { daysBetween, toDateKey } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import {
  activeRoutineItems,
  adherencePercent,
  completedOn,
  currentStreak,
} from '@/store/selectors';
import { useTheme } from '@/theme';
import type { AppData } from '@/types/domain';

/**
 * The consistency page.
 *
 * The calendar itself is the hero: this screen answers "have I been
 * showing up?" and nothing else. The daily checklist deliberately lives on
 * Home — putting it here too would turn a calm page into a dashboard.
 */

type DayState = 'complete' | 'partial' | 'missed' | 'future' | 'before';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dayState(data: AppData, date: Date): DayState {
  if (!data.journey) return 'before';

  const iso = date.toISOString();
  if (daysBetween(iso) < 0) return 'future';
  if (daysBetween(data.journey.startedAt, iso) < 0) return 'before';

  const items = activeRoutineItems(data).filter(
    (item) => daysBetween(item.createdAt, iso) >= 0,
  );
  if (items.length === 0) return 'before';

  const done = completedOn(data, toDateKey(date));
  const hit = items.filter((item) => done.has(item.id)).length;

  if (hit === items.length) return 'complete';
  if (hit > 0) return 'partial';
  return 'missed';
}

/** Longest run of fully complete days across the whole journey. */
function longestStreak(data: AppData): number {
  if (!data.journey) return 0;

  const total = daysBetween(data.journey.startedAt) + 1;
  let best = 0;
  let run = 0;

  const cursor = new Date(data.journey.startedAt);
  for (let i = 0; i < Math.min(total, 800); i += 1) {
    if (dayState(data, cursor) === 'complete') {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return best;
}

export default function CalendarScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { data } = useAppStore();

  const [monthOffset, setMonthOffset] = useState(0);

  const month = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const grid = useMemo(() => {
    const first = new Date(month);
    const daysInMonth = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
    ).getDate();

    // Monday-first: JS getDay() is Sunday-first, so rotate it.
    const lead = (first.getDay() + 6) % 7;

    const cells: ({ date: Date; state: DayState } | null)[] = [];
    for (let i = 0; i < lead; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      cells.push({ date, state: dayState(data, date) });
    }
    return cells;
  }, [month, data]);

  const monthComplete = grid.filter((c) => c?.state === 'complete').length;
  const monthTracked = grid.filter(
    (c) => c && c.state !== 'future' && c.state !== 'before',
  ).length;

  const adherence = adherencePercent(data, 30);
  const streak = currentStreak(data);
  const best = longestStreak(data);

  const todayKey = toDateKey();
  const isCurrentMonth = monthOffset === 0;

  return (
    <Screen>
      <ScreenScroll>
        <ScreenTitle
          eyebrow="Calendar"
          title="Track your"
          titleMuted="consistency"
          subtitle="Small steps. Real results."
          script="Discipline Today Denser Hair Tomorrow"
          trailing={
            <PressableScale
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}>
              <Icon name="close" size={15} color={colors.text} />
            </PressableScale>
          }
        />

        {/* Three quiet numbers above the calendar. */}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
          <SummaryTile icon="flame" label="Current streak" value={streak} unit="days" />
          <SummaryTile icon="trophy" label="Longest streak" value={best} unit="days" />
          <SummaryTile
            icon="chart"
            label="Adherence"
            value={adherence ?? 0}
            unit="%"
          />
        </View>

        {/* The calendar is the hero. */}
        <Card style={{ marginTop: spacing.lg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: spacing.lg,
            }}>
            <MonthArrow
              icon="chevronLeft"
              label="Previous month"
              onPress={() => setMonthOffset((m) => m - 1)}
            />
            <Text variant="headline">
              {month.toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </Text>
            <MonthArrow
              icon="chevronRight"
              label="Next month"
              disabled={isCurrentMonth}
              onPress={() => setMonthOffset((m) => Math.min(0, m + 1))}
            />
          </View>

          <View style={{ flexDirection: 'row' }}>
            {WEEKDAYS.map((d) => (
              <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                <Text variant="caption" color="textTertiary">
                  {d}
                </Text>
              </View>
            ))}
          </View>

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              marginTop: spacing.sm,
            }}>
            {grid.map((cell, i) => (
              <View
                key={cell ? cell.date.toISOString() : `pad-${i}`}
                style={{
                  width: `${100 / 7}%`,
                  aspectRatio: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {cell ? (
                  <Day
                    day={cell.date.getDate()}
                    state={cell.state}
                    isToday={toDateKey(cell.date) === todayKey}
                  />
                ) : null}
              </View>
            ))}
          </View>

          {/* Legend */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              gap: spacing.lg,
              marginTop: spacing.lg,
            }}>
            <Legend state="complete" label="Complete" />
            <Legend state="partial" label="Partial" />
            <Legend state="missed" label="Missed" />
          </View>
        </Card>

        {/* Month summary */}
        <Card style={{ marginTop: spacing.md }}>
          <Text variant="headline">
            {month.toLocaleDateString(undefined, { month: 'long' })} so far
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: spacing.sm,
              marginTop: spacing.sm,
            }}>
            <Text variant="stat">
              {monthComplete}
              <Text variant="title3" color="textTertiary">
                {' / '}
                {monthTracked || '—'}
              </Text>
            </Text>
            <Text variant="footnote" color="textSecondary">
              days completed
            </Text>
          </View>
          <Text variant="footnote" color="textTertiary" style={{ marginTop: spacing.sm }}>
            Only days after your journey started, and after each routine item
            was added, are counted.
          </Text>
        </Card>

        <View
          style={{
            marginTop: spacing.xl,
            padding: spacing.lg,
            borderRadius: radius.card,
            backgroundColor: colors.backgroundSubtle,
            flexDirection: 'row',
            gap: spacing.md,
          }}>
          <Icon name="info" size={17} color={colors.textTertiary} />
          <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
            Consistency is what makes your timeline readable later — a routine
            followed irregularly is hard to interpret against your photographs.
          </Text>
        </View>
      </ScreenScroll>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function Day({
  day,
  state,
  isToday,
}: {
  day: number;
  state: DayState;
  isToday: boolean;
}) {
  const { colors } = useTheme();

  const fill =
    state === 'complete'
      ? colors.accent
      : state === 'partial'
        ? colors.accentSoft
        : 'transparent';

  const textColor =
    state === 'complete'
      ? 'textOnAccent'
      : state === 'future' || state === 'before'
        ? 'textTertiary'
        : 'text';

  return (
    <View
      accessible
      accessibilityLabel={`${day}, ${state}`}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: fill,
        borderWidth: isToday ? 1.5 : state === 'missed' ? 1 : 0,
        borderColor: isToday ? colors.accent : colors.separator,
        opacity: state === 'future' || state === 'before' ? 0.45 : 1,
      }}>
      <Text variant="footnote" color={textColor}>
        {day}
      </Text>
    </View>
  );
}

function Legend({ state, label }: { state: DayState; label: string }) {
  const { colors, spacing } = useTheme();

  const fill =
    state === 'complete'
      ? colors.accent
      : state === 'partial'
        ? colors.accentSoft
        : 'transparent';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: fill,
          borderWidth: state === 'missed' ? 1 : 0,
          borderColor: colors.separator,
        }}
      />
      <Text variant="caption" color="textTertiary">
        {label}
      </Text>
    </View>
  );
}

function MonthArrow({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevronLeft' | 'chevronRight';
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.fill,
      }}>
      <Icon name={icon} size={15} color={colors.text} />
    </PressableScale>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  unit,
}: {
  icon: 'flame' | 'trophy' | 'chart';
  label: string;
  value: number;
  unit: string;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value} ${unit}`}
      style={{
        flex: 1,
        padding: spacing.lg,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.sm,
      }}>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.accentSoft,
        }}>
        <Icon name={icon} size={15} color={colors.accent} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <AnimatedNumber value={value} suffix={unit === '%' ? '%' : ''} />
        {unit !== '%' ? (
          <Text variant="caption" color="textTertiary">
            {unit}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}
