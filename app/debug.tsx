import * as Notifications from "expo-notifications";
import { useAppDataStore } from "@/lib/stores/session-store";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useSubscriptionStore } from "@/lib/stores/subscription-store";
import { getDiagnostics, PRODUCT_IDS, type RevenueCatDiagnostics } from "@/lib/services/revenue-cat";
import { shareBackup, createBackup, runDailyBackupIfNeeded } from "@/lib/services/backup";
import { useSubscription } from "@/lib/contexts/subscription-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";

export default function DebugScreen() {
	const { refreshCredits } = useSubscription();
	const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted);
	const items = useAppDataStore((s) => s.items);
	const completedCount = items.filter((i) => i.status === "completed").length;

	const isPurchasedPremium = useSubscriptionStore((s) => s.isPurchasedPremium);
	const hasSeenOnboardingPaywall = useSubscriptionStore((s) => s.hasSeenOnboardingPaywall);
	const trialStartedAt = useSubscriptionStore((s) => s.trialStartedAt);
	const isTrialActive = useSubscriptionStore((s) => s.isTrialActive);
	const trialDaysRemaining = useSubscriptionStore((s) => s.trialDaysRemaining);
	const hasPremiumAccess = useSubscriptionStore((s) => s.hasPremiumAccess);

	const resetOnboarding = () => {
		useSettingsStore.setState({ onboardingCompleted: false });
		Alert.alert("Done", "Onboarding reset. Restart the app to see it again.");
	};

	const clearAllData = () => {
		Alert.alert("Clear All Data", "This will remove all items. Are you sure?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Clear",
				style: "destructive",
				onPress: () => {
					useAppDataStore.setState({ items: [] });
					Alert.alert("Done", "All data cleared.");
				},
			},
		]);
	};

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<Text style={styles.title}>Debug Tools</Text>
			<Text style={styles.subtitle}>For development & testing only</Text>

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Current State</Text>
				<View style={styles.stateRow}>
					<Text style={styles.stateLabel}>Onboarding completed</Text>
					<Text style={[styles.stateValue, { color: onboardingCompleted ? "#2d6a2e" : "#b44" }]}>
						{onboardingCompleted ? "Yes" : "No"}
					</Text>
				</View>
				<View style={styles.stateRow}>
					<Text style={styles.stateLabel}>Completed items</Text>
					<Text style={styles.stateValue}>{completedCount}</Text>
				</View>
				<View style={styles.stateRow}>
					<Text style={styles.stateLabel}>Total items</Text>
					<Text style={styles.stateValue}>{items.length}</Text>
				</View>
			</View>

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Onboarding</Text>
				<Pressable style={styles.button} onPress={resetOnboarding}>
					<Text style={styles.buttonText}>Reset Onboarding</Text>
				</Pressable>
			</View>

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Notifications</Text>
				<Pressable
					style={styles.button}
					onPress={async () => {
						const perms = await Notifications.getPermissionsAsync();
						const scheduled = await Notifications.getAllScheduledNotificationsAsync();
						const lines = [
							`Permission: ${perms.status}`,
							`Scheduled count: ${scheduled.length}`,
							...scheduled.map((n) => `  ${n.identifier}: ${n.content.title}`),
						];
						Alert.alert("Notification Debug", lines.join("\n"));
					}}
				>
					<Text style={styles.buttonText}>Notification Debug Info</Text>
				</Pressable>
				<Pressable
					style={styles.button}
					onPress={async () => {
						const { status } = await Notifications.getPermissionsAsync();
						if (status !== "granted") {
							const { status: newStatus } = await Notifications.requestPermissionsAsync();
							if (newStatus !== "granted") {
								Alert.alert("No Permission", `Status: "${newStatus}". Enable in Settings.`);
								return;
							}
						}
						await Notifications.scheduleNotificationAsync({
							content: {
								title: "Test notification",
								body: "If you see this, notifications are working!",
								sound: "default",
							},
							trigger: {
								type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
								seconds: 5,
							},
						});
						Alert.alert("Scheduled", "Notification in 5s.");
					}}
				>
					<Text style={styles.buttonText}>Test Notification (5s)</Text>
				</Pressable>
				<Pressable
					style={[styles.button, styles.destructiveButton]}
					onPress={async () => {
						await Notifications.cancelAllScheduledNotificationsAsync();
						Alert.alert("Done", "All scheduled notifications cancelled.");
					}}
				>
					<Text style={[styles.buttonText, styles.destructiveText]}>Cancel All Scheduled</Text>
				</Pressable>
			</View>

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
					onPress={async () => {
						useSubscriptionStore.setState({ isPurchasedPremium: true });
						await refreshCredits();
						Alert.alert("Done", "Premium enabled (local).");
					}}
				>
					<Text style={styles.buttonText}>Grant Premium</Text>
				</Pressable>
				<Pressable
					style={[styles.button, styles.destructiveButton]}
					onPress={async () => {
						useSubscriptionStore.setState({ isPurchasedPremium: false });
						await refreshCredits();
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
				<Pressable style={[styles.button, styles.destructiveButton]} onPress={clearAllData}>
					<Text style={[styles.buttonText, styles.destructiveText]}>Clear All Data</Text>
				</Pressable>
			</View>

			<DataRecoveryDebugSection />
			<RevenueCatSection />
		</ScrollView>
	);
}

function DataRecoveryDebugSection() {
	const [backupExporting, setBackupExporting] = useState(false);

	const handleExportBackup = async () => {
		setBackupExporting(true);
		try {
			await shareBackup();
		} catch (e: unknown) {
			Alert.alert("Export Error", e instanceof Error ? e.message : String(e));
		} finally {
			setBackupExporting(false);
		}
	};

	const handlePreviewBackup = async () => {
		try {
			const envelope = await createBackup();
			const storeKeys = Object.keys(envelope.stores);
			const totalSize = JSON.stringify(envelope).length;
			const lines = [
				`Version: ${envelope.version}`,
				`Created: ${envelope.createdAt}`,
				`Stores: ${storeKeys.length} (${storeKeys.join(", ")})`,
				`Total size: ${(totalSize / 1024).toFixed(1)} KB`,
			];
			Alert.alert("Backup Preview", lines.join("\n"));
		} catch (e: unknown) {
			Alert.alert("Error", e instanceof Error ? e.message : String(e));
		}
	};

	const handleForceDailyBackup = async () => {
		try {
			await AsyncStorage.removeItem("app-last-backup");
			await runDailyBackupIfNeeded();
			Alert.alert("Done", "Daily backup ran successfully.");
		} catch (e: unknown) {
			Alert.alert("Error", e instanceof Error ? e.message : String(e));
		}
	};

	return (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>Data & Recovery</Text>
			<Pressable style={styles.button} onPress={handlePreviewBackup}>
				<Text style={styles.buttonText}>Preview Backup Data</Text>
			</Pressable>
			<Pressable style={styles.button} onPress={handleExportBackup}>
				<Text style={styles.buttonText}>
					{backupExporting ? "Exporting..." : "Export Backup (Share Sheet)"}
				</Text>
			</Pressable>
			<Pressable style={styles.button} onPress={handleForceDailyBackup}>
				<Text style={styles.buttonText}>Force Daily Backup Now</Text>
			</Pressable>
		</View>
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
