/**
 * Sprite downloader — fetches images from the wiki, resizes to 224×224 PNG
 * (the size the on-device classifier expects), writes to disk.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import sharp from "sharp";

import { USER_AGENT, fetchSpriteUrlsBatch } from "./mediawiki.js";
import { sleep, toSafeName } from "./util.js";

/** Download a single sprite image. Serial with retry on 429. */
export async function downloadSprite(
  url: string,
  name: string,
  targetDir: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") ?? "5", 10);
        const wait = Math.max(retryAfter, 5) * 1000;
        console.warn(`  [429] Image rate limited, waiting ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) return false;
      const buffer = Buffer.from(await res.arrayBuffer());

      const png = await sharp(buffer)
        .resize(224, 224, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .png()
        .toBuffer();

      fs.writeFileSync(path.join(targetDir, `${toSafeName(name)}.png`), png);
      return true;
    } catch (err) {
      if (attempt === 2) {
        console.warn(`  [ERR] ${name}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  return false;
}

/** Download a batch of sprites with progress logging. */
export async function downloadSpritesBatch(
  names: string[],
  spriteUrls: Map<string, string>,
  targetDir: string,
): Promise<{ downloaded: number; ok: number }> {
  let dlCount = 0;
  let dlOk = 0;
  for (const name of names) {
    const url = spriteUrls.get(name);
    if (url) {
      const ok = await downloadSprite(url, name, targetDir);
      if (ok) dlOk++;
      dlCount++;
      if (dlCount % 50 === 0) {
        console.log(`  ...${dlCount}/${spriteUrls.size} downloaded (${dlOk} ok)`);
      }
      await sleep(200);
    }
  }
  console.log(`  ...${dlCount}/${spriteUrls.size} downloaded (${dlOk} ok)`);
  return { downloaded: dlCount, ok: dlOk };
}

/**
 * End-to-end: skip already-downloaded sprites, look up URLs for the rest,
 * download them. Returns saved count and the list of names still missing.
 */
export async function fetchAndDownloadSprites(
  names: string[],
  prefix: string,
  extensions: string[],
  targetDir: string,
  label: string,
): Promise<{ saved: number; missing: string[] }> {
  fs.mkdirSync(targetDir, { recursive: true });

  let existing = 0;
  const need: string[] = [];
  for (const name of names) {
    if (fs.existsSync(path.join(targetDir, `${toSafeName(name)}.png`))) {
      existing++;
    } else {
      need.push(name);
    }
  }

  if (existing > 0) console.log(`[${label}] ${existing} sprites already cached`);

  if (need.length === 0) {
    console.log(`[${label}] All sprites already downloaded.`);
  } else {
    console.log(`[${label}] Looking up sprite URLs for ${need.length} entries...`);
    const spriteUrls = await fetchSpriteUrlsBatch(need, prefix, extensions);
    console.log(`[${label}] Found ${spriteUrls.size} sprite URLs. Downloading...`);
    await downloadSpritesBatch(need, spriteUrls, targetDir);
  }

  const saved = names.filter((n) =>
    fs.existsSync(path.join(targetDir, `${toSafeName(n)}.png`)),
  ).length;
  const missing = names.filter(
    (n) => !fs.existsSync(path.join(targetDir, `${toSafeName(n)}.png`)),
  );
  return { saved, missing };
}
