// Minimal react-native mock for Vitest (avoids Flow-typed index.js parse failure)
export const Platform = {
	OS: "ios" as const,
	select: <T>(obj: { ios?: T; android?: T; default?: T }) => obj.ios ?? obj.default,
};
export const NativeModules = {};
export const NativeEventEmitter = class {
	addListener() {}
	removeListeners() {}
};
export const StyleSheet = { create: <T>(s: T): T => s };
export const AppState = {
	currentState: "active" as const,
	addEventListener: () => ({ remove: () => {} }),
};
export const Dimensions = {
	get: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
	addEventListener: () => ({ remove: () => {} }),
};
export const PixelRatio = {
	get: () => 2,
	getFontScale: () => 1,
	getPixelSizeForLayoutSize: (size: number) => size * 2,
	roundToNearestPixel: (size: number) => size,
};
export const Alert = { alert: () => {} };
export const Linking = {
	openURL: async () => {},
	canOpenURL: async () => true,
	getInitialURL: async () => null,
	addEventListener: () => ({ remove: () => {} }),
};
export const Vibration = { vibrate: () => {}, cancel: () => {} };
export const Appearance = {
	getColorScheme: () => "light" as const,
	addChangeListener: () => ({ remove: () => {} }),
};
export default {
	Platform,
	NativeModules,
	NativeEventEmitter,
	StyleSheet,
	AppState,
	Dimensions,
	PixelRatio,
	Alert,
	Linking,
	Vibration,
	Appearance,
};
