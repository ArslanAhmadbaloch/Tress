/**
 * The journeys shown in the funnel, and what they are allowed to say.
 *
 * Two per set, chosen by who is holding the phone, for the same reason as
 * the reference photographs in features/content/hair-content.ts: a woman
 * worried about her part does not see herself in a crown shot, and a
 * funnel that shows her one has told her this app is not for her.
 *
 * ── These are illustrations, not customers ────────────────────────────
 * Nobody has used this app for nine months, because it has not existed
 * for nine months. The photographs were supplied for the design and the
 * people in them are not users; the names, the months and the counts are
 * written here, not measured.
 *
 * The card says EXAMPLE JOURNEY across the top of it, above the faces and
 * in the accent colour — that label is what keeps this the right side of
 * a testimonial nobody gave, and it is the reason nothing below is phrased
 * as a claim. A longer disclosure under the card was tried and cut: it
 * read as a legal notice in the middle of a story. The label stays.
 *
 * ── What they are about ───────────────────────────────────────────────
 * The habit, not the hair. Each story is about somebody taking the same
 * scan on a schedule — one slow turn in front of the camera — and writing
 * a line beside each one, which is a thing this app genuinely does. None of them credits the app
 * with the change in the photographs: the app records, it does not treat,
 * and a funnel that implies otherwise is selling a drug it does not have.
 *
 * ── What is deliberately absent ───────────────────────────────────────
 * No percentages, no "X% saw results", no averages. There is no cohort
 * to average. The counts below describe what the person in the story did
 * — scans taken, entries written — and never what their hair did.
 */

import type { Gender } from '@/types/domain';

export type CaseStudy = {
  id: string;
  /** First name only. Invented, like the rest of it. */
  name: string;
  age: number;
  /** How long the pair spans, as it appears on the card. */
  span: string;
  /** The line above the card. About the habit, never about the hair. */
  headline: string;
  beforeLabel: string;
  afterLabel: string;
  before: number;
  after: number;
  /** How they kept it up. The subject of the card. */
  story: string;
  /** Counts of what they did, never of what their hair did. */
  stats: { value: string; label: string }[];
};

const MALE: CaseStudy[] = [
  {
    id: 'daniel',
    name: 'Daniel',
    age: 29,
    span: '9 months',
    headline: 'Nine months of turning up.',
    beforeLabel: 'Month 0',
    afterLabel: 'Month 9',
    before: require('@/assets/images/case-daniel-before.jpg'),
    after: require('@/assets/images/case-daniel-after.jpg'),
    story:
      'He scanned on the first Sunday of every month — one slow turn in front of the camera, in the same light — and wrote a line in the journal afterwards. When he wanted to know whether anything had changed, he scrubbed back through the timeline instead of trying to remember.',
    stats: [
      { value: '9', label: 'Scans' },
      { value: '41', label: 'Journal entries' },
      { value: '0', label: 'Months missed' },
    ],
  },
  {
    id: 'marco',
    name: 'Marco',
    age: 34,
    span: '12 months',
    headline: 'A year, and the month he nearly stopped.',
    beforeLabel: 'Month 0',
    afterLabel: 'Month 12',
    before: require('@/assets/images/case-marco-before.jpg'),
    after: require('@/assets/images/case-marco-after.jpg'),
    story:
      'He nearly stopped at month three, because the scans looked identical to him. He kept taking them anyway. It was the journal rather than the mirror that showed him what he had been doing, on the months he could not see it.',
    stats: [
      { value: '12', label: 'Scans' },
      { value: '60', label: 'Journal entries' },
      { value: '1', label: 'Scan a month' },
    ],
  },
];

/**
 * The same shape, about the things the female funnel actually asks after.
 *
 * Not a crown: a part somebody kept photographing in the same place, in
 * the same light, until there was something to compare against that was
 * not last spring's memory of it.
 */
const FEMALE: CaseStudy[] = [
  {
    id: 'leila',
    name: 'Leila',
    age: 24,
    span: '8 months',
    headline: 'Eight months, the same scan each time.',
    beforeLabel: 'Month 0',
    afterLabel: 'Month 8',
    before: require('@/assets/images/case-leila-before.jpg'),
    after: require('@/assets/images/case-leila-after.jpg'),
    story:
      'She scanned at the end of every month, part in the same place and the light from the same window, and wrote a line underneath each scan. Any two months running looked identical to her, so she stopped comparing them by eye and let the timeline hold the first scan beside the latest.',
    stats: [
      { value: '8', label: 'Scans' },
      { value: '34', label: 'Journal entries' },
      { value: '0', label: 'Months missed' },
    ],
  },
  {
    id: 'hannah',
    name: 'Hannah',
    age: 38,
    span: '10 months',
    headline: 'Ten months she couldn’t see day to day.',
    beforeLabel: 'Month 0',
    afterLabel: 'Month 10',
    before: require('@/assets/images/case-hannah-before.jpg'),
    after: require('@/assets/images/case-hannah-after.jpg'),
    story:
      'She started because she could not tell whether her part had widened or she had been looking at it too hard. Ten months of scans taken the same way gave her something to check against that was not her memory of last spring.',
    stats: [
      { value: '10', label: 'Scans' },
      { value: '47', label: 'Journal entries' },
      { value: '1', label: 'Scan a month' },
    ],
  },
];

export function caseStudies(gender: Gender): CaseStudy[] {
  return gender === 'female' ? FEMALE : MALE;
}
