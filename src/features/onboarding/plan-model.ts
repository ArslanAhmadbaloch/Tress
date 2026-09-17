/**
 * What the plan sequence says while the constellations form, and the
 * dates it names.
 *
 * The screen after the funnel's report shows one short figure at a time
 * on a dark ground — "1 cm", "2–7 years", "50–100" — with a line beneath
 * that says what the figure is. The reference product counts its own
 * catalogue there ("47,750 products", "3,408 of them match your skin
 * type"), which is a number about a database dressed as a number about
 * a person. Tress says two kinds of thing instead, and nothing else:
 *
 *   - facts about hair that hold for everybody, each with its source in
 *     a comment beside it, worded as what is known and never as what
 *     this person's hair will do;
 *   - counts of what is already in the record on this phone: the
 *     hairstyles the catalogue holds for the hair type they told us,
 *     the funnel questions they answered, the images the scan kept and
 *     the regions of the head those images reach.
 *
 * A count of zero is left out rather than rolled up to nothing. Nothing
 * here is an efficacy figure, a match score or a forecast, and the test
 * in scripts/test/plan.test.ts holds every count to the record it was
 * taken from and every fact to the wording a source supports.
 *
 * The sky is here too: the seven stars of the Big Dipper, the shape the
 * field condenses into when the facts are done, as catalogue positions
 * with a flat projection — so the finale is the real asterism and not a
 * shape drawn to look like one.
 *
 * The two dates the text sequence names are the record's own: the day
 * the next scan is due, from the cadence the person chose, and the day
 * three months of scans could sit side by side. Both are stated as what
 * the record will hold by then — never as what their hair will look
 * like.
 *
 * Pure: no React, nothing native. Loaded by `node --test`.
 */

import { hairstyleCountFor } from '@/features/hairstyles';
import { latestSession, nextUpdate } from '@/store/selectors';
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
  type HairType,
  type PhotoRegion,
  type PhotoSession,
} from '@/types/domain';

/* -------------------------------- shapes -------------------------------- */

/**
 * The three things the record line counts: what the person put on the
 * record themselves. Notes the app chose and routine steps it suggested
 * are the app's doing, not theirs, so they are not counted here.
 */
export type PlanCountId = 'answers' | 'frames' | 'regions';

export type PlanCount = {
  id: PlanCountId;
  /** A count of something in the record. Always at least one. */
  value: number;
};

/**
 * One figure the constellation scene shows, in order:
 *
 *   styles    — how many hairstyles the catalogue holds for their hair type
 *   growth    — hair grows about 1 cm a month
 *   lifespan  — a strand grows for 2 to 7 years before it sheds
 *   shedding  — 50 to 100 hairs shed every day
 *   review    — dermatologists judge a change over 3 to 6 months
 *   record    — the answers, images and regions on the record
 */
export type PlanFactId = 'styles' | 'growth' | 'lifespan' | 'shedding' | 'review' | 'record';

export type PlanFact = {
  id: PlanFactId;
  /**
   * The large text: a short phrase whose digits roll. Never a number
   * invented for the screen — either a constant from a cited source, or
   * a count of the record.
   */
  headline: string;
  /** The catalogue count, on `styles`; the answers count, on `record`. */
  value?: number;
  /** The hair type the styles were counted for, when they told us one. */
  hairType?: HairType;
  /** The record's counts folded into the `record` line, above zero only. */
  counts?: PlanCount[];
};

/* ---------------------------- the hair facts ---------------------------- */

/**
 * The constants the facts are built from. Each is what a source says,
 * rounded the way the source itself rounds; the copy turns them into a
 * sentence and never into a promise about one head.
 */
