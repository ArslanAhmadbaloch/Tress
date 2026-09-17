/**
 * Ask Tress — every answer it can give.
 *
 * An answer is a template filled from AppData through the selectors and
 * engine functions the rest of the app already uses, so the number the
 * coach says is the number Home and Report say. Nothing here reads a
 * head: every sentence describes a tick, a photograph, a date, or how
 * the reading was made.
 *
 * ── Two channels ──────────────────────────────────────────────────────
 * Template text is swept by the tests for outcome claims, advice,
 * flattery and urgency. The person's own words — journal bodies, routine
 * labels, the onboarding answers they chose — carry words the sweep would
 * reject ("More density at the crown"), so they are shown back only
 * through `echo`, rendered as a visible quotation and excluded from the
 * sweep. A template never adopts a label as its own claim; it names it.
 *
 * Pure: no React, no React Native, no expo. `node --test` loads it the
 * way it loads engine.ts.
 */

import { coveragePhoto, coverageTrendFinding } from '@/features/assessment/engine';
import { compareCoverage, type CoverageTrend } from '@/features/assessment/hair-mask';
import { buildScanReading } from '@/features/assessment/scan-reading';
import { daysBetween, formatDate, formatDuration, formatRelative, toDateKey } from '@/lib/date';
import {
  activeRoutineItems,
  adherencePercent,
  completedOn,
  currentStreak,
  dailyRoutineItems,
  longestStreak,
  nextUpdate,
  routineItemStats,
  sessionLabel,
  sessionsChronological,
  todayProgress,
  type RoutineItemStat,
} from '@/store/selectors';
import {
  ANGLES,
  ANGLE_LABELS,
  APPROACH_LABELS,
  HAIR_GOAL_LABELS,
  joinPhrases,
  journeyGoals,
  midSentence,
  missingAngles,
  SELF_CONSISTENCY_LABELS,
  TRACKING_AREA_LABELS,
  type AppData,
  type Journey,
  type JournalEntry,
  type PhotoSession,
} from '@/types/domain';

import {
  REFUSAL_INTENTS,
  type Chip,
  type CoachAction,
  type CoachAnswer,
  type CoachIntent,
  type IntentMatch,
} from './types';

/* --------------------------------- copy ---------------------------------- */

export const WELCOME_MUTED = 'Ask about your record.';
export const WELCOME_FALLBACK_TITLE = 'Hello.';
export const ASK_BAR_PLACEHOLDER = 'Ask Tress about your record…';
export const COMPOSER_PLACEHOLDER = 'Ask about your record…';

/** The base order; `suggestedQuestions` reorders by what the record holds. */
export const CHIPS: readonly Chip[] = [
  { label: 'What did my last scan say?', intent: 'lastScan' },
  { label: 'How consistent have I been?', intent: 'consistency' },
  { label: 'When is my next scan due?', intent: 'nextSet' },
  { label: 'What changed between my last two scans?', intent: 'compare' },
  { label: 'What should I keep the same next photo?', intent: 'keepSame' },
  { label: 'What does area mean?', intent: 'areaMeaning' },
  { label: 'How many scans have I taken?', intent: 'record' },
  { label: "What's in my stack?", intent: 'stack' },
  { label: "What's my streak?", intent: 'streak' },
  { label: 'What did I write last?', intent: 'journal' },
  { label: 'What did I say at the start?', intent: 'goals' },
  { label: 'Where do my photos go?', intent: 'privacy' },
];

export function welcomeTitle(displayName: string | undefined): string {
  const name = displayName?.trim();
  return name ? `${name}.` : WELCOME_FALLBACK_TITLE;
}

/* -------------------------------- helpers -------------------------------- */

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Cut at the last space before `max` so a quotation never ends mid-word. */
function truncate(s: string, max = 140): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const cut = head.lastIndexOf(' ');
  return `${cut > 0 ? head.slice(0, cut) : head}…`;
}

/**
 * A YYYY-MM-DD log key parsed at local noon, so `formatRelative` cannot
 * slip a day across timezones the way a bare date string parsed as UTC
 * midnight would.
 */
