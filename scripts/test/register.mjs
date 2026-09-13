import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./loader.mjs', pathToFileURL('./scripts/test/'));

/**
 * Metro turns `require('…/photo.jpg')` into an opaque asset id. Node has no
 * `require` in an ES module and no idea what a JPEG is, so modules that
 * reference images could not be imported here at all — which would put the
 * gender content map, whose whole job is deciding which image goes where,
 * beyond the reach of the tests.
 *
 * The stand-in returns the path. That is enough for the properties worth
 * asserting: that every slot is filled, and that no two slots resolve to
 * the same picture.
 */
globalThis.require = (id) => id;
