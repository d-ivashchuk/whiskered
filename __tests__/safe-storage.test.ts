import { describe, expect, it, beforeEach, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeStorage } from "@/lib/stores/safe-storage";

// Sentry is mocked via setup.ts transitively, but let's be explicit
vi.mock("@sentry/react-native", () => ({
	captureException: vi.fn(),
}));

// Re-import so we can spy on it
import * as Sentry from "@sentry/react-native";

describe("safeStorage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ─── getItem ──────────────────────────────────────────────────

	describe("getItem", () => {
		it("returns value from AsyncStorage on success", async () => {
			vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce('{"sessions":[]}');
			const result = await safeStorage.getItem("app-data");
			expect(result).toBe('{"sessions":[]}');
			expect(AsyncStorage.getItem).toHaveBeenCalledWith("app-data");
		});

		it("returns null when key does not exist", async () => {
			vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);
			const result = await safeStorage.getItem("nonexistent");
			expect(result).toBeNull();
		});

		it("returns null and reports to Sentry when AsyncStorage throws", async () => {
			const error = new Error("SQLite corruption");
			vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(error);
			vi.mocked(AsyncStorage.removeItem).mockResolvedValueOnce(undefined);

			const result = await safeStorage.getItem("app-data");

			expect(result).toBeNull();
			expect(Sentry.captureException).toHaveBeenCalledWith(error, {
				tags: { store: "app-data", phase: "getItem" },
			});
		});

		it("clears the corrupt key when AsyncStorage throws", async () => {
			vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("corrupt"));
			vi.mocked(AsyncStorage.removeItem).mockResolvedValueOnce(undefined);

			await safeStorage.getItem("app-data");

			expect(AsyncStorage.removeItem).toHaveBeenCalledWith("app-data");
		});

		it("still returns null even if removeItem also fails", async () => {
			vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("corrupt"));
			vi.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error("remove failed too"));

			const result = await safeStorage.getItem("app-data");
			expect(result).toBeNull();
		});
	});

	// ─── setItem ──────────────────────────────────────────────────

	describe("setItem", () => {
		it("delegates to AsyncStorage.setItem", async () => {
			vi.mocked(AsyncStorage.setItem).mockResolvedValueOnce(undefined);
			await safeStorage.setItem("app-data", '{"sessions":[]}');
			expect(AsyncStorage.setItem).toHaveBeenCalledWith("app-data", '{"sessions":[]}');
		});

		it("reports to Sentry on write failure but does not throw", async () => {
			const error = new Error("disk full");
			vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(error);

			// Should not throw
			await safeStorage.setItem("app-data", "data");

			expect(Sentry.captureException).toHaveBeenCalledWith(error, {
				tags: { store: "app-data", phase: "setItem" },
			});
		});
	});

	// ─── removeItem ───────────────────────────────────────────────

	describe("removeItem", () => {
		it("delegates to AsyncStorage.removeItem", async () => {
			vi.mocked(AsyncStorage.removeItem).mockResolvedValueOnce(undefined);
			await safeStorage.removeItem("app-data");
			expect(AsyncStorage.removeItem).toHaveBeenCalledWith("app-data");
		});

		it("reports to Sentry on failure but does not throw", async () => {
			const error = new Error("remove failed");
			vi.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(error);

			await safeStorage.removeItem("app-data");

			expect(Sentry.captureException).toHaveBeenCalledWith(error, {
				tags: { store: "app-data", phase: "removeItem" },
			});
		});
	});
});
