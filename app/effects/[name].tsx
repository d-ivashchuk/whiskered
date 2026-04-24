import { Text } from "@/components/ui/text";
import { ItemRow } from "@/components/item-row";
import { useThemeColors } from "@/lib/theme";
import {
  getStatusEffect,
  getItemsByStatusEffect,
  getSetsByStatusEffect,
  getItem,
} from "@/lib/game-data";
import { getTierColor } from "@/lib/game-colors";
import { getItemSprite, getStatusEffectSprite } from "@/lib/sprites";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight } from "lucide-react-native";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-5">
      <Text className="text-xs font-medium tracking-widest uppercase text-muted-foreground mb-2">
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function EffectDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

  const decodedName = decodeURIComponent(name ?? "");
  const effect = getStatusEffect(decodedName);

  if (!effect) {
    return (
      <>
        <Stack.Screen options={{ title: "Not Found" }} />
        <View className="flex-1 items-center justify-center">
          <Text>Effect not found</Text>
        </View>
      </>
    );
  }

  const effectItems = getItemsByStatusEffect(decodedName);
  const effectSets = getSetsByStatusEffect(decodedName);
  const sprite = getStatusEffectSprite(decodedName);

  return (
    <>
      <Stack.Screen options={{ title: effect.name }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Hero */}
        <View className="items-center pt-6 pb-4 px-5">
          {sprite ? (
            <Image source={sprite} style={{ width: 64, height: 64, borderRadius: 12 }} resizeMode="contain" />
          ) : (
            <View
              style={{ backgroundColor: theme.secondary }}
              className="w-16 h-16 rounded-2xl items-center justify-center"
            >
              <Text className="text-2xl">?</Text>
            </View>
          )}
          <Text className="text-xl font-bold text-center mt-3">{effect.name}</Text>
          <Text className="text-sm text-muted-foreground mt-1">
            {effect.itemCount} item{effect.itemCount !== 1 ? "s" : ""}
            {" · "}
            {effect.setCount} set{effect.setCount !== 1 ? "s" : ""}
          </Text>
        </View>

        <View className="px-5">
          {/* Description */}
          {effect.description ? (
            <View
              style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
              className="rounded-xl p-4"
            >
              <Text className="text-sm leading-5">{effect.description}</Text>
            </View>
          ) : null}
          {/* Items */}
          {effectItems.length > 0 && (
            <Section title={`Items (${effectItems.length})`}>
              {effectItems.map((item) => (
                <ItemRow
                  key={item.name}
                  item={{
                    name: item.name,
                    internalName: item.internalName,
                    slot: item.slot,
                    rarity: item.rarity,
                    tier: item.tier,
                  }}
                  onPress={() => router.push(`/items/${encodeURIComponent(item.name)}`)}
                />
              ))}
            </Section>
          )}

          {/* Sets */}
          {effectSets.length > 0 && (
            <Section title={`Sets (${effectSets.length})`}>
              {effectSets.map((set) => {
                const tierColor = getTierColor(set.avgTier);

                return (
                  <Pressable
                    key={set.name}
                    onPress={() => router.push(`/sets/${encodeURIComponent(set.name)}`)}
                    style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                    className="rounded-xl p-3 mb-2 flex-row items-center"
                  >
                    {/* 2x2 sprite grid */}
                    <View className="mr-3" style={{ width: 40, height: 40, flexDirection: "row", flexWrap: "wrap" }}>
                      {set.items.slice(0, 4).map((itemName) => {
                        const item = getItem(itemName);
                        const sprite = getItemSprite(itemName, item?.internalName);
                        return sprite ? (
                          <Image
                            key={itemName}
                            source={sprite}
                            style={{ width: 20, height: 20 }}
                            resizeMode="contain"
                          />
                        ) : (
                          <View
                            key={itemName}
                            style={{ width: 20, height: 20, backgroundColor: theme.border, borderRadius: 2 }}
                          />
                        );
                      })}
                    </View>

                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="font-semibold text-sm">{set.name}</Text>
                        {set.avgTier ? (
                          <View style={{ backgroundColor: tierColor.bg }} className="rounded px-1.5 py-0.5">
                            <Text style={{ color: tierColor.text }} className="text-[10px] font-black">{set.avgTier}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text className="text-muted-foreground text-xs mt-0.5">
                        {set.items.length} item{set.items.length !== 1 ? "s" : ""}
                      </Text>
                    </View>

                    <ChevronRight size={16} color={theme.mutedForeground} />
                  </Pressable>
                );
              })}
            </Section>
          )}
        </View>
      </ScrollView>
    </>
  );
}
