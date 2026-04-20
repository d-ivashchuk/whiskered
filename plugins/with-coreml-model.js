/**
 * Expo config plugin that bundles the compiled CoreML model into the Xcode project
 * and adds required Info.plist permissions for camera and photo library access.
 */
const {
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");
const path = require("path");
const fs = require("fs");

/** Copy a directory recursively. */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function withCoreMLModel(config) {
  // Add camera and photo library permissions
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.NSCameraUsageDescription =
      cfg.modResults.NSCameraUsageDescription ||
      "This app uses the camera to identify game items.";
    cfg.modResults.NSPhotoLibraryUsageDescription =
      cfg.modResults.NSPhotoLibraryUsageDescription ||
      "This app accesses your photo library to identify game items.";
    return cfg;
  });

  // Copy .mlmodelc into Xcode project directory
  config = withDangerousMod(config, [
    "ios",
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const projectName = cfg.modRequest.projectName;
      const modelSrc = path.resolve(
        projectRoot,
        "ml/output/mewgenics_items.mlmodelc"
      );

      if (!fs.existsSync(modelSrc)) {
        console.warn(
          `[with-coreml-model] Model not found at ${modelSrc}. Run "npm run compile-model" first.`
        );
        return cfg;
      }

      const iosDir = path.resolve(projectRoot, `ios/${projectName}`);
      const modelDest = path.join(iosDir, "mewgenics_items.mlmodelc");

      copyDirSync(modelSrc, modelDest);
      console.log("[with-coreml-model] Copied .mlmodelc to iOS project");

      return cfg;
    },
  ]);

  // Copy sprite-fingerprints.bin into Xcode project directory
  config = withDangerousMod(config, [
    "ios",
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const projectName = cfg.modRequest.projectName;
      const fingerprintsSrc = path.resolve(
        projectRoot,
        "data/sprite-fingerprints.bin"
      );

      if (!fs.existsSync(fingerprintsSrc)) {
        console.warn(
          `[with-coreml-model] Fingerprints not found at ${fingerprintsSrc}. Run "npm run build-fingerprints" first.`
        );
        return cfg;
      }

      const iosDir = path.resolve(projectRoot, `ios/${projectName}`);
      const fingerprintsDest = path.join(iosDir, "sprite-fingerprints.bin");

      fs.copyFileSync(fingerprintsSrc, fingerprintsDest);
      console.log("[with-coreml-model] Copied sprite-fingerprints.bin to iOS project");

      return cfg;
    },
  ]);

  // Copy sprite PNGs into SpriteAssets/ in Xcode project directory
  config = withDangerousMod(config, [
    "ios",
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const projectName = cfg.modRequest.projectName;
      const spritesSrc = path.resolve(projectRoot, "data/sprites/png");

      if (!fs.existsSync(spritesSrc)) {
        console.warn(
          `[with-coreml-model] Sprites not found at ${spritesSrc}. Run "npm run crawl" first.`
        );
        return cfg;
      }

      const iosDir = path.resolve(projectRoot, `ios/${projectName}`);
      const spritesDest = path.join(iosDir, "SpriteAssets");

      copyDirSync(spritesSrc, spritesDest);
      console.log("[with-coreml-model] Copied sprites to SpriteAssets/");

      return cfg;
    },
  ]);

  // Enable automatic code signing so device builds work after prebuild --clean
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const targetUuid = project.getFirstTarget().uuid;

    // Set automatic signing for both Debug and Release
    const buildConfigs = project.hash.project.objects.XCBuildConfiguration;
    for (const [key, val] of Object.entries(buildConfigs)) {
      if (
        typeof val === "object" &&
        val !== null &&
        val.buildSettings &&
        !key.endsWith("_comment")
      ) {
        // Only set on target-level configs (ones that have PRODUCT_NAME or INFOPLIST_FILE)
        if (
          val.buildSettings.PRODUCT_NAME ||
          val.buildSettings.INFOPLIST_FILE
        ) {
          val.buildSettings.CODE_SIGN_STYLE = "Automatic";
          val.buildSettings.DEVELOPMENT_TEAM = "CBM2584J3R";
        }
      }
    }

    // Also set on the target attributes
    const projectObj = project.hash.project.objects.PBXProject;
    for (const [key, val] of Object.entries(projectObj)) {
      if (
        typeof val === "object" &&
        val !== null &&
        val.attributes &&
        val.attributes.TargetAttributes
      ) {
        const targetAttrs = val.attributes.TargetAttributes;
        if (targetAttrs[targetUuid]) {
          targetAttrs[targetUuid].DevelopmentTeam = "CBM2584J3R";
          targetAttrs[targetUuid].ProvisioningStyle = "Automatic";
        }
      }
    }

    console.log("[with-coreml-model] Configured automatic code signing (Team CBM2584J3R)");
    return cfg;
  });

  // Add .mlmodelc to Xcode project build resources
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = cfg.modRequest.projectName;
    const modelFileName = "mewgenics_items.mlmodelc";

    // Check if already referenced in the project
    const fileRefs = project.hash.project.objects.PBXFileReference || {};
    for (const [key, val] of Object.entries(fileRefs)) {
      if (typeof val === "object" && val !== null && val.name === `"${modelFileName}"`) {
        console.log("[with-coreml-model] .mlmodelc already in Xcode project, skipping");
        return cfg;
      }
    }

    const fileRefUuid = project.generateUuid();
    const buildFileUuid = project.generateUuid();

    // Directly write PBXFileReference entry
    project.hash.project.objects.PBXFileReference[fileRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "folder",
      name: `"${modelFileName}"`,
      path: `"${projectName}/${modelFileName}"`,
      sourceTree: '"<group>"',
    };
    project.hash.project.objects.PBXFileReference[fileRefUuid + "_comment"] = modelFileName;

    // Directly write PBXBuildFile entry
    project.hash.project.objects.PBXBuildFile[buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUuid,
      fileRef_comment: modelFileName,
    };
    project.hash.project.objects.PBXBuildFile[buildFileUuid + "_comment"] = modelFileName + " in Resources";

    // Add to the app group's children
    const groups = project.hash.project.objects.PBXGroup;
    for (const [key, val] of Object.entries(groups)) {
      if (
        typeof val === "object" &&
        val !== null &&
        val.name === projectName &&
        !key.endsWith("_comment")
      ) {
        val.children.push({ value: fileRefUuid, comment: modelFileName });
        break;
      }
    }

    // Add to Resources build phase
    const target = project.getFirstTarget();
    const resourcesBuildPhase = project.pbxResourcesBuildPhaseObj(target.uuid);
    if (resourcesBuildPhase) {
      resourcesBuildPhase.files.push({
        value: buildFileUuid,
        comment: modelFileName + " in Resources",
      });
    }

    console.log("[with-coreml-model] Added .mlmodelc to Xcode project resources");
    return cfg;
  });

  // Add sprite-fingerprints.bin to Xcode project build resources
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = cfg.modRequest.projectName;
    const fileName = "sprite-fingerprints.bin";

    const fileRefs = project.hash.project.objects.PBXFileReference || {};
    for (const [key, val] of Object.entries(fileRefs)) {
      if (typeof val === "object" && val !== null && val.name === `"${fileName}"`) {
        console.log(`[with-coreml-model] ${fileName} already in Xcode project, skipping`);
        return cfg;
      }
    }

    const fileRefUuid = project.generateUuid();
    const buildFileUuid = project.generateUuid();

    project.hash.project.objects.PBXFileReference[fileRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "file",
      name: `"${fileName}"`,
      path: `"${projectName}/${fileName}"`,
      sourceTree: '"<group>"',
    };
    project.hash.project.objects.PBXFileReference[fileRefUuid + "_comment"] = fileName;

    project.hash.project.objects.PBXBuildFile[buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUuid,
      fileRef_comment: fileName,
    };
    project.hash.project.objects.PBXBuildFile[buildFileUuid + "_comment"] = fileName + " in Resources";

    const groups = project.hash.project.objects.PBXGroup;
    for (const [key, val] of Object.entries(groups)) {
      if (
        typeof val === "object" &&
        val !== null &&
        val.name === projectName &&
        !key.endsWith("_comment")
      ) {
        val.children.push({ value: fileRefUuid, comment: fileName });
        break;
      }
    }

    const target = project.getFirstTarget();
    const resourcesBuildPhase = project.pbxResourcesBuildPhaseObj(target.uuid);
    if (resourcesBuildPhase) {
      resourcesBuildPhase.files.push({
        value: buildFileUuid,
        comment: fileName + " in Resources",
      });
    }

    console.log(`[with-coreml-model] Added ${fileName} to Xcode project resources`);
    return cfg;
  });

  // Add SpriteAssets/ folder to Xcode project build resources
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectName = cfg.modRequest.projectName;
    const folderName = "SpriteAssets";

    const fileRefs = project.hash.project.objects.PBXFileReference || {};
    for (const [key, val] of Object.entries(fileRefs)) {
      if (typeof val === "object" && val !== null && val.name === `"${folderName}"`) {
        console.log(`[with-coreml-model] ${folderName} already in Xcode project, skipping`);
        return cfg;
      }
    }

    const fileRefUuid = project.generateUuid();
    const buildFileUuid = project.generateUuid();

    project.hash.project.objects.PBXFileReference[fileRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "folder",
      name: `"${folderName}"`,
      path: `"${projectName}/${folderName}"`,
      sourceTree: '"<group>"',
    };
    project.hash.project.objects.PBXFileReference[fileRefUuid + "_comment"] = folderName;

    project.hash.project.objects.PBXBuildFile[buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUuid,
      fileRef_comment: folderName,
    };
    project.hash.project.objects.PBXBuildFile[buildFileUuid + "_comment"] = folderName + " in Resources";

    const groups = project.hash.project.objects.PBXGroup;
    for (const [key, val] of Object.entries(groups)) {
      if (
        typeof val === "object" &&
        val !== null &&
        val.name === projectName &&
        !key.endsWith("_comment")
      ) {
        val.children.push({ value: fileRefUuid, comment: folderName });
        break;
      }
    }

    const target = project.getFirstTarget();
    const resourcesBuildPhase = project.pbxResourcesBuildPhaseObj(target.uuid);
    if (resourcesBuildPhase) {
      resourcesBuildPhase.files.push({
        value: buildFileUuid,
        comment: folderName + " in Resources",
      });
    }

    console.log(`[with-coreml-model] Added ${folderName} to Xcode project resources`);
    return cfg;
  });

  return config;
}

module.exports = withCoreMLModel;
