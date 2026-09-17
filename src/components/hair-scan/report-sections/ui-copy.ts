/**
 * The report screen's own words: its chrome, not its content.
 *
 * Everything the report *says* about the scan comes from the view-model
 * (features/hair-scan/report-model.ts) and is swept there. What is left
 * here is the labels on controls — the way out, the way round, the pill
 * that walks the sections, the ends of the coverage bar, the one button
 * to the paywall — and the placeholder's accessible name. None of it
 * describes a head; scripts/test/hair-scan-report.test.ts reads this
 * file and holds it to that.
 */

export const HAIR_SCAN_REPORT_UI_COPY = Object.freeze({
  actions: {
    done: 'Done',
    rescan: 'Scan again',
    continue: 'Continue',
    next: 'Next',
    back: 'Back',
  },
  /** The one button to the paywall, and what a held block stands for. */
  locked: {
    button: 'See the full report',
    hint: 'Opens the Premium page.',
    placeholder: 'Held for the full report. Nothing here is a figure.',
    /** Under the first row when the rest are held. */
    note: 'The full report opens every row, your focus, the care notes and the routine. It is measured the same way and makes no judgement about your hair either.',
  },
  /** The ends of the coverage bar in the focus block. */
  focus: {
    barStart: 'Not captured',
    barEnd: 'Captured',
    framesLabel: (n: number) => (n === 1 ? '1 frame' : `${n} frames`),
    /** The bar's fill, read aloud: the share of the focus regions a frame reached. */
    barValue: (percent: number) => `${percent}% of the focus regions captured`,
  },
  /** A crop drawn from the fallback rectangle rather than a placed one. */
  crop: {
    approximate: 'Top of the frame',
  },
  /** The routine block's empty product tile and the overflow tile. */
  routine: {
    emptyTile: '?',
    more: (n: number) => `+${n}`,
  },
  hero: {
    photoLabel: 'The main still from your scan',
  },
  /** How the reader is told what a section is, for a screen reader. */
  a11y: {
    tabs: 'Filters the analysis rows',
    nextHint: (label: string) => `Scrolls to ${label}`,
    cropLabel: (region: string) => `${region} crop`,
    tile: (value: string, label: string) => `${label}: ${value}`,
    product: (name: string) => `${name}`,
    tipNumber: (n: number) => `Note ${n}`,
  },
});

/** Every fixed string here, plus each function called with a sample, for the sweep. */
export function reportUiCopySentences(): string[] {
  const out: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      out.push(value);
      return;
    }
    if (typeof value === 'function') {
      const fn = value as (...args: unknown[]) => string;
      out.push(fn(1, 'Hairline'), fn(3, 'Crown'), fn('Analysis', 'Your focus'));
      return;
    }
    if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) visit(nested);
    }
  };
  visit(HAIR_SCAN_REPORT_UI_COPY);
  return out.filter((s) => typeof s === 'string');
}
