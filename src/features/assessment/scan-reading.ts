/**
 * What the scan report says, and where every word of it comes from.
 *
 * The report at the end of the funnel is built from one photograph and
 * the two readings the device took of it while the shutter was still
 * warm: the photograph's own quality — brightness, contrast, sharpness,
 * clipping — and, when the native segmenter is present, how much of the
 * frame the hair mask claims. Both are measurements of pixels. Neither
 * is a measurement of a person.
 *
 * ── The line ──────────────────────────────────────────────────────────
 * Every sentence here describes the picture: "hair covers 41% of the
 * upper frame", "evenly lit", "sharp". None of them describes the head in
 * it. A mask cannot see between strands, so area is not thickness; a
 * phone camera cannot stage anything, so a percentage is not a
 * classification. The tests sweep this file's output for the words that
 * would mean it had crossed over, and a report that fails them is not a
 * report this app ships.
 *
 * It is pure — a session in, a description out — so the screen that
 * renders it has nothing to decide and the tests need no device.
 */

import type { Photo, PhotoCoverage, PhotoQuality, PhotoSession } from '@/types/domain';

/**
 * A coverage reading as the domain stores it, plus the left/right split
 * the segmenter now also reports. Optional because photographs measured
 * before it existed carry no split, and the honest thing to show for
 * them is no balance reading rather than a guessed one.
 */
export type ScanCoverage = PhotoCoverage & { horizontalBalance?: number };

export type ReadingTone = 'good' | 'neutral' | 'attention';

/** A number the report draws as a ring. */
export type RingReading = {
  id: 'frame' | 'upper';
  /** 0–1, what the ring fills to. */
  value: number;
  /** The short label under the ring. */
  label: string;
  /** One sentence stating the measurement. */
  headline: string;
  /** What was measured, and what it is not. */
  detail: string;
};

/** A word the report draws as a tile: "Even", "Sharp", "Held". */
export type TileReading = {
  id: 'light' | 'sharpness' | 'detail' | 'balance';
  label: string;
  /** The short verdict, two words at most. */
  value: string;
  /** One sentence stating the measurement. */
  headline: string;
  /** The number behind it, and what to do if it is off. */
  detail: string;
  tone: ReadingTone;
};

export type ScanReading = {
  photo: Photo;
  /** The frame-area readings, drawn as rings. Empty without a segmenter. */
  rings: RingReading[];
  /** The photograph's own quality, drawn as tiles. Empty if unmeasured. */
  tiles: TileReading[];
  /**
   * The upper-frame band and the left/right split, as fractions of the
   * frame, for the overlay on the hero. Null when there is no coverage
   * reading — the overlay then draws nothing, because a band with no
   * number behind it is a decoration pretending to be a measurement.
   */
  overlay: {
    /** Fraction of the upper third counted as hair. */
    upperFraction: number;
    /** Fraction of the whole frame counted as hair. */
    fraction: number;
    /** Fraction of the hair area sitting left of centre, if measured. */
    leftShare: number | null;
  } | null;
  /** Why the rings are missing, when they are. Null when they are present. */
  coverageAbsent: { headline: string; detail: string } | null;
  /** What to do next month, at most three lines, most useful first. */
  nextTime: string[];
  /** The one-paragraph statement of what this reading is and is not. */
  scope: string;
};

/* ------------------------------- thresholds ------------------------------ */

/*
  These mirror image-quality.ts rather than importing its constants,
  because that module flags problems and this one describes readings —
  the bands here are wider, so a photograph that is a little dark is
  described as such without being flagged as unusable.
*/
const DARK = 60;
const DIM = 85;
const BRIGHT = 205;
const FLAT_CONTRAST = 18;
const SOFT = 6;
const CRISP = 12;
const CLIP_LIMIT = 0.12;
const CLIP_NOTICE = 0.04;

/** Below this the mask found so little hair that no area reading is honest. */
const EMPTY_MASK = 0.02;

/** A left/right split inside this band reads as square to the camera. */
const BALANCE_BAND = 0.06;

function pct(fraction: number): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * 100);
}

/* --------------------------------- rings --------------------------------- */

export function frameHeadline(coverage: Pick<ScanCoverage, 'fraction'>): string {
  return `Hair covers ${pct(coverage.fraction)}% of the frame.`;
}

export function upperHeadline(coverage: Pick<ScanCoverage, 'upperFraction'>): string {
  return `Hair covers ${pct(coverage.upperFraction)}% of the upper frame.`;
}

function coverageRings(coverage: ScanCoverage): RingReading[] {
  return [
    {
      id: 'frame',
      value: coverage.fraction,
      label: 'of the frame',
      headline: frameHeadline(coverage),
      detail:
        'The on-device segmenter marks each pixel as hair or not, and this is the share it marked. It measures area — how much of the photograph is hair — not how close together the strands are.',
    },
    {
      id: 'upper',
      value: coverage.upperFraction,
      label: 'of the upper frame',
      headline: upperHeadline(coverage),
      detail:
        'The top third of the photograph, which is where the hairline sits in a front shot. Next month’s photograph is lined up against this number, so the same framing matters more than the number itself.',
    },
  ];
}

