/**
 * Mewgenics Event Crawler
 *
 * The wiki stores ALL events on a single "Events" page as collapsible wikitables.
 * Each event is delimited by a `{{Anchor|Name}}` marker.
 *
 * This script fetches that page, splits it into individual events, parses
 * each table's options/outcomes, downloads sprites, and writes structured JSON.
 *
 * Usage:
 *   npx tsx scripts/crawl-events.ts            # incremental (uses fs cache)
 *   npx tsx scripts/crawl-events.ts --force    # re-fetch and re-parse all
 *
 * Output:
 *   data/event-list.json                — array of every event name
 *   data/events/<Name>.json             — parsed Event for each
 *   data/sprites/events/<Name>.png      — sprite when available
 *   data/missing-event-sprites.json     — events without a sprite
 *   data/events-no-choices.json         — events parsed with 0 choices (QC)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { API_BASE, fetchJSON } from "./lib/mediawiki.js";
import { downloadSprite } from "./lib/sprites.js";
import { ensureDirs, sleep, toSafeName, writeJson } from "./lib/util.js";
import { EventSchema, type Event } from "./lib/schemas.js";
import { convertWikiTemplates } from "./lib/wikitext.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "data");
const EVENTS_DIR = path.join(DATA_DIR, "events");
const EVENT_SPRITES_DIR = path.join(DATA_DIR, "sprites", "events");

// ─── Fetch the full Events page wikitext ────────────────────────────────────

async function fetchEventsPageWikitext(): Promise<string> {
  const url = `${API_BASE}?action=query&titles=Events&prop=revisions&rvprop=content&rvslots=main&format=json`;
  const data = (await fetchJSON(url)) as {
    query: { pages: Record<string, { revisions?: Array<{ slots: { main: { "*": string } } }> }> };
  };
  const pages = Object.values(data.query.pages);
  const page = pages[0];
  if (!page?.revisions?.[0]) throw new Error("Could not fetch Events page");
  return page.revisions[0].slots.main["*"];
}

// ─── Parse the single-page events format ────────────────────────────────────

interface RawEventBlock {
  name: string;
  category: string;
  chapter: string;
  flavor: string;
  spriteFile: string;
  tableBody: string;
}

/**
 * Split the full page wikitext into individual event blocks.
 * Each event starts with `{{Anchor|Name}}` inside a collapsible wikitable.
 */
