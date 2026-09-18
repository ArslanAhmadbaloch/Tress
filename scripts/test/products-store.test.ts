/**
 * A product is a record the person typed, kept beside the routine, and the
 * rules that keep it honest are invisible on screen: which record wins when
 * the same key is written twice, that unlinking leaves the item's history
 * alone, and that the storage version does not move for an additive
 * change. A screenshot shows a bottle either way. These pin the rules.
 *
 * The hand-off this file used to cover is gone with the barcode scanner:
 * there is no modal to carry a scanned bottle back to the routine form,
 * because the form is where a product is written now.
 *
 * No React Native here: the domain helpers and the selectors are plain
 * modules, which is what lets node --test load them.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { productFor, productsByBarcode } from '@/store/selectors';
import {
  EMPTY_DATA,
  SCHEMA_VERSION,
  upsertProduct,
  withoutProduct,
  type AppData,
  type Product,
  type RoutineItem,
} from '@/types/domain';

/* ------------------------------ fixtures ------------------------------- */

const NOW = '2026-09-15T12:00:00.000Z';

function product(barcode: string, overrides: Partial<Product> = {}): Product {
  return {
    barcode,
    source: 'openBeautyFacts',
    name: `Product ${barcode}`,
    brand: 'Brand',
    fetchedAt: NOW,
    ...overrides,
  };
}

function item(overrides: Partial<RoutineItem> = {}): RoutineItem {
  return {
    id: 'rti_1',
    journeyId: 'j1',
    label: 'Shampoo',
    detail: 'Twice a week',
    icon: 'drop',
    cadence: 'weekly',
    timesPerWeek: 2,
    timeOfDay: 'evening',
    dosesPerDay: 1,
    createdAt: NOW,
    ...overrides,
  };
}

function dataWith(products: Product[]): AppData {
  return { ...EMPTY_DATA, products };
}

/* ----------------------------- upsertProduct --------------------------- */

test('upsertProduct: appends a new barcode', () => {
  const p = product('5601059062534');
  assert.deepEqual(upsertProduct([], p), [p]);
});

test('upsertProduct: replaces a record sharing its barcode, in place', () => {
  const a = product('5601059062534');
  const b = product('0066000020578');
  const b2 = product('0066000020578', { name: 'Fresh lookup', fetchedAt: '2026-09-16T08:00:00.000Z' });

  const next = upsertProduct([a, b], b2);

  assert.deepEqual(next, [a, b2]);
  assert.equal(next[0], a, 'untouched records keep their identity');
  assert.equal(next[1], b2);
});

test('upsertProduct: the record written last wins, whichever wrote it', () => {
  /*
    The lookup that used to replace a typed record with a listed one is
    gone, and nothing writes an 'openBeautyFacts' record any more. The
    function's rule is still worth pinning in both directions: it keys on
    the barcode and takes the newer record whole, so a legacy record and
    a typed one sharing a key never end up merged into a third thing that
    neither the person nor the old scanner ever wrote.
  */
  const typed = product('3600523379713', { source: 'manual', name: 'My shampoo' });
  const listed = product('3600523379713', { source: 'openBeautyFacts', name: 'Listed name' });

  const next = upsertProduct([typed], listed);

  assert.equal(next.length, 1);
  assert.equal(next[0].source, 'openBeautyFacts');
  assert.equal(next[0].name, 'Listed name');
});

test('upsertProduct: never mutates its input', () => {
  const a = product('5601059062534');
  const b = product('0066000020578');
  const before = [a, b];
  const snapshot = [...before];

  upsertProduct(before, product('0066000020578', { name: 'Changed' }));
  upsertProduct(before, product('8908016247100'));

  assert.deepEqual(before, snapshot);
  assert.equal(before[1].name, b.name);
});

/* ----------------------------- withoutProduct -------------------------- */

test('withoutProduct: returns the same reference when nothing is linked', () => {
  const plain = item();
  assert.equal(withoutProduct(plain), plain);
});

test('withoutProduct: drops the key and keeps every other field', () => {
  const linked = item({ productBarcode: '5601059062534' });
  const next = withoutProduct(linked);

  assert.notEqual(next, linked);
  assert.equal('productBarcode' in next, false);

  const { productBarcode: _dropped, ...rest } = linked;
  assert.deepEqual(next, rest);
  // The original is untouched: unlinking is a new record, not an edit.
  assert.equal(linked.productBarcode, '5601059062534');
});

/* -------------------------------- selectors ---------------------------- */

test('productFor: undefined when nothing is linked or the link is stale', () => {
  const data = dataWith([product('5601059062534')]);

  assert.equal(productFor(data, { productBarcode: undefined }), undefined);
  assert.equal(productFor(data, {}), undefined);
  assert.equal(productFor(data, { productBarcode: '0066000020578' }), undefined);
});

test('productFor and productsByBarcode: resolve a cached record', () => {
  const cached = product('5601059062534');
  const data = dataWith([product('0066000020578'), cached]);

  assert.equal(productFor(data, { productBarcode: '5601059062534' }), cached);
  assert.equal(productsByBarcode(data).get('5601059062534'), cached);
  assert.equal(productsByBarcode(data).size, 2);
});

/* ------------------------------ schema guard --------------------------- */

test('schema: the version does not move for an additive change', () => {
  // The loader in app-store.tsx discards storage whose version differs,
  // so bumping this number for products would erase every installed
  // journey. Products are additive and load as [] from the spread.
  assert.equal(SCHEMA_VERSION, 2);
  assert.deepEqual(EMPTY_DATA.products, []);
});

test('schema: a record saved before products existed still loads', () => {
  const legacy = { ...EMPTY_DATA };
  delete (legacy as Partial<AppData>).products;
  assert.equal('products' in legacy, false);

  // Exactly what the loader does with a version match.
  const loaded: AppData = { ...EMPTY_DATA, ...legacy };
  assert.deepEqual(loaded.products, []);
  assert.equal(loaded.schemaVersion, SCHEMA_VERSION);
});

/* ----------------------------- serialisation --------------------------- */

test('a manual product with no brand round-trips through JSON unchanged', () => {
  const typed: Product = {
    barcode: '3600523379713',
    source: 'manual',
    name: 'My shampoo',
    fetchedAt: NOW,
  };

  const restored = JSON.parse(JSON.stringify(typed)) as Product;

  assert.deepEqual(restored, typed);
  assert.deepEqual(Object.keys(restored).sort(), ['barcode', 'fetchedAt', 'name', 'source']);
});
