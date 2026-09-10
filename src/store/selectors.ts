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
export function adherencePercent(data: AppData, windowDays = 30): number | null {
  const items = activeRoutineItems(data);
  if (!data.journey || items.length === 0) return null;

  const elapsed = daysBetween(data.journey.startedAt) + 1;
  const days = Math.max(1, Math.min(windowDays, elapsed));

  let expected = 0;
  let completed = 0;
  const today = new Date();

  for (let offset = 0; offset < days; offset += 1) {
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
