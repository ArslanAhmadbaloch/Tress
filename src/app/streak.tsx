/**
 * The streak, broken down by the thing that earned it.
 *
 * Home shows one number across the whole stack, which answers "am I
 * keeping up" and nothing else. It does not say when you started the
 * finasteride, or which of the five you have quietly stopped ticking.
 *
 * Those are the questions worth asking here, because hair moves slowly
 * enough that the date you began is the only fixed point you have to
 * measure a photograph against. So this screen is a list of what you
 * take up and when, oldest first, with how each one has actually gone.
 *
 * It says nothing about whether any of it is working. The app has no way
 * to know that, and a start date sitting next to a photograph is already
 * as much as it can honestly offer.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Card } from '@/components/ui/card';
import { GlassOrb } from '@/components/ui/glass-orb';
import { Icon } from '@/components/ui/icon';
import {
  EmptyState,
  Screen,
  ScreenScroll,
  ScreenTitle,
  SectionHeader,
} from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { RoutineGlyph } from '@/components/ui/routine-glyphs';
import { AnimatedNumber } from '@/components/ui/stat';
import { Text } from '@/components/ui/text';
import { formatDate, formatRelative, toDateKey } from '@/lib/date';
import { routineIconFor } from '@/features/routine/icons';
import { useAppStore } from '@/store/app-store';
import {
  currentStreak,
  longestStreak,
  routineItemStats,
  type RoutineItemStat,
} from '@/store/selectors';
import { useTheme } from '@/theme';
import { TIME_OF_DAY_LABELS } from '@/types/domain';

export default function StreakScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { data } = useAppStore();

  const stats = useMemo(() => routineItemStats(data), [data]);
  const streak = currentStreak(data);
  const best = longestStreak(data);

  return (
    <Screen ground="arch">
      <ScreenScroll>
        <ScreenTitle
          eyebrow="Streak"
          title="What you"
          titleMuted="keep up"
          subtitle="When you started each one, and how it has gone since."
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

        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
          <Tile icon="flame" label="Current streak" value={streak} />
          <Tile icon="trophy" label="Longest streak" value={best} />
        </View>

        {stats.length === 0 ? (
          <EmptyState
            icon="plus"
            title="Nothing in your stack yet"
            body="Add what you are doing for your hair and this becomes a record of when you started each one."
            actionLabel="Add routine"
            onAction={() => router.push('/routine')}
          />
        ) : (
          <>
            <SectionHeader title="Since you started" />
            <View style={{ gap: spacing.sm }}>
              {stats.map((stat) => (
                <ItemRow key={stat.item.id} stat={stat} />
              ))}
            </View>

            <PressableScale
              onPress={() => router.push('/routine')}
              scaleTo={0.99}
              accessibilityRole="button"
              accessibilityLabel="Add or edit tasks"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
                marginTop: spacing.lg,
                paddingVertical: spacing.lg,
                borderRadius: radius.md,
                backgroundColor: colors.fill,
              }}>
              <Icon name="plus" size={15} color={colors.accent} />
              <Text variant="subhead" color="accent">
                Add or edit tasks
              </Text>
            </PressableScale>
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

/* -------------------------------- pieces -------------------------------- */

function Tile({
  icon,
  label,
  value,
}: {
  icon: 'flame' | 'trophy';
  label: string;
  value: number;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value} days`}
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
        <AnimatedNumber value={value} />
        <Text variant="caption" color="textTertiary">
          days
        </Text>
      </View>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

/**
 * One thing in the stack.
 *
 * The start date leads, because that is the fact the rest of the app
 * cannot give you: a photograph from March means something different
 * depending on whether you began in February or the week before.
 */
function ItemRow({ stat }: { stat: RoutineItemStat }) {
  const { colors, spacing, radius } = useTheme();
  const { item, daysTracked, daysDone, streak, adherence, lastDone } = stat;

  const started = new Date(item.createdAt);
  const startedToday = daysTracked === 1;
  const doneToday = lastDone === toDateKey();

  const timeOfDay = item.timeOfDay ? TIME_OF_DAY_LABELS[item.timeOfDay] : null;

  return (
    <Card padded={false}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.lg,
        }}>
        <GlassOrb size={42} ring={false} tone={streak > 0 ? 'green' : 'neutral'}>
          <RoutineGlyph icon={routineIconFor(item)} size={20} />
        </GlassOrb>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="headline" numberOfLines={1}>
            {item.label}
          </Text>
          <Text variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
            {startedToday
              ? 'Started today'
              : `Started ${formatDate(item.createdAt)} · ${formatRelative(started.toISOString())}`}
          </Text>
          {item.detail || timeOfDay ? (
            <Text variant="caption" color="textTertiary" style={{ marginTop: 1 }}>
              {[item.detail, timeOfDay].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>

        {doneToday ? (
          <View
            style={{
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
              borderRadius: radius.pill,
              backgroundColor: colors.accentSoft,
            }}>
            <Text variant="caption" color="accent" style={{ fontWeight: '600' }}>
              Today
            </Text>
          </View>
        ) : null}
      </View>

      {/* What the record actually says. Three plain counts, no verdict. */}
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: colors.separator,
        }}>
        <Stat label="Day streak" value={String(streak)} />
        <Stat label="Days done" value={`${daysDone} of ${daysTracked}`} />
        <Stat
          label="Kept to"
          value={adherence === null ? '—' : `${adherence}%`}
          last
        />
      </View>
    </Card>
  );
}

function Stat({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  const { colors, spacing } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flex: 1,
        alignItems: 'center',
        paddingVertical: spacing.md,
        borderRightWidth: last ? 0 : 1,
        borderRightColor: colors.separator,
      }}>
      <Text variant="subhead" style={{ fontWeight: '600' }}>
        {value}
      </Text>
      <Text variant="caption" color="textTertiary" style={{ marginTop: 1 }}>
        {label}
      </Text>
    </View>
  );
}
