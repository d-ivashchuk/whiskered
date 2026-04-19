import { useSubscriptionStore } from "@/lib/stores/subscription-store";
import { useRouter } from "expo-router";
import { useCallback } from "react";

/**
 * Hook to check premium access and gate features.
 *
 * Returns:
 * - `isPremium`: whether the user has premium access (trial or purchased)
 * - `isPurchased`: whether the user has made an actual purchase
 * - `isTrialActive`: whether the reverse trial is active
 * - `trialDaysRemaining`: days left in the trial
 * - `requirePremium`: function that checks premium and opens paywall if needed.
 *    Returns true if user has access, false if paywall was shown.
 */
export function useIsPremium() {
	// Select derived values (not functions) so Zustand triggers re-renders on change
	const isPremium = useSubscriptionStore((s) => s.hasPremiumAccess());
	const isPurchased = useSubscriptionStore((s) => s.isPurchasedPremium);
	const isOnTrial = useSubscriptionStore((s) => s.isTrialActive());
	const daysLeft = useSubscriptionStore((s) => s.trialDaysRemaining());
	const router = useRouter();

	/**
	 * Gate a premium feature. If user doesn't have access, navigates to paywall.
	 * Returns true if user has access, false if paywall was shown.
	 */
	const requirePremium = useCallback((): boolean => {
		if (useSubscriptionStore.getState().hasPremiumAccess()) return true;
		router.push("/paywall");
		return false;
	}, [router]);

	return {
		isPremium,
		isPurchased,
		isTrialActive: isOnTrial,
		trialDaysRemaining: daysLeft,
		requirePremium,
	};
}
