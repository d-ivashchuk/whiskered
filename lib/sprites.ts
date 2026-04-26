/**
 * Sprite loader using require.context() for bundling game sprites.
 * Metro resolves these as native assets (not inlined in JS bundle).
 */
import type { ImageSourcePropType } from "react-native";

// ─── Require contexts ────────────────────────────────────────────────────────

// @ts-expect-error — require.context is a Metro feature, not in TS types
const itemCtx = require.context("../data/sprites/png", false, /\.png$/);
// @ts-expect-error
const classCtx = require.context("../data/sprites/classes", false, /\.png$/);
// @ts-expect-error
const abilityCtx = require.context("../data/sprites/abilities", false, /\.png$/);
// @ts-expect-error
const statCtx = require.context("../data/sprites/stats", false, /\.png$/);
// @ts-expect-error
const elementCtx = require.context("../data/sprites/elements", false, /\.png$/);
// @ts-expect-error
const statusEffectCtx = require.context("../data/sprites/status-effects", false, /\.png$/);
// @ts-expect-error
const slotCtx = require.context("../data/sprites/slots", false, /\.png$/);
// @ts-expect-error
const bossCtx = require.context("../data/sprites/bosses", false, /\.png$/);

type RequireContext = {
  keys(): string[];
  (key: string): ImageSourcePropType;
};

// ─── Build lookup maps ───────────────────────────────────────────────────────

function buildMap(ctx: RequireContext): Map<string, ImageSourcePropType> {
  const map = new Map<string, ImageSourcePropType>();
  for (const key of ctx.keys()) {
    // key is like "./AAA_Battery.png" → strip "./" and ".png"
    const name = key.replace(/^\.\//, "").replace(/\.png$/, "");
    map.set(name, ctx(key));
  }
  return map;
}

const itemSprites = buildMap(itemCtx as RequireContext);
const classSprites = buildMap(classCtx as RequireContext);
const abilitySprites = buildMap(abilityCtx as RequireContext);
const statSprites = buildMap(statCtx as RequireContext);
const elementSprites = buildMap(elementCtx as RequireContext);
const statusEffectSprites = buildMap(statusEffectCtx as RequireContext);
const slotSprites = buildMap(slotCtx as RequireContext);
const bossSprites = buildMap(bossCtx as RequireContext);

// ─── Name → sprite key conversion ───────────────────────────────────────────

function nameToSpriteKey(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s_-]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+/, "_");
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getItemSprite(name: string, internalName?: string): ImageSourcePropType | null {
  // Try internalName (camelCase)
  if (internalName && itemSprites.has(internalName)) {
    return itemSprites.get(internalName) ?? null;
  }
  // Try name with spaces → underscores
  const underscored = name.replace(/\s+/g, "_");
  if (itemSprites.has(underscored)) {
    return itemSprites.get(underscored) ?? null;
  }
  // Try wiki-style encoding
  const wikiKey = nameToSpriteKey(name);
  if (itemSprites.has(wikiKey)) {
    return itemSprites.get(wikiKey) ?? null;
  }
  // Items starting with special chars get prefixed with _
  if (itemSprites.has("_" + wikiKey)) {
    return itemSprites.get("_" + wikiKey) ?? null;
  }
  return null;
}

/**
 * Look up a sprite directly by ML label (the sprite filename without extension).
 * This bypasses name conversion issues with apostrophes/special chars.
 */
export function getItemSpriteByLabel(label: string): ImageSourcePropType | null {
  return itemSprites.get(label) ?? null;
}

export function getClassSprite(className: string): ImageSourcePropType | null {
  return classSprites.get(className) ?? null;
}

export function getAbilitySprite(name: string, id?: string): ImageSourcePropType | null {
  if (id && abilitySprites.has(id)) {
    return abilitySprites.get(id) ?? null;
  }
  const underscored = name.replace(/\s+/g, "_");
  if (abilitySprites.has(underscored)) {
    return abilitySprites.get(underscored) ?? null;
  }
  const wikiKey = nameToSpriteKey(name);
  return abilitySprites.get(wikiKey) ?? null;
}

export function getStatSprite(stat: string): ImageSourcePropType | null {
  return statSprites.get(stat.toUpperCase()) ?? null;
}

export function getElementSprite(element: string): ImageSourcePropType | null {
  // Capitalize first letter
  const key = element.charAt(0).toUpperCase() + element.slice(1).toLowerCase();
  return elementSprites.get(key) ?? null;
}

export function getStatusEffectSprite(name: string): ImageSourcePropType | null {
  // Sprites are named like "Poison_Icon.png"
  const key = name.replace(/\s+/g, "_") + "_Icon";
  return statusEffectSprites.get(key) ?? null;
}

export function getSlotSprite(slot: string): ImageSourcePropType | null {
  return slotSprites.get(slot) ?? null;
}

export function getBossSprite(name: string): ImageSourcePropType | null {
  const underscored = name.replace(/\s+/g, "_");
  if (bossSprites.has(underscored)) {
    return bossSprites.get(underscored) ?? null;
  }
  const wikiKey = nameToSpriteKey(name);
  return bossSprites.get(wikiKey) ?? null;
}
