/**
 * The product shelf, held to the one thing that makes it shippable: it
 * arranges records and it never judges a bottle.
 *
 * The app has no efficacy data, no clinical evidence and no population
 * data, and it has never asked anybody what their hair is like. Every
 * sentence the shelf produces therefore has to trace to the person's own
 * record, to the database quoted as the database, or to an answer they
 * gave — and the moment one of them starts ranking, endorsing, saying
 * what a formula does, or asserting that two things are the same thing,
 * these tests fail.
 *
 * Four sweeps do that work:
 *
 *   1. Every string `buildShelf` chose the wording of, with the quoted
 *      spans lifted out, against the banned vocabulary below and the
 *      shared HAIR_CLAIMS list. Lifting the quotes out is what lets
 *      somebody's own routine label — "Density serum" — be read back
 *      without the sweep failing on a word the app did not write.
 *   2. `unownedQuotes` then proves every lifted span really is somebody
 *      else's text, by checking it against the stored data the shelf was
 *      built from rather than against a list typed out here — and a
 *      negative case proves the check can actually fail.
 *   3. The string literals of the screen, so a heading typed straight
 *      into the JSX is held to the same list.
 *   4. The string literals of the module, which catches copy on a branch
 *      no fixture happens to reach.
 *
 * Plus a set of tests that pin the shape of a claim: a word match must be
 * stated as a word match, must quote the text it was found in, and must
 * never quietly drop an answer it could not compare.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  COMPARE_MIN,
  buildShelf,
  shelfSentences,
  type Shelf,
  type ShelfFact,
} from '@/features/products/shelf';
import { ATTRIBUTION, parseLookup } from '@/features/products/open-beauty-facts';
import {
  EMPTY_DATA,
  HAIR_GOAL_LABELS,
  MEDICATION_LABELS,
  TRACKING_AREA_LABELS,
  journeyGoals,
  type AppData,
  type Journey,
  type Product,
  type RoutineItem,
  type TrackingArea,
} from '@/types/domain';

import { HAIR_CLAIMS } from './claims';
import { assertHonest } from './honesty-words';

/* ---------------------------- the vocabulary --------------------------- */

/**
 * What a shelf without efficacy data may never say.
 *
 * Four kinds of sentence: one that ranks, one that endorses, one that
 * says what a formula does, and one that ties a product to a person.
 * Words are banned outright rather than "unless negated", so the
 * disclaimers have to be written without them — "Tress holds no
 * information about what anything does" rather than "Tress does not
 * recommend". That is the stricter reading and it produces better copy.
 */
const BANNED = [
  /* ranking and rating */
  'best', 'better for', 'worse', 'top pick', 'rank', 'rated', 'rating', 'stars',
  'score', 'ordered by how', 'compare which',
  /* endorsement */
  'recommend', 'suggest', 'ideal', 'perfect', 'suited', 'suits', 'right for you',
  'good for', 'bad for', 'works', 'work for', 'effective', 'efficacy', 'proven',
  'clinically', 'clean beauty', 'must-have', 'essential for',
  /* what a formula supposedly does */
  'harsh', 'gentle', 'nourish', 'strengthen', 'repair', 'soothe', 'boost',
  'stimulat', 'hydrat', 'moistur', 'volumis', 'volumiz', 'blocks dht', 'inhibit',
  'prevent', 'combat', 'treats', 'toxic', 'chemical-free',
  /* the person, and the outcome */
  'hair type', 'for your hair', 'your hair will', 'will help', 'helps', 'benefit',
  'grow', 'shed less', 'stronger',
];

/** Every string the app wrote, with the words it did not write lifted out. */
function authored(shelf: Shelf): string[] {
  return shelfSentences(shelf).map((fact) => {
    let text = fact.text;
    // Longest first: lifting "tonic" before "Thickening tonic" would leave
    // the tail of the longer span behind and sweep a half-word the person
    // did not write.
    for (const quote of [...fact.quotes].sort((a, b) => b.length - a.length)) {
      text = text.split(quote).join(' ');
    }
    return text;
  });
}

