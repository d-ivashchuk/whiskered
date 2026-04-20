import ItemClassifierModule from "./src/ItemClassifierModule";

export type {
  ClassificationResult,
  MatchResult,
} from "./src/ItemClassifierModule";

/**
 * Classify a game item from an image file URI.
 * Returns the top prediction label, confidence, and top-3 results.
 */
export async function classifyImage(
  uri: string
): Promise<{
  label: string;
  confidence: number;
  top3: Array<{ label: string; confidence: number }>;
}> {
  return ItemClassifierModule.classifyImage(uri);
}

/**
 * Match a game item using the hybrid pipeline (pHash + histogram + Vision + CoreML).
 * Returns normalized scores (top = 1.0) and the top-8 matches.
 */
export async function matchSprite(
  uri: string
): Promise<{
  topLabel: string;
  results: Array<{ label: string; score: number }>;
}> {
  return ItemClassifierModule.matchSprite(uri);
}
