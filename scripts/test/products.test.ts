/**
 * The barcode lookup, pinned to the database's real answers.
 *
 * The API bodies live as JSON fixtures rather than as literals in this
 * file. Two reasons. The copy sweep at the end of this file reads source
 * text and forbids a list of outcome words, and any sweep over test source
 * should stay just as clean; the minoxidil record's own product name
 * contains one of those words. Keeping the bodies as data means the app
 * can show what the database says without this file — or any file under
 * src/ — ever saying it itself. The second reason is fidelity: a fixture
 * pasted byte for byte from the wire is one the parser must cope with,
 * unrequested keys and label OCR included.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  analysisNotes,
  ATTRIBUTION,
  lookupProduct,
  normaliseBarcode,
  parseLookup,
  productPageUrl,
  productUrl,
} from '@/features/products/open-beauty-facts';

/* ------------------------------ helpers -------------------------------- */

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/obf/${name}.json`, import.meta.url), 'utf8'));
const NOW = '2026-09-15T12:00:00.000Z';
const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The `product` object of a fixture, for comparing against the wire verbatim. */
const fixtureProduct = (name: string): Record<string, unknown> =>
  (fixture(name) as { product: Record<string, unknown> }).product;

/** Narrows a lookup to its found product, failing loudly otherwise. */
function found(json: unknown) {
  const outcome = parseLookup(json, NOW);
  assert.equal(outcome.kind, 'found');
  if (outcome.kind !== 'found') throw new Error('unreachable');
  return outcome.product;
}

const PRODUCT_KEYS = [
  'barcode',
  'source',
  'name',
  'brand',
  'quantity',
  'ingredientsText',
  'imageUrl',
  'thumbnailUrl',
  'analysisTags',
  'fetchedAt',
];

/* ------------------------------- parser -------------------------------- */

test('Head & Shoulders maps completely', () => {
  const product = found(fixture('5601059062534'));
  assert.equal(product.barcode, '5601059062534');
  assert.equal(product.source, 'openBeautyFacts');
  assert.equal(product.name, 'Head & Shoulders Classic Clean 2 in 1 Shampoo');
  assert.equal(product.brand, 'Head & Shoulders');
  assert.equal(product.quantity, '200 ml');
  assert.ok(product.ingredientsText?.startsWith('Aqua, Sodium Laureth Sulfate'));
  assert.ok(product.ingredientsText?.endsWith('CI 17200.'));
  assert.ok(product.imageUrl?.endsWith('front_tr.3.400.jpg'));
  assert.ok(product.thumbnailUrl?.endsWith('front_tr.3.200.jpg'));
  assert.deepEqual(
    product.analysisTags,
    fixtureProduct('5601059062534').ingredients_analysis_tags,
  );
  assert.equal(product.analysisTags?.length, 3);
  assert.equal(product.fetchedAt, NOW);
});

test('minoxidil: empty ingredients become absent, name stays verbatim', () => {
  const product = found(fixture('0066000020578'));
  assert.equal('ingredientsText' in product, false);
  assert.equal('analysisTags' in product, false);
  // Compared to the wire, never typed here: the app's copy does not contain
  // the word in this name, and neither does this file.
  assert.equal(product.name, fixtureProduct('0066000020578').product_name);
  assert.equal(product.brand, 'equate');
  assert.equal(product.quantity, '30 ml');
});

test('sparse pharmacy record', () => {
  const product = found(fixture('3400938365900'));
  assert.equal(product.name, 'Kétoconazole');
  assert.equal(product.brand, 'Arrow');
  assert.equal(product.quantity, '6g');
  assert.equal('ingredientsText' in product, false);
  assert.equal('analysisTags' in product, false);
  assert.ok(product.imageUrl);
});

test('Traya: missing quantity', () => {
  const product = found(fixture('8908016247100'));
  assert.equal('quantity' in product, false);
  assert.equal(product.name, 'Ketoconazole shampoo');
});

test('Garnier: ingredients_text_en preferred, text untouched', () => {
  const product = found(fixture('3610340634185'));
  assert.equal(product.ingredientsText, fixtureProduct('3610340634185').ingredients_text_en);
  assert.ok(product.ingredientsText?.startsWith('From a responsible source'));
  assert.ok(product.ingredientsText?.includes('consumercare@loreal.com'));
  assert.deepEqual(analysisNotes(product.analysisTags), []);
});

test('Mixa: two brands kept as one raw string, unrequested keys dropped', () => {
  const product = found(fixture('3600551119816'));
  assert.equal(product.brand, 'Mixa Bébé, mixa');
  for (const key of Object.keys(product)) {
    assert.ok(PRODUCT_KEYS.includes(key), `unexpected key ${key}`);
  }
  assert.equal('ecoscore_tags' in product, false);
  assert.ok(product.ingredientsText?.endsWith('(F.I.L. Z288697/2).'));
});

test('unnamed record is notFound', () => {
  assert.deepEqual(parseLookup(fixture('4084500526792'), NOW), { kind: 'notFound' });
});

test('status 0 is notFound; garbage is malformed', () => {
  assert.deepEqual(parseLookup(fixture('not-found-404'), NOW), { kind: 'notFound' });
  assert.deepEqual(parseLookup(fixture('invalid-code'), NOW), { kind: 'notFound' });
  for (const garbage of [null, '<html>', { status: 1 }, { status: '1', product: {} }]) {
    const outcome = parseLookup(garbage, NOW);
    assert.equal(outcome.kind, 'error');
    assert.equal(outcome.kind === 'error' && outcome.reason, 'malformed');
  }
});

test('whitespace and trimming', () => {
  const product = found({
    code: '12345678',
    status: 1,
    product: {
      product_name: '  Foam  ',
      brands: '   ',
      quantity: ' 60 ml ',
      ingredients_text: '  ',
      ingredients_text_en: '',
    },
  });
  assert.equal(product.name, 'Foam');
  assert.equal('brand' in product, false);
  assert.equal(product.quantity, '60 ml');
  assert.equal('ingredientsText' in product, false);
});

test('image host rule', () => {
  const withImage = (image_front_url: string) =>
    found({ code: '12345678', status: 1, product: { product_name: 'X', image_front_url } });
  assert.equal('imageUrl' in withImage('https://example.com/x.jpg'), false);
  const kept = 'https://images.openbeautyfacts.org/images/products/1/front.400.jpg';
  assert.equal(withImage(kept).imageUrl, kept);
});

test('canonical code wins', () => {
  const product = found({
    code: '0066000020578',
    status: 1,
    product: { product_name: 'X', code: '0066000020578' },
  });
  assert.equal(product.barcode, '0066000020578');
});

/* ---------------------------- pure helpers ----------------------------- */

test('normaliseBarcode', () => {
  assert.equal(normaliseBarcode(' 0066000020578 '), '0066000020578');
  assert.equal(normaliseBarcode('5601059062534\n'), '5601059062534');
  assert.equal(normaliseBarcode('066000020578'), '0066000020578');
  assert.equal(normaliseBarcode('12345678'), '12345678');
  assert.equal(normaliseBarcode('abc'), null);
  assert.equal(normaliseBarcode('1234567'), null);
  assert.equal(normaliseBarcode('123456789012345'), null);
  assert.equal(normaliseBarcode('1234567890'), null);
});

test('productUrl', () => {
  assert.equal(
    productUrl('5601059062534'),
    'https://world.openbeautyfacts.org/api/v2/product/5601059062534.json?fields=code,product_name,brands,quantity,ingredients_text,ingredients_text_en,image_front_url,image_front_small_url,ingredients_analysis_tags',
  );
  assert.throws(() => productUrl('12/../x'));
  assert.throws(() => productUrl('abc'));
  assert.equal(
    productPageUrl('5601059062534'),
    'https://world.openbeautyfacts.org/product/5601059062534',
  );
});

test('analysisNotes', () => {
  assert.deepEqual(
    analysisNotes(['en:palm-oil-free', 'en:vegan-status-unknown', 'en:vegetarian-status-unknown']),
    ['Palm oil free'],
  );
  assert.deepEqual(analysisNotes(['en:vegan', 'en:vegetarian']), ['Vegan', 'Vegetarian']);
  assert.deepEqual(
    analysisNotes([
      'en:non-vegan',
      'en:palm-oil',
      'en:maybe-vegan',
      'en:may-contain-palm-oil',
      'en:palm-oil-content-unknown',
    ]),
    [],
  );
  assert.deepEqual(analysisNotes(undefined), []);
  assert.deepEqual(analysisNotes('en:vegan'), []);
  assert.deepEqual(analysisNotes([1, null]), []);
  // Names that every object inherits are not the database's tags either.
  assert.deepEqual(analysisNotes(['constructor', 'toString', '__proto__', 'en:vegan']), ['Vegan']);
});

/* ------------------------------- network ------------------------------- */

/** A fetch stand-in that records what it was asked and answers as told. */
function recordingFetch(answer: (init: RequestInit) => Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = (input, init = {}) => {
    calls.push({ url: String(input), init });
    return answer(init);
  };
  return { calls, fetchImpl };
}

test('lookupProduct sends only the barcode', async () => {
  const { calls, fetchImpl } = recordingFetch(async () => ok(fixture('5601059062534')));
  const outcome = await lookupProduct('5601059062534', { fetchImpl, now: () => NOW });

  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, productUrl('5601059062534'));
  assert.equal(init.method, 'GET');
  const headers = init.headers as Record<string, string>;
  assert.deepEqual(Object.keys(headers).sort(), ['Accept', 'User-Agent']);
  assert.match(headers['User-Agent'], /^Tress\/\d+\.\d+ \([^\s@]+@[^\s@]+\)$/);
  assert.equal(init.body, undefined);
  assert.equal(init.credentials, undefined);

  assert.equal(outcome.kind, 'found');
  assert.equal(outcome.kind === 'found' && outcome.product.fetchedAt, NOW);
});

test('404 is notFound, not an error', async () => {
  // Verified live: every unknown barcode is a 404. Mapping it to 'error'
  // would send every new bottle to the offline panel.
  const { fetchImpl } = recordingFetch(async () => ok(fixture('not-found-404'), 404));
  assert.deepEqual(await lookupProduct('3600523379713', { fetchImpl }), { kind: 'notFound' });
});

test('HTTP 500 and malformed bodies', async () => {
  const server = recordingFetch(async () => ok({}, 500));
  assert.deepEqual(await lookupProduct('5601059062534', { fetchImpl: server.fetchImpl }), {
    kind: 'error',
    reason: 'http',
    status: 500,
  });

  const html = recordingFetch(async () => new Response('<html>', { status: 200 }));
  assert.deepEqual(await lookupProduct('5601059062534', { fetchImpl: html.fetchImpl }), {
    kind: 'error',
    reason: 'malformed',
  });
});

test('offline', async () => {
  const { fetchImpl } = recordingFetch(async () => {
    throw new TypeError('Network request failed');
  });
  assert.deepEqual(await lookupProduct('5601059062534', { fetchImpl }), { kind: 'offline' });
});

test('timeout', async () => {
  const never = recordingFetch(() => new Promise<Response>(() => {}));
  const outcome = await lookupProduct('5601059062534', { fetchImpl: never.fetchImpl, timeoutMs: 20 });
  assert.deepEqual(outcome, { kind: 'error', reason: 'timeout' });
  assert.equal(never.calls[0].init.signal?.aborted, true);

  // A caller's abort must not wait out the timer.
  const caller = new AbortController();
  setTimeout(() => caller.abort(), 5);
  const started = Date.now();
  const cancelled = await lookupProduct('5601059062534', {
    fetchImpl: never.fetchImpl,
    timeoutMs: 1000,
    signal: caller.signal,
  });
  assert.deepEqual(cancelled, { kind: 'error', reason: 'timeout' });
  assert.ok(Date.now() - started < 500, 'resolved on the caller abort, not the timer');
});

test('invalid input never reaches the network', async () => {
  const { calls, fetchImpl } = recordingFetch(async () => ok(fixture('5601059062534')));
  assert.deepEqual(await lookupProduct('abc', { fetchImpl }), {
    kind: 'error',
    reason: 'malformed',
  });
  assert.equal(calls.length, 0);
});

/* ------------------------------ copy sweep ----------------------------- */

const OUTCOME_WORDS =
  /\b(thicker|fuller|regrow\w*|restore\w*|reverse\w*|improve\w*|norwood|diagnos\w*|severe|advanced|guarantee\w*|results?)\b/i;
const URGENCY_WORDS =
  /\b(limited time|spots? left|last chance|hurry|act now|only today|don.t miss|expires?|before it.s too late)\b/i;

/** Comments go first, the way scripts/quality-gate.mjs strips them. */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const repoFile = (rel: string) => new URL(`../../${rel}`, import.meta.url);
const SCREEN = 'src/app/scan-product.tsx';
const SWEPT = [
  SCREEN,
  'src/features/products/open-beauty-facts.ts',
  'src/features/products/handoff.ts',
];

test('copy sweep: no outcome or urgency words on the product surfaces', () => {
  const missing = SWEPT.filter((rel) => !existsSync(repoFile(rel)));
  for (const rel of SWEPT) {
    if (missing.includes(rel)) continue;
    const source = stripComments(readFileSync(repoFile(rel), 'utf8'));
    const outcome = source.match(OUTCOME_WORDS);
    assert.equal(outcome, null, `${rel} says "${outcome?.[0]}"`);
    const urgency = source.match(URGENCY_WORDS);
    assert.equal(urgency, null, `${rel} says "${urgency?.[0]}"`);
  }

  assert.ok(ATTRIBUTION.includes('Open Beauty Facts'));
  assert.ok(ATTRIBUTION.includes('Open Database License'));

  // The scanner screen is built in another lane; until it lands this is
  // the one assertion here that cannot pass, and it says so by name.
  assert.deepEqual(
    missing,
    [],
    `not yet in the working tree (scanner lane, spec §9): ${missing.join(', ')}`,
  );
  const screen = readFileSync(repoFile(SCREEN), 'utf8');
  assert.ok(screen.includes('qualified healthcare'), 'guardrail names a professional');
  assert.ok(screen.includes('does not recommend'), 'guardrail disclaims advice');
  assert.ok(screen.includes('No photo ever leaves your phone'), 'privacy line present');
  assert.equal(screen.includes('progress photos'), false, 'copy written fresh for barcodes');
});
