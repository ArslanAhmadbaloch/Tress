/**
 * What the scan report says, and where every word of it comes from.
 *
 * The report at the end of the funnel is built from one photograph and
 * the two readings the device took of it while the shutter was still
 * warm: the photograph's own quality — brightness, contrast, sharpness,
 * clipping — and, when the native segmenter is present, how much of the
 * frame the hair mask claims. Both are measurements of pixels. Neither
 * is a measurement of a person.
 *
 * ── The line ──────────────────────────────────────────────────────────
 * Every sentence here describes the picture: "hair covers 41% of the
 * upper frame", "evenly lit", "sharp". None of them describes the head in
 * it. A mask cannot see between strands, so area is not thickness; a
 * phone camera cannot stage anything, so a percentage is not a
 * classification. The tests sweep this file's output for the words that
 * would mean it had crossed over, and a report that fails them is not a
 * report this app ships.
 *
 * It is pure — a session in, a description out — so the screen that
 * renders it has nothing to decide and the tests need no device.
 */

import { daysBetween } from '@/lib/date';
import {
  activeRoutineItems,
  routineItemStats,
  sessionsChronological,
  type RoutineItemStat,
} from '@/store/selectors';
import {
  ANGLES,
  ANGLE_LABELS,
  missingAngles,
  type AppData,
  type Photo,
  type PhotoCoverage,
  type PhotoQuality,
  type PhotoSession,
} from '@/types/domain';

/**
 * A coverage reading as the domain stores it, plus the left/right split
 * the segmenter now also reports. Optional because photographs measured
 * before it existed carry no split, and the honest thing to show for
 * them is no balance reading rather than a guessed one.
 */
export type ScanCoverage = PhotoCoverage & { horizontalBalance?: number };

export type ReadingTone = 'good' | 'neutral' | 'attention';

/** A number the report draws as a ring. */
export type RingReading = {
  id: 'frame' | 'upper';
  /** 0–1, what the ring fills to. */
  value: number;
  /** The short label under the ring. */
  label: string;
  /** One sentence stating the measurement. */
  headline: string;
  /** What was measured, and what it is not. */
  detail: string;
};

/** A word the report draws as a tile: "Even", "Sharp", "Held". */
export type TileReading = {
  id: 'light' | 'sharpness' | 'detail' | 'balance';
  label: string;
  /** The short verdict, two words at most. */
  value: string;
  /** One sentence stating the measurement. */
  headline: string;
  /** The number behind it, and what to do if it is off. */
  detail: string;
  tone: ReadingTone;
};

/**
 * One line of the reading, in the section it belongs to.
 *
 * A note is either something that went well or something holding the
 * record back, and in both cases it is about a photograph, a date or a
 * tick. There is no third kind, because a note about the hair itself is
 * the thing this file exists to refuse.
 */
export type ReportNote = {
  id: string;
  /** The sentence. */
  headline: string;
  /** The measurement it came from. */
  detail: string;
  tone: ReadingTone;
  /**
   * True when this note sits beyond the free window. Depth only: the free
   * lines and the paid lines are the same lines in the same order, and
   * nothing shown free is corrected or qualified by anything hidden —
   * the notes that would qualify a free line are exempt from the window
   * by name (`NEVER_GATED`) rather than by where they happen to land.
   */
  premium: boolean;
};

/** A screen that carries out an action, when the action has one. */
export type ActionLink = {
  label: string;
  route: '/capture-intro' | '/routine' | '/journal';
};

export type ReportAction = {
  id: string;
  /** What to do, in the imperative. */
  headline: string;
  /** Why it is worth doing, and the number behind it. */
  detail: string;
  /** The id of the shortfall this answers. Every action answers one. */
  answers: string;
  link: ActionLink | null;
  premium: boolean;
};

export type ScanReading = {
  photo: Photo;
  /** The frame-area readings, drawn as rings. Empty without a segmenter. */
  rings: RingReading[];
  /** The photograph's own quality, drawn as tiles. Empty if unmeasured. */
  tiles: TileReading[];
  /**
   * The upper-frame band and the left/right split, as fractions of the
   * frame, for the overlay on the hero. Null when there is no coverage
   * reading — the overlay then draws nothing, because a band with no
   * number behind it is a decoration pretending to be a measurement.
   */
  overlay: {
    /** Fraction of the upper third counted as hair. */
    upperFraction: number;
    /** Fraction of the whole frame counted as hair. */
    fraction: number;
    /** Fraction of the hair area sitting left of centre, if measured. */
    leftShare: number | null;
  } | null;
  /** Why the rings are missing, when they are. Null when they are present. */
  coverageAbsent: { headline: string; detail: string } | null;
  /** Everything true and good the app can actually see. Most useful first. */
  strengths: ReportNote[];
  /**
   * What is holding the record back — never what is holding the person
   * back. Every one of these is about the photograph, the record or the
   * routine, and the moment one of them is about somebody's hair it is a
   * diagnosis this app is not entitled to make.
   */
  shortfalls: ReportNote[];
  /** One action per shortfall, in the same order. Empty when there are none. */
  actions: ReportAction[];
  /**
   * The capture-technique lines, at most three, most useful first. Older
   * than the three sections above and kept because the coach reads them
   * back when asked how to keep the next photograph the same.
   */
  nextTime: string[];
  /** The one-paragraph statement of what this reading is and is not. */
  scope: string;
};

