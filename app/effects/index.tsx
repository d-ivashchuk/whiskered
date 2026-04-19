import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { useThemeColors } from "@/lib/theme";
import { statusEffects, type StatusEffect } from "@/lib/game-data";
import { useRouter, Stack } from "expo-router";
import { getStatusEffectSprite } from "@/lib/sprites";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Image, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, X, ChevronRight } from "lucide-react-native";

function EffectRow({ effect, onPress }: { effect: StatusEffect; onPress: () => void }) {
  const theme = useThemeColors();
  const sprite = getStatusEffectSprite(effect.name);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.secondary : "transparent",
      })}
      className="flex-row items-center px-4 py-3 border-b border-border"
    >
      <View className="w-8 h-8 mr-3 items-center justify-center">
        {sprite ? (
          <Image source={sprite} style={{ width: 28, height: 28 }} resizeMode="contain" />
        ) : (
          <View
            style={{ backgroundColor: theme.secondary }}
            className="w-7 h-7 rounded items-center justify-center"
          >
            <Text className="text-muted-foreground text-xs">?</Text>
          </View>
        )}
      </View>
      <View className="flex-1 mr-2">
        <Text className="font-semibold text-sm">{effect.name}</Text>
        <Text className="text-muted-foreground text-xs mt-0.5">
          {effect.itemCount} item{effect.itemCount !== 1 ? "s" : ""}
          {" · "}
          {effect.setCount} set{effect.setCount !== 1 ? "s" : ""}
        </Text>
      </View>
      <ChevronRight size={16} color={theme.mutedForeground} />
    </Pressable>
  );
}

export default function EffectsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useThemeColors();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return statusEffects;
    const q = search.toLowerCase().trim();
    return statusEffects.filter((e) => e.name.toLowerCase().includes(q));
  }, [search]);

  const renderItem = useCallback(
    ({ item }: { item: StatusEffect }) => (
      <EffectRow
        effect={item}
        onPress={() => router.push(`/effects/${encodeURIComponent(item.name)}`)}
      />
    ),
    [router]
  );

  return (
    <>
      <Stack.Screen options={{ title: "Status Effects" }} />
      <View style={{ flex: 1 }}>
        <View className="px-4 pt-2 pb-2">
          <Text className="text-xs text-muted-foreground mb-3">Browse all status effects</Text>

          <View className="flex-row items-center">
            <Search
              size={16}
              color={theme.mutedForeground}
              style={{ position: "absolute", left: 10, zIndex: 1 }}
            />
            <Input
              value={search}
              onChangeText={setSearch}
              placeholder="Search effects..."
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

        <View className="px-4 py-1.5 border-b border-border">
          <Text className="text-muted-foreground text-xs">{filtered.length} effects</Text>
        </View>

        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.name}
          initialNumToRender={20}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        />
      </View>
    </>
  );
}
