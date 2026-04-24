import "../global.css";

// React Native global — not typed by default
declare const ErrorUtils: {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
};

import { LogBox } from "react-native";
LogBox.ignoreLogs(["[RevenueCat]", "Open debugger"]);

import { getOrCreateDeviceId } from "@/lib/services/device-id";
import { getPostHogClient, capture } from "@/lib/services/posthog";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useIsDark } from "@/lib/theme";
import { useColorScheme } from "nativewind";
import Constants from "expo-constants";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PostHogProvider, usePostHog } from "posthog-react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as Sentry from "@sentry/react-native";
import { AnimatedSplash } from "@/components/animated-splash";

SplashScreen.preventAutoHideAsync();

const SENTRY_DSN =
  "https://3b2aaeb0cccf9d0dbac2a0b12c73db02@o4511160992595968.ingest.de.sentry.io/4511161000984656";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !__DEV__ && SENTRY_DSN.length > 0,
  environment: __DEV__ ? "development" : "production",
  sendDefaultPii: true,
  enableLogs: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],
});

// Catch fatal JS errors before React mounts
const originalHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  Sentry.captureException(error, {
    tags: { phase: "startup", fatal: String(isFatal) },
  });
  if (originalHandler) {
    originalHandler(error, isFatal);
  }
});

class StartupErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, {
      tags: { phase: "startup_render" },
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (this.state.error) {
      return (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 32,
            backgroundColor: "#ffffff",
          }}
        >
          <Text style={{ fontSize: 48, marginBottom: 16 }}>:(</Text>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: "#2D2D2D",
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: "#888",
              textAlign: "center",
              lineHeight: 22,
              marginBottom: 24,
            }}
          >
            We&apos;ve been notified and are working on a fix.
          </Text>
          <Text style={{ fontSize: 14, color: "#AAA", textAlign: "center" }}>
            Please try restarting the app.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const isStorybook =
  Constants.expoConfig?.extra?.storybookEnabled === "true" ||
  process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === "true";

const StorybookUI = isStorybook ? require("../.rnstorybook").default : null;

function AnalyticsOptOut() {
  const posthog = usePostHog();
  const analyticsEnabled = useSettingsStore((s) => s.analyticsEnabled);

  useEffect(() => {
    if (!posthog) return;
    if (analyticsEnabled) posthog.optIn();
    else posthog.optOut();
  }, [posthog, analyticsEnabled]);

  return null;
}

function PostHogLifecycle() {
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog) return;
    capture("app_opened");
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") posthog.flush();
      else if (state === "active") {
        posthog.reloadFeatureFlags();
        capture("app_foregrounded");
      }
    });
    return () => sub.remove();
  }, [posthog]);

  return null;
}

function ScreenTracker() {
  const posthog = usePostHog();
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!posthog || !pathname || pathname === prevPathRef.current) return;
    prevPathRef.current = pathname;
    posthog.screen(pathname);
  }, [posthog, pathname]);

  return null;
}

function DeviceIdentifier() {
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog) return;
    getOrCreateDeviceId()
      .then((id) => posthog.identify(id))
      .catch(() => {});
  }, [posthog]);

  return null;
}

function AppearanceSync() {
  const { setColorScheme } = useColorScheme();
  const appearanceMode = useSettingsStore((s) => s.appearanceMode);

  useEffect(() => {
    setColorScheme(appearanceMode);
  }, [appearanceMode, setColorScheme]);

  return null;
}

function ThemedStatusBar() {
  const isDark = useIsDark();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

export default Sentry.wrap(function RootLayout() {
  const posthogClient = useMemo(() => getPostHogClient(), []);
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashComplete = useCallback(() => setSplashDone(true), []);

  if (StorybookUI) {
    return <StorybookUI />;
  }

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          {posthogClient && <AnalyticsOptOut />}
          {posthogClient && <PostHogLifecycle />}
          {posthogClient && <ScreenTracker />}
          {posthogClient && <DeviceIdentifier />}
          <AppearanceSync />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="settings"
              options={{
                headerShown: false,
                gestureEnabled: true,
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="scanner"
              options={{
                headerShown: false,
                gestureEnabled: true,
                animation: "slide_from_bottom",
                presentation: "fullScreenModal",
              }}
            />
          </Stack>
          <ThemedStatusBar />
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );

  const splash = !splashDone ? (
    <AnimatedSplash onComplete={handleSplashComplete} />
  ) : null;

  if (posthogClient) {
    return (
      <StartupErrorBoundary>
        <PostHogProvider client={posthogClient} autocapture={false}>
          {content}
          {splash}
        </PostHogProvider>
      </StartupErrorBoundary>
    );
  }

  return (
    <StartupErrorBoundary>
      {content}
      {splash}
    </StartupErrorBoundary>
  );
});