/* ------------------------------- thresholds ------------------------------ */

/*
  These mirror image-quality.ts rather than importing its constants,
  because that module flags problems and this one describes readings —
  the bands here are wider, so a photograph that is a little dark is
  described as such without being flagged as unusable.
*/
const DARK = 60;
const DIM = 85;
const BRIGHT = 205;
const FLAT_CONTRAST = 18;
const SOFT = 6;
const CRISP = 12;
const CLIP_LIMIT = 0.12;
const CLIP_NOTICE = 0.04;

/** Below this the mask found so little hair that no area reading is honest. */
const EMPTY_MASK = 0.02;

/** A left/right split inside this band reads as square to the camera. */
const BALANCE_BAND = 0.06;

function pct(fraction: number): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * 100);
}

/* --------------------------------- rings --------------------------------- */

export function frameHeadline(coverage: Pick<ScanCoverage, 'fraction'>): string {
  return `Hair covers ${pct(coverage.fraction)}% of the frame.`;
}

export function upperHeadline(coverage: Pick<ScanCoverage, 'upperFraction'>): string {
  return `Hair covers ${pct(coverage.upperFraction)}% of the upper frame.`;
}

function coverageRings(coverage: ScanCoverage): RingReading[] {
  return [
    {
      id: 'frame',
      value: coverage.fraction,
      label: 'of the frame',
      headline: frameHeadline(coverage),
      detail:
        'The on-device segmenter marks each pixel as hair or not, and this is the share it marked. It measures area — how much of the photograph is hair — not how close together the strands are.',
    },
    {
      id: 'upper',
      value: coverage.upperFraction,
      label: 'of the upper frame',
      headline: upperHeadline(coverage),
      detail:
        'The top third of the photograph, which is where the hairline sits in a front shot. Next month’s photograph is lined up against this number, so the same framing matters more than the number itself.',
    },
  ];
}

/* --------------------------------- tiles --------------------------------- */

function lightTile(q: PhotoQuality): TileReading {
  const b = Math.round(q.brightness);
  const behind = `Mean brightness ${b} of 255.`;

  if (q.brightness < DARK) {
    return {
      id: 'light',
      label: 'Light',
      value: 'Dark',
      headline: 'The photograph came out dark.',
      detail: `${behind} Facing a window usually fixes it; matching the light next time matters more than having a lot of it.`,
      tone: 'attention',
    };
  }
  if (q.brightness < DIM) {
    return {
      id: 'light',
      label: 'Light',
      value: 'Low',
      headline: 'The photograph is a little dark.',
      detail: `${behind} Usable, and worth a brighter spot next time so the two line up.`,
      tone: 'neutral',
    };
  }
  if (q.brightness > BRIGHT) {
    return {
      id: 'light',
      label: 'Light',
      value: 'Bright',
      headline: 'The photograph came out very bright.',
      detail: `${behind} Direct sun and overhead spotlights wash out the scalp; softer, even light holds more detail.`,
      tone: 'attention',
    };
  }
  return {
    id: 'light',
    label: 'Light',
    value: 'Even',
    headline: 'Evenly lit.',
    detail: `${behind} Comfortably inside the range the comparison needs.`,
    tone: 'good',
  };
}

function sharpnessTile(q: PhotoQuality): TileReading {
  const s = q.sharpness.toFixed(1);
  const behind = `Edge response ${s}; under ${SOFT} reads as soft.`;

  if (q.sharpness < SOFT) {
    return {
      id: 'sharpness',
      label: 'Focus',
      value: 'Soft',
      headline: 'The photograph came out soft.',
      detail: `${behind} Bracing the phone against something, or asking somebody else to take it, is usually enough.`,
      tone: 'attention',
    };
  }
  if (q.sharpness < CRISP) {
    return {
      id: 'sharpness',
      label: 'Focus',
      value: 'Clear',
      headline: 'In focus.',
      detail: `${behind} Clear enough to compare; holding still a beat longer would sharpen it further.`,
      tone: 'good',
    };
  }
  return {
    id: 'sharpness',
    label: 'Focus',
    value: 'Sharp',
    headline: 'Sharp.',
    detail: `${behind} The detail the comparison relies on is all there.`,
    tone: 'good',
  };
}

