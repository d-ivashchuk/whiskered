import { Text } from "@/components/ui/text";
import { GridResults } from "@/components/grid-results";
import { useThemeColors } from "@/lib/theme";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState, useRef } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { X, Search } from "lucide-react-native";
import { capture } from "@/lib/services/posthog";

type CellResult = {
  row: number;
  col: number;
  topLabel: string;
  croppedUri?: string;
  results: Array<{ label: string; score: number }>;
};

type Phase = "align" | "processing" | "results";

export default function GridScannerScreen() {
  const theme = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { imageUri } = useLocalSearchParams<{ imageUri: string }>();

  const [gridSize, setGridSize] = useState(5); // NxN square grid
  const [phase, setPhase] = useState<Phase>("align");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [cellResults, setCellResults] = useState<CellResult[]>([]);
  // Set of "row-col" keys for disabled cells
  const [disabledCells, setDisabledCells] = useState<Set<string>>(new Set());

  // Image area dimensions
  const imageAreaTop = insets.top + 56;
  const controlsHeight = 140;
  const imageAreaHeight =
    screenHeight - imageAreaTop - controlsHeight - insets.bottom;
  const imageAreaWidth = screenWidth;

  // Square NxN grid with padding and gaps
  const cols = gridSize;
  const rows = gridSize;
  const GRID_PADDING = 24;
  const GRID_GAP = 3;
  const availableWidth = imageAreaWidth - GRID_PADDING * 2;
  const availableHeight = imageAreaHeight - GRID_PADDING * 2;
  const maxSide = Math.min(availableWidth, availableHeight);
  const cellSizePx = Math.floor((maxSide - GRID_GAP * (gridSize - 1)) / gridSize);
  const gridWidth = cellSizePx * gridSize + GRID_GAP * (gridSize - 1);
  const gridHeight = gridWidth; // square grid
  const gridOffsetX = (imageAreaWidth - gridWidth) / 2;
  const gridOffsetY = (imageAreaHeight - gridHeight) / 2;

  // Pinch-zoom and pan state
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Store transform at time of identification for slicing
  const transformRef = useRef({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 0.5) {
        scale.value = withSpring(0.5);
        savedScale.value = 0.5;
      }
      if (scale.value > 5) {
        scale.value = withSpring(5);
        savedScale.value = 5;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedImageStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ] as const,
    };
  });

  const handleIdentifyAll = useCallback(async () => {
    if (!imageUri) return;

    // Capture current transform
    transformRef.current = {
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    };

    const activeCells = rows * cols - disabledCells.size;
    setProgress({ current: 0, total: activeCells });
    setPhase("processing");
    setCellResults([]);
    const startTime = performance.now();

    const { matchSprite } = await import("@/modules/item-classifier");

    // Get image dimensions
    const imageInfo = await new Promise<{ width: number; height: number }>(
      (resolve) => {
        Image.getSize(imageUri, (width, height) => resolve({ width, height }));
      }
    );

    // Calculate the visible region in original image coordinates
    // The grid is centered in the image area with square cells
    const { scale: s, translateX: tx, translateY: ty } = transformRef.current;

    // Image is displayed with "contain" mode — compute base display scale
    const scaleToFitW = imageAreaWidth / imageInfo.width;
    const scaleToFitH = imageAreaHeight / imageInfo.height;
    const displayScale = Math.min(scaleToFitW, scaleToFitH);
    // Effective scale from image pixels to screen pixels
    const effectiveScale = displayScale * s;

    const imgCenterX = imageInfo.width / 2;
    const imgCenterY = imageInfo.height / 2;

    // Each cell is cellSizePx × cellSizePx on screen, with GRID_GAP between
    const cellWidth = cellSizePx;
    const cellHeight = cellSizePx;
    const gridLeftFromCenter = -gridWidth / 2;
    const gridTopFromCenter = -gridHeight / 2;

    const results: CellResult[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (disabledCells.has(`${row}-${col}`)) continue;

        const screenCellCenterX =
          gridLeftFromCenter + col * (cellWidth + GRID_GAP) + cellWidth / 2;
        const screenCellCenterY =
          gridTopFromCenter + row * (cellHeight + GRID_GAP) + cellHeight / 2;

        // Convert screen position to image pixel position
        const imgX =
          (screenCellCenterX - tx) / effectiveScale + imgCenterX;
        const imgY =
          (screenCellCenterY - ty) / effectiveScale + imgCenterY;

        const imgCellW = cellWidth / effectiveScale;
        const imgCellH = cellHeight / effectiveScale;

        // Crop bounds in image pixels
        const cropX = Math.max(0, Math.round(imgX - imgCellW / 2));
        const cropY = Math.max(0, Math.round(imgY - imgCellH / 2));
        const cropW = Math.min(
          Math.round(imgCellW),
          imageInfo.width - cropX
        );
        const cropH = Math.min(
          Math.round(imgCellH),
          imageInfo.height - cropY
        );

        if (cropW <= 0 || cropH <= 0) {
          results.push({
            row,
            col,
            topLabel: "unknown",
            results: [],
          });
          setProgress({ current: results.length, total: activeCells });
          continue;
        }

        try {
          const cropped = await manipulateAsync(
            imageUri,
            [
              { crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } },
              { resize: { width: 224, height: 224 } },
            ],
            { format: SaveFormat.JPEG, compress: 0.85 }
          );

          const matchResult = await matchSprite(cropped.uri);
          results.push({
            row,
            col,
            topLabel: matchResult.topLabel,
            croppedUri: cropped.uri,
            results: matchResult.results,
          });
        } catch {
          results.push({
            row,
            col,
            topLabel: "unknown",
            results: [],
          });
        }

        setProgress({ current: results.length, total: activeCells });
      }
    }

    setCellResults(results);
    setPhase("results");
    const identified = results.filter((r) => r.topLabel && r.topLabel !== "unknown").length;
    capture("grid_scan_completed", {
      grid_size: gridSize,
      cells_scanned: activeCells,
      cells_identified: identified,
      duration_ms: Math.round(performance.now() - startTime),
    });
  }, [imageUri, gridSize, scale, translateX, translateY, imageAreaWidth, imageAreaHeight, cellSizePx, gridWidth, gridHeight, disabledCells]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleReset = useCallback(() => {
    setPhase("align");
    setCellResults([]);
  }, []);

  if (!imageUri) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text className="text-center text-muted-foreground mt-20">
          No image selected
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={styles.titleText}>
            {phase === "align"
              ? "Align Grid"
              : phase === "processing"
                ? `Identifying ${progress.current}/${progress.total}...`
                : "Results"}
          </Text>
          {phase === "align" && (
            <Text style={styles.hintText}>
              Pinch & drag to align. Tap cells to skip.
            </Text>
          )}
          {phase === "results" && (
            <Text style={styles.hintText}>
              Tap a cell to see alternatives
            </Text>
          )}
        </View>
        <Pressable onPress={handleClose} style={styles.topBarButton}>
          <X size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Phase: Align or Processing */}
      {(phase === "align" || phase === "processing") && (
        <View
          style={[
            styles.imageArea,
            { top: imageAreaTop, height: imageAreaHeight },
          ]}
        >
          {/* Zoomable/pannable image underneath */}
          <GestureDetector gesture={composedGesture}>
            <Animated.View
              style={[styles.imageWrapper, animatedImageStyle]}
            >
              <Image
                source={{ uri: imageUri }}
                style={{
                  width: imageAreaWidth,
                  height: imageAreaHeight,
                }}
                resizeMode="contain"
              />
            </Animated.View>
          </GestureDetector>

          {/* Fixed grid overlay — square NxN with gaps, tappable cells */}
          <View
            style={[
              styles.gridOverlay,
              {
                left: gridOffsetX,
                top: gridOffsetY,
                width: gridWidth,
                height: gridHeight,
              },
            ]}
            pointerEvents="box-none"
          >
            {Array.from({ length: rows }, (_, row) =>
              Array.from({ length: cols }, (_, col) => {
                const x = col * (cellSizePx + GRID_GAP);
                const y = row * (cellSizePx + GRID_GAP);
                const key = `${row}-${col}`;
                const isDisabled = disabledCells.has(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      setDisabledCells((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      });
                    }}
                    style={[
                      styles.gridCell,
                      {
                        left: x,
                        top: y,
                        width: cellSizePx,
                        height: cellSizePx,
                      },
                      isDisabled && styles.gridCellDisabled,
                    ]}
                  >
                    {isDisabled && (
                      <X size={cellSizePx * 0.4} color="rgba(239,68,68,0.7)" />
                    )}
                  </Pressable>
                );
              })
            )}
          </View>

          {/* Processing overlay */}
          {phase === "processing" && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color="#22c55e" />
              <Text style={styles.processingText}>
                Identifying {progress.current}/{progress.total}...
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Phase: Results */}
      {phase === "results" && (
        <View
          style={[
            styles.resultsContainer,
            {
              top: imageAreaTop,
              height: screenHeight - imageAreaTop - insets.bottom - 60,
              backgroundColor: theme.background,
            },
          ]}
        >
          <GridResults cells={cellResults} cols={cols} rows={rows} />
        </View>
      )}

      {/* Bottom controls */}
      <View
        style={[
          styles.controls,
          {
            bottom: insets.bottom + 8,
            backgroundColor:
              phase === "results" ? theme.background : "rgba(0,0,0,0.85)",
          },
        ]}
      >
        {phase === "align" && (
          <>
            <View style={styles.gridSizeRow}>
              {[3, 4, 5].map((size) => (
                <Pressable
                  key={size}
                  onPress={() => {
                    setGridSize(size);
                    setDisabledCells(new Set());
                  }}
                  style={[
                    styles.gridSizeButton,
                    gridSize === size && styles.gridSizeButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.gridSizeText,
                      gridSize === size && styles.gridSizeTextActive,
                    ]}
                  >
                    {size}×{size}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={handleIdentifyAll} style={styles.identifyButton}>
              <Search size={18} color="#fff" />
              <Text style={styles.identifyText}>
                Identify {gridSize * gridSize - disabledCells.size} cells
              </Text>
            </Pressable>
          </>
        )}
        {phase === "results" && (
          <Pressable onPress={handleReset} style={styles.resetButton}>
            <Text style={styles.resetText}>Re-align & Scan Again</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 20,
  },
  titleText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  hintText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginTop: 2,
  },
  topBarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageArea: {
    position: "absolute",
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  imageWrapper: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  gridOverlay: {
    position: "absolute",
  },
  gridCell: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(34,197,94,0.7)",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  gridCellDisabled: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderColor: "rgba(239,68,68,0.5)",
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  processingText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
  },
  resultsContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  gridSizeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 12,
  },
  gridSizeButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  gridSizeButtonActive: {
    backgroundColor: "#22c55e",
  },
  gridSizeText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 15,
    fontWeight: "700",
  },
  gridSizeTextActive: {
    color: "#fff",
  },
  identifyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#22c55e",
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
    marginTop: 4,
  },
  identifyText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: "rgba(128,128,128,0.3)",
  },
  resetText: {
    color: "#888",
    fontSize: 15,
    fontWeight: "600",
  },
});
