import { safeStorage } from "@/lib/stores/safe-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SettingsState {
	hapticEnabled: boolean;
	soundEnabled: boolean;
	appearanceMode: "system" | "light" | "dark";

	// Review
	hasRequestedReview: boolean;
	setHasRequestedReview: () => void;

	// Analytics
	analyticsEnabled: boolean;

	setHapticEnabled: (enabled: boolean) => void;
	setSoundEnabled: (enabled: boolean) => void;
	setAppearanceMode: (mode: "system" | "light" | "dark") => void;
	setAnalyticsEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			hapticEnabled: true,
			soundEnabled: true,
			appearanceMode: "system" as const,

			hasRequestedReview: false,
			setHasRequestedReview: () => set({ hasRequestedReview: true }),

			analyticsEnabled: true,

			setHapticEnabled: (enabled: boolean) => set({ hapticEnabled: enabled }),
			setSoundEnabled: (enabled: boolean) => set({ soundEnabled: enabled }),
			setAppearanceMode: (mode: "system" | "light" | "dark") => set({ appearanceMode: mode }),
			setAnalyticsEnabled: (enabled: boolean) => set({ analyticsEnabled: enabled }),
		}),
		{
			name: "app-settings",
			version: 2,
			storage: createJSONStorage(() => safeStorage),
			migrate: (persisted) => {
				const state = persisted as Record<string, unknown>;
				if (typeof state.analyticsEnabled !== "boolean") state.analyticsEnabled = true;
				if (typeof state.appearanceMode !== "string") state.appearanceMode = "system";
				// Remove old notification fields from persisted state
				delete state.notificationsEnabled;
				delete state.dailyReminderEnabled;
				delete state.dailyReminderHour;
				delete state.dailyReminderMinute;
				delete state.onboardingCompleted;
				return state;
			},
		},
	),
);
