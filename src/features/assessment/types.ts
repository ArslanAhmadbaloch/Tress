/**
 * What an assessment is, and — more importantly — what it is not.
 *
 * Every observation in a Tress report is about one of three things: the
 * record somebody has built, the routine they have kept, or the technical
 * quality of their photographs. None of them is about their hair.
 *
 * That boundary is the whole design. An app that reads a phone photo and
 * announces "your crown density improved 12%" has made a measurement it
 * cannot make, to somebody with a medical condition, in order to sell a
 * subscription. Phone cameras change exposure, white balance and crop
 * between shots; hair looks fuller when it is dry, clean, or lit from the
 * front. There is no honest density number in there.
 *
 * What *is* honestly readable — and genuinely useful — is whether this
 * month's photograph can be compared with last month's at all. That is
 * what `Finding.kind` covers, and it is the part a vision model will
 * eventually strengthen rather than replace.
 */

import type { Angle } from '@/types/domain';

export type FindingKind =
  /** Coverage of the record: sets taken, angles captured, months spanned. */
  | 'record'
  /** How steadily the routine has been kept. */
  | 'routine'
  /** Whether the photographs are comparable with each other. */
  | 'framing';

export type FindingTone = 'good' | 'neutral' | 'attention';

export type Finding = {
  id: string;
  kind: FindingKind;
  tone: FindingTone;
  /** One short sentence, written to be read aloud. */
  headline: string;
  /** The reasoning, so nothing in the report is a black box. */
  detail: string;
  /** The angle this concerns, when it concerns one. */
  angle?: Angle;
};

export type ReportSection = {
  kind: FindingKind;
  title: string;
  /** 0–1, or null when there is not enough recorded to score it yet. */
  score: number | null;
  scoreLabel: string;
  findings: Finding[];
};

export type Report = {
  generatedAt: string;
  /** False until there is a baseline to report on. */
  ready: boolean;
  /** Sessions the report was built from. */
  sessionCount: number;
  /** Whole months between the first and last set. */
  monthsSpanned: number;
  sections: ReportSection[];
  /** The single most useful next action, in the app's own voice. */
  nextStep: string;
};
