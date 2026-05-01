import { safeStorage } from "@/lib/stores/safe-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface OnboardingState {
	/** True once the user has finished (or skipped) the intro flow at least once. */
	hasSeenIntro: boolean;
	setHasSeenIntro: (seen: boolean) => void;
	/** Reset back to first-launch state — used by the "Show intro again" row in Settings. */
	resetIntro: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
	persist(
		(set) => ({
			hasSeenIntro: false,
			setHasSeenIntro: (seen: boolean) => set({ hasSeenIntro: seen }),
			resetIntro: () => set({ hasSeenIntro: false }),
		}),
		{
			name: "app-onboarding",
			version: 1,
			storage: createJSONStorage(() => safeStorage),
		},
	),
);
