/**
 * Wikitext parsing helpers — extract infobox fields, sections, categories.
 *
 * Used by every entity parser (items, classes, abilities, bosses, ...).
 * Pure functions, no I/O.
 */

/** Parse `|key=value` pairs out of an infobox into a flat object. */
export function parseInfobox(wikitext: string): Record<string, string> {
  const fields: Record<string, string> = {};
  // Use [^\n]* instead of .* so a missing newline doesn't bleed the next
  // field's content into the current one. Empty values are stored too,
  // so downstream code can rely on every field being present.
  const regex = /\|\s*(\w+)\s*=([^\n]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(wikitext)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    fields[key] = value;
  }
  return fields;
}

/** Extract `[[Category:Foo]]` markers as a string array. */
export function extractCategories(wikitext: string): string[] {
  const cats: string[] = [];
  const regex = /\[\[Category:([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(wikitext)) !== null) {
    cats.push(match[1].trim());
  }
  return cats;
}

/**
 * Extract a level-2 section by heading title. Returns the body, or "" if absent.
 *
 * `extractSection(text, "Effects")` matches `==Effects==`, `== Effects ==`, etc.
 * Stops at the next `==…==` heading or end of file.
 */
export function extractSection(wikitext: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`==\\s*${escaped}s?\\s*==\\s*\\n([\\s\\S]*?)(?=\\n==[^=]|$)`, "i");
  const m = wikitext.match(re);
  return m ? m[1].trim() : "";
}

/**
 * Extract a level-3 subsection (`===Heading===`).
 * Stops at the next `===` or `==` heading.
 */
export function extractSubsection(wikitext: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`===\\s*${escaped}\\s*===\\s*\\n([\\s\\S]*?)(?=\\n===|\\n==[^=]|$)`, "i");
  const m = wikitext.match(re);
  return m ? m[1].trim() : "";
}

/** Strip wiki templates and return plain text (no deep-link markers). */
export function stripWikiTemplates(text: string): string {
  return convertWikiTemplates(text, false);
}

/**
 * Convert wiki templates and links to readable text.
 *
 * @param preserveLinks  If true, common entity references become
 *                       `[[ability:Name]]`, `[[item:Name]]`, etc. — markers
 *                       the app can render as deep links. If false, plain text.
 */
