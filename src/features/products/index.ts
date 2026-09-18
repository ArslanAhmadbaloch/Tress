/**
 * The products feature, in one import.
 *
 * One thing lives behind this barrel now: the shelf, which arranges the
 * product records an install holds. The barcode reader and the lookup
 * that went with it have been removed — a record made now is something a
 * person writes down, an upgraded install still holds the ones the
 * scanner fetched, and the shelf says which of the two each one is.
 * Nothing here sends any of it anywhere.
 *
 * Nothing here fetches, on import or ever, and nothing here reaches
 * React Native, so it stays loadable under `node --test`.
 */

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
