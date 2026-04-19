/**
 * Mewgenics Wiki Crawler
 *
 * Fetches all item data and sprites from mewgenics.wiki.gg using the MediaWiki API.
 * Uses batched queries (50 pages per request) to minimize API calls.
 *
 * Usage: npm run crawl
 *
 * Output:
 *   data/item-list.json       — array of all item names
 *   data/items/<name>.json    — individual item JSON files
 *   data/sprites/png/         — 224x224 PNGs for ML training
 *   data/missing-sprites.json — items without sprites
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
const SPRITES_PNG_DIR = path.join(DATA_DIR, "sprites", "png");
const RATE_LIMIT_MS = 1000;
const BATCH_SIZE = 50; // MediaWiki max titles per query
const USER_AGENT =
  "MewgenicsScanner/1.0 (https://github.com/mewgenics-scanner; crawler for ML training data)";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDirs() {
  for (const dir of [DATA_DIR, ITEMS_DIR, SPRITES_PNG_DIR]) {
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

// ─── Phase 1: Get all item names ─────────────────────────────────────────────

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
      query: { categorymembers: Array<{ pageid: number; ns: number; title: string }> };
      continue?: { cmcontinue: string };
    };

    for (const member of data.query.categorymembers) {
      if (member.ns === 0) items.push(member.title);
    }

    cmcontinue = data.continue?.cmcontinue;
    if (cmcontinue) {
      console.log(`  ...${items.length} items so far`);
      await sleep(RATE_LIMIT_MS);
    }
  } while (cmcontinue);

  console.log(`[Phase 1] Found ${items.length} items.`);
  return items;
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

// ─── Phase 3: Download sprites (batched lookups) ─────────────────────────────

/**
 * Look up sprite URLs in batches. Tries both .png and .svg since the wiki
 * uses both formats. MediaWiki supports up to 50 titles per query.
 */
async function fetchSpriteUrlsBatch(
  itemNames: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  // Try both extensions in separate passes
  for (const ext of ["png", "svg"]) {
    // Only look up items we haven't found yet
    const remaining = itemNames.filter((n) => !result.has(n));
    if (remaining.length === 0) break;

    const batches = chunk(remaining, BATCH_SIZE);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const titles = batch
        .map((name) => `File:ITEM_${name.replace(/ /g, "_")}.${ext}`)
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
          const m = page.title.match(/^File:ITEM[_ ](.+)\.(png|svg)$/i);
          if (m) {
            const extracted = m[1].replace(/_/g, " ");
            const original = batch.find(
              (n) => n.toLowerCase() === extracted.toLowerCase(),
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
async function downloadSprite(url: string, itemName: string): Promise<boolean> {
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

      fs.writeFileSync(path.join(SPRITES_PNG_DIR, `${toSafeName(itemName)}.png`), png);
      return true;
    } catch (err) {
      if (attempt === 2) {
        console.warn(`  [ERR] ${itemName}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  return false;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  ensureDirs();

  // ── Phase 1 ──
  const itemNames = await fetchAllItemNames();
  fs.writeFileSync(
    path.join(DATA_DIR, "item-list.json"),
    JSON.stringify(itemNames, null, 2),
  );
  console.log(`Saved ${itemNames.length} item names to data/item-list.json\n`);

  // ── Phase 2: Batched page content ──
  console.log(`[Phase 2] Fetching item data in batches of ${BATCH_SIZE}...`);
  const allItems: ItemData[] = [];
  const batches = chunk(itemNames, BATCH_SIZE);

  // Check cache — load any items we already have
  const uncachedBatches: string[][] = [];
  for (const batch of batches) {
    const uncached: string[] = [];
    for (const name of batch) {
      const filePath = path.join(ITEMS_DIR, `${toSafeName(name)}.json`);
      if (fs.existsSync(filePath)) {
        try {
          allItems.push(JSON.parse(fs.readFileSync(filePath, "utf-8")) as ItemData);
          continue;
        } catch { /* re-fetch */ }
      }
      uncached.push(name);
    }
    if (uncached.length > 0) uncachedBatches.push(uncached);
  }

  if (allItems.length > 0) {
    console.log(`  ${allItems.length} items loaded from cache`);
  }

  for (let i = 0; i < uncachedBatches.length; i++) {
    const batch = uncachedBatches[i];
    try {
      const items = await fetchItemsBatch(batch);
      for (const item of items) {
        allItems.push(item);
        fs.writeFileSync(
          path.join(ITEMS_DIR, `${toSafeName(item.name)}.json`),
          JSON.stringify(item, null, 2),
        );
      }
      console.log(
        `  Batch ${i + 1}/${uncachedBatches.length}: ${items.length}/${batch.length} parsed (${allItems.length} total)`,
      );
    } catch (err) {
      console.warn(`  [ERR] Batch ${i + 1} failed:`, err);
    }
    if (i < uncachedBatches.length - 1) await sleep(RATE_LIMIT_MS);
  }

  console.log(`[Phase 2] ${allItems.length}/${itemNames.length} items parsed.\n`);

  // ── Phase 3: Sprites ──
  // Count existing sprites
  let existingSprites = 0;
  const needSprites: string[] = [];
  for (const item of allItems) {
    if (fs.existsSync(path.join(SPRITES_PNG_DIR, `${toSafeName(item.name)}.png`))) {
      existingSprites++;
    } else {
      needSprites.push(item.name);
    }
  }

  if (existingSprites > 0) {
    console.log(`[Phase 3] ${existingSprites} sprites already cached`);
  }

  if (needSprites.length === 0) {
    console.log(`[Phase 3] All sprites already downloaded.`);
  } else {
    console.log(`[Phase 3] Looking up sprite URLs for ${needSprites.length} items...`);
    const spriteUrls = await fetchSpriteUrlsBatch(needSprites);
    console.log(`[Phase 3] Found ${spriteUrls.size} sprite URLs. Downloading serially...`);
    let dlCount = 0;
    let dlOk = 0;
    for (const name of needSprites) {
      const url = spriteUrls.get(name);
      if (url) {
        const ok = await downloadSprite(url, name);
        if (ok) dlOk++;
        dlCount++;
        if (dlCount % 50 === 0) {
          console.log(`  ...${dlCount}/${spriteUrls.size} downloaded (${dlOk} ok)`);
        }
        await sleep(200); // polite delay between image downloads
      }
    }
    console.log(`  ...${dlCount}/${spriteUrls.size} downloaded (${dlOk} ok)`);
  }

  // Count final sprites
  const finalSpriteCount = allItems.filter((item) =>
    fs.existsSync(path.join(SPRITES_PNG_DIR, `${toSafeName(item.name)}.png`)),
  ).length;

  const missingSprites = allItems
    .filter((item) => !fs.existsSync(path.join(SPRITES_PNG_DIR, `${toSafeName(item.name)}.png`)))
    .map((item) => item.name);

  fs.writeFileSync(
    path.join(DATA_DIR, "missing-sprites.json"),
    JSON.stringify(missingSprites, null, 2),
  );

  // Summary
  console.log("\n────────────────────────────────");
  console.log("Crawl complete!");
  console.log(`  Items found:     ${itemNames.length}`);
  console.log(`  Items parsed:    ${allItems.length}`);
  console.log(`  Sprites saved:   ${finalSpriteCount}`);
  console.log(`  Missing sprites: ${missingSprites.length}`);
  console.log("────────────────────────────────");
}

main().catch((err) => {
  console.error("Crawl failed:", err);
  process.exit(1);
});
