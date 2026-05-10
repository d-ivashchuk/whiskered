import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/lib/theme";
import { items, classes, sets, abilities, statusEffects, bosses, enemies, events, disorders, dataLoaded } from "@/lib/game-data";
import { getTierColor } from "@/lib/game-colors";
import { getClassSprite, getAbilitySprite, getItemSprite, getStatusEffectSprite, getBossSprite, getEnemySprite, getEventSprite, getDisorderSprite } from "@/lib/sprites";
import { useRouter } from "expo-router";
import { Image, Pressable, ScrollView, View, type ImageSourcePropType } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight } from "lucide-react-native";

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
  sprites,
  title,
  count,
  subtitle,
  onPress,
  tierCounts,
}: {
  sprites: (ImageSourcePropType | null)[];
  title: string;
  count: number;
  subtitle: string;
  onPress: () => void;
  tierCounts?: Array<{ tier: string; count: number }>;
}) {
  const theme = useThemeColors();
  const validSprites = sprites.filter((s): s is ImageSourcePropType => s != null).slice(0, 4);

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
      {/* 2x2 sprite grid */}
      <View
        style={{ width: 40, height: 40, flexDirection: "row", flexWrap: "wrap" }}
        className="mr-3.5"
      >
        {validSprites.map((sp, i) => (
          <Image
            key={i}
            source={sp}
            style={{ width: 20, height: 20 }}
            resizeMode="contain"
          />
        ))}
      </View>
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

  // Pick a few representative sprites for each category
  const classSprites = classes.slice(0, 4).map((c) => getClassSprite(c.name));
  const abilitySprites = abilities.slice(0, 4).map((a) => getAbilitySprite(a.name, a.id));
  const itemSprites = items.filter((i) => i.hasSprite).slice(0, 4).map((i) => getItemSprite(i.name, i.internalName));
  const setSprites = sets.slice(0, 4).flatMap((s) => {
    const first = s.items[0];
    if (!first) return [];
    const item = items.find((i) => i.name === first);
    return [getItemSprite(first, item?.internalName)];
  });
  const effectSprites = statusEffects.slice(0, 4).map((e) => getStatusEffectSprite(e.name));
  const eventSpriteList = events.filter((e) => e.spritePath).slice(0, 4).map((e) => getEventSprite(e.name));
  const bossSprites = bosses.slice(0, 4).map((b) => getBossSprite(b.name));
  const enemySpriteList = enemies.slice(0, 4).map((e) => getEnemySprite(e.name));

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
            sprites={bossSprites}
            title="Bosses"
            count={bosses.length}
            subtitle="Stats, attacks, drops"
            onPress={() => router.push("/bosses")}
          />
          <NavCard
            sprites={enemySpriteList}
            title="Enemies"
            count={enemies.length}
            subtitle="Stats, behavior, danger warnings"
            onPress={() => router.push("/enemies")}
          />
          <NavCard
            sprites={eventSpriteList}
            title="Events"
            count={events.length}
            subtitle="Choices, outcomes, rewards"
            onPress={() => router.push("/events")}
          />
          <NavCard
            sprites={itemSprites}
            title="Items"
            count={items.length}
            subtitle="Weapons, armor, trinkets"
            onPress={() => router.push("/items")}
            tierCounts={itemTiers}
          />
          <NavCard
            sprites={setSprites}
            title="Sets"
            count={sets.length}
            subtitle="Item set bonuses and synergies"
            onPress={() => router.push("/sets")}
            tierCounts={setTiers}
          />
          <NavCard
            sprites={classSprites}
            title="Classes"
            count={classes.length}
            subtitle="Stats, abilities, recommended sets"
            onPress={() => router.push("/classes")}
          />
          <NavCard
            sprites={abilitySprites}
            title="Abilities"
            count={abilities.length}
            subtitle="All abilities by class"
            onPress={() => router.push("/abilities")}
            tierCounts={abilityTiers}
          />
          <NavCard
            sprites={disorders.slice(0, 4).map((d) => getDisorderSprite(d.name))}
            title="Disorders"
            count={disorders.length}
            subtitle="Diseases, conditions, curses"
            onPress={() => router.push("/disorders")}
          />
          <NavCard
            sprites={effectSprites}
            title="Effects"
            count={statusEffects.length}
            subtitle="Status effects and cross-references"
            onPress={() => router.push("/effects")}
          />
        </View>
      </ScrollView>
    </View>
  );
}
