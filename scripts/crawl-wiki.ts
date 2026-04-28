/**
 * Mewgenics Wiki Crawler
 *
 * Fetches all item, class, and ability data + sprites from mewgenics.wiki.gg
 * using the MediaWiki API. Uses batched queries (50 pages per request).
 *
 * Usage: npm run crawl
 *
 * Output:
 *   data/item-list.json       — array of all item names
 *   data/items/<name>.json    — individual item JSON files
 *   data/sprites/png/         — 224x224 PNGs for ML training
 *   data/missing-sprites.json — items without sprites
 *   data/classes/             — class JSON files
 *   data/class-list.json      — array of all class names
 *   data/abilities/           — ability JSON files
 *   data/ability-list.json    — array of all ability names
 *
 * Shared HTTP / wikitext / sprite logic lives in `scripts/lib/` so the
 * boss + enemy crawlers can reuse it without duplication.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchCategoryMembers, fetchJSON, fetchPagesBatch, API_BASE } from "./lib/mediawiki.js";
import { fetchAndDownloadSprites } from "./lib/sprites.js";
import { fetchAndCacheEntities } from "./lib/fs-cache.js";
import {
  parseInfobox,
  extractCategories,
  convertWikiTemplates,
  stripWikiTemplates,
} from "./lib/wikitext.js";
import { ensureDirs, writeJson } from "./lib/util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "data");
const ITEMS_DIR = path.join(DATA_DIR, "items");
const CLASSES_DIR = path.join(DATA_DIR, "classes");
const ABILITIES_DIR = path.join(DATA_DIR, "abilities");
const SPRITES_PNG_DIR = path.join(DATA_DIR, "sprites", "png");

// ─── Item data ──────────────────────────────────────────────────────────────

interface ItemData {
  name: string;
  internalName: string;
  description: string;
  rarity: string;
  slot: string;
  set: string;
  statusEffects: string;
  itemPools: string;
  damage: string;
  effects: string;
  categories: string[];
}

function extractEffects(wikitext: string): string {
  const m = wikitext.match(/==\s*Effects?\s*==\s*\n([\s\S]*?)(?=\n==|$)/);
  if (!m) return "";
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^\*\s*/, "").trim())
    .filter(Boolean)
    .join("\n");
}

function parseItemWikitext(title: string, wikitext: string): ItemData {
  const infobox = parseInfobox(wikitext);
  return {
    name: title,
    internalName: infobox.InternalName ?? "",
    description: infobox.Description ?? "",
    rarity: infobox.Rarity ?? "",
    slot: infobox.Slot ?? "",
    set: infobox.Set ?? "",
    statusEffects: infobox.StatusEffects ?? "",
    itemPools: infobox.ItemPools ?? "",
    damage: infobox.Damage ?? "",
    effects: extractEffects(wikitext),
    categories: extractCategories(wikitext),
  };
}

async function fetchItemsBatch(titles: string[]): Promise<ItemData[]> {
  const pages = await fetchPagesBatch(titles);
  return pages.map((p) => parseItemWikitext(p.title, p.wikitext));
}

// ─── Class data ─────────────────────────────────────────────────────────────

interface ClassUnlock {
  name: string;
  requirement: string;
}

interface ClassArchetype {
  name: string;
  description: string;
}

interface ClassData {
  name: string;
  id: string;
  description: string;
  buffs: string;
  debuffs: string;
  unlockMethod: string;
  levelStats: string;
  basicAction: string;
  archetypes: ClassArchetype[];
  unlocks: ClassUnlock[];
  categories: string[];
}

