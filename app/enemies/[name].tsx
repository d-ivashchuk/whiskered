import { Text } from "@/components/ui/text";
import { RichText } from "@/components/rich-text";
import { useThemeColors } from "@/lib/theme";
import { getEnemy } from "@/lib/game-data";
import { getEnemySprite, getStatSprite } from "@/lib/sprites";
import { useLocalSearchParams, Stack } from "expo-router";
import { Image, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle } from "lucide-react-native";

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
 * Render wiki text that may contain a mix of plain paragraphs and `*` bullet lists.
 * Splits into blocks: consecutive bullet lines become a WikiBullets card,
 * consecutive non-bullet lines become a RichText paragraph card.
 */
function WikiSection({ text, theme }: { text: string; theme: ReturnType<typeof useThemeColors> }) {
  const lines = text.split("\n");
  const blocks: Array<{ type: "bullets" | "prose"; content: string }> = [];
  let current: { type: "bullets" | "prose"; lines: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isBullet = trimmed.startsWith("*");
    const type = isBullet ? "bullets" : "prose";

    if (!current || current.type !== type) {
      if (current) blocks.push({ type: current.type, content: current.lines.join("\n") });
      current = { type, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current) blocks.push({ type: current.type, content: current.lines.join("\n") });

  return (
    <View className="gap-2">
      {blocks.map((block, i) =>
        block.type === "bullets" ? (
          <WikiBullets key={i} text={block.content} theme={theme} />
        ) : (
          <View
            key={i}
            style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
            className="rounded-xl p-4"
          >
            <RichText className="text-sm leading-5">{block.content}</RichText>
          </View>
        ),
      )}
    </View>
  );
}

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

export default function EnemyDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

  const enemy = getEnemy(decodeURIComponent(name ?? ""));

  if (!enemy) {
    return (
      <>
        <Stack.Screen options={{ title: "Not Found" }} />
        <View className="flex-1 items-center justify-center">
          <Text>Enemy not found</Text>
        </View>
      </>
    );
  }

  const sprite = getEnemySprite(enemy.name);
  const hasChampion =
    enemy.championStats &&
    (enemy.championStats.health ||
      enemy.championStats.damage ||
      enemy.championStats.movement ||
      enemy.championStats.luck);

  return (
    <>
      <Stack.Screen options={{ title: enemy.name }} />
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
          <Text className="text-2xl font-bold mt-3 text-center">{enemy.name}</Text>

          {/* Location pills */}
          {enemy.locations.length > 0 && (
            <View className="flex-row items-center gap-2 mt-2 flex-wrap justify-center">
              {enemy.locations.map((loc) => (
                <Pill key={loc} label={loc} theme={theme} />
              ))}
              {enemy.size ? <Pill label={enemy.size} theme={theme} /> : null}
            </View>
          )}

          {/* Stats row */}
          <View className="flex-row items-center gap-4 mt-3">
            <StatValue stat="HP" value={enemy.stats.health} />
            <StatValue stat="DMG" value={enemy.stats.damage} />
            <StatValue stat="SPD" value={enemy.stats.movement} />
            <StatValue stat="LCK" value={enemy.stats.luck} />
          </View>
        </View>

        <View className="px-5">
          {/* Danger warning */}
          {enemy.dangerFlag ? (
            <View
              style={{ backgroundColor: "#dc262615", borderColor: "#dc262640", borderWidth: 1 }}
              className="rounded-xl p-4 mt-2 flex-row items-start gap-3"
            >
              <AlertTriangle size={20} color="#dc2626" style={{ marginTop: 1 }} />
              <View className="flex-1">
                <Text style={{ color: "#dc2626" }} className="text-sm font-bold mb-1">Danger</Text>
                <Text className="text-sm leading-5">{enemy.dangerFlag}</Text>
              </View>
            </View>
          ) : null}

          {/* Description */}
          {enemy.description ? (
            <Section title="Description">
              <View
                style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                className="rounded-xl p-4"
              >
                <Text className="text-sm leading-5">{enemy.description}</Text>
              </View>
            </Section>
          ) : null}

          {/* Champion stats */}
          {hasChampion ? (
            <Section title="Champion Variant">
              <View
                style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                className="rounded-xl p-4"
              >
                <View className="flex-row items-center gap-4">
                  <StatValue stat="HP" value={enemy.championStats!.health} />
                  <StatValue stat="DMG" value={enemy.championStats!.damage} />
                  <StatValue stat="SPD" value={enemy.championStats!.movement} />
                  <StatValue stat="LCK" value={enemy.championStats!.luck} />
                </View>
              </View>
            </Section>
          ) : null}

          {/* Behavior */}
          {enemy.wikiBehavior ? (
            <Section title="Behavior">
              <WikiSection text={enemy.wikiBehavior} theme={theme} />
            </Section>
          ) : null}

          {/* Tips */}
          {enemy.wikiTips ? (
            <Section title="Tips">
              <WikiSection text={enemy.wikiTips} theme={theme} />
            </Section>
          ) : null}

          {/* Trivia */}
          {enemy.wikiTrivia ? (
            <Section title="Trivia">
              <WikiSection text={enemy.wikiTrivia} theme={theme} />
            </Section>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