function detailTile(q: PhotoQuality): TileReading {
  const clipped = pct(q.clipped);
  const c = Math.round(q.contrast);

  if (q.clipped > CLIP_LIMIT) {
    return {
      id: 'detail',
      label: 'Detail',
      value: 'Burnt',
      headline: 'Some highlights are burnt out.',
      detail: `${clipped}% of pixels are pure white or pure black. Detail lost that way cannot be recovered later, so softer light next time is worth it.`,
      tone: 'attention',
    };
  }
  if (q.contrast < FLAT_CONTRAST) {
    return {
      id: 'detail',
      label: 'Detail',
      value: 'Flat',
      headline: 'The light is very flat.',
      detail: `Contrast ${c}; under ${FLAT_CONTRAST} hides the texture the comparison relies on. A little directional light helps.`,
      tone: 'neutral',
    };
  }
  if (q.clipped > CLIP_NOTICE) {
    return {
      id: 'detail',
      label: 'Detail',
      value: 'Held',
      headline: 'Detail held, with a few bright spots.',
      detail: `${clipped}% of pixels are at the limit, contrast ${c}. Fine for now; avoiding a lamp behind you keeps it that way.`,
      tone: 'good',
    };
  }
  return {
    id: 'detail',
    label: 'Detail',
    value: 'Held',
    headline: 'Nothing burnt out.',
    detail: `${clipped}% of pixels at the limit, contrast ${c}. The whole range of the photograph survived.`,
    tone: 'good',
  };
}

/**
 * Where the hair area sits left to right.
 *
 * A framing reading, and only that. The two halves of a head square to
 * the camera hold about the same amount of hair; when one half holds
 * markedly more, the head was turned — which is worth knowing because
 * next month's photograph has to be turned the same way to compare.
 */
function balanceTile(coverage: ScanCoverage): TileReading | null {
  if (typeof coverage.horizontalBalance !== 'number') return null;

  const left = pct(coverage.horizontalBalance);
  const right = 100 - left;
  const behind = `${left}% of the hair area sits left of centre, ${right}% right.`;

  if (Math.abs(coverage.horizontalBalance - 0.5) <= BALANCE_BAND) {
    return {
      id: 'balance',
      label: 'Balance',
      value: 'Even',
      headline: 'Evenly balanced left to right.',
      detail: `${behind} The head was square to the camera, which is what makes next month comparable.`,
      tone: 'good',
    };
  }
  const side = coverage.horizontalBalance > 0.5 ? 'left' : 'right';
  return {
    id: 'balance',
    label: 'Balance',
    value: side === 'left' ? 'Left' : 'Right',
    headline: `More of the hair area sits to the ${side}.`,
    detail: `${behind} That usually means the head was turned a little; facing the camera squarely next time keeps the two readings comparable.`,
    tone: 'neutral',
  };
}

/* ------------------------------- next time ------------------------------- */

function nextTimeFor(tiles: TileReading[], coverage: ScanCoverage | null): string[] {
  const lines: string[] = [];

  // The most useful instruction on this screen, and the one that is true
  // whatever the readings said: the comparison depends on repetition.
  lines.push('Same spot, same time of day, same distance from the phone.');

  for (const t of tiles) {
    if (t.tone !== 'attention' && !(t.id === 'balance' && t.tone === 'neutral')) continue;
    if (t.id === 'light' && t.value === 'Dark') lines.push('Face a window, so the light comes from in front of you.');
    if (t.id === 'light' && t.value === 'Bright') lines.push('Step out of direct sun or the spotlight; softer light holds more detail.');
    if (t.id === 'sharpness') lines.push('Brace the phone, or hand it to somebody, so the shot is sharp.');
    if (t.id === 'detail') lines.push('Keep lamps and windows behind the phone rather than behind you.');
    if (t.id === 'balance') lines.push('Face the camera squarely, so both sides of the frame hold the same amount of hair.');
  }

  if (coverage && coverage.fraction < EMPTY_MASK) {
    lines.push('Fill the frame with your hair and hairline, so the reading has something to measure.');
  }

  return lines.slice(0, 3);
}

/* --------------------------- the three sections -------------------------- */

/*
  Positive first, then what is lagging, then what to do about it.

  The order is the whole argument. A reading that opens with shortfalls
  is a reading somebody closes, and a reading that only lists shortfalls
  is one they stop believing — there are always things a photograph got
  right, and saying them is not flattery when each one is a measurement.
  The middle section is the one with the strongest pull towards a claim
  about a head, so it is fenced by construction: every note in it comes
  from an angle that is missing, a date that passed, a tick that was not
  made, or a number taken off the pixels. Nothing in it can be about
  hair, because none of its inputs are.
*/

