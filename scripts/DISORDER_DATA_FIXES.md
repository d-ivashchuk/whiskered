# Disorder Data Quality Fixes

Audit and cleanup performed on wiki-crawled disorder data (126 disorders).
These fixes are applied in `scripts/lib/wikitext.ts` (template parsing) and
`scripts/crawl-disorders.ts` (post-processing in `cleanSection()`).

## Template Fixes (wikitext.ts)

| Template | Example | Was | Now |
|----------|---------|-----|-----|
| `{{HouseStat\|..}}` | `{{HouseStat\|nolabel=y\|Comfort\|+1}}` | `HouseStat` (catch-all) | `+1 Comfort` |
| `{{mut\|ID}}` | `{{mut\|Mouth.-2}}` | `mut` (catch-all) | `a mutation` |
| `{{Citation needed}}` | — | `Citation needed` | stripped |
| `{{Navbox/Disorder}}` | — | `Navbox/Disorder` (catch-all) | stripped |
| `{{Stat\|X\|nolabel=y}}` | `{{Stat\|STR\|nolabel=y}}` | `nolabel=y STR` | `STR` |

### Why `{{mut}}` renders as "a mutation"

The wiki uses `{{mut|Mouth.-2}}` and `{{mut|eyes.352}}` to reference mutations
by internal slot+ID. These IDs don't map to human-readable names in any data
we can access. The wiki itself renders these via Lua/templates we can't run.
5 disorders are affected (Addict, Diabetes, Eternal Youth, Scleroderma, Singleton).

## Post-Processing Fixes (crawl-disorders.ts cleanSection)

| Issue | Count | Fix |
|-------|-------|-----|
| `Navbox/Disorder` in wikiTrivia | 119 | Strip `Navbox*` lines |
| `Category:...` in wikiTrivia | 8 | Strip `Category:*` lines |
| Empty bullet interactions (`*` / `*\n*`) | 30 | Detect and return empty string |
| Internal pool names (`all_disorders pool`) | 66+ | Replace with human-readable (`General Disorders pool`) |
| Wiki table markup (`{\| ... \|}`) | 1 (Distemper) | Strip tables (bullet summary sufficient) |
| Image sizing artifact (`20px\|class=mew-icon`) | 1 (Rabies) | Strip via regex |
| Level-2 heading bleed (empty section captures next) | 13 | Fixed in `extractSection()` |

### Pool Name Mapping

| Internal | Display |
|----------|---------|
| `all_disorders pool` | General Disorders pool |
| `mental_disorders pool` | Mental Disorders pool |
| `physical_disorders pool` | Physical Disorders pool |
| `stomach_disorders pool` | Stomach Disorders pool |
| `diseases pool` | Diseases pool |
| `hygiene_disorders pool` | Hygiene Disorders pool |
| `magic_disorders pool` | Magic Disorders pool |
| `birth_defect pool` | Birth Defect pool |
| `forbidden_disorders pool` | Forbidden Disorders pool |

## Known Limitations

- **`{{mut}}` unresolvable**: Mutation internal IDs can't be mapped to names.
  If the wiki adds a Mutations page or template lookup, these could be improved.
- **Duplicate lines**: 4 disorders (Pica, Scatological, Stinky, Vegan) have
  duplicate lines in wikiObtaining. These come from the wiki source itself
  and aren't stripped (they're real content that happens to repeat).
- **Distemper table**: The battle progression table (0-9 stacking effects) is
  stripped. The bullet summary above it covers the same info less precisely.
- **2 missing sprites**: 2 of 126 disorders have no sprite on the wiki.
