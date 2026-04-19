import { useAuth } from "@/lib/contexts/auth-context";
import { useOnboardingCheck } from "@/lib/hooks/use-onboarding-check";
import { capture } from "@/lib/services/posthog";
import { Video, ResizeMode } from "expo-av";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DARK_BG = "#0a0806";
const MUTED = "#8a7f72";
const WARM_WHITE = "#f4ede0";
const ERROR_RED = "#c44040";
const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

type ScreenState = "landing" | "signin";

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp, signIn, user } = useAuth();
  const onboardingStatus = useOnboardingCheck(user?.id);

  const [screen, setScreen] = useState<ScreenState>("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (onboardingStatus === "needs_onboarding") router.replace("/onboarding");
    else if (onboardingStatus === "complete") router.replace("/(tabs)");
  }, [user, onboardingStatus, router]);

  const handleGetStarted = useCallback(() => {
    capture("get_started_tapped");
    router.replace("/onboarding");
  }, [router]);

  const handleSignIn = useCallback(async () => {
    setError("");
    setLoading(true);
    capture("sign_in_attempted");
    const { error } = await signIn(email.trim(), password);
    if (error) {
      setError(error.message);
      capture("sign_in_failed", { error: error.message });
    } else {
      capture("sign_in_succeeded");
    }
    setLoading(false);
  }, [email, password, signIn]);

  return (
    <View style={styles.container}>
      {/* Ping-pong background video */}
      <Video
        source={require("@/assets/videos/auth-bg-pingpong.mp4")}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        isMuted
      />

      {/* Gradient overlays */}
      <View style={styles.overlayFull} />

      {screen === "landing" ? (
        <>
          {/* Brand centered upper area */}
          <View style={[styles.brandArea, { paddingTop: insets.top + 60 }]}>
            <Image
              source={require("@/assets/images/icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brand}>Kickd</Text>
            <Text style={styles.tagline}>Your generic app template</Text>
          </View>

          {/* CTA at bottom */}
          <View style={[styles.ctaArea, { paddingBottom: insets.bottom + 24 }]}>
            <Pressable
              onPress={handleGetStarted}
              style={styles.ctaButton}
            >
              <Text style={styles.ctaButtonText}>Get started</Text>
            </Pressable>

            <Pressable onPress={() => setScreen("signin")} hitSlop={12}>
              <Text style={styles.secondaryLink}>I already have an account</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {/* Sign in form */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.flex}
          >
            <View style={styles.flex} />

            <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.handle} />

              <Text style={styles.sheetTitle}>Welcome back</Text>

              <View style={styles.form}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={MUTED}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={MUTED}
                  style={styles.input}
                  secureTextEntry
                  textContentType="password"
                />

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  onPress={handleSignIn}
                  disabled={loading || !email.trim() || password.length < 6}
                  style={[
                    styles.signInButton,
                    (loading || !email.trim() || password.length < 6) && { opacity: 0.5 },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color={DARK_BG} />
                  ) : (
                    <Text style={styles.signInButtonText}>Sign in</Text>
                  )}
                </Pressable>
              </View>

              <Pressable onPress={() => { setScreen("landing"); setError(""); }} hitSlop={12}>
                <Text style={styles.backLink}>Back</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  flex: {
    flex: 1,
  },
  overlayFull: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 8, 6, 0.5)",
  },

  // Landing
  brandArea: {
    flex: 1,
    alignItems: "center",
    gap: 16,
  },
  logo: {
    width: 64,
    height: 64,
    marginBottom: 4,
  },
  brand: {
    fontSize: 36,
    fontWeight: "200",
    color: WARM_WHITE,
    letterSpacing: 4,
    fontFamily: MONO,
  },
  tagline: {
    fontSize: 11,
    fontWeight: "300",
    color: WARM_WHITE,
    marginTop: 4,
    fontFamily: MONO,
    letterSpacing: 1,
  },
  ctaArea: {
    paddingHorizontal: 24,
    gap: 16,
    alignItems: "center",
  },
  ctaButton: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    backgroundColor: WARM_WHITE,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: DARK_BG,
    letterSpacing: 0.5,
  },
  secondaryLink: {
    fontSize: 14,
    fontWeight: "300",
    color: "rgba(249, 244, 236, 0.5)",
  },
  errorLanding: {
    fontSize: 13,
    color: ERROR_RED,
    textAlign: "center",
  },

  // Sign in sheet
  sheet: {
    backgroundColor: "#0a0806",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(249, 244, 236, 0.08)",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(249, 244, 236, 0.12)",
    alignSelf: "center",
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "300",
    color: WARM_WHITE,
    textAlign: "center",
  },
  form: {
    width: "100%",
    gap: 14,
  },
  input: {
    width: "100%",
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(249, 244, 236, 0.1)",
    backgroundColor: "rgba(249, 244, 236, 0.05)",
    color: WARM_WHITE,
    fontSize: 15,
    fontWeight: "300",
    paddingHorizontal: 16,
  },
  error: {
    fontSize: 13,
    color: ERROR_RED,
  },
  signInButton: {
    width: "100%",
    height: 50,
    borderRadius: 12,
    backgroundColor: WARM_WHITE,
    alignItems: "center",
    justifyContent: "center",
  },
  signInButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: DARK_BG,
  },
  backLink: {
    fontSize: 14,
    color: MUTED,
    textAlign: "center",
  },
});