function dateKeyNoon(key: string): string {
  return `${key}T12:00:00`;
}

function latestJournal(data: AppData): JournalEntry | undefined {
  return [...data.journal].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )[0];
}

const OPEN_ROUTINE: CoachAction = { label: 'Open routine', href: '/routine' };
// Both open the hair scan, which is the one way a session is made now.
const FIRST_PHOTO: CoachAction = { label: 'Scan your hair', href: '/hair-scan' };
const NEXT_SET: CoachAction = { label: 'Scan again', href: '/hair-scan' };
const COMPARE: CoachAction = { label: 'Compare photographs', href: '/compare' };

/** The refusals carry nothing from the record: no number, no label, no action. */
function refusal(intent: CoachIntent, headline: string, detail: string): CoachAnswer {
  return { intent, source: 'Outside your record', headline, detail, refusal: true };
}

/* ------------------------------- the routine ----------------------------- */

function consistencyAnswer(data: AppData, journey: Journey): CoachAnswer {
  const intent: CoachIntent = 'consistency';
  const source = 'From your routine';
  const items = activeRoutineItems(data);
  if (items.length === 0) {
    return {
      intent,
      source,
      headline: 'There is nothing in your stack yet, so there is no routine to be consistent with.',
      detail: 'Add what you already use and the ticks start counting from that day.',
      action: OPEN_ROUTINE,
      refusal: false,
    };
  }

  const stats = routineItemStats(data);
  if (stats.every((s) => s.adherence === null)) {
    return {
      intent,
      source,
      headline: 'Your stack started today, so there is nothing to average yet.',
      detail: 'Today counts once it is ticked.',
      refusal: false,
    };
  }

  const pct = adherencePercent(data, 30);
  if (pct === null) {
    return {
      intent,
      source,
      headline: 'Not enough days recorded to judge the last month.',
      detail: 'Ticks are counted from the day each item was added.',
      refusal: false,
    };
  }

  const days = Math.max(1, Math.min(30, daysBetween(journey.startedAt) + 1));
  const streak = currentStreak(data);
  const best = longestStreak(data);

  const run =
    streak > 0
      ? `You are on a ${streak}-day run; your longest is ${best}.`
      : best > 0
        ? `The run is at zero; your longest was ${best} days.`
        : 'No day has been fully ticked yet.';

  // Which item is dropped most is the useful half of "how consistent";
  // it only means something once two items have a figure to compare.
  // "Ticked least often" is a question about days, so it is ranked and
  // reported on `daysDonePercent`. Ranking on `adherence` would put a
  // daily item ticked on 25 of 30 days below a twice-weekly one ticked
  // on 8 — true about pace, false about days, and this sentence says days.
  const measured = stats.filter((s) => s.daysDonePercent !== null);
  let weakest: RoutineItemStat | null = null;
  if (stats.length > 1 && measured.length >= 2) {
    // Stats are oldest-first, so a strict comparison keeps the earliest of a tie.
    for (const s of measured) {
      if (
        weakest === null ||
        (s.daysDonePercent as number) < (weakest.daysDonePercent as number)
      )
        weakest = s;
    }
  }
  const detail = weakest
    ? `${run} ${weakest.item.label} is the one ticked least often, on ${weakest.daysDonePercent}% of its days.`
    : run;

  return {
    intent,
    source: days === 1 ? `${source} · today` : `${source} · last ${days} days`,
    headline:
      days === 1
        ? `You ticked off ${pct}% of what was due today.`
        : `You ticked off ${pct}% of what was due over the last ${days} days.`,
    detail,
    ...(journey.selfConsistency
      ? {
          echoLabel: 'You said at the start',
          echo: [SELF_CONSISTENCY_LABELS[journey.selfConsistency]],
        }
      : {}),
    figure: { kind: 'ring', value: pct / 100, label: 'of days ticked' },
    refusal: false,
  };
}

