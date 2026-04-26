# Boss Hydration Checklist

Reference for writing `data/bosses-hydrated/<Name>.json` guides.

## Cross-references

Use `[[type:Name]]` markers so the app renders tappable links with sprites:

- `[[class:Tank]]`, `[[class:Thief]]`, `[[class:Hunter]]`
- `[[item:Meat Hook]]`, `[[item:Blubber]]`
- `[[ability:Nature's Guidance]]`, `[[ability:Reanimate]]`
- `[[status:Trample]]`, `[[status:Thorns]]`, `[[status:Stun]]`
- `[[stat:CON]]`, `[[stat:SPD]]`

Every class, item, ability, status, and stat mention should be cross-referenced.

## Tone

- Write like a player explaining to a friend, not a wiki or AI summary.
- Use "you/your" naturally. Say "your cats" not "the player's units".
- Keep it direct. "Boris chases whoever hit him last" not "Boris exhibits a behavior pattern of pursuing the most recent damage source".
- Vary sentence structure. Don't start every bullet with a noun or gerund.
- Avoid em-dashes. Use commas, periods, or "so" / "but" / "because" instead.
- No hedging phrases like "it's worth noting", "consider", "it should be mentioned".
- OK to be opinionated: "Avoid Fighters" not "Fighters may struggle".

## Structure

Each field is an array of `{ text, sources }`. Every claim needs at least one source URL.

- **commonStrategies** - General approaches that work. 2-4 bullets.
- **counters** - Specific classes, items, abilities, or status effects that counter this boss. 3-5 bullets.
- **keyStatuses** - Important status effect interactions (what works, what doesn't). 1-3 bullets.
- **notableInteractions** - Unusual mechanics, map quirks, surprising behaviors. 2-3 bullets.
- **partyComps** - Recommended team compositions with reasoning. 2-3 bullets.
- **communityTips** - Player-discovered wisdom, difficulty notes, champion variant info. 2-3 bullets.

## Quality checks

- [ ] Every `[[class:X]]`, `[[item:X]]`, `[[ability:X]]`, `[[status:X]]`, `[[stat:X]]` reference uses the exact in-game name
- [ ] No em-dash (`—`) overuse (max 1 per guide, prefer commas/periods)
- [ ] Reads like a human wrote it, not an AI summary
- [ ] Each bullet is self-contained (doesn't depend on reading the previous one)
- [ ] Sources are real URLs from the bundle (wiki page or Reddit/Steam thread)
- [ ] No duplicate information across sections
- [ ] Validate with: `npx tsx scripts/validate-hydrated-bosses.ts`
