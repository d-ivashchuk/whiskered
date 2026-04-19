/**
 * Mewgenics Wiki Crawler
 *
 * Fetches all item data and sprites from mewgenics.wiki.gg using the MediaWiki API.
 *
 * Usage: npm run crawl
 *
 * Output:
 *   data/item-list.json       — array of {name, type, ...} for all items
 *   data/items/<name>.json    — individual item JSON files
 *   data/sprites/png/         — 224x224 PNGs for ML training
 *   data/missing-sprites.json — items without sprites
 */

import * as fs from "node:fs";
import * as path from "node:path";

const API_BASE = "https://mewgenics.wiki.gg/api.php";
const DATA_DIR = path.resolve(import.meta.dirname, "..", "data");
const ITEMS_DIR = path.join(DATA_DIR, "items");
const SPRITES_PNG_DIR = path.join(DATA_DIR, "sprites", "png");
const RATE_LIMIT_MS = 200;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDirs() {
  for (const dir of [DATA_DIR, ITEMS_DIR, SPRITES_PNG_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJSON(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

// ─── Phase 1: Get all item names ─────────────────────────────────────────────

interface CategoryMember {
  pageid: number;
  ns: number;
  title: string;
}

async function fetchAllItemNames(): Promise<string[]> {
  const items: string[] = [];
  let cmcontinue: string | undefined;

  console.log("[Phase 1] Fetching item list from Category:Items...");

  do {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: "Category:Items",
      cmlimit: "500",
      format: "json",
    });
    if (cmcontinue) params.set("cmcontinue", cmcontinue);

    const data = (await fetchJSON(`${API_BASE}?${params}`)) as {
      query: { categorymembers: CategoryMember[] };
      continue?: { cmcontinue: string };
    };

    for (const member of data.query.categorymembers) {
      // Only main namespace pages (ns=0)
      if (member.ns === 0) {
        items.push(member.title);
      }
    }

    cmcontinue = data.continue?.cmcontinue;
    if (cmcontinue) {
      console.log(`  ...fetched ${items.length} items so far, continuing...`);
      await sleep(RATE_LIMIT_MS);
    }
  } while (cmcontinue);

  console.log(`[Phase 1] Found ${items.length} items total.`);
  return items;
}

// ─── Phase 2: Parse item pages ───────────────────────────────────────────────

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
  // Match lines like "| Key = Value"
  const regex = /\|\s*(\w+)\s*=\s*(.*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(wikitext)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (value) fields[key] = value;
  }
  return fields;
}

function extractEffects(wikitext: string): string {
  const effectsMatch = wikitext.match(/==\s*Effects?\s*==\s*\n([\s\S]*?)(?=\n==|$)/);
  if (!effectsMatch) return "";
  return effectsMatch[1]
    .split("\n")
    .map((line) => line.replace(/^\*\s*/, "").trim())
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

async function fetchItemData(itemName: string): Promise<ItemData | null> {
  const params = new URLSearchParams({
    action: "parse",
    page: itemName,
    prop: "wikitext",
    format: "json",
  });

  try {
    const data = (await fetchJSON(`${API_BASE}?${params}`)) as {
      parse?: { wikitext: { "*": string } };
      error?: { info: string };
    };

    if (data.error || !data.parse) {
      console.warn(`  [WARN] Could not parse page: ${itemName}`);
      return null;
    }

    const wikitext = data.parse.wikitext["*"];
    const infobox = parseInfobox(wikitext);
    const effects = extractEffects(wikitext);
    const categories = extractCategories(wikitext);

    return {
      name: itemName,
      internalName: infobox.InternalName ?? "",
      description: infobox.Description ?? "",
      rarity: infobox.Rarity ?? "",
      slot: infobox.Slot ?? "",
      set: infobox.Set ?? "",
      statusEffects: infobox.StatusEffects ?? "",
      itemPools: infobox.ItemPools ?? "",
      damage: infobox.Damage ?? "",
      effects,
      categories,
    };
  } catch (err) {
    console.warn(`  [ERR] Failed to fetch ${itemName}:`, err);
    return null;
  }
}

// ─── Phase 3: Download sprites ───────────────────────────────────────────────

async function fetchSpriteUrl(itemName: string): Promise<string | null> {
  // Try ITEM_ prefix with underscored name
  const underscoredName = itemName.replace(/ /g, "_");
  const fileTitle = `File:ITEM_${underscoredName}.png`;

  const params = new URLSearchParams({
    action: "query",
    titles: fileTitle,
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
            pageid?: number;
            missing?: string;
            imageinfo?: Array<{ url: string }>;
          }
        >;
      };
    };

    const pages = data.query.pages;
    for (const page of Object.values(pages)) {
      if (page.imageinfo?.[0]?.url) {
        return page.imageinfo[0].url;
      }
    }
  } catch {
    // Silently fail, will be logged as missing
  }

  return null;
}

