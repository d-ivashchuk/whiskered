import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { SearchEmpty } from "@/components/search-empty";
import { useThemeColors } from "@/lib/theme";
import { sets, getItem } from "@/lib/game-data";
import { getTierColor } from "@/lib/game-colors";
import { getItemSprite } from "@/lib/sprites";
import { useRouter, Stack } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Image, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, X, ChevronRight } from "lucide-react-native";
import type { GameSet } from "@/lib/game-data";

const TIERS = ["All", "S", "A", "B", "C", "D"] as const;
const TIER_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, "": 5 };

function SetRow({ set, onPress }: { set: GameSet; onPress: () => void }) {
  const theme = useThemeColors();
  const tierColor = getTierColor(set.avgTier);

  const itemPreviews = useMemo(() => {
    return set.items.slice(0, 4).map((itemName) => {
      const item = getItem(itemName);
      return {
        name: itemName,
        sprite: getItemSprite(itemName, item?.internalName),
      };
    });
  }, [set.items]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.secondary : "transparent",
      })}
      className="flex-row items-center px-4 py-3 border-b border-border"
    >
      {/* Tier badge — fixed width so everything aligns */}
      {set.avgTier ? (
        <View
          style={{ backgroundColor: tierColor.bg }}
          className="w-6 h-6 items-center justify-center rounded mr-2.5"
        >
          <Text style={{ color: tierColor.text }} className="text-xs font-black">{set.avgTier}</Text>
        </View>
      ) : (
        <View className="w-6 mr-2.5" />
      )}

      {/* Item sprite grid (2x2) */}
      <View className="mr-3" style={{ width: 40, height: 40, flexDirection: "row", flexWrap: "wrap" }}>
        {itemPreviews.slice(0, 4).map((preview) =>
          preview.sprite ? (
            <Image
              key={preview.name}
              source={preview.sprite}
              style={{ width: 20, height: 20 }}
              resizeMode="contain"
            />
          ) : (
            <View
              key={preview.name}
              style={{ width: 20, height: 20, backgroundColor: theme.secondary, borderRadius: 2 }}
            />
          )
        )}
      </View>

      <View className="flex-1 mr-2">
        <Text className="font-semibold text-sm" numberOfLines={1}>{set.name}</Text>
        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
          {set.items.length} item{set.items.length !== 1 ? "s" : ""}
          {set.description ? ` · ${set.description}` : ""}
        </Text>
      </View>

      <ChevronRight size={16} color={theme.mutedForeground} />
    </Pressable>
  );
}

export default function SetsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useThemeColors();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("All");

  const filtered = useMemo(() => {
    let result = [...sets];
    if (tierFilter !== "All") result = result.filter((s) => s.avgTier === tierFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.statusEffects.some((e) => e.toLowerCase().includes(q)) ||
          s.items.some((item) => item.toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => {
      const ta = TIER_ORDER[a.avgTier] ?? 5;
      const tb = TIER_ORDER[b.avgTier] ?? 5;
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name);
    });
  }, [search, tierFilter]);

  const renderItem = useCallback(
    ({ item }: { item: GameSet }) => (
      <SetRow
        set={item}
        onPress={() => router.push(`/sets/${encodeURIComponent(item.name)}`)}
      />
    ),
    [router]
  );

  return (
    <>
      <Stack.Screen options={{ title: "Sets" }} />
      <View style={{ flex: 1 }}>
        <View className="px-4 pt-2 pb-2">
          {/* Search */}
          <View className="flex-row items-center mb-3">
            <View className="flex-1 flex-row items-center">
              <Search
                size={16}
                color={theme.mutedForeground}
                style={{ position: "absolute", left: 10, zIndex: 1 }}
              />
              <Input
                value={search}
                onChangeText={setSearch}
                placeholder="Search sets, effects, or items..."
                className="flex-1 pl-9"
              />
              {search.length > 0 && (
                <Pressable
                  onPress={() => setSearch("")}
                  style={{ position: "absolute", right: 10 }}
                >
                  <X size={16} color={theme.mutedForeground} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Tier filter */}
          <View className="flex-row gap-1.5">
            {TIERS.map((tier) => {
              const active = tierFilter === tier;
              const tc = tier === "All" ? null : getTierColor(tier);
              return (
                <Pressable
                  key={tier}
                  onPress={() => setTierFilter(tier)}
                  style={{
                    backgroundColor: active ? (tc?.bg ?? theme.primary) : "transparent",
                    borderColor: active ? (tc?.bg ?? theme.primary) : theme.border,
                    borderWidth: 1,
                  }}
                  className="rounded-lg px-3 py-1.5"
                >
                  <Text
                    style={{ color: active ? (tc?.text ?? theme.primaryForeground) : theme.mutedForeground }}
                    className="text-xs font-bold"
                  >{tier}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="px-4 py-1.5 border-b border-border">
          <Text className="text-muted-foreground text-xs">{filtered.length} sets</Text>
        </View>

        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.name}
          initialNumToRender={20}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          ListEmptyComponent={search.trim() ? <SearchEmpty query={search.trim()} /> : null}
        />
      </View>
    </>
  );
}
