# Tier Generation Process

How we generate S/A/B/C/D tiers for items, sets, and abilities.
Re-run this after game patches or meta shifts.

## Approach

1. **Anchor tiers from community guides** (~150 entries with explicit rankings)
2. **LLM fills the gaps** — Claude receives anchors + crawled stats, tiers remaining entries consistently
3. **Target distribution** — bell curve centered on B:
   - S: ~10% (best-in-slot, build-defining)
   - A: ~20% (strong, reliable picks)
   - B: ~40% (solid, situationally good)
   - C: ~20% (niche or outclassed)
   - D: ~10% (weak, rarely worth taking)

## Reference Sources (last updated April 2026)

### Items & Sets
- **SlashSkill** — Best Items & Set Bonuses Ranked
  https://www.slashskill.com/mewgenics-best-items-every-set-bonus-ranked-and-the-strongest-standalone-gear/
- **G2A** — Best Items, Weapons, and Set Bonuses
  https://www.g2a.com/news/features/guide/the-best-items-weapons-and-set-bonuses-in-mewgenics-plus-how-sets-work/
- **Mewgenics.co** — Best Items & Set Bonuses Guide
  https://mewgenics.co/guides/best-items-set-bonuses

### Abilities
- **Power Up Gaming** — Best Abilities Ranked (April 2026)
  https://powerupgaming.co.uk/2026/02/12/mewgenics-tier-list-best-abilities-ranked/
- **SlashSkill** — Best Ability Synergies
  https://www.slashskill.com/mewgenics-best-ability-synergies-broken-combos-that-win-runs/

## Known Anchor Tiers

### Sets
| Tier | Sets |
|------|------|
| S | Obelisk, Stunning, Bionic |
| A | Demonic, Nurse, Feathered |
| B | Lead, Bone, Human Flesh, Cleric, Hybrid, Cactus, Gimp |

### Standalone Items
| Tier | Items |
|------|-------|
| S | Training Band, Armory Key, Multiplier, Revolver, Sniper Rifle |
| A | Bloody Knife, Black Belt, Champion's Mask, Propeller Cap, Hockey Mask, Natural 20, Soul Claw |
| B | Fork, Fancy Bow |

### Abilities
| Tier | Abilities |
|------|-----------|
| S | Revive, Second Wind, Copy Cat, Meteor Storm, Snipe, Spin, Become Entropy, Soul Link, Hyper Beam, Skill Share, Bare Minimum |
| A | Marked, Fury Swipes, Exert, Bodyguard, Shadow, Merciless, Zoomzerk, Pet Rocks, Hose Off, Stone Orbit, Critical, Backstabber, Spread Sorrow, Enlightened, Learn from Me, Waste Time, Duke of Flies, Incubator |
| B | Cryo Heal, Arrow Flurry, Goad, Berserk, Confront |
| C | Hire Hitman, Gravity Slam, Leap, Bull Rush, Vet Visit |
| D | Juiced, Heavy Shot, CPR, Fire Punch, Barf Ball, Stun |

## How to Re-generate

1. Check the reference URLs above for updated rankings post-patch
2. Update the anchor tiers in this doc if they changed
3. Re-run the crawler if new items/abilities were added: `npm run crawl`
4. Run tier generation: `npm run generate-tiers`
5. Output: `data/tiers.json`

## Output Format

```json
{
  "version": "2026-04-19",
  "items": {
    "Training Band": { "tier": "S", "reason": "Single strongest trinket for damage builds, +20% crit" },
    "Fork": { "tier": "B", "reason": "+5 HP heal on kills, decent sustain" }
  },
  "abilities": {
    "Revive": { "tier": "S", "reason": "Essential revival, prevents run-ending defeats" }
  }
}
```
