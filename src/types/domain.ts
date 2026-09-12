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
  createdAt: string;
  archivedAt?: string;
};

/** One completion tick. Keyed by item + calendar day. */
export type RoutineLog = {
  id: string;
  routineItemId: string;
  /** YYYY-MM-DD in the device's local time. */
  date: string;
  completed: boolean;
  loggedAt: string;
};

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
