/**
 * What the app does for the person, said once, before they start.
 *
 * ── Why there are no outcome figures here ─────────────────────────────
 * The obvious thing to put on a screen like this is "87% of members saw
 * a difference". There is no cohort, no measurement and no study, so any
 * such number would be invented — and it would be a claim about hair
 * rather than about software, which this app is not in a position to
 * make about anybody. The figures below are about the product instead.
 *
 * Two of them a person can settle by using the app: an update is one
 * scan — one slow turn in front of the camera — and nothing anywhere
 * asks them to sign in. The third is a fact about the code rather than
 * something a screen shows, so it is worded as what the app does — see
 * the note on it below.
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
    title: 'One scan, the same views every time',
    /*
      What the code does: the scan keeps a frame for each of the front,
      both sides and the top, labelled by the view it caught, and the
      compare screen pairs a view with the same view from an earlier
      scan. It does not line a scan up with the last one — there is no
      guide or overlay from a previous session — so the sentence says
      what is kept and how it is paired, and nothing about alignment.
    */
    body: 'Turn slowly in front of the camera and Tress keeps the front, both sides and the top, each labelled by the view it caught, so next month’s front sits beside this month’s front rather than beside whatever the camera happened to see.',
  },
  {
    icon: 'compare',
    title: 'Any two months, side by side',
    body: 'Drag between an old set and a new one. Change spread over months is invisible day to day and obvious across a slider.',
  },
  {
    icon: 'pencil',
    title: 'A line beside every scan',
    body: 'What you changed, how the month went, what you noticed. It is the part you will not remember in March, and the part that explains the photographs.',
  },
  {
    icon: 'leaf',
    title: 'Your stack, ticked not planned',
    body: 'Whatever you already use, in one list, with the days you actually did it. No schedule to live up to.',
  },
];

/**
 * Facts about the product, not about anybody's hair.
 *
 * The middle one used to read "Photos uploaded". On a screen with no
 * other mention of the network that reads as "this app sends nothing",
 * and the app does send something: scan a product and its barcode
 * digits go to Open Beauty Facts. What the code does support is the
 * narrower statement — the app has no upload path for a photograph. A
 * picture leaves when the person hands it to a share sheet themselves,
 * or with a device backup they have turned on. So the label says whose
 * uploads it is counting.
 *
 * The privacy screen is where the rest of it is set out; this is a
 * figure on an onboarding card and is not trying to be that document.
 */
export const HELP_FIGURES: { value: string; label: string }[] = [
  { value: '1', label: 'Scan an update' },
  { value: '0', label: 'Photos the app uploads' },
  { value: '0', label: 'Accounts needed' },
];

export const HELP_FOOTNOTE =
  'That is the shape of it. What your hair does is yours to find out — this is how you’ll know.';
