/**
 * Mewgenics Boss Crawler
 *
 * Pulls every page in `Category:Bosses` from mewgenics.wiki.gg, parses the
 * Boss infobox + Behavior / Attacks / Strategies / Notes / Quotes / Trivia
 * sections, downloads sprites, and writes structured JSON.
 *
 * Usage: npx tsx scripts/crawl-bosses.ts
 *
 * Output:
 *   data/boss-list.json                — array of all boss names
 *   data/bosses/<Name>.json            — Zod-validated Boss for each
 *   data/sprites/bosses/<Name>.png     — 224x224 PNG (icon, static, or 1st GIF frame)
 *   data/missing-boss-sprites.json     — bosses without any usable sprite
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
  extractSubsection,
  convertWikiTemplates,
} from "./lib/wikitext.js";
import { ensureDirs, sleep, toSafeName, writeJson } from "./lib/util.js";
import { BossSchema, type Boss, type BossAttack } from "./lib/schemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "data");
const BOSSES_DIR = path.join(DATA_DIR, "bosses");
const BOSS_SPRITES_DIR = path.join(DATA_DIR, "sprites", "bosses");

// The wiki infobox often leaves Location blank for alternate / unlockable bosses.
// These overrides are sourced from wiki + community research.
const LOCATION_OVERRIDES: Record<string, string> = {
  "Pebbles":            "The Path",
  "Queen Hippo":        "The Alley",
  "Dybbuk":             "The Boneyard",
  "Gambit":             "The Desert",
  "Johnny":             "The Bunker",
  "The Man in the Moon": "The Moon",
  "Pyrophina":          "House",
  "Zaratana":           "House",
};

// ─── Wikitext → Boss ────────────────────────────────────────────────────────

/**
 * Parse the `===Attacks===` subsection — wiki definition-list format:
 *
 *   ;Trample Dash
 *   :Boris charges in a cardinal direction…
 */
function parseAttacks(behavior: string): BossAttack[] {
  const attackSection = extractSubsection(behavior, "Attacks");
  if (!attackSection) return [];

  const attacks: BossAttack[] = [];
  const lines = attackSection.split("\n");
  let current: BossAttack | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith(";")) {
      if (current && current.description) attacks.push(current);
      current = { name: convertWikiTemplates(line.slice(1).trim(), false), description: "" };
    } else if (line.startsWith(":") && current) {
      const text = convertWikiTemplates(line.slice(1).trim(), true);
      current.description = current.description ? `${current.description} ${text}` : text;
    }
  }
  if (current && current.description) attacks.push(current);
  return attacks;
}

/** Extract every `{{Quote|name|text}}` body from the Quotes section. */
function parseQuotes(wikitext: string): string[] {
  const section = extractSection(wikitext, "Quotes");
  if (!section) return [];
  const out: string[] = [];
  const re = /\{\{Quote\|[^|}]+\|([^}]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null) {
    const text = convertWikiTemplates(m[1].trim(), false);
    if (text) out.push(text);
  }
  return out;
}