/** Days past the chosen interval before a set counts as late. */
const INTERVAL_GRACE = 3;
/** Brightness gap between two shots that makes the light a suspect. Mirrors image-quality.ts. */
const EXPOSURE_SHIFT = 38;
/** Degrees of extra turn between two shots before they stop being square to each other. */
const YAW_SHIFT = 12;
/** Share of its days an item has to be ticked on to be worth saying so about. */
const ROUTINE_KEPT = 70;
/** Below this share of days, an item is lagging rather than kept. */
const ROUTINE_LAGGING = 40;
/** Days an item has to have existed before either reading means anything. */
const ROUTINE_MIN_DAYS = 7;

/** How many notes of each section a reader without Premium sees. */
export const FREE_NOTES = 2;

/**
 * The notes that are never held back, whatever position they land in.
 *
 * Depth may sit behind the gate; a caveat may not. Each of these
 * qualifies something a free reader has already been told in front of
 * it — that the photograph is "comfortably inside the range the
 * comparison needs", that the head "was square to the camera, which is
 * what makes next month comparable", that there is an area reading at
 * all. Holding one back would leave the unpaid reading more confident
 * than the paid one about the same photograph, which is the one
 * direction this gate must never go. Counting by position cannot
 * promise that — an ordinary late single-angle set pushes the exposure
 * caveat to third — so these are exempt by name and do not consume a
 * free slot.
 */
const NEVER_GATED = new Set(['gap-exposure', 'gap-square', 'gap-mask']);

type Draft = Omit<ReportNote, 'premium'>;

/**
 * The free window, applied to one section.
 *
 * The first `FREE_NOTES` gateable notes are free and the rest are not,
 * so what Premium adds is more of the same lines in the same order.
 * Exempt notes are shown to everybody and are not counted, which is why
 * a free reading can hold more lines than the window suggests — never
 * fewer, and never a different line.
 */
function gateNotes(drafts: Draft[]): ReportNote[] {
  let shown = 0;
  return drafts.map((note) => {
    if (NEVER_GATED.has(note.id)) return { ...note, premium: false };
    const premium = shown >= FREE_NOTES;
    if (!premium) shown += 1;
    return { ...note, premium };
  });
}

/** Everything outside the photograph that the three sections read from. */
type RecordContext = {
  /** False when no record was passed — then nothing outside the photograph is claimed. */
  known: boolean;
  previous: PhotoSession | null;
  /** The previous set's photograph at the same angle, when there is one. */
  previousPhoto: Photo | null;
  gapDays: number | null;
  intervalDays: number | null;
  stats: RoutineItemStat[];
  hasStack: boolean;
  /** Journal entries written since the previous set. */
  notesSinceLast: number;
};

const NO_RECORD: RecordContext = {
  known: false,
  previous: null,
  previousPhoto: null,
  gapDays: null,
  intervalDays: null,
  stats: [],
  hasStack: false,
  notesSinceLast: 0,
};

function contextFor(
  session: PhotoSession,
  photo: Photo,
  data: AppData | undefined,
): RecordContext {
  if (!data) return NO_RECORD;

  const at = new Date(session.capturedAt).getTime();
  const earlier = sessionsChronological(data).filter(
    (s) => s.id !== session.id && new Date(s.capturedAt).getTime() < at,
  );
  const previous = earlier[earlier.length - 1] ?? null;

  return {
    known: true,
    previous,
    previousPhoto: previous?.photos.find((p) => p.angle === photo.angle) ?? null,
    gapDays: previous ? daysBetween(previous.capturedAt, session.capturedAt) : null,
    intervalDays: data.journey?.updateIntervalDays ?? null,
    stats: routineItemStats(data),
    hasStack: activeRoutineItems(data).length > 0,
    notesSinceLast: previous
      ? data.journal.filter(
          (e) => new Date(e.createdAt).getTime() > new Date(previous.capturedAt).getTime(),
        ).length
      : data.journal.length,
  };
}

/**
 * The share of its days an item was ticked on, counted from the two
 * numbers `daysLine` prints underneath it.
 *
 * `RoutineItemStat.daysDonePercent` is deliberately not used here. That
 * one divides by the days that have fully elapsed — today is left out of
 * the denominator until it is ticked, which is the fair way to score a
 * day that is not over. It is the wrong number to print above a line
 * that says "18 of the 21 days", because the reader cannot get from one
 * to the other, and a report whose working does not produce its own
 * figure is a black box on the one screen that claims not to be. Both
 * numerals on the screen come from here, so they always reconcile.
 */
function tickedShare(stat: RoutineItemStat): number {
  return Math.min(100, Math.round((stat.daysDone / Math.max(1, stat.daysTracked)) * 100));
}

function daysLine(stat: RoutineItemStat): string {
  return `${stat.daysDone} of the ${stat.daysTracked} days it has been in your stack.`;
}

