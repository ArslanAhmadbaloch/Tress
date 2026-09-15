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
import {
  ANGLES,
  ANGLE_LABELS,
  type AppData,
  type Photo,
  type PhotoSession,
} from '@/types/domain';

import { compareCoverage, describeTrend } from './hair-mask';
import { frameHeadline, upperHeadline } from './scan-reading';
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

  // A baseline that carries a hair-area reading is worth saying so about,
  // because it is the number every later set is measured against — and
  // because it is the reading somebody is most likely to go looking for.
  const measured = coveragePhoto(latest);
  if (sessions.length === 1 && measured?.coverage) {
    findings.push({
      id: 'record-coverage',
      kind: 'record',
      tone: 'neutral',
      headline: upperHeadline(measured.coverage),
      detail: `${frameHeadline(measured.coverage)} Measured by the on-device segmenter as area, not thickness. Next month’s ${ANGLE_LABELS[measured.angle].toLowerCase()} shot is lined up against these two numbers.`,
      angle: measured.angle,
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

/**
 * The photograph in a set that carries a hair-area reading.
 *
 * The front shot is preferred because it is the one the funnel captures
 * and the one the hairline sits in; any other measured angle is accepted
 * so a set from before the funnel changed still reads.
 */
function coveragePhoto(session: PhotoSession): Photo | null {
  return (
    session.photos.find((p) => p.angle === 'front' && p.coverage) ??
    session.photos.find((p) => p.coverage) ??
    null
  );
}

/**
 * How the hair-area reading moved between the last two sets, if both
 * carry one for the same angle.
 *
 * The arithmetic lives in hair-mask.ts, along with the two guards that
 * matter: a change inside the noise band is reported as no change, and a
 * pair framed differently enough is refused outright. This only decides
 * which pair to hand it and how to head the result — and the heading is
 * as careful as the detail, because it is the line people read.
 */
function coverageTrendFinding(latest: PhotoSession, previous: PhotoSession): Finding | null {
  const now = coveragePhoto(latest);
  if (!now?.coverage) return null;
  const before = previous.photos.find((p) => p.angle === now.angle && p.coverage);
  if (!before?.coverage) return null;

  const trend = compareCoverage(now.coverage, before.coverage);
  const detail = describeTrend(trend);
  if (!detail) return null;

  return {
    id: 'framing-coverage',
    kind: 'framing',
    tone: trend.framingSuspect ? 'attention' : 'neutral',
    headline: trend.framingSuspect
      ? 'The two hair-area readings were framed too differently to compare.'
      : trend.meaningful
        ? 'The hair-area reading moved measurably between these two sets.'
        : 'No measurable change in hair area between these two sets.',
    detail,
    angle: now.angle,
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

  findings.push(...qualityFindings(latest));

  // Sets from before the segmenter existed carry no reading, and a pair
  // where only one side has one is not a comparison. Nothing is shown.
  const trend = coverageTrendFinding(latest, previous);
  if (trend) findings.push(trend);

  const score = matched.length / Math.max(1, thenHave.size);
  return {
    kind: 'framing',
    title: 'Your photographs',
    score,
    scoreLabel: `${matched.length} angle${matched.length === 1 ? '' : 's'} comparable with last time`,
    findings,
  };
}

/** How each measured problem should be described, and what to do about it. */
const ISSUE_COPY: Record<string, { what: string; fix: string }> = {
  tooDark: {
    what: 'came out dark',
    fix: 'Facing a window usually fixes it, and matching the light matters more than having a lot of it.',
  },
  tooBright: {
    what: 'came out very bright',
    fix: 'Direct sun and overhead spotlights blow out the scalp. Softer, even light holds more detail.',
  },
  clipped: {
    what: 'has burnt-out highlights',
    fix: 'Detail lost that way cannot be recovered later, so it is worth retaking under softer light.',
  },
  blurred: {
    what: 'came out soft',
    fix: 'Bracing the phone against something, or asking somebody else to take it, is usually enough.',
  },
  lowContrast: {
    what: 'is very flat',
    fix: 'Flat light hides the texture the comparison relies on. A little directional light helps.',
  },
};

/**
 * Turns the measurements taken at capture into something to act on.
 *
 * Only the most common problem is raised, and only once. Five bullet
 * points about five photographs is a list somebody closes; one sentence
 * naming the angle and what to do is one they might act on next month.
 */
function qualityFindings(session: PhotoSession): Finding[] {
  const measured = session.photos.filter((p) => p.quality);
  if (measured.length === 0) return [];

  const counts = new Map<string, { n: number; angle: (typeof ANGLES)[number] }>();
  for (const photo of measured) {
    for (const issue of photo.quality?.issues ?? []) {
      const seen = counts.get(issue);
      counts.set(issue, { n: (seen?.n ?? 0) + 1, angle: seen?.angle ?? photo.angle });
    }
  }

  if (counts.size === 0) {
    return [{
      id: 'framing-quality-clean',
      kind: 'framing',
      tone: 'good',
      headline: 'Every shot in your last set was well exposed and sharp.',
      detail:
        'Brightness, contrast and focus were measured on this device when you took them. Nothing needed retaking.',
    }];
  }

  const [issue, { n, angle }] = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  const copy = ISSUE_COPY[issue];
  if (!copy) return [];

  return [{
    id: `framing-quality-${issue}`,
    kind: 'framing',
    tone: 'attention',
    headline:
      n === 1
        ? `Your ${ANGLE_LABELS[angle]} shot ${copy.what}.`
        : `${n} shots in your last set ${copy.what}.`,
    detail: copy.fix,
    angle: n === 1 ? angle : undefined,
  }];
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
