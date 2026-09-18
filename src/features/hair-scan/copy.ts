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

import type {
  ScanCue,
  ScanErrorReason,
  ScanRegion,
  ScanStatus,
  ScanStep,
  ScanTarget,
} from './types';

/** One step's two lines: what to do, and how to do it. */
export type StepCopy = { title: string; instruction: string };

export const HAIR_SCAN_COPY = {
  instructions: {
    title: 'Scan Instructions',
    /**
     * One row per beat of the scan as somebody meets it: glasses off in
     * good light, Start pressed and the head straight, then each turn,
     * then down. The sheet draws (or later photographs) each row.
     */
    steps: [
      { title: 'Take glasses off', body: 'And find a well-lit spot' },
      { title: 'Press Start and look straight', body: 'Then turn your head right, then left' },
      { title: 'Last, look down', body: 'That is how the top of your head is seen' },
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
   * The four steps, in the owner's words.
   *
   * A title big enough to read at arm's length with the head turned away
   * from the phone, and one line under it saying how. Each names the
   * direction the HEAD moves — which is what the arrow points at — and
   * none of them names a part of the head, because which side of the
   * head a turn shows is the engine's business and not the person's.
   *
   * They are instructions, never verdicts, and nothing hurries anybody:
   * "slowly" is in three of the four on purpose.
   */
  step: {
    front: { title: 'Look straight', instruction: 'Keep your face in the frame' },
    right: { title: 'Look right', instruction: 'Slowly turn your head to the right' },
    left: { title: 'Look left', instruction: 'Slowly turn your head to the left' },
    down: { title: 'Look down', instruction: 'Slowly tilt your head downward' },
  } satisfies Record<ScanStep, StepCopy>,
  /** The label on the thin bar across the top. */
  stepCounter: (index: number, total: number) => `Step ${index} of ${total}`,
  /**
   * The corrective line, when there is one.
   *
   * What to do with your head is the step's own instruction above; these
   * five are only for when a reading cannot be used, and for most of a
   * good scan none of them is shown. Nothing here asks anybody to move
   * closer or further away. Build 17 did, and the owner's verdict was
   * that it meant holding the phone at arm's stretch and waiting; the
   * scan works at whatever distance the person is comfortable holding a
   * phone, so it says nothing about it.
   */
  cue: {
    faceCamera: 'Center your face',
    holdStill: 'Hold still',
    tooFast: 'Slow down',
    lost: 'Let’s get you back in frame',
    brighter: 'Find a brighter spot',
  } satisfies Record<ScanCue, string>,
  /**
   * The line under the video when nothing needs correcting, for the
   * screens that still want one. It says what the scan is doing, not
   * what to do: the step's own instruction says that.
   */
  scanning: {
    hint: 'Follow the arrow — the scan takes the pictures',
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
   * The pill's readout near the end of a scan.
   *
   * One line, because one line is all that is left: the pill's other
   * phases wear `status.detecting`, `status.ready` and `status.capturing`,
   * which already say the right thing. `Turning` and `Head down` lived
   * here for the two-beat build and went out with it — the step's own
   * title says which way to turn now, in type big enough to read with the
   * head turned away, and a pill repeating it underneath was two voices
   * saying one thing.
   */
  phase: {
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
    /** The heading over the list of what the scan came away with. */
    captured: 'Captured',
  },
  /**
   * The Scan Complete list: what the four steps came away with, ticked
   * as each one lands.
   *
   * Three lines rather than four, because both turns are the same thing
   * to the person who did them. Each names a part of the head that is in
   * a photograph — never anything about the hair on it, and never a
   * count or a score the code did not compute.
   */
  checklist: {
    hairline: 'Hairline',
    temples: 'Temples',
    crown: 'Crown',
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
      // Two samples, because a line may count within a total — "Step 1
      // of 4". A function that takes one argument ignores the second.
      for (const n of [0, 1, 2, 12]) {
        const produced: unknown = (value as (n: number, of: number) => unknown)(n, 4);
        if (typeof produced === 'string') out.push(produced);
      }
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(HAIR_SCAN_COPY);
  return out;
}
