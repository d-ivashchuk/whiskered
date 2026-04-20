import { Text } from "@/components/ui/text";
import { View, StyleSheet, type LayoutChangeEvent } from "react-native";
import { useState, useCallback } from "react";

const CORNER_SIZE = 24;
const CORNER_WIDTH = 3;
const CORNER_COLOR = "#22c55e";

function Corner({
  position,
}: {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}) {
  const isTop = position.includes("top");
  const isLeft = position.includes("left");

  return (
    <View
      style={[
        styles.corner,
        {
          top: isTop ? -CORNER_WIDTH : undefined,
          bottom: !isTop ? -CORNER_WIDTH : undefined,
          left: isLeft ? -CORNER_WIDTH : undefined,
          right: !isLeft ? -CORNER_WIDTH : undefined,
          borderTopWidth: isTop ? CORNER_WIDTH : 0,
          borderBottomWidth: !isTop ? CORNER_WIDTH : 0,
          borderLeftWidth: isLeft ? CORNER_WIDTH : 0,
          borderRightWidth: !isLeft ? CORNER_WIDTH : 0,
        },
      ]}
    />
  );
}

export function ScannerViewfinder({
  squareSize,
}: {
  squareSize: number;
}) {
  return (
    <View style={styles.container} pointerEvents="none">
      {/* Viewfinder square with corners */}
      <View style={[styles.square, { width: squareSize, height: squareSize }]}>
        <Corner position="top-left" />
        <Corner position="top-right" />
        <Corner position="bottom-left" />
        <Corner position="bottom-right" />
      </View>

      <Text className="text-white/70 text-sm mt-4 text-center">
        Align the item inside the square
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  square: {
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: CORNER_COLOR,
  },
});
