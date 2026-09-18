/**
 * The shelf: everything the app knows about the products in somebody's
 * life, arranged — and nothing else.
 *
 * ── Why this module is so careful ─────────────────────────────────────
 * The request behind it was "suggest products for my hair type". There is
 * no honest way to do that here and there never will be from this data:
 * the app holds no efficacy data, no clinical evidence and no population
 * data, and it has never asked anybody what their hair is like. A shelf
 * that ordered bottles by how well they do anything would be inventing
 * the ordering, on the screen where somebody is most likely to act on it.
 *
 * So this module never ranks, never rates, never endorses and never says
 * what a formula does. Every line it produces traces to exactly one of
 * two sources, and each section says on screen which one it is:
 *
 *   1. THEIR OWN RECORD — the bottles they typed in, which of them are
 *      linked to something on their list, how many tasks that list
 *      holds, and when each record was made. Facts about a list, not
 *      about a head.
 *   2. WHAT THEY TOLD US — the onboarding answers, read back in their
 *      own words, and a plain word comparison between those answers and
 *      the text on their list. A hit quotes the word as they wrote it;
 *      a miss names the words looked for.
 *
 * ── The third source that used to be here ─────────────────────────────
 * There was a third: a cosmetics database the app looked a barcode up
 * in, whose ingredient text and tags were quoted verbatim under its
 * licence. The lookup was the only network request the app's own code
 * ever made, and it has been removed. Nothing here reads the fields it
 * used to write — `ingredientsText`, `analysisTags`, `imageUrl`,
 * `thumbnailUrl` — so no attribution is owed, no remote image is
 * fetched to draw a record, and the shelf is built from stored data and
 * nothing else. Those fields survive on `Product` only because an
 * install upgraded from an earlier build still has them on disk.
 *
 * One field of that era is still read, and on purpose: `source`. A
 * record the scanner made was fetched rather than typed, and the screen
 * has to be able to say so — see `recordedText`. Reading it costs
 * nothing and calling every record the person's own would be a false
 * claim about where their data came from.
 *
 * ── What this module deliberately does NOT do ─────────────────────────
 * An earlier draft held a fixed table of four things a routine might be
 * made of — a wash, something applied, something taken, a device — and
 * reported which of them the list mentioned. Nothing in the record or in
 * anybody's answers says a routine is supposed to contain
 * those four, so the table was the app's own idea of a complete routine,
 * and every unticked row was a thing to go and buy. It is gone. The only
 * comparison left is between two things the person themselves put in:
 * the words of an answer they gave, and the words of the list they typed.
 *
 * ── How a comparison is stated ────────────────────────────────────────
 * Every comparison sentence names the word it matched on and quotes the
 * exact span it found that word in, so the reader can check it against
 * what is on screen. It is a statement about words — never that two
 * things are the same thing, and never that either of them does
 * anything. Where no word matched, the words that were looked for are
 * named too, so an absence is as checkable as a hit.
 *
 * ── Verbatim vs authored ──────────────────────────────────────────────
 * Fields carrying somebody else's words — `name`, `brand`, `quantity`,
 * `answers` — are copied through untouched. Fields the app writes itself
 * — every `text`, `note`, `title` and footnote — are swept by
 * scripts/test/shelf.test.ts against the banned vocabulary. Where an
 * authored sentence has to quote somebody, the quoted span is repeated
 * in `quotes` so the sweep can lift it out and judge only the app's half
 * of the sentence.
 *
 * Pure TypeScript: no React, no React Native, so `node --test` runs the
 * shipped code rather than a copy of it.
 */

import { formatDate } from '@/lib/date';
import { activeRoutineItems } from '@/store/selectors';
import {
  HAIR_GOAL_LABELS,
  INGREDIENT_REACTION_LABELS,
  MEDICATION_LABELS,
  PRODUCT_FACTOR_LABELS,
  TRACKING_AREA_LABELS,
  journeyGoals,
  journeyProductFactors,
  journeyReactions,
  type AppData,
  type Product,
  type RoutineItem,
} from '@/types/domain';

/* ------------------------------- shapes ------------------------------- */

/**
 * One authored sentence, with the spans inside it that are not ours.
 *
 * `quotes` holds each verbatim span exactly as it appears in `text` —
 * a product name, a routine label, an onboarding answer, or a single
 * word lifted out of one of those. The honesty sweep removes them before
 * reading the rest, which is the only way a sentence quoting "Knowing
 * whether my routine is working" can be checked without failing on the
 * person's own words. Every span is proven to come from stored data in
 * scripts/test/shelf.test.ts, so the exemption cannot smuggle anything in.
 */