/** The item kept best, and the one kept least, once each has a week behind it. */
function routineEnds(stats: RoutineItemStat[]): { kept: RoutineItemStat | null; lagging: RoutineItemStat | null } {
  const ranked = stats
    .filter((s) => s.daysTracked >= ROUTINE_MIN_DAYS)
    .sort((a, b) => tickedShare(b) - tickedShare(a));
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  return {
    kept: best && tickedShare(best) >= ROUTINE_KEPT ? best : null,
    lagging: worst && tickedShare(worst) < ROUTINE_LAGGING ? worst : null,
  };
}

/* ----------------------------- what went well ---------------------------- */

function strengthsFor(
  tiles: TileReading[],
  session: PhotoSession,
  ctx: RecordContext,
): Draft[] {
  const out: Draft[] = [];

  // The photograph first: it is the thing that just happened, and every
  // one of these sentences was already measured off its pixels.
  for (const tile of tiles) {
    if (tile.tone !== 'good') continue;
    out.push({ id: `well-${tile.id}`, tone: 'good', headline: tile.headline, detail: tile.detail });
  }

  const held = ANGLES.filter((a) => session.photos.some((p) => p.angle === a));
  if (held.length >= 2) {
    out.push({
      id: 'well-angles',
      tone: 'good',
      headline: `${held.length} of the five angles are on the record.`,
      detail: `${held.map((a) => ANGLE_LABELS[a]).join(', ')}. Each one has something for the next set to be laid beside.`,
    });
  }

  if (ctx.gapDays !== null && ctx.intervalDays !== null && ctx.gapDays <= ctx.intervalDays + INTERVAL_GRACE) {
    out.push({
      id: 'well-interval',
      tone: 'good',
      headline: `This set came ${ctx.gapDays} day${ctx.gapDays === 1 ? '' : 's'} after the last one.`,
      detail: `The interval you chose is ${ctx.intervalDays} days, so this one landed on the schedule you set. Sets taken to a schedule are the ones that can be compared without arguing about the gap.`,
    });
  }

  const { kept } = routineEnds(ctx.stats);
  if (kept) {
    out.push({
      id: 'well-routine',
      tone: 'good',
      headline: `You ticked ${kept.item.label} on ${tickedShare(kept)}% of its days.`,
      detail: `${daysLine(kept)} It counts the ticks you made, and says nothing about what they did.`,
    });
  }

  return out;
}

/* ------------------- what is holding the record back --------------------- */

function shortfallsFor(
  tiles: TileReading[],
  session: PhotoSession,
  photo: Photo,
  quality: PhotoQuality | null,
  coverageAbsent: { headline: string; detail: string } | null,
  ctx: RecordContext,
): Draft[] {
  const out: Draft[] = [];

  const missing = missingAngles(session);
  if (missing.length > 0) {
    const have = ANGLES.length - missing.length;
    out.push({
      id: 'gap-angles',
      tone: 'attention',
      headline: `Only ${have} of the five angles ${have === 1 ? 'is' : 'are'} on the record.`,
      detail: `No ${missing.map((a) => ANGLE_LABELS[a]).join(', ')} shot, so ${missing.length} of the five comparisons ${missing.length === 1 ? 'does' : 'do'} not exist yet.`,
    });
  }

  if (ctx.gapDays !== null && ctx.intervalDays !== null && ctx.gapDays > ctx.intervalDays + INTERVAL_GRACE) {
    out.push({
      id: 'gap-interval',
      tone: 'attention',
      headline: `The last set was ${ctx.gapDays} days ago, and the interval you chose is ${ctx.intervalDays} days.`,
      detail: `${ctx.gapDays - ctx.intervalDays} days over. The gap does no harm on its own — it only means these two photographs sit further apart than the schedule assumes.`,
    });
  }

  const before = ctx.previousPhoto?.quality;
  if (before && quality && Math.abs(quality.brightness - before.brightness) > EXPOSURE_SHIFT) {
    out.push({
      id: 'gap-exposure',
      tone: 'attention',
      headline: 'The last two photographs were lit differently.',
      detail: `Mean brightness ${Math.round(before.brightness)} last time, ${Math.round(quality.brightness)} this time, on a scale of 255. A difference you see between the two could be the light rather than anything in front of it.`,
    });
  }

  const poseBefore = ctx.previousPhoto?.pose;
  const poseNow = photo.pose;
  if (poseBefore && poseNow && Math.abs(Math.abs(poseNow.yaw) - Math.abs(poseBefore.yaw)) > YAW_SHIFT) {
    out.push({
      id: 'gap-square',
      tone: 'attention',
      headline: 'The head was turned further this time than last.',
      detail: `${Math.round(Math.abs(poseBefore.yaw))}° of turn then, ${Math.round(Math.abs(poseNow.yaw))}° now, measured by the detector as the shutter fired. The two are not square to each other, so what sits in the middle of one sits off-centre in the other.`,
    });
  }

  // The photograph's own shortfalls, in the words the tiles already use.
  for (const tile of tiles) {
    if (tile.tone === 'good') continue;
    out.push({ id: `gap-${tile.id}`, tone: tile.tone, headline: tile.headline, detail: tile.detail });
  }

  if (coverageAbsent === COVERAGE_EMPTY) {
    out.push({
      id: 'gap-mask',
      tone: 'attention',
      headline: `${COVERAGE_EMPTY.headline}.`,
      detail: COVERAGE_EMPTY.detail,
    });
  }

  // Nothing about a routine is claimed unless the record was handed over.
  if (ctx.known && !ctx.hasStack) {
    out.push({
      id: 'gap-stack',
      tone: 'attention',
      headline: 'There is nothing in your stack yet.',
      detail:
        'Without it these photographs carry no record of what you were doing when they were taken, which is the part that explains them a year from now.',
    });
  }

  const { lagging } = routineEnds(ctx.stats);
  if (lagging) {
    out.push({
      id: 'gap-routine',
      tone: 'attention',
      headline: `You ticked ${lagging.item.label} on ${tickedShare(lagging)}% of its days.`,
      detail: `${daysLine(lagging)} It is the one in your stack with the most days unticked behind it.`,
    });
  }

  if (ctx.known && ctx.previous && ctx.notesSinceLast === 0) {
    out.push({
      id: 'gap-journal',
      tone: 'neutral',
      headline: 'Nothing was written in the journal between these two sets.',
      detail:
        'A photograph records what a month looked like. A note is the only thing that records what you changed during it.',
    });
  }

  return out;
}

