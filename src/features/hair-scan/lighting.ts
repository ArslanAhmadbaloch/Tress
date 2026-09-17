/**
 * How bright the room is, said calmly.
 *
 * The scanner reads the light many times a second and shows one word for
 * it. Read raw, that word would flicker: a hand crossing a lamp, the
 * camera's own exposure hunting, one frame of a dark jumper filling the
 * lens — each would flip the pill for a fraction of a second, and a pill
 * that flickers is a pill nobody trusts. So the level goes through three
 * stages before it is allowed to become a word:
 *
 *   1. Smoothing. An exponential average with a time constant of about
 *      half a second, so a single odd frame moves the number a little and
 *      a real change moves it all the way within a second or so.
 *   2. Hysteresis. Each band's edge is wider on the way out than on the
 *      way in, so a level sitting exactly on a boundary does not tick back
 *      and forth across it.
 *   3. Dwell. Once a word is shown it stays for at least
 *      {@link LIGHTING_DWELL_MS} before another may replace it.
 *
 * Everything here is arithmetic over numbers, so it runs in a test with
 * no camera, no native module and no clock but the one the test supplies.
 * The only thing measured is the photograph's light — a mean of pixels —
 * and every word it produces is about the room, never about the head.
 *
 * `meanLuminance` and `meanLuminanceInterleaved` carry the `'worklet'`
 * directive so the frame processor in `lighting-probe.tsx` can call them
 * on the camera thread. Outside a worklet runtime the directive is an
 * inert string, which is what lets the same functions be tested in Node.
 */

/** The four words the pill can say, from brightest to darkest. */
export type LightingLevel = 'perfect' | 'good' | 'dim' | 'dark';

/**
 * Where a reading came from.
 *
 *  - `frame`: the live frame processor, several times a second.
 *  - `still`: the brightness of a photograph the scanner captured,
 *    measured after the fact. The fallback for a build without the
 *    frame processor, and much slower to react.
 *  - `none`: nothing has been measured yet.
 */
export type LightingSource = 'frame' | 'still' | 'none';

export type LightingReading = {
  /** The word the pill shows. Smoothed, hysteretic, and held for the dwell. */
  level: LightingLevel;
  /** The smoothed level, 0 (black) to 1 (white). What capture gating reads. */
  smoothed: number;
  /** The last raw sample, 0–1, before smoothing. */
  raw: number;
  /** When the last sample was taken, in milliseconds. */
  at: number;
  /** When `level` last changed, in milliseconds. */
  since: number;
  source: LightingSource;
};

/** The shortest time a word stays on the pill once shown. */
export const LIGHTING_DWELL_MS = 900;

/**
 * Where each band begins, as a fraction of full white, in the order the
 * levels get brighter. A mean luminance below `dim` is dark; a mean at or
 * above `perfect` is perfect. Set against the still-photo thresholds in
 * `image-quality.ts` — its "too dark" at 60/255 lands inside `dim` here,
 * so a room the pill calls dim is one the photograph would be flagged in.
 */
export const LIGHTING_BANDS = {
  dim: 0.16,
  good: 0.3,
  perfect: 0.46,
} as const;

/**
 * How far past a boundary the level has to travel before the band
 * changes. Three per cent of full scale is about eight grey levels: more
 * than exposure hunting moves a mean, less than switching a lamp on.
 */
export const LIGHTING_HYSTERESIS = 0.03;

/**
 * Time constant of the smoothing, in milliseconds. After this long at a
 * new level the smoothed value has covered about two thirds of the gap.
 */
export const LIGHTING_SMOOTHING_MS = 500;

/**
 * A gap between samples longer than this means the stream stopped — the
 * camera paused, the app went to the background — and the next sample
 * starts the average afresh rather than being pulled towards a stale one.
 */
export const LIGHTING_STALE_MS = 3000;

/** The bands, darkest first, with the lower edge of each. */
const ZONES: { level: LightingLevel; from: number }[] = [
  { level: 'dark', from: 0 },
  { level: 'dim', from: LIGHTING_BANDS.dim },
  { level: 'good', from: LIGHTING_BANDS.good },
  { level: 'perfect', from: LIGHTING_BANDS.perfect },
];

