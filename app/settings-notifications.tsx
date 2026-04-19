import { Text } from "@/components/ui/text";
import { Switch } from "@/components/ui/switch";
import {
	enableNotifications,
	hasNotificationPermissions,
} from "@/lib/hooks/use-notifications";
import {
	cancelAllScheduledNotifications,
} from "@/lib/services/notifications";
import { capture } from "@/lib/services/posthog";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useThemeColors } from "@/lib/theme";
import { ArrowLeft } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SettingsNotificationsScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const colors = useThemeColors();

	const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
	const dailyReminderEnabled = useSettingsStore((s) => s.dailyReminderEnabled);
	const setNotificationsEnabled = useSettingsStore(
		(s) => s.setNotificationsEnabled,
	);
	const setDailyReminderEnabled = useSettingsStore(
		(s) => s.setDailyReminderEnabled,
	);

	const [permissionGranted, setPermissionGranted] = useState(false);

	useEffect(() => {
		hasNotificationPermissions().then(setPermissionGranted);
	}, [notificationsEnabled]);

	const handleToggleNotifications = useCallback(
		async (enabled: boolean) => {
			capture("notifications_toggled", { enabled });
			if (enabled) {
				const granted = await enableNotifications();
				if (!granted) {
					capture("notifications_permission_denied_system");
					Alert.alert(
						"Notifications Disabled",
						"Enable notifications in your device settings to receive reminders.",
						[
							{ text: "Cancel", style: "cancel" },
							{
								text: "Open Settings",
								onPress: () => Linking.openSettings(),
							},
						],
					);
					return;
				}
				setPermissionGranted(true);
			} else {
				setNotificationsEnabled(false);
				await cancelAllScheduledNotifications();
			}
		},
		[setNotificationsEnabled],
	);

	const notifDisabled = !notificationsEnabled;

	return (
		<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
			{/* Header */}
			<View className="px-6 pt-4 pb-3 flex-row items-center gap-3">
				<Pressable onPress={() => router.back()} hitSlop={12} className="py-1">
					<ArrowLeft size={22} color={colors.foreground} strokeWidth={2} />
				</Pressable>
				<Text className="text-2xl font-bold text-primary">Notifications</Text>
			</View>

			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{ paddingBottom: 40 }}
			>
				<View className="px-6 mt-2">
					<Text className="text-sm text-muted-foreground/70 mb-3">
						Control how and when you receive reminders
					</Text>
					<View className="bg-card rounded-2xl overflow-hidden">
						<View className="flex-row items-center justify-between px-4 py-4">
							<View className="flex-1 mr-3">
								<Text className="text-base font-medium text-foreground">
									Enable notifications
								</Text>
								<Text className="text-sm text-muted-foreground mt-0.5">
									Allow the app to send reminders
								</Text>
							</View>
							<Switch
								checked={notificationsEnabled}
								onCheckedChange={handleToggleNotifications}
							/>
						</View>

						<View className="h-px bg-border mx-4" />

						<View className="flex-row items-center justify-between px-4 py-4">
							<View className="flex-1 mr-3">
								<Text
									className={`text-base font-medium ${notifDisabled ? "text-muted-foreground/50" : "text-foreground"}`}
								>
									Daily reminder
								</Text>
								<Text
									className={`text-sm mt-0.5 ${notifDisabled ? "text-muted-foreground/40" : "text-muted-foreground"}`}
								>
									A gentle nudge to check in each day
								</Text>
							</View>
							<Switch
								checked={dailyReminderEnabled}
								onCheckedChange={(v) => { capture("daily_reminder_toggled", { enabled: v }); setDailyReminderEnabled(v); }}
								disabled={notifDisabled}
							/>
						</View>
					</View>

					{notificationsEnabled && !permissionGranted ? (
						<Pressable onPress={() => Linking.openSettings()}>
							<Text className="text-sm text-destructive mt-2 px-1">
								Notifications are blocked at the system level. Tap to open settings.
							</Text>
						</Pressable>
					) : null}

					{notificationsEnabled ? (
						<Text className="text-sm text-muted-foreground/70 mt-2 px-1">
							Max 1 notification per day. We respect your attention.
						</Text>
					) : null}
				</View>
			</ScrollView>
		</View>
	);
}
