/**
 * Tier Generation Script
 *
 * Reads crawled item + ability data, sends batches to Claude with anchor tiers
 * from community guides, and produces a unified tiers.json.
 *
 * Prerequisites:
 *   - Run `npm run crawl` first to populate data/items/ and data/abilities/
 *   - Set ANTHROPIC_API_KEY env var
 *
 * Usage: npm run generate-tiers
 *
 * See scripts/TIER-GENERATION.md for methodology and references.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "..", "data");

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("Set ANTHROPIC_API_KEY env var");
  process.exit(1);
}

// ─── Anchor tiers from community guides ─────────────────────────────────────

const ANCHOR_ITEMS: Record<string, string> = {
  // S-tier sets
  Obelisk: "S", Stunning: "S", Bionic: "S",
  // A-tier sets
  Demonic: "A", Nurse: "A", Feathered: "A",
  // B-tier sets
  Lead: "B", Bone: "B", "Human Flesh": "B", Cleric: "B", Hybrid: "B", Cactus: "B", Gimp: "B",
  // S-tier standalone
  "Training Band": "S", "Armory Key": "S", Multiplier: "S", Revolver: "S", "Sniper Rifle": "S",
  // A-tier standalone
  "Bloody Knife": "A", "Black Belt": "A", "Champion's Mask": "A",
  "Propeller Cap": "A", "Hockey Mask": "A", "Natural 20": "A", "Soul Claw": "A",
  // B-tier standalone
  Fork: "B", "Fancy Bow": "B",
};

const ANCHOR_ABILITIES: Record<string, string> = {
  // S-tier
  Revive: "S", "Second Wind": "S", "Copy Cat": "S", "Meteor Storm": "S",
  Snipe: "S", Spin: "S", "Become Entropy": "S", "Soul Link": "S",
  "Hyper Beam": "S", "Skill Share": "S", "Bare Minimum": "S",
  // A-tier
  Marked: "A", "Fury Swipes": "A", Exert: "A", Bodyguard: "A", Shadow: "A",
  Merciless: "A", Zoomzerk: "A", "Pet Rocks": "A", "Hose Off": "A",
  "Stone Orbit": "A", Critical: "A", Backstabber: "A", "Spread Sorrow": "A",
  Enlightened: "A", "Learn from Me": "A", "Waste Time": "A",
  "Duke of Flies": "A", Incubator: "A",
  // B-tier
  "Cryo Heal": "B", "Arrow Flurry": "B", Goad: "B", Berserk: "B", Confront: "B",
  // C-tier
  "Hire Hitman": "C", "Gravity Slam": "C", Leap: "C", "Bull Rush": "C", "Vet Visit": "C",
  // D-tier
  Juiced: "D", "Heavy Shot": "D", CPR: "D", "Fire Punch": "D", "Barf Ball": "D", Stun: "D",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function toSafeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function loadJsonDir<T>(dir: string): T[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as T);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TierEntry {
  tier: string;
  reason: string;
}

// ─── Claude API ─────────────────────────────────────────────────────────────

async function callClaude(prompt: string, retries = 3): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 8192,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (res.status === 429) {
        const wait = Math.pow(2, attempt + 1) * 1000;
        console.warn(`  [429] Rate limited, waiting ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const data = (await res.json()) as {
        content: Array<{ type: string; text: string }>;
      };
      return data.content[0].text;
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2000);
    }
  }
  throw new Error("Failed after retries");
}

function buildAnchorContext(anchors: Record<string, string>): string {
  const byTier: Record<string, string[]> = {};
  for (const [name, tier] of Object.entries(anchors)) {
    (byTier[tier] ??= []).push(name);
  }
  return Object.entries(byTier)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tier, names]) => `${tier}: ${names.join(", ")}`)
    .join("\n");
}

// ─── Tier generation ────────────────────────────────────────────────────────

async function tierBatch(
  entries: Array<{ name: string; summary: string }>,
  anchors: Record<string, string>,
  entityType: string,
): Promise<Record<string, TierEntry>> {
  const anchorContext = buildAnchorContext(anchors);

  // Separate pre-anchored vs needs-tiering
  const toTier = entries.filter((e) => !anchors[e.name]);
  const result: Record<string, TierEntry> = {};

  // Add anchors directly
  for (const e of entries) {
    if (anchors[e.name]) {
      result[e.name] = { tier: anchors[e.name], reason: "Community guide anchor" };
    }
  }

  if (toTier.length === 0) return result;

  const entryList = toTier
    .map((e) => `- ${e.name}: ${e.summary}`)
    .join("\n");

  const prompt = `You are rating Mewgenics ${entityType} into tiers S/A/B/C/D.

## Anchor tiers (from community guides, treat as ground truth):
${anchorContext}

## Target distribution:
- S: ~10% (best-in-slot, build-defining, game-changing)
- A: ~20% (strong, reliable, worth building around)
- B: ~40% (solid, situationally useful, good filler)
- C: ~20% (niche, outclassed, or too situational)
- D: ~10% (weak, rarely worth taking)

## ${entityType} to tier:
${entryList}

Rate each one. Respond ONLY with valid JSON — no markdown fences, no commentary.
Format: {"Name": {"tier": "B", "reason": "short reason"}, ...}

Be calibrated: most things should be B. Only truly exceptional entries get S. Only truly bad ones get D.`;

  const response = await callClaude(prompt);

  // Parse JSON from response (handle possible markdown fences)
  let json = response.trim();
  if (json.startsWith("```")) {
    json = json.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(json) as Record<string, TierEntry>;
    for (const [name, entry] of Object.entries(parsed)) {
      if (entry.tier && entry.reason) {
        result[name] = entry;
      }
    }
  } catch (err) {
    console.warn(`  [WARN] Failed to parse Claude response, skipping batch`);
    console.warn(`  Response preview: ${json.slice(0, 200)}...`);
  }

  return result;
}

// ─── Main ───────────────────────────────────────────────────────────────────

interface ItemData {
  name: string;
  description: string;
  rarity: string;
  slot: string;
  set: string;
  damage: string;
  effects: string;
}

interface AbilityData {
  name: string;
  description: string;
  class: string;
  type: string;
  mana: string;
  power: string;
  powerType: string;
  element: string;
  effects: string;
}

function summarizeItem(item: ItemData): string {
  const parts: string[] = [];
  if (item.description) parts.push(item.description);
  if (item.rarity) parts.push(`Rarity: ${item.rarity}`);
  if (item.slot) parts.push(`Slot: ${item.slot}`);
  if (item.set) parts.push(`Set: ${item.set}`);
  if (item.damage) parts.push(`Damage: ${item.damage}`);
  if (item.effects) parts.push(`Effects: ${item.effects.slice(0, 200)}`);
  return parts.join(". ") || "No data";
}

function summarizeAbility(ability: AbilityData): string {
  const parts: string[] = [];
  if (ability.description) parts.push(ability.description);
  if (ability.class) parts.push(`Class: ${ability.class}`);
  if (ability.type) parts.push(`Type: ${ability.type}`);
  if (ability.mana) parts.push(`Mana: ${ability.mana}`);
  if (ability.power) parts.push(`Power: ${ability.power}`);
  if (ability.element) parts.push(`Element: ${ability.element}`);
  if (ability.effects) parts.push(`Effects: ${ability.effects.slice(0, 200)}`);
  return parts.join(". ") || "No data";
}

async function main() {
  console.log("Loading crawled data...");

  const items = loadJsonDir<ItemData>(path.join(DATA_DIR, "items"));
  const abilities = loadJsonDir<AbilityData>(path.join(DATA_DIR, "abilities"));

  console.log(`  ${items.length} items, ${abilities.length} abilities\n`);

  // ── Tier items ──
  console.log("Tiering items...");
  const itemEntries = items.map((i) => ({ name: i.name, summary: summarizeItem(i) }));
  const itemBatches = chunk(itemEntries, 80);
  const allItemTiers: Record<string, TierEntry> = {};

  for (let i = 0; i < itemBatches.length; i++) {
    console.log(`  Item batch ${i + 1}/${itemBatches.length} (${itemBatches[i].length} items)...`);
    const tiers = await tierBatch(itemBatches[i], ANCHOR_ITEMS, "items");
    Object.assign(allItemTiers, tiers);
    if (i < itemBatches.length - 1) await sleep(1000);
  }
  console.log(`  Tiered ${Object.keys(allItemTiers).length} items\n`);

  // ── Tier abilities ──
  console.log("Tiering abilities...");
  const abilityEntries = abilities.map((a) => ({ name: a.name, summary: summarizeAbility(a) }));
  const abilityBatches = chunk(abilityEntries, 80);
  const allAbilityTiers: Record<string, TierEntry> = {};

  for (let i = 0; i < abilityBatches.length; i++) {
    console.log(`  Ability batch ${i + 1}/${abilityBatches.length} (${abilityBatches[i].length} abilities)...`);
    const tiers = await tierBatch(abilityBatches[i], ANCHOR_ABILITIES, "abilities");
    Object.assign(allAbilityTiers, tiers);
    if (i < abilityBatches.length - 1) await sleep(1000);
  }
  console.log(`  Tiered ${Object.keys(allAbilityTiers).length} abilities\n`);

  // ── Distribution check ──
  for (const [label, tiers] of [["Items", allItemTiers], ["Abilities", allAbilityTiers]] as const) {
    const dist: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    const total = Object.keys(tiers).length;
    for (const entry of Object.values(tiers)) {
      dist[entry.tier] = (dist[entry.tier] ?? 0) + 1;
    }
    console.log(`${label} distribution (${total} total):`);
    for (const t of ["S", "A", "B", "C", "D"]) {
      const count = dist[t] ?? 0;
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
      console.log(`  ${t}: ${count} (${pct}%)`);
    }
    console.log();
  }

  // ── Save ──
  const output = {
    version: new Date().toISOString().split("T")[0],
    generatedAt: new Date().toISOString(),
    methodology: "See scripts/TIER-GENERATION.md",
    items: allItemTiers,
    abilities: allAbilityTiers,
  };

  const outPath = path.join(DATA_DIR, "tiers.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Saved to ${outPath}`);
}

main().catch((err) => {
  console.error("Tier generation failed:", err);
  process.exit(1);
});
