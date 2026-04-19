import { Text } from "@/components/ui/text";
import { capture } from "@/lib/services/posthog";
import { useThemeColors } from "@/lib/theme";
import { useRouter } from "expo-router";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { ArrowLeft, Bug, Check, Lightbulb, MessageSquare, Send, Sparkles, MessageCircle } from "lucide-react-native";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CATEGORY_ICONS = {
	bug: Bug,
	feature: Lightbulb,
	improvement: Sparkles,
	other: MessageCircle,
} as const;

const CATEGORIES = [
	{ id: "bug", label: "Bug Report" },
	{ id: "feature", label: "Feature Idea" },
	{ id: "improvement", label: "Improvement" },
	{ id: "other", label: "Other" },
] as const;

type Category = (typeof CATEGORIES)[number]["id"];

export default function FeedbackScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const colors = useThemeColors();

	const [category, setCategory] = useState<Category | null>(null);
	const [message, setMessage] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	const canSubmit = category !== null && message.trim().length > 0;

	const handleSubmit = async () => {
		if (!canSubmit || submitting) return;
		setSubmitting(true);

		capture("feedback_submitted", {
			category,
			message: message.trim(),
			app_version: Application.nativeApplicationVersion ?? "unknown",
			build_number: Application.nativeBuildVersion ?? "unknown",
			ota_update_id: Updates.updateId ?? null,
		});

		setSubmitting(false);
		setSubmitted(true);
	};

	if (submitted) {
		return (
			<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
				<View className="flex-1 items-center justify-center px-6">
					<View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mb-6">
						<Check size={28} color={colors.primary} strokeWidth={2.5} />
					</View>
					<Text className="text-xl font-semibold text-foreground text-center mb-2">
						Thank you!
					</Text>
					<Text className="text-base text-muted-foreground text-center mb-8 px-4">
						Your feedback means a lot to us. We read every message and use it to improve the app.
					</Text>
					<Pressable
						onPress={() => router.back()}
						className="bg-primary rounded-2xl px-8 py-3"
					>
						<Text className="text-primary-foreground text-base font-semibold">
							Back to Settings
						</Text>
					</Pressable>
				</View>
			</View>
		);
	}

	return (
		<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
			{/* Header */}
			<View className="px-6 pt-4 pb-3 flex-row items-center" style={{ gap: 12 }}>
				<Pressable onPress={() => router.back()} hitSlop={12}>
					<ArrowLeft size={22} color={colors.foreground} strokeWidth={2} />
				</Pressable>
				<Text className="text-xl font-bold text-foreground">Give Feedback</Text>
			</View>

			<KeyboardAvoidingView
				className="flex-1"
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				keyboardVerticalOffset={insets.top + 48}
			>
				<ScrollView
					className="flex-1"
					contentContainerClassName="px-6 pt-4 pb-8"
					keyboardShouldPersistTaps="handled"
				>
					{/* Icon + intro */}
					<View className="items-center mb-6">
						<View className="w-14 h-14 rounded-full bg-primary/10 items-center justify-center mb-4">
							<MessageSquare size={24} color={colors.primary} strokeWidth={2} />
						</View>
						<Text className="text-base text-muted-foreground text-center px-4">
							Help us make the app better. What's on your mind?
						</Text>
					</View>

					{/* Category pills */}
					<Text className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
						Category
					</Text>
					<View className="flex-row flex-wrap mb-6" style={{ gap: 8 }}>
						{CATEGORIES.map((cat) => {
							const selected = category === cat.id;
							const Icon = CATEGORY_ICONS[cat.id];
							return (
								<Pressable
									key={cat.id}
									onPress={() => setCategory(cat.id)}
									className={`rounded-xl px-4 py-2.5 border flex-row items-center ${
										selected
											? "bg-primary border-primary"
											: "bg-card border-border"
									}`}
									style={{ gap: 6 }}
								>
									<Icon
										size={14}
										color={selected ? colors.primaryForeground : colors.foreground}
										strokeWidth={2}
									/>
									<Text
										className={`text-sm font-medium ${
											selected ? "text-primary-foreground" : "text-foreground"
										}`}
									>
										{cat.label}
									</Text>
								</Pressable>
							);
						})}
					</View>

					{/* Message input */}
					<Text className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
						Your Message
					</Text>
					<TextInput
						className="bg-card border border-border rounded-2xl px-4 py-3 text-base text-foreground min-h-[140px]"
						placeholder="Tell us what you think..."
						placeholderTextColor={colors.mutedForeground + "80"}
						multiline
						textAlignVertical="top"
						value={message}
						onChangeText={setMessage}
						maxLength={2000}
					/>
					<Text className="text-xs text-muted-foreground/60 mt-1.5 text-right">
						{message.length}/2000
					</Text>

					{/* Submit */}
					<Pressable
						onPress={handleSubmit}
						disabled={!canSubmit || submitting}
						className={`rounded-2xl px-6 py-4 flex-row items-center justify-center mt-4 ${
							canSubmit && !submitting ? "bg-primary" : "bg-muted"
						}`}
						style={{ gap: 8 }}
					>
						{submitting ? (
							<ActivityIndicator size="small" color={colors.primaryForeground} />
						) : (
							<>
								<Text
									className={`text-base font-semibold ${
										canSubmit ? "text-primary-foreground" : "text-muted-foreground"
									}`}
								>
									Send Feedback
								</Text>
								<Send
									size={16}
									color={canSubmit ? colors.primaryForeground : colors.mutedForeground}
									strokeWidth={2}
								/>
							</>
						)}
					</Pressable>
				</ScrollView>
			</KeyboardAvoidingView>
		</View>
	);
}
