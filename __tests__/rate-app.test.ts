import { describe, expect, it, beforeEach } from "vitest";
import { shouldRequestReview } from "@/lib/services/rate-app";
import { useSettingsStore } from "@/lib/stores/settings-store";

function resetReviewState() {
	useSettingsStore.setState({
		hasRequestedReview: false,
		successfulScans: 0,
		seenEntries: {},
		entriesOpenedSincePrompt: 0,
		promptCount: 0,
	});
}

describe("shouldRequestReview", () => {
	beforeEach(() => resetReviewState());

	describe("first prompt (lenient: scans OR entries)", () => {
		it("does not fire below either threshold", () => {
			expect(
				shouldRequestReview({ promptCount: 0, successfulScans: 2, entriesOpenedSincePrompt: 4 }),
			).toBe(false);
		});

		it("fires at 3 successful scans", () => {
			expect(
				shouldRequestReview({ promptCount: 0, successfulScans: 3, entriesOpenedSincePrompt: 0 }),
			).toBe(true);
		});

		it("fires at 5 entries opened, even with 0 scans", () => {
			expect(
				shouldRequestReview({ promptCount: 0, successfulScans: 0, entriesOpenedSincePrompt: 5 }),
			).toBe(true);
		});
	});

	describe("subsequent prompts (entries only)", () => {
		it("does not fire on more scans alone after prompt 1", () => {
			expect(
				shouldRequestReview({ promptCount: 1, successfulScans: 50, entriesOpenedSincePrompt: 4 }),
			).toBe(false);
		});

		it("fires at 5 new entries after prompt 1", () => {
			expect(
				shouldRequestReview({ promptCount: 1, successfulScans: 0, entriesOpenedSincePrompt: 5 }),
			).toBe(true);
		});

		it("fires at 5 new entries after prompt 2", () => {
			expect(
				shouldRequestReview({ promptCount: 2, successfulScans: 0, entriesOpenedSincePrompt: 5 }),
			).toBe(true);
		});
	});

	describe("hard cap", () => {
		it("never fires after 3 prompts", () => {
			expect(
				shouldRequestReview({ promptCount: 3, successfulScans: 999, entriesOpenedSincePrompt: 999 }),
			).toBe(false);
		});
	});
});

describe("settings-store review counters", () => {
	beforeEach(() => resetReviewState());

	it("incrementSuccessfulScans bumps the counter", () => {
		useSettingsStore.getState().incrementSuccessfulScans();
		useSettingsStore.getState().incrementSuccessfulScans();
		expect(useSettingsStore.getState().successfulScans).toBe(2);
	});

	it("markEntryOpened returns true for new keys and false for repeats", () => {
		const store = useSettingsStore.getState();
		expect(store.markEntryOpened("item:Whiskerwand")).toBe(true);
		expect(useSettingsStore.getState().markEntryOpened("item:Whiskerwand")).toBe(false);
		expect(useSettingsStore.getState().entriesOpenedSincePrompt).toBe(1);
	});

	it("markEntryOpened increments per distinct entry", () => {
		useSettingsStore.getState().markEntryOpened("item:A");
		useSettingsStore.getState().markEntryOpened("item:B");
		useSettingsStore.getState().markEntryOpened("guide:Boris");
		expect(useSettingsStore.getState().entriesOpenedSincePrompt).toBe(3);
	});

	it("recordPromptShown bumps promptCount, resets per-prompt counter, sets review flag", () => {
		useSettingsStore.getState().markEntryOpened("item:A");
		useSettingsStore.getState().markEntryOpened("item:B");
		useSettingsStore.getState().recordPromptShown();
		const state = useSettingsStore.getState();
		expect(state.promptCount).toBe(1);
		expect(state.entriesOpenedSincePrompt).toBe(0);
		expect(state.hasRequestedReview).toBe(true);
	});

	it("seenEntries persists across recordPromptShown so already-seen entries don't double-count", () => {
		useSettingsStore.getState().markEntryOpened("item:A");
		useSettingsStore.getState().recordPromptShown();
		expect(useSettingsStore.getState().markEntryOpened("item:A")).toBe(false);
		expect(useSettingsStore.getState().entriesOpenedSincePrompt).toBe(0);
	});
});
