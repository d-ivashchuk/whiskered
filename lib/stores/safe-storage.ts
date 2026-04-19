import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";
import type { StateStorage } from "zustand/middleware";

/**
 * A wrapper around AsyncStorage that catches deserialization errors during
 * store hydration.  When persisted state is corrupted or incompatible with a
 * new app version, the default `createJSONStorage` will throw during
 * `JSON.parse`, which can crash the app before Sentry's React error boundary
 * has mounted.
 *
 * This wrapper catches those errors, reports them to Sentry, clears the
 * corrupt key, and returns `null` so the store falls back to its defaults.
 */
export const safeStorage: StateStorage = {
	getItem: async (name: string): Promise<string | null> => {
		try {
			return await AsyncStorage.getItem(name);
		} catch (error) {
			Sentry.captureException(error, {
				tags: { store: name, phase: "getItem" },
			});
			// Clear the corrupt entry so the next launch starts fresh
			try {
				await AsyncStorage.removeItem(name);
			} catch {
				// Best-effort cleanup
			}
			return null;
		}
	},
	setItem: async (name: string, value: string): Promise<void> => {
		try {
			await AsyncStorage.setItem(name, value);
		} catch (error) {
			Sentry.captureException(error, {
				tags: { store: name, phase: "setItem" },
			});
		}
	},
	removeItem: async (name: string): Promise<void> => {
		try {
			await AsyncStorage.removeItem(name);
		} catch (error) {
			Sentry.captureException(error, {
				tags: { store: name, phase: "removeItem" },
			});
		}
	},
};
