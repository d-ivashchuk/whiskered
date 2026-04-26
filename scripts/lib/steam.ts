/**
 * Steam Community discussions scraper.
 *
 * Steam doesn't offer a JSON discussion API, so we parse the public HTML —
 * conservative regex-based extraction (no cheerio dep). We grab the search
 * results page, then the per-thread page; the OP body and reply bodies live
 * inside `.forum_op .content` and `.commentthread_comment_text` respectively.
 *
 * Caches everything under `data/cache/steam/`.
 */

import * as path from "node:path";

import { cachedFetchText } from "./fs-cache.js";
import { sleep } from "./util.js";

const STEAM_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const APP_ID = "686060"; // Mewgenics

export interface SteamThreadSummary {
  url: string;
  title: string;
  replyCount: number;
}

export interface SteamReply {
  body: string;
}

export interface SteamThreadFull extends SteamThreadSummary {
  opBody: string;
  replies: SteamReply[];
}

const CACHE_DIR = (root: string) => path.join(root, "cache", "steam");

/** Strip HTML tags + decode common entities — enough for plain-text extraction. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Search Steam discussions for `query`. */
export async function searchSteamDiscussions(
  dataDir: string,
  query: string,
  limit = 5,
): Promise<{ threads: SteamThreadSummary[]; status: number; fromCache: boolean }> {
  const url = `https://steamcommunity.com/app/${APP_ID}/discussions/search/?q=${encodeURIComponent(query)}`;
  const cacheKey = `search_${query.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 60)}`;

  const { body, fromCache, status } = await cachedFetchText(url, {
    cacheDir: CACHE_DIR(dataDir),
    headers: { "User-Agent": STEAM_USER_AGENT },
    key: cacheKey,
    ext: ".html",
  });

  if (status !== 200 || !body) return { threads: [], status, fromCache };

  // Each result row has structure:
  //   <a class="forum_topic_overlay" href="..."></a>
  //   <div class="forum_topic_name">…title…</div>
  //   <div class="forum_topic_reply_count">N</div>
  // We extract each anchor + its title + reply count.
  const threads: SteamThreadSummary[] = [];
  const blockRe =
    /<a class="forum_topic_overlay" href="([^"]+)"[^>]*><\/a>[\s\S]*?<div class="forum_topic_name[^"]*">([\s\S]*?)<\/div>[\s\S]*?<div class="forum_topic_reply_count[^"]*">([\s\S]*?)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(body)) !== null) {
    const url = m[1];
    const title = stripHtml(m[2]);
    const replyText = stripHtml(m[3]);
    const replyCount = parseInt(replyText.replace(/[^0-9]/g, ""), 10) || 0;
    if (url && title && /\/discussions\//.test(url)) {
      threads.push({ url, title, replyCount });
    }
    if (threads.length >= limit) break;
  }

  return { threads, status, fromCache };
}

/** Fetch a single thread page and pull OP body + replies. */
export async function fetchSteamThread(
  dataDir: string,
  url: string,
  maxReplies = 25,
): Promise<{ thread: SteamThreadFull | null; status: number; fromCache: boolean }> {
  const idMatch = url.match(/\/discussions\/([0-9]+)\/([0-9]+)/);
  const cacheKey = idMatch
    ? `thread_${idMatch[1]}_${idMatch[2]}`
    : `thread_${url.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 24)}`;

  const { body, fromCache, status } = await cachedFetchText(url, {
    cacheDir: CACHE_DIR(dataDir),
    headers: { "User-Agent": STEAM_USER_AGENT },
    key: cacheKey,
    ext: ".html",
  });

  if (status !== 200 || !body) return { thread: null, status, fromCache };

  // Title — Steam wraps it in <div class="forum_op_title">…</div>
  const titleMatch = body.match(/<div class="forum_op_title">([\s\S]*?)<\/div>/);
  const title = titleMatch ? stripHtml(titleMatch[1]) : "(untitled)";

  // OP body — first .forum_op .content block
  const opMatch = body.match(/<div class="forum_op[^"]*">[\s\S]*?<div class="content[^"]*">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
  const opBody = opMatch ? stripHtml(opMatch[1]) : "";

  // Replies — every `.commentthread_comment_text` div
  const replies: SteamReply[] = [];
  const replyRe = /<div class="commentthread_comment_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let r: RegExpExecArray | null;
  while ((r = replyRe.exec(body)) !== null) {
    const text = stripHtml(r[1]);
    if (text) replies.push({ body: text });
    if (replies.length >= maxReplies) break;
  }

  return {
    thread: {
      url,
      title,
      replyCount: replies.length,
      opBody,
      replies,
    },
    status,
    fromCache,
  };
}

export async function gatherSteamThreadsForQuery(
  dataDir: string,
  query: string,
  limit = 4,
  maxReplies = 20,
): Promise<{ threads: SteamThreadFull[]; searchStatus: number; thinSignal: boolean }> {
  const { threads: summaries, status } = await searchSteamDiscussions(dataDir, query, limit * 2);
  if (status !== 200) return { threads: [], searchStatus: status, thinSignal: true };

  // Heuristic relevance filter: title must contain at least one query token (>=3 chars).
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  const filtered = summaries.filter((t) => {
    const lt = t.title.toLowerCase();
    return tokens.some((tok) => lt.includes(tok));
  });
  // Prefer threads with replies
  const sorted = [...filtered].sort((a, b) => b.replyCount - a.replyCount).slice(0, limit);

  const out: SteamThreadFull[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const { thread, fromCache } = await fetchSteamThread(dataDir, sorted[i].url, maxReplies);
    if (thread) out.push(thread);
    if (i < sorted.length - 1 && !fromCache) await sleep(800);
  }

  return {
    threads: out,
    searchStatus: status,
    thinSignal: out.length === 0,
  };
}
