/**
 * The image one update leaves the app as.
 *
 * A phone loss deletes a year of the record, and a clinician who is asked
 * to look at a scalp wants a dated folder of standard angles rather than a
 * live demo of an app. So an update can be composed into one picture and
 * handed to the share sheet.
 *
 * What goes on that picture is decided here, and deliberately narrowly:
 * the photographs, their angle labels, the day each shutter fired, the
 * automatic milestone, the update's date, the baseline's date, and one
 * line at the foot. Not the title the person typed, not the journal note,
 * not the routine, not a reading — nothing the app computed and nothing
 * anybody wrote. That is what makes "No analysis or claim is attached"
 * true of the file no matter what the person called the update, and it is
 * why `SessionSheetInput` takes a `Pick` that cannot even see `title`.
 *
 * Pure on purpose: no React, no React Native, so every word on the image
 * is reachable by the honesty sweep in `scripts/test/session-sheet.test.ts`.
 */

import { formatDate, formatDateShort, formatMilestone, toDateKey } from '@/lib/date';
import {
  ANGLES,
  ANGLE_LABELS,
  type Angle,
  type Photo,
  type PhotoSession,
} from '@/types/domain';

export type SheetFrame = {
  angle: Angle;
  /** ANGLE_LABELS[angle] — the same word the session screen shows. */
  label: string;
  /** "Top · 15 Sep" — label, then the day this photograph's shutter fired. */
  caption: string;
  /**
   * The full file, not the thumbnail. An export is the one place where the
   * full resolution is the point: a 320px thumbnail blurs across a third
   * of a 1,080px-wide image.
   */
  source: { uri: string };
  capturedAt: string;
};

export type SessionSheet = {
  /** The automatic milestone — never the name the person gave this update. */
  heading: string;
  dateLine: string;
  /** "Baseline taken 15 Jun 2026" when this is not the baseline; null when it is. */
  baselineLine: string | null;
  /** One per photograph, in ANGLES order. Empty when the session holds none. */
  frames: SheetFrame[];
  /** The one line at the foot. Its dates come from the frames, never from `now`. */
  footer: string;
  /** "Tress update 2026-09-15.jpg" — the same local day the dateLine shows. */
  fileName: string;
  /** What a screen reader reads for the whole preview, as one image. */
  accessibilityLabel: string;
};

export type SessionSheetInput = {
  session: Pick<PhotoSession, 'capturedAt' | 'isBaseline' | 'photos'>;
  journeyStartedAt: string;
  /** capturedAt of the baseline session, or null when it no longer exists. */
  baselineCapturedAt: string | null;
};

/**
 * Every user-facing string the feature owns.
 *
 * None of them says "shared", "sent" or "saved", because the app cannot
 * know any of those: `Sharing.shareAsync` resolves identically whether the
 * person sent the image or cancelled the sheet. A word the code cannot
 * vouch for is a word this product does not say.
 */
export const SHARE_COPY = {
  button: 'Share this update',
  buttonHint: 'Shows the image first. The share sheet comes after.',
  title: 'Share this update',
  hint: 'This is the image the share sheet will receive. It holds these photographs, their labels and dates, and the line at the foot — nothing else from the app.',
  preparing: 'Preparing…',
  share: 'Share…',
  composing: 'Composing…',
  close: 'Close',
  /** Android's intent chooser title; the file name carries the date. */
  dialogTitle: 'Tress update',
  missingFrame: 'Photograph unavailable',
  unavailableTitle: 'Sharing is unavailable',
  unavailableBody:
    'This device cannot open the share sheet, so the image cannot be handed on from here.',
  failedTitle: 'That did not work',
  failedBody: 'The image could not be composed. Try again in a moment.',
} as const;

/** Sample days, so the sweep sees both footer forms without a real record. */
const SAMPLE_FROM = '2026-09-15T10:00:00.000Z';
const SAMPLE_TO = '2026-10-03T09:00:00.000Z';

/** Every photograph shares the update's local day. */
function sameDayFooter(iso: string): string {
  return `Photographs taken with Tress, on ${formatDate(iso)}. No analysis or claim is attached.`;
}

/**
 * The set spans days — an angle was added on a later one.
 *
 * The single-day sentence exists in the brief, but it would be false of a
 * set like this, so the file gets a sentence that is true of it instead.
 */
function spanningFooter(fromISO: string, toISO: string): string {
  return `Photographs taken with Tress between ${formatDate(fromISO)} and ${formatDate(
    toISO,
  )}. No analysis or claim is attached.`;
}

/** Everything the sweep must see: the copy, plus both footer forms. */
export function shareCopySentences(): string[] {
  return [
    ...Object.values(SHARE_COPY),
    sameDayFooter(SAMPLE_FROM),
    spanningFooter(SAMPLE_FROM, SAMPLE_TO),
  ];
}

export function buildSessionSheet(input: SessionSheetInput): SessionSheet {
  const { session, journeyStartedAt, baselineCapturedAt } = input;

  /*
    One frame per angle, in capture order. A session should never hold two
    photographs for the same angle, but `addMissingAngles` is not the only
    way photographs get in; if it ever happens, the later shutter is the
    one that describes the update.
  */
  const byAngle = new Map<Angle, Photo>();
  for (const photo of session.photos) {
    const held = byAngle.get(photo.angle);
    if (!held || new Date(photo.capturedAt).getTime() > new Date(held.capturedAt).getTime()) {
      byAngle.set(photo.angle, photo);
    }
  }

  const frames: SheetFrame[] = [];
  for (const angle of ANGLES) {
    const photo = byAngle.get(angle);
    if (!photo) continue;
    frames.push({
      angle,
      label: ANGLE_LABELS[angle],
      caption: `${ANGLE_LABELS[angle]} · ${formatDateShort(photo.capturedAt)}`,
      source: { uri: photo.uri },
      capturedAt: photo.capturedAt,
    });
  }

  const sessionDay = toDateKey(new Date(session.capturedAt));
  const spans = frames.some((f) => toDateKey(new Date(f.capturedAt)) !== sessionDay);

  let footer = sameDayFooter(session.capturedAt);
  if (spans) {
    const times = frames.map((f) => new Date(f.capturedAt).getTime());
    const first = new Date(Math.min(...times)).toISOString();
    const last = new Date(Math.max(...times)).toISOString();
    /*
      The photographs can fall on a different day from the session and
      still share one with each other — a set started at 23:58 and
      finished after midnight is the ordinary case. Naming the same day
      twice would be true and would read as a mistake, so the sentence
      that describes one day is used whenever there is only one.
    */
    footer =
      toDateKey(new Date(first)) === toDateKey(new Date(last))
        ? sameDayFooter(first)
        : spanningFooter(first, last);
  }

  const heading = formatMilestone(journeyStartedAt, session.capturedAt, session.isBaseline);
  const dateLine = formatDate(session.capturedAt);
  const baselineLine = session.isBaseline
    ? null
    : `Baseline taken ${formatDate(baselineCapturedAt ?? journeyStartedAt)}`;

  const count = `${frames.length} photograph${frames.length === 1 ? '' : 's'}`;
  const accessibilityLabel =
    `Share image. ${heading}, ${dateLine}. ` +
    `${baselineLine ? `${baselineLine}. ` : ''}` +
    `${count}: ${frames.map((f) => f.caption).join(', ')}. ${footer}`;

  return {
    heading,
    dateLine,
    baselineLine,
    frames,
    footer,
    fileName: `Tress update ${sessionDay}.jpg`,
    accessibilityLabel,
  };
}
