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
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = "https://mewgenics.wiki.gg/api.php";
const DATA_DIR = path.resolve(__dirname, "..", "data");
const ITEMS_DIR = path.join(DATA_DIR, "items");
const CLASSES_DIR = path.join(DATA_DIR, "classes");
const ABILITIES_DIR = path.join(DATA_DIR, "abilities");
const SPRITES_PNG_DIR = path.join(DATA_DIR, "sprites", "png");
const RATE_LIMIT_MS = 1000;
const BATCH_SIZE = 50; // MediaWiki max titles per query
const USER_AGENT =
  "MewgenicsScanner/1.0 (https://github.com/mewgenics-scanner; crawler for ML training data)";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDirs() {
  for (const dir of [DATA_DIR, ITEMS_DIR, CLASSES_DIR, ABILITIES_DIR, SPRITES_PNG_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch JSON from the MediaWiki API with User-Agent, maxlag, and retry on 429. */
async function fetchJSON(url: string, retries = 4): Promise<unknown> {
  // Append maxlag=5 per MediaWiki etiquette
  const separator = url.includes("?") ? "&" : "?";
  const fullUrl = `${url}${separator}maxlag=5`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(fullUrl, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (res.status === 429 || res.headers.get("retry-after")) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "5", 10);
      const wait = Math.max(retryAfter, 5) * 1000;
      console.warn(`  [${res.status}] Rate limited, waiting ${wait / 1000}s...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

function toSafeName(itemName: string): string {
  return itemName.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Split array into chunks of given size. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Category fetcher (generic) ──────────────────────────────────────────────

async function fetchCategoryMembers(category: string, label: string): Promise<string[]> {
  const names: string[] = [];
  let cmcontinue: string | undefined;

  console.log(`[${label}] Fetching from ${category}...`);

  do {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: category,
      cmlimit: "500",
      format: "json",
    });
    if (cmcontinue) params.set("cmcontinue", cmcontinue);

    const data = (await fetchJSON(`${API_BASE}?${params}`)) as {
      query: { categorymembers: Array<{ pageid: number; ns: number; title: string }> };
      continue?: { cmcontinue: string };
    };

    for (const member of data.query.categorymembers) {
      if (member.ns === 0) names.push(member.title);
    }

    cmcontinue = data.continue?.cmcontinue;
    if (cmcontinue) {
      console.log(`  ...${names.length} so far`);
      await sleep(RATE_LIMIT_MS);
    }
  } while (cmcontinue);

  console.log(`[${label}] Found ${names.length} entries.`);
  return names;
}

// ─── Phase 2: Parse item pages (batched) ─────────────────────────────────────

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

function parseInfobox(wikitext: string): Record<string, string> {
  const fields: Record<string, string> = {};
  // Use [^\n]* instead of .* to prevent \s* from consuming newlines
  // and bleeding the next field's value into the current field.
  // Also store empty values so downstream code sees every field.
  const regex = /\|\s*(\w+)\s*=([^\n]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(wikitext)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    fields[key] = value;
  }
  return fields;
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

function extractCategories(wikitext: string): string[] {
  const cats: string[] = [];
  const regex = /\[\[Category:([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(wikitext)) !== null) {
    cats.push(match[1].trim());
  }
  return cats;
}

function parseWikitext(title: string, wikitext: string): ItemData {
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

/**
 * Fetch wikitext for up to 50 pages in a single API call using
 * action=query&prop=revisions&rvprop=content&rvslots=main
 */
async function fetchItemsBatch(titles: string[]): Promise<ItemData[]> {
  const params = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    format: "json",
  });

  const data = (await fetchJSON(`${API_BASE}?${params}`)) as {
    query: {
      pages: Record<
        string,
        {
          title: string;
          missing?: string;
          revisions?: Array<{
            slots: { main: { "*": string } };
          }>;
        }
      >;
    };
  };

  const items: ItemData[] = [];
  for (const page of Object.values(data.query.pages)) {
    if (page.missing !== undefined || !page.revisions?.[0]) continue;
    const wikitext = page.revisions[0].slots.main["*"];
    items.push(parseWikitext(page.title, wikitext));
  }
  return items;
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

/** Strip wiki templates — plain text output (for fields where we don't need links) */
function stripWikiTemplates(text: string): string {
  return convertWikiTemplates(text, false);
}

/** Convert wiki templates, optionally preserving [[type:name]] markers for deep linking */
function convertWikiTemplates(text: string, preserveLinks: boolean): string {
  const STAT_ABBREV: Record<string, string> = {
    STR: "STR", STRENGTH: "STR",
    CON: "CON", CONSTITUTION: "CON",
    DEX: "DEX", DEXTERITY: "DEX",
    INT: "INT", INTELLIGENCE: "INT",
    SPD: "SPD", SPEED: "SPD",
    CHA: "CHA", CHARISMA: "CHA",
    LCK: "LCK", LUCK: "LCK",
    HP: "HP", MANA: "MANA",
  };
  const STAT_NAMES: Record<string, string> = {
    STR: "Strength", CON: "Constitution", DEX: "Dexterity",
    INT: "Intelligence", SPD: "Speed", CHA: "Charisma", LCK: "Luck",
    HP: "HP", MANA: "Mana",
  };

  // {{Stat|STR|+2}}, {{Stat|Charisma|+2}}, {{stat|CHA}}
  text = text.replace(/\{\{[Ss]tat\|([^|}]+)(?:\|([^}]*))?\}\}/g, (_m, stat, val) => {
    const abbrev = STAT_ABBREV[stat.trim().toUpperCase()] ?? stat.trim().toUpperCase();
    const name = STAT_NAMES[abbrev] ?? stat.trim();
    if (preserveLinks) {
      return val ? `${val} [[stat:${abbrev}]]` : `[[stat:${abbrev}]]`;
    }
    return val ? `${val} ${name}` : name;
  });

  // {{a|Name}} → [[ability:Name]] or just Name
  text = text.replace(/\{\{[ap]\|([^}|]+?)(?:\|[^}]*)?\}\}/gi, (_m, name) => {
    return preserveLinks ? `[[ability:${name}]]` : name;
  });

  // {{i|Name}} → [[item:Name]] or just Name
  text = text.replace(/\{\{i\|([^}|]+?)(?:\|[^}]*)?\}\}/gi, (_m, name) => {
    return preserveLinks ? `[[item:${name}]]` : name;
  });

  // {{Class|Name}} → [[class:Name]] or just Name
  text = text.replace(/\{\{Class\|([^}|]+?)(?:\|[^}]*)?\}\}/gi, (_m, name) => {
    return preserveLinks ? `[[class:${name}]]` : name;
  });

  // {{Status|Name}} → [[status:Name]] or just Name
  text = text.replace(/\{\{Status\|([^}|]+?)(?:\|[^}]*)?\}\}/gi, (_m, name) => {
    return preserveLinks ? `[[status:${name}]]` : name;
  });

  // {{d|Name}} (disorders), {{b|Name|Display}} (bosses) — just text, no deep link
  text = text
    .replace(/\{\{d\|([^}|]+?)(?:\|[^}]*)?\}\}/gi, "$1")
    .replace(/\{\{b\|([^}|]+?)(?:\|([^}]+))?\}\}/gi, (_m, name, display) => display ?? name)
    .replace(/\{\{(?:Chapter|Icon)\|([^}|]+?)(?:\|[^}]*)?\}\}/gi, "$1")
    .replace(/\{\{[^}]*\}\}/g, "");

  // Temporarily protect our deep-link markers from wiki link stripping
  if (preserveLinks) {
    text = text.replace(/\[\[(ability|item|class|status|stat):([^\]]+)\]\]/g,
      (_m, type, name) => `%LINK%${type}:${name}%ENDLINK%`);
  }

  // Wiki links
  text = text
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, link, txt) => txt ?? link)
    .replace(/'''([^']+)'''/g, "$1")
    .replace(/''([^']+)''/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();

  // Restore markers to [[type:name]] format
  if (preserveLinks) {
    text = text.replace(/%LINK%([^%]+)%ENDLINK%/g, "[[$1]]");
  }

  return text;
}

function parseOverviewBody(wikitext: string): string {
  const m = wikitext.match(/==\s*Overview\s*==\s*\n([\s\S]*?)(?=\n===|$)/i);
  if (!m) return "";
  let text = m[1];
  // Strip wiki tables {| ... |}
  text = text.replace(/\{\|[\s\S]*?\|\}/g, "");
  // Convert templates with preserved links
  text = convertWikiTemplates(text, true);
  // Clean bullet markers (* at start of line → plain text)
  text = text.replace(/^\*\s*/gm, "");
  // Collapse excessive whitespace
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

function parseArchetypes(wikitext: string): ClassArchetype[] {
  // Match ===Archetypes=== section, stop at next === or == heading
  const m = wikitext.match(/===\s*Archetypes\s*===\s*\n([\s\S]*?)(?=\n===|\n==[^=]|$)/i);
  if (!m) return [];
  const section = m[1];

  const archetypes: ClassArchetype[] = [];
  // Split on top-level bullets (* '''Name:''')
  // Each archetype starts with * '''Name:''' and includes all ** sub-bullets until next * or end
  const blocks = section.split(/(?=^\*\s*''')/m).filter((b) => b.trim());

  for (const block of blocks) {
    const headerMatch = block.match(/^\*\s*'''([^']+?)(?::)?''':?\s*(.*)/);
    if (!headerMatch) continue;

    const name = headerMatch[1].trim().replace(/:$/, "");
    // Collect all lines in this block
    const lines = block.split("\n");
    const descParts: string[] = [];

    for (let li = 0; li < lines.length; li++) {
      const trimmed = lines[li].trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("*")) {
        const content = trimmed.replace(/^\*+\s*/, "");
        const converted = convertWikiTemplates(content, true);
        if (li === 0) {
          // First line repeats "Name: Description" — strip the name prefix
          const afterName = converted.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:?\\s*`, "i"), "");
          if (afterName) descParts.push(afterName);
        } else {
          descParts.push(converted);
        }
      }
    }

    archetypes.push({
      name,
      description: descParts.join("\n"),
    });
  }
  return archetypes;
}