/* --------------------------------- tiles --------------------------------- */

function lightTile(q: PhotoQuality): TileReading {
  const b = Math.round(q.brightness);
  const behind = `Mean brightness ${b} of 255.`;

  if (q.brightness < DARK) {
    return {
      id: 'light',
      label: 'Light',
      value: 'Dark',
      headline: 'The photograph came out dark.',
      detail: `${behind} Facing a window usually fixes it; matching the light next time matters more than having a lot of it.`,
      tone: 'attention',
    };
  }
  if (q.brightness < DIM) {
    return {
      id: 'light',
      label: 'Light',
      value: 'Low',
      headline: 'The photograph is a little dark.',
      detail: `${behind} Usable, and worth a brighter spot next time so the two line up.`,
      tone: 'neutral',
    };
  }
  if (q.brightness > BRIGHT) {
    return {
      id: 'light',
      label: 'Light',
      value: 'Bright',
      headline: 'The photograph came out very bright.',
      detail: `${behind} Direct sun and overhead spotlights wash out the scalp; softer, even light holds more detail.`,
      tone: 'attention',
    };
  }
  return {
    id: 'light',
    label: 'Light',
    value: 'Even',
    headline: 'Evenly lit.',
    detail: `${behind} Comfortably inside the range the comparison needs.`,
    tone: 'good',
  };
}

function sharpnessTile(q: PhotoQuality): TileReading {
  const s = q.sharpness.toFixed(1);
  const behind = `Edge response ${s}; under ${SOFT} reads as soft.`;

  if (q.sharpness < SOFT) {
    return {
      id: 'sharpness',
      label: 'Focus',
      value: 'Soft',
      headline: 'The photograph came out soft.',
      detail: `${behind} Bracing the phone against something, or asking somebody else to take it, is usually enough.`,
      tone: 'attention',
    };
  }
  if (q.sharpness < CRISP) {
    return {
      id: 'sharpness',
      label: 'Focus',
      value: 'Clear',
      headline: 'In focus.',
      detail: `${behind} Clear enough to compare; holding still a beat longer would sharpen it further.`,
      tone: 'good',
    };
  }
  return {
    id: 'sharpness',
    label: 'Focus',
    value: 'Sharp',
    headline: 'Sharp.',
    detail: `${behind} The detail the comparison relies on is all there.`,
    tone: 'good',
  };
}

function detailTile(q: PhotoQuality): TileReading {
  const clipped = pct(q.clipped);
  const c = Math.round(q.contrast);

  if (q.clipped > CLIP_LIMIT) {
    return {
      id: 'detail',
      label: 'Detail',
      value: 'Burnt',
      headline: 'Some highlights are burnt out.',
      detail: `${clipped}% of pixels are pure white or pure black. Detail lost that way cannot be recovered later, so softer light next time is worth it.`,
      tone: 'attention',
    };
  }
  if (q.contrast < FLAT_CONTRAST) {
    return {
      id: 'detail',
      label: 'Detail',
      value: 'Flat',
      headline: 'The light is very flat.',
      detail: `Contrast ${c}; under ${FLAT_CONTRAST} hides the texture the comparison relies on. A little directional light helps.`,
      tone: 'neutral',
    };
  }
  if (q.clipped > CLIP_NOTICE) {
    return {
      id: 'detail',
      label: 'Detail',
      value: 'Held',
      headline: 'Detail held, with a few bright spots.',
      detail: `${clipped}% of pixels are at the limit, contrast ${c}. Fine for now; avoiding a lamp behind you keeps it that way.`,
      tone: 'good',
    };
  }
  return {
    id: 'detail',
    label: 'Detail',
    value: 'Held',
    headline: 'Nothing burnt out.',
    detail: `${clipped}% of pixels at the limit, contrast ${c}. The whole range of the photograph survived.`,
    tone: 'good',
  };
}

/**
 * Where the hair area sits left to right.
 *
 * A framing reading, and only that. The two halves of a head square to
 * the camera hold about the same amount of hair; when one half holds
 * markedly more, the head was turned — which is worth knowing because
 * next month's photograph has to be turned the same way to compare.
 */
function balanceTile(coverage: ScanCoverage): TileReading | null {
  if (typeof coverage.horizontalBalance !== 'number') return null;

  const left = pct(coverage.horizontalBalance);
  const right = 100 - left;
  const behind = `${left}% of the hair area sits left of centre, ${right}% right.`;

  if (Math.abs(coverage.horizontalBalance - 0.5) <= BALANCE_BAND) {
    return {
      id: 'balance',
      label: 'Balance',
      value: 'Even',
      headline: 'Evenly balanced left to right.',
      detail: `${behind} The head was square to the camera, which is what makes next month comparable.`,
      tone: 'good',
    };
  }
  const side = coverage.horizontalBalance > 0.5 ? 'left' : 'right';
  return {
    id: 'balance',
    label: 'Balance',
    value: side === 'left' ? 'Left' : 'Right',
    headline: `More of the hair area sits to the ${side}.`,
    detail: `${behind} That usually means the head was turned a little; facing the camera squarely next time keeps the two readings comparable.`,
    tone: 'neutral',
  };
}