export type ShelfFact = {
  id: string;
  text: string;
  quotes: string[];
  /**
   * Set only on the comparison lines: true where a word of their answer
   * was found in the text on their list, false where it was not.
   *
   * Nothing on screen renders a glyph from it — a tick and an empty box
   * turn a set of facts into a checklist of things to acquire. It exists
   * so the tests can tell the two branches apart without matching on the
   * wording, which would rot the day the wording changed.
   */
  mentioned?: boolean;
};

/** A product record, plus what can honestly be said about it. */
export type ShelfProduct = {
  barcode: string;
  /** Verbatim from the record. */
  name: string;
  /** Verbatim, as they typed it. */
  brand?: string;
  /** Verbatim, as printed on the bottle. */
  quantity?: string;
  /**
   * Never set. Kept on the shape because the report's routine block
   * still reads it (features/hair-scan/report-model.ts) and that file
   * belongs to another lane. The only values that ever landed here were
   * remote addresses on the retired lookup's image server, and drawing
   * one would be a network request — so the shelf leaves it undefined
   * and every tile falls back to its placeholder. Delete the field, and
   * the three screens that read the raw `Product.thumbnailUrl`, and
   * nothing in the app can reach the network at all.
   */
  thumbnailUrl?: string;
  /** Their own label for the task this bottle is linked to, if any. */
  linkedLabel?: string;
  /** Sentences about the record. Never about what the product does. */
  facts: ShelfFact[];
  /** True for a record with nothing on the list linked to it. */
  unlinked: boolean;
};

export type ShelfSection = {
  id: 'onYourList' | 'notOnYourList';
  title: string;
  /** What is in the section and what decides the order, said on screen. */
  note: string;
  products: ShelfProduct[];
};

/** Their onboarding answers, read back in the words they picked. */
export type ShelfAnswers = {
  note: string;
  /** Verbatim TRACKING_AREA_LABELS. */
  watching: string[];
  /** Verbatim HAIR_GOAL_LABELS. */
  goals: string[];
  /** Verbatim MEDICATION_LABELS, plus whatever they typed. */
  using: string[];
  /** Verbatim PRODUCT_FACTOR_LABELS: what they look for on a label. */
  preferences: string[];
  /** Verbatim INGREDIENT_REACTION_LABELS: what they said has bothered them. */
  reactions: string[];
};

export type Shelf = {
  sections: ShelfSection[];
  /** Facts about their list, and their answers compared with its words. */
  listNotes: ShelfFact[];
  /** The heading above `listNotes`, and the disclaimer under it. */
  listNotesTitle: string;
  listNotesNote: string;
  answers: ShelfAnswers;
  /** The lines the screen closes with, attribution included. */
  footnotes: string[];
  /** How many records are held in total. */
  productCount: number;
};

/* ------------------------------ vocabulary ---------------------------- */

/**
 * The shortest run of letters or digits worth comparing, and the same
 * number written out for the one sentence that has to say it.
 *
 * Three, so "B12", "saw palmetto" and "oil" are all compared rather than
 * silently skipped. A shorter answer than this cannot be compared at all,
 * and the shelf says so out loud instead of dropping the line.
 *
 * The two must stay in step; scripts/test/shelf.test.ts asserts it.
 */
export const COMPARE_MIN = 3;
const COMPARE_MIN_WORD = 'three';

/**
 * Words too general to be worth reporting a match on.
 *
 * "Minoxidil (topical)" is compared on "minoxidil": announcing that the
 * word "topical" also appears somewhere on a list is noise, and noise on
 * this screen reads as the app straining to connect two things. Dropping
 * them narrows what is claimed; it never widens it.
 */
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  'oral',
  'topical',
  'tablet',
  'tablets',
  'capsule',
  'capsules',
  'supplement',
  'supplements',
  'medication',
  'shampoo',
  'the',
  'and',
  'for',
  'with',
  'daily',
  'other',
  'something',
  'else',
]);

/* ------------------------------ helpers ------------------------------- */

/** Curly quotes, because these sentences are read rather than parsed. */
const quoted = (text: string): string => `“${text}”`;

