/**
 * Every word the hair scan report says.
 *
 * One file, one frozen object, one flattener — so the honesty sweep in
 * `scripts/test/hair-scan-report.test.ts` reads the whole vocabulary in a
 * pass, functions included, and nothing can be invented inside a
 * component. The words here describe images and a record: what was kept,
 * what was counted, how the frames were lit and turned. None of them
 * describes a head, and the test fails the file the day one does.
 *
 * ── Why the cards are worded as observations ──────────────────────────
 * "Hair covers 41% of the upper frame in the front image" is a fact about
 * pixels the device counted. "Your hairline is receding" is a verdict
 * about a person, made from a phone photograph, which a mask that cannot
 * see between strands is in no position to make. Every headline below
 * takes the first form; every `compare` line says what a second scan lets
 * the app lay beside this one, because one scan cannot show change and
 * the report says so rather than hinting otherwise.
 *
 * Numbers are only ever printed where they were counted. A card with
 * nothing measured says what was captured and what a second scan gives
 * it to compare — never a figure that was not computed.
 */

import { ANGLE_LABELS, type Angle } from '@/types/domain';

/** Whole percent, clamped. */
export function pct(fraction: number): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * 100);
}

/** Whole degrees, sign dropped: the report describes how far, never which way. */
export function deg(angle: number): number {
  return Math.round(Math.abs(angle));
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * An angle in the words the person uses, lower-cased mid-sentence.
 *
 * Tolerant of a value that is not an angle, because the sweep below
 * calls every function with sample arguments and a thrown error there
 * would hide the sentence it was about to check.
 */
function angleWord(angle: Angle): string {
  const label: string | undefined = ANGLE_LABELS[angle];
  return (label ?? String(angle)).toLowerCase();
}

/** The side an image shows: "left" or "right", or the angle's own word. */
function sideWord(angle: Angle): string {
  return angle === 'leftTemple' ? 'left' : angle === 'rightTemple' ? 'right' : angleWord(angle);
}

export const HAIR_SCAN_REPORT_COPY = Object.freeze({
  title: 'Hair Analysis',
  eyebrow: (date: string) => `Hair scan · ${date}`,
  subtitle:
    'What this device measured in the images it kept from your turn. Measured here, kept here; nothing was uploaded.',

  tabs: {
    overview: 'Overview',
    hairline: 'Hairline',
    temples: 'Temples',
    coverage: 'Coverage',
    scalp: 'Scalp',
  },

  /**
   * The tiles in the Overview: the scan's own facts about its run.
   *
   * Two counts, kept apart on purpose: the frames the scanner held
   * during the turn, and the images that survived curation to become
   * photographs. The strip below the tiles shows the second; a tile that
   * printed the first under the strip's own words would show "23" over
   * the pictures.
   */
  meta: {
    duration: 'Scan time',
    completion: 'Ring closed',
    framesCaptured: 'Frames captured',
    frames: 'Images kept',
    lighting: 'Live light',
    unmeasured: 'Not measured',
    seconds: (s: number) => `${s}s`,
    percent: (n: number) => `${n}%`,
    count: (n: number) => `${n}`,
    keptHint: (n: number) =>
      n === 1 ? 'One kept as an image, below.' : `${n} kept as images, one per angle, below.`,
    lightingHint: 'Mean of the live lighting reading over the turn.',
    completionHint: (n: number) =>
      n >= 100
        ? 'The turn reached every part of the ring.'
        : `The scan ended with ${100 - n}% of the ring still open.`,
  },

  frames: {
    title: 'Images kept from the scan',
    body: 'One image per angle, chosen from the turn for focus and for holding an area reading. Each one is an ordinary photograph in your journey.',
    measured: 'Measured',
    kept: 'Kept',
    none: 'No images were kept from this scan.',
    noneBody:
      'The turn did not hold a frame long enough to keep one. The next scan starts again from nothing lost, because nothing was saved.',
  },

  /** The one-word readings of a still, mirrored from the scan reading. */
  light: {
    dark: 'dark',
    low: 'a little dark',
    bright: 'very bright',
    even: 'evenly lit',
  },
  focus: {
    soft: 'soft',
    clear: 'in focus',
    sharp: 'sharp',
  },

  /** How the images were lit relative to each other. A framing fact. */
  lighting: {
    even: (spread: number) =>
      `The images were lit within ${spread} points of each other on a scale of 255, so the light is not what separates them.`,
    mixed: (spread: number) =>
      `The images were lit ${spread} points apart on a scale of 255. A difference you see between two of them could be the light rather than what was in front of it.`,
  },

  /* ---------------------------- the four cards ---------------------------- */

  hairline: {
    title: 'Hairline visibility',
    region: 'Front image',
    ringLabel: 'of the upper frame',
    measured: (upper: number) =>
      `Hair covers ${upper}% of the upper frame in the front image.`,
    measuredDetail: (upper: number) =>
      `The on-device mask marked ${upper}% of the top third of the front image as hair and ${100 - upper}% as not hair — forehead, background and anything it was less than half sure of. That is area in the picture, not how close the strands sit.`,
    edge:
      'Where the image is shown with its overlay, the pale line is the top edge of the marked area, drawn where the mask held for a short run in each column. It is a line on the picture, not a line on the head.',
    kept: (light: string, focus: string) => `A front image was kept: ${light}, ${focus}.`,
    keptDetail:
      'Light and focus were measured on this device. The hair-area reading needs the on-device segmenter, which did not run on this image, so there is no area figure here and none was invented.',
    keptBare: 'A front image was kept.',
    keptBareDetail:
      'Nothing was measured on it beyond keeping it. The next scan measures light, focus and, in the full app, hair area on its own front image and lays the two side by side.',
    none: 'No front image was kept from this scan.',
    noneDetail:
      'The turn did not hold a face-on frame long enough to keep one, so there is nothing here to measure. Facing the camera for a moment at the start of the next scan gives it one.',
    compare:
      'The next scan lays its front image beside this one at the same angle, and the two upper-frame figures sit side by side.',
  },

  temples: {
    title: 'Temple visibility',
    region: 'Side images',
    ringLabel: 'of the frame, both sides',
    both: (left: number, right: number) =>
      `Hair covers ${left}% of the left-side image and ${right}% of the right-side image.`,
    close: (diff: number) =>
      `The two are within ${diff} ${plural(diff, 'point', 'points')} of each other, which is inside what framing alone moves between two shots.`,
    apart: (side: string, diff: number) =>
      `The captured images show more hair area in the ${side}-side image, by ${diff} points. The figure describes two pictures taken at two turns; matching the turn next time is what makes the two comparable.`,
    turns: (left: number, right: number) =>
      `Turned ${left}° for the left side and ${right}° for the right, measured by the detector as each frame was kept.`,
    turnsApart: (diff: number) =>
      `The two turns differ by ${diff}°, so the images are not mirror images of each other.`,
    frontBalance: (left: number, right: number) =>
      `In the front image, ${left}% of the hair area sits left of centre and ${right}% right.`,
    one: (angle: Angle, fraction: number) =>
      `Only the ${sideWord(angle)}-side image was kept; hair covers ${fraction}% of it.`,
    oneUnmeasured: (angle: Angle) => `Only the ${sideWord(angle)}-side image was kept.`,
    oneDetail:
      'One side is one picture, and a picture on its own cannot be balanced against anything. The other side comes from the next scan, turned the same amount.',
    keptUnmeasured: 'Both side images were kept.',
    keptDetail:
      'Light and focus were measured on this device. The hair-area reading needs the on-device segmenter, which did not run on these images, so there is no left–right figure here and none was invented.',
    none: 'No side images were kept from this scan.',
    noneDetail:
      'The turn did not hold either side long enough to keep a frame. Turning a little further, and pausing at each side, gives the next scan both.',
    compare:
      'The next scan puts each side beside the same side from this one. A left–right split is only ever read between two scans of the same turn.',
  },

  coverage: {
    title: 'Visible hair coverage',
    region: 'All measured images',
    ringLabel: 'of the frame, on average',
    measured: (mean: number, n: number) =>
      `Hair covers ${mean}% of the frame across the ${n} measured ${plural(n, 'image', 'images')}.`,
    perImage: (parts: string) =>
      `${parts}. Each figure is the share of that image the mask marked as hair — area in the picture, which moves with framing, styling and light, and is not thickness.`,
    figure: (angle: Angle, fraction: number) => `${ANGLE_LABELS[angle] ?? String(angle)} ${fraction}%`,
    unmeasured: (n: number) =>
      `No hair-area reading on ${n === 1 ? 'this image' : `these ${n} images`}.`,
    unmeasuredDetail: (n: number) =>
      `The hair-area reading needs the on-device segmenter, which did not run on this scan. Light and focus were measured on ${n} ${plural(n, 'image', 'images')}; nothing was invented to fill the gap.`,
    bare: 'Nothing was measured on the kept images.',
    bareDetail:
      'They were saved as photographs and nothing else was read from them. The next scan measures its own, and the two scans sit side by side.',
    compare:
      'Measured the same way from the same turn, the next scan’s figures sit beside these. A change smaller than a few points is framing, and the report says so rather than counting it.',
  },

  scalp: {
    title: 'Visible scalp',
    region: 'Top and back images',
    /** Named for the image the ring was computed from, which is the back image when no top was kept. */
    ringLabel: (angle: Angle) => `of the ${angleWord(angle)} image, not hair`,
    measured: (angle: Angle, rest: number) =>
      `In the ${angleWord(angle)} image, ${rest}% of the frame was not counted as hair.`,
    measuredDetail:
      'That is everything outside the marked area — scalp where a parting shows, and also background, skin and anything the mask was less than half sure about. It is the mask’s remainder, not a scalp measurement, and it moves with how the phone was held.',
    kept: (angle: Angle, light: string, focus: string) =>
      `A ${angleWord(angle)} image was kept: ${light}, ${focus}.`,
    keptDetail:
      'Light and focus were measured on this device. The hair-area reading needs the on-device segmenter, which did not run on this image, so nothing here says how much of the frame was hair.',
    keptBare: (angle: Angle) => `A ${angleWord(angle)} image was kept.`,
    keptBareDetail:
      'Nothing was measured on it beyond keeping it. The next scan measures its own and lays the two side by side.',
    none: 'No top or back image was kept from this scan.',
    noneDetail:
      'No frame was kept with the head tipped far enough down to show the top, and the back of the head is out of reach of a scan that faces the camera. Tipping the chin further down during the next turn gives it a top image to keep.',
    compare:
      'The next scan’s top and back images sit beside these at the same angle, which is the only way a change in what shows is read.',
  },

  /** The closing paragraph, in two forms: with area readings and without. */
  scope: {
    withArea:
      'Everything above was measured on this device from the pixels in the images the scan kept. It is a reading of the pictures, not of your hair — area is not thickness, and one scan cannot show change. It becomes useful the moment there is a second one to lay beside it.',
    withoutArea:
      'Everything above was measured on this device from the pixels in the images the scan kept. It is a reading of the pictures, not of your hair, and one scan cannot show change. It becomes useful the moment there is a second one to lay beside it.',
  },

  /**
   * The locked state of a card, for a reader without Premium.
   *
   * Depth is what Premium adds, and only depth: the headline stays, the
   * working under it stays — that is where the card qualifies its own
   * line — the caveat stays, and the closing paragraph of the report
   * stays, because a qualifier behind a gate would leave the free
   * reading more confident than the paid one about the same pictures.
   * What is held is the images at full size, the ring, the figures and
   * what the next scan lays beside them — and the words here say so, and
   * say that none of it is a verdict either.
   */
  locked: {
    caveat:
      'What is written above is a reading of the pictures, not of your hair, and one scan cannot show change.',
    body:
      'The rest of this card — the images at full size, any ring and figures, and what the next scan lays beside them — is in the full report. It is measured the same way and makes no judgement about your hair either.',
    placeholder: 'The rest of this card, held for the full report. Nothing here is a figure.',
    button: 'See the full report',
    hint: 'Opens the Premium page.',
  },

  actions: {
    done: 'Done',
    rescan: 'Scan again',
    continue: 'Continue',
  },
});

/* ------------------------------ the model ------------------------------- */

/** The label of a choice, quoted: how the report reads somebody's answer back inside its own sentence. */
export function quote(label: string): string {
  return `“${label}”`;
}

/** The quoted spans in a sentence — the person's own answers, read back — without their marks. */
export function quotedSpans(text: string): string[] {
  return [...text.matchAll(/“([^”]*)”/g)].map((m) => m[1] ?? '');
}

/** A sentence with its quotations lifted out, which is the part the app authored. */
export function stripQuotes(text: string): string {
  return text.replace(/“[^”]*”/g, '').replace(/\s{2,}/g, ' ').trim();
}

const count = (n: unknown, one: string, many: string): string => `${String(n)} ${Number(n) === 1 ? one : many}`;
/** The verb after a list of places: one place "was", several "were". */
const were = (n: unknown): string => (Number(n) === 1 ? 'was' : 'were');

/**
 * Every fixed string of the report as the view-model builds it — one
 * long sheet of sections over the hero — kept apart from the card copy
 * above so the two can be read, and retired, separately.
 *
 * The same rules hold. A row headline is a fact about a frame, counted
 * on this device; a row with nothing counted says what was kept and
 * what the next scan lets it compare, in words. A strength is a fact
 * about the images or the record. A profile tile is the label of a
 * choice. The focus block says whether the turn reached a region, and
 * never what the region shows. Nothing here describes a head.
 */
export const HAIR_SCAN_REPORT_MODEL_COPY = Object.freeze({
  hero: {
    dateChip: (date: string, time: string) => `${date} at ${time}`,
  },

  tabs: {
    all: 'All',
    hairline: 'Hairline',
    temples: 'Temples',
    crown: 'Crown',
    light: 'Light',
  },

  sections: {
    analysis: 'Analysis',
    strengths: 'What’s working',
    profile: 'Your profile',
    focus: 'Your focus',
    tips: 'Care notes',
    routine: 'Routine',
    says: 'Tress says',
  },

  regions: {
    hairline: 'Hairline',
    temples: 'Temples',
    leftTemple: 'Left temple',
    rightTemple: 'Right temple',
    crown: 'Crown',
    top: 'Top',
    light: 'Light and framing',
  },

  analysis: {
    heading: 'Hair analysis',
    subheading: 'What this device read in the frames it kept. A reading of the pictures, never of you.',
  },

  hairline: {
    measured: (upper: number) => `Hair covers ${upper}% of the upper third of the front frame.`,
    measuredBody: (upper: number) =>
      `The on-device mask marked ${upper}% of the top third of the front frame as hair and ${100 - Number(upper)}% as not hair — forehead, background and anything it was less than half sure of. Area in a picture moves with framing and styling; the next scan at the same distance is what makes two figures comparable.`,
    balanceEven: 'In the front frame the hair area sits about evenly either side of centre.',
    balanceSide: (side: string, points: number) =>
      `In the front frame the hair area sits ${points} points more to the ${side} of centre than the other side.`,
    kept: (light: string, focus: string) => `A front frame was kept: ${light}, ${focus}.`,
    keptBody:
      'Light and focus were read on this device. The hair-area reading needs the on-device segmenter, which did not run on this frame, so no area figure is printed here. The next scan reads its own front frame and lays the two side by side.',
    keptEmptyBody:
      'Light and focus were read on this device. The segmenter ran on this frame and marked too little as hair to print a figure from — a frame that was mostly background, or a mask that did not settle — so no area figure is printed here. The next scan reads its own front frame and lays the two side by side.',
    bare: 'A front frame was kept.',
    bareBody:
      'Nothing was read from it beyond keeping it. The next scan reads light, focus and, where the segmenter runs, hair area on its own front frame, and lays the two side by side.',
    none: 'No front frame was kept from this turn.',
    noneBody:
      'The turn did not hold a face-on frame long enough to keep one. Facing the camera for a moment at the start of the next scan gives it one.',
  },

  temples: {
    both: (left: number, right: number) =>
      `Hair covers ${left}% of the left-side frame and ${right}% of the right-side frame.`,
    close: (diff: number) =>
      `The two are within ${count(diff, 'point', 'points')} of each other, inside what framing alone moves between two shots.`,
    apart: (side: string, diff: number) =>
      `The ${side}-side frame shows more hair area, by ${diff} points. Two pictures at two turns; matching the turn next time is what makes them comparable.`,
    turns: (left: number, right: number) => `Turned ${left}° for the left side and ${right}° for the right.`,
    one: (side: string, fraction: number) => `Only the ${side}-side frame was kept; hair covers ${fraction}% of it.`,
    oneUnmeasured: (side: string) => `Only the ${side}-side frame was kept.`,
    oneBody:
      'One side is one picture, and cannot be balanced against anything on its own. The other side comes from the next scan, turned the same amount.',
    kept: 'Both side frames were kept.',
    keptBody: (left: string, right: string) => `Left side ${left}; right side ${right}.`,
    keptRest:
      'The hair-area reading needs the on-device segmenter, which did not run on these frames, so there is no left–right figure here. The next scan puts each side beside the same side from this one.',
    keptRestEmpty:
      'The segmenter ran but marked too little as hair on at least one side to print a figure from, so there is no left–right figure here. The next scan puts each side beside the same side from this one.',
    bareBody:
      'Nothing was read from them beyond keeping them. The next scan puts each side beside the same side from this one.',
    none: 'No side frames were kept from this turn.',
    noneBody:
      'The turn did not hold either side long enough to keep a frame. Turning a little further, and pausing at each side, gives the next scan both.',
  },

  crown: {
    measured: (frame: string, rest: number) => `In the ${frame} frame, ${rest}% of the frame was not counted as hair.`,
    measuredBody:
      'That is everything outside the marked area — scalp where a parting shows, and also background, skin and anything the mask was less than half sure about. It is the mask’s remainder, not a scalp measurement, and it moves with how the phone was held.',
    kept: (frame: string, light: string, focus: string) => `A ${frame} frame was kept: ${light}, ${focus}.`,
    keptBody:
      'Light and focus were read on this device. The hair-area reading needs the on-device segmenter, which did not run on this frame, so nothing here says how much of the frame was hair. The next scan’s top frame sits beside this one at the same tilt.',
    keptEmptyBody:
      'Light and focus were read on this device. The segmenter ran on this frame and marked too little as hair to print a figure from — a frame that was mostly background, or a mask that did not settle — so nothing here says how much of the frame was hair. The next scan’s top frame sits beside this one at the same tilt.',
    bare: (frame: string) => `A ${frame} frame was kept.`,
    bareBody: 'Nothing was read from it beyond keeping it. The next scan reads its own and lays the two side by side.',
    none: 'No top frame was kept from this turn.',
    noneBody:
      'No frame was kept with the head tipped far enough down to show the top, and the back of the head is out of reach of a scan that faces the camera. Tipping the chin further down during the next turn gives it a top frame to keep.',
  },

  light: {
    even: (spread: number) =>
      Number(spread) === 0
        ? 'The frames were lit to the same brightness reading, on a scale of 255.'
        : `The frames were lit within ${spread} points of each other on a scale of 255.`,
    mixed: (spread: number) => `The frames were lit ${spread} points apart on a scale of 255.`,
    one: (light: string, focus: string) => `The frame with a reading was ${light}, ${focus}.`,
    evenBody: (n: number) =>
      `Light and focus were read on ${count(n, 'frame', 'frames')}, so the light accounts for little of any difference you see between two of them. The next scan in the same room at the same time of day keeps it that way.`,
    mixedBody: (n: number) =>
      `Light and focus were read on ${count(n, 'frame', 'frames')}. A difference you see between two of them could be the light rather than what was in front of it; the next scan in one steady light, away from a window, is the fix.`,
    oneBody:
      'One frame is lit however it is lit. The next scan in the same room at the same time of day gives the two the same light to be read in.',
    turn: (percent: number) => `The ring closed to ${percent}%.`,
  },

  strengths: {
    heading: 'What’s working',
    light: {
      title: 'Even light',
      body: (spread: number) =>
        Number(spread) === 0
          ? 'Every frame with a reading was lit to the same brightness reading, in the band the reading works best in.'
          : `Every frame with a reading was lit within ${spread} points of the others, in the band the reading works best in.`,
      bodyOne: 'The frame with a reading was evenly lit, in the band the reading works best in.',
    },
    framing: {
      title: 'Square-on framing',
      body: (yaw: number, pitch: number) =>
        `The front frame was kept with the head turned ${yaw}° and tipped ${pitch}°: close enough to square that the next scan can match it.`,
    },
    coverage: {
      title: 'A full turn',
      body: (percent: number) => `The ring closed to ${percent}%, so the turn reached the parts of the head the scan asks for.`,
      sidesTitle: 'Both sides reached',
      sidesBody: 'Frames were kept from the front and from both sides, which is what a left–right comparison needs next time.',
    },
    routine: {
      title: (percent: number) => `Routine ticked ${percent}% of days`,
      body: 'Over the last thirty days, as the ticks record it. A routine that is written down is one the scans can be read against.',
    },
    streak: {
      title: (days: number) => `${count(days, 'day', 'days')} in a row`,
      body: 'Every daily item ticked on each of those days, as the record shows it.',
    },
    record: {
      title: (n: number) => `${count(n, 'scan', 'scans')} on record`,
      body: 'Each one taken by the same scanner at the same angles, which is what makes two of them comparable.',
      firstTitle: 'A first scan on record',
      firstBody: 'Every later scan is laid beside this one. That is what a first scan is for.',
      deviceTitle: 'Read on this device',
      deviceBody: 'The frames were read on this phone and stayed on it. Nothing in this report was uploaded.',
    },
  },

  profile: {
    heading: 'Based on your profile',
    goal: 'Your focus',
    noticed: 'When you noticed',
    watching: 'What you watch',
    motivation: 'Why it matters',
    approach: 'Your approach',
    unanswered: 'Not answered',
  },

  focus: {
    heading: 'Your focus',
    captured: 'Focus area captured',
    partly: 'Focus area partly captured',
    missed: 'Focus area not captured',
    notVisible: 'Not something a scan can see',
    recordLabel: 'Tracked in the record',
    capturedBody: (regions: string, n: number) =>
      `The turn kept ${count(n, 'frame', 'frames')} covering the ${regions} — the part of the head you said you are watching. That is coverage of the region, not a reading of it: what the region shows is compared between scans, never judged from one.`,
    partlyBody: (reached: string, missing: string, missingCount: number) =>
      `The turn kept frames for the ${reached}; the ${missing} ${were(missingCount)} not reached this time. Pausing a little longer at each part of the turn gives the next scan the rest. Coverage of a region is not a reading of it.`,
    missedBody:
      'No frame from this turn reached the part of the head you said you are watching. The next scan, held a little longer at each part of the turn, gives it one.',
    crownNote: 'The back of the head is out of reach of a scan that faces the camera, so the crown counts the top frame.',
    crownMissingNote: 'The back of the head is out of reach of a scan that faces the camera, so the crown counts the top frame; tipping the chin further down during the next turn gives it one.',
    shedding:
      'Shedding is counted in the shower and on the brush, not in a photograph. The record tracks it through your notes and routine ticks; the scan keeps the pictures.',
    breakage:
      'Breakage shows at the ends and in the brush, not in a scan from arm’s length. The record tracks it through your notes; the scan keeps the pictures.',
    routine:
      'Whether a routine is working is read from the record over months — ticks, notes and scans side by side — not from one scan.',
  },

  tips: {
    heading: 'Care notes',
    subheading: 'General care practice, the kind a good hairdresser mentions. None of it is a treatment, and none of it is about your scan.',
  },

  routine: {
    heading: 'Your routine',
    empty: 'Nothing on your list yet. Products you scan and steps you tick live here, so the scans can be read against what you did.',
    filled: (n: number) =>
      `${count(n, 'product', 'products')} on your shelf. The scans are read against what you did, so the list is worth keeping current.`,
    cta: 'Build your routine',
  },

  says: {
    heading: 'Tress says',
  },

  /** How a row marks where its figure came from. Only a hair-area reading earns the first. */
  marks: {
    measured: 'Measured',
    kept: 'Kept',
  },
});

/** The arguments the sweep feeds a copy function, one call per entry. */
const SAMPLES: unknown[] = ['leftTemple', 41, '14 Sep'];

/**
 * Every fixed string, plus each function called with samples, so the
 * honesty sweep reads the whole vocabulary rather than the half that
 * happens to be a literal. Three-argument lines get the same arguments
 * the two-argument ones do, with a third word. Both objects are read:
 * the card copy and the model copy are one vocabulary to the sweep.
 */
export function reportCopySentences(): string[] {
  const out: string[] = [];

  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      out.push(value);
      return;
    }
    if (typeof value === 'function') {
      const fn = value as (...args: unknown[]) => string;
      if (fn.length >= 3) {
        out.push(fn('front', 'dark', 'soft'), fn('top', 'evenly lit', 'sharp'));
      } else if (fn.length === 2) {
        out.push(fn(38, 41), fn('leftTemple', 7), fn('left', 3), fn('Front 41%, Top 30%', 2));
      } else {
        for (const sample of SAMPLES) out.push(fn(sample));
        out.push(fn(0), fn(100));
      }
      return;
    }
    if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) visit(nested);
    }
  };

  visit(HAIR_SCAN_REPORT_COPY);
  visit(HAIR_SCAN_REPORT_MODEL_COPY);
  return out.filter((s) => typeof s === 'string');
}
