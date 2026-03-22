#!/usr/bin/env node
/**
 * Generates PNG icons and screenshots for the PWA manifest.
 * No external dependencies — uses only Node.js built-ins (zlib, fs, path).
 *
 * Output files:
 *   client/public/icons/icon-192.png
 *   client/public/icons/icon-512.png
 *   client/public/screenshots/desktop.png  (1280x720)
 *   client/public/screenshots/mobile.png   (750x1334)
 */

'use strict'

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// ── Helpers ────────────────────────────────────────────────────────────────

/** Write a 4-byte big-endian uint32 into a Buffer at offset. */
function writeUint32BE(buf, offset, value) {
  buf[offset] = (value >>> 24) & 0xff
  buf[offset + 1] = (value >>> 16) & 0xff
  buf[offset + 2] = (value >>> 8) & 0xff
  buf[offset + 3] = value & 0xff
}

/** CRC-32 table (PNG uses it for chunk integrity). */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf, start, length) {
  let c = 0xffffffff
  for (let i = start; i < start + length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Build a single PNG chunk: length(4) + type(4) + data + crc(4). */
function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = data ? data.length : 0
  const chunk = Buffer.allocUnsafe(12 + len)
  writeUint32BE(chunk, 0, len)
  typeBytes.copy(chunk, 4)
  if (data) data.copy(chunk, 8)
  const crc = crc32(chunk, 4, 4 + len)
  writeUint32BE(chunk, 8 + len, crc)
  return chunk
}

/**
 * Build a PNG from an RGBA pixel buffer.
 * @param {number}  width
 * @param {number}  height
 * @param {Buffer}  rgba  — flat array of width*height*4 bytes (R G B A)
 * @returns {Buffer}
 */
function buildPNG(width, height, rgba) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR
  const ihdr = Buffer.allocUnsafe(13)
  writeUint32BE(ihdr, 0, width)
  writeUint32BE(ihdr, 4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: RGB (we will drop alpha for simplicity — PNGs without alpha are smaller and widely supported for icons; masked edges use background)
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // Build raw scanlines (filter byte 0x00 = None per row)
  const rowLen = width * 3
  const rawSize = height * (1 + rowLen)
  const raw = Buffer.allocUnsafe(rawSize)
  for (let y = 0; y < height; y++) {
    raw[y * (1 + rowLen)] = 0 // filter byte
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      const dst = y * (1 + rowLen) + 1 + x * 3
      raw[dst] = rgba[src] // R
      raw[dst + 1] = rgba[src + 1] // G
      raw[dst + 2] = rgba[src + 2] // B
      // alpha ignored — background is opaque anyway
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 })

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', null),
  ])
}

// ── Drawing primitives ─────────────────────────────────────────────────────

/**
 * Paint a flat RGBA buffer with a solid color.
 */
function fill(pixels, width, height, r, g, b, a = 255) {
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = r
    pixels[i * 4 + 1] = g
    pixels[i * 4 + 2] = b
    pixels[i * 4 + 3] = a
  }
}

/**
 * Set a single pixel, respecting canvas bounds.
 */
function setPixel(pixels, width, height, x, y, r, g, b) {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || x >= width || y < 0 || y >= height) return
  const i = (y * width + x) * 4
  pixels[i] = r
  pixels[i + 1] = g
  pixels[i + 2] = b
  pixels[i + 3] = 255
}

/**
 * Anti-aliased filled circle.
 */
function fillCircle(pixels, width, height, cx, cy, radius, r, g, b) {
  const r2 = radius * radius
  const minX = Math.max(0, Math.floor(cx - radius - 1))
  const maxX = Math.min(width - 1, Math.ceil(cx + radius + 1))
  const minY = Math.max(0, Math.floor(cy - radius - 1))
  const maxY = Math.min(height - 1, Math.ceil(cy + radius + 1))
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const dx = px - cx
      const dy = py - cy
      const d2 = dx * dx + dy * dy
      if (d2 <= r2) setPixel(pixels, width, height, px, py, r, g, b)
    }
  }
}

/**
 * Filled rectangle.
 */
function fillRect(pixels, width, height, x, y, w, h, r, g, b) {
  for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
      setPixel(pixels, width, height, px, py, r, g, b)
    }
  }
}

/**
 * Rounded rectangle — drawn as filled rect + corner circles.
 * radius is in pixels.
 */
