#!/usr/bin/env node
// Generates icon16.png, icon48.png, icon128.png in assets/
// whennotif• CI — Deep Black bg (#0A0A0F), Threat Red (#E63946), Alert White (#F0F0F0)
// No npm dependencies — uses only Node.js built-ins (zlib).

const zlib = require("zlib");
const fs   = require("fs");
const path = require("path");

// ── CRC32 (required by PNG spec) ──────────────────────────────────────────────
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG chunk builder ─────────────────────────────────────────────────────────
function pngChunk(type, data) {
    const typeBytes = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crcBuf = Buffer.concat([typeBytes, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf));
    return Buffer.concat([len, typeBytes, data, crc]);
}

// ── PNG encoder — RGBA, no interlace ─────────────────────────────────────────
function encodePNG(size, pixels) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(size, 0);
    ihdrData.writeUInt32BE(size, 4);
    ihdrData[8] = 8; // bit depth
    ihdrData[9] = 6; // colour type: RGBA

    // Add filter byte (0 = None) before each scanline
    const scanlines = Buffer.alloc(size * (1 + size * 4));
    for (let y = 0; y < size; y++) {
        const row = y * (1 + size * 4);
        scanlines[row] = 0;
        for (let x = 0; x < size; x++) {
            const src = (y * size + x) * 4;
            const dst = row + 1 + x * 4;
            scanlines[dst]     = pixels[src];
            scanlines[dst + 1] = pixels[src + 1];
            scanlines[dst + 2] = pixels[src + 2];
            scanlines[dst + 3] = pixels[src + 3];
        }
    }

    return Buffer.concat([
        sig,
        pngChunk("IHDR", ihdrData),
        pngChunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
        pngChunk("IEND", Buffer.alloc(0)),
    ]);
}

// ── Pixel drawing helpers ─────────────────────────────────────────────────────
function makeCanvas(size, r = 0x0A, g = 0x0A, b = 0x0F) {
    const px = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
        px[i * 4]     = r;
        px[i * 4 + 1] = g;
        px[i * 4 + 2] = b;
        px[i * 4 + 3] = 255;
    }
    return px;
}

function setPixel(px, size, x, y, r, g, b, a = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
}

function fillRect(px, size, x1, y1, x2, y2, r, g, b, a = 255) {
    for (let y = Math.max(0, y1); y <= Math.min(size - 1, y2); y++)
        for (let x = Math.max(0, x1); x <= Math.min(size - 1, x2); x++)
            setPixel(px, size, x, y, r, g, b, a);
}

function strokeRect(px, size, x1, y1, x2, y2, thick, r, g, b) {
    fillRect(px, size, x1,         y1,         x2,         y1 + thick - 1, r, g, b);
    fillRect(px, size, x1,         y2 - thick + 1, x2,     y2,             r, g, b);
    fillRect(px, size, x1,         y1,         x1 + thick - 1, y2,         r, g, b);
    fillRect(px, size, x2 - thick + 1, y1,     x2,         y2,             r, g, b);
}

// Draw a simple shield path: rounded-top rectangle + pointed bottom
function drawShield(px, size, margin, thick) {
    const RED = [0xE6, 0x39, 0x46];
    const W = size - margin * 2;
    const H = size - margin * 2;
    const x1 = margin, y1 = margin;
    const x2 = x1 + W - 1, y2 = y1 + H - 1;

    // Top & sides
    fillRect(px, size, x1, y1, x2, y1 + thick - 1, ...RED);
    fillRect(px, size, x1, y1, x1 + thick - 1, y2 - Math.floor(H * 0.3), ...RED);
    fillRect(px, size, x2 - thick + 1, y1, x2, y2 - Math.floor(H * 0.3), ...RED);

    // Taper to point at bottom
    const taperStart = y2 - Math.floor(H * 0.35);
    const taperEnd   = y2;
    const steps = taperEnd - taperStart;
    for (let i = 0; i <= steps; i++) {
        const y = taperStart + i;
        const inset = Math.round((i / steps) * (W / 2 - thick));
        fillRect(px, size, x1 + inset, y, x1 + inset + thick - 1, y, ...RED);
        fillRect(px, size, x2 - inset - thick + 1, y, x2 - inset, y, ...RED);
    }
}

// Draw "!" — bar + dot, centered
function drawExclaim(px, size, cx, barTop, barBot, dotY, dotH, w) {
    const W = [0xF0, 0xF0, 0xF0];
    fillRect(px, size, cx - w, barTop, cx + w, barBot, ...W);
    fillRect(px, size, cx - w, dotY,   cx + w, dotY + dotH - 1, ...W);
}

// ── Icon designs ──────────────────────────────────────────────────────────────
function icon16() {
    const S = 16;
    const px = makeCanvas(S);
    // Red border 1px
    strokeRect(px, S, 0, 0, S - 1, S - 1, 1, 0xE6, 0x39, 0x46);
    // "!" — bar 3px tall (y 3–8), gap y9, dot y 10–11, 2px wide centered
    const cx = 7;
    fillRect(px, S, cx - 1, 3, cx,  9, 0xF0, 0xF0, 0xF0); // bar
    fillRect(px, S, cx - 1, 11, cx, 12, 0xF0, 0xF0, 0xF0); // dot
    return encodePNG(S, px);
}

function icon48() {
    const S = 48;
    const px = makeCanvas(S);
    drawShield(px, S, 4, 3);
    // "!" centered inside shield: bar y9–30, gap, dot y33–37, width 3px each side
    drawExclaim(px, S, 23, 9, 29, 33, 5, 3);
    return encodePNG(S, px);
}

function icon128() {
    const S = 128;
    const px = makeCanvas(S);
    drawShield(px, S, 8, 7);
    // "!" bar y22–76, gap, dot y83–97, width 7px each side
    drawExclaim(px, S, 63, 22, 76, 84, 14, 7);
    return encodePNG(S, px);
}

// ── Write files ───────────────────────────────────────────────────────────────
const ASSETS = path.join(__dirname, "assets");
fs.mkdirSync(ASSETS, { recursive: true });

const icons = [
    { file: "icon16.png",  data: icon16()  },
    { file: "icon48.png",  data: icon48()  },
    { file: "icon128.png", data: icon128() },
];

for (const { file, data } of icons) {
    const dest = path.join(ASSETS, file);
    fs.writeFileSync(dest, data);
    console.log(`✓ assets/${file}  (${data.length} bytes)`);
}

console.log("\nDone — run 'node build.js' to rebuild dist with new icons.");
