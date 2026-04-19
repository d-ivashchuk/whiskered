import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { RichText } from "@/components/rich-text";
import { useThemeColors } from "@/lib/theme";
import { getClass, getAbility, getItem, STAT_INFO } from "@/lib/game-data";
import { getTierColor } from "@/lib/game-colors";
import { getClassSprite, getAbilitySprite, getItemSprite, getStatSprite } from "@/lib/sprites";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, Zap } from "lucide-react-native";

const TIER_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, "": 5 };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-6">
      <Text className="text-xs font-medium tracking-widest uppercase text-muted-foreground mb-2">
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function ClassDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  const [abilitySearch, setAbilitySearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");

  const cls = getClass(decodeURIComponent(name ?? ""));
  if (!cls) {
    return (
      <>
        <Stack.Screen options={{ title: "Not Found" }} />
        <View className="flex-1 items-center justify-center"><Text>Class not found</Text></View>
      </>
    );
  }

  const sprite = getClassSprite(cls.name);

  const allAbilities = useMemo(() => {
    return cls.abilities
      .map((n) => getAbility(n))
      .filter((a): a is NonNullable<typeof a> => a !== undefined);
  }, [cls.abilities]);

  const abilityTypes = useMemo(() => {
    const types = new Set<string>();
    for (const a of allAbilities) {
      if (a.type) types.add(a.type);
    }
    return ["All", ...Array.from(types).sort()];
  }, [allAbilities]);

  const abilityList = useMemo(() => {
    let list = allAbilities;
    if (typeFilter !== "All") {
      list = list.filter((a) => a.type === typeFilter);
    }
    if (abilitySearch.trim()) {
      const q = abilitySearch.toLowerCase();
      list = list.filter(
        (a) => a.name.toLowerCase().includes(q) || a.type.includes(q)
      );
    }
    return list.sort((a, b) => {
      const ta = TIER_ORDER[a.tier] ?? 5;
      const tb = TIER_ORDER[b.tier] ?? 5;
      return ta !== tb ? ta - tb : a.name.localeCompare(b.name);
    });
  }, [allAbilities, abilitySearch, typeFilter]);

  const hasStats = Object.keys(cls.buffs).length > 0 || Object.keys(cls.debuffs).length > 0;

  return (
    <>
      <Stack.Screen options={{ title: cls.name }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Hero */}
        <View className="items-center pt-6 pb-4 px-5">
          {sprite ? (
            <Image source={sprite} style={{ width: 96, height: 96, borderRadius: 16 }} resizeMode="contain" />
          ) : null}
          <Text className="text-2xl font-bold mt-3">{cls.name}</Text>
          <Text className="text-muted-foreground text-sm">{cls.abilityCount} abilities</Text>
        </View>

        <View className="px-5">
          {/* Overview */}
          <Section title="Overview">
            {cls.description ? (
              <View
                style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                className="rounded-xl p-4"
              >
                <RichText className="text-sm leading-5">{cls.description}</RichText>
              </View>
            ) : null}

            {/* Stat Modifiers */}
            {hasStats && (
              <View className="mt-3">
                {Object.entries(cls.buffs).map(([stat, val]) => {
                  const statSprite = getStatSprite(stat);
                  const info = STAT_INFO[stat];
                  return (
                    <View key={stat} className="flex-row items-center py-2 border-b border-border">
                      {statSprite ? (
                        <Image source={statSprite} style={{ width: 20, height: 20 }} resizeMode="contain" />
                      ) : null}
                      <Text className="text-sm font-semibold ml-2 flex-1">
                        +{val} {info?.name ?? stat}
                      </Text>
                      {info?.description ? (
                        <Text className="text-xs text-muted-foreground flex-1 text-right" numberOfLines={1}>
                          {info.description}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
                {Object.entries(cls.debuffs).map(([stat, val]) => {
                  const statSprite = getStatSprite(stat);
                  const info = STAT_INFO[stat];
                  return (
                    <View key={stat} className="flex-row items-center py-2 border-b border-border">
                      {statSprite ? (
                        <Image source={statSprite} style={{ width: 20, height: 20 }} resizeMode="contain" />
                      ) : null}
                      <Text className="text-sm font-semibold ml-2 flex-1" style={{ color: "#ef4444" }}>
                        -{val} {info?.name ?? stat}
                      </Text>
                      {info?.description ? (
                        <Text className="text-xs text-muted-foreground flex-1 text-right" numberOfLines={1}>
                          {info.description}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </Section>

          {/* Basic Action */}
          {cls.basicAction ? (
            <Section title="Basic Action">
              <View
                style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                className="rounded-xl p-4"
              >
                <RichText className="text-sm leading-5">{cls.basicAction}</RichText>
              </View>
            </Section>
          ) : null}

          {/* Archetypes */}
          {cls.archetypes.length > 0 && (
            <Section title="Archetypes">
              {cls.archetypes.map((arch) => (
                <View
                  key={arch.name}
                  style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                  className="rounded-xl p-4 mb-2"
                >
                  <Text className="text-sm font-bold mb-1">{arch.name}</Text>
                  <RichText className="text-sm leading-5 text-muted-foreground">{arch.description}</RichText>
                </View>
              ))}
            </Section>
          )}

          {/* Unlocks — before abilities */}
          {cls.unlocks.length > 0 && (
            <Section title="Unlocks">
              {cls.unlocks.map((unlock) => {
                // Try to find as ability or item to show sprite
                const ability = getAbility(unlock.name);
                const item = getItem(unlock.name);
                const abilSprite = ability ? getAbilitySprite(ability.name, ability.id) : null;
                const itmSprite = item ? getItemSprite(item.name, item.internalName) : null;
                const unlockSprite = abilSprite ?? itmSprite;

                return (
                  <Pressable
                    key={unlock.name}
                    onPress={() => {
                      if (ability) router.push(`/abilities/${encodeURIComponent(unlock.name)}`);
                      else if (item) router.push(`/items/${encodeURIComponent(unlock.name)}`);
                    }}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? theme.secondary : "transparent",
                    })}
                    className="flex-row items-center py-2.5 border-b border-border"
                  >
                    <View className="w-8 h-8 mr-2.5 items-center justify-center">
                      {unlockSprite ? (
                        <Image source={unlockSprite} style={{ width: 28, height: 28 }} resizeMode="contain" />
                      ) : null}
                    </View>
                    <View className="flex-1 mr-2">
                      <Text className="text-sm font-medium">{unlock.name}</Text>
                      <Text className="text-xs text-muted-foreground">{unlock.requirement}</Text>
                    </View>
                    {ability ? (
                      <Text className="text-[10px] text-muted-foreground">Ability</Text>
                    ) : item ? (
                      <Text className="text-[10px] text-muted-foreground">Item</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </Section>
          )}

          {/* Abilities */}
          <Section title={`Abilities (${abilityList.length})`}>
            {/* Search */}
            <View className="flex-row items-center mb-2">
              <Search size={14} color={theme.mutedForeground} style={{ position: "absolute", left: 10, zIndex: 1 }} />
              <Input
                value={abilitySearch}
                onChangeText={setAbilitySearch}
                placeholder="Search abilities..."
                className="flex-1 pl-8 h-9"
              />
            </View>

            {/* Type filters */}
            {abilityTypes.length > 2 && (
              <FlatList
                data={abilityTypes}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item}
                className="mb-2"
                renderItem={({ item: type }) => {
                  const isActive = typeFilter === type;
                  return (
                    <Pressable
                      onPress={() => setTypeFilter(type)}
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
                        className="text-xs font-medium capitalize"
                      >{type}</Text>
                    </Pressable>
                  );
                }}
              />
            )}

            {abilityList.map((ability) => {
              const tierColor = getTierColor(ability.tier);
              const abilSprite = getAbilitySprite(ability.name, ability.id);
              return (
                <Pressable
                  key={ability.name}
                  onPress={() => router.push(`/abilities/${encodeURIComponent(ability.name)}`)}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? theme.secondary : "transparent",
                  })}
                  className="flex-row items-center py-2.5 border-b border-border"
                >
                  <View className="w-8 h-8 mr-2.5 items-center justify-center">
                    {abilSprite ? (
                      <Image source={abilSprite} style={{ width: 28, height: 28 }} resizeMode="contain" />
                    ) : null}
                  </View>

                  <View className="flex-1 mr-2">
                    <Text className="text-sm font-medium">{ability.name}</Text>
                    {ability.description ? (
                      <Text className="text-muted-foreground text-xs" numberOfLines={1}>{ability.description}</Text>
                    ) : null}
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
            })}
          </Section>

          {/* Recommended Sets — at the bottom */}
          {cls.recommendedSets.length > 0 && (
            <Section title="Recommended Sets">
              <View className="flex-row flex-wrap gap-2">
                {cls.recommendedSets.slice(0, 15).map((setName) => (
                  <Pressable
                    key={setName}
                    onPress={() => router.push(`/sets/${encodeURIComponent(setName)}`)}
                    style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                    className="rounded-lg px-3 py-1.5"
                  >
                    <Text className="text-xs font-medium">{setName}</Text>
                  </Pressable>
                ))}
                {cls.recommendedSets.length > 15 && (
                  <View className="rounded-lg px-3 py-1.5 bg-secondary">
                    <Text className="text-xs text-muted-foreground">+{cls.recommendedSets.length - 15} more</Text>
                  </View>
                )}
              </View>
            </Section>
          )}
        </View>
      </ScrollView>
    </>
  );
}
