/**
 * Disk-cached fetchers.
 *
 * - `fetchAndCacheEntities` — batched MediaWiki entity fetch with per-entity JSON cache.
 * - `cachedFetchText`     — generic text-body fetch with key-based cache (for Reddit / Steam).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

import { BATCH_SIZE, RATE_LIMIT_MS } from "./mediawiki.js";
import { chunk, sleep, toSafeName } from "./util.js";

export async function fetchAndCacheEntities<T extends { name: string }>(
  names: string[],
  cacheDir: string,
  fetchBatch: (titles: string[]) => Promise<T[]>,
  label: string,
  opts: { force?: boolean } = {},
): Promise<T[]> {
  fs.mkdirSync(cacheDir, { recursive: true });

  console.log(`[${label}] Fetching data in batches of ${BATCH_SIZE}...`);
  const all: T[] = [];
  const batches = chunk(names, BATCH_SIZE);

  const uncachedBatches: string[][] = [];
  for (const batch of batches) {
    const uncached: string[] = [];
    for (const name of batch) {
      const filePath = path.join(cacheDir, `${toSafeName(name)}.json`);
      if (!opts.force && fs.existsSync(filePath)) {
        try {
          all.push(JSON.parse(fs.readFileSync(filePath, "utf-8")) as T);
          continue;
        } catch {
          /* fall through to re-fetch */
        }
      }
      uncached.push(name);
    }
    if (uncached.length > 0) uncachedBatches.push(uncached);
  }

  if (all.length > 0) {
    console.log(`  ${all.length} loaded from cache`);
  }

  for (let i = 0; i < uncachedBatches.length; i++) {
    const batch = uncachedBatches[i];
    try {
      const entities = await fetchBatch(batch);
      for (const entity of entities) {
        all.push(entity);
        fs.writeFileSync(
          path.join(cacheDir, `${toSafeName(entity.name)}.json`),
          JSON.stringify(entity, null, 2),
        );
      }
      console.log(
        `  Batch ${i + 1}/${uncachedBatches.length}: ${entities.length}/${batch.length} parsed (${all.length} total)`,
      );
    } catch (err) {
      console.warn(`  [ERR] Batch ${i + 1} failed:`, err);
    }
    if (i < uncachedBatches.length - 1) await sleep(RATE_LIMIT_MS);
  }

  console.log(`[${label}] ${all.length}/${names.length} parsed.\n`);
  return all;
}

// ── Generic text cache (Reddit, Steam, etc.) ───────────────────────────────

export interface CachedFetchOptions {
  cacheDir: string;
  /** Cache lifetime; default 30 days. Pass 0 to always refetch. */
  ttlMs?: number;
  /** Extra headers (e.g. User-Agent). */
  headers?: Record<string, string>;
  /** Stable key for the request — defaults to a SHA1 of the URL. */
  key?: string;
  /** File extension for the cache file. */
  ext?: string;
}

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function defaultKey(url: string): string {
  return crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
}

/** Fetch a URL's response body as text, caching to disk. Honors Retry-After once. */
export async function cachedFetchText(
  url: string,
  opts: CachedFetchOptions,
): Promise<{ body: string; fromCache: boolean; status: number }> {
  fs.mkdirSync(opts.cacheDir, { recursive: true });
  const key = opts.key ?? defaultKey(url);
  const ext = opts.ext ?? ".json";
  const cachePath = path.join(opts.cacheDir, `${key}${ext}`);
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;

  if (fs.existsSync(cachePath)) {
    const stat = fs.statSync(cachePath);
    if (ttl <= 0 || Date.now() - stat.mtimeMs < ttl) {
      return {
        body: fs.readFileSync(cachePath, "utf-8"),
        fromCache: true,
        status: 200,
      };
    }
  }

  let res = await fetch(url, { headers: opts.headers });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "5", 10);
    const wait = Math.max(retryAfter, 5) * 1000;
    console.warn(`  [429] ${url} — waiting ${wait / 1000}s...`);
    await sleep(wait);
    res = await fetch(url, { headers: opts.headers });
  }
  if (!res.ok) {
    return { body: "", fromCache: false, status: res.status };
  }
  const body = await res.text();
  fs.writeFileSync(cachePath, body);
  return { body, fromCache: false, status: res.status };
}
