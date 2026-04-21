import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  LOG_LEVEL,
} from "react-native-purchases";

// ── RevenueCat configuration ─────────────────────────────────────
const REVENUECAT_API_KEY_APPLE =
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_APPLE ?? "";

// Entitlement ID configured in RevenueCat dashboard
export const PREMIUM_ENTITLEMENT = "Whiskered Pro";

// ── Subscription product IDs (App Store Connect + RevenueCat) ────
// TODO: replace with real product IDs for the whiskered project
export const PRODUCT_IDS = {
  weekly: "whiskered_plus_weekly",
  monthly: "whiskered_plus_monthly",
  annual: "whiskered_plus_annual",
} as const;

let isConfigured = false;

function rcLog(message: string, data?: unknown): void {
  const prefix = "[RevenueCat]";
  if (data !== undefined) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

/**
 * Initialize RevenueCat SDK. Call once at app startup.
 */
export async function configureRevenueCat(): Promise<void> {
  if (isConfigured) return;

  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    rcLog("Skipping configuration on non-mobile platform");
    return;
  }

  const hasKey = REVENUECAT_API_KEY_APPLE.length > 0;
  rcLog(`API key present: ${hasKey} (length: ${REVENUECAT_API_KEY_APPLE.length})`);

  if (!hasKey) {
    rcLog("WARNING: No API key — purchases will not work");
    return;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({
    apiKey: REVENUECAT_API_KEY_APPLE,
  });

  isConfigured = true;
  rcLog("SDK configured successfully");
}

/**
 * Fetch the current customer info from RevenueCat.
 */
export async function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

/**
 * Check if user has active premium entitlement.
 */
export async function checkPremiumStatus(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[PREMIUM_ENTITLEMENT] !== undefined;
  } catch {
    return false;
  }
}

/**
 * Fetch available offerings (packages/plans).
 */
export async function getOfferings(): Promise<PurchasesOffering | null> {
  try {
    if (!isConfigured) {
      rcLog("getOfferings called before SDK configured");
      return null;
    }
    const offerings = await Purchases.getOfferings();
    rcLog(`Offerings fetched — current: ${offerings.current ? "yes" : "null"}`);
    if (offerings.current) {
      const pkgIds = offerings.current.availablePackages.map(
        (p) => p.product.identifier,
      );
      rcLog("Available packages:", pkgIds);
    }
    return offerings.current;
  } catch (error: unknown) {
    rcLog("getOfferings error:", error);
    return null;
  }
}

/**
 * Purchase a subscription package. Returns true if the premium entitlement is now active.
 */
export async function purchasePackage(
  pkg: Parameters<typeof Purchases.purchasePackage>[0],
): Promise<{ success: boolean; customerInfo?: CustomerInfo }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPremium =
      customerInfo.entitlements.active[PREMIUM_ENTITLEMENT] !== undefined;
    return { success: isPremium, customerInfo };
  } catch (error: unknown) {
    const err = error as { userCancelled?: boolean };
    if (err.userCancelled) {
      return { success: false };
    }
    throw error;
  }
}

/**
 * Purchase a consumable (credit pack). Returns true if the transaction completed.
 * Consumables don't grant entitlements, so we just check the transaction succeeded.
 */
export async function purchaseConsumable(
  pkg: Parameters<typeof Purchases.purchasePackage>[0],
): Promise<{ success: boolean; customerInfo?: CustomerInfo }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (error: unknown) {
    const err = error as { userCancelled?: boolean };
    if (err.userCancelled) {
      return { success: false };
    }
    throw error;
  }
}

/**
 * Diagnostic info for debugging IAP issues in TestFlight/sandbox.
 */
export interface RevenueCatDiagnostics {
  sdkConfigured: boolean;
  apiKeyPresent: boolean;
  apiKeyPrefix: string;
  currentOfferingId: string | null;
  availablePackages: {
    identifier: string;
    packageType: string;
    productId: string;
    priceString: string;
  }[];
  entitlements: Record<string, { isActive: boolean; productIdentifier: string }>;
  error: string | null;
}

export async function getDiagnostics(): Promise<RevenueCatDiagnostics> {
  const result: RevenueCatDiagnostics = {
    sdkConfigured: isConfigured,
    apiKeyPresent: REVENUECAT_API_KEY_APPLE.length > 0,
    apiKeyPrefix: REVENUECAT_API_KEY_APPLE.slice(0, 8) + "...",
    currentOfferingId: null,
    availablePackages: [],
    entitlements: {},
    error: null,
  };

  if (!isConfigured) {
    result.error = "SDK not configured — check API key";
    return result;
  }

  try {
    const offerings = await Purchases.getOfferings();
    if (offerings.current) {
      result.currentOfferingId = offerings.current.identifier;
      result.availablePackages = offerings.current.availablePackages.map((p) => ({
        identifier: p.identifier,
        packageType: p.packageType,
        productId: p.product.identifier,
        priceString: p.product.priceString,
      }));
    } else {
      result.error = "No current offering — check RevenueCat dashboard";
    }
  } catch (e: unknown) {
    result.error = `Offerings error: ${e instanceof Error ? e.message : String(e)}`;
  }

  try {
    const info = await Purchases.getCustomerInfo();
    for (const [key, ent] of Object.entries(info.entitlements.all)) {
      result.entitlements[key] = {
        isActive: ent.isActive,
        productIdentifier: ent.productIdentifier,
      };
    }
  } catch (e: unknown) {
    if (!result.error) {
      result.error = `CustomerInfo error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return result;
}

/**
 * Restore previous purchases.
 */
export async function restorePurchases(): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
}> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isPremium =
      customerInfo.entitlements.active[PREMIUM_ENTITLEMENT] !== undefined;
    return { success: isPremium, customerInfo };
  } catch {
    return { success: false };
  }
}