function streakAnswer(data: AppData): CoachAnswer {
  const intent: CoachIntent = 'streak';
  const source = 'From your routine';
  const items = activeRoutineItems(data);

  if (dailyRoutineItems(data).length === 0) {
    return {
      intent,
      source,
      headline: 'A run counts the items you do every day, and there are none in your stack.',
      detail:
        items.length > 0
          ? 'Weekly items are counted in the month figure instead.'
          : 'Add what you already use and the run starts from the first full day.',
      ...(items.length === 0 ? { action: OPEN_ROUTINE } : {}),
      refusal: false,
    };
  }

  const streak = currentStreak(data);
  const best = longestStreak(data);

  if (streak > 0) {
    const today = todayProgress(data);
    const todayDone = today.total > 0 && today.done === today.total;
    return {
      intent,
      source,
      headline: `${streak} ${plural(streak, 'day', 'days')} in a row.`,
      detail: `${
        streak === best ? 'This is your longest run yet.' : `Your longest run is ${best} days.`
      } ${todayDone ? 'Today is ticked.' : 'Today is not fully ticked yet; the run holds until tomorrow.'}`,
      refusal: false,
    };
  }

  return {
    intent,
    source,
    headline: 'The run is at zero.',
    detail:
      best > 0
        ? `Your longest run was ${best} days. It starts again on the next fully ticked day.`
        : 'It starts on the first day every daily item is ticked.',
    refusal: false,
  };
}

function itemAdherenceAnswer(data: AppData, itemId: string | undefined): CoachAnswer {
  const stat = routineItemStats(data).find((s) => s.item.id === itemId);
  if (!stat) return stackAnswer(data);

  const intent: CoachIntent = 'itemAdherence';
  const source = 'From your routine';
  const { item } = stat;

  if (stat.adherence === null) {
    return {
      intent,
      source,
      headline: `${item.label} was added today.`,
      detail: 'It counts from the first tick.',
      refusal: false,
    };
  }

  const tick =
    stat.streak > 0
      ? `Ticked ${stat.streak} ${plural(stat.streak, 'day', 'days')} running.`
      : stat.lastDone
        ? `Last ticked ${formatRelative(dateKeyNoon(stat.lastDone))}.`
        : 'Not ticked yet.';
  const today = completedOn(data, toDateKey()).has(item.id)
    ? 'Ticked today.'
    : 'Not ticked today yet.';

  return {
    intent,
    source,
    // A share of days, so `daysDonePercent` — not `adherence`, which is a
    // share of what the item's cadence asked for. Null in the same case,
    // so the guard above still covers it.
    headline: `${item.label} since ${formatDate(item.createdAt)} — ticked on ${stat.daysDonePercent}% of its days.`,
    detail: `${tick} ${today}`,
    refusal: false,
  };
}

function stackAnswer(data: AppData): CoachAnswer {
  const intent: CoachIntent = 'stack';
  const source = 'From your routine';
  const stats = routineItemStats(data);

  if (stats.length === 0) {
    return {
      intent,
      source,
      headline: 'Your stack is empty.',
      detail: 'Add what you already use; the app records it and never suggests anything.',
      action: OPEN_ROUTINE,
      refusal: false,
    };
  }

  const first = stats[0].item.createdAt;
  const last = stats[stats.length - 1].item.createdAt;
  return {
    intent,
    source,
    headline: `${stats.length} ${plural(stats.length, 'item', 'items')} in your stack.`,
    detail:
      stats.length === 1
        ? `Added ${formatDate(first)}.`
        : `Added between ${formatDate(first)} and ${formatDate(last)}.`,
    echoLabel: 'As you entered them',
    echo: stats.map((s) => s.item.label),
    refusal: false,
  };
}

/* ----------------------------- the photographs --------------------------- */