/* ---------------------------- what to do next ---------------------------- */

/** An action, plus the subject it covers, so two shortfalls cannot ask for the same thing twice. */
type ActionDraft = Omit<ReportAction, 'premium' | 'answers'> & { topic: string };

function actionFor(
  gap: Draft,
  session: PhotoSession,
  tiles: TileReading[],
  ctx: RecordContext,
): ActionDraft | null {
  const tile = (id: TileReading['id']) => tiles.find((t) => t.id === id);

  switch (gap.id) {
    case 'gap-angles': {
      const missing = missingAngles(session);
      return {
        id: 'do-angles',
        topic: 'angles',
        headline: `Take the ${missing.length} remaining angle${missing.length === 1 ? '' : 's'}.`,
        detail: `${missing.map((a) => ANGLE_LABELS[a]).join(', ')}. Each one you add gives the next set something to be laid beside.`,
        link: { label: 'Take the remaining angles', route: '/capture-intro' },
      };
    }
    case 'gap-interval':
      return {
        id: 'do-interval',
        topic: 'interval',
        headline: 'Take the next set on the day it falls due.',
        detail: `Your interval is ${ctx.intervalDays} days, counted from the last set. Settings is where the reminder for it lives.`,
        link: { label: 'Take a set now', route: '/capture-intro' },
      };
    case 'gap-exposure':
      return {
        id: 'do-exposure',
        topic: 'light',
        headline: 'Shoot the next one in the light you used before.',
        detail:
          'Same window, same time of day. Matching the light between two photographs matters more than having a lot of it.',
        link: null,
      };
    case 'gap-square':
      return {
        id: 'do-square',
        topic: 'square',
        headline: 'Face the camera squarely next time.',
        detail: 'Chin level, nose at the lens, so the two photographs sit at the same angle to each other.',
        link: null,
      };
    case 'gap-light': {
      const value = tile('light')?.value;
      return {
        id: 'do-light',
        topic: 'light',
        headline:
          value === 'Bright'
            ? 'Step out of the direct sun or the spotlight.'
            : 'Face a window, so the light comes from in front of you.',
        detail:
          value === 'Bright'
            ? 'Softer, even light holds the detail the comparison is drawn from.'
            : 'Matching the light between two photographs matters more than having a lot of it.',
        link: null,
      };
    }
    case 'gap-sharpness':
      return {
        id: 'do-sharpness',
        topic: 'focus',
        headline: 'Brace the phone, or hand it to somebody.',
        detail: 'A photograph that came out soft cannot be sharpened afterwards; it can only be taken again.',
        link: null,
      };
    case 'gap-detail':
      return {
        id: 'do-detail',
        topic: 'detail',
        headline:
          tile('detail')?.value === 'Flat'
            ? 'Let the light come from one side rather than everywhere.'
            : 'Keep lamps and windows behind the phone rather than behind you.',
        detail:
          tile('detail')?.value === 'Flat'
            ? 'Flat light hides the texture the comparison is drawn from.'
            : 'Detail burnt out by a light behind you is gone from the file, not merely hidden in it.',
        link: null,
      };
    case 'gap-balance':
      return {
        id: 'do-balance',
        topic: 'square',
        headline: 'Face the camera squarely, so both sides of the frame hold the same amount of hair.',
        detail: 'A head turned a little puts the same hair in a different place, which is what breaks the pair.',
        link: null,
      };
    case 'gap-mask':
      return {
        id: 'do-mask',
        topic: 'framing',
        headline: 'Fill the frame with your hair and hairline.',
        detail:
          'Hold the phone a little further back and tilt it so the hairline sits in the upper third, which is the band the area reading is counted over.',
        link: null,
      };
    case 'gap-stack':
      return {
        id: 'do-stack',
        topic: 'routine',
        headline: 'Add what you already use to your stack.',
        detail: 'Two or three things you actually do is enough for the photographs to arrive with context attached.',
        link: { label: 'Open your routine', route: '/routine' },
      };
    case 'gap-routine': {
      const { lagging } = routineEnds(ctx.stats);
      if (!lagging) return null;
      /*
        Where an item sits in the day is a setting in the routine screen
        and entirely the person's to move. How much of it they take is
        not: routine.tsx:66-68 says plainly that dosing is a decision
        this app is in no position to guess at, and an action here that
        suggested asking less of an item — the label is very often a
        medication — would be this file quietly taking that decision.
      */
      return {
        id: 'do-routine',
        topic: 'routine',
        headline: `Move ${lagging.item.label} to a different time of day in your routine.`,
        detail: `Ticked on ${tickedShare(lagging)}% of its days so far. When in the day an item sits is a setting, and moving it is a change entirely in your hands. How much of it you use is a dosing question, and this app makes no suggestion about that.`,
        link: { label: 'Open your routine', route: '/routine' },
      };
    }
    case 'gap-journal':
      return {
        id: 'do-journal',
        topic: 'journal',
        headline: 'Write down what you changed this month.',
        detail: 'One line is enough: a product started, a week missed, a haircut. It is what makes the next set readable.',
        link: { label: 'Open your journal', route: '/journal' },
      };
    default:
      return null;
  }
}

