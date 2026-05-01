import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { SearchEmpty } from "@/components/search-empty";
import { useThemeColors } from "@/lib/theme";
import { disorders } from "@/lib/game-data";
import type { GameDisorder } from "@/lib/game-data";
import { getDisorderSprite } from "@/lib/sprites";
import { useRouter, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, Search, X } from "lucide-react-native";

// ─── Pool grouping ──────────────────────────────────────────────────────────

const POOL_ORDER = [
  "General",
  "Disease",
  "Mental",
  "Physical",
  "Birth defect",
  "Stomach",
  "Hygiene",
  "Magic",
  "Forbidden",
];

interface DisorderGroup {
  pool: string;
  disorders: GameDisorder[];
}

function DisorderRow({ disorder, onPress, isLast }: { disorder: GameDisorder; onPress: () => void; isLast: boolean }) {
  const theme = useThemeColors();
  const sprite = getDisorderSprite(disorder.name);

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
      {sprite ? (
        <Image source={sprite} style={{ width: 28, height: 28 }} resizeMode="contain" className="mr-3" />
      ) : (
        <View style={{ width: 28, height: 28 }} className="mr-3" />
      )}
      <View className="flex-1 mr-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-bold" numberOfLines={1}>{disorder.name}</Text>
          {disorder.contagious ? (
            <View style={{ backgroundColor: "#dc262615" }} className="rounded px-1.5 py-0.5">
              <Text style={{ color: "#dc2626" }} className="text-[10px] font-bold">Contagious</Text>
            </View>
          ) : null}
        </View>
        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={2}>
          {disorder.description.replace(/\[\[[^\]]+\]\]/g, (m) => m.replace(/\[\[\w+:/, "").replace(/\]\]/, ""))}
        </Text>
      </View>

      <ChevronRight size={16} color={theme.mutedForeground} />
    </Pressable>
  );
}

export default function DisordersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useThemeColors();
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const q = search.toLowerCase().trim();

    const filtered = q
      ? disorders.filter((d) => {
          if (d.name.toLowerCase().includes(q)) return true;
          if (d.description.toLowerCase().includes(q)) return true;
          if (d.pools.some((p) => p.toLowerCase().includes(q))) return true;
          if (d.wikiEffects.toLowerCase().includes(q)) return true;
          return false;
        })
      : disorders;

    // Group by primary pool
    const poolMap = new Map<string, GameDisorder[]>();
    for (const d of filtered) {
      const pool = d.pools[0] || "Other";
      const existing = poolMap.get(pool) ?? [];
      existing.push(d);
      poolMap.set(pool, existing);
    }

    const result: DisorderGroup[] = [];
    for (const pool of POOL_ORDER) {
      const group = poolMap.get(pool);
      if (group) {
        group.sort((a, b) => a.name.localeCompare(b.name));
        result.push({ pool, disorders: group });
        poolMap.delete(pool);
      }
    }

    // Remaining pools
    for (const [pool, group] of poolMap) {
      group.sort((a, b) => a.name.localeCompare(b.name));
      result.push({ pool, disorders: group });
    }

    return result;
  }, [search]);

  const totalFiltered = groups.reduce((sum, g) => sum + g.disorders.length, 0);

  return (
    <>
      <Stack.Screen options={{ title: "Disorders" }} />
      <View className="px-4 pt-2 pb-2">
        <View className="flex-row items-center">
          <View className="flex-1 flex-row items-center">
            <Search size={16} color={theme.mutedForeground} style={{ position: "absolute", left: 10, zIndex: 1 }} />
            <Input value={search} onChangeText={setSearch} placeholder="Search disorders..." className="flex-1 pl-9" />
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
            {totalFiltered} disorders
          </Text>
        </View>

        {totalFiltered === 0 && search.trim() ? (
          <SearchEmpty query={search.trim()} />
        ) : null}

        {groups.map((group) => (
          <View key={group.pool}>
            <View
              style={{ backgroundColor: theme.secondary }}
              className="px-4 py-2 mt-1"
            >
              <Text className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                {group.pool}
              </Text>
            </View>
            {group.disorders.map((disorder, i) => (
              <DisorderRow
                key={disorder.name}
                disorder={disorder}
                isLast={i === group.disorders.length - 1}
                onPress={() => router.push(`/disorders/${encodeURIComponent(disorder.name)}`)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </>
  );
}
