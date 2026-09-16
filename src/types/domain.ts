/**
 * Tress domain model.
 *
 * Shaped so it can move to Supabase without a rewrite: every entity has
 * a string id and ISO-8601 timestamps, and relationships are by id
 * rather than by nesting. Photo files stay on disk; only their URIs and
 * metadata live in the record.
 */

/** The five standardised capture angles, in the order they're shot. */
/**
 * Capture order, matching the guided capture design: top, both sides,
 * back, then hairline. The keys are storage identifiers and never change,
 * so sessions saved under the old order still load; only the order and
 * the labels are presentation.
 */
export const ANGLES = [
  'top',
  'leftTemple',
  'rightTemple',
  'crown',
  'front',
] as const;

export type Angle = (typeof ANGLES)[number];

export const ANGLE_LABELS: Record<Angle, string> = {
  top: 'Top',
  leftTemple: 'Left Side',
  rightTemple: 'Right Side',
  crown: 'Back',
  front: 'Hairline',
};

/** Shown during guided capture, one per angle. */
export const ANGLE_GUIDANCE: Record<
  Angle,
  { instruction: string; tips: string[] }
> = {
  front: {
    instruction: 'Face the camera with your hair off your forehead so the hairline shows.',
    tips: [
      'Head level, eyes forward',
      'Hair in its normal position',
      'Keep the same distance each time',
    ],
  },
  leftTemple: {
    instruction: 'Turn your head to the right to show your left side.',
    tips: ['Rotate about 45°', 'Keep your chin level', 'Same side every session'],
  },
  rightTemple: {
    instruction: 'Turn your head to the left to show your right side.',
    tips: ['Rotate about 45°', 'Keep your chin level', 'Mirror your left angle'],
  },
  crown: {
    instruction: 'Tilt your head forward and capture the back and crown.',
    tips: ['Chin toward your chest', 'Camera above your head', 'Hold steady'],
  },
  top: {
    instruction: 'Hold your phone above your head and capture a clear top view.',
    tips: ['Camera directly overhead', 'Part your hair as usual', 'Even lighting'],
  },
};

/* ------------------------------------------------------------------ */

export type TrackingArea =
  | 'hairline'
  | 'crown'
  | 'overallThinning'
  | 'diffuseThinning'
  | 'shedding'
  | 'density'
  | 'transplantRecovery'
  | 'generalChanges'
  /* The ways it tends to show up on longer hair. */
  | 'widerPart'
  | 'ponytail'
  | 'edges'
  | 'breakage';

/**
 * What better hair would mean to them.
 *
 * Asked first, before anything about hair itself. Someone says "hair loss"
 * and means "I want to stop thinking about it every time I pass a mirror";
 * the second is the thing worth building around, and it is theirs to name
 * rather than ours to assume.
 */
export type Motivation =
  | 'confidence'
  | 'myself'
  | 'photos'
  | 'worry'
  | 'comfort'
  | 'understand'
  | 'other';

/**
 * The change they most hope to see.
 *
 * Recorded as an aspiration they stated, and shown back to them as one.
 * The app never treats it as a forecast: whether anybody's hair actually
 * changes depends on why it is changing and what they do about it, and
 * nothing here can promise an outcome.
 */
export type HairGoal =
  | 'fullness'
  | 'hairline'
  | 'crown'
  | 'shedding'
  | 'overall'
  | 'routineWorking'
  | 'unsure'
  | 'narrowerPart'
  | 'fullerPonytail'
  | 'lessBreakage';

/** When they first noticed something changing. */
export type Onset =
  | 'recently'
  | 'months'
  | 'halfYear'
  | 'twoYears'
  | 'longer'
  | 'unsure';

/** The moments that bring it to mind. The real-life trigger, not a severity. */
export type Trigger =
  | 'mirror'
  | 'photos'
  | 'lighting'
  | 'styling'
  | 'shower'
  | 'future'
  | 'none'
  | 'parting'
  | 'tyingUp'
  | 'brushing';

/** What they are already doing. Recorded, never judged or recommended. */
export type Approach =
  | 'topical'
  | 'prescription'
  | 'supplements'
  | 'haircare'
  | 'clinic'
  | 'transplant'
  | 'nothing'
  | 'figuring';

