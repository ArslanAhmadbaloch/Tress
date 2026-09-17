/**
 * Every word the plan sequence says.
 *
 * The sequence runs from the funnel's report to the paywall: the counts
 * rolling up on the dark ground, the wash that says the plan is ready,
 * the slider that asks for a commitment, the confetti, and the lines that
 * cross-fade on the cream glow before the paywall. All of it is here so
 * scripts/test/plan.test.ts can read it in one pass.
 *
 * What the words are held to. A count line names a thing in the record
 * and nothing about a head. The commitment is the person's own, to
 * looking after their hair — not to a result. The dated lines say what
 * the record will hold by a day: a second scan beside the first, three
 * months side by side. Not what anybody will feel, see or notice, and
 * nobody else's numbers — "N people joined today" is out because there
 * is no such number and no server to have counted one.
 *
 * Pure: no React, nothing native. Loaded by `node --test`.
 */

import { formatDateShort } from '@/lib/date';
import { HAIR_GOAL_LABELS, midSentence } from '@/types/domain';

import type { PlanCount, PlanModel } from './plan-model';

/* -------------------------------- shapes -------------------------------- */

/**
 * A line with one word in the accent colour.
 *
 * `quoted` marks an accent that is the person's own answer read back —
 * the goal they picked — so the sweep can judge the authored words and
 * leave the quotation to the domain's own tests.
 */
export type AccentLine = {
  before: string;
  accent: string;
  after: string;
  quoted?: boolean;
};

/* --------------------------------- copy --------------------------------- */

export const PLAN_COPY = {
  building: {
    caption: 'Building your plan…',
  },
  ready: {
    caption: 'Your plan is ready',
    cta: 'Show my plan',
  },
  commit: {
    title: 'Let’s commit to looking after your hair',
    slide: 'Slide to commit',
    /**
     * The one exclamation in the app. It is the person's own word at the
     * end of their own gesture, not the app cheering them on, and it is
     * on screen for under a second.
     */
    done: 'Yes!',
    citation: {
      title:
        'The effectiveness of nudging: A meta-analysis of choice architecture interventions across behavioral domains',
      source: 'Mertens, Herberz, Hahnel & Brosch, PNAS 2022',
    },
    /** For the screen reader, which cannot slide. */
    accessibilityHint: 'Double-tap to commit',
  },
  sequence: {
    next: 'Next',
    welcome: 'Welcome to Tress',
    minutes: { before: '', accent: 'A few minutes', after: ' a day is all your record needs' },
    secondScan: (date: string): AccentLine => ({
      before: 'By ',
      accent: date,
      after: ', your second scan can be compared with today’s',
    }),
    threeMonths: (date: string): AccentLine => ({
      before: 'By ',
      accent: date,
      after: ', three months side by side',
    }),
    stays: 'Everything you record stays on this phone',
    start: 'Start your record',
  },
} as const;

/* ------------------------------- the counts ------------------------------ */

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** The accent the care notes are said to be chosen for. */
function goalAccent(count: PlanCount): { accent: string; quoted: boolean } {
  const goal = count.goal;
  if (goal === undefined || goal === 'unsure') return { accent: 'everyday care', quoted: false };
  return { accent: midSentence(HAIR_GOAL_LABELS[goal]), quoted: true };
}

/** The line under a rolling number: "{n}" is the number, this is the rest. */
export function countLine(count: PlanCount): AccentLine {
  const n = count.value;
  switch (count.id) {
    case 'answers':
      return { before: `${plural(n, 'answer', 'answers')} about your `, accent: 'hair', after: '' };
    case 'frames':
      return { before: `${plural(n, 'image', 'images')} kept from your `, accent: 'scan', after: '' };
    case 'regions':
      return { before: `${plural(n, 'region', 'regions')} of your head `, accent: 'covered', after: '' };
    case 'tips': {
      const { accent, quoted } = goalAccent(count);
      return { before: `care ${plural(n, 'note', 'notes')} chosen for `, accent, after: '', quoted };
    }
    case 'routine':
      return {
        before: `${plural(n, 'step', 'steps')} already on your `,
        accent: 'routine',
        after: '',
      };
  }
}

/* ------------------------------ the sequence ----------------------------- */

export type SequenceLine = {
  id: string;
  line: AccentLine;
  /** The app mark sits above this line. */
  mark?: boolean;
  /** The last line: it waits for Next. */
  last?: boolean;
};

const plain = (text: string): AccentLine => ({ before: text, accent: '', after: '' });

/** The lines that cross-fade before the paywall, in order. */
export function sequenceLines(model: Pick<PlanModel, 'nextScanISO' | 'threeMonthsISO'>): SequenceLine[] {
  const s = PLAN_COPY.sequence;
  const lines: SequenceLine[] = [
    { id: 'welcome', line: plain(s.welcome), mark: true },
    { id: 'minutes', line: s.minutes },
  ];
  if (model.nextScanISO) {
    lines.push({ id: 'secondScan', line: s.secondScan(formatDateShort(model.nextScanISO)) });
  }
  if (model.threeMonthsISO) {
    lines.push({ id: 'threeMonths', line: s.threeMonths(formatDateShort(model.threeMonthsISO)) });
  }
  lines.push({ id: 'stays', line: plain(s.stays) });
  lines.push({ id: 'start', line: plain(s.start), last: true });
  return lines;
}

/* -------------------------------- the sweep ------------------------------ */

/** An accent line as one sentence, with a quoted accent left out. */
export function lineSentence(line: AccentLine): string {
  return `${line.before}${line.quoted ? '' : line.accent}${line.after}`.trim();
}

/**
 * Every authored sentence, for the honesty sweep. The dated lines are
 * built with a stand-in date; the count lines with every id at one and
 * at many, and with no goal, so the plural forms are read too.
 */
export function planCopySentences(): string[] {
  const c = PLAN_COPY;
  const counts: PlanCount[] = (['answers', 'frames', 'regions', 'tips', 'routine'] as const).flatMap(
    (id) => [
      { id, value: 1 },
      { id, value: 5 },
    ],
  );
  return [
    c.building.caption,
    c.ready.caption,
    c.ready.cta,
    c.commit.title,
    c.commit.slide,
    c.commit.citation.title,
    c.commit.citation.source,
    c.commit.accessibilityHint,
    c.sequence.next,
    ...sequenceLines({ nextScanISO: '2026-10-17T12:00:00.000Z', threeMonthsISO: '2026-12-17T12:00:00.000Z' }).map(
      (l) => lineSentence(l.line),
    ),
    ...counts.map((count) => lineSentence(countLine(count))),
  ];
}
