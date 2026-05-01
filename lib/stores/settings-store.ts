import { safeStorage } from "@/lib/stores/safe-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SettingsState {
	hapticEnabled: boolean;
	soundEnabled: boolean;
	appearanceMode: "system" | "light" | "dark";

	// Review prompt gating
	hasRequestedReview: boolean;
	successfulScans: number;
	seenEntries: Record<string, true>;
	entriesOpenedSincePrompt: number;
	promptCount: number;
	setHasRequestedReview: () => void;
	incrementSuccessfulScans: () => void;
	markEntryOpened: (key: string) => boolean;
	recordPromptShown: () => void;

	// Analytics
	analyticsEnabled: boolean;

	setHapticEnabled: (enabled: boolean) => void;
	setSoundEnabled: (enabled: boolean) => void;
	setAppearanceMode: (mode: "system" | "light" | "dark") => void;
	setAnalyticsEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set, get) => ({
			hapticEnabled: true,
			soundEnabled: true,
			appearanceMode: "system" as const,

			hasRequestedReview: false,
			successfulScans: 0,
			seenEntries: {},
			entriesOpenedSincePrompt: 0,
			promptCount: 0,
			setHasRequestedReview: () => set({ hasRequestedReview: true }),
			incrementSuccessfulScans: () =>
				set((s) => ({ successfulScans: s.successfulScans + 1 })),
			markEntryOpened: (key: string) => {
				const seen = get().seenEntries;
				if (seen[key]) return false;
				set((s) => ({
					seenEntries: { ...s.seenEntries, [key]: true },
					entriesOpenedSincePrompt: s.entriesOpenedSincePrompt + 1,
				}));
				return true;
			},
			recordPromptShown: () =>
				set((s) => ({
					promptCount: s.promptCount + 1,
					entriesOpenedSincePrompt: 0,
					hasRequestedReview: true,
				})),

			analyticsEnabled: true,

			setHapticEnabled: (enabled: boolean) => set({ hapticEnabled: enabled }),
			setSoundEnabled: (enabled: boolean) => set({ soundEnabled: enabled }),
			setAppearanceMode: (mode: "system" | "light" | "dark") => set({ appearanceMode: mode }),
			setAnalyticsEnabled: (enabled: boolean) => set({ analyticsEnabled: enabled }),
		}),
		{
			name: "app-settings",
			version: 3,
			storage: createJSONStorage(() => safeStorage),
			migrate: (persisted) => {
				const state = persisted as Record<string, unknown>;
				if (typeof state.analyticsEnabled !== "boolean") state.analyticsEnabled = true;
				if (typeof state.appearanceMode !== "string") state.appearanceMode = "system";
				if (typeof state.successfulScans !== "number") state.successfulScans = 0;
				if (typeof state.seenEntries !== "object" || state.seenEntries === null) state.seenEntries = {};
				if (typeof state.entriesOpenedSincePrompt !== "number") state.entriesOpenedSincePrompt = 0;
				if (typeof state.promptCount !== "number") {
					state.promptCount = state.hasRequestedReview ? 1 : 0;
				}
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
