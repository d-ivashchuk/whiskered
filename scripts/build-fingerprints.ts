/**
 * Build sprite fingerprints for the hybrid matching pipeline.
 *
 * For each sprite PNG in data/sprites/png/:
 *   - Computes a 64-bit perceptual hash (pHash)
 *   - Computes a 64-bin HSV color histogram (background-masked)
 *
 * Writes a compact binary file: data/sprite-fingerprints.bin
 *
 * Binary format:
 *   Header (16 bytes):
 *     [4B] magic "MWFP"
 *     [4B] version (1)
 *     [4B] entry count
 *     [4B] reserved (0)
 *   Per entry:
 *     [8B]   pHash (uint64 LE)
 *     [128B] histogram (64 × float32 LE)
 *     [1B]   label length
 *     [NB]   label (UTF-8, no null terminator)
 *
 * Usage: npx tsx scripts/build-fingerprints.ts
 */

import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

const SPRITES_DIR = path.resolve(__dirname, "../data/sprites/png");
const OUTPUT_FILE = path.resolve(__dirname, "../data/sprite-fingerprints.bin");

const PHASH_SIZE = 32; // resize target for DCT input
const DCT_LOW = 8; // low-frequency block size (8×8 = 64 bits)

// HSV histogram bins: 16 hue × 2 saturation × 2 value = 64 bins
const H_BINS = 16;
const S_BINS = 2;
const V_BINS = 2;
const TOTAL_BINS = H_BINS * S_BINS * V_BINS; // 64

// Background mask thresholds (gray background: low saturation, high value)
const BG_SAT_MAX = 0.08;
const BG_VAL_MIN = 0.7;

/** Compute Type-II DCT on an array of length N (naive O(N^2), fine for N=32). */
function dct1d(input: Float64Array): Float64Array {
  const N = input.length;
  const output = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += input[n] * Math.cos((Math.PI * (2 * n + 1) * k) / (2 * N));
    }
    output[k] = sum;
  }
  return output;
}

/** Compute 2D DCT on a row-major matrix. */
function dct2d(matrix: Float64Array, size: number): Float64Array {
  const result = new Float64Array(size * size);

  // DCT on rows
  const rowDCT = new Float64Array(size * size);
  const rowBuf = new Float64Array(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) rowBuf[c] = matrix[r * size + c];
    const transformed = dct1d(rowBuf);
    for (let c = 0; c < size; c++) rowDCT[r * size + c] = transformed[c];
  }

  // DCT on columns
  const colBuf = new Float64Array(size);
  for (let c = 0; c < size; c++) {
    for (let r = 0; r < size; r++) colBuf[r] = rowDCT[r * size + c];
    const transformed = dct1d(colBuf);
    for (let r = 0; r < size; r++) result[r * size + c] = transformed[r];
  }

  return result;
}

/** Compute 64-bit perceptual hash from grayscale pixels. */
async function computePHash(imagePath: string): Promise<bigint> {
  const { data } = await sharp(imagePath)
    .grayscale()
    .resize(PHASH_SIZE, PHASH_SIZE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Convert to float64
  const pixels = new Float64Array(PHASH_SIZE * PHASH_SIZE);
  for (let i = 0; i < data.length; i++) {
    pixels[i] = data[i];
  }

  // 2D DCT
  const dctResult = dct2d(pixels, PHASH_SIZE);

  // Extract top-left 8×8 low-frequency coefficients (skip DC at [0,0])
  const lowFreq: number[] = [];
  for (let r = 0; r < DCT_LOW; r++) {
    for (let c = 0; c < DCT_LOW; c++) {
      if (r === 0 && c === 0) continue; // skip DC
      lowFreq.push(dctResult[r * PHASH_SIZE + c]);
    }
  }

  // Median threshold
  const sorted = [...lowFreq].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Build 64-bit hash (we have 63 values, pad with 0)
  let hash = 0n;
  for (let i = 0; i < 64; i++) {
    if (i < lowFreq.length && lowFreq[i] > median) {
      hash |= 1n << BigInt(i);
    }
  }

  return hash;
}

/** Convert RGB to HSV. Returns [h: 0-360, s: 0-1, v: 0-1]. */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rf) h = 60 * (((gf - bf) / delta) % 6);
    else if (max === gf) h = 60 * ((bf - rf) / delta + 2);
    else h = 60 * ((rf - gf) / delta + 4);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return [h, s, v];
}