function parseUnlocks(wikitext: string): ClassUnlock[] {
  // Match ==Unlocks== section
  const m = wikitext.match(/==\s*Unlocks\s*==\s*\n([\s\S]*?)(?=\n==[^=]|$)/i);
  if (!m) return [];
  const section = m[1];

  const unlocks: ClassUnlock[] = [];
  // Format: | {{a|Name}} || Requirement text
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
  // Use the rich overview body text instead of just the infobox description
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
  const params = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    format: "json",
  });

  const data = (await fetchJSON(`${API_BASE}?${params}`)) as {
    query: {
      pages: Record<string, {
        title: string;
        missing?: string;
        revisions?: Array<{ slots: { main: { "*": string } } }>;
      }>;
    };
  };

  const classes: ClassData[] = [];
  for (const page of Object.values(data.query.pages)) {
    if (page.missing !== undefined || !page.revisions?.[0]) continue;
    const wikitext = page.revisions[0].slots.main["*"];
    // Skip redirect pages
    if (wikitext.startsWith("#REDIRECT")) continue;
    classes.push(parseClassWikitext(page.title, wikitext));
  }
  return classes;
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
  const params = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    format: "json",
  });

  const data = (await fetchJSON(`${API_BASE}?${params}`)) as {
    query: {
      pages: Record<string, {
        title: string;
        missing?: string;
        revisions?: Array<{ slots: { main: { "*": string } } }>;
      }>;
    };
  };

  const abilities: AbilityData[] = [];
  for (const page of Object.values(data.query.pages)) {
    if (page.missing !== undefined || !page.revisions?.[0]) continue;
    const wikitext = page.revisions[0].slots.main["*"];
    // Skip redirect pages
    if (wikitext.startsWith("#REDIRECT")) continue;
    abilities.push(parseAbilityWikitext(page.title, wikitext));
  }
  return abilities;
}

