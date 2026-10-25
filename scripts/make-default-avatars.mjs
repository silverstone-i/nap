/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Writes the default profile images nap ships (M0006-03-R004) as
 * small looping animated GIFs in `apps/web/public/avatars/<name>.gif`. The
 * names match `DEFAULT_PROFILE_IMAGES` in `@nap/shared`. Run with
 * `node scripts/make-default-avatars.mjs`; the output is committed, so the
 * script only needs rerunning to change the designs.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PROFILE_IMAGES } from '@nap/shared';

const SIZE = 128;
const FRAMES = 16;
const DELAY = 8; // hundredths of a second per frame
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/web/public/avatars'
);

/**
 * GIF LZW compression of colour indexes (GIF89a appendix F), with the
 * variable code width a decoder expects.
 * @param {number} minCodeSize
 * @param {Uint8Array} pixels
 * @returns {number[]}
 */
function lzw(minCodeSize, pixels) {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const out = [];
  let width = minCodeSize + 1;
  let next = end + 1;
  let table = new Map();
  let buffer = 0;
  let bits = 0;
  const write = code => {
    buffer |= code << bits;
    bits += width;
    while (bits >= 8) {
      out.push(buffer & 0xff);
      buffer >>>= 8;
      bits -= 8;
    }
  };
  write(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const pixel = pixels[i];
    const key = prefix * 256 + pixel;
    if (table.has(key)) {
      prefix = table.get(key);
      continue;
    }
    write(prefix);
    if (next < 4096) {
      if (next >= 1 << width && width < 12) width++;
      table.set(key, next++);
    } else {
      write(clear);
      table = new Map();
      width = minCodeSize + 1;
      next = end + 1;
    }
    prefix = pixel;
  }
  write(prefix);
  if (next >= 1 << width && width < 12) width++;
  write(end);
  if (bits > 0) out.push(buffer & 0xff);
  return out;
}

/**
 * Split image data into GIF sub-blocks of at most 255 bytes.
 * @param {number[]} data
 * @returns {number[]}
 */
function subBlocks(data) {
  const out = [];
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

/**
 * Encode looping frames that share one four-colour palette.
 * @param {[number, number, number][]} palette Exactly four RGB colours.
 * @param {Uint8Array[]} frames Colour indexes, `SIZE` by `SIZE`.
 * @returns {Buffer}
 */
function encode(palette, frames) {
  const u16 = n => [n & 0xff, n >> 8];
  const bytes = [
    ...Buffer.from('GIF89a'),
    ...u16(SIZE),
    ...u16(SIZE),
    0xf1, // global colour table of 4 entries
    0,
    0,
    ...palette.flat(),
    // Loop forever (NETSCAPE2.0 application extension).
    0x21,
    0xff,
    11,
    ...Buffer.from('NETSCAPE2.0'),
    3,
    1,
    0,
    0,
    0,
  ];
  for (const frame of frames)
    bytes.push(
      0x21,
      0xf9,
      4,
      0,
      ...u16(DELAY),
      0,
      0,
      0x2c,
      0,
      0,
      0,
      0,
      ...u16(SIZE),
      ...u16(SIZE),
      0,
      2,
      ...subBlocks(lzw(2, frame))
    );
  bytes.push(0x3b);
  return Buffer.from(bytes);
}

/**
 * Draw one frame: `shade(x, y, t)` returns a colour index for each pixel,
 * with `x` and `y` from -1 to 1 and `t` from 0 to 1 over the loop.
 * @param {(x: number, y: number, t: number) => number} shade
 * @param {number} t
 * @returns {Uint8Array}
 */
function frame(shade, t) {
  const pixels = new Uint8Array(SIZE * SIZE);
  for (let row = 0; row < SIZE; row++)
    for (let col = 0; col < SIZE; col++)
      pixels[row * SIZE + col] = shade(
        (col + 0.5) / (SIZE / 2) - 1,
        (row + 0.5) / (SIZE / 2) - 1,
        t
      );
  return pixels;
}

const TAU = Math.PI * 2;

/** Each design: a palette (background, two shades, highlight) and a shader. */
const DESIGNS = {
  orbit: {
    palette: [
      [21, 32, 66],
      [41, 98, 255],
      [130, 177, 255],
      [255, 255, 255],
    ],
    shade(x, y, t) {
      const a = t * TAU;
      const r = Math.hypot(x, y);
      if (Math.hypot(x - 0.55 * Math.cos(a), y - 0.55 * Math.sin(a)) < 0.18)
        return 3;
      if (r < 0.3) return 2;
      if (Math.abs(r - 0.55) < 0.03) return 1;
      return 0;
    },
  },
  pulse: {
    palette: [
      [74, 20, 40],
      [216, 27, 96],
      [244, 143, 177],
      [255, 235, 238],
    ],
    shade(x, y, t) {
      const r = Math.hypot(x, y);
      const size = 0.45 + 0.2 * Math.sin(t * TAU);
      if (r < size * 0.45) return 3;
      if (r < size) return 2;
      if (r < size + 0.15) return 1;
      return 0;
    },
  },
  wave: {
    palette: [
      [0, 60, 67],
      [0, 137, 123],
      [77, 208, 225],
      [224, 247, 250],
    ],
    shade(x, y, t) {
      const band = y + 0.25 * Math.sin(x * 3 + t * TAU);
      if (band > 0.45) return 1;
      if (band > 0) return 2;
      if (band > -0.12) return 3;
      return 0;
    },
  },
  spark: {
    palette: [
      [62, 39, 35],
      [255, 143, 0],
      [255, 202, 40],
      [255, 248, 225],
    ],
    shade(x, y, t) {
      const r = Math.hypot(x, y);
      const a = Math.atan2(y, x) + (t * TAU) / 4;
      const ray = Math.cos(a * 8);
      if (r < 0.18) return 3;
      if (r < 0.85 && ray > 0.6) return 2;
      if (r < 0.6 && ray > 0) return 1;
      return 0;
    },
  },
  bloom: {
    palette: [
      [27, 94, 32],
      [102, 187, 106],
      [200, 230, 201],
      [255, 255, 255],
    ],
    shade(x, y, t) {
      const ring = (Math.hypot(x, y) * 3 - t) % 1;
      if (Math.hypot(x, y) < 0.12) return 3;
      if (ring < 0.25) return 2;
      if (ring < 0.5) return 1;
      return 0;
    },
  },
  tide: {
    palette: [
      [49, 27, 146],
      [103, 58, 183],
      [179, 157, 219],
      [237, 231, 246],
    ],
    shade(x, y, t) {
      const stripe = ((((x + y) * 2 + t * 2) % 1) + 1) % 1;
      if (Math.hypot(x, y) < 0.3) return 3;
      if (stripe < 0.33) return 2;
      if (stripe < 0.66) return 1;
      return 0;
    },
  },
};

mkdirSync(OUT, { recursive: true });
for (const name of DEFAULT_PROFILE_IMAGES) {
  const design = DESIGNS[name];
  if (!design) throw new Error(`No design for default image ${name}`);
  const frames = Array.from({ length: FRAMES }, (_, i) =>
    frame(design.shade, i / FRAMES)
  );
  const gif = encode(design.palette, frames);
  writeFileSync(join(OUT, `${name}.gif`), gif);
  console.log(`${name}.gif ${gif.length} bytes`);
}
