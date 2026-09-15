/**
 * Builds a report out of what somebody has actually recorded.
 *
 * Every number here comes from a file on their device: a photograph that
 * exists, a box that was ticked, a date that passed. Nothing is inferred
 * about their hair, and nothing is estimated — if there is not enough
 * recorded to say something, the section says so rather than guessing.
 *
 * ── Why the framing section matters most ──────────────────────────────
 * The comparison slider is the reason to use this app, and it is only as
 * honest as the two photographs feeding it. A set shot at a different
 * distance, or missing the angle you cared about, produces a comparison
 * that shows the change in the photography rather than in the hair. So
 * the framing findings are the ones that actually change what somebody
 * does next month, and they are the ones a vision model will sharpen
 * later — see `visionFindings` at the bottom for where it plugs in.
 */

import {
  activeRoutineItems,
  adherencePercent,
  consistencyScore,
  currentStreak,
  longestStreak,
  sessionsChronological,
} from '@/store/selectors';
import { ANGLES, ANGLE_LABELS, type AppData, type PhotoSession } from '@/types/domain';

import type { Finding, Report, ReportSection } from './types';

const DAY = 86_400_000;

/** Whole months between two dates, floored. */
function monthsBetween(from: string, to: string): number {
  const a = new Date(from), b = new Date(to);
  const months =
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.max(0, b.getDate() < a.getDate() ? months - 1 : months);
}

/** Angles present in a set. */
function anglesIn(session: PhotoSession): Set<string> {
  return new Set(session.photos.map((p) => p.angle));
}

/* ------------------------------- the record ------------------------------ */

function recordSection(data: AppData, sessions: PhotoSession[]): ReportSection {
  const findings: Finding[] = [];
  const latest = sessions[sessions.length - 1];

  if (sessions.length === 0) {
    return {
      kind: 'record',
      title: 'Your record',
      score: null,
      scoreLabel: 'Nothing captured yet',
      findings: [{
        id: 'record-empty',
        kind: 'record',
        tone: 'attention',
        headline: 'There is no baseline yet.',
        detail:
          'Everything in this report is built from your own photographs. The first set is the one every later comparison is measured against, so it is the only thing worth doing today.',
      }],
    };
  }

  const months = monthsBetween(sessions[0].capturedAt, latest.capturedAt);
  findings.push({
    id: 'record-span',
    kind: 'record',
    tone: sessions.length >= 3 ? 'good' : 'neutral',
    headline:
      sessions.length === 1
        ? 'One set recorded — your baseline.'
        : `${sessions.length} sets recorded across ${months === 0 ? 'under a month' : `${months} month${months === 1 ? '' : 's'}`}.`,
    detail:
      sessions.length === 1
        ? 'A baseline on its own cannot show change. The second set is where this becomes a comparison rather than a photograph.'
        : 'Hair moves slowly enough that the useful comparisons are months apart. A record this long is worth more than any single photograph in it.',
  });

  // Angles missing from the most recent set break future comparisons for
  // that angle specifically, which is worth naming rather than scoring.
  const have = anglesIn(latest);
  const missing = ANGLES.filter((a) => !have.has(a));
  if (missing.length > 0) {
    findings.push({
      id: 'record-missing',
      kind: 'record',
      tone: 'attention',
      headline: `Your last set is missing ${missing.length} of the five angles.`,
      detail: `No ${missing.map((a) => ANGLE_LABELS[a]).join(', ')} shot means there is nothing to line up against next time for ${missing.length === 1 ? 'that angle' : 'those angles'}.`,
    });
  } else if (sessions.length > 0) {
    findings.push({
      id: 'record-complete',
      kind: 'record',
      tone: 'good',
      headline: 'Your last set covers all five angles.',
      detail: 'Every angle has something to compare against next month.',
    });
  }

  const coverage = latest.photos.length / ANGLES.length;
  return {
    kind: 'record',
    title: 'Your record',
    score: Math.min(1, coverage),
    scoreLabel: `${latest.photos.length} of ${ANGLES.length} angles in your last set`,
    findings,
  };
}

/* ------------------------------- the routine ----------------------------- */

function routineSection(data: AppData): ReportSection {
  const items = activeRoutineItems(data);
  const findings: Finding[] = [];

  if (items.length === 0) {
    return {
      kind: 'routine',
      title: 'Your routine',
      score: null,
      scoreLabel: 'Nothing in your stack yet',
      findings: [{
        id: 'routine-empty',
        kind: 'routine',
        tone: 'neutral',
        headline: 'Your stack is empty.',
        detail:
          'Adding what you already use is what turns a set of photographs into a record of what you were doing at the time. It is the part that explains the pictures later.',
      }],
    };
  }

  const score = consistencyScore(data);
  const streak = currentStreak(data);
  const best = longestStreak(data);
  const thirty = adherencePercent(data, 30);

  findings.push({
    id: 'routine-adherence',
    kind: 'routine',
    tone: (thirty ?? 0) >= 70 ? 'good' : (thirty ?? 0) >= 40 ? 'neutral' : 'attention',
    headline:
      thirty === null
        ? 'Not enough days recorded to judge the last month.'
        : `You kept to your routine on ${Math.round(thirty)}% of the last 30 days.`,
    detail:
      'This counts days where every item due was ticked. It measures what you did, not whether it worked.',
  });

  if (best > 0) {
    findings.push({
      id: 'routine-streak',
      kind: 'routine',
      tone: streak >= best && streak > 0 ? 'good' : 'neutral',
      headline:
        streak === best && streak > 0
          ? `You are on your longest run yet — ${streak} day${streak === 1 ? '' : 's'}.`
          : `Your best run is ${best} day${best === 1 ? '' : 's'}; you are on ${streak}.`,
      detail:
        'Runs break. The month-level picture above is the one that matters; this is here because it is satisfying, not because it is important.',
    });
  }

  return {
    kind: 'routine',
    title: 'Your routine',
    score: score.value / 100,
    scoreLabel: `${items.length} item${items.length === 1 ? '' : 's'} in your stack`,
    findings,
  };
}

