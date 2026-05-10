/**
 * Mewgenics Enemy Crawler
 *
 * Pulls every page in `Category:Enemies` from mewgenics.wiki.gg, parses the
 * Enemy infobox + Behavior / Tips / Strategies / Trivia sections, downloads
 * sprites, and writes structured JSON.
 *
 * Usage: npx tsx scripts/crawl-enemies.ts
 *
 * Output:
 *   data/enemy-list.json                — array of all enemy names
 *   data/enemies/<Name>.json            — Zod-validated Enemy for each
 *   data/sprites/enemies/<Name>.png     — 224x224 PNG (icon, static, or 1st GIF frame)
 *   data/missing-enemy-sprites.json     — enemies without any usable sprite
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  fetchCategoryMembers,
  fetchPagesBatch,
  fetchSpriteUrlsBatch,
  wikiPageUrl,
} from "./lib/mediawiki.js";
import { downloadSprite } from "./lib/sprites.js";
import { fetchAndCacheEntities } from "./lib/fs-cache.js";
import {
  parseInfobox,
  extractCategories,
  extractSection,
  convertWikiTemplates,
} from "./lib/wikitext.js";
import { ensureDirs, sleep, toSafeName, writeJson } from "./lib/util.js";
import { EnemySchema, type Enemy } from "./lib/schemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "data");
const ENEMIES_DIR = path.join(DATA_DIR, "enemies");
const ENEMY_SPRITES_DIR = path.join(DATA_DIR, "sprites", "enemies");

// ─── Wikitext → Enemy ────────────────────────────────────────────────────────

/** Strip wiki markup from a section body but keep deep-link markers. */
function cleanSectionBody(section: string): string {
  if (!section) return "";
  let text = section.replace(/===[^=]+===[\s\S]*?(?=\n==[^=]|$)/g, "");
  text = convertWikiTemplates(text, true);
  // Strip leftover wiki/HTML artifacts
  text = text
    .replace(/\d+px/g, "")                          // 24px, 16px, 10px icon size refs
    .replace(/ActiveType/g, "")                      // wiki template artifact
    .replace(/RangeIndicatorWrapper\}\}/g, "")        // wiki template artifact
    .replace(/RangeIndicatorWrapper/g, "")            // without braces
    .replace(/#lst:\S+/g, "")                         // transclusion refs
    .replace(/^Category:[^\n]*/gm, "")                 // strip [[Category:...]] lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // If the cleaned result is just a lone bullet marker or a single short word, discard
  if (/^\*?\s*$/.test(text) || text.length < 5) return "";
  return text;
}

/** Clean stat values — strip HTML tags, comments, and wiki templates from infobox values. */
function cleanStat(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<!--[\s\S]*?-->/g, "")   // HTML comments
    .replace(/<br\s*\/?>/gi, " / ")    // <br> → slash separator
    .replace(/<[^>]+>/g, "")           // any remaining HTML
    .replace(/\{\{[^}]*\}\}/g, "")     // {{icon|Shield|15}} etc.
    .replace(/,\s*$/, "")             // trailing comma after template removal
    .trim();
}

