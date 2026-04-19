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
/* eslint-enable @typescript-eslint/no-require-imports */

export const items = _items;
export const classes = _classes;
export const sets = _sets;
export const abilities = _abilities;
export const dataLoaded = _loaded;

// ─── Lookup helpers ──────────────────────────────────────────────────────────

const itemMap = new Map(_items.map((i) => [i.name, i]));
const classMap = new Map(_classes.map((c) => [c.name, c]));
const setMap = new Map(_sets.map((s) => [s.name, s]));
const abilityMap = new Map(_abilities.map((a) => [a.name, a]));

export function getItem(name: string): GameItem | undefined {
  return itemMap.get(name);
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

// ─── Slot types (for filtering) ──────────────────────────────────────────────

export function getAllSlots(): string[] {
  const slotSet = new Set<string>();
  for (const item of _items) {
    if (item.slot) slotSet.add(item.slot);
  }
  return [...slotSet].sort();
}
