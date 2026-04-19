import * as fs from "fs";
import * as path from "path";

// ─── Paths ───────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(__dirname, "../data");
const ITEMS_DIR = path.join(DATA_DIR, "items");
const CLASSES_DIR = path.join(DATA_DIR, "classes");
const ABILITIES_DIR = path.join(DATA_DIR, "abilities");
const SPRITES_DIR = path.join(DATA_DIR, "sprites");
const TIERS_PATH = path.join(DATA_DIR, "tiers.json");
const OUT_DIR = path.join(DATA_DIR, "combined");

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawItem {
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

interface RawClassArchetype {
  name: string;
  description: string;
}

interface RawClassUnlock {
  name: string;
  requirement: string;
}

interface RawClass {
  name: string;
  id: string;
  description: string;
  buffs: string;
  debuffs: string;
  unlockMethod: string;
  levelStats: string;
  basicAction: string;
  archetypes: RawClassArchetype[];
  unlocks: RawClassUnlock[];
  categories: string[];
}

interface RawAbility {
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

interface TiersFile {
  items: Record<string, { tier: string; reason: string }>;
  abilities: Record<string, { tier: string; reason: string }>;
}

interface StatMap {
  [stat: string]: number;
}

interface CombinedItem {
  name: string;
  internalName: string;
  description: string;
  slot: string;
  rarity: string;
  sets: string[];
  statusEffects: string[];
  itemPools: string[];
  categories: string[];
  tier: string;
  tierReason: string;
  relatedItems: string[];
  hasSprite: boolean;
}

interface CombinedClassArchetype {
  name: string;
  description: string;
}

interface CombinedClassUnlock {
  name: string;
  requirement: string;
}

interface CombinedClass {
  name: string;
  id: string;
  description: string;
  buffs: StatMap;
  debuffs: StatMap;
  levelStats: string[];
  basicAction: string;
  archetypes: CombinedClassArchetype[];
  unlocks: CombinedClassUnlock[];
  abilities: string[];
  abilityCount: number;
  recommendedSets: string[];
}

interface SetRecommendation {
  className: string;
  reason: string;
}

interface SetItemDetail {
  name: string;
  slot: string;
  rarity: string;
  tier: string;
}

interface CombinedSet {
  name: string;
  description: string;
  items: string[];
  itemDetails: SetItemDetail[];
  avgTier: string;
  statusEffects: string[];
  recommendedClasses: string[];
  recommendations: SetRecommendation[];
}

interface CombinedAbility {
  name: string;
  id: string;
  description: string;
  class: string;
  type: string;
  mana: string;
  power: string;
  powerType: string;
  elements: string[];
  tier: string;
  tierReason: string;
  upgradeDescription: string;
  hasSprite: boolean;
}

// ─── Stats counters ──────────────────────────────────────────────────────────

const fixes: Record<string, number> = {
  rarityBleeding: 0,
  setBleeding: 0,
  statusEffectsBleeding: 0,
  collarlessBuffsFix: 0,
  metaPagesSkipped: 0,
  wikiMarkupStripped: 0,
};

// ─── Wiki markup cleaning ────────────────────────────────────────────────────

function stripWikiMarkup(text: string): string {
  if (!text) return "";
  let cleaned = text;

  // {{flav|...}} — flavor text wrapper
  cleaned = cleaned.replace(/\{\{flav\|([^}]*)\}\}/gi, "$1");
  // {{a|...}} — ability links
  cleaned = cleaned.replace(/\{\{a\|([^}]*)\}\}/gi, "$1");
  // {{i|...}} — item links
  cleaned = cleaned.replace(/\{\{i\|([^}]*)\}\}/gi, "$1");
  // {{p|...}} — passive links
  cleaned = cleaned.replace(/\{\{p\|([^}]*)\}\}/gi, "$1");
  // {{st|Name|...}} — status effect with optional params
  cleaned = cleaned.replace(/\{\{st\|([^|}]+)[^}]*\}\}/gi, "$1");
  // {{Stat|Name|...}} — stat references
  cleaned = cleaned.replace(/\{\{Stat\|([^|}]+)[^}]*\}\}/gi, "$1");
  // {{stat|Name|...}} — lowercase variant
  cleaned = cleaned.replace(/\{\{stat\|([^|}]+)[^}]*\}\}/gi, "$1");
  // {{Icon|Name|...}} — icon references
  cleaned = cleaned.replace(/\{\{Icon\|([^|}]+)[^}]*\}\}/gi, "$1");
  // {{icon|Name|...}} — lowercase variant
  cleaned = cleaned.replace(/\{\{icon\|([^|}]+)[^}]*\}\}/gi, "$1");
  // Any remaining {{...}} templates — take first param
  cleaned = cleaned.replace(/\{\{([^|}]+)[^}]*\}\}/g, "$1");

  // Protect deep-link markers [[ability:X]], [[item:X]], [[stat:X]], [[class:X]], [[status:X]]
  cleaned = cleaned.replace(/\[\[(ability|item|stat|class|status):([^\]]+)\]\]/g, "%DEEP%$1:$2%ENDDEEP%");
  // [[Link|Display]] → Display
  cleaned = cleaned.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
  // [[Link]] → Link
  cleaned = cleaned.replace(/\[\[([^\]]+)\]\]/g, "$1");
  // Restore deep-link markers
  cleaned = cleaned.replace(/%DEEP%([^%]+)%ENDDEEP%/g, "[[$1]]");

  // HTML comments <!-- ... -->
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

  // '''bold''' → bold
  cleaned = cleaned.replace(/'''([^']+)'''/g, "$1");
  // ''italic'' → italic
  cleaned = cleaned.replace(/''([^']+)''/g, "$1");

  // <br>, <br/>, <br />
  cleaned = cleaned.replace(/<br\s*\/?>/gi, " ");
  // HTML comments <!-- ... -->
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
  // ==Section== headers
  cleaned = cleaned.replace(/={2,}[^=]+={2,}/g, "");

  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

// ─── Stat parsing ────────────────────────────────────────────────────────────

function parseStats(raw: string): StatMap {
  const result: StatMap = {};
  if (!raw || raw.startsWith("|")) return result;

  // Format: "STR=2, SPD=1" or "CON=4"
  const parts = raw.split(",").map((s) => s.trim());
  for (const part of parts) {
    const match = part.match(/^([A-Z]{2,4})=(\d+)$/i);
    if (match) {
      result[match[1].toUpperCase()] = parseInt(match[2], 10);
    }
  }
  return result;
}

// ─── CSV parsing helper ──────────────────────────────────────────────────────

function sanitizeFieldValue(raw: string): string {
  if (!raw) return "";
  let cleaned = raw;
  // Strip HTML comments: <!-- ... -->
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
  // Strip HTML entities: &#42; etc.
  cleaned = cleaned.replace(/&#\d+;/g, "");
  // Strip stray wiki template braces
  cleaned = cleaned.replace(/\{\{/g, "").replace(/\}\}/g, "");
  return cleaned.trim();
}

function parseCSV(raw: string): string[] {
  if (!raw) return [];
  const sanitized = sanitizeFieldValue(raw);
  if (!sanitized) return [];
  return sanitized
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Bleeding field extraction ───────────────────────────────────────────────

function extractBleedingValue(field: string): { ownValue: string; bleedValue: string } {
  // Pattern: "| FieldName = value" or "| FieldName ="
  const match = field.match(/^\|\s*\w+\s*=\s*(.*)$/);
  if (match) {
    return { ownValue: "", bleedValue: match[1].trim() };
  }
  return { ownValue: field, bleedValue: "" };
}

// ─── Load JSON files from a directory ────────────────────────────────────────

function loadJsonDir<T>(dir: string, skip: string[]): T[] {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const results: T[] = [];
  for (const file of files) {
    if (skip.includes(file)) {
      fixes.metaPagesSkipped++;
      continue;
    }
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as T;
    results.push(data);
  }
  return results;
}

// ─── Sprite check helpers ────────────────────────────────────────────────────

function buildSpriteSet(dir: string): Set<string> {
  if (!fs.existsSync(dir)) return new Set();
  return new Set(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .map((f) => f.replace(/\.png$/, ""))
  );
}

/** Convert item/ability name to the wiki-style sprite filename (without extension) */
function nameToSpriteKey(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s_-]/g, "_") // Non-alphanumeric → underscore
    .replace(/\s+/g, "_")               // Spaces → underscores
    .replace(/^_+/, "_");               // Normalize leading underscores
}

function hasSprite(name: string, internalName: string, spriteSet: Set<string>): boolean {
  // Try internalName first (camelCase)
  if (internalName && spriteSet.has(internalName)) return true;
  // Try name with spaces → underscores
  if (spriteSet.has(name.replace(/\s+/g, "_"))) return true;
  // Try wiki-style encoding
  const wikiKey = nameToSpriteKey(name);
  if (spriteSet.has(wikiKey)) return true;
  // Items starting with special chars get prefixed with _
  if (spriteSet.has("_" + wikiKey)) return true;
  return false;
}

// ─── Tier helpers ────────────────────────────────────────────────────────────

const TIER_VALUES: Record<string, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 };
const VALUE_TO_TIER: Record<number, string> = { 5: "S", 4: "A", 3: "B", 2: "C", 1: "D" };

function avgTier(tiers: string[]): string {
  const valid = tiers.map((t) => TIER_VALUES[t]).filter((v) => v !== undefined);
  if (valid.length === 0) return "";
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  const rounded = Math.round(avg);
  return VALUE_TO_TIER[Math.max(1, Math.min(5, rounded))] ?? "";
}

// ─── Status effect → class role mapping ──────────────────────────────────────

const STATUS_EFFECT_CLASS_MAP: Record<string, { classes: string[]; reason: string }> = {
  Thorns: { classes: ["Tank", "Fighter", "Monk"], reason: "Thorns synergy with melee class" },
  Brace: { classes: ["Tank", "Fighter", "Monk"], reason: "Brace synergy with defensive class" },
  Shield: { classes: ["Tank", "Fighter", "Monk"], reason: "Shield synergy with defensive class" },
  Lifesteal: { classes: ["Butcher", "Thief", "Hunter"], reason: "Lifesteal synergy with aggressive class" },
  Bleed: { classes: ["Butcher", "Thief", "Hunter"], reason: "Bleed synergy with aggressive class" },
  Holy: { classes: ["Cleric"], reason: "Holy synergy with Cleric" },
  Heal: { classes: ["Cleric"], reason: "Heal synergy with Cleric" },
  Mana: { classes: ["Mage", "Psychic", "Druid"], reason: "Mana synergy with spellcasting class" },
  "Mana Regen": { classes: ["Mage", "Psychic", "Druid"], reason: "Mana regen synergy with spellcasting class" },
  Charge: { classes: ["Mage", "Psychic", "Druid"], reason: "Charge synergy with spellcasting class" },
  Poison: { classes: ["Necromancer"], reason: "Poison synergy with Necromancer" },
  Madness: { classes: ["Necromancer"], reason: "Madness synergy with Necromancer" },
  Luck: { classes: ["Thief", "Jester", "Hunter"], reason: "Luck synergy with luck-based class" },
  Crit: { classes: ["Thief", "Jester", "Hunter"], reason: "Crit synergy with crit-based class" },
  "Critical Hit": { classes: ["Thief", "Jester", "Hunter"], reason: "Critical Hit synergy with crit-based class" },
  Stealth: { classes: ["Thief"], reason: "Stealth synergy with Thief" },
  Summon: { classes: ["Druid", "Necromancer", "Tinkerer"], reason: "Summon synergy with summoner class" },
  Familiar: { classes: ["Druid", "Necromancer", "Tinkerer"], reason: "Familiar synergy with summoner class" },
};

// ─── All known class names ───────────────────────────────────────────────────

const ALL_CLASS_NAMES = [
  "Fighter", "Hunter", "Mage", "Tank", "Druid", "Cleric",
  "Thief", "Monk", "Tinkerer", "Psychic", "Jester", "Butcher",
  "Necromancer", "Collarless",
];

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  console.log("=== Combine Data: Loading raw data ===\n");

  // Load tiers
  const tiers: TiersFile = JSON.parse(fs.readFileSync(TIERS_PATH, "utf-8"));

  // Load set descriptions (parsed from wiki Sets page)
  const SET_DESC_PATH = path.join(DATA_DIR, "set-descriptions.json");
  const setDescriptions: Record<string, string> = fs.existsSync(SET_DESC_PATH)
    ? JSON.parse(fs.readFileSync(SET_DESC_PATH, "utf-8"))
    : {};

  // Load sprite sets
  const itemSprites = buildSpriteSet(path.join(SPRITES_DIR, "png"));
  const classSprites = buildSpriteSet(path.join(SPRITES_DIR, "classes"));
  const abilitySprites = buildSpriteSet(path.join(SPRITES_DIR, "abilities"));

  // ─── Step 1: Load & clean items ──────────────────────────────────────────

  // Meta/category pages to skip (not real game entities)
  const SKIP_ITEMS = ["Boss_Items.json"];
  const SKIP_CLASSES = ["Classes.json"];
  const SKIP_ABILITIES = [
    "Abilities.json",
    "Disorders.json",
    "Supplementary_Abilities.json",
    "Contextual_Replacement_Abilities.json",
  ];

  const rawItems = loadJsonDir<RawItem>(ITEMS_DIR, SKIP_ITEMS);
  console.log(`Loaded ${rawItems.length} raw items`);

  const cleanedItems: CombinedItem[] = [];

  for (const item of rawItems) {
    let { rarity, slot, set, statusEffects, itemPools } = item;

    // Fix rarity bleeding: "| Slot = Weapon" in rarity field
    if (rarity.startsWith("|")) {
      const extracted = extractBleedingValue(rarity);
      rarity = "";
      if (!slot && extracted.bleedValue) {
        slot = extracted.bleedValue;
      }
      fixes.rarityBleeding++;
    }

    // Fix set bleeding: "| StatusEffects = ..." in set field
    if (set.startsWith("|")) {
      const extracted = extractBleedingValue(set);
      set = "";
      if (!statusEffects && extracted.bleedValue) {
        statusEffects = extracted.bleedValue;
      }
      fixes.setBleeding++;
    }

    // Fix statusEffects bleeding: "| ItemPools = ..." in statusEffects field
    if (statusEffects.startsWith("|")) {
      const extracted = extractBleedingValue(statusEffects);
      statusEffects = "";
      if (!itemPools && extracted.bleedValue) {
        itemPools = extracted.bleedValue;
      }
      fixes.statusEffectsBleeding++;
    }

    // Parse sets (comma-separated, multi-set items)
    const sets = parseCSV(set);

    // Parse statusEffects — strip "=N", "=N/M", "=N%", "=N+" values, just keep effect names
    const parsedStatusEffects = parseCSV(statusEffects)
      .map((se) => se.replace(/=[\d/+%.]+$/, "").trim())
      .filter((se) => se && /^[A-Za-z]/.test(se));

    // Parse itemPools
    const parsedItemPools = parseCSV(itemPools);

    // Clean description
    const rawDesc = item.description || item.effects || "";
    const cleanDesc = stripWikiMarkup(rawDesc);
    if (cleanDesc !== rawDesc) fixes.wikiMarkupStripped++;

    // Tier lookup
    const tierData = tiers.items[item.name];

    cleanedItems.push({
      name: item.name,
      internalName: item.internalName,
      description: cleanDesc,
      slot: slot.replace(/<!--[\s\S]*?-->/g, "").trim(),
      rarity: rarity.replace(/<!--[\s\S]*?-->/g, "").trim(),
      sets,
      statusEffects: parsedStatusEffects,
      itemPools: parsedItemPools,
      categories: item.categories ?? [],
      tier: tierData?.tier ?? "",
      tierReason: tierData?.reason ?? "",
      relatedItems: [], // filled after grouping by set
      hasSprite: hasSprite(item.name, item.internalName, itemSprites),
    });
  }

  // ─── Step 1b: Load & clean classes ───────────────────────────────────────

  const rawClasses = loadJsonDir<RawClass>(CLASSES_DIR, SKIP_CLASSES);
  console.log(`Loaded ${rawClasses.length} raw classes`);

  const cleanedClasses: CombinedClass[] = [];

  for (const cls of rawClasses) {
    let { buffs, debuffs } = cls;

    // Fix Collarless: buffs = "| Debuffs ="
    if (buffs.startsWith("|")) {
      buffs = "";
      fixes.collarlessBuffsFix++;
    }
    if (debuffs.startsWith("|")) {
      debuffs = "";
    }

    const cleanDesc = stripWikiMarkup(cls.description);
    if (cleanDesc !== cls.description) fixes.wikiMarkupStripped++;

    // Parse levelStats: "Str, Con, Spd" → ["STR", "CON", "SPD"]
    const levelStats = parseCSV(cls.levelStats).map((s) => s.toUpperCase());

    cleanedClasses.push({
      name: cls.name,
      id: cls.id,
      description: cleanDesc,
      buffs: parseStats(buffs),
      debuffs: parseStats(debuffs),
      levelStats,
      basicAction: stripWikiMarkup(cls.basicAction ?? ""),
      archetypes: (cls.archetypes ?? []).map((a) => ({
        name: a.name,
        description: stripWikiMarkup(a.description),
      })),
      unlocks: (cls.unlocks ?? []).map((u) => ({
        name: stripWikiMarkup(u.name),
        requirement: stripWikiMarkup(u.requirement),
      })),
      abilities: [], // filled in step 2
      abilityCount: 0,
      recommendedSets: [], // filled in step 3
    });
  }

  // ─── Step 1c: Load & clean abilities ─────────────────────────────────────

  const rawAbilities = loadJsonDir<RawAbility>(ABILITIES_DIR, SKIP_ABILITIES);
  console.log(`Loaded ${rawAbilities.length} raw abilities`);

  const cleanedAbilities: CombinedAbility[] = [];

  for (const ability of rawAbilities) {
    const cleanDesc = stripWikiMarkup(ability.description);
    const cleanUpgrade = stripWikiMarkup(ability.upgradeDescription);
    if (cleanDesc !== ability.description || cleanUpgrade !== ability.upgradeDescription) {
      fixes.wikiMarkupStripped++;
    }

    // Normalize elements: split comma-separated, consistent casing
    const elements = parseCSV(ability.element).map(
      (e) => e.charAt(0).toUpperCase() + e.slice(1).toLowerCase()
    );

    // Tier lookup
    const tierData = tiers.abilities[ability.name];

    cleanedAbilities.push({
      name: ability.name,
      id: ability.id || ability.name,
      description: cleanDesc,
      class: ability.class || "",
      type: (ability.type || "").toLowerCase(),
      mana: ability.mana || "",
      power: ability.power || "",
      powerType: (ability.powerType || "").toLowerCase(),
      elements,
      tier: tierData?.tier ?? "",
      tierReason: tierData?.reason ?? "",
      upgradeDescription: cleanUpgrade,
      hasSprite: hasSprite(ability.name, ability.id, abilitySprites),
    });
  }

  // ─── Step 2: Cross-reference ─────────────────────────────────────────────

  console.log("\n=== Step 2: Building cross-references ===\n");

  // Link abilities to classes
  const classAbilityMap = new Map<string, string[]>();
  for (const ability of cleanedAbilities) {
    if (ability.class) {
      const existing = classAbilityMap.get(ability.class) ?? [];
      existing.push(ability.name);
      classAbilityMap.set(ability.class, existing);
    }
  }

  for (const cls of cleanedClasses) {
    cls.abilities = classAbilityMap.get(cls.name) ?? [];
    cls.abilityCount = cls.abilities.length;
  }

  // Build sets from items
  const setMap = new Map<string, CombinedItem[]>();
  for (const item of cleanedItems) {
    for (const setName of item.sets) {
      const existing = setMap.get(setName) ?? [];
      existing.push(item);
      setMap.set(setName, existing);
    }
  }

  // Fill relatedItems (other items in the same set(s))
  for (const item of cleanedItems) {
    const related = new Set<string>();
    for (const setName of item.sets) {
      const setItems = setMap.get(setName) ?? [];
      for (const si of setItems) {
        if (si.name !== item.name) related.add(si.name);
      }
    }
    item.relatedItems = Array.from(related).sort();
  }

  // ─── Step 3: Set-to-class recommendations ───────────────────────────────

  console.log("=== Step 3: Computing set recommendations ===\n");

  const combinedSets: CombinedSet[] = [];

  for (const [setName, items] of setMap) {
    // Collect all status effects across set items
    const allEffects = new Set<string>();
    for (const item of items) {
      for (const effect of item.statusEffects) {
        allEffects.add(effect);
      }
    }

    // Item details
    const itemDetails: SetItemDetail[] = items.map((item) => ({
      name: item.name,
      slot: item.slot,
      rarity: item.rarity,
      tier: item.tier,
    }));

    // Compute avgTier
    const itemTiers = items.map((i) => i.tier).filter(Boolean);
    const setAvgTier = avgTier(itemTiers);

    // Recommendations
    const recommendations: SetRecommendation[] = [];
    const recommendedClassSet = new Set<string>();

    // 1. Direct name match
    if (ALL_CLASS_NAMES.includes(setName)) {
      recommendations.push({
        className: setName,
        reason: `${setName} class set`,
      });
      recommendedClassSet.add(setName);
    }

    // 2. Status effect → class mapping
    for (const effect of allEffects) {
      const mapping = STATUS_EFFECT_CLASS_MAP[effect];
      if (mapping) {
        for (const className of mapping.classes) {
          if (!recommendedClassSet.has(className)) {
            recommendations.push({
              className,
              reason: mapping.reason,
            });
            recommendedClassSet.add(className);
          }
        }
      }
    }

    // Set description from wiki, cleaned of markup
    const rawSetDesc = setDescriptions[setName] ?? "";
    const cleanSetDesc = stripWikiMarkup(rawSetDesc);

    combinedSets.push({
      name: setName,
      description: cleanSetDesc,
      items: items.map((i) => i.name).sort(),
      itemDetails,
      avgTier: setAvgTier,
      statusEffects: Array.from(allEffects).sort(),
      recommendedClasses: Array.from(recommendedClassSet).sort(),
      recommendations,
    });
  }

  // Sort sets by name
  combinedSets.sort((a, b) => a.name.localeCompare(b.name));

  // Link recommended sets back to classes
  for (const cls of cleanedClasses) {
    const recSets = combinedSets
      .filter((s) => s.recommendedClasses.includes(cls.name))
      .map((s) => s.name);
    cls.recommendedSets = recSets.sort();
  }

  // ─── Step 5: Write output ────────────────────────────────────────────────

  console.log("=== Writing combined data ===\n");

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Sort items/abilities by name for stable output
  cleanedItems.sort((a, b) => a.name.localeCompare(b.name));
  cleanedClasses.sort((a, b) => a.name.localeCompare(b.name));
  cleanedAbilities.sort((a, b) => a.name.localeCompare(b.name));

  fs.writeFileSync(path.join(OUT_DIR, "items.json"), JSON.stringify(cleanedItems, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "classes.json"), JSON.stringify(cleanedClasses, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "abilities.json"), JSON.stringify(cleanedAbilities, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "sets.json"), JSON.stringify(combinedSets, null, 2));

  // Copy status-effects.json to combined output if it exists
  const statusEffectsPath = path.join(DATA_DIR, "status-effects.json");
  if (fs.existsSync(statusEffectsPath)) {
    fs.copyFileSync(statusEffectsPath, path.join(OUT_DIR, "status-effects.json"));
    const effectCount = JSON.parse(fs.readFileSync(statusEffectsPath, "utf-8")).length;
    console.log(`  Status effects: ${effectCount} copied to combined output`);
  }

  // ─── Step 5: Stats summary ──────────────────────────────────────────────

  console.log("=== Stats Summary ===\n");

  console.log(`Total entities processed:`);
  console.log(`  Items:     ${cleanedItems.length}`);
  console.log(`  Classes:   ${cleanedClasses.length}`);
  console.log(`  Abilities: ${cleanedAbilities.length}`);

  console.log(`\nParsing fixes applied:`);
  for (const [fixName, count] of Object.entries(fixes)) {
    console.log(`  ${fixName}: ${count}`);
  }

  console.log(`\nSets found: ${combinedSets.length}`);
  for (const set of combinedSets.slice(0, 20)) {
    console.log(`  ${set.name}: ${set.items.length} items (avg tier: ${set.avgTier || "N/A"})`);
  }
  if (combinedSets.length > 20) {
    console.log(`  ... and ${combinedSets.length - 20} more sets`);
  }

  console.log(`\nAbilities per class:`);
  for (const cls of cleanedClasses) {
    console.log(`  ${cls.name}: ${cls.abilityCount} abilities`);
  }

  // Tier distribution
  const itemTierDist: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, "": 0 };
  const abilityTierDist: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, "": 0 };

  for (const item of cleanedItems) {
    itemTierDist[item.tier] = (itemTierDist[item.tier] ?? 0) + 1;
  }
  for (const ability of cleanedAbilities) {
    abilityTierDist[ability.tier] = (abilityTierDist[ability.tier] ?? 0) + 1;
  }

  console.log(`\nItem tier distribution:`);
  for (const tier of ["S", "A", "B", "C", "D"]) {
    console.log(`  ${tier}: ${itemTierDist[tier]}`);
  }
  if (itemTierDist[""] > 0) console.log(`  (no tier): ${itemTierDist[""]}`);

  console.log(`\nAbility tier distribution:`);
  for (const tier of ["S", "A", "B", "C", "D"]) {
    console.log(`  ${tier}: ${abilityTierDist[tier]}`);
  }
  if (abilityTierDist[""] > 0) console.log(`  (no tier): ${abilityTierDist[""]}`);

  console.log(`\nDone! Output written to ${OUT_DIR}/`);
}

main();
