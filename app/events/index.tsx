import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { SearchEmpty } from "@/components/search-empty";
import { useThemeColors } from "@/lib/theme";
import { events } from "@/lib/game-data";
import type { GameEvent } from "@/lib/game-data";
import { getEventSprite } from "@/lib/sprites";
import { useRouter, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, Search, X } from "lucide-react-native";

// ─── Event category / chapter structure ─────────────────────────────────────

interface EventSection {
  section: string;
  groups: { label: string; chapters: string[] }[];
}

const EVENT_SECTIONS: EventSection[] = [
  {
    section: "General",
    groups: [
      { label: "Dead Body", chapters: ["Dead Body"] },
      { label: "Treasure Box", chapters: ["Treasure Box"] },
      { label: "Misc Events", chapters: ["Misc Events"] },
      { label: "NPC Events", chapters: ["NPC Events"] },
      { label: "Monster", chapters: ["Monster"] },
      { label: "Monkey Paw", chapters: ["Monkey Paw"] },
    ],
  },
  {
    section: "Act 1",
    groups: [
      { label: "The Alley", chapters: ["The Alley"] },
      { label: "Sewers", chapters: ["Sewers"] },
      { label: "Junkyard", chapters: ["Junkyard"] },
      { label: "Caves", chapters: ["Caves"] },
      { label: "Boneyard", chapters: ["Boneyard"] },
      { label: "Throbbing Domain", chapters: ["Throbbing Domain"] },
    ],
  },
  {
    section: "Act 2",
    groups: [
      { label: "Desert", chapters: ["Desert"] },
      { label: "Bunker", chapters: ["Bunker"] },
      { label: "The Crater", chapters: ["The Crater"] },
      { label: "The Core", chapters: ["The Core"] },
      { label: "The Moon", chapters: ["The Moon"] },
      { label: "Obelisk", chapters: ["Obelisk"] },
      { label: "The Rift", chapters: ["The Rift"] },
    ],
  },
  {
    section: "Act 3",
    groups: [
      { label: "Time Machine", chapters: ["Time Machine"] },
      { label: "The Lab", chapters: ["The Lab"] },
      { label: "Build a Stacy", chapters: ["Build a Stacy"] },
      { label: "Ice Age", chapters: ["Ice Age"] },
      { label: "The Future", chapters: ["The Future"] },
      { label: "Jurassic", chapters: ["Jurassic"] },
      { label: "The End", chapters: ["The End"] },
      { label: "The Infinite", chapters: ["The Infinite"] },
    ],
  },
  {
    section: "Other",
    groups: [
      { label: "Tutorial", chapters: ["Tutorial Event"] },
      { label: "Debug", chapters: ["Debug Events"] },
    ],
  },
];

interface EventGroup {
  section: string;
  label: string;
  events: GameEvent[];
}