function fillRoundRect(pixels, w, h, x, y, rw, rh, rx, r, g, b) {
  // Center fill
  fillRect(pixels, w, h, x + rx, y, rw - rx * 2, rh, r, g, b)
  fillRect(pixels, w, h, x, y + rx, rw, rh - rx * 2, r, g, b)
  // Corner circles
  fillCircle(pixels, w, h, x + rx, y + rx, rx, r, g, b)
  fillCircle(pixels, w, h, x + rw - rx, y + rx, rx, r, g, b)
  fillCircle(pixels, w, h, x + rx, y + rh - rx, rx, r, g, b)
  fillCircle(pixels, w, h, x + rw - rx, y + rh - rx, rx, r, g, b)
}

// ── Text / glyph rendering ─────────────────────────────────────────────────
// We render text using a minimal 8x13 bitmap font for ASCII.
// The cow icon is rendered as a vector shape (no emoji, emoji are not
// renderable without a system font rasteriser).

/**
 * A minimal 5x7 pixel font for uppercase ASCII (A-Z), digits (0-9), space,
 * and a small set of punctuation. Each character is 5 columns × 7 rows,
 * packed as 7 bytes where each byte is a 5-bit row bitmask (MSB = left col).
 *
 * We only need: M Y H E R D (for "MyHerder") and digits/punctuation for screenshots.
 */
