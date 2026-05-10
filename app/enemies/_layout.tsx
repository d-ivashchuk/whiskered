import { useThemeColors } from "@/lib/theme";
import { HeaderBackButton, HeaderHomeButton } from "@/components/stack-header";
import { Stack } from "expo-router";

export default function EnemiesLayout() {
  const colors = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontWeight: "600" },
        headerShadowVisible: false,
        headerBackTitleVisible: false,
        headerBackVisible: false,
        headerLeft: () => <HeaderBackButton />,
        headerRight: () => <HeaderHomeButton />,
      }}
    />
  );
}