// ─── Phase 3: Download sprites (batched lookups) ─────────────────────────────

/**
 * Look up sprite URLs in batches. Tries both .png and .svg since the wiki
 * uses both formats. MediaWiki supports up to 50 titles per query.
 * @param prefix - File prefix on the wiki (e.g. "ITEM", "CLASS", "ABILITY")
 * @param extensions - File extensions to try, in order (e.g. ["png", "svg"])
 */
async function fetchSpriteUrlsBatch(
  names: string[],
  prefix = "ITEM",
  extensions = ["png", "svg"],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const prefixPattern = new RegExp(`^File:${prefix}[_ ](.+)\\.(png|svg)$`, "i");

  for (const ext of extensions) {
    const remaining = names.filter((n) => !result.has(n));
    if (remaining.length === 0) break;

    const batches = chunk(remaining, BATCH_SIZE);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const titles = batch
        .map((name) => `File:${prefix}_${name.replace(/ /g, "_")}.${ext}`)
        .join("|");

      const params = new URLSearchParams({
        action: "query",
        titles,
        prop: "imageinfo",
        iiprop: "url",
        format: "json",
      });

      try {
        const data = (await fetchJSON(`${API_BASE}?${params}`)) as {
          query: {
            pages: Record<
              string,
              {
                title: string;
                missing?: string;
                imageinfo?: Array<{ url: string }>;
              }
            >;
          };
        };

        for (const page of Object.values(data.query.pages)) {
          if (!page.imageinfo?.[0]?.url) continue;
          const m = page.title.match(prefixPattern);
          if (m) {
            const extracted = m[1].replace(/_/g, " ");
            const original = batch.find(
              (n) => n.toLowerCase().replace(/_/g, " ") === extracted.toLowerCase().replace(/_/g, " "),
            );
            if (original) result.set(original, page.imageinfo[0].url);
          }
        }
      } catch (err) {
        console.warn(`  [WARN] Sprite lookup batch ${i + 1} (.${ext}) failed:`, err);
      }

      if (i < batches.length - 1) await sleep(RATE_LIMIT_MS);
    }

    console.log(`  After .${ext} pass: ${result.size} URLs found`);
    await sleep(RATE_LIMIT_MS);
  }

  return result;
}

