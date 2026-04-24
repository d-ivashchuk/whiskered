import { Text } from "@/components/ui/text";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useThemeColors } from "@/lib/theme";

import { ChevronRight, FileText, Shield, Star, Wrench } from "lucide-react-native";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { requestStoreReview } from "@/lib/services/rate-app";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { capture, getPostHogClient } from "@/lib/services/posthog";

export default function SettingsScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const colors = useThemeColors();

	const hapticEnabled = useSettingsStore((s) => s.hapticEnabled);
	const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);
	const soundEnabled = useSettingsStore((s) => s.soundEnabled);
	const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
	const analyticsEnabled = useSettingsStore((s) => s.analyticsEnabled);
	const setAnalyticsEnabled = useSettingsStore((s) => s.setAnalyticsEnabled);

	const appVersion = Application.nativeApplicationVersion ?? "0.0.0";
	const buildNumber = Application.nativeBuildVersion ?? "0";
	const updateId = Updates.updateId;

	const versionLabel = updateId
		? `v${appVersion} (${buildNumber}) · ota:${updateId.slice(0, 6)}`
		: `v${appVersion} (${buildNumber})`;

	const posthog = getPostHogClient();
	const debugFlag = posthog?.getFeatureFlag("enable-debug-tab");
	const showDebug = __DEV__ || debugFlag === true || debugFlag === "true";

	const appearanceMode = useSettingsStore((s) => s.appearanceMode);
	const setAppearanceMode = useSettingsStore((s) => s.setAppearanceMode);

	type AppearanceOption = "system" | "light" | "dark";

	return (
		<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
			{/* Sticky header */}
			<View className="px-6 pt-4 pb-3">
				<Text className="text-2xl font-bold text-primary">Settings</Text>
				<Text className="text-base text-muted-foreground mt-1">
					Customize your experience
				</Text>
			</View>

			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
			>
				{/* Preferences section */}
				<View className="px-6 mb-8">
					<Text className="text-base font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
						Preferences
					</Text>
					<View className="bg-card rounded-2xl overflow-hidden">
						<View className="flex-row items-center justify-between px-4 py-4">
							<View className="flex-1 mr-3">
								<Text className="text-base font-medium text-foreground">Sound</Text>
								<Text className="text-sm text-muted-foreground mt-0.5">
									Audio feedback and sound effects
								</Text>
							</View>
							<Switch
								checked={soundEnabled}
								onCheckedChange={(v) => { setSoundEnabled(v); capture("setting_changed", { setting: "sound", enabled: v }); }}
							/>
						</View>
						<View className="h-px bg-border mx-4" />
						<View className="flex-row items-center justify-between px-4 py-4">
							<View className="flex-1 mr-3">
								<Text className="text-base font-medium text-foreground">Haptics</Text>
								<Text className="text-sm text-muted-foreground mt-0.5">
									Vibration feedback for interactions
								</Text>
							</View>
							<Switch
								checked={hapticEnabled}
								onCheckedChange={(v) => { setHapticEnabled(v); capture("setting_changed", { setting: "haptics", enabled: v }); }}
							/>
						</View>
					</View>
				</View>

				{/* Appearance section */}
				<View className="px-6 mb-8">
					<Text className="text-base font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
						Appearance
					</Text>
					<SegmentedControl
						values={["System", "Light", "Dark"]}
						selectedIndex={appearanceMode === "system" ? 0 : appearanceMode === "light" ? 1 : 2}
						onChange={(event) => {
							const idx = event.nativeEvent.selectedSegmentIndex;
							const modes: AppearanceOption[] = ["system", "light", "dark"];
							setAppearanceMode(modes[idx]);
							capture("setting_changed", { setting: "appearance", value: modes[idx] });
						}}
						style={{ height: 40 }}
						tintColor={colors.primary}
						fontStyle={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground }}
						activeFontStyle={{ fontSize: 13, fontWeight: "700", color: colors.primaryForeground }}
					/>
				</View>

				{/* Feedback & Rating section */}
				<View className="px-6 mb-8">
					<Text className="text-base font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
						Feedback
					</Text>
					<View className="bg-card rounded-2xl overflow-hidden">
						{Platform.OS !== "web" ? (
							<Pressable
								onPress={requestStoreReview}
								className="px-4 py-4 flex-row items-center"
							>
								<Star size={18} color={colors.mutedForeground} strokeWidth={2} />
								<View className="flex-1 ml-3">
									<Text className="text-base font-medium text-foreground">Rate the App</Text>
									<Text className="text-sm text-muted-foreground mt-0.5">
										Enjoying the app? Leave a review
									</Text>
								</View>
								<ChevronRight size={18} color={colors.mutedForeground} strokeWidth={2} />
							</Pressable>
						) : null}
					</View>
				</View>

				{/* General section */}
				<View className="px-6 mb-4">
					<Text className="text-base font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
						General
					</Text>
					<View className="bg-card rounded-2xl overflow-hidden">
						<View className="flex-row items-center justify-between px-4 py-4">
							<View className="flex-1 mr-3">
								<Text className="text-base font-medium text-foreground">Analytics</Text>
								<Text className="text-sm text-muted-foreground mt-0.5">
									Help improve the app by sharing anonymous usage data
								</Text>
							</View>
							<Switch
								checked={analyticsEnabled}
								onCheckedChange={(v) => { setAnalyticsEnabled(v); capture("setting_changed", { setting: "analytics", enabled: v }); }}
							/>
						</View>

						<View className="h-px bg-border mx-4" />

						<Pressable
							onPress={() => Linking.openURL("https://d-ivashchuk.github.io/whiskered-legal/terms-of-service")}
							className="px-4 py-4 flex-row items-center"
						>
							<FileText size={18} color={colors.mutedForeground} strokeWidth={2} />
							<Text className="flex-1 ml-3 text-base font-medium text-foreground">Terms of Service</Text>
							<ChevronRight size={18} color={colors.mutedForeground} strokeWidth={2} />
						</Pressable>

						<View className="h-px bg-border mx-4" />

						<Pressable
							onPress={() => Linking.openURL("https://d-ivashchuk.github.io/whiskered-legal/privacy-policy")}
							className="px-4 py-4 flex-row items-center"
						>
							<Shield size={18} color={colors.mutedForeground} strokeWidth={2} />
							<Text className="flex-1 ml-3 text-base font-medium text-foreground">Privacy Policy</Text>
							<ChevronRight size={18} color={colors.mutedForeground} strokeWidth={2} />
						</Pressable>

						{showDebug ? (
							<>
								<View className="h-px bg-border mx-4" />
								<Pressable
									onPress={() => router.push("/debug")}
									className="px-4 py-4 flex-row items-center"
								>
									<Wrench size={18} color={colors.mutedForeground} strokeWidth={2} />
									<View className="flex-1 ml-3">
										<Text className="text-base font-medium text-foreground">Debug Tools</Text>
										<Text className="text-sm text-muted-foreground mt-0.5">
											Developer & testing utilities
										</Text>
									</View>
									<ChevronRight size={18} color={colors.mutedForeground} strokeWidth={2} />
								</Pressable>
							</>
						) : null}
					</View>
				</View>

				{/* Version info */}
				<View className="px-6 mt-1 mb-4 items-center">
					<Text className="text-sm text-muted-foreground/50">
						{versionLabel}
					</Text>
				</View>
			</ScrollView>
		</View>
	);
}
