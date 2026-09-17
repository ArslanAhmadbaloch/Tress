/**
 * Every sentence the hairstyle feature says, in one place, so the sweep
 * in scripts/test/hairstyles.test.ts can read all of it. The screen's
 * own title is here too, in its three parts, so nothing user-visible is
 * authored in a component (the test greps the route for string props).
 *
 * The rule the words keep: a cut is a styling suggestion for a hair
 * type and a length. The app never says a cut suits anybody, never
 * says what a cut does for a head, and never lets the scan into it —
 * the pictures on the report are the catalogue's, not the reader's.
 * Whether a cut is right for somebody is a stylist's call, and the
 * subtitle says so in as many words. Numbers appear only where they
 * are counted from the catalogue.
 */

import { HAIR_TYPE_LABELS, type HairType } from '@/types/domain';

import type { HairLength } from './catalogue';

/** The hair type in mid-sentence: "wavy hair". */
function typeWord(hairType: HairType): string {
  return HAIR_TYPE_LABELS[hairType].toLowerCase();
}

export const HAIRSTYLE_COPY = Object.freeze({
  /** The screen's header, as ScreenTitle draws it: an eyebrow, the title, and its muted tail. */
  title: {
    eyebrow: 'Styling',
    main: 'Hairstyles',
    muted: 'for your hair.',
  },
  /** Under the title: what the list is, and whose call it is. */
  subtitle: (hairType: HairType | undefined) =>
    hairType === undefined
      ? 'Styling suggestions for any kind of hair, at any length. Answer the hair-type question and the list narrows. Whether one is right for you is a stylist’s call, not the app’s.'
      : `Styling suggestions for ${typeWord(hairType)} hair, at any length. Whether one is right for you is a stylist’s call, not the app’s.`,
  /** The line under the subtitle, so nobody reads a haircut as a finding. */
  disclaimer: 'Every style here is a haircut from a catalogue, drawn on a blank head. Nothing on this page reads your scan.',
  picks: {
    heading: 'Suggestions',
    /** Under the heading: how the list was made. */
    subheading: (hairType: HairType | undefined) =>
      hairType === undefined
        ? 'The cuts the catalogue draws for everybody, in its own order.'
        : `Cut on ${typeWord(hairType)} hair, with your answers breaking ties.`,
  },
  more: {
    heading: 'More styles',
    /**
     * `n` is the rest of the record's candidates: with no hair type, the
     * cuts drawn for everybody, and the sentence says so rather than
     * claiming the whole catalogue.
     */
    subheading: (n: number, hairType: HairType | undefined) =>
      hairType === undefined
        ? `${n} more of the cuts drawn for everybody.`
        : `${n} more in the catalogue for ${typeWord(hairType)} hair.`,
  },
  /** The one way to the paywall, and what is held. */
  locked: {
    note: 'The first suggestion is free. Premium opens the rest of the list and every style in the catalogue for your hair type.',
    placeholder: 'Held for Premium.',
  },
  cta: 'See all hairstyles',
  /** The catalogue has nothing tagged for the record; not reachable with the catalogue as built, but a list screen has to say so. */
  empty: {
    title: 'No styles to show',
    body: 'The catalogue has nothing tagged for this hair type yet.',
  },
  lengths: {
    short: 'Short',
    medium: 'Medium',
    long: 'Long',
  } satisfies Record<HairLength, string>,
  /**
   * The report's section. The hair type is not written into the
   * subheading: on the report it is read back as a label of the choice
   * (a quotation, see `HairstylesBlock.hairTypeLabel`), never authored.
   */
  report: {
    sectionLabel: 'Hairstyles',
    heading: 'Hairstyles for your hair',
    subheading: 'Styling suggestions from the catalogue, drawn on a blank head. A stylist decides; the scan plays no part.',
    /** Before the quoted hair type: "Cut on “Wavy” hair". */
    typeLead: 'Cut on',
    typeTrail: 'hair',
    cta: 'See all hairstyles',
  },
  /**
   * The Home card. `n` is `hairstyleCountFor`: the catalogue's entries
   * for the record's hair type and gender — or, with no hair type, the
   * cuts drawn for everybody, which is what the sentence then counts.
   */
  home: {
    title: 'Hairstyles for your hair',
    body: (n: number, hairType: HairType | undefined) =>
      hairType === undefined
        ? `${n} styling suggestions drawn for everybody.`
        : `${n} styling suggestions for ${typeWord(hairType)} hair.`,
  },
  a11y: {
    card: (name: string, lengths: string, note: string) => `${name}. ${lengths}. ${note}`,
    held: (name: string) => `${name}. Held for Premium.`,
    tile: (name: string) => `${name}, from the catalogue`,
    seeAllHint: 'Opens the full list of hairstyles.',
    paywallHint: 'Opens the Premium page.',
  },
});

/** Every fixed string, plus each function called for every hair type and for none, for the sweep. */
export function hairstyleCopySentences(): string[] {
  const C = HAIRSTYLE_COPY;
  const types: (HairType | undefined)[] = [undefined, ...(Object.keys(HAIR_TYPE_LABELS) as HairType[])];
  return [
    C.title.eyebrow,
    C.title.main,
    C.title.muted,
    ...types.map(C.subtitle),
    C.disclaimer,
    C.picks.heading,
    ...types.map(C.picks.subheading),
    C.more.heading,
    ...types.map((t) => C.more.subheading(7, t)),
    C.locked.note,
    C.locked.placeholder,
    C.cta,
    C.empty.title,
    C.empty.body,
    ...Object.values(C.lengths),
    C.report.sectionLabel,
    C.report.heading,
    C.report.subheading,
    C.report.typeLead,
    C.report.typeTrail,
    C.report.cta,
    C.home.title,
    ...types.map((t) => C.home.body(7, t)),
    C.a11y.card('Buzz cut', 'Short', 'A note.'),
    C.a11y.held('Buzz cut'),
    C.a11y.tile('Buzz cut'),
    C.a11y.seeAllHint,
    C.a11y.paywallHint,
  ];
}