/* ------------------------------- the framing ----------------------------- */

function framingSection(sessions: PhotoSession[]): ReportSection {
  const findings: Finding[] = [];
  if (sessions.length < 2) {
    return {
      kind: 'framing',
      title: 'Your photographs',
      score: null,
      scoreLabel: 'Needs two sets to compare',
      findings: [{
        id: 'framing-early',
        kind: 'framing',
        tone: 'neutral',
        headline: 'Framing is judged between sets, so there is nothing to check yet.',
        detail:
          'Once there are two, this section reports whether they can be honestly compared — same angles, same spacing, taken close enough to the schedule you set.',
      }],
    };
  }

  // Angle-for-angle continuity: an angle you dropped is a comparison you
  // cannot make, and it is the most common reason a slider disappoints.
  const latest = sessions[sessions.length - 1];
  const previous = sessions[sessions.length - 2];
  const nowHave = anglesIn(latest);
  const thenHave = anglesIn(previous);
  const dropped = ANGLES.filter((a) => thenHave.has(a) && !nowHave.has(a));
  const matched = ANGLES.filter((a) => thenHave.has(a) && nowHave.has(a));

  findings.push({
    id: 'framing-matched',
    kind: 'framing',
    tone: dropped.length === 0 ? 'good' : 'attention',
    headline:
      dropped.length === 0
        ? `All ${matched.length} angles line up with your previous set.`
        : `${ANGLE_LABELS[dropped[0]]} is in your previous set but not your latest.`,
    detail:
      dropped.length === 0
        ? 'Each angle has a direct predecessor, which is what the comparison slider needs.'
        : 'An angle without a predecessor cannot be compared. Capturing it next time restores the pair.',
    angle: dropped[0],
  });

  // Spacing. Sets taken very close together show camera noise rather than
  // change; that is worth saying plainly.
  const gapDays = Math.round(
    (new Date(latest.capturedAt).getTime() - new Date(previous.capturedAt).getTime()) / DAY,
  );
  findings.push({
    id: 'framing-gap',
    kind: 'framing',
    tone: gapDays >= 21 ? 'good' : 'neutral',
    headline: `${gapDays} day${gapDays === 1 ? '' : 's'} between your last two sets.`,
    detail:
      gapDays < 21
        ? 'Sets closer together than about three weeks tend to show differences in lighting and styling rather than in hair. There is no harm in it — just read them gently.'
        : 'Far enough apart that a visible difference is more likely to be real than a trick of the light.',
  });

  const score = matched.length / Math.max(1, thenHave.size);
  return {
    kind: 'framing',
    title: 'Your photographs',
    score,
    scoreLabel: `${matched.length} angle${matched.length === 1 ? '' : 's'} comparable with last time`,
    findings,
  };
}

/* -------------------------------- the report ----------------------------- */

function nextStepFor(sessions: PhotoSession[], data: AppData): string {
  if (sessions.length === 0) return 'Take your baseline. Nothing else in here works without it.';
  const latest = sessions[sessions.length - 1];
  const missing = ANGLES.filter((a) => !anglesIn(latest).has(a));
  if (missing.length > 0) {
    return `Add the ${ANGLE_LABELS[missing[0]]} shot next time so it has a pair.`;
  }
  if (sessions.length === 1) return 'Your baseline is complete. The next set is what makes it a comparison.';
  if (activeRoutineItems(data).length === 0) {
    return 'Add what you already use to your stack, so next month’s photographs come with context.';
  }
  return 'Keep to the schedule you set. This report gets more useful with every set you add.';
}

export function buildReport(data: AppData, now = new Date()): Report {
  const sessions = sessionsChronological(data);
  const sections = [
    recordSection(data, sessions),
    framingSection(sessions),
    routineSection(data),
  ];

  return {
    generatedAt: now.toISOString(),
    ready: sessions.length > 0,
    sessionCount: sessions.length,
    monthsSpanned:
      sessions.length > 1
        ? monthsBetween(sessions[0].capturedAt, sessions[sessions.length - 1].capturedAt)
        : 0,
    sections,
    nextStep: nextStepFor(sessions, data),
  };
}
