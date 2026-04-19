import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/lib/theme";
import { items, classes, sets, abilities, dataLoaded } from "@/lib/game-data";
import { getTierColor } from "@/lib/game-colors";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sword, Shield, Layers, Zap, ChevronRight } from "lucide-react-native";

const TIERS = ["S", "A", "B", "C", "D"] as const;

function TierDot({ tier, count }: { tier: string; count: number }) {
  const c = getTierColor(tier);
  return (
    <View style={{ backgroundColor: c.bg }} className="flex-row items-center rounded px-1.5 py-0.5 gap-1">
      <Text style={{ color: c.text }} className="text-[10px] font-black">{tier}</Text>
      <Text style={{ color: c.text, opacity: 0.7 }} className="text-[10px]">{count}</Text>
    </View>
  );
}

function NavCard({
  icon,
  title,
  count,
  subtitle,
  onPress,
  tierCounts,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  subtitle: string;
  onPress: () => void;
  tierCounts?: Array<{ tier: string; count: number }>;
}) {
  const theme = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.secondary : theme.card,
        borderColor: theme.border,
        borderWidth: 1,
      })}
      className="flex-row items-center rounded-xl p-4"
    >
      <View className="mr-3.5">{icon}</View>
      <View className="flex-1">
        <View className="flex-row items-baseline gap-2">
          <Text className="text-base font-bold">{title}</Text>
          <Text className="text-muted-foreground text-xs">{count}</Text>
        </View>
        <Text className="text-muted-foreground text-xs mt-0.5">{subtitle}</Text>
        {tierCounts && (
          <View className="flex-row gap-1 mt-1.5">
            {tierCounts.map((t) => (
              <TierDot key={t.tier} tier={t.tier} count={t.count} />
            ))}
          </View>
        )}
      </View>
      <ChevronRight size={16} color={theme.mutedForeground} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (!dataLoaded) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top }} className="items-center justify-center p-8">
        <Text className="text-lg font-bold">No data found</Text>
        <Text className="text-muted-foreground mt-2 text-center">
          Run "npm run crawl" then "npm run combine" to generate game data.
        </Text>
      </View>
    );
  }

  const itemTiers = TIERS.map((t) => ({ tier: t, count: items.filter((i) => i.tier === t).length }));
  const abilityTiers = TIERS.map((t) => ({ tier: t, count: abilities.filter((a) => a.tier === t).length }));
  const setTiers = TIERS.map((t) => ({ tier: t, count: sets.filter((s) => s.avgTier === t).length }));

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-6">
          <Text className="text-xs font-medium tracking-widest uppercase text-muted-foreground">
            Mewgenics
          </Text>
          <Text className="text-3xl font-bold tracking-tight">Companion</Text>
        </View>

        <View className="gap-3">
          <NavCard
            icon={<Shield size={22} color="#3b82f6" strokeWidth={1.5} />}
            title="Classes"
            count={classes.length}
            subtitle="Stats, abilities, recommended sets"
            onPress={() => router.push("/classes")}
          />
          <NavCard
            icon={<Zap size={22} color="#eab308" strokeWidth={1.5} />}
            title="Abilities"
            count={abilities.length}
            subtitle="All abilities by class"
            onPress={() => router.push("/abilities")}
            tierCounts={abilityTiers}
          />
          <NavCard
            icon={<Sword size={22} color="#ef4444" strokeWidth={1.5} />}
            title="Items"
            count={items.length}
            subtitle="Weapons, armor, trinkets"
            onPress={() => router.push("/items")}
            tierCounts={itemTiers}
          />
          <NavCard
            icon={<Layers size={22} color="#a855f7" strokeWidth={1.5} />}
            title="Sets"
            count={sets.length}
            subtitle="Item set bonuses and synergies"
            onPress={() => router.push("/sets")}
            tierCounts={setTiers}
          />
        </View>
      </ScrollView>
    </View>
  );
}
