import { Text } from "@/components/ui/text";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top + 24,
        paddingHorizontal: 24,
      }}
    >
      <Text className="text-2xl font-semibold">Activity</Text>
      <Text className="text-muted-foreground mt-2">
        Placeholder screen. Wire this to whatever history makes sense for your app.
      </Text>
    </View>
  );
}
