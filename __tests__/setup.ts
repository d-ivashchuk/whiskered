import { vi } from "vitest";

// Mock AsyncStorage for Zustand persist middleware
vi.mock("@react-native-async-storage/async-storage", () => ({
	default: {
		getItem: vi.fn(() => Promise.resolve(null)),
		setItem: vi.fn(() => Promise.resolve()),
		removeItem: vi.fn(() => Promise.resolve()),
		clear: vi.fn(() => Promise.resolve()),
		getAllKeys: vi.fn(() => Promise.resolve([])),
		multiGet: vi.fn(() => Promise.resolve([])),
		multiSet: vi.fn(() => Promise.resolve()),
		multiRemove: vi.fn(() => Promise.resolve()),
	},
}));

// Mock expo modules that may be transitively imported
vi.mock("expo-haptics", () => ({
	impactAsync: vi.fn(),
	notificationAsync: vi.fn(),
	selectionAsync: vi.fn(),
}));

vi.mock("expo-file-system", () => ({
	documentDirectory: "/mock/",
	writeAsStringAsync: vi.fn(),
	readAsStringAsync: vi.fn(),
	deleteAsync: vi.fn(),
	makeDirectoryAsync: vi.fn(),
	getInfoAsync: vi.fn(() => Promise.resolve({ exists: false })),
}));

vi.mock("expo-sharing", () => ({
	isAvailableAsync: vi.fn(() => Promise.resolve(false)),
	shareAsync: vi.fn(),
}));

vi.mock("expo-notifications", () => ({
	getPermissionsAsync: vi.fn(() =>
		Promise.resolve({ status: "undetermined" }),
	),
	requestPermissionsAsync: vi.fn(() =>
		Promise.resolve({ status: "granted" }),
	),
	scheduleNotificationAsync: vi.fn(() => Promise.resolve("mock-id")),
	cancelAllScheduledNotificationsAsync: vi.fn(() => Promise.resolve()),
	setNotificationHandler: vi.fn(),
}));

// Mock @sentry/react-native (imports real react-native transitively)
vi.mock("@sentry/react-native", () => ({
	captureException: vi.fn(),
	captureMessage: vi.fn(),
	init: vi.fn(),
	wrap: (c: unknown) => c,
	withScope: vi.fn(),
	addBreadcrumb: vi.fn(),
}));

// Mock react-native-purchases (imports real react-native transitively)
vi.mock("react-native-purchases", () => ({
	Purchases: {
		configure: vi.fn(),
		getCustomerInfo: vi.fn(() => Promise.resolve({ entitlements: { active: {} } })),
		getOfferings: vi.fn(() => Promise.resolve({ current: null })),
		purchasePackage: vi.fn(),
		restorePurchases: vi.fn(() => Promise.resolve({ entitlements: { active: {} } })),
	},
	LOG_LEVEL: { DEBUG: 0 },
}));

// Mock posthog-react-native (native SDK not available in Node test env)
vi.mock("posthog-react-native", () => {
	const mock = {
		capture: vi.fn(),
		identify: vi.fn(),
		reset: vi.fn(),
		optIn: vi.fn(),
		optOut: vi.fn(),
		screen: vi.fn(),
		flush: vi.fn(),
	};
	return { default: vi.fn(() => mock), PostHog: vi.fn(() => mock) };
});