function lastScanAnswer(journey: Journey, chrono: PhotoSession[]): CoachAnswer {
  const intent: CoachIntent = 'lastScan';
  const latest = chrono[chrono.length - 1];
  const reading = latest ? buildScanReading(latest) : null;

  if (!latest || !reading) {
    return {
      intent,
      source: 'From your photographs',
      headline: 'There is no scan yet.',
      detail: 'The first photograph is what everything after it is measured against.',
      action: FIRST_PHOTO,
      refusal: false,
    };
  }

  const { photo } = reading;
  const shot = `From your ${sessionLabel(journey.startedAt, latest)} ${ANGLE_LABELS[photo.angle]} shot`;

  // A photograph from before the device measured anything carries no
  // reading, and nothing is re-read after the fact.
  if (!photo.quality && !photo.coverage) {
    return {
      intent,
      source: shot,
      headline: 'Your last scan carries no reading.',
      detail:
        'It was photographed before the device measured anything, and nothing is re-read after the fact.',
      action: NEXT_SET,
      refusal: false,
    };
  }

  const hasRings = reading.rings.length > 0;
  const detail = [
    reading.rings[0]?.headline,
    ...reading.tiles.map((t) => t.headline),
    hasRings ? 'Area is not thickness.' : reading.coverageAbsent?.detail,
  ]
    .filter((line): line is string => Boolean(line))
    .join(' ');

  return {
    intent,
    source: `${shot} · ${formatRelative(photo.capturedAt)}`,
    headline: hasRings
      ? reading.rings[1].headline
      : `${reading.coverageAbsent?.headline ?? ''}.`,
    detail,
    refusal: false,
  };
}

function nextSetAnswer(data: AppData, journey: Journey, chrono: PhotoSession[]): CoachAnswer {
  const intent: CoachIntent = 'nextSet';
  const source = 'From your schedule';
  const n = journey.updateIntervalDays;
  const latest = chrono[chrono.length - 1];
  const due = nextUpdate(data);

  if (!latest || !due) {
    return {
      intent,
      source,
      headline: 'Nothing is due until there is a first scan.',
      detail: `You set updates every ${n} days; the count starts from the first photograph.`,
      action: FIRST_PHOTO,
      refusal: false,
    };
  }

  const label = sessionLabel(journey.startedAt, latest);

  if (due.isOverdue) {
    return {
      intent,
      source,
      headline: `Your next scan was due ${formatRelative(due.dueISO)}.`,
      detail: `Every ${n} days, counted from ${label}, taken ${formatRelative(latest.capturedAt)}. The gap is recorded as it is.`,
      action: NEXT_SET,
      refusal: false,
    };
  }

  if (due.daysUntil === 0) {
    return {
      intent,
      source,
      headline: 'Your next scan is due today.',
      detail: `Every ${n} days, counted from ${label}.`,
      action: NEXT_SET,
      refusal: false,
    };
  }

  return {
    intent,
    source,
    headline: `Your next scan is due ${formatRelative(due.dueISO)}, on ${formatDate(due.dueISO)}.`,
    detail: `Every ${n} days, counted from ${label}.`,
    refusal: false,
  };
}

/**
 * The same pair the engine hands to `compareCoverage`, so the coach can
 * tell which of the engine's three headings it is looking at without
 * parsing the heading.
 */
function trendBetween(latest: PhotoSession, previous: PhotoSession): CoverageTrend | null {
  const now = coveragePhoto(latest);
  if (!now?.coverage) return null;
  const before = previous.photos.find((p) => p.angle === now.angle && p.coverage);
  if (!before?.coverage) return null;
  return compareCoverage(now.coverage, before.coverage);
}

