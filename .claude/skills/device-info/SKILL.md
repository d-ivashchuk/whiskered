---
name: device-info
description: Show available iOS/Android simulators, devices, OS versions, and run the app on a specific target.
---

Gather and display the development environment info for this Expo project. Run these commands and present the results clearly:

1. **Installed simulators & runtimes**:
   - Run `xcrun simctl list devices available` to list all iOS simulators grouped by OS version.
   - Highlight which simulators are currently **Booted**.

2. **Connected physical devices**:
   - Run `xcrun xctrace list devices 2>/dev/null | head -30` to detect any connected physical devices.

3. **Android emulators** (if applicable):
   - Run `emulator -list-avds 2>/dev/null` to list Android AVDs.

4. **Current Xcode & SDK versions**:
   - Run `xcodebuild -version` to show Xcode version.
   - Run `xcrun --sdk iphonesimulator --show-sdk-version` to show the iOS SDK version.

5. **Running app on a target**:
   - If the user asks to run on a specific device/simulator, use:
     - `npx expo run:ios --device "<device-name>"` for a specific simulator or physical device.
     - `npx expo run:android` for Android.
   - Note: Each device/simulator needs its own native build. A build for "iPhone 15 Pro" won't include native modules on "iPhone 17 Pro".

6. **Summary table**: Present a concise table of available targets:
   | Device | OS | Status | UUID |
   |--------|----|--------|------|
   | ... | ... | Booted/Shutdown | ... |

Focus on iOS simulators matching the project's deployment target. Skip tvOS, watchOS, and visionOS entries.
