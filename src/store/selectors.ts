/**
 * Derived reads over AppData.
 *
 * Pure functions, so the dashboard, journey and routine screens all
 * agree on what "adherence" or "next update" means.
 */

import { addDays, daysBetween, toDateKey } from '@/lib/date';
import type { AppData, PhotoSession, RoutineItem } from '@/types/domain';

export function activeRoutineItems(data: AppData): RoutineItem[] {
  return data.routineItems.filter((item) => !item.archivedAt);
}

/** Items ticked off for a given local day. */
export function completedOn(data: AppData, date: string): Set<string> {
  const done = new Set<string>();
  for (const log of data.routineLogs) {
    if (log.date === date && log.completed) done.add(log.routineItemId);
  }
  return done;
}

export function todayProgress(data: AppData): { done: number; total: number } {
  const items = activeRoutineItems(data);
  const done = completedOn(data, toDateKey());
  return {
    done: items.filter((item) => done.has(item.id)).length,
    total: items.length,
  };
}

/**
 * Adherence over a trailing window, as a 0-100 integer.
 *
 * Only days on or after the journey start count, and the window never
 * extends past today — otherwise a brand-new journey would show a
 * misleadingly low number against days that never existed.
 */
export function adherencePercent(
  data: AppData,
  windowDays = 30,
  /**
   * How many days back the window ends. Zero is the window ending today;
   * 30 is the month before that. Without this the only way to ask about a
   * previous period was to widen the window, which returns a figure that
   * still contains the current one.
   */
  endingDaysAgo = 0,
): number | null {
  const items = activeRoutineItems(data);
  if (!data.journey || items.length === 0) return null;

  const elapsed = daysBetween(data.journey.startedAt) + 1 - endingDaysAgo;
  if (elapsed <= 0) return null;
  const days = Math.max(1, Math.min(windowDays, elapsed));

  let expected = 0;
  let completed = 0;
  const today = new Date();

  for (let i = 0; i < days; i += 1) {
    const offset = i + endingDaysAgo;
    const day = new Date(today);
    day.setDate(day.getDate() - offset);
    const key = toDateKey(day);

    const doneThatDay = completedOn(data, key);
    for (const item of items) {
      // An item can't be missed before it existed.
      if (daysBetween(item.createdAt, day.toISOString()) < 0) continue;
      expected += 1;
      if (doneThatDay.has(item.id)) completed += 1;
    }
  }

  if (expected === 0) return null;
  return Math.round((completed / expected) * 100);
}

