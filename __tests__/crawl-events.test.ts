import { describe, expect, it } from "vitest";

import {
  extractCheck,
  extractRewards,
  parseChoices,
  parseEvent,
} from "../scripts/lib/event-parser";

describe("extractCheck", () => {
  it("parses bracket form `[DEX 12]`", () => {
    const { check, rest } = extractCheck("[DEX 12] You vault over it.");
    expect(check).toEqual({ stat: "DEX", dc: "12", kind: "stat" });
    expect(rest).toBe("You vault over it.");
  });

  it("parses `DC 14 INT:` form", () => {
    const { check, rest } = extractCheck("DC 14 INT: You decipher the runes.");
    expect(check).toEqual({ stat: "INT", dc: "14", kind: "stat" });
    expect(rest).toBe("You decipher the runes.");
  });

  it("parses parenthesized `(STR 10)` form", () => {
    const { check, rest } = extractCheck("(STR 10) You shove the door open.");
    expect(check).toEqual({ stat: "STR", dc: "10", kind: "stat" });
    expect(rest).toBe("You shove the door open.");
  });

  it("parses `{{check|CON|8}}` template form", () => {
    const { check, rest } = extractCheck("{{check|CON|8}} You hold your breath.");
    expect(check).toEqual({ stat: "CON", dc: "8", kind: "stat" });
    expect(rest).toBe("You hold your breath.");
  });

  it("parses class gates", () => {
    const { check, rest } = extractCheck("[Tank] Body-block the entrance.");
    expect(check).toEqual({ stat: "", dc: "", kind: "class:Tank" });
    expect(rest).toBe("Body-block the entrance.");
  });

  it("returns null when no check is present", () => {
    const { check, rest } = extractCheck("You walk away peacefully.");
    expect(check).toBeNull();
    expect(rest).toBe("You walk away peacefully.");
  });

  it("does not false-positive on unrelated brackets", () => {
    const { check } = extractCheck("[Hello there] not a check");
    expect(check).toBeNull();
  });
});

describe("extractRewards", () => {
  it("collects `{{i|...}}` templates", () => {
    expect(extractRewards("Reward: {{i|Lucky Penny}} and {{i|Bandage}}")).toEqual([
      "Lucky Penny",
      "Bandage",
    ]);
  });

  it("collects `[[item:...]]` deep links", () => {
    expect(extractRewards("Gain a [[item:Magic Seed]].")).toEqual(["Magic Seed"]);
  });

  it("dedupes within a single line", () => {
    expect(extractRewards("{{i|Bone}} {{i|Bone}}")).toEqual(["Bone"]);
  });

  it("returns [] when no items mentioned", () => {
    expect(extractRewards("You feel uneasy.")).toEqual([]);
  });
});

describe("parseChoices", () => {
  it("parses bullet-form choices with success/failure outcomes", () => {
    const section = `
* Approach the cauldron
** [DEX 12] You vault over it. Reward: {{i|Lucky Penny}}
** Otherwise: you fall in. Lose 1 cat.
* Walk away
** Nothing happens.
`.trim();

    const choices = parseChoices(section);
    expect(choices).toHaveLength(2);

    expect(choices[0].text).toBe("Approach the cauldron");
    expect(choices[0].outcomes).toHaveLength(2);
    expect(choices[0].outcomes[0].check).toEqual({ stat: "DEX", dc: "12", kind: "stat" });
    expect(choices[0].outcomes[0].rewards).toEqual(["Lucky Penny"]);
    expect(choices[0].outcomes[1].label).toBe("Otherwise");

    expect(choices[1].text).toBe("Walk away");
    expect(choices[1].outcomes).toHaveLength(1);
    expect(choices[1].outcomes[0].check).toBeUndefined();
  });

  it("parses description-list form (`;` choice + `:` outcomes)", () => {
    const section = `
;Inspect the corpse
:Success: You find {{i|Rusty Key}}.
:Failure: You catch a disease.
`.trim();

    const choices = parseChoices(section);
    expect(choices).toHaveLength(1);
    expect(choices[0].text).toBe("Inspect the corpse");
    expect(choices[0].outcomes.map((o) => o.label)).toEqual(["Success", "Failure"]);
    expect(choices[0].outcomes[0].rewards).toEqual(["Rusty Key"]);
  });

  it("returns [] for an empty section", () => {
    expect(parseChoices("")).toEqual([]);
  });
});

describe("parseEvent", () => {
  it("produces a valid Event from realistic wikitext", () => {
    const wikitext = `
{{Infobox Event
| Chapter = The Sewers
| Act = Act I
| Flavor = A bubbling cauldron blocks your path.
}}

This event triggers in {{ch|The Sewers}}.

==Description==
A glowing green cauldron blocks the corridor. Steam hisses from the rim.

==Choices==
* Approach the cauldron
** [DEX 12] You vault over it. Gain {{i|Lucky Penny}}.
** Otherwise: you fall in and take 5 damage.
* Walk away
** Nothing happens.

==Notes==
* Choices are independent of cat order.

==Trivia==
* Inspired by the {{i|Witches Brew}} item.

[[Category:Events]]
[[Category:Sewers]]
`.trim();

    const event = parseEvent("Bubbling Cauldron", wikitext, "");

    expect(event.name).toBe("Bubbling Cauldron");
    expect(event.kind).toBe("event");
    expect(event.chapter).toBe("The Sewers");
    expect(event.act).toBe("Act I");
    expect(event.flavor).toContain("bubbling cauldron");
    expect(event.choices).toHaveLength(2);
    expect(event.possibleRewards).toContain("Lucky Penny");
    expect(event.categories).toEqual(expect.arrayContaining(["Events", "Sewers"]));
    expect(event.wikiUrl).toBe("https://mewgenics.wiki.gg/wiki/Bubbling_Cauldron");
  });

  it("falls back to parsing the description when no Choices heading exists", () => {
    const wikitext = `
{{Infobox Event
| Chapter = The Path
}}

==Description==
* Pet the cat
** It purrs.
* Ignore it
** It hisses.
`.trim();

    const event = parseEvent("Stray Cat", wikitext, "");
    expect(event.choices.map((c) => c.text)).toEqual(["Pet the cat", "Ignore it"]);
  });
});
