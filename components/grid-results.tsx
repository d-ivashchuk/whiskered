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
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react-native";

type CellResult = {
  row: number;
  col: number;
  topLabel: string;
  results: Array<{ label: string; score: number }>;
};

type GridResultsProps = {
  cells: CellResult[];
  cols: number;
  rows: number;
};

export function GridResults({ cells, cols, rows }: GridResultsProps) {
  const theme = useThemeColors();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [selectedCell, setSelectedCell] = useState<CellResult | null>(null);

  const GAP = 3;
  const PADDING = 12;
  const cellSize = Math.floor(
    (screenWidth - PADDING * 2 - GAP * (cols - 1)) / cols
  );

  const snapPoints = useMemo(() => ["45%", "75%"], []);

  const handleCellPress = useCallback(
    (cell: CellResult) => {
      setSelectedCell(cell);
      bottomSheetRef.current?.expand();
    },
    []
  );

  const handleSheetClose = useCallback(() => {
    setSelectedCell(null);
  }, []);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.grid,
          { paddingHorizontal: PADDING, gap: GAP },
        ]}
      >
        {Array.from({ length: rows }, (_, row) =>
          Array.from({ length: cols }, (_, col) => {
            const cell = cells.find((c) => c.row === row && c.col === col);
            const displayName = cell
              ? labelToDisplayName(cell.topLabel)
              : null;
            const item = displayName ? getItem(displayName) : null;
            const sprite = item
              ? getItemSprite(item.name, item.internalName)
              : null;

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
              </Pressable>
            );
          })
        )}
      </View>

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={handleSheetClose}
        backgroundStyle={{ backgroundColor: theme.card }}
        handleIndicatorStyle={{ backgroundColor: theme.secondaryForeground }}
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.sheetContent}
        >
          {selectedCell && (
            <>
              <Text className="text-base font-semibold mb-3">
                Top matches
              </Text>
              {selectedCell.results.map((r, i) => {
                const name = labelToDisplayName(r.label);
                const matchItem = getItem(name);
                const matchSprite = matchItem
                  ? getItemSprite(matchItem.name, matchItem.internalName)
                  : null;

                return (
                  <Pressable
                    key={r.label}
                    style={styles.alternativeRow}
                    onPress={() =>
                      router.push(`/items/${encodeURIComponent(name)}`)
                    }
                  >
                    <Text style={styles.rankText}>#{i + 1}</Text>
                    {matchSprite ? (
                      <Image
                        source={matchSprite}
                        style={styles.alternativeSprite}
                        resizeMode="contain"
                      />
                    ) : (
                      <View
                        style={[
                          styles.alternativeSprite,
                          {
                            backgroundColor: theme.secondary,
                            borderRadius: 4,
                          },
                        ]}
                      />
                    )}
                    <View style={styles.alternativeInfo}>
                      <Text className="text-sm font-medium">{name}</Text>
                      <Text className="text-xs text-muted-foreground">
                        {(r.score * 100).toFixed(1)}%
                      </Text>
                    </View>
                    <ChevronRight size={16} color={theme.mutedForeground} />
                  </Pressable>
                );
              })}
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingVertical: 12,
  },
  cell: {
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  emptyCell: {
    width: "100%",
    height: "100%",
    borderRadius: 4,
  },
  sheetContent: {
    padding: 20,
  },
  alternativeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  rankText: {
    fontSize: 12,
    fontWeight: "600",
    width: 24,
    color: "#888",
  },
  alternativeSprite: {
    width: 36,
    height: 36,
  },
  alternativeInfo: {
    flex: 1,
  },
});
