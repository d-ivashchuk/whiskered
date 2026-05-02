/**
 * Expo config plugin that copies TFLite models and data files into the Android
 * assets directory so they're bundled with the APK/AAB.
 */
const { withDangerousMod } = require("expo/config-plugins");
const path = require("path");
const fs = require("fs");

/** Copy a file if the source exists. */
function copyIfExists(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.warn(`[with-android-models] ${label} not found at ${src}, skipping`);
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[with-android-models] Copied ${label} to Android assets`);
  return true;
}

function withAndroidModels(config) {
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const assetsDir = path.resolve(
        projectRoot,
        "android/app/src/main/assets"
      );

      fs.mkdirSync(assetsDir, { recursive: true });

      // TFLite models
      copyIfExists(
        path.resolve(projectRoot, "ml/output/mewgenics_items_classifier.tflite"),
        path.join(assetsDir, "mewgenics_items_classifier.tflite"),
        "classifier TFLite model"
      );

      copyIfExists(
        path.resolve(projectRoot, "ml/output/mewgenics_items_embeddings.tflite"),
        path.join(assetsDir, "mewgenics_items_embeddings.tflite"),
        "embedding TFLite model"
      );

      // Binary data files
      copyIfExists(
        path.resolve(projectRoot, "data/sprite-fingerprints.bin"),
        path.join(assetsDir, "sprite-fingerprints.bin"),
        "sprite fingerprints"
      );

      copyIfExists(
        path.resolve(projectRoot, "data/sprite-embeddings.bin"),
        path.join(assetsDir, "sprite-embeddings.bin"),
        "sprite embeddings"
      );

      return cfg;
    },
  ]);

  return config;
}

module.exports = withAndroidModels;
