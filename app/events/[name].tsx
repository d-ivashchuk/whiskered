import { Text } from "@/components/ui/text";
import { RichText } from "@/components/rich-text";
import { useThemeColors } from "@/lib/theme";
import { getEvent } from "@/lib/game-data";
import type { EventChoice, EventOutcome } from "@/lib/game-data";
import { getEventSprite, getStatSprite } from "@/lib/sprites";
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

function OutcomeRow({ outcome, isLast, theme }: { outcome: EventOutcome; isLast: boolean; theme: ReturnType<typeof useThemeColors> }) {
  // Simple label: "Good" or "Bad" + "Common" or "Rare"
  const [quality, rarity] = outcome.label.split("/");
  const isGood = quality === "Good";

  return (
    <View
      style={!isLast ? { borderBottomWidth: 1, borderBottomColor: theme.border } : undefined}
      className="px-4 py-3"
    >
      {/* Tier label row */}
      <View className="flex-row items-center gap-2 mb-1.5">
        <Text
          style={{ color: isGood ? "#16a34a" : "#dc2626" }}
          className="text-xs font-bold"
        >
          {quality}
        </Text>
        <Text className="text-xs text-muted-foreground">{rarity}</Text>
      </View>

      {/* Narrative */}
      {outcome.description ? (
        <Text className="text-sm leading-5 text-muted-foreground mb-1.5">{outcome.description}</Text>
      ) : null}

      {/* Effect - the important part */}
      <RichText className="text-sm leading-5 font-medium">{outcome.effect}</RichText>
    </View>
  );
}

function ChoiceCard({ choice, index, theme }: { choice: EventChoice; index: number; theme: ReturnType<typeof useThemeColors> }) {
  const stat = choice.description;
  const statSprite = stat ? getStatSprite(stat) : null;

  return (
    <View
      style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
      className="rounded-xl mb-3 overflow-hidden"
    >
      {/* Option header */}
      <View
        style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}
        className="flex-row items-center px-4 py-3"
      >
        <Text className="text-base font-bold flex-1">{choice.text || "Auto"}</Text>
        {stat ? (
          <View className="flex-row items-center gap-1.5">
            {statSprite ? (
              <Image source={statSprite} style={{ width: 16, height: 16 }} resizeMode="contain" />
            ) : null}
            <Text className="text-xs font-bold text-muted-foreground">{stat}</Text>
          </View>
        ) : null}
      </View>

      {/* Outcomes */}
      {choice.outcomes.map((outcome, i) => (
        <OutcomeRow
          key={`${outcome.label}-${i}`}
          outcome={outcome}
          isLast={i === choice.outcomes.length - 1}
          theme={theme}
        />
      ))}
    </View>
  );
}

export default function EventDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

  const event = getEvent(decodeURIComponent(name ?? ""));

  if (!event) {
    return (
      <>
        <Stack.Screen options={{ title: "Not Found" }} />
        <View className="flex-1 items-center justify-center">
          <Text>Event not found</Text>
        </View>
      </>
    );
  }

  const sprite = getEventSprite(event.name);

  return (
    <>
      <Stack.Screen options={{ title: event.name }} />
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
          <Text className="text-2xl font-bold mt-3 text-center">{event.name}</Text>

          <View className="flex-row items-center gap-2 mt-2">
            {event.chapter ? <Pill label={event.chapter} theme={theme} /> : null}
            {event.categories[0] && event.categories[0] !== event.chapter ? (
              <Pill label={event.categories[0]} theme={theme} />
            ) : null}
          </View>
        </View>

        <View className="px-5">
          {/* Flavor text */}
          {event.flavor ? (
            <View
              style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
              className="rounded-xl p-4"
            >
              <Text className="text-sm leading-5 italic text-muted-foreground">{event.flavor}</Text>
            </View>
          ) : null}

          {/* Choices */}
          {event.choices.length > 0 ? (
            <Section title={`Options (${event.choices.length})`}>
              {event.choices.map((choice, i) => (
                <ChoiceCard key={`${choice.text}-${i}`} choice={choice} index={i} theme={theme} />
              ))}
            </Section>
          ) : (
            <Section title="Event">
              <View
                style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                className="rounded-xl p-4"
              >
                <Text className="text-sm text-muted-foreground">
                  Non-interactive event. No player choices.
                </Text>
              </View>
            </Section>
          )}

          {/* Notes */}
          {event.wikiNotes ? (
            <Section title="Notes">
              <View
                style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                className="rounded-xl p-4"
              >
                <RichText className="text-sm leading-5">{event.wikiNotes}</RichText>
              </View>
            </Section>
          ) : null}

          {/* Trivia */}
          {event.wikiTrivia ? (
            <Section title="Trivia">
              <View
                style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
                className="rounded-xl p-4"
              >
                <RichText className="text-sm leading-5">{event.wikiTrivia}</RichText>
              </View>
            </Section>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
