import { Text } from "@/components/ui/text";
import { RichText } from "@/components/rich-text";
import { ItemRow } from "@/components/item-row";
import { useThemeColors } from "@/lib/theme";
import { getBoss, getBossHydration, getItem } from "@/lib/game-data";
import { getBossSprite, getStatSprite } from "@/lib/sprites";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, BookOpen } from "lucide-react-native";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-6">
      <Text className="text-xs font-medium tracking-widest uppercase text-muted-foreground mb-2">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Pill({ label, theme }: { label: string; theme: ReturnType<typeof useThemeColors> }) {
  return (
    <View
      style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
      className="rounded-lg px-2.5 py-1"
    >
      <Text className="text-xs font-medium">{label}</Text>
    </View>
  );
}

function StatValue({ stat, value }: { stat: string; value: string }) {
  if (!value) return null;
  const sprite = getStatSprite(stat);
  return (
    <View className="flex-row items-center gap-1.5">
      {sprite ? (
        <Image source={sprite} style={{ width: 16, height: 16 }} resizeMode="contain" />
      ) : (
        <Text className="text-xs text-muted-foreground">{stat}</Text>
      )}
      <Text className="text-sm font-semibold">{value}</Text>
    </View>
  );
}

/**
 * Render wiki `* bullet\n** sub` as a clean list.
 * Top-level items are plain text separated by dividers.
 * Sub-bullets are indented with a muted background to show hierarchy.
 */
