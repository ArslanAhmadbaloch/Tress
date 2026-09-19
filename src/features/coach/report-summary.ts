/**
 * The "Tress says" paragraph in the hair scan report.
 *
 * It used to describe the scan: how many frames the turn kept, which
 * angles they were, and whether the segmenter had run. That is a report
 * about the scanner, not about the head it photographed, and the owner
 * read it as exactly that. So the paragraph now reads the measurement
 * back instead — which of the six places the scan could read, which
 * reads highest and which lowest, whether anything moved further than
 * the two scans' own margin of error since the last scan and since the
 * baseline, and what the next scan will be watched for.
 *
 * ── The rules it is written under ─────────────────────────────────────
 * Every clause traces to a number somebody else computed. The engine in
 * features/hair-scan/measure decides what a region's coverage is, what
 * its confidence is, and whether a difference cleared the noise floor;
 * this file only chooses the English. It never adds a figure of its own,
 * and it never reaches for a figure that is missing: with no measurement
 * at all it returns null and the section does not render, because the
 * one thing worse than saying nothing is saying something invented.
 *
 * Refusal is carried as refusal. A comparison the engine declined to
 * make is not a comparison that found nothing, and the paragraph keeps
 * the two apart in words: a region missing from one of the two scans, or
 * read off too few frames, or read too faintly, produces no difference
 * at all, and the sentence says the scans could not be set beside each
 * other rather than that nothing moved. Nor is one fact stated twice:
 * on a second scan the baseline is the scan before it, and the two
 * sentences fold into one.
 *
 * A score here is a reading of visible hair and scalp in a photograph.
 * It is not hair density, a follicle count or a shaft diameter, and no
 * sentence in this file may be worded as though it were. The terms are
 * the product's: visual coverage, visible scalp, the areas the scan
 * reads. Nothing forecasts, nothing diagnoses, nothing promises, and the
 * person's own answer is read back as a quotation rather than adopted as
 * a claim — the same rule `answers.ts` keeps for the coach.
 *
 * Pure: no React, nothing native. Loaded by `node --test`.
 */

import {
  COVERAGE_SCORE_MAX,
  comparable,
  confidenceBand,
  gradeOf,
  type Grade,
} from '@/features/hair-scan/grade';
import { SCAN_REGIONS } from '@/features/hair-scan/measure';
import { quote } from '@/features/hair-scan/report-copy';
import { type TipSignal } from '@/features/hair-scan/tips';
import { daysBetween } from '@/lib/date';
import { nextUpdate } from '@/store/selectors';
import {
  HAIR_GOAL_LABELS,
  joinPhrases,
  journeyGoals,
  midSentence,
  type AppData,
  type HairGoal,
  type PhotoSession,
  type PhotoSessionMeasurement,
  type PhotoSessionRegionChange,
  type PhotoSessionRegionMeasurement,
  type ScanMeasureRegion,
} from '@/types/domain';

/* ------------------------------ the numbers ------------------------------ */

/**
 * A difference in coverage as whole points of the score above it, so "5
 * points lower" and "54 out of 100" are figures in the same units.
 *
 * The only arithmetic in this file, and it is a change of units rather
 * than a judgement. Everything else — the score, the confidence, the
 * word for the confidence, whether two readings may be set beside each
 * other in a sentence at all — comes from `grade.ts`, which is the one
 * place allowed to turn a share into a figure.
 */
export function coveragePoints(delta: number): number {
  if (!Number.isFinite(delta)) return 0;
  return Math.round(Math.abs(delta) * COVERAGE_SCORE_MAX);
}

/** The verdicts `compareScans` reserves for a difference that cleared the noise floor. */
const CLEARED = new Set(['small', 'moderate', 'large']);

