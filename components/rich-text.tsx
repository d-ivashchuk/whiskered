/**
 * RichText — renders text with inline deep-linked references.
 *
 * Parses [[type:name]] markers and renders them as tappable inline
 * Text spans with sprite icons. Uses nested <Text onPress> for
 * proper inline flow (Pressable inside Text breaks layout in RN).
 */
import { Text } from "@/components/ui/text";
import { STAT_INFO, getAbility, getItem, getClass, getStatusEffect } from "@/lib/game-data";
import { getAbilitySprite, getItemSprite, getClassSprite, getStatSprite, getStatusEffectSprite } from "@/lib/sprites";
import { useRouter } from "expo-router";
import { Image, Linking } from "react-native";
import type { ImageSourcePropType } from "react-native";

interface RichTextProps {
  children: string;
  className?: string;
}

type LinkType = "ability" | "item" | "class" | "stat" | "status" | "obj" | "type" | "chapter" | "url";

interface TextSegment {
  type: "text" | LinkType;
  value: string;
  /** Display text for url links (value holds the URL) */
  display?: string;
}

const LINK_REGEX = /\[\[(ability|item|class|stat|status|obj|type|chapter):([^\]]+)\]\]/g;
const URL_REGEX = /\[\[url:([^|]+)\|([^\]]+)\]\]/g;

function parseSegments(text: string): TextSegment[] {
  // Collect all matches from both regexes, sorted by position
  const matches: Array<{ index: number; length: number; segment: TextSegment }> = [];

  let match: RegExpExecArray | null;
  const linkRe = new RegExp(LINK_REGEX.source, "g");
  while ((match = linkRe.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      segment: { type: match[1] as LinkType, value: match[2] },
    });
  }
  const urlRe = new RegExp(URL_REGEX.source, "g");
  while ((match = urlRe.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      segment: { type: "url", value: match[1], display: match[2] },
    });
  }

  matches.sort((a, b) => a.index - b.index);

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  for (const m of matches) {
    if (m.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, m.index) });
    }
    segments.push(m.segment);
    lastIndex = m.index + m.length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

function getSprite(type: string, name: string): ImageSourcePropType | null {
  switch (type) {
    case "ability":
      return getAbilitySprite(name, name);
    case "item":
      return getItemSprite(name);
    case "class":
      return getClassSprite(name);
    case "stat":
      return getStatSprite(name);
    case "status":
      return getStatusEffectSprite(name);
    default:
      return null;
  }
}

function getDisplayName(type: string, name: string): string {
  if (type === "stat") {
    return STAT_INFO[name]?.name ?? name;
  }
  return name;
}

function getRoute(type: string, name: string): string | null {
  switch (type) {
    case "ability":
      return getAbility(name) ? `/abilities/${encodeURIComponent(name)}` : null;
    case "item":
      return getItem(name) ? `/items/${encodeURIComponent(name)}` : null;
    case "class":
      return getClass(name) ? `/classes/${encodeURIComponent(name)}` : null;
    case "status":
      return getStatusEffect(name) ? `/effects/${encodeURIComponent(name)}` : null;
    default:
      return null;
  }
}

export function RichText({ children, className }: RichTextProps) {
  const router = useRouter();
  const segments = parseSegments(children);

  // If no links found, render as plain text
  if (segments.length === 1 && segments[0].type === "text") {
    return <Text className={className}>{children}</Text>;
  }

  return (
    <Text className={className}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return seg.value;
        }

        // External URL links
        if (seg.type === "url") {
          return (
            <Text
              key={i}
              onPress={() => Linking.openURL(seg.value)}
              style={{ textDecorationLine: "underline", textDecorationColor: "#6b7280" }}
              className="font-semibold"
            >
              {seg.display ?? seg.value}
            </Text>
          );
        }

        const sprite = getSprite(seg.type, seg.value);
        const displayName = getDisplayName(seg.type, seg.value);
        const route = getRoute(seg.type, seg.value);

        return (
          <Text
            key={i}
            onPress={route ? () => router.push(route as "/abilities/${string}") : undefined}
            style={route ? { textDecorationLine: "underline", textDecorationColor: "#6b7280" } : undefined}
            className="font-semibold"
          >
            {sprite ? (
              <Image
                source={sprite}
                style={{ width: 14, height: 14, transform: [{ translateY: 3 }] }}
                resizeMode="contain"
              />
            ) : null}
            {sprite ? " " : ""}{displayName}
          </Text>
        );
      })}
    </Text>
  );
}
