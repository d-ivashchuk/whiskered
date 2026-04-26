/**
 * Boss Source-Bundle Assembler  (repurposed — was previously an LLM hydrator)
 *
 * For each boss in `data/bosses/<Name>.json`, gathers:
 *   - the raw wiki entry (already on disk)
 *   - top reddit threads from r/mewgenics matching the boss name
 *   - top Steam Community discussions matching the boss name (currently
 *     auth-walled — Steam will return 0 threads anonymously)
 *
 * Writes a single readable markdown bundle per boss to:
 *   data/bundles/<Name>.md
 *
 * The actual hydration (synthesizing tactics into the HydratedBoss schema) is
 * NOT done here — Claude reads the bundles directly in the chat session and
 * writes `data/bosses-hydrated/<Name>.json` by hand. That keeps source
 * attribution honest: every claim cites a URL listed in the bundle.
 *
 * Caches: data/cache/reddit/, data/cache/steam/  (re-runs are cheap)
 *
 * Usage:
 *   npx tsx scripts/hydrate-bosses.ts                         # all bosses
 *   npx tsx scripts/hydrate-bosses.ts Boris "Lord Bunga"      # specific bosses
 *   npx tsx scripts/hydrate-bosses.ts --refresh               # ignore cached output
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { gatherThreadsForQuery, type RedditThreadFull } from "./lib/reddit.js";
import { gatherSteamThreadsForQuery, type SteamThreadFull } from "./lib/steam.js";
import { ensureDirs, sleep, toSafeName, readJsonIfExists, writeJson } from "./lib/util.js";
import { BossSchema, type Boss } from "./lib/schemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "data");
const BOSSES_DIR = path.join(DATA_DIR, "bosses");
const BUNDLES_DIR = path.join(DATA_DIR, "bundles");
const CACHE_DIR = path.join(DATA_DIR, "cache");
const REPORT_PATH = path.join(DATA_DIR, "boss-bundles-report.json");

const SUBREDDIT = "mewgenics";
const REDDIT_THREAD_LIMIT = 6;
const REDDIT_MAX_COMMENTS = 30;
const STEAM_THREAD_LIMIT = 4;
const STEAM_MAX_REPLIES = 15;

// ─── Bundle writers ─────────────────────────────────────────────────────────

function loadAllBosses(): Boss[] {
  const out: Boss[] = [];
  for (const file of fs.readdirSync(BOSSES_DIR)) {
    if (!file.endsWith(".json")) continue;
    const raw = readJsonIfExists<unknown>(path.join(BOSSES_DIR, file));
    if (!raw) continue;
    const parsed = BossSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(`[WARN] ${file} failed schema: ${parsed.error.message.slice(0, 120)}`);
      continue;
    }
    // Skip the category landing page itself ("Bosses") — it has no infobox
    // and would generate noise. Old crawl runs may have left it on disk.
    if (parsed.data.name === "Bosses") continue;
    out.push(parsed.data);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function fmtWikiSection(b: Boss): string {
  const lines: string[] = [];
  lines.push(`## Wiki`);
  lines.push(`- URL: ${b.wikiUrl}`);
  if (b.foundIn) lines.push(`- Location: ${b.foundIn}`);
  if (b.size) lines.push(`- Size: ${b.size}`);
  if (b.mainTheme) lines.push(`- Music: ${b.mainTheme}`);
  if (b.attackStyle) lines.push(`- Attack style: ${b.attackStyle}`);
  const stats: string[] = [];
  if (b.stats.health) stats.push(`HP ${b.stats.health}`);
  if (b.stats.damage) stats.push(`DMG ${b.stats.damage}`);
  if (b.stats.movement) stats.push(`MOV ${b.stats.movement}`);
  if (b.stats.luck) stats.push(`LCK ${b.stats.luck}`);
  if (stats.length) lines.push(`- Stats: ${stats.join(" | ")}`);

  if (b.attacks.length > 0) {
    lines.push("\n### Attacks");
    for (const a of b.attacks) lines.push(`- **${a.name}** — ${a.description}`);
  }
  if (b.wikiBehavior) lines.push(`\n### Behavior\n${b.wikiBehavior}`);
  if (b.wikiStrategies) lines.push(`\n### Wiki strategies\n${b.wikiStrategies}`);
  if (b.wikiNotes) lines.push(`\n### Notes\n${b.wikiNotes}`);
  if (b.wikiQuotes.length) lines.push(`\n### Quotes\n${b.wikiQuotes.map((q) => `- "${q}"`).join("\n")}`);
  return lines.join("\n");
}

function fmtRedditThread(t: RedditThreadFull, idx: number): string {
  const lines: string[] = [];
  lines.push(`### [R${idx}] ${t.title}`);
  lines.push(`- URL: ${t.permalink}`);
  lines.push(`- Score: ${t.score}, comments: ${t.numComments}`);
  if (t.selftext) {
    lines.push(`- OP: ${t.selftext.replace(/\s+/g, " ").trim().slice(0, 1200)}`);
  }
  if (t.comments.length) {
    lines.push(`- Top comments:`);
    for (const c of t.comments.slice(0, 12)) {
      const body = c.body.replace(/\s+/g, " ").trim().slice(0, 500);
      lines.push(`  - **u/${c.author} (${c.score})**: ${body}`);
    }
  }
  return lines.join("\n");
}

function fmtSteamThread(t: SteamThreadFull, idx: number): string {
  const lines: string[] = [];
  lines.push(`### [S${idx}] ${t.title}`);
  lines.push(`- URL: ${t.url}`);
  if (t.opBody) lines.push(`- OP: ${t.opBody.slice(0, 1000)}`);
  if (t.replies.length) {
    lines.push(`- Replies:`);
    for (const r of t.replies.slice(0, 8)) {
      lines.push(`  - ${r.body.slice(0, 500)}`);
    }
  }
  return lines.join("\n");
}

interface BundleManifest {
  name: string;
  bundlePath: string;
  redditThreads: number;
  steamThreads: number;
  redditAccessIssue: boolean;
  steamAccessIssue: boolean;
  sourceUrls: string[];
}

async function buildBundle(boss: Boss, force: boolean): Promise<BundleManifest> {
  const safe = toSafeName(boss.name);
  const bundlePath = path.join(BUNDLES_DIR, `${safe}.md`);

  // Reddit search — strip parenthetical disambiguators ("Stacy (Boss)" → "Stacy"),
  // they hurt full-text recall.
  const cleanQuery = boss.name.replace(/\s*\([^)]+\)\s*/g, "").trim();

  const reddit = await gatherThreadsForQuery(
    DATA_DIR,
    SUBREDDIT,
    cleanQuery,
    REDDIT_THREAD_LIMIT,
    REDDIT_MAX_COMMENTS,
  );
  const steam = await gatherSteamThreadsForQuery(
    DATA_DIR,
    cleanQuery,
    STEAM_THREAD_LIMIT,
    STEAM_MAX_REPLIES,
  );

  const sourceUrls: string[] = [];
  sourceUrls.push(boss.wikiUrl);
  for (const t of reddit.threads) sourceUrls.push(t.permalink);
  for (const t of steam.threads) sourceUrls.push(t.url);

  // Write the bundle even if we're not forcing — bundles are cheap to regenerate.
  if (!force && fs.existsSync(bundlePath)) {
    // still report the manifest without rewriting the file
    return {
      name: boss.name,
      bundlePath: path.relative(DATA_DIR, bundlePath),
      redditThreads: reddit.threads.length,
      steamThreads: steam.threads.length,
      redditAccessIssue: reddit.searchStatus !== 200,
      steamAccessIssue: steam.searchStatus !== 200,
      sourceUrls,
    };
  }

  const md: string[] = [];
  md.push(`# ${boss.name}`);
  md.push("");
  md.push(`> Source bundle for boss tactics hydration. Every URL listed in`);
  md.push(`> "Source URL inventory" is allowed as a citation. Anything not`);
  md.push(`> listed here may not be cited.`);
  md.push("");
  md.push(fmtWikiSection(boss));
  md.push("");
  md.push(`## Reddit (r/${SUBREDDIT})`);
  if (reddit.searchStatus !== 200) {
    md.push(`*Reddit search returned status ${reddit.searchStatus}. Treat as no signal.*`);
  } else if (reddit.threads.length === 0) {
    md.push(`*No relevant threads found.*`);
  } else {
    for (let i = 0; i < reddit.threads.length; i++) md.push(fmtRedditThread(reddit.threads[i], i + 1));
  }
  md.push("");
  md.push(`## Steam Community discussions`);
  if (steam.searchStatus !== 200) {
    md.push(`*Steam search returned status ${steam.searchStatus} (likely auth-walled). Treat as no signal.*`);
  } else if (steam.threads.length === 0) {
    md.push(`*No relevant threads found.*`);
  } else {
    for (let i = 0; i < steam.threads.length; i++) md.push(fmtSteamThread(steam.threads[i], i + 1));
  }
  md.push("");
  md.push(`## Source URL inventory (citation whitelist)`);
  for (const u of sourceUrls) md.push(`- ${u}`);
  md.push("");

  fs.writeFileSync(bundlePath, md.join("\n"));

  return {
    name: boss.name,
    bundlePath: path.relative(DATA_DIR, bundlePath),
    redditThreads: reddit.threads.length,
    steamThreads: steam.threads.length,
    redditAccessIssue: reddit.searchStatus !== 200,
    steamAccessIssue: steam.searchStatus !== 200,
    sourceUrls,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  ensureDirs(BUNDLES_DIR, CACHE_DIR);

  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));
  const force = flags.has("--refresh");

  const allBosses = loadAllBosses();
  const targets =
    positional.length > 0
      ? allBosses.filter((b) => positional.includes(b.name))
      : allBosses;

  if (targets.length === 0) {
    console.error("No bosses matched. Available:");
    console.error(allBosses.map((b) => `  ${b.name}`).join("\n"));
    process.exit(1);
  }

  console.log(`Building bundles for ${targets.length} boss(es)...`);

  const manifests: BundleManifest[] = [];
  for (let i = 0; i < targets.length; i++) {
    const b = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${b.name}... `);
    try {
      const m = await buildBundle(b, force);
      manifests.push(m);
      console.log(
        `reddit=${m.redditThreads} steam=${m.steamThreads}` +
          (m.redditAccessIssue ? " [reddit issue]" : "") +
          (m.steamAccessIssue ? " [steam issue]" : ""),
      );
    } catch (err) {
      console.warn(`FAILED: ${err instanceof Error ? err.message : err}`);
    }
    if (i < targets.length - 1) await sleep(500);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    count: manifests.length,
    redditThinSignal: manifests.filter((m) => m.redditThreads === 0).map((m) => m.name),
    steamThinSignal: manifests.filter((m) => m.steamThreads === 0).map((m) => m.name),
    redditAccessIssues: manifests.filter((m) => m.redditAccessIssue).map((m) => m.name),
    steamAccessIssues: manifests.filter((m) => m.steamAccessIssue).map((m) => m.name),
    bundles: manifests,
  };
  writeJson(REPORT_PATH, report);

  console.log("\n────────────────────────────────");
  console.log(`Bundles written: ${manifests.length}`);
  console.log(`Reddit thin:     ${report.redditThinSignal.length}`);
  console.log(`Steam thin:      ${report.steamThinSignal.length}`);
  if (report.redditAccessIssues.length)
    console.log(`Reddit access issues: ${report.redditAccessIssues.join(", ")}`);
  console.log(`Report:          ${path.relative(DATA_DIR, REPORT_PATH)}`);
  console.log("────────────────────────────────");
}

main().catch((err) => {
  console.error("Bundle build failed:", err);
  process.exit(1);
});
