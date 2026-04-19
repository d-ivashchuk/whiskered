import { describe, expect, it, beforeEach } from "vitest";
import { useSettingsStore } from "@/lib/stores/settings-store";

function resetStore() {
	useSettingsStore.setState({
		hapticEnabled: true,
		soundEnabled: true,
		onboardingCompleted: false,
		appearanceMode: "system",
		hasRequestedReview: false,
		analyticsEnabled: true,
		notificationsEnabled: false,
		dailyReminderEnabled: true,
		dailyReminderHour: 9,
		dailyReminderMinute: 0,
	});
}

describe("useSettingsStore", () => {
	beforeEach(() => resetStore());

	describe("defaults", () => {
		it("has correct default values", () => {
			const state = useSettingsStore.getState();
			expect(state.hapticEnabled).toBe(true);
			expect(state.soundEnabled).toBe(true);
			expect(state.onboardingCompleted).toBe(false);
			expect(state.appearanceMode).toBe("system");
			expect(state.analyticsEnabled).toBe(true);
		});

		it("has correct notification defaults", () => {
			const state = useSettingsStore.getState();
			expect(state.notificationsEnabled).toBe(false);
			expect(state.dailyReminderEnabled).toBe(true);
			expect(state.dailyReminderHour).toBe(9);
			expect(state.dailyReminderMinute).toBe(0);
		});
	});

	describe("setters", () => {
		it("setHapticEnabled toggles haptic", () => {
			useSettingsStore.getState().setHapticEnabled(false);
			expect(useSettingsStore.getState().hapticEnabled).toBe(false);
		});

		it("setSoundEnabled toggles sound", () => {
			useSettingsStore.getState().setSoundEnabled(false);
			expect(useSettingsStore.getState().soundEnabled).toBe(false);
		});

		it("setOnboardingCompleted sets to true", () => {
			useSettingsStore.getState().setOnboardingCompleted();
			expect(useSettingsStore.getState().onboardingCompleted).toBe(true);
		});

		it("setAppearanceMode updates mode", () => {
			useSettingsStore.getState().setAppearanceMode("dark");
			expect(useSettingsStore.getState().appearanceMode).toBe("dark");
		});

		it("setAnalyticsEnabled updates", () => {
			useSettingsStore.getState().setAnalyticsEnabled(false);
			expect(useSettingsStore.getState().analyticsEnabled).toBe(false);
		});

		it("setHasRequestedReview sets to true", () => {
			useSettingsStore.getState().setHasRequestedReview();
			expect(useSettingsStore.getState().hasRequestedReview).toBe(true);
		});
	});

	describe("notification settings", () => {
		it("setNotificationsEnabled updates", () => {
			useSettingsStore.getState().setNotificationsEnabled(true);
			expect(useSettingsStore.getState().notificationsEnabled).toBe(true);
		});

		it("setDailyReminderEnabled updates", () => {
			useSettingsStore.getState().setDailyReminderEnabled(false);
			expect(useSettingsStore.getState().dailyReminderEnabled).toBe(false);
		});

		it("setDailyReminderTime updates hour and minute", () => {
			useSettingsStore.getState().setDailyReminderTime(14, 30);
			expect(useSettingsStore.getState().dailyReminderHour).toBe(14);
			expect(useSettingsStore.getState().dailyReminderMinute).toBe(30);
		});
	});
});
