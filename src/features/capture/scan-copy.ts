/**
 * Every word the guided scan says.
 *
 * It sits apart from the reducer and the screen for two reasons. The
 * honesty sweep can read the whole vocabulary in one pass — `scanCopySentences()`
 * flattens it, functions included — and a sentence that promises a
 * mechanism can be checked against the mechanism that has to keep it:
 * `guided-scan.test.ts` asserts that the only strings mentioning a
 * countdown are the ones shown when the preference that arms it is on.
 *
 * Nothing here describes hair. The scan is a set of photographs taken at
 * known angles, and the most these lines can honestly say is where the
 * head is, what the phone is doing, and what has been saved.
 */

import type { Angle } from '@/types/domain';

import type { Cue } from './guided-scan';

export const SCAN_COPY = {
  intro: {
    title: 'Turn, and it takes the photos.',
    /*
      Two bodies, because the countdown only arms when the hands-free
      preference is on. The intro reads that preference and picks the one
      that is true of what the capture screen will actually do. Kept as
      two strings rather than a function so the sweep sees both without
      having to guess a sample argument.
    */
    body: {
      handsFree:
        'Face the ring. It takes the front, then each side as you turn, then counts down for the top and the back once the phone is held still. Nothing leaves your phone.',
      manual:
        'Face the ring. It takes the front, then each side as you turn. The top and the back are yours to take with the shutter. Nothing leaves your phone.',
    },
    cta: 'Start scan',
    manualLink: 'Can’t turn your head? Take them yourself',
  },
  cue: {
    manual: 'Tap the shutter when you are lined up',
    searching: 'Bring your head into the ring',
    closer: 'Move a little closer',
    back: 'Move back a little',
    centre: 'Centre your head',
    lookStraight: 'Look straight at the camera',
    turnMore: 'Turn a little further',
    turnLess: 'Turn back towards the camera a little',
    otherWay: 'Other way',
    matchBaseline: 'Turn the other way, to match your baseline',
    chinLevel: 'Chin level',
    headLevel: 'Keep your head level',
    still: 'Hold still',
    brace: 'Brace your elbow, or rest the phone on something',
    hold: 'Hold still — taking it',
  } satisfies Record<Cue, string>,
  manualHint: 'Or tap the shutter to take it yourself',
  blind: {
    instruction: {
      top: 'Hold the phone above your head, screen down. It counts down once you are still.',
      crown:
        'Hold the phone behind your head, or hand it to someone. It counts down once you are still.',
    },
    armed: 'Counting down',
    cancel: 'Tap the shutter to cancel',
    skipCrown: 'Skip the back for now',
    skipTop: 'Skip the top for now',
  },
  captured: {
    front: 'Front captured',
    leftTemple: 'Left side captured',
    rightTemple: 'Right side captured',
    top: 'Top captured',
    crown: 'Back captured',
  } satisfies Record<Angle, string>,
  stackCount: (done: number, total: number) => `${done} of ${total}`,
  complete: 'That’s the set.',
  review: {
    title: (n: number) =>
      `${WORDS[n] ?? n} ${n === 1 ? 'photograph' : 'photographs'}. Tap one to retake it.`,
    cta: 'Use these photos',
    ctaOne: 'Use this photo',
  },
  analysing: {
    title: 'Reading your photographs.',
    unit: {
      quality: (label: string) => `Checking light and focus · ${label}`,
      area: (label: string) => `Measuring hair area · ${label}`,
      write: (label: string) => `Saving to this device · ${label}`,
    },
    noSegmenter: 'Area reading runs in the full app',
    done: (n: number) =>
      `${WORDS[n] ?? n} ${n === 1 ? 'photograph' : 'photographs'}, measured on this device.`,
  },
  ghost: {
    toggle: 'Last time',
    label: (date: string) => `Last time · ${date}`,
    hint: 'Line your head up with the faint one.',
  },
  handsFree: {
    label: 'Hands-free for top and back',
    hint: 'Counts down on its own once the phone is still. You can always tap to cancel.',
  },
} as const;

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];

/** The arguments the sweep feeds a copy function, one call per entry. */
const SAMPLES = ['Hairline', 3, '14 Aug'];

/**
 * Every fixed string, plus each function called with a sample, so the
 * honesty sweep can read the whole vocabulary rather than the half of it
 * that happens to be a literal.
 */
export function scanCopySentences(): string[] {
  const out: string[] = [];

  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      out.push(value);
      return;
    }
    if (typeof value === 'function') {
      const fn = value as (...args: unknown[]) => string;
      // Arity is the only signal available: the one two-argument line is
      // a count, the rest take a single label, number or date.
      if (fn.length >= 2) out.push(fn(2, 5));
      else for (const sample of SAMPLES) out.push(fn(sample));
      return;
    }
    if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) visit(nested);
    }
  };

  visit(SCAN_COPY);
  return out;
}