/** Download a single sprite image. Serial with retry on 429. */
async function downloadSprite(url: string, name: string, targetDir = SPRITES_PNG_DIR): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") ?? "5", 10);
        const wait = Math.max(retryAfter, 5) * 1000;
        console.warn(`  [429] Image rate limited, waiting ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) return false;
      const buffer = Buffer.from(await res.arrayBuffer());

      const png = await sharp(buffer)
        .resize(224, 224, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .png()
        .toBuffer();

      fs.writeFileSync(path.join(targetDir, `${toSafeName(name)}.png`), png);
      return true;
    } catch (err) {
      if (attempt === 2) {
        console.warn(`  [ERR] ${name}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  return false;
}

/** Generic batch download sprites with progress logging */
async function downloadSpritesBatch(
  names: string[],
  spriteUrls: Map<string, string>,
  targetDir = SPRITES_PNG_DIR,
): Promise<{ downloaded: number; ok: number }> {
  let dlCount = 0;
  let dlOk = 0;
  for (const name of names) {
    const url = spriteUrls.get(name);
    if (url) {
      const ok = await downloadSprite(url, name, targetDir);
      if (ok) dlOk++;
      dlCount++;
      if (dlCount % 50 === 0) {
        console.log(`  ...${dlCount}/${spriteUrls.size} downloaded (${dlOk} ok)`);
      }
      await sleep(200);
    }
  }
  console.log(`  ...${dlCount}/${spriteUrls.size} downloaded (${dlOk} ok)`);
  return { downloaded: dlCount, ok: dlOk };
}

// ─── Main ────────────────────────────────────────────────────────────────────

/** Generic batched fetch + cache for any entity type */
async function fetchAndCacheEntities<T extends { name: string }>(
  names: string[],
  cacheDir: string,
  fetchBatch: (titles: string[]) => Promise<T[]>,
  label: string,
): Promise<T[]> {
  console.log(`[${label}] Fetching data in batches of ${BATCH_SIZE}...`);
  const all: T[] = [];
  const batches = chunk(names, BATCH_SIZE);

  const uncachedBatches: string[][] = [];
  for (const batch of batches) {
    const uncached: string[] = [];
    for (const name of batch) {
      const filePath = path.join(cacheDir, `${toSafeName(name)}.json`);
      if (fs.existsSync(filePath)) {
        try {
          all.push(JSON.parse(fs.readFileSync(filePath, "utf-8")) as T);
          continue;
        } catch { /* re-fetch */ }
      }
      uncached.push(name);
    }
    if (uncached.length > 0) uncachedBatches.push(uncached);
  }

  if (all.length > 0) {
    console.log(`  ${all.length} loaded from cache`);
  }

  for (let i = 0; i < uncachedBatches.length; i++) {
    const batch = uncachedBatches[i];
    try {
      const entities = await fetchBatch(batch);
      for (const entity of entities) {
        all.push(entity);
        fs.writeFileSync(
          path.join(cacheDir, `${toSafeName(entity.name)}.json`),
          JSON.stringify(entity, null, 2),
        );
      }
      console.log(
        `  Batch ${i + 1}/${uncachedBatches.length}: ${entities.length}/${batch.length} parsed (${all.length} total)`,
      );
    } catch (err) {
      console.warn(`  [ERR] Batch ${i + 1} failed:`, err);
    }
    if (i < uncachedBatches.length - 1) await sleep(RATE_LIMIT_MS);
  }

  console.log(`[${label}] ${all.length}/${names.length} parsed.\n`);
  return all;
}