const FONT5X7 = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10011, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  a: [0b00000, 0b00000, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111],
  b: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b11110],
  c: [0b00000, 0b00000, 0b01110, 0b10000, 0b10000, 0b10001, 0b01110],
  d: [0b00001, 0b00001, 0b01111, 0b10001, 0b10001, 0b10001, 0b01111],
  e: [0b00000, 0b00000, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110],
  f: [0b00110, 0b01000, 0b11100, 0b01000, 0b01000, 0b01000, 0b01000],
  g: [0b00000, 0b01111, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
  h: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001],
  i: [0b00100, 0b00000, 0b01100, 0b00100, 0b00100, 0b00100, 0b01110],
  j: [0b00010, 0b00000, 0b00110, 0b00010, 0b00010, 0b10010, 0b01100],
  k: [0b10000, 0b10000, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010],
  l: [0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  m: [0b00000, 0b00000, 0b11010, 0b10101, 0b10101, 0b10001, 0b10001],
  n: [0b00000, 0b00000, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001],
  o: [0b00000, 0b00000, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110],
  p: [0b00000, 0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000],
  q: [0b00000, 0b01111, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001],
  r: [0b00000, 0b00000, 0b10110, 0b11001, 0b10000, 0b10000, 0b10000],
  s: [0b00000, 0b00000, 0b01110, 0b10000, 0b01110, 0b00001, 0b11110],
  t: [0b01000, 0b01000, 0b11100, 0b01000, 0b01000, 0b01001, 0b00110],
  u: [0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b10011, 0b01101],
  v: [0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  w: [0b00000, 0b00000, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  x: [0b00000, 0b00000, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001],
  y: [0b00000, 0b10001, 0b10001, 0b01111, 0b00001, 0b10001, 0b01110],
  z: [0b00000, 0b00000, 0b11111, 0b00010, 0b00100, 0b01000, 0b11111],
  '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100],
}

/**
 * Draw a string at (startX, startY) with a given pixel scale and color.
 * Each glyph is 5 cols × 7 rows + 1 col spacing.
 */
function drawText(pixels, canvasW, canvasH, text, startX, startY, scale, r, g, b) {
  const GLYPH_W = 5
  const GLYPH_H = 7
  let cx = startX
  for (const ch of text) {
    const glyph = FONT5X7[ch] || FONT5X7[' ']
    for (let row = 0; row < GLYPH_H; row++) {
      const bits = glyph[row]
      for (let col = 0; col < GLYPH_W; col++) {
        if (bits & (1 << (GLYPH_W - 1 - col))) {
          fillRect(
            pixels,
            canvasW,
            canvasH,
            cx + col * scale,
            startY + row * scale,
            scale,
            scale,
            r,
            g,
            b
          )
        }
      }
    }
    cx += (GLYPH_W + 1) * scale
  }
}

/** Return total pixel width of a string at given scale. */
function textWidth(text, scale) {
  return text.length * (5 + 1) * scale - scale // last char has no trailing space
}

// ── Cow vector shape ───────────────────────────────────────────────────────
/**
 * Draw a simple cow silhouette centred at (cx, cy) with given size.
 * Drawn as geometric shapes (no font needed).
 *
 *  Layout (relative units, actual pixels = unit * size/100):
 *    body: ellipse 60w × 35h at centre
 *    head: circle r=18 at (+35, -5) from body centre
 *    legs: 4 rectangles below body
 *    ear:  small circle at head top-right
 *    tail: small arc approximated with a circle at left
 *    spots: 2 dark ellipses on body
 *    udder: small ellipse below body
 */
function drawCow(pixels, canvasW, canvasH, cx, cy, size, fr, fg, fb) {
  const s = size / 100

  // Body (filled ellipse approximated as scaled fillCircle)
  // We use fillCircle with x-scale trick via rect masking
  const bw = Math.round(60 * s)
  const bh = Math.round(35 * s)
  // Draw body as a series of horizontal spans
  for (let dy = -bh; dy <= bh; dy++) {
    const ratio = dy / bh
    const hw = Math.round(bw * Math.sqrt(1 - ratio * ratio))
    fillRect(pixels, canvasW, canvasH, cx - hw, cy + dy, hw * 2, 1, fr, fg, fb)
  }

  // Legs (4 rectangles)
  const legW = Math.max(2, Math.round(8 * s))
  const legH = Math.round(30 * s)
  const legY = cy + bh - Math.round(4 * s)
  const legOffsets = [
    -Math.round(30 * s),
    -Math.round(10 * s),
    Math.round(10 * s),
    Math.round(28 * s),
  ]
  for (const lx of legOffsets) {
    fillRect(pixels, canvasW, canvasH, cx + lx, legY, legW, legH, fr, fg, fb)
  }

  // Head
  const hcx = cx + Math.round(37 * s)
  const hcy = cy - Math.round(5 * s)
  const hr = Math.round(18 * s)
  fillCircle(pixels, canvasW, canvasH, hcx, hcy, hr, fr, fg, fb)

  // Snout
  const snoutW = Math.round(14 * s)
  const snoutH = Math.round(9 * s)
  const snoutX = hcx + Math.round(8 * s)
  const snoutY = hcy + Math.round(4 * s)
  for (let dy = -snoutH; dy <= snoutH; dy++) {
    const ratio = dy / snoutH
    const hw = Math.round(snoutW * Math.sqrt(1 - ratio * ratio))
    fillRect(
      pixels,
      canvasW,
      canvasH,
      snoutX - hw,
      snoutY + dy,
      hw * 2,
      1,
      Math.min(255, fr + 40),
      Math.min(255, fg + 40),
      Math.min(255, fb + 40)
    )
  }

  // Ear
  fillCircle(
    pixels,
    canvasW,
    canvasH,
    hcx + Math.round(8 * s),
    hcy - Math.round(15 * s),
    Math.round(7 * s),
    fr,
    fg,
    fb
  )

  // Horns (two small arcs)
  fillCircle(
    pixels,
    canvasW,
    canvasH,
    hcx - Math.round(4 * s),
    hcy - Math.round(16 * s),
    Math.round(5 * s),
    fr,
    fg,
    fb
  )

  // Udder
  const udderY = cy + bh - Math.round(2 * s)
  for (let dy = 0; dy <= Math.round(12 * s); dy++) {
    const ratio = dy / Math.round(12 * s)
    const hw = Math.round(20 * s * Math.sqrt(1 - ratio * ratio))
    fillRect(
      pixels,
      canvasW,
      canvasH,
      cx - Math.round(10 * s) - hw / 2,
      udderY + dy,
      hw,
      1,
      Math.min(255, fr + 30),
      Math.min(255, fg + 20),
      Math.min(255, fb + 20)
    )
  }

  // Spot 1
  const sp1cx = cx - Math.round(10 * s)
  const sp1cy = cy - Math.round(5 * s)
  for (let dy = -Math.round(8 * s); dy <= Math.round(8 * s); dy++) {
    const ratio = dy / Math.round(8 * s)
    const hw = Math.round(14 * s * Math.sqrt(1 - ratio * ratio))
    const shade = Math.max(0, fr - 60)
    fillRect(pixels, canvasW, canvasH, sp1cx - hw, sp1cy + dy, hw * 2, 1, shade, shade, shade)
  }

  // Spot 2
  const sp2cx = cx + Math.round(12 * s)
  const sp2cy = cy + Math.round(8 * s)
  for (let dy = -Math.round(6 * s); dy <= Math.round(6 * s); dy++) {
    const ratio = dy / Math.round(6 * s)
    const hw = Math.round(10 * s * Math.sqrt(1 - ratio * ratio))
    const shade = Math.max(0, fr - 60)
    fillRect(pixels, canvasW, canvasH, sp2cx - hw, sp2cy + dy, hw * 2, 1, shade, shade, shade)
  }
}

// ── Icon generation ────────────────────────────────────────────────────────

/**
 * Generate the icon PNG: green rounded-rect background + cow silhouette.
 * @param {number} size  — width and height in pixels
 */
function generateIcon(size) {
  const pixels = Buffer.alloc(size * size * 4, 0)
  const BG = [0x2d, 0x6a, 0x4f] // #2D6A4F
  const COW = [0xf4, 0xf1, 0xec] // #F4F1EC

  fill(pixels, size, size, ...BG)

  // Rounded rect mask: re-fill corners with a slightly darker shade (or just leave as BG)
  // Actually: fill entire canvas with bg, then clip corners with a very dark color to simulate
  // rounded corners. We do this by painting the "outside" corner areas black, but that looks bad.
  // Better: just use a rounded rect — paint bg, then corners become transparent (but PNG is RGB
  // here). We paint outside area white (to look like browser bg), then draw rounded rect in bg.

  // Fill canvas white (simulates page background)
  fill(pixels, size, size, 0xff, 0xff, 0xff)

  // Draw green rounded rect
  const radius = Math.round(size * 0.167) // ~32/192 ratio
  fillRoundRect(pixels, size, size, 0, 0, size, size, radius, ...BG)

  // Draw cow centered
  const cowSize = Math.round(size * 0.7)
  drawCow(pixels, size, size, Math.round(size * 0.48), Math.round(size * 0.52), cowSize, ...COW)

  return buildPNG(size, size, pixels)
}

// ── Screenshot generation ──────────────────────────────────────────────────

/**
 * Generate a simple branded screenshot PNG.
 * @param {number}  w           — canvas width
 * @param {number}  h           — canvas height
 * @param {'wide'|'narrow'} form
 */
function generateScreenshot(w, h, form) {
  const pixels = Buffer.alloc(w * h * 4, 0)
  const BG = [0xf4, 0xf1, 0xec] // #F4F1EC
  const GRN = [0x2d, 0x6a, 0x4f] // #2D6A4F
  const WHT = [0xff, 0xff, 0xff]
  const TXT = [0x1a, 0x1a, 0x1a] // near-black

  // Background
  fill(pixels, w, h, ...BG)

  if (form === 'wide') {
    // ── Desktop layout ───────────────────────────────────────────────────
    // Top nav bar
    fillRect(pixels, w, h, 0, 0, w, 64, ...GRN)

    // App name in nav bar (scale 5 = 25x35px per glyph area)
    const titleScale = 4
    const title = 'MyHerder'
    const titleW = textWidth(title, titleScale)
    drawText(pixels, w, h, title, 32, Math.round((64 - 7 * titleScale) / 2), titleScale, ...WHT)

    // Tagline under nav bar
    const tagScale = 2
    const tag = 'Dairy Farm Management System'
    drawText(pixels, w, h, tag, 32, 90, tagScale, ...TXT)

    // Three dashboard "cards"
    const cardW = Math.round(w / 3) - 48
    const cardH = 200
    const cardY = 150
    const cardGap = 32
    const cardColors = [GRN, [0x1b, 0x6c, 0xa8], [0xe0, 0x7c, 0x24]]
    const cardLabels = ['Herd', 'Milk', 'Health']
    for (let i = 0; i < 3; i++) {
      const cardX = 32 + i * (cardW + cardGap)
      // Card bg
      fillRoundRect(pixels, w, h, cardX, cardY, cardW, cardH, 12, ...WHT)
      // Colored top strip
      fillRoundRect(pixels, w, h, cardX, cardY, cardW, 50, 12, ...cardColors[i])
      // Repair bottom of strip (remove rounded corners at bottom)
      fillRect(pixels, w, h, cardX, cardY + 38, cardW, 12, ...cardColors[i])
      // Label
      const lscale = 3
      const lw = textWidth(cardLabels[i], lscale)
      drawText(
        pixels,
        w,
        h,
        cardLabels[i],
        cardX + Math.round((cardW - lw) / 2),
        cardY + Math.round((50 - 7 * lscale) / 2),
        lscale,
        ...WHT
      )
      // Simulated value lines
      fillRect(pixels, w, h, cardX + 16, cardY + 70, cardW - 32, 12, ...BG)
      fillRect(pixels, w, h, cardX + 16, cardY + 96, Math.round((cardW - 32) * 0.6), 12, ...BG)
    }

    // Cow illustration on the right side
    drawCow(
      pixels,
      w,
      h,
      Math.round(w * 0.85),
      Math.round(h * 0.6),
      Math.round(Math.min(w, h) * 0.28),
      ...GRN
    )
  } else {
    // ── Mobile layout ────────────────────────────────────────────────────
    // Status bar area
    fillRect(pixels, w, h, 0, 0, w, 44, ...GRN)

    // Main header
    fillRect(pixels, w, h, 0, 44, w, 80, ...GRN)

    // App name
    const titleScale = 5
    const title = 'MyHerder'
    const titleW = textWidth(title, titleScale)
    drawText(
      pixels,
      w,
      h,
      title,
      Math.round((w - titleW) / 2),
      Math.round(44 + (80 - 7 * titleScale) / 2),
      titleScale,
      ...WHT
    )

    // Cow illustration
    const cowY = 270
    drawCow(pixels, w, h, Math.round(w / 2), cowY, Math.round(w * 0.55), ...GRN)

    // Tagline
    const tagScale = 2
    const line1 = 'Dairy Farm'
    const line2 = 'Management System'
    drawText(
      pixels,
      w,
      h,
      line1,
      Math.round((w - textWidth(line1, tagScale)) / 2),
      cowY + Math.round(w * 0.55 * 0.55) + 20,
      tagScale,
      ...TXT
    )
    drawText(
      pixels,
      w,
      h,
      line2,
      Math.round((w - textWidth(line2, tagScale)) / 2),
      cowY + Math.round(w * 0.55 * 0.55) + 40,
      tagScale,
      ...TXT
    )

    // Bottom navigation strip
    const navY = h - 80
    fillRect(pixels, w, h, 0, navY, w, 80, ...WHT)
    // Separator line
    fillRect(pixels, w, h, 0, navY, w, 2, BG[0] - 20, BG[1] - 20, BG[2] - 20)
    // Nav dots (4 items)
    const navItems = 4
    for (let i = 0; i < navItems; i++) {
      const nx = Math.round((i + 0.5) * (w / navItems))
      const ny = navY + 30
      fillCircle(pixels, w, h, nx, ny, 14, ...BG)
      fillCircle(pixels, w, h, nx, ny, i === 0 ? 14 : 10, i === 0 ? GRN : BG)
    }

    // Dashboard card
    const cardX = 24
    const cardY = 150
    const cardW2 = w - 48
    const cardH2 = 80
    fillRoundRect(pixels, w, h, cardX, cardY, cardW2, cardH2, 12, ...WHT)
    fillRoundRect(pixels, w, h, cardX, cardY, cardW2, 32, 12, ...GRN)
    fillRect(pixels, w, h, cardX, cardY + 20, cardW2, 12, ...GRN)
    const cs = 2
    drawText(pixels, w, h, 'Herd Overview', cardX + 12, cardY + 10, cs, ...WHT)
  }

  return buildPNG(w, h, pixels)
}

// ── Main ───────────────────────────────────────────────────────────────────

const PROJECT = path.resolve(__dirname, '..')
const ICONS_DIR = path.join(PROJECT, 'client', 'public', 'icons')
const SCREENSHOTS_DIR = path.join(PROJECT, 'client', 'public', 'screenshots')

fs.mkdirSync(ICONS_DIR, { recursive: true })
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

console.log('Generating icon-192.png …')
fs.writeFileSync(path.join(ICONS_DIR, 'icon-192.png'), generateIcon(192))

console.log('Generating icon-512.png …')
fs.writeFileSync(path.join(ICONS_DIR, 'icon-512.png'), generateIcon(512))

console.log('Generating screenshots/desktop.png (1280×720) …')
fs.writeFileSync(path.join(SCREENSHOTS_DIR, 'desktop.png'), generateScreenshot(1280, 720, 'wide'))

console.log('Generating screenshots/mobile.png (750×1334) …')
fs.writeFileSync(path.join(SCREENSHOTS_DIR, 'mobile.png'), generateScreenshot(750, 1334, 'narrow'))

console.log('Done. Files written:')
console.log('  client/public/icons/icon-192.png')
console.log('  client/public/icons/icon-512.png')
console.log('  client/public/screenshots/desktop.png')
console.log('  client/public/screenshots/mobile.png')