function actionsFor(
  shortfalls: ReportNote[],
  session: PhotoSession,
  tiles: TileReading[],
  ctx: RecordContext,
): ReportAction[] {
  const out: ReportAction[] = [];
  const covered = new Set<string>();

  for (const gap of shortfalls) {
    const draft = actionFor(gap, session, tiles, ctx);
    if (!draft || covered.has(draft.topic)) continue;
    covered.add(draft.topic);
    // An action is shown to exactly the readers who were shown the
    // shortfall it answers, so a free reading never asks somebody to fix
    // something it did not tell them about.
    out.push({
      id: draft.id,
      headline: draft.headline,
      detail: draft.detail,
      link: draft.link,
      answers: gap.id,
      premium: gap.premium,
    });
  }

  return out;
}

/* -------------------------------- the gate ------------------------------- */

export type GatedReading = {
  strengths: ReportNote[];
  shortfalls: ReportNote[];
  actions: ReportAction[];
  /** What is being held back, when anything is. Null for a full reading. */
  locked: { count: number; headline: string; detail: string } | null;
};

function countOf(n: number, one: string, many: string): string {
  return `${n} more ${n === 1 ? one : many}`;
}

/**
 * The free reading, and an honest account of what is not in it.
 *
 * Depth is what Premium adds: the same sections in the same order, cut
 * off after the first couple of gateable lines. What that buys is never
 * a correction — no figure here is revised behind the gate, no caveat
 * about a free figure is hidden behind it (see `NEVER_GATED`), and no
 * hidden line is a verdict about somebody's hair, because no line
 * anywhere in this file is. The count in the teaser is the real count of
 * real notes that already exist in the reading it was built from.
 *
 * Both sections are cut the same way on purpose. Truncating the
 * shortfalls alone would leave a free reader with nothing but good news,
 * which is a more flattering report and a less honest one.
 */
export function gateReading(reading: ScanReading, unlocked: boolean): GatedReading {
  if (unlocked) {
    return {
      strengths: reading.strengths,
      shortfalls: reading.shortfalls,
      actions: reading.actions,
      locked: null,
    };
  }

  const strengths = reading.strengths.filter((n) => !n.premium);
  const shortfalls = reading.shortfalls.filter((n) => !n.premium);
  const actions = reading.actions.filter((a) => !a.premium);

  const hiddenStrengths = reading.strengths.length - strengths.length;
  const hiddenShortfalls = reading.shortfalls.length - shortfalls.length;
  const hiddenActions = reading.actions.length - actions.length;
  const count = hiddenStrengths + hiddenShortfalls + hiddenActions;
  if (count === 0) return { strengths, shortfalls, actions, locked: null };

  const parts: string[] = [];
  if (hiddenStrengths > 0) parts.push(countOf(hiddenStrengths, 'reading that came out well', 'readings that came out well'));
  if (hiddenShortfalls > 0) parts.push(countOf(hiddenShortfalls, 'thing holding the record back', 'things holding the record back'));
  if (hiddenActions > 0) parts.push(countOf(hiddenActions, 'thing to do about it', 'things to do about it'));
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

  return {
    strengths,
    shortfalls,
    actions,
    locked: {
      count,
      headline: `${count} more line${count === 1 ? '' : 's'} in the full reading.`,
      detail: `${list[0].toUpperCase()}${list.slice(1)}, each one measured the same way as the lines above. All of it is about this photograph, your record and your routine — the full reading makes no judgement about your hair, and neither does this one.`,
    },
  };
}