/** Parse comma-separated locations from the infobox. */
function parseLocations(raw: string): string[] {
  if (!raw) return [];
  const cleaned = convertWikiTemplates(raw, false);
  return cleaned
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseEnemy(title: string, rawWikitext: string, spritePath: string): Enemy {
  const wikitext = rawWikitext.replace(/\{\{PAGENAME\}\}/gi, title);
  const infobox = parseInfobox(wikitext);
  const behavior =
    extractSection(wikitext, "Behavior") || extractSection(wikitext, "Behaviour");
  const tips =
    extractSection(wikitext, "Tips") ||
    extractSection(wikitext, "Strategies") ||
    extractSection(wikitext, "Strategy");
  const trivia = extractSection(wikitext, "Trivia");

  // Some enemy infoboxes use "Location" or "FoundIn"
  const locationRaw =
    infobox.Location ?? infobox.FoundIn ?? infobox.Locations ?? "";

  // Parse champion stats if present in the infobox
  const hasChampion =
    infobox.ChampionHealth ||
    infobox.ChampionDamage ||
    infobox.ChampionMovement ||
    infobox.ChampionLuck;

  return {
    name: title,
    kind: "enemy",
    internalId: infobox.ID ?? infobox.Id ?? "",
    description: convertWikiTemplates(
      infobox.Description ?? infobox.Flavor ?? "",
      false,
    ),
    locations: parseLocations(locationRaw),
    size: infobox.Size ?? "",
    attackStyle: convertWikiTemplates(infobox.AttackStyle ?? "", false),
    stats: {
      health: cleanStat(infobox.Health ?? ""),
      damage: cleanStat(infobox.Damage ?? ""),
      movement: cleanStat(infobox.Movement ?? ""),
      luck: cleanStat(infobox.Luck ?? ""),
    },
    ...(hasChampion
      ? {
          championStats: {
            health: cleanStat(infobox.ChampionHealth ?? ""),
            damage: cleanStat(infobox.ChampionDamage ?? ""),
            movement: cleanStat(infobox.ChampionMovement ?? ""),
            luck: cleanStat(infobox.ChampionLuck ?? ""),
          },
        }
      : {}),
    wikiBehavior: cleanSectionBody(behavior),
    wikiTips: cleanSectionBody(tips),
    wikiTrivia: cleanSectionBody(trivia),
    dangerFlag: "", // filled in by combine step from enemy-dangers.json
    spritePath,
    categories: extractCategories(wikitext),
    wikiUrl: wikiPageUrl(title),
  };
}

async function fetchEnemiesBatch(titles: string[]): Promise<Enemy[]> {
  const pages = await fetchPagesBatch(titles);
  return pages.map((p) => {
    const raw = parseEnemy(p.title, p.wikitext, "");
    return EnemySchema.parse(raw);
  });
}

// ─── Enemy sprite resolution ─────────────────────────────────────────────────

/**
 * Enemies use different naming conventions on the wiki. Try:
 *   1. ENEMY_<Name>.png/svg              (static art)
 *   2. ENEMY_<Name>_Icon.svg/png         (turn-order icon)
 *   3. ENEMY_<Name>_Idle.gif             (idle animation fallback)
 *   4. <Name>.png                        (no prefix — some enemies)
 */
async function resolveEnemySpriteUrls(
  enemyNames: string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();

  // Pass 1 — ENEMY_ prefix direct
  console.log("  [Sprites] Pass 1: ENEMY_<Name>.png/svg");
  const direct = await fetchSpriteUrlsBatch(enemyNames, "ENEMY", ["png", "svg"]);
  for (const [k, v] of direct) found.set(k, v);
  console.log(`    Found ${direct.size}`);

  // Pass 2 — ENEMY_ icon
  const stillMissing1 = enemyNames.filter((n) => !found.has(n));
  if (stillMissing1.length > 0) {
    console.log(`  [Sprites] Pass 2: ENEMY_<Name>_Icon.svg/png  (${stillMissing1.length} remaining)`);
    const iconKeys = stillMissing1.map((n) => `${n}_Icon`);
    const icons = await fetchSpriteUrlsBatch(iconKeys, "ENEMY", ["svg", "png"]);
    for (const [k, v] of icons) {
      const stripped = k.replace(/_Icon$/, "");
      const orig = enemyNames.find(
        (n) => n.toLowerCase() === stripped.toLowerCase(),
      ) ?? stripped;
      if (enemyNames.includes(orig)) found.set(orig, v);
    }
    console.log(`    Found ${icons.size}`);
  }

  // Pass 3 — ENEMY_ idle gifs
  const stillMissing2 = enemyNames.filter((n) => !found.has(n));
  if (stillMissing2.length > 0) {
    console.log(`  [Sprites] Pass 3: ENEMY_<Name>_Idle.gif  (${stillMissing2.length} remaining)`);
    const idleKeys = stillMissing2.map((n) => `${n}_Idle`);
    const idles = await fetchSpriteUrlsBatch(idleKeys, "ENEMY", ["gif"]);
    for (const [k, v] of idles) {
      const stripped = k.replace(/_Idle$/, "");
      const orig = enemyNames.find(
        (n) => n.toLowerCase() === stripped.toLowerCase(),
      ) ?? stripped;
      if (enemyNames.includes(orig)) found.set(orig, v);
    }
    console.log(`    Found ${idles.size}`);
  }

  return found;
}

async function downloadEnemySprites(
  enemyNames: string[],
): Promise<{ saved: number; missing: string[] }> {
  ensureDirs(ENEMY_SPRITES_DIR);

  const need: string[] = [];
  let existing = 0;
  for (const name of enemyNames) {
    if (fs.existsSync(path.join(ENEMY_SPRITES_DIR, `${toSafeName(name)}.png`))) {
      existing++;
    } else {
      need.push(name);
    }
  }
  if (existing > 0) console.log(`[Enemy Sprites] ${existing} already cached.`);
  if (need.length === 0) {
    console.log("[Enemy Sprites] All sprites cached.");
    return { saved: existing, missing: [] };
  }

  console.log(`[Enemy Sprites] Resolving URLs for ${need.length} enemies...`);
  const urls = await resolveEnemySpriteUrls(need);
  console.log(`[Enemy Sprites] Resolved ${urls.size} URLs. Downloading...`);

  let ok = 0;
  for (const name of need) {
    const url = urls.get(name);
    if (!url) continue;
    const success = await downloadSprite(url, name, ENEMY_SPRITES_DIR);
    if (success) ok++;
    await sleep(200);
  }
  console.log(`[Enemy Sprites] Downloaded ${ok}/${urls.size}`);

  const missing = enemyNames.filter(
    (n) => !fs.existsSync(path.join(ENEMY_SPRITES_DIR, `${toSafeName(n)}.png`)),
  );
  return { saved: enemyNames.length - missing.length, missing };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  ensureDirs(DATA_DIR, ENEMIES_DIR, ENEMY_SPRITES_DIR);

  const force =
    process.argv.includes("--refresh") || process.argv.includes("--force");

  const rawEnemyNames = await fetchCategoryMembers("Category:Enemies", "Enemies");
  // Drop the category landing page and wiki draft pages
  const enemyNames = rawEnemyNames.filter(
    (n) =>
      n !== "Enemies" &&
      n !== "Category:Enemies" &&
      !n.includes("/draft"),
  );
  writeJson(path.join(DATA_DIR, "enemy-list.json"), enemyNames);
  console.log(`Saved ${enemyNames.length} enemy names to data/enemy-list.json\n`);

  // Stage 1: parse wiki pages -> JSON.
  const enemies = await fetchAndCacheEntities(
    enemyNames,
    ENEMIES_DIR,
    fetchEnemiesBatch,
    "Enemies",
    { force },
  );

  // Stage 2: sprites.
  const spriteResult = await downloadEnemySprites(enemyNames);

  // Stage 3: backfill spritePath into each JSON.
  for (const enemy of enemies) {
    const safe = toSafeName(enemy.name);
    const spriteOnDisk = path.join(ENEMY_SPRITES_DIR, `${safe}.png`);
    const relative = fs.existsSync(spriteOnDisk)
      ? path.posix.join("data", "sprites", "enemies", `${safe}.png`)
      : "";
    if (enemy.spritePath !== relative) {
      enemy.spritePath = relative;
      writeJson(path.join(ENEMIES_DIR, `${safe}.json`), enemy);
    }
  }

  if (spriteResult.missing.length > 0) {
    writeJson(
      path.join(DATA_DIR, "missing-enemy-sprites.json"),
      spriteResult.missing,
    );
  }

  console.log("\n────────────────────────────────");
  console.log(`Enemies parsed:  ${enemies.length}/${enemyNames.length}`);
  console.log(`Sprites saved:   ${spriteResult.saved}`);
  console.log(`Sprites missing: ${spriteResult.missing.length}`);
  console.log("────────────────────────────────");
}

main().catch((err) => {
  console.error("Enemy crawl failed:", err);
  process.exit(1);
});
