import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Draws the app icon: the A+ plus, in studio green on the app's own near-black.
 *
 * Written by hand rather than pulled from a design file because there is no
 * logo asset in the repository, and a Windows installer with the default
 * Electron icon looks like somebody else's software. Two rectangles and a
 * rounded square is all the mark actually is.
 *
 * Output is a 256×256 PNG inside an .ico, which is the modern container
 * Windows and electron-builder both accept.
 */

const BG = [0x13, 0x13, 0x17]; // --bg-app, dark theme
const ACCENT = [0x3b, 0xe3, 0x89]; // --accent, studio green

/** Drawn as proportions of the size, so the mark is the same mark at every size. */
function pixels(SIZE) {
  const RADIUS = SIZE * 0.219;
  const BAR = SIZE * 0.133; // thickness of the plus
  const REACH = SIZE * 0.297; // half-length of each arm
  const data = Buffer.alloc(SIZE * SIZE * 4);
  const centre = (SIZE - 1) / 2;

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;

      // Rounded square: outside the corner arcs is transparent.
      const cx = Math.max(RADIUS - x, x - (SIZE - 1 - RADIUS), 0);
      const cy = Math.max(RADIUS - y, y - (SIZE - 1 - RADIUS), 0);
      if (Math.hypot(cx, cy) > RADIUS) {
        data.writeUInt32BE(0, i);
        continue;
      }

      const dx = Math.abs(x - centre);
      const dy = Math.abs(y - centre);
      const onPlus = (dx <= BAR / 2 && dy <= REACH) || (dy <= BAR / 2 && dx <= REACH);
      const colour = onPlus ? ACCENT : BG;

      data[i] = colour[0];
      data[i + 1] = colour[1];
      data[i + 2] = colour[2];
      data[i + 3] = 255;
    }
  }
  return data;
}

/* --------------------------------------------------------------- PNG ---- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function png(rgba, SIZE) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA

  // Every scanline carries its filter byte; 0 means "none".
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (SIZE * 4 + 1)] = 0;
    rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------- ICO ---- */

function ico(pngBuffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 256 is written as 0
  entry[1] = 0; // height 256, likewise
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32BE(0, 8);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // offset of the image data

  return Buffer.concat([header, entry, pngBuffer]);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'aplusdesktop', 'build');
// 256 is the largest an .ico entry can be; the extension wants 512.
const small = png(pixels(256), 256);
const large = png(pixels(512), 512);

await mkdir(out, { recursive: true });
await writeFile(join(out, 'icon.png'), small);
await writeFile(join(out, 'icon.ico'), ico(small));
await writeFile(join(out, 'icon-512.png'), large);
console.log(`wrote ${join('aplusdesktop', 'build')}/icon.ico (256×256) and icon-512.png`);