function sweep(sentences: string[], context: string): void {
  const text = sentences.join(' ').toLowerCase();
  for (const word of [...BANNED, ...HAIR_CLAIMS]) {
    assert.ok(!text.includes(word), `${context} must not say "${word}"`);
  }
  assertHonest(assert, sentences, context);
}

/* ------------------------------ fixtures ------------------------------- */

const NOW = '2026-09-15T12:00:00.000Z';
const EARLIER = '2026-08-01T09:00:00.000Z';

function product(barcode: string, overrides: Partial<Product> = {}): Product {
  return {
    barcode,
    source: 'openBeautyFacts',
    name: `Product ${barcode}`,
    fetchedAt: NOW,
    ...overrides,
  };
}

function item(overrides: Partial<RoutineItem> = {}): RoutineItem {
  return {
    id: 'rti_1',
    journeyId: 'j1',
    label: 'Morning dropper',
    cadence: 'daily',
    createdAt: EARLIER,
    ...overrides,
  };
}

function journey(overrides: Partial<Journey> = {}): Journey {
  return {
    id: 'j1',
    profileId: 'p1',
    startedAt: EARLIER,
    trackingAreas: ['hairline'],
    motivations: ['confidence'],
    goals: ['fullness'],
    triggers: ['mirror'],
    approaches: ['topical'],
    updateIntervalDays: 30,
    createdAt: EARLIER,
    ...overrides,
  };
}

function dataWith(parts: Partial<AppData> = {}): AppData {
  return { ...EMPTY_DATA, ...parts };
}

/** The real wire body for a shampoo, parsed by the shipped parser. */
function fromDatabase(code: string): Product {
  const body: unknown = JSON.parse(
    readFileSync(new URL(`./fixtures/obf/${code}.json`, import.meta.url), 'utf8'),
  );
  const lookup = parseLookup(body, NOW);
  assert.equal(lookup.kind, 'found');
  if (lookup.kind !== 'found') throw new Error('unreachable');
  return lookup.product;
}

/** The one comparison line about a given answer. */
function told(shelf: Shelf, id: string): ShelfFact {
  const found = shelf.listNotes.find((n) => n.id === `told:${id}`);
  if (!found) throw new Error(`expected a line for ${id}`);
  return found;
}

/* ------------------------------- shape --------------------------------- */

test('an empty install has nothing to show and still says where it stands', () => {
  const shelf = buildShelf(EMPTY_DATA);

  assert.equal(shelf.productCount, 0);
  assert.equal(shelf.sections.length, 0);
  assert.equal(shelf.listNotes.length, 0);
  assert.deepEqual(shelf.answers.watching, []);
  assert.ok(shelf.footnotes.includes(ATTRIBUTION));
  sweep(authored(shelf), 'the empty shelf');
});

test('records split by whether anything on the list is linked to them', () => {
  const linked = product('0000000000001');
  const loose = product('0000000000002');
  const data = dataWith({
    products: [linked, loose],
    routineItems: [item({ productBarcode: linked.barcode })],
  });

  const shelf = buildShelf(data);
  assert.deepEqual(
    shelf.sections.map((s) => s.id),
    ['onYourList', 'scannedOnly'],
  );
  assert.deepEqual(shelf.sections[0].products.map((p) => p.barcode), [linked.barcode]);
  assert.deepEqual(shelf.sections[1].products.map((p) => p.barcode), [loose.barcode]);

  assert.equal(shelf.sections[0].products[0].linkedLabel, 'Morning dropper');
  assert.equal(shelf.sections[0].products[0].unlinked, false);
  assert.equal(shelf.sections[1].products[0].unlinked, true);
});

