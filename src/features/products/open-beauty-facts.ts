/**
 * The app's one network call: a product barcode lookup against Open Beauty
 * Facts.
 *
 * Only the barcode digits leave the device. The request carries `Accept`,
 * a `User-Agent` that names the app (the form the API asks every client
 * for), and nothing else — no identifier, no photo, no typed text.
 *
 * Everything that comes back is passed through verbatim. The parser here
 * selects fields and trims whitespace; it never rewrites a name, splits an
 * ingredient list or reads anything into a tag. What the database states
 * is what the panel shows, with the source named.
 *
 * Pure TypeScript on purpose: no React Native, no Expo imports, so
 * `node --test` loads it and the tests run against the shipped code.
 */

import type { Product } from '@/types/domain';

export const OBF_ORIGIN = 'https://world.openbeautyfacts.org';
export const OBF_IMAGE_ORIGIN = 'https://images.openbeautyfacts.org';

/** Keep in step with "version" in app.json. Read here rather than from
 *  expo-constants so this module stays importable under node --test. */
export const APP_VERSION = '1.0';

/** The form the Open Beauty Facts API asks every app for. Names the app,
 *  never the person. */
export const OBF_USER_AGENT = `Tress/${APP_VERSION} (support@tresshaircare.com)`;

export const OBF_TIMEOUT_MS = 8000;

export const OBF_FIELDS = [
  'code',
  'product_name',
  'brands',
  'quantity',
  'ingredients_text',
  'ingredients_text_en',
  'image_front_url',
  'image_front_small_url',
  'ingredients_analysis_tags',
] as const;

/** The attribution line the licence requires, shown on every panel. */
export const ATTRIBUTION =
  'Product data and photo from Open Beauty Facts, under the Open Database License.';

export type LookupError = {
  kind: 'error';
  reason: 'timeout' | 'http' | 'malformed';
  /** HTTP status, when the reason is 'http' and a response arrived. */
  status?: number;
};

export type Lookup =
  | { kind: 'found'; product: Product }
  | { kind: 'notFound' }
  | { kind: 'offline' }
  | LookupError;

/**
 * The digits a scanner read, in the form the database stores them.
 *
 * Twelve digits is UPC-A as some scanners report it; the database keeps
 * it as thirteen with a leading zero, so the same bottle gets the same
 * key whichever way it was read. Lengths a real read never yields are
 * refused rather than sent.
 */
export function normaliseBarcode(raw: string): string | null {
  let digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 12) digits = `0${digits}`;
  return digits.length === 8 || digits.length === 13 || digits.length === 14
    ? digits
    : null;
}

/** A barcode can never carry a path segment or a query. */
function assertDigits(code: string): void {
  if (!/^\d+$/.test(code)) throw new Error('barcode must be digits');
}

export function productUrl(code: string): string {
  assertDigits(code);
  return `${OBF_ORIGIN}/api/v2/product/${code}.json?fields=${OBF_FIELDS.join(',')}`;
}

/** The product's own page — the per-product attribution the licence asks for. */
export function productPageUrl(code: string): string {
  assertDigits(code);
  return `${OBF_ORIGIN}/product/${code}`;
}

/**
 * The only three analysis tags ever shown. Each is a definite positive
 * statement the database makes; every `*-unknown`, `maybe-*` and negative
 * tag is dropped because, shown, it reads as a verdict or a warning from
 * the app rather than a listing from the database.
 */
const SHOWN_TAGS: ReadonlyMap<string, string> = new Map([
  ['en:palm-oil-free', 'Palm oil free'],
  ['en:vegan', 'Vegan'],
  ['en:vegetarian', 'Vegetarian'],
]);

export function analysisNotes(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const notes: string[] = [];
  for (const tag of tags) {
    // A Map, not an object literal: `in` on an object would also admit
    // inherited keys like "constructor", which are not the database's tags.
    const note = typeof tag === 'string' ? SHOWN_TAGS.get(tag) : undefined;
    if (note !== undefined) notes.push(note);
  }
  return notes;
}