/** "1 task" / "5 tasks". */
const counted = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** `“a”`, `“a” and “b”`, `“a”, “b” and “c”`. */
function quotedList(words: string[]): string {
  const marked = words.map(quoted);
  if (marked.length <= 1) return marked.join('');
  return `${marked.slice(0, -1).join(', ')} and ${marked[marked.length - 1]}`;
}

/**
 * Newest record first, then by key.
 *
 * The date is the only thing the shelf is allowed to order by, and the
 * key tiebreak is there so two records written in the same second come
 * out in the same order every render rather than shuffling.
 */
function byRecency(a: Product, b: Product): number {
  return b.fetchedAt.localeCompare(a.fetchedAt) || a.barcode.localeCompare(b.barcode);
}

const WORD_CHAR = /[a-z0-9]/;

const isWordChar = (ch: string | undefined): boolean =>
  ch !== undefined && WORD_CHAR.test(ch);

/**
 * Whether `word` appears in `text` as a whole word.
 *
 * Both boundaries, not a prefix: the sentence this feeds says "the word
 * X appears here", and a prefix match would make that false — "iron" is
 * not a word in "ironic", and "oil" is not a word in "boiling".
 *
 * Written with indexOf rather than a built regular expression for two
 * reasons: `word` would have to be escaped before being spliced into a
 * pattern, and a backslash in a literal anywhere in this file blinds the
 * literal scanner that scripts/test/shelf.test.ts sweeps this module
 * with — it pairs quotes naively and a `\` swallows the rest of the
 * file. Nothing in here may contain one.
 */
function containsWord(text: string, word: string): boolean {
  const haystack = text.toLowerCase();
  for (let from = 0; from <= haystack.length - word.length; ) {
    const at = haystack.indexOf(word, from);
    if (at < 0) return false;
    if (!isWordChar(haystack[at - 1]) && !isWordChar(haystack[at + word.length])) return true;
    from = at + 1;
  }
  return false;
}

/**
 * The words of an answer, split into the ones worth looking for and the
 * two reasons a word was set aside.
 *
 * The two reasons are kept apart because the sentence for an answer with
 * nothing left to compare has to name the real one. An earlier draft
 * returned only the comparable words, so every empty result was reported
 * as "found no word of three characters or more" — which is false of
 * "Shampoo", a seven-letter answer dropped for being too general, and
 * false on a screen whose whole defence is that the reader can check
 * every line against what is in front of them.
 *
 * Lowercased because the comparison is case-insensitive and the sentence
 * quotes the word as it was compared, not as it was capitalised.
 */
type SplitWords = {
  /** Long enough and specific enough to report a match on. */
  words: string[];
  /** Long enough, but in GENERIC_WORDS. */
  tooGeneral: string[];
  /** Shorter than COMPARE_MIN, as written. */
  tooShort: string[];
};

function splitWords(label: string): SplitWords {
  const words: string[] = [];
  const tooGeneral: string[] = [];
  const tooShort: string[] = [];
  const seen = new Set<string>();
  for (const word of label.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length === 0 || seen.has(word)) continue;
    seen.add(word);
    if (word.length < COMPARE_MIN) tooShort.push(word);
    else if (GENERIC_WORDS.has(word)) tooGeneral.push(word);
    else words.push(word);
  }
  return { words, tooGeneral, tooShort };
}

/**
 * One quotable piece of text on somebody's list, and where it sits.
 *
 * Spans are kept separate rather than joined into one blob because the
 * sentence has to quote the exact text the match was found in. Matching
 * over a label, a detail and a linked product name at once and then
 * quoting only the label — which an earlier draft did — produces
 * "your list mentions a wash: “Evening step”", a sentence the reader
 * cannot check and that reads as the app having decided what a task is.
 */
type ListSpan = {
  text: string;
  /** How the sentence names where this span came from. */
  where: string;
};

function spansOf(item: RoutineItem, products: Map<string, Product>): ListSpan[] {
  const product = item.productBarcode ? products.get(item.productBarcode) : undefined;
  const spans: ListSpan[] = [
    { text: item.label, where: 'on your list' },
    { text: item.detail ?? '', where: 'in a detail on your list' },
    { text: product?.name ?? '', where: 'on a record linked to your list' },
    { text: product?.brand ?? '', where: 'on a record linked to your list' },
  ];
  return spans.filter((span) => span.text.trim().length > 0);
}

/**
 * The first place one of `words` appears in the text of their list.
 *
 * Deterministic: list order, then label before detail before the linked
 * record, then the answer's own word order. "First" is the only rule,
 * because any other rule would be the app deciding which match matters
 * most — and it has nothing to decide that with.
 */