test('a record linked only to an archived item is not on the list', () => {
  const bottle = product('0000000000003');
  const data = dataWith({
    products: [bottle],
    routineItems: [item({ productBarcode: bottle.barcode, archivedAt: NOW })],
  });

  const shelf = buildShelf(data);
  assert.deepEqual(shelf.sections.map((s) => s.id), ['scannedOnly']);
  assert.equal(shelf.sections[0].products[0].linkedLabel, undefined);
});

test('the only ordering is the date, newest first, and ties are stable', () => {
  const older = product('0000000000009', { fetchedAt: EARLIER });
  const newerB = product('0000000000005', { fetchedAt: NOW });
  const newerA = product('0000000000004', { fetchedAt: NOW });

  const shelf = buildShelf(dataWith({ products: [older, newerB, newerA] }));
  assert.deepEqual(
    shelf.sections[0].products.map((p) => p.barcode),
    ['0000000000004', '0000000000005', '0000000000009'],
  );

  // The same three in a different input order come out the same way.
  const again = buildShelf(dataWith({ products: [newerA, older, newerB] }));
  assert.deepEqual(
    again.sections[0].products.map((p) => p.barcode),
    shelf.sections[0].products.map((p) => p.barcode),
  );
});

/* ---------------------- the database, quoted as such ------------------- */

test('what the database says is passed through verbatim, with its attribution', () => {
  const shampoo = fromDatabase('5601059062534');
  const shelf = buildShelf(dataWith({ products: [shampoo] }));
  const shown = shelf.sections[0].products[0];

  assert.equal(shown.name, shampoo.name);
  assert.equal(shown.brand, shampoo.brand);
  assert.equal(shown.quantity, shampoo.quantity);
  assert.equal(shown.ingredientsText, shampoo.ingredientsText);
  assert.equal(shown.thumbnailUrl, shampoo.thumbnailUrl);
  assert.equal(shown.attribution, ATTRIBUTION);
  assert.ok(shown.databaseNotes.length > 0);
  // Nothing is summarised, counted or re-ordered on the way through.
  assert.ok(shown.ingredientsText?.startsWith('Aqua, Sodium Laureth Sulfate'));
});

test('every shown tag is named as the database\'s, and as fewer than it holds', () => {
  const shampoo = fromDatabase('5601059062534');
  const shown = buildShelf(dataWith({ products: [shampoo] })).sections[0].products[0];

  assert.ok(shown.databaseNotesNote, 'tags are never shown without saying whose they are');
  assert.match(shown.databaseNotesNote, /Open Beauty Facts/);
  // The screen shows three of the database's tags and drops the rest, so
  // the note has to say the set is partial or the three read as the whole.
  assert.match(shown.databaseNotesNote, /more tags than Tress shows/);
});

test('a record the person typed is never dressed up as a database record', () => {
  const typed: Product = {
    barcode: '0000000000007',
    source: 'manual',
    name: 'The green bottle',
    fetchedAt: NOW,
    // Even if a stray ingredient text were on the record, a manual entry
    // has no database behind it and must not claim one.
    ingredientsText: 'whatever they typed',
  };

  const shown = buildShelf(dataWith({ products: [typed] })).sections[0].products[0];
  assert.equal(shown.attribution, undefined);
  assert.equal(shown.ingredientsText, undefined);
  assert.equal(shown.databaseNotes.length, 0);
  assert.equal(shown.databaseNotesNote, undefined);
  assert.match(shown.ingredientsNote, /typed this record in/);
});

test('a database record with no ingredient list says so rather than showing a blank', () => {
  const bare = product('0000000000008', { analysisTags: ['en:vegan-unknown'] });
  const shown = buildShelf(dataWith({ products: [bare] })).sections[0].products[0];

  assert.equal(shown.ingredientsText, undefined);
  assert.match(shown.ingredientsNote, /no ingredient list/);
  // Only the database's definite tags are ever shown; "unknown" is not one.
  assert.deepEqual(shown.databaseNotes, []);
  assert.equal(shown.databaseNotesNote, undefined);
});

