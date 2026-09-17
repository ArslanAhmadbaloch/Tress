/**
 * Every word the hair scan says.
 *
 * It sits apart from the reducer and the screens so the honesty sweep can
 * read the whole vocabulary in one pass — `copySentences()` flattens it,
 * functions included — and so the wording is settled in one place.
 *
 * Nothing here describes hair. The scan is a set of images taken from
 * known directions, and the most these lines can say is where the head
 * is, what the phone is doing, and what has been captured. Nothing
 * exclaims, nothing forecasts, and nothing hurries anyone.
 */

import type { GuidanceCue, ScanErrorReason, ScanRegion, ScanStatus } from './types';

export const HAIR_SCAN_COPY = {
  instructions: {
    title: 'Scan Instructions',
    /**
     * One row per state of the scanner: glasses off in good light, head
     * straight and Start pressed, a slow full turn while the ring fills.
     * The sheet draws (or later photographs) each state beside its row.
     */
    steps: [
      { title: 'Take glasses off', body: 'And find a well-lit spot' },
      { title: 'Keep your head straight', body: 'And press Start' },
      {
        title: 'Turn slowly, all the way round',
        body: 'Tress captures the angles as the ring fills',
      },
    ],
    privacy: 'Your images stay on this device.',
    cta: 'Continue',
  },
  permission: {
    title: 'Camera access',
    body: 'Tress uses your camera to capture your hair and scalp during your scan.',
    cta: 'Allow camera',
    denied: 'Camera access is off for Tress. Turn it on in Settings to scan.',
    openSettings: 'Open Settings',
  },
  ready: {
    hint: 'Line your face up inside the ring',
    cta: 'Start',
    help: 'How the scan works',
    close: 'Close scan',
  },
  cue: {
    centreFace: 'Center your face',
    closer: 'Move slightly closer',
    back: 'Move slightly back',
    perfect: 'Perfect',
    holdStill: 'Hold still',
    moveSlowly: 'Move your head slowly',
    slowDown: 'Slow down',
    backInFrame: 'Let’s get you back in frame',
    brighter: 'Find a brighter spot',
    keepGoing: 'Keep going',
  } satisfies Record<GuidanceCue, string>,
  scanning: {
    hint: 'Turn slowly to complete the ring',
    chin: 'Now tip your chin down a little',
  },
  /**
   * What the machine is doing, in the top bar's pill. One state, one
   * line; `detecting` covers everything before the scan may start.
   *
   * `facingAway` is the one exception, and it sits outside the table
   * because it is not a state of the machine: the scanner is still
   * `detecting`, but a head is being followed and it is turned away, so
   * "Looking for your face" would be saying the phone cannot see what it
   * plainly can. It is asked back to the camera instead.
   */
  status: {
    initializing: 'Starting camera',
    detecting: 'Looking for your face',
    // The cue line already says "Perfect"; the pill says what the machine is.
    ready: 'Lined up',
    capturing: 'Scanning',
    completing: 'Almost there',
    complete: 'Scan complete',
  } satisfies Record<ScanStatus, string>,
  /** Shown in place of `status.detecting` while a followed head is turned away. */
  facingAway: 'Face the camera',
  lighting: {
    good: 'Good light',
    low: 'Low light',
    dark: 'Too dark',
    unknown: 'Light not measured',
  },
  complete: {
    title: 'Scan complete',
    body: 'The captured angles are ready to review.',
    frames: (n: number) => `${n} ${n === 1 ? 'angle' : 'angles'} captured`,
    cta: 'Review scan',
  },
  processing: {
    title: 'Analysing your scan…',
    /**
     * Shown one per unit of real work by the analysis pass (see
     * `analysis.ts`), never on a clock: a label is a thing that happened.
     */
    stages: [
      'Analysing your scan…',
      'Mapping your hairline…',
      'Reviewing captured angles…',
      'Comparing visible coverage…',
      'Building your hair report…',
    ],
    frameReviewed: 'Reviewed',
    onDevice: 'Everything runs on this device.',
  },
  region: {
    front: 'Front',
    up: 'Chin up',
    rightUp: 'Right, chin up',
    right: 'Right side',
    rightDown: 'Right, chin down',
    chin: 'Chin down',
    leftDown: 'Left, chin down',
    left: 'Left side',
    leftUp: 'Left, chin up',
  } satisfies Record<ScanRegion, string>,
  report: {
    title: 'Hair report',
    capturedAngles: 'Captured angles',
    coverage: 'Coverage',
    lighting: 'Lighting',
    sharpness: 'Sharpness',
    note: 'These notes describe what the captured images show. They are not medical advice.',
    onDevice: 'Analysed on this device. Your images were not uploaded.',
    saved: 'Saved to your journal',
    cta: 'Done',
    scanAgain: 'Scan again',
  },
  error: {
    title: 'The scan could not finish',
    reason: {
      cameraDenied: 'Camera access is off for Tress. Turn it on in Settings to scan.',
      cameraFailed: 'The camera could not start. Close the scan and try again.',
      trackingUnavailable:
        'The scan needs the face detector, which is not part of this build of Tress. The camera itself is fine. Nothing was captured.',
      noFrames: 'No usable angles were captured. Find even light, face the camera and try again.',
      processingFailed: 'The captured angles could not be analysed on this device.',
    } satisfies Record<ScanErrorReason, string>,
    /** The title over `reason.trackingUnavailable`: the scan never started, so it did not "fail to finish". */
    untrackableTitle: 'This build cannot follow a head',
    retry: 'Try again',
    close: 'Close',
  },
} as const;

/**
 * Every sentence the scan can produce, functions included, for the sweep.
 *
 * Walks the object above and calls each function with sample arguments,
 * so a string added anywhere in the tree reaches the sweep without the
 * test being told about it.
 */
export function copySentences(): string[] {
  const out: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') out.push(value);
    else if (typeof value === 'function') {
      for (const n of [0, 1, 2, 12]) {
        const produced: unknown = (value as (n: number) => unknown)(n);
        if (typeof produced === 'string') out.push(produced);
      }
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(HAIR_SCAN_COPY);
  return out;
}
