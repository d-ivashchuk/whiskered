import { triggerImpact } from "@/lib/haptics";
import { useThemeColors } from "@/lib/theme";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./ui/text";

const mono = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

/** Tabs to display in order */
const TAB_ORDER = ["index", "settings"];

/** Height of the tab bar content area (excluding safe area inset). */
export const TAB_BAR_CONTENT_HEIGHT = 52;

export function CustomTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const bottomPadding = Platform.OS === "ios" ? insets.bottom : 12;

  const orderedRoutes = TAB_ORDER.map((name) => {
    const idx = state.routes.findIndex((r) => r.name === name);
    return { route: state.routes[idx], index: idx };
  }).filter((r) => r.route != null);

  // Allow screens to hide the tab bar via tabBarStyle: { display: "none" }
  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key]?.options;
  const tabBarStyle = focusedOptions?.tabBarStyle as Record<string, unknown> | undefined;
  if (tabBarStyle?.display === "none") return null;

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: bottomPadding,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
      ]}
    >
      {orderedRoutes.map(({ route, index }) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            triggerImpact();
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        };

        const label =
          typeof options.title === "string" ? options.title : route.name;
        const iconColor = isFocused ? colors.primary : colors.mutedForeground;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={`tab-${route.name}`}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tab}
          >
            {options.tabBarIcon?.({
              focused: isFocused,
              color: iconColor,
              size: 22,
            })}
            <Text
              style={[
                styles.label,
                {
                  color: isFocused ? colors.primary : colors.mutedForeground,
                  fontFamily: mono,
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 4,
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: "500",
  },
});
