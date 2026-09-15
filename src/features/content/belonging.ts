/**
 * The lines that say somebody has joined something.
 *
 * Kept together so the voice stays one voice. Scattered across six
 * screens it would drift, and warmth that drifts reads as a template.
 *
 * ── What this is allowed to mean ───────────────────────────────────────
 * There is no community in this app. No feed, no other members to meet,
 * nothing shared with anybody — the photographs never leave the device.
 * So "family" here is a tone and a promise about how the app treats the
 * person, never a claim about a room full of people they have joined. No
 * line in this file says anybody else is out there, because that would
 * be a feature they would go looking for and not find.
 *
 * What it can honestly rest on is the card. The app really does issue a
 * membership card, free, on the day somebody starts, and it really is
 * theirs to keep. The belonging is anchored in that object rather than
 * in a sentiment.
 *
 * ── Where it deliberately does not go ──────────────────────────────────
 * The paywall. Warmth immediately before an ask for money is the oldest
 * trick there is, and an app that calls you family on the screen where
 * it charges you has told you exactly what the word was for. The paywall
 * keeps its plain voice.
 */

/** Slots a name into a line, dropping the comma when there is none. */
function named(line: string, name: string): string {
  const trimmed = name.trim();
  return line.replace('{name}', trimmed ? `, ${trimmed}` : '');
}

/**
 * The moment the journey is created and the card appears.
 *
 * Thanks first, because they have just answered fourteen questions about
 * something they are worried about, and that deserves acknowledging
 * before anything is shown to them.
 */
export function welcomeTitle(name: string): string {
  return named('Welcome to the family{name}.', name);
}

/**
 * Set small above the card, not as a headline. The card is the thing
 * being handed over; a paragraph on top of it only makes it wait.
 */
export const WELCOME_BODY = 'Thank you for taking the time. This card is yours from today.';

/** The last screen before the camera, once the plan has been laid out. */
export const PLAN_THANKS =
  'Thank you for answering all of that. Here is what you have told us.';

/** Under the card wherever it is shown again afterwards. */
export const CARD_NOTE =
  'Your membership card. Tap to open it full size and save it.';

/** What the card calls the day somebody joined. */
export const MEMBER_SINCE = 'Member since';

/**
 * Shown once the first photographs are safely stored.
 *
 * The point at which somebody has actually done the hard part, which is
 * photographing their own head five ways while feeling self-conscious
 * about it.
 */
export const BASELINE_THANKS =
  'That is the hard part done. Everything from here is comparison.';


/* ------------------------------ analysing ------------------------------- */

/**
 * The reveal between the last question and the plan.
 *
 * Every line names something the person has just told us. No photograph
 * exists at this point in the funnel, so anything about hair, scalp or
 * density would be describing work that is not happening on data that is
 * not there — and it would be the first dishonest screen in the app.
 */
export const ANALYSING_TITLE = 'Putting your journey together.';

export const ANALYSING_STEPS = [
  { label: 'Reading what you told us' },
  { label: 'Setting your five angles' },
  { label: 'Building your routine' },
  { label: 'Choosing your check-in rhythm' },
];