function zoneIndex(level: LightingLevel): number {
  return ZONES.findIndex((zone) => zone.level === level);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * The band a level falls in, with hysteresis against the band it was in.
 *
 * With no previous band the answer is the plain lookup. With one, the
 * level has to cross each boundary between the old band and the new by
 * {@link LIGHTING_HYSTERESIS} — upwards to brighten, downwards to darken
 * — or the old band is kept. A level that swings a hair either side of an
 * edge therefore stays put, whichever side it started on.
 */
export function classifyLighting(level: number, previous?: LightingLevel): LightingLevel {
  const value = clamp01(level);
  if (previous === undefined) {
    let zone = 0;
    for (let i = 1; i < ZONES.length; i += 1) {
      if (value >= ZONES[i].from) zone = i;
    }
    return ZONES[zone].level;
  }

  let zone = zoneIndex(previous);
  if (zone < 0) return classifyLighting(value);

  // Brightening: climb while the level clears the next edge by the margin.
  while (zone + 1 < ZONES.length && value >= ZONES[zone + 1].from + LIGHTING_HYSTERESIS) {
    zone += 1;
  }
  // Darkening: descend while the level is under this band's own edge by the margin.
  while (zone > 0 && value < ZONES[zone].from - LIGHTING_HYSTERESIS) {
    zone -= 1;
  }
  return ZONES[zone].level;
}

/**
 * Whether the engine may capture a frame under this light.
 *
 * Dim and dark are refused: a photograph taken there is one the quality
 * pass would flag anyway, and a scan that keeps a frame it will then
 * apologise for is worse than a scan that waits a second for the person
 * to turn towards the window.
 */
export function lightingAllowsCapture(level: LightingLevel): boolean {
  return level === 'perfect' || level === 'good';
}

/**
 * The number to hand the scan engine as a tick's `lighting`.
 *
 * The engine gates on a plain threshold over a 0–1 level. Fed the raw
 * sample it would inherit none of the calm above: it could refuse a frame
 * the pill calls good, or keep one the pill calls dim, for the fraction
 * of a second the two disagreed. So the engine is given the smoothed
 * level while the word on the pill allows a capture, and zero — the
 * darkest level there is — while it does not. The gate then agrees with
 * the pill exactly, dwell and hysteresis included, whatever threshold the
 * engine keeps for itself. Null before anything has been measured, which
 * the engine treats as "unknown, never gate".
 */
export function lightingGateLevel(reading: LightingReading | null): number | null {
  if (reading === null) return null;
  return lightingAllowsCapture(reading.level) ? reading.smoothed : 0;
}

/**
 * A still photograph's mean brightness (0–255, as `assessQuality` reports
 * it) as a 0–1 level the tracker understands.
 */
export function levelFromBrightness(brightness: number): number {
  return clamp01(brightness / 255);
}

/**
 * Mean luminance of one 8-bit luma plane, sampled on a grid.
 *
 * `bytesPerRow` may be wider than `width` — camera buffers are padded —
 * so rows are addressed by stride, never by width. `step` is the grid
 * pitch in pixels: 8 on a 640×480 plane is 4,800 reads, which is nothing,
 * and the mean of a grid that coarse is within a level or two of the mean
 * of every pixel.
 *
 * Returns 0–1, or null when there is nothing to measure: an empty plane,
 * or a buffer shorter than the geometry claims.
 */
export function meanLuminance(
  plane: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
  step: number,
): number | null {
  'worklet';
  if (width <= 0 || height <= 0 || bytesPerRow < width) return null;
  const pitch = step >= 1 ? Math.floor(step) : 1;
  const lastRow = (height - 1) * bytesPerRow;
  if (plane.length < lastRow + width) return null;

  // The grid starts half a pitch in, so each sample sits at the centre of
  // the cell it stands for and a gradient is not read from one side.
  const start = Math.floor(pitch / 2);
  let sum = 0;
  let count = 0;
  for (let y = start; y < height; y += pitch) {
    const row = y * bytesPerRow;
    for (let x = start; x < width; x += pitch) {
      sum += plane[row + x];
      count += 1;
    }
  }
  if (count === 0) return null;
  return sum / (count * 255);
}

/**
 * Mean brightness of an interleaved colour buffer — BGRA, RGBA, RGB — on
 * the same grid. The three colour channels are averaged equally rather
 * than luma-weighted, because the channel order is not known here and a
 * flat mean is within a few levels of Rec. 601 for anything a room does.
 * Any fourth channel is ignored.
 *
 * Returns 0–1, or null when there is nothing to measure.
 */
export function meanLuminanceInterleaved(
  bytes: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
  bytesPerPixel: number,
  step: number,
): number | null {
  'worklet';
  if (width <= 0 || height <= 0 || bytesPerPixel < 3 || bytesPerRow < width * bytesPerPixel) {
    return null;
  }
  const pitch = step >= 1 ? Math.floor(step) : 1;
  const lastRow = (height - 1) * bytesPerRow;
  if (bytes.length < lastRow + width * bytesPerPixel) return null;

  const start = Math.floor(pitch / 2);
  let sum = 0;
  let count = 0;
  for (let y = start; y < height; y += pitch) {
    const row = y * bytesPerRow;
    for (let x = start; x < width; x += pitch) {
      const i = row + x * bytesPerPixel;
      sum += bytes[i] + bytes[i + 1] + bytes[i + 2];
      count += 3;
    }
  }
  if (count === 0) return null;
  return sum / (count * 255);
}

export type LightingTrackerOptions = {
  /** Override of {@link LIGHTING_DWELL_MS}. Tests only; the product keeps the default. */
  dwellMs?: number;
  /** Override of {@link LIGHTING_SMOOTHING_MS}. */
  smoothingMs?: number;
  /** Override of {@link LIGHTING_STALE_MS}. */
  staleMs?: number;
};

export type LightingTracker = {
  /**
   * Feeds one raw sample, 0–1, taken at `at` milliseconds, and returns the
   * reading the pill should show now. Samples must arrive in time order;
   * one from the past is treated as arriving now.
   */
  push(raw: number, at: number, source: Exclude<LightingSource, 'none'>): LightingReading;
  /** The latest reading, or null before the first sample. */
  current(): LightingReading | null;
  /** Forgets everything, as if freshly created. */
  reset(): void;
};

/**
 * The state behind the pill: smoothing, hysteresis and dwell, in that
 * order, over whatever samples are fed in. One per scan; nothing here is
 * shared, and nothing here reads a clock — the caller supplies `at`.
 */
export function createLightingTracker(options: LightingTrackerOptions = {}): LightingTracker {
  const dwellMs = options.dwellMs ?? LIGHTING_DWELL_MS;
  const smoothingMs = options.smoothingMs ?? LIGHTING_SMOOTHING_MS;
  const staleMs = options.staleMs ?? LIGHTING_STALE_MS;

  let reading: LightingReading | null = null;

  return {
    push(rawLevel, atRaw, source) {
      const raw = clamp01(rawLevel);
      const previous = reading;
      const at = previous && atRaw < previous.at ? previous.at : atRaw;

      if (previous === null || at - previous.at > staleMs) {
        reading = {
          level: classifyLighting(raw),
          smoothed: raw,
          raw,
          at,
          since: at,
          source,
        };
        return reading;
      }

      /*
        Time-aware exponential average. Two samples 250 ms apart and one
        500 ms later move the average by the same amount as three at the
        even rate would; the frame processor is throttled but not
        metronomic, and the fallback's stills arrive whenever they arrive.
      */
      const dt = at - previous.at;
      const alpha = smoothingMs <= 0 ? 1 : 1 - Math.exp(-dt / smoothingMs);
      const smoothed = previous.smoothed + alpha * (raw - previous.smoothed);

      const candidate = classifyLighting(smoothed, previous.level);
      const held = at - previous.since < dwellMs;
      const level = candidate !== previous.level && !held ? candidate : previous.level;

      reading = {
        level,
        smoothed,
        raw,
        at,
        since: level === previous.level ? previous.since : at,
        source,
      };
      return reading;
    },
    current() {
      return reading;
    },
    reset() {
      reading = null;
    },
  };
}

/**
 * What the pill says for each level, and the one-line hint under the
 * ring where there is something the person can do about it.
 *
 * The words describe the room. None of them praises the person, none of
 * them mentions hair, and the two that ask for something ask for light,
 * which is the only thing this module can actually see.
 */
export const LIGHTING_COPY: Record<LightingLevel, { label: string; hint: string | null }> = {
  perfect: { label: 'Well lit', hint: null },
  good: { label: 'Good light', hint: null },
  dim: { label: 'A little dim', hint: 'Turn towards a window or a lamp' },
  dark: { label: 'Too dark', hint: 'Find more light to start the scan' },
};

/** What the pill says before anything has been measured. */
export const LIGHTING_PENDING_LABEL = 'Reading the light';

/** Every sentence this module can put on screen, for the honesty sweep. */
export function lightingCopySentences(): string[] {
  const sentences: string[] = [LIGHTING_PENDING_LABEL];
  for (const { label, hint } of Object.values(LIGHTING_COPY)) {
    sentences.push(label);
    if (hint) sentences.push(hint);
  }
  return sentences;
}
