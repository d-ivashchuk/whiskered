/**
 * Perceptual hash (pHash) computation for Android.
 *
 * Ported from scripts/build-fingerprints.ts — same DCT-based 64-bit hash
 * algorithm so results are compatible with the pre-computed fingerprints.
 */
import type { PixelData } from "./image-utils";

const PHASH_SIZE = 32;
const DCT_LOW = 8;

/** Type-II DCT on an array of length N (naive O(N^2), fine for N=32). */
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

/** 2D DCT on a row-major matrix. */
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

/**
 * Compute a 64-bit perceptual hash from RGBA pixel data.
 *
 * The input should be 32x32 pixels (already resized).
 * Returns the hash as two 32-bit numbers [hi, lo] since JS doesn't
 * have native uint64 support in React Native (no BigInt in Hermes).
 */
export function computePHash(pixels: PixelData): [number, number] {
  const { width, height, data } = pixels;

  // Convert to grayscale float64
  const gray = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // 2D DCT
  const dctResult = dct2d(gray, PHASH_SIZE);

  // Extract top-left 8x8 low-frequency coefficients (skip DC at [0,0])
  const lowFreq: number[] = [];
  for (let r = 0; r < DCT_LOW; r++) {
    for (let c = 0; c < DCT_LOW; c++) {
      if (r === 0 && c === 0) continue;
      lowFreq.push(dctResult[r * PHASH_SIZE + c]);
    }
  }

  // Median threshold
  const sorted = [...lowFreq].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Build 64-bit hash as [hi32, lo32]
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < 64; i++) {
    if (i < lowFreq.length && lowFreq[i] > median) {
      if (i < 32) {
        lo |= 1 << i;
      } else {
        hi |= 1 << (i - 32);
      }
    }
  }

  return [hi, lo];
}

/**
 * Hamming distance between two 64-bit hashes (represented as [hi, lo] pairs).
 * Returns number of differing bits (0 = identical, 64 = maximally different).
 */
export function hammingDistance(
  a: [number, number],
  b: [number, number]
): number {
  return popcount(a[0] ^ b[0]) + popcount(a[1] ^ b[1]);
}

/** Count set bits in a 32-bit integer. */
function popcount(n: number): number {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

/**
 * Convert a uint64 LE from a DataView into [hi, lo] pair.
 * Used when parsing sprite-fingerprints.bin.
 */
export function readUint64LE(
  view: DataView,
  offset: number
): [number, number] {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  return [hi, lo];
}