/** Fetch and download sprites for a set of entities */
async function fetchAndDownloadSprites(
  names: string[],
  prefix: string,
  extensions: string[],
  targetDir: string,
  label: string,
): Promise<{ saved: number; missing: string[] }> {
  let existing = 0;
  const need: string[] = [];
  for (const name of names) {
    if (fs.existsSync(path.join(targetDir, `${toSafeName(name)}.png`))) {
      existing++;
    } else {
      need.push(name);
    }
  }

  if (existing > 0) console.log(`[${label}] ${existing} sprites already cached`);

  if (need.length === 0) {
    console.log(`[${label}] All sprites already downloaded.`);
  } else {
    console.log(`[${label}] Looking up sprite URLs for ${need.length} entries...`);
    const spriteUrls = await fetchSpriteUrlsBatch(need, prefix, extensions);
    console.log(`[${label}] Found ${spriteUrls.size} sprite URLs. Downloading...`);
    await downloadSpritesBatch(need, spriteUrls, targetDir);
  }

  const saved = names.filter((n) =>
    fs.existsSync(path.join(targetDir, `${toSafeName(n)}.png`)),
  ).length;
  const missing = names.filter((n) =>
    !fs.existsSync(path.join(targetDir, `${toSafeName(n)}.png`)),
  );
  return { saved, missing };
}

async function crawlItems() {
  const itemNames = await fetchCategoryMembers("Category:Items", "Items");
  fs.writeFileSync(path.join(DATA_DIR, "item-list.json"), JSON.stringify(itemNames, null, 2));
  console.log(`Saved ${itemNames.length} item names to data/item-list.json\n`);

  const allItems = await fetchAndCacheEntities(itemNames, ITEMS_DIR, fetchItemsBatch, "Items");

  const result = await fetchAndDownloadSprites(
    allItems.map((i) => i.name), "ITEM", ["png", "svg"], SPRITES_PNG_DIR, "Item Sprites",
  );
  console.log(`  Items: ${allItems.length} parsed, ${result.saved} sprites, ${result.missing.length} missing\n`);
  return result;
}

async function crawlClasses() {
  const classNames = await fetchCategoryMembers("Category:Classes", "Classes");
  fs.writeFileSync(path.join(DATA_DIR, "class-list.json"), JSON.stringify(classNames, null, 2));
  console.log(`Saved ${classNames.length} class names to data/class-list.json\n`);

  const allClasses = await fetchAndCacheEntities(classNames, CLASSES_DIR, fetchClassesBatch, "Classes");

  const CLASS_SPRITES_DIR = path.join(DATA_DIR, "sprites", "classes");
  fs.mkdirSync(CLASS_SPRITES_DIR, { recursive: true });
  const result = await fetchAndDownloadSprites(
    allClasses.map((c) => c.name), "CLASS", ["png", "svg"], CLASS_SPRITES_DIR, "Class Sprites",
  );
  console.log(`  Classes: ${allClasses.length} parsed, ${result.saved} sprites, ${result.missing.length} missing\n`);
  return result;
}

