/**
 * Hair Journey domain model.
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
  | 'generalChanges';

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
  | 'unsure';

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
  | 'none';

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
  | 'other'
  | 'none';

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
  goal: HairGoal;
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

export type RoutineCadence = 'daily' | 'weekly';

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

/** Everything the app persists locally, versioned for future migration. */
export type AppData = {
  schemaVersion: number;
  profile: Profile | null;
  journey: Journey | null;
  sessions: PhotoSession[];
  routineItems: RoutineItem[];
  routineLogs: RoutineLog[];
  journal: JournalEntry[];
  onboardingCompletedAt: string | null;
};

/**
 * Bumped for the funnel: a journey now records what the person said they
 * want and where they are starting from, and the old three-question shape
 * cannot be filled in after the fact.
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
  onboardingCompletedAt: null,
};
