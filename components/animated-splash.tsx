import { useEffect, useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
	Easing,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import * as SplashScreen from "expo-splash-screen";

const INITIAL_PAUSE = 300;
const ICON_ANIM_DURATION = 500;
const HOLD_DURATION = 1600;
const FADE_OUT_DURATION = 400;

const ICON_SIZE = 180;
const BG_COLOR = "#1a1714";

const SUBTITLE = "unofficial mewgenics companion";

// Pre-baked per-letter skew angles (degrees) — alternating tilts for that wonky feel
const LETTER_SKEWS = [
	-4, 3, -2, 5, -3, 2, -5, 4, -2, 3, // unofficial
	0, // space
	-3, 5, -4, 2, -5, 3, -2, 4, -3, // mewgenics
	0, // space
	3, -4, 2, -5, 4, -2, 5, -3, 4, // companion
];

const ICON_SOURCE = require("../assets/images/icon.png");

function AnimatedLetter({
	char,
	index,
	skew,
	startDelay,
	fontsLoaded,
}: {
	char: string;
	index: number;
	skew: number;
	startDelay: number;
	fontsLoaded: boolean;
}) {
	const opacity = useSharedValue(0);
	const translateY = useSharedValue(8);
	const rotate = useSharedValue(0);
	const wobble = useSharedValue(0);

	useEffect(() => {
		if (!fontsLoaded) return;

		const letterDelay = startDelay + index * 25;

		// Pop in
		opacity.value = withDelay(
			letterDelay,
			withTiming(1, { duration: 200 }),
		);
		translateY.value = withDelay(
			letterDelay,
			withTiming(0, { duration: 300, easing: Easing.out(Easing.back(1.5)) }),
		);
		// Snap to skewed rotation
		rotate.value = withDelay(
			letterDelay,
			withTiming(skew, { duration: 300, easing: Easing.out(Easing.cubic) }),
		);
		// Gentle idle wobble
		wobble.value = withDelay(
			letterDelay + 300,
			withRepeat(
				withSequence(
					withTiming(1.5, { duration: 800 + index * 40, easing: Easing.inOut(Easing.ease) }),
					withTiming(-1.5, { duration: 800 + index * 40, easing: Easing.inOut(Easing.ease) }),
				),
				-1,
				true,
			),
		);
	}, [fontsLoaded, opacity, translateY, rotate, wobble, startDelay, index, skew]);

	const style = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [
			{ translateY: translateY.value },
			{ rotate: `${rotate.value + wobble.value}deg` },
		],
	}));

	if (char === " ") {
		return <View style={{ width: 5 }} />;
	}

	return (
		<Animated.Text
			style={[
				{
					fontSize: 22,
					fontFamily: "FredokaOne",
					color: "rgba(249, 244, 236, 0.4)",
				},
				style,
			]}
		>
			{char}
		</Animated.Text>
	);
}

export function AnimatedSplash({
	onComplete,
	fontsLoaded,
}: {
	onComplete: () => void;
	fontsLoaded: boolean;
}) {
	const containerOpacity = useSharedValue(1);
	const iconScale = useSharedValue(0.6);
	const iconOpacity = useSharedValue(0);
	const titleOpacity = useSharedValue(0);

	const subtitleStart = INITIAL_PAUSE + ICON_ANIM_DURATION * 0.8;

	const letters = useMemo(
		() =>
			SUBTITLE.split("").map((char, i) => ({
				char,
				skew: LETTER_SKEWS[i % LETTER_SKEWS.length],
			})),
		[],
	);

	useEffect(() => {
		if (!fontsLoaded) return;

		SplashScreen.hideAsync();

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

		titleOpacity.value = withDelay(
			INITIAL_PAUSE + ICON_ANIM_DURATION * 0.5,
			withTiming(1, { duration: 350 }),
		);

		// Wait for last letter to finish before fading out
		const lastLetterDone = subtitleStart + SUBTITLE.length * 25 + 300;
		const fadeOutStart = lastLetterDone + 600;
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
	}, [fontsLoaded, containerOpacity, iconScale, iconOpacity, titleOpacity, onComplete]);

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
			<View style={styles.subtitleRow}>
				{letters.map((l, i) => (
					<AnimatedLetter
						key={i}
						char={l.char}
						index={i}
						skew={l.skew}
						startDelay={subtitleStart}
						fontsLoaded={fontsLoaded}
					/>
				))}
			</View>
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
	subtitleRow: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 14,
		paddingHorizontal: 20,
	},
});