export function trimOrUndefined(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The canonical code the database returned: a string of at least eight digits. */
const canonicalCode = (v: unknown): string | undefined =>
  typeof v === 'string' && /^\d{8,}$/.test(v) ? v : undefined;

/** Only the database's own image host is ever loaded. */
const imageUrlOrUndefined = (v: unknown): string | undefined =>
  typeof v === 'string' && v.startsWith(`${OBF_IMAGE_ORIGIN}/`) ? v : undefined;

const stringArrayOrUndefined = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.every((item) => typeof item === 'string')
    ? (v as string[])
    : undefined;

/**
 * A `Product` from the API body, or the reason there is none.
 *
 * Undefined fields are omitted rather than written as keys, so a saved
 * record serialises to exactly what it holds. An unnamed record is
 * treated as not found: the person is offered manual entry rather than
 * a row called "Barcode 4084500526792".
 */
export function parseLookup(json: unknown, now: string): Lookup {
  if (!isRecord(json)) return { kind: 'error', reason: 'malformed' };
  if (json.status === 0) return { kind: 'notFound' };
  if (json.status !== 1 || !isRecord(json.product)) {
    return { kind: 'error', reason: 'malformed' };
  }

  const record = json.product;
  const code = canonicalCode(json.code) ?? canonicalCode(record.code);
  if (code === undefined) return { kind: 'error', reason: 'malformed' };

  const name = trimOrUndefined(record.product_name);
  if (name === undefined) return { kind: 'notFound' };

  const product: Product = {
    barcode: code,
    source: 'openBeautyFacts',
    name,
    fetchedAt: now,
  };

  const brand = trimOrUndefined(record.brands);
  if (brand !== undefined) product.brand = brand;

  const quantity = trimOrUndefined(record.quantity);
  if (quantity !== undefined) product.quantity = quantity;

  const ingredientsText =
    trimOrUndefined(record.ingredients_text_en) ??
    trimOrUndefined(record.ingredients_text);
  if (ingredientsText !== undefined) product.ingredientsText = ingredientsText;

  const imageUrl = imageUrlOrUndefined(record.image_front_url);
  if (imageUrl !== undefined) product.imageUrl = imageUrl;

  const thumbnailUrl = imageUrlOrUndefined(record.image_front_small_url);
  if (thumbnailUrl !== undefined) product.thumbnailUrl = thumbnailUrl;

  const analysisTags = stringArrayOrUndefined(record.ingredients_analysis_tags);
  if (analysisTags !== undefined) product.analysisTags = analysisTags;

  return { kind: 'found', product };
}

/**
 * One request per scan, no retries, no logging of the code.
 *
 * A caller's `signal` is forwarded by listener rather than `AbortSignal.any`,
 * which React Native lacks. The fetch is raced against the abort so a
 * transport that never settles still resolves at the timeout.
 */
export async function lookupProduct(
  code: string,
  opts: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    signal?: AbortSignal;
    now?: () => string;
  } = {},
): Promise<Lookup> {
  // The screen normalises first; this is belt and braces.
  if (!/^\d{8,14}$/.test(code)) return { kind: 'error', reason: 'malformed' };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date().toISOString());
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, opts.timeoutMs ?? OBF_TIMEOUT_MS);
  if (opts.signal?.aborted) abort();
  else opts.signal?.addEventListener('abort', abort, { once: true });

  const aborted = new Promise<never>((_, reject) => {
    const fail = () => reject(new Error('aborted'));
    if (controller.signal.aborted) fail();
    else controller.signal.addEventListener('abort', fail, { once: true });
  });

  try {
    const response = await Promise.race([
      fetchImpl(productUrl(code), {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': OBF_USER_AGENT },
        signal: controller.signal,
      }),
      aborted,
    ]);

    // Every unknown barcode is a 404; it is the ordinary "new bottle" case,
    // not a failure, and the body is not worth reading.
    if (response.status === 404) return { kind: 'notFound' };
    if (!response.ok) return { kind: 'error', reason: 'http', status: response.status };

    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { kind: 'error', reason: 'malformed' };
    }
    return parseLookup(json, now());
  } catch (error) {
    if (controller.signal.aborted) return { kind: 'error', reason: 'timeout' };
    // RN: "Network request failed"; Node: "fetch failed". Both are TypeErrors.
    if (error instanceof TypeError) return { kind: 'offline' };
    return { kind: 'error', reason: 'http' };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', abort);
  }
}
