/**
 * Metro resolves a `.tflite` import to an asset module id — the number
 * `loadTensorflowModel` expects. TypeScript has no idea about that, so
 * without this the import is an error and the alternative is a
 * `require()` that the lint rules rightly object to.
 */
declare module '*.tflite' {
  const asset: number;
  export default asset;
}