function cleared(changes: readonly PhotoSessionRegionChange[]): PhotoSessionRegionChange[] {
  return changes
    .filter((c) => CLEARED.has(c.verdict))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * How many of the stored rows are comparisons at all.
 *
 * `insufficient` is not a quiet result. `measure/compare.ts` writes it
 * when the region is missing from one of the two scans, when either kept
 * too few frames, when the confidence is under its own floor, or when a
 * coverage is not a finite number — in every case it declined to
 * subtract, and no difference was ever measured. Reading a row like that
 * as "nothing moved" would be this file reporting a comparison the
 * engine explicitly refused to make, which is the one thing a paragraph
 * of measurements may never do.
 */
function compared(changes: readonly PhotoSessionRegionChange[]): PhotoSessionRegionChange[] {
  return changes.filter((c) => c.verdict !== 'insufficient');
}

/**
 * Whether two stored comparisons are the same comparison.
 *
 * On a second scan the baseline IS the scan before it, so the report
 * hands the same rows down twice and the paragraph would state one fact
 * in two sentences — the single most common case a new user meets. The
 * model can say so outright with `baselineIsPrevious`; where it has not,
 * the rows themselves say it, because two comparisons against the same
 * pair of scans are row-for-row identical.
 */
function sameComparison(
  a: readonly PhotoSessionRegionChange[] | undefined,
  b: readonly PhotoSessionRegionChange[] | undefined,
): boolean {
  if (!a || !b || a.length === 0 || a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i];
    return (
      other !== undefined &&
      other.region === row.region &&
      other.verdict === row.verdict &&
      other.delta === row.delta
    );
  });
}

/* ------------------------------- the words ------------------------------- */

/** How the paragraph names each of the six places the scan reads. */
const REGION_WORDS: Record<ScanMeasureRegion, string> = {
  hairline: 'hairline',
  leftTemple: 'left temple',
  rightTemple: 'right temple',
  midScalp: 'mid-scalp',
  crown: 'crown',
  partLine: 'part line',
};

const COUNT_WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six'];

function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/**
 * Where a goal points among the six. Null is a goal no single place on a
 * head stands for — the whole turn, shedding, whether a routine is
 * working — and the paragraph then watches the lowest reading alone.
 */
const GOAL_REGION: Record<HairGoal, ScanMeasureRegion | null> = {
  fullness: null,
  hairline: 'hairline',
  crown: 'crown',
  shedding: null,
  overall: null,
  routineWorking: null,
  unsure: null,
  narrowerPart: 'partLine',
  fullerPonytail: null,
  lessBreakage: null,
};

/* ----------------------------- the paragraph ----------------------------- */

/**
 * What the report holds about this scan, for the paragraph to read.
 *
 * Every field is optional and every one is something another part of the
 * app measured. Left out, the paragraph falls back to the record itself:
 * the measurement and the comparison the scanner stored on the session.
 * Passing them in is for the report model, which has already worked out
 * the baseline comparison this file has no business recomputing.
 */
export type SaysFindings = {
  /** This scan's own reading, as the engine wrote it. Null means it did not run. */
  measurement?: PhotoSessionMeasurement | null;
  /** This scan set beside the scan before it. */
  sinceLast?: readonly PhotoSessionRegionChange[];
  /** This scan set beside the first scan on record. */
  sinceBaseline?: readonly PhotoSessionRegionChange[];
  /** How far back the baseline is, in the report's own words: "3 months". */
  baselineSpan?: string | null;
  /**
   * True when the baseline scan and the scan before this one are the
   * same scan — the ordinary shape of a second scan, where a separate
   * baseline sentence would repeat the since-last one word for word.
   * Left out, the rows are checked against each other instead.
   */
  baselineIsPrevious?: boolean;
};

type Reading = { region: ScanMeasureRegion; grade: Grade };

/**
 * The regions this scan actually produced a reading for.
 *
 * The engine's own `unread` list wins: a region it named there is one it
 * declined to report, whatever else it left in the map. Past that, a
 * region only counts as read when `grade.ts` will give it a score — a
 * region that is present but whose coverage is not a finite number was
 * not read either, and the sentence below must not quietly count it.
 */
function readingsOf(measurement: PhotoSessionMeasurement): Reading[] {
  const refused = new Set<ScanMeasureRegion>(measurement.unread);
  const out: Reading[] = [];
  for (const region of SCAN_REGIONS) {
    if (refused.has(region)) continue;
    const held: PhotoSessionRegionMeasurement | undefined = measurement.regions[region];
    const grade = gradeOf(held);
    if (grade === null) continue;
    out.push({ region, grade });
  }
  return out;
}

/**
 * The rest of the six, so the scope sentence's arithmetic always closes.
 *
 * Taken as the complement of what was read rather than as a second list
 * of its own: "read five of the six" and the places it names have to be
 * the same six, and a region that is present but unreadable belongs on
 * this side of the semicolon rather than in neither half.
 */
