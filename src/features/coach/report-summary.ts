/**
 * The "Tress says" paragraph at the foot of the hair scan report.
 *
 * Three to five sentences in the coach's voice — plain, specific, second
 * person, no exclamation marks — that read the report back to the
 * person: what this turn kept, which part of the record their own focus
 * points at, whether the figures above were counted or the segmenter
 * did not run, which of their own answers the care notes lean on (when
 * one does), and when the next scan is due. Every sentence is about the
 * record, the images or the notes. None predicts, none diagnoses, and
 * the person's own answer is read back as a quotation, never adopted as
 * a claim — the same rule `answers.ts` keeps for the coach.
 *
 * Pure: no React, nothing native. Loaded by `node --test`.
 */

import { quote } from '@/features/hair-scan/report-copy';
import { areaReading } from '@/features/hair-scan/result';
import { tipProfileOf, tipsForProfile, type TipSignal } from '@/features/hair-scan/tips';
import { daysBetween } from '@/lib/date';
import { nextUpdate } from '@/store/selectors';
import {
  ANGLES,
  HAIR_GOAL_LABELS,
  isScanSession,
  joinPhrases,
  journeyGoals,
  midSentence,
  type AppData,
  type HairGoal,
  type PhotoSession,
} from '@/types/domain';

/** How the paragraph names each angle a frame was kept for. */
const ANGLE_WORDS: Record<(typeof ANGLES)[number], string> = {
  front: 'the front',
  leftTemple: 'the left side',
  rightTemple: 'the right side',
  top: 'the top',
  crown: 'the back',
};

/**
 * Where a goal points in the record. Null is a goal a photograph cannot
 * count — shedding, breakage, whether a routine is working — which the
 * paragraph sends to the notes and ticks instead.
 */
const GOAL_PLACE: Record<HairGoal, string | null> = {
  fullness: 'the whole turn',
  hairline: 'the front frame',
  crown: 'the top frame',
  shedding: null,
  overall: 'the whole turn',
  routineWorking: null,
  unsure: 'the whole turn',
  narrowerPart: 'the top frame',
  fullerPonytail: 'the top frame',
  lessBreakage: null,
};

function frameWords(session: PhotoSession): string {
  const held = new Set(session.photos.map((p) => p.angle));
  const parts = ANGLES.filter((a) => held.has(a)).map((a) => ANGLE_WORDS[a]);
  if (held.has('leftTemple') && held.has('rightTemple')) {
    const rest = parts.filter((w) => w !== 'the left side' && w !== 'the right side');
    const front = rest.filter((w) => w === 'the front');
    const others = rest.filter((w) => w !== 'the front');
    return joinPhrases([...front, 'both sides', ...others]);
  }
  return joinPhrases(parts);
}

function opener(session: PhotoSession, name: string | undefined): string {
  const n = session.photos.length;
  const lead = name ? `${name}, this scan` : 'This scan';
  if (n === 0) return `${lead} kept no frames from your turn, so there is nothing here to compare yet.`;
  const frames = n === 1 ? 'one frame' : `${n} frames`;
  return `${lead} kept ${frames} from your turn: ${frameWords(session)}.`;
}

function focusSentence(data: AppData): string {
  const goal = data.journey ? journeyGoals(data.journey)[0] : undefined;
  if (goal === undefined) return 'You have not picked a focus yet, and the record works the same way without one.';
  const said = quote(midSentence(HAIR_GOAL_LABELS[goal]));
  const place = GOAL_PLACE[goal];
  if (place === null) {
    return `You said you are hoping for ${said}, which a photograph cannot count; the notes and ticks in the record are where that lives.`;
  }
  return `You said you are hoping for ${said}, so ${place} is the part of the record to watch.`;
}

/**
 * What the segmenter did, told apart three ways: it never ran (no frame
 * carries a coverage block at all), it ran and found too little to print
 * (coverage is there but `areaReading` refuses it), or it ran and the
 * figures stand. The first is a fact about the build; the second is a
 * fact about the frames; the paragraph does not swap one for the other.
 */
function measuredSentence(session: PhotoSession): string | null {
  if (session.photos.length === 0) return null;
  const measured = session.photos.filter((p) => areaReading(p) !== null).length;
  if (measured === 0) {
    const ran = session.photos.some((p) => p.coverage !== undefined);
    if (!ran) {
      return 'The hair-area reading did not run on this build, so the report describes light, focus and framing, and no figure was invented to fill the gap.';
    }
    return 'The hair-area reading ran but marked too little as hair in these frames to print a figure from, so the report describes light, focus and framing, and no figure was invented to fill the gap.';
  }
  const which = measured === session.photos.length ? 'every one of them' : `${measured} of them`;
  return `The hair-area reading ran on ${which}, and every figure in this report was counted on this phone.`;
}

/**
 * The one answer the care notes lean on, named as theirs. Read off the
 * same call the report's notes are built from, so the paragraph never
 * says the notes were picked by an answer they were not. Null when the
 * goal alone chose them, which is every journey from before the
 * self-knowledge questions existed.
 */
export function profileSentence(signal: TipSignal | null): string | null {
  if (signal === null) return null;
  const said = quote(midSentence(signal.label));
  const tail = 'and the care notes are picked with that in mind.';
  switch (signal.kind) {
    case 'heat':
      return `You told Tress heat goes on your hair ${said}, ${tail}`;
    case 'reaction':
      return `You told Tress you have reacted to ${said}, ${tail}`;
    case 'sensitivity':
      return `You described your scalp as ${said}, ${tail}`;
    case 'scalpType':
      return `You described your scalp as ${said}, ${tail}`;
    case 'concern':
      return `You mentioned ${said} as something on your mind, ${tail}`;
  }
}

/**
 * How the next scan joins the record: as the first thing this one can be
 * laid beside, or as one more beside the scans already there. Counted
 * from sessions the scanner saved, this one included, so an upgraded
 * install's old one-angle-at-a-time sets are not called scans.
 */
function nextSentence(data: AppData, now: Date): string {
  const due = nextUpdate(data);
  const scans = data.sessions.filter(isScanSession).length;
  const same =
    scans >= 2
      ? `taken in the same light at the same distance, it goes beside the ${scans} already on record.`
      : 'taken in the same light at the same distance, it is the first one this can be laid beside.';
  if (!due) {
    return scans >= 2
      ? `Another scan, taken in the same light at the same distance, goes beside the ${scans} already on record.`
      : 'A second scan, taken in the same light at the same distance, is the first one this can be laid beside.';
  }
  const days = -daysBetween(due.dueISO, now.toISOString());
  if (days <= 0) return `The next scan is due now: ${same}`;
  if (days === 1) return `The next scan is due tomorrow: ${same}`;
  return `The next scan is due in ${days} days: ${same}`;
}

/**
 * The paragraph. `name` is trimmed and dropped when blank, so a person
 * who skipped the name question is spoken to without a hole where it
 * would have gone. `now` is for the due date and the tests.
 */
export function reportSummary(data: AppData, session: PhotoSession, name?: string, now: Date = new Date()): string {
  const who = name?.trim() || undefined;
  const notes = profileSentence(tipsForProfile(tipProfileOf(data.journey)).shapedBy);
  return [opener(session, who), focusSentence(data), measuredSentence(session), notes, nextSentence(data, now)]
    .filter((s): s is string => s !== null)
    .join(' ');
}
