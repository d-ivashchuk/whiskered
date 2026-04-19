import { safeStorage } from "@/lib/stores/safe-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SettingsState {
	hapticEnabled: boolean;
	soundEnabled: boolean;
	onboardingCompleted: boolean;
	appearanceMode: "system" | "light" | "dark";

	// Review
	hasRequestedReview: boolean;
	setHasRequestedReview: () => void;

	// Analytics
	analyticsEnabled: boolean;

	// Notification settings
	notificationsEnabled: boolean;
	dailyReminderEnabled: boolean;
	dailyReminderHour: number;
	dailyReminderMinute: number;

	setHapticEnabled: (enabled: boolean) => void;
	setSoundEnabled: (enabled: boolean) => void;
	setOnboardingCompleted: () => void;

	setNotificationsEnabled: (enabled: boolean) => void;
	setDailyReminderEnabled: (enabled: boolean) => void;
	setDailyReminderTime: (hour: number, minute: number) => void;

	setAppearanceMode: (mode: "system" | "light" | "dark") => void;
	setAnalyticsEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			hapticEnabled: true,
			soundEnabled: true,
			onboardingCompleted: false,
			appearanceMode: "system" as const,

			hasRequestedReview: false,
			setHasRequestedReview: () => set({ hasRequestedReview: true }),

			analyticsEnabled: true,

			notificationsEnabled: false,
			dailyReminderEnabled: true,
			dailyReminderHour: 9,
			dailyReminderMinute: 0,

			setHapticEnabled: (enabled: boolean) => set({ hapticEnabled: enabled }),
			setSoundEnabled: (enabled: boolean) => set({ soundEnabled: enabled }),
			setOnboardingCompleted: () => set({ onboardingCompleted: true }),

			setNotificationsEnabled: (enabled: boolean) => set({ notificationsEnabled: enabled }),
			setDailyReminderEnabled: (enabled: boolean) => set({ dailyReminderEnabled: enabled }),
			setDailyReminderTime: (hour: number, minute: number) =>
				set({ dailyReminderHour: hour, dailyReminderMinute: minute }),

			setAppearanceMode: (mode: "system" | "light" | "dark") => set({ appearanceMode: mode }),
			setAnalyticsEnabled: (enabled: boolean) => set({ analyticsEnabled: enabled }),
		}),
		{
			name: "app-settings",
			version: 1,
			storage: createJSONStorage(() => safeStorage),
			migrate: (persisted) => {
				const state = persisted as Record<string, unknown>;
				if (typeof state.analyticsEnabled !== "boolean") state.analyticsEnabled = true;
				if (typeof state.appearanceMode !== "string") state.appearanceMode = "system";
				return state;
			},
		},
	),
);