function WikiBullets({ text, theme }: { text: string; theme: ReturnType<typeof useThemeColors> }) {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const parsed = lines.map((line) => {
    const match = line.match(/^(\*+)\s*/);
    const depth = match ? match[1].length : 0;
    const content = depth > 0 ? line.slice(match![0].length) : line;
    return { content, isSub: depth > 1 };
  });

  return (
    <View
      style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
      className="rounded-xl"
    >
      {parsed.map((item, i) => {
        const showSep = i > 0 && !item.isSub;
        if (item.isSub) {
          return (
            <View
              key={i}
              style={{ backgroundColor: theme.background, marginHorizontal: 12, borderRadius: 8 }}
              className="px-3.5 py-2.5 mb-3"
            >
              <RichText className="text-xs leading-5 text-muted-foreground">
                {item.content}
              </RichText>
            </View>
          );
        }
        return (
          <View
            key={i}
            style={showSep ? { borderTopWidth: 1, borderTopColor: theme.border } : undefined}
            className="px-4 py-3"
          >
            <RichText className="text-sm leading-5">{item.content}</RichText>
          </View>
        );
      })}
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract drop item names and remaining gameplay notes from wikiNotes.
 * Drop lines contain "boss drop" or "rarely drop" — we pull [[item:X]] refs from them.
 * Filter out `type:X` lines (not useful for users).
 */
function splitNotes(text: string): { dropItems: string[]; notes: string } {
  if (!text) return { dropItems: [], notes: "" };
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  const dropItems: string[] = [];
  const noteLines: string[] = [];

  for (const line of lines) {
    if (/ type:\w+/.test(line)) continue;
    const trimmed = line.replace(/^\*+\s*/, "").toLowerCase();
    if (trimmed.includes("boss drop") || trimmed.includes("rarely drop")) {
      const itemRefs = [...line.matchAll(/\[\[item:([^\]]+)\]\]/g)];
      for (const m of itemRefs) {
        const name = m[1].trim();
        if (name) dropItems.push(name);
      }
    } else {
      noteLines.push(line);
    }
  }

  return {
    dropItems: [...new Set(dropItems)],
    notes: noteLines.join("\n"),
  };
}

export default function BossDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

  const boss = getBoss(decodeURIComponent(name ?? ""));

  if (!boss) {
    return (
      <>
        <Stack.Screen options={{ title: "Not Found" }} />
        <View className="flex-1 items-center justify-center">
          <Text>Boss not found</Text>
        </View>
      </>
    );
  }

  const sprite = getBossSprite(boss.name);
  const hydration = getBossHydration(boss.name);
  const { dropItems, notes: gameplayNotes } = splitNotes(boss.wikiNotes ?? "");

  return (
    <>
      <Stack.Screen options={{ title: boss.name }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Hero */}
        <View className="items-center pt-6 pb-4 px-5">
          {sprite ? (
            <Image source={sprite} style={{ width: 96, height: 96, borderRadius: 16 }} resizeMode="contain" />
          ) : (
            <View
              style={{ backgroundColor: theme.secondary }}
              className="w-24 h-24 rounded-2xl items-center justify-center"
            >
              <Text className="text-3xl text-muted-foreground">?</Text>
            </View>
          )}
          <Text className="text-2xl font-bold mt-3 text-center">{boss.name}</Text>

          {/* Metadata pills */}
          <View className="flex-row items-center gap-2 mt-2">
            {boss.foundIn ? <Pill label={boss.foundIn} theme={theme} /> : null}
            {boss.size ? <Pill label={boss.size} theme={theme} /> : null}
          </View>

          {/* Stats row */}
          <View className="flex-row items-center gap-4 mt-3">
            <StatValue stat="HP" value={boss.stats.health} />
            <StatValue stat="SPD" value={boss.stats.movement} />
            <StatValue stat="LCK" value={boss.stats.luck} />
          </View>
        </View>

        <View className="px-5">
          {/* Community Guide link — top and prominent when available */}
          {hydration ? (
            <View className="mt-4">
              <Pressable
                onPress={() => router.push(`/bosses/guide/${encodeURIComponent(boss.name)}`)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? theme.secondary : theme.card,
                })}
                className="flex-row items-center rounded-xl p-4 border border-border"
              >
                <View
                  style={{ backgroundColor: "#16a34a20" }}
                  className="w-10 h-10 rounded-lg items-center justify-center mr-3.5"
                >
                  <BookOpen size={20} color="#16a34a" />
                </View>
                <View className="flex-1 shrink">
                  <Text style={{ color: "#16a34a" }} className="text-base font-bold">Community Guide</Text>
                  <Text className="text-xs text-muted-foreground mt-0.5">
                    Strategies, counters, and comps
                  </Text>
                </View>
                <ChevronRight size={18} color="#16a34a" className="ml-3" />
              </Pressable>
            </View>
          ) : null}

          {/* Drops */}
          {dropItems.length > 0 ? (
            <Section title="Drops">
              <View className="px-1">
                {dropItems.map((itemName) => {
                  const item = getItem(itemName);
                  const displayName = item?.name ?? itemName;
                  return (
                    <ItemRow
                      key={itemName}
                      item={{
                        name: displayName,
                        internalName: item?.internalName,
                        slot: item?.slot,
                        rarity: item?.rarity,
                        tier: item?.tier,
                      }}
                      onPress={() => router.push(`/items/${encodeURIComponent(displayName)}`)}
                    />
                  );
                })}
              </View>
            </Section>
          ) : null}

          {/* Behavior */}
          {boss.wikiBehavior ? (
            <Section title="Behavior">
              <View
                style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                className="rounded-xl p-4"
              >
                <RichText className="text-sm leading-5">{boss.wikiBehavior}</RichText>
              </View>
            </Section>
          ) : null}

          {/* Attacks */}
          {boss.attacks.length > 0 && (
            <Section title="Attacks">
              {boss.attacks.map((attack) => (
                <View
                  key={attack.name}
                  style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                  className="rounded-xl p-4 mb-2"
                >
                  <Text className="text-sm font-bold mb-1">{attack.name}</Text>
                  <RichText className="text-sm leading-5 text-muted-foreground">{attack.description}</RichText>
                </View>
              ))}
            </Section>
          )}

          {/* Strategies */}
          {boss.wikiStrategies ? (
            <Section title="Strategies">
              <WikiBullets text={boss.wikiStrategies} theme={theme} />
            </Section>
          ) : null}

          {/* Trivia */}
          {boss.wikiTrivia ? (
            <Section title="Trivia">
              <WikiBullets text={boss.wikiTrivia} theme={theme} />
            </Section>
          ) : null}

          {/* Notes */}
          {gameplayNotes.trim() ? (
            <Section title="Notes">
              <WikiBullets text={gameplayNotes} theme={theme} />
            </Section>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
