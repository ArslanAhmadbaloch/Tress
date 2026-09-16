/**
 * The products feature, in one import.
 *
 * Three things live behind this barrel and they are deliberately
 * separate: the lookup that talks to Open Beauty Facts, the in-memory
 * hand-off that carries a scanned bottle to the routine form, and the
 * shelf that arranges records already held. Nothing here fetches on
 * import, and nothing here reaches React Native, so every one of them
 * stays loadable under `node --test`.
 */

export {
  ATTRIBUTION,
  APP_VERSION,
  OBF_FIELDS,
  OBF_IMAGE_ORIGIN,
  OBF_ORIGIN,
  OBF_TIMEOUT_MS,
  OBF_USER_AGENT,
  analysisNotes,
  lookupProduct,
  normaliseBarcode,
  parseLookup,
  productPageUrl,
  productUrl,
  trimOrUndefined,
  type Lookup,
  type LookupError,
} from './open-beauty-facts';

export {
  stagePrefill,
  takePrefill,
  type ProductPrefill,
} from './handoff';

export {
  COMPARE_MIN,
  buildShelf,
  shelfSentences,
  type Shelf,
  type ShelfAnswers,
  type ShelfFact,
  type ShelfProduct,
  type ShelfSection,
} from './shelf';
