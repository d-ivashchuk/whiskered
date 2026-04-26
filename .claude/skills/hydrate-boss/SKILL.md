---
name: hydrate-boss
description: "Generate a community guide for a boss. Builds the source bundle (wiki + Reddit + Steam), reads it, and writes the hydrated JSON. Usage: /hydrate-boss Boris or /hydrate-boss all"
---

# Boss Hydration Skill

Generate a community guide for one or all bosses by reading source bundles and writing structured tactics JSON.

## Steps

### 1. Determine targets

- If the argument is `all`, hydrate every boss in `data/bosses/` that does NOT already have a file in `data/bosses-hydrated/`.
- If the argument is a boss name (e.g. `Boris`), hydrate just that boss (overwriting if it already exists).
- If no argument, list all un-hydrated bosses and ask which to hydrate.

### 2. Build the source bundle

Run for each target:
```bash
npx tsx scripts/hydrate-bosses.ts "<BossName>" --refresh
```

This creates `data/bundles/<BossName>.md` containing wiki data + Reddit threads + Steam threads.

### 3. Read the bundle

Read the generated bundle file at `data/bundles/<BossName>.md`. This is your ONLY source material. Every claim you write must cite a URL from this bundle's "Source URL inventory" section.

### 4. Read the reference files

Read these before writing:
- `scripts/HYDRATION_CHECKLIST.md` — tone, structure, and quality rules
- `data/bosses-hydrated/Boris.json` — reference example for format and tone

### 5. Write the hydrated JSON

Write `data/bosses-hydrated/<BossName>.json` following the `HydratedBossSchema` from `scripts/lib/schemas.ts`.

**Schema fields:**
```json
{
  "name": "Boss Name",
  "hydratedAt": "2026-04-26T00:00:00.000Z",
  "model": "claude-opus-4-6",
  "synthesizer": "agent",
  "confidence": "high|medium|low",
  "signalNotes": "One-line rationale for confidence level",
  "commonStrategies": [{ "text": "...", "sources": ["url1", "url2"] }],
  "counters": [{ "text": "...", "sources": ["url1"] }],
  "keyStatuses": [{ "text": "...", "sources": ["url1"] }],
  "notableInteractions": [{ "text": "...", "sources": ["url1"] }],
  "partyComps": [{ "text": "...", "sources": ["url1"] }],
  "communityTips": [{ "text": "...", "sources": ["url1"] }],
  "threadCount": { "reddit": 6, "steam": 0 }
}
```

**Confidence levels:**
- `high` — 5+ community threads with substantive tactics
- `medium` — 1-4 threads OR a rich wiki Strategies section
- `low` — minimal community discussion AND minimal wiki tactics

**Writing rules (from HYDRATION_CHECKLIST.md):**
- Use `[[type:Name]]` cross-references for ALL class, item, ability, status, stat mentions
- Write like a player explaining to a friend, NOT like AI or a wiki
- Use "you/your" naturally
- Avoid em-dashes, use commas/periods instead
- Be direct and opinionated ("Avoid Fighters" not "Fighters may struggle")
- No hedging phrases ("it's worth noting", "consider")
- Vary sentence structure
- Each bullet is self-contained
- Every claim must cite a source URL from the bundle
- **NO lore, trivia, or pop culture references.** Every bullet must be actionable gameplay advice. "He's a Mouser reference" is trivia, not a tip.
- **NO repetition across sections.** Before writing each section, re-read what you already wrote. If commonStrategies covers a mechanic, counters must add a NEW angle, not restate it. Each bullet must teach something the others don't.

**Section guidelines:**
- **commonStrategies** — General approaches. 2-4 bullets.
- **counters** — Specific class/item/ability/status counters. 3-5 bullets.
- **keyStatuses** — Status effect interactions. 1-3 bullets.
- **notableInteractions** — Unusual mechanics, map quirks. 2-3 bullets.
- **partyComps** — Recommended team compositions. 2-3 bullets.
- **communityTips** — Player wisdom, difficulty notes, champion info. 2-3 bullets.

If the bundle has very little community signal (0 Reddit threads, thin wiki), write fewer bullets per section. Don't invent tactics.

### 6. Validate

```bash
npx tsx scripts/validate-hydrated-bosses.ts
```

Fix any schema or source audit failures.

### 7. Recombine

```bash
npx tsx scripts/combine-data.ts
```

### 8. Report

Print a summary: boss name, confidence level, bullet count, any issues.

## When hydrating multiple bosses

Process them sequentially. For each boss: bundle → read → write → validate → next. Run combine once at the end.
