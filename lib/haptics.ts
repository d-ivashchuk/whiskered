import * as Haptics from "expo-haptics";
import { useSettingsStore } from "@/lib/stores/settings-store";

/** Trigger impact haptic feedback, respecting the user's hapticEnabled setting. */
export function triggerImpact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
	if (!useSettingsStore.getState().hapticEnabled) return;
	Haptics.impactAsync(style);
}

/** Trigger notification haptic feedback, respecting the user's hapticEnabled setting. */
export function triggerNotification(type: Haptics.NotificationFeedbackType) {
	if (!useSettingsStore.getState().hapticEnabled) return;
	Haptics.notificationAsync(type);
}
