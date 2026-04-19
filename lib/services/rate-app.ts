import { Platform } from "react-native";
import { capture } from "@/lib/services/posthog";

const REVIEW_THRESHOLD = 3;

/**
 * Request an App Store / Play Store review using the native in-app review API.
 * Returns true if the request was presented, false otherwise.
 */
let StoreReview: typeof import("expo-store-review") | null = null;
try {
	StoreReview = require("expo-store-review");
} catch {
	// Native module not available in this build
}

export async function requestStoreReview(): Promise<boolean> {
	try {
		if (!StoreReview) return false;
		const isAvailable = await StoreReview.isAvailableAsync();
		if (!isAvailable) return false;

		await StoreReview.requestReview();
		capture("store_review_requested", { source: "manual" });
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if we should auto-prompt for a review.
 * Triggers once after the user has completed enough items.
 */
export function shouldRequestReview(
	completedCount: number,
	hasAlreadyRequested: boolean,
): boolean {
	if (hasAlreadyRequested) return false;
	if (Platform.OS === "web") return false;
	return completedCount >= REVIEW_THRESHOLD;
}
