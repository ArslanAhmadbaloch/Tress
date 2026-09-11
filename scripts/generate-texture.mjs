/**
 * Generates the DARK mineral ground.
 *
 * Light mode now uses photographic plates (ground-stone / arch / leaves).
 * Dark mode still needs a generated one: those plates are all bright
 * plaster, and darkening a photograph of white stone gives grey mud rather
 * than a night version of the same surface. This keeps just enough tooth
 * that large flat areas do not band on OLED.
 *
 * The light output below is kept as the fallback plate.
 *
 *   node scripts/generate-texture.mjs
 *
 * Procedural rather than a stock photograph, for three reasons: it stays
 * tiny (a tileable PNG instead of a multi-megabyte JPEG), it is licence-free,
 * and the grain can be tuned to stay under the threshold where it starts
 * competing with the user's photographs — which are the actual content.
 *
 * The result is value-noise at three octaves: broad tonal drift for the
 * sense of a plaster surface, mid-frequency mottling, and a fine grain that
 * kills the flatness of a solid fill without ever reading as "texture".
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'assets', 'images');

const SIZE = 512;

/* ----------------------------- PNG encoder ---------------------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------- noise -------------------------------- */

/** Deterministic hash, so the texture is identical on every machine. */
function hash(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1274126177;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Value noise on a `period`-sized lattice, wrapping so the tile repeats. */
function valueNoise(x, y, period, seed) {
  const gx = x / (SIZE / period);
  const gy = y / (SIZE / period);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = smooth(gx - x0);
  const fy = smooth(gy - y0);

  const w = (a, b) => hash(((a % period) + period) % period, ((b % period) + period) % period, seed);

  const top = w(x0, y0) * (1 - fx) + w(x0 + 1, y0) * fx;
  const bottom = w(x0, y0 + 1) * (1 - fx) + w(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/* ------------------------------- output ------------------------------- */

function build({ base, contrast, grain, name }) {
  const data = Buffer.alloc(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      // Three octaves: broad drift, mottling, then fine tooth.
      const broad = valueNoise(x, y, 3, 11);
      const mid = valueNoise(x, y, 9, 23);
      const fine = valueNoise(x, y, 48, 37);

      const n = broad * 0.6 + mid * 0.28 + fine * 0.12 - 0.5;
      const speck = (hash(x, y, 91) - 0.5) * grain;
      const shift = n * contrast + speck;

      const i = (y * SIZE + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        data[i + c] = Math.max(0, Math.min(255, Math.round(base[c] + shift)));
      }
      data[i + 3] = 255;
    }
  }

  mkdirSync(ASSETS, { recursive: true });
  const buf = encodePng(data, SIZE, SIZE);
  writeFileSync(resolve(ASSETS, name), buf);
  console.log(`  ${name}  ${(buf.length / 1024).toFixed(1)} KB`);
}

console.log('Generating mineral ground…');

// Light: warm limestone, a couple of values either side of the ivory token.
build({ base: [240, 238, 233], contrast: 11, grain: 3.5, name: 'ground-light.png' });

// Dark: the same surface at night — near-black with just enough tooth that
// large flat areas do not band on OLED.
build({ base: [13, 14, 16], contrast: 7, grain: 2.5, name: 'ground-dark.png' });

console.log('Done.');
