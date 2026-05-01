/**
 * Game data types and loader for combined JSON data.
 * Requires `npm run combine` to generate data/combined/*.json first.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GameItem {
  name: string;
  internalName: string;
  description: string;
  slot: string;
  rarity: string;
  sets: string[];
  statusEffects: string[];
  itemPools: string[];
  categories: string[];
  tier: string;
  tierReason: string;
  relatedItems: string[];
  hasSprite: boolean;
}

export interface ClassArchetype {
  name: string;
  description: string;
}

export interface ClassUnlock {
  name: string;
  requirement: string;
}

export interface GameClass {
  name: string;
  id: string;
  description: string;
  buffs: Record<string, number>;
  debuffs: Record<string, number>;
  levelStats: string[];
  basicAction: string;
  archetypes: ClassArchetype[];
  unlocks: ClassUnlock[];
  abilities: string[];
  abilityCount: number;
  recommendedSets: string[];
}

export interface GameSet {
  name: string;
  description: string;
  items: string[];
  itemDetails: Array<{
    name: string;
    slot: string;
    rarity: string;
    tier: string;
  }>;
  avgTier: string;
  statusEffects: string[];
  recommendedClasses: string[];
  recommendations: Array<{
    className: string;
    reason: string;
  }>;
}

export interface GameAbility {
  name: string;
  id: string;
  description: string;
  class: string;
  type: string;
  mana: string;
  power: string;
  powerType: string;
  elements: string[];
  tier: string;
  tierReason: string;
  upgradeDescription: string;
  hasSprite: boolean;
}

// ─── Boss types ─────────────────────────────────────────────────────────────

export interface BossAttack {
  name: string;
  description: string;
}

export interface BossStats {
  health: string;
  damage: string;
  movement: string;
  luck: string;
}

export interface GameBoss {
  name: string;
  kind: "boss";
  internalId: string;
  foundIn: string;
  size: string;
  attackStyle: string;
  stats: BossStats;
  mainTheme: string;
  attacks: BossAttack[];
  wikiBehavior: string;
  wikiStrategies: string;
  wikiNotes: string;
  wikiQuotes: string[];
  wikiTrivia: string;
  spritePath: string;
  categories: string[];
  wikiUrl: string;
}

export interface SourcedBullet {
  text: string;
  sources: string[];
}

export interface BossHydration {
  name: string;
  confidence: "high" | "medium" | "low";
  signalNotes: string;
  commonStrategies: SourcedBullet[];
  counters: SourcedBullet[];
  keyStatuses: SourcedBullet[];
  notableInteractions: SourcedBullet[];
  communityTips: SourcedBullet[];
  partyComps: SourcedBullet[];
  threadCount: { reddit: number; steam: number };
}

// ─── Event types ────────────────────────────────────────────────────────────

export interface EventOutcome {
  label: string;
  description: string;
  effect: string;
  check?: { stat: string; dc: string; kind: string };
  rewards: string[];
  penalties: string[];
}

export interface EventChoice {
  text: string;
  description: string;
  outcomes: EventOutcome[];
}

export interface GameEvent {
  name: string;
  kind: "event";
  chapter: string;
  act: string;
  flavor: string;
  wikiDescription: string;
  choices: EventChoice[];
  possibleRewards: string[];
  wikiNotes: string;
  wikiTrivia: string;
  spritePath: string;
  categories: string[];
  wikiUrl: string;
}

// ─── Disorder types ─────────────────────────────────────────────────────────

export interface GameDisorder {
  name: string;
  kind: "disorder";
  id: string;
  description: string;
  pools: string[];
  statusEffects: string[];
  events: string[];
  contagious: boolean;
  wikiEffects: string;
  wikiInteractions: string;
  wikiObtaining: string;
  wikiStrategy: string;
  wikiTrivia: string;
  wikiNotes: string;
  spritePath: string;
  categories: string[];
  wikiUrl: string;
}

// ─── Stat descriptions ───────────────────────────────────────────────────────

export const STAT_INFO: Record<string, { name: string; description: string }> = {
  STR: { name: "Strength", description: "Increases physical damage dealt by melee attacks" },
  CON: { name: "Constitution", description: "Increases maximum HP and survivability" },
  DEX: { name: "Dexterity", description: "Increases accuracy and dodge chance" },
  INT: { name: "Intelligence", description: "Increases magic damage and mana pool" },
  SPD: { name: "Speed", description: "Increases movement range and turn priority" },
  CHA: { name: "Charisma", description: "Affects social abilities and charm effects" },
  LCK: { name: "Luck", description: "Increases critical hit chance and loot quality" },
  HP: { name: "HP", description: "Hit points — determines how much damage a unit can take" },
  MANA: { name: "Mana", description: "Resource used to cast abilities" },
};

// ─── Data loader ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
let _items: GameItem[] = [];
let _classes: GameClass[] = [];
let _sets: GameSet[] = [];
let _abilities: GameAbility[] = [];
let _bosses: GameBoss[] = [];
let _bossHydrations: BossHydration[] = [];
let _events: GameEvent[] = [];
let _disorders: GameDisorder[] = [];
let _loaded = false;

try {
  _items = require("../data/combined/items.json") as GameItem[];
  _classes = require("../data/combined/classes.json") as GameClass[];
  _sets = require("../data/combined/sets.json") as GameSet[];
  _abilities = require("../data/combined/abilities.json") as GameAbility[];
  _loaded = true;
} catch {
  console.warn("Game data not found. Run: npm run crawl && npm run combine");
}

try {
  _bosses = require("../data/combined/bosses.json") as GameBoss[];
} catch { /* bosses optional */ }

