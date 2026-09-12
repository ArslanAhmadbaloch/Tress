/**
 * Date helpers.
 *
 * Journey duration drives most of the UI copy, so it lives in one place
 * and is derived from real dates — never hard-coded intervals.
 */

const MS_PER_DAY = 86_400_000;

/** Local calendar day as YYYY-MM-DD. Used as the routine-log key. */
export function toDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysBetween(fromISO: string, toISO: string = new Date().toISOString()): number {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  // Compare calendar days, not elapsed milliseconds, so a session taken
  // late at night doesn't read as a day older than it is.
  const fromDay = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toDay - fromDay) / MS_PER_DAY);
}

/** Whole months elapsed, counting partial months down. */
export function monthsBetween(fromISO: string, toISO: string = new Date().toISOString()): number {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Human duration for a point in the journey: "Day 1", "3 weeks",
 * "5 months", "1 year 2 months".
 */
export function formatDuration(startISO: string, atISO: string = new Date().toISOString()): string {
  const days = daysBetween(startISO, atISO);

  if (days <= 0) return 'Day 1';
  if (days < 7) return `Day ${days + 1}`;
  if (days < 31) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  }

  const months = monthsBetween(startISO, atISO);
  if (months < 12) return months === 1 ? '1 month' : `${months} months`;

  const years = Math.floor(months / 12);
  const rem = months % 12;
  const yearPart = years === 1 ? '1 year' : `${years} years`;
  if (rem === 0) return yearPart;
  return `${yearPart} ${rem} ${rem === 1 ? 'month' : 'months'}`;
}

/**
 * Duration abbreviated to fit a narrow stat tile: "2 mo", "3 wk", "1y 2mo".
 * The long form wraps mid-word in a one-third-width tile.
 */
export function formatDurationCompact(
  startISO: string,
  atISO: string = new Date().toISOString(),
): string {
  const days = daysBetween(startISO, atISO);

  if (days <= 0) return 'Day 1';
  if (days < 7) return `${days + 1}d`;
  if (days < 31) return `${Math.floor(days / 7)}wk`;

  const months = monthsBetween(startISO, atISO);
  if (months < 12) return `${months}mo`;

  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${years}y` : `${years}y ${rem}mo`;
}

/**
 * Short timeline marker: "Baseline", "Month 3", "Year 1".
 *
 * `isBaseline` is the session's own flag, not something inferred from the
 * date. A second set taken the same day as the first is still day one, and
 * calling it "Baseline" too puts the same label on both halves of a
 * comparison — which reads as a rendering fault rather than as two
 * captures, and is simply untrue of the later one.
 */
export function formatMilestone(
  startISO: string,
  atISO: string,
  isBaseline: boolean,
): string {
  const days = daysBetween(startISO, atISO);
  if (isBaseline) return 'Baseline';
  if (days <= 0) return 'Day 1';

  const months = monthsBetween(startISO, atISO);
  if (months === 0) {
    const weeks = Math.floor(days / 7);
    return weeks === 0 ? `Day ${days + 1}` : `Week ${weeks}`;
  }
  if (months < 12) return `Month ${months}`;

  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `Year ${years}` : `Year ${years} · Month ${rem}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/** "5 days ago", "today", "in 12 days". */
export function formatRelative(iso: string): string {
  const days = daysBetween(iso);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days > 0) return `${days} days ago`;
  const ahead = Math.abs(days);
  return ahead === 1 ? 'tomorrow' : `in ${ahead} days`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