function unreadOf(readings: Reading[]): ScanMeasureRegion[] {
  const read = new Set(readings.map((r) => r.region));
  return SCAN_REGIONS.filter((region) => !read.has(region));
}

/** Which places the scan could read, and which it could not. */
function scopeSentence(readings: Reading[], unread: ScanMeasureRegion[], name: string | undefined): string {
  const lead = name ? `${name}, this scan` : 'This scan';
  const read = `${lead} read ${countWord(readings.length)} of the ${countWord(SCAN_REGIONS.length)} areas Tress measures`;
  if (unread.length === 0) return `${read}.`;
  const words = unread.map((r) => `your ${REGION_WORDS[r]}`);
  const verb = unread.length === 1 ? 'was' : 'were';
  return `${read}; ${joinPhrases(words)} ${verb} not clear enough in these frames to read.`;
}

/**
 * The highest and lowest of them, each with the confidence it was read
 * at — but only where `grade.ts` allows two readings to be set beside
 * each other in prose at all. Below that bar the sentence names the
 * surest reading and says plainly why the others are not beside it,
 * which is the difference between a cautious sentence and a false one.
 */
function readingSentence(readings: Reading[]): string {
  const byScore = [...readings].sort((a, b) => b.grade.score - a.grade.score);
  const high = byScore[0];
  const low = byScore[byScore.length - 1];
  const at = (r: Reading): string =>
    `${r.grade.score} out of ${COVERAGE_SCORE_MAX} for visual coverage, with ${confidenceBand(r.grade.confidence)} confidence`;
  if (byScore.length === 1) {
    return `Your ${REGION_WORDS[high.region]} came out at ${at(high)}.`;
  }
  if (!comparable(high.grade, low.grade)) {
    const surest = [...readings].sort((a, b) => b.grade.confidence - a.grade.confidence)[0];
    return `Your ${REGION_WORDS[surest.region]} is the reading this scan is surest of, at ${at(surest)}; the rest were read too faintly to set beside it.`;
  }
  return `Your ${REGION_WORDS[high.region]} reads highest of them at ${at(high)}, and your ${REGION_WORDS[low.region]} lowest at ${low.grade.score}, with ${confidenceBand(low.grade.confidence)} confidence.`;
}

/** "5 points lower", or null when the difference rounds away to nothing. */
function moveWords(change: PhotoSessionRegionChange): string | null {
  const points = coveragePoints(change.delta);
  if (points < 1) return null;
  return `${points} point${points === 1 ? '' : 's'} ${change.delta > 0 ? 'higher' : 'lower'}`;
}

const MARGIN = "the two scans' own margin of error";

/**
 * What moved since the scan before this one — and, far more often, what
 * did not, or what could not be asked at all.
 *
 * Three outcomes, and they are three different sentences on purpose. No
 * earlier reading is one thing. A set of comparisons that all came back
 * inside the margin is another. A set the engine declined to make — a
 * previous scan that read only the hairline leaves every other region
 * `insufficient` — is a third, and the worst of the three to word as
 * the second: "no area moved" asserts five comparisons that were never
 * performed. `report-copy.ts` already has the right words for that case
 * on the change rows, and this is the same fact in the coach's voice.
 *
 * `alsoBaseline` folds the baseline into this sentence when the scan
 * before this one IS the baseline, so the fact is stated once.
 */
function changeSentence(
  changes: readonly PhotoSessionRegionChange[] | undefined,
  alsoBaseline = false,
): string {
  if (!changes || changes.length === 0) {
    return 'Nothing earlier on record carries a reading of its own, so there is nothing yet to set this scan beside.';
  }
  /*
    "With a reading", not "your last scan". The comparison is made against
    `lastMeasurement`, which steps over every session that carries no
    measurement — an unmeasured scan in between is a first-class case in
    this app — so the scan this sentence is about can be older than the
    last scan the person took. The report's own span sentence names it
    the same way, and the two sit on one screen.
  */
  const last = alsoBaseline
    ? 'your last scan with a reading, which is also your baseline'
    : 'your last scan with a reading';
  if (compared(changes).length === 0) {
    return `Neither this scan nor ${last} read any one area well enough in both for the two to be set beside each other, so no difference is reported.`;
  }
  const moved = cleared(changes);
  if (moved.length === 0) {
    return `Set beside ${last}, no area both scans read moved further than ${MARGIN}, so nothing here counts as a change.`;
  }
  const top = moved[0];
  const words = moveWords(top);
  const by = words ? `, reading ${words}` : '';
  if (moved.length === 1) {
    return `Set beside ${last}, your ${REGION_WORDS[top.region]} is the one area that moved further than ${MARGIN}${by}.`;
  }
  return `Set beside ${last}, ${countWord(moved.length)} areas moved further than ${MARGIN}, your ${REGION_WORDS[top.region]} most of all${by}.`;
}

