import { Text } from "@/components/ui/text";
import { RichText } from "@/components/rich-text";
import { useThemeColors } from "@/lib/theme";
import { getBossHydration } from "@/lib/game-data";
import type { SourcedBullet } from "@/lib/game-data";
import { getBossSprite } from "@/lib/sprites";
import { useLocalSearchParams, Stack } from "expo-router";
import { Image, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect } from "react";
import { onEntryOpened } from "@/lib/services/rate-app";

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

function SourcedBulletList({ items, theme }: { items: SourcedBullet[]; theme: ReturnType<typeof useThemeColors> }) {
  if (items.length === 0) return null;
  return (
    <View
      style={{ backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }}
      className="rounded-xl py-1"
    >
      {items.map((item, i) => (
        <View
          key={i}
          style={i < items.length - 1 ? { borderBottomWidth: 1, borderBottomColor: theme.border } : undefined}
          className="px-4 py-3"
        >
          <RichText className="text-sm leading-5">{item.text}</RichText>
        </View>
      ))}
    </View>
  );
}

export default function BossGuideScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();

  const decodedName = decodeURIComponent(name ?? "");
  const hydration = getBossHydration(decodedName);
  const sprite = getBossSprite(decodedName);

  useEffect(() => {
    if (hydration && decodedName) void onEntryOpened(`guide:${decodedName}`);
  }, [hydration, decodedName]);

  if (!hydration) {
    return (
      <>
        <Stack.Screen options={{ title: "Not Found" }} />
        <View className="flex-1 items-center justify-center">
          <Text>No community guide available</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `${decodedName} Guide` }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        <View className="px-5 pt-2">
          {sprite && (
            <View className="items-center pt-2 pb-1">
              <Image source={sprite} style={{ width: 96, height: 96 }} resizeMode="contain" />
            </View>
          )}

          {hydration.commonStrategies.length > 0 && (
            <Section title="Common Strategies">
              <SourcedBulletList items={hydration.commonStrategies} theme={theme} />
            </Section>
          )}

          {hydration.counters.length > 0 && (
            <Section title="Best Counters">
              <SourcedBulletList items={hydration.counters} theme={theme} />
            </Section>
          )}

          {hydration.keyStatuses.length > 0 && (
            <Section title="Key Status Interactions">
              <SourcedBulletList items={hydration.keyStatuses} theme={theme} />
            </Section>
          )}

          {hydration.notableInteractions.length > 0 && (
            <Section title="Notable Interactions">
              <SourcedBulletList items={hydration.notableInteractions} theme={theme} />
            </Section>
          )}

          {hydration.partyComps.length > 0 && (
            <Section title="Recommended Comps">
              <SourcedBulletList items={hydration.partyComps} theme={theme} />
            </Section>
          )}

          {hydration.communityTips.length > 0 && (
            <Section title="Community Tips">
              <SourcedBulletList items={hydration.communityTips} theme={theme} />
            </Section>
          )}
        </View>
      </ScrollView>
    </>
  );
}
