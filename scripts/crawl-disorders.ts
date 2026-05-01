/**
 * Mewgenics Disorder Crawler
 *
 * Fetches all pages in `Category:Disorders` from mewgenics.wiki.gg, parses
 * the infobox + Effects / Interactions / Obtaining / Strategy / Trivia sections,
 * and writes structured JSON.
 *
 * Usage:
 *   npx tsx scripts/crawl-disorders.ts            # incremental (uses cache)
 *   npx tsx scripts/crawl-disorders.ts --force    # re-fetch all
 *
 * Output:
 *   data/disorder-list.json              — array of every disorder name
 *   data/disorders/<Name>.json           — parsed Disorder for each
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchCategoryMembers, fetchPagesBatch } from "./lib/mediawiki.js";
import { fetchAndCacheEntities } from "./lib/fs-cache.js";
import { fetchAndDownloadSprites } from "./lib/sprites.js";
import {
  parseInfobox,
  extractCategories,
  extractSection,
  convertWikiTemplates,
} from "./lib/wikitext.js";
import { wikiPageUrl } from "./lib/mediawiki.js";
import { ensureDirs, writeJson, toSafeName } from "./lib/util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "data");
const DISORDERS_DIR = path.join(DATA_DIR, "disorders");
const DISORDER_SPRITES_DIR = path.join(DATA_DIR, "sprites", "disorders");

const META_PAGES = new Set(["Disorders", "Category:Disorders"]);

// ─── Types ──────────────────────────────────────────────────────────────────

interface Disorder {
  name: string;
  kind: "disorder";
  id: string;
  description: string;
  pools: string[];
  statusEffects: string[];
  events: string[];
  contagious: boolean;
  wikiEffects: string;
  wikiInteractions: string;
  wikiObtaining: string;
  wikiStrategy: string;
  wikiTrivia: string;
  wikiNotes: string;
  spritePath: string;
  categories: string[];
  wikiUrl: string;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

function cleanSection(wikitext: string, heading: string): string {
  const raw = extractSection(wikitext, heading);
  if (!raw) return "";
  let text = convertWikiTemplates(raw, true);

  // Post-processing cleanup
  text = text
    // Strip wiki tables {| ... |} — we can't render them, and the bullet
    // summary before the table is usually sufficient
    .replace(/\{\|[\s\S]*?\|\}/g, "")
    // Strip leftover Category: lines (wiki maintenance tags)
    .replace(/^Category:[^\n]*$/gm, "")
    // Strip leftover Navbox lines (wiki navigation templates)
    .replace(/^Navbox[^\n]*$/gm, "")
    // Strip leftover image sizing artifacts: "20px|class=mew-icon"
    .replace(/\d+px\|class=[\w-]+\s*/g, "")
    // Collapse excessive newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // If the result is just empty bullet markers (* or *\n*), treat as empty
  if (/^\*[\s*]*$/.test(text)) return "";

  // Humanize internal pool names in Obtaining sections
  text = text
    .replace(/\ball_disorders pool\b/gi, "General Disorders pool")
    .replace(/\bmental_disorders pool\b/gi, "Mental Disorders pool")
    .replace(/\bphysical_disorders pool\b/gi, "Physical Disorders pool")
    .replace(/\bstomach_disorders pool\b/gi, "Stomach Disorders pool")
    .replace(/\bdiseases pool\b/gi, "Diseases pool")
    .replace(/\bhygiene_disorders pool\b/gi, "Hygiene Disorders pool")
    .replace(/\bmagic_disorders pool\b/gi, "Magic Disorders pool")
    .replace(/\bbirth_defect pool\b/gi, "Birth Defect pool")
    .replace(/\bforbidden_disorders pool\b/gi, "Forbidden Disorders pool");

  return text;
}

function parseCSV(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDisorderWikitext(title: string, wikitext: string): Disorder {
  const text = wikitext.replace(/\{\{PAGENAME\}\}/gi, title);
  const infobox = parseInfobox(text);

  const displayName = infobox.Title ?? title;

  return {
    name: displayName,
    kind: "disorder",
    id: infobox.ID ?? infobox.Id ?? "",
    description: convertWikiTemplates(infobox.Description ?? "", true),
    pools: parseCSV(infobox.Pools ?? ""),
    statusEffects: parseCSV(infobox.StatusEffects ?? ""),
    events: parseCSV(infobox.Events ?? ""),
    contagious: (infobox.Contagious ?? "").toLowerCase().startsWith("y"),
    wikiEffects: cleanSection(text, "Effects"),
    wikiInteractions: cleanSection(text, "Interactions"),
    wikiObtaining: cleanSection(text, "Obtaining"),
    wikiStrategy: cleanSection(text, "Strategy"),
    wikiTrivia: cleanSection(text, "Trivia"),
    wikiNotes: cleanSection(text, "Notes"),
    spritePath: "",
    categories: extractCategories(text),
    wikiUrl: wikiPageUrl(title),
  };
}

async function fetchDisordersBatch(titles: string[]): Promise<Disorder[]> {
  const pages = await fetchPagesBatch(titles);
  return pages.map((p) => parseDisorderWikitext(p.title, p.wikitext));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  ensureDirs(DATA_DIR, DISORDERS_DIR, DISORDER_SPRITES_DIR);

  const force = process.argv.includes("--force") || process.argv.includes("--refresh");

  const rawNames = await fetchCategoryMembers("Category:Disorders", "Disorders");
  const names = rawNames.filter((n) => !META_PAGES.has(n));
  writeJson(path.join(DATA_DIR, "disorder-list.json"), names);
  console.log(`Saved ${names.length} disorder names to data/disorder-list.json\n`);

  const disorders = await fetchAndCacheEntities(
    names,
    DISORDERS_DIR,
    fetchDisordersBatch,
    "Disorders",
    { force },
  );

  // Stage 2: sprites
  const spriteResult = await fetchAndDownloadSprites(
    names,
    "DISORDER",
    ["svg", "png"],
    DISORDER_SPRITES_DIR,
    "Disorder Sprites",
  );

  // Stage 3: backfill spritePath
  for (const disorder of disorders) {
    const safe = toSafeName(disorder.name);
    const spriteOnDisk = path.join(DISORDER_SPRITES_DIR, `${safe}.png`);
    const relative = fs.existsSync(spriteOnDisk)
      ? path.posix.join("data", "sprites", "disorders", `${safe}.png`)
      : "";
    if (disorder.spritePath !== relative) {
      disorder.spritePath = relative;
      writeJson(path.join(DISORDERS_DIR, `${safe}.json`), disorder);
    }
  }

  // Stats
  const withEffects = disorders.filter((d) => d.wikiEffects).length;
  const contagious = disorders.filter((d) => d.contagious).length;
  const pools = new Set<string>();
  for (const d of disorders) for (const p of d.pools) pools.add(p);

  console.log("\n────────────────────────────────");
  console.log(`Disorders parsed:  ${disorders.length}/${names.length}`);
  console.log(`Sprites saved:     ${spriteResult.saved}`);
  console.log(`Sprites missing:   ${spriteResult.missing.length}`);
  console.log(`With effects:      ${withEffects}`);
  console.log(`Contagious:        ${contagious}`);
  console.log(`Pools:             ${[...pools].sort().join(", ")}`);
  console.log("────────────────────────────────");

  if (spriteResult.missing.length > 0) {
    writeJson(path.join(DATA_DIR, "missing-disorder-sprites.json"), spriteResult.missing);
  }
}

main().catch((err) => {
  console.error("Disorder crawl failed:", err);
  process.exit(1);
});