function parseOverviewBody(wikitext: string): string {
  const m = wikitext.match(/==\s*Overview\s*==\s*\n([\s\S]*?)(?=\n===|$)/i);
  if (!m) return "";
  let text = m[1];
  text = text.replace(/\{\|[\s\S]*?\|\}/g, ""); // strip wiki tables
  text = convertWikiTemplates(text, true);
  text = text.replace(/^\*\s*/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

function parseArchetypes(wikitext: string): ClassArchetype[] {
  const m = wikitext.match(/===\s*Archetypes\s*===\s*\n([\s\S]*?)(?=\n===|\n==[^=]|$)/i);
  if (!m) return [];
  const section = m[1];

  const archetypes: ClassArchetype[] = [];
  const blocks = section.split(/(?=^\*\s*''')/m).filter((b) => b.trim());

  for (const block of blocks) {
    const headerMatch = block.match(/^\*\s*'''([^']+?)(?::)?''':?\s*(.*)/);
    if (!headerMatch) continue;

    const name = headerMatch[1].trim().replace(/:$/, "");
    const lines = block.split("\n");
    const descParts: string[] = [];

    for (let li = 0; li < lines.length; li++) {
      const trimmed = lines[li].trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("*")) {
        const content = trimmed.replace(/^\*+\s*/, "");
        const converted = convertWikiTemplates(content, true);
        if (li === 0) {
          const afterName = converted.replace(
            new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:?\\s*`, "i"),
            "",
          );
          if (afterName) descParts.push(afterName);
        } else {
          descParts.push(converted);
        }
      }
    }

    archetypes.push({ name, description: descParts.join("\n") });
  }
  return archetypes;
}

function parseUnlocks(wikitext: string): ClassUnlock[] {
  const m = wikitext.match(/==\s*Unlocks\s*==\s*\n([\s\S]*?)(?=\n==[^=]|$)/i);
  if (!m) return [];
  const section = m[1];

  const unlocks: ClassUnlock[] = [];
  const rowRegex = /\|\s*((?:\{\{[^}]+\}\})+)\s*\|\|\s*([^\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(section)) !== null) {
    const name = stripWikiTemplates(match[1]).trim();
    const requirement = stripWikiTemplates(match[2]).trim();
    if (name && requirement) {
      unlocks.push({ name, requirement });
    }
  }
  return unlocks;
}

function parseBasicAction(wikitext: string): string {
  const m = wikitext.match(/===\s*Basic Action\s*===\s*\n([\s\S]*?)(?=\n===|\n==[^=]|$)/i);
  if (!m) return "";
  return convertWikiTemplates(m[1], true).replace(/\n+/g, " ").trim();
}

function parseClassWikitext(title: string, wikitext: string): ClassData {
  const infobox = parseInfobox(wikitext);
  const overviewBody = parseOverviewBody(wikitext);
  return {
    name: title,
    id: infobox.Id ?? "",
    description: overviewBody || stripWikiTemplates(infobox.Description ?? ""),
    buffs: infobox.Buffs ?? "",
    debuffs: infobox.Debuffs ?? "",
    unlockMethod: infobox.UnlockMethod ?? "",
    levelStats: infobox.LevelStats ?? "",
    basicAction: parseBasicAction(wikitext),
    archetypes: parseArchetypes(wikitext),
    unlocks: parseUnlocks(wikitext),
    categories: extractCategories(wikitext),
  };
}

async function fetchClassesBatch(titles: string[]): Promise<ClassData[]> {
  const pages = await fetchPagesBatch(titles);
  return pages.map((p) => parseClassWikitext(p.title, p.wikitext));
}

// ─── Ability data ───────────────────────────────────────────────────────────

interface AbilityData {
  name: string;
  id: string;
  description: string;
  class: string;
  type: string;
  mana: string;
  power: string;
  powerType: string;
  element: string;
  upgradeDescription: string;
  effects: string;
  categories: string[];
}

function parseAbilityWikitext(title: string, wikitext: string): AbilityData {
  const infobox = parseInfobox(wikitext);
  return {
    name: title,
    id: infobox.ID ?? infobox.Id ?? "",
    description: infobox.Description ?? "",
    class: infobox.Class ?? "",
    type: infobox.Type ?? "",
    mana: infobox.Mana ?? "",
    power: infobox.Power ?? "",
    powerType: infobox.PowerType ?? "",
    element: infobox.Element ?? "",
    upgradeDescription: infobox.UpgradeDescription ?? "",
    effects: extractEffects(wikitext),
    categories: extractCategories(wikitext),
  };
}

async function fetchAbilitiesBatch(titles: string[]): Promise<AbilityData[]> {
  const pages = await fetchPagesBatch(titles);
  return pages.map((p) => parseAbilityWikitext(p.title, p.wikitext));
}

// ─── Crawl entrypoints ──────────────────────────────────────────────────────

async function crawlItems() {
  const itemNames = await fetchCategoryMembers("Category:Items", "Items");
  writeJson(path.join(DATA_DIR, "item-list.json"), itemNames);
  console.log(`Saved ${itemNames.length} item names to data/item-list.json\n`);

  const allItems = await fetchAndCacheEntities(itemNames, ITEMS_DIR, fetchItemsBatch, "Items");

  const result = await fetchAndDownloadSprites(
    allItems.map((i) => i.name),
    "ITEM",
    ["png", "svg"],
    SPRITES_PNG_DIR,
    "Item Sprites",
  );
  console.log(
    `  Items: ${allItems.length} parsed, ${result.saved} sprites, ${result.missing.length} missing\n`,
  );
  return result;
}

async function crawlClasses() {
  const classNames = await fetchCategoryMembers("Category:Classes", "Classes");
  writeJson(path.join(DATA_DIR, "class-list.json"), classNames);
  console.log(`Saved ${classNames.length} class names to data/class-list.json\n`);

  const allClasses = await fetchAndCacheEntities(
    classNames,
    CLASSES_DIR,
    fetchClassesBatch,
    "Classes",
  );

  const CLASS_SPRITES_DIR = path.join(DATA_DIR, "sprites", "classes");
  const result = await fetchAndDownloadSprites(
    allClasses.map((c) => c.name),
    "CLASS",
    ["png", "svg"],
    CLASS_SPRITES_DIR,
    "Class Sprites",
  );
  console.log(
    `  Classes: ${allClasses.length} parsed, ${result.saved} sprites, ${result.missing.length} missing\n`,
  );
  return result;
}

async function crawlAbilities() {
  const abilityNames = await fetchCategoryMembers("Category:Abilities", "Abilities");
  writeJson(path.join(DATA_DIR, "ability-list.json"), abilityNames);
  console.log(`Saved ${abilityNames.length} ability names to data/ability-list.json\n`);

  const allAbilities = await fetchAndCacheEntities(
    abilityNames,
    ABILITIES_DIR,
    fetchAbilitiesBatch,
    "Abilities",
  );

  const ABILITY_SPRITES_DIR = path.join(DATA_DIR, "sprites", "abilities");
  const result = await fetchAndDownloadSprites(
    allAbilities.map((a) => a.name),
    "ABILITY",
    ["svg", "png"],
    ABILITY_SPRITES_DIR,
    "Ability Sprites",
  );
  console.log(
    `  Abilities: ${allAbilities.length} parsed, ${result.saved} sprites, ${result.missing.length} missing\n`,
  );
  return result;
}

async function crawlStatusEffects() {
  const STATUS_EFFECTS_DIR = path.join(DATA_DIR, "status-effects");
  const STATUS_SPRITES_DIR = path.join(DATA_DIR, "sprites", "status-effects");
  ensureDirs(STATUS_EFFECTS_DIR, STATUS_SPRITES_DIR);

  console.log("[Status Effects] Fetching wiki page...");
  const params = new URLSearchParams({
    action: "query",
    titles: "Status Effects",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    format: "json",
  });
  const data = (await fetchJSON(`${API_BASE}?${params}`)) as {
    query: {
      pages: Record<string, { revisions?: Array<{ slots: { main: { "*": string } } }> }>;
    };
  };
  const page = Object.values(data.query.pages)[0];
  const wikitext = page?.revisions?.[0]?.slots.main["*"] ?? "";

  // 3-column wiki table: name | icon | behavior
  const effects: Array<{ name: string; description: string }> = [];
  const rows = wikitext.split(/\n\|-\s*\n/);
  for (const row of rows) {
    const nameMatch = row.match(/\{\{st\|([^}|]+?)(?:\|[^}]*)?\}\}/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    const columns = row.split(/\|\|/);
    if (columns.length < 3) continue;
    const rawDesc = columns.slice(2).join(" ").trim();
    const firstLine = rawDesc.split("\n")[0].trim();
    const desc = stripWikiTemplates(firstLine).trim();
    if (name && desc) effects.push({ name, description: desc });
  }

  console.log(`[Status Effects] Parsed ${effects.length} effects from wiki page.`);
  writeJson(path.join(DATA_DIR, "status-effects.json"), effects);

  // Pull effect names referenced in combined items data too — catches effects
  // not on the central Status Effects page.
  const itemEffectNames = new Set<string>();
  const combinedItemsPath = path.join(DATA_DIR, "combined", "items.json");
  if (fs.existsSync(combinedItemsPath)) {
    const combinedItems = JSON.parse(fs.readFileSync(combinedItemsPath, "utf-8")) as Array<{
      statusEffects: string[];
    }>;
    for (const item of combinedItems) {
      for (const e of item.statusEffects) {
        if (e && /^[A-Za-z]/.test(e)) itemEffectNames.add(e);
      }
    }
    console.log(
      `[Status Effects] Found ${itemEffectNames.size} unique effects in combined items data.`,
    );
  }
  const allEffectNames = new Set([...effects.map((e) => e.name), ...itemEffectNames]);

  const spriteNames = [...allEffectNames].map((name) => `${name}_Icon`);
  const result = await fetchAndDownloadSprites(
    spriteNames,
    "STATUS",
    ["svg", "png"],
    STATUS_SPRITES_DIR,
    "Status Effect Sprites",
  );
  console.log(
    `  Status Effects: ${effects.length} described, ${result.saved} sprites, ${result.missing.length} missing\n`,
  );
  return result;
}

const TARGETS = ["items", "classes", "abilities", "effects"] as const;
type Target = (typeof TARGETS)[number];

async function main() {
  ensureDirs(DATA_DIR, ITEMS_DIR, CLASSES_DIR, ABILITIES_DIR, SPRITES_PNG_DIR);

  const args = process.argv.slice(2).map((a) => a.toLowerCase());
  const targets: Target[] =
    args.length === 0 || args.includes("all")
      ? [...TARGETS]
      : args.filter((a): a is Target => TARGETS.includes(a as Target));

  if (targets.length === 0) {
    console.log(`Usage: npm run crawl -- [${TARGETS.join(" | ")} | all]`);
    console.log("  No args or 'all' = crawl everything");
    process.exit(1);
  }

  console.log(`Crawling: ${targets.join(", ")}\n`);

  if (targets.includes("items")) await crawlItems();
  if (targets.includes("classes")) await crawlClasses();
  if (targets.includes("abilities")) await crawlAbilities();
  if (targets.includes("effects")) await crawlStatusEffects();

  console.log("────────────────────────────────");
  console.log("Done!");
  console.log("────────────────────────────────");
}

main().catch((err) => {
  console.error("Crawl failed:", err);
  process.exit(1);
});