/** Consecutive days, ending today or yesterday, with everything ticked. */
export function currentStreak(data: AppData): number {
  const items = activeRoutineItems(data);
  if (items.length === 0) return 0;

  let streak = 0;
  const cursor = new Date();

  // Allow today to be incomplete without breaking a streak that was
  // intact yesterday — the day isn't over yet.
  for (let offset = 0; offset < 400; offset += 1) {
    const key = toDateKey(cursor);
    const done = completedOn(data, key);
    const applicable = items.filter(
      (item) => daysBetween(item.createdAt, cursor.toISOString()) >= 0,
    );

    const allDone =
      applicable.length > 0 && applicable.every((item) => done.has(item.id));

    if (allDone) {
      streak += 1;
    } else if (offset > 0) {
      break;
    } else if (streak === 0 && offset === 0) {
      // Today not finished yet; keep looking back from yesterday.
    }

    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function latestSession(data: AppData): PhotoSession | null {
  return data.sessions[0] ?? null;
}

export function baselineSession(data: AppData): PhotoSession | null {
  if (data.sessions.length === 0) return null;
  return data.sessions[data.sessions.length - 1];
}

/** Sessions oldest-first, for timeline rendering. */
export function sessionsChronological(data: AppData): PhotoSession[] {
  return [...data.sessions].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );
}

export type NextUpdate = {
  dueISO: string;
  /** Negative when overdue. */
  daysUntil: number;
  isOverdue: boolean;
};

export function nextUpdate(data: AppData): NextUpdate | null {
  if (!data.journey) return null;

  const last = latestSession(data);
  const from = last?.capturedAt ?? data.journey.startedAt;
  const dueISO = addDays(from, data.journey.updateIntervalDays);
  const daysUntil = -daysBetween(dueISO);

  return { dueISO, daysUntil, isOverdue: daysUntil < 0 };
}

export function hasJourney(data: AppData): boolean {
  return Boolean(data.journey && data.onboardingCompletedAt);
}

/* ------------------------------------------------------------------ *
 * Consistency score
 *
 * Deliberately NOT a "hair score". Nothing in this app measures hair —
 * it stores photographs and lets you compare them — so a number claiming
 * to rate your hair would be invented, and would read as a clinical
 * assessment the product is not entitled to make.
 *
 * What it does score is the thing the user actually controls and the app
 * genuinely observes: how consistently they are documenting. That is also
 * the variable that determines whether their timeline will be worth
 * anything in six months.
 * ------------------------------------------------------------------ */

export type ConsistencyScore = {
  /** 0-100. */
  value: number;
  /** Change against the previous 30-day window, in points. */
  delta: number | null;
  /** The two inputs, so the UI can explain the number honestly. */
  routine: number | null;
  capture: number;
};

/** How punctual photo sessions have been, as a 0-100 figure. */
function capturePunctuality(data: AppData): number {
  if (!data.journey) return 0;
  if (data.sessions.length === 0) return 0;

  const elapsed = daysBetween(data.journey.startedAt) + 1;
  const interval = Math.max(1, data.journey.updateIntervalDays);

  // One session is expected per interval, plus the baseline.
  const expected = Math.max(1, Math.floor(elapsed / interval) + 1);
  const ratio = data.sessions.length / expected;

  // Capturing more often than asked is fine, but does not score above 100.
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
}

export function consistencyScore(data: AppData): ConsistencyScore {
  const routine = adherencePercent(data, 30);
  const capture = capturePunctuality(data);

  // With no routine recorded, the score is simply how well the user is
  // keeping up with photographs — rather than penalising them for not
  // using a feature they chose not to use.
  const value =
    routine === null
      ? capture
      : Math.round(routine * 0.6 + capture * 0.4);

  // The month before this one, not the two months containing it: a
  // sixty-day window still holds the thirty days being compared against,
  // so it can only ever report half the movement that actually happened.
  const previousRoutine = adherencePercent(data, 30, 30);
  const delta =
    routine === null || previousRoutine === null
      ? null
      : Math.round((routine - previousRoutine) * 0.6);

  return { value, delta, routine, capture };
}

/** Completion for the current week, for the Home checklist. */
export function weekProgress(data: AppData): {
  done: number;
  total: number;
  days: { date: string; done: boolean; partial: boolean }[];
} {
  const items = activeRoutineItems(data);
  const days: { date: string; done: boolean; partial: boolean }[] = [];

  const today = new Date();
  // Monday-first week containing today.
  const weekday = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - weekday);

  let done = 0;

  for (let i = 0; i < 7; i += 1) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const key = toDateKey(day);
    const completed = completedOn(data, key);

    const applicable = items.filter(
      (item) => daysBetween(item.createdAt, day.toISOString()) >= 0,
    );
    const hit = applicable.filter((item) => completed.has(item.id)).length;

    const isDone = applicable.length > 0 && hit === applicable.length;
    if (isDone) done += 1;

    days.push({ date: key, done: isDone, partial: hit > 0 && !isDone });
  }

  return { done, total: 7, days };
}

/**
 * Trailing weekly adherence, oldest first, for the dashboard sparklines.
 *
 * Real history rather than decoration: each point is that week's completion
 * rate. Weeks before the journey started are omitted rather than plotted as
 * zero, which would draw a fake collapse at the left edge of every new
 * user's chart.
 */
export function weeklyAdherenceHistory(data: AppData, weeks = 8): number[] {
  const items = activeRoutineItems(data);
  if (!data.journey || items.length === 0) return [];

  const series: number[] = [];
  const today = new Date();

  for (let w = weeks - 1; w >= 0; w -= 1) {
    let expected = 0;
    let completed = 0;

    for (let d = 0; d < 7; d += 1) {
      const day = new Date(today);
      day.setDate(today.getDate() - (w * 7 + d));

      if (daysBetween(data.journey.startedAt, day.toISOString()) < 0) continue;
      if (daysBetween(day.toISOString()) < 0) continue;

      const done = completedOn(data, toDateKey(day));
      for (const item of items) {
        if (daysBetween(item.createdAt, day.toISOString()) < 0) continue;
        expected += 1;
        if (done.has(item.id)) completed += 1;
      }
    }

    if (expected > 0) series.push(Math.round((completed / expected) * 100));
  }

  return series;
}

/** Cumulative photo-session count per week, oldest first. */
export function sessionHistory(data: AppData, weeks = 8): number[] {
  if (!data.journey || data.sessions.length === 0) return [];

  const series: number[] = [];
  const today = new Date();

  for (let w = weeks - 1; w >= 0; w -= 1) {
    const cutoff = new Date(today);
    cutoff.setDate(today.getDate() - w * 7);

    if (daysBetween(data.journey.startedAt, cutoff.toISOString()) < 0) continue;

    const count = data.sessions.filter(
      (s) => new Date(s.capturedAt).getTime() <= cutoff.getTime(),
    ).length;
    series.push(count);
  }

  return series;
}

export type MonthPoint = {
  key: string;
  /** Short month name, e.g. "Jan". */
  label: string;
  /** Routine adherence for the month, 0-100; null before tracking began. */
  value: number | null;
};