function compareAnswer(journey: Journey, chrono: PhotoSession[]): CoachAnswer {
  const intent: CoachIntent = 'compare';

  if (chrono.length === 0) {
    return {
      intent,
      source: 'From your photographs',
      headline: 'There is no scan yet, so there is nothing to compare.',
      detail: 'The first scan is what every later one is measured against.',
      action: FIRST_PHOTO,
      refusal: false,
    };
  }
  if (chrono.length === 1) {
    return {
      intent,
      source: 'From your photographs',
      headline: 'There is only one scan, so there is nothing to compare yet.',
      detail: 'The second scan is where a comparison starts.',
      action: NEXT_SET,
      refusal: false,
    };
  }

  const latest = chrono[chrono.length - 1];
  const previous = chrono[chrono.length - 2];
  const label = (s: PhotoSession) => sessionLabel(journey.startedAt, s);
  const gap = daysBetween(previous.capturedAt, latest.capturedAt);
  const finding = coverageTrendFinding(latest, previous);

  if (finding === null) {
    const thenHave = new Set(previous.photos.map((p) => p.angle));
    const nowHave = new Set(latest.photos.map((p) => p.angle));
    const dropped = ANGLES.filter((a) => thenHave.has(a) && !nowHave.has(a));
    const matched = ANGLES.filter((a) => thenHave.has(a) && nowHave.has(a));
    return {
      intent,
      source: `From your ${label(previous)} and ${label(latest)} scans · ${gap} days apart`,
      headline:
        'There is no area reading on both scans for the same angle, so there is no number to set side by side.',
      detail:
        dropped.length === 0
          ? `All ${matched.length} angles line up with your previous scan, so the photographs can be compared by eye.`
          : `${ANGLE_LABELS[dropped[0]]} is in your previous scan but not your latest, so that pair cannot be lined up.`,
      action: COMPARE,
      refusal: false,
    };
  }

  // Inside the noise band the engine's detail opens with the headline's
  // own words, so the person would read "no measurable change" twice.
  const trend = trendBetween(latest, previous);
  const detail =
    !trend || trend.framingSuspect || trend.meaningful
      ? finding.detail
      : 'Over a single month that is the usual and expected result. Area is not thickness, and it moves with haircuts and styling too.';

  return {
    intent,
    source: `From your ${label(previous)} and ${label(latest)} ${
      finding.angle ? ANGLE_LABELS[finding.angle] : ''
    } shots · ${gap} days apart`,
    headline: finding.headline,
    detail,
    action: COMPARE,
    refusal: false,
  };
}

function keepSameAnswer(journey: Journey, chrono: PhotoSession[]): CoachAnswer {
  const intent: CoachIntent = 'keepSame';
  const latest = chrono[chrono.length - 1];
  const reading = latest ? buildScanReading(latest) : null;

  if (!latest || !reading) {
    return {
      intent,
      source: 'From the capture guide',
      headline: 'Same spot, same time of day, same distance from the phone.',
      detail: 'Those three are what make the second photograph comparable with the first.',
      refusal: false,
    };
  }

  const lines = reading.nextTime;
  return {
    intent,
    source: `From your ${sessionLabel(journey.startedAt, latest)} ${ANGLE_LABELS[reading.photo.angle]} shot`,
    headline: lines[0],
    detail:
      lines.length > 1
        ? lines.slice(1).join(' ')
        : 'Nothing in your last scan needed a fix; matching it is the whole job.',
    refusal: false,
  };
}

function recordAnswer(journey: Journey, chrono: PhotoSession[]): CoachAnswer {
  const intent: CoachIntent = 'record';
  const source = 'From your photographs';
  const latest = chrono[chrono.length - 1];

  if (!latest) {
    return {
      intent,
      source,
      headline: 'There is nothing in your record yet.',
      detail: 'The first scan is the one every later scan is measured against.',
      action: FIRST_PHOTO,
      refusal: false,
    };
  }

  const label = sessionLabel(journey.startedAt, latest);
  const missing = missingAngles(latest);
  const k = ANGLES.length - missing.length;
  const gaps = missing.length ? ` — no ${missing.map((a) => ANGLE_LABELS[a]).join(', ')}` : '';

  return {
    intent,
    source,
    headline:
      chrono.length === 1
        ? `One scan, ${label}, taken ${formatDate(latest.capturedAt)}.`
        : `${chrono.length} scans since ${formatDate(chrono[0].capturedAt)} — ${formatDuration(journey.startedAt)} into your journey.`,
    detail: `Your last scan, ${label}, holds ${k} of ${ANGLES.length} angles${gaps}.`,
    refusal: false,
  };
}

/* ------------------------------ their own words -------------------------- */

