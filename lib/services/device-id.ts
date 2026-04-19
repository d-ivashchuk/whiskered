import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { v4 as uuidv4 } from "uuid";

const DEVICE_ID_KEY = "app_device_id";

/**
 * Returns a stable device UUID, persisted in Keychain (iOS) / Keystore (Android)
 * via expo-secure-store. Falls back to AsyncStorage, then a transient UUID
 * so the app never crashes over identification.
 */
export async function getOrCreateDeviceId(): Promise<string> {
	// 1. Try SecureStore (survives reinstalls on iOS)
	try {
		const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
		if (stored) return stored;

		// Check AsyncStorage in case we're migrating from a previous version
		const legacy = await AsyncStorage.getItem(DEVICE_ID_KEY).catch(
			() => null,
		);
		const id = legacy ?? uuidv4();

		await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
		return id;
	} catch {
		// SecureStore unavailable (e.g. web, or Keychain error)
	}

	// 2. Fall back to AsyncStorage
	try {
		const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
		if (stored) return stored;

		const id = uuidv4();
		await AsyncStorage.setItem(DEVICE_ID_KEY, id);
		return id;
	} catch {
		// AsyncStorage also failed
	}

	// 3. Last resort: transient UUID (unique per app launch, not persisted)
	return uuidv4();
}
