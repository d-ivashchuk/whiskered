import { Text } from "@/components/ui/text";
import { ItemRow } from "@/components/item-row";
import { useThemeColors } from "@/lib/theme";
import { getItem, getSet, getBossesForItem, getBoss } from "@/lib/game-data";
import { getTierColor, getRarityTextColor } from "@/lib/game-colors";
import { getItemSprite, getStatusEffectSprite, getSlotSprite, getBossSprite } from "@/lib/sprites";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight } from "lucide-react-native";
import { useEffect } from "react";
import { onEntryOpened } from "@/lib/services/rate-app";

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

export default function ItemDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

  const item = getItem(decodeURIComponent(name ?? ""));

  useEffect(() => {
    if (item) void onEntryOpened(`item:${item.name}`);
  }, [item]);

  if (!item) {
    return (
      <>
        <Stack.Screen options={{ title: "Not Found" }} />
        <View className="flex-1 items-center justify-center">
          <Text>Item not found</Text>
        </View>
      </>
    );
  }

  const sprite = getItemSprite(item.name, item.internalName);
  const tierColor = getTierColor(item.tier);
  const rarityColor = getRarityTextColor(item.rarity);

  return (
    <>
      <Stack.Screen options={{ title: item.name }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Hero: sprite + tier */}
        <View className="items-center pt-6 pb-4 px-5">
          {sprite ? (
            <Image source={sprite} style={{ width: 80, height: 80, borderRadius: 12 }} resizeMode="contain" />
          ) : (
            <View
              style={{ backgroundColor: theme.secondary }}
              className="w-24 h-24 rounded-xl items-center justify-center"
            >
              <Text className="text-3xl text-muted-foreground">?</Text>
            </View>
          )}
          <Text className="text-xl font-bold mt-3 text-center">{item.name}</Text>
          <View className="flex-row items-center gap-3 mt-1">
            {item.rarity ? (
              <Text style={{ color: rarityColor }} className="text-sm font-medium">{item.rarity}</Text>
            ) : null}
            {item.slot ? (() => {
              const slotSprite = getSlotSprite(item.slot);
              return (
                <View className="flex-row items-center gap-1">
                  {slotSprite ? (
                    <Image source={slotSprite} style={{ width: 16, height: 16, opacity: 0.6 }} resizeMode="contain" />
                  ) : null}
                  <Text className="text-sm text-muted-foreground">{item.slot}</Text>
                </View>
              );
            })() : null}
            {item.tier ? (
              <View style={{ backgroundColor: tierColor.bg }} className="rounded px-2 py-0.5">
                <Text style={{ color: tierColor.text }} className="text-xs font-black">
                  Tier {item.tier}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="px-5">
          {/* Description */}
          {item.description ? (
            <View
              style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
              className="rounded-xl p-4"
            >
              <Text className="text-sm leading-5">{item.description}</Text>
            </View>
          ) : null}

          {/* Drops from boss */}
          {(() => {
            const dropBosses = getBossesForItem(item.name);
            if (dropBosses.length === 0) return null;
            return (
              <Section title="Drops From">
                {dropBosses.map((bossName) => {
                  const boss = getBoss(bossName);
                  const bossSprite = getBossSprite(bossName);
                  return (
                    <Pressable
                      key={bossName}
                      onPress={() => router.push(`/bosses/${encodeURIComponent(bossName)}`)}
                      style={({ pressed }) => ({
                        backgroundColor: pressed ? theme.secondary : "transparent",
                      })}
                      className="flex-row items-center py-2.5 border-b border-border"
                    >
                      <View className="w-10 h-10 mr-3 items-center justify-center">
                        {bossSprite ? (
                          <Image source={bossSprite} style={{ width: 36, height: 36 }} resizeMode="contain" />
                        ) : (
                          <View
                            style={{ backgroundColor: theme.secondary }}
                            className="w-9 h-9 rounded-lg items-center justify-center"
                          >
                            <Text className="text-sm font-bold text-muted-foreground">{bossName[0]}</Text>
                          </View>
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-medium">{bossName}</Text>
                        {boss?.foundIn ? (
                          <Text className="text-xs text-muted-foreground">{boss.foundIn}</Text>
                        ) : null}
                      </View>
                      <ChevronRight size={16} color={theme.mutedForeground} />
                    </Pressable>
                  );
                })}
              </Section>
            );
          })()}

          {/* Found in (categories) */}
          {item.categories.length > 0 && (
            <Section title="Found in">
              <View className="flex-row flex-wrap gap-2">
                {item.categories.map((cat) => (
                  <View
                    key={cat}
                    style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                    className="rounded-lg px-3 py-1.5"
                  >
                    <Text className="text-sm">{cat}</Text>
                  </View>
                ))}
              </View>
            </Section>
          )}

          {/* Sets */}
          {item.sets.length > 0 && (
            <Section title="Sets">
              {item.sets.map((setName) => {
                const setData = getSet(setName);
                const setTierColor = setData?.avgTier ? getTierColor(setData.avgTier) : null;
                const previewSprites = (setData?.items ?? []).slice(0, 4).map((itemName) => {
                  const it = getItem(itemName);
                  return getItemSprite(itemName, it?.internalName);
                });
                return (
                  <Pressable
                    key={setName}
                    onPress={() => router.push(`/sets/${encodeURIComponent(setName)}`)}
                    style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                    className="rounded-xl p-3 mb-2 flex-row items-center"
                  >
                    {/* 2x2 sprite grid */}
                    <View style={{ width: 40, height: 40, flexDirection: "row", flexWrap: "wrap" }} className="mr-3">
                      {previewSprites.map((sp, i) =>
                        sp ? (
                          <Image key={i} source={sp} style={{ width: 20, height: 20 }} resizeMode="contain" />
                        ) : (
                          <View key={i} style={{ width: 20, height: 20, backgroundColor: theme.border, borderRadius: 2 }} />
                        )
                      )}
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="font-semibold text-sm">{setName}</Text>
                        {setTierColor ? (
                          <View style={{ backgroundColor: setTierColor.bg }} className="rounded px-1.5 py-0.5">
                            <Text style={{ color: setTierColor.text }} className="text-[10px] font-black">{setData!.avgTier}</Text>
                          </View>
                        ) : null}
                      </View>
                      {setData?.description ? (
                        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={2}>
                          {setData.description}
                        </Text>
                      ) : null}
                      <Text className="text-muted-foreground text-xs mt-0.5">
                        {setData?.items.length ?? "?"} items in set
                      </Text>
                    </View>
                    <ChevronRight size={16} color={theme.mutedForeground} />
                  </Pressable>
                );
              })}
            </Section>
          )}

          {/* Status Effects */}
          {item.statusEffects.length > 0 && (
            <Section title="Status Effects">
              <View className="flex-row flex-wrap gap-2">
                {item.statusEffects.map((effect) => {
                  const effectSprite = getStatusEffectSprite(effect);
                  return (
                    <Pressable
                      key={effect}
                      onPress={() => router.push(`/effects/${encodeURIComponent(effect)}`)}
                      style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                      className="rounded-lg px-3 py-1.5 flex-row items-center gap-1.5"
                    >
                      {effectSprite ? (
                        <Image source={effectSprite} style={{ width: 16, height: 16 }} resizeMode="contain" />
                      ) : null}
                      <Text className="text-sm">{effect}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Section>
          )}

          {/* Related Items */}
          {item.relatedItems.length > 0 && (
            <Section title="Related Items">
              {item.relatedItems.map((relName) => {
                const rel = getItem(relName);
                return (
                  <ItemRow
                    key={relName}
                    item={{
                      name: relName,
                      internalName: rel?.internalName,
                      slot: rel?.slot,
                      rarity: rel?.rarity,
                      tier: rel?.tier,
                    }}
                    onPress={() => router.push(`/items/${encodeURIComponent(relName)}`)}
                  />
                );
              })}
            </Section>
          )}
        </View>
      </ScrollView>
    </>
  );
}