function findWord(
  words: string[],
  items: RoutineItem[],
  products: Map<string, Product>,
): { word: string; span: ListSpan } | undefined {
  for (const item of items) {
    for (const span of spansOf(item, products)) {
      for (const word of words) {
        if (containsWord(span.text, word)) return { word, span };
      }
    }
  }
  return undefined;
}


/* ------------------------------ building ------------------------------ */

/**
 * Where a record came from, and when — in the words that are true of it.
 *
 * `source` is the one field the retired lookup wrote that this module
 * still reads, and it is read for exactly this sentence. A record the
 * scanner made was not written down by anybody: it was fetched, and
 * `fetchedAt` is the moment it was fetched. Telling its owner they typed
 * it, and dating their typing to a lookup they never saw, would be the
 * app inventing a provenance on the one screen whose entire promise is
 * that it invents nothing. So the branch the old code had is kept, and
 * the sentence for an upgraded install says what actually happened.
 *
 * The third case is not reachable through the type and is written
 * anyway: a hand-edited blob can hold any string, and a record whose
 * origin the app cannot name gets a sentence that claims no origin.
 */
function recordedText(product: Product): string {
  const on = formatDate(product.fetchedAt);
  if (product.source === 'manual') return `Written down by you on ${on}.`;
  if (product.source === 'openBeautyFacts') {
    return `Looked up for you by an older version of Tress on ${on}. Nothing is looked up now.`;
  }
  return `This record was made on ${on}.`;
}

/**
 * One record, and the two or three sentences that can be said about it.
 *
 * Both sentences are about the RECORD: how it came to be there, and
 * whether anything on their list points at it. Nothing here reads a
 * label, quotes a database or says a word about what is in the bottle —
 * the only things the app holds about it are what they typed and, on an
 * upgraded install, that an older version fetched it.
 */
function buildProduct(product: Product, linkedTo: RoutineItem | undefined): ShelfProduct {
  const facts: ShelfFact[] = [
    {
      id: `${product.barcode}:record`,
      text: recordedText(product),
      quotes: [],
    },
    linkedTo
      ? {
          id: `${product.barcode}:linked`,
          text: `On your list as ${quoted(linkedTo.label)}.`,
          quotes: [linkedTo.label],
        }
      : {
          id: `${product.barcode}:unlinked`,
          text: 'Nothing on your list is linked to this record.',
          quotes: [],
        },
  ];

  const shelfProduct: ShelfProduct = {
    barcode: product.barcode,
    name: product.name,
    facts,
    unlinked: linkedTo === undefined,
  };

  if (product.brand !== undefined) shelfProduct.brand = product.brand;
  if (product.quantity !== undefined) shelfProduct.quantity = product.quantity;
  if (linkedTo) shelfProduct.linkedLabel = linkedTo.label;

  return shelfProduct;
}

/**
 * Facts about their list, and their own answers held against its words.
 *
 * Nothing here is a category, a target or a gap. The first line counts
 * what is on the list; the rest each begin with something the person
 * told us and end with whether that answer's words turn up in the text
 * they typed — in both directions, because "it is there" and "it is not"
 * are equally facts and printing only one of them would make a list.
 */