/**
 * A treatment the user tells us they are already using.
 *
 * This list exists so someone can tick what they take instead of typing it,
 * and so their routine can carry the real name rather than "Prescription
 * medication". It is a vocabulary for recording, never a menu of options:
 * the app does not rank these, comment on them, suggest one to anybody, or
 * hold any opinion about doses or schedules. Anything not listed goes in as
 * free text under `other`.
 */
export type Medication =
  | 'minoxidilTopical'
  | 'finasterideOral'
  | 'minoxidilOral'
  | 'finasterideTopical'
  | 'dutasteride'
  | 'spironolactone'
  | 'ketoconazole'
  | 'iron'
  | 'hormonal'
  | 'other'
  | 'none';

/**
 * Which reference photographs to show.
 *
 * It decides nothing about the person's hair and nothing about what the
 * app records — only whose head appears in the examples of framing, and
 * the wording alongside them. Somebody photographing their own crown is
 * better served by an example that looks like them.
 *
 * Absent means male, because that is the set the app shipped with and an
 * existing journey should not change under anybody.
 */
export type Gender = 'male' | 'female';

export const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
};

/** How consistent they feel they have been. Their own estimate. */
export type SelfConsistency = 'very' | 'mostly' | 'onOff' | 'forget' | 'notStarted';

/**
 * Display names for the onboarding answers.
 *
 * Kept beside the types rather than in the onboarding screens, because
 * the journey card shows the same answers back to the user months later
 * and the two must never drift into different wording.
 */
export const TRACKING_AREA_LABELS: Record<TrackingArea, string> = {
  hairline: 'Hairline',
  crown: 'Crown',
  overallThinning: 'Overall thinning',
  diffuseThinning: 'Diffuse thinning',
  shedding: 'Shedding',
  density: 'Hair density',
  transplantRecovery: 'Transplant recovery',
  generalChanges: 'General changes',
  widerPart: 'My part looks wider',
  ponytail: 'My ponytail feels thinner',
  edges: 'My edges or temples',
  breakage: 'Breakage and damage',
};

export const MOTIVATION_LABELS: Record<Motivation, string> = {
  confidence: 'Feel more confident',
  myself: 'Feel like myself again',
  photos: 'Look better in photos',
  worry: 'Stop worrying about my hair',
  comfort: 'Feel comfortable with my appearance',
  understand: "Just understand what's happening",
  other: 'Something else',
};

export const HAIR_GOAL_LABELS: Record<HairGoal, string> = {
  fullness: 'More fullness',
  hairline: 'A stronger-looking hairline',
  crown: 'More density at the crown',
  shedding: 'Less shedding',
  overall: 'Better-looking overall hair',
  routineWorking: 'Knowing whether my routine is working',
  unsure: "I'm not sure yet",
  narrowerPart: 'A part that looks less wide',
  fullerPonytail: 'A fuller ponytail',
  lessBreakage: 'Less breakage',
};

export const ONSET_LABELS: Record<Onset, string> = {
  recently: 'Recently',
  months: 'A few months ago',
  halfYear: '6–12 months ago',
  twoYears: '1–2 years ago',
  longer: 'More than 2 years ago',
  unsure: "I'm not sure",
};

export const TRIGGER_LABELS: Record<Trigger, string> = {
  mirror: 'Looking in the mirror',
  photos: 'Taking photos',
  lighting: 'Bright lighting',
  styling: 'Styling my hair',
  shower: 'Seeing my hair after showering',
  future: 'Thinking about the future',
  none: "It doesn't really bother me",
  parting: 'Parting my hair',
  tyingUp: 'Tying it up',
  brushing: 'Brushing or washing it',
};

export const APPROACH_LABELS: Record<Approach, string> = {
  topical: 'Topical treatments',
  prescription: 'Prescription medication',
  supplements: 'Supplements',
  haircare: 'Hair-care routine',
  clinic: 'Dermatologist or clinic',
  transplant: 'Hair transplant',
  nothing: 'Nothing yet',
  figuring: "I'm still figuring it out",
};

/**
 * How each treatment is named, everywhere it appears.
 *
 * Generic names only. A brand name would read as an endorsement of one
 * manufacturer, and the person ticking the box may well be using a
 * different one.
 */
export const MEDICATION_LABELS: Record<Medication, string> = {
  minoxidilTopical: 'Minoxidil (topical)',
  finasterideOral: 'Finasteride (oral)',
  minoxidilOral: 'Minoxidil (oral)',
  finasterideTopical: 'Finasteride (topical)',
  dutasteride: 'Dutasteride',
  spironolactone: 'Spironolactone',
  ketoconazole: 'Ketoconazole shampoo',
  iron: 'Iron or ferritin supplement',
  hormonal: 'Hormonal medication',
  other: 'Something else',
  none: 'Nothing right now',
};