async function crawlAbilities() {
  const abilityNames = await fetchCategoryMembers("Category:Abilities", "Abilities");
  fs.writeFileSync(path.join(DATA_DIR, "ability-list.json"), JSON.stringify(abilityNames, null, 2));
  console.log(`Saved ${abilityNames.length} ability names to data/ability-list.json\n`);

  const allAbilities = await fetchAndCacheEntities(abilityNames, ABILITIES_DIR, fetchAbilitiesBatch, "Abilities");

  const ABILITY_SPRITES_DIR = path.join(DATA_DIR, "sprites", "abilities");
  fs.mkdirSync(ABILITY_SPRITES_DIR, { recursive: true });
  const result = await fetchAndDownloadSprites(
    allAbilities.map((a) => a.name), "ABILITY", ["svg", "png"], ABILITY_SPRITES_DIR, "Ability Sprites",
  );
  console.log(`  Abilities: ${allAbilities.length} parsed, ${result.saved} sprites, ${result.missing.length} missing\n`);
  return result;
}

async function crawlStatusEffects() {
  const STATUS_EFFECTS_DIR = path.join(DATA_DIR, "status-effects");
  const STATUS_SPRITES_DIR = path.join(DATA_DIR, "sprites", "status-effects");
  fs.mkdirSync(STATUS_EFFECTS_DIR, { recursive: true });
  fs.mkdirSync(STATUS_SPRITES_DIR, { recursive: true });

  // Fetch the Status Effects page wikitext to extract names + descriptions
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
    query: { pages: Record<string, { revisions?: Array<{ slots: { main: { "*": string } } }> }> };
  };
  const page = Object.values(data.query.pages)[0];
  const wikitext = page?.revisions?.[0]?.slots.main["*"] ?? "";

  // Parse status effects from wikitext — wiki table has 3 columns:
  // | id="Name"| {{st|Name}} || <center> [[File:...]] \n|| Behavior description
  // We split on |- row separators and extract name + behavior from each row.
  const effects: Array<{ name: string; description: string }> = [];
  const rows = wikitext.split(/\n\|-\s*\n/);
  for (const row of rows) {
    // Match the name from {{st|Name}} in the first column
    const nameMatch = row.match(/\{\{st\|([^}|]+?)(?:\|[^}]*)?\}\}/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    // The behavior/description is after the last || in the row (3rd column)
    // Split by || and take the last piece
    const columns = row.split(/\|\|/);
    if (columns.length < 3) continue;
    // The behavior column may span multiple lines, take everything after the last ||
    const rawDesc = columns.slice(2).join(" ").trim();
    // Take just the first line/sentence for a concise description
    const firstLine = rawDesc.split("\n")[0].trim();
    const desc = stripWikiTemplates(firstLine).trim();
    if (name && desc) {
      effects.push({ name, description: desc });
    }
  }

  console.log(`[Status Effects] Parsed ${effects.length} effects from wiki page.`);
  fs.writeFileSync(
    path.join(DATA_DIR, "status-effects.json"),
    JSON.stringify(effects, null, 2),
  );

  // Also gather effect names from combined items data to catch effects not on the wiki page
  const itemEffectNames = new Set<string>();
  const combinedItemsPath = path.join(DATA_DIR, "combined", "items.json");
  if (fs.existsSync(combinedItemsPath)) {
    const combinedItems = JSON.parse(fs.readFileSync(combinedItemsPath, "utf-8")) as Array<{ statusEffects: string[] }>;
    for (const item of combinedItems) {
      for (const e of item.statusEffects) {
        if (e && /^[A-Za-z]/.test(e)) itemEffectNames.add(e);
      }
    }
    console.log(`[Status Effects] Found ${itemEffectNames.size} unique effects in combined items data.`);
  }
  // Merge: all effect names from wiki page + items
  const allEffectNames = new Set([...effects.map((e) => e.name), ...itemEffectNames]);

  // Download sprites — wiki uses STATUS_<Name>_Icon.svg naming
  const spriteNames = [...allEffectNames].map((name) => `${name}_Icon`);
  const result = await fetchAndDownloadSprites(
    spriteNames, "STATUS", ["svg", "png"], STATUS_SPRITES_DIR, "Status Effect Sprites",
  );
  console.log(`  Status Effects: ${effects.length} described, ${result.saved} sprites, ${result.missing.length} missing\n`);
  return result;
}

const TARGETS = ["items", "classes", "abilities", "effects"] as const;
type Target = (typeof TARGETS)[number];

async function main() {
  ensureDirs();

  // Parse CLI args: npm run crawl -- items classes abilities (or "all")
  const args = process.argv.slice(2).map((a) => a.toLowerCase());
  const targets: Target[] = args.length === 0 || args.includes("all")
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
