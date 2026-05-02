import { Platform } from "react-native";

export type {
  ClassificationResult,
  MatchResult,
} from "./src/ItemClassifierModule";

/**
 * Classify a game item from an image file URI.
 * Returns the top prediction label, confidence, and top-3 results.
 *
 * iOS: Uses native CoreML module.
 * Android: Uses TFLite via react-native-fast-tflite.
 */
export async function classifyImage(
  uri: string
): Promise<{
  label: string;
  confidence: number;
  top3: Array<{ label: string; confidence: number }>;
}> {
  if (Platform.OS === "ios") {
    const native = (await import("./src/ItemClassifierModule")).default;
    return native.classifyImage(uri);
  }
  const { classifyImage: androidClassify } = await import("./src/android");
  return androidClassify(uri);
}

/**
 * Match a game item using the hybrid pipeline.
 * Returns normalized scores (top = 1.0) and the top matches.
 *
 * iOS: pHash + histogram + Vision Feature Prints + CoreML (native).
 * Android: pHash + histogram + TFLite embeddings + TFLite classifier (TypeScript).
 */
export async function matchSprite(
  uri: string
): Promise<{
  topLabel: string;
  results: Array<{ label: string; score: number }>;
}> {
  if (Platform.OS === "ios") {
    const native = (await import("./src/ItemClassifierModule")).default;
    return native.matchSprite(uri);
  }
  const { matchSprite: androidMatch } = await import("./src/android");
  return androidMatch(uri);
}
