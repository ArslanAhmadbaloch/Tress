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

export type JourneyGoal =
  | 'trackChanges'
  | 'monitorProgress'
  | 'stayConsistent'
  | 'documentTreatment'
  | 'documentTransplant'
  | 'understandLongTerm';

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

export const JOURNEY_GOAL_LABELS: Record<JourneyGoal, string> = {
  trackChanges: 'Track changes over time',
  monitorProgress: 'Monitor my progress',
  stayConsistent: 'Stay consistent with my routine',
  documentTreatment: 'Document a treatment journey',
  documentTransplant: 'Document transplant recovery',
  understandLongTerm: 'Understand my long-term changes',
};

/* ------------------------------------------------------------------ */

export type Profile = {
  id: string;
  displayName: string;
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
  goals: JourneyGoal[];
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

export const SCHEMA_VERSION = 1;

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
