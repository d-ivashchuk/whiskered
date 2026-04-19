/**
 * RichText — renders text with inline deep-linked references.
 *
 * Parses [[type:name]] markers and renders them as tappable inline
 * Text spans with sprite icons. Uses nested <Text onPress> for
 * proper inline flow (Pressable inside Text breaks layout in RN).
 */
import { Text } from "@/components/ui/text";
import { STAT_INFO } from "@/lib/game-data";
import { getAbilitySprite, getItemSprite, getClassSprite, getStatSprite } from "@/lib/sprites";
import { useRouter } from "expo-router";
import { Image } from "react-native";
import type { ImageSourcePropType } from "react-native";

interface RichTextProps {
  children: string;
  className?: string;
}

interface TextSegment {
  type: "text" | "ability" | "item" | "class" | "stat" | "status";
  value: string;
}

const LINK_REGEX = /\[\[(ability|item|class|stat|status):([^\]]+)\]\]/g;

function parseSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = LINK_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({
      type: match[1] as TextSegment["type"],
      value: match[2],
    });
    lastIndex = match.index + match[0].length;
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
      return `/abilities/${encodeURIComponent(name)}`;
    case "item":
      return `/items/${encodeURIComponent(name)}`;
    case "class":
      return `/classes/${encodeURIComponent(name)}`;
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
                style={{ width: 14, height: 14, transform: [{ translateY: 2 }] }}
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