function journalAnswer(data: AppData): CoachAnswer {
  const intent: CoachIntent = 'journal';
  const source = 'From your journal';
  const last = latestJournal(data);

  if (!last) {
    return {
      intent,
      source,
      headline: 'No journal entries yet.',
      detail: 'A note beside a scan is what explains the photographs later.',
      action: { label: 'Write one', href: '/journal?compose=1' },
      refusal: false,
    };
  }

  const count = data.journal.length;
  return {
    intent,
    source,
    headline: `${count} ${plural(count, 'entry', 'entries')} — the last one ${formatRelative(last.createdAt)}.`,
    echoLabel: 'You wrote',
    echo: [truncate(last.body, 140)],
    action: { label: 'Open journal', href: '/journal' },
    refusal: false,
  };
}

function goalsAnswer(journey: Journey): CoachAnswer {
  // Medications are not echoed here: the stack answer covers what they
  // use, in the words they typed rather than a funnel label.
  const goals = journeyGoals(journey);

  const echo = [
    ...goals.map((g) => HAIR_GOAL_LABELS[g]),
    ...journey.trackingAreas.map((a) => TRACKING_AREA_LABELS[a]),
    ...journey.approaches.map((a) => APPROACH_LABELS[a]),
  ];

  /*
    The caption names only what is under it. A journey may have several
    goals, one, or — for a record old enough to predate the question —
    none, and a caption promising a goal above a list that has none is
    the app claiming somebody said something they did not.
  */
  const captions = [
    goals.length === 0 ? null : goals.length === 1 ? 'Your goal' : 'What you said you want',
    journey.trackingAreas.length > 0 ? 'The areas you watch' : null,
    journey.approaches.length > 0 ? 'What you were doing then' : null,
  ].filter((c): c is string => c !== null);

  return {
    intent: 'goals',
    source: 'From your answers at the start',
    headline: 'What you said you wanted, and where you were starting from.',
    detail: 'Kept as you said it, shown back as you said it.',
    echoLabel:
      captions.length > 0
        ? joinPhrases(captions.map((c, i) => (i === 0 ? c : midSentence(c))))
        : undefined,
    echo: echo.length > 0 ? echo : undefined,
    refusal: false,
  };
}

/* --------------------------- needs no record ----------------------------- */

function areaMeaningAnswer(): CoachAnswer {
  return {
    intent: 'areaMeaning',
    source: 'From how the reading is made',
    headline: 'Area is how much of the photograph the on-device segmenter marked as hair.',
    detail:
      'It cannot see between strands, so a thin covering and a thick one over the same region give the same number. It is not thickness, and one photograph on its own cannot show change.',
    refusal: false,
  };
}

function privacyAnswer(): CoachAnswer {
  // True only while the coach stays ephemeral and offline; change this
  // sentence before changing either of those.
  return {
    intent: 'privacy',
    source: 'From how Tress is built',
    headline: 'Your photographs stay on this phone.',
    detail:
      'Every reading was taken on the device, and this conversation is not saved or sent anywhere.',
    refusal: false,
  };
}

function helpAnswer(): CoachAnswer {
  return {
    intent: 'help',
    source: 'From how Tress is built',
    headline: 'Tress answers from your record, and nothing else.',
    detail:
      'Ask about your routine, your photographs, your readings, your journal, or what you said at the start. Every answer is built on this phone from what you recorded; nothing is typed into a model and nothing is sent anywhere.',
    refusal: false,
  };
}

/* -------------------------------- answerFor ------------------------------ */