/* ------------------------------- next time ------------------------------- */

function nextTimeFor(tiles: TileReading[], coverage: ScanCoverage | null): string[] {
  const lines: string[] = [];

  // The most useful instruction on this screen, and the one that is true
  // whatever the readings said: the comparison depends on repetition.
  lines.push('Same spot, same time of day, same distance from the phone.');

  for (const t of tiles) {
    if (t.tone !== 'attention' && !(t.id === 'balance' && t.tone === 'neutral')) continue;
    if (t.id === 'light' && t.value === 'Dark') lines.push('Face a window, so the light comes from in front of you.');
    if (t.id === 'light' && t.value === 'Bright') lines.push('Step out of direct sun or the spotlight; softer light holds more detail.');
    if (t.id === 'sharpness') lines.push('Brace the phone, or hand it to somebody, so the shot is sharp.');
    if (t.id === 'detail') lines.push('Keep lamps and windows behind the phone rather than behind you.');
    if (t.id === 'balance') lines.push('Face the camera squarely, so both sides of the frame hold the same amount of hair.');
  }

  if (coverage && coverage.fraction < EMPTY_MASK) {
    lines.push('Fill the frame with your hair and hairline, so the reading has something to measure.');
  }

  return lines.slice(0, 3);
}

/* ------------------------------- the reading ----------------------------- */

const SCOPE_WITH_COVERAGE =
  'Everything above was measured on this device from the pixels in this photograph. It is a reading of the picture, not of your hair — area is not thickness, and one photograph cannot show change. It becomes useful the moment there is a second one to set beside it.';

const SCOPE_WITHOUT_COVERAGE =
  'Everything above was measured on this device from the pixels in this photograph. It is a reading of the picture, not of your hair, and one photograph cannot show change. It becomes useful the moment there is a second one to set beside it.';

export const COVERAGE_UNAVAILABLE = {
  headline: 'The area reading runs in the full app',
  detail:
    'The hair-area reading needs the on-device segmenter, which is installed in the full app build and not in this one. This build measured the photograph itself — light, focus and detail — and nothing was invented to fill the gap.',
};

export const COVERAGE_EMPTY = {
  headline: 'Too little hair area in the frame to read',
  detail:
    'The segmenter found almost no hair area in this frame, so no ring is drawn from it. That usually means the hair was out of frame, covered, or the light was too low for the model to read.',
};

/** The photograph the report is about: the front shot, or the first one that was measured. */
export function heroPhoto(session: PhotoSession): Photo | null {
  if (session.photos.length === 0) return null;
  return (
    session.photos.find((p) => p.angle === 'front' && p.coverage) ??
    session.photos.find((p) => p.coverage) ??
    session.photos.find((p) => p.angle === 'front') ??
    session.photos[0]
  );
}

export function buildScanReading(session: PhotoSession): ScanReading | null {
  const photo = heroPhoto(session);
  if (!photo) return null;

  const quality = photo.quality ?? null;
  const coverage = (photo.coverage as ScanCoverage | undefined) ?? null;

  const tiles: TileReading[] = quality
    ? [lightTile(quality), sharpnessTile(quality), detailTile(quality)]
    : [];

  const usable = coverage !== null && coverage.fraction >= EMPTY_MASK;
  const rings = usable ? coverageRings(coverage) : [];
  const balance = usable ? balanceTile(coverage) : null;
  if (balance) tiles.push(balance);

  return {
    photo,
    rings,
    tiles,
    overlay: usable
      ? {
          upperFraction: coverage.upperFraction,
          fraction: coverage.fraction,
          leftShare:
            typeof coverage.horizontalBalance === 'number' ? coverage.horizontalBalance : null,
        }
      : null,
    coverageAbsent: coverage === null ? COVERAGE_UNAVAILABLE : usable ? null : COVERAGE_EMPTY,
    nextTime: nextTimeFor(tiles, coverage),
    scope: usable ? SCOPE_WITH_COVERAGE : SCOPE_WITHOUT_COVERAGE,
  };
}

/** Every sentence a reading can show, for the honesty sweep in the tests. */
export function readingSentences(reading: ScanReading): string[] {
  return [
    ...reading.rings.flatMap((r) => [r.label, r.headline, r.detail]),
    ...reading.tiles.flatMap((t) => [t.label, t.value, t.headline, t.detail]),
    ...(reading.coverageAbsent
      ? [reading.coverageAbsent.headline, reading.coverageAbsent.detail]
      : []),
    ...reading.nextTime,
    reading.scope,
  ];
}
