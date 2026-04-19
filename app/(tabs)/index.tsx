import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 120 }}>
        <Text className="text-3xl font-semibold">Mewgenics Scanner</Text>
        <Text className="text-muted-foreground mt-2">
          Point your camera at Mewgenics items to identify them.
        </Text>

        <View className="mt-8 gap-3">
          <Button onPress={() => router.push("/settings")}>
            <Text>Open settings</Text>
          </Button>
          <Button variant="outline" onPress={() => router.push("/paywall")}>
            <Text>Open paywall</Text>
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
