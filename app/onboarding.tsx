import { PaperGrid } from "@/components/onboarding/paper-grid";
import { Text } from "@/components/ui/text";
import { useOnboardingStore } from "@/lib/stores/onboarding-store";
import { capture } from "@/lib/services/posthog";
import { triggerImpact } from "@/lib/haptics";
import * as Haptics from "expo-haptics";
import { Heart, WifiOff } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Image, Pressable, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

// PaperGrid keeps its warm cream. Text/UI use the app's neutral palette.
const PAPER_FILL = "#F8DC8E";
const PAPER_GRID = "#E8B45A";
const FG = "#09090B";
const FG_MUTED = "#71717A";
const PRIMARY_BG = "#18181B";

const APP_ICON = require("../assets/images/icon.png");
const ITEM_DETAIL_SCREENSHOT = require("../assets/images/onboarding/item-detail.png");
const BOSS_GUIDE_SCREENSHOT = require("../assets/images/onboarding/boss-guide.png");
const SCANNER_VIDEO = require("../assets/images/onboarding/scanner-demo.mp4");

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const FRAME_HORIZONTAL_PAD = 24;
const FRAME_WIDTH = SCREEN_WIDTH - FRAME_HORIZONTAL_PAD * 2;
// Screenshots are 1290x2796 — compute the full-width height at natural ratio
const SCREENSHOT_FULL_HEIGHT = FRAME_WIDTH * (2796 / 1290);
const FRAME_MAX_HEIGHT = SCREEN_HEIGHT * 0.5;

type MediaKind = "none" | "video" | "screenshot-item" | "screenshot-boss" | "offline" | "indie";

interface Step {
	kind: "splash" | "media";
	headline: string;
	body?: string;
	cta: string;
	media: MediaKind;
}

const STEPS: Step[] = [
	{
		kind: "splash",
		headline: "Whiskered",
		body: "Your Mewgenics companion.",
		cta: "Start",
		media: "none",
	},
	{
		kind: "media",
		headline: "Scan Any Item",
		body: "Point your camera and identify items instantly.",
		cta: "Next",
		media: "video",
	},
	{
		kind: "media",
		headline: "Every Detail",
		body: "Items, sets, abilities, classes \u2014 all cross-referenced.",
		cta: "Next",
		media: "screenshot-item",
	},
	{
		kind: "media",
		headline: "Conquer Every Boss",
		body: "Community strategies, drops, and counters.",
		cta: "Next",
		media: "screenshot-boss",
	},
	{
		kind: "media",
		headline: "Works Offline",
		body: "All data lives on your phone. No account, no cloud.",
		cta: "Next",
		media: "offline",
	},
	{
		kind: "media",
		headline: "Made by One Dev",
		body: "I built Whiskered because I needed it. If something's missing, tell me and I'll build it.",
		cta: "Get Started",
		media: "indie",
	},
];

/** Dark primary pill CTA. */
function PrimaryPillButton({ label, onPress }: { label: string; onPress: () => void }) {
	const scale = useSharedValue(1);
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<Animated.View style={animatedStyle}>
			<Pressable
				onPress={() => {
					triggerImpact(Haptics.ImpactFeedbackStyle.Light);
					onPress();
				}}
				onPressIn={() => {
					scale.value = withSpring(0.96, { damping: 14, stiffness: 260 });
				}}
				onPressOut={() => {
					scale.value = withSpring(1, { damping: 14, stiffness: 260 });
				}}
				style={{
					height: 56,
					borderRadius: 28,
					backgroundColor: PRIMARY_BG,
					alignItems: "center",
					justifyContent: "center",
					shadowColor: "#000",
					shadowOpacity: 0.2,
					shadowOffset: { width: 0, height: 4 },
					shadowRadius: 10,
					elevation: 6,
				}}
				accessibilityRole="button"
				accessibilityLabel={label}
			>
				<Text style={{ color: "#FAFAFA", fontSize: 17, fontWeight: "700", letterSpacing: 0.2 }}>
					{label}
				</Text>
			</Pressable>
		</Animated.View>
	);
}

function BrandMark() {
	return (
		<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
			<Image source={APP_ICON} style={{ width: 26, height: 26, borderRadius: 26 * 0.22 }} />
			<Text style={{ color: FG, fontSize: 17, fontWeight: "700", letterSpacing: 0.1 }}>
				Whiskered
			</Text>
		</View>
	);
}

