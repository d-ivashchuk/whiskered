/**
 * Loads pre-computed sprite fingerprints and embeddings from bundled binary files.
 *
 * Parses:
 * - sprite-fingerprints.bin (pHash + histogram per sprite)
 * - sprite-embeddings.bin (576-dim embedding per sprite)
 *
 * Binary formats match the Node.js build scripts exactly.
 */
import * as FileSystem from "expo-file-system/legacy";
import { Asset } from "expo-asset";
import { readUint64LE } from "./perceptual-hash";

export interface SpriteReference {
  label: string;
  /** 64-bit pHash as [hi32, lo32] — no BigInt in Hermes */
  pHash: [number, number];
  /** 64-bin HSV histogram */
  histogram: Float32Array;
}

export interface SpriteEmbedding {
  label: string;
  /** L2-normalized 576-dim embedding */
  embedding: Float32Array;
}

let fingerprintRefs: SpriteReference[] = [];
let embeddingRefs: SpriteEmbedding[] = [];
let loaded = false;

export function getReferences(): SpriteReference[] {
  return fingerprintRefs;
}

export function getEmbeddings(): SpriteEmbedding[] {
  return embeddingRefs;
}

export function isLoaded(): boolean {
  return loaded;
}

/**
 * Load both binary files from Android assets.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function loadReferences(): Promise<void> {
  if (loaded) return;

  await Promise.all([loadFingerprints(), loadEmbeddings()]);
  loaded = true;

  console.log(
    `[ReferenceStore] Loaded ${fingerprintRefs.length} fingerprints, ${embeddingRefs.length} embeddings`
  );
}

async function readAssetToArrayBuffer(
  assetModule: number
): Promise<ArrayBuffer> {
  const [asset] = await Asset.loadAsync(assetModule);
  if (!asset.localUri) {
    throw new Error("Asset has no localUri");
  }

  const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
    encoding: "base64",
  });

  // Decode base64 to ArrayBuffer
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Parse sprite-fingerprints.bin
 * Format: [4B magic "MWFP"][4B version][4B count][4B reserved]
 * Per entry: [8B pHash][256B histogram (64×f32)][1B labelLen][NB label]
 */
async function loadFingerprints(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const buffer = await readAssetToArrayBuffer(
      require("../../../../data/sprite-fingerprints.bin")
    );
    const view = new DataView(buffer);

    // Validate magic
    const magic = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
    if (magic !== "MWFP") {
      console.error(`[ReferenceStore] Invalid fingerprints magic: ${magic}`);
      return;
    }

    const version = view.getUint32(4, true);
    if (version !== 1) {
      console.error(`[ReferenceStore] Unsupported fingerprints version: ${version}`);
      return;
    }

    const count = view.getUint32(8, true);
    const entries: SpriteReference[] = [];
    let offset = 16;

    for (let i = 0; i < count; i++) {
      if (offset + 8 + 256 + 1 > buffer.byteLength) break;

      // pHash as [hi, lo]
      const pHash = readUint64LE(view, offset);
      offset += 8;

      // Histogram: 64 × float32
      const histogram = new Float32Array(64);
      for (let j = 0; j < 64; j++) {
        histogram[j] = view.getFloat32(offset + j * 4, true);
      }
      offset += 256;

      // Label
      const labelLen = view.getUint8(offset);
      offset += 1;

      if (offset + labelLen > buffer.byteLength) break;

      const labelBytes = new Uint8Array(buffer, offset, labelLen);
      const label = new TextDecoder().decode(labelBytes);
      offset += labelLen;

      entries.push({ label, pHash, histogram });
    }

    fingerprintRefs = entries;
  } catch (err) {
    console.error("[ReferenceStore] Failed to load fingerprints:", err);
  }
}

/**
 * Parse sprite-embeddings.bin
 * Format: [4B magic "MWFE"][4B version=1][4B count][4B dim=576]
 * Per entry: [dim×4B embedding (float32 LE)][1B labelLen][NB label]
 */
async function loadEmbeddings(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const buffer = await readAssetToArrayBuffer(
      require("../../../../data/sprite-embeddings.bin")
    );
    const view = new DataView(buffer);

    const magic = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
    if (magic !== "MWFE") {
      console.error(`[ReferenceStore] Invalid embeddings magic: ${magic}`);
      return;
    }

    const version = view.getUint32(4, true);
    if (version !== 1) {
      console.error(`[ReferenceStore] Unsupported embeddings version: ${version}`);
      return;
    }

    const count = view.getUint32(8, true);
    const dim = view.getUint32(12, true);

    const entries: SpriteEmbedding[] = [];
    let offset = 16;

    for (let i = 0; i < count; i++) {
      const embeddingByteLen = dim * 4;
      if (offset + embeddingByteLen + 1 > buffer.byteLength) break;

      // Embedding: dim × float32
      const embedding = new Float32Array(dim);
      for (let j = 0; j < dim; j++) {
        embedding[j] = view.getFloat32(offset + j * 4, true);
      }
      offset += embeddingByteLen;

      // Label
      const labelLen = view.getUint8(offset);
      offset += 1;

      if (offset + labelLen > buffer.byteLength) break;

      const labelBytes = new Uint8Array(buffer, offset, labelLen);
      const label = new TextDecoder().decode(labelBytes);
      offset += labelLen;

      entries.push({ label, embedding });
    }

    embeddingRefs = entries;
  } catch (err) {
    console.error("[ReferenceStore] Failed to load embeddings:", err);
  }
}
