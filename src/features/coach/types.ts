/**
 * Ask Tress — the types.
 *
 * Nothing here is persisted. A CoachAnswer is built from AppData on
 * demand and lives only as long as the sheet that shows it.
 */

export type CoachIntent =
  // data intents, answered from the record
  | 'consistency'
  | 'streak'
  | 'itemAdherence'
  | 'lastScan'
  | 'nextSet'
  | 'compare'
  | 'keepSame'
  | 'areaMeaning'
  | 'record'
  | 'stack'
  | 'journal'
  | 'goals'
  | 'privacy'
  | 'help'
  // refusals, answered without the record
  | 'refuseMedication'
  | 'refuseDiagnose'
  | 'refusePredict'
  | 'unknown';

export const REFUSAL_INTENTS: readonly CoachIntent[] = [
  'refuseMedication',
  'refuseDiagnose',
  'refusePredict',
  'unknown',
];

/** What the matcher may read besides the question: the person's own routine labels. */
export type MatchContext = {
  itemLabels?: { id: string; label: string }[];
};

export type IntentMatch = {
  intent: CoachIntent;
  /** Set only for itemAdherence: the routine item the question named. */
  itemId?: string;
};

export type CoachActionHref =
  | '/routine'
  | '/hair-scan'
  | '/compare'
  | '/journal'
  | '/journal?compose=1';

export type CoachAction = { label: string; href: CoachActionHref };

export type CoachFigure = {
  kind: 'ring';
  /** 0–1, drawn with ReadingRing. */
  value: number;
  /** Set beneath the ring. Swept. */
  label: string;
};

export type CoachAnswer = {
  intent: CoachIntent;
  /** Names the data the answer came from: "From your routine · last 30 days". Swept. */
  source: string;
  /** One sentence. Swept. */
  headline: string;
  /** The working. Swept. */
  detail?: string;
  /** Caption above the echo lines, e.g. "You said at the start". Swept. */
  echoLabel?: string;
  /**
   * The person's own words or their chosen labels, shown as a quotation.
   * NOT swept; the tests prove every string is a domain label, a routine
   * item label, or a prefix of a journal body.
   */
  echo?: string[];
  figure?: CoachFigure;
  action?: CoachAction;
  /** True for the three refusals and unknown: no numbers, no labels, no echo, no action. */
  refusal: boolean;
};

export type CoachMessage =
  | { id: string; role: 'you'; text: string }
  | { id: string; role: 'tress'; answer: CoachAnswer };

export type Chip = { label: string; intent: CoachIntent };
