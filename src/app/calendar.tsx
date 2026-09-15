import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
  EmptyState,
  Screen,
  ScreenScroll,
  ScreenTitle,
} from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { AnimatedNumber } from '@/components/ui/stat';
import { Text } from '@/components/ui/text';
import { toDateKey } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import {
  activeRoutineItems,
  adherencePercent,
  currentStreak,
  dayState,
  longestStreak,
  type DayState,
} from '@/store/selectors';
import { useTheme } from '@/theme';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Diameter of the filled well a tile's glyph sits in. */
const GLYPH_WELL = 36;

/**
 * The consistency page.
 *
 * The calendar itself is the hero: this screen answers "have I been
 * showing up?" and nothing else. The daily checklist deliberately lives on
 * Home — putting it here too would turn a calm page into a dashboard.
 */

export default function CalendarScreen() {
  const { colors, spacing, shadow } = useTheme();
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

  // With nothing to tick off, every square is a day you could not have
  // completed. A grid of misses is a worse answer than saying so.
  const hasRoutine = activeRoutineItems(data).length > 0;

  return (
    <Screen ground="arch">
      <ScreenScroll>
        <ScreenTitle
          eyebrow="Calendar"
          title="Track your"
          titleMuted="consistency"
          subtitle="Every day you showed up."
          trailing={
            <PressableScale
              hitSlop={4}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={[
                {
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surface,
                },
                shadow.soft,
              ]}>
              <Icon name="close" size={15} color={colors.text} />
            </PressableScale>
          }
        />

        {!hasRoutine ? (
          <EmptyState
            icon="plus"
            title="Nothing to track yet"
            body="Add what you are doing for your hair and these days start filling in as you tick them off."
            actionLabel="Add routine"
            onAction={() => router.push('/routine')}
          />
        ) : null}

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
              marginBottom: spacing.xl,
            }}>
            <MonthArrow
              icon="chevronLeft"
              label="Previous month"
              onPress={() => setMonthOffset((m) => m - 1)}
            />
            <Text variant="title3">
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
              gap: spacing.xl,
              marginTop: spacing.xl,
            }}>
            <Legend state="complete" label="Complete" />
            <Legend state="partial" label="Partial" />
            <Legend state="missed" label="Missed" />
          </View>
        </Card>

        {/* Month summary */}
        <Card style={{ marginTop: spacing.lg }}>
          <Text variant="title3">
            {month.toLocaleDateString(undefined, { month: 'long' })} so far
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: spacing.sm,
              marginTop: spacing.md,
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
          <Text variant="footnote" color="textTertiary" style={{ marginTop: spacing.md }}>
            Only days after your journey started, and after each routine item
            was added, are counted.
          </Text>
        </Card>

        {/*
          A quiet line under the cards, not a boxed notice with an icon.
          Everything above it is a card; one more grey panel with an "i"
          in it read as a warning about the page rather than a thought
          about it.
        */}
        <Text
          variant="footnote"
          color="textTertiary"
          center
          style={{ marginTop: spacing.xxl, paddingHorizontal: spacing.xl }}>
          Consistency is what makes your timeline readable later — a routine
          followed irregularly is hard to interpret against your photographs.
        </Text>
      </ScreenScroll>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One day.
 *
 * Complete is solid, partial is the soft tint, missed is the quiet fill,
 * and the future is faint. A missed day used to be a hollow ring, which
 * made a month of them look like a sheet of empty checkboxes; a filled
 * dot in the ground's own grey says "nothing here" without scolding.
 */
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
        : state === 'missed'
          ? colors.fill
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
        borderWidth: isToday ? 1.5 : 0,
        borderColor: colors.accent,
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
        : colors.fill;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: fill,
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
      hitSlop={5}
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.fill,
        opacity: disabled ? 0.45 : 1,
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
  const { colors, spacing, radius, shadow } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value} ${unit}`}
      style={[
        {
          flex: 1,
          padding: spacing.lg,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
          gap: spacing.md,
        },
        /*
          No border. Three tiles across leave each one narrow, and an
          outline on a narrow tile is most of what is visible; the
          shadow does the same job without taking up any of the width.
        */
        shadow.soft,
      ]}>
      <View
        style={{
          width: GLYPH_WELL,
          height: GLYPH_WELL,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.accentSoft,
        }}>
        <Icon name={icon} size={15} color={colors.accent} />
      </View>
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
          <AnimatedNumber value={value} suffix={unit === '%' ? '%' : ''} variant="metric" />
          {unit !== '%' ? (
            <Text variant="caption" color="textTertiary">
              {unit}
            </Text>
          ) : null}
        </View>
        <Text variant="caption" color="textSecondary" style={{ marginTop: spacing.xs }}>
          {label}
        </Text>
      </View>
    </View>
  );
}