function StepDots({ count, current }: { count: number; current: number }) {
	return (
		<View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 16 }}>
			{Array.from({ length: count }).map((_, i) => (
				<View
					key={i}
					style={{
						width: i === current ? 18 : 6,
						height: 6,
						borderRadius: 3,
						backgroundColor: i === current ? FG : "rgba(9,9,11,0.2)",
					}}
				/>
			))}
		</View>
	);
}

function CircleMockup({ children }: { children: React.ReactNode }) {
	return (
		<View
			style={{
				width: 132,
				height: 132,
				borderRadius: 66,
				backgroundColor: "#FFFFFF",
				alignItems: "center",
				justifyContent: "center",
				alignSelf: "center",
				shadowColor: "#000",
				shadowOpacity: 0.12,
				shadowOffset: { width: 0, height: 8 },
				shadowRadius: 16,
				elevation: 6,
			}}
		>
			{children}
		</View>
	);
}

/** Bottom gradient fade overlay — transparent to PAPER_FILL. */
function BottomFade() {
	return (
		<View
			pointerEvents="none"
			style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80 }}
		>
			<Svg width="100%" height="100%">
				<Defs>
					<LinearGradient id="bottom-fade" x1="0" y1="0" x2="0" y2="1">
						<Stop offset="0" stopColor={PAPER_FILL} stopOpacity="0" />
						<Stop offset="1" stopColor={PAPER_FILL} stopOpacity="1" />
					</LinearGradient>
				</Defs>
				<Rect width="100%" height="100%" fill="url(#bottom-fade)" />
			</Svg>
		</View>
	);
}

/**
 * Screenshot shown at natural width, pinned to top. Container clips the
 * bottom and a gradient fades into the paper background.
 */
function ScreenshotFrame({ source }: { source: number }) {
	return (
		<View
			style={{
				width: FRAME_WIDTH,
				height: FRAME_MAX_HEIGHT,
				borderRadius: 22,
				overflow: "hidden",
				alignSelf: "center",
				shadowColor: "#000",
				shadowOpacity: 0.12,
				shadowOffset: { width: 0, height: 8 },
				shadowRadius: 16,
				elevation: 6,
			}}
		>
			<Image
				source={source}
				style={{
					width: FRAME_WIDTH,
					height: SCREENSHOT_FULL_HEIGHT,
				}}
				resizeMode="stretch"
			/>
			<BottomFade />
		</View>
	);
}

/** Looping muted video using expo-video. */
function AutoPlayVideo() {
	const player = useVideoPlayer(SCANNER_VIDEO, (p) => {
		p.loop = true;
		p.muted = true;
		p.play();
	});

	return (
		<View
			style={{
				width: FRAME_WIDTH,
				height: FRAME_MAX_HEIGHT,
				borderRadius: 22,
				overflow: "hidden",
				alignSelf: "center",
				shadowColor: "#000",
				shadowOpacity: 0.12,
				shadowOffset: { width: 0, height: 8 },
				shadowRadius: 16,
				elevation: 6,
			}}
		>
			<VideoView
				player={player}
				style={{ width: FRAME_WIDTH, height: FRAME_MAX_HEIGHT }}
				contentFit="cover"
				nativeControls={false}
				allowsFullscreen={false}
				allowsPictureInPicture={false}
			/>
		</View>
	);
}

/** Beating heart in a circle for the indie step. */
function PulsingHeart() {
	const scale = useSharedValue(1);

	useEffect(() => {
		scale.value = withRepeat(
			withSequence(
				withTiming(1.18, { duration: 300, easing: Easing.out(Easing.quad) }),
				withTiming(1, { duration: 200, easing: Easing.in(Easing.quad) }),
				withTiming(1.12, { duration: 250, easing: Easing.out(Easing.quad) }),
				withTiming(1, { duration: 400, easing: Easing.in(Easing.quad) }),
				withTiming(1, { duration: 600 }),
			),
			-1,
			false,
		);
	}, [scale]);

	const heartStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<CircleMockup>
			<Animated.View style={heartStyle}>
				<Heart size={62} color="#E11D48" fill="#E11D48" strokeWidth={2.2} />
			</Animated.View>
		</CircleMockup>
	);
}

