const { withNativeWind } = require("nativewind/metro");
const { withStorybook } = require("@storybook/react-native/metro/withStorybook");
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

// Add .tflite and .bin to asset extensions so Metro bundles them
config.resolver.assetExts = [...(config.resolver.assetExts || []), "tflite", "bin"];

const nativeWindConfig = withNativeWind(config, { input: "./global.css" });

module.exports = withStorybook(nativeWindConfig, {
  enabled: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === "true",
  configPath: "./.rnstorybook",
});
