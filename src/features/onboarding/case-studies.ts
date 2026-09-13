/**
 * The two journeys shown in the funnel, and what they are allowed to say.
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
 * The habit, not the hair. Each story is about somebody photographing
 * the same five angles on a schedule and writing a line beside each set,
 * which is a thing this app genuinely does. None of them credits the app
 * with the change in the photographs: the app records, it does not treat,
 * and a funnel that implies otherwise is selling a drug it does not have.
 *
 * ── What is deliberately absent ───────────────────────────────────────
 * No percentages, no "X% saw results", no averages. There is no cohort
 * to average. The counts below describe what the person in the story did
 * — sets taken, entries written — and never what their hair did.
 */

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

export const CASE_STUDIES: CaseStudy[] = [
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
      'He took the same five angles on the first Sunday of every month, and wrote a line in the journal afterwards. When he wanted to know whether anything had changed, he scrubbed back through the timeline instead of trying to remember.',
    stats: [
      { value: '9', label: 'Photo sets' },
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
      'He nearly stopped at month three, because the photographs looked identical to him. He kept taking them anyway. It was the journal rather than the mirror that showed him what he had been doing, on the months he could not see it.',
    stats: [
      { value: '12', label: 'Photo sets' },
      { value: '60', label: 'Journal entries' },
      { value: '5', label: 'Angles each time' },
    ],
  },
];
