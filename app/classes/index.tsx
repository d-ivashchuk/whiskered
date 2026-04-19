import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/lib/theme";
import { classes } from "@/lib/game-data";
import { getClassSprite } from "@/lib/sprites";
import { useRouter, Stack } from "expo-router";
import { useCallback } from "react";
import { FlatList, Image, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight } from "lucide-react-native";
import type { GameClass } from "@/lib/game-data";

function ClassRow({ cls, onPress }: { cls: GameClass; onPress: () => void }) {
  const theme = useThemeColors();
  const sprite = getClassSprite(cls.name);

  const buffText = Object.entries(cls.buffs).map(([s, v]) => `+${v} ${s}`).join(", ");
  const debuffText = Object.entries(cls.debuffs).map(([s, v]) => `-${v} ${s}`).join(", ");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.secondary : "transparent",
      })}
      className="flex-row items-center px-4 py-3 border-b border-border"
    >
      <View className="w-12 h-12 mr-3 items-center justify-center">
        {sprite ? (
          <Image source={sprite} style={{ width: 44, height: 44 }} resizeMode="contain" />
        ) : (
          <View style={{ backgroundColor: theme.secondary }} className="w-11 h-11 rounded-full items-center justify-center">
            <Text className="text-lg font-bold text-muted-foreground">{cls.name[0]}</Text>
          </View>
        )}
      </View>

      <View className="flex-1 mr-2">
        <Text className="text-base font-bold">{cls.name}</Text>
        <Text className="text-muted-foreground text-xs" numberOfLines={1}>
          {cls.abilityCount} abilities
          {buffText ? ` · ${buffText}` : ""}
          {debuffText ? ` · ${debuffText}` : ""}
        </Text>
      </View>

      <ChevronRight size={16} color={theme.mutedForeground} />
    </Pressable>
  );
}

export default function ClassesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const sorted = [...classes].sort((a, b) => a.name.localeCompare(b.name));

  const renderItem = useCallback(
    ({ item }: { item: GameClass }) => (
      <ClassRow cls={item} onPress={() => router.push(`/classes/${encodeURIComponent(item.name)}`)} />
    ),
    [router]
  );

  return (
    <>
      <Stack.Screen options={{ title: "Classes" }} />
      <View style={{ flex: 1 }}>
        <View className="px-4 pt-2 pb-3">
          <Text className="text-muted-foreground text-sm">
            {classes.length} playable classes
          </Text>
        </View>
        <FlatList
          data={sorted}
          renderItem={renderItem}
          keyExtractor={(item) => item.name}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        />
      </View>
    </>
  );
}
