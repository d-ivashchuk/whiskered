import { useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
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

const INITIAL_PAUSE = 300;
const ICON_ANIM_DURATION = 500;
const HOLD_DURATION = 800;
const FADE_OUT_DURATION = 400;

const ICON_SIZE = 180;
const BG_COLOR = "#1a1714";

// Use the actual app icon
const ICON_SOURCE = require("../assets/images/icon.png");

export function AnimatedSplash({ onComplete }: { onComplete: () => void }) {
	const containerOpacity = useSharedValue(1);
	const iconScale = useSharedValue(0.6);
	const iconOpacity = useSharedValue(0);
	const titleOpacity = useSharedValue(0);

	useEffect(() => {
		SplashScreen.hideAsync();

		// Icon: fade in + scale up with bounce
		iconOpacity.value = withDelay(
			INITIAL_PAUSE,
			withTiming(1, {
				duration: ICON_ANIM_DURATION,
				easing: Easing.out(Easing.cubic),
			}),
		);
		iconScale.value = withDelay(
			INITIAL_PAUSE,
			withSequence(
				withTiming(1.05, {
					duration: ICON_ANIM_DURATION * 0.7,
					easing: Easing.out(Easing.back(2)),
				}),
				withTiming(1, {
					duration: ICON_ANIM_DURATION * 0.3,
					easing: Easing.inOut(Easing.ease),
				}),
			),
		);

		// Title: fade in after icon
		titleOpacity.value = withDelay(
			INITIAL_PAUSE + ICON_ANIM_DURATION * 0.5,
			withTiming(1, { duration: 350 }),
		);

		// Fade out everything
		const fadeOutStart = INITIAL_PAUSE + ICON_ANIM_DURATION + HOLD_DURATION;
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
	}, [containerOpacity, iconScale, iconOpacity, titleOpacity, onComplete]);

	const containerStyle = useAnimatedStyle(() => ({
		opacity: containerOpacity.value,
	}));

	const iconStyle = useAnimatedStyle(() => ({
		opacity: iconOpacity.value,
		transform: [{ scale: iconScale.value }],
	}));

	const titleStyle = useAnimatedStyle(() => ({
		opacity: titleOpacity.value,
	}));

	return (
		<Animated.View style={[styles.container, containerStyle]}>
			<Animated.View style={[styles.iconWrapper, iconStyle]}>
				<Image
					source={ICON_SOURCE}
					style={styles.icon}
					resizeMode="contain"
				/>
			</Animated.View>
			<Animated.View style={titleStyle}>
				<Text style={styles.title}>Whiskered</Text>
			</Animated.View>
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
	icon: {
		width: ICON_SIZE,
		height: ICON_SIZE,
		borderRadius: ICON_SIZE * 0.22,
	},
	title: {
		marginTop: 28,
		fontSize: 22,
		fontWeight: "300",
		letterSpacing: 3,
		color: "rgba(249, 244, 236, 0.6)",
	},
});