export function answerFor(match: IntentMatch, data: AppData): CoachAnswer {
  const { intent } = match;

  switch (intent) {
    case 'refuseMedication':
      return refusal(
        intent,
        "Tress doesn't advise on treatments — starting, stopping, amounts, or which one.",
        'A pharmacist, prescriber or other qualified healthcare professional is the honest source for that. What Tress can show is what you recorded taking and how often you ticked it. The full note on what Tress is and is not lives in Terms, under Profile.',
      );
    case 'refuseDiagnose':
      return refusal(
        intent,
        "Tress can't tell you what is happening to your hair, or put a name to it.",
        "It is not a medical device and holds no opinion about anyone's scalp. A dermatologist or other qualified healthcare professional can look properly. Tress can tell you what your photographs and ticks show.",
      );
    case 'refusePredict':
      return refusal(
        intent,
        "Tress can't say what will happen to your hair.",
        'Nothing in your record predicts anything — it shows what was photographed and what you did. When the next scan exists, Tress can set it beside this one.',
      );
    case 'unknown':
      return refusal(
        intent,
        "That isn't something Tress can answer from your record.",
        'It can answer about your routine, your photographs, your readings, your journal, and what you said at the start.',
      );
    case 'areaMeaning':
      return areaMeaningAnswer();
    case 'privacy':
      return privacyAnswer();
    case 'help':
      return helpAnswer();
    default:
      break;
  }

  const journey = data.journey;
  if (!journey) {
    return {
      intent,
      source: 'From your record',
      headline: 'There is no record yet.',
      detail: 'Tress answers from a journey once one exists.',
      refusal: false,
    };
  }

  const chrono = sessionsChronological(data);

  switch (intent) {
    case 'consistency':
      return consistencyAnswer(data, journey);
    case 'streak':
      return streakAnswer(data);
    case 'itemAdherence':
      return itemAdherenceAnswer(data, match.itemId);
    case 'lastScan':
      return lastScanAnswer(journey, chrono);
    case 'nextSet':
      return nextSetAnswer(data, journey, chrono);
    case 'compare':
      return compareAnswer(journey, chrono);
    case 'keepSame':
      return keepSameAnswer(journey, chrono);
    case 'record':
      return recordAnswer(journey, chrono);
    case 'stack':
      return stackAnswer(data);
    case 'journal':
      return journalAnswer(data);
    case 'goals':
      return goalsAnswer(journey);
  }
}

/* --------------------------- suggested questions ------------------------- */

const ORDER_NO_SESSIONS: CoachIntent[] = [
  'keepSame', 'areaMeaning', 'privacy', 'consistency', 'stack', 'goals', 'record', 'journal', 'streak',
];
const ORDER_ONE_SESSION: CoachIntent[] = [
  'lastScan', 'nextSet', 'consistency', 'keepSame', 'areaMeaning', 'record', 'stack', 'journal',
  'goals', 'privacy', 'streak',
];
const ORDER_TWO_PLUS: CoachIntent[] = [
  'compare', 'consistency', 'nextSet', 'lastScan', 'keepSame', 'record', 'stack', 'journal',
  'goals', 'areaMeaning', 'privacy', 'streak',
];

function moveToFront(order: CoachIntent[], keys: CoachIntent[]): CoachIntent[] {
  return [...keys.filter((k) => order.includes(k)), ...order.filter((i) => !keys.includes(i))];
}

function moveToEnd(order: CoachIntent[], keys: CoachIntent[]): CoachIntent[] {
  return [...order.filter((i) => !keys.includes(i)), ...keys.filter((k) => order.includes(k))];
}

/**
 * Three questions the record can answer right now. A set that does not
 * exist is never offered as a question, and after a refusal the honest
 * neighbours of what was asked — what the sets show, what is recorded,
 * what is in the stack — come first.
 */
export function suggestedQuestions(data: AppData, exclude?: CoachIntent): Chip[] {
  const sessions = data.sessions.length;
  const items = activeRoutineItems(data).length;

  let order =
    sessions === 0 ? ORDER_NO_SESSIONS : sessions === 1 ? ORDER_ONE_SESSION : ORDER_TWO_PLUS;

  if (exclude && REFUSAL_INTENTS.includes(exclude)) {
    order = moveToFront(order, ['compare', 'record', 'stack']);
  }
  // With nothing in the stack these still answer honestly, with an
  // "Open routine" action, but they should not lead.
  if (items === 0) order = moveToEnd(order, ['consistency', 'streak', 'stack']);

  return order
    .filter((i) => i !== exclude)
    .flatMap((i) => CHIPS.filter((c) => c.intent === i))
    .slice(0, 3);
}

/* ------------------------------ for the sweep ---------------------------- */

/** Every template sentence an answer shows. Echo is the person's own words and is left out. */
export function answerSentences(answer: CoachAnswer): string[] {
  return [
    answer.source,
    answer.headline,
    answer.detail,
    answer.echoLabel,
    answer.figure?.label,
    answer.action?.label,
  ].filter((s): s is string => typeof s === 'string');
}