export const SELF_CONSISTENCY_LABELS: Record<SelfConsistency, string> = {
  very: 'Very consistent',
  mostly: 'Mostly consistent',
  onOff: 'On and off',
  forget: 'I keep forgetting',
  notStarted: "I haven't started",
};

/** How often hair crosses their mind, from rarely to often. */
export const PREOCCUPATION_STEPS = 5;

/* ------------------------------------------------------------------ */

export type Profile = {
  id: string;
  displayName: string;
  /** Asked at the end of onboarding, and optional. Shown on their card. */
  age?: number;
  /** Chooses the reference imagery. See `Gender`. */
  gender?: Gender;
  /** Local file URI or remote URL; undefined renders initials. */
  avatarUri?: string;
  bio?: string;
  createdAt: string;
};

export type Journey = {
  id: string;
  profileId: string;
  /** The day the user considers their journey to have begun. */
  startedAt: string;
  trackingAreas: TrackingArea[];
  /** Everything the funnel asked, kept so the app can speak to the person. */
  motivations: Motivation[];
  /**
   * What they said they are hoping for, in the words they picked.
   *
   * Several, because almost nobody has one reason — and, as `HairGoal`
   * says, an aspiration rather than a forecast. Optional only because a
   * journey written before the question took more than one answer has
   * `goal` on disk instead: read both shapes through `journeyGoals`,
   * never this field directly, and an old record answers the same as a
   * new one.
   */
  goals?: HairGoal[];
  /**
   * The single answer the question used to take.
   *
   * Nothing writes it any more. `migrateStoredData` folds it into `goals`
   * as the app loads, so a journey that has come through the loader has
   * `goals` and no `goal` — but it stays on the type because every
   * install made before this change has one sitting in storage.
   *
   * @deprecated Read `journeyGoals(journey)`.
   */
  goal?: HairGoal;
  noticed?: Onset;
  /** 0 to PREOCCUPATION_STEPS - 1: how often their hair crosses their mind. */
  preoccupation?: number;
  triggers: Trigger[];
  approaches: Approach[];
  /**
   * What they told us they are using, if they answered. Optional because
   * the question can be passed over and because journeys created before it
   * existed have no answer to give — absent means unanswered, not "none".
   */
  medications?: Medication[];
  /** Whatever they typed after ticking "Something else". */
  medicationNote?: string;
  selfConsistency?: SelfConsistency;
  /** Days between photo-session reminders. */
  updateIntervalDays: number;
  createdAt: string;
};

/**
 * Their goals, whichever shape the record is in.
 *
 * One `goal` from before the question took several, or `goals` from
 * after — and possibly neither, because a blob can be older or stranger
 * than either. Every screen that shows a goal reads it through here, so
 * no screen has to know which shape it was handed, and "nothing
 * selected" arrives as an empty list rather than as a crash.
 */
export function journeyGoals(journey: Pick<Journey, 'goals' | 'goal'>): HairGoal[] {
  /*
    Everything here comes off disk, so none of it can be trusted to be
    what the type says. A goal the app no longer offers — renamed in a
    later version, or simply corrupt — used to render as a blank line;
    once it is fed to a label table it becomes a crash on the Profile
    tab instead. And `goals` is only an array in the type: a string on
    disk has a length too, and would pass a truthiness check and then
    iterate character by character.
  */
  const known = (value: unknown): value is HairGoal =>
    typeof value === 'string' && value in HAIR_GOAL_LABELS;

  const list = Array.isArray(journey.goals) ? journey.goals.filter(known) : [];
  if (list.length > 0) return list;
  return known(journey.goal) ? [journey.goal] : [];
}

/**
 * "a, b and c" — how the app reads a list of someone's answers back.
 *
 * No serial comma: this is a sentence a person reads, not a citation.
 */