function EventRow({ event, onPress, isLast }: { event: GameEvent; onPress: () => void; isLast: boolean }) {
  const theme = useThemeColors();
  const sprite = getEventSprite(event.name);
  const choiceCount = event.choices.length;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.secondary : "transparent",
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.border,
      })}
      className="flex-row items-center px-4 py-3"
    >
      <View className="w-12 h-12 mr-3 items-center justify-center">
        {sprite ? (
          <Image source={sprite} style={{ width: 44, height: 44 }} resizeMode="contain" />
        ) : (
          <View style={{ backgroundColor: theme.secondary }} className="w-11 h-11 rounded-lg items-center justify-center">
            <Text className="text-lg font-bold text-muted-foreground">{event.name[0]}</Text>
          </View>
        )}
      </View>

      <View className="flex-1 mr-2">
        <Text className="text-base font-bold" numberOfLines={1}>{event.name}</Text>
        <Text className="text-muted-foreground text-xs" numberOfLines={1}>
          {choiceCount > 0 ? `${choiceCount} option${choiceCount !== 1 ? "s" : ""}` : "Non-interactive"}
          {event.possibleRewards.length > 0 ? ` · ${event.possibleRewards.length} reward${event.possibleRewards.length !== 1 ? "s" : ""}` : ""}
        </Text>
      </View>

      <ChevronRight size={16} color={theme.mutedForeground} />
    </Pressable>
  );
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useThemeColors();
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const q = search.toLowerCase().trim();

    const filtered = q
      ? events.filter((e) => {
          // Search name, chapter, flavor
          if (e.name.toLowerCase().includes(q)) return true;
          if (e.chapter.toLowerCase().includes(q)) return true;
          if (e.flavor.toLowerCase().includes(q)) return true;
          // Search through all outcome narratives and effects
          for (const c of e.choices) {
            if (c.text.toLowerCase().includes(q)) return true;
            for (const o of c.outcomes) {
              if (o.description.toLowerCase().includes(q)) return true;
              if (o.effect.toLowerCase().includes(q)) return true;
            }
          }
          return false;
        })
      : events;

    const chapterMap = new Map<string, GameEvent[]>();
    for (const event of filtered) {
      const ch = event.chapter || "";
      const existing = chapterMap.get(ch) ?? [];
      existing.push(event);
      chapterMap.set(ch, existing);
    }

    const result: EventGroup[] = [];
    for (const section of EVENT_SECTIONS) {
      for (const group of section.groups) {
        const groupEvents: GameEvent[] = [];
        for (const ch of group.chapters) {
          const found = chapterMap.get(ch);
          if (found) {
            groupEvents.push(...found);
            chapterMap.delete(ch);
          }
        }
        if (groupEvents.length > 0) {
          groupEvents.sort((a, b) => a.name.localeCompare(b.name));
          result.push({ section: section.section, label: group.label, events: groupEvents });
        }
      }
    }

    // Remaining uncategorized events
    for (const [ch, group] of chapterMap) {
      if (group.length > 0) {
        result.push({ section: "Other", label: ch || "Unknown", events: group });
      }
    }

    return result;
  }, [search]);

  const totalFiltered = groups.reduce((sum, g) => sum + g.events.length, 0);
  const shownSections = new Set<string>();

  return (
    <>
      <Stack.Screen options={{ title: "Events" }} />
      <View className="px-4 pt-2 pb-2">
        <View className="flex-row items-center">
          <View className="flex-1 flex-row items-center">
            <Search size={16} color={theme.mutedForeground} style={{ position: "absolute", left: 10, zIndex: 1 }} />
            <Input value={search} onChangeText={setSearch} placeholder="Search events..." className="flex-1 pl-9" />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} style={{ position: "absolute", right: 10 }}>
                <X size={16} color={theme.mutedForeground} />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-4 pb-1">
          <Text className="text-muted-foreground text-sm">
            {totalFiltered} events
          </Text>
        </View>

        {totalFiltered === 0 && search.trim() ? (
          <SearchEmpty query={search.trim()} />
        ) : null}

        {groups.map((group) => {
          const showSectionHeader = !shownSections.has(group.section);
          if (showSectionHeader) shownSections.add(group.section);

          return (
            <View key={`${group.section}-${group.label}`}>
              {showSectionHeader && group.section !== "General" && (
                <View style={{ backgroundColor: theme.secondary, height: 16 }} />
              )}
              {showSectionHeader && (
                <View className="px-4 pt-4 pb-1">
                  <Text className="text-lg font-bold">{group.section}</Text>
                </View>
              )}
              <View
                style={{ backgroundColor: theme.secondary }}
                className="px-4 py-2 mt-1"
              >
                <Text className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  {group.label}
                </Text>
              </View>
              {group.events.map((event, i) => (
                <EventRow
                  key={event.name}
                  event={event}
                  isLast={i === group.events.length - 1}
                  onPress={() => router.push(`/events/${encodeURIComponent(event.name)}`)}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}