export function convertWikiTemplates(text: string, preserveLinks: boolean): string {
  const STAT_ABBREV: Record<string, string> = {
    STR: "STR", STRENGTH: "STR",
    CON: "CON", CONSTITUTION: "CON",
    DEX: "DEX", DEXTERITY: "DEX",
    INT: "INT", INTELLIGENCE: "INT",
    SPD: "SPD", SPEED: "SPD",
    CHA: "CHA", CHARISMA: "CHA",
    LCK: "LCK", LUCK: "LCK",
    HP: "HP", MANA: "MANA",
  };
  const STAT_NAMES: Record<string, string> = {
    STR: "Strength", CON: "Constitution", DEX: "Dexterity",
    INT: "Intelligence", SPD: "Speed", CHA: "Charisma", LCK: "Luck",
    HP: "HP", MANA: "Mana",
  };

  text = text.replace(/\{\{[Ss]tat\|([^|}]+)(?:\|([^}]*))?\}\}/g, (_m, stat, val) => {
    const abbrev = STAT_ABBREV[stat.trim().toUpperCase()] ?? stat.trim().toUpperCase();
    const name = STAT_NAMES[abbrev] ?? stat.trim();
    if (preserveLinks) {
      return val ? `${val} [[stat:${abbrev}]]` : `[[stat:${abbrev}]]`;
    }
    return val ? `${val} ${name}` : name;
  });

  // Take the second (display) arg when a template was written
  // `{{tpl|Canonical|displayed text}}`; otherwise keep the canonical name.
  const linkOrDisplay = (
    type: string,
    name: string,
    display: string | undefined,
  ): string => {
    const text = display?.trim() || name;
    return preserveLinks ? `[[${type}:${name}]]` : text;
  };

  // Abilities: {{a|Name}} {{p|Name}} {{a|Name|Display}}
  text = text.replace(/\{\{[ap]\|([^}|]+?)(?:\|([^}]*))?\}\}/gi, (_m, name, display) =>
    linkOrDisplay("ability", name, display),
  );
  // Items: {{i|Name}}
  text = text.replace(/\{\{i\|([^}|]+?)(?:\|([^}]*))?\}\}/gi, (_m, name, display) =>
    linkOrDisplay("item", name, display),
  );
  // Classes: {{Class|Name}} OR {{cl|Name}} OR {{cl|Name|Plural}}
  text = text.replace(/\{\{(?:Class|cl)\|([^}|]+?)(?:\|([^}]*))?\}\}/gi, (_m, name, display) =>
    linkOrDisplay("class", name, display),
  );
  // Statuses: {{Status|Name}} OR {{st|Name}} OR {{st|Name|Display}}
  text = text.replace(/\{\{(?:Status|st)\|([^}|]+?)(?:\|([^}]*))?\}\}/gi, (_m, name, display) =>
    linkOrDisplay("status", name, display),
  );
  // Monster types: {{type|Cat|cat}} → "cat" (link target meaningful: type:Cat)
  text = text.replace(/\{\{type\|([^}|]+?)(?:\|([^}]*))?\}\}/gi, (_m, name, display) =>
    linkOrDisplay("type", name, display),
  );
  // Level objects: {{obj|Spiky Rock}} {{Object|Creep Pill}}
  text = text.replace(/\{\{(?:obj|Object)\|([^}|]+?)(?:\|([^}]*))?\}\}/gi, (_m, name, display) =>
    linkOrDisplay("obj", name, display),
  );
  // Tiles: {{tile|Creep}} {{tile|Tar}} {{tile|Lava}}
  text = text.replace(/\{\{tile\|([^}|]+?)(?:\|([^}]*))?\}\}/gi, (_m, name, display) =>
    linkOrDisplay("obj", name, display),
  );
  // Chapters: {{ch|The Sewers}} {{Chapter|...}}
  text = text.replace(/\{\{(?:ch|Chapter)\|([^}|]+?)(?:\|([^}]*))?\}\}/gi, (_m, name, display) =>
    linkOrDisplay("chapter", name, display),
  );
  // Elements: {{Element|Fire}} {{element|Water}} — render as plain text
  text = text.replace(/\{\{[Ee]lement\|([^}|]+?)(?:\|([^}]*))?\}\}/gi, (_m, name, display) =>
    display?.trim() || name,
  );
  // Enemies/NPCs: {{en|Carnibulb|Carnibulbs}} — show display text or canonical name
  text = text.replace(/\{\{en\|([^}|]+?)(?:\|([^}]*))?\}\}/gi, (_m, name, display) =>
    display?.trim() || name,
  );

  // Tooltips: {{Tooltip/BossHP|122}} → "122"
  text = text.replace(/\{\{Tooltip\/[^|}]*\|([^}]+)\}\}/gi, "$1");

  text = text
    .replace(/\{\{d\|([^}|]+?)(?:\|[^}]*)?\}\}/gi, "$1")
    .replace(/\{\{b\|([^}|]+?)(?:\|([^}]+))?\}\}/gi, (_m, name, display) => display ?? name)
    .replace(/\{\{Icon\|([^}|]+?)(?:\|[^}]*)?\}\}/gi, "$1")
    // <ref>URL</ref> and <ref name="...">…</ref> — drop entirely (citations are
    // noise once we've stripped the wiki's reference renderer).
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    // Catch-all: keep first parameter of unknown templates instead of dropping entirely
    .replace(/\{\{([^}|]+?)(?:\|[^}]*)?\}\}/g, "$1");

  if (preserveLinks) {
    text = text.replace(
      /\[\[(ability|item|class|status|stat|type|obj|chapter):([^\]]+)\]\]/g,
      (_m, type, name) => `%LINK%${type}:${name}%ENDLINK%`,
    );
  }

  text = text
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, link, txt) => txt ?? link)
    // External links: [https://example.com Display Text] → [[url:URL|Display Text]]
    .replace(/\[(https?:\/\/\S+)\s+([^\]]+)\]/g, "[[url:$1|$2]]")
    // Bare external links with no display text: [https://example.com] → drop
    .replace(/\[https?:\/\/[^\]]+\]/g, "")
    .replace(/'''([^']+)'''/g, "$1")
    .replace(/''([^']+)''/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();

  if (preserveLinks) {
    text = text.replace(/%LINK%([^%]+)%ENDLINK%/g, "[[$1]]");
  } else {
    // When not preserving links, strip url markers to just display text
    text = text.replace(/\[\[url:[^|]+\|([^\]]+)\]\]/g, "$1");
  }

  return text;
}

/**
 * Convert a section's wikitext into a flat list of cleaned bullets.
 * Strips `*`/`**`/`***` markers, drops empty lines, runs convertWikiTemplates.
 */
export function bulletsFromSection(section: string, preserveLinks = true): string[] {
  if (!section) return [];
  const lines = section.split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("*")) continue;
    const content = trimmed.replace(/^\*+\s*/, "");
    const cleaned = convertWikiTemplates(content, preserveLinks);
    if (cleaned) out.push(cleaned);
  }
  return out;
}
