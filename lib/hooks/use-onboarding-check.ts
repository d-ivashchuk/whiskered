import { useSettingsStore } from "@/lib/stores/settings-store";

type OnboardingStatus = "loading" | "needs_onboarding" | "complete";

/**
 * Signal onboarding completion. Kept as a named export so the onboarding
 * screen can call it once the flow is done.
 */
export function completeOnboarding() {
  useSettingsStore.getState().setOnboardingCompleted();
}

/**
 * Returns onboarding status based on the local settings store flag.
 * No backend round-trip — the template stays dependency-free.
 */
export function useOnboardingCheck(_userId: string | undefined): OnboardingStatus {
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted);
  return onboardingCompleted ? "complete" : "needs_onboarding";
}
