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

import type { GuidanceCue, ScanErrorReason, ScanRegion, ScanStatus, ScanTarget } from './types';

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
      { title: 'Press Start, then turn your head', body: 'Slowly to the left, then to the right' },
      { title: 'Lower your head and turn again', body: 'That is how the top of your head is seen' },
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
    hint: 'Hold the phone however suits you, then press Start',
    cta: 'Start',
    help: 'How the scan works',
    close: 'Close scan',
  },
  /**
   * The one line under the ring.
   *
   * Nothing here asks anybody to move closer or further away. Build 17
   * did, and the owner's verdict was that it meant holding the phone at
   * arm's stretch and waiting; the scan works at whatever distance the
   * person is comfortable holding a phone, so it says nothing about it.
   */
  cue: {
    centreFace: 'Center your face',
    perfect: 'Ready when you are',
    holdStill: 'Hold still',
    moveSlowly: 'Move your head slowly',
    slowDown: 'Slow down',
    backInFrame: 'Let’s get you back in frame',
    brighter: 'Find a brighter spot',
    keepGoing: 'Keep going',
    turnLeftRight: 'Turn your head slowly left and right',
    lowerHead: 'Lower your head',
    turnAgain: 'Turn slowly, as you did before',
    almost: 'Nearly done',
  } satisfies Record<GuidanceCue, string>,
  scanning: {
    hint: 'Turn slowly — the ring fills as you go',
    chin: 'Lower your head, then turn again',
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
    // Not "lined up": there is nothing to line up with any more. The
    // pill says the machine is following a head and will start when
    // asked, wherever that head happens to be.
    ready: 'Ready to start',
    capturing: 'Scanning',
    completing: 'Almost there',
    complete: 'Scan complete',
  } satisfies Record<ScanStatus, string>,
  /**
   * The pill's readout while a scan is running.
   *
   * The engine has one status for the whole capture, because capturing is
   * one thing to a reducer. To the person holding the phone it is two
   * beats — the head goes left and right, then it goes down — and a pill
   * that says the same word through both is telling them nothing about
   * where they are. `scanPhaseFor` decides which beat; these are its
   * words, and they live here with every other sentence the scanner says
   * so the honesty sweep reads them.
   *
   * They describe the head and nothing else. `searching` and `tracking`
   * are left out on purpose: those beats keep `status.detecting` and
   * `status.ready`, which already say the right thing.
   */
  phase: {
    turning: 'Turning',
    headDown: 'Head down',
    almost: 'Almost there',
  },
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
  /** The four regions the scan sets out to photograph, as the report names them. */
  target: {
    hairline: 'Front hairline',
    leftTemple: 'Left temple',
    rightTemple: 'Right temple',
    crown: 'Crown',
  } satisfies Record<ScanTarget, string>,
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
