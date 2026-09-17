/**
 * What the plan sequence counts, and the dates it names.
 *
 * The screen after the funnel's report rolls four or five large numbers
 * up on a dark ground. The reference product counts its own catalogue —
 * "47,750 products", "3,408 of them match your skin type" — which is a
 * number about a database dressed as a number about a person. Tress has
 * no catalogue to count and no way to say what "matches" anybody, so
 * every figure here is a count of something that is already in the
 * record on this phone:
 *
 *   - the funnel questions this person answered,
 *   - the images the scan just kept,
 *   - the regions of the head those images reach,
 *   - the care notes the report chose for the goal they picked,
 *   - the steps already on their routine list, if any.
 *
 * A count of zero is left out rather than rolled up to nothing. Nothing
 * here is an efficacy figure, a match score or a forecast, and the test
 * in scripts/test/plan.test.ts holds every count to the record it was
 * taken from.
 *
 * The two dates the text sequence names are the record's own: the day
 * the next scan is due, from the cadence the person chose, and the day
 * three months of scans could sit side by side. Both are stated as what
 * the record will hold by then — never as what their hair will look
 * like.
 *
 * Pure: no React, nothing native. Loaded by `node --test`.
 */

import { tipsFor } from '@/features/hair-scan/tips';
import { activeRoutineItems, latestSession, nextUpdate } from '@/store/selectors';
import {
  MEDICATION_LABELS,
  journeyBudget,
  journeyConcerns,
  journeyFactors,
  journeyGoals,
  journeyHairType,
  journeyHeatStyling,
  journeyProductFactors,
  journeyReactions,
  journeyScalpConditions,
  journeyScalpSensitivity,
  journeyScalpType,
  knownChoices,
  profileAgeBand,
  type Angle,
  type AppData,
  type HairGoal,
  type PhotoRegion,
  type PhotoSession,
} from '@/types/domain';

/* -------------------------------- shapes -------------------------------- */

export type PlanCountId = 'answers' | 'frames' | 'regions' | 'tips' | 'routine';

export type PlanCount = {
  id: PlanCountId;
  /** A count of something in the record. Always at least one. */
  value: number;
  /** The goal the care notes were chosen for, on the `tips` count only. */
  goal?: HairGoal;
};

export type PlanModel = {
  /** In the order the sequence rolls them. Only counts above zero. */
  counts: PlanCount[];
  /** The day the next scan is due, or null before a journey exists. */
  nextScanISO: string | null;
  /**
   * The day three months of scans could sit side by side, or null when
   * the chosen cadence already reaches past it — then the next-scan line
   * says everything the three-month line would.
   */
  threeMonthsISO: string | null;
};

/* ------------------------------- the counts ------------------------------ */

/**
 * How many of the funnel's questions this person answered.
 *
 * One per question, not one per tick: a multiple-choice question with
 * three answers ticked is one question answered. Read through the same
 * validated accessors every screen reads, so a value the app no longer
 * offers counts as no answer, exactly as it renders.
 */
export function answersGiven(data: Pick<AppData, 'profile' | 'journey'>): number {
  const profile = data.profile;
  const journey = data.journey;
  let answered = 0;

  if (profile) {
    if (profile.displayName.trim().length > 0) answered += 1;
    if (profileAgeBand(profile) !== undefined) answered += 1;
    if (profile.gender !== undefined) answered += 1;
  }
  if (!journey) return answered;

  const lists: unknown[][] = [
    Array.isArray(journey.trackingAreas) ? journey.trackingAreas : [],
    Array.isArray(journey.motivations) ? journey.motivations : [],
    journeyGoals(journey),
    Array.isArray(journey.triggers) ? journey.triggers : [],
    Array.isArray(journey.approaches) ? journey.approaches : [],
    knownChoices(journey.medications, MEDICATION_LABELS),
    journeyConcerns(journey),
    journeyProductFactors(journey),
    journeyReactions(journey),
    journeyScalpConditions(journey),
    journeyFactors(journey),
  ];
  for (const list of lists) if (list.length > 0) answered += 1;

  const singles: unknown[] = [
    journey.noticed,
    journey.preoccupation,
    journey.selfConsistency,
    journeyHairType(journey),
    journeyScalpType(journey),
    journeyScalpSensitivity(journey),
    journeyBudget(journey),
    journeyHeatStyling(journey),
  ];
  for (const value of singles) if (value !== undefined && value !== null) answered += 1;

  // The cadence question: how often they want to be reminded to scan.
  if (Number.isFinite(journey.updateIntervalDays) && journey.updateIntervalDays > 0) answered += 1;

  return answered;
}

/**
 * The photograph each region of the head is read from. The same table
 * the report crops by: a region is reached when the turn kept the frame
 * that shows it, and not otherwise.
 */
const ANGLE_OF_REGION: Record<PhotoRegion, Angle> = {
  hairline: 'front',
  leftTemple: 'leftTemple',
  rightTemple: 'rightTemple',
  crown: 'crown',
  top: 'top',
};

const REGIONS: readonly PhotoRegion[] = ['hairline', 'leftTemple', 'rightTemple', 'crown', 'top'];

/** The regions a session's images reach, in the report's order. */
export function regionsCovered(session: Pick<PhotoSession, 'photos'>): PhotoRegion[] {
  const held = new Set(session.photos.map((p) => p.angle));
  return REGIONS.filter((region) => held.has(ANGLE_OF_REGION[region]));
}

/* -------------------------------- the dates ------------------------------ */

/** The same calendar day `months` later, as ISO. */
function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

/** How far ahead "three months side by side" looks, from the latest scan. */
export const SIDE_BY_SIDE_MONTHS = 3;

/* -------------------------------- the model ------------------------------ */

export function buildPlanModel(data: AppData): PlanModel {
  const session = latestSession(data);
  const journey = data.journey;
  const goal = journey ? journeyGoals(journey)[0] : undefined;

  const candidates: PlanCount[] = [
    { id: 'answers', value: answersGiven(data) },
    { id: 'frames', value: session ? session.photos.length : 0 },
    { id: 'regions', value: session ? regionsCovered(session).length : 0 },
    { id: 'tips', value: tipsFor(goal).length, goal },
    { id: 'routine', value: activeRoutineItems(data).length },
  ];
  const counts = candidates.filter((c) => c.value > 0);

  const due = nextUpdate(data);
  const nextScanISO = due?.dueISO ?? null;

  let threeMonthsISO: string | null = null;
  if (journey) {
    const from = session?.capturedAt ?? journey.startedAt;
    const threeMonths = addMonths(from, SIDE_BY_SIDE_MONTHS);
    // Only worth its own line when the next scan lands before it.
    if (nextScanISO === null || new Date(nextScanISO).getTime() < new Date(threeMonths).getTime()) {
      threeMonthsISO = threeMonths;
    }
  }

  return { counts, nextScanISO, threeMonthsISO };
}
