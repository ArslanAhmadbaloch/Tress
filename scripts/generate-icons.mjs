/**
 * Generates the Hair Journey app icons.
 *
 * Written against Node's built-in zlib rather than sharp or ImageMagick so
 * the icons can be regenerated on any machine with no extra tooling. Run:
 *
 *   node scripts/generate-icons.mjs
 *
 * The mark is three rounded strands of increasing height: it reads as hair
 * at large sizes and as a rising chart at small ones, which is exactly the
 * product — track your hair, see your progress.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'assets', 'images');

/* ----------------------------- PNG encoder ---------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** Encode straight RGBA bytes (width * height * 4) as a PNG buffer. */
function encodePng(rgba, width, height) {
  const stride = width * 4;
  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------- drawing ------------------------------ */

function hex(value) {
  const h = value.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

class Canvas {
  constructor(size) {
    this.size = size;
    this.data = Buffer.alloc(size * size * 4); // transparent
  }

  fill(color) {
    const [r, g, b] = hex(color);
    for (let i = 0; i < this.size * this.size; i += 1) {
      this.data[i * 4] = r;
      this.data[i * 4 + 1] = g;
      this.data[i * 4 + 2] = b;
      this.data[i * 4 + 3] = 255;
    }
  }

  /** Alpha-blend one pixel. */
  blend(x, y, [r, g, b], alpha) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    const dstA = this.data[i + 3] / 255;
    const outA = alpha + dstA * (1 - alpha);
    if (outA === 0) return;

    for (let c = 0; c < 3; c += 1) {
      const src = [r, g, b][c];
      const dst = this.data[i + c];
      this.data[i + c] = Math.round(
        (src * alpha + dst * dstA * (1 - alpha)) / outA,
      );
    }
    this.data[i + 3] = Math.round(outA * 255);
  }

  /**
   * Rounded rectangle, antialiased by supersampling each edge pixel.
   * Sampling 4x4 is plenty at icon sizes and keeps this readable.
   */
  roundedRect(x, y, w, h, radius, color) {
    const rgb = hex(color);
    const r = Math.min(radius, w / 2, h / 2);

    const inside = (px, py) => {
      if (px < x || py < y || px > x + w || py > y + h) return false;
      // Corner circles
      const cx = Math.min(Math.max(px, x + r), x + w - r);
      const cy = Math.min(Math.max(py, y + r), y + h - r);
      const dx = px - cx;
      const dy = py - cy;
      return dx * dx + dy * dy <= r * r;
    };

    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.size - 1, Math.ceil(x + w));
    const y1 = Math.min(this.size - 1, Math.ceil(y + h));

    for (let py = y0; py <= y1; py += 1) {
      for (let px = x0; px <= x1; px += 1) {
        let hits = 0;
        for (let sy = 0; sy < 4; sy += 1) {
          for (let sx = 0; sx < 4; sx += 1) {
            if (inside(px + (sx + 0.5) / 4, py + (sy + 0.5) / 4)) hits += 1;
          }
        }
        if (hits > 0) this.blend(px, py, rgb, hits / 16);
      }
    }
  }

  toPng() {
    return encodePng(this.data, this.size, this.size);
  }
}

/**
 * The mark: three strands rising left to right, centred in `size`.
 * `scale` is the fraction of the canvas the mark occupies.
 */
function drawMark(canvas, color, scale = 0.46) {
  const s = canvas.size;
  const markW = s * scale;
  const strandW = markW / 4.6;
  const gap = (markW - strandW * 3) / 2;
  const tallest = markW * 1.16;

  const left = (s - markW) / 2;
  const bottom = (s + tallest) / 2;

  const heights = [tallest * 0.52, tallest * 0.78, tallest];

  heights.forEach((h, i) => {
    const x = left + i * (strandW + gap);
    canvas.roundedRect(x, bottom - h, strandW, h, strandW / 2, color);
  });
}

/* -------------------------------- output ------------------------------ */

const JADE = '#2F8E78';
const PAPER = '#F7F6F3';

function write(name, buffer) {
  mkdirSync(ASSETS, { recursive: true });
  const path = resolve(ASSETS, name);
  writeFileSync(path, buffer);
  console.log(`  ${name}  ${(buffer.length / 1024).toFixed(1)} KB`);
}

console.log('Generating Hair Journey icons…');

// iOS / general app icon: full-bleed, the OS applies the mask.
const icon = new Canvas(1024);
icon.fill(JADE);
drawMark(icon, PAPER);
write('icon.png', icon.toPng());

// Android adaptive foreground: transparent, mark inset for the safe zone.
const fg = new Canvas(1024);
drawMark(fg, PAPER, 0.34);
write('android-icon-foreground.png', fg.toPng());

const bg = new Canvas(1024);
bg.fill(JADE);
write('android-icon-background.png', bg.toPng());

// Monochrome (themed icons): the silhouette only, white on transparent.
const mono = new Canvas(1024);
drawMark(mono, '#FFFFFF', 0.34);
write('android-icon-monochrome.png', mono.toPng());

// Splash mark sits on the splash background colour, so it is jade on clear.
const splash = new Canvas(512);
drawMark(splash, JADE, 0.62);
write('splash-icon.png', splash.toPng());

const favicon = new Canvas(64);
favicon.fill(JADE);
drawMark(favicon, PAPER, 0.5);
write('favicon.png', favicon.toPng());

console.log('Done.');
