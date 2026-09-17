/**
 * Every word the plan sequence says.
 *
 * The sequence runs from the funnel's report to the paywall: the facts
 * beneath the constellations on the dark ground, the wash that says the
 * plan is ready, the slider that asks for a commitment, the confetti, and
 * the lines that cross-fade on the cream glow before the paywall. All of
 * it is here so scripts/test/plan.test.ts can read it in one pass.
 *
 * What the words are held to. A fact line says what is known about hair
 * in general — how fast it grows, how long a strand lasts, how many shed
 * in a day, how long clinicians wait before judging a change — with its
 * source beside the constant in plan-model.ts, and never what this
 * person's hair will do. The record line names things in the record and
 * nothing about a head. The commitment is the person's own, to looking
 * after their hair — not to a result. The dated lines say what the
 * record will hold by a day: a second scan beside the first, three
 * months side by side. Not what anybody will feel, see or notice, and
 * nobody else's numbers — "N people joined today" is out because there
 * is no such number and no server to have counted one.
 *
 * Pure: no React, nothing native. Loaded by `node --test`.
 */

import { formatDateShort } from '@/lib/date';
import { HAIR_TYPE_LABELS, midSentence } from '@/types/domain';

import { HAIR_FACTS, type PlanCount, type PlanFact, type PlanModel } from './plan-model';

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

/* ------------------------------- the facts ------------------------------- */

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** The record's counts as a list: "12 answers, 4 images, 4 regions". */
function recordList(counts: PlanCount[]): string {
  return counts
    .map((c) => {
      const n = c.value;
      switch (c.id) {
        case 'answers':
          return `${n} ${plural(n, 'answer', 'answers')}`;
        case 'frames':
          return `${n} ${plural(n, 'image', 'images')}`;
        case 'regions':
          return `${n} ${plural(n, 'region', 'regions')}`;
      }
    })
    .join(', ');
}

/**
 * The line under a fact's headline, with one accent phrase. The four
 * hair facts read their numbers from HAIR_FACTS so the sentence can never
 * drift from the constant the source supports; the styles and record
 * lines read theirs from the record. The hair type is the person's own
 * answer read back, so it is marked quoted and the sweep leaves it to
 * the domain's own tests.
 */
export function factLine(fact: PlanFact): AccentLine {
  const f = HAIR_FACTS;
  switch (fact.id) {
    case 'styles': {
      const n = fact.value ?? 0;
      const before = `${n} ${plural(n, 'hairstyle', 'hairstyles')} for `;
      if (fact.hairType === undefined) return { before, accent: 'your hair', after: '' };
      return { before, accent: `${midSentence(HAIR_TYPE_LABELS[fact.hairType])} hair`, after: '', quoted: true };
    }
    case 'growth':
      return { before: `Hair grows about ${f.growthCmPerMonth} cm `, accent: 'a month', after: '' };
    case 'lifespan':
      return {
        before: `A strand grows for ${f.anagenYears.from} to ${f.anagenYears.to} years `,
        accent: 'before it sheds',
        after: '',
      };
    case 'shedding':
      return {
        before: `${f.shedPerDay.from} to ${f.shedPerDay.to} hairs shed every day, and that is `,
        accent: 'normal',
        after: '',
      };
    case 'review':
      return {
        before: `Dermatologists judge a change over ${f.reviewMonths.from} to ${f.reviewMonths.to} months, so `,
        accent: 'a monthly scan',
        after: ' is enough',
      };
    case 'record':
      return { before: `${recordList(fact.counts ?? [])} on `, accent: 'your record', after: '' };
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

/** Every fact the scene can show, with stand-in counts at one and at many. */
export function everyFact(): PlanFact[] {
  const one: PlanCount[] = [
    { id: 'answers', value: 1 },
    { id: 'frames', value: 1 },
    { id: 'regions', value: 1 },
  ];
  const many: PlanCount[] = [
    { id: 'answers', value: 12 },
    { id: 'frames', value: 5 },
    { id: 'regions', value: 5 },
  ];
  return [
    { id: 'styles', headline: '1 style', value: 1 },
    { id: 'styles', headline: '7 styles', value: 7, hairType: 'wavy' },
    { id: 'growth', headline: '1 cm' },
    { id: 'lifespan', headline: '2–7 years' },
    { id: 'shedding', headline: '50–100' },
    { id: 'review', headline: '3–6 months' },
    { id: 'record', headline: '1 answer', value: 1, counts: one },
    { id: 'record', headline: '12 answers', value: 12, counts: many },
  ];
}

/**
 * Every authored sentence, for the honesty sweep. The dated lines are
 * built with a stand-in date; the fact lines with every id, the record
 * line at one and at many so both plural forms are read.
 */
export function planCopySentences(): string[] {
  const c = PLAN_COPY;
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
    ...everyFact().flatMap((fact) => [fact.headline, lineSentence(factLine(fact))]),
  ];
}
