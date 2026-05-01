import { Text } from "@/components/ui/text";
import { RichText } from "@/components/rich-text";
import { useThemeColors } from "@/lib/theme";
import { getDisorder } from "@/lib/game-data";
import { getDisorderSprite } from "@/lib/sprites";
import { useLocalSearchParams, Stack } from "expo-router";
import { Image, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

/**
 * Render wiki bullet text as structured rows with sub-bullet support.
 * Top-level items are separated by dividers, sub-bullets are indented/muted.
 */
function WikiBullets({ text, theme }: { text: string; theme: ReturnType<typeof useThemeColors> }) {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const parsed: Array<{ kind: "heading" | "bullet" | "sub" | "text"; content: string }> = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    // == or === Subsection Heading ==
    const headingMatch = line.match(/^={2,}\s*(.+?)\s*={2,}$/);
    if (headingMatch) {
      // Skip headings with no content after them (next non-empty line is another heading or end)
      let hasContent = false;
      for (let j = li + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next) continue;
        if (/^={2,}\s*.+?\s*={2,}$/.test(next)) break;
        hasContent = true;
        break;
      }
      if (hasContent) {
        parsed.push({ kind: "heading", content: headingMatch[1] });
      }
      continue;
    }
    const bulletMatch = line.match(/^(\*+)\s*/);
    if (bulletMatch) {
      const depth = bulletMatch[1].length;
      const content = line.slice(bulletMatch[0].length);
      parsed.push({ kind: depth > 1 ? "sub" : "bullet", content });
    } else {
      parsed.push({ kind: "text", content: line });
    }
  }

  return (
    <View
      style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
      className="rounded-xl"
    >
      {parsed.map((item, i) => {
        if (item.kind === "heading") {
          return (
            <View
              key={i}
              style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.border } : undefined}
              className="px-4 pt-3 pb-1"
            >
              <Text className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                {item.content}
              </Text>
            </View>
          );
        }
        if (item.kind === "sub") {
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
        const showSep = i > 0 && item.kind !== "heading" && parsed[i - 1]?.kind !== "heading";
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

export default function DisorderDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

  const disorder = getDisorder(decodeURIComponent(name ?? ""));

  if (!disorder) {
    return (
      <>
        <Stack.Screen options={{ title: "Not Found" }} />
        <View className="flex-1 items-center justify-center">
          <Text>Disorder not found</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: disorder.name }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Hero */}
        <View className="items-center pt-6 pb-4 px-5">
          {(() => {
            const sprite = getDisorderSprite(disorder.name);
            return sprite ? (
              <Image source={sprite} style={{ width: 48, height: 48, marginBottom: 8 }} resizeMode="contain" />
            ) : null;
          })()}
          <Text className="text-2xl font-bold text-center">{disorder.name}</Text>

          <View className="flex-row flex-wrap items-center justify-center gap-2 mt-2">
            {disorder.pools.map((pool) => (
              <Pill key={pool} label={pool} theme={theme} />
            ))}
            {disorder.contagious ? (
              <View style={{ backgroundColor: "#dc262615", borderColor: "#dc262630", borderWidth: 1 }} className="rounded-lg px-2.5 py-1">
                <Text style={{ color: "#dc2626" }} className="text-xs font-bold">Contagious</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="px-5">
          {/* Description */}
          <View
            style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
            className="rounded-xl p-4"
          >
            <RichText className="text-sm leading-5 font-medium">{disorder.description}</RichText>
          </View>

          {/* Effects */}
          {disorder.wikiEffects ? (
            <Section title="Effects">
              <WikiBullets text={disorder.wikiEffects} theme={theme} />
            </Section>
          ) : null}

          {/* Interactions */}
          {disorder.wikiInteractions ? (
            <Section title="Interactions">
              <WikiBullets text={disorder.wikiInteractions} theme={theme} />
            </Section>
          ) : null}

          {/* Obtaining */}
          {disorder.wikiObtaining ? (
            <Section title="How to Get">
              <WikiBullets text={disorder.wikiObtaining} theme={theme} />
            </Section>
          ) : null}

          {/* Related Events */}
          {disorder.events.length > 0 ? (
            <Section title="Related Events">
              <View className="flex-row flex-wrap gap-1.5">
                {disorder.events.map((e) => (
                  <Pill key={e} label={e} theme={theme} />
                ))}
              </View>
            </Section>
          ) : null}

          {/* Status Effects */}
          {disorder.statusEffects.length > 0 ? (
            <Section title="Status Effects">
              <View className="flex-row flex-wrap gap-1.5">
                {disorder.statusEffects.map((e) => (
                  <Pill key={e} label={e} theme={theme} />
                ))}
              </View>
            </Section>
          ) : null}

          {/* Strategy */}
          {disorder.wikiStrategy ? (
            <Section title="Strategy">
              <WikiBullets text={disorder.wikiStrategy} theme={theme} />
            </Section>
          ) : null}

          {/* Notes */}
          {disorder.wikiNotes ? (
            <Section title="Notes">
              <WikiBullets text={disorder.wikiNotes} theme={theme} />
            </Section>
          ) : null}

          {/* Trivia */}
          {disorder.wikiTrivia ? (
            <Section title="Trivia">
              <WikiBullets text={disorder.wikiTrivia} theme={theme} />
            </Section>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