async function downloadSprite(
  url: string,
  itemName: string,
): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;

    const buffer = Buffer.from(await res.arrayBuffer());

    // Use sharp to convert to 224x224 PNG with white background
    const sharp = (await import("sharp")).default;
    const png = await sharp(buffer)
      .resize(224, 224, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer();

    const safeName = itemName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const outPath = path.join(SPRITES_PNG_DIR, `${safeName}.png`);
    fs.writeFileSync(outPath, png);
    return true;
  } catch {
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  ensureDirs();

  // Phase 1: Get all item names
  const itemNames = await fetchAllItemNames();
  fs.writeFileSync(
    path.join(DATA_DIR, "item-list.json"),
    JSON.stringify(itemNames, null, 2),
  );
  console.log(`\n[Phase 1] Saved ${itemNames.length} item names to data/item-list.json`);

  // Phase 2: Fetch each item's page data
  console.log(`\n[Phase 2] Fetching item data for ${itemNames.length} items...`);
  const allItems: ItemData[] = [];
  let parsed = 0;

  for (const name of itemNames) {
    const item = await fetchItemData(name);
    if (item) {
      allItems.push(item);
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
      fs.writeFileSync(
        path.join(ITEMS_DIR, `${safeName}.json`),
        JSON.stringify(item, null, 2),
      );
    }
    parsed++;
    if (parsed % 50 === 0) {
      console.log(`  ...parsed ${parsed}/${itemNames.length}`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  console.log(`[Phase 2] Parsed ${allItems.length}/${itemNames.length} items.`);

  // Phase 3: Download sprites
  console.log(`\n[Phase 3] Downloading sprites for ${allItems.length} items...`);
  const missingSprites: string[] = [];
  let downloaded = 0;
  let spriteCount = 0;

  for (const item of allItems) {
    const url = await fetchSpriteUrl(item.name);
    if (url) {
      const ok = await downloadSprite(url, item.name);
      if (ok) {
        spriteCount++;
      } else {
        missingSprites.push(item.name);
      }
    } else {
      missingSprites.push(item.name);
    }
    downloaded++;
    if (downloaded % 50 === 0) {
      console.log(
        `  ...processed ${downloaded}/${allItems.length} (${spriteCount} sprites downloaded)`,
      );
    }
    await sleep(RATE_LIMIT_MS);
  }

  fs.writeFileSync(
    path.join(DATA_DIR, "missing-sprites.json"),
    JSON.stringify(missingSprites, null, 2),
  );

  console.log(`\n[Phase 3] Downloaded ${spriteCount} sprites.`);
  console.log(`[Phase 3] ${missingSprites.length} items missing sprites (see data/missing-sprites.json)`);

  // Summary
  console.log("\n────────────────────────────────");
  console.log("Crawl complete!");
  console.log(`  Items found:    ${itemNames.length}`);
  console.log(`  Items parsed:   ${allItems.length}`);
  console.log(`  Sprites saved:  ${spriteCount}`);
  console.log(`  Missing sprites: ${missingSprites.length}`);
  console.log("────────────────────────────────");
}

main().catch((err) => {
  console.error("Crawl failed:", err);
  process.exit(1);
});
