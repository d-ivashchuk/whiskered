/**
 * Pure parsing helpers for `Category:Events` wiki pages.
 *
 * Extracted from `scripts/crawl-events.ts` so unit tests can import these
 * without triggering the crawler's `main()` (which performs live network I/O).
 *
 * Wiki authors describe events in two main shapes:
 *
 *   1. Bullet-list form:
 *        * Approach the cauldron
 *        ** [DEX 12] You vault over it.   Reward: {{i|Lucky Penny}}
 *        ** Otherwise: you fall in. Lose 1 cat.
 *
 *   2. Description-list form (same as boss attacks):
 *        ;Approach the cauldron
 *        :Success: You vault over it.
 *        :Failure: You fall in.
 *
 * Plus a few wiki-specific check templates (`{{check|DEX|12}}`,
 * `{{stat|DEX|12}}`, `[DC 14 INT]`). When parsing fails we still keep the
 * raw section body in `wikiDescription` so nothing is silently dropped.
 */

import {
  parseInfobox,
  extractCategories,
  extractSection,
  convertWikiTemplates,
} from "./wikitext.js";
import { wikiPageUrl } from "./mediawiki.js";
import type { Event, EventChoice, EventOutcome } from "./schemas.js";

const STAT_TOKENS = new Set([
  "STR", "CON", "DEX", "INT", "SPD", "CHA", "LCK",
  "STRENGTH", "CONSTITUTION", "DEXTERITY", "INTELLIGENCE",
  "SPEED", "CHARISMA", "LUCK",
]);

/**
 * Parse a check expression like `[DEX 12]`, `{{check|DEX|12}}`, `DC 14 INT:`,
 * `(STR 10)`, or `[Tank]`. Returns the parsed check plus the line with the
 * check stripped. If no check is detected, `check` is `null`.
 */
export function extractCheck(line: string): {
  check: { stat: string; dc: string; kind: string } | null;
  rest: string;
} {
  // {{check|DEX|12}} or {{check|STR}}
  const tpl = line.match(/\{\{[Cc]heck\|([^}|]+)(?:\|([^}]+))?\}\}/);
  if (tpl) {
    return {
      check: { stat: tpl[1].trim().toUpperCase(), dc: (tpl[2] ?? "").trim(), kind: "stat" },
      rest: line.replace(tpl[0], "").trim(),
    };
  }

  // [DEX 12] or [DC 12 DEX]
  const bracket = line.match(/\[\s*(?:DC\s*(\d+)\s*)?([A-Z]{2,4})(?:\s*(\d+))?\s*\]/i);
  if (bracket && STAT_TOKENS.has(bracket[2].toUpperCase())) {
    return {
      check: {
        stat: bracket[2].toUpperCase(),
        dc: (bracket[1] ?? bracket[3] ?? "").trim(),
        kind: "stat",
      },
      rest: line.replace(bracket[0], "").trim(),
    };
  }

  // DC 14 INT: ...   or   DC 14: ...
  const inline = line.match(/^DC\s*(\d+)(?:\s+([A-Z]{2,4}))?\s*[:\-]\s*/i);
  if (inline) {
    return {
      check: {
        stat: (inline[2] ?? "").toUpperCase(),
        dc: inline[1].trim(),
        kind: "stat",
      },
      rest: line.slice(inline[0].length).trim(),
    };
  }

  // (STR 10) ...
  const paren = line.match(/^\(\s*([A-Z]{2,4})\s+(\d+)\s*\)\s*/i);
  if (paren && STAT_TOKENS.has(paren[1].toUpperCase())) {
    return {
      check: {
        stat: paren[1].toUpperCase(),
        dc: paren[2].trim(),
        kind: "stat",
      },
      rest: line.slice(paren[0].length).trim(),
    };
  }

  // Class gate: [Tank] ... or [Mage only] ...
  const cls = line.match(/^\[([A-Z][a-z]+)(?:\s+only)?\]\s*/);
  if (cls) {
    return {
      check: { stat: "", dc: "", kind: `class:${cls[1]}` },
      rest: line.slice(cls[0].length).trim(),
    };
  }

  return { check: null, rest: line };
}

/** Heuristic — does a line look like it labels a Success / Failure outcome? */
function detectOutcomeLabel(text: string): { label: string; rest: string } {
  const m = text.match(/^(Success|Failure|Pass|Fail|Critical Success|Critical Failure|Otherwise|If [^:]+)\s*[:\-—]\s*/i);
  if (m) return { label: m[1].trim(), rest: text.slice(m[0].length).trim() };
  return { label: "", rest: text };
}

/**
 * Parse a `==Choices==` (or fallback) section into structured choices.
 * Handles both bullet form (`*` choice / `**` outcome) and description-list
 * form (`;` choice / `:` outcome). Anything we can't classify is preserved
 * as an outcome with an empty label so data isn't silently dropped.
 */