try {
  _bossHydrations = require("../data/combined/bosses-hydrated.json") as BossHydration[];
} catch { /* hydrated bosses optional */ }

try {
  _events = require("../data/combined/events.json") as GameEvent[];
} catch { /* events optional */ }

try {
  _disorders = require("../data/combined/disorders.json") as GameDisorder[];
} catch { /* disorders optional */ }
/* eslint-enable @typescript-eslint/no-require-imports */

export const items = _items;
export const classes = _classes;
export const sets = _sets;
export const abilities = _abilities;
export const bosses = _bosses;
export const bossHydrations = _bossHydrations;
export const events = _events;
export const disorders = _disorders;
export const dataLoaded = _loaded;

// ─── Lookup helpers ──────────────────────────────────────────────────────────

const itemMap = new Map(_items.map((i) => [i.name, i]));
// Normalized lookup: lowercase, stripped of special chars for fuzzy matching
const itemMapNormalized = new Map(
  _items.map((i) => [i.name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim(), i])
);
const classMap = new Map(_classes.map((c) => [c.name, c]));
const setMap = new Map(_sets.map((s) => [s.name, s]));
const abilityMap = new Map(_abilities.map((a) => [a.name, a]));
const bossMap = new Map(_bosses.map((b) => [b.name, b]));
const bossHydrationMap = new Map(_bossHydrations.map((h) => [h.name, h]));
const eventMap = new Map(_events.map((e) => [e.name, e]));
const disorderMap = new Map(_disorders.map((d) => [d.name, d]));

// Secondary lookup: strip wiki disambiguators like "(Item)" from item names
const itemMapDisambiguated = new Map<string, GameItem>();
for (const item of _items) {
  const stripped = item.name.replace(/\s*\([^)]+\)\s*$/, "");
  if (stripped !== item.name && !itemMap.has(stripped)) {
    itemMapDisambiguated.set(stripped, item);
  }
}

export function getItem(name: string): GameItem | undefined {
  const exact = itemMap.get(name);
  if (exact) return exact;
  // Try without disambiguator: "Rat Bomb" → "Rat Bomb (Item)"
  const disamb = itemMapDisambiguated.get(name);
  if (disamb) return disamb;
  // Fuzzy fallback: strip special chars and compare
  const normalized = name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  return itemMapNormalized.get(normalized);
}

export function getClass(name: string): GameClass | undefined {
  return classMap.get(name);
}

