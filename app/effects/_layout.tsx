import { useThemeColors } from "@/lib/theme";
import { Stack, useRouter } from "expo-router";
import { Pressable } from "react-native";
import { Home } from "lucide-react-native";

export default function EffectsLayout() {
  const colors = useThemeColors();
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontWeight: "600" },
        headerShadowVisible: false,
        headerBackTitleVisible: false,
        headerRight: () => (
          <Pressable onPress={() => router.navigate("/(tabs)")} hitSlop={8}>
            <Home size={20} color={colors.mutedForeground} strokeWidth={1.8} />
          </Pressable>
        ),
      }}
    />
  );
}
