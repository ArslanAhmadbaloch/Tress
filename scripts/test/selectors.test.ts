/**
 * The logic the interface cannot show you is wrong.
 *
 * A streak, an adherence percentage and a month boundary all look like
 * plausible numbers whatever they say, so a screenshot proves nothing
 * about them. These build journeys with dates placed exactly where the
 * edge cases are and check what the selectors make of them.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toDateKey } from '@/lib/date';
import {
  adherencePercent,
  consistencyScore,
  currentStreak,
  dailyCompletion,
  monthlySessionCounts,
  todayProgress,
  weekProgress,
} from '@/store/selectors';
import { EMPTY_DATA, SCHEMA_VERSION, type AppData, type RoutineItem } from '@/types/domain';

/* ------------------------------ fixtures ------------------------------- */

/** Midnight, `ago` days back, in the device's own timezone. */
function daysAgo(ago: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ago);
}

function item(id: string, createdDaysAgo: number): RoutineItem {
  return {
    id,
    journeyId: 'j1',
    label: id,
    cadence: 'daily',
    createdAt: daysAgo(createdDaysAgo).toISOString(),
  };
}

/** A journey that started `startedDaysAgo` back, with the given items. */
function journeyWith(startedDaysAgo: number, items: RoutineItem[]): AppData {
  return {
    ...EMPTY_DATA,
    schemaVersion: SCHEMA_VERSION,
    profile: { id: 'p1', displayName: 'Test', createdAt: daysAgo(startedDaysAgo).toISOString() },
    journey: {
      id: 'j1',
      profileId: 'p1',
      startedAt: daysAgo(startedDaysAgo).toISOString(),
      trackingAreas: ['crown'],
      motivations: [],
      goal: 'fullness',
      triggers: [],
      approaches: [],
      updateIntervalDays: 30,
      createdAt: daysAgo(startedDaysAgo).toISOString(),
    },
    routineItems: items,
  };
}

/** Marks `itemId` done on each of the given days back from today. */
function completeOn(data: AppData, itemId: string, days: number[]): AppData {
  return {
    ...data,
    routineLogs: [
      ...data.routineLogs,
      ...days.map((d) => ({
        id: `log_${itemId}_${d}`,
        routineItemId: itemId,
        date: toDateKey(daysAgo(d)),
        completed: true,
        loggedAt: daysAgo(d).toISOString(),
      })),
    ],
  };
}

/* ------------------------------- streak -------------------------------- */

test('streak: one item finished today is a streak of one', () => {
  const data = completeOn(journeyWith(10, [item('a', 10)]), 'a', [0]);
  assert.equal(currentStreak(data), 1);
});

test('streak: today and yesterday is a streak of two', () => {
  const data = completeOn(journeyWith(10, [item('a', 10)]), 'a', [0, 1]);
  assert.equal(currentStreak(data), 2);
});

test('streak: a missed day ends the run', () => {
  // Done today, yesterday, then a gap, then two more.
  const data = completeOn(journeyWith(10, [item('a', 10)]), 'a', [0, 1, 3, 4]);
  assert.equal(currentStreak(data), 2);
});

test('streak: an unfinished today does not break yesterday’s run', () => {
  // Nothing yet today; the day is not over.
  const data = completeOn(journeyWith(10, [item('a', 10)]), 'a', [1, 2, 3]);
  assert.equal(currentStreak(data), 3);
});

test('streak: every item must be done, not just one', () => {
  const base = journeyWith(10, [item('a', 10), item('b', 10)]);
  const partial = completeOn(base, 'a', [0, 1]);
  assert.equal(currentStreak(partial), 0, 'one of two items is not a completed day');

  const full = completeOn(partial, 'b', [0, 1]);
  assert.equal(currentStreak(full), 2);
});

test('streak: a duplicate log for the same day counts once', () => {
  let data = completeOn(journeyWith(10, [item('a', 10)]), 'a', [0]);
  data = { ...data, routineLogs: [...data.routineLogs, { ...data.routineLogs[0], id: 'dupe' }] };
  assert.equal(currentStreak(data), 1);
});

