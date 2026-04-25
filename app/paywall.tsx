import { Text } from "@/components/ui/text";
import { capture } from "@/lib/services/posthog";
import {
  configureRevenueCat,
  getOfferings,
  purchasePackage,
  restorePurchases,
} from "@/lib/services/revenue-cat";
import { useSubscriptionStore } from "@/lib/stores/subscription-store";
import { router } from "expo-router";
import { useThemeColors } from "@/lib/theme";
import { Crown, Infinity as InfinityIcon, Sparkles, Star, X, Zap } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { SafeAreaView } from "react-native-safe-area-context";

type SubscriptionPlanId = "weekly" | "monthly" | "annual";

interface PlanOption {
  id: SubscriptionPlanId;
  label: string;
  billedPrice: string;
  subtitle: string;
  calculatedPrice?: string;
  badge?: string;
}

const FALLBACK_PLANS: PlanOption[] = [
  {
    id: "weekly",
    label: "Weekly",
    billedPrice: "$2.49/week",
    subtitle: "Cancel any time",
  },
  {
    id: "monthly",
    label: "Monthly",
    billedPrice: "$6.99/month",
    subtitle: "$6.99 per month",
  },
  {
    id: "annual",
    label: "Annual",
    billedPrice: "$49.99/year",
    subtitle: "$49.99 once a year",
    calculatedPrice: "$4.17/month",
    badge: "2 months free",
  },
];

const BENEFITS = [
  { icon: InfinityIcon, text: "Unlimited access" },
  { icon: Star, text: "All premium features" },
  { icon: Sparkles, text: "Priority support" },
  { icon: Zap, text: "No ads" },
];


/** Optional helper to open the paywall. */
export function openPaywall() {
  router.push("/paywall");
}

