import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/lib/theme";
import { getItemSprite } from "@/lib/sprites";
import { getItem } from "@/lib/game-data";
import {
  labelToDisplayName,
  formatConfidence,
  getConfidenceLevel,
} from "@/lib/classifier-utils";
import { Image, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";

type Prediction = {
  label: string;
  confidence: number;
};

export function ClassifierResultCard({
  prediction,
  top3,
}: {
  prediction: Prediction;
  top3: Prediction[];
}) {
  const theme = useThemeColors();
  const router = useRouter();

  const displayName = labelToDisplayName(prediction.label);
  const item = getItem(displayName);
  const sprite = item
    ? getItemSprite(item.name, item.internalName)
    : null;
  const level = getConfidenceLevel(prediction.confidence);

  const confidenceColor =
    level === "high"
      ? "#22c55e"
      : level === "medium"
        ? "#eab308"
        : "#ef4444";

  const handlePress = () => {
    router.push(`/items/${encodeURIComponent(displayName)}`);
  };

  return (
    <View className="gap-4">
      {/* Main result */}
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => ({
          backgroundColor: pressed ? theme.secondary : theme.card,
          borderColor: theme.border,
          borderWidth: 1,
        })}
        className="rounded-xl p-4 flex-row items-center"
      >
        <View className="mr-4">
          {sprite ? (
            <Image
              source={sprite}
              style={{ width: 56, height: 56, borderRadius: 8 }}
              resizeMode="contain"
            />
          ) : (
            <View
              style={{ backgroundColor: theme.secondary }}
              className="w-14 h-14 rounded-lg items-center justify-center"
            >
              <Text className="text-2xl text-muted-foreground">?</Text>
            </View>
          )}
        </View>

        <View className="flex-1">
          <Text className="text-lg font-bold" numberOfLines={1}>
            {displayName}
          </Text>
          {item?.rarity ? (
            <Text className="text-xs text-muted-foreground mt-0.5">
              {item.rarity} {item.slot ? `\u00B7 ${item.slot}` : ""}
            </Text>
          ) : null}
          {/* Confidence bar */}
          <View className="mt-2">
            <View
              style={{
                backgroundColor: theme.secondary,
                height: 6,
                borderRadius: 3,
              }}
            >
              <View
                style={{
                  backgroundColor: confidenceColor,
                  width: `${Math.round(Math.max(0, Math.min(1, prediction.confidence)) * 100)}%`,
                  height: 6,
                  borderRadius: 3,
                }}
              />
            </View>
            <Text
              style={{ color: confidenceColor }}
              className="text-xs font-semibold mt-1"
            >
              {formatConfidence(prediction.confidence)} confidence
            </Text>
          </View>
        </View>

        <ChevronRight size={18} color={theme.mutedForeground} />
      </Pressable>

      {/* Top-3 alternatives */}
      {top3.length > 1 && (
        <View
          style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }}
          className="rounded-xl overflow-hidden"
        >
          <Text className="text-xs font-medium tracking-widest uppercase text-muted-foreground px-4 pt-3 pb-2">
            Other matches
          </Text>
          {top3.slice(1).map((pred, idx) => {
            const altName = labelToDisplayName(pred.label);
            const altItem = getItem(altName);
            const altSprite = altItem
              ? getItemSprite(altItem.name, altItem.internalName)
              : null;

            return (
              <Pressable
                key={pred.label}
                onPress={() =>
                  router.push(`/items/${encodeURIComponent(altName)}`)
                }
                style={({ pressed }) => ({
                  backgroundColor: pressed ? theme.secondary : "transparent",
                })}
                className="flex-row items-center px-4 py-2.5 border-t border-border"
              >
                <View className="w-8 h-8 mr-3 items-center justify-center">
                  {altSprite ? (
                    <Image
                      source={altSprite}
                      style={{ width: 28, height: 28 }}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text className="text-muted-foreground">?</Text>
                  )}
                </View>
                <Text className="flex-1 text-sm" numberOfLines={1}>
                  {altName}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {formatConfidence(pred.confidence)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