test('streak: an item added today cannot manufacture yesterday', () => {
  const data = completeOn(journeyWith(10, [item('new', 0)]), 'new', [0]);
  assert.equal(currentStreak(data), 1);
});

/* ----------------------------- adherence ------------------------------- */

test('adherence: no routine items has no percentage to report', () => {
  assert.equal(adherencePercent(journeyWith(10, [])), null);
});

test('adherence: days before the journey began are not counted as missed', () => {
  // Started yesterday, both days done: two of two, not two of thirty.
  const data = completeOn(journeyWith(1, [item('a', 1)]), 'a', [0, 1]);
  assert.equal(adherencePercent(data), 100);
});

test('adherence: half the days done reads as half', () => {
  const data = completeOn(journeyWith(3, [item('a', 3)]), 'a', [0, 2]);
  // Four days exist (today plus three); two are done.
  assert.equal(adherencePercent(data), 50);
});

test('adherence: an item cannot be missed before it existed', () => {
  const data = completeOn(journeyWith(10, [item('late', 1)]), 'late', [0, 1]);
  assert.equal(adherencePercent(data), 100);
});

/* ---------------------------- today / week ----------------------------- */

test('today: counts only what is done today', () => {
  const data = completeOn(journeyWith(5, [item('a', 5), item('b', 5)]), 'a', [0]);
  assert.deepEqual(todayProgress(data), { done: 1, total: 2 });
});

test('week: the grid is seven days and today is inside it', () => {
  const week = weekProgress(completeOn(journeyWith(30, [item('a', 30)]), 'a', [0]));
  assert.equal(week.days.length, 7);
  assert.ok(week.days.some((d) => d.date === toDateKey()), 'today is in this week');
  assert.equal(week.days.find((d) => d.date === toDateKey())?.done, true);
});

/* --------------------------- daily completion -------------------------- */

test('daily completion: the last cell is today, and it is marked', () => {
  const cells = dailyCompletion(completeOn(journeyWith(30, [item('a', 30)]), 'a', [0]), 28);
  assert.equal(cells.length, 28);
  assert.equal(cells[cells.length - 1].isToday, true);
  assert.equal(cells[cells.length - 1].value, 1);
});

test('daily completion: days before the journey report nothing, not zero', () => {
  const cells = dailyCompletion(journeyWith(2, [item('a', 2)]), 28);
  assert.equal(cells[0].value, null, 'a day before the journey has no score to give');
});

/* ----------------------------- month edges ----------------------------- */

test('monthly sessions: a session lands in its own calendar month', () => {
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 12);

  const data: AppData = {
    ...journeyWith(200, [item('a', 200)]),
    sessions: [
      {
        id: 's1',
        journeyId: 'j1',
        capturedAt: firstOfThisMonth.toISOString(),
        isBaseline: true,
        photos: [],
      },
      {
        id: 's2',
        journeyId: 'j1',
        capturedAt: lastOfLastMonth.toISOString(),
        isBaseline: false,
        photos: [],
      },
    ],
  };

  const months = monthlySessionCounts(data, 6);
  assert.equal(months[months.length - 1].value, 1, 'this month holds one');
  assert.equal(months[months.length - 2].value, 1, 'last month holds the other');
});

/* --------------------------- consistency delta ------------------------- */

test('consistency delta: compares this month against the one before it', () => {
  // Perfect for the last 30 days, nothing at all in the 30 before that.
  const recent = Array.from({ length: 30 }, (_, i) => i);
  const data = completeOn(journeyWith(59, [item('a', 59)]), 'a', recent);

  const score = consistencyScore(data);
  const delta = score.delta;
  assert.ok(delta !== null, 'there are two windows to compare');
  assert.ok(
    delta > 0,
    `a month of perfect adherence after a month of none must read as a gain, got ${delta}`,
  );

  // The card labels this "vs last month". Last month was nothing at all,
  // so the routine half of the score moved the whole way: 100 points of
  // adherence at its 0.6 weighting.
  assert.equal(
    delta,
    60,
    `"vs last month" must compare against the previous month alone, got ${delta}`,
  );
});
