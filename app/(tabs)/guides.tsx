import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/lib/theme";
import { bosses, bossHydrations, getBossHydration } from "@/lib/game-data";
import type { GameBoss } from "@/lib/game-data";
import { getBossSprite } from "@/lib/sprites";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight } from "lucide-react-native";

function GuideRow({ boss, onPress, isLast }: { boss: GameBoss; onPress: () => void; isLast: boolean }) {
  const theme = useThemeColors();
  const sprite = getBossSprite(boss.name);
  const hydration = getBossHydration(boss.name);
  const bulletCount = hydration
    ? hydration.commonStrategies.length +
      hydration.counters.length +
      hydration.keyStatuses.length +
      hydration.notableInteractions.length +
      hydration.partyComps.length +
      hydration.communityTips.length
    : 0;

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
      <View className="w-12 h-12 mr-3 items-center justify-center">
        {sprite ? (
          <Image source={sprite} style={{ width: 44, height: 44 }} resizeMode="contain" />
        ) : (
          <View style={{ backgroundColor: theme.secondary }} className="w-11 h-11 rounded-lg items-center justify-center">
            <Text className="text-lg font-bold text-muted-foreground">{boss.name[0]}</Text>
          </View>
        )}
      </View>

      <View className="flex-1 mr-2">
        <Text className="text-base font-bold">{boss.name}</Text>
        <Text className="text-muted-foreground text-xs" numberOfLines={1}>
          {boss.foundIn ? boss.foundIn : ""}
          {bulletCount > 0 ? `${boss.foundIn ? " \u00b7 " : ""}${bulletCount} tips` : ""}
        </Text>
      </View>

      <ChevronRight size={16} color={theme.mutedForeground} />
    </Pressable>
  );
}

export default function GuidesTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const guideBosses = useMemo(() => {
    const hydratedNames = new Set(bossHydrations.map((h) => h.name));
    return bosses.filter((b) => hydratedNames.has(b.name));
  }, []);

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-5 pb-3">
          <Text className="text-xs font-medium tracking-widest uppercase text-muted-foreground">
            Community
          </Text>
          <Text className="text-3xl font-bold tracking-tight">Guides</Text>
          <Text className="text-muted-foreground text-sm mt-1">
            {guideBosses.length} boss guides with strategies and tips
          </Text>
        </View>

        <View>
          {guideBosses.map((boss, i) => (
            <GuideRow
              key={boss.name}
              boss={boss}
              isLast={i === guideBosses.length - 1}
              onPress={() => router.push(`/bosses/guide/${encodeURIComponent(boss.name)}`)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
