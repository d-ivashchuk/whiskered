/**
 * MediaWiki API client.
 *
 * Polite by default: User-Agent, maxlag=5, exponential backoff on 429.
 * Used by the wiki crawlers (items, classes, abilities, bosses, ...).
 */

import { sleep, chunk } from "./util.js";

export const API_BASE = "https://mewgenics.wiki.gg/api.php";
export const USER_AGENT =
  "MewgenicsScanner/1.0 (https://github.com/mewgenics-scanner; crawler for ML training data)";
export const RATE_LIMIT_MS = 1000;
export const BATCH_SIZE = 50; // MediaWiki max titles per query

/** Build a wiki page URL from a title (`Boris` → `https://mewgenics.wiki.gg/wiki/Boris`). */
export function wikiPageUrl(title: string): string {
  return `https://mewgenics.wiki.gg/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/** Fetch JSON from the MediaWiki API with User-Agent, maxlag, and retry on 429. */
export async function fetchJSON(url: string, retries = 4): Promise<unknown> {
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

/** Iterate every page in a category (handles continuation tokens). Returns titles. */
export async function fetchCategoryMembers(
  category: string,
  label: string,
): Promise<string[]> {
  const names: string[] = [];
  let cmcontinue: string | undefined;

  console.log(`[${label}] Fetching from ${category}...`);

  do {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: category,
      cmlimit: "500",
      format: "json",
    });
    if (cmcontinue) params.set("cmcontinue", cmcontinue);

    const data = (await fetchJSON(`${API_BASE}?${params}`)) as {
      query: { categorymembers: Array<{ pageid: number; ns: number; title: string }> };
      continue?: { cmcontinue: string };
    };

    for (const member of data.query.categorymembers) {
      if (member.ns === 0) names.push(member.title);
    }

    cmcontinue = data.continue?.cmcontinue;
    if (cmcontinue) {
      console.log(`  ...${names.length} so far`);
      await sleep(RATE_LIMIT_MS);
    }
  } while (cmcontinue);

  console.log(`[${label}] Found ${names.length} entries.`);
  return names;
}

export interface WikiPage {
  title: string;
  wikitext: string;
}

/** Fetch wikitext for up to `BATCH_SIZE` page titles in a single call. */
export async function fetchPagesBatch(titles: string[]): Promise<WikiPage[]> {
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
          revisions?: Array<{ slots: { main: { "*": string } } }>;
        }
      >;
    };
  };

  const pages: WikiPage[] = [];
  for (const page of Object.values(data.query.pages)) {
    if (page.missing !== undefined || !page.revisions?.[0]) continue;
    const wikitext = page.revisions[0].slots.main["*"];
    if (wikitext.startsWith("#REDIRECT")) continue;
    pages.push({ title: page.title, wikitext });
  }
  return pages;
}

/**
 * Look up sprite file URLs in batches. Tries multiple extensions in order,
 * since the wiki uses both PNG and SVG. Returns name → URL mapping.
 *
 * @param prefix    File prefix on the wiki, e.g. "ITEM" / "BOSS" / "ENEMY"
 * @param extensions File extensions to try, in order
 */
export async function fetchSpriteUrlsBatch(
  names: string[],
  prefix: string,
  extensions: string[] = ["png", "svg"],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const extPattern = extensions.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const prefixPattern = new RegExp(`^File:${prefix}[_ ](.+)\\.(${extPattern})$`, "i");

  for (const ext of extensions) {
    const remaining = names.filter((n) => !result.has(n));
    if (remaining.length === 0) break;

    const batches = chunk(remaining, BATCH_SIZE);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const titles = batch
        .map((name) => `File:${prefix}_${name.replace(/ /g, "_")}.${ext}`)
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
          const m = page.title.match(prefixPattern);
          if (m) {
            const extracted = m[1].replace(/_/g, " ");
            const original = batch.find(
              (n) =>
                n.toLowerCase().replace(/_/g, " ") ===
                extracted.toLowerCase().replace(/_/g, " "),
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
