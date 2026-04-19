/**
 * Daily backup & data export service.
 *
 * Backs up all Zustand store data to the filesystem so there is always a
 * recent copy to fall back on if AsyncStorage is corrupted.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Sentry from "@sentry/react-native";
import { capture } from "@/lib/services/posthog";

// ── Constants ────────────────────────────────────────────────────

const STORE_KEYS = [
	"app-data",
	"app-settings",
	"app-subscription",
	"birth-profile",
] as const;

const LAST_BACKUP_KEY = "app-last-backup";
const BACKUP_FILENAME = "app-backup.json";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// ── Types ────────────────────────────────────────────────────────

export interface BackupEnvelope {
	version: 1;
	createdAt: string;
	stores: Record<string, unknown>;
}

// ── Core functions ───────────────────────────────────────────────

/**
 * Read all store keys from AsyncStorage and wrap them in a JSON envelope.
 */
export async function createBackup(): Promise<BackupEnvelope> {
	const pairs = await AsyncStorage.multiGet([...STORE_KEYS]);
	const stores: Record<string, unknown> = {};

	for (const [key, value] of pairs) {
		if (value !== null) {
			try {
				stores[key] = JSON.parse(value);
			} catch {
				stores[key] = value;
			}
		}
	}

	return {
		version: 1,
		createdAt: new Date().toISOString(),
		stores,
	};
}

/**
 * Write a backup envelope to the document directory (survives app updates).
 * Overwrites the previous backup — single rolling file.
 *
 * Safety: refuses to overwrite a larger backup with significantly smaller data.
 */
export async function saveBackupToFile(): Promise<void> {
	const envelope = await createBackup();
	const json = JSON.stringify(envelope, null, 2);
	const newSize = json.length;

	const file = new File(Paths.document, BACKUP_FILENAME);
	if (file.exists) {
		const existingSize = file.size;

		if (existingSize > 0 && newSize < existingSize * 0.5) {
			Sentry.captureMessage("Backup skipped: new data significantly smaller than existing backup", {
				level: "warning",
				tags: { service: "backup" },
				extra: { existingSize, newSize },
			});
			return;
		}

		file.delete();
	}

	file.create();
	file.write(json);
}

/**
 * Run the daily backup if more than 24 hours have elapsed since the last one.
 * Silent — never throws.
 */
export async function runDailyBackupIfNeeded(): Promise<void> {
	try {
		const lastBackup = await AsyncStorage.getItem(LAST_BACKUP_KEY);
		if (lastBackup) {
			const elapsed = Date.now() - Number(lastBackup);
			if (elapsed < TWENTY_FOUR_HOURS_MS) return;
		}

		await saveBackupToFile();
		await AsyncStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
	} catch (error: unknown) {
		Sentry.captureException(error, {
			tags: { service: "backup", action: "daily_backup" },
		});
	}
}

/**
 * Create a timestamped backup in the cache directory and open the native
 * share sheet so the user can export it.
 */
export async function shareBackup(): Promise<void> {
	try {
		const envelope = await createBackup();
		const json = JSON.stringify(envelope, null, 2);
		const date = new Date().toISOString().slice(0, 10);
		const filename = `app-backup-${date}.json`;

		const file = new File(Paths.cache, filename);
		if (file.exists) {
			file.delete();
		}
		file.create();
		file.write(json);

		await Sharing.shareAsync(file.uri, {
			mimeType: "application/json",
			dialogTitle: "Export app data",
			UTI: "public.json",
		});

		capture("data_exported");
	} catch (error: unknown) {
		Sentry.captureException(error, {
			tags: { service: "backup", action: "share_backup" },
		});
		throw error;
	}
}