export function joinPhrases(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * A choice label landing in the middle of a sentence.
 *
 * The labels are written to stand alone in a list — "Less shedding" — so
 * the capital comes down when one is quoted mid-sentence. "I'm not sure
 * yet" keeps its own, because lowercasing a person's "I" reads as a typo.
 */
export function midSentence(label: string): string {
  return /^I(?![a-z])/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * Their goals as a phrase: "more fullness and less shedding".
 *
 * Only ever what they said they want. Whoever builds the sentence around
 * it owns the harder half — see the closing line of the profile report,
 * where the same list is followed by the reason it is not a promise.
 */
export function goalSentence(goals: HairGoal[]): string {
  return joinPhrases(goals.map((g) => midSentence(HAIR_GOAL_LABELS[g])));
}

/**
 * Their goals in the one line a card has room for.
 *
 * As many as fit, and then a count of the rest. The line under the name
 * on the membership card is small, two lines tall and as wide as a
 * photograph, so a list of five joined with commas would be cut off
 * mid-word by the renderer rather than by us. Counting characters rather
 * than goals is what keeps "knowing whether my routine is working" — the
 * longest thing anybody can tick — from pushing a second label off the
 * end on its own.
 *
 * Nothing is hidden by it: the count says how many are not shown, and
 * the coach reads the whole list back when asked.
 */
export function goalSummary(goals: HairGoal[], budget = 46): string | undefined {
  if (goals.length === 0) return undefined;

  const named: string[] = [];
  let used = 0;

  for (const goal of goals) {
    const label = HAIR_GOAL_LABELS[goal];
    // The first always goes in, however long it is: a card that named
    // none of somebody's goals would be worse than one that names a long
    // one. ", " is the join, hence the two.
    if (named.length > 0 && used + label.length > budget) break;
    named.push(named.length === 0 ? label : midSentence(label));
    used += label.length + 2;
  }

  const rest = goals.length - named.length;
  return joinPhrases(rest > 0 ? [...named, `${rest} more`] : named);
}

/**
 * What the device measured about a photograph at the moment it was taken.
 *
 * Optional, and stays optional. Photographs captured before this existed
 * have no reading, and the honest thing to show for them is nothing —
 * not a zero, and not a re-analysis months later against a file that has
 * since been recompressed.
 */
export type PhotoQuality = {
  /** Mean luminance, 0-255. */
  brightness: number;
  /** Standard deviation of luminance. */
  contrast: number;
  /** Mean absolute Laplacian response; low is soft. */
  sharpness: number;
  /** Fraction of pixels crushed or blown, 0-1. */
  clipped: number;
  /** Named problems, empty when there are none. */
  issues: string[];
};

/**
 * What the on-device hair segmenter measured in a photograph.
 *
 * Area, not density: a mask cannot see between strands, so a thin
 * covering and a thick one over the same region produce the same number.
 * Present only when the native model ran — Expo Go has no TFLite, so
 * photographs taken there carry no reading, and the honest thing to show
 * for them is nothing. Mirrors `Coverage` in features/assessment/hair-mask
 * so the domain types do not depend on a feature module.
 */
export type PhotoCoverage = {
  /** Fraction of the frame the mask claims as hair, 0-1. */
  fraction: number;
  /** Coverage of the upper third of the frame, 0-1. */
  upperFraction: number;
  /** How much of the mask sits above the midline, 0-1. */
  verticalBalance: number;
  /**
   * Share of the mask on the left half, 0-1; 0.5 is even. Optional
   * because it arrived a version later than the other four and older
   * readings do not carry it. The segmenter computes it, and without this
   * field it was being thrown away between the model and the report.
   */
  horizontalBalance?: number;
  /** Pixels counted as hair, so tiny masks can be rejected. */
  pixels: number;
};

export type Photo = {
  id: string;
  sessionId: string;
  angle: Angle;
  /** Full-resolution file on disk. */
  uri: string;
  /** Small pre-scaled file used by lists and grids. */
  thumbnailUri?: string;
  width: number;
  height: number;
  capturedAt: string;
  quality?: PhotoQuality;
  coverage?: PhotoCoverage;
  /**
   * The head's angles when the shutter fired, from the on-device detector,
   * in degrees. A framing fact about the photograph — it is what lets next
   * month's shot be lined up with this one — never a fact about the hair.
   * Absent on blind angles, on builds without the detector, and on every
   * photograph taken before this existed.
   */
  pose?: { yaw: number; pitch: number; roll: number };
  /**
   * How the shutter fired. Absent on photographs from before it was
   * recorded. 'sample' is a development build's simulator stand-in for a
   * camera (see components/capture/sample-camera.tsx); such a photograph
   * also carries its marker in its own pixels.
   */
  capture?: 'guided' | 'manual' | 'timer' | 'sample';
};

export type PhotoSession = {
  id: string;
  journeyId: string;
  capturedAt: string;
  /** True for the very first session, which anchors every comparison. */
  isBaseline: boolean;
  /**
   * What the user calls this update. Absent means the automatic milestone
   * — "Baseline", "Month 3" — which is what every update starts as.
   *
   * Only the name is theirs to set. The date stays the date the shutter
   * fired, because the whole product rests on when a photograph was
   * actually taken, and a record you can backdate is not a record.
   */
  title?: string;
  photos: Photo[];
  note?: string;
};

/* ------------------------------------------------------------------ */

/** Angles, in capture order, that a session holds no photograph for. */
export function missingAngles(session: Pick<PhotoSession, 'photos'>): Angle[] {
  const held = new Set(session.photos.map((p) => p.angle));
  return ANGLES.filter((angle) => !held.has(angle));
}

/**
 * The session a new capture extends instead of sitting beside.
 *
 * The funnel's scan saves one photograph as the baseline. The five-angle
 * set taken afterwards belongs to that same baseline: saved as a session
 * of its own it would be "Day 1", and every comparison from then on
 * would be between one hairline photograph and a set taken an hour
 * later. So a capture extends the baseline while the baseline still
 * lacks angles and is the only session there is. Once a second session
 * exists the baseline is whatever it was, and a later capture is an
 * update however few angles it holds.
 *
 * `requestedId` is the explicit route in from Home's baseline card. It
 * is honoured only where the same rule holds for that session: a stale
 * id — the session was deleted, or filled in from another entry — falls
 * back to a plain capture rather than landing photographs in the wrong
 * place.
 */
export function sessionToExtend(
  sessions: PhotoSession[],
  requestedId?: string,
): PhotoSession | null {
  const only = sessions.length === 1 ? sessions[0] : null;
  if (!only?.isBaseline) return null;
  if (requestedId !== undefined && only.id !== requestedId) return null;
  return missingAngles(only).length > 0 ? only : null;
}

/**
 * The session with the given photographs added for the angles it lacks.
 *
 * A photograph for an angle the session already holds is dropped, so the
 * front photograph the funnel measured is never replaced. `capturedAt`
 * stays the original scan's: that is when the baseline began, and the
 * milestone labels count from it.
 */
export function addMissingAngles(session: PhotoSession, photos: Photo[]): PhotoSession {
  const missing = new Set(missingAngles(session));
  const added: Photo[] = [];
  for (const photo of photos) {
    if (!missing.has(photo.angle)) continue;
    missing.delete(photo.angle);
    added.push(photo);
  }
  if (added.length === 0) return session;
  return { ...session, photos: [...session.photos, ...added] };
}

/**
 * One photograph's record updated in place. Returns the same array when
 * nothing matched, so a reading that arrives after its session was
 * deleted changes nothing.
 */
export function patchPhotoIn(
  sessions: PhotoSession[],
  sessionId: string,
  photoId: string,
  patch: Partial<Omit<Photo, 'id' | 'sessionId'>>,
): PhotoSession[] {
  const session = sessions.find((s) => s.id === sessionId);
  if (!session?.photos.some((p) => p.id === photoId)) return sessions;

  return sessions.map((s) =>
    s === session
      ? { ...s, photos: s.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)) }
      : s,
  );
}

