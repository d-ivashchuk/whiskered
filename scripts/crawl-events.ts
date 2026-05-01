/**
 * Mewgenics Event Crawler
 *
 * Pulls every page in `Category:Events` from mewgenics.wiki.gg, parses the
 * event infobox + Description / Choices / Outcomes / Notes / Trivia sections,
 * downloads sprites where present, and writes structured JSON.
 *
 * Usage:
 *   npx tsx scripts/crawl-events.ts            # incremental (uses fs cache)
 *   npx tsx scripts/crawl-events.ts --refresh  # ignore cache, re-fetch all
 *
 * Output:
 *   data/event-list.json                — array of every event name
 *   data/events/<Name>.json             — Zod-validated Event for each
 *   data/sprites/events/<Name>.png      — 224×224 PNG when one exists
 *   data/missing-event-sprites.json     — events without a usable sprite
 *   data/events-no-choices.json         — events parsed with 0 choices (review)
 *
 * The wikitext parser lives in `scripts/lib/event-parser.ts` so unit tests
 * can exercise it without triggering live network I/O from `main()`.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  fetchCategoryMembers,
  fetchPagesBatch,
  fetchSpriteUrlsBatch,
} from "./lib/mediawiki.js";
import { downloadSprite } from "./lib/sprites.js";
import { fetchAndCacheEntities } from "./lib/fs-cache.js";
import { ensureDirs, sleep, toSafeName, writeJson } from "./lib/util.js";
import { EventSchema, type Event } from "./lib/schemas.js";
import { parseEvent } from "./lib/event-parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "data");
const EVENTS_DIR = path.join(DATA_DIR, "events");
const EVENT_SPRITES_DIR = path.join(DATA_DIR, "sprites", "events");

// Pages that show up under Category:Events but aren't real events
// (the category landing page itself, lore overviews, etc).
const META_PAGE_TITLES = new Set(["Events", "Category:Events"]);

// ─── Wiki → JSON ────────────────────────────────────────────────────────────

async function fetchEventsBatch(titles: string[]): Promise<Event[]> {
  const pages = await fetchPagesBatch(titles);
  const out: Event[] = [];
  for (const p of pages) {
    try {
      out.push(EventSchema.parse(parseEvent(p.title, p.wikitext, "")));
    } catch (err) {
      console.warn(`  [WARN] Schema validation failed for "${p.title}":`, err);
    }
  }
  return out;
}

// ─── Sprite resolution ──────────────────────────────────────────────────────

/**
 * Events on the wiki use a few naming conventions for art:
 *   1. EVENT_<Name>.png
 *   2. <Name>_Event.png
 *
 * We try each in turn and stop at the first hit.
 */
async function resolveEventSpriteUrls(eventNames: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();

  console.log("  [Sprites] Pass 1: EVENT_<Name>");
  const direct = await fetchSpriteUrlsBatch(eventNames, "EVENT", ["png", "svg", "jpg"]);
  for (const [k, v] of direct) found.set(k, v);
  console.log(`    Found ${direct.size}`);

  const stillMissing = eventNames.filter((n) => !found.has(n));
  if (stillMissing.length > 0) {
    console.log(`  [Sprites] Pass 2: <Name>_Event  (${stillMissing.length} remaining)`);
    const suffixed = stillMissing.map((n) => `${n}_Event`);
    const result = await fetchSpriteUrlsBatch(suffixed, "", ["png", "svg", "jpg"]);
    for (const [k, v] of result) {
      const orig = k.replace(/_Event$/, "");
      if (eventNames.includes(orig)) found.set(orig, v);
    }
    console.log(`    Found ${result.size}`);
  }

  return found;
}

async function downloadEventSprites(
  eventNames: string[],
): Promise<{ saved: number; missing: string[] }> {
  ensureDirs(EVENT_SPRITES_DIR);

  const need: string[] = [];
  let existing = 0;
  for (const name of eventNames) {
    if (fs.existsSync(path.join(EVENT_SPRITES_DIR, `${toSafeName(name)}.png`))) {
      existing++;
    } else {
      need.push(name);
    }
  }
  if (existing > 0) console.log(`[Event Sprites] ${existing} already cached.`);
  if (need.length === 0) {
    console.log("[Event Sprites] All sprites cached.");
    return { saved: existing, missing: [] };
  }

  console.log(`[Event Sprites] Resolving URLs for ${need.length} events...`);
  const urls = await resolveEventSpriteUrls(need);
  console.log(`[Event Sprites] Resolved ${urls.size} URLs. Downloading...`);

  let ok = 0;
  for (const name of need) {
    const url = urls.get(name);
    if (!url) continue;
    const success = await downloadSprite(url, name, EVENT_SPRITES_DIR);
    if (success) ok++;
    await sleep(200);
  }
  console.log(`[Event Sprites] Downloaded ${ok}/${urls.size}`);

  const missing = eventNames.filter(
    (n) => !fs.existsSync(path.join(EVENT_SPRITES_DIR, `${toSafeName(n)}.png`)),
  );
  return { saved: eventNames.length - missing.length, missing };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  ensureDirs(DATA_DIR, EVENTS_DIR, EVENT_SPRITES_DIR);

  const force = process.argv.includes("--refresh") || process.argv.includes("--force");

  const rawNames = await fetchCategoryMembers("Category:Events", "Events");
  const eventNames = rawNames.filter((n) => !META_PAGE_TITLES.has(n));
  writeJson(path.join(DATA_DIR, "event-list.json"), eventNames);
  console.log(`Saved ${eventNames.length} event names to data/event-list.json\n`);

  // Stage 1: parse wiki pages → JSON.
  const events = await fetchAndCacheEntities(
    eventNames,
    EVENTS_DIR,
    fetchEventsBatch,
    "Events",
    { force },
  );

  // Stage 2: sprites.
  const spriteResult = await downloadEventSprites(eventNames);

  // Stage 3: backfill spritePath into each JSON.
  for (const event of events) {
    const safe = toSafeName(event.name);
    const spriteOnDisk = path.join(EVENT_SPRITES_DIR, `${safe}.png`);
    const relative = fs.existsSync(spriteOnDisk)
      ? path.posix.join("data", "sprites", "events", `${safe}.png`)
      : "";
    if (event.spritePath !== relative) {
      event.spritePath = relative;
      writeJson(path.join(EVENTS_DIR, `${safe}.json`), event);
    }
  }

  if (spriteResult.missing.length > 0) {
    writeJson(path.join(DATA_DIR, "missing-event-sprites.json"), spriteResult.missing);
  }

  // Stage 4: surface a few quality signals so it's obvious when the parser
  // missed an event (e.g. zero choices on a page that clearly has them).
  const empty = events.filter((e) => e.choices.length === 0);
  if (empty.length > 0) {
    console.log(`\n[QC] ${empty.length} events parsed with 0 choices (may need manual review):`);
    for (const e of empty.slice(0, 10)) console.log(`  - ${e.name}`);
    if (empty.length > 10) console.log(`  ... and ${empty.length - 10} more`);
    writeJson(
      path.join(DATA_DIR, "events-no-choices.json"),
      empty.map((e) => e.name),
    );
  }

  console.log("\n────────────────────────────────");
  console.log(`Events parsed:    ${events.length}/${eventNames.length}`);
  console.log(`Sprites saved:    ${spriteResult.saved}`);
  console.log(`Sprites missing:  ${spriteResult.missing.length}`);
  console.log(`Events w/ 0 choices: ${empty.length}`);
  console.log("────────────────────────────────");
}

main().catch((err) => {
  console.error("Event crawl failed:", err);
  process.exit(1);
});
