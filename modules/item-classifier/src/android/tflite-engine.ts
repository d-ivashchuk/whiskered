/**
 * TFLite inference engine for Android.
 *
 * Loads the classifier and embedding TFLite models via react-native-fast-tflite,
 * and provides inference functions for both.
 *
 * Models are loaded from Android assets (copied there by plugins/with-android-models.js).
 */
import { loadTensorflowModel, type TfliteModel } from "react-native-fast-tflite";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";

let classifierModel: TfliteModel | null = null;
let embeddingModel: TfliteModel | null = null;
let modelsLoaded = false;

/**
 * Copy a bundled asset to the local filesystem and return a file:// URI.
 * react-native-fast-tflite needs a file:// or http:// URI for { url } loading.
 */
async function getModelUri(assetModule: number): Promise<string> {
  const [asset] = await Asset.loadAsync(assetModule);
  if (!asset.localUri) {
    throw new Error("Asset has no localUri after loading");
  }
  return asset.localUri;
}

/**
 * Load both TFLite models from bundled assets.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function loadModels(): Promise<void> {
  if (modelsLoaded) return;

  // Resolve asset URIs first
  /* eslint-disable @typescript-eslint/no-var-requires */
  const [classifierUri, embeddingUri] = await Promise.all([
    getModelUri(
      require("../../../../ml/output/mewgenics_items_classifier.tflite")
    ),
    getModelUri(
      require("../../../../ml/output/mewgenics_items_embeddings.tflite")
    ),
  ]);
  /* eslint-enable @typescript-eslint/no-var-requires */

  try {
    const [classifier, embedding] = await Promise.all([
      loadTensorflowModel({ url: classifierUri }, ["nnapi"]),
      loadTensorflowModel({ url: embeddingUri }, ["nnapi"]),
    ]);

    classifierModel = classifier;
    embeddingModel = embedding;
    modelsLoaded = true;

    console.log("[TFLiteEngine] Models loaded successfully (NNAPI)");
  } catch (err) {
    // Fall back to CPU delegate if NNAPI fails
    console.warn("[TFLiteEngine] NNAPI failed, falling back to CPU:", err);
    try {
      const [classifier, embedding] = await Promise.all([
        loadTensorflowModel({ url: classifierUri }, []),
        loadTensorflowModel({ url: embeddingUri }, []),
      ]);

      classifierModel = classifier;
      embeddingModel = embedding;
      modelsLoaded = true;

      console.log("[TFLiteEngine] Models loaded with CPU delegate");
    } catch (cpuErr) {
      console.error("[TFLiteEngine] Failed to load models:", cpuErr);
      throw cpuErr;
    }
  }
}

/**
 * Run the classifier model on a pre-processed input tensor.
 * @param input Float32Array of shape [1, 224, 224, 3] (ImageNet-normalized NHWC)
 * @returns Float32Array of softmax probabilities, length = num_classes
 */
export function runClassifier(input: Float32Array): Float32Array {
  if (!classifierModel) {
    throw new Error("Classifier model not loaded. Call loadModels() first.");
  }

  const output = classifierModel.runSync([input.buffer as ArrayBuffer]);
  return new Float32Array(output[0]);
}

/**
 * Run the embedding model on a pre-processed input tensor.
 * @param input Float32Array of shape [1, 224, 224, 3] (ImageNet-normalized NHWC)
 * @returns Float32Array of 576-dim embedding (L2-normalized)
 */
export function runEmbedding(input: Float32Array): Float32Array {
  if (!embeddingModel) {
    throw new Error("Embedding model not loaded. Call loadModels() first.");
  }

  const output = embeddingModel.runSync([input.buffer as ArrayBuffer]);
  const embedding = new Float32Array(output[0]);

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < embedding.length; i++) {
    norm += embedding[i] * embedding[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm;
    }
  }

  return embedding;
}

export function areModelsLoaded(): boolean {
  return modelsLoaded;
}
