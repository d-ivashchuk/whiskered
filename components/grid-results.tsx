import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/lib/theme";
import { getItem } from "@/lib/game-data";
import { getTierColor } from "@/lib/game-colors";
import { getItemSprite } from "@/lib/sprites";
import { labelToDisplayName } from "@/lib/classifier-utils";
import { Image, Pressable, View, StyleSheet, useWindowDimensions } from "react-native";
import { ItemMatchesModal } from "@/components/item-matches-modal";
import { useCallback, useState } from "react";

type CellResult = {
  row: number;
  col: number;
  topLabel: string;
  croppedUri?: string;
  results: Array<{ label: string; score: number }>;
};

type GridResultsProps = {
  cells: CellResult[];
  cols: number;
  rows: number;
};

const GAP = 8;
const PADDING = 8;

export function GridResults({ cells, cols, rows }: GridResultsProps) {
  const theme = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const [selectedCell, setSelectedCell] = useState<CellResult | null>(null);

  const cellSize = Math.floor(
    (screenWidth - PADDING * 2 - GAP * (cols + 1)) / cols
  );

  const handleCellPress = useCallback((cell: CellResult) => {
    setSelectedCell(cell);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.gridWrapper}>
        {Array.from({ length: rows }, (_, row) => (
          <View key={row} style={[styles.gridRow, { gap: GAP }]}>
            {Array.from({ length: cols }, (_, col) => {
              const cell = cells.find((c) => c.row === row && c.col === col);
              const displayName = cell
                ? labelToDisplayName(cell.topLabel)
                : null;
              const item = displayName ? getItem(displayName) : null;
              const sprite = item
                ? getItemSprite(item.name, item.internalName)
                : null;
              const tierColor = item?.tier ? getTierColor(item.tier) : null;

              return (
                <Pressable
                  key={`${row}-${col}`}
                  onPress={() => cell && handleCellPress(cell)}
                  style={({ pressed }) => [
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: pressed
                        ? theme.secondary
                        : cell
                          ? theme.card
                          : theme.secondary,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {sprite ? (
                    <Image
                      source={sprite}
                      style={{ width: cellSize - 8, height: cellSize - 8 }}
                      resizeMode="contain"
                    />
                  ) : cell ? (
                    <Text
                      className="text-muted-foreground"
                      style={{ fontSize: 8 }}
                      numberOfLines={1}
                    >
                      {displayName}
                    </Text>
                  ) : (
                    <View
                      style={[
                        styles.emptyCell,
                        { backgroundColor: theme.secondary },
                      ]}
                    />
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
        ))}
      </View>

      <ItemMatchesModal
        visible={selectedCell !== null}
        matches={selectedCell?.results ?? []}
        sourceImageUri={selectedCell?.croppedUri}
        onClose={() => setSelectedCell(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gridWrapper: {
    alignItems: "center",
    paddingVertical: 12,
    gap: 8,
  },
  gridRow: {
    flexDirection: "row",
  },
  cell: {
    borderRadius: 6,
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
  emptyCell: {
    width: "100%",
    height: "100%",
    borderRadius: 4,
  },
});
