/**
 * Embedding-based sprite matching for Android.
 *
 * Replaces Apple Vision Feature Prints with cosine similarity
 * on 576-dim MobileNetV3-Small embeddings.
 */
import type { SpriteEmbedding } from "./reference-store";

export interface EmbeddingMatch {
  label: string;
  similarity: number;
}

/**
 * Cosine similarity between two L2-normalized vectors.
 * Since both are normalized, this is just the dot product.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Rank all reference embeddings by cosine similarity to the query.
 * Returns matches sorted by similarity (highest first).
 */
export function rankByEmbedding(
  queryEmbedding: Float32Array,
  references: SpriteEmbedding[]
): EmbeddingMatch[] {
  const matches: EmbeddingMatch[] = references.map((ref) => ({
    label: ref.label,
    similarity: cosineSimilarity(queryEmbedding, ref.embedding),
  }));

  matches.sort((a, b) => b.similarity - a.similarity);
  return matches;
}