export type RoutineCadence = 'daily' | 'weekly';

/** How often something is done, as the routine screen offers it. */
export const FREQUENCY_OPTIONS = [7, 1, 2, 3, 4, 5] as const;

export const FREQUENCY_LABELS: Record<number, string> = {
  7: 'Every day',
  1: 'Once a week',
  2: 'Twice a week',
  3: '3 times a week',
  4: '4 times a week',
  5: '5 times a week',
  6: '6 times a week',
};

/**
 * How many times a week an item is meant to happen.
 *
 * Daily is seven, which is what makes the rest of the arithmetic work
 * without a special case: a weekly item is simply one with a smaller
 * target, and every number derived from the routine can divide by seven
 * rather than branching on a kind.
 *
 * Anything unrecognised reads as daily, because that is what every item
 * was before frequency existed.
 */
export function weeklyTarget(
  item: Pick<RoutineItem, 'cadence' | 'timesPerWeek'>,
): number {
  if (item.cadence !== 'weekly') return 7;
  const n = item.timesPerWeek ?? 1;
  if (!Number.isFinite(n)) return 1;
  return Math.min(6, Math.max(1, Math.round(n)));
}

/** True for something expected every day, which gates the daily streak. */
export function isDailyItem(
  item: Pick<RoutineItem, 'cadence' | 'timesPerWeek'>,
): boolean {
  return weeklyTarget(item) >= 7;
}