export const HAIR_FACTS = {
  /**
   * Scalp hair grows on average about 0.35 mm a day, close to 1 cm a
   * month (Loussouarn G. et al., "Diversity of hair growth profiles",
   * Int J Dermatol 2005; 44 Suppl 1: 6–9: mean growth rates 0.26–0.44
   * mm/day across the groups measured). Said as "about", because the
   * spread across people is real.
   */
  growthCmPerMonth: 1,
  /**
   * The growing (anagen) phase of a scalp hair lasts years before the
   * strand sheds: dermatology references give 2 to 7 years (American
   * Academy of Dermatology patient pages on hair shedding; Paus R,
   * Cotsarelis G. "The biology of hair follicles", NEJM 1999; 341:
   * 491–497 give 2 to 6). The wider range is used so the line is never
   * narrower than a source.
   */
  anagenYears: { from: 2, to: 7 },
  /**
   * Shedding 50 to 100 hairs a day is normal (American Academy of
   * Dermatology, "Do you have hair loss or hair shedding?": "It's
   * normal to shed between 50 and 100 hairs a day").
   */
  shedPerDay: { from: 50, to: 100 },
  /**
   * The interval clinicians use before judging whether a change has
   * happened: topical minoxidil labelling asks for at least four months
   * of use before an assessment (FDA OTC monograph, 21 CFR 310.527, and
   * product labels); NICE CKS "Alopecia, androgenetic" advises reviewing
   * treatment after 3–6 months. Said as what dermatologists do, never as
   * when this person will see anything.
   */
  reviewMonths: { from: 3, to: 6 },
} as const;

/* ------------------------------- the sky -------------------------------- */

/**
 * The seven stars the field condenses into when the last fact has been
 * read: the Big Dipper, the asterism in Ursa Major, in its real
 * proportions.
 *
 * Positions are J2000 right ascension (hours) and declination (degrees)
 * from the Hipparcos catalogue as SIMBAD publishes them (HIP 54061,
 * 53910, 58001, 59774, 62956, 65378, 67301). The scene projects them onto
 * a plane about the asterism's mean declination — the same flat map any
 * star chart draws — so the bowl and the handle keep the shape a person
 * knows from the sky, with north up and east to the left as a chart has
 * it. Bowl first, then the handle from the bowl's rim to its tip.
 *
 * `mag` is the visual (V) magnitude SIMBAD lists for each — Alioth and
 * Dubhe the brightest, Megrez at the bowl's inner corner the faintest —
 * so the seven are drawn at the sizes the sky gives them, not the sizes
 * a seed happened to deal.
 */
export const BIG_DIPPER = [
  { name: 'Dubhe', ra: 11.0621, dec: 61.751, mag: 1.79 },
  { name: 'Merak', ra: 11.0307, dec: 56.3824, mag: 2.37 },
  { name: 'Phecda', ra: 11.8972, dec: 53.6948, mag: 2.44 },
  { name: 'Megrez', ra: 12.2571, dec: 57.0326, mag: 3.31 },
  { name: 'Alioth', ra: 12.9005, dec: 55.9598, mag: 1.77 },
  { name: 'Mizar', ra: 13.3988, dec: 54.9254, mag: 2.23 },
  { name: 'Alkaid', ra: 13.7923, dec: 49.3133, mag: 1.86 },
] as const;

export type DipperStar = {
  name: string;
  x: number;
  y: number;
  /**
   * How large to draw it next to the brightest of the seven, 0–1: the
   * radius a star reads at goes with the square root of its light, and
   * a magnitude step is a factor of 10^0.4 in light, so the radius falls
   * by 10^-0.2 for every magnitude fainter than the brightest.
   */
  brightness: number;
};

export type Dipper = {
  /** Unit coordinates: x across the width, y down the height, each 0–1. */
  stars: DipperStar[];
  /** The lines a chart draws: round the bowl, then along the handle. */
  edges: [number, number][];
  /** The figure's width over its height, so a box can keep its shape. */
  aspect: number;
};

/**
 * The asterism as a flat figure. Right ascension is turned into degrees
 * and foreshortened by the cosine of the mean declination, as a chart
 * does near the pole; east (greater right ascension) runs left; higher
 * declination runs up. The figure is then scaled so its longer side is
 * one, with the aspect kept beside it.
 */