/* --------------------------- their own words --------------------------- */

test('the list is counted, and nothing about its contents is invented', () => {
  const bottle = product('0000000000020');
  const data = dataWith({
    products: [bottle],
    routineItems: [
      item({ label: 'Nizoral shampoo', productBarcode: bottle.barcode }),
      item({ id: 'rti_2', label: 'Biotin tablet' }),
    ],
  });

  const notes = buildShelf(data).listNotes;
  assert.equal(notes[0].id, 'list:count');
  assert.equal(
    notes[0].text,
    'Your list has 2 tasks. 1 of them is linked to a record on this screen.',
  );

  /*
    The shelf holds no idea of what a routine is supposed to contain. An
    earlier draft printed a fixed table — a wash, something applied,
    something taken, a device — and marked the rows the list did not
    mention, which on a product screen is a list of things to go and buy.
    Nothing but the count and the answers they gave may appear here.
  */
  const ids = notes.map((n) => n.id);
  assert.deepEqual(ids, ['list:count']);
});

test('one task on the list is counted in the singular', () => {
  const data = dataWith({ routineItems: [item()] });
  assert.equal(
    buildShelf(data).listNotes[0].text,
    'Your list has 1 task. It is not linked to a record on this screen.',
  );
});

test('an empty list gets no notes about itself', () => {
  assert.deepEqual(buildShelf(dataWith({ products: [product('1')] })).listNotes, []);
});

test('a shared word is stated as a shared word, and quotes where it was found', () => {
  const data = dataWith({
    routineItems: [item({ label: 'Minoxidil 5%', detail: 'two pumps' })],
    journey: journey({ medications: ['minoxidilTopical', 'finasterideOral', 'none'] }),
  });

  const shelf = buildShelf(data);
  assert.deepEqual(
    shelf.listNotes.filter((n) => n.id.startsWith('told:')).map((n) => n.id),
    ['told:minoxidilTopical', 'told:finasterideOral'],
  );

  const hit = told(shelf, 'minoxidilTopical');
  assert.equal(hit.mentioned, true);
  assert.equal(
    hit.text,
    'You told us about “Minoxidil (topical)”. The word “minoxidil” appears on your list: “Minoxidil 5%”.',
  );

  const miss = told(shelf, 'finasterideOral');
  assert.equal(miss.mentioned, false);
  assert.equal(
    miss.text,
    'You told us about “Finasteride (oral)”. The word “finasteride” does not appear in the text on your list.',
  );
});

test('a match in a detail or on a linked record says which, and quotes that text', () => {
  const detail = buildShelf(
    dataWith({
      routineItems: [item({ label: 'Evening step', detail: 'two pumps of minoxidil' })],
      journey: journey({ medications: ['minoxidilTopical'] }),
    }),
  );
  assert.equal(
    told(detail, 'minoxidilTopical').text,
    'You told us about “Minoxidil (topical)”. The word “minoxidil” appears in a detail on your list: “two pumps of minoxidil”.',
  );

  const bottle = product('0000000000021', { name: 'Ketoconazole 2% bottle' });
  const linked = buildShelf(
    dataWith({
      products: [bottle],
      routineItems: [item({ label: 'Evening step', productBarcode: bottle.barcode })],
      journey: journey({ medications: ['ketoconazole'] }),
    }),
  );
  /*
    The regression this pins: an earlier draft matched over the label,
    the detail and the linked product name at once and then quoted only
    the label, producing "your list mentions a wash: “Evening step”" —
    a sentence the reader cannot check against anything on screen.
  */
  assert.equal(
    told(linked, 'ketoconazole').text,
    'You told us about “Ketoconazole shampoo”. The word “ketoconazole” appears on a record linked to your list: “Ketoconazole 2% bottle”.',
  );
});