function splitIntoEventBlocks(wikitext: string): RawEventBlock[] {
  const blocks: RawEventBlock[] = [];

  // Track current section context
  let currentCategory = "";
  let currentChapter = "";
  let inChapterEvents = false;
  let inGeneralEvents = false;
  let inOtherEvents = false;

  const lines = wikitext.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Level 2 headings
    const h2 = line.match(/^==\s*([^=]+?)\s*==\s*$/);
    if (h2) {
      const heading = h2[1].trim();
      inChapterEvents = heading === "Chapter Events";
      inGeneralEvents = heading === "General Event Categories";
      inOtherEvents = heading === "Other Event Categories";
      if (!inChapterEvents && !inGeneralEvents && !inOtherEvents) {
        currentCategory = "";
        currentChapter = "";
      }
      i++;
      continue;
    }

    // Level 3 headings
    const h3 = line.match(/^===\s*([^=]+?)\s*===\s*$/);
    if (h3) {
      const heading = h3[1].trim();
      if (inChapterEvents) {
        currentChapter = heading;
        currentCategory = "Chapter Events";
      } else {
        currentCategory = heading;
        currentChapter = "";
      }
      i++;
      continue;
    }

    // Level 4 headings
    const h4 = line.match(/^====\s*([^=]+?)\s*====\s*$/);
    if (h4) {
      if (inChapterEvents) {
        currentChapter = h4[1].trim();
      }
      i++;
      continue;
    }

    // Detect event anchor
    const anchorMatch = line.match(/\{\{Anchor\|([^}]+)\}\}/);
    if (anchorMatch) {
      const name = anchorMatch[1].trim();

      // Collect flavor text from the next sour-gummy div with font-weight:normal
      const flavorLines: string[] = [];
      let j = i + 1;
      let foundFlavorDiv = false;
      while (j < lines.length && j < i + 20) {
        if (lines[j].includes("font-weight:normal")) {
          foundFlavorDiv = true;
          j++;
          while (j < lines.length && !lines[j].includes("</div>")) {
            const fl = lines[j].trim();
            if (fl) flavorLines.push(fl);
            j++;
          }
          break;
        }
        j++;
      }
      const flavor = flavorLines.join(" ");

      // Find sprite file reference
      let spriteFile = "";
      let k = i + 1;
      while (k < lines.length && k < i + 25) {
        const spriteMatch = lines[k].match(/\[\[File:([^|\]]+)/);
        if (spriteMatch) {
          spriteFile = spriteMatch[1].trim();
          break;
        }
        // Stop if we hit the first Option line
        if (lines[k].match(/Option:/)) break;
        k++;
      }

      // Collect the table body: everything from here until the table close `|}`
      const tableLines: string[] = [];
      let t = i + 1;
      while (t < lines.length) {
        if (lines[t].trim() === "|}") {
          break;
        }
        // If we hit the next event's anchor, stop before it
        if (t > i + 2 && lines[t].match(/\{\{Anchor\|/)) {
          break;
        }
        tableLines.push(lines[t]);
        t++;
      }

      blocks.push({
        name,
        category: currentCategory,
        chapter: currentChapter,
        flavor,
        spriteFile,
        tableBody: tableLines.join("\n"),
      });
    }

    i++;
  }

  return blocks;
}

// ─── Table parsing ──────────────────────────────────────────────────────────

interface ParsedOption {
  text: string;
  stat: string;
  outcomes: ParsedOutcome[];
}

interface ParsedOutcome {
  tier: string;
  narrative: string;
  effect: string;
}

/**
 * Parse the wikitable body for an event to extract options and their outcomes.
 *
 * Wiki table structure per outcome row:
 *   |-                              ← row separator
 *   | style="..." | Good<br>Common  ← tier cell
 *   | style="..." | narrative...    ← narrative cell (can be multiline)
 *   continuation lines...
 *   | effect text...                ← effect cell (can be multiline)
 *   continuation lines...
 *   |-                              ← next row
 */
function parseEventTable(tableBody: string): ParsedOption[] {
  const options: ParsedOption[] = [];
  let currentOption: ParsedOption | null = null;

  const lines = tableBody.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Option header: `Option: '''Name''' ({{Stat|str}})`
    const optionMatch = line.match(/Option:\s*'''([^']+)'''(?:\s*\(([^)]*)\))?/);
    if (optionMatch) {
      if (currentOption) options.push(currentOption);
      const statRaw = optionMatch[2] ?? "";
      const statMatch = statRaw.match(/\{\{Stat\|(\w+)\}\}/i) || statRaw.match(/([A-Za-z]{2,4})/);
      currentOption = {
        text: optionMatch[1].trim(),
        stat: statMatch ? statMatch[1].toUpperCase() : "",
        outcomes: [],
      };
      i++;
      continue;
    }

    // Tier row: | ... Good<br>Common or | ... Bad<br>Rare
    const tierMatch = line.match(/(Good|Bad)\s*(?:<br\s*\/?>)\s*(Common|Rare)/i);
    if (tierMatch && currentOption) {
      const tier = `${tierMatch[1]}/${tierMatch[2]}`;

      // Collect cells: narrative (cell 1) and effect (cell 2).
      // A new cell starts with `|` at the beginning of a line.
      // Lines NOT starting with `|`, `|-`, or `!` are continuations of the current cell.
      const cells: string[][] = [];
      let currentCell: string[] | null = null;

      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        const trimmed = nextLine.trim();

        // Row separator or next tier or next option or table header = done
        if (trimmed === "|-" || trimmed.startsWith("!") ||
            nextLine.match(/Option:/) ||
            nextLine.match(/(Good|Bad)\s*(?:<br\s*\/?>)\s*(Common|Rare)/i)) {
          break;
        }

        // New cell: line starts with `|` (but not `|-` or `|}`)
        if (/^\|\s/.test(nextLine) || nextLine === "|") {
          if (currentCell) cells.push(currentCell);
          const content = nextLine.replace(/^\|\s*(?:style="[^"]*"\s*\|)?\s*/, "");
          currentCell = [content];
        } else if (currentCell) {
          // Continuation of current cell
          currentCell.push(nextLine);
        }
        i++;
      }
      if (currentCell) cells.push(currentCell);

      const narrative = cells[0] ? cells[0].join("\n") : "";
      const effect = cells[1] ? cells[1].join("\n") : "";

      currentOption.outcomes.push({
        tier,
        narrative: cleanCell(narrative),
        effect: cleanCellPreserveTemplates(effect),
      });
      continue;
    }

    i++;
  }

  if (currentOption) options.push(currentOption);
  return options;
}

