/**
 * Zod schemas for the data layer.
 *
 * Schemas live here (vs. inline) so:
 *  1. Crawl scripts can validate raw output before writing.
 *  2. Hydration scripts can validate Claude's JSON before persisting.
 *  3. The app can reuse the inferred TypeScript types.
 *
 * Today this covers bosses + their hydrated tactical writeups. Items/abilities
 * still use the original inline interfaces in crawl-wiki.ts (introduced
 * incrementally to avoid touching the entire data layer in one pass).
 */

import { z } from "zod";

// ── Boss (raw wiki output) ────────────────────────────────────────────────

export const BossAttackSchema = z.object({
  name: z.string(),
  description: z.string(),
});
export type BossAttack = z.infer<typeof BossAttackSchema>;

export const BossStatsSchema = z.object({
  health: z.string().default(""),
  damage: z.string().default(""),
  movement: z.string().default(""),
  luck: z.string().default(""),
});
export type BossStats = z.infer<typeof BossStatsSchema>;

export const BossSchema = z.object({
  /** Always equal to the wiki title. */
  name: z.string(),
  kind: z.literal("boss"),
  /** From the infobox `Id`/`ID` field; internal game identifier. */
  internalId: z.string().default(""),
  /** From `FoundIn` — chapter/floor where the boss appears. */
  foundIn: z.string().default(""),
  /** Grid size, e.g. `"2x2"`. */
  size: z.string().default(""),
  /** Free-text attack style label, e.g. `"Melee attack"`. */
  attackStyle: z.string().default(""),
  /**
   * Stats are stored as strings because the wiki sometimes embeds difficulty
   * scaling (e.g. `Normal/Hard/Crazy/Impossible: 200/300/400/600`). We keep
   * the raw text so the app can render the full breakdown.
   */
  stats: BossStatsSchema,
  /** Music track on bosses; absent on enemies. */
  mainTheme: z.string().default(""),
  /** Named special attacks parsed from the Behavior/Attacks subsection. */
  attacks: z.array(BossAttackSchema).default([]),
  /** Raw `==Behavior==` body — preserves links via `[[type:Name]]` markers. */
  wikiBehavior: z.string().default(""),
  /** Raw `==Strategies==` body. */
  wikiStrategies: z.string().default(""),
  /** Raw `==Notes==` body. */
  wikiNotes: z.string().default(""),
  /** Quoted lines from the boss (one entry per quote). */
  wikiQuotes: z.array(z.string()).default([]),
  /** Raw `==Trivia==` body. */
  wikiTrivia: z.string().default(""),
  /** Path on disk relative to repo root, e.g. `data/sprites/bosses/Boris.png`. */
  spritePath: z.string().default(""),
  categories: z.array(z.string()).default([]),
  wikiUrl: z.string(),
});
export type Boss = z.infer<typeof BossSchema>;

// ── Boss (hydrated tactics writeup) ───────────────────────────────────────

/**
 * Every claim in the hydrated output must carry at least one source URL.
 * The hydration prompt forbids unsupported claims; this schema enforces it
 * structurally.
 */
export const SourcedBulletSchema = z.object({
  text: z.string().min(1),
  sources: z.array(z.string().min(1)).min(1),
});
export type SourcedBullet = z.infer<typeof SourcedBulletSchema>;

export const HydratedBossSchema = z.object({
  name: z.string(),
  hydratedAt: z.string(), // ISO timestamp
  /**
   * Identifier of the model that performed the synthesis.
   * Free-form to accommodate either a public API model id (e.g.
   * `claude-sonnet-4-5-20250929`) or an in-session agent label.
   */
  model: z.string(),
  /** "agent" — synthesized in the chat session by Claude reading bundles directly.
   *  "api"   — synthesized via a programmatic Anthropic API call. */
  synthesizer: z.enum(["agent", "api"]).default("agent"),
  /**
   * `high`   — ≥ 5 community threads with substantive tactics
   * `medium` — 1–4 threads OR a rich wiki Strategies section
   * `low`    — minimal community discussion AND minimal wiki tactics
   */
  confidence: z.enum(["high", "medium", "low"]),
  /** One-line rationale for the chosen confidence level. */
  signalNotes: z.string(),
  commonStrategies: z.array(SourcedBulletSchema),
  counters: z.array(SourcedBulletSchema),
  keyStatuses: z.array(SourcedBulletSchema),
  notableInteractions: z.array(SourcedBulletSchema),
  communityTips: z.array(SourcedBulletSchema),
  partyComps: z.array(SourcedBulletSchema),
  /** How much community data fed the hydration. */
  threadCount: z.object({
    reddit: z.number().int().nonnegative(),
    steam: z.number().int().nonnegative(),
  }),
  /** Token spend, only set when `synthesizer === "api"`. */
  tokenUsage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
    })
    .optional(),
});
export type HydratedBoss = z.infer<typeof HydratedBossSchema>;
