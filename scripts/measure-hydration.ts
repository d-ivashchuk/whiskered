/**
 * Measure actual hydration prompt sizes without calling Claude.
 *
 * Useful for cost estimation before authorising the real hydration run.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { gatherThreadsForQuery } from "./lib/reddit.js";
import { gatherSteamThreadsForQuery } from "./lib/steam.js";
import { BossSchema, type Boss } from "./lib/schemas.js";
import { toSafeName } from "./lib/util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "..", "data");

// Tiny duplicate of formatters from hydrate-bosses.ts so we can call them
// without exposing internals. Kept synced with that file's prompt structure.
function fmtWiki(b: Boss): string {
  const lines: string[] = [];
  lines.push(`Wiki URL: ${b.wikiUrl}`);
  if (b.foundIn) lines.push(`Location: ${b.foundIn}`);
  if (b.size) lines.push(`Size: ${b.size}`);
  const stats: string[] = [];
  if (b.stats.health) stats.push(`HP ${b.stats.health}`);
  if (b.stats.damage) stats.push(`DMG ${b.stats.damage}`);
  if (b.stats.movement) stats.push(`MOV ${b.stats.movement}`);
  if (b.stats.luck) stats.push(`LCK ${b.stats.luck}`);
  if (stats.length) lines.push(`Stats: ${stats.join(" | ")}`);
  if (b.attacks.length) lines.push(`Attacks: ${b.attacks.map((a) => `${a.name}: ${a.description}`).join("; ")}`);
  if (b.wikiBehavior) lines.push(`\nBehavior:\n${b.wikiBehavior}`);
  if (b.wikiStrategies) lines.push(`\nWiki strategies:\n${b.wikiStrategies}`);
  if (b.wikiNotes) lines.push(`\nNotes:\n${b.wikiNotes}`);
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const bossListPath = path.join(DATA_DIR, "boss-list.json");
  const allNames = JSON.parse(fs.readFileSync(bossListPath, "utf-8")) as string[];
  const targets = args.length > 0 ? args : allNames;

  let totalChars = 0;
  let measured = 0;

  for (const name of targets) {
    const safe = toSafeName(name);
    const bossPath = path.join(DATA_DIR, "bosses", `${safe}.json`);
    if (!fs.existsSync(bossPath)) continue;
    const boss = BossSchema.parse(JSON.parse(fs.readFileSync(bossPath, "utf-8")));
    const cleanQuery = name.replace(/\s*\([^)]+\)\s*/g, "").trim();
    const r = await gatherThreadsForQuery(DATA_DIR, "mewgenics", cleanQuery, 6, 30);
    const s = await gatherSteamThreadsForQuery(DATA_DIR, cleanQuery, 4, 15);

    let body = fmtWiki(boss);
    for (const t of r.threads) {
      body += `\n[R] ${t.permalink}\n  ${t.title} (${t.score})`;
      if (t.selftext) body += `\n  OP: ${t.selftext.slice(0, 1000)}`;
      for (const c of t.comments.slice(0, 12)) body += `\n  - ${c.body.slice(0, 400)}`;
    }
    for (const t of s.threads) {
      body += `\n[S] ${t.url}\n  ${t.title}`;
      if (t.opBody) body += `\n  OP: ${t.opBody.slice(0, 800)}`;
      for (const rep of t.replies.slice(0, 8)) body += `\n  - ${rep.body.slice(0, 400)}`;
    }
    const scaffold = 2500; // approx static prompt scaffold (rules + schema)
    const totalForBoss = body.length + scaffold;
    totalChars += totalForBoss;
    measured++;
    console.log(`${name.padEnd(28)} reddit=${r.threads.length}  steam=${s.threads.length}  ~${Math.round(totalForBoss / 4)} tok`);
  }

  if (measured === 0) {
    console.log("No cached bosses to measure.");
    return;
  }
  const avgTok = Math.round(totalChars / 4 / measured);
  const estTotal = avgTok * 32; // scale to all 32
  const inUSD = (estTotal * 3) / 1_000_000;
  const outUSD = (32 * 1200 * 15) / 1_000_000; // assume 1.2K output tokens per boss
  console.log("");
  console.log(`Measured ${measured} cached bosses. Avg input: ~${avgTok} tokens/boss.`);
  console.log(`If we hydrate all 32: ~${estTotal} input tokens, ~${32 * 1200} output tokens.`);
  console.log(`Estimated cost (Sonnet 4.5 list): $${(inUSD + outUSD).toFixed(3)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
