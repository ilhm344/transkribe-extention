/**
 * Generates icons/icon16.png, icon48.png, icon128.png
 * Blue background (#1e40af) with white "T" shape.
 * Pure Node.js — no external dependencies.
 */

import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'icons');

// ─── CRC32 ────────────────────────────────────────────────────────────────────

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ─── PNG chunk builder ────────────────────────────────────────────────────────

function chunk(type, data) {
  const len  = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t    = Buffer.from(type, 'ascii');
  const crc  = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

// ─── Icon pixel renderer ──────────────────────────────────────────────────────

const BG = [30, 64, 175];   // blue-700
const FG = [255, 255, 255]; // white

function pixel(x, y, size) {
  const nx = x / size;
  const ny = y / size;

  const pad     = 0.14;          // side padding
  const barTop  = 0.14;          // top of horizontal bar
  const barBot  = barTop + 0.20; // bottom of horizontal bar
  const stemW   = 0.18;          // stem width (fraction)
  const stemL   = (1 - stemW) / 2;
  const stemR   = stemL + stemW;
  const stemBot = 0.86;

  const inBar  = ny >= barTop && ny < barBot && nx >= pad && nx < 1 - pad;
  const inStem = ny >= barBot && ny < stemBot && nx >= stemL && nx < stemR;

  return (inBar || inStem) ? FG : BG;
}

// ─── PNG builder ──────────────────────────────────────────────────────────────

function buildPng(size) {
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB color type

  // Raw scanlines: 1 filter byte + size * 3 RGB bytes per row
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size);
      const off = y * (1 + size * 3) + 1 + x * 3;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
    }
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Generate ─────────────────────────────────────────────────────────────────

for (const size of [16, 48, 128]) {
  const buf = buildPng(size);
  writeFileSync(join(iconsDir, `icon${size}.png`), buf);
  console.log(`icon${size}.png  ${buf.length} bytes`);
}
