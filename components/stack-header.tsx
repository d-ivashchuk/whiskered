import { useThemeColors } from "@/lib/theme";
import { useRouter, useRootNavigationState } from "expo-router";
import { Pressable } from "react-native";
import { ChevronLeft, Home } from "lucide-react-native";

/**
 * Circular back button for stack headers.
 * Only renders when there's a screen to go back to.
 */
export function HeaderBackButton() {
  const colors = useThemeColors();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
    >
      <ChevronLeft size={22} color={colors.foreground} strokeWidth={2} />
    </Pressable>
  );
}

/**
 * Home button for stack headers.
 * Hidden when a modal (scanner, paywall) is present in the root navigation state,
 * since navigating home from inside a modal creates a broken experience.
 */
export function HeaderHomeButton() {
  const colors = useThemeColors();
  const router = useRouter();
  const rootState = useRootNavigationState();

  // Check if there's a modal screen in the root stack (scanner, grid-scanner, paywall)
  const hasModal = rootState?.routes?.some(
    (r) =>
      r.name === "scanner" ||
      r.name === "grid-scanner" ||
      r.name === "paywall"
  );

  if (hasModal) return null;

  return (
    <Pressable
      onPress={() => router.navigate("/(tabs)")}
      hitSlop={12}
      style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
    >
      <Home size={20} color={colors.mutedForeground} strokeWidth={1.8} />
    </Pressable>
  );
}