test('a word two answers happen to share is never stated as the same thing', () => {
  const data = dataWith({
    routineItems: [item({ label: 'Iron skillet' })],
    journey: journey({ medications: ['iron'] }),
  });

  const line = told(buildShelf(data), 'iron');
  /*
    "Iron skillet" is not an iron supplement. Matching on a first word and
    then saying "your list mentions it" asserted an identity that does not
    hold, on the one screen whose premise is that every line traces to the
    record. All the app knows is that a word is shared, so that is all it
    says.
  */
  assert.equal(
    line.text,
    'You told us about “Iron or ferritin supplement”. The word “iron” appears on your list: “Iron skillet”.',
  );
  assert.ok(!line.text.includes('mentions it'));
});

test('an answer whose first word is short is compared, not dropped', () => {
  const data = dataWith({
    routineItems: [item({ label: 'Saw palmetto capsule' })],
    journey: journey({ medications: ['other'], medicationNote: 'saw palmetto' }),
  });

  const line = told(buildShelf(data), 'other');
  assert.equal(line.mentioned, true);
  /*
    An earlier draft matched a medication on its first word only and
    refused any first word shorter than four characters, so this answer
    produced no line at all while every other answer produced one. Every
    word of three characters or more is compared now, first match first.
  */
  assert.equal(
    line.text,
    'You told us about “saw palmetto”. The word “saw” appears on your list: “Saw palmetto capsule”.',
  );
});

test('an answer with nothing comparable in it says so rather than vanishing', () => {
  const data = dataWith({
    routineItems: [item({ label: 'B1 tablet' })],
    journey: journey({ medications: ['other'], medicationNote: 'B1' }),
  });

  const line = told(buildShelf(data), 'other');
  assert.equal(line.mentioned, false);
  assert.match(line.text, /did not look for this on your list/);
});

test('an answer dropped for being too general is not reported as too short', () => {
  /*
    The defect this pins: "Shampoo" is seven characters, and an earlier
    draft told its owner that Tress had found no word of three or more
    in it — while "Nizoral shampoo" sat on their list two lines down.
    The two reasons a word is set aside are not interchangeable, and the
    sentence has to name the one that actually applied.
  */
  const data = dataWith({
    routineItems: [item({ label: 'Nizoral shampoo' })],
    journey: journey({ medications: ['other'], medicationNote: 'Shampoo' }),
  });

  const line = told(buildShelf(data), 'other');
  assert.equal(line.mentioned, false);
  assert.equal(
    line.text,
    'You told us about “Shampoo”. The word “shampoo” is too general to report a match on. Tress did not look for this on your list.',
  );
  assert.ok(
    !/characters or more/.test(line.text),
    'a seven-letter answer must never be described as having no word of three characters or more',
  );
});

test('an answer set aside for both reasons names both of them', () => {
  const data = dataWith({
    routineItems: [item({ label: 'Morning dropper' })],
    journey: journey({ medications: ['other'], medicationNote: 'Daily B1' }),
  });

  assert.equal(
    told(buildShelf(data), 'other').text,
    'You told us about “Daily B1”. The word “daily” is too general to report a match on. ' +
      'Tress compares whole words of three characters or more, and “b1” is shorter than that. ' +
      'Tress did not look for this on your list.',
  );
});

test('the comparison threshold and the sentence that states it stay in step', () => {
  assert.equal(COMPARE_MIN, 3);
  const data = dataWith({
    routineItems: [item()],
    journey: journey({ medications: ['other'], medicationNote: 'B1' }),
  });
  assert.match(told(buildShelf(data), 'other').text, /whole words of three characters or more/);
});

test('an answer of several words names every word it looked for', () => {
  const data = dataWith({
    routineItems: [item({ label: 'Morning dropper' })],
    journey: journey({ medications: ['iron'] }),
  });

  assert.equal(
    told(buildShelf(data), 'iron').text,
    'You told us about “Iron or ferritin supplement”. The words “iron” and “ferritin” do not appear in the text on your list.',
  );
});

