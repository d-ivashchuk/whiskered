/**
 * Anonymous Reddit JSON client for community-tactic hydration.
 *
 * Uses public `*.json` endpoints — no OAuth, no logged-in session.
 * Caches every response under `data/cache/reddit/`.
 *
 * If/when Reddit starts auth-walling these endpoints, the fallback is a
 * script-type OAuth app — that's a follow-up, not blocking now.
 */

import * as path from "node:path";

import { cachedFetchText } from "./fs-cache.js";
import { sleep } from "./util.js";

export const REDDIT_USER_AGENT =
  "MewgenicsScanner/1.0 (community-research crawler; contact: github.com/mewgenics-scanner)";
const REDDIT_BASE = "https://www.reddit.com";

export interface RedditThreadSummary {
  id: string;
  permalink: string;       // full URL, e.g. https://www.reddit.com/r/mewgenics/comments/.../...
  title: string;
  author: string;
  score: number;
  numComments: number;
  selftext: string;        // OP body, may be empty for link posts
  createdUtc: number;
}

export interface RedditCommentNode {
  id: string;
  author: string;
  body: string;
  score: number;
  depth: number;
  permalink: string;       // full URL (parent + comment id)
}

export interface RedditThreadFull extends RedditThreadSummary {
  comments: RedditCommentNode[];
}

interface RedditListing<T> {
  kind: "Listing";
  data: { children: Array<{ kind: string; data: T }>; after: string | null };
}

interface RedditPost {
  id: string;
  permalink: string;
  title: string;
  author: string;
  score: number;
  num_comments: number;
  selftext: string;
  created_utc: number;
  subreddit: string;
  over_18?: boolean;
}

interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  depth: number;
  permalink: string;
  replies?: "" | RedditListing<RedditComment | { id: string }>;
}

function fullUrl(permalink: string): string {
  if (permalink.startsWith("http")) return permalink;
  return `${REDDIT_BASE}${permalink}`;
}

const CACHE_DIR = (root: string) => path.join(root, "cache", "reddit");

/**
 * Search a subreddit for `query`. Returns top N threads sorted by relevance.
 * Cached by query+limit so re-runs are free.
 */
export async function searchSubreddit(
  dataDir: string,
  subreddit: string,
  query: string,
  limit = 10,
): Promise<{ threads: RedditThreadSummary[]; status: number; fromCache: boolean }> {
  const url = `${REDDIT_BASE}/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&limit=${limit}&sort=relevance`;
  const cacheKey = `search_${subreddit}_${query.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 60)}_${limit}`;

  const { body, fromCache, status } = await cachedFetchText(url, {
    cacheDir: CACHE_DIR(dataDir),
    headers: { "User-Agent": REDDIT_USER_AGENT },
    key: cacheKey,
    ext: ".json",
  });

  if (status !== 200 || !body) return { threads: [], status, fromCache };

  let listing: RedditListing<RedditPost>;
  try {
    listing = JSON.parse(body) as RedditListing<RedditPost>;
  } catch {
    return { threads: [], status, fromCache };
  }

  const threads = listing.data.children
    .filter((c) => c.kind === "t3")
    .map((c) => c.data)
    .filter((p) => p.subreddit?.toLowerCase() === subreddit.toLowerCase())
    .map((p): RedditThreadSummary => ({
      id: p.id,
      permalink: fullUrl(p.permalink),
      title: p.title,
      author: p.author,
      score: p.score,
      numComments: p.num_comments,
      selftext: p.selftext ?? "",
      createdUtc: p.created_utc,
    }));

  return { threads, status, fromCache };
}

/**
 * Fetch a thread + its comment tree. Flattens to a list of comments with depth.
 *
 * `permalink` may be either the full URL or just `/r/.../comments/.../...`.
 */
export async function fetchThread(
  dataDir: string,
  permalink: string,
  maxComments = 60,
): Promise<{ thread: RedditThreadFull | null; status: number; fromCache: boolean }> {
  const cleaned = permalink.replace(/\/$/, "");
  const url = `${cleaned.startsWith("http") ? cleaned : REDDIT_BASE + cleaned}.json?limit=${maxComments}&depth=4`;
  const idMatch = cleaned.match(/\/comments\/([a-z0-9]+)/i);
  const cacheKey = `thread_${idMatch ? idMatch[1] : cleaned.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 24)}`;

  const { body, fromCache, status } = await cachedFetchText(url, {
    cacheDir: CACHE_DIR(dataDir),
    headers: { "User-Agent": REDDIT_USER_AGENT },
    key: cacheKey,
    ext: ".json",
  });

  if (status !== 200 || !body) return { thread: null, status, fromCache };

  let parsed: Array<RedditListing<RedditPost | RedditComment>>;
  try {
    parsed = JSON.parse(body) as Array<RedditListing<RedditPost | RedditComment>>;
  } catch {
    return { thread: null, status, fromCache };
  }

  const postChild = parsed[0]?.data?.children?.[0];
  if (!postChild || postChild.kind !== "t3") return { thread: null, status, fromCache };
  const post = postChild.data as RedditPost;

  const comments: RedditCommentNode[] = [];
  const walk = (children: RedditListing<RedditComment | { id: string }>["data"]["children"]) => {
    for (const child of children) {
      if (child.kind !== "t1") continue;
      const c = child.data as RedditComment;
      if (!c.body || c.author === "[deleted]") continue;
      comments.push({
        id: c.id,
        author: c.author,
        body: c.body,
        score: c.score,
        depth: c.depth ?? 0,
        permalink: fullUrl(c.permalink),
      });
      if (typeof c.replies === "object" && c.replies?.data?.children) {
        walk(c.replies.data.children);
      }
    }
  };
  if (parsed[1]?.data?.children) walk(parsed[1].data.children);

  // Sort by score desc and cap at maxComments
  comments.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = comments.slice(0, maxComments);

  const thread: RedditThreadFull = {
    id: post.id,
    permalink: fullUrl(post.permalink),
    title: post.title,
    author: post.author,
    score: post.score,
    numComments: post.num_comments,
    selftext: post.selftext ?? "",
    createdUtc: post.created_utc,
    comments: top,
  };

  return { thread, status, fromCache };
}

/**
 * Search + fetch the top-N threads for a query. Returns full threads.
 * Adds a 1s delay between non-cached fetches.
 */
export async function gatherThreadsForQuery(
  dataDir: string,
  subreddit: string,
  query: string,
  limit = 6,
  maxComments = 40,
): Promise<{ threads: RedditThreadFull[]; searchStatus: number; thinSignal: boolean }> {
  const { threads: summaries, status } = await searchSubreddit(dataDir, subreddit, query, limit);
  if (status !== 200) {
    return { threads: [], searchStatus: status, thinSignal: true };
  }
  // Sort by score desc, take top `limit`
  const top = [...summaries].sort((a, b) => b.score - a.score).slice(0, limit);

  const out: RedditThreadFull[] = [];
  for (let i = 0; i < top.length; i++) {
    const { thread, fromCache } = await fetchThread(dataDir, top[i].permalink, maxComments);
    if (thread) out.push(thread);
    if (i < top.length - 1 && !fromCache) await sleep(1000);
  }

  return {
    threads: out,
    searchStatus: status,
    thinSignal: out.length === 0 || out.every((t) => t.score < 3 && t.comments.length < 2),
  };
}