/**
 * The glyph a routine item is shown with. Purely a visual cue so a list
 * is scannable without reading; it carries no meaning about the item.
 */
export type RoutineIcon = 'dropper' | 'pill' | 'capsule' | 'cup' | 'drop';

export const ROUTINE_ICONS: RoutineIcon[] = ['dropper', 'pill', 'capsule', 'cup', 'drop'];

export const ROUTINE_ICON_LABELS: Record<RoutineIcon, string> = {
  dropper: 'Dropper bottle',
  pill: 'Tablet',
  capsule: 'Capsule',
  cup: 'Drink',
  drop: 'Wash or massage',
};

export type RoutineTimeOfDay = 'morning' | 'evening' | 'anytime';

export const TIME_OF_DAY_LABELS: Record<RoutineTimeOfDay, string> = {
  morning: 'Morning',
  evening: 'Evening',
  anytime: 'Anytime',
};

export type RoutineItem = {
  id: string;
  journeyId: string;
  label: string;
  /** Free text; the app never suggests or validates treatments. */
  detail?: string;
  /**
   * Chosen when the item is added. Optional so items saved before icons
   * existed still load; those fall back to a guess from the label.
   */
  icon?: RoutineIcon;
  cadence: RoutineCadence;
  /**
   * Times a week, when the cadence is weekly. Absent on everything that
   * predates frequency, all of which was daily.
   */
  timesPerWeek?: number;
  timeOfDay?: RoutineTimeOfDay;
  /**
   * Times a day this is taken. Absent means once, which is what every
   * item was before doses existed.
   *
   * The app never sets this above one on anybody's behalf. How often a
   * treatment is taken is a dosing decision, and the only honest source
   * for it is whoever prescribed it.
   */
  dosesPerDay?: number;
  /**
   * Barcode of the product this item is, when one was scanned or typed.
   * Optional and additive: items made before products existed have none,
   * and absent means "no product". Resolved through `productFor`.
   */
  productBarcode?: string;
  createdAt: string;
  archivedAt?: string;
};

/** One completion tick. Keyed by item + calendar day. */
export type RoutineLog = {
  id: string;
  routineItemId: string;
  /** YYYY-MM-DD in the device's local time. */
  date: string;
  /** True once every dose for the day is in. */
  completed: boolean;
  /**
   * Doses taken that day. Absent on logs written before doses existed, so
   * read it through `dosesTaken`, which falls back to `completed`.
   */
  doses?: number;
  loggedAt: string;
};

/** The most doses a day the app will track. */
export const MAX_DOSES_PER_DAY = 4;

export const DOSE_OPTIONS = [1, 2, 3, 4];

export const DOSE_LABELS: Record<number, string> = {
  1: 'Once a day',
  2: 'Twice a day',
  3: 'Three times a day',
  4: 'Four times a day',
};

/** Doses a day for an item, clamped and defaulting to one. */
export function doseCount(item: Pick<RoutineItem, 'dosesPerDay'>): number {
  const n = item.dosesPerDay ?? 1;
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_DOSES_PER_DAY, Math.max(1, Math.round(n)));
}

/**
 * Doses recorded by a log, out of `total`.
 *
 * Logs written before doses existed only say completed or not, so those
 * read as all-or-nothing. Clamped, because `total` can drop after the
 * fact if someone changes an item from three times a day to one.
 */
export function dosesTaken(
  log: Pick<RoutineLog, 'doses' | 'completed'> | undefined,
  total: number,
): number {
  if (!log) return 0;
  if (typeof log.doses === 'number' && Number.isFinite(log.doses)) {
    return Math.min(total, Math.max(0, Math.round(log.doses)));
  }
  return log.completed ? total : 0;
}

export type JournalEntry = {
  id: string;
  journeyId: string;
  /** Optional link to the session this note describes. */
  sessionId?: string;
  body: string;
  createdAt: string;
};

/* ------------------------------------------------------------------ */

/** Where a product record came from. A manual entry never had a lookup. */
export type ProductSource = 'openBeautyFacts' | 'manual';

