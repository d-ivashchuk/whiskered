import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { useThemeColors } from "@/lib/theme";
import { abilities, classes } from "@/lib/game-data";
import { getTierColor } from "@/lib/game-colors";
import { getAbilitySprite } from "@/lib/sprites";
import { useRouter, Stack } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Image, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, X, Zap } from "lucide-react-native";
import type { GameAbility } from "@/lib/game-data";

const TIERS = ["All", "S", "A", "B", "C", "D"] as const;
const TIER_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, "": 5 };

function AbilityRow({ ability, onPress }: { ability: GameAbility; onPress: () => void }) {
  const theme = useThemeColors();
  const tierColor = getTierColor(ability.tier);
  const sprite = getAbilitySprite(ability.name, ability.id);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.secondary : "transparent",
      })}
      className="flex-row items-center px-4 py-2.5 border-b border-border"
    >
      {/* Sprite */}
      <View className="w-8 h-8 mr-2.5 items-center justify-center">
        {sprite ? (
          <Image source={sprite} style={{ width: 28, height: 28 }} resizeMode="contain" />
        ) : (
          <View
            style={{ backgroundColor: theme.secondary }}
            className="w-7 h-7 rounded items-center justify-center"
          >
            <Zap size={14} color={theme.mutedForeground} />
          </View>
        )}
      </View>

      <View className="flex-1 mr-2">
        <Text className="font-semibold text-sm" numberOfLines={1}>{ability.name}</Text>
        <Text className="text-muted-foreground text-xs" numberOfLines={1}>
          {[ability.class, ability.type].filter(Boolean).join(" · ")}
          {ability.description ? ` — ${ability.description}` : ""}
        </Text>
      </View>

      <View className="flex-row items-center gap-2">
        {ability.mana ? (
          <View className="flex-row items-center gap-0.5">
            <Zap size={10} color="#3b82f6" />
            <Text className="text-[10px] text-muted-foreground">{ability.mana}</Text>
          </View>
        ) : null}
        {ability.tier ? (
          <View style={{ backgroundColor: tierColor.bg }} className="rounded px-1.5 py-0.5">
            <Text style={{ color: tierColor.text }} className="text-[10px] font-black">{ability.tier}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function AbilitiesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useThemeColors();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("All");
  const [classFilter, setClassFilter] = useState<string>("All");

  const classNames = useMemo(
    () => ["All", ...classes.map((c) => c.name).sort()],
    []
  );

  const filtered = useMemo(() => {
    let result = [...abilities];
    if (tierFilter !== "All") {
      result = result.filter((a) => a.tier === tierFilter);
    }
    if (classFilter !== "All") {
      result = result.filter((a) => a.class === classFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.class.toLowerCase().includes(q) ||
          a.type.includes(q) ||
          a.elements.some((e) => e.toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => {
      const ta = TIER_ORDER[a.tier] ?? 5;
      const tb = TIER_ORDER[b.tier] ?? 5;
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name);
    });
  }, [search, tierFilter, classFilter]);

  const renderItem = useCallback(
    ({ item }: { item: GameAbility }) => (
      <AbilityRow
        ability={item}
        onPress={() => router.push(`/abilities/${encodeURIComponent(item.name)}`)}
      />
    ),
    [router]
  );

  return (
    <>
      <Stack.Screen options={{ title: "Abilities" }} />
      <View style={{ flex: 1 }}>
        <View className="px-4 pb-2 pt-2">
          {/* Search */}
          <View className="flex-row items-center mb-3">
            <Search
              size={16}
              color={theme.mutedForeground}
              style={{ position: "absolute", left: 10, zIndex: 1 }}
            />
            <Input
              value={search}
              onChangeText={setSearch}
              placeholder="Search abilities, classes, elements..."
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

          {/* Tier filter */}
          <View className="flex-row gap-1.5 mb-2">
            {TIERS.map((tier) => {
              const isActive = tierFilter === tier;
              const tc = tier === "All" ? null : getTierColor(tier);
              return (
                <Pressable
                  key={tier}
                  onPress={() => setTierFilter(tier)}
                  style={{
                    backgroundColor: isActive ? (tc?.bg ?? theme.primary) : "transparent",
                    borderColor: isActive ? (tc?.bg ?? theme.primary) : theme.border,
                    borderWidth: 1,
                  }}
                  className="rounded-lg px-3 py-1.5"
                >
                  <Text
                    style={{ color: isActive ? (tc?.text ?? theme.primaryForeground) : theme.mutedForeground }}
                    className="text-xs font-bold"
                  >{tier}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Class filter - horizontal scroll */}
          <FlatList
            data={classNames}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item}
            renderItem={({ item: className }) => {
              const isActive = classFilter === className;
              return (
                <Pressable
                  onPress={() => setClassFilter(className)}
                  style={{
                    backgroundColor: isActive ? theme.primary : "transparent",
                    borderColor: isActive ? theme.primary : theme.border,
                    borderWidth: 1,
                    marginRight: 6,
                  }}
                  className="rounded-lg px-2.5 py-1"
                >
                  <Text
                    style={{ color: isActive ? theme.primaryForeground : theme.mutedForeground }}
                    className="text-xs font-medium"
                  >{className}</Text>
                </Pressable>
              );
            }}
          />
        </View>

        <View className="px-4 py-1.5 border-b border-border">
          <Text className="text-muted-foreground text-xs">
            {filtered.length} abilit{filtered.length !== 1 ? "ies" : "y"}
          </Text>
        </View>

        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.name}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={10}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        />
      </View>
    </>
  );
}
