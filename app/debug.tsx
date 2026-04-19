import { useSettingsStore } from "@/lib/stores/settings-store";
import { useSubscriptionStore } from "@/lib/stores/subscription-store";
import { getDiagnostics, PRODUCT_IDS, type RevenueCatDiagnostics } from "@/lib/services/revenue-cat";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";

export default function DebugScreen() {
	const isPurchasedPremium = useSubscriptionStore((s) => s.isPurchasedPremium);
	const hasSeenOnboardingPaywall = useSubscriptionStore((s) => s.hasSeenOnboardingPaywall);
	const trialStartedAt = useSubscriptionStore((s) => s.trialStartedAt);
	const isTrialActive = useSubscriptionStore((s) => s.isTrialActive);
	const trialDaysRemaining = useSubscriptionStore((s) => s.trialDaysRemaining);
	const hasPremiumAccess = useSubscriptionStore((s) => s.hasPremiumAccess);

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<Text style={styles.title}>Debug Tools</Text>
			<Text style={styles.subtitle}>For development & testing only</Text>

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Subscription</Text>
				<View style={styles.stateRow}>
					<Text style={styles.stateLabel}>Premium access</Text>
					<Text style={[styles.stateValue, { color: hasPremiumAccess() ? "#2d6a2e" : "#b44" }]}>
						{hasPremiumAccess() ? "Yes" : "No"}
					</Text>
				</View>
				<View style={styles.stateRow}>
					<Text style={styles.stateLabel}>Purchased premium</Text>
					<Text style={[styles.stateValue, { color: isPurchasedPremium ? "#2d6a2e" : "#b44" }]}>
						{isPurchasedPremium ? "Yes" : "No"}
					</Text>
				</View>
				<View style={styles.stateRow}>
					<Text style={styles.stateLabel}>Trial active</Text>
					<Text style={[styles.stateValue, { color: isTrialActive() ? "#2d6a2e" : "#b44" }]}>
						{isTrialActive() ? `Yes (${trialDaysRemaining()}d left)` : "No"}
					</Text>
				</View>
				<View style={styles.stateRow}>
					<Text style={styles.stateLabel}>Trial started</Text>
					<Text style={styles.stateValue}>
						{trialStartedAt ? new Date(trialStartedAt).toLocaleDateString() : "Never"}
					</Text>
				</View>
				<View style={styles.stateRow}>
					<Text style={styles.stateLabel}>Seen onboarding paywall</Text>
					<Text style={styles.stateValue}>{hasSeenOnboardingPaywall ? "Yes" : "No"}</Text>
				</View>
				<Pressable
					style={styles.button}
					onPress={() => {
						useSubscriptionStore.setState({ isPurchasedPremium: true });
						Alert.alert("Done", "Premium enabled (local).");
					}}
				>
					<Text style={styles.buttonText}>Grant Premium</Text>
				</Pressable>
				<Pressable
					style={[styles.button, styles.destructiveButton]}
					onPress={() => {
						useSubscriptionStore.setState({ isPurchasedPremium: false });
						Alert.alert("Done", "Premium removed (local).");
					}}
				>
					<Text style={[styles.buttonText, styles.destructiveText]}>Remove Premium</Text>
				</Pressable>
				<Pressable
					style={[styles.button, styles.destructiveButton]}
					onPress={() => {
						useSubscriptionStore.setState({ trialStartedAt: null });
						Alert.alert("Done", "Trial reset.");
					}}
				>
					<Text style={[styles.buttonText, styles.destructiveText]}>Reset Trial</Text>
				</Pressable>
				<Pressable
					style={[styles.button, styles.destructiveButton]}
					onPress={() => {
						const expired = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
						useSubscriptionStore.setState({ trialStartedAt: expired, isPurchasedPremium: false });
						Alert.alert("Done", "Trial expired and premium removed.");
					}}
				>
					<Text style={[styles.buttonText, styles.destructiveText]}>Expire Trial + Remove Premium</Text>
				</Pressable>
			</View>

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Data</Text>
				<Pressable
					style={[styles.button, styles.destructiveButton]}
					onPress={() => {
						Alert.alert("Clear All Data", "This will reset all local storage. Are you sure?", [
							{ text: "Cancel", style: "cancel" },
							{
								text: "Clear",
								style: "destructive",
								onPress: async () => {
									await AsyncStorage.clear();
									Alert.alert("Done", "All local data cleared. Restart the app.");
								},
							},
						]);
					}}
				>
					<Text style={[styles.buttonText, styles.destructiveText]}>Clear All Data</Text>
				</Pressable>
			</View>

			<RevenueCatSection />
		</ScrollView>
	);
}