/** Compute 64-bin HSV histogram with background masking. */
async function computeHistogram(imagePath: string): Promise<Float32Array> {
  const { data } = await sharp(imagePath)
    .resize(64, 64, { fit: "fill" }) // downsample for speed
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const histogram = new Float32Array(TOTAL_BINS);
  let validPixels = 0;

  for (let i = 0; i < data.length; i += 3) {
    const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);

    // Skip background pixels
    if (s < BG_SAT_MAX && v > BG_VAL_MIN) continue;

    const hBin = Math.min(Math.floor((h / 360) * H_BINS), H_BINS - 1);
    const sBin = Math.min(Math.floor(s * S_BINS), S_BINS - 1);
    const vBin = Math.min(Math.floor(v * V_BINS), V_BINS - 1);

    const bin = hBin * S_BINS * V_BINS + sBin * V_BINS + vBin;
    histogram[bin]++;
    validPixels++;
  }

  // Normalize
  if (validPixels > 0) {
    for (let i = 0; i < TOTAL_BINS; i++) {
      histogram[i] /= validPixels;
    }
  }

  return histogram;
}

async function main() {
  if (!fs.existsSync(SPRITES_DIR)) {
    console.error(`Sprites directory not found: ${SPRITES_DIR}`);
    console.error('Run "npm run crawl" first to fetch sprites.');
    process.exit(1);
  }

  const files = fs
    .readdirSync(SPRITES_DIR)
    .filter((f) => f.endsWith(".png"))
    .sort();

  console.log(`Processing ${files.length} sprites...`);

  const entries: Array<{
    label: string;
    pHash: bigint;
    histogram: Float32Array;
  }> = [];

  let processed = 0;
  for (const file of files) {
    const filePath = path.join(SPRITES_DIR, file);
    const label = file.replace(/\.png$/, "");

    try {
      const [pHash, histogram] = await Promise.all([
        computePHash(filePath),
        computeHistogram(filePath),
      ]);

      entries.push({ label, pHash, histogram });
      processed++;

      if (processed % 100 === 0) {
        console.log(`  ${processed}/${files.length}`);
      }
    } catch (err) {
      console.warn(`  Skipping ${file}: ${err}`);
    }
  }

  console.log(`Computed fingerprints for ${entries.length} sprites.`);

  // Calculate total binary size
  const HEADER_SIZE = 16;
  const PHASH_SIZE_BYTES = 8;
  const HIST_SIZE_BYTES = TOTAL_BINS * 4; // 64 × float32 = 256 bytes
  const LABEL_LEN_SIZE = 1;

  let totalSize = HEADER_SIZE;
  for (const entry of entries) {
    const labelBytes = Buffer.byteLength(entry.label, "utf-8");
    totalSize +=
      PHASH_SIZE_BYTES + HIST_SIZE_BYTES + LABEL_LEN_SIZE + labelBytes;
  }

  const buffer = Buffer.alloc(totalSize);
  let offset = 0;

  // Header
  buffer.write("MWFP", offset, 4, "ascii");
  offset += 4;
  buffer.writeUInt32LE(1, offset); // version
  offset += 4;
  buffer.writeUInt32LE(entries.length, offset); // count
  offset += 4;
  buffer.writeUInt32LE(0, offset); // reserved
  offset += 4;

  // Entries
  for (const entry of entries) {
    // pHash as uint64 LE
    buffer.writeBigUInt64LE(entry.pHash, offset);
    offset += 8;

    // Histogram as 64 × float32 LE
    for (let i = 0; i < TOTAL_BINS; i++) {
      buffer.writeFloatLE(entry.histogram[i], offset);
      offset += 4;
    }

    // Label
    const labelBuf = Buffer.from(entry.label, "utf-8");
    buffer.writeUInt8(labelBuf.length, offset);
    offset += 1;
    labelBuf.copy(buffer, offset);
    offset += labelBuf.length;
  }

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, buffer);

  console.log(
    `Wrote ${OUTPUT_FILE} (${(totalSize / 1024).toFixed(1)} KB, ${entries.length} entries)`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
