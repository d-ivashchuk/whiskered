import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/lib/theme";
import { getItem } from "@/lib/game-data";
import { getTierColor } from "@/lib/game-colors";
import { getItemSprite } from "@/lib/sprites";
import { labelToDisplayName } from "@/lib/classifier-utils";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, X } from "lucide-react-native";

type MatchItem = {
  label: string;
  score: number;
};

type ItemMatchesModalProps = {
  visible: boolean;
  matches: MatchItem[];
  /** URI of the original cropped image that was classified */
  sourceImageUri?: string | null;
  onClose: () => void;
};

export function ItemMatchesModal({
  visible,
  matches,
  sourceImageUri,
  onClose,
}: ItemMatchesModalProps) {
  const theme = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const topMatch = matches[0];
  const topName = topMatch ? labelToDisplayName(topMatch.label) : null;
  const topItem = topName ? getItem(topName) : null;
  const topSprite = topItem
    ? getItemSprite(topItem.name, topItem.internalName)
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.card,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          {/* Handle bar */}
          <View style={styles.handleBar}>
            <View
              style={[
                styles.handle,
                { backgroundColor: theme.secondaryForeground },
              ]}
            />
          </View>

          {/* Close button */}
          <Pressable onPress={onClose} style={styles.closeButton}>
            <X size={20} color={theme.mutedForeground} />
          </Pressable>

          {/* Source image + top match comparison */}
          {sourceImageUri && topMatch && (
            <View style={styles.comparison}>
              <View style={styles.comparisonItem}>
                <Image
                  source={{ uri: sourceImageUri }}
                  style={styles.comparisonImage}
                  resizeMode="cover"
                />
                <Text style={styles.comparisonLabel}>Original</Text>
              </View>
              <Text style={styles.comparisonArrow}>→</Text>
              <View style={styles.comparisonItem}>
                {topSprite ? (
                  <Image
                    source={topSprite}
                    style={styles.comparisonImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.comparisonImage,
                      { backgroundColor: theme.secondary },
                    ]}
                  />
                )}
                <Text style={styles.comparisonLabel}>Best match</Text>
              </View>
            </View>
          )}

          {/* Top match header */}
          {topMatch && (
            <Pressable
              style={styles.header}
              onPress={() => {
                onClose();
                if (topName) {
                  router.push(`/items/${encodeURIComponent(topName)}`);
                }
              }}
            >
              {!sourceImageUri && topSprite ? (
                <Image
                  source={topSprite}
                  style={styles.headerSprite}
                  resizeMode="contain"
                />
              ) : null}
              <View style={styles.headerInfo}>
                <Text className="text-lg font-semibold">{topName}</Text>
                <Text className="text-sm text-muted-foreground">
                  {(topMatch.score * 100).toFixed(1)}% match
                </Text>
              </View>
              <ChevronRight size={20} color={theme.mutedForeground} />
            </Pressable>
          )}

          {/* All matches */}
          <Text className="text-xs font-medium tracking-widest uppercase text-muted-foreground mt-4 mb-2 px-5">
            All matches
          </Text>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
          >
            {matches.map((m, i) => {
              const name = labelToDisplayName(m.label);
              const matchItem = getItem(name);
              const matchSprite = matchItem
                ? getItemSprite(matchItem.name, matchItem.internalName)
                : null;
              const tierColor = matchItem?.tier
                ? getTierColor(matchItem.tier)
                : null;

              return (
                <Pressable
                  key={m.label}
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    router.push(`/items/${encodeURIComponent(name)}`);
                  }}
                >
                  <Text style={styles.rankText}>#{i + 1}</Text>
                  {matchSprite ? (
                    <Image
                      source={matchSprite}
                      style={styles.rowSprite}
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      style={[
                        styles.rowSprite,
                        {
                          backgroundColor: theme.secondary,
                          borderRadius: 4,
                        },
                      ]}
                    />
                  )}
                  <View style={styles.rowInfo}>
                    <Text className="text-sm font-medium">{name}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {(m.score * 100).toFixed(1)}%
                    </Text>
                  </View>
                  <ChevronRight size={16} color={theme.mutedForeground} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
  },
  handleBar: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.4,
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  comparison: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  comparisonItem: {
    alignItems: "center",
    gap: 4,
  },
  comparisonImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.2)",
  },
  comparisonLabel: {
    fontSize: 11,
    color: "#888",
    fontWeight: "500",
  },
  comparisonArrow: {
    fontSize: 20,
    color: "#888",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  headerSprite: {
    width: 48,
    height: 48,
  },
  headerInfo: {
    flex: 1,
  },
  list: {
    maxHeight: 300,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  row: {
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
  rowSprite: {
    width: 36,
    height: 36,
  },
  rowInfo: {
    flex: 1,
  },
});
