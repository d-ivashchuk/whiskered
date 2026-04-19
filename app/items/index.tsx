import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { useThemeColors } from "@/lib/theme";
import { items, getAllSlots } from "@/lib/game-data";
import { getTierColor, getRarityTextColor } from "@/lib/game-colors";
import { getItemSprite } from "@/lib/sprites";
import { useRouter, Stack } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Image, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, X } from "lucide-react-native";
import type { GameItem } from "@/lib/game-data";

const TIERS = ["All", "S", "A", "B", "C", "D"] as const;
const TIER_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, "": 5 };

function ItemRow({ item, onPress }: { item: GameItem; onPress: () => void }) {
  const theme = useThemeColors();
  const sprite = getItemSprite(item.name, item.internalName);
  const tierColor = getTierColor(item.tier);
  const rarityColor = getRarityTextColor(item.rarity);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.secondary : "transparent",
      })}
      className="flex-row items-center px-4 py-2.5 border-b border-border"
    >
      {/* Sprite */}
      <View className="w-10 h-10 mr-3 items-center justify-center">
        {sprite ? (
          <Image source={sprite} style={{ width: 36, height: 36 }} resizeMode="contain" />
        ) : (
          <View
            style={{ backgroundColor: theme.secondary }}
            className="w-9 h-9 rounded items-center justify-center"
          >
            <Text className="text-muted-foreground text-xs">?</Text>
          </View>
        )}
      </View>

      {/* Name + description */}
      <View className="flex-1 mr-2">
        <Text className="font-semibold text-sm" numberOfLines={1}>{item.name}</Text>
        <Text className="text-muted-foreground text-xs" numberOfLines={1}>
          {[item.rarity, item.slot].filter(Boolean).join(" · ")}
          {item.sets.length > 0 ? (
            <>
              {"  "}
              <Text style={{ color: rarityColor }} className="text-xs font-medium">{item.sets.join(", ")}</Text>
            </>
          ) : null}
        </Text>
      </View>

      {/* Tier badge */}
      {item.tier ? (
        <View
          style={{ backgroundColor: tierColor.bg }}
          className="w-6 h-6 items-center justify-center rounded"
        >
          <Text style={{ color: tierColor.text }} className="text-xs font-black">{item.tier}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function ItemsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useThemeColors();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("All");
  const [slotFilter, setSlotFilter] = useState("All");

  const slots = useMemo(() => ["All", ...getAllSlots()], []);

  const filtered = useMemo(() => {
    let result = items;
    if (tierFilter !== "All") result = result.filter((i) => i.tier === tierFilter);
    if (slotFilter !== "All") result = result.filter((i) => i.slot === slotFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.sets.some((s) => s.toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => {
      const ta = TIER_ORDER[a.tier] ?? 5;
      const tb = TIER_ORDER[b.tier] ?? 5;
      return ta !== tb ? ta - tb : a.name.localeCompare(b.name);
    });
  }, [search, tierFilter, slotFilter]);

  const renderItem = useCallback(
    ({ item }: { item: GameItem }) => (
      <ItemRow item={item} onPress={() => router.push(`/items/${encodeURIComponent(item.name)}`)} />
    ),
    [router]
  );

  return (
    <>
      <Stack.Screen options={{ title: "Items" }} />
      <View style={{ flex: 1 }}>
        <View className="px-4 pt-2 pb-2">
          {/* Search */}
          <View className="flex-row items-center mb-3">
            <View className="flex-1 flex-row items-center">
              <Search size={16} color={theme.mutedForeground} style={{ position: "absolute", left: 10, zIndex: 1 }} />
              <Input value={search} onChangeText={setSearch} placeholder="Search items or sets..." className="flex-1 pl-9" />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")} style={{ position: "absolute", right: 10 }}>
                  <X size={16} color={theme.mutedForeground} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Tier filter */}
          <View className="flex-row gap-1.5 mb-2">
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

          {/* Slot filter */}
          <FlatList
            data={slots}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(s) => s}
            renderItem={({ item: slot }) => {
              const active = slotFilter === slot;
              return (
                <Pressable
                  onPress={() => setSlotFilter(slot)}
                  style={{
                    backgroundColor: active ? theme.primary : "transparent",
                    borderColor: active ? theme.primary : theme.border,
                    borderWidth: 1,
                    marginRight: 6,
                  }}
                  className="rounded-lg px-2.5 py-1"
                >
                  <Text
                    style={{ color: active ? theme.primaryForeground : theme.mutedForeground }}
                    className="text-xs font-medium"
                  >{slot}</Text>
                </Pressable>
              );
            }}
          />
        </View>

        <View className="px-4 py-1.5 border-b border-border">
          <Text className="text-muted-foreground text-xs">{filtered.length} items</Text>
        </View>

        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.name}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={10}
          getItemLayout={(_, index) => ({ length: 56, offset: 56 * index, index })}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        />
      </View>
    </>
  );
}
