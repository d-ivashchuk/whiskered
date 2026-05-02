import PostHog from "posthog-react-native";
import { useSettingsStore } from "@/lib/stores/settings-store";

// ── PostHog configuration ───────────────────────────────────────
export const POSTHOG_API_KEY =
	process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? "";

export const POSTHOG_HOST =
	process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

/**
 * Shared PostHog client for use outside React components (e.g. Zustand stores).
 * Created lazily on first access so the module can be imported without side effects
 * when the API key is absent.
 */
let _client: PostHog | null = null;

export function getPostHogClient(): PostHog | null {
	if (!POSTHOG_API_KEY) return null;
	if (!_client) {
		_client = new PostHog(POSTHOG_API_KEY, {
			host: POSTHOG_HOST,
			// No-op every call from dev/simulator builds so they don't pollute
			// the production project with duplicate users.
			disabled: __DEV__,
			// Only create person profiles for identified users (post-identify).
			// "always" creates a new person for every anonymous distinct_id,
			// which inflates the unique-user count on every clean install /
			// simulator reset / device-id rotation.
			personProfiles: "identified_only",
			enableSessionReplay: !__DEV__,
			// Flush quickly so events aren't lost when the app backgrounds
			flushAt: 5,
			flushInterval: 10_000, // 10 seconds
		});

		// Respect stored opt-out preference on init
		if (!useSettingsStore.getState().analyticsEnabled) {
			_client.optOut();
		}
	}
	return _client;
}

// Loose JSON-ish shape compatible with PostHog's PostHogEventProperties.
export type PostHogProperties = Record<string, string | number | boolean | null>;

/**
 * Capture an analytics event. No-ops when analytics are disabled or API key is missing.
 */
export function capture(event: string, properties?: PostHogProperties): void {
	const client = getPostHogClient();
	if (!client) return;
	client.capture(event, properties);
}

/**
 * Set person properties on the current anonymous user via $set.
 */
export function setPersonProperties(properties: PostHogProperties): void {
	const client = getPostHogClient();
	if (!client) return;
	client.capture("$set", { $set: properties } as unknown as PostHogProperties);
}
