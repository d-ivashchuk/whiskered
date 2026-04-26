/**
 * Anthropic API client.
 *
 * Pulled out of generate-tiers.ts so multiple scripts can call Claude with
 * consistent retry/backoff and token-usage accounting.
 *
 * Reads ANTHROPIC_API_KEY from the environment. Throws on missing key when
 * the first call is made (not at import time, so scripts that don't need
 * Claude can still import this module).
 */

import { sleep } from "./util.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ClaudeCallOptions {
  model?: string;
  maxTokens?: number;
  system?: string;
  retries?: number;
  /** Force a JSON-only response by appending a system instruction. */
  forceJson?: boolean;
}

export interface ClaudeResponse {
  text: string;
  usage: ClaudeUsage;
  model: string;
}

function requireKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Export it in your shell before running this script.",
    );
  }
  return key;
}

export async function callClaude(
  prompt: string,
  opts: ClaudeCallOptions = {},
): Promise<ClaudeResponse> {
  const apiKey = requireKey();
  const model = opts.model ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 4096;
  const retries = opts.retries ?? 3;

  const messages = [{ role: "user", content: prompt }];
  const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages };
  if (opts.system) body.system = opts.system;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429 || res.status === 529 || res.status === 503) {
        const wait = Math.pow(2, attempt + 1) * 1000;
        console.warn(`  [${res.status}] Claude rate/overload — waiting ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Claude API HTTP ${res.status}: ${text.slice(0, 500)}`);
      }

      const data = (await res.json()) as {
        content: Array<{ type: string; text: string }>;
        usage?: { input_tokens: number; output_tokens: number };
        model: string;
      };
      const text = data.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");
      return {
        text,
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        },
        model: data.model,
      };
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2000);
    }
  }
  throw new Error("Claude call failed after retries");
}

/** Strip markdown fences from a Claude response that should be raw JSON. */
export function stripJsonFences(text: string): string {
  let out = text.trim();
  if (out.startsWith("```")) {
    out = out.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return out.trim();
}
