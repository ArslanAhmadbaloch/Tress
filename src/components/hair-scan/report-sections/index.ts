/**
 * The two words the sections themselves own, and the names a screen
 * reader is given for a figure.
 *
 * Everything else the report says is the view-model's
 * (features/hair-scan/report-model.ts): every heading, every region
 * name, every observation, every sentence about what changed, the name
 * of the score, the word beside a confidence, and the honest line for a
 * scan the analysis could not read. What is left here is the label on a
 * control the model has no opinion about — the disclosure that keeps
 * light, focus and framing folded away low on the sheet — and the
 * patterns that join a label the model wrote to a figure it computed for
 * a screen reader. scripts/test/hair-scan-report.test.ts sweeps this
 * object with the same honesty list the model is held to, and holds it
 * to carrying no figure of its own.
 *
 * ── Why this is not a barrel ──────────────────────────────────────────
 * Every section imports these words, so a barrel here would import the
 * sections and the sections would import the barrel. The screen imports
 * each section by its own path, as it always has, and this file stays a
 * leaf with no import of its own.
 */

export const HAIR_SCAN_SECTION_COPY = Object.freeze({
  /** The disclosure that keeps the scan's own light and framing low on the sheet. */
  quality: {
    show: 'View scan details',
    hide: 'Hide scan details',
  },
  a11y: {
    /** A region on the coverage map, read as one line: the model's words around its figure. */
    figure: (label: string, value: string, qualifier?: string | null) =>
      qualifier ? `${label}: ${value}. ${qualifier}.` : `${label}: ${value}.`,
    /** A card, a row or an item whose parts the reader should hear as one sentence. */
    joined: (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join('. '),
    quality: 'Light, focus and framing from this scan',
  },
});

/** Every fixed string here, plus each function called with a sample, for the sweep. */
export function sectionCopySentences(): string[] {
  const out: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      out.push(value);
      return;
    }
    if (typeof value === 'function') {
      const fn = value as (...args: unknown[]) => string;
      out.push(fn('Hairline', 'Visual Coverage', 'Confidence'), fn('Crown', 'Not read', null));
      return;
    }
    if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) visit(nested);
    }
  };
  visit(HAIR_SCAN_SECTION_COPY);
  return out.filter((s) => typeof s === 'string');
}
