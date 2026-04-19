import { describe, expect, it, beforeEach, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";

vi.mock("@sentry/react-native", () => ({
	captureException: vi.fn(),
	captureMessage: vi.fn(),
}));

// Defaults applied to every new File instance. Tests can override before calling.
const fileDefaults = { exists: false, size: 0 };

// Track all File instances for assertions
const mockFileInstances: Array<{
	uri: string;
	exists: boolean;
	size: number;
	create: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	write: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("expo-file-system", () => {
	function MockFile(this: Record<string, unknown>, _base: string, name: string) {
		this.uri = `file:///mock/${name}`;
		this.exists = fileDefaults.exists;
		this.size = fileDefaults.size;
		this.create = vi.fn();
		this.delete = vi.fn();
		this.write = vi.fn();
		mockFileInstances.push(this as (typeof mockFileInstances)[number]);
	}
	return {
		File: MockFile,
		Paths: {
			document: "file:///mock/document",
			cache: "file:///mock/cache",
		},
	};
});

vi.mock("expo-sharing", () => ({
	shareAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/posthog", () => ({
	capture: vi.fn(),
}));

import * as Sentry from "@sentry/react-native";
import * as Sharing from "expo-sharing";
import { capture } from "@/lib/services/posthog";
import {
	createBackup,
	runDailyBackupIfNeeded,
	saveBackupToFile,
	shareBackup,
} from "@/lib/services/backup";

describe("backup service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFileInstances.length = 0;
		fileDefaults.exists = false;
		fileDefaults.size = 0;
	});

	// ── createBackup ─────────────────────────────────────────────

	describe("createBackup", () => {
		it("returns a valid backup envelope with all store data", async () => {
			vi.mocked(AsyncStorage.multiGet).mockResolvedValueOnce([
				["app-data", '{"items":[]}'],
				["app-settings", '{"hapticEnabled":true}'],
				["app-subscription", null],
			]);

			const envelope = await createBackup();

			expect(envelope.version).toBe(1);
			expect(envelope.createdAt).toBeTruthy();
			expect(new Date(envelope.createdAt).getTime()).not.toBeNaN();
			expect(envelope.stores["app-data"]).toEqual({ items: [] });
			expect(envelope.stores["app-settings"]).toEqual({ hapticEnabled: true });
			expect(envelope.stores["app-subscription"]).toBeUndefined();
		});

		it("includes raw string when a store value is not valid JSON", async () => {
			vi.mocked(AsyncStorage.multiGet).mockResolvedValueOnce([
				["app-data", "not-json"],
				["app-settings", null],
				["app-subscription", null],
			]);

			const envelope = await createBackup();
			expect(envelope.stores["app-data"]).toBe("not-json");
		});
	});

	// ── saveBackupToFile ─────────────────────────────────────────

	describe("saveBackupToFile", () => {
		it("refuses to overwrite a larger backup with significantly smaller data", async () => {
			// Configure File constructor to simulate an existing large backup on disk
			fileDefaults.exists = true;
			fileDefaults.size = 10000; // Existing backup is 10KB

			// Return empty stores (simulating post-crash cleared data)
			vi.mocked(AsyncStorage.multiGet).mockResolvedValueOnce([
				["app-data", null],
				["app-settings", null],
				["app-subscription", null],
			]);

			await saveBackupToFile();

			const file = mockFileInstances[0];
			expect(file).toBeDefined();
			// Should NOT have deleted or written — backup was skipped
			expect(file.delete).not.toHaveBeenCalled();
			expect(file.write).not.toHaveBeenCalled();
			expect(Sentry.captureMessage).toHaveBeenCalledWith(
				expect.stringContaining("smaller than existing"),
				expect.objectContaining({ level: "warning" }),
			);
		});
	});

	// ── runDailyBackupIfNeeded ────────────────────────────────────

	describe("runDailyBackupIfNeeded", () => {
		it("skips backup when last backup was recent", async () => {
			const recentTimestamp = String(Date.now() - 1000); // 1 second ago
			vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(recentTimestamp);

			await runDailyBackupIfNeeded();

			expect(AsyncStorage.multiGet).not.toHaveBeenCalled();
		});

		it("runs backup when last backup was >24h ago", async () => {
			const oldTimestamp = String(Date.now() - 25 * 60 * 60 * 1000);
			vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(oldTimestamp);
			vi.mocked(AsyncStorage.multiGet).mockResolvedValueOnce([
				["app-data", "{}"],
				["app-settings", "{}"],
				["app-subscription", "{}"],
			]);

			await runDailyBackupIfNeeded();

			expect(AsyncStorage.multiGet).toHaveBeenCalled();
			expect(AsyncStorage.setItem).toHaveBeenCalledWith(
				"app-last-backup",
				expect.any(String),
			);
		});

		it("runs backup when no previous backup exists", async () => {
			vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);
			vi.mocked(AsyncStorage.multiGet).mockResolvedValueOnce([
				["app-data", "{}"],
				["app-settings", "{}"],
				["app-subscription", "{}"],
			]);

			await runDailyBackupIfNeeded();

			expect(AsyncStorage.multiGet).toHaveBeenCalled();
			expect(AsyncStorage.setItem).toHaveBeenCalledWith(
				"app-last-backup",
				expect.any(String),
			);
		});

		it("catches errors and reports to Sentry", async () => {
			const testError = new Error("storage failed");
			vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(testError);

			await runDailyBackupIfNeeded(); // should not throw

			expect(Sentry.captureException).toHaveBeenCalledWith(testError, {
				tags: { service: "backup", action: "daily_backup" },
			});
		});
	});

	// ── shareBackup ──────────────────────────────────────────────

	describe("shareBackup", () => {
		it("creates a file and opens the share sheet", async () => {
			vi.mocked(AsyncStorage.multiGet).mockResolvedValueOnce([
				["app-data", '{"items":[]}'],
				["app-settings", "{}"],
				["app-subscription", "{}"],
			]);

			await shareBackup();

			expect(Sharing.shareAsync).toHaveBeenCalledWith(
				expect.stringContaining("app-backup-"),
				expect.objectContaining({
					mimeType: "application/json",
				}),
			);
			expect(capture).toHaveBeenCalledWith("data_exported");
		});
	});
});
