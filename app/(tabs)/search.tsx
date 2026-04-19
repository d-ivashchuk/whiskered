import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { useThemeColors } from "@/lib/theme";
import {
  items,
  classes,
  sets,
  abilities,
  getItem,
  type GameItem,
  type GameClass,
  type GameSet,
  type GameAbility,
} from "@/lib/game-data";
import { getTierColor } from "@/lib/game-colors";
import { getItemSprite, getClassSprite, getAbilitySprite } from "@/lib/sprites";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  SectionList,
  Image,
  Pressable,
  View,
  type ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, X } from "lucide-react-native";
import type { TextInput } from "react-native";

const MAX_PER_SECTION = 8;

type EntityType = "item" | "class" | "ability" | "set";

interface SearchResult {
  type: EntityType;
  name: string;
  subtitle: string;
  tier: string;
  sprite: ImageSourcePropType | null;
  /** For sets: up to 4 item sprites to show as a grid preview */
  setSprites?: (ImageSourcePropType | null)[];
  route: string;
}

interface SearchSection {
  title: string;
  data: SearchResult[];
  total: number;
}

function buildResults(query: string): SearchSection[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();

  const matchedItems = items.filter((i) => i.name.toLowerCase().includes(q));
  const matchedClasses = classes.filter((c) =>
    c.name.toLowerCase().includes(q)
  );
  const matchedAbilities = abilities.filter((a) =>
    a.name.toLowerCase().includes(q)
  );
  const matchedSets = sets.filter((s) => s.name.toLowerCase().includes(q));

  const sections: SearchSection[] = [];

  if (matchedItems.length > 0) {
    sections.push({
      title: "Items",
      total: matchedItems.length,
      data: matchedItems.slice(0, MAX_PER_SECTION).map((i) => ({
        type: "item",
        name: i.name,
        subtitle: [i.slot, i.rarity].filter(Boolean).join(" · "),
        tier: i.tier,
        sprite: getItemSprite(i.name, i.internalName),
        route: `/items/${encodeURIComponent(i.name)}`,
      })),
    });
  }

  if (matchedClasses.length > 0) {
    sections.push({
      title: "Classes",
      total: matchedClasses.length,
      data: matchedClasses.slice(0, MAX_PER_SECTION).map((c) => ({
        type: "class",
        name: c.name,
        subtitle: `${c.abilityCount} abilities`,
        tier: "",
        sprite: getClassSprite(c.name),
        route: `/classes/${encodeURIComponent(c.name)}`,
      })),
    });
  }

  if (matchedAbilities.length > 0) {
    sections.push({
      title: "Abilities",
      total: matchedAbilities.length,
      data: matchedAbilities.slice(0, MAX_PER_SECTION).map((a) => ({
        type: "ability",
        name: a.name,
        subtitle: [a.class, a.type].filter(Boolean).join(" · "),
        tier: a.tier,
        sprite: getAbilitySprite(a.name, a.id),
        route: `/abilities/${encodeURIComponent(a.name)}`,
      })),
    });
  }

  if (matchedSets.length > 0) {
    sections.push({
      title: "Sets",
      total: matchedSets.length,
      data: matchedSets.slice(0, MAX_PER_SECTION).map((s) => ({
        type: "set",
        name: s.name,
        subtitle: `${s.items.length} items`,
        tier: s.avgTier,
        sprite: null,
        setSprites: s.items.slice(0, 4).map((itemName) => {
          const item = getItem(itemName);
          return getItemSprite(itemName, item?.internalName);
        }),
        route: `/sets/${encodeURIComponent(s.name)}`,
      })),
    });
  }

  return sections;
}

function ResultRow({
  result,
  onPress,
}: {
  result: SearchResult;
  onPress: () => void;
}) {
  const theme = useThemeColors();
  const tierColor = result.tier ? getTierColor(result.tier) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.secondary : "transparent",
      })}
      className="flex-row items-center px-4 py-2.5 border-b border-border"
    >
      <View className="w-10 h-10 mr-3 items-center justify-center">
        {result.setSprites ? (
          <View style={{ width: 36, height: 36, flexDirection: "row", flexWrap: "wrap" }}>
            {result.setSprites.slice(0, 4).map((sp, i) =>
              sp ? (
                <Image
                  key={i}
                  source={sp}
                  style={{ width: 18, height: 18 }}
                  resizeMode="contain"
                />
              ) : (
                <View
                  key={i}
                  style={{ width: 18, height: 18, backgroundColor: theme.secondary, borderRadius: 2 }}
                />
              )
            )}
          </View>
        ) : result.sprite ? (
          <Image
            source={result.sprite}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
          />
        ) : (
          <View
            style={{ backgroundColor: theme.secondary }}
            className="w-9 h-9 rounded items-center justify-center"
          >
            <Text className="text-muted-foreground text-xs">?</Text>
          </View>
        )}
      </View>

      <View className="flex-1 mr-2">
        <Text className="font-semibold text-sm" numberOfLines={1}>
          {result.name}
        </Text>
        {result.subtitle ? (
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {result.subtitle}
          </Text>
        ) : null}
      </View>

      {tierColor ? (
        <View
          style={{ backgroundColor: tierColor.bg }}
          className="w-6 h-6 items-center justify-center rounded"
        >
          <Text
            style={{ color: tierColor.text }}
            className="text-xs font-black"
          >
            {result.tier}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useThemeColors();
  const inputRef = useRef<TextInput>(null);
  const [search, setSearch] = useState("");

  const sections = useMemo(() => buildResults(search), [search]);
  const totalResults = useMemo(
    () => sections.reduce((sum, s) => sum + s.total, 0),
    [sections]
  );

  const renderItem = useCallback(
    ({ item }: { item: SearchResult }) => (
      <ResultRow
        result={item}
        onPress={() => router.push(item.route as never)}
      />
    ),
    [router]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SearchSection }) => (
      <View
        style={{ backgroundColor: theme.background }}
        className="px-4 py-2 border-b border-border"
      >
        <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {section.title}
          {section.total > MAX_PER_SECTION
            ? `  ·  ${section.total - MAX_PER_SECTION} more`
            : ""}
        </Text>
      </View>
    ),
    [theme.background]
  );

  const hasQuery = search.trim().length > 0;

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold mb-3">Search</Text>

        <View className="flex-row items-center">
          <View className="flex-1 flex-row items-center">
            <Search
              size={16}
              color={theme.mutedForeground}
              style={{ position: "absolute", left: 10, zIndex: 1 }}
            />
            <Input
              ref={inputRef}
              value={search}
              onChangeText={setSearch}
              placeholder="Search items, classes, abilities, and sets..."
              className="flex-1 pl-9"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
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
      </View>

      {!hasQuery ? (
        <View className="flex-1 items-center justify-center px-8">
          <Search size={48} color={theme.border} />
          <Text className="text-muted-foreground text-center mt-4 text-sm">
            Search items, classes, abilities, and sets
          </Text>
        </View>
      ) : sections.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-muted-foreground text-center text-sm">
            No results for "{search}"
          </Text>
        </View>
      ) : (
        <>
          <View className="px-4 py-1.5 border-b border-border">
            <Text className="text-muted-foreground text-xs">
              {totalResults} results
            </Text>
          </View>
          <SectionList
            sections={sections}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            keyExtractor={(item) => `${item.type}-${item.name}`}
            stickySectionHeadersEnabled
            contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
            keyboardShouldPersistTaps="handled"
          />
        </>
      )}
    </View>
  );
}
