import { describe, expect, it, beforeEach } from "vitest";
import { useSettingsStore } from "@/lib/stores/settings-store";

function resetStore() {
	useSettingsStore.setState({
		hapticEnabled: true,
		soundEnabled: true,
		appearanceMode: "system",
		hasRequestedReview: false,
		successfulScans: 0,
		seenEntries: {},
		entriesOpenedSincePrompt: 0,
		promptCount: 0,
		analyticsEnabled: true,
	});
}

describe("useSettingsStore", () => {
	beforeEach(() => resetStore());

	describe("defaults", () => {
		it("has correct default values", () => {
			const state = useSettingsStore.getState();
			expect(state.hapticEnabled).toBe(true);
			expect(state.soundEnabled).toBe(true);
			expect(state.appearanceMode).toBe("system");
			expect(state.analyticsEnabled).toBe(true);
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
});