/* ------------------------------- the reading ----------------------------- */

const SCOPE_WITH_COVERAGE =
  'Everything above was measured on this device from the pixels in this photograph. It is a reading of the picture, not of your hair — area is not thickness, and one photograph cannot show change. It becomes useful the moment there is a second one to set beside it.';

const SCOPE_WITHOUT_COVERAGE =
  'Everything above was measured on this device from the pixels in this photograph. It is a reading of the picture, not of your hair, and one photograph cannot show change. It becomes useful the moment there is a second one to set beside it.';

export const COVERAGE_UNAVAILABLE = {
  headline: 'The area reading runs in the full app',
  detail:
    'The hair-area reading needs the on-device segmenter, which is installed in the full app build and not in this one. This build measured the photograph itself — light, focus and detail — and nothing was invented to fill the gap.',
};

export const COVERAGE_EMPTY = {
  headline: 'Too little hair area in the frame to read',
  detail:
    'The segmenter found almost no hair area in this frame, so no ring is drawn from it. That usually means the hair was out of frame, covered, or the light was too low for the model to read.',
};

/** The photograph the report is about: the front shot, or the first one that was measured. */
export function heroPhoto(session: PhotoSession): Photo | null {
  if (session.photos.length === 0) return null;
  return (
    session.photos.find((p) => p.angle === 'front' && p.coverage) ??
    session.photos.find((p) => p.coverage) ??
    session.photos.find((p) => p.angle === 'front') ??
    session.photos[0]
  );
}

/**
 * The reading for one set.
 *
 * `data` is optional, and what it changes is the reach of the middle two
 * sections rather than their honesty: without it the reading describes
 * the photograph alone, and never says a word about intervals, stacks or
 * journals it has not been shown. Callers that only have a session in
 * hand — the coach, the quality tests — keep working unchanged and keep
 * getting a reading that claims nothing it cannot see.
 */
export function buildScanReading(session: PhotoSession, data?: AppData): ScanReading | null {
  const photo = heroPhoto(session);
  if (!photo) return null;

  const quality = photo.quality ?? null;
  const coverage = (photo.coverage as ScanCoverage | undefined) ?? null;

  const tiles: TileReading[] = quality
    ? [lightTile(quality), sharpnessTile(quality), detailTile(quality)]
    : [];

  const usable = coverage !== null && coverage.fraction >= EMPTY_MASK;
  const rings = usable ? coverageRings(coverage) : [];
  const balance = usable ? balanceTile(coverage) : null;
  if (balance) tiles.push(balance);

  const coverageAbsent = coverage === null ? COVERAGE_UNAVAILABLE : usable ? null : COVERAGE_EMPTY;
  const ctx = contextFor(session, photo, data);

  const strengths = gateNotes(strengthsFor(tiles, session, ctx));
  const shortfalls = gateNotes(
    shortfallsFor(tiles, session, photo, quality, coverageAbsent, ctx),
  );

  return {
    photo,
    rings,
    tiles,
    strengths,
    shortfalls,
    actions: actionsFor(shortfalls, session, tiles, ctx),
    overlay: usable
      ? {
          upperFraction: coverage.upperFraction,
          fraction: coverage.fraction,
          leftShare:
            typeof coverage.horizontalBalance === 'number' ? coverage.horizontalBalance : null,
        }
      : null,
    coverageAbsent,
    nextTime: nextTimeFor(tiles, coverage),
    scope: usable ? SCOPE_WITH_COVERAGE : SCOPE_WITHOUT_COVERAGE,
  };
}

/** Every sentence a reading can show, for the honesty sweep in the tests. */
export function readingSentences(reading: ScanReading): string[] {
  return [
    ...reading.rings.flatMap((r) => [r.label, r.headline, r.detail]),
    ...reading.tiles.flatMap((t) => [t.label, t.value, t.headline, t.detail]),
    ...(reading.coverageAbsent
      ? [reading.coverageAbsent.headline, reading.coverageAbsent.detail]
      : []),
    ...reading.strengths.flatMap((n) => [n.headline, n.detail]),
    ...reading.shortfalls.flatMap((n) => [n.headline, n.detail]),
    ...reading.actions.flatMap((a) => [a.headline, a.detail, ...(a.link ? [a.link.label] : [])]),
    ...reading.nextTime,
    reading.scope,
  ];
}

/** The same sweep, over what a reader without Premium is told is missing. */
export function lockedSentences(gated: GatedReading): string[] {
  return gated.locked ? [gated.locked.headline, gated.locked.detail] : [];
}
