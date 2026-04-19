import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { completeOnboarding } from "@/lib/hooks/use-onboarding-check";
import { capture } from "@/lib/services/posthog";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Minimal onboarding placeholder. Replace with a real flow when needed.
 * Sets the local `onboardingCompleted` flag and routes to the tabs.
 */
export default function OnboardingScreen() {
  const router = useRouter();

  const handleContinue = useCallback(() => {
    capture("onboarding_completed");
    completeOnboarding();
    router.replace("/(tabs)");
  }, [router]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1, padding: 32, justifyContent: "center" }}>
        <Text className="text-4xl font-semibold">Welcome to Kickd</Text>
        <Text className="text-base text-muted-foreground mt-4">
          This is a placeholder onboarding screen. Replace it with whatever your
          product needs — copy, animations, permission prompts, and so on.
        </Text>

        <View className="mt-10">
          <Button onPress={handleContinue}>
            <Text>Get started</Text>
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
