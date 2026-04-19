import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	define: {
		__DEV__: true,
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "."),
			"react-native": path.resolve(__dirname, "__tests__/mocks/react-native.ts"),
		},
	},
	test: {
		globals: true,
		environment: "node",
		include: ["__tests__/**/*.test.ts"],
		setupFiles: ["__tests__/setup.ts"],
	},
});
