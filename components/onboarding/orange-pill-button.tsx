import { triggerImpact } from "@/lib/haptics";
import { Text } from "@/components/ui/text";
import * as Haptics from "expo-haptics";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

interface OrangePillButtonProps {
	label: string;
	onPress: () => void;
	disabled?: boolean;
}

/**
 * Orange gradient pill CTA — the Acorns-style onboarding button.
 * Gradient is rendered with react-native-svg (no extra deps), and the press
 * scales the button down with spring physics.
 */
export function OrangePillButton({
	label,
	onPress,
	disabled = false,
}: OrangePillButtonProps) {
	const scale = useSharedValue(1);
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));
	const gradientId = useMemo(
		() => `orange-pill-${Math.random().toString(36).slice(2, 8)}`,
		[],
	);

	return (
		<Animated.View style={animatedStyle}>
			<Pressable
				onPress={() => {
					if (disabled) return;
					triggerImpact(Haptics.ImpactFeedbackStyle.Light);
					onPress();
				}}
				onPressIn={() => {
					scale.value = withSpring(0.96, { damping: 14, stiffness: 260 });
				}}
				onPressOut={() => {
					scale.value = withSpring(1, { damping: 14, stiffness: 260 });
				}}
				disabled={disabled}
				style={{
					height: 56,
					borderRadius: 28,
					overflow: "hidden",
					opacity: disabled ? 0.6 : 1,
					shadowColor: "#F66E22",
					shadowOpacity: 0.35,
					shadowOffset: { width: 0, height: 6 },
					shadowRadius: 12,
					elevation: 6,
				}}
				accessibilityRole="button"
				accessibilityLabel={label}
			>
				<View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
					<Svg width="100%" height="100%">
						<Defs>
							<LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
								<Stop offset="0" stopColor="#FBC15B" />
								<Stop offset="0.55" stopColor="#F58B2A" />
								<Stop offset="1" stopColor="#F0671A" />
							</LinearGradient>
						</Defs>
						<Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
					</Svg>
				</View>
				<View
					style={{
						flex: 1,
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<Text
						style={{
							color: "#FFFFFF",
							fontSize: 17,
							fontWeight: "700",
							letterSpacing: 0.2,
							textShadowColor: "rgba(120, 50, 0, 0.45)",
							textShadowOffset: { width: 0, height: 1 },
							textShadowRadius: 2,
						}}
					>
						{label}
					</Text>
				</View>
			</Pressable>
		</Animated.View>
	);
}