function StepMedia({ media }: { media: MediaKind }) {
	if (media === "video") return <AutoPlayVideo />;
	if (media === "screenshot-item") return <ScreenshotFrame source={ITEM_DETAIL_SCREENSHOT} />;
	if (media === "screenshot-boss") return <ScreenshotFrame source={BOSS_GUIDE_SCREENSHOT} />;
	if (media === "offline") return <CircleMockup><WifiOff size={62} color={FG} strokeWidth={2.2} /></CircleMockup>;
	if (media === "indie") return <PulsingHeart />;
	return null;
}

export default function OnboardingScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const setHasSeenIntro = useOnboardingStore((s) => s.setHasSeenIntro);

	const [stepIndex, setStepIndex] = useState(0);
	const step = STEPS[stepIndex];
	const isLast = stepIndex === STEPS.length - 1;
	const isSplash = step.kind === "splash";

	const finish = useCallback(() => {
		setHasSeenIntro(true);
		capture("onboarding_completed", { steps: STEPS.length });
		router.replace("/(tabs)");
	}, [router, setHasSeenIntro]);

	const advance = useCallback(() => {
		if (isLast) {
			finish();
			return;
		}
		capture("onboarding_step_advanced", { fromStep: stepIndex });
		setStepIndex((i) => i + 1);
	}, [finish, isLast, stepIndex]);

	const contentOpacity = useSharedValue(0);
	const contentY = useSharedValue(8);

	useEffect(() => {
		contentOpacity.value = 0;
		contentY.value = 12;
		contentOpacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
		contentY.value = withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic) });
	}, [stepIndex, contentOpacity, contentY]);

	const contentStyle = useAnimatedStyle(() => ({
		opacity: contentOpacity.value,
		transform: [{ translateY: contentY.value }],
	}));

	useEffect(() => {
		capture("onboarding_step_viewed", { step: stepIndex });
	}, [stepIndex]);

	const SplashLayout = useMemo(
		() => (
			<View
				style={{
					flex: 1,
					alignItems: "center",
					justifyContent: "center",
					paddingHorizontal: 32,
					gap: 20,
				}}
			>
				<Image source={APP_ICON} style={{ width: 96, height: 96, borderRadius: 22 }} />
				<Text
					style={{
						color: FG,
						fontSize: 40,
						lineHeight: 52,
						fontWeight: "800",
						letterSpacing: -0.5,
						paddingVertical: 4,
					}}
				>
					Whiskered
				</Text>
				<Text
					style={{
						color: FG_MUTED,
						fontSize: 16,
						textAlign: "center",
						lineHeight: 22,
						maxWidth: 300,
					}}
				>
					{step.body}
				</Text>
			</View>
		),
		[step.body],
	);

	return (
		<View style={{ flex: 1 }}>
			<PaperGrid fill={PAPER_FILL} stroke={PAPER_GRID} />

			<View
				style={{
					flex: 1,
					paddingTop: insets.top,
					paddingBottom: Math.max(insets.bottom, 16),
				}}
			>
				{!isSplash ? (
					<View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
						<BrandMark />
					</View>
				) : null}

				<Animated.View
					style={[
						{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
						contentStyle,
					]}
				>
					{isSplash ? (
						SplashLayout
					) : (
						<View
							style={{
								flex: 1,
								alignItems: "center",
								justifyContent: "center",
								gap: 28,
								width: "100%",
							}}
						>
							<View
								style={{
									flex: 1,
									justifyContent: "center",
									alignItems: "center",
									width: "100%",
								}}
							>
								<StepMedia media={step.media} />
							</View>
							<View style={{ alignItems: "center", gap: 10, paddingBottom: 4 }}>
								<Text
									style={{
										color: FG,
										fontSize: 26,
										lineHeight: 34,
										fontWeight: "800",
										textAlign: "center",
										letterSpacing: -0.3,
										maxWidth: 320,
										paddingVertical: 2,
									}}
								>
									{step.headline}
								</Text>
								{step.body ? (
									<Text
										style={{
											color: FG_MUTED,
											fontSize: 15,
											textAlign: "center",
											lineHeight: 21,
											maxWidth: 320,
										}}
									>
										{step.body}
									</Text>
								) : null}
							</View>
						</View>
					)}
				</Animated.View>

				<View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
					{!isSplash ? <StepDots count={STEPS.length} current={stepIndex} /> : null}
					<PrimaryPillButton label={step.cta} onPress={advance} />
				</View>
			</View>
		</View>
	);
}
