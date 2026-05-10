import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { SearchEmpty } from "@/components/search-empty";
import { useThemeColors } from "@/lib/theme";
import { enemies } from "@/lib/game-data";
import type { GameEnemy } from "@/lib/game-data";
import { getEnemySprite } from "@/lib/sprites";
import { useRouter, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, Search, X, AlertTriangle } from "lucide-react-native";

// ─── Act / Zone structure ────────────────────────────────────────────────────

interface ActSection {
  act: string;
  zones: { label: string; locations: string[] }[];
}

const ACT_SECTIONS: ActSection[] = [
  {
    act: "Tutorial",
    zones: [{ label: "The Path", locations: ["The Path"] }],
  },
  {
    act: "Act 1",
    zones: [
      { label: "The Alley", locations: ["The Alley"] },
      { label: "The Sewers", locations: ["The Sewers"] },
      { label: "The Junkyard", locations: ["The Junkyard"] },
      { label: "The Caves", locations: ["The Caves"] },
      { label: "The Boneyard", locations: ["The Boneyard"] },
      { label: "The Throbbing Domain", locations: ["The Throbbing Domain"] },
    ],
  },
  {
    act: "Act 2",
    zones: [
      { label: "The Desert", locations: ["The Desert"] },
      { label: "The Bunker", locations: ["The Bunker"] },
      { label: "The Crater", locations: ["The Crater"] },
      { label: "The Core", locations: ["The Core"] },
      { label: "The Moon", locations: ["The Moon"] },
      { label: "The Rift", locations: ["The Rift"] },
    ],
  },
  {
    act: "Act 3",
    zones: [
      { label: "The Lab", locations: ["The Lab"] },
      { label: "Ice Age", locations: ["Ice Age"] },
      { label: "The Future", locations: ["The Future"] },
      { label: "The Jurassic", locations: ["The Jurassic"] },
      { label: "The End", locations: ["The End"] },
      { label: "The Infinite", locations: ["The Infinite"] },
    ],
  },
];

interface EnemyGroup {
  act: string;
  zone: string;
  enemies: GameEnemy[];
}

function EnemyRow({ enemy, onPress, isLast }: { enemy: GameEnemy; onPress: () => void; isLast: boolean }) {
  const theme = useThemeColors();
  const sprite = getEnemySprite(enemy.name);

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
            <Text className="text-lg font-bold text-muted-foreground">{enemy.name[0]}</Text>
          </View>
        )}
      </View>

      <View className="flex-1 mr-2">
        <Text className="text-base font-bold">{enemy.name}</Text>
        <Text className="text-muted-foreground text-xs" numberOfLines={1}>
          {[
            enemy.stats.health ? `${enemy.stats.health} HP` : "",
            enemy.stats.damage ? `${enemy.stats.damage} DMG` : "",
            !enemy.stats.health && !enemy.stats.damage && enemy.locations.length > 0
              ? enemy.locations.join(", ")
              : "",
          ]
            .filter(Boolean)
            .join(" · ") || enemy.attackStyle || "Unknown"}
        </Text>
      </View>

      {enemy.dangerFlag ? (
        <View style={{ backgroundColor: "#dc262620" }} className="rounded px-1.5 py-0.5 mr-2">
          <AlertTriangle size={12} color="#dc2626" />
        </View>
      ) : null}
      <ChevronRight size={16} color={theme.mutedForeground} />
    </Pressable>
  );
}

export default function EnemiesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useThemeColors();
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const q = search.toLowerCase().trim();

    const filteredEnemies = q
      ? enemies.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            e.locations.some((l) => l.toLowerCase().includes(q))
        )
      : enemies;

    // Map enemies to their primary location for grouping
    const locationMap = new Map<string, GameEnemy[]>();
    for (const enemy of filteredEnemies) {
      const loc = enemy.locations[0] || "";
      const existing = locationMap.get(loc) ?? [];
      existing.push(enemy);
      locationMap.set(loc, existing);
    }

    const result: EnemyGroup[] = [];
    for (const section of ACT_SECTIONS) {
      for (const zone of section.zones) {
        const zoneEnemies: GameEnemy[] = [];
        for (const loc of zone.locations) {
          const group = locationMap.get(loc);
          if (group) {
            zoneEnemies.push(...group);
            locationMap.delete(loc);
          }
        }
        if (zoneEnemies.length > 0) {
          zoneEnemies.sort((a, b) => a.name.localeCompare(b.name));
          result.push({ act: section.act, zone: zone.label, enemies: zoneEnemies });
        }
      }
    }

    // Any remaining enemies not in the structure
    for (const [loc, group] of locationMap) {
      if (group.length > 0) {
        result.push({ act: "Other", zone: loc || "Unknown", enemies: group });
      }
    }

    return result;
  }, [search]);

  const totalFiltered = groups.reduce((sum, g) => sum + g.enemies.length, 0);

  // Track which act headers we've already shown
  const shownActs = new Set<string>();

  return (
    <>
      <Stack.Screen options={{ title: "Enemies" }} />
      <View className="px-4 pt-2 pb-2">
        <View className="flex-row items-center">
          <View className="flex-1 flex-row items-center">
            <Search size={16} color={theme.mutedForeground} style={{ position: "absolute", left: 10, zIndex: 1 }} />
            <Input value={search} onChangeText={setSearch} placeholder="Search enemies..." className="flex-1 pl-9" />
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
            {totalFiltered} enemies
          </Text>
        </View>

        {totalFiltered === 0 && search.trim() ? (
          <SearchEmpty query={search.trim()} />
        ) : null}

        {groups.map((group) => {
          const showActHeader = !shownActs.has(group.act);
          if (showActHeader) shownActs.add(group.act);

          return (
            <View key={`${group.act}-${group.zone}`}>
              {showActHeader && group.act !== "Tutorial" && (
                <View style={{ backgroundColor: theme.secondary, height: 16 }} />
              )}
              {showActHeader && (
                <View className="px-4 pt-4 pb-1">
                  <Text className="text-lg font-bold">{group.act}</Text>
                </View>
              )}
              <View
                style={{ backgroundColor: theme.secondary }}
                className="px-4 py-2 mt-1"
              >
                <Text className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  {group.zone}
                </Text>
              </View>
              {group.enemies.map((enemy, i) => (
                <EnemyRow
                  key={enemy.name}
                  enemy={enemy}
                  isLast={i === group.enemies.length - 1}
                  onPress={() => router.push(`/enemies/${encodeURIComponent(enemy.name)}`)}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}