export function parseChoices(section: string): EventChoice[] {
  if (!section) return [];

  const choices: EventChoice[] = [];
  let current: EventChoice | null = null;

  const flush = () => {
    if (current && (current.text || current.outcomes.length > 0)) {
      choices.push(current);
    }
    current = null;
  };

  for (const raw of section.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    // Top-level choice: `* …` or `;…`
    if (/^\*[^*]/.test(line) || line.startsWith(";")) {
      flush();
      const text = line.replace(/^[*;]\s*/, "");
      current = {
        text: convertWikiTemplates(text, true),
        description: "",
        outcomes: [],
      };
      continue;
    }

    // Outcome: `**`, `:`, `:*`
    if (line.startsWith("**") || line.startsWith(":")) {
      if (!current) {
        // Stray outcome with no choice header — synthesize an unnamed choice
        // so the data isn't dropped on the floor.
        current = { text: "", description: "", outcomes: [] };
      }
      const stripped = line.replace(/^(?:\*\*+|:+\*?)\s*/, "");
      const { check, rest: afterCheck } = extractCheck(stripped);
      const { label, rest } = detectOutcomeLabel(afterCheck);

      const outcome: EventOutcome = {
        label,
        description: convertWikiTemplates(rest, true),
        rewards: extractRewards(rest),
        penalties: [],
      };
      if (check) outcome.check = check;
      current.outcomes.push(outcome);
      continue;
    }

    // Anything else attached to the current choice → flavor description.
    if (current) {
      const text = convertWikiTemplates(line, true);
      current.description = current.description ? `${current.description} ${text}` : text;
    }
  }
  flush();

  return choices;
}

/** Pull `{{i|Lucky Penny}}` / `[[item:Lucky Penny]]` references out of a line. */
export function extractRewards(line: string): string[] {
  const out = new Set<string>();
  const tpl = /\{\{i\|([^}|]+?)(?:\|[^}]*)?\}\}/gi;
  let m: RegExpExecArray | null;
  while ((m = tpl.exec(line)) !== null) out.add(m[1].trim());
  const link = /\[\[item:([^\]|]+)(?:\|[^\]]*)?\]\]/gi;
  while ((m = link.exec(line)) !== null) out.add(m[1].trim());
  return Array.from(out);
}

/** Take the first non-empty paragraph above the first `==Heading==`. */
function leadingParagraph(wikitext: string): string {
  const beforeFirstHeading = wikitext.split(/\n==[^=]/)[0];
  const sansInfobox = beforeFirstHeading.replace(/\{\{(?:Infobox|Event)[\s\S]*?\n\}\}\s*/i, "");
  const para = sansInfobox.split(/\n\s*\n/).find((p) => p.trim().length > 0) ?? "";
  return convertWikiTemplates(para.trim(), true);
}

function cleanSectionBody(section: string): string {
  if (!section) return "";
  let text = section.replace(/===[^=]+===[\s\S]*?(?=\n==[^=]|$)/g, "");
  text = convertWikiTemplates(text, true);
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

/** Aggregate item rewards from every choice's outcomes. */
function collectPossibleRewards(choices: EventChoice[]): string[] {
  const set = new Set<string>();
  for (const c of choices) {
    for (const o of c.outcomes) for (const r of o.rewards) set.add(r);
  }
  return Array.from(set).sort();
}

export function parseEvent(title: string, rawWikitext: string, spritePath: string): Event {
  const wikitext = rawWikitext.replace(/\{\{PAGENAME\}\}/gi, title);
  const infobox = parseInfobox(wikitext);

  // Try several headings — wiki authors aren't consistent.
  const description =
    extractSection(wikitext, "Description") ||
    extractSection(wikitext, "Overview") ||
    extractSection(wikitext, "Summary") ||
    "";
  const choicesSection =
    extractSection(wikitext, "Choices") ||
    extractSection(wikitext, "Options") ||
    extractSection(wikitext, "Outcomes") ||
    extractSection(wikitext, "Branches") ||
    "";
  const notes = extractSection(wikitext, "Notes");
  const trivia = extractSection(wikitext, "Trivia");

  // If there's no dedicated choices section, fall back to parsing whatever
  // the description body contains — many event pages skip the heading.
  const choices = parseChoices(choicesSection || description);

  const flavor =
    convertWikiTemplates(infobox.Flavor ?? infobox.Description ?? "", true) ||
    leadingParagraph(wikitext);

  return {
    name: title,
    kind: "event",
    chapter: convertWikiTemplates(infobox.Chapter ?? infobox.Location ?? infobox.FoundIn ?? "", false),
    act: (infobox.Act ?? infobox.act ?? "").trim(),
    flavor,
    wikiDescription: cleanSectionBody(description),
    choices,
    possibleRewards: collectPossibleRewards(choices),
    wikiNotes: cleanSectionBody(notes),
    wikiTrivia: cleanSectionBody(trivia),
    spritePath,
    categories: extractCategories(wikitext),
    wikiUrl: wikiPageUrl(title),
  };
}
