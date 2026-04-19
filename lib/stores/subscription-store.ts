import { capture, setPersonProperties } from "@/lib/services/posthog";
import { safeStorage } from "@/lib/stores/safe-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
	checkPremiumStatus,
	PREMIUM_ENTITLEMENT,
} from "@/lib/services/revenue-cat";
import type { CustomerInfo } from "react-native-purchases";

/** Duration of reverse trial in milliseconds (7 days). */
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export type SubscriptionPlan = "weekly" | "monthly" | "annual";

interface SubscriptionState {
	// ── Persisted state ──────────────────────────────────────────
	/** ISO timestamp of when the user first opened the app. */
	trialStartedAt: string | null;
	/** Whether the user has an active RevenueCat subscription/purchase. */
	isPurchasedPremium: boolean;
	/** Whether the paywall has been shown post-onboarding. */
	hasSeenOnboardingPaywall: boolean;
	/** Count of app opens (for re-engagement paywall triggers). */
	appOpenCount: number;

	// ── Computed / actions ────────────────────────────────────────
	/** Start the reverse trial (call on first app open). */
	startTrial: () => void;
	/** Sync subscription status with RevenueCat. */
	syncWithRevenueCat: () => Promise<void>;
	/** Update from a CustomerInfo object (after purchase/restore). */
	updateFromCustomerInfo: (info: CustomerInfo) => void;
	/** Mark the onboarding paywall as shown. */
	markOnboardingPaywallSeen: () => void;
	/** Increment the app open counter. */
	incrementAppOpen: () => void;
	/** Check if the reverse trial is still active. */
	isTrialActive: () => boolean;
	/** Check if user has premium access (trial OR purchased). */
	hasPremiumAccess: () => boolean;
	/** Get trial days remaining (0 if expired). */
	trialDaysRemaining: () => number;
}

export const useSubscriptionStore = create<SubscriptionState>()(
	persist(
		(set, get) => ({
			trialStartedAt: null,
			isPurchasedPremium: false,
			hasSeenOnboardingPaywall: false,
			appOpenCount: 0,

			startTrial: () => {
				if (get().trialStartedAt) return; // Already started
				set({ trialStartedAt: new Date().toISOString() });
				capture("trial_started");
			},

			syncWithRevenueCat: async () => {
				const isPremium = await checkPremiumStatus();
				set({ isPurchasedPremium: isPremium });
			},

			updateFromCustomerInfo: (info: CustomerInfo) => {
				const isPremium =
					info.entitlements.active[PREMIUM_ENTITLEMENT] !== undefined;
				set({ isPurchasedPremium: isPremium });
				setPersonProperties({ is_premium: isPremium });
			},

			markOnboardingPaywallSeen: () => {
				set({ hasSeenOnboardingPaywall: true });
			},

			incrementAppOpen: () => {
				const prev = get();
				set((s) => ({ appOpenCount: s.appOpenCount + 1 }));
				// Fire trial lifecycle events
				if (prev.trialStartedAt && !prev.isPurchasedPremium) {
					const days = get().trialDaysRemaining();
					if (days === 0) {
						capture("trial_expired");
					} else if (days <= 2) {
						capture("trial_expiring_soon", { days_remaining: days });
					}
				}
			},

			isTrialActive: (): boolean => {
				const { trialStartedAt, isPurchasedPremium } = get();
				if (isPurchasedPremium) return false; // Not on trial, fully purchased
				if (!trialStartedAt) return false;
				const elapsed = Date.now() - new Date(trialStartedAt).getTime();
				return elapsed < TRIAL_DURATION_MS;
			},

			hasPremiumAccess: (): boolean => {
				const { isPurchasedPremium } = get();
				if (isPurchasedPremium) return true;
				return get().isTrialActive();
			},

			trialDaysRemaining: (): number => {
				const { trialStartedAt, isPurchasedPremium } = get();
				if (isPurchasedPremium) return 0;
				if (!trialStartedAt) return 0;
				const elapsed = Date.now() - new Date(trialStartedAt).getTime();
				const remaining = TRIAL_DURATION_MS - elapsed;
				return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
			},
		}),
		{
			name: "app-subscription",
			version: 1,
			storage: createJSONStorage(() => safeStorage),
			partialize: (state) => ({
				trialStartedAt: state.trialStartedAt,
				isPurchasedPremium: state.isPurchasedPremium,
				hasSeenOnboardingPaywall: state.hasSeenOnboardingPaywall,
				appOpenCount: state.appOpenCount,
			}),
			migrate: (persisted) => {
				const state = persisted as Record<string, unknown>;
				if (typeof state.appOpenCount !== "number") state.appOpenCount = 0;
				if (typeof state.hasSeenOnboardingPaywall !== "boolean") state.hasSeenOnboardingPaywall = false;
				return state;
			},
		},
	),
);
