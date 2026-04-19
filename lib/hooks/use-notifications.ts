import {
	cancelAllScheduledNotifications,
	cancelDailyReminder,
	hasNotificationPermissions,
	requestNotificationPermissions,
	scheduleDailyReminder,
} from "@/lib/services/notifications";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useEffect } from "react";

/**
 * Syncs scheduled notifications with current settings.
 * Should be mounted once in the root layout.
 */
export function useNotificationSync(): void {
	const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
	const dailyReminderEnabled = useSettingsStore((s) => s.dailyReminderEnabled);
	const dailyReminderHour = useSettingsStore((s) => s.dailyReminderHour);
	const dailyReminderMinute = useSettingsStore((s) => s.dailyReminderMinute);

	useEffect(() => {
		if (!notificationsEnabled) {
			cancelAllScheduledNotifications();
			return;
		}

		if (dailyReminderEnabled) {
			scheduleDailyReminder(dailyReminderHour, dailyReminderMinute);
		} else {
			cancelDailyReminder();
		}
	}, [
		notificationsEnabled,
		dailyReminderEnabled,
		dailyReminderHour,
		dailyReminderMinute,
	]);
}

/**
 * Requests notification permissions and enables notifications in settings.
 * Returns true if permissions were granted.
 */
export async function enableNotifications(): Promise<boolean> {
	const granted = await requestNotificationPermissions();
	if (granted) {
		useSettingsStore.getState().setNotificationsEnabled(true);
	}
	return granted;
}

/**
 * Checks if notifications are currently permitted at the OS level.
 */
export { hasNotificationPermissions };
