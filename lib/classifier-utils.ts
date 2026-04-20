/**
 * Maps CoreML output labels (filesystem-safe names like "AAA_Battery")
 * back to display names ("AAA Battery") that match game data.
 *
 * Label encoding (from training data directory names):
 *   - Spaces → underscores: "AAA Battery" → "AAA_Battery"
 *   - Apostrophes → "_s_" or just removed (e.g. "Bag o' Stuff" → "Bag_o__Stuff")
 *   - Parentheses → underscores: "Amoeba (Face)" → "Amoeba__Face_"
 *   - Leading numbers get "_" prefix: ".22 Rifle" → "_22_Rifle"
 *   - Other special chars → underscores
 */

/**
 * Convert a CoreML label back to the human-readable item name.
 * Uses the same encoding rules as the wiki crawler + training pipeline.
 */
export function labelToDisplayName(label: string): string {
  let name = label;

  // Strip leading underscore that was added for names starting with numbers/special chars
  if (/^_\d/.test(name)) {
    name = name.substring(1);
  }

  // Restore apostrophes: "Ancestor_s_" → "Ancestor's "
  // Pattern: word boundary + _s_ → 's
  name = name.replace(/(\w)_s_/g, "$1's ");

  // Restore parentheses: "__Face_" at end or "__Face__" mid-string
  // Double underscore before word = opening paren, trailing underscore = closing paren
  name = name.replace(/__(\w+)_(?=_|$)/g, "($1)");
  // Handle end-of-string case
  name = name.replace(/__(\w+)_$/g, "($1)");

  // Replace remaining underscores with spaces
  name = name.replace(/_/g, " ");

  // Clean up extra spaces
  name = name.replace(/\s+/g, " ").trim();

  return name;
}

/**
 * Convert a display name to the filesystem/label format used by the model.
 */
export function displayNameToLabel(name: string): string {
  let label = name;

  // Special chars to underscores (matching wiki crawler behavior)
  label = label.replace(/[^a-zA-Z0-9\s_-]/g, "_");
  label = label.replace(/\s+/g, "_");

  // Names starting with numbers get underscore prefix
  if (/^\d/.test(label)) {
    label = "_" + label;
  }

  return label;
}

/**
 * Format a confidence value as a percentage string.
 */
export function formatConfidence(confidence: number): string {
  const clamped = Math.max(0, Math.min(1, confidence));
  return `${(clamped * 100).toFixed(1)}%`;
}

/**
 * Determine confidence level for UI styling.
 */
export function getConfidenceLevel(
  confidence: number
): "high" | "medium" | "low" {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}
