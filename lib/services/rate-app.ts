import { Linking, Platform } from "react-native";
import { capture } from "@/lib/services/posthog";
import { useSettingsStore } from "@/lib/stores/settings-store";

const APP_STORE_ID = "6761140803";

const SCAN_THRESHOLD = 3;
const ENTRIES_THRESHOLD = 5;
const MAX_PROMPTS = 3;
const PROMPT_DELAY_MS = 800;

let StoreReview: typeof import("expo-store-review") | null = null;
try {
	StoreReview = require("expo-store-review");
} catch {
	// Native module not available in this build
}

/**
 * Request an App Store / Play Store review.
 * Tries the native in-app review API first. If it's unavailable or throttled,
 * falls back to opening the App Store / Play Store review page directly.
 */
export async function requestStoreReview(): Promise<boolean> {
	try {
		if (StoreReview) {
			const isAvailable = await StoreReview.isAvailableAsync();
			if (isAvailable) {
				await StoreReview.requestReview();
				capture("store_review_requested", { source: "manual" });
				return true;
			}
		}
	} catch {
		// In-app review failed — fall through to store link
	}

	// Fallback: open the store review page directly
	try {
		const url =
			Platform.OS === "ios"
				? `itms-apps://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`
				: `market://details?id=com.divashchuk.whiskered`;
		await Linking.openURL(url);
		capture("store_review_requested", { source: "manual_fallback" });
		return true;
	} catch {
		return false;
	}
}

/**
 * Decide whether the current store state has crossed a review-prompt threshold.
 *
 * Prompt 1: 3 successful scans OR 5 new entries opened (lenient — also catches browsers).
 * Prompts 2 & 3: another 5 new entries opened since the previous prompt.
 * Hard cap at 3 prompts so we never call past iOS's silent throttle.
 */
export function shouldRequestReview(state: {
	promptCount: number;
	successfulScans: number;
	entriesOpenedSincePrompt: number;
}): boolean {
	if (Platform.OS === "web") return false;
	if (state.promptCount >= MAX_PROMPTS) return false;

	if (state.promptCount === 0) {
		return (
			state.successfulScans >= SCAN_THRESHOLD ||
			state.entriesOpenedSincePrompt >= ENTRIES_THRESHOLD
		);
	}
	return state.entriesOpenedSincePrompt >= ENTRIES_THRESHOLD;
}

async function maybeFire(source: "scan" | "entry"): Promise<void> {
	const state = useSettingsStore.getState();
	if (!shouldRequestReview(state)) return;

	await new Promise((r) => setTimeout(r, PROMPT_DELAY_MS));

	if (!StoreReview) return;
	try {
		const available = await StoreReview.isAvailableAsync();
		if (!available) return;
		await StoreReview.requestReview();
		capture("store_review_requested", {
			source,
			prompt_count: state.promptCount + 1,
		});
		useSettingsStore.getState().recordPromptShown();
	} catch {
		// swallow — iOS may silently no-op past the 3/year cap
	}
}

/**
 * Call after the user confirms a successful scan match (taps a prediction).
 * Increments the scan counter and fires the review prompt if a threshold is crossed.
 */
export async function onSuccessfulScan(): Promise<void> {
	useSettingsStore.getState().incrementSuccessfulScans();
	await maybeFire("scan");
}

/**
 * Call when the user opens an item detail page or a guide page.
 * Dedupes by `key` so re-opening the same entry doesn't double-count.
 * Returns silently if the entry was already seen.
 */
export async function onEntryOpened(key: string): Promise<void> {
	const wasNew = useSettingsStore.getState().markEntryOpened(key);
	if (!wasNew) return;
	await maybeFire("entry");
}
