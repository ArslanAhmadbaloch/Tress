/**
 * The onboarding kit: the pieces the funnel is composed from.
 *
 * The orb, the bubble it speaks through, the four shapes an answer can
 * take, the page and its bar, and the four pages that are whole in
 * themselves. Nothing here carries copy; the funnel brings the words.
 */

export { Mascot, type MascotExpression } from './mascot';
export { SpeechBubble } from './speech-bubble';
export { OptionPill, OptionRow, OptionCard, CardGrid, type OptionRowTint, type OptionIcon } from './options';
export { useInk } from './ink';
export { ContinueBar, BackButton, FunnelPage } from './chrome';
export { Welcome } from './welcome';
export { MascotIntro, Interstitial } from './mascot-pages';
export { splitAccent, greet } from './copy';
export { NotificationsPage, type NotificationMock } from './notifications-page';
