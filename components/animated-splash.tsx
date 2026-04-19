import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
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

// 8 spikes with varied lengths radiating from center (50,50)
const SPIKES: string[] = [
	"M50 50 L48 38 L50 2 L52 38 Z",    // top (longest)
	"M50 50 L55 41 L82 14 L59 45 Z",   // top-right (shorter)
	"M50 50 L62 48 L98 50 L62 52 Z",   // right (longest)
	"M50 50 L59 55 L85 80 L55 59 Z",   // bottom-right (short)
	"M50 50 L52 62 L50 96 L48 62 Z",   // bottom (long)
	"M50 50 L45 59 L20 82 L41 55 Z",   // bottom-left (shorter)
	"M50 50 L38 52 L4 50 L38 48 Z",    // left (long)
	"M50 50 L41 45 L18 18 L45 41 Z",   // top-left (short)
];

const INITIAL_PAUSE = 400; // brief dark screen before animation starts
const STAGGER_DELAY = 90;
const RAY_ANIM_DURATION = 450;
const HOLD_DURATION = 600;
const FADE_OUT_DURATION = 400;

const ICON_SIZE = 180;

const BG_COLOR = "#1a1714";
const SPIKE_COLOR = "rgba(249, 244, 236, 0.75)";
const DOT_COLOR = "#f9f4ec";

function Spike({ index, path }: { index: number; path: string }) {
	const opacity = useSharedValue(0);
	const scale = useSharedValue(0.2);

	useEffect(() => {
		const delay = INITIAL_PAUSE + index * STAGGER_DELAY;

		opacity.value = withDelay(
			delay,
			withTiming(1, {
				duration: RAY_ANIM_DURATION,
				easing: Easing.out(Easing.cubic),
			}),
		);
		scale.value = withDelay(
			delay,
			withSequence(
				withTiming(1.12, {
					duration: RAY_ANIM_DURATION * 0.65,
					easing: Easing.out(Easing.back(2.5)),
				}),
				withTiming(1, {
					duration: RAY_ANIM_DURATION * 0.35,
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
				<Path d={path} fill={SPIKE_COLOR} />
			</Svg>
		</Animated.View>
	);
}

export function AnimatedSplash({ onComplete }: { onComplete: () => void }) {
	const containerOpacity = useSharedValue(1);
	const centerScale = useSharedValue(0);
	const centerOpacity = useSharedValue(0);

	useEffect(() => {
		SplashScreen.hideAsync();

		// Center dot appears after spikes start
		const centerDelay = INITIAL_PAUSE + SPIKES.length * STAGGER_DELAY * 0.4;
		centerOpacity.value = withDelay(
			centerDelay,
			withTiming(1, { duration: 300 }),
		);
		centerScale.value = withDelay(
			centerDelay,
			withTiming(1, {
				duration: 400,
				easing: Easing.out(Easing.back(1.8)),
			}),
		);

		const fadeOutStart =
			INITIAL_PAUSE +
			(SPIKES.length - 1) * STAGGER_DELAY +
			RAY_ANIM_DURATION +
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
	}, [containerOpacity, centerScale, centerOpacity, onComplete]);

	const containerStyle = useAnimatedStyle(() => ({
		opacity: containerOpacity.value,
	}));

	const centerStyle = useAnimatedStyle(() => ({
		opacity: centerOpacity.value,
		transform: [{ scale: centerScale.value }],
	}));

	return (
		<Animated.View style={[styles.container, containerStyle]}>
			<View style={styles.iconWrapper}>
				{SPIKES.map((path, i) => (
					<Spike key={i} index={i} path={path} />
				))}

				{/* Center dot */}
				<Animated.View style={[StyleSheet.absoluteFill, centerStyle]}>
					<Svg width="100%" height="100%" viewBox="0 0 100 100">
						<Circle cx="50" cy="50" r="3" fill={DOT_COLOR} />
					</Svg>
				</Animated.View>
			</View>
			<Text style={styles.title}>
				Stern<Text style={styles.titleAccent}>zeit</Text>
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