function cleanCell(raw: string): string {
  let text = raw.trim();
  // Remove style attributes
  text = text.replace(/style="[^"]*"\s*\|/g, "");
  // Convert <br> to newline then collapse
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Strip HTML tags
  text = text.replace(/<[^>]+>/g, "");
  // Clean leading/trailing pipes
  text = text.replace(/^\|+\s*/, "").replace(/\s*\|+$/, "");
  // Strip wiki bullet markers
  text = text.replace(/^\*+\s*/gm, "");
  // Collapse whitespace but keep newlines
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** Like cleanCell but preserves {{template}} syntax for downstream extraction. */
function cleanCellPreserveTemplates(raw: string): string {
  let text = raw.trim();
  // Remove style attributes
  text = text.replace(/style="[^"]*"\s*\|/g, "");
  // Convert <br> to newline
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Strip HTML tags but NOT {{ }}
  text = text.replace(/<[^>]+>/g, "");
  // Clean leading/trailing pipes
  text = text.replace(/^\|+\s*/, "").replace(/\s*\|+$/, "");
  // Strip wiki bullet markers
  text = text.replace(/^\*+\s*/gm, "");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

// ─── Internal metadata stripping ────────────────────────────────────────────

/** Lines that are purely internal game engine metadata — not useful to players. */
const INTERNAL_LINE_PATTERNS = [
  /^(?:Set|Increment|Decrement)\s+legacy\s+(?:token|counter):/i,
  /^Set legacy token:/i,
  /^Complete item quest:/i,
  /^Unlock adventure:/i,
  /^mapflag_/i,
  /WorldEventLegacy/i,
  /AbilityOnBattleStart_Immediate/i,
  // Wiki table fragments and HTML comment artifacts
  /^\|\}/, // table close
  /^\{\|\s*class=/, // table open
  /^-->/, // HTML comment end
  /^<!--/, // HTML comment start
];

function stripInternalLines(text: string): string {
  const lines = text.split("\n");
  const cleaned = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return !INTERNAL_LINE_PATTERNS.some((p) => p.test(trimmed));
  });
  const result = cleaned.join("\n").trim();
  return result || "Nothing happens.";
}

// ─── Debug event filtering ──────────────────────────────────────────────────

const DEBUG_EVENT_NAMES = new Set([
  "Ability Pool Test",
  "Legacy Event Test",
  "Mutation Pool Test",
  "Test Ability Mods",
  "Test Cutscene",
  "Test Misc",
  "Test Stuff",
]);

// ─── Build Event objects ────────────────────────────────────────────────────

