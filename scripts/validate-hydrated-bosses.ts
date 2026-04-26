/**
 * Zod-validate every file under `data/bosses-hydrated/`.
 *
 * Also runs a lightweight content audit:
 *   - every bullet's `sources[]` URL must appear in either:
 *       a) the boss's wiki URL (for wiki-derived claims), or
 *       b) the boss's bundle source-URL inventory (Reddit/Steam threads).
 *
 * Exits non-zero on any failure.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { HydratedBossSchema, BossSchema, type HydratedBoss } from "./lib/schemas.js";
import { toSafeName, readJsonIfExists } from "./lib/util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "data");
const HYDRATED_DIR = path.join(DATA_DIR, "bosses-hydrated");
const BOSSES_DIR = path.join(DATA_DIR, "bosses");
const BUNDLES_DIR = path.join(DATA_DIR, "bundles");

interface AuditFail {
  file: string;
  reason: string;
}

function buildAllowedSources(name: string): Set<string> {
  const allowed = new Set<string>();
  // Wiki URL from boss JSON
  const safe = toSafeName(name);
  const bossJson = readJsonIfExists<unknown>(path.join(BOSSES_DIR, `${safe}.json`));
  const parsed = BossSchema.safeParse(bossJson);
  if (parsed.success) allowed.add(parsed.data.wikiUrl);

  // Source URLs from the bundle (extracted from "## Source URL inventory" section)
  const bundlePath = path.join(BUNDLES_DIR, `${safe}.md`);
  if (fs.existsSync(bundlePath)) {
    const text = fs.readFileSync(bundlePath, "utf-8");
    const m = text.match(/## Source URL inventory[\s\S]*?$/m);
    if (m) {
      for (const line of m[0].split("\n")) {
        const url = line.match(/^- (\S+)/);
        if (url) allowed.add(url[1]);
      }
    }
    // Also grab any URL in the bundle as an allowed citation (covers
    // sub-comment permalinks etc.).
    const urlRe = /https?:\/\/\S+/g;
    let u: RegExpExecArray | null;
    while ((u = urlRe.exec(text)) !== null) {
      // Strip trailing punctuation
      allowed.add(u[0].replace(/[.,;:)\]]+$/, ""));
    }
  }
  return allowed;
}

function auditBullets(boss: HydratedBoss, allowed: Set<string>): string[] {
  const failures: string[] = [];
  const fields: Array<keyof HydratedBoss> = [
    "commonStrategies",
    "counters",
    "keyStatuses",
    "notableInteractions",
    "communityTips",
    "partyComps",
  ];
  for (const f of fields) {
    const bullets = boss[f] as Array<{ text: string; sources: string[] }>;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (b.sources.length === 0) {
        failures.push(`${f}[${i}]: empty sources[]`);
        continue;
      }
      for (const s of b.sources) {
        const cleaned = s.replace(/[.,;:)\]]+$/, "");
        if (!allowed.has(cleaned)) {
          // Allow URL prefix matches — Reddit comment permalinks vs thread permalinks.
          let matched = false;
          for (const a of allowed) {
            if (cleaned.startsWith(a) || a.startsWith(cleaned)) {
              matched = true;
              break;
            }
          }
          if (!matched) failures.push(`${f}[${i}]: source not in bundle inventory: ${s}`);
        }
      }
    }
  }
  return failures;
}

function main() {
  const fails: AuditFail[] = [];
  if (!fs.existsSync(HYDRATED_DIR)) {
    console.error(`No hydrated dir: ${HYDRATED_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(HYDRATED_DIR).filter((f) => f.endsWith(".json") && !f.includes(".invalid."));
  if (files.length === 0) {
    console.log("No hydrated boss files yet.");
    return;
  }

  let ok = 0;
  for (const file of files) {
    const filePath = path.join(HYDRATED_DIR, file);
    const raw = readJsonIfExists<unknown>(filePath);
    const parsed = HydratedBossSchema.safeParse(raw);
    if (!parsed.success) {
      fails.push({ file, reason: `Zod: ${parsed.error.message.slice(0, 200)}` });
      continue;
    }
    const allowed = buildAllowedSources(parsed.data.name);
    const audit = auditBullets(parsed.data, allowed);
    if (audit.length > 0) {
      fails.push({ file, reason: `Source audit: ${audit.join("; ")}` });
      continue;
    }
    ok++;
    console.log(
      `✓ ${file} — confidence=${parsed.data.confidence} bullets=${
        parsed.data.commonStrategies.length +
        parsed.data.counters.length +
        parsed.data.keyStatuses.length +
        parsed.data.notableInteractions.length +
        parsed.data.communityTips.length +
        parsed.data.partyComps.length
      }`,
    );
  }

  if (fails.length > 0) {
    console.error(`\n${fails.length} failure(s):`);
    for (const f of fails) console.error(`  ${f.file}: ${f.reason}`);
    process.exit(1);
  }
  console.log(`\nAll ${ok} hydrated bosses pass schema + source audit.`);
}

main();
