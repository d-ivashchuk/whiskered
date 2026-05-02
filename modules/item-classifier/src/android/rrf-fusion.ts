/**
 * Reciprocal Rank Fusion (RRF) for combining multiple ranked result lists.
 *
 * Ported from modules/item-classifier/ios/RRFFusion.swift — same algorithm,
 * same weights, same k value so Android and iOS produce equivalent results.
 */

/** RRF constant k — lower values make top ranks stand out more. */
const K = 20;

/**
 * Signal weights tuned for Android.
 *
 * Unlike iOS where Vision Feature Prints (3.0) dominate, our TFLite embeddings
 * are less robust to real-world camera conditions (blur, glare, angle).
 * The TFLite classifier is more reliable on Android, so we boost its weight
 * and distribute signal more evenly across all four sources.
 */
const WEIGHTS = {
  pHash: 1.0,
  histogram: 1.0,
  embedding: 2.5,
  classifier: 2.0,
} as const;

export interface RankedItem {
  label: string;
  /** 0-based rank within its signal source */
  rank: number;
}

export interface FusedResult {
  label: string;
  score: number;
}

/**
 * Fuse multiple ranked lists into a single scored result.
 * Returns items sorted by descending RRF score, normalized so top = 1.0.
 */
export function fuse(
  pHashRanks: RankedItem[],
  histogramRanks: RankedItem[],
  embeddingRanks: RankedItem[],
  classifierRanks: RankedItem[],
  topK: number = 16
): FusedResult[] {
  const scores = new Map<string, number>();

  const addScores = (items: RankedItem[], weight: number) => {
    for (const item of items) {
      const rrfScore = weight / (K + item.rank + 1);
      scores.set(item.label, (scores.get(item.label) ?? 0) + rrfScore);
    }
  };

  addScores(pHashRanks, WEIGHTS.pHash);
  addScores(histogramRanks, WEIGHTS.histogram);
  addScores(embeddingRanks, WEIGHTS.embedding);
  addScores(classifierRanks, WEIGHTS.classifier);

  let results: FusedResult[] = Array.from(scores.entries())
    .map(([label, score]) => ({ label, score }))
    .sort((a, b) => b.score - a.score);

  // Normalize so top score = 1.0
  const maxScore = results[0]?.score;
  if (maxScore && maxScore > 0) {
    results = results.map((r) => ({ label: r.label, score: r.score / maxScore }));
  }

  return results.slice(0, topK);
}
