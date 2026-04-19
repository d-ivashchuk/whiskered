import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

// ── Show notifications even when the app is in the foreground ─
if (!isWeb) {
	Notifications.setNotificationHandler({
		handleNotification: async () => ({
			shouldShowBanner: true,
			shouldShowList: true,
			shouldPlaySound: true,
			shouldSetBadge: false,
		}),
	});

	// ── Channel setup (Android) ─────────────────────────────────
	Notifications.setNotificationChannelAsync("reminders", {
		name: "Reminders",
		importance: Notifications.AndroidImportance.DEFAULT,
		sound: "default",
	});
}

// ── Permission request ──────────────────────────────────────
export async function requestNotificationPermissions(): Promise<boolean> {
	if (isWeb) return false;
	if (!Device.isDevice) {
		const { status } = await Notifications.requestPermissionsAsync();
		return status === "granted";
	}

	const { status: existing } = await Notifications.getPermissionsAsync();
	if (existing === "granted") return true;

	const { status } = await Notifications.requestPermissionsAsync();
	return status === "granted";
}

export async function hasNotificationPermissions(): Promise<boolean> {
	if (isWeb) return false;
	const { status } = await Notifications.getPermissionsAsync();
	return status === "granted";
}

// ── Notification identifiers (for cancellation) ─────────────
const DAILY_REMINDER_ID = "daily-reminder";

// ── Daily reminder ──────────────────────────────────────────
export async function scheduleDailyReminder(
	hour: number,
	minute: number,
): Promise<void> {
	if (isWeb) return;
	await cancelDailyReminder();

	await Notifications.scheduleNotificationAsync({
		identifier: DAILY_REMINDER_ID,
		content: {
			title: "Daily reminder",
			body: "Don't forget to open the app today.",
			sound: "default",
			...(Platform.OS === "android" && { channelId: "reminders" }),
		},
		trigger: {
			type: Notifications.SchedulableTriggerInputTypes.DAILY,
			hour,
			minute,
		},
	});
}

export async function cancelDailyReminder(): Promise<void> {
	if (isWeb) return;
	await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
}

// ── Cancel all ──────────────────────────────────────────────
export async function cancelAllScheduledNotifications(): Promise<void> {
	if (isWeb) return;
	await Notifications.cancelAllScheduledNotificationsAsync();
}
