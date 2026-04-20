import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/lib/theme";
import { getItem } from "@/lib/game-data";
import { getItemSprite } from "@/lib/sprites";
import { labelToDisplayName } from "@/lib/classifier-utils";
import {
  Image,
  Pressable,
  View,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";

type Prediction = {
  label: string;
  confidence: number;
};

const COLUMNS = 8;
const GRID_PADDING = 8;
const GAP = 4;

export function ScannerResultsGrid({
  predictions,
}: {
  predictions: Prediction[];
}) {
  const theme = useThemeColors();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const cellSize = Math.floor(
    (screenWidth - GRID_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS
  );

  if (predictions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text className="text-muted-foreground text-sm text-center">
          Point camera at an item to identify it
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.grid,
        { paddingHorizontal: GRID_PADDING, gap: GAP },
      ]}
    >
      {predictions.map((pred) => {
        const displayName = labelToDisplayName(pred.label);
        const item = getItem(displayName);
        const sprite = item
          ? getItemSprite(item.name, item.internalName)
          : null;

        return (
          <Pressable
            key={pred.label}
            onPress={() =>
              router.push(`/items/${encodeURIComponent(displayName)}`)
            }
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
                style={{ width: cellSize - 12, height: cellSize - 12 }}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  {
                    width: cellSize - 12,
                    height: cellSize - 12,
                    backgroundColor: theme.secondary,
                  },
                  styles.spritePlaceholder,
                ]}
              >
                <Text className="text-muted-foreground text-sm">?</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingBottom: 8,
  },
  cell: {
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  spritePlaceholder: {
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});