function buildListNotes(
  items: RoutineItem[],
  products: Map<string, Product>,
  data: AppData,
): ShelfFact[] {
  if (items.length === 0) return [];

  const notes: ShelfFact[] = [];

  const linked = items.filter(
    (item) => item.productBarcode !== undefined && products.has(item.productBarcode),
  ).length;
  const linkedSentence =
    items.length === 1
      ? linked === 1
        ? 'It is linked to a record on this screen.'
        : 'It is not linked to a record on this screen.'
      : linked === 0
        ? 'None of them is linked to a record on this screen.'
        : `${linked} of them ${linked === 1 ? 'is' : 'are'} linked to a record on this screen.`;
  notes.push({
    id: 'list:count',
    text: `Your list has ${counted(items.length, 'task')}. ${linkedSentence}`,
    quotes: [],
  });

  const journey = data.journey;
  /*
    Answers come off disk, where a corrupt or twice-written journey can
    hold the same key twice. One line per answer, or the screen renders
    two identical sentences under one React key.
  */
  const seen = new Set<string>();
  for (const medication of journey?.medications ?? []) {
    if (medication === 'none' || seen.has(medication)) continue;
    seen.add(medication);

    const label =
      medication === 'other' ? journey?.medicationNote?.trim() : MEDICATION_LABELS[medication];
    if (!label) continue;

    const { words, tooGeneral, tooShort } = splitWords(label);

    /*
      An answer with nothing comparable in it — "B1", say — gets a line
      of its own rather than vanishing. A table that silently holds only
      some of somebody's answers is worse than one that holds none: the
      omission is invisible, and the reader takes the table for complete.

      Which sentence depends on why nothing was left, and getting that
      wrong is a false statement rather than a clumsy one: "Shampoo" is
      seven characters, so telling its owner no word of three or more was
      found in it is simply untrue, and untrue while the word sits on
      their list two lines further down. Both reasons are named, and only
      the ones that actually applied.
    */
    if (words.length === 0) {
      const general =
        tooGeneral.length === 0
          ? ''
          : `${tooGeneral.length === 1 ? 'The word' : 'The words'} ${quotedList(tooGeneral)} ${
              tooGeneral.length === 1 ? 'is' : 'are'
            } too general to report a match on.`;
      const short =
        tooShort.length === 0
          ? ''
          : `Tress compares whole words of ${COMPARE_MIN_WORD} characters or more, and ${quotedList(
              tooShort,
            )} ${tooShort.length === 1 ? 'is' : 'are'} shorter than that.`;
      const why =
        general && short
          ? `${general} ${short}`
          : general || short
            ? general || short
            : `Tress compares whole words of ${COMPARE_MIN_WORD} characters or more, and found none in it.`;

      notes.push({
        id: `told:${medication}`,
        text: `You told us about ${quoted(label)}. ${why} Tress did not look for this on your list.`,
        quotes: [label, ...tooGeneral, ...tooShort],
        mentioned: false,
      });
      continue;
    }

    const hit = findWord(words, items, products);
    notes.push(
      hit
        ? {
            id: `told:${medication}`,
            text: `You told us about ${quoted(label)}. The word ${quoted(hit.word)} appears ${hit.span.where}: ${quoted(hit.span.text)}.`,
            quotes: [label, hit.word, hit.span.text],
            mentioned: true,
          }
        : {
            id: `told:${medication}`,
            text: `You told us about ${quoted(label)}. ${
              words.length === 1 ? 'The word' : 'The words'
            } ${quotedList(words)} ${
              words.length === 1 ? 'does' : 'do'
            } not appear in the text on your list.`,
            quotes: [label, ...words],
            mentioned: false,
          },
    );
  }

  return notes;
}

/** Their onboarding answers, filtered to the ones the app still has labels for. */
function buildAnswers(data: AppData): ShelfAnswers {
  const journey = data.journey;

  /*
    Everything here comes off disk, so an answer can be a key this
    version no longer offers — or not a string at all. An unknown key is
    dropped rather than rendered as "undefined".
  */
  const watching = (journey?.trackingAreas ?? [])
    .filter(
      (area): area is keyof typeof TRACKING_AREA_LABELS =>
        typeof area === 'string' && area in TRACKING_AREA_LABELS,
    )
    .map((area) => TRACKING_AREA_LABELS[area]);

  const goals = journey ? journeyGoals(journey).map((goal) => HAIR_GOAL_LABELS[goal]) : [];

  const using: string[] = [];
  for (const medication of journey?.medications ?? []) {
    if (medication === 'other') {
      const typed = journey?.medicationNote?.trim();
      if (typed) using.push(typed);
      continue;
    }
    if (typeof medication === 'string' && medication in MEDICATION_LABELS) {
      using.push(MEDICATION_LABELS[medication]);
    }
  }

  /*
    Deduped for the same reason the comparison lines are: a journey read
    off disk can hold a key twice, and the screen keys a chip by its own
    text. Reading an answer back twice makes it no truer.
  */
  const once = (values: string[]): string[] => [...new Set(values)];

  const preferences = journey
    ? journeyProductFactors(journey).map((f) => PRODUCT_FACTOR_LABELS[f])
    : [];
  const reactions = journey
    ? journeyReactions(journey).map((r) => INGREDIENT_REACTION_LABELS[r])
    : [];

  return {
    note: 'Your own answers from the start, read back. They decide nothing on this screen.',
    watching: once(watching),
    goals: once(goals),
    using: once(using),
    preferences: once(preferences),
    reactions: once(reactions),
  };
}