test('a word is matched whole, never as the start of a longer one', () => {
  const data = dataWith({
    routineItems: [item({ label: 'Ironic tonic' })],
    journey: journey({ medications: ['iron'] }),
  });
  assert.equal(told(buildShelf(data), 'iron').mentioned, false);
});

test('"something else" with nothing typed produces no line at all', () => {
  const data = dataWith({
    routineItems: [item()],
    journey: journey({ medications: ['other'] }),
  });
  assert.equal(
    buildShelf(data).listNotes.some((n) => n.id === 'told:other'),
    false,
  );
});

test('a journey that holds an answer twice still produces one line and one chip', () => {
  const data = dataWith({
    routineItems: [item({ label: 'Morning dropper' })],
    journey: journey({ medications: ['iron', 'iron'] }),
  });

  const shelf = buildShelf(data);
  // Storage is read off disk, so a duplicate key is a state a real
  // install can reach; two identical lines would collide on their id and
  // two identical chips on their text.
  assert.deepEqual(
    shelf.listNotes.filter((n) => n.id.startsWith('told:')).length,
    1,
  );
  assert.deepEqual(shelf.answers.using, ['Iron or ferritin supplement']);
});

test('their answers are read back in their own words, and unknown ones dropped', () => {
  const data = dataWith({
    journey: journey({
      // A key this version no longer offers, as a real install can hold.
      trackingAreas: ['hairline', 'crown', 'somethingRemoved' as unknown as TrackingArea],
      goals: ['fullness', 'lessBreakage'],
      medications: ['iron', 'other'],
      medicationNote: 'saw palmetto',
    }),
  });

  const answers = buildShelf(data).answers;
  assert.deepEqual(answers.watching, ['Hairline', 'Crown']);
  assert.deepEqual(answers.goals, ['More fullness', 'Less breakage']);
  assert.deepEqual(answers.using, ['Iron or ferritin supplement', 'saw palmetto']);
});

test('a journey saved before goals took several answers still reads back', () => {
  const old = { ...journey(), goals: undefined, goal: 'crown' as const };
  assert.deepEqual(buildShelf(dataWith({ journey: old })).answers.goals, [
    'More density at the crown',
  ]);
});

/* ------------------------------ the sweeps ----------------------------- */

/** A shelf holding every branch at once, including hostile user text. */
function loadedData(): AppData {
  const shampoo = fromDatabase('5601059062534');
  const typed: Product = {
    barcode: '0000000000011',
    source: 'manual',
    name: 'Thickening tonic',
    fetchedAt: EARLIER,
  };
  const bare = product('0000000000012', { name: 'Unlisted bottle' });

  return dataWith({
    products: [shampoo, typed, bare],
    routineItems: [
      item({
        label: 'Density serum',
        detail: 'the one that makes it thicker',
        productBarcode: typed.barcode,
      }),
      item({ id: 'rti_2', label: 'Wash day', productBarcode: shampoo.barcode }),
    ],
    journey: journey({
      trackingAreas: ['density', 'hairline'],
      goals: ['fullness', 'routineWorking'],
      medications: ['minoxidilTopical', 'iron', 'other'],
      medicationNote: 'thinning tonic',
    }),
  });
}

test('every string the shelf writes is clean once the quotes are lifted out', () => {
  const sentences = authored(buildShelf(loadedData()));

  assert.ok(sentences.length > 12, 'the fixture should exercise most of the copy');
  sweep(sentences, 'the shelf');
});

test('the sweep is not vacuous: the raw sentences really do carry their words', () => {
  const raw = shelfSentences(buildShelf(loadedData())).map((f) => f.text);
  const all = raw.join(' ').toLowerCase();

  // Their own label, read back, containing two words the app may never
  // use itself. If this stops being true the sweep above proves nothing.
  assert.ok(all.includes('density serum'));
  assert.ok(all.includes('thinning tonic'));
});

