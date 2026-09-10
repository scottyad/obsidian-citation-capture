import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, '../public/icons');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// CRC32 implementation for PNG chunks
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function generatePng(size) {
  const width = size;
  const height = size;

  // Raw uncompressed image data: each scanline starts with filter type 0 followed by RGBA pixels
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter byte: None

    for (let x = 0; x < width; x++) {
      // Obsidian Purple: #7C3AED (124, 58, 237)
      const radius = size / 2;
      const dx = x - radius;
      const dy = y - radius;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Book / page border inset
      const pad = size * 0.18;
      const isInnerPage = (x >= pad && x <= width - pad && y >= pad && y <= height - pad);

      if (dist <= radius) {
        if (isInnerPage && (y <= pad + size * 0.1 || x === Math.floor(width / 2) || y >= height - pad - size * 0.1)) {
          // White symbol accent
          rawData[offset++] = 255;
          rawData[offset++] = 255;
          rawData[offset++] = 255;
          rawData[offset++] = 255;
        } else {
          // Obsidian purple
          rawData[offset++] = 124;
          rawData[offset++] = 58;
          rawData[offset++] = 237;
          rawData[offset++] = 255;
        }
      } else {
        // Transparent
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      }
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: 6 (RGBA)
  ihdrData[10] = 0; // Compression: Deflate
  ihdrData[11] = 0; // Filter: Adaptive
  ihdrData[12] = 0; // Interlace: None
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT chunk
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

[16, 48, 128].forEach(size => {
  const png = generatePng(size);
  const filePath = path.join(outputDir, `icon-${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated: ${filePath} (${png.length} bytes)`);
});
