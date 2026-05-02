/**
 * HSV color histogram computation for Android.
 *
 * Ported from scripts/build-fingerprints.ts — same 64-bin HSV histogram
 * with background masking, so results match the pre-computed fingerprints.
 */
import type { PixelData } from "./image-utils";

// HSV histogram bins: 16 hue × 2 saturation × 2 value = 64 bins
const H_BINS = 16;
const S_BINS = 2;
const V_BINS = 2;
const TOTAL_BINS = H_BINS * S_BINS * V_BINS; // 64

// Background mask thresholds (gray background: low saturation, high value)
const BG_SAT_MAX = 0.08;
const BG_VAL_MIN = 0.7;

/** Convert RGB [0-255] to HSV. Returns [h: 0-360, s: 0-1, v: 0-1]. */
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

/**
 * Compute a 64-bin HSV histogram from RGBA pixel data.
 * Masks out gray background pixels (low saturation, high value).
 * The input should be 64x64 pixels (already resized).
 */
export function computeHistogram(pixels: PixelData): Float32Array {
  const { width, height, data } = pixels;
  const histogram = new Float32Array(TOTAL_BINS);
  let validPixels = 0;

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const [h, s, v] = rgbToHsv(r, g, b);

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

/**
 * Chi-squared distance between two histograms.
 * Lower = more similar. Returns 0 for identical histograms.
 */
export function chiSquaredDistance(a: Float32Array, b: Float32Array): number {
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const sum = a[i] + b[i];
    if (sum > 0) {
      const diff = a[i] - b[i];
      distance += (diff * diff) / sum;
    }
  }
  return distance;
}
