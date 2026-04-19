import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/lib/theme";
import { getAbility } from "@/lib/game-data";
import { getTierColor } from "@/lib/game-colors";
import { getAbilitySprite, getElementSprite, getClassSprite } from "@/lib/sprites";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Zap, ChevronRight } from "lucide-react-native";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-5">
      <Text className="text-xs font-medium tracking-widest uppercase text-muted-foreground mb-2">{title}</Text>
      {children}
    </View>
  );
}

export default function AbilityDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

  const ability = getAbility(decodeURIComponent(name ?? ""));

  if (!ability) {
    return (
      <>
        <Stack.Screen options={{ title: "Not Found" }} />
        <View className="flex-1 items-center justify-center"><Text>Ability not found</Text></View>
      </>
    );
  }

  const sprite = getAbilitySprite(ability.name, ability.id);
  const tierColor = getTierColor(ability.tier);
  const classSprite = ability.class ? getClassSprite(ability.class) : null;

  return (
    <>
      <Stack.Screen options={{ title: ability.name }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Hero */}
        <View className="items-center pt-6 pb-4 px-5">
          {sprite ? (
            <Image source={sprite} style={{ width: 80, height: 80, borderRadius: 12 }} resizeMode="contain" />
          ) : (
            <View style={{ backgroundColor: theme.secondary }} className="w-20 h-20 rounded-xl items-center justify-center">
              <Zap size={32} color={theme.mutedForeground} />
            </View>
          )}
          <Text className="text-xl font-bold mt-3 text-center">{ability.name}</Text>
          <View className="flex-row items-center gap-3 mt-1">
            {ability.type ? (
              <Text className="text-sm text-muted-foreground capitalize">{ability.type}</Text>
            ) : null}
            {ability.tier ? (
              <View style={{ backgroundColor: tierColor.bg }} className="rounded px-2 py-0.5">
                <Text style={{ color: tierColor.text }} className="text-xs font-black">Tier {ability.tier}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="px-5">
          {/* Description */}
          {ability.description ? (
            <View
              style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
              className="rounded-xl p-4"
            >
              <Text className="text-sm leading-5">{ability.description}</Text>
            </View>
          ) : null}

          {/* Upgrade */}
          {ability.upgradeDescription && ability.upgradeDescription !== ability.description ? (
            <Section title="When Upgraded">
              <View
                style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                className="rounded-xl p-4"
              >
                <Text className="text-sm leading-5">{ability.upgradeDescription}</Text>
              </View>
            </Section>
          ) : null}

          {/* Stats — only show mana and damage info, skip cryptic fields */}
          {(ability.mana || ability.power) ? (
            <Section title="Stats">
              {ability.mana ? (
                <View className="flex-row justify-between py-2 border-b border-border">
                  <Text className="text-muted-foreground text-sm">Mana Cost</Text>
                  <View className="flex-row items-center gap-1">
                    <Zap size={12} color="#3b82f6" />
                    <Text className="text-sm font-medium">{ability.mana}</Text>
                  </View>
                </View>
              ) : null}
              {ability.power ? (
                <View className="flex-row justify-between py-2 border-b border-border">
                  <Text className="text-muted-foreground text-sm">Damage</Text>
                  <Text className="text-sm font-medium">
                    {ability.power}{ability.powerType ? ` (${ability.powerType})` : ""}
                  </Text>
                </View>
              ) : null}
            </Section>
          ) : null}

          {/* Elements */}
          {ability.elements.length > 0 && (
            <Section title="Elements">
              <View className="flex-row flex-wrap gap-2">
                {ability.elements.map((elem) => {
                  const elemSprite = getElementSprite(elem);
                  return (
                    <View
                      key={elem}
                      style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                      className="flex-row items-center rounded-lg px-3 py-1.5 gap-2"
                    >
                      {elemSprite ? (
                        <Image source={elemSprite} style={{ width: 16, height: 16 }} resizeMode="contain" />
                      ) : null}
                      <Text className="text-sm">{elem}</Text>
                    </View>
                  );
                })}
              </View>
            </Section>
          )}

          {/* Class link */}
          {ability.class ? (
            <Section title="Class">
              <Pressable
                onPress={() => router.push(`/classes/${encodeURIComponent(ability.class)}`)}
                style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                className="flex-row items-center rounded-xl p-3"
              >
                <View className="w-8 h-8 mr-2.5 items-center justify-center">
                  {classSprite ? (
                    <Image source={classSprite} style={{ width: 28, height: 28, borderRadius: 6 }} resizeMode="contain" />
                  ) : null}
                </View>
                <Text className="flex-1 font-semibold text-sm">{ability.class}</Text>
                <ChevronRight size={16} color={theme.mutedForeground} />
              </Pressable>
            </Section>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
