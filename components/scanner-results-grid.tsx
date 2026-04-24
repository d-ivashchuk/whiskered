import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/lib/theme";
import { getItem } from "@/lib/game-data";
import { getTierColor } from "@/lib/game-colors";
import { getItemSprite, getItemSpriteByLabel } from "@/lib/sprites";
import { labelToDisplayName } from "@/lib/classifier-utils";
import {
  Image,
  Pressable,
  View,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useCallback } from "react";

type Prediction = {
  label: string;
  confidence: number;
};

const COLUMNS = 5;
const GRID_PADDING = 12;
const GAP = 6;
const MAX_ITEMS = 15; // 3 rows of 5

export function ScannerResultsGrid({
  predictions,
}: {
  predictions: Prediction[];
}) {
  const theme = useThemeColors();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const cellSize = Math.floor(
    (screenWidth - GRID_PADDING * 2 - GAP * (COLUMNS + 1)) / COLUMNS
  );

  const handleCellPress = useCallback((displayName: string) => {
    router.push(`/items/${encodeURIComponent(displayName)}`);
  }, [router]);

  if (predictions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text className="text-muted-foreground text-sm text-center">
          Point camera at an item to identify it
        </Text>
      </View>
    );
  }

  const visiblePredictions = predictions.slice(0, MAX_ITEMS);

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {visiblePredictions.map((pred) => {
          const displayName = labelToDisplayName(pred.label);
          const item = getItem(displayName);
          const sprite = item
            ? getItemSprite(item.name, item.internalName)
            : getItemSpriteByLabel(pred.label);
          const tierColor = item?.tier ? getTierColor(item.tier) : null;

          return (
            <Pressable
              key={pred.label}
              onPress={() => handleCellPress(displayName)}
              style={({ pressed }) => [
                styles.cell,
                {
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: pressed ? theme.secondary : theme.card,
                  borderColor: theme.border,
                },
              ]}
            >
              {sprite ? (
                <Image
                  source={sprite}
                  style={{ width: cellSize - 6, height: cellSize - 6 }}
                  resizeMode="contain"
                />
              ) : (
                <View
                  style={[
                    {
                      width: cellSize - 6,
                      height: cellSize - 6,
                      backgroundColor: theme.secondary,
                    },
                    styles.spritePlaceholder,
                  ]}
                >
                  <Text className="text-muted-foreground text-sm">?</Text>
                </View>
              )}
              {tierColor && (
                <View
                  style={[
                    styles.tierBadge,
                    { backgroundColor: tierColor.bg },
                  ]}
                >
                  <Text style={[styles.tierText, { color: tierColor.text }]}>
                    {item!.tier}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 8,
    gap: GAP,
  },
  cell: {
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  tierBadge: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  tierText: {
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 16,
    textAlign: "center",
    includeFontPadding: false,
  },
  spritePlaceholder: {
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});