/**
 * A product as the database states it, or as the person typed it.
 *
 * Every field is verbatim from Open Beauty Facts or from the person. The
 * app adds nothing: no rating, no category of its own, no reading of the
 * ingredient list. `barcode` is the key — the canonical code the database
 * returned (it pads UPC-A to thirteen digits itself), or the scanned
 * digits for an entry the database did not know.
 */
export type Product = {
  barcode: string;
  source: ProductSource;
  /** As listed, or as typed. Never rewritten by the app. */
  name: string;
  /** The raw `brands` string; the database lists several with commas. */
  brand?: string;
  /** e.g. "200 ml", as printed. */
  quantity?: string;
  /** The ingredient text exactly as listed; absent when the record has none. */
  ingredientsText?: string;
  /** 400px front photo (images.openbeautyfacts.org only), CC BY-SA. */
  imageUrl?: string;
  /** 200px front photo, for rows and orbs. */
  thumbnailUrl?: string;
  /**
   * `ingredients_analysis_tags` exactly as returned, e.g. "en:palm-oil-free".
   * Stored whole; only three definite tags are ever displayed, with the
   * source named (see features/products/open-beauty-facts `analysisNotes`).
   */
  analysisTags?: string[];
  /** When this record was fetched, or typed. Shown on the panel; the cache never ages out. */
  fetchedAt: string;
};

/** The products list with `next` in place of any record sharing its barcode. */
export function upsertProduct(products: Product[], next: Product): Product[] {
  const index = products.findIndex((p) => p.barcode === next.barcode);
  if (index === -1) return [...products, next];
  return products.map((p, i) => (i === index ? next : p));
}

/** The item with no product linked. Returns the same item when none was. */
export function withoutProduct(item: RoutineItem): RoutineItem {
  if (item.productBarcode === undefined) return item;
  const rest = { ...item };
  delete rest.productBarcode;
  return rest;
}

/* ------------------------------------------------------------------ */

/** Everything the app persists locally, versioned for future migration. */
export type AppData = {
  schemaVersion: number;
  profile: Profile | null;
  journey: Journey | null;
  sessions: PhotoSession[];
  routineItems: RoutineItem[];
  routineLogs: RoutineLog[];
  journal: JournalEntry[];
  products: Product[];
  onboardingCompletedAt: string | null;
};

/**
 * Bumped for the funnel: a journey now records what the person said they
 * want and where they are starting from, and the old three-question shape
 * cannot be filled in after the fact.
 *
 * NOT bumped for products. The loader in app-store.tsx discards storage
 * whose version differs, so a bump would erase every installed journey.
 * `products` and `RoutineItem.productBarcode` are additive: a record saved
 * before they existed reads `products` as [] from the EMPTY_DATA spread.
 */
export const SCHEMA_VERSION = 2;

export const EMPTY_DATA: AppData = {
  schemaVersion: SCHEMA_VERSION,
  profile: null,
  journey: null,
  sessions: [],
  routineItems: [],
  routineLogs: [],
  journal: [],
  products: [],
  onboardingCompletedAt: null,
};

/**
 * One journey, brought forward to the shape this version reads.
 *
 * The goal question used to take a single answer and now takes several,
 * so a journey saved by the old version carries `goal: 'hairline'` and no
 * `goals`. It has to come out of here reading as one selected goal —
 * somebody who updates mid-journey opens the app and finds what they
 * said, not an empty line where it was.
 *
 * The old field is dropped once it has been folded in: one place a goal
 * lives, so the two cannot drift apart the day somebody changes theirs.
 */
export function migrateJourney(journey: Journey): Journey {
  const next: Journey = { ...journey, goals: journeyGoals(journey) };
  delete next.goal;
  return next;
}

/**
 * Whatever was on disk, as data this version can render — or null.
 *
 * "Start clean" stays the only honest answer to a record written by a
 * version that kept different things, which is what the version check
 * is for. What it is *not* for is a field that can still be read: the
 * note on SCHEMA_VERSION explains that a bump erases every installed
 * journey, so the goal question took the other route, and the old shape
 * is folded into the new one here on the way in.
 */
export function migrateStoredData(parsed: unknown): AppData | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const stored = parsed as Partial<AppData>;
  if (stored.schemaVersion !== SCHEMA_VERSION) return null;

  // Fields added since the blob was written read their default from
  // EMPTY_DATA; fields whose shape changed are migrated by hand.
  const data: AppData = { ...EMPTY_DATA, ...stored };
  return { ...data, journey: data.journey ? migrateJourney(data.journey) : null };
}