/**
 * Routine adherence per calendar month, oldest first, for the Journey
 * chart. Months before the journey (or before any routine item existed)
 * are null rather than zero, so a new user's chart does not draw a fake
 * collapse at the start.
 */
export function monthlyAdherenceHistory(data: AppData, months = 6): MonthPoint[] {
  const items = activeRoutineItems(data);
  const now = new Date();
  const out: MonthPoint[] = [];

  for (let m = months - 1; m >= 0; m -= 1) {
    const first = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const last = new Date(now.getFullYear(), now.getMonth() - m + 1, 0);

    let expected = 0;
    let completed = 0;

    if (data.journey && items.length > 0) {
      for (let day = new Date(first); day <= last; day.setDate(day.getDate() + 1)) {
        const iso = day.toISOString();
        if (daysBetween(iso) < 0) break; // the future
        if (daysBetween(data.journey.startedAt, iso) < 0) continue;

        const done = completedOn(data, toDateKey(day));
        for (const item of items) {
          if (daysBetween(item.createdAt, iso) < 0) continue;
          expected += 1;
          if (done.has(item.id)) completed += 1;
        }
      }
    }

    out.push({
      key: `${first.getFullYear()}-${first.getMonth()}`,
      label: first.toLocaleDateString(undefined, { month: 'short' }),
      value: expected > 0 ? Math.round((completed / expected) * 100) : null,
    });
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Measurement series for the Journey charts. Every value is something
 * the app records directly; nothing here estimates hair.
 * ------------------------------------------------------------------ */

export type SeriesPoint = { key: string; label: string; value: number | null };

function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const shortDay = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Routine adherence per Monday-first week, oldest first; null before tracking. */
export function weeklyAdherenceSeries(data: AppData, weeks = 8): SeriesPoint[] {
  const items = activeRoutineItems(data);
  const thisMonday = mondayOf(new Date());
  const out: SeriesPoint[] = [];

  for (let w = weeks - 1; w >= 0; w -= 1) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - w * 7);
    let expected = 0;
    let completed = 0;

    if (data.journey && items.length > 0) {
      for (let d = 0; d < 7; d += 1) {
        const day = new Date(start);
        day.setDate(start.getDate() + d);
        const iso = day.toISOString();
        if (daysBetween(iso) < 0) break; // the future
        if (daysBetween(data.journey.startedAt, iso) < 0) continue;

        const done = completedOn(data, toDateKey(day));
        for (const item of items) {
          if (daysBetween(item.createdAt, iso) < 0) continue;
          expected += 1;
          if (done.has(item.id)) completed += 1;
        }
      }
    }

    out.push({
      key: toDateKey(start),
      label: shortDay(start),
      value: expected > 0 ? Math.round((completed / expected) * 100) : null,
    });
  }
  return out;
}

/** Photo sessions captured in each calendar month, oldest first. */
export function monthlySessionCounts(data: AppData, months = 6): SeriesPoint[] {
  const now = new Date();
  const out: SeriesPoint[] = [];
  for (let m = months - 1; m >= 0; m -= 1) {
    const first = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    const count = data.sessions.filter((s) => {
      const t = new Date(s.capturedAt);
      return t >= first && t < next;
    }).length;
    out.push({
      key: `${first.getFullYear()}-${first.getMonth()}`,
      label: first.toLocaleDateString(undefined, { month: 'short' }),
      value: count,
    });
  }
  return out;
}

/** Journal entries written in each Monday-first week, oldest first. */
export function weeklyJournalCounts(data: AppData, weeks = 8): SeriesPoint[] {
  const thisMonday = mondayOf(new Date());
  const out: SeriesPoint[] = [];
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - w * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const count = data.journal.filter((e) => {
      const t = new Date(e.createdAt);
      return t >= start && t < end;
    }).length;
    out.push({ key: toDateKey(start), label: shortDay(start), value: count });
  }
  return out;
}

export type DayCell = { key: string; value: number | null; isToday: boolean };

/**
 * Share of the stack completed on each of the last `days` days, oldest
 * first: 0-1, or null where nothing applied (before tracking began).
 */
export function dailyCompletion(data: AppData, days = 28): DayCell[] {
  const items = activeRoutineItems(data);
  const today = new Date();
  const todayKey = toDateKey(today);
  const out: DayCell[] = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = toDateKey(day);
    const iso = day.toISOString();
    let value: number | null = null;

    if (data.journey && daysBetween(data.journey.startedAt, iso) >= 0) {
      const applicable = items.filter((item) => daysBetween(item.createdAt, iso) >= 0);
      if (applicable.length > 0) {
        const done = completedOn(data, key);
        value = applicable.filter((item) => done.has(item.id)).length / applicable.length;
      }
    }
    out.push({ key, value, isToday: key === todayKey });
  }
  return out;
}
