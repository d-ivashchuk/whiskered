/**
 * Minimal color system — only where color adds meaning.
 */

// Tier colors — the only place we use strong color coding
export const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  S: { bg: "#f59e0b", text: "#000000" },
  A: { bg: "#a855f7", text: "#ffffff" },
  B: { bg: "#3b82f6", text: "#ffffff" },
  C: { bg: "#22c55e", text: "#000000" },
  D: { bg: "#6b7280", text: "#ffffff" },
};

export function getTierColor(tier: string) {
  return TIER_COLORS[tier] ?? { bg: "#27272a", text: "#71717a" };
}

// Class colors — subtle accents only
export const CLASS_COLORS: Record<string, string> = {
  Fighter: "#ef4444",
  Mage: "#a855f7",
  Hunter: "#22c55e",
  Tank: "#a8763e",
  Cleric: "#94a3b8",
  Thief: "#eab308",
  Necromancer: "#a78bfa",
  Butcher: "#dc2626",
  Druid: "#65a30d",
  Tinkerer: "#14b8a6",
  Psychic: "#7c3aed",
  Monk: "#d1d5db",
  Jester: "#f97316",
  Collarless: "#94a3b8",
};

export function getClassColor(cls: string): string {
  return CLASS_COLORS[cls] ?? "#71717a";
}

// Rarity — text color only, no background
export const RARITY_TEXT: Record<string, string> = {
  Common: "#a1a1aa",
  Uncommon: "#4ade80",
  Rare: "#60a5fa",
  "Very Rare": "#c084fc",
  Legendary: "#fbbf24",
  Innate: "#d6d3d1",
  "Side Quest": "#22d3ee",
};

export function getRarityTextColor(rarity: string): string {
  return RARITY_TEXT[rarity] ?? "#a1a1aa";
}
