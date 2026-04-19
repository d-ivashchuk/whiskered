import { useColorScheme } from "nativewind";

const lightColors = {
	primary: "hsl(240, 5.9%, 10%)",
	primaryForeground: "hsl(0, 0%, 98%)",
	foreground: "hsl(240, 10%, 3.9%)",
	mutedForeground: "hsl(240, 3.8%, 46.1%)",
	background: "hsl(0, 0%, 100%)",
	card: "hsl(0, 0%, 100%)",
	border: "hsl(240, 5.9%, 90%)",
	destructive: "hsl(0, 84.2%, 60.2%)",
	destructiveForeground: "hsl(0, 0%, 98%)",
	secondary: "hsl(240, 4.8%, 95.9%)",
	secondaryForeground: "hsl(240, 5.9%, 10%)",
	crown: "hsl(45, 80%, 50%)",
	crownDark: "hsl(45, 80%, 40%)",
	flame: "hsl(25, 70%, 50%)",
	gold: "hsl(40, 55%, 55%)",
	goldMuted: "hsl(40, 40%, 75%)",
	sliderTrack: "hsl(240, 5.9%, 90%)",
	switchTrack: "hsl(240, 5%, 85%)",
	switchActive: "hsl(142, 71%, 45%)",
};

const darkColors = {
	primary: "hsl(0, 0%, 98%)",
	primaryForeground: "hsl(240, 5.9%, 10%)",
	foreground: "hsl(0, 0%, 98%)",
	mutedForeground: "hsl(240, 5%, 64.9%)",
	background: "hsl(240, 10%, 3.9%)",
	card: "hsl(240, 10%, 3.9%)",
	border: "hsl(240, 3.7%, 15.9%)",
	destructive: "hsl(0, 62.8%, 30.6%)",
	destructiveForeground: "hsl(0, 0%, 98%)",
	secondary: "hsl(240, 3.7%, 15.9%)",
	secondaryForeground: "hsl(0, 0%, 98%)",
	crown: "hsl(45, 80%, 50%)",
	crownDark: "hsl(45, 80%, 40%)",
	flame: "hsl(25, 70%, 55%)",
	gold: "hsl(40, 55%, 55%)",
	goldMuted: "hsl(40, 35%, 40%)",
	sliderTrack: "hsl(240, 3.7%, 20%)",
	switchTrack: "hsl(240, 4%, 30%)",
	switchActive: "hsl(142, 71%, 45%)",
};

export type ThemeColors = typeof lightColors;

/** Returns HSL color strings matching the current color scheme. */
export function useThemeColors(): ThemeColors {
	const { colorScheme } = useColorScheme();
	return colorScheme === "dark" ? darkColors : lightColors;
}

/** Returns true when the current color scheme is dark. */
export function useIsDark(): boolean {
	const { colorScheme } = useColorScheme();
	return colorScheme === "dark";
}