function buildEvent(block: RawEventBlock, options: ParsedOption[]): Event {
  const choices = options.map((opt) => ({
    text: opt.text,
    description: opt.stat ? opt.stat : "",
    outcomes: opt.outcomes.map((o) => {
      const rawEffect = convertWikiTemplates(o.effect, true);
      const effect = stripInternalLines(rawEffect);
      return {
        label: o.tier,
        description: convertWikiTemplates(o.narrative, true),
        effect,
        check: opt.stat ? { stat: opt.stat, dc: "", kind: "stat" } : undefined,
        rewards: extractRewardsFromEffect(o.effect),
        penalties: extractPenaltiesFromEffect(o.effect),
      };
    }),
  }));

  const flavor = convertWikiTemplates(block.flavor, true);

  return {
    name: block.name,
    kind: "event",
    chapter: block.chapter || block.category,
    act: "",
    flavor,
    wikiDescription: "",
    choices,
    possibleRewards: collectAllRewards(choices),
    wikiNotes: "",
    wikiTrivia: "",
    spritePath: "",
    categories: [block.category].filter(Boolean),
    wikiUrl: `https://mewgenics.wiki.gg/wiki/Events#${encodeURIComponent(block.name.replace(/ /g, "_"))}`,
  };
}

function extractRewardsFromEffect(effect: string): string[] {
  const rewards: string[] = [];
  for (const m of effect.matchAll(/\{\{i\|([^}|]+)/gi)) rewards.push(m[1].trim());
  for (const m of effect.matchAll(/\{\{a\|([^}|]+)/gi)) rewards.push(m[1].trim());
  for (const m of effect.matchAll(/\{\{p\|([^}|]+)/gi)) rewards.push(m[1].trim());
  for (const m of effect.matchAll(/\{\{mut\|([^}|]+)/gi)) rewards.push(m[1].trim());
  return [...new Set(rewards)];
}

function extractPenaltiesFromEffect(effect: string): string[] {
  const penalties: string[] = [];
  for (const m of effect.matchAll(/\{\{d\|([^}|]+)/gi)) penalties.push(m[1].trim());
  for (const m of effect.matchAll(/\{\{st\|([^}|]+)/gi)) penalties.push(m[1].trim());
  return [...new Set(penalties)];
}

function collectAllRewards(choices: Event["choices"]): string[] {
  const all = new Set<string>();
  for (const c of choices) {
    for (const o of c.outcomes) {
      for (const r of o.rewards) all.add(r);
    }
  }
  return [...all].sort();
}

// ─── Sprite download ────────────────────────────────────────────────────────

async function downloadEventSprites(
  events: Array<{ name: string; spriteFile: string }>,
): Promise<{ saved: number; missing: string[] }> {
  ensureDirs(EVENT_SPRITES_DIR);

  let saved = 0;
  const missing: string[] = [];

  for (const { name, spriteFile } of events) {
    const safeName = toSafeName(name);
    const dest = path.join(EVENT_SPRITES_DIR, `${safeName}.png`);

    if (fs.existsSync(dest)) {
      saved++;
      continue;
    }

    if (!spriteFile) {
      missing.push(name);
      continue;
    }

    const url = await resolveFileUrl(spriteFile);
    if (!url) {
      missing.push(name);
      continue;
    }

    const success = await downloadSprite(url, name, EVENT_SPRITES_DIR);
    if (success) {
      saved++;
    } else {
      missing.push(name);
    }
    await sleep(200);
  }

  return { saved, missing };
}

async function resolveFileUrl(filename: string): Promise<string | null> {
  try {
    const url = `${API_BASE}?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&format=json`;
    const data = (await fetchJSON(url)) as {
      query: { pages: Record<string, { imageinfo?: Array<{ url: string }> }> };
    };
    const pages = Object.values(data.query.pages);
    return pages[0]?.imageinfo?.[0]?.url ?? null;
  } catch {
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  ensureDirs(DATA_DIR, EVENTS_DIR, EVENT_SPRITES_DIR);

  const force = process.argv.includes("--force") || process.argv.includes("--refresh");

  // Fetch or use cached page
  const cacheFile = path.join(DATA_DIR, ".events-page-cache.txt");
  let wikitext: string;

  if (!force && fs.existsSync(cacheFile)) {
    console.log("[Events] Using cached page...");
    wikitext = fs.readFileSync(cacheFile, "utf-8");
  } else {
    console.log("[Events] Fetching Events page from wiki...");
    wikitext = await fetchEventsPageWikitext();
    fs.writeFileSync(cacheFile, wikitext);
    console.log(`[Events] Page fetched (${(wikitext.length / 1024).toFixed(0)} KB)`);
  }

  // Split into blocks, filter debug events
  console.log("[Events] Parsing event blocks...");
  const allBlocks = splitIntoEventBlocks(wikitext);
  const debugFiltered = allBlocks.filter((b) => DEBUG_EVENT_NAMES.has(b.name) || b.chapter === "Debug Events");
  const blocks = allBlocks.filter((b) => !DEBUG_EVENT_NAMES.has(b.name) && b.chapter !== "Debug Events");
  console.log(`[Events] Found ${allBlocks.length} anchors, filtered ${debugFiltered.length} debug events → ${blocks.length} real events`);

  // Write event list
  const eventNames = blocks.map((b) => b.name);
  writeJson(path.join(DATA_DIR, "event-list.json"), eventNames);

  // Parse each event
  const events: Event[] = [];
  for (const block of blocks) {
    const options = parseEventTable(block.tableBody);
    const event = buildEvent(block, options);

    try {
      const validated = EventSchema.parse(event);
      events.push(validated);
      writeJson(path.join(EVENTS_DIR, `${toSafeName(block.name)}.json`), validated);
    } catch (err) {
      console.warn(`  [WARN] Validation failed for "${block.name}":`, err);
    }
  }

  console.log(`[Events] Parsed ${events.length}/${blocks.length} events`);

  // Download sprites
  console.log("\n[Events] Downloading sprites...");
  const spriteResult = await downloadEventSprites(
    blocks.map((b) => ({ name: b.name, spriteFile: b.spriteFile })),
  );

  // Backfill sprite paths
  for (const event of events) {
    const safe = toSafeName(event.name);
    const spriteOnDisk = path.join(EVENT_SPRITES_DIR, `${safe}.png`);
    const relative = fs.existsSync(spriteOnDisk)
      ? `data/sprites/events/${safe}.png`
      : "";
    if (event.spritePath !== relative) {
      event.spritePath = relative;
      writeJson(path.join(EVENTS_DIR, `${safe}.json`), event);
    }
  }

  if (spriteResult.missing.length > 0) {
    writeJson(path.join(DATA_DIR, "missing-event-sprites.json"), spriteResult.missing);
  }

  // QC: events with 0 choices
  const empty = events.filter((e) => e.choices.length === 0);
  if (empty.length > 0) {
    console.log(`\n[QC] ${empty.length} events with 0 choices:`);
    for (const e of empty.slice(0, 15)) console.log(`  - ${e.name}`);
    if (empty.length > 15) console.log(`  ... and ${empty.length - 15} more`);
    writeJson(path.join(DATA_DIR, "events-no-choices.json"), empty.map((e) => e.name));
  }

  console.log("\n────────────────────────────────");
  console.log(`Events parsed:    ${events.length}/${blocks.length}`);
  console.log(`With choices:     ${events.length - empty.length}`);
  console.log(`Sprites saved:    ${spriteResult.saved}`);
  console.log(`Sprites missing:  ${spriteResult.missing.length}`);
  console.log("────────────────────────────────");
}

main().catch((err) => {
  console.error("Event crawl failed:", err);
  process.exit(1);
});