test('the sweep sees the tags too, not only the sentences around them', () => {
  const ids = shelfSentences(buildShelf(loadedData())).map((f) => f.id);
  /*
    The English beside a tag slug — "Vegan", "Palm oil free" — is Tress's
    wording, not the database's, so a new entry in SHOWN_TAGS reaches the
    screen and has to reach the sweep with it.
  */
  assert.ok(ids.some((id) => id.includes(':databaseNote:')));
});

/**
 * Every string the shelf was built from, so a quoted span can be checked
 * against the data rather than against a list typed out in this file.
 *
 * The medication labels are in here because the person chose the answer
 * those words name; everything else is text they typed or the database
 * returned.
 */
function storedStrings(data: AppData): string[] {
  const out: string[] = [];

  for (const p of data.products) {
    out.push(p.name, p.brand ?? '', p.quantity ?? '', p.ingredientsText ?? '');
  }
  for (const i of data.routineItems) out.push(i.label, i.detail ?? '');

  const j = data.journey;
  for (const medication of j?.medications ?? []) {
    if (medication === 'other') out.push(j?.medicationNote?.trim() ?? '');
    else if (medication in MEDICATION_LABELS) out.push(MEDICATION_LABELS[medication]);
  }
  for (const area of j?.trackingAreas ?? []) {
    if (area in TRACKING_AREA_LABELS) out.push(TRACKING_AREA_LABELS[area]);
  }
  if (j) for (const goal of journeyGoals(j)) out.push(HAIR_GOAL_LABELS[goal]);

  return out.filter((s) => s.length > 0);
}

/**
 * The ids of every exempted span that is not somebody else's text.
 *
 * A span has to appear in the sentence that exempts it and inside
 * something the shelf was built from; a single word lifted out of an
 * answer counts, which is why this is a substring check rather than an
 * equality one.
 */
function unownedQuotes(facts: ShelfFact[], stored: string[]): string[] {
  const haystacks = stored.map((s) => s.toLowerCase());
  const bad: string[] = [];

  for (const fact of facts) {
    for (const quote of fact.quotes) {
      if (quote.length === 0 || !fact.text.includes(quote)) {
        bad.push(`${fact.id}: ${quote}`);
        continue;
      }
      if (!haystacks.some((h) => h.includes(quote.toLowerCase()))) {
        bad.push(`${fact.id}: ${quote}`);
      }
    }
  }
  return bad;
}

test('every quoted span comes from the data the shelf was built from', () => {
  const data = loadedData();
  const facts = shelfSentences(buildShelf(data));

  assert.deepEqual(unownedQuotes(facts, storedStrings(data)), []);
  assert.ok(
    facts.reduce((n, f) => n + f.quotes.length, 0) >= 6,
    'the fixture should exercise the quoting paths',
  );
});

test('the answer chips are swept, and each one has to be an answer they gave', () => {
  /*
    The chips are the app's wording for options the person ticked, and
    they carry words the banned list forbids — "Overall thinning", "A
    fuller ponytail". They were rendered by the screen and reached by no
    sweep, so a chip the app invented would have landed on the product
    screen unchecked. They are swept now, with each chip exempted as a
    quotation of the answer it reads back — which `unownedQuotes` then
    has to find in the stored journey.
  */
  const data = loadedData();
  const shelf = buildShelf(data);
  const ids = shelfSentences(shelf).map((f) => f.id);

  const chipCount =
    shelf.answers.watching.length + shelf.answers.goals.length + shelf.answers.using.length;
  assert.ok(chipCount > 0, 'the fixture should have answers to read back');
  assert.equal(
    ids.filter((id) => id.startsWith('answer:')).length,
    chipCount,
    'every chip the screen renders has to reach the sweep',
  );

  // And a chip that is not one of their answers is caught.
  assert.deepEqual(
    unownedQuotes(
      [{ id: 'answer:goals:9', text: 'Clinically proven fullness', quotes: ['Clinically proven fullness'] }],
      storedStrings(data),
    ),
    ['answer:goals:9: Clinically proven fullness'],
  );
});

