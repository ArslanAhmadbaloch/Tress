/**
 * What the app does for the person, said once, before they start.
 *
 * ── Why there are no outcome figures here ─────────────────────────────
 * The obvious thing to put on a screen like this is "87% of members saw
 * a difference". There is no cohort, no measurement and no study, so any
 * such number would be invented — and it would be a claim about hair
 * rather than about software, which this app is not in a position to
 * make about anybody. The figures below are about the product, and every
 * one of them is checkable inside the app in under a minute.
 *
 * If real numbers ever exist — from a study, or from members who have
 * opted in — they belong here, sourced, with the denominator shown.
 */

import type { IconName } from '@/components/ui/icon';

export type HelpBeat = {
  icon: IconName;
  title: string;
  body: string;
};

export const HELP_TITLE = 'Here’s what you get for turning up.';

export const HELP_SUBTITLE =
  'Four things, and none of them ask you to remember anything.';

export const HELP_BEATS: HelpBeat[] = [
  {
    icon: 'camera',
    title: 'Five angles, framed the same way',
    body: 'Guides line each shot up with the last one, so what you compare next month is your hair rather than where you happened to stand.',
  },
  {
    icon: 'compare',
    title: 'Any two months, side by side',
    body: 'Drag between an old set and a new one. Change spread over months is invisible day to day and obvious across a slider.',
  },
  {
    icon: 'pencil',
    title: 'A line beside every set',
    body: 'What you changed, how the month went, what you noticed. It is the part you will not remember in March, and the part that explains the photographs.',
  },
  {
    icon: 'leaf',
    title: 'Your stack, ticked not planned',
    body: 'Whatever you already use, in one list, with the days you actually did it. No schedule to live up to.',
  },
];

/**
 * Facts about the product. Each is verifiable by opening the app; none
 * is a claim about anybody's hair.
 */
export const HELP_FIGURES: { value: string; label: string }[] = [
  { value: '5', label: 'Angles an update' },
  { value: '0', label: 'Photos uploaded' },
  { value: '0', label: 'Accounts needed' },
];

export const HELP_FOOTNOTE =
  'That is all the app does. What your hair does is yours to find out — this is how you’ll know.';
