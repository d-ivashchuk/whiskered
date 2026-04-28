import { Text } from "@/components/ui/text";
import { ScannerViewfinder } from "@/components/scanner-viewfinder";
import { ScannerResultsGrid } from "@/components/scanner-results-grid";
import { useThemeColors } from "@/lib/theme";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { X, ImageIcon, Scan, Bug, Grid3X3, Play, Plus, Minus } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { triggerImpact } from "@/lib/haptics";
import { capture } from "@/lib/services/posthog";

type Prediction = {
  label: string;
  confidence: number;
};

type DebugInfo = {
  rawUri: string | null;
  croppedUri: string | null;
  captureMs: number;
  cropMs: number;
  classifyMs: number;
  rawOutput: string;
  error: string | null;
  photoWidth: number;
  photoHeight: number;
};

const SCAN_INTERVAL_MS = 2500;
const MIN_CONFIDENCE = 0.005;
const STABILITY_THRESHOLD = 1;
// Viewfinder size range as fraction of screen width
const MIN_SQUARE_FRAC = 0.25;
const MAX_SQUARE_FRAC = 0.65;

/** Wrap a promise with a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Capture timeout")), ms)
    ),
  ]);
}

export default function ScannerScreen() {
  const theme = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const hasPermission = permission?.granted ?? false;

  const isFocused = useIsFocused();

  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [autofocusMode, setAutofocusMode] = useState<"on" | "off">("on");
  const refocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // squareFrac: 0.0 = smallest, 1.0 = largest
  const [squareFrac, setSquareFrac] = useState(0.5);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    rawUri: null,
    croppedUri: null,
    captureMs: 0,
    cropMs: 0,
    classifyMs: 0,
    rawOutput: "",
    error: null,
    photoWidth: 0,
    photoHeight: 0,
  });
  const isBusyRef = useRef(false);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelHistoryRef = useRef<Map<string, number>>(new Map());
  const lastIdentifiedLabelRef = useRef<string | null>(null);
  // Refs to avoid stale closures in the scan loop
  const isActiveRef = useRef(isActive);
  const cameraReadyRef = useRef(cameraReady);
  const squareFracRef = useRef(squareFrac);

  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { cameraReadyRef.current = cameraReady; }, [cameraReady]);
  useEffect(() => { squareFracRef.current = squareFrac; }, [squareFrac]);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    capture("scanner_opened");
  }, []);

  // Pause scanning when navigating away, resume when returning.
  // Camera stays mounted to avoid flash on return.
  const wasScanningRef = useRef(false);
  useEffect(() => {
    if (!isFocused) {
      wasScanningRef.current = isScanning;
      setIsScanning(false);
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      isBusyRef.current = false;
    } else if (!isFrozen) {
      setIsActive(true);
      if (wasScanningRef.current) {
        setIsScanning(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to focus changes
  }, [isFocused]);

  // Layout: results sheet sized to fit exactly 2 rows of 5 items
  const gridPadding = 12;
  const gridGap = 6;
  const gridColumns = 5;
  const cellSize = Math.floor((screenWidth - gridPadding * 2 - gridGap * (gridColumns - 1)) / gridColumns);
  const resultsHeight = 36 + cellSize * 3 + gridGap * 2 + gridPadding * 2; // header + 3 rows + gaps + padding
  const cameraHeight = screenHeight - resultsHeight - insets.bottom;
  const squareSize =
    screenWidth * (MIN_SQUARE_FRAC + squareFrac * (MAX_SQUARE_FRAC - MIN_SQUARE_FRAC));

  // Tap-to-refocus: toggle autofocus prop to force a fresh AF pass.
  // Continuous AF on Android (e.g. Steam Deck) doesn't always re-trigger
  // when the subject distance changes, so this gives the user a manual nudge.
  const handleTapToFocus = useCallback(() => {
    triggerImpact();
    if (refocusTimerRef.current) clearTimeout(refocusTimerRef.current);
    setAutofocusMode("off");
    refocusTimerRef.current = setTimeout(() => {
      setAutofocusMode("on");
      refocusTimerRef.current = null;
    }, 50);
  }, []);

  useEffect(() => () => {
    if (refocusTimerRef.current) clearTimeout(refocusTimerRef.current);
  }, []);

  const STEP = 0.15;
  const handleZoomIn = useCallback(() => {
    triggerImpact();
    setSquareFrac((v) => Math.min(1, v + STEP));
  }, []);
  const handleZoomOut = useCallback(() => {
    triggerImpact();
    setSquareFrac((v) => Math.max(0, v - STEP));
  }, []);

  const doScan = useCallback(async () => {
    if (isBusyRef.current || !isActiveRef.current || !cameraReadyRef.current) {
      // Schedule next even when skipping
      if (isScanning) {
        scanTimerRef.current = setTimeout(doScan, SCAN_INTERVAL_MS);
      }
      return;
    }
    if (!cameraRef.current) {
      setDebugInfo((prev) => ({ ...prev, error: "cameraRef is null" }));
      if (isScanning) {
        scanTimerRef.current = setTimeout(doScan, SCAN_INTERVAL_MS);
      }
      return;
    }
    isBusyRef.current = true;

    let captureMs = 0;
    let cropMs = 0;
    let classifyMs = 0;

    try {
      // Capture photo with 5s timeout to avoid infinite hang
      const captureStart = performance.now();
      const photo = await withTimeout(
        cameraRef.current.takePictureAsync({
          quality: 0.9,
          shutterSound: false,
          skipProcessing: true,
        }) as Promise<{ uri: string; width: number; height: number }>,
        5000
      );
      captureMs = performance.now() - captureStart;

      if (!photo || !photo.uri) {
        const errMsg = "takePictureAsync returned null/undefined";
        console.warn("[Scanner]", errMsg);
        setDebugInfo((prev) => ({ ...prev, error: errMsg, captureMs }));
        return;
      }

      const rawUri = photo.uri;
      const photoW = photo.width;
      const photoH = photo.height;

      // Crop to viewfinder square region using real image dimensions
      const currentSquareFrac = squareFracRef.current;
      const cropFraction =
        MIN_SQUARE_FRAC + currentSquareFrac * (MAX_SQUARE_FRAC - MIN_SQUARE_FRAC);

      let classifyUri = rawUri;
      let croppedUri: string | null = null;
      const cropStart = performance.now();
      try {
        const cropPx = Math.round(Math.min(photoW, photoH) * cropFraction);
        const offsetX = Math.round((photoW - cropPx) / 2);
        const offsetY = Math.round((photoH - cropPx) / 2);

        if (
          cropPx > 0 &&
          offsetX >= 0 &&
          offsetY >= 0 &&
          offsetX + cropPx <= photoW &&
          offsetY + cropPx <= photoH
        ) {
          const cropped = await manipulateAsync(
            rawUri,
            [
              {
                crop: {
                  originX: offsetX,
                  originY: offsetY,
                  width: cropPx,
                  height: cropPx,
                },
              },
              { resize: { width: 224 } },
            ],
            { format: SaveFormat.JPEG, compress: 0.85 }
          );
          classifyUri = cropped.uri;
          croppedUri = cropped.uri;
        }
      } catch (cropErr) {
        // Crop failed — classify full image (CoreML centerCrop will handle it)
        console.warn("[Scanner] crop failed:", cropErr);
      }
      cropMs = performance.now() - cropStart;

      const classifyStart = performance.now();
      const { matchSprite } = await import("@/modules/item-classifier");
      const result = await matchSprite(classifyUri);
      classifyMs = performance.now() - classifyStart;

      const rawOutput = result.results
        .map((p) => `${p.label}: ${(p.score * 100).toFixed(1)}%`)
        .join("\n");

      setDebugInfo({
        rawUri,
        croppedUri,
        captureMs,
        cropMs,
        classifyMs,
        rawOutput,
        error: null,
        photoWidth: photoW,
        photoHeight: photoH,
      });

      const filtered = result.results.filter(
        (p) => p.score >= MIN_CONFIDENCE
      );

      // Stabilization
      const history = labelHistoryRef.current;
      const currentLabels = new Set(filtered.map((p) => p.label));

      for (const [label, count] of history) {
        if (!currentLabels.has(label)) {
          if (count <= 1) history.delete(label);
          else history.set(label, count - 1);
        }
      }
      for (const pred of filtered) {
        history.set(pred.label, (history.get(pred.label) ?? 0) + 1);
      }

      const stablePredictions = filtered
        .filter((p) => (history.get(p.label) ?? 0) >= STABILITY_THRESHOLD)
        .slice(0, 16);

      const nextPredictions = stablePredictions.map((p) => ({
        label: p.label,
        confidence: p.score,
      }));
      setPredictions(nextPredictions);

      // Fire scan_identified only when the top stable label changes,
      // to avoid spamming events every scan cycle.
      const top = nextPredictions[0];
      if (top && top.label !== lastIdentifiedLabelRef.current) {
        lastIdentifiedLabelRef.current = top.label;
        capture("scan_identified", {
          source: "camera",
          top_label: top.label,
          top_confidence: Number(top.confidence.toFixed(3)),
          predictions_count: nextPredictions.length,
        });
      }
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : String(err);
      console.warn("[Scanner] scan failed:", errMsg);
      setDebugInfo((prev) => ({
        ...prev,
        captureMs,
        cropMs,
        classifyMs,
        error: errMsg,
      }));
    } finally {
      isBusyRef.current = false;
      // Always schedule next scan
      if (isScanning) {
        scanTimerRef.current = setTimeout(doScan, SCAN_INTERVAL_MS);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- uses refs intentionally
  }, [isScanning]);

  // Start/stop the scan loop
  useEffect(() => {
    console.log(`[Scanner] scan loop effect: isScanning=${isScanning} cameraReady=${cameraReady} hasPermission=${hasPermission}`);
    if (isScanning && cameraReady && hasPermission) {
      console.log("[Scanner] starting scan timer");
      scanTimerRef.current = setTimeout(doScan, 1500);
    }
    return () => {
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
    };
  }, [isScanning, cameraReady, hasPermission, doScan]);

  const handleCameraReady = useCallback(() => {
    console.log("[Scanner] onCameraReady fired");
    setCameraReady(true);
    setIsScanning(true);
  }, []);

  const handleGallery = useCallback(async () => {
    setIsActive(false);
    setIsScanning(false);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const { matchSprite } = await import("@/modules/item-classifier");
        const matchResult = await matchSprite(result.assets[0].uri);
        labelHistoryRef.current.clear();
        const galleryPredictions = matchResult.results.map((p) => ({
          label: p.label,
          confidence: p.score,
        }));
        setPredictions(galleryPredictions);
        const top = galleryPredictions[0];
        capture("gallery_scan_used", {
          predictions_count: galleryPredictions.length,
          top_label: top?.label ?? null,
          top_confidence: top ? Number(top.confidence.toFixed(3)) : null,
        });
        // Freeze: keep camera off, results visible
        setIsFrozen(true);
      } else {
        // User cancelled picker — resume scanning
        setIsActive(true);
        setIsScanning(true);
      }
    } catch {
      // On error, resume scanning
      setIsActive(true);
      setIsScanning(true);
    }
  }, []);

  const handleResume = useCallback(() => {
    setIsFrozen(false);
    setPredictions([]);
    labelHistoryRef.current.clear();
    setIsActive(true);
    setIsScanning(true);
  }, []);

  const handleGridScanner = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1.0,
    });

    if (!result.canceled && result.assets[0]) {
      router.push({
        pathname: "/grid-scanner",
        params: { imageUri: result.assets[0].uri },
      });
    }
  }, [router]);

  const handleClose = useCallback(() => {
    setIsActive(false);
    setIsScanning(false);
    if (router.canDismiss()) {
      router.dismiss();
    } else {
      router.back();
    }
  }, [router]);

  const handleItemPress = useCallback((displayName: string) => {
    const idx = predictions.findIndex((p) => p.label === displayName);
    const pred = idx >= 0 ? predictions[idx] : undefined;
    capture("scan_result_tapped", {
      label: displayName,
      position: idx,
      confidence: pred ? Number(pred.confidence.toFixed(3)) : null,
      source: isFrozen ? "gallery" : "camera",
    });
    router.push(`/items/${encodeURIComponent(displayName)}`);
  }, [router, predictions, isFrozen]);

  if (!hasPermission) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <View style={styles.topBarSpacer} />
          <Pressable onPress={handleClose} style={styles.topBarButton}>
            <X size={24} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.permissionContainer}>
          <Text className="text-white text-center text-lg font-semibold mb-2">
            Camera Access Required
          </Text>
          <Text className="text-white/60 text-center text-sm">
            Enable camera access in Settings to scan items in real-time.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      {/* Camera */}
      <View style={[styles.cameraArea, { height: cameraHeight }]}>
        {isActive && (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            autofocus={autofocusMode}
            onCameraReady={handleCameraReady}
          />
        )}

        {/* Tap anywhere on the camera to force a refocus. Sits below the
            top bar / stepper / resume overlay so their buttons still win. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleTapToFocus}
          accessibilityLabel="Tap to refocus camera"
        />

        <ScannerViewfinder squareSize={squareSize} />

        {/* Resume button when frozen after gallery pick */}
        {isFrozen && (
          <Pressable onPress={handleResume} style={styles.resumeOverlay}>
            <View style={styles.resumeButton}>
              <Play size={32} color="#fff" fill="#fff" />
            </View>
            <Text style={styles.resumeText}>Tap to resume scanning</Text>
          </Pressable>
        )}

        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <View style={styles.topBarLeft}>
            <Pressable onPress={handleGallery} style={styles.topBarButton}>
              <ImageIcon size={22} color="#fff" />
            </Pressable>
            <Pressable onPress={handleGridScanner} style={styles.topBarButton}>
              <Grid3X3 size={22} color="#fff" />
            </Pressable>
            {__DEV__ && (
              <Pressable
                onPress={() => setShowDebug((v) => !v)}
                style={[
                  styles.topBarButton,
                  showDebug && { backgroundColor: "rgba(34,197,94,0.6)" },
                ]}
              >
                <Bug size={20} color="#fff" />
              </Pressable>
            )}
          </View>
          <Pressable onPress={handleClose} style={styles.topBarButton}>
            <X size={24} color="#fff" />
          </Pressable>
        </View>

        {/* Debug overlay */}
        {showDebug && (
          <View style={[styles.debugOverlay, { top: insets.top + 56 }]}>
            <ScrollView style={styles.debugScroll}>
              <View style={styles.debugRow}>
                {debugInfo.rawUri && (
                  <View style={styles.debugThumb}>
                    <Image
                      source={{ uri: debugInfo.rawUri }}
                      style={styles.debugImage}
                      resizeMode="cover"
                    />
                    <Text style={styles.debugImageLabel}>
                      Raw {debugInfo.photoWidth}x{debugInfo.photoHeight}
                    </Text>
                  </View>
                )}
                {debugInfo.croppedUri && (
                  <View style={styles.debugThumb}>
                    <Image
                      source={{ uri: debugInfo.croppedUri }}
                      style={styles.debugImage}
                      resizeMode="cover"
                    />
                    <Text style={styles.debugImageLabel}>Cropped 224x224</Text>
                  </View>
                )}
              </View>
              <Text style={styles.debugText}>
                capture: {debugInfo.captureMs.toFixed(0)}ms | crop:{" "}
                {debugInfo.cropMs.toFixed(0)}ms | classify:{" "}
                {debugInfo.classifyMs.toFixed(0)}ms
              </Text>
              {debugInfo.rawOutput ? (
                <Text style={styles.debugText}>{debugInfo.rawOutput}</Text>
              ) : null}
              {debugInfo.error ? (
                <Text style={[styles.debugText, { color: "#ef4444" }]}>
                  Error: {debugInfo.error}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        )}

        {/* Frame size stepper — right side, vertically centered */}
        <View
          style={[
            styles.stepperContainer,
            {
              top: insets.top + (cameraHeight - insets.top - 120) / 2,
            },
          ]}
        >
          <Pressable onPress={handleZoomIn} style={styles.stepperButton}>
            <Plus size={18} color="#fff" />
          </Pressable>
          <View style={styles.stepperLabel}>
            <Scan size={12} color="rgba(255,255,255,0.6)" />
            <Text style={styles.stepperLabelText}>
              {Math.round(
                (MIN_SQUARE_FRAC + squareFrac * (MAX_SQUARE_FRAC - MIN_SQUARE_FRAC)) * 100
              )}%
            </Text>
          </View>
          <Pressable onPress={handleZoomOut} style={styles.stepperButton}>
            <Minus size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Results */}
      <View
        style={[
          styles.resultsArea,
          {
            backgroundColor: theme.background,
            paddingBottom: insets.bottom + 8,
            minHeight: resultsHeight,
          },
        ]}
      >
        <View style={styles.resultsHeader}>
          <Text className="text-xs font-medium tracking-widest uppercase text-muted-foreground px-4 pt-3 pb-2">
            Highest probability matches
          </Text>
          {isScanning && (
            <ActivityIndicator
              size="small"
              color={theme.mutedForeground}
              style={{ marginRight: 16 }}
            />
          )}
        </View>
        {isFocused && (
          <ScannerResultsGrid predictions={predictions} onItemPress={handleItemPress} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  cameraArea: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topBarLeft: {
    flexDirection: "row",
    gap: 10,
  },
  topBarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarSpacer: {
    width: 40,
  },
  debugOverlay: {
    position: "absolute",
    left: 8,
    right: 48,
    backgroundColor: "rgba(0,0,0,0.8)",
    borderRadius: 10,
    padding: 10,
    maxHeight: 220,
  },
  debugScroll: {
    maxHeight: 200,
  },
  debugRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  debugThumb: {
    alignItems: "center",
  },
  debugImage: {
    width: 64,
    height: 64,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  debugImageLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 9,
    marginTop: 2,
  },
  debugText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 10,
    fontFamily: "monospace" as const,
    marginBottom: 3,
  },
  stepperContainer: {
    position: "absolute",
    right: 12,
    width: 40,
    alignItems: "center",
    gap: 6,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperLabel: {
    alignItems: "center",
    gap: 2,
  },
  stepperLabelText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "600",
  },
  resultsArea: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -16,
  },
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  resumeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  resumeButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(34,197,94,0.8)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  resumeText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "500",
  },
});