export default function PaywallScreen() {
  const updateFromCustomerInfo = useSubscriptionStore(
    (s) => s.updateFromCustomerInfo,
  );
  const markOnboardingPaywallSeen = useSubscriptionStore(
    (s) => s.markOnboardingPaywallSeen,
  );
  const isPro = useSubscriptionStore((s) => s.hasPremiumAccess)();

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanId>("annual");
  const [loading, setLoading] = useState(false);
  const [packages, setPackages] = useState<Map<string, PurchasesPackage>>(new Map());
  const [plans, setPlans] = useState<PlanOption[]>(FALLBACK_PLANS);
  const [offeringsLoaded, setOfferingsLoaded] = useState(false);

  useEffect(() => {
    capture("paywall_shown");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadOfferings(retries = 2): Promise<void> {
      await configureRevenueCat();
      try {
        const offering = await getOfferings();
        if (cancelled) return;
        if (!offering) {
          if (retries > 0) {
            await new Promise((r) => setTimeout(r, 1500));
            if (!cancelled) return loadOfferings(retries - 1);
          }
          return;
        }

        const pkgMap = new Map<string, PurchasesPackage>();
        const loadedPlans: PlanOption[] = [];

        for (const pkg of offering.availablePackages) {
          const id = pkg.product.identifier;
          pkgMap.set(id, pkg);

          if (id.includes("weekly")) {
            loadedPlans.push({
              id: "weekly",
              label: "Weekly",
              billedPrice: `${pkg.product.priceString}/week`,
              subtitle: "Cancel any time",
            });
          } else if (id.includes("monthly")) {
            loadedPlans.push({
              id: "monthly",
              label: "Monthly",
              billedPrice: `${pkg.product.priceString}/month`,
              subtitle: `${pkg.product.priceString} per month`,
            });
          } else if (id.includes("annual")) {
            const monthlyPrice = pkg.product.price / 12;
            let formattedMonthly: string;
            try {
              formattedMonthly = new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: pkg.product.currencyCode,
              }).format(monthlyPrice);
            } catch {
              formattedMonthly = `$${monthlyPrice.toFixed(2)}`;
            }
            loadedPlans.push({
              id: "annual",
              label: "Annual",
              billedPrice: `${pkg.product.priceString}/year`,
              subtitle: `${pkg.product.priceString} once a year`,
              calculatedPrice: `${formattedMonthly}/month`,
              badge: "2 months free",
            });
          }
        }

        if (loadedPlans.length > 0) {
          setPackages(pkgMap);
          setPlans(loadedPlans);
          setOfferingsLoaded(true);
        }
      } catch {
        if (cancelled) return;
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 1500));
          if (!cancelled) return loadOfferings(retries - 1);
        }
      }
    }

    loadOfferings();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    markOnboardingPaywallSeen();
    capture("paywall_dismissed");
    router.back();
  }, [markOnboardingPaywallSeen]);

  const handleSubscribe = useCallback(async () => {
    setLoading(true);
    capture("purchase_initiated", { plan: selectedPlan });
    try {
      const pkgKey = [...packages.entries()].find(([id]) => id.includes(selectedPlan));
      if (!pkgKey) {
        Alert.alert(
          "Unavailable",
          offeringsLoaded
            ? `The "${selectedPlan}" plan could not be found.`
            : "Plans could not be loaded. Please try again later.",
        );
        setLoading(false);
        return;
      }
      const result = await purchasePackage(pkgKey[1]);
      if (result.success && result.customerInfo) {
        capture("purchase_completed", { plan: selectedPlan });
        updateFromCustomerInfo(result.customerInfo);
        dismiss();
      }
    } catch {
      capture("purchase_failed", { plan: selectedPlan });
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [packages, selectedPlan, offeringsLoaded, updateFromCustomerInfo, dismiss]);

  const handleRestore = useCallback(async () => {
    capture("restore_purchases_tapped", { source: "paywall" });
    setLoading(true);
    try {
      const result = await restorePurchases();
      if (result.success && result.customerInfo) {
        capture("purchase_restored");
        updateFromCustomerInfo(result.customerInfo);
        Alert.alert("Restored", "Your premium access has been restored.");
        dismiss();
      } else {
        Alert.alert("No purchases found", "We couldn't find any previous purchases.");
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [updateFromCustomerInfo, dismiss]);

  const selectedPlanData = plans.find((p) => p.id === selectedPlan);
  const theme = useThemeColors();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Pressable
        onPress={dismiss}
        hitSlop={12}
        className="absolute top-14 right-5 z-10 w-8 h-8 items-center justify-center rounded-full bg-secondary"
      >
        <X size={18} color={theme.mutedForeground} strokeWidth={2.5} />
      </Pressable>

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-4"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View className="items-center px-6 mt-6 mb-5">
          <Text className="text-[26px] font-bold text-primary text-center">
            Unlock everything
          </Text>
          <Text className="text-base text-muted-foreground text-center mt-1.5 leading-6">
            Get full access to Whiskered Pro
          </Text>
        </View>

        <View className="px-6 mb-6">
          {BENEFITS.map((b, i) => (
            <View key={b.text}>
              <View className="flex-row items-center gap-4 py-3">
                <View
                  className="w-11 h-11 rounded-full items-center justify-center bg-secondary"
                >
                  <b.icon size={22} color={theme.primary} strokeWidth={2} />
                </View>
                <Text className="text-lg text-foreground">{b.text}</Text>
              </View>
              {i < BENEFITS.length - 1 ? <View className="h-px bg-border ml-15" /> : null}
            </View>
          ))}
        </View>

        <View className="px-6 gap-2.5 mb-3">
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            return (
              <Pressable
                key={plan.id}
                onPress={() => setSelectedPlan(plan.id)}
                className="flex-row items-center py-3.5 px-4 rounded-2xl border-2"
                style={{
                  borderColor: isSelected ? theme.primary : theme.border,
                  backgroundColor: isSelected ? theme.secondary : theme.card,
                }}
              >
                <View
                  className="w-5 h-5 rounded-full border-2 mr-3 items-center justify-center"
                  style={{ borderColor: isSelected ? theme.primary : theme.mutedForeground }}
                >
                  {isSelected ? <View className="w-2.5 h-2.5 rounded-full bg-primary" /> : null}
                </View>

                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base font-semibold text-foreground">
                      {plan.label}
                    </Text>
                    {plan.badge ? (
                      <View className="bg-primary px-2 py-0.5 rounded-md">
                        <Text className="text-[10px] font-bold text-primary-foreground">
                          {plan.badge}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="text-xs text-muted-foreground mt-0.5">{plan.subtitle}</Text>
                </View>

                <View className="items-end">
                  <Text className="text-lg font-extrabold text-foreground">
                    {plan.billedPrice}
                  </Text>
                  {plan.calculatedPrice ? (
                    <Text className="text-[10px] text-muted-foreground mt-0.5">
                      ({plan.calculatedPrice})
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {isPro ? (
          <Text className="text-xs text-muted-foreground text-center mt-2 mb-4 px-6">
            You already have Pro access.
          </Text>
        ) : null}
      </ScrollView>

      <View className="px-6 pt-2 pb-2">
        <Pressable
          onPress={handleSubscribe}
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-primary flex-row items-center justify-center gap-2"
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Crown size={20} color="white" strokeWidth={2.5} />
              <Text className="text-lg font-bold text-primary-foreground">
                {`Subscribe for ${selectedPlanData?.billedPrice ?? ""}`}
              </Text>
            </>
          )}
        </Pressable>
        <Text className="text-[11px] text-muted-foreground text-center mt-2 leading-4">
          Auto-renews. Cancel any time.
        </Text>
      </View>

      <View className="flex-row justify-center gap-4 pb-4 pt-1">
        <Pressable onPress={handleRestore} disabled={loading}>
          <Text className="text-xs text-muted-foreground underline">Restore purchases</Text>
        </Pressable>
        <Text className="text-xs text-muted-foreground">{"\u00B7"}</Text>
        <Pressable onPress={() => Linking.openURL("https://d-ivashchuk.github.io/whiskered-legal/terms-of-service")}>
          <Text className="text-xs text-muted-foreground underline">Terms</Text>
        </Pressable>
        <Text className="text-xs text-muted-foreground">{"\u00B7"}</Text>
        <Pressable onPress={() => Linking.openURL("https://d-ivashchuk.github.io/whiskered-legal/privacy-policy")}>
          <Text className="text-xs text-muted-foreground underline">Privacy</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