/** Strip wiki markup from a section body but keep deep-link markers. */
function cleanSectionBody(section: string): string {
  if (!section) return "";
  // Drop subsections — they're handled separately.
  let text = section.replace(/===[^=]+===[\s\S]*?(?=\n==[^=]|$)/g, "");
  text = convertWikiTemplates(text, true);
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

function parseBoss(title: string, rawWikitext: string, spritePath: string): Boss {
  // Replace {{PAGENAME}} with the actual boss name before any template processing.
  const wikitext = rawWikitext.replace(/\{\{PAGENAME\}\}/gi, title);
  const infobox = parseInfobox(wikitext);
  const behavior = extractSection(wikitext, "Behavior");
  const strategies = extractSection(wikitext, "Strategies") || extractSection(wikitext, "Strategy");
  const notes = extractSection(wikitext, "Notes");
  const trivia = extractSection(wikitext, "Trivia");

  return {
    name: title,
    kind: "boss",
    internalId: infobox.ID ?? infobox.Id ?? "",
    foundIn: convertWikiTemplates(infobox.Location ?? infobox.FoundIn ?? "", false) || LOCATION_OVERRIDES[title] || "",
    size: infobox.Size ?? "",
    attackStyle: convertWikiTemplates(infobox.AttackStyle ?? "", false),
    stats: {
      health: infobox.Health ?? "",
      damage: infobox.Damage ?? "",
      movement: infobox.Movement ?? "",
      luck: infobox.Luck ?? "",
    },
    mainTheme: infobox.Theme ?? infobox.MainTheme ?? "",
    attacks: parseAttacks(behavior),
    wikiBehavior: cleanSectionBody(behavior),
    wikiStrategies: cleanSectionBody(strategies),
    wikiNotes: cleanSectionBody(notes),
    wikiQuotes: parseQuotes(wikitext),
    wikiTrivia: cleanSectionBody(trivia),
    spritePath,
    categories: extractCategories(wikitext),
    wikiUrl: wikiPageUrl(title),
  };
}

async function fetchBossesBatch(titles: string[]): Promise<Boss[]> {
  const pages = await fetchPagesBatch(titles);
  return pages.map((p) => {
    const raw = parseBoss(p.title, p.wikitext, "");
    // Validate with Zod — surfaces shape drift early instead of in the app.
    return BossSchema.parse(raw);
  });
}

// ─── Boss sprite resolution ─────────────────────────────────────────────────

// Wiki sprite filenames don't always match the boss page title.
const SPRITE_NAME_OVERRIDES: Record<string, string> = {
  "Chubs & Nubs": "Chubs",
  "Stacy (Boss)": "Stacy",
};

/**
 * Bosses don't have a single canonical sprite naming convention. Try:
 *   1. BOSS_<Name>.png/svg                   (rare static art)
 *   2. BOSS_<Name>_Icon.svg/png              (turn-order icon — most bosses)
 *   3. BOSS_<Name>_Idle.gif (first frame)    (idle animation fallback)
 *
 * Returns a name → URL map and the file extension for each found.
 */
async function resolveBossSpriteUrls(
  bossNames: string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();

  // Apply sprite name overrides for wiki filename lookup
  const lookupName = (n: string) => SPRITE_NAME_OVERRIDES[n] ?? n;

  // Pass 1 — direct
  console.log("  [Sprites] Pass 1: BOSS_<Name>.png/svg");
  const lookupNames = bossNames.map(lookupName);
  const direct = await fetchSpriteUrlsBatch(lookupNames, "BOSS", ["png", "svg"]);
  for (const [k, v] of direct) {
    // Map back to the original boss name
    const orig = bossNames.find((n) => lookupName(n) === k) ?? k;
    found.set(orig, v);
  }
  console.log(`    Found ${direct.size}`);

  // Pass 2 — icons
  const stillMissing1 = bossNames.filter((n) => !found.has(n));
  if (stillMissing1.length > 0) {
    console.log(`  [Sprites] Pass 2: BOSS_<Name>_Icon.svg/png  (${stillMissing1.length} remaining)`);
    const iconKeys = stillMissing1.map((n) => `${lookupName(n)}_Icon`);
    const icons = await fetchSpriteUrlsBatch(iconKeys, "BOSS", ["svg", "png"]);
    for (const [k, v] of icons) {
      const stripped = k.replace(/_Icon$/, "");
      const orig = bossNames.find((n) => lookupName(n) === stripped) ?? stripped;
      if (bossNames.includes(orig)) found.set(orig, v);
    }
    console.log(`    Found ${icons.size}`);
  }

  // Pass 3 — idle gifs
  const stillMissing2 = bossNames.filter((n) => !found.has(n));
  if (stillMissing2.length > 0) {
    console.log(`  [Sprites] Pass 3: BOSS_<Name>_Idle.gif  (${stillMissing2.length} remaining)`);
    const idleKeys = stillMissing2.map((n) => `${lookupName(n)}_Idle`);
    const idles = await fetchSpriteUrlsBatch(idleKeys, "BOSS", ["gif"]);
    for (const [k, v] of idles) {
      const stripped = k.replace(/_Idle$/, "");
      const orig = bossNames.find((n) => lookupName(n) === stripped) ?? stripped;
      if (bossNames.includes(orig)) found.set(orig, v);
    }
    console.log(`    Found ${idles.size}`);
  }

  return found;
}

async function downloadBossSprites(
  bossNames: string[],
): Promise<{ saved: number; missing: string[] }> {
  ensureDirs(BOSS_SPRITES_DIR);

  const need: string[] = [];
  let existing = 0;
  for (const name of bossNames) {
    if (fs.existsSync(path.join(BOSS_SPRITES_DIR, `${toSafeName(name)}.png`))) {
      existing++;
    } else {
      need.push(name);
    }
  }
  if (existing > 0) console.log(`[Boss Sprites] ${existing} already cached.`);
  if (need.length === 0) {
    console.log("[Boss Sprites] All sprites cached.");
    return { saved: existing, missing: [] };
  }

  console.log(`[Boss Sprites] Resolving URLs for ${need.length} bosses...`);
  const urls = await resolveBossSpriteUrls(need);
  console.log(`[Boss Sprites] Resolved ${urls.size} URLs. Downloading...`);

  let ok = 0;
  for (const name of need) {
    const url = urls.get(name);
    if (!url) continue;
    const success = await downloadSprite(url, name, BOSS_SPRITES_DIR);
    if (success) ok++;
    await sleep(200);
  }
  console.log(`[Boss Sprites] Downloaded ${ok}/${urls.size}`);

  const missing = bossNames.filter(
    (n) => !fs.existsSync(path.join(BOSS_SPRITES_DIR, `${toSafeName(n)}.png`)),
  );
  return { saved: bossNames.length - missing.length, missing };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  ensureDirs(DATA_DIR, BOSSES_DIR, BOSS_SPRITES_DIR);

  const force = process.argv.includes("--refresh") || process.argv.includes("--force");

  const rawBossNames = await fetchCategoryMembers("Category:Bosses", "Bosses");
  // The category page itself ("Bosses") shows up as a member; drop it.
  // Also drop anything that's actually a sub-category landing page rather
  // than a boss — those parse with empty infoboxes.
  const bossNames = rawBossNames.filter((n) => n !== "Bosses" && n !== "Category:Bosses");
  writeJson(path.join(DATA_DIR, "boss-list.json"), bossNames);
  console.log(`Saved ${bossNames.length} boss names to data/boss-list.json\n`);

  // Stage 1: parse wiki pages → JSON.
  const bosses = await fetchAndCacheEntities(
    bossNames,
    BOSSES_DIR,
    fetchBossesBatch,
    "Bosses",
    { force },
  );

  // Stage 2: sprites.
  const spriteResult = await downloadBossSprites(bossNames);

  // Stage 3: backfill spritePath into each JSON now that we know what landed.
  for (const boss of bosses) {
    const safe = toSafeName(boss.name);
    const spriteOnDisk = path.join(BOSS_SPRITES_DIR, `${safe}.png`);
    const relative = fs.existsSync(spriteOnDisk) ? path.posix.join("data", "sprites", "bosses", `${safe}.png`) : "";
    if (boss.spritePath !== relative) {
      boss.spritePath = relative;
      writeJson(path.join(BOSSES_DIR, `${safe}.json`), boss);
    }
  }

  if (spriteResult.missing.length > 0) {
    writeJson(path.join(DATA_DIR, "missing-boss-sprites.json"), spriteResult.missing);
  }

  console.log("\n────────────────────────────────");
  console.log(`Bosses parsed:   ${bosses.length}/${bossNames.length}`);
  console.log(`Sprites saved:   ${spriteResult.saved}`);
  console.log(`Sprites missing: ${spriteResult.missing.length}`);
  console.log("────────────────────────────────");
}

main().catch((err) => {
  console.error("Boss crawl failed:", err);
  process.exit(1);
});
