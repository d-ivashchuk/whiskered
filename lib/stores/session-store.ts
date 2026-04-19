/**
 * Example app data store.
 *
 * Replace this with your app's domain-specific state (e.g. items, sessions,
 * entries). This demonstrates the Zustand + AsyncStorage persistence pattern
 * used throughout the template.
 */
import { capture } from "@/lib/services/posthog";
import { safeStorage } from "@/lib/stores/safe-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface AppItem {
	id: string;
	title: string;
	createdAt: string;
	status: "active" | "completed";
}

interface AppDataState {
	items: AppItem[];

	addItem: (title: string) => void;
	completeItem: (id: string) => void;
	removeItem: (id: string) => void;

	// Derived
	completedCount: () => number;
}

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useAppDataStore = create<AppDataState>()(
	persist(
		(set, get) => ({
			items: [],

			addItem: (title: string) => {
				const item: AppItem = {
					id: generateId(),
					title,
					createdAt: new Date().toISOString(),
					status: "active",
				};
				set((s) => ({ items: [item, ...s.items] }));
				capture("item_created", { title });
			},

			completeItem: (id: string) => {
				set((s) => ({
					items: s.items.map((item) =>
						item.id === id ? { ...item, status: "completed" as const } : item,
					),
				}));
				capture("item_completed");
			},

			removeItem: (id: string) => {
				set((s) => ({
					items: s.items.filter((item) => item.id !== id),
				}));
			},

			completedCount: () => {
				return get().items.filter((i) => i.status === "completed").length;
			},
		}),
		{
			name: "app-data",
			version: 1,
			storage: createJSONStorage(() => safeStorage),
			partialize: (state) => ({
				items: state.items,
			}),
		},
	),
);
