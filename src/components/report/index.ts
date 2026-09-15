/**
 * The report's drawing kit: rings, tiles, the hero and the reveal.
 *
 * Shared by the scan report at the end of the funnel and the report tab,
 * so the two read as one document written at two moments rather than two
 * screens that happen to show similar numbers.
 */

export { FindingRow } from './finding-row';
export { ReadingRing } from './reading-ring';
export { ReadingTile, ToneMark, toneColour } from './reading-tile';
export { Reveal, REVEAL_STAGGER, revealDelay } from './reveal';
export { ScanHero } from './scan-hero';
