import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/lib/theme";
import { getSet, getItem } from "@/lib/game-data";
import { getTierColor } from "@/lib/game-colors";
import { getItemSprite, getClassSprite, getStatusEffectSprite } from "@/lib/sprites";
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

export default function SetDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

  const set = getSet(decodeURIComponent(name ?? ""));

  if (!set) {
    return (
      <>
        <Stack.Screen options={{ title: "Not Found" }} />
        <View className="flex-1 items-center justify-center">
          <Text>Set not found</Text>
        </View>
      </>
    );
  }

  const tierColor = getTierColor(set.avgTier);
  const TIER_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, "": 5 };

  return (
    <>
      <Stack.Screen options={{ title: `${set.name} Set` }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Hero */}
        <View className="items-center pt-6 pb-4 px-5">
          {/* Show up to 5 item sprites stacked */}
          <View className="flex-row items-center mb-3">
            {set.items.slice(0, 5).map((itemName, i) => {
              const item = getItem(itemName);
              const sprite = getItemSprite(itemName, item?.internalName);
              return sprite ? (
                <View key={itemName} style={{ marginLeft: i > 0 ? -16 : 0, zIndex: 5 - i }}>
                  <Image source={sprite} style={{ width: 48, height: 48 }} resizeMode="contain" />
                </View>
              ) : null;
            })}
          </View>
          <Text className="text-xl font-bold text-center">{set.name}</Text>
          <View className="flex-row items-center gap-3 mt-1">
            <Text className="text-sm text-muted-foreground">
              {set.items.length} item{set.items.length !== 1 ? "s" : ""}
            </Text>
            {set.avgTier ? (
              <View style={{ backgroundColor: tierColor.bg }} className="rounded px-2 py-0.5">
                <Text style={{ color: tierColor.text }} className="text-xs font-black">Avg {set.avgTier}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="px-5">
          {/* Set description / bonus */}
          {set.description ? (
            <View
              style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
              className="rounded-xl p-4"
            >
              <Text className="text-sm leading-5">{set.description}</Text>
            </View>
          ) : null}

          {/* Status Effects */}
          {set.statusEffects.length > 0 && (
            <Section title="Status Effects">
              <View className="flex-row flex-wrap gap-2">
                {set.statusEffects.map((effect) => {
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

          {/* Recommended Classes */}
          {set.recommendations.length > 0 && (
            <Section title="Recommended Classes">
              {set.recommendations.map((rec) => {
                const classSprite = getClassSprite(rec.className);
                return (
                  <Pressable
                    key={rec.className}
                    onPress={() => router.push(`/classes/${encodeURIComponent(rec.className)}`)}
                    style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                    className="flex-row items-center rounded-xl p-3 mb-2"
                  >
                    <View className="w-8 h-8 mr-3 items-center justify-center">
                      {classSprite ? (
                        <Image source={classSprite} style={{ width: 28, height: 28 }} resizeMode="contain" />
                      ) : (
                        <Text className="text-sm font-bold text-muted-foreground">{rec.className[0]}</Text>
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-semibold">{rec.className}</Text>
                      <Text className="text-muted-foreground text-xs">{rec.reason}</Text>
                    </View>
                    <ChevronRight size={16} color={theme.mutedForeground} />
                  </Pressable>
                );
              })}
            </Section>
          )}

          {/* Items in set — grouped by slot */}
          <Section title={`Items (${set.itemDetails.length})`}>
            {(() => {
              const bySlot = new Map<string, typeof set.itemDetails>();
              for (const detail of set.itemDetails) {
                const slot = detail.slot || "Other";
                if (!bySlot.has(slot)) bySlot.set(slot, []);
                bySlot.get(slot)!.push(detail);
              }
              // Sort items within each slot by tier
              for (const items of bySlot.values()) {
                items.sort((a, b) => {
                  const ta = TIER_ORDER[a.tier] ?? 5;
                  const tb = TIER_ORDER[b.tier] ?? 5;
                  if (ta !== tb) return ta - tb;
                  return a.name.localeCompare(b.name);
                });
              }
              return Array.from(bySlot.entries()).map(([slot, slotItems]) => (
                <View key={slot} className="mb-3">
                  <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 mt-2">
                    {slot}
                  </Text>
                  {slotItems.map((detail) => {
                    const item = getItem(detail.name);
                    const sprite = getItemSprite(detail.name, item?.internalName);
                    const itemTierColor = getTierColor(detail.tier);

                    return (
                      <Pressable
                        key={detail.name}
                        onPress={() => router.push(`/items/${encodeURIComponent(detail.name)}`)}
                        style={({ pressed }) => ({
                          backgroundColor: pressed ? theme.secondary : "transparent",
                        })}
                        className="flex-row items-center py-2.5 border-b border-border"
                      >
                        <View className="w-8 h-8 mr-2.5 items-center justify-center">
                          {sprite ? (
                            <Image source={sprite} style={{ width: 28, height: 28 }} resizeMode="contain" />
                          ) : null}
                        </View>

                        <View className="flex-1 mr-2">
                          <Text className="text-sm font-medium" numberOfLines={1}>{detail.name}</Text>
                          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                            {detail.rarity}
                          </Text>
                        </View>

                        <View className="flex-row items-center gap-2">
                          {detail.tier ? (
                            <View style={{ backgroundColor: itemTierColor.bg }} className="rounded px-1.5 py-0.5">
                              <Text style={{ color: itemTierColor.text }} className="text-[10px] font-black">{detail.tier}</Text>
                            </View>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ));
            })()}
          </Section>
        </View>
      </ScrollView>
    </>
  );
}