/**
 * The same question asked of the first scan on record, when the report
 * has that comparison and it is a different comparison.
 *
 * Null where the baseline is the scan before this one: the sentence
 * above has already said it, and saying it twice in five sentences is
 * how a paragraph of findings starts reading like padding.
 */
function baselineSentence(
  changes: readonly PhotoSessionRegionChange[] | undefined,
  span: string | null | undefined,
  marginNamed: boolean,
): string | null {
  if (!changes || changes.length === 0) return null;
  const since = span ? `Against your baseline, ${span} back,` : 'Against your baseline,';
  /*
    "That margin" needs the sentence before it to have named one. Where
    the since-last sentence said there was nothing to compare, or
    declined the comparison, it never did — so this sentence says it in
    full rather than pointing back at an antecedent that was never
    written.
  */
  const margin = marginNamed ? 'that margin' : MARGIN;
  if (compared(changes).length === 0) {
    return `${since} no area was read well enough in both scans for the two to be set beside each other.`;
  }
  const moved = cleared(changes);
  if (moved.length === 0) return `${since} nothing both scans read has moved further than ${margin}${marginNamed ? ' either' : ''}.`;
  const top = moved[0];
  const words = moveWords(top);
  if (moved.length === 1) {
    return words
      ? `${since} your ${REGION_WORDS[top.region]} has moved ${words}, further than ${margin}.`
      : `${since} your ${REGION_WORDS[top.region]} has moved further than ${margin}.`;
  }
  const by = words ? `, reading ${words}` : '';
  return `${since} ${countWord(moved.length)} areas have moved further than ${margin}, your ${REGION_WORDS[top.region]} most of all${by}.`;
}

/** When the next scan is due, as a clause the watch sentence ends on. */
function dueClause(data: AppData, now: Date): string {
  const due = nextUpdate(data);
  if (!due) return '';
  const days = -daysBetween(due.dueISO, now.toISOString());
  if (days <= 0) return ', on the scan due now';
  if (days === 1) return ', on the scan due tomorrow';
  return `, on the scan due in ${days} days`;
}

/**
 * The place this scan hands to the next one, and the reason in words.
 *
 * The lowest reading, where the readings may be compared at all;
 * otherwise the one the scan is surest of, because "lowest" is a claim
 * about every reading in the set and a faint one cannot support it.
 */
function leadReading(readings: Reading[]): { region: ScanMeasureRegion; why: string } {
  const byScore = [...readings].sort((a, b) => a.grade.score - b.grade.score);
  const low = byScore[0];
  const high = byScore[byScore.length - 1];
  if (readings.length === 1 || comparable(high.grade, low.grade)) {
    return { region: low.region, why: 'the lowest reading here' };
  }
  const surest = [...readings].sort((a, b) => b.grade.confidence - a.grade.confidence)[0];
  return { region: surest.region, why: 'the reading this scan is surest of' };
}

/**
 * What the next scan is watched for: the reading this one hands over,
 * and the place the person's own goal points at when it points at one.
 * The goal is quoted rather than restated, so the paragraph names their
 * words without adopting them as its own.
 */
function watchSentence(readings: Reading[], data: AppData, now: Date): string {
  const lead = leadReading(readings);
  const leadWord = `your ${REGION_WORDS[lead.region]}`;
  const goal = data.journey ? journeyGoals(data.journey)[0] : undefined;
  const due = dueClause(data, now);
  const goalRegion = goal !== undefined ? GOAL_REGION[goal] : null;
  if (goal === undefined) {
    return `Your ${REGION_WORDS[lead.region]} is ${lead.why}, and that is what Tress watches next${due}.`;
  }
  const said = quote(midSentence(HAIR_GOAL_LABELS[goal]));
  if (goalRegion === null) {
    return `You said you are hoping for ${said}, and ${leadWord} is ${lead.why}, which is what Tress watches next${due}.`;
  }
  if (goalRegion === lead.region) {
    return `You said you are hoping for ${said}, and ${leadWord} is also ${lead.why}, which is what Tress watches next${due}.`;
  }
  return `You said you are hoping for ${said}, so your ${REGION_WORDS[goalRegion]} and ${leadWord}, ${lead.why}, are what Tress watches next${due}.`;
}