/**
 * The whole shelf, from stored data alone.
 *
 * Nothing is fetched, nothing is scored, and the only comparison made
 * anywhere in it is between two things the person themselves put in.
 */
export function buildShelf(data: AppData): Shelf {
  const items = activeRoutineItems(data);
  const byBarcode = new Map<string, Product>(data.products.map((p) => [p.barcode, p]));

  /** The first list item linked to each barcode. */
  const linkedBy = new Map<string, RoutineItem>();
  for (const item of items) {
    const code = item.productBarcode;
    if (code && !linkedBy.has(code)) linkedBy.set(code, item);
  }

  const sorted = [...data.products].sort(byRecency);
  const onYourList: ShelfProduct[] = [];
  const notOnYourList: ShelfProduct[] = [];

  for (const product of sorted) {
    const linkedTo = linkedBy.get(product.barcode);
    const built = buildProduct(product, linkedTo);
    (linkedTo ? onYourList : notOnYourList).push(built);
  }

  const sections: ShelfSection[] = [];
  if (onYourList.length > 0) {
    sections.push({
      id: 'onYourList',
      title: 'On your list',
      note: 'Records linked to something on your list. Newest record first.',
      products: onYourList,
    });
  }
  if (notOnYourList.length > 0) {
    sections.push({
      id: 'notOnYourList',
      title: 'Not on your list',
      note: 'Records with nothing on your list linked to them. Newest record first.',
      products: notOnYourList,
    });
  }

  return {
    sections,
    listNotes: buildListNotes(items, byBarcode, data),
    listNotesTitle: 'Your list, and what you told us',
    listNotesNote:
      'Counted and compared word for word from the text you typed yourself. Tress reads the words, not the bottles, and holds no information about what anything in them does.',
    answers: buildAnswers(data),
    footnotes: [
      'Every record here is one you typed on this phone, or one an older version of Tress looked up before that was taken out. Tress looks nothing up now, and nothing on this screen is sent anywhere by the app.',
      'Nothing on this screen is ordered by anything except the date it was recorded.',
      'Tress does not provide medical advice. Anything medical belongs with a qualified healthcare professional.',
    ],
    productCount: data.products.length,
  };
}

/**
 * Every string the app chose the wording of, for the honesty sweep.
 *
 * Verbatim fields are deliberately absent: a product name and a brand
 * are the person's own text, and sweeping them would fail on words the
 * app did not choose and cannot change. Where an authored sentence has
 * to quote one, the span is repeated in `quotes` and lifted out before
 * the rest is read.
 */
export function shelfSentences(shelf: Shelf): ShelfFact[] {
  const sentences: ShelfFact[] = [
    { id: 'listNotesTitle', text: shelf.listNotesTitle, quotes: [] },
    { id: 'listNotesNote', text: shelf.listNotesNote, quotes: [] },
    { id: 'answersNote', text: shelf.answers.note, quotes: [] },
    ...shelf.footnotes.map((text, i) => ({ id: `footnote:${i}`, text, quotes: [] })),
    ...shelf.listNotes,
  ];

  /*
    The answer chips, which nothing swept before this.

    Each is the label for something the person ticked, so its whole text
    is lifted out as a quotation — and that is the guard, not a way past
    one. `unownedQuotes` then has to find every chip inside the answers
    the shelf was actually built from, so a chip the app invented, or a
    label that has drifted from the stored one, fails there rather than
    reaching the product screen unchecked. Before this they were rendered
    by shelf.tsx and reachable by no sweep at all, while carrying words —
    "thinning", "fuller", "stronger" — that this module's own banned list
    forbids everywhere it can see.
  */
  const chipGroups: [string, readonly string[]][] = [
    ['watching', shelf.answers.watching],
    ['goals', shelf.answers.goals],
    ['using', shelf.answers.using],
    ['preferences', shelf.answers.preferences],
    ['reactions', shelf.answers.reactions],
  ];
  for (const [group, values] of chipGroups) {
    values.forEach((text, i) => {
      sentences.push({ id: `answer:${group}:${i}`, text, quotes: [text] });
    });
  }

  for (const section of shelf.sections) {
    sentences.push({ id: `${section.id}:title`, text: section.title, quotes: [] });
    sentences.push({ id: `${section.id}:note`, text: section.note, quotes: [] });
    for (const product of section.products) {
      sentences.push(...product.facts);
    }
  }

  return sentences;
}