export function bigDipper(): Dipper {
  const meanDec = BIG_DIPPER.reduce((sum, s) => sum + s.dec, 0) / BIG_DIPPER.length;
  const squash = Math.cos((meanDec * Math.PI) / 180);
  const flat = BIG_DIPPER.map((s) => ({ name: s.name, x: -s.ra * 15 * squash, y: -s.dec }));
  const minX = Math.min(...flat.map((s) => s.x));
  const maxX = Math.max(...flat.map((s) => s.x));
  const minY = Math.min(...flat.map((s) => s.y));
  const maxY = Math.max(...flat.map((s) => s.y));
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const brightest = Math.min(...BIG_DIPPER.map((s) => s.mag));
  const stars = flat.map((s, i) => ({
    name: s.name,
    x: (s.x - minX) / spanX,
    y: (s.y - minY) / spanY,
    brightness: 10 ** (-0.2 * (BIG_DIPPER[i].mag - brightest)),
  }));
  // Dubhe–Merak–Phecda–Megrez round the bowl, Megrez–Alioth–Mizar–Alkaid down the handle.
  const edges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [3, 4],
    [4, 5],
    [5, 6],
  ];
  return { stars, edges, aspect: spanX / spanY };
}

export type PlanModel = {
  /** In the order the scene shows them. Only figures with something to say. */
  facts: PlanFact[];
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

/**
 * The record's own counts, above zero, in the order the record line
 * lists them: the funnel questions answered, the images the latest scan
 * kept, and the regions of the head those images reach.
 */
export function recordCounts(data: AppData): PlanCount[] {
  const session = latestSession(data);
  const candidates: PlanCount[] = [
    { id: 'answers', value: answersGiven(data) },
    { id: 'frames', value: session ? session.photos.length : 0 },
    { id: 'regions', value: session ? regionsCovered(session).length : 0 },
  ];
  return candidates.filter((c) => c.value > 0);
}

export function buildPlanModel(data: AppData): PlanModel {
  const session = latestSession(data);
  const journey = data.journey;
  const facts = planFacts(data, recordCounts(data));

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

  return { facts, nextScanISO, threeMonthsISO };
}

/** The dash between two numbers, so "2–7" reads as a range and not a minus. */
export const RANGE_DASH = '–';

/**
 * The figures the scene shows, in order. The catalogue count comes from
 * the hairstyles feature (src/features/hairstyles) and is left out when
 * it has nothing for the hair type they told us; the record line is
 * left out before there is a record. The four hair facts are always there — they are true of
 * everybody's hair, so they are the one thing the scene can say about
 * a person it has never met.
 */
export function planFacts(data: AppData, counts: PlanCount[]): PlanFact[] {
  const facts: PlanFact[] = [];
  const styles = hairstyleCountFor(data);
  const hairType = data.journey ? journeyHairType(data.journey) : undefined;
  if (styles > 0) {
    facts.push({ id: 'styles', headline: `${styles} ${styles === 1 ? 'style' : 'styles'}`, value: styles, hairType });
  }

  const f = HAIR_FACTS;
  facts.push({ id: 'growth', headline: `${f.growthCmPerMonth} cm` });
  facts.push({ id: 'lifespan', headline: `${f.anagenYears.from}${RANGE_DASH}${f.anagenYears.to} years` });
  facts.push({ id: 'shedding', headline: `${f.shedPerDay.from}${RANGE_DASH}${f.shedPerDay.to}` });
  facts.push({ id: 'review', headline: `${f.reviewMonths.from}${RANGE_DASH}${f.reviewMonths.to} months` });

  // The record line folds the record's own counts — answers, images and
  // regions — into one line, led by the first of them that is above zero.
  if (counts.length > 0) {
    const lead = counts[0];
    const noun = lead.id === 'answers' ? 'answer' : lead.id === 'frames' ? 'image' : 'region';
    facts.push({
      id: 'record',
      headline: `${lead.value} ${noun}${lead.value === 1 ? '' : 's'}`,
      value: lead.value,
      counts,
    });
  }
  return facts;
}