function RevenueCatSection() {
	const [diag, setDiag] = useState<RevenueCatDiagnostics | null>(null);
	const [loading, setLoading] = useState(false);

	const isPurchased = useSubscriptionStore((s) => s.isPurchasedPremium);
	const isTrialActive = useSubscriptionStore((s) => s.isTrialActive);
	const trialDaysRemaining = useSubscriptionStore((s) => s.trialDaysRemaining);
	const trialStartedAt = useSubscriptionStore((s) => s.trialStartedAt);
	const appOpenCount = useSubscriptionStore((s) => s.appOpenCount);

	const runDiagnostics = async () => {
		setLoading(true);
		try {
			const result = await getDiagnostics();
			setDiag(result);
		} catch (e: unknown) {
			Alert.alert("Diagnostics Error", e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	};

	const shareDiagnostics = async () => {
		if (!diag) return;
		const report = {
			...diag,
			localState: {
				isPurchased,
				isTrialActive: isTrialActive(),
				trialDaysRemaining: trialDaysRemaining(),
				trialStartedAt,
				appOpenCount,
			},
			expectedProductIds: PRODUCT_IDS,
		};
		await Share.share({ message: JSON.stringify(report, null, 2) });
	};

	return (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>RevenueCat Diagnostics</Text>
			<Pressable style={styles.button} onPress={runDiagnostics}>
				<Text style={styles.buttonText}>
					{loading ? "Running..." : "Run Diagnostics"}
				</Text>
			</Pressable>
			{loading && <ActivityIndicator style={{ marginVertical: 8 }} />}
			{diag && !loading && (
				<>
					<View style={styles.stateRow}>
						<Text style={styles.stateLabel}>SDK Configured</Text>
						<Text style={[styles.stateValue, { color: diag.sdkConfigured ? "#2d6a2e" : "#b44" }]}>
							{diag.sdkConfigured ? "Yes" : "No"}
						</Text>
					</View>
					<View style={styles.stateRow}>
						<Text style={styles.stateLabel}>API Key</Text>
						<Text style={[styles.stateValue, { color: diag.apiKeyPresent ? "#2d6a2e" : "#b44" }]}>
							{diag.apiKeyPresent ? diag.apiKeyPrefix : "MISSING"}
						</Text>
					</View>
					<View style={styles.stateRow}>
						<Text style={styles.stateLabel}>Current Offering</Text>
						<Text style={[styles.stateValue, { color: diag.currentOfferingId ? "#2d6a2e" : "#b44" }]}>
							{diag.currentOfferingId ?? "None"}
						</Text>
					</View>
					<View style={styles.stateRow}>
						<Text style={styles.stateLabel}>Packages</Text>
						<Text style={styles.stateValue}>{diag.availablePackages.length}</Text>
					</View>

					{diag.availablePackages.map((pkg) => (
						<View key={pkg.productId} style={styles.stateRow}>
							<Text style={styles.stateLabel}>{pkg.identifier}</Text>
							<Text style={styles.stateValue}>{pkg.priceString}</Text>
						</View>
					))}

					{diag.availablePackages.length > 0 && (
						<>
							{Object.entries(PRODUCT_IDS).map(([plan, expectedId]) => {
								const found = diag.availablePackages.some((p) => p.productId === expectedId);
								return (
									<View key={plan} style={styles.stateRow}>
										<Text style={styles.stateLabel}>{plan}</Text>
										<Text style={[styles.stateValue, { color: found ? "#2d6a2e" : "#b44" }]}>
											{found ? "matched" : `"${expectedId}" NOT found`}
										</Text>
									</View>
								);
							})}
						</>
					)}

					{Object.entries(diag.entitlements).length > 0 ? (
						Object.entries(diag.entitlements).map(([key, ent]) => (
							<View key={key} style={styles.stateRow}>
								<Text style={styles.stateLabel}>Entitlement: {key}</Text>
								<Text style={[styles.stateValue, { color: ent.isActive ? "#2d6a2e" : "#b44" }]}>
									{ent.isActive ? "Active" : "Inactive"} ({ent.productIdentifier})
								</Text>
							</View>
						))
					) : (
						<View style={styles.stateRow}>
							<Text style={styles.stateLabel}>Entitlements</Text>
							<Text style={[styles.stateValue, { color: "#b44" }]}>None</Text>
						</View>
					)}

					{diag.error && (
						<View style={[styles.stateRow, { backgroundColor: "hsla(0, 50%, 95%, 0.8)" }]}>
							<Text style={[styles.stateLabel, { color: "#b44", flex: 1 }]}>{diag.error}</Text>
						</View>
					)}

					<Pressable style={styles.button} onPress={shareDiagnostics}>
						<Text style={styles.buttonText}>Share Diagnostics JSON</Text>
					</Pressable>
				</>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "hsl(0, 0%, 100%)",
	},
	content: {
		padding: 24,
		paddingTop: 72,
	},
	title: {
		fontSize: 28,
		fontWeight: "700",
		color: "hsl(240, 10%, 3.9%)",
	},
	subtitle: {
		fontSize: 14,
		color: "hsl(240, 3.8%, 46.1%)",
		marginTop: 4,
		marginBottom: 24,
	},
	section: {
		marginBottom: 28,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: "hsl(240, 5%, 35%)",
		marginBottom: 12,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	stateRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 10,
		paddingHorizontal: 16,
		backgroundColor: "hsla(37, 40%, 100%, 0.6)",
		borderRadius: 10,
		marginBottom: 8,
	},
	stateLabel: {
		fontSize: 15,
		color: "hsl(240, 5%, 30%)",
	},
	stateValue: {
		fontSize: 15,
		fontWeight: "600",
		color: "hsl(240, 10%, 10%)",
	},
	button: {
		backgroundColor: "hsl(240, 5.9%, 10%)",
		paddingVertical: 14,
		paddingHorizontal: 20,
		borderRadius: 12,
		alignItems: "center",
		marginBottom: 10,
	},
	buttonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
	},
	destructiveButton: {
		backgroundColor: "hsl(0, 0%, 95%)",
		borderWidth: 1,
		borderColor: "hsl(0, 50%, 60%)",
	},
	destructiveText: {
		color: "hsl(0, 50%, 45%)",
	},
});