test('the exemption check rejects a span that came from nowhere', () => {
  const stored = storedStrings(loadedData());

  // Proves the check above can fail: an authored phrase dressed as a
  // quotation would otherwise slip past the sweep untouched.
  assert.deepEqual(
    unownedQuotes(
      [{ id: 'fake', text: 'Somebody said “clinically proven” once.', quotes: ['clinically proven'] }],
      stored,
    ),
    ['fake: clinically proven'],
  );
  // And a span the sentence does not actually contain is caught too.
  assert.deepEqual(
    unownedQuotes([{ id: 'stray', text: 'Nothing quoted here.', quotes: ['Density serum'] }], stored),
    ['stray: Density serum'],
  );
});

/* -------------------------- the source sweeps -------------------------- */

const SCREEN = 'src/app/shelf.tsx';
const MODULE = 'src/features/products/shelf.ts';

function sourceOf(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

/** The same file with its comments gone, for asserting on what it does. */
function codeOf(relativePath: string): string {
  return sourceOf(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

/**
 * The string literals of a source file: single, double and backtick
 * quoted, plus JSX text nodes. Comments come out first — this file's own
 * prose, and the module's, quote the very words they forbid.
 */
function literalsOf(relativePath: string): string[] {
  const source = codeOf(relativePath);

  const out: string[] = [];
  for (const pattern of [/'([^'\\\n]*)'/g, /"([^"\\\n]*)"/g, /`([^`\\]*)`/g]) {
    for (const match of source.matchAll(pattern)) out.push(match[1]);
  }
  for (const match of source.matchAll(/>\s*([^<>{}\n]+?)\s*</g)) out.push(match[1]);
  return out;
}

test('the screen types no claim straight into its JSX', () => {
  const literals = literalsOf(SCREEN);
  assert.ok(literals.some((l) => l.includes('Your shelf')), 'the screen should be readable here');
  sweep(literals, SCREEN);
});

test('no branch of the module holds copy the sweep has not seen', () => {
  const literals = literalsOf(MODULE);
  assert.ok(literals.some((l) => l.includes('does not provide medical advice')));
  sweep(literals, MODULE);
});

test('the screen offers nothing to acquire and nothing to stage', () => {
  const source = codeOf(SCREEN);

  /*
    A control that adds a bottle to the list turns a page of neutral
    facts into a page of offers — and the one that used to be here staged
    a prefill and called router.back(), which only did anything if the
    shelf had been pushed from the routine sheet. Adding to the list
    lives on the routine sheet, where the entry point is unambiguous.
  */
  assert.ok(!source.includes('stagePrefill'), 'the shelf must stage nothing');
  assert.ok(!source.includes('Add to My List'), 'the shelf must not offer to add');
});

test('the list notes are sentences, not a checklist, and tags are not badged', () => {
  const source = codeOf(SCREEN);

  const noteLine = source.slice(source.indexOf('function NoteLine'));
  const body = noteLine.slice(0, noteLine.indexOf('\n}'));
  assert.ok(body.length > 0, 'NoteLine should still be in the screen');
  /*
    A tick beside one line and an empty box beside the next makes the
    first an achievement and the second a gap to fill, whatever the
    sentences say.
  */
  assert.ok(!body.includes('<Icon'), 'a note line must carry no glyph');

  /*
    The database's tags are shown in the neutral fill. In the app's
    affirmative accent — and filtered to the positive tags, as they are —
    they read as a badge of approval from Tress rather than a listing
    from a database.
  */
  assert.ok(!source.includes('accentSoft'), 'tags must not sit in the accent');
  assert.ok(!source.includes('accentBorder'), 'tags must not be outlined in the accent');
});