/**
 * The paragraph, or null when there is no measurement to read.
 *
 * Null is the whole of the unmeasured case. The report does not fill the
 * hole with a sentence about the segmenter, an apology, or a number
 * nobody counted: the section is not rendered, and the part of the
 * report that tells somebody the analysis did not run is the one place
 * that says so.
 *
 * `name` is trimmed and dropped when blank, so a person who skipped the
 * name question is spoken to without a hole where it would have gone.
 * `now` is for the due date and the tests.
 */
export function tressSays(
  data: AppData,
  session: PhotoSession,
  name?: string,
  now: Date = new Date(),
  findings?: SaysFindings,
): string | null {
  const measurement = findings?.measurement ?? session.scan?.measurement ?? null;
  if (!measurement) return null;
  const readings = readingsOf(measurement);
  if (readings.length === 0) return null;

  const who = name?.trim() || undefined;
  const sinceLast = findings?.sinceLast ?? session.scan?.changes;
  const sinceBaseline = findings?.sinceBaseline;
  /*
    Two sessions on record and the baseline is the scan before this one.
    The report hands both comparisons down all the same, so the duplicate
    is caught here: the model's own flag where it set one, and otherwise
    the rows, which are identical when they came from the same pair.
  */
  const baselineIsPrevious =
    findings?.baselineIsPrevious === true || sameComparison(sinceLast, sinceBaseline);

  /*
    The two comparison sentences are written apart, so they are checked
    against each other here.

    "Nothing earlier on record carries a reading of its own" is a claim
    about the whole record, and a baseline comparison is a reading
    earlier on the record — so where there is one, the since-last
    sentence does not get to say it, and the baseline sentence carries
    the comparison alone. `marginNamed` is the other half: the baseline
    sentence says "that margin", which needs the sentence above it to
    have named one.
  */
  const hasSinceLast = sinceLast !== undefined && sinceLast.length > 0;
  const hasBaseline =
    !baselineIsPrevious && sinceBaseline !== undefined && sinceBaseline.length > 0;
  const marginNamed = hasSinceLast && compared(sinceLast).length > 0;

  return [
    scopeSentence(readings, unreadOf(readings), who),
    readingSentence(readings),
    hasSinceLast || !hasBaseline ? changeSentence(sinceLast, baselineIsPrevious) : null,
    baselineIsPrevious ? null : baselineSentence(sinceBaseline, findings?.baselineSpan, marginNamed),
    watchSentence(readings, data, now),
  ]
    .filter((s): s is string => s !== null)
    .join(' ');
}

/**
 * The one answer the care notes lean on, named as theirs.
 *
 * It belongs to the care and tracking notes rather than to the paragraph
 * above — the paragraph reads measurements, and an answer is not one —
 * so it is exported for the notes' own heading to use. Read off the same
 * call the notes are built from, so nothing can say the notes were
 * picked by an answer they were not. Null when the goal alone chose
 * them, which is every journey from before the self-knowledge questions
 * existed.
 */
export function profileSentence(signal: TipSignal | null): string | null {
  if (signal === null) return null;
  const said = quote(midSentence(signal.label));
  const tail = 'and the care notes are picked with that in mind.';
  switch (signal.kind) {
    case 'heat':
      // The owner read "You told Tress heat goes on your hair …" aloud
      // off build 17: it reports a conversation instead of saying the
      // thing. Both branches that opened that way now say the thing; the
      // shelf already says "You said you have reacted to …" of the same
      // answer, and the two now match.
      return `You said heat goes on your hair ${said}, ${tail}`;
    case 'reaction':
      return `You said you have reacted to ${said}, ${tail}`;
    case 'sensitivity':
      return `You described your scalp as ${said}, ${tail}`;
    case 'scalpType':
      return `You described your scalp as ${said}, ${tail}`;
    case 'concern':
      return `You mentioned ${said} as something on your mind, ${tail}`;
  }
}