export function getSet(name: string): GameSet | undefined {
  return setMap.get(name);
}

export function getAbility(name: string): GameAbility | undefined {
  return abilityMap.get(name);
}

export function getBoss(name: string): GameBoss | undefined {
  return bossMap.get(name);
}

export function getBossHydration(name: string): BossHydration | undefined {
  return bossHydrationMap.get(name);
}

export function getEvent(name: string): GameEvent | undefined {
  return eventMap.get(name);
}

export function getDisorder(name: string): GameDisorder | undefined {
  return disorderMap.get(name);
}

// ─── Boss drop reverse lookup ────────────────────────────────────────────────

/** Map item name → boss names that drop it. Built once from wikiNotes. */
const bossDropMap = new Map<string, string[]>();
for (const boss of _bosses) {
  const notes = boss.wikiNotes ?? "";
  const itemRefs = [...notes.matchAll(/\[\[item:([^\]]+)\]\]/g)];
  for (const m of itemRefs) {
    const wikiName = m[1].trim();
    if (!wikiName) continue;

    // Index under both the wiki name and the resolved canonical name
    const resolved = getItem(wikiName);
    const names = new Set([wikiName]);
    if (resolved) names.add(resolved.name);

    for (const itemName of names) {
      const existing = bossDropMap.get(itemName) ?? [];
      if (!existing.includes(boss.name)) {
        existing.push(boss.name);
        bossDropMap.set(itemName, existing);
      }
    }
  }
}

/** Get boss names that drop this item (empty array if none). */
export function getBossesForItem(itemName: string): string[] {
  return bossDropMap.get(itemName) ?? [];
}

// ─── Status effects ─────────────────────────────────────────────────────────

export interface StatusEffect {
  name: string;
  description: string;
  itemCount: number;
  setCount: number;
}

interface RawStatusEffect {
  name: string;
  description: string;
}

/* eslint-disable @typescript-eslint/no-require-imports */
let _rawStatusEffects: RawStatusEffect[] = [];
try {
  _rawStatusEffects = require("../data/combined/status-effects.json") as RawStatusEffect[];
} catch { /* optional */ }
/* eslint-enable @typescript-eslint/no-require-imports */

const _statusEffectDescMap = new Map(_rawStatusEffects.map((e) => [e.name, e.description]));

const _statusEffectMap = new Map<string, { items: Set<string>; sets: Set<string> }>();

for (const item of _items) {
  for (const effect of item.statusEffects) {
    if (!_statusEffectMap.has(effect)) _statusEffectMap.set(effect, { items: new Set(), sets: new Set() });
    _statusEffectMap.get(effect)!.items.add(item.name);
  }
}
for (const set of _sets) {
  for (const effect of set.statusEffects) {
    if (!_statusEffectMap.has(effect)) _statusEffectMap.set(effect, { items: new Set(), sets: new Set() });
    _statusEffectMap.get(effect)!.sets.add(set.name);
  }
}

export const statusEffects: StatusEffect[] = Array.from(_statusEffectMap.entries())
  .map(([name, { items, sets }]) => ({
    name,
    description: _statusEffectDescMap.get(name) ?? "",
    itemCount: items.size,
    setCount: sets.size,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const statusEffectByName = new Map(statusEffects.map((e) => [e.name, e]));

export function getStatusEffect(name: string): StatusEffect | undefined {
  return statusEffectByName.get(name);
}

export function getItemsByStatusEffect(name: string): GameItem[] {
  const entry = _statusEffectMap.get(name);
  if (!entry) return [];
  return _items.filter((i) => entry.items.has(i.name));
}

export function getSetsByStatusEffect(name: string): GameSet[] {
  const entry = _statusEffectMap.get(name);
  if (!entry) return [];
  return _sets.filter((s) => entry.sets.has(s.name));
}

// ─── Slot types (for filtering) ──────────────────────────────────────────────

export function getAllSlots(): string[] {
  const slotSet = new Set<string>();
  for (const item of _items) {
    if (item.slot) slotSet.add(item.slot);
  }
  return [...slotSet].sort();
}
