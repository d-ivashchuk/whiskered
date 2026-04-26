/**
 * Generic utilities shared across crawler/hydration scripts.
 */

import * as fs from "node:fs";

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** Filename-safe variant of an entity name (replaces non-alphanumerics with `_`). */
export function toSafeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function ensureDirs(...dirs: string[]): void {
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}
