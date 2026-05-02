/**
 * Android item classifier — hybrid pipeline using TFLite + TypeScript.
 *
 * Mirrors the iOS native module's API but uses:
 * - TFLite embeddings (replaces Apple Vision Feature Prints)
 * - TFLite classifier (replaces CoreML)
 * - Pure TypeScript pHash + histogram (replaces native Accelerate/vDSP)
 *
 * Results are fused with the same RRF algorithm and weights as iOS.
 */
import type {
  ClassificationResult,
  MatchResult,
} from "../ItemClassifierModule";
import { getPixels, imageToTensor } from "./image-utils";
import { computePHash, hammingDistance } from "./perceptual-hash";
import { computeHistogram, chiSquaredDistance } from "./color-histogram";
import {
  loadReferences,
  isLoaded,
  getReferences,
  getEmbeddings,
} from "./reference-store";
import {
  loadModels,
  areModelsLoaded,
  runClassifier,
  runEmbedding,
} from "./tflite-engine";
import { rankByEmbedding } from "./embedding-matcher";
import { fuse, type RankedItem } from "./rrf-fusion";

let classLabels: string[] | null = null;
let initialized = false;

/**
 * Initialize the Android scanner engine.
 * Loads TFLite models, reference data, and class labels.
 */
async function ensureInitialized(): Promise<void> {
  if (initialized) return;

  await Promise.all([loadModels(), loadReferences()]);

  // Load class labels from the classifier model's metadata isn't directly
  // possible with react-native-fast-tflite, so we derive them from references.
  // The reference store labels are the same as class_names.json.
  const refs = getReferences();
  classLabels = refs.map((r) => r.label);

  initialized = true;
  console.log("[AndroidClassifier] Initialized");
}

/**
 * Classify an image using the TFLite classifier.
 * Returns the top prediction and top-3 results.
 */
export async function classifyImage(
  uri: string
): Promise<ClassificationResult> {
  await ensureInitialized();

  if (!areModelsLoaded() || !classLabels) {
    throw new Error("Models not loaded");
  }

  // Prepare input tensor
  const tensor = await imageToTensor(uri, 224);

  // Run classifier
  const probabilities = runClassifier(tensor);

  // Find top predictions
  const indexed = Array.from(probabilities).map((conf, idx) => ({
    label: classLabels![idx] ?? `unknown_${idx}`,
    confidence: conf,
  }));
  indexed.sort((a, b) => b.confidence - a.confidence);

  const top = indexed[0];
  const top3 = indexed.slice(0, 8);

  return {
    label: top.label,
    confidence: top.confidence,
    top3,
  };
}

/**
 * Match a sprite using the hybrid pipeline (pHash + histogram + embeddings + classifier).
 * Returns RRF-fused results with normalized scores (top = 1.0).
 */
export async function matchSprite(uri: string): Promise<MatchResult> {
  await ensureInitialized();

  const refs = getReferences();
  const embeddings = getEmbeddings();

  if (!refs.length) {
    throw new Error("Sprite fingerprints not loaded");
  }

  // Run all signal computations
  // pHash needs 32x32, histogram needs 64x64, TFLite needs 224x224
  const [pHashPixels, histPixels, inputTensor] = await Promise.all([
    getPixels(uri, 32, 32),
    getPixels(uri, 64, 64),
    imageToTensor(uri, 224),
  ]);

  // === Signal 1: TFLite Embeddings (replaces Vision Feature Prints) ===
  let embeddingRanked: RankedItem[] = [];
  if (areModelsLoaded() && embeddings.length > 0) {
    const queryEmbedding = runEmbedding(inputTensor);
    const embeddingMatches = rankByEmbedding(queryEmbedding, embeddings);
    embeddingRanked = embeddingMatches.slice(0, 50).map((m, rank) => ({
      label: m.label,
      rank,
    }));
  }

  // === Signal 2: pHash ===
  const queryHash = computePHash(pHashPixels);
  const pHashSorted = refs
    .map((ref) => ({
      label: ref.label,
      distance: hammingDistance(queryHash, ref.pHash),
    }))
    .sort((a, b) => a.distance - b.distance);

  const pHashRanked: RankedItem[] = pHashSorted.slice(0, 30).map((item, rank) => ({
    label: item.label,
    rank,
  }));

  // === Signal 3: Color histogram ===
  const queryHist = computeHistogram(histPixels);
  const histSorted = refs
    .map((ref) => ({
      label: ref.label,
      distance: chiSquaredDistance(queryHist, ref.histogram),
    }))
    .sort((a, b) => a.distance - b.distance);

  const histRanked: RankedItem[] = histSorted.slice(0, 30).map((item, rank) => ({
    label: item.label,
    rank,
  }));

  // === Signal 4: TFLite Classifier ===
  let classifierRanked: RankedItem[] = [];
  if (areModelsLoaded() && classLabels) {
    const probabilities = runClassifier(inputTensor);
    const indexed = Array.from(probabilities)
      .map((conf, idx) => ({
        label: classLabels![idx] ?? `unknown_${idx}`,
        confidence: conf,
      }))
      .sort((a, b) => b.confidence - a.confidence);

    classifierRanked = indexed.slice(0, 50).map((item, rank) => ({
      label: item.label,
      rank,
    }));
  }

  // === RRF Fusion ===
  const fusedResults = fuse(
    pHashRanked,
    histRanked,
    embeddingRanked,
    classifierRanked,
    16
  );

  return {
    topLabel: fusedResults[0]?.label ?? "",
    results: fusedResults.map((r) => ({
      label: r.label,
      score: r.score,
    })),
  };
}
