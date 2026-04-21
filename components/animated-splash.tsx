import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path, Ellipse } from "react-native-svg";
import Animated, {
	Easing,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import * as SplashScreen from "expo-splash-screen";

// Wobbly hand-drawn toe bean paths (viewBox 0 0 100 100, scaled from 1024)
const TOE_BEAN_PATHS = [
	// top-left
	"M 30.3 42 C 28.8 39, 27.3 35.6, 27.8 32.7 C 28.3 29.3, 30.3 26.9, 33.2 26.2 C 36.1 25.4, 38.6 27.3, 39.6 30.3 C 40.6 33.2, 40.2 36.9, 39.1 39.8 C 37.9 42.5, 34.7 43.9, 32.2 43.8 C 30.8 43.6, 30.3 43, 30.3 42 Z",
	// top-center-left
	"M 42 36.1 C 41.2 32.7, 41 28.8, 41.8 25.6 C 42.6 22.5, 44.1 20.5, 46.4 20.3 C 48.8 20.1, 50.6 22, 51.2 25.2 C 51.8 28.3, 51.6 32.2, 50.8 35.6 C 50 38.6, 48.1 40, 45.9 39.8 C 43.8 39.6, 42.5 38.3, 42 36.1 Z",
	// top-center-right
	"M 53.5 25.6 C 52.9 22.5, 53.7 20.5, 55.9 20.3 C 58.2 20.1, 59.9 22, 60.5 25.2 C 61.1 28.8, 60.9 32.7, 60.2 35.6 C 59.4 38.3, 57.8 40, 55.9 40.1 C 53.7 40.3, 52.7 38.6, 52.2 36.1 C 51.8 33.7, 52.3 30.3, 52.7 28.3 C 53.1 26.9, 53.3 26.2, 53.5 25.6 Z",
	// top-right
	"M 65.4 30.3 C 64.5 27.3, 64.9 25.4, 67.4 26.2 C 70.1 26.9, 72.3 29.3, 72.8 32.7 C 73.2 35.6, 72.5 39.1, 71.1 41.8 C 69.8 43.9, 67.9 44.4, 65.9 43.5 C 64 42.5, 63 39.8, 63 37.1 C 63 34.7, 64 32.2, 64.9 30.8 Z",
];

// Main pad path
const MAIN_PAD_PATH =
	"M 39.6 53.2 C 37.6 54.5, 35.2 57.6, 34.7 61 C 34 65.2, 35 69.8, 37.6 73 C 39.8 75.7, 43.5 77.6, 47.9 78.1 C 50.8 78.5, 53.5 78.1, 56.2 77.1 C 60.1 75.7, 63.3 73, 64.6 69.8 C 66.2 66.2, 65.9 62.5, 64.6 59.4 C 63.3 56.2, 60.7 53.9, 57.6 52.7 C 54.5 51.6, 50.8 51.8, 47.7 52.2 C 43.9 52.9, 40.8 52.9, 39.6 53.2 Z";

const OUTLINE_COLOR = "#3d3530";
const BEAN_FILL = "#d4a67a";
const STROKE_WIDTH = 2.8;

const INITIAL_PAUSE = 400;
const STAGGER_DELAY = 120;
const BEAN_ANIM_DURATION = 400;
const HOLD_DURATION = 600;
const FADE_OUT_DURATION = 400;

const ICON_SIZE = 180;
const BG_COLOR = "#1a1714";

function Bean({ index, path }: { index: number; path: string }) {
	const opacity = useSharedValue(0);
	const scale = useSharedValue(0.3);

	useEffect(() => {
		const delay = INITIAL_PAUSE + index * STAGGER_DELAY;

		opacity.value = withDelay(
			delay,
			withTiming(1, {
				duration: BEAN_ANIM_DURATION,
				easing: Easing.out(Easing.cubic),
			}),
		);
		scale.value = withDelay(
			delay,
			withSequence(
				withTiming(1.15, {
					duration: BEAN_ANIM_DURATION * 0.6,
					easing: Easing.out(Easing.back(2.5)),
				}),
				withTiming(1, {
					duration: BEAN_ANIM_DURATION * 0.4,
					easing: Easing.inOut(Easing.ease),
				}),
			),
		);
	}, [index, opacity, scale]);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [{ scale: scale.value }],
	}));

	return (
		<Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
			<Svg width="100%" height="100%" viewBox="0 0 100 100">
				<Path
					d={path}
					fill={BEAN_FILL}
					stroke={OUTLINE_COLOR}
					strokeWidth={STROKE_WIDTH}
					strokeLinejoin="round"
					strokeLinecap="round"
				/>
			</Svg>
		</Animated.View>
	);
}

export function AnimatedSplash({ onComplete }: { onComplete: () => void }) {
	const containerOpacity = useSharedValue(1);
	const padScale = useSharedValue(0);
	const padOpacity = useSharedValue(0);

	useEffect(() => {
		SplashScreen.hideAsync();

		const padDelay = INITIAL_PAUSE + TOE_BEAN_PATHS.length * STAGGER_DELAY;
		padOpacity.value = withDelay(
			padDelay,
			withTiming(1, { duration: 350 }),
		);
		padScale.value = withDelay(
			padDelay,
			withSequence(
				withTiming(1.1, {
					duration: 350,
					easing: Easing.out(Easing.back(2)),
				}),
				withTiming(1, {
					duration: 200,
					easing: Easing.inOut(Easing.ease),
				}),
			),
		);

		const fadeOutStart =
			INITIAL_PAUSE +
			TOE_BEAN_PATHS.length * STAGGER_DELAY +
			BEAN_ANIM_DURATION +
			HOLD_DURATION;

		const timeout = setTimeout(() => {
			containerOpacity.value = withTiming(
				0,
				{ duration: FADE_OUT_DURATION },
				(finished) => {
					if (finished) {
						runOnJS(onComplete)();
					}
				},
			);
		}, fadeOutStart);

		return () => clearTimeout(timeout);
	}, [containerOpacity, padScale, padOpacity, onComplete]);

	const containerStyle = useAnimatedStyle(() => ({
		opacity: containerOpacity.value,
	}));

	const padStyle = useAnimatedStyle(() => ({
		opacity: padOpacity.value,
		transform: [{ scale: padScale.value }],
	}));

	return (
		<Animated.View style={[styles.container, containerStyle]}>
			<View style={styles.iconWrapper}>
				{TOE_BEAN_PATHS.map((path, i) => (
					<Bean key={i} index={i} path={path} />
				))}

				{/* Main pad */}
				<Animated.View style={[StyleSheet.absoluteFill, padStyle]}>
					<Svg width="100%" height="100%" viewBox="0 0 100 100">
						<Path
							d={MAIN_PAD_PATH}
							fill={BEAN_FILL}
							stroke={OUTLINE_COLOR}
							strokeWidth={STROKE_WIDTH + 0.2}
							strokeLinejoin="round"
							strokeLinecap="round"
						/>
					</Svg>
				</Animated.View>
			</View>
			<Text style={styles.title}>
				Whisk<Text style={styles.titleAccent}>ered</Text>
			</Text>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFillObject,
		justifyContent: "center",
		alignItems: "center",
		zIndex: 999,
		backgroundColor: BG_COLOR,
	},
	iconWrapper: {
		width: ICON_SIZE,
		height: ICON_SIZE,
	},
	title: {
		marginTop: 28,
		fontSize: 22,
		fontWeight: "300",
		letterSpacing: 3,
		color: "rgba(249, 244, 236, 0.6)",
	},
	titleAccent: {
		color: "rgba(249, 244, 236, 0.9)",
	},
});
